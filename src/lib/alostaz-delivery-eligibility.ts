export const ALOSTAZ_DELIVERY_SYNC_START_DATE = '2026-08-13'

interface DeliverySyncEligibilityInput {
  delivery_date?: string | null
}

/**
 * Delivery invoices follow the delivery date boundary, not the order creation date.
 * The order's billing version is intentionally irrelevant here.
 */
export function isAlostazDeliverySyncEligible(
  order: DeliverySyncEligibilityInput | null | undefined,
): boolean {
  const deliveryDate = String(order?.delivery_date || '').trim()
  const isoDate = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(deliveryDate)?.[1]

  return !!isoDate && isoDate >= ALOSTAZ_DELIVERY_SYNC_START_DATE
}
