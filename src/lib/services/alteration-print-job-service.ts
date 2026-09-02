/**
 * طابور طباعة أوراق التعديلات (branch = 'alterations').
 *
 * صفحة التعديلات لا تتصل بالطابعة إطلاقًا؛ تكتب المهمة في الطابور عبر RPC ذرّي،
 * ثم يسحبها تابلت الورشة النشط ويطبعها على TA POS TA-900UWB عبر منفذ RAW 9100.
 * هذا الطابور منفصل تمامًا عن طابور فواتير التفصيل.
 */

import { supabase } from '@/lib/supabase'
import {
  ALTERATION_SLIP_JOB_TYPE,
  ALTERATION_TEST_SLIP_JOB_TYPE,
  type AlterationSlipPayload,
} from '@/lib/print-alteration-slip'

export type AlterationPrintJobType =
  | typeof ALTERATION_SLIP_JOB_TYPE
  | typeof ALTERATION_TEST_SLIP_JOB_TYPE

export interface EnqueueAlterationPrintJobResult {
  job_id: string
  status: string
  deduplicated: boolean
}

export interface QueueAlterationPrintOptions {
  jobType?: AlterationPrintJobType
  /**
   * كل ضغطة على زر الطباعة نية صريحة لإخراج ورقة جديدة، لذلك تحمل مفتاحًا فريدًا.
   * اتركه false فقط عند الطباعة التلقائية التي يجب ألا تتكرر.
   */
  forceNewJob?: boolean
  reprintOf?: string | null
  idempotencyKey?: string
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildIdempotencyKey(
  payload: AlterationSlipPayload,
  options: QueueAlterationPrintOptions
): string {
  if (options.idempotencyKey) return options.idempotencyKey

  const jobType = options.jobType ?? ALTERATION_SLIP_JOB_TYPE
  const stableKey = `alterations:${jobType}:${payload.alteration_id}:v1`

  return options.forceNewJob === false
    ? stableKey
    : `${stableKey}:request:${createRequestId()}`
}

function normalizeEnqueueResult(data: unknown): EnqueueAlterationPrintJobResult {
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
    deduplicated:
      result.deduplicated === true ||
      (typeof result.created === 'boolean' && result.created === false),
  }
}

/** إرسال ورقة تعديل إلى طابور محطة الورشة. */
export async function enqueueAlterationSlipPrint(
  payload: AlterationSlipPayload,
  options: QueueAlterationPrintOptions = {}
): Promise<EnqueueAlterationPrintJobResult> {
  const jobType = options.jobType ?? ALTERATION_SLIP_JOB_TYPE

  const { data, error } = await supabase.rpc('enqueue_alterations_print_job', {
    p_job_type: jobType,
    p_alteration_id: payload.alteration_id || null,
    p_payload: payload,
    p_idempotency_key: buildIdempotencyKey(payload, { ...options, jobType }),
    p_reprint_of: options.reprintOf ?? null,
  })

  if (error) throw error
  return normalizeEnqueueResult(data)
}
