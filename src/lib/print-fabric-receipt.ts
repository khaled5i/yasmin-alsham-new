import type { Income } from '@/types/simple-accounting'

// طباعة فاتورة بيع قماش على طابعة حرارية (مثل CityPOS، ورق 80mm)
// النافذة المنبثقة + window.print() تعمل على أي طابعة مُركّبة كطابعة نظام على الجهاز

const SHOP_NAME = 'بروكار الشرقية'
const SHOP_PHONE = '0539686805'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('ar-SA-u-nu-latn').format(n) + ' ر.س'
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function row(label: string, value: string, ltr = false): string {
  return `<div class="row"><span class="label">${label}</span><span class="value"${ltr ? ' dir="ltr"' : ''}>${value}</span></div>`
}

// رقم الفاتورة التسلسلي (migration 62) — يعود لجزء من المعرّف إذا لم تُطبَّق الهجرة بعد
function invoiceNumberLabel(item: Income): string {
  if (item.invoice_number != null) {
    return `#${item.invoice_number}`
  }
  return `#${item.id.slice(0, 8)}`
}

// يبني مستند HTML كامل للإيصال (بدون سكربت طباعة تلقائي افتراضياً).
// - المسار المباشر (زر الطباعة على الكاشير): autoPrint=true → يطبع ويغلق النافذة.
// - محطة الطباعة عن بُعد: autoPrint=false → المحطة ترسمه في iframe وتستدعي print() بنفسها.
export function buildFabricSaleReceiptHtml(item: Income, opts: { autoPrint?: boolean } = {}): string {
  // بنود القماش: قد تكون عدّة أقمشة في مبيعة واحدة (fabric_items)
  const fabricItems = Array.isArray(item.fabric_items)
    ? item.fabric_items.filter((f) => f && f.name)
    : []

  const rows: string[] = []

  // (الملاحظات لا تُطبع في الإيصال عمداً — بطلب المستخدم)
  if (fabricItems.length > 1) {
    // عدّة أقمشة: بند مستقل لكل قماش (الاسم مقابل كميته بالمتر) + إجمالي الأمتار
    for (const f of fabricItems) {
      const qtyLabel = f.quantity_meters != null ? `${f.quantity_meters} م` : ''
      rows.push(row(escapeHtml(f.name), qtyLabel))
    }
    const totalMeters = fabricItems.reduce((s, f) => s + (Number(f.quantity_meters) || 0), 0)
    if (totalMeters > 0) {
      rows.push(row('إجمالي الأمتار', `${totalMeters} م`))
    }
  } else {
    // قماش واحد (من fabric_items[0] إن وُجد، وإلا الحقول القديمة)
    const only = fabricItems[0]
    const fabricName =
      only?.name ||
      (item.customer_name && item.customer_name !== '-' ? item.customer_name : item.description || 'قماش')
    const qty = only?.quantity_meters ?? item.quantity_meters ?? null
    const pricePerMeter = qty && qty > 0 ? item.amount / qty : null
    rows.push(row('القماش', escapeHtml(fabricName)))
    if (qty) {
      rows.push(row('الكمية', `${qty} م`))
    }
    if (pricePerMeter !== null) {
      rows.push(row('سعر المتر', formatCurrency(pricePerMeter)))
    }
  }

  if (item.payment_method) {
    rows.push(row('طريقة الدفع', item.payment_method === 'cash' ? 'كاش' : 'شبكة'))
  }
  if (item.buyer_phone) {
    rows.push(row('رقم الهاتف', escapeHtml(item.buyer_phone), true))
  }

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

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة بيع قماش</title>
<style>
  * { box-sizing: border-box; }
  /* طول الصفحة = طول المحتوى (auto): يطبع الإيصال بطوله الطبيعي فقط بلا هدر ورق.
     القص يتم من السكينة الأوتوماتيكية للطابعة (يُفعَّل من تعريف الطابعة: Cut per page)
     وليس من CSS — المتصفح لا يرسل أمر القص. */
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0;
  }
  body {
    padding: 3mm 4mm;
    font-family: Tahoma, Arial, sans-serif;
    direction: rtl;
    color: #000;
    width: 72mm;
  }
  .center { text-align: center; }
  .shop-name { font-size: 18px; font-weight: bold; margin: 0 0 2px; }
  .shop-sub { font-size: 12px; margin: 0 0 6px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 2px 0; }
  .value { font-weight: bold; }
  .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; padding: 6px 0; }
  .bottom-block { padding-top: 8px; }
  .footer { text-align: center; font-size: 11px; }
  /* تغذية فارغة أسفل الإيصال: تضمن مرور آخر سطر إلى ما بعد رأس الطباعة قبل القص
     حتى لا تقص السكينة على الكلام (المسافة من الرأس إلى السكينة ~1.5سم) */
  .feed { height: 16mm; }
</style>
</head>
<body>
  <div class="center">
    <p class="shop-name">${SHOP_NAME}</p>
    <p class="shop-sub">فاتورة بيع قماش</p>
  </div>
  <div class="divider"></div>
  ${row('التاريخ', formatDate(item.date))}
  ${row('رقم الفاتورة', invoiceNumberLabel(item))}
  <div class="divider"></div>
  ${rows.join('')}
  <div class="divider"></div>
  <div class="total-row">
    <span>الإجمالي</span>
    <span>${formatCurrency(item.amount)}</span>
  </div>
  <div class="divider"></div>
  <div class="bottom-block">
    <div class="footer">
      <p>شكراً لتعاملكم معنا</p>
      <p dir="ltr">${SHOP_PHONE}</p>
    </div>
  </div>
  <div class="feed"></div>
  ${autoPrintScript}
</body>
</html>
`
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
