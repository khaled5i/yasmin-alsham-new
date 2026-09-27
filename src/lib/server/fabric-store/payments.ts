/**
 * منطق الدفع للمتجر الإلكتروني (المرحلة 5) — بلا Next.js، والاعتماديات تُمرَّر:
 * `rpc` (دوال القاعدة، ممنوحة لـservice_role وحده) و`moyasar` (العميل). بذلك يعمل
 * المنطق نفسه في المسارات وفي سكربت التحقق (`scripts/db-local/verify-payments.cjs`)
 * على Postgres حقيقي وخادم ميسر وهمي.
 *
 * القواعد:
 * 1. المحاولة تُحفظ `created` **قبل** إنشاء فاتورة ميسر (لا مفتاح عدم تكرار للفواتير).
 * 2. لا يُعتمد سداد من محتوى webhook أو من رابط الرجوع: نجلب الدفعة من ميسر بمفتاحنا.
 * 3. الحدث يُحفظ قبل أي معالجة؛ فشل المعالجة بعد الحفظ لا يضيّع شيئاً (يُعاد لاحقاً).
 * 4. الرد على الـwebhook 2xx فقط بعد الحفظ؛ قبله (خطأ في القاعدة) 5xx فيعيد ميسر الإرسال.
 */

import {
  MoyasarError,
  isMoyasarCheckoutUrl,
  moyasarWebhookSchema,
  paymentForDatabase,
  redactPayment,
  webhookSecretMatches,
  type MoyasarClient,
  type MoyasarConfig,
  type MoyasarPayment,
} from './moyasar'

export type Rpc = (
  fn: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>

export interface PaymentDeps {
  rpc: Rpc
  moyasar: MoyasarClient
  config: MoyasarConfig
}

const bytea = (hex: string) => `\\x${hex}`

class RpcFailure extends Error {
  constructor(public fn: string, message: string, public code?: string) {
    super(`${fn}: ${message}`)
  }
}

async function call<T = Record<string, unknown>>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args)
  if (error) throw new RpcFailure(fn, error.message, error.code)
  return (data ?? {}) as T
}

// ============================================
// بدء الدفع
// ============================================

export type StartPaymentResult =
  | { ok: true; checkoutUrl: string; attemptId: string; reused: boolean }
  | { ok: false; httpStatus: number; code: string; error: string }

const START_MESSAGES: Record<string, [number, string]> = {
  not_found: [404, 'لم نجد طلبك في هذا المتصفح — أعيدي إنشاء الطلب من السلة'],
  already_paid: [409, 'هذا الطلب مدفوع بالفعل'],
  not_payable: [409, 'هذا الطلب لم يعد قابلاً للدفع — أعيدي إنشاءه من السلة'],
  hold_expiring: [409, 'انتهت مدة حجز القماش أو أوشكت — أعيدي إنشاء الطلب من السلة ليُحجز من جديد'],
  too_many_attempts: [429, 'محاولات دفع كثيرة لهذا الطلب — تواصلي معنا'],
  rate_limited: [429, 'محاولات كثيرة خلال وقت قصير — انتظري دقائق ثم أعيدي المحاولة'],
  in_progress: [409, 'جاري تجهيز صفحة الدفع — أعيدي الضغط بعد لحظات'],
  bad_request: [400, 'طلب غير صالح'],
}

