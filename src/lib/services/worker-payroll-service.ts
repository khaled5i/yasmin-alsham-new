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
  if (typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>
    const message = typeof errorRecord.message === 'string' ? errorRecord.message : ''
    const details = typeof errorRecord.details === 'string' ? errorRecord.details : ''
    const hint = typeof errorRecord.hint === 'string' ? errorRecord.hint : ''

    const joined = [message, details, hint].filter(Boolean).join(' | ')
    if (joined) return joined

    try {
      return JSON.stringify(errorRecord)
    } catch {
      return 'Unknown error'
    }
  }
  return 'Unknown error'
}

function isMissingSupabaseResourceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const errorRecord = error as Record<string, unknown>
  const code = typeof errorRecord.code === 'string' ? errorRecord.code : ''
  const message = typeof errorRecord.message === 'string' ? errorRecord.message.toLowerCase() : ''
  const details = typeof errorRecord.details === 'string' ? errorRecord.details.toLowerCase() : ''
  const hint = typeof errorRecord.hint === 'string' ? errorRecord.hint.toLowerCase() : ''
  const blob = `${message} ${details} ${hint}`

  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') {
    return true
  }

  return (
    blob.includes('does not exist') ||
    blob.includes('not found in the schema cache') ||
    blob.includes('could not find the table') ||
    blob.includes('could not find the function')
  )
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

