/**
 * WhatsApp Utility Functions
 * تجهيز وإرسال رسائل واتساب للعملاء
 */

import { formatGregorianDate, shiftDate } from '../lib/date-utils'
import {
  formatCouponExpiry,
  issueDeliveryCoupon,
  type DeliveryDiscountCoupon,
} from '../lib/services/discount-coupon-service'

/**
 * هل نعمل داخل تطبيق Capacitor؟
 * نقرأ الكائن العام الذي يحقنه التطبيق بدل استيراد @capacitor/core،
 * كي لا يدخل الحزمة في بناء الويب (SSR) بلا حاجة.
 */
function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean }
  }).Capacitor
  return capacitor?.isNativePlatform?.() === true
}

/** عرض نسبة الخصم بلا كسور زائدة: 20 لا 20.00 */
function formatDiscountPercent(percent: number | null | undefined): string {
  const value = Number(percent) || 0
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '')
}

interface OrderDetails {
  clientName: string
  clientPhone: string
  orderNumber?: string
  proofDeliveryDate?: string
  dueDate: string
  hasSecondProof?: boolean
  // موعد البروفا الثانية المُعدّل يدوياً (إن غاب يُحسب كـ dueDate - 3 أيام)
  secondProofDate?: string
  totalPrice?: number
  paidAmount?: number
  remainingAmount?: number
}

interface AlterationDetails {
  clientName: string
  clientPhone: string
  alterationNumber?: string
  dueDate?: string | null
}

/**
 * تنسيق رقم الهاتف للصيغة الدولية السعودية
 * @param phone - رقم الهاتف المدخل
 * @returns رقم الهاتف بالصيغة الدولية (966xxxxxxxxx)
 */
export function formatPhoneNumber(phone: string): string {
  // إزالة جميع المسافات والرموز
  let cleanPhone = phone.replace(/[\s\-\(\)]/g, '')

  // إزالة علامة + إذا كانت موجودة
  cleanPhone = cleanPhone.replace(/^\+/, '')

  // إذا كان الرقم يبدأ برمز الدولة 966
  if (cleanPhone.startsWith('966')) {
    return cleanPhone
  }

  // إذا كان الرقم يبدأ بصفر (رقم محلي سعودي)
  if (cleanPhone.startsWith('0')) {
    // حذف الصفر وإضافة رمز السعودية
    return '966' + cleanPhone.substring(1)
  }

  // إذا كان الرقم بدون صفر وبدون رمز دولة (افتراض أنه رقم سعودي)
  if (cleanPhone.length === 9) {
    return '966' + cleanPhone
  }

  // إرجاع الرقم كما هو إذا لم يتطابق مع أي حالة
  return cleanPhone
}

/**
 * تنسيق التاريخ بصيغة عربية مقروءة
 * @param dateString - التاريخ بصيغة YYYY-MM-DD
 * @returns التاريخ بصيغة عربية (مثل: الأحد 15 يناير 2026)
 */
export function formatDateArabic(dateString: string): string {
  if (!dateString) return ''

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }

  return formatGregorianDate(dateString, 'ar-SA-u-nu-latn', options)
}

/**
 * تجهيز نص رسالة واتساب للعميل
 * @param orderDetails - تفاصيل الطلب
 * @returns نص الرسالة المنسق
 */
