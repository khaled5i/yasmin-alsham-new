/**
 * WhatsApp Utility Functions
 * تجهيز وإرسال رسائل واتساب للعملاء
 */

interface OrderDetails {
  clientName: string
  clientPhone: string
  orderNumber?: string
  proofDeliveryDate?: string
  dueDate: string
}

interface AlterationDetails {
  clientName: string
  clientPhone: string
  alterationNumber?: string
  dueDate: string
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

  const date = new Date(dateString)
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }

  return date.toLocaleDateString('ar-SA', options)
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
    dueDate
  } = orderDetails

  // تنسيق التواريخ
  const formattedDueDate = formatDateArabic(dueDate)
  const formattedProofDate = proofDeliveryDate ? formatDateArabic(proofDeliveryDate) : null

  // بناء الرسالة بدون إيموجيات
  let message = `مرحباً ${clientName}\n\n`
  message += `تم تسجيل طلبك الجديد بنجاح!\n\n`
  message += `*تفاصيل الطلب:*\n`

  // إضافة رقم الطلب إذا كان موجوداً
  if (orderNumber) {
    message += `- رقم الطلب: ${orderNumber}\n`
  }

  // إضافة موعد تسليم البروفا إذا كان موجوداً
  if (formattedProofDate) {
    message += `- موعد تسليم البروفا: ${formattedProofDate}\n`
  }

  // إضافة موعد التسليم النهائي
  message += `- موعد التسليم النهائي: ${formattedDueDate}\n\n`

  message += `*تتبع طلبك:*\n`
  message += `يمكنك متابعة حالة طلبك في أي وقت من خلال الرابط التالي:\n`
  message += `https://www.yasmin-alsham.fashion/track-order/\n\n`

  message += `*ملاحظة مهمة:*\n`
  message += `يُرجى الحضور في المواعيد المحددة لضمان استلام طلبك في الوقت المناسب.\n\n`

  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام للأزياء`

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

  // تنسيق التاريخ
  const formattedDueDate = formatDateArabic(dueDate)

  // بناء الرسالة بدون إيموجيات
  let message = `مرحباً ${clientName}\n\n`
  message += `تم تسجيل طلب التعديل الخاص بك بنجاح!\n\n`
  message += `*تفاصيل التعديل:*\n`

  // إضافة رقم التعديل إذا كان موجوداً
  if (alterationNumber) {
    message += `- رقم التعديل: ${alterationNumber}\n`
  }

  // إضافة موعد التسليم
  message += `- موعد التسليم: ${formattedDueDate}\n\n`

  message += `*تتبع طلب التعديل:*\n`
  message += `يمكنك متابعة حالة طلب التعديل في أي وقت من خلال الرابط التالي:\n`
  message += `https://www.yasmin-alsham.fashion/track-order/\n\n`

  message += `*ملاحظة مهمة:*\n`
  message += `يُرجى الحضور في الموعد المحدد لاستلام طلب التعديل.\n\n`

  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام للأزياء`

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
  message += `ياسمين الشام للأزياء`

  return message
}

/**
 * تجهيز رسالة "تم التسليم" بعد استلام العميل للطلب
 * @param clientName - اسم العميل
 * @returns نص الرسالة المنسق
 */
export function generateDeliveredMessage(clientName: string): string {
  let message = `مرحباً ${clientName}\n\n`
  message += `لقد تم تسليم فستانك بنجاح!\n\n`
  message += `نأمل أن ينال إعجابك.\n\n`
  message += `*تقييمك يهمنا:*\n`
  message += `يمكنك ترك تعليق لطيف لنا عبر الرابط التالي:\n`
  message += `https://maps.app.goo.gl/oor8FHoTwaGS8GMb9\n\n`
  message += `ننتظر زيارتكم مرة أخرى\n\n`
  message += `شكراً لثقتكم بنا\n`
  message += `ياسمين الشام للأزياء`

  return message
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
 * إرسال رسالة "تم التسليم" عبر واتساب
 * @param clientName - اسم العميل
 * @param clientPhone - رقم هاتف العميل
 */
export function sendDeliveredWhatsApp(clientName: string, clientPhone: string): void {
  // تنسيق رقم الهاتف
  const formattedPhone = formatPhoneNumber(clientPhone)

  // تجهيز نص الرسالة
  const message = generateDeliveredMessage(clientName)

  // تشفير الرسالة
  const encodedMessage = encodeURIComponent(message)

  // بناء رابط WhatsApp API
  const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodedMessage}`

  // فتح الرابط في نافذة جديدة
  window.open(whatsappLink, '_blank')
}

