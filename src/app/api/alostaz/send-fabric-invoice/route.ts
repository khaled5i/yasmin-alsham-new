import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  createInvoiceForFabricSale,
  createProduct,
  getFabricsBranchContext,
  isAlostazInvoiceOutcomeUnknown,
} from '@/lib/services/alostaz-service'

/**
 * مسار خادمي لإرسال فاتورة مبيعة قماش إلى تطبيق الأستاذ للمحاسبة.
 * ─────────────────────────────────────────────────────────────
 * - التوكن السرّي (ALOSTAZ_API_TOKEN) يبقى هنا في الخادم ولا يصل للمتصفح.
 * - يتحقق أن المستخدم مدير نظام أو عامل مخوّل بالوصول المحاسبي قبل التنفيذ.
 * - يجهّز منتج القماش في الأستاذ (يُنشأ مرة واحدة ويُخزَّن alostaz_product_id
 *   على صنف المخزون المطابق بالاسم) ثم يُعيد استخدامه لاحقاً.
 * - يمنع الإرسال المكرر (idempotent) عبر عمود income.alostaz_invoice_id.
 * - يحدّث سجل المبيعة بمعرّف الفاتورة/العميل وحالة المزامنة.
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

/**
 * إيجاد/إنشاء منتج القماش في الأستاذ:
 *  - نطابق صنف المخزون بالاسم (income.customer_name يخزّن اسم القماش).
 *  - نستخدم alostaz_product_id فقط إن كان تابعاً لفرع ياسمين الشام الرئيسي.
 *  - الربط القديم بفرع الأقمشة السابق يُستبدل تلقائياً عند أول إرسال.
 *  - إن لم يوجد صنف مطابق (اسم غير مسجّل) ننشئ منتجاً بالاسم دون حفظ.
 */
