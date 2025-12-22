// ============================================================================
// خدمة المحاسبة البسيطة
// ============================================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type {
  BranchType,
  ExpenseType,
  Expense,
  CreateExpenseInput,
  Income,
  CreateIncomeInput,
  FinancialSummary
} from '@/types/simple-accounting'

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
    const { data, error } = await supabase
      .from('expenses')
      .insert(input)
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
      .select('id, order_number, client_name, price, paid_amount, delivery_date, created_at')
      .eq('status', 'delivered')

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
// الملخص المالي
// ============================================================================

export async function getFinancialSummary(
  branch: BranchType,
  startDate: string,
  endDate: string
): Promise<FinancialSummary> {
  // جلب الواردات
  const income = await getDeliveredOrdersIncome(branch, startDate, endDate)
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0)

  // جلب المصروفات حسب النوع
  const allExpenses = await getExpenses(branch, undefined, startDate, endDate)

  const totalMaterialExpenses = allExpenses
    .filter(e => e.type === 'material')
    .reduce((sum, e) => sum + e.amount, 0)

  const totalFixedExpenses = allExpenses
    .filter(e => e.type === 'fixed')
    .reduce((sum, e) => sum + e.amount, 0)

  const totalSalaries = allExpenses
    .filter(e => e.type === 'salary')
    .reduce((sum, e) => sum + e.amount, 0)

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

