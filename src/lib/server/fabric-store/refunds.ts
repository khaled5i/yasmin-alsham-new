/**
 * الاسترداد (المرحلة 8) — بلا Next.js، والاعتماديات تُمرَّر، مثل `payments.ts`.
 *
 * ميسر **لا يقبل مفتاح عدم تكرار للاسترداد**، ورد ضائع (انقطاع بعد التنفيذ) قد يدفع إلى
 * نداء ثانٍ يرد المبلغ مرتين. الحماية:
 * 1. القاعدة تسجّل الاسترداد `pending` **قبل** النداء، مع ما سجّلناه مسترداً قبله
 *    (`refunded_before`)، ولا تسمح إلا باسترداد معلّق واحد للطلب، يحمل حجزاً مؤقتاً.
 * 2. كل استلام للاسترداد (البدء، أو المهمة) يحمل **رمز حجز**؛ تسجيل النداء وكتابة النتيجة
 *    يشترطانه، فعامل انتهى حجزه لا ينادي ولا يكتب فوق نتيجة غيره (مراجعة 2).
 * 3. قبل أي نداء نجلب الدفعة من ميسر:
 *    - نداء سابق مسجّل و`refunded ≥ before + amount` ⇒ نجح ورده ضاع: نُكمل بلا نداء.
 *    - لم يُسجَّل نداء و`refunded = before` ⇒ نسجّل النداء في القاعدة **ثم** ننادي مرة واحدة.
 *    - غير ذلك (ومنه بلوغ الهدف بلا نداء منّا) ⇒ استرداد لم نسجّله (لوحة ميسر): لا نداء، ويُراجع.
 * 4. **نداء واحد لكل استرداد أبداً** (مراجعة 2): بعد النداء، «لم يظهر الاسترداد بعد» لا يثبت
 *    أن النداء لن يُنفَّذ لاحقاً. يبقى `pending` والمهمة تراقب فقط؛ بعد 15 دقيقة يُرفع الطلب
 *    للمراجعة ليتحقق شخص من لوحة ميسر. القاعدة نفسها ترفض نداءً ثانياً (already_called).
 */

import { MoyasarError, type MoyasarClient, type MoyasarConfig } from './moyasar'
import type { Rpc } from './payments'

export interface RefundDeps {
  rpc: Rpc
  moyasar: MoyasarClient
  config: MoyasarConfig
}

export interface PendingRefund {
  refundId: string
  paymentId: string
  environment: string
  amountHalalas: number
  refundedBefore: number
  /** سُجّل نداء سابق لميسر لهذا الاسترداد (قد يكون نُفّذ ورده ضاع، أو ما زال في الطريق). */
  called: boolean
  /** رمز الحجز الذي استلم به هذا العامل الاسترداد (من البدء أو من due_refunds). */
  claimToken: string
}

export type SettleStatus = 'succeeded' | 'failed' | 'mismatch' | 'pending'

export type StartRefundResult =
  | { ok: true; status: SettleStatus; refundId: string; detail?: string }
  | { ok: false; httpStatus: number; code: string; error: string }

const BEGIN_MESSAGES: Record<string, [number, string]> = {
  not_found: [404, 'الطلب غير موجود'],
  not_refundable: [409, 'لا يوجد مبلغ مدفوع قابل للاسترداد في هذا الطلب'],
  refund_in_progress: [409, 'يوجد استرداد قيد التنفيذ لهذا الطلب — انتظري نتيجته'],
  exceeds: [400, 'المبلغ أكبر من المتبقي القابل للاسترداد'],
  already_cut: [409, 'بدأ تجهيز الطلب (القص) — ولو أُعيد إلى «لم يُجهَّز»: لا إلغاء بعده، بل استرداد بسبب مكتوب'],
  already_cancelled: [409, 'الطلب ملغى أصلاً — استرديه دون «إلغاء» (سداد وصل بعد الإلغاء)'],
  use_cancel: [409, 'استرداد كامل المبلغ قبل القص يكون بإلغاء الطلب — اختاري «إلغاء الطلب واسترداد المبلغ»'],
  sale_pending: [409, 'مبيعة هذا الطلب لم تُسجَّل بعد — الاسترداد الجزئي بعدها؛ الإلغاء الكامل متاح الآن'],
  key_conflict: [409, 'تعارض في الطلب — حدّثي الصفحة وأعيدي المحاولة'],
  bad_request: [400, 'اكتبي سبب الاسترداد ومبلغاً صحيحاً'],
  // الدفعة C
  forbidden: [403, 'الاسترداد للمدير فقط'],
  extra_full_only: [400, 'الدفعة الإضافية تُرد كاملة (لا مبيعة لها) — بلا «إلغاء»'],
  support_reference_required: [409, 'أُغلق على هذه الدفعة استرداد أُرسل لميسر ولم يظهر — اكتبي مرجع دعم ميسر الذي يؤكد أنه لن يُنفَّذ، وإلا قد يُرد المبلغ مرتين'],
}

