import type { BranchType } from './simple-accounting'

export type PayrollStatus = 'unpaid' | 'partial' | 'paid' | 'negative' | 'zero'
export type PayrollOperationType = 'salary' | 'payment' | 'advance' | 'deduction'
export type PayrollPaymentAccount = 'cash' | 'bank'
export type PayrollSalaryType = 'fixed' | 'piecework'

export interface WorkerPayrollMonth {
  id: string
  branch: BranchType
  worker_id: string
  worker_name: string
  payroll_year: number
  payroll_month: number
  period_key: string
  basic_salary: number
  works_total: number
  salary_type: PayrollSalaryType
  fixed_salary_value: number
  piece_count: number
  piece_rate: number
  piece_total: number
  overtime_hours: number
  overtime_rate: number
  overtime_total: number
  allowances_total: number
  deductions_total: number
  advances_total: number
  net_due: number
  total_paid: number
  remaining_due: number
  salary_status: PayrollStatus
  approved_at: string | null
  approved_by: string | null
  is_locked: boolean
  locked_at: string | null
  locked_by: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface WorkerPayrollOperation {
  id: string
  payroll_month_id: string
  branch: BranchType
  worker_id: string
  worker_name: string
  payroll_year: number
  payroll_month: number
  operation_type: PayrollOperationType
  operation_date: string
  amount: number
  before_amount: number
  after_amount: number
  salary_status_after: PayrollStatus
  reference: string
  note: string | null
  metadata: Record<string, unknown>
  is_approved: boolean
  approved_at: string
  approved_by: string | null
  journal_entry_id: string | null
  created_at: string
  created_by: string | null
}

export interface WorkerPayrollBigDebt {
  id: string
  branch: BranchType
  worker_id: string
  worker_name: string
  original_amount: number
  remaining_amount: number
  has_active_debt: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface WorkerPayrollPeriodLock {
  id: string
  branch: BranchType
  payroll_year: number
  payroll_month: number
  is_locked: boolean
  lock_reason: string | null
  locked_at: string | null
  locked_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkerPayrollAdjustmentRequest {
  id: string
  branch: BranchType
  worker_id: string
  worker_name: string
  payroll_year: number
  payroll_month: number
  reason: string
  request_note: string | null
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  requested_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkerPayrollRpcResult {
  month: WorkerPayrollMonth
  operation: WorkerPayrollOperation
}
