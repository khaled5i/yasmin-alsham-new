import QRCode from 'qrcode'

/**
 * ثوابت الفاتورة الضريبية المبسطة المشتركة بين الأقمشة والتفصيل والمشغل النسائي.
 *
 * الرقم الضريبي واحد للمؤسسة في فروع الأستاذ الثلاثة، وهو نفسه المضمَّن في رمز
 * QR الذي يوقّعه الأستاذ (تحقّقنا منه بفك الرمز).
 *
 * قاعدة أساسية: رمز QR يُؤخذ حرفياً من فاتورة الأستاذ (zatca_invoice_entry.qr_code)
 * ولا يُولَّد هنا أبداً. الورقة غير المرتبطة بفاتورة في الأستاذ (الكاش) تُطبع
 * «إيصال استلام» بلا رمز وبلا عبارة «فاتورة ضريبية».
 */
export const SELLER_VAT_NUMBER = '310937466300003'

export const TAX_INVOICE_TITLE = 'فاتورة ضريبية مبسطة'
export const CASH_RECEIPT_TITLE = 'إيصال استلام'

/** بيانات فاتورة الأستاذ اللازمة لطباعة نسختها: الرقم والإجماليات ورمز QR. */
export interface AlostazPrintableInvoice {
  invoice_code: string
  /** نص الرمز كما أرجعه الأستاذ (Base64 TLV موقّع). */
  qr: string
  /** الإجمالي شاملاً الضريبة بالريال. */
  total: number
  /** الإجمالي قبل الضريبة بالريال. */
  total_without_vat: number
  /** مبلغ الضريبة بالريال. */
  vat: number
  issue_date: string | null
}

/**
 * يرسم رمز QR كـ SVG متزامن (يُستعمل داخل HTML الإيصال الذي يُبنى بشكل متزامن).
 * لا يغيّر المحتوى: النص يُرمَّز كما هو، بتصحيح أخطاء M كما توصي الهيئة.
 */
export function buildQrSvg(text: string, sizeMm = 32): string {
  const value = String(text || '').trim()
  if (!value) return ''

  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const quiet = 2
  const total = size + quiet * 2
  let path = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) {
        path += `M${col + quiet} ${row + quiet}h1v1h-1z`
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" role="img" aria-label="رمز الفاتورة الإلكترونية"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}

export function roundMoney(value: number): number {
  return Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
}

/** فصل الضريبة الشاملة 15% من إجمالي — للإيصالات التي لا تملك فاتورة في الأستاذ. */
export function splitInclusiveVat(total: number): { total: number; beforeVat: number; vat: number } {
  const safeTotal = roundMoney(Math.max(0, Number(total) || 0))
  const beforeVat = roundMoney(safeTotal / 1.15)
  return { total: safeTotal, beforeVat, vat: roundMoney(safeTotal - beforeVat) }
}
