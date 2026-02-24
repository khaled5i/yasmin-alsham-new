// ============================================================================
// خدمة المحاسبة البسيطة
// ============================================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type {
  BranchType,
  ExpenseType,
  ExpenseRecurrenceType,
  Expense,
  CreateExpenseInput,
  Income,
  CreateIncomeInput,
  FinancialSummary
} from '@/types/simple-accounting'

const ONE_TIME_RECURRENCE: ExpenseRecurrenceType = 'one_time'
const MONTHLY_RECURRENCE: ExpenseRecurrenceType = 'monthly'

function getTodayISODate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayFromISODate(dateValue: string): number {
  const parsedDay = Number(dateValue.split('-')[2])
  if (Number.isNaN(parsedDay) || parsedDay < 1) {
    return 1
  }
  if (parsedDay > 31) {
    return 31
  }
  return parsedDay
}

function getMonthStartFromISODate(dateValue: string): string {
  const [year, month] = dateValue.split('-')
  if (!year || !month) {
    const today = getTodayISODate()
    return `${today.split('-')[0]}-${today.split('-')[1]}-01`
  }
  return `${year}-${month}-01`
}

function normalizeRecurringDay(day: number | null | undefined, fallback: number): number {
  const candidate = day ?? fallback
  if (candidate < 1) return 1
  if (candidate > 31) return 31
  return candidate
}

function normalizeCreateExpensePayload(input: CreateExpenseInput): CreateExpenseInput {
  const payload: CreateExpenseInput = {
    ...input,
    recurrence_type: input.recurrence_type ?? ONE_TIME_RECURRENCE
  }

  if (payload.recurrence_type === MONTHLY_RECURRENCE) {
    const baseDate = payload.date || getTodayISODate()
    const fallbackDay = getDayFromISODate(baseDate)
    payload.recurring_day_of_month = normalizeRecurringDay(payload.recurring_day_of_month, fallbackDay)
    payload.recurring_month = getMonthStartFromISODate(baseDate)
    payload.is_auto_generated = payload.is_auto_generated ?? false
  } else {
    payload.recurring_day_of_month = null
    payload.recurring_source_id = null
    payload.recurring_month = null
    payload.is_auto_generated = false
  }

  return payload
}

function normalizeUpdateExpensePayload(input: Partial<CreateExpenseInput>): Partial<CreateExpenseInput> {
  const payload: Partial<CreateExpenseInput> = { ...input }

  if (payload.recurrence_type === MONTHLY_RECURRENCE) {
    const baseDate = payload.date || getTodayISODate()
    const fallbackDay = getDayFromISODate(baseDate)
    payload.recurring_day_of_month = normalizeRecurringDay(payload.recurring_day_of_month, fallbackDay)
    payload.recurring_month = getMonthStartFromISODate(baseDate)
    if (payload.is_auto_generated === undefined) {
      payload.is_auto_generated = false
    }
  }

  if (payload.recurrence_type === ONE_TIME_RECURRENCE) {
    payload.recurring_day_of_month = null
    payload.recurring_source_id = null
    payload.recurring_month = null
    payload.is_auto_generated = false
  }

  return payload
}

async function ensureRecurringExpensesGenerated(branch: BranchType): Promise<void> {
  try {
    const { error } = await supabase.rpc('generate_recurring_expenses', {
      p_branch: branch
    })

    if (!error) {
      return
    }

    // Function not found: skip silently for environments where migration wasn't applied yet.
    if (error.code === '42883') {
      return
    }

    console.error('Error generating recurring expenses:', error.message || error)
  } catch (err) {
    console.error('Error generating recurring expenses:', err)
  }
}

// ============================================================================
// المصروفات
// ============================================================================

