/**
 * حالات طلبات المتجر الإلكتروني ورسائل الزبونة (المرحلة 7) — وحدة نقية بلا 'use client'،
 * يستعملها قسم «طلبات المتجر» في اللوحة وصفحة تتبّع الزبونة.
 *
 * المفتاح: `NEXT_PUBLIC_FABRIC_STORE_ORDERS_ENABLED` للواجهة، و`FABRIC_STORE_ORDERS_ENABLED`
 * على الخادم. **مستقل عن مفتاح الدفع**: إيقاف الدفع الجديد لا يوقف تجهيز الطلبات المدفوعة
 * ولا تتبّعها (الخطة: «أوقف إنشاء دفعات جديدة مع استمرار ... الاسترداد»).
 */

export const IS_FABRIC_STORE_ORDERS_ENABLED =
  (process.env.NEXT_PUBLIC_FABRIC_STORE_ORDERS_ENABLED ?? '').trim().toLowerCase() === 'true'

/** المرحلة 8: أقسام الاسترداد وإعادة المخزون والإشعار الدائن في اللوحة (والخادم بمفتاحه). */
export const IS_FABRIC_STORE_REFUNDS_ENABLED =
  (process.env.NEXT_PUBLIC_FABRIC_STORE_REFUNDS_ENABLED ?? '').trim().toLowerCase() === 'true'

export type FabricStorePaymentStatus =
  | 'pending' | 'authorized' | 'paid' | 'failed' | 'partially_refunded' | 'refunded'
export type FabricStoreFulfillmentStatus =
  | 'unfulfilled' | 'preparing' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'cancelled'
export type FabricStoreDeliveryMethod = 'pickup' | 'shipping'

export const PAYMENT_STATUS_LABELS: Record<FabricStorePaymentStatus, string> = {
  pending: 'بانتظار الدفع',
  authorized: 'مفوَّض (لم يُحصَّل)',
  paid: 'مدفوع',
  failed: 'فشل الدفع',
  partially_refunded: 'مسترد جزئياً',
  refunded: 'مسترد',
}

export const FULFILLMENT_STATUS_LABELS: Record<FabricStoreFulfillmentStatus, string> = {
  unfulfilled: 'لم يُجهَّز',
  preparing: 'قيد التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
}

/** خطوات التتبّع كما تراها الزبونة، بحسب طريقة الاستلام. */
export function customerSteps(method: FabricStoreDeliveryMethod): Array<{ key: string; label: string }> {
  return [
    { key: 'paid', label: 'تم الدفع' },
    { key: 'preparing', label: 'قيد التجهيز' },
    method === 'pickup'
      ? { key: 'ready_for_pickup', label: 'جاهز للاستلام من المحل' }
      : { key: 'shipped', label: 'تم الشحن' },
    { key: 'delivered', label: method === 'pickup' ? 'تم الاستلام' : 'تم التسليم' },
  ]
}

/** رقم الخطوة الحالية (0 = لم يُدفع بعد) للخطوات أعلاه. */
export function customerStepIndex(payment: string, fulfillment: string): number {
  if (!['paid', 'partially_refunded', 'refunded'].includes(payment)) return 0
  switch (fulfillment) {
    case 'preparing': return 2
    case 'ready_for_pickup':
    case 'shipped': return 3
    case 'delivered': return 4
    default: return 1
  }
}

/** `+9665XXXXXXXX` ⇒ `9665XXXXXXXX` لرابط wa.me. */
export function whatsappNumber(e164: string): string {
  return String(e164 || '').replace(/\D/g, '')
}

export interface CustomerMessageInput {
  customerName: string
  orderNumber: string
  deliveryMethod: FabricStoreDeliveryMethod
  fulfillmentStatus: string
  carrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  pickupAddress?: string | null
}

/** نص رسالة واتساب للزبونة بحسب حالة الطلب (بلا إيموجي، مثل رسائل التسليم الحالية). */
export function customerWhatsAppMessage(input: CustomerMessageInput): string {
  const firstName = String(input.customerName || '').trim().split(/\s+/)[0] || ''
  const lines = [`مرحباً ${firstName}`.trim(), '']
  switch (input.fulfillmentStatus) {
    case 'preparing':
      lines.push(`بدأنا تجهيز طلبك رقم ${input.orderNumber} من متجر الأقمشة.`)
      break
    case 'ready_for_pickup':
      lines.push(`طلبك رقم ${input.orderNumber} جاهز للاستلام من المحل.`)
      if (input.pickupAddress) lines.push(`العنوان: ${input.pickupAddress}`)
      break
    case 'shipped':
      lines.push(`تم شحن طلبك رقم ${input.orderNumber}.`)
      if (input.carrier) lines.push(`شركة الشحن: ${input.carrier}`)
      if (input.trackingNumber) lines.push(`رقم البوليصة: ${input.trackingNumber}`)
      break
    case 'delivered':
      lines.push(`تم تسليم طلبك رقم ${input.orderNumber}. شكراً لتسوقك من متجرنا.`)
      break
    default:
      lines.push(`بخصوص طلبك رقم ${input.orderNumber} من متجر الأقمشة.`)
  }
  if (input.trackingUrl && input.fulfillmentStatus !== 'delivered') {
    lines.push('', `تتبّعي طلبك: ${input.trackingUrl}`)
  }
  return lines.join('\n')
}

export function customerWhatsAppLink(phoneE164: string, input: CustomerMessageInput): string {
  return `https://wa.me/${whatsappNumber(phoneE164)}?text=${encodeURIComponent(customerWhatsAppMessage(input))}`
}
