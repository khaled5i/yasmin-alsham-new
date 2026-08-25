import type { FabricInventoryItem, InventoryUnit } from '@/lib/services/fabric-inventory-service'

export const LOW_STOCK_THRESHOLD = 5

export interface InventoryUnitTotals {
  meter: number
  piece: number
}

export interface InventoryTypeStatistic {
  name: string
  itemCount: number
  activeItemCount: number
  quantities: InventoryUnitTotals
  purchaseValue: number
  retailValue: number
  colorVariantCount: number
}

export interface InventoryColorStatistic {
  name: string
  hex: string | null
  itemCount: number
  quantities: InventoryUnitTotals
  purchaseValue: number
  retailValue: number
}

export interface InventoryValueItem {
  id: string
  name: string
  code: string | null
  quantity: number
  unit: InventoryUnit
  purchaseValue: number
  retailValue: number
  potentialProfit: number | null
}

export interface InventoryPriceBand {
  label: string
  count: number
  minimum: number
  maximum: number | null
}

export interface FabricInventoryStatistics {
  itemCount: number
  activeItemCount: number
  lowStockItemCount: number
  outOfStockItemCount: number
  negativeStockItemCount: number
  quantities: InventoryUnitTotals
  purchaseValue: number
  retailValue: number
  comparablePurchaseValue: number
  comparableRetailValue: number
  potentialProfit: number
  potentialMarginPercent: number | null
  costedItemCount: number
  salePricedItemCount: number
  fullyPricedItemCount: number
  unpricedItemCount: number
  averagePurchasePrice: number | null
  averageSalePrice: number | null
  minimumSalePrice: number | null
  maximumSalePrice: number | null
  totalColorVariantCount: number
  availableColorVariantCount: number
  outOfStockColorVariantCount: number
  uniqueColorCount: number
  itemsWithoutColorDetailsCount: number
  uncategorizedItemCount: number
  supplierMissingItemCount: number
  quantityMismatchCount: number
  types: InventoryTypeStatistic[]
  colors: InventoryColorStatistic[]
  topValueItems: InventoryValueItem[]
  priceBands: InventoryPriceBand[]
  latestUpdatedAt: string | null
}

function toFiniteNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0
}

function createUnitTotals(): InventoryUnitTotals {
  return { meter: 0, piece: 0 }
}

function addQuantity(totals: InventoryUnitTotals, unit: InventoryUnit, quantity: number) {
  totals[unit] += quantity
}

function getPrimaryType(item: FabricInventoryItem): string {
  const type = item.fabric_types?.find(current => current.trim()) ?? item.fabric_type
  return type?.trim() || 'غير مصنف'
}

function getItemCode(item: FabricInventoryItem): string | null {
  return item.base_fabric_code || item.colors?.find(color => color.fabric_code)?.fabric_code || null
}

function createPriceBands(prices: number[]): InventoryPriceBand[] {
  if (prices.length === 0) return []

  const maximumPrice = Math.max(...prices)
  const rawStep = maximumPrice / 4 || 1
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = Math.max(1, Math.ceil(rawStep / magnitude) * magnitude)

  const bands: InventoryPriceBand[] = [
    { label: `أقل من ${step}`, count: 0, minimum: 0, maximum: step },
    { label: `${step} – أقل من ${step * 2}`, count: 0, minimum: step, maximum: step * 2 },
    { label: `${step * 2} – أقل من ${step * 3}`, count: 0, minimum: step * 2, maximum: step * 3 },
    { label: `${step * 3} فأكثر`, count: 0, minimum: step * 3, maximum: null },
  ]

  prices.forEach(price => {
    const bandIndex = Math.min(3, Math.floor(price / step))
    bands[bandIndex].count += 1
  })

  return bands
}

