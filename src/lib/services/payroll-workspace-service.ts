import { supabase } from '@/lib/supabase'
import type { WorkerWithUser } from './worker-service'
import type {
  WorkerPayrollMonth,
  WorkerPayrollOperation,
  WorkerPayrollBigDebt
} from '@/types/worker-payroll'
import type { WorkerDeductionPayment } from './worker-payroll-service'

const PAGE = 500
type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
export async function payrollPages<T>(
  query: (from: number, to: number) => QueryResult<T>
): Promise<T[]> {
  const result: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    result.push(...(data || []))
    if (!data || data.length < PAGE) return result
  }
}

export interface PayrollWorkspace {
  workers: WorkerWithUser[]
  rows: WorkerPayrollMonth[]
  previous: WorkerPayrollMonth[]
  operations: WorkerPayrollOperation[]
  debts: WorkerPayrollBigDebt[]
  suspended: Set<string>
}

export interface PayrollPricingEvent {
  id: string
  worker_id: string
  payroll_year: number
  payroll_month: number
  before_amount: number
  after_amount: number
  remaining_before: number
  remaining_after: number
  created_at: string
  created_by: string | null
}

export async function getPayrollWorkspace(
  month: string,
  workerId?: string
): Promise<PayrollWorkspace> {
  const [year, part] = month.split('-').map(Number)
  const [workers, rows, previousResult, operations, debts, monthly, persistent] = await Promise.all(
    [
      payrollPages<WorkerWithUser>((a, b) => {
        let query = supabase.from('workers').select('*, user:users(*)').order('id')
        query = workerId
          ? query.eq('id', workerId)
          : query.in('worker_type', ['tailor', 'workshop_manager'])
        return query.range(a, b)
      }),
      payrollPages<WorkerPayrollMonth>((a, b) => {
        let query = supabase
          .from('worker_payroll_months')
          .select('*')
          .eq('branch', 'tailoring')
          .eq('payroll_year', year)
          .eq('payroll_month', part)
          .order('id')
        if (workerId) query = query.eq('worker_id', workerId)
        return query.range(a, b)
      }),
      supabase.rpc('get_worker_payroll_previous_context', {
        p_branch: 'tailoring',
        p_year: year,
        p_month: part
      }),
      payrollPages<WorkerPayrollOperation>((a, b) => {
        let query = supabase
          .from('worker_payroll_operations')
          .select('*')
          .eq('branch', 'tailoring')
          .eq('payroll_year', year)
          .eq('payroll_month', part)
          .order('id')
        if (workerId) query = query.eq('worker_id', workerId)
        return query.range(a, b)
      }),
      payrollPages<WorkerPayrollBigDebt>((a, b) =>
        supabase
          .from('worker_payroll_big_debts')
          .select('*')
          .eq('branch', 'tailoring')
          .order('id')
          .range(a, b)
      ),
      supabase
        .from('worker_payroll_suspensions')
        .select('worker_id')
        .eq('branch', 'tailoring')
        .eq('payroll_year', year)
        .eq('payroll_month', part),
      supabase
        .from('worker_payroll_persistent_suspensions')
        .select('worker_id')
        .eq('branch', 'tailoring')
        .or(`start_year.lt.${year},and(start_year.eq.${year},start_month.lte.${part})`)
    ]
  )
  for (const result of [previousResult, monthly, persistent])
    if (result.error) throw new Error(result.error.message)
  return {
    workers: workers.filter(
      (w) => w.user && (w.user.is_active !== false || rows.some((row) => row.worker_id === w.id))
    ),
    rows,
    previous: (previousResult.data || []) as WorkerPayrollMonth[],
    operations,
    debts,
    suspended: new Set(
      [...(monthly.data || []), ...(persistent.data || [])].map((row) => row.worker_id)
    )
  }
}

export async function getPayrollHistory(workerId: string, month?: string) {
  const [operations, payments, pricing] = await Promise.all([
    payrollPages<WorkerPayrollOperation>((a, b) => {
      let query = supabase
        .from('worker_payroll_operations')
        .select('*')
        .eq('branch', 'tailoring')
        .eq('worker_id', workerId)
      if (month) {
        const [year, part] = month.split('-').map(Number)
        query = query.eq('payroll_year', year).eq('payroll_month', part)
      }
      return query.order('created_at', { ascending: false }).order('id').range(a, b)
    }),
    // All debt payments are needed to join settlement records by id, including backdated entries.
    payrollPages<WorkerDeductionPayment>((a, b) =>
      supabase
        .from('worker_payroll_deduction_payments')
        .select('*')
        .eq('branch', 'tailoring')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b)
    ),
    payrollPages<PayrollPricingEvent>((a, b) => {
      let query = supabase
        .from('worker_payroll_pricing_events')
        .select('*')
        .eq('worker_id', workerId)
      if (month) {
        const [year, part] = month.split('-').map(Number)
        query = query.eq('payroll_year', year).eq('payroll_month', part)
      }
      return query.order('created_at', { ascending: false }).order('id').range(a, b)
    })
  ])
  return { operations, payments, pricing }
}
