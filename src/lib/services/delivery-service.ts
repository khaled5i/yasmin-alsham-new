/**
 * مساعدات تسليم الطلب — موحّدة عبر كل نقاط التحويل إلى «تم التسليم».
 * ─────────────────────────────────────────────────────────────
 * الغرض من التوحيد:
 *   • بناء تحديثات التسليم بشكل متّسق (لقطة العربون + طريقة دفع المتبقي).
 *   • الإرسال التلقائي «مبلغ الشبكة فقط» للمحاسبة (الأستاذ) من أي مكان في الموقع.
 *
 * لا يُرسِل الزرُّ اليدوي (فوق كل طلب) عبر هذا المسار — يبقى يُرسل الفاتورة كاملة.
 */

import toast from 'react-hot-toast'
import { getAutoSendEnabled, sendInvoiceToAlostaz } from './alostaz-client'
import {
  createTailoringReceiptPayload,
  isFullyNetworkPaid,
  type TailoringReceiptOrder,
} from '@/lib/print-tailoring-receipt'
import { dispatchTailoringReceiptPrint } from './tailoring-receipt-printer'
import type {
  RemainingPaymentDetails,
  RemainingPaymentMethod,
} from '@/lib/payment-breakdown'

export interface DeliveryUpdateOptions {
  /** هل نُعلّم المتبقي كمدفوع (paid_amount = price)؟ */
  markAsPaid: boolean
  /** توزيع الدفعة المتبقية بين الكاش والشبكة عند markAsPaid */
  remainingPayment?: RemainingPaymentDetails | null
}

interface DeliveryOrder extends TailoringReceiptOrder {
  alostaz_invoice_id?: number | null
}

interface DeliveryUpdates {
  status: 'delivered'
  delivery_date: string
  deposit_amount: number
  pre_delivery_cash_amount: number
  pre_delivery_network_amount: number
  paid_amount?: number
  payment_status?: 'paid'
  remaining_payment_method?: RemainingPaymentMethod
  remaining_cash_amount?: number
  remaining_network_amount?: number
}

/**
 * يبني حِزمة تحديثات تحويل الطلب إلى «تم التسليم».
 * - يثبّت deposit_amount كلقطة حديثة لكل ما دُفع قبل التسليم لتفصيل الكاش/الشبكة لاحقاً.
 * - عند markAsPaid: paid_amount = السعر الكامل، والحالة «مدفوع»، مع تسجيل طريقة دفع المتبقي.
 */
export function buildDeliveryUpdates(order: DeliveryOrder | null | undefined, opts: DeliveryUpdateOptions) {
  const price = Number(order?.price) || 0
  const preDeliveryPaid = Number(order?.paid_amount) || 0
  const hasExplicitPreDeliveryAmounts =
    order?.pre_delivery_cash_amount != null ||
    order?.pre_delivery_network_amount != null
  const storedPreDeliveryCash = Math.max(0, Number(order?.pre_delivery_cash_amount) || 0)
  const storedPreDeliveryNetwork = Math.max(0, Number(order?.pre_delivery_network_amount) || 0)
  const storedPreDeliveryTotal = storedPreDeliveryCash + storedPreDeliveryNetwork
  const useStoredPreDeliveryAmounts =
    hasExplicitPreDeliveryAmounts &&
    Math.abs(storedPreDeliveryTotal - preDeliveryPaid) < 0.005
  const preDeliveryIsNetwork = order?.payment_method && order.payment_method !== 'cash'

  const updates: DeliveryUpdates = {
    status: 'delivered',
    delivery_date: new Date().toISOString(),
    // نأخذ لقطة فعلية لكل ما دُفع قبل لحظة التسليم. قد يكون المستخدم عدّل
    // paid_amount بعد إنشاء الطلب، لذلك لا نعتمد قيمة deposit_amount القديمة.
    deposit_amount: preDeliveryPaid,
    pre_delivery_cash_amount: useStoredPreDeliveryAmounts
      ? storedPreDeliveryCash
      : preDeliveryIsNetwork ? 0 : preDeliveryPaid,
    pre_delivery_network_amount: useStoredPreDeliveryAmounts
      ? storedPreDeliveryNetwork
      : preDeliveryIsNetwork ? preDeliveryPaid : 0,
  }

  if (opts.markAsPaid) {
    updates.paid_amount = price
    updates.payment_status = 'paid'

    if (opts.remainingPayment) {
      const cashAmount = Math.round(
        (Math.max(0, Number(opts.remainingPayment.cashAmount) || 0) + Number.EPSILON) * 100
      ) / 100
      const networkAmount = Math.round(
        (Math.max(0, Number(opts.remainingPayment.networkAmount) || 0) + Number.EPSILON) * 100
      ) / 100
      const expectedRemaining = Math.round(
        (Math.max(0, price - preDeliveryPaid) + Number.EPSILON) * 100
      ) / 100
      const allocatedTotal = cashAmount + networkAmount

      if (Math.abs(allocatedTotal - expectedRemaining) >= 0.005) {
        throw new Error('مجموع الكاش والشبكة يجب أن يساوي الدفعة المتبقية')
      }

      if (
        (opts.remainingPayment.method === 'cash' && (cashAmount <= 0 || networkAmount !== 0)) ||
        (opts.remainingPayment.method === 'card' && (networkAmount <= 0 || cashAmount !== 0))
      ) {
        throw new Error('قيمة الدفعة لا تطابق طريقة الدفع المحددة')
      }

      if (
        opts.remainingPayment.method === 'split' &&
        (cashAmount <= 0 || networkAmount <= 0)
      ) {
        throw new Error('الدفع كاش وشبكة يتطلب قيمة أكبر من صفر لكل طريقة')
      }

      updates.remaining_payment_method = opts.remainingPayment.method
      updates.remaining_cash_amount = Number(cashAmount.toFixed(2))
      updates.remaining_network_amount = Number(networkAmount.toFixed(2))
    }
  }

  return updates
}

