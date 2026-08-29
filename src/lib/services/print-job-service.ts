// ============================================================================
// خدمة طابور الطباعة عن بُعد (print_jobs) — migration 63
// ----------------------------------------------------------------------------
// صفحة مبيعات الأقمشة تُرسل طلب طباعة (queueFabricReceiptPrint) → محطة الطباعة على الكاشير
// تجلب المعلّق (getPendingPrintJobs)، تطالب به ذرياً (claimPrintJob) ثم تنهيه.
// ============================================================================

import { supabase } from '@/lib/supabase'
import type { Income } from '@/types/simple-accounting'
import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'
import {
  FABRIC_INVENTORY_LABEL_JOB_TYPE,
  type FabricInventoryLabelPayload,
} from '@/lib/print-fabric-inventory-label'

export type PrintJobStatus = 'pending' | 'printing' | 'done' | 'error'

export interface PrintJob<TPayload = Income> {
  id: string
  branch: string
  job_type: string
  income_id: string | null
  payload: TPayload
  status: PrintJobStatus
  error_message: string | null
  printed_at: string | null
  created_at: string
}

export interface EnqueueTailoringPrintJobResult {
  job_id: string
  status: string
  deduplicated: boolean
}

export interface QueueTailoringPrintOptions {
  jobType?: 'tailoring_order_receipt' | 'tailoring_cash_drawer_open'
  incomeId?: string | null
  openCashDrawer?: boolean
  reprintOf?: string | null
  /**
   * Automatic receipts use a deterministic key. Intentional reprints append
   * a fresh UUID so every click creates one new job while the RPC itself stays
   * idempotent if the same request is retried.
   */
  forceNewJob?: boolean
  idempotencyKey?: string
}

const FABRICS_BRANCH = 'fabrics'
const TAILORING_BRANCH = 'tailoring'

/**
 * إرسال طلب طباعة فاتورة بيع قماش إلى الطابور (يُستدعى من صفحة المبيعات على أي جهاز).
 * نخزّن نسخة كاملة من بيانات البيع (payload) حتى تُطبع كما أُرسلت حتى لو تغيّر السجل لاحقاً.
 */
export async function queueFabricReceiptPrint(item: Income): Promise<void> {
  const { error } = await supabase.from('print_jobs').insert({
    branch: FABRICS_BRANCH,
    job_type: 'fabric_sale_receipt',
    income_id: item.id,
    payload: item,
    status: 'pending',
  })
  if (error) throw error
}

/**
 * يرسل لقطة مستقلة لكل ملصق مخزون. تعدد الصفوف مقصود: كل صف يمثل ملصقاً
 * فعلياً واحداً حتى تبقى إعادة المحاولة والسجل واضحين داخل محطة الطباعة.
 */
export async function queueFabricInventoryLabels(
  labels: FabricInventoryLabelPayload[]
): Promise<void> {
  if (labels.length === 0) return

  const { error } = await supabase.from('print_jobs').insert(
    labels.map((payload) => ({
      branch: FABRICS_BRANCH,
      job_type: FABRIC_INVENTORY_LABEL_JOB_TYPE,
      income_id: null,
      payload,
      status: 'pending' as const,
    }))
  )
  if (error) throw error
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildTailoringIdempotencyKey(
  payload: TailoringReceiptPayload,
  options: QueueTailoringPrintOptions
): string {
  if (options.idempotencyKey) return options.idempotencyKey

  const jobType = options.jobType ?? 'tailoring_order_receipt'
  const receiptType = payload.receipt_type ?? 'delivery'
  const entityId = options.incomeId ?? payload.order_id
  const stableKey = `${TAILORING_BRANCH}:${jobType}:${entityId}:${receiptType}:v1`

  return options.forceNewJob
    ? `${stableKey}:request:${createRequestId()}`
    : stableKey
}

function normalizeEnqueueResult(data: unknown): EnqueueTailoringPrintJobResult {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    throw new Error('لم تُرجع محطة الطباعة معرّف مهمة صالحًا.')
  }

  const result = row as Record<string, unknown>
  if (typeof result.job_id !== 'string' || result.job_id.length === 0) {
    throw new Error('لم تُرجع محطة الطباعة معرّف مهمة صالحًا.')
  }

  return {
    job_id: result.job_id,
    status: typeof result.status === 'string' ? result.status : 'pending',
    // Accept `created` during the rolling migration while keeping the public
    // web contract expressed as `deduplicated`.
    deduplicated:
      result.deduplicated === true ||
      (typeof result.created === 'boolean' && result.created === false),
  }
}

