import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  createInvoiceForWomenWorkshop,
  isAlostazInvoiceOutcomeUnknown,
} from '@/lib/services/alostaz-service'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const OPERATION_CONFIG = {
  external_measurement: { name: 'مقاس خارجي', useMeasurementProduct: true },
  fitting: { name: 'بروفا', useMeasurementProduct: false },
  bridal_measurement: { name: 'مقاس عروس', useMeasurementProduct: true },
  dress_alteration: { name: 'تعديل فستان', useMeasurementProduct: false },
  other: { name: 'أخرى', useMeasurementProduct: false },
} as const

type OperationType = keyof typeof OPERATION_CONFIG
type PaymentMethod = 'cash' | 'card'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
    const transactionId = String(payload?.transactionId || '').trim()
    const operationType = String(payload?.operationType || '') as OperationType
    const paymentMethod = String(payload?.paymentMethod || '') as PaymentMethod
    const customOperationName = String(payload?.customOperationName || '').trim()
    const amount = Math.round((Number(payload?.amount) + Number.EPSILON) * 100) / 100

    if (!UUID_PATTERN.test(transactionId)) {
      return NextResponse.json({ error: 'معرّف العملية غير صالح' }, { status: 400 })
    }
    if (!(operationType in OPERATION_CONFIG)) {
      return NextResponse.json({ error: 'نوع العملية غير صالح' }, { status: 400 })
    }
    if (!['cash', 'card'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
    }

    const operationName = operationType === 'other'
      ? customOperationName
      : OPERATION_CONFIG[operationType].name

    if (operationName.length < 2 || operationName.length > 120) {
      return NextResponse.json({ error: 'يرجى كتابة اسم العملية الأخرى' }, { status: 400 })
    }

    const syncToken = paymentMethod === 'card' ? randomUUID() : null
    const nowIso = new Date().toISOString()
    const { data: transaction, error: insertError } = await supabaseAdmin
      .from('women_workshop_transactions')
      .insert({
        id: transactionId,
        source: 'manual_invoice',
        operation_type: operationType,
        operation_name: operationName,
        amount,
        payment_method: paymentMethod,
        created_by: user.id,
        occurred_at: nowIso,
        alostaz_sync_status: paymentMethod === 'card' ? 'sending' : 'not_required',
        alostaz_sync_token: syncToken,
        alostaz_synced_at: paymentMethod === 'card' ? nowIso : null,
      })
      .select('*')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('women_workshop_transactions')
          .select('*')
          .eq('id', transactionId)
          .maybeSingle()

        if (existing) {
          return NextResponse.json({ data: existing, duplicate: true })
        }
      }

      return NextResponse.json(
        { error: `تعذّر حفظ العملية في الموقع: ${insertError.message}` },
        { status: 500 }
      )
    }

    if (paymentMethod === 'cash') {
      return NextResponse.json({ data: transaction, sentToAccounting: false })
    }

    try {
      const invoice = await createInvoiceForWomenWorkshop({
        operation_name: operationName,
        amount,
        use_measurement_product: OPERATION_CONFIG[operationType].useMeasurementProduct,
      })

      const syncedAt = new Date().toISOString()
      const { data: updatedTransaction, error: updateError } = await supabaseAdmin
        .from('women_workshop_transactions')
        .update({
          alostaz_customer_id: invoice.customer_id,
          alostaz_invoice_id: invoice.invoice_id,
          alostaz_invoice_code: invoice.invoice_code,
          alostaz_sync_status: 'sent',
          alostaz_sync_error: null,
          alostaz_synced_at: syncedAt,
          updated_at: syncedAt,
        })
        .eq('id', transactionId)
        .eq('alostaz_sync_token', syncToken)
        .select('*')
        .single()

      if (updateError) {
        return NextResponse.json({
          data: transaction,
          sentToAccounting: true,
          warning: `تم إنشاء الفاتورة في الأستاذ برقم ${invoice.invoice_code || invoice.invoice_id}، لكن تعذّر حفظ مرجعها محلياً.`,
        })
      }

      return NextResponse.json({
        data: updatedTransaction,
        sentToAccounting: true,
        draft: invoice.is_draft,
      })
    } catch (error: unknown) {
      const outcomeUnknown = isAlostazInvoiceOutcomeUnknown(error)
      const errorMessage = error instanceof Error
        ? error.message
        : 'فشل إرسال فاتورة المشغل النسائي إلى الأستاذ'
      const failedAt = new Date().toISOString()

      await supabaseAdmin
        .from('women_workshop_transactions')
        .update({
          alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
          alostaz_sync_error: errorMessage,
          alostaz_synced_at: failedAt,
          updated_at: failedAt,
        })
        .eq('id', transactionId)
        .eq('alostaz_sync_token', syncToken)

      return NextResponse.json({
        data: {
          ...transaction,
          alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
          alostaz_sync_error: errorMessage,
        },
        sentToAccounting: false,
        warning: outcomeUnknown
          ? `${errorMessage} — العملية محفوظة محلياً ويلزم التحقق من الأستاذ قبل إعادة تسجيلها.`
          : `${errorMessage} — العملية محفوظة محلياً ويمكن مراجعتها من تقرير المشغل النسائي.`,
      })
    }
  } catch (error: unknown) {
    console.error('women-workshop invoice error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

