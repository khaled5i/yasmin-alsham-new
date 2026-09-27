/**
 * عقد تسعير متجر الأقمشة الإلكتروني — بالهللة والسنتيمتر.
 *
 * المرجع الوحيد لحساب ما تدفعه الزبونة: تستعمله السلة للعرض (عبر
 * `fabric-commerce.ts`)، ويستعمله الخادم لاحقاً في عرض السعر وإنشاء الطلب
 * للاعتماد. وحدة نقية بلا 'use client'، فتُستورد من مسارات API أيضاً.
 *
 * قواعد البيع (معتمدة من المالك 19 سبتمبر 2026 — خطة السلة):
 * - طريقة البيع مشتقة من المخزون: 3 أو 3.5 متر بالضبط ⇒ «قطعة كاملة»، وإلا بالمتر.
 * - البيع بالمتر: حد أدنى `min_order_meters` (أو 1 متر) وخطوة 0.5 متر.
 * - الأسعار المخزّنة غير شاملة الضريبة؛ الضريبة 15% تُضاف فوقها.
 * - `price_per_meter = null` «السعر عند الطلب»، والصفر لا يُشترى.
 *
 * قواعد التقريب (المرحلة 1 من خطة الدفع — 21 سبتمبر 2026). نصف للأعلى دائماً:
 * 1. سعر المتر المخزّن (ريال بخانتين) ⇒ هللة بالضبط.
 * 2. الخصم الفعّال يُطبَّق مرة واحدة ثم يُقرَّب سعر الوحدة:
 *    - بالمتر: سعر المتر بعد الخصم ⇒ أقرب هللة.
 *    - بالقطعة: سعر المتر بعد الخصم × أمتار القطعة ⇒ أقرب هللة (تقريب واحد في النهاية).
 * 3. إجمالي السطر = سعر الوحدة × الكمية ⇒ أقرب هللة (القطعة عدد صحيح أصلاً).
 * 4. الضريبة على مجموع الطلب (البنود + الشحن) لا على كل سطر، وتُقرَّب مرة واحدة.
 * 5. الإجمالي = المجموع + الضريبة. وتوزَّع الضريبة على الأسطر بالباقي الأكبر
 *    (`computeFabricOrderBreakdown`)، فمجموع الأسطر شاملةً الضريبة يساوي الإجمالي
 *    بالضبط (بنود فاتورة الأستاذ والاسترداد الجزئي تُبنى عليه).
 * هي نفسها قواعد السلة السابقة بالأرقام العشرية، لكن بأعداد صحيحة: فلا تنحرف عند
 * أنصاف الهللات، ولا يُعرض سعر قُرِّب إلى صفر كأنه قابل للشراء.
 */

import {
  getEffectiveFabricDiscountPercent,
  isWholeFabricPiece,
  type FabricDiscountFields,
  type FabricPricingUnit,
} from '../fabric-display-pricing'
import {
  allocateByWeights,
  divideRoundHalfUp,
  metersToCentimeters,
  metersToCentimetersStrict,
  multiplyExact,
  toScaledInteger,
} from './money'

// ============================================
// الثوابت
// ============================================

/** ضريبة القيمة المضافة بأجزاء العشرة آلاف: 1500 = 15.00%. */
export const FABRIC_VAT_BASIS_POINTS = 1500
const BASIS_POINTS_SCALE = 10_000

/** خطوة الكمية للبيع بالمتر (50 سم = نصف متر). */
export const FABRIC_METER_STEP_CM = 50

/** الحد الأدنى للبيع بالمتر حين لا يحدد الصنف حداً أدنى خاصاً به (متر واحد). */
export const FABRIC_METER_MIN_FALLBACK_CM = 100

/** سقف أمان لكمية السطر الواحد، فوق قيد المخزون (100 متر). */
export const FABRIC_MAX_CM_PER_LINE = 10_000

/**
 * حد أمان تقني لسعر المتر: مليون ريال. ما فوقه خطأ إدخال لا سعر حقيقي، فيُعامل
 * كـ«السعر عند الطلب». بدونه قد يتجاوز الضرب الصحيح نطاقه الآمن فيرمي خطأً
 * يُسقط صفحة السلة لكل من في سلته ذلك القماش.
 */
export const FABRIC_MAX_PRICE_PER_METER_HALALAS = 100_000_000

export type FabricPurchaseMode = FabricPricingUnit

// ============================================
// الحقول المطلوبة من صف `fabrics`
// ============================================

export interface FabricPricingSource extends FabricDiscountFields {
  stock_quantity: number | null | undefined
  min_order_meters?: number | null
}

