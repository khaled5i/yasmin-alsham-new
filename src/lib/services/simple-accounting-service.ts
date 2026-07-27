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

  if (payload.supplier_id === '') payload.supplier_id = undefined

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

  if (payload.supplier_id === '') payload.supplier_id = undefined

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
    if (!type || type === 'fixed' || type === 'salary') {
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

// هل الخطأ ناتج عن عمود fabric_images غير موجود بعد (لم تُطبَّق الهجرة 57)؟
function isMissingFabricImagesColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    (error.message?.includes('fabric_images') ?? false)
  )
}

// هل الخطأ ناتج عن عمودي buyer_name/buyer_phone غير موجودين بعد (لم تُطبَّق الهجرة 61)؟
function isMissingBuyerColumns(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    (error.message?.includes('buyer_name') ?? false) ||
    (error.message?.includes('buyer_phone') ?? false)
  )
}

// هل الخطأ ناتج عن عمود fabric_items غير موجود بعد (لم تُطبَّق الهجرة 69)؟
function isMissingFabricItemsColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    (error.message?.includes('fabric_items') ?? false)
  )
}

function isNetworkFetchError(error: { message?: string } | Error | null | undefined): boolean {
  const message = error?.message || ''
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(message)
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/**
 * عند انقطاع رد POST قد تكون المبيعة حُفظت فعلاً في قاعدة البيانات.
 * نبحث بالمعرّف الثابت بدل إعادة INSERT قد ينشئ فاتورة مكررة.
 */
async function recoverCreatedIncome(id: string): Promise<Income | null> {
  const delays = [200, 500, 1000]

  for (const delay of delays) {
    await wait(delay)

    try {
      const { data, error } = await supabase
        .from('income')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (data) return data
      if (error && !isNetworkFetchError(error)) {
        console.error('Error confirming created income:', error.message || error)
        return null
      }
    } catch (error) {
      if (!isNetworkFetchError(error instanceof Error ? error : null)) {
        console.error('Error confirming created income:', error)
        return null
      }
    }
  }

  return null
}

export async function createIncome(input: CreateIncomeInput): Promise<Income | null> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  const incomeId = input.id || globalThis.crypto.randomUUID()
  let payload: Record<string, unknown> = {
    ...input,
    id: incomeId,
    is_automatic: input.is_automatic ?? false
  }

  try {
    // إعادة الضغط على الحفظ بعد انقطاع الشبكة تستخدم المعرّف نفسه:
    // إن كانت المحاولة السابقة نجحت نعيد سجلها ولا ننشئ فاتورة ثانية.
    if (input.id) {
      const { data: existing, error: lookupError } = await supabase
        .from('income')
        .select('*')
        .eq('id', incomeId)
        .maybeSingle()

      if (existing) return existing
      if (lookupError && !isNetworkFetchError(lookupError)) {
        console.error('Error checking existing income:', lookupError.message || lookupError)
        return null
      }
    }

    let { data, error } = await supabase
      .from('income')
      .insert(payload)
      .select()
      .single()

    // توافق تدريجي: إذا لم يُطبَّق عمودا buyer_name/buyer_phone بعد، أعد المحاولة بدونهما
    if (error && isMissingBuyerColumns(error)) {
      console.warn('⚠️ income.buyer_name/buyer_phone columns missing. Please run migrations/61-income-buyer-info.sql')
      const withoutBuyer = { ...payload }
      delete withoutBuyer.buyer_name
      delete withoutBuyer.buyer_phone
      payload = withoutBuyer
      ;({ data, error } = await supabase
        .from('income')
        .insert(payload)
        .select()
        .single())
    }

    // توافق تدريجي: إذا لم يُطبَّق عمود fabric_images بعد، أعد المحاولة بدونه
    if (error && isMissingFabricImagesColumn(error)) {
      console.warn('⚠️ income.fabric_images column missing. Please run migrations/57-income-fabric-images.sql')
      const withoutImages = { ...payload }
      delete withoutImages.fabric_images
      payload = withoutImages
      ;({ data, error } = await supabase
        .from('income')
        .insert(payload)
        .select()
        .single())
    }

    // توافق تدريجي: إذا لم يُطبَّق عمود fabric_items بعد، أعد المحاولة بدونه
    if (error && isMissingFabricItemsColumn(error)) {
      console.warn('⚠️ income.fabric_items column missing. Please run migrations/69-income-fabric-items.sql')
      const withoutItems = { ...payload }
      delete withoutItems.fabric_items
      ;({ data, error } = await supabase
        .from('income')
        .insert(withoutItems)
        .select()
        .single())
    }

    if (error && isNetworkFetchError(error)) {
      const recovered = await recoverCreatedIncome(incomeId)
      if (recovered) {
        console.warn('⚠️ تم حفظ المبيعة رغم انقطاع رد الشبكة، واستُعيدت بأمان دون تكرار')
        return recovered
      }
    }

    // إذا كانت محاولة سابقة بالمعرّف نفسه قد نجحت، استعد سجلها بدل اعتبارها فشلاً.
    if (error?.code === '23505' && error.message?.includes('income_pkey')) {
      const recovered = await recoverCreatedIncome(incomeId)
      if (recovered) return recovered
    }

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
    if (isNetworkFetchError(err instanceof Error ? err : null)) {
      const recovered = await recoverCreatedIncome(incomeId)
      if (recovered) {
        console.warn('⚠️ تم حفظ المبيعة رغم انقطاع رد الشبكة، واستُعيدت بأمان دون تكرار')
        return recovered
      }
    }
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
    let payload: Record<string, unknown> = { ...input }

    let { data, error } = await supabase
      .from('income')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    // توافق تدريجي: إذا لم يُطبَّق عمودا buyer_name/buyer_phone بعد، أعد المحاولة بدونهما
    if (error && isMissingBuyerColumns(error)) {
      console.warn('⚠️ income.buyer_name/buyer_phone columns missing. Please run migrations/61-income-buyer-info.sql')
      const withoutBuyer = { ...payload }
      delete withoutBuyer.buyer_name
      delete withoutBuyer.buyer_phone
      payload = withoutBuyer
      ;({ data, error } = await supabase
        .from('income')
        .update(payload)
        .eq('id', id)
        .select()
        .single())
    }

    // توافق تدريجي: إذا لم يُطبَّق عمود fabric_images بعد، أعد المحاولة بدونه
    if (error && isMissingFabricImagesColumn(error)) {
      console.warn('⚠️ income.fabric_images column missing. Please run migrations/57-income-fabric-images.sql')
      const withoutImages = { ...payload }
      delete withoutImages.fabric_images
      payload = withoutImages
      ;({ data, error } = await supabase
        .from('income')
        .update(payload)
        .eq('id', id)
        .select()
        .single())
    }

    // توافق تدريجي: إذا لم يُطبَّق عمود fabric_items بعد، أعد المحاولة بدونه
    if (error && isMissingFabricItemsColumn(error)) {
      console.warn('⚠️ income.fabric_items column missing. Please run migrations/69-income-fabric-items.sql')
      const withoutItems = { ...payload }
      delete withoutItems.fabric_items
      ;({ data, error } = await supabase
        .from('income')
        .update(withoutItems)
        .eq('id', id)
        .select()
        .single())
    }

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

// جلب جميع مبيعات القماش التي تحتوي على صور (لعرض معرض صور أقمشة الشك)
export async function getFabricSaleImages(branch: BranchType): Promise<Income[]> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured, returning empty fabric sale images')
    return []
  }

  try {
    const { data, error } = await supabase
      .from('income')
      .select('*')
      .eq('branch', branch)
      .not('fabric_images', 'is', null)
      .order('date', { ascending: false })

    if (error) {
      // الجدول أو العمود غير موجود بعد — تجاهل بهدوء
      if (
        error.code === '42P01' ||
        isMissingFabricImagesColumn(error) ||
        error.message?.includes('does not exist')
      ) {
        return []
      }
      console.error('Error fetching fabric sale images:', error.message || error)
      return []
    }

    // الاحتفاظ فقط بالسجلات التي تحتوي على صور فعلية
    return (data || []).filter(
      (item: Income) => Array.isArray(item.fabric_images) && item.fabric_images.length > 0
    )
  } catch (err) {
    console.error('Error fetching fabric sale images:', err)
    return []
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
    // جلب جميع الطلبات (مسلّمة وغير مسلّمة) التي لها دفعة أولى أو تمّ تسليمها
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, client_name, price, paid_amount, delivery_date, order_received_date, updated_at, created_at, branch, status')
      .eq('branch', branch)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ orders table does not exist')
        return []
      }
      console.error('Error fetching orders income:', error.message || error)
      return []
    }

    const entries: Income[] = []

    for (const order of data || []) {
      const price = order.price || 0
      const paidAmount = order.paid_amount || 0
      const remaining = Math.max(0, price - paidAmount)
      const orderLabel = order.order_number || order.id.substring(0, 8)
      const receivedDate = (order.order_received_date || order.created_at || '').substring(0, 10)
      const deliveryDate = (order.delivery_date || order.updated_at || order.created_at || '').substring(0, 10)

      // سجل الدفعة الأولى عند استلام الطلب (إذا وجدت)
      if (paidAmount > 0) {
        entries.push({
          id: `${order.id}-deposit`,
          branch,
          order_id: order.id,
          customer_name: order.client_name || 'عميل',
          description: `دفعة أولى - طلب ${orderLabel}`,
          amount: paidAmount,
          date: receivedDate,
          is_automatic: true,
          created_at: order.created_at
        })
      }

      // سجل المتبقي عند تسليم الطلب (إذا وجد وتمّ التسليم)
      if (order.status === 'delivered' && remaining > 0) {
        entries.push({
          id: `${order.id}-remaining`,
          branch,
          order_id: order.id,
          customer_name: order.client_name || 'عميل',
          description: `المتبقي عند التسليم - طلب ${orderLabel}`,
          amount: remaining,
          date: deliveryDate,
          is_automatic: true,
          created_at: order.created_at
        })
      }

      // طلب مسلّم بدون دفعة أولى: كامل المبلغ عند التسليم
      if (order.status === 'delivered' && paidAmount === 0 && price > 0) {
        entries.push({
          id: `${order.id}-full`,
          branch,
          order_id: order.id,
          customer_name: order.client_name || 'عميل',
          description: `تسليم كامل - طلب ${orderLabel}`,
          amount: price,
          date: deliveryDate,
          is_automatic: true,
          created_at: order.created_at
        })
      }
    }

    // تطبيق فلتر التاريخ
    return entries.filter(item => {
      if (startDate && item.date < startDate) return false
      if (endDate && item.date > endDate) return false
      return true
    })
  } catch (err) {
    console.error('Error fetching orders income:', err)
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
    // استخراج السنة والشهر مباشرة من النص لتجنب مشاكل المنطقة الزمنية
    const [startYear, startMonth] = startDate.split('-').map(Number)
    const [endYear, endMonth] = endDate.split('-').map(Number)
    const months: { year: number; month: number }[] = []

    let year = startYear
    let month = startMonth
    while (year < endYear || (year === endYear && month <= endMonth)) {
      months.push({ year, month })
      month++
      if (month > 12) { month = 1; year++ }
    }

    if (months.length === 0) return 0

    let total = 0
    for (const { year, month } of months) {
      const { data, error } = await supabase
        .from('worker_payroll_months')
        .select('total_paid')
        .eq('branch', branch)
        .eq('payroll_year', year)
        .eq('payroll_month', month)

      if (!error && data) {
        total += (data as { total_paid: number }[]).reduce(
          (sum, row) => sum + (row.total_paid || 0),
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
// رصيد الصندوق (تراكمي عبر الأشهر)
// ============================================================================

// إجمالي المبيعات الكاش (يرفع رصيد الصندوق) — حتى تاريخ معيّن اختيارياً
async function getAllTimeCashIncome(branch: BranchType, asOfDate?: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0

  try {
    let query = supabase
      .from('income')
      .select('amount')
      .eq('branch', branch)
      .eq('payment_method', 'cash')

    if (asOfDate) query = query.lte('date', asOfDate)

    const { data, error } = await query

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return 0
      console.error('Error fetching all-time cash income:', error.message || error)
      return 0
    }

    return (data as { amount: number }[] | null || []).reduce((sum, row) => sum + (row.amount || 0), 0)
  } catch (err) {
    console.error('Error fetching all-time cash income:', err)
    return 0
  }
}

// إجمالي المشتريات المدفوعة من الصندوق (يخفض رصيد الصندوق) — حتى تاريخ معيّن اختيارياً
async function getAllTimeBoxPurchases(branch: BranchType, asOfDate?: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0

  try {
    let query = supabase
      .from('expenses')
      .select('amount')
      .eq('branch', branch)
      .eq('type', 'material')
      .eq('cash_source', 'box')

    if (asOfDate) query = query.lte('date', asOfDate)

    const { data, error } = await query

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return 0
      console.error('Error fetching all-time box purchases:', error.message || error)
      return 0
    }

    return (data as { amount: number }[] | null || []).reduce((sum, row) => sum + (row.amount || 0), 0)
  } catch (err) {
    console.error('Error fetching all-time box purchases:', err)
    return 0
  }
}

// مجموع التعديلات اليدوية على الصندوق (قد يكون الجدول غير موجود قبل تطبيق الهجرة 56)
// asOfDate يقصر الحساب على التعديلات المسجّلة حتى نهاية ذلك التاريخ
export async function getCashBoxAdjustmentsTotal(branch: BranchType, asOfDate?: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0

  try {
    let query = supabase
      .from('cash_box_adjustments')
      .select('amount')
      .eq('branch', branch)

    if (asOfDate) query = query.lte('created_at', `${asOfDate}T23:59:59.999`)

    const { data, error } = await query

    if (error) {
      // الجدول غير موجود بعد (لم تُطبَّق الهجرة) — تجاهل بهدوء
      if (error.code === '42P01' || error.message?.includes('does not exist')) return 0
      console.error('Error fetching cash box adjustments:', error.message || error)
      return 0
    }

    return (data as { amount: number }[] | null || []).reduce((sum, row) => sum + (row.amount || 0), 0)
  } catch (err) {
    console.error('Error fetching cash box adjustments:', err)
    return 0
  }
}

/**
 * رصيد الصندوق التراكمي (لا يُصفَّر مع بداية الشهر):
 *   المبيعات الكاش - المشتريات من الصندوق + مجموع التعديلات اليدوية
 * عند تمرير asOfDate يُحسب الرصيد كما كان في نهاية ذلك التاريخ (لعرض ملخص شهر سابق).
 * بدون asOfDate يُرجِع الرصيد الحيّ الحالي (كامل التاريخ).
 */
export async function getCashBoxBalance(branch: BranchType, asOfDate?: string): Promise<number> {
  const [cashIncome, boxPurchases, adjustments] = await Promise.all([
    getAllTimeCashIncome(branch, asOfDate),
    getAllTimeBoxPurchases(branch, asOfDate),
    getCashBoxAdjustmentsTotal(branch, asOfDate)
  ])

  return cashIncome - boxPurchases + adjustments
}

/**
 * تعيين رصيد الصندوق إلى قيمة محددة (خاص بمدير النظام).
 * يُحسب الفرق بين الرصيد الحالي والقيمة المطلوبة ويُسجَّل كتعديل، بحيث تبقى
 * حركات المبيعات/المشتريات المستقبلية تُضاف فوق القيمة الجديدة بشكل صحيح.
 */
export async function setCashBoxBalance(
  branch: BranchType,
  targetBalance: number,
  options?: { note?: string; createdByName?: string }
): Promise<{ success: boolean; newBalance: number }> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase not configured')
    return { success: false, newBalance: 0 }
  }

  try {
    // إعادة حساب الرصيد الحالي لحظة التعديل لتقليل أثر البيانات القديمة
    const currentBalance = await getCashBoxBalance(branch)
    const delta = targetBalance - currentBalance

    const { error } = await supabase
      .from('cash_box_adjustments')
      .insert({
        branch,
        amount: delta,
        previous_balance: currentBalance,
        new_balance: targetBalance,
        note: options?.note?.trim() || null,
        created_by_name: options?.createdByName || null
      })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ cash_box_adjustments table does not exist. Please run migrations/56-cash-box-adjustments.sql')
      } else {
        console.error('Error setting cash box balance:', error.message || error)
      }
      return { success: false, newBalance: currentBalance }
    }

    return { success: true, newBalance: targetBalance }
  } catch (err) {
    console.error('Error setting cash box balance:', err)
    return { success: false, newBalance: 0 }
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

  // الرواتب المسجّلة يدوياً في جدول المصروفات (type='salary')
  // تستخدمها أقسام الأقمشة والجاهز التي لا تعتمد على نظام رواتب التفصيل
  const manualSalaryExpenses = allExpenses
    .filter(e => e.type === 'salary')
    .reduce((sum, e) => sum + e.amount, 0)

  // جلب الرواتب من نظام رواتب العمال الجديد (worker_payroll_months) لقسم التفصيل
  const payrollSalaries = await getPayrollSalariesForPeriod(branch, startDate, endDate)

  const totalSalaries = manualSalaryExpenses + payrollSalaries

  const totalExpenses = totalMaterialExpenses + totalFixedExpenses + totalSalaries

  // ─── رصيد الصندوق (تراكمي عبر الأشهر — لا يُصفَّر عند بداية الشهر) ───
  // يُحسب تراكمياً حتى نهاية فترة التقرير (endDate)، بحيث:
  //   - عند عرض الشهر الحالي يظهر الرصيد الحيّ (لأن endDate = نهاية الشهر الحالي)
  //   - عند عرض شهر سابق يظهر الرصيد كما كان في نهاية ذلك الشهر
  const cashBoxBalance = await getCashBoxBalance(branch, endDate)

  return {
    branch,
    period: { startDate, endDate },
    totalIncome,
    totalMaterialExpenses,
    totalFixedExpenses,
    totalSalaries,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
    cashBoxBalance
  }
}

// ============================================================================
// إحصائيات سريعة
// ============================================================================

export async function getQuickStats(branch: BranchType) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return getFinancialSummary(branch, startOfMonth, endOfMonth)
}
