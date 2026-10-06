/**
 * عرض السعر على الخادم: لقطة القاعدة (البطاقة + المخزون الفعلي + المحجوز) ثم
 * التسعير بعقد `pricing.ts` نفسه الذي تعرض به السلة. تستعمله صفحة الدفع لعرض
 * الملخّص، ومسار إنشاء الطلب ليبني أرقام الطلب التي تتحقق منها القاعدة.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEffectiveFabricDiscountPercent } from '@/lib/fabric-display-pricing'
import { metersToCentimeters, toScaledInteger } from '@/lib/fabric-store/money'
import {
  FABRIC_DELIVERY_OPTIONS,
  FABRIC_STORE_MAX_ORDER_TOTAL_HALALAS,
  type FabricDeliveryMethod,
  type FabricQuoteResponse,
  type QuotedFabricLine,
} from '@/lib/fabric-store/checkout-contract'
import {
  computeFabricOrderBreakdown,
  priceFabricLine,
  type FabricPurchaseMode,
  type FabricSaleSource,
  type PricedFabricLine,
} from '@/lib/fabric-store/pricing'
import { toByteaHex } from './http'

interface SnapshotRow {
  fabric_id: string
  name: string | null
  fabric_code: string | null
  price_per_meter: number | null
  is_on_sale: boolean | null
  discount_percentage: number | null
  min_order_meters: number | null
  deleted_at: string | null
  is_active: boolean | null
  is_available: boolean | null
  is_manually_hidden: boolean | null
  inventory_item_id: string | null
  inventory_color_id: string | null
  inventory_unit: string | null
  physical_quantity: number | null
  color_required: boolean
  reserved_cm: number
}

export type SnapshotResult =
  | { status: 'ok'; rows: Map<string, SnapshotRow> }
  | { status: 'rate_limited' | 'bad_request' | 'error' }

export async function loadQuoteSnapshot(
  client: SupabaseClient,
  fabricIds: string[],
  clientHash: string
): Promise<SnapshotResult> {
  const { data, error } = await client.rpc('fabric_store_quote_snapshot', {
    p_fabric_ids: fabricIds,
    p_client_hash: toByteaHex(clientHash),
  })
  if (error) {
    console.error('fabric-store quote snapshot failed:', error.message)
    return { status: 'error' }
  }
  const result = (data || {}) as { status?: string; fabrics?: SnapshotRow[] }
  if (result.status === 'rate_limited' || result.status === 'bad_request') return { status: result.status }
  if (result.status !== 'ok') return { status: 'error' }
  const rows = new Map<string, SnapshotRow>()
  for (const row of result.fabrics ?? []) rows.set(row.fabric_id, row)
  return { status: 'ok', rows }
}

/** سطر جاهز لدالة إنشاء الطلب — بأسماء أعمدة القاعدة. */
export interface OrderItemPayload {
  fabric_id: string
  purchase_mode: FabricPurchaseMode
  piece_length_cm: number | null
  quantity_cm: number | null
  price_per_meter_halalas: number
  discount_basis_points: number
  unit_price_halalas: number
  net_halalas: number
  vat_halalas: number
}

export interface PricedCart {
  quote: FabricQuoteResponse
  /** null ما لم تكن كل الأسطر سليمة. */
  order: {
    items: OrderItemPayload[]
    itemsNetHalalas: number
    shippingNetHalalas: number
    shippingVatHalalas: number
    vatHalalas: number
    totalHalalas: number
  } | null
}

const toFabricSource = (row: SnapshotRow, stockCm: number): FabricSaleSource => ({
  price_per_meter: row.price_per_meter,
  is_on_sale: row.is_on_sale,
  discount_percentage: row.discount_percentage,
  min_order_meters: row.min_order_meters,
  deleted_at: row.deleted_at,
  is_active: row.is_active,
  is_available: row.is_available,
  is_manually_hidden: row.is_manually_hidden,
  // المخزون الفعلي لوحدة المخزون نفسها — ما يقرؤه الحجز تحت القفل — لا نسخة البطاقة.
  stock_quantity: stockCm / 100,
})