export interface FabricVisibilityFields {
  deleted_at?: string | null
  is_active?: boolean | null
  is_available?: boolean | null
  is_manually_hidden?: boolean | null
}

export type FabricSaleSource = FabricPricingSource & FabricVisibilityFields

// ============================================
// قواعد البيع
// ============================================

/** هل القماش معروض للبيع في واجهة المتجر؟ */
export function isFabricPubliclyVisible(fabric: FabricVisibilityFields): boolean {
  return (
    fabric.deleted_at == null &&
    fabric.is_active !== false &&
    fabric.is_available !== false &&
    fabric.is_manually_hidden !== true
  )
}

/**
 * طريقة البيع مشتقة من المخزون الحيّ، لا من قيمة محفوظة.
 * لذلك يجب إعادة اشتقاقها في كل مرة تُفتح فيها السلة، والتنبيه إذا تغيّرت.
 */
export function getFabricPurchaseMode(
  fabric: Pick<FabricPricingSource, 'stock_quantity'>
): FabricPurchaseMode {
  return isWholeFabricPiece(fabric.stock_quantity) ? 'piece' : 'meter'
}

/** المخزون الفعلي بالسنتيمتر (السالب أو غير الصالح = صفر). */
export function getFabricStockCentimeters(
  fabric: Pick<FabricPricingSource, 'stock_quantity'>
): number {
  const centimeters = metersToCentimeters(fabric.stock_quantity)
  return centimeters != null && centimeters > 0 ? centimeters : 0
}

/**
 * سعر الوحدة الواحدة بالهللة، بعد الخصم وقبل الضريبة:
 * سعر المتر للبيع بالمتر، وسعر القطعة كاملةً للبيع بالقطعة (3.5 × 100 = 350 ريال).
 * `null` = لا يُشترى تلقائياً (السعر عند الطلب، أو صفر، أو خصم يلغي السعر).
 */
export function getFabricUnitPriceHalalas(fabric: FabricPricingSource): number | null {
  if (fabric.price_per_meter == null) return null
  const pricePerMeter = toScaledInteger(fabric.price_per_meter, 2)
  if (
    pricePerMeter == null ||
    pricePerMeter <= 0 ||
    pricePerMeter > FABRIC_MAX_PRICE_PER_METER_HALALAS
  ) {
    return null
  }

  // الخصم مقروء من القاعدة الوحيدة لتفعيله، بأجزاء المئة من النسبة (25% ⇒ 2500).
  const discount = toScaledInteger(getEffectiveFabricDiscountPercent(fabric), 2) ?? 0
  const keptShare = BASIS_POINTS_SCALE - discount
  if (keptShare <= 0) return null

  let unitPrice: number
  if (getFabricPurchaseMode(fabric) === 'piece') {
    const pieceCentimeters = getFabricStockCentimeters(fabric)
    if (pieceCentimeters <= 0) return null
    unitPrice = divideRoundHalfUp(
      multiplyExact(pricePerMeter, keptShare, pieceCentimeters),
      BASIS_POINTS_SCALE * 100
    )
  } else {
    unitPrice = divideRoundHalfUp(multiplyExact(pricePerMeter, keptShare), BASIS_POINTS_SCALE)
  }

  return unitPrice > 0 ? unitPrice : null
}

/** حدود البيع بالمتر بالسنتيمتر. `availableCm` يسمح بخصم المحجوز لاحقاً. */
export interface FabricMeterBounds {
  minCm: number
  maxCm: number
  stepCm: number
}

export function getFabricMeterBounds(
  fabric: FabricPricingSource,
  availableCm: number = getFabricStockCentimeters(fabric)
): FabricMeterBounds {
  const configuredMin = metersToCentimeters(fabric.min_order_meters) ?? 0
  const minCm = configuredMin > 0 ? configuredMin : FABRIC_METER_MIN_FALLBACK_CM
  const cappedAvailable = Math.min(Math.max(availableCm, 0), getFabricStockCentimeters(fabric))
  return {
    minCm,
    maxCm: Math.min(cappedAvailable, FABRIC_MAX_CM_PER_LINE),
    stepCm: FABRIC_METER_STEP_CM,
  }
}

// ============================================
// تسعير سطر طلب (للخادم: تحقق صارم بلا تعديل صامت)
// ============================================

export type FabricLineQuantity =
  | { unit: 'piece'; pieces: number; pieceLengthCm: number }
  | { unit: 'meter'; centimeters: number }

