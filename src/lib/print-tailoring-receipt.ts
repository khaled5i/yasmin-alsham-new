import {
  computePaymentBreakdown,
  type OrderPaymentInput,
} from '@/lib/payment-breakdown'
import {
  SELLER_VAT_NUMBER,
  TAX_INVOICE_TITLE,
  buildQrSvg,
  roundMoney,
  splitInclusiveVat,
  type AlostazPrintableInvoice,
} from '@/lib/zatca-invoice'
import type { Income } from '@/types/simple-accounting'

const COMPANY_NAME = 'ياسمين الشام'
const LEGAL_NAME = 'مؤسسة محمد عوض الدوسري'
const COMPANY_ADDRESS = 'الخبر الشمالية شارع الملك مشعل تقاطع 6 الخبر'

/**
 * نوع الورقة المطبوعة:
 * - tax_invoice: نسخة فاتورة الأستاذ (شبكة) — الرقم الضريبي ورمز QR الموقّع.
 * - cash_receipt: إيصال استلام لدفعة كاش؛ لا يصل للأستاذ فلا رمز ولا عبارة «ضريبية».
 * - order_summary: ورقة بلا مبلغ مستلم (طلب بلا عربون، أو تسليم بلا متبقٍ).
 * غياب الحقل يعني صيغة الإيصال القديمة (مهام أُرسلت للطابور قبل هذا التحديث).
 */
export type TailoringDocumentKind = 'tax_invoice' | 'cash_receipt' | 'order_summary'

export interface TailoringReceiptPayload {
  order_id: string
  order_number: string
  invoice_code: string
  invoice_code_source: 'alostaz' | 'local'
  receipt_type?: 'delivery' | 'preliminary' | 'payment'
  document_kind?: TailoringDocumentKind
  /** عنوان الورقة كما يُطبع؛ الموقع يقرّره كي لا تختلف محطات الطباعة في الصياغة. */
  document_title?: string
  customer_name: string
  item_description: string
  /** قيمة الطلب كاملة، وتُستخدم لملخص الطلب. */
  total: number
  /** قيمة هذه الورقة وحدها (فاتورة كاملة مستقلة لكل دفعة). */
  invoice_total?: number
  /** إجماليات الأستاذ للفاتورة الضريبية، تُطبع حرفياً لتطابق الفاتورة المسجلة. */
  total_without_vat?: number
  vat_amount?: number
  vat_number?: string
  /** رمز QR كما أصدره الأستاذ؛ لا يُولَّد في الموقع أبداً. */
  zatca_qr?: string | null
  /** إجمالي المدفوع على الطلب حتى هذه الورقة (لملخص الطلب). */
  paid_amount: number
  /** كاش/شبكة هذه الورقة؛ الكاش يقرر فتح الدرج. */
  cash_amount: number
  network_amount: number
  received_payment_method?: 'cash' | 'card'
  delivered_at: string
  /** ملخص الطلب (قيمته والمدفوع والمتبقي) — يُخفى للفواتير غير المرتبطة بطلب. */
  show_order_summary?: boolean
}

export interface TailoringReceiptOrder extends OrderPaymentInput {
  id?: string | null
  order_number?: string | null
  alostaz_billing_version?: number | null
  alostaz_invoice_code?: string | null
  alostaz_deposit_invoice_code?: string | null
  client_name?: string | null
  description?: string | null
  delivery_date?: string | null
  created_at?: string | null
}

/** فاتورة الأستاذ المقابلة لدفعة شبكة: رقمها، ونسختها للطباعة إن أمكن جلبها. */
export interface TailoringAccountingInvoice {
  code: string
  printable: AlostazPrintableInvoice | null
}

const SERVICE_ITEM = 'أجرة تفصيل فستان'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Number(value) || 0)
}

function formatReceiptDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function formatPrintTimestamp(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || ''

  return `${part('year')}/${part('month')}/${part('day')} - ${part('hour')}:${part('minute')}`
}

