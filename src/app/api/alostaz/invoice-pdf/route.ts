import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireActiveStaff, type StaffIdentity } from '@/lib/server/api-auth'
import {
  createInvoiceShareLink,
  findInvoiceByCode,
  getInvoiceZatcaSnapshot,
  listPartnerInvoices,
} from '@/lib/services/alostaz-service'
import {
  ALOSTAZ_BRANCH_ID,
  ALOSTAZ_FABRICS_BRANCH_ID,
  ALOSTAZ_WOMEN_WORKSHOP_BRANCH_ID,
} from '@/lib/alostaz-config'
import { computePaymentBreakdown, type OrderPaymentInput } from '@/lib/payment-breakdown'
import { WORKER_PERMISSIONS } from '@/lib/worker-types'
import type { WorkerType } from '@/lib/services/worker-service'

/**
 * رابط ملف PDF الرسمي لفاتورة شبكة واحدة كما يولّده الأستاذ (فاتورة ضريبية مبسطة
 * برمز QR الموقّع من الهيئة).
 *
 * - لا يقبل معرّف فاتورة أستاذ من المتصفح؛ يأخذ مرجع سجل في الموقع ويقرأ الفاتورة
 *   المرتبطة به، فلا يمكن استعماله لفتح فاتورة عميل آخر.
 * - الصلاحيات نفس صلاحيات صفحة الواردات في القسم صاحب السجل.
 * - لا يُعاد رابط لفاتورة لم يُصدر الأستاذ رمز QR لها.
 * - فاتورة واحدة لكل دفعة: العربون، والمتبقي عند التسليم، وكل دفعة إضافية منفصلة.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type InvoicePdfSource =
  | 'income'
  | 'order_deposit'
  | 'order_delivery'
  | 'order_payment'
  | 'women_workshop'

type Section = 'tailoring' | 'fabrics' | 'women'

const SOURCES: InvoicePdfSource[] = [
  'income',
  'order_deposit',
  'order_delivery',
  'order_payment',
  'women_workshop',
]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// معرّف الدفعة الإضافية يولَّد في الواجهة (نص وليس UUID بالضرورة)
const PAYMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/

// الأستاذ يوقّع الفاتورة لحظة إصدارها عادةً؛ مهلة قصيرة تغطي أي تأخر نادر.
const QR_RETRY_DELAYS_MS = [0, 800, 1600]

class InvoicePdfError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface ResolvedInvoice {
  section: Section
  branchId: number
  /** معرّف الفاتورة إن كان محفوظاً، وإلا يُحلّ لاحقاً من الأستاذ بعد فحص الصلاحية. */
  invoiceId: number | null
  resolveRemote?: () => Promise<number>
}

const notFound = (message = 'لا توجد فاتورة شبكة مرسلة للأستاذ لهذه العملية') =>
  new InvoicePdfError(message, 404)

const ORDER_COLUMNS =
  'id, branch, order_number, price, paid_amount, deposit_amount, payment_method' +
  ', pre_delivery_cash_amount, pre_delivery_network_amount, remaining_payment_method' +
  ', remaining_cash_amount, remaining_network_amount, alostaz_billing_version' +
  ', alostaz_customer_id, alostaz_invoice_id, alostaz_invoice_code' +
  ', alostaz_deposit_invoice_id, alostaz_deposit_invoice_code'

interface TailoringOrderRow extends OrderPaymentInput {
  branch?: string | null
  order_number?: string | null
  alostaz_billing_version?: number | null
  alostaz_customer_id?: number | null
  alostaz_invoice_id?: number | null
  alostaz_invoice_code?: string | null
  alostaz_deposit_invoice_id?: number | null
  alostaz_deposit_invoice_code?: string | null
}

async function loadTailoringOrder(orderId: string): Promise<TailoringOrderRow> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('id', orderId)
    .maybeSingle()
  const order = data as TailoringOrderRow | null
  if (!order || order.branch !== 'tailoring') throw notFound()
  return order
}

