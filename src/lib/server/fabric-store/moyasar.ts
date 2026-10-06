/**
 * عميل ميسر على الخادم (المرحلة 5 من خطة الدفع) — من التوثيق الرسمي، 24 سبتمبر 2026:
 * - `https://api.moyasar.com/v1`، مصادقة HTTP Basic: المفتاح السري اسم مستخدم وكلمة مرور فارغة.
 * - الفاتورة: `POST /invoices` (amount بالهللة ≥ 100، currency، description، success_url،
 *   back_url، expired_at، metadata) · `GET /invoices/:id` · `GET /payments/:id`.
 *   **لا مفتاح عدم تكرار للفواتير** (given_id خاص بواجهة Payments)، لذلك تُحفظ المحاولة
 *   `created` قبل الطلب ويُعالج الانقطاع في `payments.ts`.
 * - الـwebhook: `{id, type, created_at, secret_token, account_name, live, data: <payment>}`،
 *   واسم حدث الفشل في التوثيق `payment_faild`. **لا يُعتمد محتواه**: نعيد جلب الدفعة.
 *
 * المفتاح السري لا يغادر الخادم ولا يوضع في NEXT_PUBLIC. بيانات البطاقة لا تمر بنا
 * (صفحة الدفع مستضافة لدى ميسر)، وما يصلنا منها يُنقَّح قبل الحفظ.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export type MoyasarEnvironment = 'test' | 'live'

export interface MoyasarConfig {
  secretKey: string
  environment: MoyasarEnvironment
  apiBase: string
  /** سرّ الـwebhook كما سُجّل في لوحة ميسر. بدونه يُرفض كل webhook (503). */
  webhookSecret: string | null
}

const OFFICIAL_API_BASE = 'https://api.moyasar.com/v1'
const REQUEST_TIMEOUT_MS = 7_000

/**
 * الإعدادات من البيئة. مفاتيح live **مرفوضة** ما لم يُضبط
 * `FABRIC_STORE_ALLOW_LIVE_PAYMENTS=true` (قرار المرحلة 10): لا دفعة حقيقية أثناء التطوير.
 * `MOYASAR_API_BASE` لخادم وهمي محلي فقط، وخارج الإنتاج فقط.
 */
export function getMoyasarConfig(
  env: Record<string, string | undefined> = process.env
): { ok: true; config: MoyasarConfig } | { ok: false; reason: string } {
  const secretKey = (env.MOYASAR_SECRET_KEY ?? '').trim()
  let environment: MoyasarEnvironment
  if (/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) environment = 'test'
  else if (/^sk_live_[A-Za-z0-9]+$/.test(secretKey)) environment = 'live'
  else return { ok: false, reason: 'missing-key' }

  if (environment === 'live' && (env.FABRIC_STORE_ALLOW_LIVE_PAYMENTS ?? '').trim().toLowerCase() !== 'true') {
    return { ok: false, reason: 'live-disabled' }
  }
  // الدفعة C (AUD-06): بطاقات ميسر التجريبية منشورة للعموم — مفتاح test على نشر الإنتاج يعني
  // «شراء» بلا مال. مرفوض إلا بإذن صريح لفترة اختبار القبول على الإنتاج.
  if (environment === 'test' && (env.VERCEL_ENV ?? '').trim() === 'production'
      && (env.FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION ?? '').trim().toLowerCase() !== 'true') {
    return { ok: false, reason: 'test-on-production' }
  }

  let apiBase = OFFICIAL_API_BASE
  const override = (env.MOYASAR_API_BASE ?? '').trim().replace(/\/+$/, '')
  if (override && override !== OFFICIAL_API_BASE) {
    const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+(\/.*)?$/.test(override)
    if (!local || env.NODE_ENV === 'production' || environment === 'live') {
      return { ok: false, reason: 'bad-api-base' }
    }
    apiBase = override
  }

  const webhookSecret = (env.MOYASAR_WEBHOOK_SECRET ?? '').trim()
  return {
    ok: true,
    config: { secretKey, environment, apiBase, webhookSecret: webhookSecret.length >= 16 ? webhookSecret : null },
  }
}

// ============================================
// أشكال الردود — نتحقق من الحقول التي نعتمد عليها فقط
// ============================================