export interface PricedFabricLine {
  purchaseMode: FabricPurchaseMode
  /** سعر الوحدة بعد الخصم وقبل الضريبة: للمتر أو للقطعة كاملة. */
  unitPriceHalalas: number
  quantity: FabricLineQuantity
  /** ما يُخصم من المخزون بالسنتيمتر (القطعة = طولها كاملاً). */
  stockConsumptionCm: number
  /** إجمالي السطر قبل الضريبة. */
  netHalalas: number
}

export type FabricLineRejection =
  /** محذوف أو مخفي أو غير نشط. */
  | 'unavailable'
  /** لا مخزون فعلي. */
  | 'out-of-stock'
  /** السعر عند الطلب أو صفر. */
  | 'price-on-request'
  /** طريقة البيع تغيّرت منذ اختارت الزبونة الكمية (متر ⇄ قطعة). */
  | 'mode-changed'
  /** ليست رقماً صالحاً، أو بخانات عشرية أكثر من خانتين، أو فوق سقف السطر. */
  | 'invalid-quantity'
  /** أقل من الحد الأدنى للبيع بالمتر. */
  | 'below-minimum'
  /** ليست على خطوة نصف المتر من الحد الأدنى. */
  | 'off-step'
  /** أكبر من الكمية المتاحة (بعد خصم المحجوز حين يُمرَّر). */
  | 'exceeds-available'

export interface FabricLineRequest {
  purchaseMode: FabricPurchaseMode
  /** عدد القطع (بالقطعة) أو الأمتار (بالمتر) كما أرسلها المتصفح. */
  quantity: number
}

export type PriceFabricLineResult =
  | { ok: true; line: PricedFabricLine }
  | { ok: false; reason: FabricLineRejection; currentMode: FabricPurchaseMode }

/** إجمالي السطر قبل الضريبة بالهللة. */
export function computeFabricLineNetHalalas(
  unitPriceHalalas: number,
  quantity: FabricLineQuantity
): number {
  if (quantity.unit === 'piece') return multiplyExact(unitPriceHalalas, quantity.pieces)
  return divideRoundHalfUp(multiplyExact(unitPriceHalalas, quantity.centimeters), 100)
}

/**
 * يسعّر سطراً طلبته الزبونة ويتحقق منه تحققاً صارماً: لا يعدّل الكمية ولا
 * طريقة البيع بصمت، بل يرفض بسبب محدد يعرضه المتصفح لتعيد الاختيار.
 * ترتيب الفحوص يطابق `resolveCartLine` في السلة.
 */
export function priceFabricLine(
  fabric: FabricSaleSource,
  request: FabricLineRequest,
  options: { availableCm?: number } = {}
): PriceFabricLineResult {
  const currentMode = getFabricPurchaseMode(fabric)
  const reject = (reason: FabricLineRejection): PriceFabricLineResult => ({
    ok: false,
    reason,
    currentMode,
  })

  if (!isFabricPubliclyVisible(fabric)) return reject('unavailable')

  const stockCm = getFabricStockCentimeters(fabric)
  if (stockCm <= 0) return reject('out-of-stock')

  const unitPriceHalalas = getFabricUnitPriceHalalas(fabric)
  if (unitPriceHalalas == null) return reject('price-on-request')

  if (request.purchaseMode !== currentMode) return reject('mode-changed')

  // المتاح لا يتجاوز المخزون الفعلي مهما مُرِّر.
  const availableCm = Math.min(Math.max(options.availableCm ?? stockCm, 0), stockCm)

  let quantity: FabricLineQuantity
  let stockConsumptionCm: number

  if (currentMode === 'piece') {
    // القطعة الكاملة هي كامل المخزون المتبقي ⇒ قطعة واحدة فقط، بلا كسور.
    if (request.quantity !== 1) return reject('invalid-quantity')
    if (availableCm < stockCm) return reject('exceeds-available')
    quantity = { unit: 'piece', pieces: 1, pieceLengthCm: stockCm }
    stockConsumptionCm = stockCm
  } else {
    const bounds = getFabricMeterBounds(fabric, availableCm)
    // المخزون الفعلي لا يبلغ الحد الأدنى ⇒ نفاد، كما تعرضه السلة تماماً.
    if (stockCm < bounds.minCm) return reject('out-of-stock')

    const centimeters = metersToCentimetersStrict(request.quantity)
    if (centimeters == null || centimeters <= 0 || centimeters > FABRIC_MAX_CM_PER_LINE) {
      return reject('invalid-quantity')
    }
    if (centimeters < bounds.minCm) return reject('below-minimum')
    if ((centimeters - bounds.minCm) % bounds.stepCm !== 0) return reject('off-step')
    if (centimeters > bounds.maxCm) return reject('exceeds-available')
    quantity = { unit: 'meter', centimeters }
    stockConsumptionCm = centimeters
  }

  return {
    ok: true,
    line: {
      purchaseMode: currentMode,
      unitPriceHalalas,
      quantity,
      stockConsumptionCm,
      netHalalas: computeFabricLineNetHalalas(unitPriceHalalas, quantity),
    },
  }
}