export function generateWhatsAppMessage(orderDetails: OrderDetails): string {
  const {
    clientName,
    orderNumber,
    proofDeliveryDate,
    dueDate,
    hasSecondProof,
    secondProofDate,
    totalPrice,
    paidAmount,
    remainingAmount
  } = orderDetails

  // تنسيق التواريخ
  const formattedDueDate = formatDateArabic(dueDate)
  const formattedProofDate = proofDeliveryDate ? formatDateArabic(proofDeliveryDate) : null
  // موعد البروفا الثانية = الموعد المُعدّل يدوياً إن وُجد، وإلا التاريخ الذي تراه الزبونة - 3 أيام
  const formattedSecondProofDate = hasSecondProof && dueDate
    ? formatDateArabic(secondProofDate || shiftDate(dueDate, -3))
    : null

  // بناء الرسالة بدون إيموجيات
  let message = `مرحباً ${clientName}\n\n`
  message += `تم تسجيل طلبك الجديد بنجاح!\n\n`
  message += `*تفاصيل الطلب:*\n`

  // إضافة رقم الطلب إذا كان موجوداً
  if (orderNumber) {
    message += `- رقم الطلب: ${orderNumber}\n`
  }

  // إضافة السعر الكلي إذا كان موجوداً
  if (totalPrice !== undefined && totalPrice > 0) {
    message += `- السعر الكلي: ${totalPrice.toFixed(2)} ر.س\n`
  }

  // إضافة الدفعة المتبقية أو المبلغ المدفوع كاملاً
  if (remainingAmount !== undefined && remainingAmount > 0) {
    message += `- الدفعة المتبقية: ${remainingAmount.toFixed(2)} ر.س\n`
  } else if (remainingAmount === 0 && paidAmount !== undefined && paidAmount > 0) {
    message += `- المبلغ المدفوع: ${paidAmount.toFixed(2)} ر.س (تم الدفع كاملاً)\n`
  }

  // إضافة موعد تسليم البروفا إذا كان موجوداً
  if (formattedProofDate) {
    const proofLabel = hasSecondProof ? 'موعد تسليم البروفا الأولى' : 'موعد تسليم البروفا'
    message += `- ${proofLabel}: ${formattedProofDate}\n`
  }

  // إضافة موعد تسليم البروفا الثانية إذا كان موجوداً
  if (formattedSecondProofDate) {
    message += `- موعد تسليم البروفا الثانية: ${formattedSecondProofDate}\n`
  }

  // إضافة موعد التسليم النهائي
  message += `- موعد التسليم النهائي: ${formattedDueDate}\n\n`

  // رابط التتبع: عند توفر رقم الطلب نضمّنه في الرابط ليُعبّأ ويُبحث تلقائياً عند فتح الصفحة
  const trackUrl = orderNumber
    ? `https://www.yasmin-alsham.fashion/track-order/?order=${encodeURIComponent(orderNumber)}`
    : `https://www.yasmin-alsham.fashion/track-order/`

  message += `*تتبع طلبك:*\n`
  message += `يمكنك متابعة حالة طلبك في أي وقت من خلال الرابط التالي:\n`
  message += `${trackUrl}\n\n`

  message += `*ملاحظة مهمة:*\n`
  message += `يُرجى الحضور في المواعيد المحددة لضمان استلام طلبك في الوقت المناسب.\n\n`

  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام`

  return message
}

/**
 * تجهيز رابط واتساب مع الرسالة
 * @param orderDetails - تفاصيل الطلب
 * @returns رابط WhatsApp API جاهز للفتح
 */
export function generateWhatsAppLink(orderDetails: OrderDetails): string {
  const { clientPhone } = orderDetails

  // تنسيق رقم الهاتف
  const formattedPhone = formatPhoneNumber(clientPhone)

  // تجهيز نص الرسالة
  const message = generateWhatsAppMessage(orderDetails)

  // تشفير الرسالة
  const encodedMessage = encodeURIComponent(message)

  // بناء رابط WhatsApp API
  const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodedMessage}`

  return whatsappLink
}

/**
 * فتح واتساب مع رسالة مجهزة
 * @param orderDetails - تفاصيل الطلب
 */
export function openWhatsApp(orderDetails: OrderDetails): void {
  const whatsappLink = generateWhatsAppLink(orderDetails)

  // فتح الرابط في نافذة جديدة
  window.open(whatsappLink, '_blank')
}

/**
 * تجهيز نص رسالة واتساب للعميل - خاص بالتعديلات
 * @param alterationDetails - تفاصيل طلب التعديل
 * @returns نص الرسالة المنسق
 */
