export const FABRIC_INVENTORY_LABEL_JOB_TYPE = 'fabric_inventory_label'

export type FabricLabelSize = '70x50' | '60x40'

export interface FabricInventoryLabelPayload {
  version: 1
  inventory_item_id: string
  inventory_color_id: string | null
  product_code: string
  sale_price_per_unit: number
  price_unit?: 'meter' | 'piece'
  unit: 'meter' | 'piece'
  color_name: string
  available_quantity: number
  queued_at: string
}

export const FABRIC_LABEL_SIZES: ReadonlyArray<{
  id: FabricLabelSize
  label: string
  widthMm: number
  heightMm: number
}> = [
  { id: '70x50', label: '70 × 50 مم', widthMm: 70, heightMm: 50 },
  { id: '60x40', label: '60 × 40 مم', widthMm: 60, heightMm: 40 },
]

export function isFabricLabelSize(value: unknown): value is FabricLabelSize {
  return FABRIC_LABEL_SIZES.some((size) => size.id === value)
}

export function isFabricInventoryLabelPayload(
  value: unknown
): value is FabricInventoryLabelPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<FabricInventoryLabelPayload>
  return (
    payload.version === 1 &&
    typeof payload.inventory_item_id === 'string' &&
    typeof payload.product_code === 'string' &&
    typeof payload.sale_price_per_unit === 'number' &&
    (payload.price_unit == null || payload.price_unit === 'meter' || payload.price_unit === 'piece') &&
    (payload.unit === 'meter' || payload.unit === 'piece') &&
    typeof payload.color_name === 'string' &&
    typeof payload.available_quantity === 'number'
  )
}

export function getFabricLabelSize(size: FabricLabelSize) {
  return FABRIC_LABEL_SIZES.find((candidate) => candidate.id === size) ?? FABRIC_LABEL_SIZES[0]
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(Number(value) || 0)
}

export function formatFabricInventoryLabelCode(
  productCode: string,
  salePricePerUnit: number,
  priceUnit: 'meter' | 'piece'
): string {
  const insertionIndex = Math.min(2, productCode.length)
  const priceCode = formatNumber(salePricePerUnit)
  const unitCode = priceUnit === 'meter' ? 'm' : 'p'

  return `${productCode.slice(0, insertionIndex)}${priceCode}${unitCode}${productCode.slice(insertionIndex)}`
}

export function buildFabricInventoryLabelHtml(
  payload: FabricInventoryLabelPayload,
  options: { size?: FabricLabelSize } = {}
): string {
  const size = getFabricLabelSize(options.size ?? '70x50')
  const compact = size.id === '60x40'
  const unitLabel = payload.unit === 'meter' ? 'متر' : 'قطعة'
  const printedProductCode = formatFabricInventoryLabelCode(
    payload.product_code,
    payload.sale_price_per_unit,
    payload.price_unit ?? payload.unit
  )

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>ملصق ${escapeHtml(printedProductCode)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
  html, body {
    width: ${size.widthMm}mm;
    height: ${size.heightMm}mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
    color: #000;
    background: #fff;
  }
  body {
    direction: rtl;
    font-family: Tahoma, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label-card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: ${compact ? '1.7mm' : '2.2mm'};
    border: 0.45mm solid #000;
  }
  .brand {
    margin: 0;
    text-align: center;
    font-size: ${compact ? '4.1mm' : '4.8mm'};
    font-weight: 900;
    line-height: 1.05;
  }
  .subtitle {
    margin: ${compact ? '0.35mm' : '0.6mm'} 0 0;
    text-align: center;
    font-size: ${compact ? '2.1mm' : '2.5mm'};
    font-weight: 700;
    letter-spacing: 0.15mm;
  }
  .rule {
    width: 100%;
    margin: ${compact ? '1mm' : '1.4mm'} 0;
    border: 0;
    border-top: 0.45mm solid #000;
  }
  .primary {
    width: 100%;
  }
  .field {
    min-width: 0;
  }
  .field-label {
    display: block;
    margin-bottom: ${compact ? '0.3mm' : '0.45mm'};
    font-size: ${compact ? '2.2mm' : '2.55mm'};
    font-weight: 700;
    line-height: 1;
  }
  .product-code {
    display: flex;
    min-height: ${compact ? '9mm' : '11.5mm'};
    align-items: center;
    justify-content: center;
    border: 0.4mm solid #000;
    font-weight: 900;
    line-height: 1;
  }
  .product-code {
    direction: ltr;
    unicode-bidi: isolate;
    padding: 0.8mm;
    font-family: Consolas, "Courier New", monospace;
    font-size: ${compact ? '4.8mm' : '5.9mm'};
    letter-spacing: 0.1mm;
    overflow-wrap: anywhere;
  }
  .details {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: ${compact ? '1mm' : '1.5mm'};
    margin-top: ${compact ? '1.1mm' : '1.6mm'};
  }
  .detail-box {
    min-width: 0;
    padding: ${compact ? '0.7mm 1mm' : '1mm 1.2mm'};
    border: 0.3mm solid #000;
  }
  .detail-box .field-label {
    margin: 0 0 ${compact ? '0.25mm' : '0.4mm'};
  }
  .detail-value {
    display: block;
    min-width: 0;
    overflow: hidden;
    font-size: ${compact ? '3.1mm' : '3.8mm'};
    font-weight: 900;
    line-height: 1.12;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .quantity {
    direction: rtl;
    unicode-bidi: isolate;
  }
  .footer {
    margin-top: auto;
    padding-top: ${compact ? '0.55mm' : '0.8mm'};
    text-align: center;
    font-size: ${compact ? '1.7mm' : '2mm'};
    font-weight: 700;
  }
</style>
</head>
<body>
  <main class="label-card" aria-label="ملصق قماش ${escapeHtml(printedProductCode)}">
    <header>
      <h1 class="brand">ياسمين الشام للأقمشة</h1>
      <p class="subtitle">بطاقة تعريف القماش</p>
    </header>

    <hr class="rule">

    <section class="primary">
      <div class="field">
        <span class="field-label">رقم المنتج</span>
        <strong class="product-code">${escapeHtml(printedProductCode)}</strong>
      </div>
    </section>

    <section class="details">
      <div class="detail-box">
        <span class="field-label">اللون</span>
        <strong class="detail-value">${escapeHtml(payload.color_name)}</strong>
      </div>
      <div class="detail-box">
        <span class="field-label">الكمية المتوفرة</span>
        <strong class="detail-value quantity"><span dir="ltr">${formatNumber(payload.available_quantity)}</span> ${unitLabel}</strong>
      </div>
    </section>

    <p class="footer">وضوح في الاختيار · جودة في التفاصيل</p>
  </main>
</body>
</html>`
}
