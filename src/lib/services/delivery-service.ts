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

export type RemainingMethod = 'cash' | 'card'

export interface DeliveryUpdateOptions {
  /** هل نُعلّم المتبقي كمدفوع (paid_amount = price)؟ */
  markAsPaid: boolean
  /** طريقة دفع المتبقي عند markAsPaid (كاش/شبكة) */
  remainingMethod?: RemainingMethod | null
}

/**
 * يبني حِزمة تحديثات تحويل الطلب إلى «تم التسليم».
 * - يثبّت deposit_amount (لقطة العربون = ما دُفع قبل التسليم) لتفصيل الكاش/الشبكة لاحقاً.
 * - عند markAsPaid: paid_amount = السعر الكامل، والحالة «مدفوع»، مع تسجيل طريقة دفع المتبقي.
 */
export function buildDeliveryUpdates(order: any, opts: DeliveryUpdateOptions) {
  const price = Number(order?.price) || 0
  const preDeliveryPaid = Number(order?.paid_amount) || 0

  const updates: any = {
    status: 'delivered',
    delivery_date: new Date().toISOString(),
    // العربون = deposit_amount المحفوظ (منذ الإنشاء) أو لقطة المدفوع قبل التسليم (طلبات قديمة)
    deposit_amount:
      order?.deposit_amount != null ? Number(order.deposit_amount) : preDeliveryPaid,
  }

  if (opts.markAsPaid) {
    updates.paid_amount = price
    updates.payment_status = 'paid'
    if (opts.remainingMethod) updates.remaining_payment_method = opts.remainingMethod
  }

  return updates
}

/**
 * إرسال «مبلغ الشبكة فقط» تلقائياً إلى المحاسبة بعد التسليم (إن كان الإرسال التلقائي مفعّلاً).
 * - للمدير فقط، وللطلبات غير المُرسَلة مسبقاً.
 * - إن كان مبلغ الشبكة صفراً (كل الدفعات كاش) لا تُنشأ فاتورة ولا تظهر رسالة.
 * - صامت عند الفشل: لا يُفشل التسليم بسبب المحاسبة.
 *
 * يُمرَّر الطلب بعد دمج تحديثات التسليم كي يعكس paid_amount/طريقة المتبقي الجديدة.
 */
export async function autoSendOnDelivery(order: any, userRole?: string): Promise<void> {
  try {
    if (userRole !== 'admin') return
    if (!order?.id || order.alostaz_invoice_id) return

    const enabled = await getAutoSendEnabled()
    if (!enabled) return

    const res = await sendInvoiceToAlostaz(order.id, { auto: true })

    if (res.skipped) return // لا مبلغ شبكة → لا فاتورة (صامت)

    if (res.success && res.isDraft) {
      toast(
        `مسودة اختبار أُنشئت في الأستاذ${res.invoice_code ? ' — ' + res.invoice_code : ''}`,
        { icon: '🧪' }
      )
    } else if (res.success && !res.alreadySent) {
      toast.success(
        `تم إرسال مبلغ الشبكة للمحاسبة تلقائياً${res.invoice_code ? ' — ' + res.invoice_code : ''}`
      )
    } else if (!res.success) {
      toast.error('تعذّر الإرسال التلقائي للمحاسبة: ' + (res.error || ''))
    }
  } catch {
    /* صامت */
  }
}
