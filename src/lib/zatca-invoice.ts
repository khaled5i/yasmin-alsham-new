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

// رأس الطابعة الحرارية 203dpi = 8 نقاط لكل ملّيمتر. حجم المربع يجب أن يكون عدداً
// صحيحاً من النقاط، وإلا رسمت الطابعة بعض المربعات بنقطتين وبعضها بثلاث فيتشوّه الرمز.
// رمز الأستاذ (المرحلة الثانية، ~516 حرفاً) بتصحيح L شبكة 77×77. بخمس نقاط للمربع ظلّ
// تسرّب الحرارة يسدّ الفراغات على الورق، فنرسمه بأكبر ما يتّسع مع هامشه: 6 نقاط.
const QR_MODULE_MM = 0.75 // 6 نقاط
const QR_MODULE_MM_COMPACT = 0.625 // 5 نقاط — فقط إن لم يتّسع الرمز في عرض الورقة
const QR_MAX_WIDTH_MM = 64 // الطباعة الفعلية 72mm
// الهامش الأبيض الذي يشترطه معيار QR حول الرمز (4 مربعات)
const QR_QUIET_MODULES = 4

/**
 * يرسم رمز QR كـ SVG متزامن (يُستعمل داخل HTML الإيصال الذي يُبنى بشكل متزامن).
 * لا يغيّر المحتوى: النص يُرمَّز كما هو، بتصحيح أخطاء L كما يرسمه الأستاذ نفسه في فواتيره.
 * يُحسب العرض من عدد المربعات حتى يساوي كل مربع عدداً صحيحاً من نقاط الطابعة.
 */
export function buildQrSvg(text: string): string {
  const value = String(text || '').trim()
  if (!value) return ''

  const qr = QRCode.create(value, { errorCorrectionLevel: 'L' })
  const size = qr.modules.size
  const quiet = QR_QUIET_MODULES
  const total = size + quiet * 2
  const moduleMm = total * QR_MODULE_MM <= QR_MAX_WIDTH_MM ? QR_MODULE_MM : QR_MODULE_MM_COMPACT
  const sizeMm = total * moduleMm
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
