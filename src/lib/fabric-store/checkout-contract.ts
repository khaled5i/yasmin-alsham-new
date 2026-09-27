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
import { FABRIC_MAX_CM_PER_LINE, type FabricLineRejection, type FabricPurchaseMode } from './pricing'

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

/** مدة حجز القماش بعد إنشاء الطلب (قرار المالك 24 سبتمبر 2026). تفرضها القاعدة؛ هنا للعرض فقط. */
export const FABRIC_STORE_HOLD_MINUTES = 30

/**
 * سقف مبلغ الطلب الإلكتروني الواحد: 20,000 ريال شاملة الضريبة. متوسط مبيعة المحل
 * ~363 ريال. يُراجَع مع حد العملية الواحدة لدى ميسر قبل الإطلاق (المرحلة 10).
 */
export const FABRIC_STORE_MAX_ORDER_TOTAL_HALALAS = 2_000_000

/** عدد أسطر الطلب الأقصى (= سقف السلة وقيد القاعدة). */
export const FABRIC_STORE_MAX_LINES = 40

/**
 * إصدارات السياسات التي توافق عليها الزبونة. **مسودّات**: صفحات الشروط والاسترجاع
 * والخصوصية تُنشر في المرحلة 10 قبل الإطلاق، ويُرفع الإصدار عندها.
 */
export const FABRIC_STORE_POLICY_VERSIONS = {
  terms: 'draft-2026-09-24',
  returns: 'draft-2026-09-24',
  privacy: 'draft-2026-09-24',
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
}

/**
 * قرار المالك (24 سبتمبر 2026): استلام من المحل، أو شحن مؤقت بسعر ثابت 50 ريالاً
 * + الضريبة لكل مدن السعودية حتى تُحدَّد المدن وشركة الشحن. تغيير السعر هنا وحده
 * يكفي (القاعدة تتحقق من اتساق المبالغ لا من قيمة الشحن).
 */
export const FABRIC_DELIVERY_OPTIONS: Record<FabricDeliveryMethod, FabricDeliveryOption> = {
  pickup: {
    method: 'pickup',
    code: 'shop_pickup',
    label: 'استلام من المحل',
    description: 'نجهّز طلبك ونبلغك حين يكون جاهزاً للاستلام.',
    shippingNetHalalas: 0,
  },
  shipping: {
    method: 'shipping',
    code: 'ksa_flat',
    label: 'شحن داخل السعودية',
    description: 'سعر شحن موحّد لكل مدن المملكة.',
    shippingNetHalalas: 5_000,
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
  // نفس قيد القاعدة: العنوان المختصر، أو الحي والشارع معاً.
  .refine(address => address.shortAddress || (address.district && address.street), 'address-incomplete')

export type FabricAddressInput = z.infer<typeof fabricAddressSchema>

export const fabricCheckoutRequestSchema = z
  .object({
    checkoutKey: z.string().uuid(),
    lines: linesSchema,
    deliveryMethod: z.enum(['pickup', 'shipping']),
    customer: z.object({
      name: cleanText(2, 120),
      phone: saudiMobile,
      email: z
        .string()
        .max(254)
        .optional()
        .transform(value => (value ?? '').trim().toLowerCase())
        .pipe(z.union([z.literal(''), z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)]))
        .transform(value => value || null),
    }),
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
