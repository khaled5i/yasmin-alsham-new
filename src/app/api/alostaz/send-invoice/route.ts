import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  createInvoiceForOrder,
  isAlostazInvoiceOutcomeUnknown,
} from '@/lib/services/alostaz-service'
import { computePaymentBreakdown } from '@/lib/payment-breakdown'

/**
 * مسار خادمي لفواتير التفصيل المرحلية في تطبيق الأستاذ.
 * - deposit: عربون الشبكة عند إنشاء طلب جديد من الإصدار المحاسبي 2.
 * - delivery: شبكة الدفعة المتبقية فقط عند التسليم.
 * - manual: المسار اليدوي المحفوظ للطلبات القديمة (الإصدار 1).
 */

// عميل Admin (Service Role) لقراءة/تحديث الطلبات بتجاوز RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type InvoicePhase = 'deposit' | 'delivery' | 'manual'

const PHASES = new Set<InvoicePhase>(['deposit', 'delivery', 'manual'])

const PHASE_FIELDS = {
  deposit: {
    invoiceId: 'alostaz_deposit_invoice_id',
    invoiceCode: 'alostaz_deposit_invoice_code',
    syncStatus: 'alostaz_deposit_sync_status',
    syncToken: 'alostaz_deposit_sync_token',
    syncError: 'alostaz_deposit_sync_error',
    syncedAt: 'alostaz_deposit_synced_at',
  },
  delivery: {
    invoiceId: 'alostaz_invoice_id',
    invoiceCode: 'alostaz_invoice_code',
    syncStatus: 'alostaz_sync_status',
    syncToken: 'alostaz_sync_token',
    syncError: 'alostaz_sync_error',
    syncedAt: 'alostaz_synced_at',
  },
} as const

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرّح - لا يوجد توكن صالح' }, { status: 401 })
    }

    const token = authHeader.slice('Bearer '.length)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'غير مصرّح - توكن غير صالح' }, { status: 401 })
    }

    const { data: userData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (roleError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مسموح - للمدير فقط' }, { status: 403 })
    }

    const payload = await request.json()
    const orderId = typeof payload?.orderId === 'string' ? payload.orderId.trim() : ''
    // توافق آمن مع واجهة قديمة قد تبقى مفتوحة أثناء النشر: auto=true يُعامل
    // كتسليم، وبذلك تُستبعد الطلبات القديمة بدلاً من إرسالها كفاتورة يدوية كاملة.
    const requestedPhase = String(
      payload?.phase || (payload?.auto === true ? 'delivery' : 'manual')
    ) as InvoicePhase
    const mode = payload?.mode as 'both' | 'cash' | 'network' | undefined

    if (!orderId) {
      return NextResponse.json({ error: 'orderId مطلوب' }, { status: 400 })
    }
    if (!PHASES.has(requestedPhase)) {
      return NextResponse.json({ error: 'مرحلة الفاتورة غير صالحة' }, { status: 400 })
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(
        'id, order_number, client_name, client_phone, description, price, paid_amount, payment_method, pre_delivery_cash_amount, pre_delivery_network_amount, remaining_payment_method, remaining_cash_amount, remaining_network_amount, deposit_amount, due_date, status, alostaz_billing_version, alostaz_deposit_invoice_id, alostaz_deposit_invoice_code, alostaz_deposit_sync_status, alostaz_invoice_id, alostaz_invoice_code, alostaz_sync_status'
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    const stagedBilling = Number(order.alostaz_billing_version) >= 2
    if (requestedPhase !== 'manual' && !stagedBilling) {
      return NextResponse.json({
        data: { skipped: true, reason: 'legacy-order' },
        error: null,
      })
    }
    if (requestedPhase === 'manual' && stagedBilling) {
      return NextResponse.json(
        { error: 'الطلبات الجديدة تُرسل بمرحلة العربون أو مرحلة التسليم فقط' },
        { status: 400 }
      )
    }
    if (requestedPhase === 'delivery' && order.status !== 'delivered') {
      return NextResponse.json({ error: 'لا يمكن إرسال دفعة التسليم قبل تسليم الطلب' }, { status: 409 })
    }

    const effectivePhase = requestedPhase === 'deposit' ? 'deposit' : 'delivery'
    const fields = PHASE_FIELDS[effectivePhase]
    const existingInvoiceId = order[fields.invoiceId]
    const existingInvoiceCode = order[fields.invoiceCode]

    if (existingInvoiceId) {
      return NextResponse.json({
        data: {
          alreadySent: true,
          phase: requestedPhase,
          invoice_id: existingInvoiceId,
          invoice_code: existingInvoiceCode,
        },
        error: null,
      })
    }

    const breakdown = computePaymentBreakdown(order)
    const cash = breakdown.cashTotal
    const net = breakdown.networkTotal
    let invoicePayments: Array<{ amount: number; method: 'cash' | 'card' }>

    if (requestedPhase === 'deposit') {
      invoicePayments = [{ amount: breakdown.preDeliveryNetwork, method: 'card' }]
    } else if (requestedPhase === 'delivery') {
      invoicePayments = [{ amount: breakdown.remainingNetwork, method: 'card' }]
    } else if (mode === 'cash') {
      invoicePayments = [{ amount: cash, method: 'cash' }]
    } else if (mode === 'network') {
      invoicePayments = [{ amount: net, method: 'card' }]
    } else {
      invoicePayments = [
        { amount: cash, method: 'cash' },
        { amount: net, method: 'card' },
      ]
    }

    invoicePayments = invoicePayments.filter((payment) => payment.amount >= 0.005)
    const invoiceAmount = invoicePayments.reduce((sum, payment) => sum + payment.amount, 0)

    if (invoiceAmount < 0.005 && requestedPhase !== 'manual') {
      return NextResponse.json({
        data: { skipped: true, reason: 'no-network', phase: requestedPhase },
        error: null,
      })
    }
    if (invoiceAmount < 0.005) {
      return NextResponse.json(
        { error: 'لا يوجد مبلغ مدفوع (كاش/شبكة) لإرساله لهذا الطلب' },
        { status: 400 }
      )
    }

    // Count-only conditional PATCH: only one concurrent request can claim this phase.
    const syncAttemptToken = randomUUID()
    const syncStartedAt = new Date().toISOString()
    const { count: claimedOrderCount, error: claimError } = await supabaseAdmin
      .from('orders')
      .update({
        [fields.syncStatus]: 'sending',
        [fields.syncToken]: syncAttemptToken,
        [fields.syncError]: null,
        [fields.syncedAt]: syncStartedAt,
      }, { count: 'exact' })
      .eq('id', orderId)
      .is(fields.invoiceId, null)
      .or(`${fields.syncStatus}.is.null,${fields.syncStatus}.eq.failed`)

    if (claimError) {
      return NextResponse.json(
        { error: 'تعذّر حجز إرسال الفاتورة بأمان: ' + claimError.message },
        { status: 500 }
      )
    }

    if (claimedOrderCount !== 1) {
      const { data: latestOrder, error: latestError } = await supabaseAdmin
        .from('orders')
        .select(`${fields.invoiceId}, ${fields.invoiceCode}, ${fields.syncStatus}`)
        .eq('id', orderId)
        .single()

      if (latestError || !latestOrder) {
        return NextResponse.json({ error: 'تعذّر التحقق من حالة إرسال الفاتورة' }, { status: 500 })
      }
      const latest = latestOrder as Record<string, unknown>
      if (latest[fields.invoiceId]) {
        return NextResponse.json({
          data: {
            alreadySent: true,
            phase: requestedPhase,
            invoice_id: latest[fields.invoiceId],
            invoice_code: latest[fields.invoiceCode],
          },
          error: null,
        })
      }
      if (latest[fields.syncStatus] === 'review_required') {
        return NextResponse.json(
          { error: 'توقّفت إعادة الإرسال لحماية الطلب من فاتورة مكررة. يجب مراجعة تطبيق الأستاذ أولاً.' },
          { status: 409 }
        )
      }

      return NextResponse.json({ data: { inProgress: true, phase: requestedPhase }, error: null })
    }

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
        { payments: invoicePayments }
      )
    } catch (error: unknown) {
      const outcomeUnknown = isAlostazInvoiceOutcomeUnknown(error)
      const errorMessage = error instanceof Error ? error.message : 'فشل إرسال الفاتورة للأستاذ'
      const { error: failureUpdateError } = await supabaseAdmin
        .from('orders')
        .update({
          [fields.syncStatus]: outcomeUnknown ? 'review_required' : 'failed',
          [fields.syncError]: errorMessage,
          [fields.syncedAt]: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq(fields.syncToken, syncAttemptToken)
        .eq(fields.syncStatus, 'sending')

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

    let updateError: { message: string } | null = null
    let finalized = false
    for (let attempt = 0; attempt < 3 && !finalized; attempt++) {
      const finalUpdates: Record<string, unknown> = {
        alostaz_customer_id: result.customer_id,
        [fields.invoiceId]: result.invoice_id,
        [fields.invoiceCode]: result.invoice_code,
        [fields.syncStatus]: 'sent',
        [fields.syncError]: null,
        [fields.syncedAt]: new Date().toISOString(),
      }
      if (requestedPhase === 'deposit') {
        finalUpdates.alostaz_deposit_invoice_amount = invoiceAmount
      }

      const { data: finalizedOrder, error } = await supabaseAdmin
        .from('orders')
        .update(finalUpdates)
        .eq('id', orderId)
        .eq(fields.syncToken, syncAttemptToken)
        .select('id')
        .maybeSingle()

      updateError = error
      finalized = !!finalizedOrder
    }

    if (updateError || !finalized) {
      return NextResponse.json(
        {
          data: {
            phase: requestedPhase,
            invoice_id: result.invoice_id,
            invoice_code: result.invoice_code,
            draft: result.is_draft,
          },
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
        phase: requestedPhase,
        invoice_id: result.invoice_id,
        invoice_code: result.invoice_code,
        customer_id: result.customer_id,
        draft: result.is_draft,
      },
      error: null,
    })
  } catch (error: unknown) {
    console.error('❌ send-invoice error:', error)
    const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