async function printDeliveredOrderReceipt(
  order: DeliveryOrder,
  accountingInvoiceCode: string
): Promise<void> {
  try {
    const receipt = createTailoringReceiptPayload(order, accountingInvoiceCode)
    // فتح الدرج محصور في الطباعة التلقائية لحظة تسليم طلب التفصيل.
    // إعادة الطباعة اليدوية وبقية الأقسام لا تمرر هذا الخيار.
    await dispatchTailoringReceiptPrint(receipt, {
      openCashDrawer: receipt.cash_amount >= 0.005,
    })
    toast.success(`أُضيف إيصال الطلب ${receipt.order_number} إلى طابور الطباعة`, {
      icon: '🧾',
    })

    if (isFullyNetworkPaid(order) && receipt.invoice_code_source !== 'alostaz') {
      toast('تعذّر جلب رقم فاتورة الأستاذ؛ أُرسل رقم محلي مرتبط بالطلب إلى الطباعة.', {
        icon: '⚠️',
        duration: 5000,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '')
    toast.error('تم التسليم، لكن تعذّرت طباعة الإيصال: ' + message)
  }
}

/**
 * إرسال «مبلغ الشبكة فقط» تلقائياً إلى المحاسبة بعد التسليم (إن كان الإرسال التلقائي مفعّلاً).
 * - للمدير فقط، وللطلبات غير المُرسَلة مسبقاً.
 * - إن كان مبلغ الشبكة صفراً (كل الدفعات كاش) لا تُنشأ فاتورة ولا تظهر رسالة.
 * - صامت عند الفشل: لا يُفشل التسليم بسبب المحاسبة.
 *
 * يُمرَّر الطلب بعد دمج تحديثات التسليم كي يعكس paid_amount/طريقة المتبقي الجديدة.
 */
export async function autoSendOnDelivery(order: DeliveryOrder | null | undefined, userRole?: string): Promise<void> {
  if (!order?.id) return

  let accountingInvoiceCode = String(order.alostaz_invoice_code || '').trim()
  const fullyNetworkPaid = isFullyNetworkPaid(order)

  // وجود أي كاش يعني أن رقم الإيصال محلي، لذلك لا نؤخر الطباعة وفتح الدرج
  // بانتظار اتصال المحاسبة. هذا يحافظ أيضاً على اتصال جسر أندرويد الذي جرى
  // تحضيره فور ضغطة زر التسليم.
  if (!fullyNetworkPaid) {
    await printDeliveredOrderReceipt(order, accountingInvoiceCode)
  }

  // نحافظ على السلوك المحاسبي الحالي (مبلغ الشبكة فقط، وللمدير عند تفعيل الإرسال).
  // عند الدفع شبكة بالكامل ننتظر النتيجة هنا كي يحمل الإيصال نفس رقم فاتورة الأستاذ.
  if (userRole === 'admin' && !order.alostaz_invoice_id) {
    try {
      const enabled = await getAutoSendEnabled()
      if (enabled) {
        const res = await sendInvoiceToAlostaz(order.id, { auto: true })
        accountingInvoiceCode = String(res.invoice_code || accountingInvoiceCode).trim()

        if (res.success && res.inProgress) {
          // استدعاء تسليم آخر سبق وحجز إرسال الفاتورة؛ لا نعرض نجاحاً مكرراً.
        } else if (res.success && res.isDraft) {
          toast(
            `مسودة اختبار أُنشئت في الأستاذ${res.invoice_code ? ' — ' + res.invoice_code : ''}`,
            { icon: '🧪' }
          )
        } else if (res.success && !res.alreadySent && !res.skipped) {
          toast.success(
            `تم إرسال مبلغ الشبكة للمحاسبة تلقائياً${res.invoice_code ? ' — ' + res.invoice_code : ''}`
          )
        } else if (!res.success) {
          toast.error('تعذّر الإرسال التلقائي للمحاسبة: ' + (res.error || ''))
        }
      }
    } catch {
      // فشل المحاسبة لا يلغي التسليم ولا يمنع طباعة إيصال إجمالي الطلب.
    }
  }

  // الدفع شبكة بالكامل يحتاج رقم فاتورة الأستاذ، لذا يُطبع بعد محاولة المحاسبة.
  if (fullyNetworkPaid) {
    await printDeliveredOrderReceipt(order, accountingInvoiceCode)
  }
}
