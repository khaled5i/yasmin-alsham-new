/**
 * بيانات المنشأة وقرارات سياسات متجر الأقمشة — مصدر واحد تقرأ منه صفحات السياسات
 * وفوتر المتجر وصفحة الدفع. ميسر ونظام التجارة الإلكترونية يشترطان إظهار هوية
 * المنشأة الرسمية ووقت التسليم وسياسة الاسترجاع قبل الدفع.
 *
 * قرارات المالك (28 سبتمبر 2026). أي تغيير في مضمون السياسات يستلزم رفع
 * `STORE_POLICIES_UPDATED_AT` و`FABRIC_STORE_POLICY_VERSIONS` معاً.
 */

export const STORE_ENTITY = {
  /** الاسم كما في السجل التجاري — يجب أن يطابق ما قُدِّم لميسر. */
  legalName: 'مؤسسة محمد عوض الدوسري',
  brandName: 'ياسمين الشام',
  commercialRegistration: '7023470284',
  vatNumber: '310937466300003',
  address: 'الخبر، حي الخبر الشمالية، شارع الأمير مشعل، الشارع السادس، الرمز البريدي 20363، المملكة العربية السعودية',
  city: 'الخبر',
} as const

/** رقم خدمة عملاء المتجر (اتصال وواتساب) للطلبات والشكاوى والإرجاع. */
export const STORE_SUPPORT_PHONE = {
  local: '0539686805',
  e164: '+966539686805',
  display: '+966 53 968 6805',
  whatsappUrl: 'https://wa.me/966539686805',
} as const

export const STORE_DELIVERY_TIMES = {
  pickup: 'في نفس يوم العمل للطلبات المدفوعة خلال ساعات عمل المحل، وما يُدفع بعد الإغلاق يُجهَّز في يوم العمل التالي',
  shipping: 'من 3 إلى 5 أيام عمل من تأكيد الدفع',
} as const

export const STORE_RETURN_RULES = {
  /** مدة إرجاع القطع الكاملة غير المقصوصة، ومدة الإبلاغ عن عيب — من تاريخ الاستلام. */
  returnWindowDays: 7,
  /** مدة إصدار الاسترداد بعد استلام القماش المرتجع وفحصه. */
  refundIssueBusinessDays: 3,
  /** مدة الرد على الشكاوى. */
  complaintResponseBusinessDays: 2,
} as const

export const STORE_PAYMENT_METHODS = ['مدى', 'Visa', 'Mastercard'] as const

export const STORE_POLICIES_UPDATED_AT = '28 سبتمبر 2026'

export const STORE_POLICY_LINKS = [
  { href: '/sales-terms', label: 'شروط البيع' },
  { href: '/return-policy', label: 'سياسة الاسترجاع والاستبدال' },
  { href: '/shipping-policy', label: 'الشحن والتوصيل' },
  { href: '/privacy-policy', label: 'سياسة الخصوصية' },
] as const