export async function getExpenses(
  branch: BranchType,
  type?: ExpenseType,
  startDate?: string,
  endDate?: string
): Promise<Expense[]> {
  // التحقق من تهيئة Supabase
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured, returning empty expenses')
    return []
  }

  try {
    if (!type || type === 'fixed') {
      await ensureRecurringExpensesGenerated(branch)
    }

    let query = supabase
      .from('expenses')
      .select('*')
      .eq('branch', branch)
      .order('date', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    if (startDate) {
      query = query.gte('date', startDate)
    }

    if (endDate) {
      query = query.lte('date', endDate)
    }

    const { data, error } = await query

    if (error) {
      // التحقق من أن الجدول غير موجود
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ expenses table does not exist. Please run migrations/06-simple-accounting.sql')
        return []
      }
      console.error('Error fetching expenses:', error.message || error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Error fetching expenses:', err)
    return []
  }
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense | null> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  try {
    const payload = normalizeCreateExpensePayload(input)

    const { data, error } = await supabase
      .from('expenses')
      .insert(payload)
      .select()
      .single()

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ expenses table does not exist. Please run migrations/06-simple-accounting.sql')
        return null
      }
      console.error('Error creating expense:', error.message || error)
      return null
    }

    return data
  } catch (err) {
    console.error('Error creating expense:', err)
    return null
  }
}

export async function updateExpense(id: string, input: Partial<CreateExpenseInput>): Promise<Expense | null> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  try {
    const payload = normalizeUpdateExpensePayload(input)

    const { data, error } = await supabase
      .from('expenses')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating expense:', error.message || error)
      return null
    }

    return data
  } catch (err) {
    console.error('Error updating expense:', err)
    return null
  }
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return false
  }

  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting expense:', error.message || error)
      return false
    }

    return true
  } catch (err) {
    console.error('Error deleting expense:', err)
    return false
  }
}

// ============================================================================
// الواردات (من الطلبات المسلمة)
// ============================================================================

export async function getIncome(
  branch: BranchType,
  startDate?: string,
  endDate?: string
): Promise<Income[]> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured, returning empty income')
    return []
  }

  try {
    let query = supabase
      .from('income')
      .select('*')
      .eq('branch', branch)
      .order('date', { ascending: false })

    if (startDate) {
      query = query.gte('date', startDate)
    }

    if (endDate) {
      query = query.lte('date', endDate)
    }

    const { data, error } = await query

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ income table does not exist. Please run migrations/06-simple-accounting.sql')
        return []
      }
      console.error('Error fetching income:', error.message || error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Error fetching income:', err)
    return []
  }
}

export async function createIncome(input: CreateIncomeInput): Promise<Income | null> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('income')
      .insert({
        ...input,
        is_automatic: input.is_automatic ?? false
      })
      .select()
      .single()

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ income table does not exist. Please run migrations/06-simple-accounting.sql')
        return null
      }
      console.error('Error creating income:', error.message || error)
      return null
    }

    return data
  } catch (err) {
    console.error('Error creating income:', err)
    return null
  }
}

export async function updateIncome(id: string, input: Partial<CreateIncomeInput>): Promise<Income | null> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('income')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating income:', error.message || error)
      return null
    }

    return data
  } catch (err) {
    console.error('Error updating income:', err)
    return null
  }
}

export async function deleteIncome(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return false
  }

  try {
    const { error } = await supabase
      .from('income')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting income:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('Error deleting income:', err)
    return false
  }
}

// جلب الواردات من الطلبات المسلمة تلقائياً
export async function getDeliveredOrdersIncome(
  branch: BranchType,
  startDate?: string,
  endDate?: string
): Promise<Income[]> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured, returning empty delivered orders')
    return []
  }

  try {
    // جلب الطلبات المسلمة من جدول الطلبات
    // استخدام الأعمدة الصحيحة: client_name بدلاً من customer_name، price بدلاً من total_price
    let query = supabase
      .from('orders')
      .select('id, order_number, client_name, price, paid_amount, delivery_date, created_at, branch')
      .eq('status', 'delivered')
      .eq('branch', branch)  // فلترة حسب الفرع

    if (startDate) {
      query = query.gte('delivery_date', startDate)
    }

    if (endDate) {
      query = query.lte('delivery_date', endDate)
    }

    const { data, error } = await query.order('delivery_date', { ascending: false })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ orders table does not exist')
        return []
      }
      console.error('Error fetching delivered orders:', error.message || error)
      return []
    }

    // تحويل الطلبات إلى واردات
    return (data || []).map(order => ({
      id: order.id,
      branch: branch,
      order_id: order.id,
      customer_name: order.client_name || 'عميل',
      description: `طلب ${order.order_number || order.id.substring(0, 8)}`,
      amount: order.paid_amount || order.price || 0,
      date: order.delivery_date || order.created_at,
      is_automatic: true,
      created_at: order.created_at
    }))
  } catch (err) {
    console.error('Error fetching delivered orders:', err)
    return []
  }
}

