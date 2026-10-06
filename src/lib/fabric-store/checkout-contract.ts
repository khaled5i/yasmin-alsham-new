/**
 * عقد صفحة الدفع لمتجر الأقمشة — مشترك بين المتصفح ومسارات الخادم.
 *
 * وحدة نقية بلا 'use client' (مثل pricing.ts): طرق الاستلام، وتطبيع الهاتف،
 * ومخططات الطلبات المقبولة، ورسائل الرفض. الخادم لا يثق بأي رقم من المتصفح:
 * يعيد التسعير بنفسه، وتتحقق القاعدة تحت القفل (المرحلتان 2 و3).
 *
 * المرحلة 4 من خطة الدفع: إنشاء الطلب وحجز القماش **بلا دفع**. كل شيء هنا خلف
 * مفتاحَين مطفأين افتراضياً (`IS_FABRIC_STORE_CHECKOUT_ENABLED` للواجهة، و
 * `FABRIC_STORE_CHECKOUT_ENABLED` على الخادم).
 */

import { z } from 'zod'
import { FABRIC_MAX_CM_PER_LINE, FABRIC_VAT_BASIS_POINTS, type FabricLineRejection, type FabricPurchaseMode } from './pricing'
import { divideRoundHalfUp } from './money'

// ============================================
// مفتاح الواجهة
// ============================================

/**
 * زر «إتمام الطلب» وصفحة الدفع. مطفأ ما لم يُضبط صراحةً
 * `NEXT_PUBLIC_FABRIC_STORE_CHECKOUT_ENABLED=true` (يُضمَّن وقت البناء).
 * مسارات الخادم لها مفتاحها المستقل وتردّ 404 ما دام مطفأً.
 */
export const IS_FABRIC_STORE_CHECKOUT_ENABLED =
  (process.env.NEXT_PUBLIC_FABRIC_STORE_CHECKOUT_ENABLED ?? '').trim().toLowerCase() === 'true'

/**
 * زر «ادفعي الآن» بعد إنشاء الطلب (المرحلة 5). مطفأ ما لم يُضبط
 * `NEXT_PUBLIC_FABRIC_STORE_PAYMENTS_ENABLED=true`. الخادم يتحقق من
 * `FABRIC_STORE_PAYMENTS_ENABLED` بنفسه.
 */
export const IS_FABRIC_STORE_PAYMENTS_ENABLED =
  (process.env.NEXT_PUBLIC_FABRIC_STORE_PAYMENTS_ENABLED ?? '').trim().toLowerCase() === 'true'

// ============================================
// ثوابت العمل
// ============================================

/**
 * مهلة الضغط على «ادفعي» بعد إنشاء الطلب (payment_due_at). منذ الدفعة B (AUD-02، قرار المالكة
 * 1 أكتوبر 2026) **لا يُحجز شيء عند إنشاء الطلب**؛ تفرضها القاعدة، وهنا للعرض فقط.
 */
export const FABRIC_STORE_HOLD_MINUTES = 30

/** مدة حجز القماش من لحظة الضغط على «ادفعي» (صفحة ميسر 20 دقيقة تنتهي قبله). للعرض فقط. */
export const FABRIC_STORE_PAYMENT_HOLD_MINUTES = 25

/** أسطر الطلب الإلكتروني الواحد (الدفعة B، قرار المالكة). السلة وعرض السعر يبقيان حتى FABRIC_STORE_MAX_LINES. */
export const FABRIC_STORE_MAX_ORDER_LINES = 5

/**
 * سقف مبلغ الطلب الإلكتروني الواحد: 20,000 ريال شاملة الضريبة. متوسط مبيعة المحل
 * ~363 ريال. يُراجَع مع حد العملية الواحدة لدى ميسر قبل الإطلاق (المرحلة 10).
 */
export const FABRIC_STORE_MAX_ORDER_TOTAL_HALALAS = 2_000_000

/** عدد أسطر السلة وعرض السعر الأقصى (= سقف السلة). الطلب نفسه حتى FABRIC_STORE_MAX_ORDER_LINES. */
export const FABRIC_STORE_MAX_LINES = 40

/**
 * إصدارات السياسات التي توافق عليها الزبونة: /sales-terms و/return-policy و/privacy-policy
 * (مضمونها في `src/lib/store-legal.ts`). أي تغيير في مضمون سياسة يرفع إصدارها.
 */