export async function startPayment(
  deps: PaymentDeps,
  input: { accessHash: string; clientHash: string; origin: string }
): Promise<StartPaymentResult> {
  const { rpc, moyasar, config } = deps
  const begin = await call<{
    status: string; attempt_id?: string; checkout_url?: string; amount_halalas?: number
    expires_at?: string; order_number?: string
  }>(rpc, 'fabric_store_begin_payment', {
    p_access_hash: bytea(input.accessHash),
    p_environment: config.environment,
    p_client_hash: bytea(input.clientHash),
  })

  if (begin.status === 'existing' && begin.checkout_url && begin.attempt_id) {
    return { ok: true, checkoutUrl: begin.checkout_url, attemptId: begin.attempt_id, reused: true }
  }
  if (begin.status !== 'created' || !begin.attempt_id || !begin.amount_halalas || !begin.expires_at) {
    const [httpStatus, error] = START_MESSAGES[begin.status] ?? [400, 'تعذّر بدء الدفع']
    return { ok: false, httpStatus, code: begin.status, error }
  }

  const attemptId = begin.attempt_id
  const returnUrl = `${input.origin}/fabrics/payment/return/?attempt=${attemptId}`
  const abandon = (code: string, message: string) =>
    call(rpc, 'fabric_store_abandon_attempt', { p_attempt_id: attemptId, p_code: code, p_message: message })

  let invoice
  try {
    invoice = await moyasar.createInvoice({
      amountHalalas: begin.amount_halalas,
      description: `طلب أقمشة ${begin.order_number ?? ''}`.trim(),
      successUrl: returnUrl,
      backUrl: `${returnUrl}&back=1`,
      expiresAt: new Date(begin.expires_at).toISOString(),
      metadata: { attempt_id: attemptId, order_number: begin.order_number ?? '' },
    })
  } catch (error) {
    const kind = error instanceof MoyasarError ? error.kind : 'unavailable'
    // الزبونة لم ترَ أي رابط، فلا دفع ممكن على فاتورة قد تكون أُنشئت: تُغلق المحاولة.
    // إن كانت قد أُنشئت لدى ميسر فستنتهي مدتها، وmetadata تربط أي دفعة بها.
    await abandon(kind === 'rejected' ? 'create_rejected' : 'create_unknown', (error as Error).message)
    console.error('fabric-store: Moyasar invoice creation failed:', (error as Error).message)
    return kind === 'rejected'
      ? { ok: false, httpStatus: 502, code: 'provider-rejected', error: 'تعذّر إنشاء صفحة الدفع — تواصلي معنا' }
      : { ok: false, httpStatus: 503, code: 'provider-unavailable', error: 'خدمة الدفع لا ترد الآن — أعيدي المحاولة بعد قليل' }
  }

  if (!isMoyasarCheckoutUrl(invoice.url) || invoice.amount !== begin.amount_halalas || invoice.currency !== 'SAR') {
    await abandon('invoice_mismatch', `url/amount/currency mismatch for invoice ${invoice.id}`)
    console.error('fabric-store: Moyasar invoice does not match the attempt', invoice.id)
    return { ok: false, httpStatus: 502, code: 'provider-mismatch', error: 'تعذّر إنشاء صفحة الدفع — تواصلي معنا' }
  }

  const attached = await call<{ status: string }>(rpc, 'fabric_store_attach_invoice', {
    p_attempt_id: attemptId,
    p_invoice_id: invoice.id,
    p_checkout_url: invoice.url,
  })
  if (attached.status !== 'initiated') {
    return { ok: false, httpStatus: 409, code: 'attempt-changed', error: 'تغيّرت حالة الدفع — أعيدي المحاولة' }
  }
  return { ok: true, checkoutUrl: invoice.url, attemptId, reused: false }
}

// ============================================
// تطبيق دفعة مجلوبة من ميسر
// ============================================

export interface ApplyOutcome {
  status: string
  attempt_id?: string | null
  order_id?: string | null
}

/**
 * يطبّق دفعة جُلبت من ميسر. إن لم تُعرف فاتورتها (بدء تعطّل بعد إنشاء الفاتورة وقبل
 * ربطها)، يجلب الفاتورة ويأخذ معرّف المحاولة من metadata — ومطابقة المبلغ تبقى في القاعدة.
 */
export async function applyVerifiedPayment(
  deps: PaymentDeps,
  eventId: string | null,
  payment: MoyasarPayment
): Promise<ApplyOutcome> {
  const { rpc, moyasar, config } = deps
  const args = {
    p_event_id: eventId,
    p_environment: config.environment,
    p_payment: paymentForDatabase(payment),
    p_attempt_hint: null as string | null,
  }
  let outcome = await call<ApplyOutcome>(rpc, 'fabric_store_apply_payment', args)
  if (outcome.status === 'unknown' && payment.invoice_id) {
    const invoice = await moyasar.fetchInvoice(payment.invoice_id)
    const hint = invoice.metadata?.attempt_id
    if (typeof hint === 'string' && /^[0-9a-f-]{36}$/i.test(hint)) {
      outcome = await call<ApplyOutcome>(rpc, 'fabric_store_apply_payment', { ...args, p_attempt_hint: hint })
    }
  }
  return outcome
}