// ============================================================================
// رواتب العمال من نظام الرواتب الجديد
// ============================================================================

/**
 * جلب إجمالي رواتب العمال من جدول worker_payroll_months لفترة زمنية محددة
 * بدلاً من جدول expenses القديم
 */
async function getPayrollSalariesForPeriod(
  branch: BranchType,
  startDate: string,
  endDate: string
): Promise<number> {
  if (!isSupabaseConfigured()) return 0

  try {
    // تحديد الأشهر ضمن النطاق الزمني
    const start = new Date(startDate)
    const end = new Date(endDate)
    const months: { year: number; month: number }[] = []
    const current = new Date(start.getFullYear(), start.getMonth(), 1)

    while (current <= end) {
      months.push({ year: current.getFullYear(), month: current.getMonth() + 1 })
      current.setMonth(current.getMonth() + 1)
    }

    if (months.length === 0) return 0

    let total = 0
    for (const { year, month } of months) {
      const { data, error } = await supabase
        .from('worker_payroll_months')
        .select('net_due')
        .eq('branch', branch)
        .eq('payroll_year', year)
        .eq('payroll_month', month)

      if (!error && data) {
        total += (data as { net_due: number }[]).reduce(
          (sum, row) => sum + (row.net_due || 0),
          0
        )
      }
    }

    return total
  } catch (err) {
    console.error('Error fetching payroll salaries for period:', err)
    return 0
  }
}

// ============================================================================
// الملخص المالي
// ============================================================================

export async function getFinancialSummary(
  branch: BranchType,
  startDate: string,
  endDate: string
): Promise<FinancialSummary> {
  // جلب الواردات من الطلبات المسلمة
  const ordersIncome = await getDeliveredOrdersIncome(branch, startDate, endDate)

  // جلب الواردات اليدوية من جدول income
  const manualIncome = await getIncome(branch, startDate, endDate)

  // دمج الواردات من المصدرين
  const allIncome = [...ordersIncome, ...manualIncome]
  const totalIncome = allIncome.reduce((sum, i) => sum + i.amount, 0)

  // جلب المصروفات حسب النوع (مواد وثابتة فقط - بدون رواتب)
  const allExpenses = await getExpenses(branch, undefined, startDate, endDate)

  const totalMaterialExpenses = allExpenses
    .filter(e => e.type === 'material')
    .reduce((sum, e) => sum + e.amount, 0)

  const totalFixedExpenses = allExpenses
    .filter(e => e.type === 'fixed')
    .reduce((sum, e) => sum + e.amount, 0)

  // جلب الرواتب من نظام رواتب العمال الجديد (worker_payroll_months)
  const totalSalaries = await getPayrollSalariesForPeriod(branch, startDate, endDate)

  const totalExpenses = totalMaterialExpenses + totalFixedExpenses + totalSalaries

  return {
    branch,
    period: { startDate, endDate },
    totalIncome,
    totalMaterialExpenses,
    totalFixedExpenses,
    totalSalaries,
    totalExpenses,
    netProfit: totalIncome - totalExpenses
  }
}

// ============================================================================
// إحصائيات سريعة
// ============================================================================

export async function getQuickStats(branch: BranchType) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  return getFinancialSummary(branch, startOfMonth, endOfMonth)
}