/**
 * الرقم المحلي يطابق بنية أرقام الأستاذ، لكن تسلسله مأخوذ من رقم الطلب.
 * يبقى مستعملاً لإيصالات الطلبات القديمة (الإصدار 1) غير المرسلة للأستاذ.
 */
export function buildLocalTailoringInvoiceCode(
  orderNumber: string,
  deliveredAt: string = new Date().toISOString()
): string {
  const date = new Date(deliveredAt)
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear()
  const normalized = toLatinDigits(String(orderNumber || '').trim())
  const numericSerial = normalized.replace(/\D/g, '')
  const serial = numericSerial
    ? numericSerial.padStart(6, '0')
    : normalized.replace(/\s+/g, '-').padStart(6, '0')

  return `INV-${String(year).slice(-2)}-1-${serial}`
}

export function isFullyNetworkPaid(order: TailoringReceiptOrder): boolean {
  const total = Number(order?.price) || 0
  if (total <= 0) return false

  const breakdown = computePaymentBreakdown(order)
  const tolerance = 0.005
  return breakdown.cashTotal <= tolerance && breakdown.networkTotal >= total - tolerance
}

function orderNumberOf(order: TailoringReceiptOrder): string {
  return String(order?.order_number || order?.id || '')
}

interface PaperInput {
  order: TailoringReceiptOrder
  kind: TailoringDocumentKind
  receiptType: 'preliminary' | 'delivery' | 'payment'
  amount: number
  method: 'cash' | 'card' | null
  issuedAt: string
  itemDescription: string
  /** رقم الورقة المحلي للكاش وملخص الطلب. */
  localCode: string
  accounting?: TailoringAccountingInvoice | null
  summaryTitle?: string
  showOrderSummary?: boolean
  orderTotal?: number
  paidAmount?: number
}

/**
 * ورقة واحدة بقيمة دفعة واحدة. الفاتورة الضريبية تأخذ أرقام الأستاذ حرفياً
 * عند توفرها حتى تطابق الفاتورة المسجلة في المحاسبة وفي هيئة الزكاة.
 */
function buildPaper(input: PaperInput): TailoringReceiptPayload {
  const isTax = input.kind === 'tax_invoice'
  const accountingCode = String(input.accounting?.code || '').trim()
  if (isTax && !accountingCode) {
    throw new Error('لا يمكن طباعة فاتورة شبكة قبل استلام رقمها من برنامج الأستاذ')
  }

  const printable = isTax ? input.accounting?.printable || null : null
  const fallback = splitInclusiveVat(input.amount)
  const amount = printable && printable.total > 0 ? printable.total : fallback.total
  const beforeVat = printable && printable.total > 0 ? printable.total_without_vat : fallback.beforeVat
  const vat = printable && printable.total > 0 ? printable.vat : fallback.vat
  const isSummary = input.kind === 'order_summary'

  return {
    order_id: String(input.order?.id || ''),
    order_number: orderNumberOf(input.order),
    invoice_code: isTax ? accountingCode : input.localCode,
    invoice_code_source: isTax ? 'alostaz' : 'local',
    receipt_type: input.receiptType,
    document_kind: input.kind,
    // الكاش بنفس عنوان فاتورة الشبكة وصياغتها (بطلب المالك)، برقمه المحلي وبلا رمز QR.
    document_title: isSummary ? input.summaryTitle || 'إيصال طلب' : TAX_INVOICE_TITLE,
    customer_name: String(input.order?.client_name || 'عميل'),
    item_description: input.itemDescription,
    total: roundMoney(input.orderTotal ?? (Number(input.order?.price) || 0)),
    invoice_total: isSummary ? 0 : amount,
    total_without_vat: isSummary ? 0 : beforeVat,
    vat_amount: isSummary ? 0 : vat,
    ...(isSummary ? {} : { vat_number: SELLER_VAT_NUMBER }),
    // الرمز لا يوجد إلا لفاتورة مسجلة في الأستاذ، فلا يُطبع على الكاش أبداً.
    ...(isTax ? { zatca_qr: printable?.qr || null } : {}),
    paid_amount: roundMoney(input.paidAmount ?? (Number(input.order?.paid_amount) || 0)),
    cash_amount: input.method === 'cash' && !isSummary ? amount : 0,
    network_amount: input.method === 'card' && !isSummary ? amount : 0,
    ...(input.method && !isSummary ? { received_payment_method: input.method } : {}),
    delivered_at: input.issuedAt,
    show_order_summary: input.showOrderSummary ?? true,
  }
}