export const FABRIC_STORE_POLICY_VERSIONS = {
  terms: '2026-10-06', // المرحلة 10 B: الشحن شامل الضريبة ووسائل الدفع المعتمدة
  returns: '2026-09-28',
  privacy: '2026-10-05', // الدفعة D (AUD-10/07): الاستضافة خارج المملكة، Google Analytics، محو العنوان بعد 90 يوماً
} as const

// ============================================
// طرق الاستلام
// ============================================

export type FabricDeliveryMethod = 'pickup' | 'shipping'

export interface FabricDeliveryOption {
  method: FabricDeliveryMethod
  code: string
  label: string
  description: string
  /** رسوم الشحن قبل الضريبة (الضريبة 15% تُحسب على البنود + الشحن معاً). */
  shippingNetHalalas: number
  /** رسم ثابت شامل الضريبة: ما يظهر للزبونة وفي بند فاتورة الشحن. */
  shippingGrossHalalas: number
}

/** قرار المالكة 6 أكتوبر 2026: الشحن 50 ريالاً شاملة الضريبة، لا 50 + الضريبة. */
export const FABRIC_STORE_SHIPPING_GROSS_HALALAS = 5_000

/**
 * استلام من المحل أو شحن لكل مدن السعودية. قرار 6 أكتوبر 2026: رسم الشحن
 * ثابت شامل الضريبة؛ تختار المالكة الناقل عند أول طلب، والمدد الحالية باقية.
 * الصافي بالهللة مقرّب نصفاً للأعلى، وحصة ضريبة الشحن تثبّت المبلغ الشامل
 * في pricing.ts مع إبقاء ضريبة الطلب محسوبة مرة واحدة على مجموع الصافي.
 */
export const FABRIC_DELIVERY_OPTIONS: Record<FabricDeliveryMethod, FabricDeliveryOption> = {
  pickup: {
    method: 'pickup',
    code: 'shop_pickup',
    label: 'استلام من المحل',
    description: 'جاهز في نفس يوم العمل، ونبلغك حين يكون جاهزاً للاستلام.',
    shippingNetHalalas: 0,
    shippingGrossHalalas: 0,
  },
  shipping: {
    method: 'shipping',
    code: 'ksa_flat',
    label: 'شحن داخل السعودية',
    description: 'سعر موحّد لكل مدن المملكة — التوصيل من 3 إلى 5 أيام عمل.',
    shippingNetHalalas: divideRoundHalfUp(
      FABRIC_STORE_SHIPPING_GROSS_HALALAS * 10_000,
      10_000 + FABRIC_VAT_BASIS_POINTS
    ),
    shippingGrossHalalas: FABRIC_STORE_SHIPPING_GROSS_HALALAS,
  },
}

// ============================================
// الهاتف
// ============================================

const EASTERN_DIGITS = /[٠-٩۰-۹]/g

/** يحوّل الأرقام العربية والفارسية إلى لاتينية. */
export function toLatinDigits(value: string): string {
  return value.replace(EASTERN_DIGITS, digit => {
    const code = digit.charCodeAt(0)
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660)
  })
}

