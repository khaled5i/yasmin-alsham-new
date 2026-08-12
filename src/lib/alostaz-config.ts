/**
 * إعدادات الربط مع تطبيق الأستاذ للمحاسبة (alostaz.io)
 * ─────────────────────────────────────────────────────────────
 * ثوابت مكتشفة ومؤكَّدة عملياً من حساب ياسمين الشام على الأستاذ.
 *
 * ⚠️ التوكن السرّي لا يوضع هنا إطلاقاً — يُقرأ من متغيّر البيئة
 *    ALOSTAZ_API_TOKEN داخل مسار الـ API الخادمي فقط (لا يصل للمتصفح).
 *
 * فواتير التفصيل تُسجَّل على «ياسمين الشام للخياطة»، وفواتير الأقمشة على
 * «بروكار الشرقية». يبقى فصل الأقسام داخل الموقع وقاعدة بياناته كما هو.
 */

/** رابط قاعدة الـ API (غير سرّي). يمكن تجاوزه عبر متغيّر بيئة. */
export const ALOSTAZ_BASE_URL =
  process.env.ALOSTAZ_BASE_URL || 'https://yasminalsham.alostaz.io/b/api'

// ── معرّفات ثابتة من الحساب ───────────────────────────────────
/** فرع «ياسمين الشام للخياطة» الخاص بفواتير التفصيل. */
export const ALOSTAZ_BRANCH_ID = 1
/** فرع «بروكار الشرقية» الخاص بفواتير الأقمشة. */
export const ALOSTAZ_FABRICS_BRANCH_ID = 3
/** قائمة الشركاء الافتراضية (يُنشأ العملاء داخلها) — مطلوب رغم عدم توثيقه */
export const ALOSTAZ_PARTNER_LIST_ID = 1
/** المستودع الرئيسي (مطلوب في بنود الفاتورة) */
export const ALOSTAZ_STOREHOUSE_ID = 1
/** منتج الخدمة الثابت «أجرة تفصيل فستان» */
export const ALOSTAZ_SERVICE_PRODUCT_ID = 2
/** منتج الخدمة «أجرة مقاس» في فرع ياسمين الشام الأول (تم التحقق منه عملياً). */
export const ALOSTAZ_MEASUREMENT_PRODUCT_ID =
  Number(process.env.ALOSTAZ_MEASUREMENT_PRODUCT_ID) || 22
/** أجرة مقاس ياسمين الشام، شاملة ضريبة القيمة المضافة. */
export const ALOSTAZ_MEASUREMENT_FEE_SAR = 85
export const ALOSTAZ_MEASUREMENT_PRODUCT_NAME = 'أجرة مقاس'

/**
 * ضريبة القيمة المضافة 15% «الشاملة» (inclusive) — id 2 في الحساب.
 * السعر الكامل يُعامَل على أنه شامل للضريبة، فيُستخرج جزء الضريبة من داخله
 * (لا يُضاف فوقه). لجعل الفاتورة بدون ضريبة، اجعل القيمة null.
 */
export const ALOSTAZ_VAT_TAX_ID: number | null = 2

// ── الترويسات ────────────────────────────────────────────────
export const ALOSTAZ_API_VERSION = '1'
export const ALOSTAZ_LOCALE = 'ar'

/**
 * فواتير التفصيل تُنشأ كفواتير نهائية حقيقية.
 * لا نسمح لمتغيّر بيئة قديم بإعادة الموقع المنشور إلى وضع المسودة بالخطأ.
 */
export const ALOSTAZ_INVOICE_STATUS: 'issued' | 'draft' = 'issued'

/** فواتير الأقمشة تُنشأ كذلك كفواتير نهائية حقيقية. */
export const ALOSTAZ_FABRICS_INVOICE_STATUS: 'issued' | 'draft' = 'issued'

/**
 * ضريبة فواتير الأقمشة — الضرائب عادةً على مستوى الشركة، فالافتراضي نفس ضريبة
 * التفصيل الشاملة (id 2). null → بدون ضريبة. يمكن تجاوزها بـ ALOSTAZ_FABRICS_VAT_TAX_ID.
 */
