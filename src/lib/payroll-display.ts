import type { WorkerPayrollMonth, WorkerPayrollOperation } from '@/types/worker-payroll'

export const PAYROLL_CHANGED_EVENT = 'yasmin:payroll-changed'
export const payrollMoney = (value: number, arabic = true) => {
  const amount = Number(value) || 0
  const number =
    Math.abs(amount) > 0.009 && Math.abs(amount) < 0.5
      ? (amount < 0 ? '−' : '') + (arabic ? 'أقل من 1' : 'less than 1')
      : new Intl.NumberFormat(arabic ? 'ar-SA-u-nu-latn' : 'en-SA', {
          maximumFractionDigits: 0
        }).format(amount)
  return `${number} ${arabic ? 'ر.س' : 'SAR'}`
}
export const payrollMonth = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit'
  })
    .formatToParts(date)
    .filter((p) => p.type === 'year' || p.type === 'month')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'year' ? -1 : 1))
    .map((p) => p.value)
    .join('-')

export function shiftPayrollMonth(month: string, delta: number) {
  const [year, part] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, part - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function payrollDate(month: string) {
  if (month === payrollMonth())
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
  const [year, part] = month.split('-').map(Number)
  return `${month}-${new Date(Date.UTC(year, part, 0)).getUTCDate()}`
}

export function isDebtSettlement(operation: Pick<WorkerPayrollOperation, 'metadata'>) {
  return (
    operation.metadata?.debt_settlement === true || operation.metadata?.debt_settlement === 'true'
  )
}

/** Mirrors the database pricing source, including an explicit zero price. */
export function pieceworkAmount(
  price: number | string | null | undefined,
  bonus: number | string | null | undefined
) {
  const value = Number(price) || 0
  return value > 0 ? Math.round((value + (Number(bonus) || 0)) * 100) / 100 : 0
}

/** Salary settlement and cash outflow are different measures. Never subtract debt twice. */
export function payrollAmounts(
  row: WorkerPayrollMonth | undefined,
  operations: WorkerPayrollOperation[] = []
) {
  let cashPaid = 0
  let newDebt = 0
  let settledDebt = 0
  for (const op of operations) {
    if (op.operation_type === 'payment') {
      if (isDebtSettlement(op)) settledDebt += Number(op.amount)
      else cashPaid += Number(op.amount)
    } else if (op.operation_type === 'deduction') newDebt += Number(op.amount)
  }
  return {
    due: Number(row?.net_due || 0),
    paid: Number(row?.total_paid || 0),
    remaining: Number(row?.remaining_due || 0),
    cashPaid,
    newDebt,
    settledDebt,
    cashOut: cashPaid + newDebt
  }
}

export function notifyPayrollChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PAYROLL_CHANGED_EVENT))
    // Other open tabs refresh without needing a manual transfer or refresh button.
    try {
      localStorage.setItem(PAYROLL_CHANGED_EVENT, String(Date.now()))
    } catch {
      /* The same-tab event still works in restricted storage modes. */
    }
  }
}
