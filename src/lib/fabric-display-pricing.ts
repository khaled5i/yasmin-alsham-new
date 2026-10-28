import { roundFabricNumber } from './fabric-number-format'
import { toScaledInteger } from './fabric-store/money'
import { FABRIC_MAX_PRICE_PER_METER_HALALAS, toFabricGrossWholeRiyals } from './fabric-store/pricing'

export type FabricPricingUnit = 'meter' | 'piece'

export interface FabricDisplayPricing {
  amount: number | null
  unit: FabricPricingUnit
  isWholePiecePrice: boolean
}

const WHOLE_PIECE_METER_QUANTITIES = new Set([3, 3.5])

/** الحقول التي تكفي لاشتقاق سعر المتر الصافي، دون ربط بنوع Fabric كاملاً. */
export interface FabricDiscountFields {
  price_per_meter: number | null | undefined
  is_on_sale?: boolean | null
  discount_percentage?: number | null
}

/**
 * نسبة الخصم الفعّالة على القماش (0 إن لم يكن في تخفيض) — القاعدة الوحيدة
 * لتفعيل الخصم. يقرؤها العرض هنا، وحساب الهللة في `fabric-store/pricing.ts`،
 * فلا يُطبَّق الخصم مرتين ولا بقاعدتين مختلفتين.
 */
export function getEffectiveFabricDiscountPercent(fabric: FabricDiscountFields): number {
  const discount = Number(fabric.discount_percentage) || 0
  return fabric.is_on_sale && discount > 0 ? discount : 0
}

/**
 * سعر المتر بعد الخصم للعرض في الكتالوج (رقم عشري بالريال).
 *
 * `null` تعني «السعر عند الطلب»، والصفر يبقى صفراً ولا يتحول إلى سعر افتراضي.
 * لا يقرّب الناتج: التقريب مسؤولية طبقة العرض، فلا يتراكم. ما تدفعه الزبونة
 * يُحسب بالهللة في `fabric-store/pricing.ts` من نفس قاعدة الخصم.
 */
export function getFabricNetPricePerMeter(fabric: FabricDiscountFields): number | null {
  if (fabric.price_per_meter == null) return null

  const base = Number(fabric.price_per_meter)
  if (!Number.isFinite(base)) return null

  const discount = getEffectiveFabricDiscountPercent(fabric)
  if (discount > 0) {
    return base * (1 - discount / 100)
  }
  return base
}

export function isWholeFabricPiece(
  quantity: number | null | undefined,
  inventoryUnit: FabricPricingUnit = 'meter'
): boolean {
  if (inventoryUnit !== 'meter' || quantity == null || !Number.isFinite(Number(quantity))) {
    return false
  }

  return WHOLE_PIECE_METER_QUANTITIES.has(roundFabricNumber(Number(quantity)))
}

/**
 * The stored price always remains the inventory-unit price (normally per meter).
 * Only the displayed price becomes a whole-piece price while exactly 3 or 3.5m remain.
 */
export function getFabricDisplayPricing(
  pricePerInventoryUnit: number | null | undefined,
  availableQuantity: number | null | undefined,
  inventoryUnit: FabricPricingUnit = 'meter'
): FabricDisplayPricing {
  const isWholePiecePrice = isWholeFabricPiece(availableQuantity, inventoryUnit)
  const unit: FabricPricingUnit = isWholePiecePrice || inventoryUnit === 'piece' ? 'piece' : 'meter'

  if (pricePerInventoryUnit == null || !Number.isFinite(Number(pricePerInventoryUnit))) {
    return { amount: null, unit, isWholePiecePrice }
  }

  const price = Number(pricePerInventoryUnit)
  const amount = isWholePiecePrice
    ? roundFabricNumber(price * roundFabricNumber(Number(availableQuantity)))
    : roundFabricNumber(price)

  return { amount, unit, isWholePiecePrice }
}

/**
 * سعر المتر قبل الضريبة (ريال) ⇒ شاملاً الضريبة بريال كامل، كما يُدفع (قرار المالكة
 * 27 أكتوبر 2026): 250 ⇒ 287.50 ⇒ 288. نفس تقريب `getFabricGrossPricePerMeterHalalas`
 * (أقرب هللة ثم أقرب ريال)، فلا يختلف المعروض عن المدفوع. لسعر المتر فقط: سعر قطعة
 * كاملة قبل الضريبة لا يمر من هنا (القطعة = سعر المتر الشامل × أمتارها).
 */
export function getFabricGrossPricePerMeter(netPricePerMeter: number | null): number | null {
  if (netPricePerMeter == null || !Number.isFinite(netPricePerMeter)) return null
  const netHalalas = toScaledInteger(netPricePerMeter, 2)
  // فوق حد الأمان خطأ إدخال يعامله الدفع كـ«السعر عند الطلب»، ولا يُسقط الصفحة بخطأ ضرب.
  if (netHalalas == null || Math.abs(netHalalas) > FABRIC_MAX_PRICE_PER_METER_HALALAS) return null
  return toFabricGrossWholeRiyals(netHalalas)
}

/**
 * سعر الواجهة العامة شاملاً الضريبة بريال كامل — بالمتر دائماً (قرار المالك 18 أكتوبر 2026).
 * القطعة 3 أو 3.5م لا يُعرض لها سعر قطعة كاملة، بل سعر المتر مع ملاحظة «أقل كمية
 * طلب»؛ و`isWholePiecePrice` يبقى ليعرف المتجر متى يُظهر تلك الملاحظة.
 * هو نفسه ما يُدفع للمتر: يُحسب بالهللة في `fabric-store/pricing.ts`.
 */
export function getFabricStorefrontPricing(
  pricePerInventoryUnit: number | null | undefined,
  availableQuantity: number | null | undefined,
  inventoryUnit: FabricPricingUnit = 'meter'
): FabricDisplayPricing {
  const isWholePiecePrice = isWholeFabricPiece(availableQuantity, inventoryUnit)
  const unit: FabricPricingUnit = inventoryUnit === 'piece' ? 'piece' : 'meter'
  const amount = pricePerInventoryUnit == null ? null : Number(pricePerInventoryUnit)
  return { amount: getFabricGrossPricePerMeter(amount), unit, isWholePiecePrice }
}

export function getFabricPricingUnitLabel(unit: FabricPricingUnit): string {
  return unit === 'piece' ? 'للقطعة' : 'للمتر'
}

/**
 * قماش بدون سعر معروض (السعر عند الطلب) — يُستخدم لإنزال هذه الأقمشة
 * إلى نهاية قائمة المتجر مهما كان نوع الترتيب المختار.
 */
export function hasFabricDisplayPrice(
  pricePerInventoryUnit: number | null | undefined,
  availableQuantity: number | null | undefined,
  inventoryUnit: FabricPricingUnit = 'meter'
): boolean {
  const { amount } = getFabricDisplayPricing(pricePerInventoryUnit, availableQuantity, inventoryUnit)
  return amount != null && amount > 0
}
