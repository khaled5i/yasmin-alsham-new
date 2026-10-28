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
 *    سعر الوحدة هذا (قبل الضريبة) يُحفظ مع السطر كما هو، ولا يحدد ما يُدفع منذ 27 أكتوبر.
 *
 * سعر المتر بريال كامل شاملاً الضريبة (قرار المالكة 27 أكتوبر 2026):
 * 3. سعر المتر بعد الخصم بالهللة × 1.15 ⇒ أقرب ريال كامل (250 + 15% = 287.50 ⇒ 288).
 *    هو ما تراه الزبونة في كل المتجر وما تدفعه للمتر بالضبط.
 * 4. إجمالي السطر شاملاً الضريبة = سعر المتر الشامل × الأمتار (القطعة = طولها كاملاً)،
 *    بلا تقريب: الريال الكامل × سنتيمترات = هللات صحيحة دائماً.
 * 5. الإجمالي = مجموع الأسطر + الشحن الشامل، بلا تقريب. الضريبة تُستخرج منه مرة واحدة
 *    على مجموع الطلب: round(الإجمالي × 15 / 115)، والصافي = الإجمالي − الضريبة.
 * 6. حصص الضريبة: الشحن بسعره الشامل الثابت يأخذ حصته أولاً، ويُوزّع الباقي على الأقمشة
 *    بالباقي الأكبر (`computeFabricGrossOrderBreakdown`)؛ فمجموع الأسطر شاملةً الضريبة يساوي
 *    الإجمالي بالضبط (بنود فاتورة الأستاذ والاسترداد الجزئي تُبنى عليه).
 * القاعدة تقبل الطريقتين منذ هجرة `20261027120000`: طلبات ما قبلها حُسبت ضريبتها من الصافي.
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

/** سعر المتر المخزّن بالهللة وحصته الباقية بعد الخصم (بأجزاء العشرة آلاف)، أو null إن لم يُشترَ. */
function readFabricPriceFactors(
  fabric: FabricDiscountFields
): { pricePerMeter: number; keptShare: number } | null {
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
  return { pricePerMeter, keptShare }
}

/**
 * صافي سعر بالهللة ⇒ نفس السعر شاملاً الضريبة مقرّباً لأقرب ريال كامل (بالريال).
 * 25000 ⇒ 287.5 ⇒ 288. يستعمله العرض أيضاً (`getFabricStorefrontPricing`) فلا يختلف
 * المعروض عما يُدفع. يطابق في القاعدة: `(net * 11500 + 500000) / 1000000`.
 */
export function toFabricGrossWholeRiyals(netHalalas: number): number {
  return divideRoundHalfUp(
    multiplyExact(netHalalas, BASIS_POINTS_SCALE + FABRIC_VAT_BASIS_POINTS),
    BASIS_POINTS_SCALE * 100
  )
}

/**
 * سعر المتر بعد الخصم شاملاً الضريبة، بالهللة، مقرّباً لأقرب ريال كامل — ما تراه
 * الزبونة وما تدفعه للمتر، بالمتر وبالقطعة معاً (القطعة = هذا × أمتارها).
 * يبدأ من سعر المتر بعد الخصم بالهللة (نفس `getFabricUnitPriceHalalas` بالمتر).
 * `null` = لا يُشترى تلقائياً، ومنه سعر يُقرَّب إلى صفر ريال.
 */
export function getFabricGrossPricePerMeterHalalas(fabric: FabricDiscountFields): number | null {
  const factors = readFabricPriceFactors(fabric)
  if (!factors) return null
  const netPerMeter = divideRoundHalfUp(
    multiplyExact(factors.pricePerMeter, factors.keptShare),
    BASIS_POINTS_SCALE
  )
  const grossRiyals = toFabricGrossWholeRiyals(netPerMeter)
  return grossRiyals > 0 ? multiplyExact(grossRiyals, 100) : null
}

