import type { FabricSaleItem, Income } from '@/types/simple-accounting'

const SHOP_NAME = 'بروكار الشرقية'
const LEGAL_NAME = 'مؤسسة محمد عوض الدوسري'
const SHOP_ADDRESS = 'الخبر الشمالية شارع الملك مشعل تقاطع 6 الخبر'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Number(value) || 0)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function getLocalCashNumber(item: Income): string {
  const date = new Date(item.date)
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear()
  const fallback = String(item.id || '').replace(/\D/g, '').slice(-6) || '0'
  const serial = String(item.invoice_number ?? fallback).padStart(6, '0')
  return `CASH-${String(year).slice(-2)}-${serial}`
}

/**
 * الشبكة تستخدم حصراً رقم الأستاذ، والكاش يستخدم التسلسل المحلي المستقل.
 * لا نطبع رقماً محلياً على فاتورة شبكة حتى لا تبدو مطابقة لفاتورة المحاسبة وهي ليست كذلك.
 */
export function getFabricReceiptNumber(item: Income): string {
  if (item.payment_method === 'network') {
    const accountingCode = String(item.alostaz_invoice_code || '').trim()
    if (!accountingCode) {
      throw new Error('لا يمكن طباعة فاتورة شبكة قبل استلام رقمها من برنامج الأستاذ')
    }
    return accountingCode
  }
  return getLocalCashNumber(item)
}

