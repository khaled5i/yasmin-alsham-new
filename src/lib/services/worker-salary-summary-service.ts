import { supabase } from '@/lib/supabase'
import { isDebtSettlement, payrollMonth } from '@/lib/payroll-display'
import type { PayrollSalaryType, WorkerPayrollMonth } from '@/types/worker-payroll'

/**
 * ملخص راتب العامل لنفسه (قراءة فقط) في واجهة /dashboard/worker.
 * الأرقام نفسها التي تعرضها صفحة رواتب التفصيل للإدارة:
 * المستحق = net_due، المدفوع = total_paid، المتبقي = remaining_due، الدين = worker_payroll_big_debts.
 */
export interface WorkerSalaryPayment {
  id: string
  date: string
  amount: number
  /** تسوية دين من الراتب: تُحسب من الراتب لكنها ليست نقداً استلمه العامل */
  isDebtSettlement: boolean
}

export interface WorkerSalarySummary {
  month: string
  /** لا يوجد سجل راتب لهذا الشهر ولا إعداد سابق يمكن البناء عليه */
  hasSalary: boolean
  /** سجل الشهر لم يُنشأ بعد؛ الأرقام مبنية على آخر راتب ثابت محفوظ */
  isEstimated: boolean
  salaryType: PayrollSalaryType
  /** الراتب الثابت أو قيمة الأعمال المسعّرة، بدون العمل الإضافي */
  base: number
  overtime: number
  allowances: number
  advances: number
  salaryDeductions: number
  /** الراتب الكلي لهذا الشهر */
  due: number
  paid: number
  remaining: number
  debt: number
  suspended: boolean
  payments: WorkerSalaryPayment[]
}

const BRANCH = 'tailoring'
const num = (value: unknown) => Number(value) || 0

export async function getMyWorkerSalarySummary(
  userId: string,
  month: string = payrollMonth()
): Promise<WorkerSalarySummary> {
  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (workerError) throw new Error(workerError.message)
  if (!worker) throw new Error('لم يتم العثور على ملف العامل')

  const workerId = String(worker.id)
  const [year, part] = month.split('-').map(Number)

  const [monthResult, previousResult, paymentsResult, debtResult, suspensionResult, persistentResult] =
    await Promise.all([
      supabase
        .from('worker_payroll_months')
        .select('*')
        .eq('branch', BRANCH)
        .eq('worker_id', workerId)
        .eq('payroll_year', year)
        .eq('payroll_month', part)
        .limit(1),
      supabase
        .from('worker_payroll_months')
        .select('salary_type, fixed_salary_value')
        .eq('branch', BRANCH)
        .eq('worker_id', workerId)
        .or(`payroll_year.lt.${year},and(payroll_year.eq.${year},payroll_month.lt.${part})`)
        .order('payroll_year', { ascending: false })
        .order('payroll_month', { ascending: false })
        .limit(1),
      supabase
        .from('worker_payroll_operations')
        .select('id, operation_date, amount, metadata, created_at')
        .eq('branch', BRANCH)
        .eq('worker_id', workerId)
        .eq('payroll_year', year)
        .eq('payroll_month', part)
        .eq('operation_type', 'payment')
        .order('operation_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('worker_payroll_big_debts')
        .select('remaining_amount')
        .eq('branch', BRANCH)
        .eq('worker_id', workerId)
        .maybeSingle(),
      supabase
        .from('worker_payroll_suspensions')
        .select('id')
        .eq('branch', BRANCH)
        .eq('worker_id', workerId)
        .eq('payroll_year', year)
        .eq('payroll_month', part)
        .limit(1),
      supabase
        .from('worker_payroll_persistent_suspensions')
        .select('id')
        .eq('branch', BRANCH)
        .eq('worker_id', workerId)
        .or(`start_year.lt.${year},and(start_year.eq.${year},start_month.lte.${part})`)
        .limit(1)
    ])

  const firstError =
    monthResult.error ||
    previousResult.error ||
    paymentsResult.error ||
    debtResult.error ||
    suspensionResult.error ||
    persistentResult.error
  if (firstError) throw new Error(firstError.message)

  const row = (monthResult.data?.[0] || null) as WorkerPayrollMonth | null
  const previous = (previousResult.data?.[0] || null) as Pick<
    WorkerPayrollMonth,
    'salary_type' | 'fixed_salary_value'
  > | null
  const suspended = (suspensionResult.data?.length || 0) > 0 || (persistentResult.data?.length || 0) > 0
  const debt = Math.max(0, num(debtResult.data?.remaining_amount))
  const payments: WorkerSalaryPayment[] = (paymentsResult.data || []).map((op) => ({
    id: String(op.id),
    date: String(op.operation_date),
    amount: num(op.amount),
    isDebtSettlement: isDebtSettlement(op as { metadata: Record<string, unknown> })
  }))

  if (row) {
    // net_due = basic_salary + works_total + allowances − advances − salary_deductions (trigger sync_worker_payroll_month_totals)
    // والعمل الإضافي محفوظ داخل works_total، لذلك نفصله ليظهر سطراً مستقلاً دون أن يتغيّر المجموع.
    const overtime = num(row.overtime_total)
    return {
      month,
      hasSalary: true,
      isEstimated: false,
      salaryType: row.salary_type || previous?.salary_type || 'fixed',
      base: num(row.basic_salary) + num(row.works_total) - overtime,
      overtime,
      allowances: num(row.allowances_total),
      advances: num(row.advances_total),
      salaryDeductions: num(row.salary_deductions_total),
      due: num(row.net_due),
      paid: num(row.total_paid),
      remaining: num(row.remaining_due),
      debt,
      suspended,
      payments
    }
  }

  // صفحة الرواتب تجهّز الراتب الثابت للشهر الحالي تلقائياً عند فتحها؛ إلى أن يحدث ذلك نعرض الرقم نفسه.
  const fixedValue = num(previous?.fixed_salary_value)
  const canEstimate =
    month === payrollMonth() && !suspended && previous?.salary_type === 'fixed' && fixedValue > 0
  return {
    month,
    hasSalary: canEstimate || !!previous,
    isEstimated: canEstimate,
    salaryType: previous?.salary_type || 'fixed',
    base: canEstimate ? fixedValue : 0,
    overtime: 0,
    allowances: 0,
    advances: 0,
    salaryDeductions: 0,
    due: canEstimate ? fixedValue : 0,
    paid: 0,
    remaining: canEstimate ? fixedValue : 0,
    debt,
    suspended,
    payments
  }
}
