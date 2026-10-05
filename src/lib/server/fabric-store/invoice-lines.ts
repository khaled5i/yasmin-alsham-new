/**
 * بنود فاتورة الأستاذ لمبيعة المتجر الإلكتروني (المرحلة 6) — حساب خالص بلا اتصال.
 *
 * - كل سطر بمبلغه كما دفعته الزبونة (gross = الصافي + حصته من ضريبة الطلب، بالهللة).
 * - رسوم الشحن (مع ضريبتها) بند مستقل «رسوم شحن» (قرار المالك 28 سبتمبر).
 * - مجموع البنود = إجمالي الطلب = مبلغ صف المبيعة، وإلا يُرفض قبل إنشاء أي فاتورة.
 */

export interface OnlineOrderForInvoice {
  order_number: string
  total_halalas: number | string
  shipping_net_halalas: number | string
  shipping_vat_halalas: number | string
}

export interface OnlineItemForInvoice {
  stock_consumption_cm: number | string
  gross_halalas: number | string
  fabric_name: string | null
}

export interface PlannedInvoiceLine {
  kind: 'fabric' | 'shipping'
  /** اسم صنف المخزون الذي يُطابَق به منتج الأستاذ (للقماش). */
  productName: string
  quantity_meters: number
  /** شامل الضريبة، بالريال. */
  amount: number
  description: string
}

export const SHIPPING_LINE_NAME = 'رسوم شحن'

export function planOnlineInvoiceLines(
  order: OnlineOrderForInvoice,
  items: OnlineItemForInvoice[],
  storedItems: unknown[],
  incomeAmount: number | string | null
): PlannedInvoiceLine[] {
  if (!items.length) throw new Error(`الطلب ${order.order_number} بلا أسطر`)
  if (storedItems.length !== items.length) {
    throw new Error(`أسطر الطلب ${order.order_number} لا تطابق بنود المبيعة`)
  }

  const total = Number(order.total_halalas)
  const shipping = Number(order.shipping_net_halalas) + Number(order.shipping_vat_halalas)
  const itemsTotal = items.reduce((sum, item) => sum + Number(item.gross_halalas), 0)
  const incomeHalalas = Math.round(Number(incomeAmount) * 100)
  if (!Number.isSafeInteger(total) || itemsTotal + shipping !== total || incomeHalalas !== total) {
    throw new Error(`مبالغ الطلب ${order.order_number} لا تطابق المبيعة (${itemsTotal} + ${shipping} ≠ ${incomeHalalas})`)
  }

  const lines: PlannedInvoiceLine[] = items.map((item, index) => {
    const stored = storedItems[index] as { name?: unknown } | null
    const name = String((stored && stored.name) || item.fabric_name || 'قماش')
    return {
      kind: 'fabric',
      productName: name,
      quantity_meters: Number(item.stock_consumption_cm) / 100,
      amount: Number(item.gross_halalas) / 100,
      description: name,
    }
  })
  if (shipping > 0) {
    lines.push({
      kind: 'shipping',
      productName: SHIPPING_LINE_NAME,
      quantity_meters: 1,
      amount: shipping / 100,
      description: `${SHIPPING_LINE_NAME} — ${order.order_number}`,
    })
  }
  return lines
}
