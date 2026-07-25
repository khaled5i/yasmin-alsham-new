import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createInvoiceForOrder } from '@/lib/services/alostaz-service'
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

    // 5) إنشاء الفاتورة في الأستاذ
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
      // تسجيل حالة الفشل على الطلب (بدون معرّف فاتورة → يمكن إعادة المحاولة)
      await supabaseAdmin
        .from('orders')
        .update({ alostaz_sync_status: 'failed', alostaz_synced_at: new Date().toISOString() })
        .eq('id', orderId)
      return NextResponse.json({ error: err?.message || 'فشل إرسال الفاتورة للأستاذ' }, { status: 502 })
    }

    // 6) حفظ النتيجة على الطلب وتعليمه كـ«مُرسَل» — حتى للمسودات (بطلب المالك: منع إعادة الإرسال)
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        alostaz_customer_id: result.customer_id,
        alostaz_invoice_id: result.invoice_id,
        alostaz_invoice_code: result.invoice_code,
        alostaz_sync_status: 'sent',
        alostaz_synced_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      // الفاتورة أُنشئت في الأستاذ لكن فشل حفظ المرجع محلياً — نُبلّغ بذلك
      return NextResponse.json(
        {
          data: { invoice_id: result.invoice_id, invoice_code: result.invoice_code, draft: result.is_draft },
          warning: 'أُنشئت الفاتورة في الأستاذ لكن تعذّر حفظ المرجع محلياً: ' + updateError.message,
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
