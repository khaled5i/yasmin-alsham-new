import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  createInvoiceForTailoringManualSale,
  isAlostazInvoiceOutcomeUnknown,
} from '@/lib/services/alostaz-service'
import { ALOSTAZ_SERVICE_PRODUCT_NAME } from '@/lib/alostaz-config'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type PaymentMethod = 'cash' | 'network'

/** العميل الافتراضي في الأستاذ — نفس الاسم المستخدم لفواتير المشغل النسائي. */
const DEFAULT_CUSTOMER_NAME = 'عميل جديد'
const MAX_NOTES_LENGTH = 1000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** تاريخ اليوم بتوقيت الرياض (عمود income.date من نوع DATE). */
function riyadhToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * تاريخ الفاتورة القادم من النموذج (YYYY-MM-DD). يُستخدم لعمود income.date
 * ولتاريخي الإصدار والاستحقاق في الأستاذ، لذلك نتحقق أنه يوم تقويمي حقيقي
 * وضمن مدى معقول قبل قبوله. القيمة الفارغة تعني «اليوم».
 */
function normalizeInvoiceDate(raw: unknown): string | null {
  const value = String(raw || '').trim()
  if (!value) return riyadhToday()
  if (!DATE_PATTERN.test(value)) return null

  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  // يرفض تواريخ مثل 2026-02-31 التي يعيد JavaScript ضبطها إلى يوم آخر.
  if (parsed.toISOString().slice(0, 10) !== value) return null

  const today = new Date(`${riyadhToday()}T00:00:00Z`)
  const oneYearAhead = new Date(today)
  oneYearAhead.setUTCFullYear(oneYearAhead.getUTCFullYear() + 1)
  if (parsed < new Date('2000-01-01T00:00:00Z') || parsed > oneYearAhead) return null

  return value
}

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
    const paymentMethod = String(payload?.paymentMethod || '') as PaymentMethod
    const notes = String(payload?.notes || '').trim()
    const amount = Math.round((Number(payload?.amount) + Number.EPSILON) * 100) / 100
    const invoiceDate = normalizeInvoiceDate(payload?.date)

    if (!UUID_PATTERN.test(transactionId)) {
      return NextResponse.json({ error: 'معرّف العملية غير صالح' }, { status: 400 })
    }
    if (!['cash', 'network'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
    }
    if (!invoiceDate) {
      return NextResponse.json({ error: 'تاريخ الفاتورة غير صالح' }, { status: 400 })
    }
    if (notes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json(
        { error: `الملاحظات أطول من ${MAX_NOTES_LENGTH} حرف` },
        { status: 400 }
      )
    }

    // إعادة الضغط على الحفظ بعد انقطاع الشبكة تستخدم المعرّف نفسه، فلا تُنشأ فاتورة ثانية.
    const syncToken = paymentMethod === 'network' ? randomUUID() : null
    const nowIso = new Date().toISOString()
    const { data: income, error: insertError } = await supabaseAdmin
      .from('income')
      .insert({
        id: transactionId,
        branch: 'tailoring',
        category: ALOSTAZ_SERVICE_PRODUCT_NAME,
        customer_name: DEFAULT_CUSTOMER_NAME,
        description: ALOSTAZ_SERVICE_PRODUCT_NAME,
        amount,
        payment_method: paymentMethod,
        notes: notes || null,
        date: invoiceDate,
        is_automatic: false,
        created_by: user.id,
        alostaz_sync_status: paymentMethod === 'network' ? 'sending' : null,
        alostaz_sync_token: syncToken,
        alostaz_synced_at: paymentMethod === 'network' ? nowIso : null,
      })
      .select('*')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('income')
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

    // الكاش يبقى داخل الموقع: يرفع رصيد صندوق التفصيل ولا يُرسل إلى الأستاذ.
    if (paymentMethod === 'cash') {
      return NextResponse.json({ data: income, sentToAccounting: false })
    }

    try {
      // تاريخ الفاتورة المختار هو نفسه تاريخ الإصدار والاستحقاق في الأستاذ.
      const invoice = await createInvoiceForTailoringManualSale({
        amount,
        date: invoiceDate,
      })

      const syncedAt = new Date().toISOString()
      const { data: updatedIncome, error: updateError } = await supabaseAdmin
        .from('income')
        .update({
          alostaz_customer_id: invoice.customer_id,
          alostaz_invoice_id: invoice.invoice_id,
          alostaz_invoice_code: invoice.invoice_code,
          alostaz_sync_status: 'sent',
          alostaz_sync_error: null,
          alostaz_synced_at: syncedAt,
        })
        .eq('id', transactionId)
        .eq('alostaz_sync_token', syncToken)
        .select('*')
        .single()

      if (updateError) {
        return NextResponse.json({
          data: income,
          sentToAccounting: true,
          warning: `تم إنشاء الفاتورة في الأستاذ برقم ${invoice.invoice_code || invoice.invoice_id}، لكن تعذّر حفظ مرجعها محلياً.`,
        })
      }

      return NextResponse.json({
        data: updatedIncome,
        sentToAccounting: true,
        draft: invoice.is_draft,
      })
    } catch (error: unknown) {
      const outcomeUnknown = isAlostazInvoiceOutcomeUnknown(error)
      const errorMessage = error instanceof Error
        ? error.message
        : 'فشل إرسال فاتورة التفصيل إلى الأستاذ'
      const failedAt = new Date().toISOString()

      await supabaseAdmin
        .from('income')
        .update({
          alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
          alostaz_sync_error: errorMessage,
          alostaz_synced_at: failedAt,
        })
        .eq('id', transactionId)
        .eq('alostaz_sync_token', syncToken)

      return NextResponse.json({
        data: {
          ...income,
          alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
          alostaz_sync_error: errorMessage,
        },
        sentToAccounting: false,
        warning: outcomeUnknown
          ? `${errorMessage} — العملية محفوظة محلياً ويلزم التحقق من الأستاذ قبل إعادة تسجيلها.`
          : `${errorMessage} — العملية محفوظة محلياً ويمكن مراجعتها من صفحة واردات التفصيل.`,
      })
    }
  } catch (error: unknown) {
    console.error('tailoring invoice error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
