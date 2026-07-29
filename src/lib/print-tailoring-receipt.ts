import {
  computePaymentBreakdown,
  type OrderPaymentInput,
} from '@/lib/payment-breakdown'

const COMPANY_NAME = 'ياسمين الشام'
const LEGAL_NAME = 'مؤسسة محمد عوض الدوسري'
const COMPANY_ADDRESS = 'الخبر الشمالية شارع الملك مشعل تقاطع 6 الخبر'

export interface TailoringReceiptPayload {
  order_id: string
  order_number: string
  invoice_code: string
  invoice_code_source: 'alostaz' | 'local'
  receipt_type?: 'delivery' | 'preliminary'
  customer_name: string
  item_description: string
  total: number
  paid_amount: number
  cash_amount: number
  network_amount: number
  delivered_at: string
}

export interface TailoringReceiptOrder extends OrderPaymentInput {
  id?: string | null
  order_number?: string | null
  alostaz_invoice_code?: string | null
  client_name?: string | null
  description?: string | null
  delivery_date?: string | null
  created_at?: string | null
}

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
 * لذلك يبقى قابلاً للتتبّع حتى عندما لا تمثل فاتورة الأستاذ إجمالي الطلب
 * (كاش بالكامل أو كاش + شبكة).
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

export function createTailoringReceiptPayload(
  order: TailoringReceiptOrder,
  alostazInvoiceCode?: string | null
): TailoringReceiptPayload {
  const deliveredAt = String(order?.delivery_date || new Date().toISOString())
  const fullyNetwork = isFullyNetworkPaid(order)
  const accountingCode = String(alostazInvoiceCode || order?.alostaz_invoice_code || '').trim()
  const useAccountingCode = fullyNetwork && accountingCode.length > 0
  const breakdown = computePaymentBreakdown(order)

  return {
    order_id: String(order?.id || ''),
    order_number: String(order?.order_number || order?.id || ''),
    invoice_code: useAccountingCode
      ? accountingCode
      : buildLocalTailoringInvoiceCode(String(order?.order_number || order?.id || ''), deliveredAt),
    invoice_code_source: useAccountingCode ? 'alostaz' : 'local',
    receipt_type: 'delivery',
    customer_name: String(order?.client_name || 'عميل'),
    // بند واضح وثابت كما في نموذج الإيصال؛ ملاحظات التصميم الداخلية لا تُطبع.
    item_description: 'أجرة تفصيل فستان',
    total: Number(order?.price) || 0,
    paid_amount: Number(order?.paid_amount) || 0,
    cash_amount: breakdown.cashTotal,
    network_amount: breakdown.networkTotal,
    delivered_at: deliveredAt,
  }
}

/**
 * يبني فاتورة الطلب المبدئية عند التسجيل دون الرجوع إلى نظام المحاسبة.
 * رقم الفاتورة يساوي رقم الطلب حرفياً، وتفصيل الكاش/الشبكة مأخوذ من دفعة العربون.
 */
export function createPreliminaryTailoringReceiptPayload(
  order: TailoringReceiptOrder
): TailoringReceiptPayload {
  const orderNumber = String(order?.order_number || order?.id || '')
  const breakdown = computePaymentBreakdown(order)

  return {
    order_id: String(order?.id || ''),
    order_number: orderNumber,
    invoice_code: orderNumber,
    invoice_code_source: 'local',
    receipt_type: 'preliminary',
    customer_name: String(order?.client_name || 'عميل'),
    item_description: 'أجرة تفصيل فستان',
    total: Number(order?.price) || 0,
    paid_amount: Number(order?.paid_amount) || 0,
    cash_amount: breakdown.cashTotal,
    network_amount: breakdown.networkTotal,
    delivered_at: String(order?.created_at || new Date().toISOString()),
  }
}

/** مستند الإيصال الحراري الكامل، بعرض 80mm وإجمالي الطلب دون ربطه بمبلغ المحاسبة. */
export function buildTailoringReceiptHtml(payload: TailoringReceiptPayload): string {
  const total = Math.max(0, Number(payload.total) || 0)
  const priceBeforeTax = total / 1.15
  const vatAmount = total - priceBeforeTax
  const paidAmount = Math.max(
    0,
    Number(payload.paid_amount) ||
      (Number(payload.cash_amount) || 0) + (Number(payload.network_amount) || 0)
  )
  const remainingAmount = Math.max(0, total - paidAmount)
  const printedAt = formatPrintTimestamp()
  const invoiceCode = escapeHtml(payload.invoice_code)
  const orderNumber = escapeHtml(payload.order_number)
  const customerName = escapeHtml(payload.customer_name)
  const itemDescription = escapeHtml(payload.item_description)
  const documentTitle =
    payload.receipt_type === 'preliminary' ? 'فاتورة مبدئية' : 'فاتورة ضريبية مبسطة'

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
  .feed { height: 15mm; }
</style>
</head>
<body>
  <header class="center">
    <p class="brand">${COMPANY_NAME}</p>
    <p class="legal-name">${LEGAL_NAME}</p>
    <p class="address">${COMPANY_ADDRESS}</p>
    <h1 class="title">${documentTitle}</h1>
    <p class="invoice-code">${invoiceCode}</p>
    <p class="date">تاريخ الفاتورة: <span class="date-value">${formatReceiptDate(payload.delivered_at)}</span></p>
    <p class="date">تاريخ ووقت الطباعة: <span class="date-value">${printedAt}</span></p>
  </header>

  <div class="meta">
    <span>العميل: ${customerName}</span>
    <span class="order">رقم الطلب: ${orderNumber}</span>
  </div>

  <hr class="rule">
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
        <td class="price">${formatMoney(total)}</td>
        <td class="quantity">1</td>
        <td class="line-total">${formatMoney(total)}</td>
      </tr>
    </tbody>
  </table>
  <hr class="rule" style="margin-top: 0">

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
    <span class="label">الإجمالي <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(total)}</span>
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
  <hr class="dash">

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