/**
 * سعر الوحدة الواحدة بالهللة، بعد الخصم وقبل الضريبة:
 * سعر المتر للبيع بالمتر، وسعر القطعة كاملةً للبيع بالقطعة (3.5 × 100 = 350 ريال).
 * `null` = لا يُشترى تلقائياً (السعر عند الطلب، أو صفر، أو خصم يلغي السعر).
 */
export function getFabricUnitPriceHalalas(fabric: FabricPricingSource): number | null {
  const factors = readFabricPriceFactors(fabric)
  if (!factors) return null
  const { pricePerMeter, keptShare } = factors

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
  /** سعر الوحدة بعد الخصم وقبل الضريبة: للمتر أو للقطعة كاملة. يُحفظ مع السطر للسجل. */
  unitPriceHalalas: number
  /** سعر المتر شاملاً الضريبة بريال كامل — منه يُحسب ما يُدفع. */
  grossPerMeterHalalas: number
  quantity: FabricLineQuantity
  /** ما يُخصم من المخزون بالسنتيمتر (القطعة = طولها كاملاً). */
  stockConsumptionCm: number
  /** إجمالي السطر شاملاً الضريبة. صافيه وحصته من الضريبة من `computeFabricGrossOrderBreakdown`. */
  grossHalalas: number
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

/**
 * إجمالي السطر شاملاً الضريبة بالهللة: سعر المتر الشامل × الأمتار. القطعة بطولها كاملاً
 * (قطعة 3.5م بـ288 للمتر = 1008). سعر المتر ريال كامل فالناتج هللات صحيحة بلا تقريب.
 */
export function computeFabricLineGrossHalalas(
  grossPerMeterHalalas: number,
  quantity: FabricLineQuantity
): number {
  const centimeters = quantity.unit === 'piece'
    ? multiplyExact(quantity.pieceLengthCm, quantity.pieces)
    : quantity.centimeters
  return divideRoundHalfUp(multiplyExact(grossPerMeterHalalas, centimeters), 100)
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
  const grossPerMeterHalalas = getFabricGrossPricePerMeterHalalas(fabric)
  if (unitPriceHalalas == null || grossPerMeterHalalas == null) return reject('price-on-request')

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
      grossPerMeterHalalas,
      quantity,
      stockConsumptionCm,
      grossHalalas: computeFabricLineGrossHalalas(grossPerMeterHalalas, quantity),
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
  /** مجموع الأسطر قبل الضريبة (= الإجمالي − الضريبة − صافي الشحن). */
  itemsNetHalalas: number
  /** رسوم الشحن قبل الضريبة (صفر للاستلام من المحل). */
  shippingNetHalalas: number
  /** وعاء الضريبة = البنود + الشحن قبل الضريبة. */
  taxableHalalas: number
  vatHalalas: number
  /** ما تدفعه الزبونة = مجموع الأسطر الشاملة + الشحن الشامل. */
  totalHalalas: number
}

export interface FabricShippingAmounts {
  /** صافي الشحن (4348 للخمسين ريالاً). */
  shippingNetHalalas?: number
  /** الشحن شاملاً الضريبة كما يُعرض ويُدفع (5000). يجب أن يساوي الصافي + ضريبته. */
  shippingGrossHalalas?: number
}

/**
 * إجماليات الطلب من أسطر شاملة الضريبة (`computeFabricLineGrossHalalas`) ومن الشحن.
 * الإجمالي جمع بلا تقريب، والضريبة تُستخرج منه مرة واحدة: round(الإجمالي × 15 / 115).
 * تستعملها السلة للعرض والخادم للاعتماد، فلا يختلف الرقمان. لا ترمي لأي سلة
 * ممكنة (40 سطراً × 100 متر × أعلى سعر مقبول)، فلا تُسقط صفحة السلة.
 */
export function computeFabricGrossOrderTotals(
  lineGrossHalalas: readonly number[],
  options: FabricShippingAmounts = {}
): FabricOrderTotals {
  const shippingNetHalalas = options.shippingNetHalalas ?? 0
  const shippingGrossHalalas = options.shippingGrossHalalas ?? 0
  for (const amount of [...lineGrossHalalas, shippingNetHalalas, shippingGrossHalalas]) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError('مبالغ الطلب يجب أن تكون هللات صحيحة غير سالبة')
    }
  }
  // حصة الشحن من الضريبة ثابتة (الشامل − الصافي)، فيجب أن يكون زوجاً متسقاً.
  const expectedShippingGross = shippingNetHalalas + divideRoundHalfUp(
    multiplyExact(shippingNetHalalas, FABRIC_VAT_BASIS_POINTS), BASIS_POINTS_SCALE
  )
  if (shippingGrossHalalas !== expectedShippingGross) {
    throw new RangeError('رسم الشحن الشامل لا يطابق صافي الشحن وضريبته')
  }

  const totalHalalas = lineGrossHalalas.reduce((sum, amount) => sum + amount, 0) + shippingGrossHalalas
  const vatHalalas = divideRoundHalfUp(
    multiplyExact(totalHalalas, FABRIC_VAT_BASIS_POINTS),
    BASIS_POINTS_SCALE + FABRIC_VAT_BASIS_POINTS
  )
  const taxableHalalas = totalHalalas - vatHalalas

  return {
    itemsNetHalalas: taxableHalalas - shippingNetHalalas,
    shippingNetHalalas,
    taxableHalalas,
    vatHalalas,
    totalHalalas,
  }
}