async function finish(rpc: Rpc, refund: PendingRefund, outcome: 'succeeded' | 'failed' | 'mismatch' | 'unconfirmed',
                      providerRefunded: number | null, message: string | null): Promise<string> {
  const { data, error } = await rpc('fabric_store_refund_finish', {
    p_refund_id: refund.refundId, p_claim_token: refund.claimToken, p_outcome: outcome, p_provider_refunded: providerRefunded,
    p_message: message ? message.slice(0, 500) : null,
  })
  if (error) throw new Error(`fabric_store_refund_finish: ${error.message}`)
  return String((data as { status?: string } | null)?.status ?? '')
}

/**
 * يكمل استرداداً معلّقاً يملك حجزه (من البدء أو من `fabric_store_due_refunds`). لا يرمي
 * لخطأ ميسر: المجهول يعود `pending`. يرمي لخطأ القاعدة (يبقى معلّقاً ويعيده الطابور).
 */
export async function settleRefund(
  deps: RefundDeps, refund: PendingRefund, allowNewCall = true
): Promise<{ status: SettleStatus; detail?: string }> {
  if (refund.environment !== deps.config.environment) {
    // مفتاح test لا يرد دفعة live ولا العكس: لا نداء، ويبقى معلّقاً حتى يُضبط المفتاح الصحيح.
    return { status: 'pending', detail: `environment ${refund.environment} ≠ key ${deps.config.environment}` }
  }
  const target = refund.refundedBefore + refund.amountHalalas

  let current: number
  try {
    current = (await deps.moyasar.fetchPayment(refund.paymentId)).refunded ?? 0
  } catch (error) {
    if (error instanceof MoyasarError && error.kind === 'not_found') {
      await finish(deps.rpc, refund, 'failed', null, 'Moyasar: الدفعة غير موجودة بهذا المفتاح')
      return { status: 'failed', detail: 'payment not found' }
    }
    return { status: 'pending', detail: `fetch: ${(error as Error).message}` }
  }

  // نداء سابق (مسجّل قبل إرساله) وصل: ميسر يُظهر الهدف أو أكثر (الزيادة تُراجع في القاعدة).
  if (refund.called && current >= target) {
    const status = await finish(deps.rpc, refund, 'succeeded', current, null)
    return { status: status === 'succeeded' ? 'succeeded' : 'pending', detail: 'already refunded at Moyasar' }
  }
  // نداء سابق لم يظهر أثره بعد: قد يكون في الطريق. لا نداء ثانٍ أبداً — نراقب، وبعد 15 دقيقة
  // من النداء تُرفع مراجعة (القاعدة تقرر الوقت).
  if (refund.called && current === refund.refundedBefore) {
    const status = await finish(deps.rpc, refund, 'unconfirmed', null, null)
    return { status: 'pending', detail: status === 'unconfirmed' ? 'called, not visible at Moyasar — flagged for review' : 'called, waiting' }
  }
  // بلا نداء منّا، أي فرق عن «المسترد قبل» استرداد لم نسجّله (لوحة ميسر مثلاً) — حتى لو بلغ الهدف.
  if (current !== refund.refundedBefore) {
    await finish(deps.rpc, refund, 'mismatch', null,
      `ميسر يُظهر مسترداً ${current} هللة، وسجلنا ${refund.refundedBefore} قبل هذا الاسترداد`)
    return { status: 'mismatch' }
  }

  // إطفاء مفتاح الاسترداد يوقف أول نداء مالي، مع استمرار مطابقة النداءات التي أُرسلت فعلاً.
  if (!allowNewCall) return { status: 'pending', detail: 'refund sending is disabled' }

  // يُسجَّل النداء قبل إرساله، ولحامل الحجز وحده.
  const { data: marked, error: markError } = await deps.rpc('fabric_store_refund_mark_called', {
    p_refund_id: refund.refundId, p_claim_token: refund.claimToken })
  if (markError) throw new Error(`fabric_store_refund_mark_called: ${markError.message}`)
  if ((marked as { status?: string } | null)?.status !== 'ok') {
    return { status: 'pending', detail: `not called: ${(marked as { status?: string } | null)?.status}` }
  }

  let after: number | null
  try {
    after = (await deps.moyasar.refundPayment(refund.paymentId, refund.amountHalalas)).refunded ?? null
  } catch (error) {
    if (error instanceof MoyasarError && (error.kind === 'rejected' || error.kind === 'not_found')) {
      await finish(deps.rpc, refund, 'failed', null, error.message)
      return { status: 'failed', detail: error.message }
    }
    // انقطاع أو 5xx أو رد غير مفهوم: لا نعرف إن نُفّذ. يبقى معلّقاً للمطابقة، ولا نداء ثانٍ الآن.
    return { status: 'pending', detail: (error as Error).message }
  }

  if (after !== null && after >= target) {
    const status = await finish(deps.rpc, refund, 'succeeded', after, null)
    return { status: status === 'succeeded' ? 'succeeded' : 'pending' }
  }
  return { status: 'pending', detail: `Moyasar answered refunded=${after}` }
}

