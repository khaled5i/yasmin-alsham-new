import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'
import {
  queueTailoringReceiptPrint,
  type EnqueueTailoringPrintJobResult,
} from './print-job-service'

export type TailoringPrintDestination = 'station'

export interface TailoringPrintDispatchOptions {
  openCashDrawer?: boolean
  /**
   * Use only for an intentional manual reprint. Automatic preliminary and
   * delivery receipts must keep the deterministic idempotency key.
   */
  forceNewJob?: boolean
  reprintOf?: string | null
  idempotencyKey?: string
}

export interface TailoringPrintDispatchResult {
  destination: TailoringPrintDestination
  jobId: string
  status: string
  deduplicated: boolean
}

/**
 * Compatibility no-op. Callers used to warm up the local Android bridge before
 * saving an order; queue-first printing never contacts localhost.
 */
export function prepareTailoringReceiptPrint(): Promise<void> {
  return Promise.resolve()
}

/**
 * Every tailoring receipt is persisted first. The active Android station
 * claims it later; phones and web clients never talk to the printer directly.
 */
export async function dispatchTailoringReceiptPrint(
  payload: TailoringReceiptPayload,
  options: TailoringPrintDispatchOptions = {}
): Promise<TailoringPrintDispatchResult> {
  const queued: EnqueueTailoringPrintJobResult = await queueTailoringReceiptPrint(payload, {
    openCashDrawer: options.openCashDrawer,
    forceNewJob: options.forceNewJob,
    reprintOf: options.reprintOf,
    idempotencyKey: options.idempotencyKey,
  })

  return {
    destination: 'station',
    jobId: queued.job_id,
    status: queued.status,
    deduplicated: queued.deduplicated,
  }
}