/**
 * أوراق دفعة العربون عند تسجيل الطلب — كل وسيلة دفع في ورقة مستقلة بقيمتها كاملة:
 * عربون الشبكة فاتورة ضريبية (فاتورة الأستاذ)، وعربون الكاش إيصال استلام.
 * طلب بلا عربون يأخذ «إيصال طلب» بملخصه فقط.
 */
export function createDepositReceiptPayloads(
  order: TailoringReceiptOrder,
  networkInvoice?: TailoringAccountingInvoice | null
): TailoringReceiptPayload[] {
  const orderNumber = orderNumberOf(order)
  const breakdown = computePaymentBreakdown(order)
  const issuedAt = String(order?.created_at || new Date().toISOString())
  const papers: TailoringReceiptPayload[] = []

  if (breakdown.preDeliveryNetwork >= 0.005) {
    papers.push(buildPaper({
      order,
      kind: 'tax_invoice',
      receiptType: 'preliminary',
      amount: breakdown.preDeliveryNetwork,
      method: 'card',
      issuedAt,
      itemDescription: `عربون ${SERVICE_ITEM}`,
      localCode: orderNumber,
      accounting: networkInvoice,
    }))
  }
  if (breakdown.preDeliveryCash >= 0.005) {
    papers.push(buildPaper({
      order,
      kind: 'cash_receipt',
      receiptType: 'preliminary',
      amount: breakdown.preDeliveryCash,
      method: 'cash',
      issuedAt,
      itemDescription: `عربون ${SERVICE_ITEM}`,
      localCode: `CASH-${orderNumber}-D`,
    }))
  }
  if (papers.length === 0) {
    papers.push(buildPaper({
      order,
      kind: 'order_summary',
      receiptType: 'preliminary',
      amount: 0,
      method: null,
      issuedAt,
      itemDescription: SERVICE_ITEM,
      localCode: orderNumber,
      summaryTitle: 'إيصال طلب',
    }))
  }
  return papers
}

/**
 * أوراق التسليم — المتبقي وحده، كل وسيلة في ورقة مستقلة بقيمتها كاملة.
 * الطلبات القديمة (الإصدار 1) كانت تُرسل فاتورة واحدة بقيمة الطلب كاملة،
 * فتبقى ورقتها واحدة بنفس القيمة كي تطابق فاتورة الأستاذ.
 */