async function resolveFabricProductId(fabricName: string): Promise<number> {
  const name = String(fabricName || '').trim()
  const admin = getSupabaseAdmin()
  const ctx = await getFabricsBranchContext()

  // صنف المخزون المطابق بالاسم (إن وُجد)
  const { data: invItem } = await admin
    .from('fabric_inventory')
    .select('*')
    .eq('name', name)
    .maybeSingle()

  if (
    invItem?.alostaz_product_id &&
    Number(invItem.alostaz_product_branch_id) === ctx.branchId
  ) {
    return Number(invItem.alostaz_product_id)
  }

  // إنشاء المنتج في الأستاذ ضمن فرع ياسمين الشام مع تتبّع المخزون
  const productId = await createProduct(invItem?.name || name || 'قماش', {
    branchId: ctx.branchId,
    supportsInventory: true,
    purchasePrice: invItem?.cost_per_unit,
    salePrice: invItem?.sale_price_per_unit,
  })

  // حفظ المعرّف على صنف المخزون لإعادة استخدامه (إن وُجد الصنف)
  if (invItem?.id) {
    const { error: updateError } = await admin
      .from('fabric_inventory')
      .update({
        alostaz_product_id: productId,
        alostaz_product_branch_id: ctx.branchId,
      })
      .eq('id', invItem.id)

    if (updateError) {
      throw new Error(
        `أُنشئ منتج القماش في الأستاذ، لكن تعذّر حفظ ربطه بالفرع الرئيسي: ${updateError.message}`
      )
    }
  }

  return productId
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

    // 3) جلب سجل المبيعة (نستخدم * ليشمل fabric_items بأمان حتى قبل تطبيق الهجرة 69)
    const { data: income, error: incomeError } = await admin
      .from('income')
      .select('*')
      .eq('id', incomeId)
      .single()

    if (incomeError || !income) {
      return NextResponse.json({ error: 'المبيعة غير موجودة' }, { status: 404 })
    }

    if (income.branch !== 'fabrics') {
      return NextResponse.json({ error: 'هذا المسار خاص بمبيعات الأقمشة فقط' }, { status: 400 })
    }

    // 4) منع الإرسال المكرر
    if (income.alostaz_invoice_id) {
      return NextResponse.json({
        data: {
          alreadySent: true,
          invoice_id: income.alostaz_invoice_id,
          invoice_code: income.alostaz_invoice_code,
        },
        error: null,
      })
    }

    // 5) حجز الإرسال ذرياً قبل أي اتصال ينشئ الفاتورة في الأستاذ.
    // يفوز استدعاء واحد فقط حتى لو ضغط جهازان في اللحظة نفسها.
    // Keep this as a count-only PATCH. PostgREST v14 miscompiles this OR filter
    // when UPDATE is chained with select()/return=representation.
    const syncAttemptToken = randomUUID()
    const { count: claimedIncomeCount, error: claimError } = await admin
      .from('income')
      .update({
        alostaz_sync_status: 'sending',
        alostaz_sync_token: syncAttemptToken,
        alostaz_sync_error: null,
        alostaz_synced_at: new Date().toISOString(),
      }, { count: 'exact' })
      .eq('id', incomeId)
      .eq('branch', 'fabrics')
      .is('alostaz_invoice_id', null)
      .or('alostaz_sync_status.is.null,alostaz_sync_status.eq.failed')

    if (claimError) {
      return NextResponse.json(
        { error: 'تعذّر حجز إرسال فاتورة القماش بأمان: ' + claimError.message },
        { status: 500 }
      )
    }

    if (claimedIncomeCount !== 1) {
      const { data: latestIncome, error: latestError } = await admin
        .from('income')
        .select('alostaz_invoice_id, alostaz_invoice_code, alostaz_sync_status')
        .eq('id', incomeId)
        .single()

      if (latestError || !latestIncome) {
        return NextResponse.json(
          { error: 'تعذّر التحقق من حالة إرسال فاتورة القماش' },
          { status: 500 }
        )
      }

      if (latestIncome.alostaz_invoice_id) {
        return NextResponse.json({
          data: {
            alreadySent: true,
            invoice_id: latestIncome.alostaz_invoice_id,
            invoice_code: latestIncome.alostaz_invoice_code,
          },
          error: null,
        })
      }

      if (latestIncome.alostaz_sync_status === 'review_required') {
        return NextResponse.json(
          {
            error:
              'توقّفت إعادة الإرسال لحماية فاتورة القماش من التكرار. يجب مراجعة تطبيق الأستاذ أولاً.',
          },
          { status: 409 }
        )
      }

      return NextResponse.json({
        data: { inProgress: true },
        error: null,
      })
    }

    // 6) تجهيز بنود القماش (قماش واحد أو أكثر) + إنشاء الفاتورة في الأستاذ
    let result
    try {
      // بنود القماش: من fabric_items إن وُجدت، وإلا بند واحد من القماش القديم
      type SaleItem = { name: string; quantity_meters: number | null }
      type StoredFabricItem = { name?: unknown; quantity_meters?: unknown }
      const rawItems: SaleItem[] =
        Array.isArray(income.fabric_items) && income.fabric_items.length > 0
          ? income.fabric_items.map((f: StoredFabricItem) => ({
              name: String(f?.name || income.customer_name || 'قماش'),
              quantity_meters: f?.quantity_meters != null ? Number(f.quantity_meters) : null,
            }))
          : [
              {
                name: income.customer_name || income.description || 'قماش',
                quantity_meters: income.quantity_meters != null ? Number(income.quantity_meters) : null,
              },
            ]

      // توزيع الإجمالي الكلّي (المبلغ الواحد) على البنود بنسبة الأمتار،
      // مع إعطاء الباقي للبند الأخير لضمان تطابق المجموع تماماً مع الإجمالي.
      const total = Number(income.amount) || 0
      const n = rawItems.length
      const meters = rawItems.map((it) => (Number(it.quantity_meters) > 0 ? Number(it.quantity_meters) : 0))
      const totalMeters = meters.reduce((s, m) => s + m, 0)
      const round2 = (v: number) => Math.round(v * 100) / 100

      const allocated: number[] = new Array(n).fill(0)
      if (n === 1) {
        allocated[0] = total
      } else if (totalMeters > 0) {
        let acc = 0
        for (let i = 0; i < n - 1; i++) {
          allocated[i] = round2((total * meters[i]) / totalMeters)
          acc += allocated[i]
        }
        allocated[n - 1] = round2(total - acc)
      } else {
        // لا كميات مُدخلة: توزيع بالتساوي
        const each = round2(total / n)
        let acc = 0
        for (let i = 0; i < n - 1; i++) {
          allocated[i] = each
          acc += each
        }
        allocated[n - 1] = round2(total - acc)
      }

      // تجهيز منتج الأستاذ لكل قماش + بناء بند بكميته الفعلية بالمتر
      const lines = []
      for (let i = 0; i < n; i++) {
        const productId = await resolveFabricProductId(rawItems[i].name)
        lines.push({
          product_id: productId,
          quantity_meters: rawItems[i].quantity_meters,
          amount: allocated[i],
          description: rawItems[i].name,
        })
      }

      result = await createInvoiceForFabricSale({
        invoice_number: income.invoice_number,
        customer_name: income.buyer_name,
        customer_phone: income.buyer_phone,
        payment_method: income.payment_method,
        date: income.date,
        lines,
      })
    } catch (err: unknown) {
      const outcomeUnknown = isAlostazInvoiceOutcomeUnknown(err)
      const errorMessage =
        err instanceof Error ? err.message : 'فشل إرسال الفاتورة للأستاذ'
      const { error: failureUpdateError } = await admin
        .from('income')
        .update({
          alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
          alostaz_sync_error: errorMessage,
          alostaz_synced_at: new Date().toISOString(),
        })
        .eq('id', incomeId)
        .eq('alostaz_sync_token', syncAttemptToken)
        .eq('alostaz_sync_status', 'sending')

      if (failureUpdateError) {
        console.error('Failed to persist fabric invoice failure state:', failureUpdateError)
      }

      return NextResponse.json(
        {
          error: outcomeUnknown
            ? `${errorMessage} — أوقفت إعادة المحاولة تلقائياً لمنع تكرار الفاتورة، ويلزم التحقق من الأستاذ.`
            : errorMessage,
        },
        { status: 502 }
      )
    }

    // 7) حفظ النتيجة حتى للمسودة؛ وجود المعرّف هو مصدر الحقيقة المشترك
    // بين جميع الأجهزة ويمنع ظهور زر إرسال جديد على هاتف آخر.
    let updateError: { message: string } | null = null
    let finalized = false
    for (let attempt = 0; attempt < 3 && !finalized; attempt++) {
      const { data: finalizedIncome, error } = await admin
        .from('income')
        .update({
          alostaz_customer_id: result.customer_id,
          alostaz_invoice_id: result.invoice_id,
          alostaz_invoice_code: result.invoice_code,
          alostaz_sync_status: 'sent',
          alostaz_sync_error: null,
          alostaz_synced_at: new Date().toISOString(),
        })
        .eq('id', incomeId)
        .eq('alostaz_sync_token', syncAttemptToken)
        .select('id')
        .maybeSingle()

      updateError = error
      finalized = !!finalizedIncome
    }

    if (updateError || !finalized) {
      // الفاتورة أُنشئت في الأستاذ لكن فشل حفظ المرجع محلياً — نُبلّغ بذلك
      return NextResponse.json(
        {
          data: { invoice_id: result.invoice_id, invoice_code: result.invoice_code },
          warning:
            'أُنشئت الفاتورة في الأستاذ لكن تعذّر حفظ المرجع محلياً. أُبقي حجز الحماية فعالاً لمنع إعادة إرسالها.' +
            (updateError?.message ? ' ' + updateError.message : ''),
          error: null,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      data: {
        invoice_id: result.invoice_id,
        invoice_code: result.invoice_code,
        customer_id: result.customer_id,
        draft: result.is_draft,
      },
      error: null,
    })
  } catch (error: unknown) {
    console.error('❌ send-fabric-invoice error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