export async function getWorkerPayrollMonthsInRange(
  branch: BranchType,
  startDate: Date,
  endDate: Date
): Promise<WorkerPayrollMonth[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  try {
    const startYear = startDate.getFullYear()
    const startMonth = startDate.getMonth() + 1
    const endYear = endDate.getFullYear()
    const endMonth = endDate.getMonth() + 1

    const { data, error } = await supabase
      .from('worker_payroll_months')
      .select('*')
      .eq('branch', branch)
      .or(
        `and(payroll_year.gt.${startYear},payroll_year.lt.${endYear}),` +
        `and(payroll_year.eq.${startYear},payroll_month.gte.${startMonth},payroll_year.eq.${endYear},payroll_month.lte.${endMonth}),` +
        `and(payroll_year.eq.${startYear},payroll_year.eq.${endYear},payroll_month.gte.${startMonth},payroll_month.lte.${endMonth}),` +
        `and(payroll_year.eq.${startYear},payroll_year.lt.${endYear},payroll_month.gte.${startMonth}),` +
        `and(payroll_year.gt.${startYear},payroll_year.eq.${endYear},payroll_month.lte.${endMonth})`
      )
      .order('payroll_year', { ascending: false })
      .order('payroll_month', { ascending: false })

    if (error) {
      console.error('Error fetching worker payroll months range:', error)
      return []
    }

    // تصفية يدوية دقيقة لضمان الدقة
    const result = (data || []).filter((row: WorkerPayrollMonth) => {
      const rowDate = new Date(row.payroll_year, row.payroll_month - 1, 1)
      const startOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      const endOfMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
      return rowDate >= startOfMonth && rowDate <= endOfMonth
    })

    return result as WorkerPayrollMonth[]
  } catch (error) {
    console.error('Error fetching worker payroll months range:', error)
    return []
  }
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

/**
 * معلومات آخر راتب معروف للعامل قبل شهر معين
 */
export interface LastSalaryInfo {
  salary_type: PayrollSalaryType
  fixed_salary_value: number
  piece_count: number
  piece_rate: number
}

/**
 * جلب آخر معلومات الراتب لكل عامل قبل شهر معين
 * يُستخدم لملء نموذج الراتب تلقائياً للأشهر الجديدة مع الحفاظ على نوع الراتب
 */
export async function getLastSalaryInfoBeforeMonth(
  branch: BranchType,
  beforeMonthValue: string
): Promise<Record<string, LastSalaryInfo>> {
  if (!isSupabaseConfigured()) {
    return {}
  }

  try {
    const { year, month } = monthToYearMonth(beforeMonthValue)

    // جلب جميع سجلات الرواتب قبل الشهر المحدد بترتيب تنازلي (بغض النظر عن نوع الراتب)
    const { data, error } = await supabase
      .from('worker_payroll_months')
      .select('worker_id, fixed_salary_value, basic_salary, piece_count, piece_rate, payroll_year, payroll_month, salary_type')
      .eq('branch', branch)
      .or(`payroll_year.lt.${year},and(payroll_year.eq.${year},payroll_month.lt.${month})`)
      .order('payroll_year', { ascending: false })
      .order('payroll_month', { ascending: false })

    if (error) {
      console.error('Error fetching last salary info:', error)
      return {}
    }

    // بناء خريطة: worker_id → آخر معلومات راتب معروفة
    const infoMap: Record<string, LastSalaryInfo> = {}

    if (data) {
      for (const row of data) {
        // نحتفظ فقط بأحدث سجل لكل عامل
        if (!infoMap[row.worker_id]) {
          infoMap[row.worker_id] = {
            salary_type: (row.salary_type === 'piecework' ? 'piecework' : 'fixed') as PayrollSalaryType,
            fixed_salary_value: row.fixed_salary_value || row.basic_salary || 0,
            piece_count: row.piece_count || 0,
            piece_rate: row.piece_rate || 0
          }
        }
      }
    }

    return infoMap
  } catch (error) {
    console.error('Error fetching last salary info:', error)
    return {}
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

export async function getWorkerAdvancesAllPeriods(
  branch: BranchType,
  workerId: string
): Promise<WorkerPayrollOperation[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  try {
    const { data, error } = await supabase
      .from('worker_payroll_operations')
      .select('*')
      .eq('branch', branch)
      .eq('worker_id', workerId)
      .eq('operation_type', 'advance')
      .order('payroll_year', { ascending: false })
      .order('payroll_month', { ascending: false })
      .order('operation_date', { ascending: false })

    if (error) {
      console.error('Error fetching worker advances all periods:', error)
      return []
    }

    return (data || []) as WorkerPayrollOperation[]
  } catch (error) {
    console.error('Error fetching worker advances all periods:', error)
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

interface UnlockPayrollPeriodInput {
  branch: BranchType
  monthValue: string
}

export async function unlockWorkerPayrollPeriod(input: UnlockPayrollPeriodInput): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { year, month } = monthToYearMonth(input.monthValue)
  const { error } = await supabase.rpc('unlock_worker_payroll_period', {
    p_branch: input.branch,
    p_year: year,
    p_month: month
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
      if (isMissingSupabaseResourceError(error)) {
        // Backward compatibility: if migration isn't applied yet, don't break dashboard load.
        return []
      }
      console.warn('Warning fetching worker payroll big debts:', toErrorMessage(error))
      return []
    }

    return (data || []) as WorkerPayrollBigDebt[]
  } catch (error) {
    console.warn('Warning fetching worker payroll big debts:', toErrorMessage(error))
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
    if (isMissingSupabaseResourceError(error)) {
      throw new Error('Big debt database migration is missing. Please apply worker payroll big debt migration first.')
    }
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
    if (isMissingSupabaseResourceError(error)) {
      throw new Error('Big debt database migration is missing. Please apply worker payroll big debt migration first.')
    }
    throw new Error(toErrorMessage(error))
  }

  return data as WorkerPayrollBigDebt
}

export async function deleteWorkerPayrollOperation(operationId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await supabase.rpc('delete_worker_payroll_operation', {
    p_operation_id: operationId
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}

/**
 * تحديث الراتب الثابت لجميع الأشهر المستقبلية غير المقفلة للعامل
 * يُستدعى بعد حفظ راتب شهر معين لضمان انعكاس التعديل على الأشهر اللاحقة
 * يدعم كلا نوعي الراتب: ثابت وقطعة
 */
export async function propagateSalaryToFutureMonths(
  branch: BranchType,
  workerId: string,
  workerName: string,
  fromMonthValue: string,
  salaryType: 'fixed' | 'piecework',
  fixedSalaryValue: number,
  pieceRate: number
): Promise<void> {
  if (!isSupabaseConfigured()) return

  try {
    const { year, month } = monthToYearMonth(fromMonthValue)

    const { data, error } = await supabase.rpc('propagate_worker_salary_to_future_months', {
      p_branch: branch,
      p_worker_id: workerId,
      p_worker_name: workerName,
      p_from_year: year,
      p_from_month: month,
      p_salary_type: salaryType,
      p_fixed_salary_value: fixedSalaryValue,
      p_piece_rate: pieceRate
    })

    if (error) {
      console.error('Error propagating salary to future months:', error)
      return
    }

    console.log(`Propagated salary to ${data} future month(s) for worker ${workerId}`)
  } catch (err) {
    console.error('Error propagating salary to future months:', err)
  }
}

/**
 * @deprecated استخدم propagateSalaryToFutureMonths بدلاً منها
 */
export async function propagateFixedSalaryToFutureMonths(
  branch: BranchType,
  workerId: string,
  workerName: string,
  fromMonthValue: string,
  fixedSalaryValue: number
): Promise<void> {
  return propagateSalaryToFutureMonths(branch, workerId, workerName, fromMonthValue, 'fixed', fixedSalaryValue, 0)
}
