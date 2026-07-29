import { enqueueTailoringPrintJob } from './print-job-service'

export interface CashDrawerWithdrawalVoucher {
  withdrawalId: string
  amount: number
  reason: string
  withdrawnAt: string
  withdrawnBy: string
}

export type CashDrawerOpenDestination = 'station'

export interface CashDrawerDispatchOptions {
  /** Creates a new intentional drawer command instead of deduplicating a retry. */
  forceNewJob?: boolean
  idempotencyKey?: string
}

/**
 * Compatibility no-op. Drawer commands now go through the durable tailoring
 * queue and no longer need to warm up the local Android bridge.
 */
export function prepareCashDrawerOpen(): Promise<void> {
  return Promise.resolve()
}

/**
 * Persists a cash-drawer command for the active tailoring station. The
 * withdrawal id is the stable idempotency identity, so retrying a failed HTTP
 * response cannot enqueue the same command twice.
 */
export async function dispatchCashDrawerOpen(
  voucher: CashDrawerWithdrawalVoucher,
  preparation?: Promise<void>,
  options: CashDrawerDispatchOptions = {}
): Promise<CashDrawerOpenDestination> {
  if (preparation) await preparation

  await enqueueTailoringPrintJob(voucher, {
    jobType: 'tailoring_cash_drawer_open',
    incomeId: voucher.withdrawalId,
    openCashDrawer: true,
    forceNewJob: options.forceNewJob,
    idempotencyKey: options.idempotencyKey,
  })

  return 'station'
}
