/**
 * تفصيل مدفوعات الطلب إلى «كاش» و«شبكة».
 * ─────────────────────────────────────────────────────────────
 * وحدة نقيّة (بدون أسرار ولا استيراد جانبي) — تُستخدم في المتصفح والخادم معاً:
 *   • عرض تفصيل الكاش/الشبكة على الطلبات وفي الطباعة.
 *   • حساب «مبلغ الشبكة» المُرسَل تلقائياً إلى المحاسبة (الأستاذ).
 *
 * النموذج: لكل طلب دفعتان كحدٍّ أقصى
 *   • العربون  = deposit_amount (كل ما دُفع قبل التسليم) عبر payment_method.
 *   • المتبقي  = ما دُفع عند التسليم = paid_amount − deposit_amount عبر remaining_payment_method.
 * أي طريقة غير «cash» تُعامَل كشبكة (card / bank_transfer / check).
 */

export type PayMethod = 'cash' | 'card' | 'bank_transfer' | 'check' | null | undefined

/** هل طريقة الدفع «شبكة»؟ (أي شيء غير النقد الصريح). */
export function isNetworkMethod(method: PayMethod): boolean {
  return !!method && method !== 'cash'
}

export interface OrderPaymentInput {
  price?: number | null
  paid_amount?: number | null
  deposit_amount?: number | null
  /** طريقة دفع العربون */
  payment_method?: PayMethod
  /** طريقة دفع المتبقي عند التسليم */
  remaining_payment_method?: PayMethod
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
  const depositAmount =
    order?.deposit_amount != null ? Number(order.deposit_amount) || 0 : paid
  // المتبقي المُحصَّل = ما دُفع فوق العربون (لا يقل عن صفر)
  const remainingCollected = Math.max(0, paid - depositAmount)

  const depositIsNet = isNetworkMethod(order?.payment_method)
  const remainingIsNet = isNetworkMethod(order?.remaining_payment_method)

  const networkTotal =
    (depositIsNet ? depositAmount : 0) + (remainingIsNet ? remainingCollected : 0)
  // ما تبقّى من المدفوع الكلي هو نقدي
  const cashTotal = Math.max(0, depositAmount + remainingCollected - networkTotal)

  return { depositAmount, remainingCollected, cashTotal, networkTotal }
}
