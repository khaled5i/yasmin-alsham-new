import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendFabricIncomeToAlostaz } from '@/lib/server/alostaz-fabric-invoice'

/**
 * مسار خادمي لإرسال فاتورة مبيعة قماش إلى تطبيق الأستاذ للمحاسبة.
 * ─────────────────────────────────────────────────────────────
 * - التوكن السرّي (ALOSTAZ_API_TOKEN) يبقى هنا في الخادم ولا يصل للمتصفح.
 * - يتحقق أن المستخدم مدير نظام أو عامل مخوّل بالوصول المحاسبي قبل التنفيذ.
 * - الإرسال نفسه (حجز ذري، منتجات الأستاذ، البنود، الحفظ) في
 *   `src/lib/server/alostaz-fabric-invoice.ts`، وتستعمله مهمة المتجر الإلكتروني أيضاً،
 *   فيبقى منع التكرار واحداً بين الزر والمهمة.
 */

// عميل Admin (Service Role) لقراءة/تحديث السجلات بتجاوز RLS — يُنشأ عند الطلب فقط.
let supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return supabaseAdmin
}

export async function POST(request: NextRequest) {
  try {
    // 1) التحقق من الجلسة والصلاحية
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'غير مصرّح - لا يوجد ترويسة مصادقة' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'غير مصرّح - توكن غير صالح' }, { status: 401 })
    }

    // نستخدم عميل الخادم بعد التحقق من التوكن حتى لا يعتمد قرار الصلاحية على
    // سياسات القراءة العامة في users/workers. المفتاح السري لا يغادر الخادم.
    const admin = getSupabaseAdmin()
    const { data: userData, error: userError } = await admin
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.is_active) {
      return NextResponse.json({ error: 'غير مسموح - الحساب غير نشط أو غير موجود' }, { status: 403 })
    }

    let canSendFabricInvoice = userData.role === 'admin'
    if (userData.role === 'worker') {
      const { data: workerData, error: workerError } = await admin
        .from('workers')
        .select('worker_type')
        .eq('user_id', user.id)
        .single()

      if (!workerError) {
        canSendFabricInvoice = [
          'fabric_store_manager',
          'accountant',
          'general_manager',
        ].includes(workerData?.worker_type)
      }
    }

    if (!canSendFabricInvoice) {
      return NextResponse.json(
        { error: 'غير مسموح - لا تملك صلاحية إرسال فواتير الأقمشة للمحاسبة' },
        { status: 403 }
      )
    }

    // 2) قراءة معرّف المبيعة
    const { incomeId } = await request.json()
    if (!incomeId) {
      return NextResponse.json({ error: 'incomeId مطلوب' }, { status: 400 })
    }

    // 3) الإرسال (مرة واحدة فقط) — الردود كما كانت قبل نقل المنطق إلى المكتبة
    const result = await sendFabricIncomeToAlostaz(admin, incomeId)
    switch (result.kind) {
      case 'disabled':
        return NextResponse.json({ error: 'إرسال فواتير المتجر الإلكتروني غير مفعّل حالياً' }, { status: 409 })
      case 'refunded':
        return NextResponse.json({ error: 'استُرد مبلغ هذا الطلب الإلكتروني كاملاً قبل إرسال فاتورته — لا فاتورة له' }, { status: 409 })
      case 'not_found':
        return NextResponse.json({ error: 'المبيعة غير موجودة' }, { status: 404 })
      case 'not_fabric':
        return NextResponse.json({ error: 'هذا المسار خاص بمبيعات الأقمشة فقط' }, { status: 400 })
      case 'already_sent':
        return NextResponse.json({
          data: {
            alreadySent: true,
            invoice_id: result.invoice_id,
            invoice_code: result.invoice_code,
          },
          error: null,
        })
      case 'claim_error':
        return NextResponse.json(
          { error: 'تعذّر حجز إرسال فاتورة القماش بأمان: ' + result.error },
          { status: 500 }
        )
      case 'status_unknown':
        return NextResponse.json(
          { error: 'تعذّر التحقق من حالة إرسال فاتورة القماش' },
          { status: 500 }
        )
      case 'review_required':
        return NextResponse.json(
          {
            error:
              'توقّفت إعادة الإرسال لحماية فاتورة القماش من التكرار. يجب مراجعة تطبيق الأستاذ أولاً.',
          },
          { status: 409 }
        )
      case 'in_progress':
        return NextResponse.json({
          data: { inProgress: true },
          error: null,
        })
      case 'failed':
        return NextResponse.json(
          {
            error: result.outcomeUnknown
              ? `${result.error} — أوقفت إعادة المحاولة تلقائياً لمنع تكرار الفاتورة، ويلزم التحقق من الأستاذ.`
              : result.error,
          },
          { status: 502 }
        )
      case 'sent_unsaved':
        // الفاتورة أُنشئت في الأستاذ لكن فشل حفظ المرجع محلياً — نُبلّغ بذلك
        return NextResponse.json(
          {
            data: { invoice_id: result.invoice_id, invoice_code: result.invoice_code },
            warning: result.warning,
            error: null,
          },
          { status: 200 }
        )
      case 'sent':
        return NextResponse.json({
          data: {
            invoice_id: result.invoice_id,
            invoice_code: result.invoice_code,
            customer_id: result.customer_id,
            draft: result.is_draft,
          },
          error: null,
        })
    }
  } catch (error: unknown) {
    console.error('❌ send-fabric-invoice error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
