import { roundFabricNumber } from './fabric-number-format'

export type FabricPricingUnit = 'meter' | 'piece'

export interface FabricDisplayPricing {
  amount: number | null
  unit: FabricPricingUnit
  isWholePiecePrice: boolean
}

const WHOLE_PIECE_METER_QUANTITIES = new Set([3, 3.5])

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
