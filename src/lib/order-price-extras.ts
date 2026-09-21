/**
 * مصروفات الطلب + سجل تعديل السعر (migration 20260921120000).
 * ─────────────────────────────────────────────────────────────
 * orders.price هو دائماً «السعر الكلي» = السعر الأساسي + مجموع المصروفات،
 * لذلك يبقى remaining_amount (trigger) والمحاسبة والإيصالات كما هي.
 */

export interface OrderExpense {
  id: string
  amount: number
  note: string
  created_at: string
}

export interface OrderPriceAdjustment {
  id: string
  previous_price: number
  new_price: number
  previous_remaining: number
  new_remaining: number
  reason: string
  created_at: string
  created_by_name?: string | null
}

export const roundMoney = (value: number) =>
  Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100

export const createPriceExtraId = () =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function normalizeOrderExpenses(raw: unknown): OrderExpense[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      id: String(item.id || createPriceExtraId()),
      amount: roundMoney(Number(item.amount) || 0),
      note: typeof item.note === 'string' ? item.note : '',
      created_at: typeof item.created_at === 'string' ? item.created_at : new Date(0).toISOString(),
    }))
    .filter(item => item.amount > 0)
}

export function normalizePriceAdjustments(raw: unknown): OrderPriceAdjustment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      id: String(item.id || createPriceExtraId()),
      previous_price: roundMoney(Number(item.previous_price) || 0),
      new_price: roundMoney(Number(item.new_price) || 0),
      previous_remaining: roundMoney(Number(item.previous_remaining) || 0),
      new_remaining: roundMoney(Number(item.new_remaining) || 0),
      reason: typeof item.reason === 'string' ? item.reason : '',
      created_at: typeof item.created_at === 'string' ? item.created_at : new Date(0).toISOString(),
      created_by_name: typeof item.created_by_name === 'string' ? item.created_by_name : null,
    }))
}

export const sumOrderExpenses = (expenses: OrderExpense[]) =>
  roundMoney(expenses.reduce((total, expense) => total + expense.amount, 0))

interface PricedOrder {
  price?: number | string | null
  paid_amount?: number | string | null
  order_expenses?: unknown
  price_adjustments?: unknown
}

/** تفصيل سعر الطلب: الأساسي + المصروفات = الكلي. */
export function getOrderPriceBreakdown(order: PricedOrder | null | undefined) {
  const totalPrice = roundMoney(Number(order?.price) || 0)
  const expenses = normalizeOrderExpenses(order?.order_expenses)
  const expensesTotal = sumOrderExpenses(expenses)
  return {
    totalPrice,
    expenses,
    expensesTotal,
    basePrice: roundMoney(totalPrice - expensesTotal),
    adjustments: normalizePriceAdjustments(order?.price_adjustments),
  }
}

export function formatAdjustmentDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return ''
  return date.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** الرسالة المحفوظة للمستقبل عن تعديل السعر. */
export function describePriceAdjustment(adjustment: OrderPriceAdjustment) {
  const direction = adjustment.new_remaining < adjustment.previous_remaining ? 'تخفيض' : 'زيادة'
  return `تم ${direction} الدفعة المتبقية من ${adjustment.previous_remaining.toFixed(2)} إلى ${adjustment.new_remaining.toFixed(2)} ر.س، فأصبح سعر الطلب ${adjustment.new_price.toFixed(2)} ر.س بدل ${adjustment.previous_price.toFixed(2)} ر.س`
}

/**
 * يبني تحديث تعديل الدفعة المتبقية: السعر الجديد = المدفوع + المتبقي الجديد،
 * مع إضافة سطر إلى سجل price_adjustments.
 */
export function buildRemainingAdjustmentUpdates(
  order: PricedOrder,
  newRemaining: number,
  reason: string,
  createdByName?: string | null,
) {
  const previousPrice = roundMoney(Number(order.price) || 0)
  const paid = roundMoney(Number(order.paid_amount) || 0)
  const previousRemaining = roundMoney(Math.max(0, previousPrice - paid))
  const nextRemaining = roundMoney(newRemaining)

  if (!Number.isFinite(nextRemaining) || nextRemaining < 0) {
    throw new Error('الدفعة المتبقية الجديدة غير صالحة')
  }
  if (Math.abs(nextRemaining - previousRemaining) < 0.005) {
    throw new Error('الدفعة المتبقية لم تتغير')
  }

  const newPrice = roundMoney(paid + nextRemaining)
  const { expensesTotal } = getOrderPriceBreakdown(order)
  if (newPrice < expensesTotal - 0.005) {
    throw new Error('لا يمكن أن يقل سعر الطلب عن مجموع مصروفاته')
  }

  const adjustment: OrderPriceAdjustment = {
    id: createPriceExtraId(),
    previous_price: previousPrice,
    new_price: newPrice,
    previous_remaining: previousRemaining,
    new_remaining: nextRemaining,
    reason: reason.trim(),
    created_at: new Date().toISOString(),
    created_by_name: createdByName || null,
  }

  return {
    adjustment,
    updates: {
      price: newPrice,
      price_adjustments: [...normalizePriceAdjustments(order.price_adjustments), adjustment],
    },
  }
}