export const ALOSTAZ_FABRICS_VAT_TAX_ID: number | null =
  process.env.ALOSTAZ_FABRICS_VAT_TAX_ID != null && process.env.ALOSTAZ_FABRICS_VAT_TAX_ID !== ''
    ? Number(process.env.ALOSTAZ_FABRICS_VAT_TAX_ID) || null
    : ALOSTAZ_VAT_TAX_ID

// ── الخزائن (لتوجيه الدفعة حسب طريقة الدفع) ──────────────────
/** الخزنة الرئيسية (نقد) */
export const ALOSTAZ_TREASURY_CASH = 1
/** الحساب البنكي (شبكة/تحويل) */
export const ALOSTAZ_TREASURY_BANK = 2

/**
 * ⚠️ مقياس المبالغ: الأستاذ يخزّن المبالغ بالهللات (integer)،
 * أي أن 1.00 ريال = 100. لذلك نضرب كل مبلغ بالريال ×100 قبل الإرسال.
 */
export const ALOSTAZ_PRICE_SCALE = 100

/**
 * ⚠️ مقياس الكمية: حقل unit_quantity في الأستاذ يُقاس ×1000 (٣ منازل عشرية)،
 * أي أن الكمية 1 تُرسَل كـ 1000 لتظهر 1.000. إرسال 1 يظهر خطأً كـ 0.001.
 */
export const ALOSTAZ_QUANTITY_SCALE = 1000

/** تحويل مبلغ بالريال إلى هللات (عدد صحيح) كما يتوقّعه الأستاذ. */
export function toHalalas(sar: number | null | undefined): number {
  return Math.round((Number(sar) || 0) * ALOSTAZ_PRICE_SCALE)
}

export interface AlostazExactLinePricing {
  /** الكمية بمقياس الأستاذ (×1000). */
  unitQuantity: number
  /** سعر الوحدة بالهللات. */
  unitPrice: number
  /** خصم فرق التقريب بالهللات، ويُحذف من الطلب عندما يكون صفراً. */
  roundingDiscount: number
  /** إجمالي البند المطلوب بالهللات بعد الخصم. */
  targetAmount: number
}

/**
 * يبني سعراً صحيحاً يقبله الأستاذ مع المحافظة على إجمالي البند الأصلي.
 *
 * الأستاذ يقبل سعر الوحدة بالهللات كعدد صحيح، لذلك قد يختلف ناتج
 * (الكمية × السعر المقرّب) عن إجمالي الموقع ببضع هللات. نقرّب سعر الوحدة
 * للأعلى ثم نعيد الفرق كخصم ثابت على البند، فتظل كمية المخزون حقيقية
 * ويصبح صافي البند مطابقاً تماماً للمبلغ المطلوب.
 */
export function toExactAlostazLinePricing(
  amountSar: number | null | undefined,
  quantity: number | null | undefined
): AlostazExactLinePricing {
  const normalizedQuantity = Number(quantity) > 0 ? Number(quantity) : 1
  const unitQuantity = Math.max(1, Math.round(normalizedQuantity * ALOSTAZ_QUANTITY_SCALE))
  const targetAmount = Math.max(0, toHalalas(amountSar))

  if (targetAmount === 0) {
    return {
      unitQuantity,
      unitPrice: 0,
      roundingDiscount: 0,
      targetAmount,
    }
  }

  // التقريب للأعلى يضمن ألا يصبح إجمالي الأستاذ أقل من إجمالي الموقع؛
  // أي زيادة صحيحة بالهللات تُزال عبر discount_amount على البند.
  const unitPrice = Math.ceil(
    (targetAmount * ALOSTAZ_QUANTITY_SCALE) / unitQuantity
  )
  const calculatedAmount = Math.round(
    (unitQuantity * unitPrice) / ALOSTAZ_QUANTITY_SCALE
  )

  return {
    unitQuantity,
    unitPrice,
    roundingDiscount: Math.max(0, calculatedAmount - targetAmount),
    targetAmount,
  }
}

/**
 * تطبيع رقم الهاتف للمقارنة (لإيجاد العميل بدون تكرار):
 * يُبقي الأرقام فقط، ويزيل مقدّمة الدولة 966 والصفر البادئ،
 * فيصبح "+966538446041" و"0538446041" متطابقين.
 */
export function normalizePhone(phone: string | null | undefined): string {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('966')) digits = digits.slice(3)
  digits = digits.replace(/^0+/, '')
  return digits
}