/**
 * يرسل أمر تفصيل إلى RPC ذرّي. لا يفتح المتصفح أو جسر localhost إطلاقًا.
 * المفتاح الثابت يمنع تكرار الطباعة التلقائية، بينما forceNewJob مخصص
 * لإعادة الطباعة اليدوية المقصودة.
 */
export async function enqueueTailoringPrintJob<TPayload extends object>(
  payload: TPayload,
  options: QueueTailoringPrintOptions
): Promise<EnqueueTailoringPrintJobResult> {
  const receiptPayload = payload as unknown as TailoringReceiptPayload
  const jobType = options.jobType ?? 'tailoring_order_receipt'
  const incomeId = options.incomeId ?? receiptPayload.order_id ?? null
  const idempotencyKey = buildTailoringIdempotencyKey(receiptPayload, {
    ...options,
    jobType,
    incomeId,
  })

  const { data, error } = await supabase.rpc('enqueue_tailoring_print_job', {
    p_job_type: jobType,
    p_income_id: incomeId,
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
    p_open_cash_drawer: options.openCashDrawer === true,
    p_reprint_of: options.reprintOf ?? null,
  })

  if (error) throw error
  return normalizeEnqueueResult(data)
}

/** إرسال إيصال طلب تفصيل إلى محطة الطابعة. */
export async function queueTailoringReceiptPrint(
  payload: TailoringReceiptPayload,
  options: Omit<QueueTailoringPrintOptions, 'jobType' | 'incomeId'> = {}
): Promise<EnqueueTailoringPrintJobResult> {
  return enqueueTailoringPrintJob(payload, {
    ...options,
    jobType: 'tailoring_order_receipt',
    incomeId: payload.order_id,
    // لا يُفتح الدرج إن لم يحتو الإيصال مبلغ كاش فعليًا.
    openCashDrawer:
      options.openCashDrawer === true &&
      Math.max(0, Number(payload.cash_amount) || 0) >= 0.005,
  })
}

/** جلب الطلبات المعلّقة بالترتيب (تُستدعى عند بدء تشغيل المحطة + بعد كل حدث Realtime). */
export async function getPendingPrintJobs<TPayload = Income>(
  branch: string = FABRICS_BRANCH,
  jobTypes: string[] = []
): Promise<PrintJob<TPayload>[]> {
  const baseQuery = supabase
    .from('print_jobs')
    .select('*')
    .eq('branch', branch)
    .eq('status', 'pending')

  const filteredQuery = jobTypes.length > 0
    ? baseQuery.in('job_type', jobTypes)
    : baseQuery

  const { data, error } = await filteredQuery
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PrintJob<TPayload>[]
}

/**
 * مطالبة ذرية بطلب: pending → printing.
 * الشرط `.eq('status', 'pending')` في UPDATE ذرّي على مستوى الصف في Postgres،
 * فلو فُتحت المحطة على جهازين لن ينجح إلا واحد؛ الخاسر يحصل على null (لا طباعة مزدوجة).
 */
export async function claimPrintJob<TPayload = Income>(id: string): Promise<PrintJob<TPayload> | null> {
  const { data, error } = await supabase
    .from('print_jobs')
    .update({ status: 'printing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()
  if (error) throw error
  return (data as PrintJob<TPayload>) ?? null
}

/** إنهاء الطلب بنجاح. */
export async function markPrintJobDone(id: string): Promise<void> {
  const { error } = await supabase
    .from('print_jobs')
    .update({ status: 'done', printed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** تعليم الطلب كفاشل مع رسالة مختصرة. */
export async function markPrintJobError(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('print_jobs')
    .update({ status: 'error', error_message: message.slice(0, 500) })
    .eq('id', id)
  if (error) throw error
}

/** إعادة طلب فاشل إلى المعلّقات (زر "إعادة المحاولة" في المحطة). */
export async function retryPrintJob(id: string): Promise<void> {
  const { error } = await supabase
    .from('print_jobs')
    .update({ status: 'pending', error_message: null })
    .eq('id', id)
  if (error) throw error
}
