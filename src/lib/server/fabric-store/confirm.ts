/**
 * اعتماد البيع بعد السداد (المرحلة 6) — بلا Next.js، والاعتماديات تُمرَّر، مثل `payments.ts`.
 *
 * - `confirmPaidOrder`: يستدعي `fabric_store_confirm_order` (مبيعة income + خصم المخزون +
 *   استهلاك الحجز في معاملة واحدة، أو لا شيء). القاعدة تُغلق مهمة confirm_order بنفسها.
 *   قفل مشغول خلف مبيعة محل (55P03) يُعاد بعد لحظات، ثم يُترك للطابور.
 * - `processFabricStoreOutbox`: المهام المستحقة من الطابور: اعتماد البيع، وفاتورة الأستاذ.
 *   فاتورة الأستاذ خلف `FABRIC_STORE_ALOSTAZ_ENABLED` (مطفأ حتى الإطلاق)، ومنع تكرارها
 *   بحجز صف المبيعة نفسه الذي يستعمله زر «إرسال للمحاسبة».
 */

import type { FabricInvoiceSendResult } from '@/lib/server/alostaz-fabric-invoice'
import type { Rpc } from './payments'

export type ConfirmStatus =
  | 'confirmed' | 'already_confirmed' | 'test_no_sale' | 'stock_unavailable'
  | 'cancelled_order' | 'not_paid' | 'not_found' | 'retry'

export interface ConfirmOutcome {
  status: ConfirmStatus
  income_id?: string
  invoice_number?: number
  reason?: string
  error?: string
}

/** نتيجة إرسال فاتورة الأستاذ كما يراها الطابور (مشتقة من `sendFabricIncomeToAlostaz`). */
export type AlostazTaskOutcome =
  | { outcome: 'done'; note: string }
  | { outcome: 'retry'; error: string; seconds?: number }
  | { outcome: 'dead'; error: string }

/** نتيجة الإرسال ⇒ ما يفعله الطابور. «مجهول النتيجة» يتوقف ولا يُعاد (منع فاتورة مكررة). */
export function alostazTaskOutcome(result: FabricInvoiceSendResult): AlostazTaskOutcome {
  switch (result.kind) {
    case 'refunded':
      return { outcome: 'done', note: 'order fully refunded before its invoice — none sent' }
    case 'disabled':
      return { outcome: 'retry', error: 'online invoice sending is disabled', seconds: 300 }
    case 'sent':
      return { outcome: 'done', note: `sent ${result.invoice_code}` }
    case 'already_sent':
      return { outcome: 'done', note: `already sent ${result.invoice_code ?? result.invoice_id}` }
    case 'in_progress':
      return { outcome: 'retry', error: 'another sender holds the claim', seconds: 120 }
    case 'claim_error':
      return { outcome: 'retry', error: `claim failed: ${result.error}` }
    case 'status_unknown':
      return { outcome: 'retry', error: 'could not read the sync status' }
    case 'failed':
      return result.outcomeUnknown
        ? { outcome: 'dead', error: `outcome unknown — check alostaz before resending: ${result.error}` }
        : { outcome: 'retry', error: result.error }
    case 'review_required':
      return { outcome: 'dead', error: 'review_required on the sale — check alostaz before resending' }
    case 'sent_unsaved':
      return { outcome: 'dead', error: `invoice ${result.invoice_code} created but its reference was not saved: ${result.warning}` }
    case 'not_found':
      return { outcome: 'dead', error: 'sale not found' }
    case 'not_fabric':
      return { outcome: 'dead', error: 'sale is not a fabrics sale' }
  }
}

export interface OutboxDeps {
  rpc: Rpc
  /** يرسل مبيعة الأقمشة للأستاذ. غيابه = الإرسال مطفأ (المهمة تبقى معلّقة). */
  sendAlostazInvoice?: (incomeId: string) => Promise<AlostazTaskOutcome>
  sleep?: (ms: number) => Promise<void>
}

const LOCK_CODES = new Set(['55P03', '40P01', '40001'])
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** يعتمد بيع طلب مدفوع. لا يرمي: الخطأ يعود `retry` مع سببه. */
export async function confirmPaidOrder(
  deps: Pick<OutboxDeps, 'rpc' | 'sleep'>,
  orderId: string,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<ConfirmOutcome> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const sleep = deps.sleep ?? defaultSleep
  let lastError = 'unknown error'
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await deps.rpc('fabric_store_confirm_order', { p_order_id: orderId })
    if (!error) return (data ?? { status: 'retry', error: 'empty response' }) as ConfirmOutcome
    lastError = `${error.code ?? ''} ${error.message}`.trim()
    if (!error.code || !LOCK_CODES.has(error.code) || attempt === attempts) break
    await sleep((options.delayMs ?? 400) * attempt)
  }
  return { status: 'retry', error: lastError }
}