export function calculateFabricInventoryStatistics(
  items: FabricInventoryItem[]
): FabricInventoryStatistics {
  const quantities = createUnitTotals()
  const typeMap = new Map<string, InventoryTypeStatistic>()
  const colorMap = new Map<string, InventoryColorStatistic & { itemIds: Set<string> }>()
  const salePrices: number[] = []
  const purchasePrices: number[] = []
  const valueItems: InventoryValueItem[] = []

  let activeItemCount = 0
  let lowStockItemCount = 0
  let outOfStockItemCount = 0
  let negativeStockItemCount = 0
  let purchaseValue = 0
  let retailValue = 0
  let comparablePurchaseValue = 0
  let comparableRetailValue = 0
  let costedItemCount = 0
  let salePricedItemCount = 0
  let fullyPricedItemCount = 0
  let totalColorVariantCount = 0
  let availableColorVariantCount = 0
  let outOfStockColorVariantCount = 0
  let itemsWithoutColorDetailsCount = 0
  let uncategorizedItemCount = 0
  let supplierMissingItemCount = 0
  let quantityMismatchCount = 0
  let latestUpdatedAt: string | null = null

  items.forEach(item => {
    const quantity = toFiniteNumber(item.current_quantity)
    const cost = item.cost_per_unit == null ? null : toFiniteNumber(item.cost_per_unit)
    const salePrice = item.sale_price_per_unit == null
      ? null
      : toFiniteNumber(item.sale_price_per_unit)
    const itemPurchaseValue = cost == null ? 0 : quantity * cost
    const itemRetailValue = salePrice == null ? 0 : quantity * salePrice
    const colors = item.colors ?? []

    addQuantity(quantities, item.unit, quantity)

    if (quantity > LOW_STOCK_THRESHOLD) activeItemCount += 1
    else if (quantity > 0) {
      activeItemCount += 1
      lowStockItemCount += 1
    } else {
      outOfStockItemCount += 1
      if (quantity < 0) negativeStockItemCount += 1
    }

    if (cost != null) {
      costedItemCount += 1
      purchasePrices.push(cost)
      purchaseValue += itemPurchaseValue
    }

    if (salePrice != null) {
      salePricedItemCount += 1
      salePrices.push(salePrice)
      retailValue += itemRetailValue
    }

    if (cost != null && salePrice != null) {
      fullyPricedItemCount += 1
      comparablePurchaseValue += itemPurchaseValue
      comparableRetailValue += itemRetailValue
    }

    if (!item.supplier_id && !item.supplier_name?.trim()) supplierMissingItemCount += 1

    const typeName = getPrimaryType(item)
    if (typeName === 'غير مصنف') uncategorizedItemCount += 1
    const typeStatistic = typeMap.get(typeName) ?? {
      name: typeName,
      itemCount: 0,
      activeItemCount: 0,
      quantities: createUnitTotals(),
      purchaseValue: 0,
      retailValue: 0,
      colorVariantCount: 0,
    }
    typeStatistic.itemCount += 1
    if (quantity > 0) typeStatistic.activeItemCount += 1
    addQuantity(typeStatistic.quantities, item.unit, quantity)
    typeStatistic.purchaseValue += itemPurchaseValue
    typeStatistic.retailValue += itemRetailValue
    typeStatistic.colorVariantCount += colors.length
    typeMap.set(typeName, typeStatistic)

    if (colors.length === 0) {
      itemsWithoutColorDetailsCount += 1
    } else {
      const colorsQuantity = colors.reduce(
        (total, color) => total + toFiniteNumber(color.current_quantity),
        0
      )
      if (Math.abs(colorsQuantity - quantity) > 0.01) quantityMismatchCount += 1
    }

    totalColorVariantCount += colors.length
    colors.forEach(color => {
      const colorQuantity = toFiniteNumber(color.current_quantity)
      if (colorQuantity > 0) availableColorVariantCount += 1
      else outOfStockColorVariantCount += 1

      const colorName = color.color_name.trim() || 'لون غير مسمى'
      const colorKey = colorName.toLocaleLowerCase('ar')
      const colorStatistic = colorMap.get(colorKey) ?? {
        name: colorName,
        hex: color.color_hex,
        itemCount: 0,
        quantities: createUnitTotals(),
        purchaseValue: 0,
        retailValue: 0,
        itemIds: new Set<string>(),
      }

      colorStatistic.itemIds.add(item.id)
      colorStatistic.itemCount = colorStatistic.itemIds.size
      if (!colorStatistic.hex && color.color_hex) colorStatistic.hex = color.color_hex
      addQuantity(colorStatistic.quantities, item.unit, colorQuantity)
      colorStatistic.purchaseValue += cost == null ? 0 : colorQuantity * cost
      colorStatistic.retailValue += salePrice == null ? 0 : colorQuantity * salePrice
      colorMap.set(colorKey, colorStatistic)
    })

    valueItems.push({
      id: item.id,
      name: item.name,
      code: getItemCode(item),
      quantity,
      unit: item.unit,
      purchaseValue: itemPurchaseValue,
      retailValue: itemRetailValue,
      potentialProfit: cost != null && salePrice != null
        ? itemRetailValue - itemPurchaseValue
        : null,
    })

    const updatedAtTime = Date.parse(item.updated_at)
    const latestTime = latestUpdatedAt ? Date.parse(latestUpdatedAt) : Number.NEGATIVE_INFINITY
    if (Number.isFinite(updatedAtTime) && updatedAtTime > latestTime) {
      latestUpdatedAt = item.updated_at
    }
  })

  const potentialProfit = comparableRetailValue - comparablePurchaseValue
  const potentialMarginPercent = comparablePurchaseValue > 0
    ? (potentialProfit / comparablePurchaseValue) * 100
    : null

  return {
    itemCount: items.length,
    activeItemCount,
    lowStockItemCount,
    outOfStockItemCount,
    negativeStockItemCount,
    quantities,
    purchaseValue,
    retailValue,
    comparablePurchaseValue,
    comparableRetailValue,
    potentialProfit,
    potentialMarginPercent,
    costedItemCount,
    salePricedItemCount,
    fullyPricedItemCount,
    unpricedItemCount: items.length - fullyPricedItemCount,
    averagePurchasePrice: purchasePrices.length > 0
      ? purchasePrices.reduce((total, price) => total + price, 0) / purchasePrices.length
      : null,
    averageSalePrice: salePrices.length > 0
      ? salePrices.reduce((total, price) => total + price, 0) / salePrices.length
      : null,
    minimumSalePrice: salePrices.length > 0 ? Math.min(...salePrices) : null,
    maximumSalePrice: salePrices.length > 0 ? Math.max(...salePrices) : null,
    totalColorVariantCount,
    availableColorVariantCount,
    outOfStockColorVariantCount,
    uniqueColorCount: colorMap.size,
    itemsWithoutColorDetailsCount,
    uncategorizedItemCount,
    supplierMissingItemCount,
    quantityMismatchCount,
    types: Array.from(typeMap.values()).sort((first, second) =>
      second.purchaseValue - first.purchaseValue || second.itemCount - first.itemCount
    ),
    colors: Array.from(colorMap.values())
      .map(color => ({
        name: color.name,
        hex: color.hex,
        itemCount: color.itemCount,
        quantities: color.quantities,
        purchaseValue: color.purchaseValue,
        retailValue: color.retailValue,
      }))
      .sort((first, second) =>
        second.itemCount - first.itemCount || second.purchaseValue - first.purchaseValue
      ),
    topValueItems: valueItems
      .filter(item => item.purchaseValue > 0)
      .sort((first, second) => second.purchaseValue - first.purchaseValue)
      .slice(0, 6),
    priceBands: createPriceBands(salePrices),
    latestUpdatedAt,
  }
}