/**
 * جوال سعودي بأي صيغة شائعة ⇒ E.164 (`+9665XXXXXXXX`)، أو null.
 * 05XXXXXXXX · 5XXXXXXXX · 9665XXXXXXXX · 009665XXXXXXXX · +9665XXXXXXXX، بمسافات أو شرطات.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const compact = toLatinDigits(input).replace(/[\s\-().]/g, '')
  const match = /^(?:\+966|00966|966|0)?(5\d{8})$/.exec(compact)
  return match ? `+966${match[1]}` : null
}

// ============================================
// مخططات الطلبات
// ============================================

const cleanText = (min: number, max: number) =>
  z
    .string()
    .transform(value => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min).max(max))

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform(value => (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max))
    .transform(value => value || null)

const saudiMobile = z
  .string()
  .max(30)
  .transform((value, ctx) => {
    const phone = normalizeSaudiMobile(value)
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid-phone' })
      return z.NEVER
    }
    return phone
  })

const digitsOf = (length: number) =>
  z
    .string()
    .optional()
    .transform(value => toLatinDigits(value ?? '').replace(/\s/g, ''))
    .pipe(z.string().regex(new RegExp(`^(\\d{${length}})?$`)))
    .transform(value => value || null)

export const fabricCheckoutLineSchema = z.object({
  fabricId: z.string().uuid(),
  purchaseMode: z.enum(['meter', 'piece']),
  // أمتار للبيع بالمتر (خانتان على الأكثر — يتحقق منها pricing.ts)، و1 للقطعة.
  quantity: z.number().finite().positive().max(FABRIC_MAX_CM_PER_LINE / 100),
})

const linesSchema = z
  .array(fabricCheckoutLineSchema)
  .min(1)
  .max(FABRIC_STORE_MAX_LINES)
  .refine(lines => new Set(lines.map(line => line.fabricId)).size === lines.length, 'duplicate-fabric')

export const fabricQuoteRequestSchema = z.object({
  lines: linesSchema,
  deliveryMethod: z.enum(['pickup', 'shipping']).default('pickup'),
})

export type FabricQuoteRequest = z.infer<typeof fabricQuoteRequestSchema>

export const fabricAddressSchema = z
  .object({
    recipientName: cleanText(2, 120),
    recipientPhone: saudiMobile,
    city: cleanText(2, 60),
    district: optionalText(80),
    street: optionalText(120),
    buildingNumber: digitsOf(4),
    postalCode: digitsOf(5),
    additionalNumber: digitsOf(4),
    shortAddress: z
      .string()
      .optional()
      .transform(value => toLatinDigits(value ?? '').replace(/\s/g, '').toUpperCase())
      .pipe(z.string().regex(/^([A-Z]{4}\d{4})?$/))
      .transform(value => value || null),
    notes: optionalText(300),
  })
  // نفس قيد القاعدة: العنوان المختصر، أو الحي والشارع معاً. المسار يشير إلى
  // الحقل الناقص فعلاً حتى تعرف الزبونة ماذا تكتب (لا رسالة عامة).
  .superRefine((address, ctx) => {
    if (address.shortAddress || (address.district && address.street)) return
    const path = address.district ? ['street'] : address.street ? ['district'] : []
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'address-incomplete', path })
  })

export type FabricAddressInput = z.infer<typeof fabricAddressSchema>

export const fabricCustomerSchema = z.object({
  name: cleanText(2, 120),
  phone: saudiMobile,
  email: z
    .string()
    .max(254)
    .optional()
    .transform(value => (value ?? '').trim().toLowerCase())
    .pipe(z.union([z.literal(''), z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)]))
    .transform(value => value || null),
})

export const fabricCheckoutRequestSchema = z
  .object({
    checkoutKey: z.string().uuid(),
    lines: linesSchema,
    deliveryMethod: z.enum(['pickup', 'shipping']),
    customer: fabricCustomerSchema,
    address: fabricAddressSchema.optional().nullable(),
    acceptPolicies: z.literal(true),
    marketingOptIn: z.boolean().default(false),
    /** ما رأته الزبونة في الملخّص. إن اختلف عمّا يحسبه الخادم الآن يُعاد عرض السعر ولا يُنشأ طلب. */
    expectedTotalHalalas: z.number().int().positive(),
  })
  .refine(
    request => (request.deliveryMethod === 'shipping') === Boolean(request.address),
    'address-mismatch'
  )

export type FabricCheckoutRequest = z.infer<typeof fabricCheckoutRequestSchema>

/** حقول العميلة والعنوان وحدها — تتحقق منها صفحة الإتمام قبل الإرسال بنفس قواعد الخادم. */
export const fabricCheckoutFormSchema = z.object({
  customer: fabricCustomerSchema,
  address: fabricAddressSchema.nullable(),
})

const ADDRESS_FIELD_MESSAGES: Record<string, string> = {
  recipientName: 'اكتبي الاسم (حرفان على الأقل)',
  recipientPhone: 'رقم الجوال غير صحيح — اكتبيه مثل 05xxxxxxxx',
  city: 'اكتبي اسم المدينة',
  district: 'اسم الحي أطول من المسموح (80 حرفاً)',
  street: 'اسم الشارع أطول من المسموح (120 حرفاً)',
  buildingNumber: 'رقم المبنى يجب أن يكون 4 أرقام بالضبط، مثل 2929',
  postalCode: 'الرمز البريدي يجب أن يكون 5 أرقام بالضبط، مثل 12345',
  additionalNumber: 'الرقم الإضافي يجب أن يكون 4 أرقام بالضبط',
  shortAddress: 'العنوان المختصر غير صحيح — 4 حروف إنجليزية ثم 4 أرقام، مثل RRRD2929',
  notes: 'ملاحظات التوصيل أطول من 300 حرف',
}

/**
 * يحوّل أول خطأ تحقق إلى رسالة تسمّي الحقل والمشكلة بدقة.
 * مشترك بين صفحة الإتمام (قبل الإرسال) ومسار الخادم (بعده).
 */