export function generateAlterationWhatsAppMessage(alterationDetails: AlterationDetails): string {
  const {
    clientName,
    alterationNumber,
    dueDate
  } = alterationDetails

  // بناء الرسالة بدون إيموجيات
  let message = `مرحباً ${clientName}\n\n`
  message += `تم تسجيل طلب التعديل الخاص بك بنجاح!\n\n`
  message += `*تفاصيل التعديل:*\n`

  // إضافة رقم التعديل إذا كان موجوداً
  if (alterationNumber) {
    message += `- رقم التعديل: ${alterationNumber}\n`
  }

  // إضافة موعد التسليم عند تحديده فقط
  if (dueDate) {
    message += `- موعد التسليم: ${formatDateArabic(dueDate)}\n\n`
  } else {
    message += `\n`
  }

  const trackUrl = alterationNumber
    ? `https://www.yasmin-alsham.fashion/track-order/?order=${encodeURIComponent(alterationNumber)}`
    : `https://www.yasmin-alsham.fashion/track-order/`

  message += `*تتبع طلب التعديل:*\n`
  message += `يمكنك متابعة حالة طلب التعديل في أي وقت من خلال الرابط التالي:\n`
  message += `${trackUrl}\n\n`

  if (dueDate) {
    message += `*ملاحظة مهمة:*\n`
    message += `يُرجى الحضور في الموعد المحدد لاستلام طلب التعديل.\n\n`
  }

  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام`

  return message
}

/**
 * تجهيز رابط واتساب مع الرسالة - خاص بالتعديلات
 * @param alterationDetails - تفاصيل طلب التعديل
 * @returns رابط WhatsApp API جاهز للفتح
 */
export function generateAlterationWhatsAppLink(alterationDetails: AlterationDetails): string {
  const { clientPhone } = alterationDetails

  // تنسيق رقم الهاتف
  const formattedPhone = formatPhoneNumber(clientPhone)

  // تجهيز نص الرسالة
  const message = generateAlterationWhatsAppMessage(alterationDetails)

  // تشفير الرسالة
  const encodedMessage = encodeURIComponent(message)

  // بناء رابط WhatsApp API
  const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodedMessage}`

  return whatsappLink
}

/**
 * فتح واتساب مع رسالة مجهزة - خاص بالتعديلات
 * @param alterationDetails - تفاصيل طلب التعديل
 */
export function openAlterationWhatsApp(alterationDetails: AlterationDetails): void {
  const whatsappLink = generateAlterationWhatsAppLink(alterationDetails)

  // فتح الرابط في نافذة جديدة
  window.open(whatsappLink, '_blank')
}

/**
 * تجهيز رسالة "جاهز للاستلام" للطلبات المكتملة
 * @param clientName - اسم العميل
 * @returns نص الرسالة المنسق
 */
export function generateReadyForPickupMessage(clientName: string): string {
  let message = `مرحباً ${clientName}\n\n`
  message += `فستانك جاهز للاستلام!\n\n`
  message += `يمكنك الحضور خلال أوقات الدوام الرسمي لاستلام فستانك.\n\n`
  message += `*أوقات الدوام:*\n`
  message += `جميع أيام الأسبوع ماعدا الجمعة\n`
  message += `من الساعة 4 عصراً إلى الساعة 10 مساءً\n\n`
  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام`

  return message
}

/**
 * تجهيز رسالة "تم التسليم" بعد استلام العميل للطلب
 * @param clientName - اسم العميل
 * @param coupon - كود خصم الهدية (اختياري) — يُدرَج كقسم مستقل بعد خبر التسليم
 * @returns نص الرسالة المنسق
 */
export function generateDeliveredMessage(
  clientName: string,
  coupon?: DeliveryDiscountCoupon | null
): string {
  let message = `مرحباً ${clientName}\n\n`
  message += `لقد تم تسليم فستانك بنجاح!\n\n`

  // هدية الخصم تظهر فقط عند نجاح توليد الكود، فلا تَعِد الرسالة بما لا يوجد
  if (coupon?.code) {
    const percent = formatDiscountPercent(coupon.discount_percent)
    const expiry = formatCouponExpiry(coupon.expires_at)
    message += `🎁 *هدية خاصة لكِ:*\n`
    message += `كود خصم ${percent}% على مشترياتك من *محل ياسمين الشام للأقمشة*\n`
    message += `*الكود: ${coupon.code}*\n`
    message += expiry
      ? `صالح لمدة شهر — حتى ${expiry}\n\n`
      : `صالح لمدة شهر من تاريخه\n\n`
    message += `يمكنك إستخدامه بشكل شخصي أو إهدائه لمن تحبين\n\n`
  }

  message += `رابط المتجر الإلكتروني\n`
  message += `https://www.yasmin-alsham.fashion/fabrics\n\n`
  message += `موقع المحل\n`
  message += `مقابل متجر ياسمين الشام للخياطة في الجهة المقابلة`

  return message
}

