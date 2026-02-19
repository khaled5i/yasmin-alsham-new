import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { BranchType } from '@/types/simple-accounting'
import type {
  PayrollOperationType,
  PayrollPaymentAccount,
  PayrollSalaryType,
  WorkerPayrollAdjustmentRequest,
  WorkerPayrollBigDebt,
  WorkerPayrollMonth,
  WorkerPayrollOperation,
  WorkerPayrollPeriodLock,
  WorkerPayrollRpcResult
} from '@/types/worker-payroll'

function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Unknown error'
}

function monthToYearMonth(monthValue: string): { year: number; month: number } {
  const [yearStr, monthStr] = monthValue.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)

  if (!year || !month) {
    throw new Error('Invalid month value')
  }

  return { year, month }
}

export async function getWorkerPayrollMonths(
  branch: BranchType,
  monthValue: string
): Promise<WorkerPayrollMonth[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  try {
    const { year, month } = monthToYearMonth(monthValue)
    const { data, error } = await supabase
      .from('worker_payroll_months')
      .select('*')
      .eq('branch', branch)
      .eq('payroll_year', year)
      .eq('payroll_month', month)
      .order('worker_name', { ascending: true })

    if (error) {
      console.error('Error fetching worker payroll months:', error)
      return []
    }

    return (data || []) as WorkerPayrollMonth[]
  } catch (error) {
    console.error('Error fetching worker payroll months:', error)
    return []
  }
}

export async function getWorkerPayrollOperations(
  branch: BranchType,
  monthValue: string
): Promise<WorkerPayrollOperation[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  try {
    const { year, month } = monthToYearMonth(monthValue)
    const { data, error } = await supabase
      .from('worker_payroll_operations')
      .select('*')
      .eq('branch', branch)
      .eq('payroll_year', year)
      .eq('payroll_month', month)
      .order('operation_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching worker payroll operations:', error)
      return []
    }

    return (data || []) as WorkerPayrollOperation[]
  } catch (error) {
    console.error('Error fetching worker payroll operations:', error)
    return []
  }
}

export async function getWorkerPayrollPeriodLock(
  branch: BranchType,
  monthValue: string
): Promise<WorkerPayrollPeriodLock | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  try {
    const { year, month } = monthToYearMonth(monthValue)
    const { data, error } = await supabase
      .from('worker_payroll_period_locks')
      .select('*')
      .eq('branch', branch)
      .eq('payroll_year', year)
      .eq('payroll_month', month)
      .maybeSingle()

    if (error) {
      console.error('Error fetching worker payroll lock:', error)
      return null
    }

    return (data || null) as WorkerPayrollPeriodLock | null
  } catch (error) {
    console.error('Error fetching worker payroll lock:', error)
    return null
  }
}

interface SaveSalarySnapshotInput {
  branch: BranchType
  workerId: string
  workerName: string
  monthValue: string
  basicSalary: number
  worksTotal: number
  salaryType?: PayrollSalaryType
  fixedSalaryValue?: number
  pieceCount?: number
  pieceRate?: number
  overtimeHours?: number
  overtimeRate?: number
  allowancesTotal: number
  deductionsTotal: number
  advancesTotal: number
  operationDate?: string
  reference?: string
  note?: string
}