interface FabricReceiptLine {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

function getFabricItems(item: Income): FabricSaleItem[] {
  const items = Array.isArray(item.fabric_items)
    ? item.fabric_items.filter((fabric) => fabric && fabric.name)
    : []

  if (items.length > 0) return items
  return [{
    name: item.customer_name || item.description || 'قماش',
    quantity_meters: item.quantity_meters ?? null,
  }]
}

/** توزيع الإجمالي على الأصناف بنسبة الأمتار، بنفس منطق فاتورة الأستاذ. */
function buildReceiptLines(item: Income): FabricReceiptLine[] {
  const fabrics = getFabricItems(item)
  const quantities = fabrics.map((fabric) => Math.max(0, Number(fabric.quantity_meters) || 0))
  const totalQuantity = quantities.reduce((sum, quantity) => sum + quantity, 0)
  const invoiceTotal = Number(item.amount) || 0
  const round2 = (value: number) => Math.round(value * 100) / 100
  let allocated = 0

  return fabrics.map((fabric, index) => {
    const quantity = quantities[index]
    const isLast = index === fabrics.length - 1
    let lineTotal: number

    if (isLast) {
      lineTotal = round2(invoiceTotal - allocated)
    } else if (totalQuantity > 0) {
      lineTotal = round2((invoiceTotal * quantity) / totalQuantity)
      allocated += lineTotal
    } else {
      lineTotal = round2(invoiceTotal / fabrics.length)
      allocated += lineTotal
    }

    return {
      name: fabric.name || 'قماش',
      quantity,
      unitPrice: quantity > 0 ? lineTotal / quantity : lineTotal,
      total: lineTotal,
    }
  })
}

// يبني مستند HTML كامل للإيصال. محطة الطباعة تستدعي print() بنفسها،
// بينما الطباعة المحلية تضيف سكربت الطباعة والإغلاق عبر autoPrint.
export function buildFabricSaleReceiptHtml(
  item: Income,
  opts: { autoPrint?: boolean } = {}
): string {
  const receiptNumber = getFabricReceiptNumber(item)
  const lines = buildReceiptLines(item)
  const vatIncluded = (Number(item.amount || 0) * 15) / 115
  const customerName = item.buyer_name?.trim() || 'عميل'
  const paymentLabel = item.payment_method === 'network' ? 'شبكة' : 'كاش'
  const rows = lines.map((line) => `
    <tr>
      <td class="description">${escapeHtml(line.name)}</td>
      <td class="price">${formatMoney(line.unitPrice)}</td>
      <td class="quantity">${formatMoney(line.quantity)}</td>
      <td class="line-total">${formatMoney(line.total)}</td>
    </tr>`).join('')

  const autoPrintScript = opts.autoPrint
    ? `<script>
      window.onload = function () {
        setTimeout(function () {
          window.print();
          window.close();
        }, 300);
      };
    </script>`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة ${escapeHtml(receiptNumber)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html { width: 100%; margin: 0; padding: 0; background: #fff; }
  body {
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
  .invoice-code { margin: 0; direction: ltr; font-size: 18px; font-weight: 900; letter-spacing: 0.1px; }
  .date { margin: 2mm 0 4mm; direction: ltr; font-size: 17px; font-weight: 900; }
  .meta { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; margin: 0 0 3mm; font-size: 11.5px; }
  .meta span { min-width: 0; overflow-wrap: anywhere; }
  .meta .payment { white-space: nowrap; text-align: left; }
  .rule { border: 0; border-top: 0.45mm solid #000; margin: 1.6mm 0 0; }
  .dash { border: 0; border-top: 0.4mm dashed #000; margin: 0; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items th, .items td { padding: 1.4mm 0.2mm; vertical-align: middle; overflow: hidden; }
  .items th { font-size: 10px; font-weight: 700; border-bottom: 0.35mm solid #000; white-space: nowrap; }
  .items td { font-size: 10.5px; }
  .items .description { width: 37%; text-align: right; }
  .items .price { width: 22%; text-align: center; direction: ltr; }
  .items .quantity { width: 17%; text-align: center; direction: ltr; }
  .items .line-total { width: 24%; text-align: left; direction: ltr; }
  .summary-row { display: grid; grid-template-columns: minmax(0, 1fr) 20mm; gap: 1.5mm; align-items: baseline; padding: 1.2mm 0.4mm; }
  .summary-row .label { min-width: 0; text-align: right; font-size: 12.5px; overflow-wrap: anywhere; }
  .summary-row .value { min-width: 0; text-align: left; direction: ltr; font-size: 12.5px; white-space: nowrap; }
  .summary-row.total .label, .summary-row.total .value { font-size: 15px; font-weight: 900; }
  .currency { display: inline-block; direction: rtl; font-size: 11px; margin-inline-start: 1mm; }
  .notes { min-height: 18mm; padding: 4mm 0.6mm 0; font-size: 14px; font-weight: 900; }
  .feed { height: 15mm; }
</style>
</head>
<body>
  <header class="center">
    <p class="brand">${SHOP_NAME}</p>
    <p class="legal-name">${LEGAL_NAME}</p>
    <p class="address">${SHOP_ADDRESS}</p>
    <h1 class="title">فاتورة ضريبية مبسطة</h1>
    <p class="invoice-code">${escapeHtml(receiptNumber)}</p>
    <p class="date">${formatDate(item.date)}</p>
  </header>

  <div class="meta">
    <span>العميل: ${escapeHtml(customerName)}</span>
    <span class="payment">طريقة الدفع: ${paymentLabel}</span>
  </div>

  <hr class="rule">
  <table class="items" aria-label="بنود فاتورة الأقمشة">
    <thead>
      <tr>
        <th class="description">الصنف</th>
        <th class="price">سعر المتر</th>
        <th class="quantity">الكمية/م</th>
        <th class="line-total">المجموع</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <hr class="rule" style="margin-top: 0">

  <div class="summary-row">
    <span class="label">المجموع</span>
    <span class="value">${formatMoney(item.amount)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row">
    <span class="label">القيمة المضافة 15% (شاملة)</span>
    <span class="value">${formatMoney(vatIncluded)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">الإجمالي <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(item.amount)}</span>
  </div>
  <hr class="dash">
  <div class="summary-row total">
    <span class="label">المستحق <span class="currency">(ر.س)</span></span>
    <span class="value">${formatMoney(item.amount)}</span>
  </div>
  <hr class="dash">

  <section class="notes">ملاحظات</section>
  <div class="feed"></div>
  ${autoPrintScript}
</body>
</html>`
}

export function printFabricSaleReceipt(item: Income): void {
  const html = buildFabricSaleReceiptHtml(item, { autoPrint: true })
  const printWindow = window.open('', '_blank', 'width=400,height=600')

  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة')
    return
  }

  printWindow.document.write(html)
  printWindow.document.close()
}