async function loadAdditionalPayments(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('order_additional_payments')
    .select('id, method, amount, alostaz_invoice_code')
    .eq('order_id', orderId)
  if (error) throw new InvoicePdfError('تعذّر قراءة الدفعات الإضافية للطلب', 500)
  return (data || []) as Array<{
    id: string
    method: 'cash' | 'card'
    amount: number | string
    alostaz_invoice_code: string | null
  }>
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005

/**
 * فاتورة عربون الشبكة الأصلية.
 * كل دفعة شبكة إضافية تكتب فاتورتها فوق أعمدة العربون في الطلب، فإن كان الرقم
 * المحفوظ يخص دفعة إضافية نبحث عن الأصلية في فواتير العميل نفسه في الأستاذ:
 * نفس رقم الطلب، ليست فاتورة التسليم ولا فاتورة دفعة إضافية، وبنفس مبلغ العربون.
 */
async function resolveDepositInvoice(orderId: string): Promise<ResolvedInvoice> {
  const order = await loadTailoringOrder(orderId)
  const payments = await loadAdditionalPayments(orderId)

  const extraNetwork = payments
    .filter((payment) => payment.method === 'card')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  const depositNetwork = Math.round(
    Math.max(0, computePaymentBreakdown(order).preDeliveryNetwork - extraNetwork) * 100
  ) / 100
  if (depositNetwork < 0.005) throw notFound('لا يوجد عربون شبكة في هذا الطلب')

  const paymentCodes = new Set(
    payments
      .map((payment) => String(payment.alostaz_invoice_code || '').trim())
      .filter(Boolean)
  )
  const storedId = Number(order.alostaz_deposit_invoice_id)
  const storedCode = String(order.alostaz_deposit_invoice_code || '').trim()
  if (!(storedId > 0) || !storedCode) throw notFound()

  if (!paymentCodes.has(storedCode)) {
    return { section: 'tailoring', branchId: ALOSTAZ_BRANCH_ID, invoiceId: storedId }
  }

  return {
    section: 'tailoring',
    branchId: ALOSTAZ_BRANCH_ID,
    invoiceId: null,
    resolveRemote: async () => {
      const partnerId = Number(order.alostaz_customer_id)
      const orderNumber = String(order.order_number || '').trim()
      const deliveryId = Number(order.alostaz_invoice_id)
      if (!(partnerId > 0) || !orderNumber) {
        throw notFound('فاتورة العربون الأصلية غير محفوظة في الموقع؛ افتحها من الأستاذ')
      }
      const candidates = (await listPartnerInvoices(partnerId, ALOSTAZ_BRANCH_ID)).filter(
        (invoice) =>
          invoice.is_issued_sale &&
          invoice.partner_order_code === orderNumber &&
          invoice.id !== deliveryId &&
          !paymentCodes.has(invoice.code) &&
          sameAmount(invoice.total, depositNetwork)
      )
      if (candidates.length !== 1) {
        throw notFound('تعذّر تحديد فاتورة العربون الأصلية في الأستاذ؛ افتحها من الأستاذ مباشرة')
      }
      return candidates[0].id
    },
  }
}

async function resolveInvoice(source: InvoicePdfSource, id: string): Promise<ResolvedInvoice> {
  if (source === 'income') {
    const { data } = await supabaseAdmin
      .from('income')
      .select('branch, payment_method, network_amount, alostaz_invoice_id')
      .eq('id', id)
      .maybeSingle()
    const invoiceId = Number(data?.alostaz_invoice_id)
    const hasNetwork =
      data?.payment_method === 'network' ||
      (data?.payment_method === 'mixed' && Number(data?.network_amount) > 0)
    if (!data || !hasNetwork || !(invoiceId > 0)) throw notFound()
    if (data.branch === 'fabrics') {
      return { section: 'fabrics', branchId: ALOSTAZ_FABRICS_BRANCH_ID, invoiceId }
    }
    if (data.branch === 'tailoring') {
      return { section: 'tailoring', branchId: ALOSTAZ_BRANCH_ID, invoiceId }
    }
    throw notFound()
  }

  if (source === 'women_workshop') {
    const { data } = await supabaseAdmin
      .from('women_workshop_transactions')
      .select('transaction_kind, payment_method, alostaz_invoice_id')
      .eq('id', id)
      .maybeSingle()
    const invoiceId = Number(data?.alostaz_invoice_id)
    if (
      !data ||
      data.transaction_kind === 'expense' ||
      data.payment_method !== 'card' ||
      !(invoiceId > 0)
    ) throw notFound()
    return { section: 'women', branchId: ALOSTAZ_WOMEN_WORKSHOP_BRANCH_ID, invoiceId }
  }

  if (source === 'order_payment') {
    const { data } = await supabaseAdmin
      .from('order_additional_payments')
      .select('order_id, branch, method, alostaz_invoice_code')
      .eq('id', id)
      .maybeSingle()
    const code = String(data?.alostaz_invoice_code || '').trim()
    if (!data || data.branch !== 'tailoring' || data.method !== 'card' || !code) throw notFound()
    return {
      section: 'tailoring',
      branchId: ALOSTAZ_BRANCH_ID,
      invoiceId: null,
      resolveRemote: async () => {
        const invoice = await findInvoiceByCode(code, ALOSTAZ_BRANCH_ID)
        if (!invoice?.is_issued_sale) throw notFound('لم يُعثر على فاتورة هذه الدفعة في الأستاذ')
        return invoice.id
      },
    }
  }

  if (source === 'order_deposit') return resolveDepositInvoice(id)

  // order_delivery: فاتورة المتبقي عند التسليم (أو فاتورة الطلب كاملاً للطلبات القديمة)
  const order = await loadTailoringOrder(id)
  const invoiceId = Number(order.alostaz_invoice_id)
  if (!(invoiceId > 0)) throw notFound()
  if (
    Number(order.alostaz_billing_version) >= 2 &&
    computePaymentBreakdown(order).remainingNetwork < 0.005
  ) {
    throw notFound('لا توجد دفعة شبكة عند التسليم في هذا الطلب')
  }
  return { section: 'tailoring', branchId: ALOSTAZ_BRANCH_ID, invoiceId }
}

/** نفس صلاحيات صفحة الواردات في كل قسم. */
async function canAccessSection(staff: StaffIdentity, section: Section): Promise<boolean> {
  if (staff.role === 'admin') return true
  if (staff.role !== 'worker' || section === 'tailoring') return false

  const { data } = await supabaseAdmin
    .from('workers')
    .select('worker_type')
    .eq('user_id', staff.userId)
    .maybeSingle()
  const workerType = data?.worker_type as WorkerType | undefined
  if (!workerType) return false

  if (section === 'women') return workerType === 'accountant'
  return WORKER_PERMISSIONS[workerType]?.canAccessAccounting === true
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth.response

  try {
    const payload = await request.json().catch(() => null)
    const source = String(payload?.source || '') as InvoicePdfSource
    const id = String(payload?.id || '').trim()

    if (!SOURCES.includes(source)) {
      return NextResponse.json({ error: 'مصدر الفاتورة غير صالح' }, { status: 400 })
    }
    const validId = source === 'order_payment' ? PAYMENT_ID_PATTERN.test(id) : UUID_PATTERN.test(id)
    if (!validId) {
      return NextResponse.json({ error: 'معرّف السجل غير صالح' }, { status: 400 })
    }

    const target = await resolveInvoice(source, id)
    if (!(await canAccessSection(auth.staff, target.section))) {
      return NextResponse.json(
        { error: 'غير مسموح - لا تملك صلاحية واردات هذا القسم' },
        { status: 403 }
      )
    }

    const invoiceId = target.invoiceId ?? (await target.resolveRemote!())

    // لا ملف بلا رمز QR موقّع من الأستاذ
    let snapshot = null
    for (const delay of QR_RETRY_DELAYS_MS) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      snapshot = await getInvoiceZatcaSnapshot(invoiceId, target.branchId)
      if (snapshot.qr) break
    }
    if (!snapshot?.qr) {
      return NextResponse.json(
        {
          error: snapshot?.zatca_status === 'rejected'
            ? 'رفضت هيئة الزكاة هذه الفاتورة في الأستاذ، فلا يوجد لها رمز QR معتمد'
            : 'لم يُصدر الأستاذ رمز QR لهذه الفاتورة بعد؛ أعد المحاولة بعد قليل',
        },
        { status: 409 }
      )
    }

    // الطباعة المحلية تحتاج بيانات النسخة (الرقم والإجماليات والرمز) لا رابط الملف
    if (payload?.purpose === 'print') {
      return NextResponse.json({
        data: {
          invoice_code: snapshot.invoice_code,
          qr: snapshot.qr,
          total: snapshot.total,
          total_without_vat: snapshot.total_without_vat,
          vat: snapshot.vat,
          issue_date: snapshot.issue_date,
        },
        error: null,
      })
    }

    const url = await createInvoiceShareLink(invoiceId, target.branchId)
    return NextResponse.json({
      data: { url, invoice_code: snapshot.invoice_code },
      error: null,
    })
  } catch (error: unknown) {
    if (error instanceof InvoicePdfError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('invoice-pdf error:', error)
    const message = error instanceof Error ? error.message : 'تعذّر جلب ملف الفاتورة من الأستاذ'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