// ============================================
// إجماليات الطلب
// ============================================

/**
 * سقف تقني لإجمالي الطلب الواحد: مليون ريال. فوق أي طلب أقمشة حقيقي بكثير،
 * ودونه يبقى توزيع الضريبة على الأسطر دقيقاً بالأعداد الصحيحة. سقف العمل
 * الفعلي (حدود ميسر للعملية) يُطبَّق في الخادم عند إنشاء الطلب (المرحلة 4).
 */
export const FABRIC_MAX_ORDER_TOTAL_HALALAS = 100_000_000

export interface FabricOrderTotals {
  /** مجموع الأسطر قبل الضريبة. */
  itemsNetHalalas: number
  /** رسوم الشحن قبل الضريبة (صفر للاستلام من المحل). */
  shippingNetHalalas: number
  /** وعاء الضريبة = البنود + الشحن. */
  taxableHalalas: number
  vatHalalas: number
  /** ما تدفعه الزبونة. */
  totalHalalas: number
}

/**
 * إجماليات الطلب من صافي الأسطر ورسوم الشحن (كلاهما قبل الضريبة).
 * تستعملها السلة للعرض والخادم للاعتماد، فلا يختلف الرقمان. لا ترمي لأي سلة
 * ممكنة (40 سطراً × 100 متر × أعلى سعر مقبول)، فلا تُسقط صفحة السلة.
 */
export function computeFabricOrderTotals(
  lineNetHalalas: readonly number[],
  options: { shippingNetHalalas?: number } = {}
): FabricOrderTotals {
  const shippingNetHalalas = options.shippingNetHalalas ?? 0
  for (const amount of [...lineNetHalalas, shippingNetHalalas]) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError('مبالغ الطلب يجب أن تكون هللات صحيحة غير سالبة')
    }
  }

  const itemsNetHalalas = lineNetHalalas.reduce((sum, amount) => sum + amount, 0)
  const taxableHalalas = itemsNetHalalas + shippingNetHalalas
  const vatHalalas = divideRoundHalfUp(
    multiplyExact(taxableHalalas, FABRIC_VAT_BASIS_POINTS),
    BASIS_POINTS_SCALE
  )

  return {
    itemsNetHalalas,
    shippingNetHalalas,
    taxableHalalas,
    vatHalalas,
    totalHalalas: taxableHalalas + vatHalalas,
  }
}

export interface FabricOrderBreakdown extends FabricOrderTotals {
  /** كل سطر شاملاً حصته من الضريبة، بنفس ترتيب المدخلات. */
  lineGrossHalalas: number[]
  /** الشحن شاملاً حصته من الضريبة. */
  shippingGrossHalalas: number
}

/**
 * الإجماليات + كل سطر شاملاً حصته من الضريبة، لبنود فاتورة الأستاذ والاسترداد
 * الجزئي. مجموع `lineGrossHalalas` + `shippingGrossHalalas` = `totalHalalas` دائماً.
 * للخادم فقط: ترمي لطلب فوق `FABRIC_MAX_ORDER_TOTAL_HALALAS` بدل نتيجة غير دقيقة.
 */
export function computeFabricOrderBreakdown(
  lineNetHalalas: readonly number[],
  options: { shippingNetHalalas?: number } = {}
): FabricOrderBreakdown {
  const totals = computeFabricOrderTotals(lineNetHalalas, options)
  if (totals.totalHalalas > FABRIC_MAX_ORDER_TOTAL_HALALAS) {
    throw new RangeError('إجمالي الطلب يتجاوز السقف التقني للطلب الواحد')
  }

  const vatShares = allocateByWeights(totals.vatHalalas, [
    ...lineNetHalalas,
    totals.shippingNetHalalas,
  ])
  const shippingVat = vatShares[vatShares.length - 1]

  return {
    ...totals,
    lineGrossHalalas: lineNetHalalas.map((amount, index) => amount + vatShares[index]),
    shippingGrossHalalas: totals.shippingNetHalalas + shippingVat,
  }
}