async function recordEvent(
  rpc: Rpc,
  input: { environment: string; source: 'webhook' | 'poll' | 'return'; eventId: string; type: string;
           invoiceId: string | null; paymentId: string | null; payload: Record<string, unknown> }
) {
  return call<{ status: string; event_id: string; processing_status: string }>(rpc, 'fabric_store_record_payment_event', {
    p_environment: input.environment,
    p_source: input.source,
    p_event_id: input.eventId,
    p_event_type: input.type,
    p_invoice_id: input.invoiceId,
    p_payment_id: input.paymentId,
    p_payload: input.payload,
  })
}

const noteFailure = (rpc: Rpc, eventId: string, error: string, final: boolean) =>
  call(rpc, 'fabric_store_note_event_failure', { p_event_id: eventId, p_error: error.slice(0, 1000), p_final: final })

/** يجلب الدفعة ويطبّقها لحدث محفوظ؛ الفشل المؤقت يبقي الحدث للمعالجة اللاحقة. */
async function processEvent(deps: PaymentDeps, eventId: string, paymentId: string): Promise<string> {
  let payment: MoyasarPayment
  try {
    payment = await deps.moyasar.fetchPayment(paymentId)
  } catch (error) {
    // 404 بمفتاحنا = دفعة لا تخصنا أو من بيئة أخرى: نهائي. غير ذلك مؤقت.
    const final = error instanceof MoyasarError && (error.kind === 'not_found' || error.kind === 'rejected')
    await noteFailure(deps.rpc, eventId, (error as Error).message, final)
    return final ? 'quarantined' : 'retry'
  }
  try {
    return (await applyVerifiedPayment(deps, eventId, payment)).status
  } catch (error) {
    await noteFailure(deps.rpc, eventId, (error as Error).message, false).catch(() => {})
    return 'retry'
  }
}

// ============================================
// الـwebhook
// ============================================

export interface WebhookResult {
  httpStatus: number
  body: Record<string, unknown>
  outcome?: string
}

export async function handleMoyasarWebhook(deps: PaymentDeps, rawBody: string): Promise<WebhookResult> {
  const { rpc, config } = deps
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return { httpStatus: 400, body: { ok: false } }
  }
  const parsed = moyasarWebhookSchema.safeParse(json)
  if (!parsed.success) return { httpStatus: 400, body: { ok: false } }
  const event = parsed.data

  if (!config.webhookSecret) {
    console.error('fabric-store: MOYASAR_WEBHOOK_SECRET is not configured; refusing webhook')
    return { httpStatus: 503, body: { ok: false } }
  }
  // سرّ خاطئ = مصدر غير موثوق: لا يُحفظ شيء (وإلا صار السجل هدفاً لمن يشاء).
  if (!webhookSecretMatches(event.secret_token, config.webhookSecret)) {
    return { httpStatus: 401, body: { ok: false } }
  }

  const environment = event.live ? 'live' : 'test'
  const data = event.data as Record<string, unknown>
  const paymentId = typeof data.id === 'string' ? data.id : null
  let recorded
  try {
    recorded = await recordEvent(rpc, {
      environment,
      source: 'webhook',
      eventId: event.id,
      type: event.type,
      invoiceId: typeof data.invoice_id === 'string' ? data.invoice_id : null,
      paymentId,
      payload: { id: event.id, type: event.type, live: event.live, created_at: event.created_at ?? null, data: redactPayment(data) },
    })
  } catch (error) {
    // لم يُحفظ: 5xx ليعيد ميسر الإرسال.
    console.error('fabric-store: could not record Moyasar webhook:', (error as Error).message)
    return { httpStatus: 500, body: { ok: false } }
  }

  // من هنا الحدث محفوظ: 200 دائماً، والفشل يُعاد بمهمة المعالجة.
  const ok = (outcome: string) => ({ httpStatus: 200, body: { ok: true }, outcome })
  if (recorded.status === 'duplicate' && recorded.processing_status !== 'received' && recorded.processing_status !== 'failed') {
    return ok('duplicate')
  }
  if (environment !== config.environment) {
    await noteFailure(rpc, recorded.event_id, `environment ${environment} does not match the server (${config.environment})`, true)
      .catch(() => {})
    return ok('quarantined')
  }
  if (!event.type.startsWith('payment_') || !paymentId) {
    await noteFailure(rpc, recorded.event_id, `unhandled event type ${event.type}`, true).catch(() => {})
    return ok('quarantined')
  }
  try {
    return ok(await processEvent(deps, recorded.event_id, paymentId))
  } catch (error) {
    console.error('fabric-store: webhook processing failed after recording:', (error as Error).message)
    return ok('retry')
  }
}