/**
 * تجهيز رسالة "البروفا الثانية جاهزة للاستلام"
 * تُرسَل من مركز إشعارات المدير عندما يُبلّغ العامل بجهوزية البروفا الثانية.
 * @param clientName - اسم العميل
 * @returns نص الرسالة المنسق
 */
export function generateSecondProofReadyMessage(clientName: string): string {
  let message = `السلام عليكم${clientName ? ` ${clientName}` : ''}\n\n`
  message += `البروفا الثانية جاهزة للاستلام، يمكنك مراجعة المشغل النسائي خلال أوقات الدوام من الساعة 4 إلى 10.\n\n`
  message += `يرجى الحضور في الموعد بأسرع وقت ممكن لتفادي وقوع أية مشاكل.\n\n`
  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام`

  return message
}

/**
 * إرسال رسالة "البروفا الثانية جاهزة" عبر واتساب
 * @param clientName - اسم العميل
 * @param clientPhone - رقم هاتف العميل
 */
export function sendSecondProofReadyWhatsApp(clientName: string, clientPhone: string): void {
  const formattedPhone = formatPhoneNumber(clientPhone)
  const message = generateSecondProofReadyMessage(clientName)
  const encodedMessage = encodeURIComponent(message)
  window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank')
}

/**
 * إرسال رسالة "جاهز للاستلام" عبر واتساب
 * @param clientName - اسم العميل
 * @param clientPhone - رقم هاتف العميل
 */
export function sendReadyForPickupWhatsApp(clientName: string, clientPhone: string): void {
  // تنسيق رقم الهاتف
  const formattedPhone = formatPhoneNumber(clientPhone)

  // تجهيز نص الرسالة
  const message = generateReadyForPickupMessage(clientName)

  // تشفير الرسالة
  const encodedMessage = encodeURIComponent(message)

  // بناء رابط WhatsApp API
  const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodedMessage}`

  // فتح الرابط في نافذة جديدة
  window.open(whatsappLink, '_blank')
}

/**
 * إرسال رسالة "تم التسليم" عبر واتساب مع كود خصم الهدية.
 *
 * يُولَّد لكل طلب مُسلَّم كود خصم 20% صالح شهراً يُستخدَم في محل الأقمشة.
 * التوليد idempotent: إعادة فتح الرسالة لنفس الطلب تُعيد الكود نفسه ما دام
 * سارياً وغير مستخدَم. عند غياب معرّف الطلب أو فشل التوليد تُرسَل الرسالة
 * كما كانت بدون كود، فلا يتعطّل إشعار التسليم بسبب الهدية.
 *
 * على المتصفح تُفتح النافذة فوراً داخل سياق نقرة المستخدم ثم يُوجَّه عنوانها
 * بعد وصول الكود، لأن window.open بعد await يُحجَب في بعض المتصفحات. على
 * التطبيق (Capacitor) لا نفعل ذلك: هناك يفتح `_blank` تطبيق واتساب مباشرة
 * وصفحة فارغة وسيطة تُفسد الانتقال.
 *
 * @param clientName - اسم العميل
 * @param clientPhone - رقم هاتف العميل
 * @param orderId - معرّف الطلب المُسلَّم (بدونه تُرسَل الرسالة بلا كود)
 */
export async function sendDeliveredWhatsApp(
  clientName: string,
  clientPhone: string,
  orderId?: string | null
): Promise<DeliveryDiscountCoupon | null> {
  // تنسيق رقم الهاتف
  const formattedPhone = formatPhoneNumber(clientPhone)

  // فتح النافذة الآن (ضمن سياق النقرة) لتفادي حجب النوافذ المنبثقة في المتصفح
  const popup = isCapacitorNative() ? null : window.open('', '_blank')

  // توليد كود الهدية — لا يمنع الإرسال إن فشل
  const coupon = await issueDeliveryCoupon({
    orderId,
    clientName,
    clientPhone: formattedPhone,
  })

  // تجهيز نص الرسالة
  const message = generateDeliveredMessage(clientName, coupon)

  // تشفير الرسالة
  const encodedMessage = encodeURIComponent(message)

  // بناء رابط WhatsApp API
  const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodedMessage}`

  // توجيه النافذة المفتوحة، أو فتح واحدة جديدة إن حُجبت الأولى
  if (popup && !popup.closed) {
    popup.location.href = whatsappLink
  } else {
    window.open(whatsappLink, '_blank')
  }

  return coupon
}