export function createDeliveryReceiptPayloads(
  order: TailoringReceiptOrder,
  networkInvoice?: TailoringAccountingInvoice | null
): TailoringReceiptPayload[] {
  const orderNumber = orderNumberOf(order)
  const breakdown = computePaymentBreakdown(order)
  const issuedAt = String(order?.delivery_date || new Date().toISOString())
  const price = Math.max(0, Number(order?.price) || 0)

  if (Number(order?.alostaz_billing_version) < 2) {
    const legacyCode = String(networkInvoice?.code || order?.alostaz_invoice_code || '').trim()
    const legacyTax = isFullyNetworkPaid(order) && !!legacyCode
    return [buildPaper({
      order,
      kind: legacyTax ? 'tax_invoice' : 'cash_receipt',
      receiptType: 'delivery',
      amount: price,
      method: legacyTax ? 'card' : 'cash',
      issuedAt,
      itemDescription: SERVICE_ITEM,
      localCode: buildLocalTailoringInvoiceCode(orderNumber, issuedAt),
      accounting: legacyTax ? { code: legacyCode, printable: networkInvoice?.printable || null } : null,
    })]
  }

  const papers: TailoringReceiptPayload[] = []
  if (breakdown.remainingNetwork >= 0.005) {
    papers.push(buildPaper({
      order,
      kind: 'tax_invoice',
      receiptType: 'delivery',
      amount: breakdown.remainingNetwork,
      method: 'card',
      issuedAt,
      itemDescription: `باقي ${SERVICE_ITEM}`,
      localCode: orderNumber,
      accounting: networkInvoice,
    }))
  }
  if (breakdown.remainingCash >= 0.005) {
    papers.push(buildPaper({
      order,
      kind: 'cash_receipt',
      receiptType: 'delivery',
      amount: breakdown.remainingCash,
      method: 'cash',
      issuedAt,
      itemDescription: `باقي ${SERVICE_ITEM}`,
      localCode: `CASH-${orderNumber}-R`,
    }))
  }
  if (papers.length === 0) {
    papers.push(buildPaper({
      order,
      kind: 'order_summary',
      receiptType: 'delivery',
      amount: 0,
      method: null,
      issuedAt,
      itemDescription: SERVICE_ITEM,
      localCode: orderNumber,
      summaryTitle: 'إيصال تسليم',
    }))
  }
  return papers
}

export interface AdditionalOrderPaymentReceipt {
  id: string
  amount: number
  method: 'cash' | 'card'
  receivedAt?: string
}

/**
 * ورقة مستقلة للدفعة المضافة من صفحة تعديل الطلب، بقيمة الدفعة كاملة.
 * paid_amount يبقى الإجمالي التراكمي ليظهر المتبقي الصحيح في ملخص الطلب.
 */
export function createAdditionalPaymentReceiptPayload(
  order: TailoringReceiptOrder,
  payment: AdditionalOrderPaymentReceipt,
  networkInvoice?: TailoringAccountingInvoice | null
): TailoringReceiptPayload {
  const orderNumber = orderNumberOf(order)
  const amount = Math.max(0, Number(payment.amount) || 0)
  const localReference = String(payment.id || Date.now())
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)

  return buildPaper({
    order,
    kind: payment.method === 'card' ? 'tax_invoice' : 'cash_receipt',
    receiptType: 'payment',
    amount,
    method: payment.method,
    issuedAt: String(payment.receivedAt || new Date().toISOString()),
    itemDescription: `دفعة على ${SERVICE_ITEM}`,
    localCode: `CASH-${orderNumber}-P-${localReference || Date.now()}`,
    accounting: payment.method === 'card' ? networkInvoice : null,
  })
}