// ============================================
// صفحة الرجوع: الحالة الموثّقة من خادمنا
// ============================================

export interface PaymentView {
  status: string
  order_number?: string
  total_halalas?: number
  payment_status?: string
  fulfillment_status?: string
  needs_review?: boolean
  hold_expires_at?: string
  attempt?: { id: string; status: string; environment: string; provider_invoice_id: string | null; expires_at: string } | null
  verify_due?: boolean
}

/**
 * يقرأ حالة الطلب برمز الزبونة، وإن حان وقت السؤال (كل 10 ثوانٍ على الأكثر) يجلب
 * الفاتورة من ميسر ويطبّق دفعاتها — فلا يعتمد إتمام الطلب على وصول الـwebhook.
 */
export async function viewPaymentForReturn(
  deps: PaymentDeps,
  input: { accessHash: string; clientHash: string; attemptId: string }
): Promise<PaymentView & { verified: boolean }> {
  const { rpc, moyasar, config } = deps
  const read = () =>
    call<PaymentView>(rpc, 'fabric_store_payment_view', {
      p_access_hash: bytea(input.accessHash),
      p_attempt_id: input.attemptId,
      p_client_hash: bytea(input.clientHash),
    })
  const view = await read()
  const attempt = view.attempt
  if (view.status !== 'ok' || !view.verify_due || !attempt?.provider_invoice_id || attempt.environment !== config.environment) {
    return { ...view, verified: false }
  }

  try {
    const invoice = await moyasar.fetchInvoice(attempt.provider_invoice_id)
    for (const payment of (invoice.payments ?? []).slice(0, 10)) {
      const recorded = await recordEvent(rpc, {
        environment: config.environment,
        source: 'return',
        eventId: `return:${payment.id}:${payment.status}`,
        type: `payment_${payment.status}`,
        invoiceId: invoice.id,
        paymentId: payment.id,
        payload: { data: redactPayment(payment as Record<string, unknown>) },
      })
      if (recorded.status === 'duplicate' && recorded.processing_status !== 'received' && recorded.processing_status !== 'failed') {
        continue
      }
      await applyVerifiedPayment(deps, recorded.event_id, { ...payment, invoice_id: payment.invoice_id ?? invoice.id })
    }
  } catch (error) {
    console.error('fabric-store: return-page verification failed:', (error as Error).message)
    return { ...view, verified: false }
  }
  return { ...(await read()), verified: true }
}

// ============================================
// إعادة معالجة الأحداث المعلّقة (مسار مجدول؛ يُربط بـVercel Cron في المرحلة 6)
// ============================================

export async function processPendingPaymentEvents(deps: PaymentDeps, limit = 20) {
  const events = await call<Array<{ event_id: string; environment: string; provider_payment_id: string | null }>>(
    deps.rpc, 'fabric_store_pending_payment_events', { p_limit: limit })
  const outcomes: Record<string, number> = {}
  for (const event of Array.isArray(events) ? events : []) {
    let outcome: string
    if (event.environment !== deps.config.environment) {
      await noteFailure(deps.rpc, event.event_id, 'environment does not match the server', true)
      outcome = 'quarantined'
    } else if (!event.provider_payment_id) {
      await noteFailure(deps.rpc, event.event_id, 'event has no payment id', true)
      outcome = 'quarantined'
    } else {
      outcome = await processEvent(deps, event.event_id, event.provider_payment_id)
    }
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
  }
  return outcomes
}