export function priceCart(
  rows: Map<string, SnapshotRow>,
  lines: { fabricId: string; purchaseMode: FabricPurchaseMode; quantity: number }[],
  deliveryMethod: FabricDeliveryMethod
): PricedCart {
  const delivery = FABRIC_DELIVERY_OPTIONS[deliveryMethod]
  const quoted: QuotedFabricLine[] = []
  const priced: { line: PricedFabricLine; row: SnapshotRow; fabric: FabricSaleSource }[] = []

  for (const request of lines) {
    const row = rows.get(request.fabricId)
    const reject = (status: QuotedFabricLine['status'], currentMode: FabricPurchaseMode | null = null) =>
      quoted.push({
        fabricId: request.fabricId, status, currentMode, label: null,
        unitPriceHalalas: null, netHalalas: null, availableCm: null,
      })

    // غير الموجود والمخفي «غير متاح» بلا أي تفصيل: لا يُكشف سعر قماش مخفي.
    if (!row) { reject('unavailable'); continue }
    const physicalCm = row.physical_quantity == null ? null : metersToCentimeters(row.physical_quantity)
    const fabric = toFabricSource(row, Math.max(physicalCm ?? 0, 0))
    const visible =
      row.deleted_at == null && row.is_active !== false && row.is_available !== false && row.is_manually_hidden !== true
    if (!visible) { reject('unavailable'); continue }
    if (!row.inventory_item_id || row.color_required || row.inventory_unit !== 'meter' || physicalCm == null) {
      reject('not-online'); continue
    }

    const availableCm = Math.max(Math.max(physicalCm, 0) - Number(row.reserved_cm || 0), 0)
    const result = priceFabricLine(fabric, { purchaseMode: request.purchaseMode, quantity: request.quantity }, { availableCm })
    const label = row.name?.trim() || row.fabric_code?.trim() || 'قماش'
    if (!result.ok) {
      quoted.push({
        fabricId: request.fabricId, status: result.reason, currentMode: result.currentMode, label,
        unitPriceHalalas: null, netHalalas: null, availableCm,
      })
      continue
    }
    quoted.push({
      fabricId: request.fabricId, status: 'ok', currentMode: result.line.purchaseMode, label,
      unitPriceHalalas: result.line.unitPriceHalalas, netHalalas: result.line.netHalalas, availableCm,
    })
    priced.push({ line: result.line, row, fabric })
  }

  const allOk = priced.length === lines.length
  let totals: FabricQuoteResponse['totals'] = null
  let order: PricedCart['order'] = null
  let overOrderCap = false

  if (priced.length > 0) {
    const breakdown = computeFabricOrderBreakdown(
      priced.map(entry => entry.line.netHalalas),
      { shippingNetHalalas: delivery.shippingNetHalalas, shippingGrossHalalas: delivery.shippingGrossHalalas }
    )
    totals = {
      itemsNetHalalas: breakdown.itemsNetHalalas,
      shippingNetHalalas: breakdown.shippingNetHalalas,
      shippingGrossHalalas: breakdown.shippingGrossHalalas,
      vatHalalas: breakdown.vatHalalas,
      totalHalalas: breakdown.totalHalalas,
    }
    overOrderCap = breakdown.totalHalalas > FABRIC_STORE_MAX_ORDER_TOTAL_HALALAS

    if (allOk) {
      order = {
        items: priced.map(({ line, row, fabric }, index) => ({
          fabric_id: row.fabric_id,
          purchase_mode: line.purchaseMode,
          piece_length_cm: line.quantity.unit === 'piece' ? line.quantity.pieceLengthCm : null,
          quantity_cm: line.quantity.unit === 'meter' ? line.quantity.centimeters : null,
          // نفس تحويل القاعدة: round(price * 100) و round(discount * 100) حين يكون الخصم مفعّلاً.
          price_per_meter_halalas: toScaledInteger(row.price_per_meter, 2) as number,
          discount_basis_points: toScaledInteger(getEffectiveFabricDiscountPercent(fabric), 2) ?? 0,
          unit_price_halalas: line.unitPriceHalalas,
          net_halalas: line.netHalalas,
          vat_halalas: breakdown.lineGrossHalalas[index] - line.netHalalas,
        })),
        itemsNetHalalas: breakdown.itemsNetHalalas,
        shippingNetHalalas: breakdown.shippingNetHalalas,
        shippingVatHalalas: breakdown.shippingGrossHalalas - breakdown.shippingNetHalalas,
        vatHalalas: breakdown.vatHalalas,
        totalHalalas: breakdown.totalHalalas,
      }
    }
  }

  return {
    quote: {
      ok: true,
      lines: quoted,
      totals,
      canCheckout: allOk && !overOrderCap,
      overOrderCap,
      deliveryOptions: Object.values(FABRIC_DELIVERY_OPTIONS),
    },
    order,
  }
}