/** مستند الإيصال الحراري بعرض 80mm؛ ويدعم فاتورة طلب كاملة أو فاتورة دفعة مستقلة. */
export function buildTailoringReceiptHtml(payload: TailoringReceiptPayload): string {
  const orderTotal = Math.max(0, Number(payload.total) || 0)
  const invoiceTotal = Math.max(
    0,
    payload.invoice_total == null
      ? orderTotal
      : Number(payload.invoice_total) || 0
  )
  const hasAccountingTotals = payload.total_without_vat != null && payload.vat_amount != null
  const priceBeforeTax = hasAccountingTotals
    ? Number(payload.total_without_vat) || 0
    : invoiceTotal / 1.15
  const vatAmount = hasAccountingTotals
    ? Number(payload.vat_amount) || 0
    : invoiceTotal - priceBeforeTax
  const paidAmount = Math.max(
    0,
    Number(payload.paid_amount) ||
      (Number(payload.cash_amount) || 0) + (Number(payload.network_amount) || 0)
  )
  const remainingAmount = Math.max(0, orderTotal - paidAmount)
  const printedAt = formatPrintTimestamp()
  const invoiceCode = escapeHtml(payload.invoice_code)
  const orderNumber = escapeHtml(payload.order_number)
  const customerName = escapeHtml(payload.customer_name)
  const itemDescription = escapeHtml(payload.item_description)
  // الصيغة الجديدة: كل ورقة بقيمة دفعتها كاملة، والعنوان يحدده الموقع.
  const kind = payload.document_kind
  const isNewFormat = !!kind
  const isTaxInvoice = kind === 'tax_invoice'
  const isSummaryOnly = kind === 'order_summary'
  const showOrderSummary = isNewFormat && payload.show_order_summary !== false
  const documentTitle = escapeHtml(
    payload.document_title ||
      (payload.receipt_type === 'preliminary'
        ? 'فاتورة مبدئية'
        : payload.receipt_type === 'payment'
          ? 'فاتورة دفعة'
          : 'فاتورة ضريبية مبسطة')
  )
  const methodLabel = payload.received_payment_method === 'cash' ? 'كاش' : 'شبكة'
  const qrSvg = isTaxInvoice && payload.zatca_qr ? buildQrSvg(payload.zatca_qr) : ''
  const zatcaBlock = isTaxInvoice
    ? qrSvg
      ? `<div class="qr">${qrSvg}</div>`
      : '<p class="qr-missing">رمز الفاتورة الإلكترونية لم يصل من برنامج المحاسبة بعد — أعيدي طباعة الفاتورة للحصول عليه.</p>'
    : ''
  const newFormatRows = isSummaryOnly
    ? ''
    : `
  <div class="summary-row">
    <span class="label">السعر (غير شامل الضريبة)</span>
    <span class="value">${formatMoney(priceBeforeTax)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row">
    <span class="label">الضريبة</span>
    <span class="value">${formatMoney(vatAmount)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">إجمالي الفاتورة <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(invoiceTotal)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">المدفوع ${methodLabel} <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(invoiceTotal)}</span>
  </div>
  <hr class="dash">`
  const orderSummaryRows = showOrderSummary
    ? `
  <h2 class="order-summary-title">ملخص الطلب</h2>
  <div class="summary-row">
    <span class="label">قيمة الطلب <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(orderTotal)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row">
    <span class="label">إجمالي المدفوع للطلب <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(paidAmount)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row">
    <span class="label">المتبقي على الطلب <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(remainingAmount)}</span>
  </div>
  <hr class="dash">`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة ${invoiceCode}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html { width: 100%; margin: 0; padding: 0; background: #fff; }
  body {
    /* لا نستخدم عرض الورق كاملًا؛ أغلب تعريفات الطابعات تحجز 3-4mm
       غير قابلة للطباعة عند الجانبين. 72mm هي المساحة الآمنة لورق 80mm. */
    width: 72mm;
    max-width: calc(100% - 6mm);
    margin: 0 auto;
    padding: 3.2mm 1mm 0;
    overflow: hidden;
    color: #000;
    background: #fff;
    direction: rtl;
    font-family: Tahoma, "Segoe UI", sans-serif;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.35;
  }
  .center { text-align: center; }
  .brand { margin: 0 0 0.5mm; font-size: 20px; font-weight: 900; }
  .legal-name { margin: 0; font-size: 16px; font-weight: 900; overflow-wrap: anywhere; }
  .address { margin: 0.5mm auto 2mm; max-width: 66mm; font-size: 11.5px; line-height: 1.3; overflow-wrap: anywhere; }
  .title { margin: 2.5mm 0 0; font-size: 21px; font-weight: 900; }
  .invoice-code { margin: 0; direction: ltr; font-size: 19px; font-weight: 900; letter-spacing: 0.2px; }
  .date { margin: 1.2mm 0 0; font-size: 12px; font-weight: 700; }
  .date:last-child { margin-bottom: 4mm; }
  .date-value { direction: ltr; unicode-bidi: isolate; }
  .meta { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; margin: 0 0 3mm; font-size: 11.5px; }
  .meta span { min-width: 0; overflow-wrap: anywhere; }
  .meta .order { direction: rtl; white-space: nowrap; text-align: left; }
  .rule { border: 0; border-top: 0.45mm solid #000; margin: 1.6mm 0 0; }
  .dash { border: 0; border-top: 0.4mm dashed #000; margin: 0; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items th, .items td { padding: 1.4mm 0.2mm; vertical-align: middle; overflow: hidden; }
  .items th { font-size: 10.5px; font-weight: 700; border-bottom: 0.35mm solid #000; white-space: nowrap; }
  .items td { font-size: 11px; }
  .items .description { width: 39%; text-align: right; }
  .items .price { width: 22%; text-align: center; direction: ltr; }
  .items .quantity { width: 14%; text-align: center; direction: ltr; }
  .items .line-total { width: 25%; text-align: left; direction: ltr; }
  .summary-row { display: grid; grid-template-columns: minmax(0, 1fr) 20mm; gap: 1.5mm; align-items: baseline; padding: 1.2mm 0.4mm; }
  .summary-row .label { min-width: 0; text-align: right; font-size: 12.5px; overflow-wrap: anywhere; }
  .summary-row .value { min-width: 0; text-align: left; direction: ltr; font-size: 12.5px; white-space: nowrap; }
  .summary-row.total .label, .summary-row.total .value { font-size: 15px; font-weight: 900; }
  .currency { display: inline-block; direction: rtl; font-size: 11px; margin-inline-start: 1mm; }
  .policies { margin-top: 3mm; padding: 2.5mm 0.6mm 0; border-top: 0.45mm solid #000; }
  .policies h2 { margin: 0 0 1.5mm; text-align: center; font-size: 14px; font-weight: 900; }
  .policies p { margin: 0 0 1.5mm; font-size: 10.5px; font-weight: 700; line-height: 1.55; }
  .order-summary-title { margin: 3mm 0 0.5mm; text-align: center; font-size: 13px; font-weight: 900; }
  .qr { display: flex; justify-content: center; margin: 3mm 0 1mm; }
  /* الرمز بحجمه الدقيق بالملّيمتر: لا تصغير ولا تحجيم حتى يبقى كل مربع 4 نقاط */
  .qr svg { display: block; flex: none; max-width: none; }
  .qr-missing { margin: 3mm 0 1mm; text-align: center; font-size: 10.5px; font-weight: 700; line-height: 1.45; }
  .feed { height: 15mm; }
</style>
</head>
<body>
  <header class="center">
    <p class="brand">${COMPANY_NAME}</p>
    <p class="legal-name">${LEGAL_NAME}</p>
    <p class="address">${COMPANY_ADDRESS}</p>
    <h1 class="title">${documentTitle}</h1>
    ${invoiceCode ? `<p class="invoice-code">${invoiceCode}</p>` : ''}
    ${payload.vat_number ? `<p class="date">الرقم الضريبي: <span class="date-value">${escapeHtml(payload.vat_number)}</span></p>` : ''}
    <p class="date">تاريخ الفاتورة: <span class="date-value">${formatReceiptDate(payload.delivered_at)}</span></p>
    <p class="date">تاريخ ووقت الطباعة: <span class="date-value">${printedAt}</span></p>
  </header>

  <div class="meta">
    <span>العميل: ${customerName}</span>
    ${!isNewFormat || showOrderSummary ? `<span class="order">رقم الطلب: ${orderNumber}</span>` : ''}
  </div>

  ${isSummaryOnly ? '' : `<hr class="rule">
  <table class="items" aria-label="بنود الفاتورة">
    <thead>
      <tr>
        <th class="description">البند</th>
        <th class="price">السعر</th>
        <th class="quantity">الكمية</th>
        <th class="line-total">المجموع</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="description">${itemDescription}</td>
        <td class="price">${formatMoney(invoiceTotal)}</td>
        <td class="quantity">1</td>
        <td class="line-total">${formatMoney(invoiceTotal)}</td>
      </tr>
    </tbody>
  </table>
  <hr class="rule" style="margin-top: 0">`}
${isNewFormat ? `${newFormatRows}${orderSummaryRows}
  ${zatcaBlock}` : `
  <div class="summary-row">
    <span class="label">السعر (غير شامل الضريبة)</span>
    <span class="value">${formatMoney(priceBeforeTax)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row">
    <span class="label">الضريبة</span>
    <span class="value">${formatMoney(vatAmount)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">${payload.receipt_type === 'payment' ? 'إجمالي الفاتورة' : 'الإجمالي'} <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(invoiceTotal)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">إجمالي المدفوع <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(paidAmount)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">الباقي <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(remainingAmount)}</span>
  </div>
  <hr class="dash">`}

  <section class="policies" aria-label="سياسات المتجر">
    <h2>سياسات المتجر</h2>
    <p>الطلبات المفصّلة حسب المقاس لا تُسترجع ولا تُستبدل بعد بدء التنفيذ، إلا عند وجود عيب أو مخالفة للمواصفات المتفق عليها.</p>
    <p>أي تعديل بعد اعتماد التصميم قد يترتب عليه رسوم إضافية وتأخير في التسليم.</p>
    <p>المتجر غير مسؤول عن الفستان في حالة التأخر عن استلام الطلب خلال مدة أقصاها 14 يومًا.</p>
  </section>
  <div class="feed"></div>
</body>
</html>`
}

export interface ManualTailoringInvoice {
  /** معرّف سجل income — مرجع الطباعة ومصدر الرقم المحلي */
  id: string
  amount: number
  paymentMethod: 'cash' | 'network'
  /** تاريخ الفاتورة (YYYY-MM-DD) كما اختاره المستخدم */
  date: string
  customerName?: string | null
  itemDescription?: string | null
  alostazInvoiceCode?: string | null
  /** نسخة فاتورة الأستاذ للطباعة (الإجماليات ورمز QR) — للشبكة فقط. */
  alostazPrintable?: AlostazPrintableInvoice | null
}

/**
 * مرجع قصير للفاتورة اليدوية. الفاتورة ليست مرتبطة بطلب، لذلك يحل هذا المرجع
 * محل رقم الطلب على الورق ويبقى قابلاً لتتبّع سجل income الذي اشتُقّ منه.
 */
function buildManualInvoiceReference(incomeId: string): string {
  const digits = String(incomeId || '').replace(/\D/g, '').slice(-6)
  return (digits || String(Date.now()).slice(-6)).padStart(6, '0')
}

/**
 * فاتورة «إضافة فاتورة لياسمين الشام للخياطة» بنفس شكل إيصال تسليم الطلب.
 * الشبكة تُطبع برقم الأستاذ حصراً، والكاش يأخذ رقماً محلياً ببادئة CASH كي لا
 * يبدو رقماً محاسبياً. المبلغ مدفوع بالكامل، فالباقي صفر دائماً.
 */
export function createManualTailoringInvoiceReceiptPayload(
  invoice: ManualTailoringInvoice
): TailoringReceiptPayload {
  const amount = Math.max(0, Number(invoice?.amount) || 0)
  const isNetwork = invoice?.paymentMethod === 'network'
  const accountingCode = String(invoice?.alostazInvoiceCode || '').trim()

  if (isNetwork && !accountingCode) {
    throw new Error('لا يمكن طباعة فاتورة شبكة قبل استلام رقمها من برنامج الأستاذ')
  }

  const rawDate = String(invoice?.date || '').trim()
  // التاريخ المجرّد (YYYY-MM-DD) مدعوم في محرّكي الطباعة معاً؛ أي صيغة أخرى
  // تُستبدل بطابع زمني كامل بإزاحة زمنية حتى يقرأه عارض المحطة.
  const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : new Date().toISOString()
  const issuedYear = new Date(`${issuedAt.slice(0, 10)}T00:00:00`).getFullYear()
  const reference = buildManualInvoiceReference(String(invoice?.id || ''))

  return buildPaper({
    order: {
      id: String(invoice?.id || ''),
      order_number: `M-${reference}`,
      client_name: String(invoice?.customerName || 'عميل'),
      price: amount,
      paid_amount: amount,
    },
    kind: isNetwork ? 'tax_invoice' : 'cash_receipt',
    receiptType: 'delivery',
    amount,
    method: isNetwork ? 'card' : 'cash',
    issuedAt,
    itemDescription: String(invoice?.itemDescription || SERVICE_ITEM),
    localCode: `CASH-${String(issuedYear).slice(-2)}-${reference}`,
    accounting: isNetwork
      ? { code: accountingCode, printable: invoice?.alostazPrintable || null }
      : null,
    // فاتورة مستقلة غير مرتبطة بطلب، فلا ملخص طلب تحتها.
    showOrderSummary: false,
  })
}

/**
 * إعادة طباعة حركة واحدة من صفحة واردات التفصيل: ورقة بقيمة الحركة نفسها وبنفس
 * أرقام أوراقها الأصلية (رقم الأستاذ للشبكة، و CASH-… المحلي للكاش).
 * قيمة الطلب الكاملة ليست في الحركة، فلا يُطبع ملخص الطلب تحتها.
 */
export function createIncomeEntryReceiptPayload(
  entry: Income,
  printable: AlostazPrintableInvoice | null
): TailoringReceiptPayload {
  const isNetwork = entry.payment_method === 'network'
  const accountingCode = String(entry.alostaz_invoice_code || printable?.invoice_code || '').trim()

  if (entry.entry_kind !== 'order_deposit' &&
      entry.entry_kind !== 'order_delivery' &&
      entry.entry_kind !== 'order_payment') {
    return createManualTailoringInvoiceReceiptPayload({
      id: entry.id,
      amount: entry.amount,
      paymentMethod: isNetwork ? 'network' : 'cash',
      date: entry.date,
      customerName: entry.customer_name,
      itemDescription: entry.description,
      alostazInvoiceCode: accountingCode,
      alostazPrintable: printable,
    })
  }

  const orderNumber = String(entry.order_number || entry.order_id || '')
  const paymentReference = entry.id.split('-payment-')[1] || entry.id
  const kind = entry.entry_kind
  const itemDescription = kind === 'order_deposit'
    ? `عربون ${SERVICE_ITEM}`
    : kind === 'order_delivery'
      ? `باقي ${SERVICE_ITEM}`
      : `دفعة على ${SERVICE_ITEM}`
  const localCode = kind === 'order_deposit'
    ? `CASH-${orderNumber}-D`
    : kind === 'order_delivery'
      ? `CASH-${orderNumber}-R`
      : `CASH-${orderNumber}-P-${paymentReference.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`

  return buildPaper({
    order: {
      id: entry.order_id || entry.id,
      order_number: orderNumber,
      client_name: entry.customer_name,
    },
    kind: isNetwork ? 'tax_invoice' : 'cash_receipt',
    receiptType: kind === 'order_deposit' ? 'preliminary' : kind === 'order_delivery' ? 'delivery' : 'payment',
    amount: Math.max(0, Number(entry.amount) || 0),
    method: isNetwork ? 'card' : 'cash',
    issuedAt: String(entry.occurred_at || entry.created_at || entry.date),
    itemDescription,
    localCode,
    accounting: isNetwork ? { code: accountingCode, printable } : null,
    showOrderSummary: false,
  })
}
