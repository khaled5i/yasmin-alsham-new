/**
 * تفصيل مدفوعات الطلب إلى «كاش» و«شبكة».
 * ─────────────────────────────────────────────────────────────
 * وحدة نقيّة (بدون أسرار ولا استيراد جانبي) — تُستخدم في المتصفح والخادم معاً:
 *   • عرض تفصيل الكاش/الشبكة على الطلبات وفي الطباعة.
 *   • حساب «مبلغ الشبكة» المُرسَل تلقائياً إلى المحاسبة (الأستاذ).
 *
 * النموذج:
 *   • ما قبل التسليم = deposit_amount، وتُقرأ قيم الكاش والشبكة الصريحة عند توفرها.
 *   • المتبقي  = ما دُفع عند التسليم = paid_amount − deposit_amount عبر remaining_payment_method.
 * عند وجود split تُقرأ القيم الصريحة للكاش والشبكة، وأي طريقة أخرى غير «cash»
 * تُعامَل كشبكة (card / bank_transfer / check).
 */

export type RemainingPaymentMethod = 'cash' | 'card' | 'split'

export interface RemainingPaymentDetails {
  method: RemainingPaymentMethod
  cashAmount: number
  networkAmount: number
}

export type PayMethod =
  | RemainingPaymentMethod
  | 'bank_transfer'
  | 'check'
  | null
  | undefined

/** هل طريقة الدفع «شبكة»؟ split ليس طريقة منفردة وتُقرأ مبالغه من الحقول الصريحة. */
export function isNetworkMethod(method: PayMethod): boolean {
  return !!method && method !== 'cash' && method !== 'split'
}

export interface OrderPaymentInput {
  price?: number | null
  paid_amount?: number | null
  deposit_amount?: number | null
  /** طريقة دفع العربون */
  payment_method?: PayMethod
  /** إجمالي ما دُفع كاش قبل التسليم */
  pre_delivery_cash_amount?: number | null
  /** إجمالي ما دُفع شبكة قبل التسليم */
  pre_delivery_network_amount?: number | null
  /** طريقة دفع المتبقي عند التسليم */
  remaining_payment_method?: PayMethod
  /** مبلغ الكاش من الدفعة المتبقية عند وجود توزيع صريح */
  remaining_cash_amount?: number | null
  /** مبلغ الشبكة من الدفعة المتبقية عند وجود توزيع صريح */
  remaining_network_amount?: number | null
}

export interface PaymentBreakdown {
  /** مقدار العربون (ما دُفع قبل التسليم) */
  depositAmount: number
  /** مقدار المتبقي المُحصَّل عند التسليم */
  remainingCollected: number
  /** إجمالي ما دُفع نقداً (كاش) */
  cashTotal: number
  /** إجمالي ما دُفع عبر الشبكة */
  networkTotal: number
}

/**
 * يحسب تفصيل الكاش/الشبكة لطلب.
 * عند غياب deposit_amount (طلبات قديمة) نعتبر كامل المدفوع عربوناً بطريقة payment_method.
 */
export function computePaymentBreakdown(order: OrderPaymentInput): PaymentBreakdown {
  const paid = Number(order?.paid_amount) || 0
  const hasExplicitPreDeliveryAmounts =
    order?.pre_delivery_cash_amount != null ||
    order?.pre_delivery_network_amount != null
  const explicitPreDeliveryCash = Math.max(0, Number(order?.pre_delivery_cash_amount) || 0)
  const explicitPreDeliveryNetwork = Math.max(0, Number(order?.pre_delivery_network_amount) || 0)
  const explicitPreDeliveryTotal = explicitPreDeliveryCash + explicitPreDeliveryNetwork
  const depositAmount = hasExplicitPreDeliveryAmounts
    ? explicitPreDeliveryTotal
    : order?.deposit_amount != null ? Number(order.deposit_amount) || 0 : paid
  // المتبقي المُحصَّل = ما دُفع فوق العربون (لا يقل عن صفر)
  const remainingCollected = Math.max(0, paid - depositAmount)

  const depositIsNet = isNetworkMethod(order?.payment_method)
  const remainingIsNet = isNetworkMethod(order?.remaining_payment_method)
  const hasExplicitRemainingSplit =
    order?.remaining_cash_amount != null || order?.remaining_network_amount != null
  const explicitRemainingCash = Math.max(0, Number(order?.remaining_cash_amount) || 0)
  const explicitRemainingNetwork = Math.max(0, Number(order?.remaining_network_amount) || 0)

  const networkTotal =
    (hasExplicitPreDeliveryAmounts
      ? explicitPreDeliveryNetwork
      : depositIsNet ? depositAmount : 0) +
    (hasExplicitRemainingSplit
      ? explicitRemainingNetwork
      : remainingIsNet ? remainingCollected : 0)
  const cashTotal =
    (hasExplicitPreDeliveryAmounts
      ? explicitPreDeliveryCash
      : depositIsNet ? 0 : depositAmount) +
    (hasExplicitRemainingSplit
      ? explicitRemainingCash
      : remainingIsNet ? 0 : remainingCollected)

  return { depositAmount, remainingCollected, cashTotal, networkTotal }
}