/** يبدأ استرداداً (المدير) ثم يكمله فوراً. المفتاح `key` من المتصفح يمنع تكرار الضغطة. */
export async function startRefund(
  deps: RefundDeps,
  input: {
    orderId: string
    actorId: string
    actorLabel: string | null
    amountHalalas: number
    reason: string
    cancel: boolean
    key: string
    /** الدفعة C (AUD-04): دفعة ناجحة غير معتمدة للطلب (دفعة ثانية) — رد كامل. */
    attemptId?: string | null
    /** الدفعة C (AUD-08): مرجع دعم ميسر بعد إغلاق استرداد أُرسل ولم يظهر. */
    supportReference?: string | null
  }
): Promise<StartRefundResult> {
  if (!Number.isSafeInteger(input.amountHalalas) || input.amountHalalas <= 0) {
    return { ok: false, httpStatus: 400, code: 'bad_request', error: BEGIN_MESSAGES.bad_request[1] }
  }
  const { data, error } = await deps.rpc('fabric_store_refund_begin', {
    p_order_id: input.orderId, p_actor_id: input.actorId, p_actor_label: input.actorLabel,
    p_amount_halalas: input.amountHalalas, p_reason: input.reason, p_cancel: input.cancel, p_key: input.key,
    // يُرسلان فقط حين يُستعملان: الاسترداد العادي يعمل قبل هجرة الدفعة C وبعدها وبعد تراجعها
    ...(input.attemptId ? { p_attempt_id: input.attemptId } : {}),
    ...(input.supportReference?.trim() ? { p_support_reference: input.supportReference.trim() } : {}),
  })
  if (error) {
    return { ok: false, httpStatus: error.code === '55P03' ? 409 : 503, code: 'unavailable',
             error: error.code === '55P03' ? 'الطلب مشغول الآن — أعيدي المحاولة بعد لحظات' : 'تعذّر بدء الاسترداد' }
  }
  const begin = (data ?? {}) as {
    status?: string; refund_id?: string; refund_status?: string; payment_id?: string; environment?: string
    amount_halalas?: number | string; refunded_before?: number | string; claim_token?: string
  }

  if (begin.status === 'existing' && begin.refund_id) {
    const status = begin.refund_status === 'succeeded' ? 'succeeded' : begin.refund_status === 'failed' ? 'failed' : 'pending'
    return { ok: true, status, refundId: begin.refund_id }
  }
  if (begin.status !== 'started' || !begin.refund_id || !begin.payment_id || !begin.environment || !begin.claim_token) {
    const [httpStatus, message] = BEGIN_MESSAGES[begin.status ?? ''] ?? [400, 'تعذّر بدء الاسترداد']
    return { ok: false, httpStatus, code: begin.status ?? 'error', error: message }
  }

  const refund: PendingRefund = {
    refundId: begin.refund_id,
    paymentId: begin.payment_id,
    environment: begin.environment,
    amountHalalas: Number(begin.amount_halalas),
    refundedBefore: Number(begin.refunded_before),
    called: false,
    claimToken: String(begin.claim_token ?? ''),
  }
  try {
    const settled = await settleRefund(deps, refund)
    return { ok: true, status: settled.status, refundId: refund.refundId, detail: settled.detail }
  } catch (err) {
    console.error('fabric-store: refund settle failed (the job will reconcile):', (err as Error).message)
    return { ok: true, status: 'pending', refundId: refund.refundId }
  }
}