export interface FabricOrderBreakdown extends FabricOrderTotals {
  /** كل سطر شاملاً الضريبة، كما دخل وبنفس الترتيب. */
  lineGrossHalalas: number[]
  /** حصة كل سطر من ضريبة الطلب (الباقي الأكبر بنسبة مبلغه). */
  lineVatHalalas: number[]
  /** كل سطر قبل الضريبة = الشامل − حصته. */
  lineNetHalalas: number[]
  /** الشحن شاملاً الضريبة. */
  shippingGrossHalalas: number
}

/**
 * الإجماليات + صافي كل سطر وحصته من الضريبة، لأسطر الطلب في القاعدة وبنود فاتورة
 * الأستاذ والاسترداد الجزئي. الشحن يأخذ حصته الثابتة أولاً فيبقى 50.00 في العرض
 * والفاتورة، ويُوزّع باقي ضريبة الطلب على الأقمشة. مجموع `lineGrossHalalas` +
 * `shippingGrossHalalas` = `totalHalalas` دائماً.
 * للخادم فقط: ترمي لطلب فوق `FABRIC_MAX_ORDER_TOTAL_HALALAS` بدل نتيجة غير دقيقة.
 */
export function computeFabricGrossOrderBreakdown(
  lineGrossHalalas: readonly number[],
  options: FabricShippingAmounts = {}
): FabricOrderBreakdown {
  const totals = computeFabricGrossOrderTotals(lineGrossHalalas, options)
  if (totals.totalHalalas > FABRIC_MAX_ORDER_TOTAL_HALALAS) {
    throw new RangeError('إجمالي الطلب يتجاوز السقف التقني للطلب الواحد')
  }

  const shippingGrossHalalas = options.shippingGrossHalalas ?? 0
  const itemsVatHalalas = totals.vatHalalas - (shippingGrossHalalas - totals.shippingNetHalalas)
  const lineVatHalalas = allocateByWeights(itemsVatHalalas, lineGrossHalalas)

  return {
    ...totals,
    lineGrossHalalas: [...lineGrossHalalas],
    lineVatHalalas,
    lineNetHalalas: lineGrossHalalas.map((amount, index) => amount - lineVatHalalas[index]),
    shippingGrossHalalas,
  }
}