export function describeFabricCheckoutIssue(issues: { path: (string | number)[]; message: string }[]): string {
  const first = issues[0]
  const path = first?.path ?? []
  const field = path.join('.')
  if (first?.message === 'invalid-phone') return 'رقم الجوال غير صحيح — اكتبيه مثل 05xxxxxxxx'
  if (first?.message === 'address-incomplete') {
    if (path[path.length - 1] === 'street') return 'اكتبي اسم الشارع — أو اكتبي العنوان المختصر بدلاً من الحي والشارع'
    if (path[path.length - 1] === 'district') return 'اكتبي اسم الحي — أو اكتبي العنوان المختصر بدلاً من الحي والشارع'
    return 'العنوان ناقص: اكتبي العنوان المختصر (مثل RRRD2929)، أو الحي والشارع معاً'
  }
  if (first?.message === 'address-mismatch') return 'الشحن يحتاج عنواناً، والاستلام من المحل لا يحتاجه'
  if (field.startsWith('customer.name')) return 'اكتبي الاسم (حرفان على الأقل)'
  if (field.startsWith('customer.email')) return 'البريد الإلكتروني غير صحيح — مثل name@example.com'
  if (path[0] === 'address') {
    const message = ADDRESS_FIELD_MESSAGES[String(path[1] ?? '')]
    if (message) return message
    return 'بيانات العنوان غير مكتملة أو غير صحيحة'
  }
  if (field.startsWith('acceptPolicies')) return 'يجب الموافقة على الشروط وسياسة الاسترجاع'
  return 'بيانات الطلب غير صالحة'
}

// ============================================
// الاستجابات
// ============================================

export interface QuotedFabricLine {
  fabricId: string
  /** 'ok' أو سبب الرفض من pricing.ts، أو 'not-online' لقماش لا يُباع إلكترونياً. */
  status: 'ok' | FabricLineRejection | 'not-online'
  currentMode: FabricPurchaseMode | null
  label: string | null
  unitPriceHalalas: number | null
  netHalalas: number | null
  /** المتاح للبيع الإلكتروني الآن بالسنتيمتر (الفعلي − المحجوز). يُعاد فقط للقماش المعروض. */
  availableCm: number | null
}

export interface FabricQuoteTotals {
  itemsNetHalalas: number
  shippingNetHalalas: number
  shippingGrossHalalas: number
  vatHalalas: number
  totalHalalas: number
}

export interface FabricQuoteResponse {
  ok: true
  lines: QuotedFabricLine[]
  /** محسوبة على الأسطر السليمة فقط؛ null إن لم يبقَ سطر سليم. */
  totals: FabricQuoteTotals | null
  /** كل الأسطر سليمة، والإجمالي ضمن السقف. */
  canCheckout: boolean
  overOrderCap: boolean
  deliveryOptions: FabricDeliveryOption[]
}

export interface FabricOrderSummary {
  orderNumber: string
  totalHalalas: number
  /** payment_due_at: آخر وقت للضغط على «ادفعي» (منذ الدفعة B لا حجز قبله). الاسم باقٍ للتوافق. */
  holdExpiresAt: string
  paymentStatus: string
  fulfillmentStatus: string
}

export interface FabricCheckoutSuccess {
  ok: true
  replayed: boolean
  order: FabricOrderSummary
}

export interface FabricCheckoutFailure {
  ok: false
  code: string
  error: string
  /** عند تغيّر السعر أو المخزون: عرض سعر جديد لتراجعه الزبونة. */
  quote?: FabricQuoteResponse
}

// ============================================
// رسائل الرفض (عربية، للزبونة)
// ============================================

export const FABRIC_LINE_STATUS_MESSAGES: Record<QuotedFabricLine['status'], string> = {
  ok: '',
  unavailable: 'لم يعد هذا القماش معروضاً',
  'out-of-stock': 'نفد هذا القماش',
  'price-on-request': 'سعره عند الطلب — تواصلي معنا',
  'mode-changed': 'تغيّرت طريقة بيعه، أعيدي اختيار الكمية من السلة',
  'invalid-quantity': 'الكمية غير صالحة',
  'below-minimum': 'الكمية أقل من الحد الأدنى',
  'off-step': 'الكمية بخطوات نصف متر',
  'exceeds-available': 'الكمية المتاحة الآن أقل مما في السلة',
  'not-online': 'لا يُباع إلكترونياً — تواصلي معنا',
}