const CLOSE_MESSAGES: Record<string, [number, string]> = {
  too_early: [409, 'لا يُغلق استرداد أُرسل لميسر قبل مرور 24 ساعة على إرساله — راجعي لوحة ميسر، والمهمة تتابعه'],
  provider_changed: [409, 'ميسر يُظهر حركة استرداد على هذه الدفعة — المهمة تكملها أو ترفعها للمراجعة، لا يُغلق يدوياً'],
  note_required: [400, 'اكتبي مرجع التسوية (أو مراسلة ميسر) وملاحظة القرار'],
  not_found: [404, 'الاسترداد غير موجود'],
  bad_request: [400, 'طلب غير صالح'],
  forbidden: [403, 'للمدير فقط'],
}

const EXTERNAL_MESSAGES: Record<string, [number, string]> = {
  forbidden: [403, 'للمدير فقط'],
  bad_request: [400, 'اكتبي مرجع الاسترداد في لوحة ميسر وسببه'],
  not_found: [404, 'الطلب غير موجود'],
  not_refundable: [409, 'لا توجد دفعة ناجحة بهذا المعرّف في هذا الطلب'],
  refund_in_progress: [409, 'يوجد استرداد قيد التنفيذ لهذا الطلب — انتظري نتيجته'],
  sale_pending: [409, 'مبيعة هذا الطلب لم تُسجَّل بعد — سجّلي الاسترداد الخارجي بعدها'],
  key_conflict: [409, 'تعارض في الطلب — حدّثي الصفحة وأعيدي المحاولة'],
}

/**
 * الدفعة C (AUD-03): تسجيل استرداد تم من لوحة ميسر خارج النظام. **لا نداء لميسر** — نسأله فقط
 * عن المسترد الآن بمفتاحنا، والقاعدة تشترط أن المبلغ = الفرق بينه وبين سجلنا، ثم تسجّله ناجحاً
 * (حالة الدفع + صف المرتجع للمبيعة المعتمدة) كأي استرداد.
 */
export async function recordExternalRefund(
  deps: RefundDeps,
  input: { orderId: string; attemptId: string; paymentId: string; environment: string; actorId: string
           actorLabel: string | null; amountHalalas: number; reference: string; reason: string; key: string }
): Promise<{ ok: true; paymentStatus: string | null } | { ok: false; httpStatus: number; code: string; error: string }> {
  if (!Number.isSafeInteger(input.amountHalalas) || input.amountHalalas <= 0) {
    return { ok: false, httpStatus: 400, code: 'bad_request', error: 'مبلغ غير صالح' }
  }
  if (input.environment !== deps.config.environment) {
    return { ok: false, httpStatus: 409, code: 'environment', error: 'مفتاح ميسر المضبوط لا يخص بيئة هذه الدفعة' }
  }
  let current: number
  try {
    current = (await deps.moyasar.fetchPayment(input.paymentId)).refunded ?? 0
  } catch {
    return { ok: false, httpStatus: 503, code: 'unavailable', error: 'تعذّر سؤال ميسر عن الدفعة الآن — أعيدي المحاولة' }
  }
  const { data, error } = await deps.rpc('fabric_store_refund_record_external', {
    p_order_id: input.orderId, p_attempt_id: input.attemptId, p_actor_id: input.actorId, p_actor_label: input.actorLabel,
    p_amount_halalas: input.amountHalalas, p_reference: input.reference, p_reason: input.reason,
    p_provider_refunded: current, p_key: input.key,
  })
  if (error) {
    return { ok: false, httpStatus: error.code === '55P03' ? 409 : 503, code: 'unavailable',
             error: error.code === '55P03' ? 'الطلب مشغول الآن — أعيدي المحاولة بعد لحظات' : 'تعذّر تسجيل الاسترداد' }
  }
  const result = (data ?? {}) as { status?: string; payment_status?: string; unrecorded_halalas?: number | string }
  if (result.status === 'ok' || result.status === 'existing') return { ok: true, paymentStatus: result.payment_status ?? null }
  if (result.status === 'amount_mismatch') {
    const unrecorded = Number(result.unrecorded_halalas ?? 0)
    return { ok: false, httpStatus: 409, code: 'amount_mismatch', error: unrecorded > 0
      ? `ميسر يُظهر الآن ${(unrecorded / 100).toFixed(2)} ريال مسترداً خارج سجلنا — سجّلي هذا المبلغ بالضبط`
      : 'ميسر لا يُظهر الآن أي استرداد خارج سجلنا لهذه الدفعة' }
  }
  const [httpStatus, message] = EXTERNAL_MESSAGES[result.status ?? ''] ?? [400, 'تعذّر تسجيل الاسترداد']
  return { ok: false, httpStatus, code: result.status ?? 'error', error: message }
}

