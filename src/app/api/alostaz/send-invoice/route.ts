import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  createInvoiceForOrder,
  isAlostazInvoiceOutcomeUnknown,
} from '@/lib/services/alostaz-service'
import { computePaymentBreakdown } from '@/lib/payment-breakdown'

/**
 * مسار خادمي لإرسال فاتورة طلب مسلّم إلى تطبيق الأستاذ للمحاسبة.
 * ─────────────────────────────────────────────────────────────
 * - التوكن السرّي (ALOSTAZ_API_TOKEN) يبقى هنا في الخادم ولا يصل للمتصفح.
 * - يتحقق أن المستخدم مدير (admin) قبل التنفيذ.
 * - يمنع الإرسال المكرر (idempotent) عبر عمود alostaz_invoice_id.
 * - يحدّث الطلب بمعرّف الفاتورة/العميل وحالة المزامنة.
 */

// عميل Admin (Service Role) لقراءة/تحديث الطلبات بتجاوز RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    // 1) التحقق من الجلسة والصلاحية (مدير فقط)
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

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مسموح - للمدير فقط' }, { status: 403 })
    }

    // 2) قراءة معرّف الطلب + وضع الإرسال
    //    auto=true → «مبلغ الشبكة فقط» (الإرسال التلقائي عند التسليم)
    //    auto=false → الزر اليدوي، ويحدّد mode ما يُرسَل:
    //       'both' (افتراضي) = كاش + شبكة | 'cash' = الكاش فقط | 'network' = الشبكة فقط
    const { orderId, auto, mode } = await request.json()
    if (!orderId) {
      return NextResponse.json({ error: 'orderId مطلوب' }, { status: 400 })
    }

    // 3) جلب الطلب (يشمل حقول فصل الدفع لحساب مبلغ الشبكة — migration 67)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(
        'id, order_number, client_name, client_phone, description, price, paid_amount, payment_method, pre_delivery_cash_amount, pre_delivery_network_amount, remaining_payment_method, remaining_cash_amount, remaining_network_amount, deposit_amount, due_date, status, alostaz_invoice_id, alostaz_invoice_code'
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    // 4) منع الإرسال المكرر
    if (order.alostaz_invoice_id) {
      return NextResponse.json({
        data: {
          alreadySent: true,
          invoice_id: order.alostaz_invoice_id,
          invoice_code: order.alostaz_invoice_code,
        },
        error: null,
      })
    }

    // 4.5) حساب قيمة الفاتورة والدفعات حسب الوضع.
    const breakdown = computePaymentBreakdown(order as any)
    const cash = breakdown.cashTotal
    const net = breakdown.networkTotal

    // الوضع التلقائي: مبلغ الشبكة فقط. إن كان صفراً (كل الدفعات كاش) لا فاتورة.
    if (auto && net <= 0) {
      return NextResponse.json({
        data: { skipped: true, reason: 'no-network' },
        error: null,
      })
    }

    // بناء قائمة الدفعات (كاش لخزنة النقد، شبكة لخزنة البنك) حسب الوضع/الاختيار.
    let invoicePayments: Array<{ amount: number; method: 'cash' | 'card' }>
    if (auto) {
      invoicePayments = [{ amount: net, method: 'card' }]
    } else if (mode === 'cash') {
      invoicePayments = [{ amount: cash, method: 'cash' }]
    } else if (mode === 'network') {
      invoicePayments = [{ amount: net, method: 'card' }]
    } else {
      // 'both' (افتراضي): كاش + شبكة
      invoicePayments = [
        { amount: cash, method: 'cash' },
        { amount: net, method: 'card' },
      ]
    }
    invoicePayments = invoicePayments.filter((p) => p.amount > 0)
    const invoiceAmount = invoicePayments.reduce((s, p) => s + p.amount, 0)

    if (invoiceAmount <= 0) {
      return NextResponse.json(
        { error: 'لا يوجد مبلغ مدفوع (كاش/شبكة) لإرساله لهذا الطلب' },
        { status: 400 }
      )
    }

    // 5) حجز الإرسال بشكل ذري قبل الاتصال بالأستاذ.
    // لا يكفي فحص alostaz_invoice_id أعلاه: قد يقرأ طلبان متزامنان القيمة NULL.
    // التحديث الشرطي أدناه يُقفل صف الطلب، ولذلك يفوز طلب واحد فقط بالحجز.
    const syncAttemptToken = randomUUID()
    const syncStartedAt = new Date().toISOString()
    const { data: claimedOrder, error: claimError } = await supabaseAdmin
      .from('orders')
      .update({
        alostaz_sync_status: 'sending',
        alostaz_sync_token: syncAttemptToken,
        alostaz_sync_error: null,
        alostaz_synced_at: syncStartedAt,
      })
      .eq('id', orderId)
      .is('alostaz_invoice_id', null)
      .or('alostaz_sync_status.is.null,alostaz_sync_status.eq.failed')
      .select('id')
      .maybeSingle()

    if (claimError) {
      return NextResponse.json(
        { error: 'تعذّر حجز إرسال الفاتورة بأمان: ' + claimError.message },
        { status: 500 }
      )
    }

    if (!claimedOrder) {
      const { data: latestOrder, error: latestError } = await supabaseAdmin
        .from('orders')
        .select('alostaz_invoice_id, alostaz_invoice_code, alostaz_sync_status')
        .eq('id', orderId)
        .single()

      if (latestError || !latestOrder) {
        return NextResponse.json(
          { error: 'تعذّر التحقق من حالة إرسال الفاتورة' },
          { status: 500 }
        )
      }

      if (latestOrder.alostaz_invoice_id) {
        return NextResponse.json({
          data: {
            alreadySent: true,
            invoice_id: latestOrder.alostaz_invoice_id,
            invoice_code: latestOrder.alostaz_invoice_code,
          },
          error: null,
        })
      }

      if (latestOrder.alostaz_sync_status === 'review_required') {
        return NextResponse.json(
          {
            error:
              'توقّفت إعادة الإرسال لحماية الطلب من فاتورة مكررة. يجب مراجعة تطبيق الأستاذ أولاً.',
          },
          { status: 409 }
        )
      }

      return NextResponse.json({
        data: { inProgress: true },
        error: null,
      })
    }

    // 6) إنشاء الفاتورة في الأستاذ
    //    ⚠️ مؤقت (وضع تجريب): كل الإرسال — اليدوي والتلقائي — يُنشئ «مسودة» فقط.
    //    المسودات قابلة للحذف، لا تستهلك رقم الفوترة. للانتقال إلى الفواتير الحقيقية:
    //    احذف forceStatus كي تتبع ALOSTAZ_INVOICE_STATUS (وحينها تُسجَّل الدفعات المقسّمة).
    let result
    try {
      result = await createInvoiceForOrder(
        {
          order_number: order.order_number,
          client_name: order.client_name,
          client_phone: order.client_phone,
          description: order.description,
          price: invoiceAmount,
          paid_amount: invoiceAmount,
          payment_method: 'card',
          due_date: order.due_date,
        },
        { forceStatus: 'draft', payments: invoicePayments }
      )
    } catch (err: any) {
      const outcomeUnknown = isAlostazInvoiceOutcomeUnknown(err)
      const errorMessage = err?.message || 'فشل إرسال الفاتورة للأستاذ'
      const { error: failureUpdateError } = await supabaseAdmin
        .from('orders')
        .update({
          // عند غموض نتيجة POST نمنع إعادة المحاولة؛ فقد تكون الفاتورة أُنشئت
          // في الأستاذ رغم انقطاع الرد. أخطاء الرفض المؤكدة فقط قابلة للمحاولة.
          alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
          alostaz_sync_error: errorMessage,
          alostaz_synced_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('alostaz_sync_token', syncAttemptToken)
        .eq('alostaz_sync_status', 'sending')

      if (failureUpdateError) {
        console.error('Failed to persist Alostaz failure state:', failureUpdateError)
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

    // 7) حفظ النتيجة محلياً. إعادة هذا التحديث آمنة لأنها تستخدم رمز الحجز
    // نفسه، ولذلك نحاول حتى 3 مرات لتقليل احتمال بقاء فاتورة ناجحة بلا مرجع.
    let updateError: { message: string } | null = null
    let finalized = false
    for (let attempt = 0; attempt < 3 && !finalized; attempt++) {
      const { data: finalizedOrder, error } = await supabaseAdmin
        .from('orders')
        .update({
          alostaz_customer_id: result.customer_id,
          alostaz_invoice_id: result.invoice_id,
          alostaz_invoice_code: result.invoice_code,
          alostaz_sync_status: 'sent',
          alostaz_sync_error: null,
          alostaz_synced_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('alostaz_sync_token', syncAttemptToken)
        .select('id')
        .maybeSingle()

      updateError = error
      finalized = !!finalizedOrder
    }

    if (updateError || !finalized) {
      // الفاتورة أُنشئت في الأستاذ لكن فشل حفظ المرجع محلياً — نُبلّغ بذلك
      return NextResponse.json(
        {
          data: { invoice_id: result.invoice_id, invoice_code: result.invoice_code, draft: result.is_draft },
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
  } catch (error: any) {
    console.error('❌ send-invoice error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