const paymentSchema = z
  .object({
    id: z.string().min(1).max(100),
    status: z.string().min(1).max(40),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3),
    invoice_id: z.string().max(100).nullable().optional(),
    fee: z.number().int().nullable().optional(),
    refunded: z.number().int().nullable().optional(),
    captured: z.number().int().nullable().optional(),
    created_at: z.string().nullable().optional(),
    source: z
      .object({
        type: z.string().nullable().optional(),
        company: z.string().nullable().optional(),
        message: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

export type MoyasarPayment = z.infer<typeof paymentSchema>

const invoiceSchema = z
  .object({
    id: z.string().min(1).max(100),
    status: z.string().min(1).max(40),
    amount: z.number().int().positive(),
    currency: z.string().min(3).max(3),
    url: z.string().min(1).max(1000),
    payments: z.array(paymentSchema).nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough()

export type MoyasarInvoice = z.infer<typeof invoiceSchema>

export const moyasarWebhookSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  live: z.boolean(),
  secret_token: z.string().max(500),
  created_at: z.string().nullable().optional(),
  data: z.object({ id: z.string().min(1).max(100) }).passthrough(),
})

export type MoyasarWebhook = z.infer<typeof moyasarWebhookSchema>

// ============================================
// الأخطاء
// ============================================

export type MoyasarErrorKind =
  /** رد 4xx: الطلب مرفوض (بيانات، مصادقة، حساب). لا يُعاد كما هو. */
  | 'rejected'
  /** 404: غير موجود بهذا المفتاح. */
  | 'not_found'
  /** 5xx أو انقطاع أو مهلة: لا نعرف النتيجة. */
  | 'unavailable'
  /** رد بصيغة غير متوقعة. */
  | 'invalid_response'

export class MoyasarError extends Error {
  constructor(public kind: MoyasarErrorKind, message: string, public httpStatus: number | null = null) {
    super(message)
    this.name = 'MoyasarError'
  }
}

// ============================================
// العميل
// ============================================

export interface CreateInvoiceInput {
  amountHalalas: number
  description: string
  successUrl: string
  backUrl: string
  expiresAt: string
  metadata: Record<string, string>
}

export interface MoyasarClient {
  createInvoice(input: CreateInvoiceInput): Promise<MoyasarInvoice>
  fetchInvoice(id: string): Promise<MoyasarInvoice>
  fetchPayment(id: string): Promise<MoyasarPayment>
  /**
   * المرحلة 8: `POST /payments/:id/refund` بالمبلغ (بالهللة). الرد هو الدفعة وحقل `refunded`
   * فيها بعد الاسترداد. **لا مفتاح عدم تكرار**: لا يُستدعى إلا عبر `refunds.ts`.
   */
  refundPayment(id: string, amountHalalas: number): Promise<MoyasarPayment>
}

export function createMoyasarClient(config: MoyasarConfig, fetchImpl: typeof fetch = fetch): MoyasarClient {
  const authorization = `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`

  async function request<T>(method: 'GET' | 'POST', path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetchImpl(`${config.apiBase}${path}`, {
        method,
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (error) {
      throw new MoyasarError('unavailable', `Moyasar request failed: ${(error as Error).name}`)
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text().catch(() => '')
    if (response.status === 404) throw new MoyasarError('not_found', 'Moyasar: not found', 404)
    if (response.status >= 500) throw new MoyasarError('unavailable', `Moyasar ${response.status}`, response.status)
    if (!response.ok) {
      // رسالة ميسر للمطوّر فقط (السجل)، لا تُعرض للزبونة ولا تحمل أسراراً.
      throw new MoyasarError('rejected', `Moyasar ${response.status}: ${text.slice(0, 300)}`, response.status)
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new MoyasarError('invalid_response', 'Moyasar: response is not JSON', response.status)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new MoyasarError('invalid_response', 'Moyasar: unexpected response shape', response.status)
    return parsed.data
  }

  const idPath = (id: string) => encodeURIComponent(id)

  return {
    createInvoice: input =>
      request('POST', '/invoices', invoiceSchema, {
        amount: input.amountHalalas,
        currency: 'SAR',
        description: input.description,
        success_url: input.successUrl,
        back_url: input.backUrl,
        expired_at: input.expiresAt,
        metadata: input.metadata,
      }),
    fetchInvoice: id => request('GET', `/invoices/${idPath(id)}`, invoiceSchema),
    fetchPayment: id => request('GET', `/payments/${idPath(id)}`, paymentSchema),
    refundPayment: (id, amountHalalas) =>
      request('POST', `/payments/${idPath(id)}/refund`, paymentSchema, { amount: amountHalalas }),
  }
}

// ============================================
// أدوات
// ============================================

/** رابط صفحة الدفع يجب أن يكون صفحة ميسر نفسها (https، نطاق moyasar.com) — لا تحويل لموقع آخر. */
export function isMoyasarCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'moyasar.com' || parsed.hostname.endsWith('.moyasar.com'))
  } catch {
    return false
  }
}

/** ما تحتاجه القاعدة من الدفعة (fabric_store_apply_payment). */
export function paymentForDatabase(payment: MoyasarPayment) {
  return {
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    invoice_id: payment.invoice_id ?? null,
    message: payment.source?.message ?? null,
    // المرحلة 8: دفعة «refunded» لا تُحجر إن كان المسترد مسجّلاً عندنا.
    refunded: payment.refunded ?? null,
  }
}

/** نسخة الدفعة المحفوظة في سجل الأحداث: بلا اسم حامل البطاقة ولا رقمها ولا معرّفات البوابة. */
export function redactPayment(payment: Record<string, unknown>) {
  const source = (payment.source ?? {}) as Record<string, unknown>
  const pick = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null)
  return {
    id: pick(payment.id),
    status: pick(payment.status),
    amount: pick(payment.amount),
    fee: pick(payment.fee),
    currency: pick(payment.currency),
    refunded: pick(payment.refunded),
    captured: pick(payment.captured),
    invoice_id: pick(payment.invoice_id),
    created_at: pick(payment.created_at),
    source: { type: pick(source.type), company: pick(source.company), message: pick(source.message) },
  }
}

/** مقارنة سرّ الـwebhook بزمن ثابت (البصمتان بطول واحد دائماً). */
export function webhookSecretMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}