/**
 * (مراجعة، سياسة المالك) إغلاق استرداد معلّق لم يظهر لدى ميسر، بقرار المدير ومرجع التسوية.
 * ما يراه ميسر الآن يُجلب هنا بمفتاحنا ويُمرَّر للقاعدة؛ القاعدة تقرر (24 ساعة، ولا حركة).
 * نداء لم يُرسل أصلاً يُغلق بلا سؤال ميسر.
 */
export async function closeUnconfirmedRefund(
  deps: RefundDeps,
  input: { refundId: string; paymentId: string | null; environment: string; called: boolean
           actorId: string; reference: string; note: string }
): Promise<{ ok: true } | { ok: false; httpStatus: number; code: string; error: string }> {
  let current: number | null = null
  if (input.called) {
    if (input.environment !== deps.config.environment || !input.paymentId) {
      return { ok: false, httpStatus: 409, code: 'environment', error: 'مفتاح ميسر المضبوط لا يخص بيئة هذه الدفعة' }
    }
    try {
      current = (await deps.moyasar.fetchPayment(input.paymentId)).refunded ?? 0
    } catch {
      return { ok: false, httpStatus: 503, code: 'unavailable', error: 'تعذّر سؤال ميسر عن الدفعة الآن — أعيدي المحاولة' }
    }
  }
  const { data, error } = await deps.rpc('fabric_store_refund_close_unconfirmed', {
    p_refund_id: input.refundId, p_actor_id: input.actorId, p_reference: input.reference,
    p_note: input.note, p_provider_refunded: current,
  })
  if (error) return { ok: false, httpStatus: 503, code: 'unavailable', error: 'تعذّر إغلاق الاسترداد' }
  const status = String((data as { status?: string } | null)?.status ?? '')
  if (status === 'ok') return { ok: true }
  if (status.startsWith('already_')) return { ok: false, httpStatus: 409, code: status, error: 'حُسم هذا الاسترداد من قبل' }
  const [httpStatus, message] = CLOSE_MESSAGES[status] ?? [400, 'تعذّر إغلاق الاسترداد']
  return { ok: false, httpStatus, code: status, error: message }
}

/** المهمة المجدولة: الاستردادات المعلّقة التي انتهى حجزها (رد ضائع، أو خادم توقف). */
export async function processPendingRefunds(
  deps: RefundDeps, limit = 10, allowNewCalls = true, deadline?: number
): Promise<Record<string, number>> {
  const { data, error } = await deps.rpc('fabric_store_due_refunds', { p_limit: limit })
  if (error) throw new Error(`fabric_store_due_refunds: ${error.message}`)
  const counts: Record<string, number> = {}
  for (const row of (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>) {
    // (R-CD-05) لا يبدأ استرداد بعد المهلة — ولا يُقطع نداء بدأ. حجزه دقيقتان فيعيده التشغيل التالي
    if (deadline !== undefined && Date.now() >= deadline) { counts.deferred = (counts.deferred ?? 0) + 1; continue }
    const refund: PendingRefund = {
      refundId: String(row.refund_id),
      paymentId: String(row.payment_id ?? ''),
      environment: String(row.environment ?? ''),
      amountHalalas: Number(row.amount_halalas),
      refundedBefore: Number(row.refunded_before),
      called: row.called === true,
      claimToken: String(row.claim_token ?? ''),
    }
    let status: SettleStatus
    try {
      status = refund.paymentId ? (await settleRefund(deps, refund, allowNewCalls)).status : 'pending'
    } catch (err) {
      console.error('fabric-store: refund reconciliation failed:', refund.refundId, (err as Error).message)
      status = 'pending'
    }
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts
}