/** مهلة إعادة المحاولة: دقيقة ثم تتضاعف حتى ساعة. */
export const retryDelaySeconds = (attempts: number) => Math.min(3600, 60 * 2 ** Math.max(0, attempts))

interface DueTask {
  id: string
  topic: 'confirm_order' | 'alostaz_invoice'
  order_id: string | null
  payload: Record<string, unknown>
  attempts: number
}

async function finish(rpc: Rpc, taskId: string, outcome: 'done' | 'retry' | 'dead', error: string | null, seconds: number) {
  const { error: rpcError } = await rpc('fabric_store_finish_outbox', {
    p_task_id: taskId, p_outcome: outcome, p_error: error ? error.slice(0, 2000) : null, p_retry_seconds: seconds,
  })
  if (rpcError) console.error('fabric-store: could not update outbox task', taskId, rpcError.message)
}

/**
 * ينفّذ المهام المستحقة. `orderId` يقصرها على طلب واحد (بعد السداد مباشرة)، وبدونه
 * يمر على الطابور كله (المهمة المجدولة). يعيد عدّاً للنتائج للسجل.
 */
export async function processFabricStoreOutbox(
  deps: OutboxDeps,
  options: { orderId?: string; limit?: number; deadline?: number } = {}
): Promise<Record<string, number>> {
  const topics = deps.sendAlostazInvoice ? ['confirm_order', 'alostaz_invoice'] : ['confirm_order']
  const { data, error } = await deps.rpc('fabric_store_due_outbox', {
    p_topics: topics, p_limit: options.limit ?? 20, p_order_id: options.orderId ?? null,
  })
  if (error) throw new Error(`fabric_store_due_outbox: ${error.message}`)

  const counts: Record<string, number> = {}
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1 }

  // الاعتماد أولاً: فاتورة الأستاذ تتبع مبيعة موجودة.
  const tasks = (Array.isArray(data) ? data : []) as DueTask[]
  tasks.sort((a, b) => (a.topic === b.topic ? 0 : a.topic === 'confirm_order' ? -1 : 1))

  for (const task of tasks) {
    // (R-CD-05) لا تبدأ مهمة بعد المهلة؛ قفلها المؤقت ينتهي فيأخذها التشغيل التالي
    if (options.deadline !== undefined && Date.now() >= options.deadline) { count('deferred'); continue }
    if (task.topic === 'confirm_order') {
      if (!task.order_id) {
        await finish(deps.rpc, task.id, 'dead', 'confirm_order task without an order', 0)
        count('confirm:dead')
        continue
      }
      const result = await confirmPaidOrder(deps, task.order_id, { attempts: options.orderId ? 3 : 1 })
      if (result.status === 'retry') {
        await finish(deps.rpc, task.id, 'retry', result.error ?? 'retry', retryDelaySeconds(task.attempts))
      }
      count(`confirm:${result.status}`)
      // سداد اعتُمد الآن ⇒ فاتورته في الطابور؛ تُرسل في هذه الدورة إن كان الإرسال مفعّلاً.
      if (result.status === 'confirmed' && result.income_id && deps.sendAlostazInvoice) {
        const { data: fresh } = await deps.rpc('fabric_store_due_outbox', {
          p_topics: ['alostaz_invoice'], p_limit: 5, p_order_id: task.order_id,
        })
        for (const next of (Array.isArray(fresh) ? fresh : []) as DueTask[]) {
          if (!tasks.some(t => t.id === next.id)) tasks.push(next)
        }
      }
      continue
    }

    if (task.topic === 'alostaz_invoice' && deps.sendAlostazInvoice) {
      const incomeId = typeof task.payload?.income_id === 'string' ? task.payload.income_id : null
      if (!incomeId) {
        await finish(deps.rpc, task.id, 'dead', 'alostaz_invoice task without income_id', 0)
        count('alostaz:dead')
        continue
      }
      let outcome: AlostazTaskOutcome
      try {
        outcome = await deps.sendAlostazInvoice(incomeId)
      } catch (err) {
        outcome = { outcome: 'retry', error: (err as Error).message }
      }
      await finish(deps.rpc, task.id, outcome.outcome, outcome.outcome === 'done' ? null : outcome.error,
        outcome.outcome === 'retry' ? outcome.seconds ?? retryDelaySeconds(task.attempts) : 0)
      count(`alostaz:${outcome.outcome}`)
    }
  }
  return counts
}