export async function saveWorkerPayrollSnapshot(input: SaveSalarySnapshotInput): Promise<WorkerPayrollRpcResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { year, month } = monthToYearMonth(input.monthValue)
  const { data, error } = await supabase.rpc('upsert_worker_payroll_month_snapshot', {
    p_branch: input.branch,
    p_worker_id: input.workerId,
    p_worker_name: input.workerName,
    p_year: year,
    p_month: month,
    p_basic_salary: input.basicSalary,
    p_works_total: input.worksTotal,
    p_salary_type: input.salaryType || 'fixed',
    p_fixed_salary_value: input.fixedSalaryValue ?? input.basicSalary,
    p_piece_count: input.pieceCount ?? 0,
    p_piece_rate: input.pieceRate ?? 0,
    p_overtime_hours: input.overtimeHours ?? 0,
    p_overtime_rate: input.overtimeRate ?? 12.5,
    p_allowances_total: input.allowancesTotal,
    p_deductions_total: input.deductionsTotal,
    p_advances_total: input.advancesTotal,
    p_operation_date: input.operationDate || null,
    p_reference: input.reference || null,
    p_note: input.note || null
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollRpcResult
}

interface RegisterPayrollPaymentInput {
  branch: BranchType
  workerId: string
  workerName: string
  monthValue: string
  operationDate: string
  amount: number
  reference?: string
  note?: string
  paymentAccount?: PayrollPaymentAccount
}

export async function registerWorkerPayrollPayment(input: RegisterPayrollPaymentInput): Promise<WorkerPayrollRpcResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { year, month } = monthToYearMonth(input.monthValue)
  const { data, error } = await supabase.rpc('register_worker_payroll_payment', {
    p_branch: input.branch,
    p_worker_id: input.workerId,
    p_worker_name: input.workerName,
    p_year: year,
    p_month: month,
    p_operation_date: input.operationDate,
    p_amount: input.amount,
    p_reference: input.reference || null,
    p_note: input.note || null,
    p_payment_account: input.paymentAccount || 'cash'
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollRpcResult
}

interface RegisterPayrollAdjustmentInput {
  branch: BranchType
  workerId: string
  workerName: string
  monthValue: string
  operationType: Extract<PayrollOperationType, 'advance' | 'deduction'>
  operationDate: string
  amount: number
  reference?: string
  note?: string
  paymentAccount?: PayrollPaymentAccount
}

export async function registerWorkerPayrollAdjustment(input: RegisterPayrollAdjustmentInput): Promise<WorkerPayrollRpcResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { year, month } = monthToYearMonth(input.monthValue)
  const { data, error } = await supabase.rpc('register_worker_payroll_adjustment', {
    p_branch: input.branch,
    p_worker_id: input.workerId,
    p_worker_name: input.workerName,
    p_year: year,
    p_month: month,
    p_operation_type: input.operationType,
    p_operation_date: input.operationDate,
    p_amount: input.amount,
    p_reference: input.reference || null,
    p_note: input.note || null,
    p_payment_account: input.paymentAccount || 'cash'
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollRpcResult
}

interface LockPayrollPeriodInput {
  branch: BranchType
  monthValue: string
  reason?: string
}

export async function lockWorkerPayrollPeriod(input: LockPayrollPeriodInput): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { year, month } = monthToYearMonth(input.monthValue)
  const { error } = await supabase.rpc('lock_worker_payroll_period', {
    p_branch: input.branch,
    p_year: year,
    p_month: month,
    p_reason: input.reason || null
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}

interface CreateAdjustmentRequestInput {
  branch: BranchType
  workerId: string
  workerName: string
  monthValue: string
  reason: string
  requestNote?: string
}

export async function createWorkerPayrollAdjustmentRequest(
  input: CreateAdjustmentRequestInput
): Promise<WorkerPayrollAdjustmentRequest> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { year, month } = monthToYearMonth(input.monthValue)
  const { data, error } = await supabase.rpc('create_worker_payroll_adjustment_request', {
    p_branch: input.branch,
    p_worker_id: input.workerId,
    p_worker_name: input.workerName,
    p_year: year,
    p_month: month,
    p_reason: input.reason,
    p_request_note: input.requestNote || null
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollAdjustmentRequest
}

export async function getWorkerPayrollBigDebts(branch: BranchType): Promise<WorkerPayrollBigDebt[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  try {
    const { data, error } = await supabase
      .from('worker_payroll_big_debts')
      .select('*')
      .eq('branch', branch)
      .order('worker_name', { ascending: true })

    if (error) {
      console.error('Error fetching worker payroll big debts:', error)
      return []
    }

    return (data || []) as WorkerPayrollBigDebt[]
  } catch (error) {
    console.error('Error fetching worker payroll big debts:', error)
    return []
  }
}

interface UpsertWorkerPayrollBigDebtInput {
  branch: BranchType
  workerId: string
  workerName: string
  amount: number
}

export async function upsertWorkerPayrollBigDebt(input: UpsertWorkerPayrollBigDebtInput): Promise<WorkerPayrollBigDebt> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase.rpc('upsert_worker_payroll_big_debt', {
    p_branch: input.branch,
    p_worker_id: input.workerId,
    p_worker_name: input.workerName,
    p_amount: input.amount
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollBigDebt
}

interface RegisterWorkerPayrollBigDebtPaymentInput {
  branch: BranchType
  workerId: string
  amount: number
}

export async function registerWorkerPayrollBigDebtPayment(
  input: RegisterWorkerPayrollBigDebtPaymentInput
): Promise<WorkerPayrollBigDebt> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase.rpc('register_worker_payroll_big_debt_payment', {
    p_branch: input.branch,
    p_worker_id: input.workerId,
    p_amount: input.amount
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollBigDebt
}
