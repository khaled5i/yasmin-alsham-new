// ============================================================================
// خدمة المحاسبة البسيطة
// ============================================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { computePaymentBreakdown, type OrderPaymentInput } from '@/lib/payment-breakdown'
import type {
  BranchType,
  ExpenseType,
  ExpenseRecurrenceType,
  Expense,
  CreateExpenseInput,
  Income,
  IncomeEntryKind,
  PaymentMethod,
  AlostazSyncStatus,
  CreateIncomeInput,
  FinancialSummary,
  CashBoxTransaction,
  CreateCashBoxWithdrawalInput,
  CreateCashBoxWithdrawalResult
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

// هل الخطأ ناتج عن عمودي cash_amount/network_amount غير موجودين بعد (لم تُطبَّق الهجرة 86)؟
// الفحص بالرسالة وحدها لأن رمز الخطأ نفسه (PGRST204/42703) يشترك مع أعمدة أخرى.
function isMissingSplitAmountColumns(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    (error.message?.includes('cash_amount') ?? false) ||
    (error.message?.includes('network_amount') ?? false)
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

function isFabricInventorySaleError(
  error: { message?: string } | Error | null | undefined
): boolean {
  return (error?.message || '').includes('FABRIC_STOCK_')
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

    // توافق تدريجي: إذا لم يُطبَّق عمودا cash_amount/network_amount بعد، أعد المحاولة بدونهما
    if (error && isMissingSplitAmountColumns(error)) {
      console.warn('⚠️ income.cash_amount/network_amount columns missing. Please run migrations/86-fabric-sale-mixed-payment.sql')
      const withoutSplit = { ...payload }
      delete withoutSplit.cash_amount
      delete withoutSplit.network_amount
      payload = withoutSplit
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
      if (isFabricInventorySaleError(error)) {
        throw new Error(error.message)
      }
      if (error.code === '42P01') {
        console.warn('⚠️ income table does not exist. Please run migrations/06-simple-accounting.sql')
        return null
      }
      console.error('Error creating income:', error.message || error)
      return null
    }

    return data
  } catch (err) {
    if (isFabricInventorySaleError(err instanceof Error ? err : null)) {
      throw err
    }
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

    // توافق تدريجي: إذا لم يُطبَّق عمودا cash_amount/network_amount بعد، أعد المحاولة بدونهما
    if (error && isMissingSplitAmountColumns(error)) {
      console.warn('⚠️ income.cash_amount/network_amount columns missing. Please run migrations/86-fabric-sale-mixed-payment.sql')
      const withoutSplit = { ...payload }
      delete withoutSplit.cash_amount
      delete withoutSplit.network_amount
      payload = withoutSplit
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
      if (isFabricInventorySaleError(error)) {
        throw new Error(error.message)
      }
      console.error('Error updating income:', error.message || error)
      return null
    }

    return data
  } catch (err) {
    if (isFabricInventorySaleError(err instanceof Error ? err : null)) {
      throw err
    }
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

// ============================================================================
// الواردات المشتقّة من الطلبات
// ============================================================================
// كل طلب يُنتج حركة واردة منفصلة لكل دفعة فعلية حُصِّلت، مفصولة حسب:
//   • اللحظة  : عربون عند استلام الطلب / دفعة عند التسليم
//   • الطريقة : كاش أو شبكة
// أي أربع حركات كحد أقصى للطلب الواحد. لا تُسجَّل إلا المبالغ المحصّلة فعلياً،
// فالطلب المسلَّم برصيد متبقٍّ لا يُحتسب منه إلا ما قُبض.

const ORDER_INCOME_BASE_COLUMNS =
  'id, order_number, client_name, price, paid_amount, delivery_date, order_received_date, ' +
  'updated_at, created_at, branch, status'

// أعمدة تفصيل طرق الدفع (هجرة 67)
const ORDER_INCOME_PAYMENT_COLUMNS =
  ', deposit_amount, payment_method, pre_delivery_cash_amount, pre_delivery_network_amount' +
  ', remaining_payment_method, remaining_cash_amount, remaining_network_amount'

// أعمدة ربط فواتير الأستاذ المرحلية (هجرتا 64 و82)
const ORDER_INCOME_ALOSTAZ_COLUMNS =
  ', alostaz_billing_version, alostaz_invoice_id, alostaz_invoice_code, alostaz_sync_status' +
  ', alostaz_synced_at, alostaz_deposit_invoice_id, alostaz_deposit_invoice_code' +
  ', alostaz_deposit_sync_status, alostaz_deposit_synced_at'

// نتدرّج من المجموعة الكاملة نزولاً حتى تنجح البيئة مهما كانت الهجرات المطبّقة،
// حتى لا يُفقد تفصيل الكاش/الشبكة لمجرّد غياب أعمدة الأستاذ.
const ORDER_INCOME_COLUMN_TIERS = [
  ORDER_INCOME_BASE_COLUMNS + ORDER_INCOME_PAYMENT_COLUMNS + ORDER_INCOME_ALOSTAZ_COLUMNS,
  ORDER_INCOME_BASE_COLUMNS + ORDER_INCOME_PAYMENT_COLUMNS,
  ORDER_INCOME_BASE_COLUMNS,
]

interface OrderIncomeRow extends OrderPaymentInput {
  id: string
  order_number?: string | null
  client_name?: string | null
  status?: string | null
  delivery_date?: string | null
  order_received_date?: string | null
  updated_at?: string | null
  created_at?: string | null
  // ربط فواتير الأستاذ — مرحلة العربون ومرحلة التسليم منفصلتان
  alostaz_billing_version?: number | null
  alostaz_invoice_id?: number | null
  alostaz_invoice_code?: string | null
  alostaz_sync_status?: AlostazSyncStatus | null
  alostaz_synced_at?: string | null
  alostaz_deposit_invoice_id?: number | null
  alostaz_deposit_invoice_code?: string | null
  alostaz_deposit_sync_status?: AlostazSyncStatus | null
  alostaz_deposit_synced_at?: string | null
}

/** ربط حركة شبكة واحدة بفاتورتها في تطبيق المحاسبة */
interface AlostazEntryLink {
  alostaz_invoice_id: number | null
  alostaz_invoice_code: string | null
  alostaz_sync_status: AlostazSyncStatus | null
  alostaz_synced_at: string | null
  alostaz_invoice_scope: 'phase' | 'full'
}

/**
 * فاتورة الأستاذ المقابلة لحركة شبكة:
 *   • عربون الشبكة  → أعمدة alostaz_deposit_*
 *   • شبكة التسليم → الأعمدة الرئيسية alostaz_*
 * طلبات الإصدار 1 لها فاتورة واحدة تغطي الطلب كاملاً، لذلك تُوسم بـ 'full'
 * حتى لا يُفهم رقمها على أنه فاتورة هذه الدفعة وحدها.
 */
function buildAlostazLink(
  order: OrderIncomeRow,
  phase: 'deposit' | 'delivery'
): AlostazEntryLink {
  const isStaged = Number(order.alostaz_billing_version) >= 2
  const useDepositColumns = phase === 'deposit' && isStaged

  const invoiceId = useDepositColumns ? order.alostaz_deposit_invoice_id : order.alostaz_invoice_id
  const invoiceCode = useDepositColumns
    ? order.alostaz_deposit_invoice_code
    : order.alostaz_invoice_code
  const syncStatus = useDepositColumns
    ? order.alostaz_deposit_sync_status
    : order.alostaz_sync_status
  const syncedAt = useDepositColumns ? order.alostaz_deposit_synced_at : order.alostaz_synced_at

  // الطلبات القديمة قد تحمل رقم فاتورة عربون أُرسلت يدوياً قبل تفعيل الفوترة المرحلية
  if (!isStaged && phase === 'deposit') {
    return {
      alostaz_invoice_id: order.alostaz_deposit_invoice_id ?? null,
      alostaz_invoice_code: order.alostaz_deposit_invoice_code || null,
      alostaz_sync_status: order.alostaz_deposit_sync_status ?? null,
      alostaz_synced_at: order.alostaz_deposit_synced_at || null,
      alostaz_invoice_scope: 'phase',
    }
  }

  return {
    alostaz_invoice_id: invoiceId ?? null,
    alostaz_invoice_code: invoiceCode || null,
    alostaz_sync_status: syncStatus ?? null,
    alostaz_synced_at: syncedAt || null,
    alostaz_invoice_scope: isStaged ? 'phase' : 'full',
  }
}

// هل الخطأ ناتج عن عمود غير موجود (لم تُطبَّق هجرة تفصيل طرق الدفع بعد)؟
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message || '')
}

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
    const fetchOrders = (columns: string) =>
      supabase
        .from('orders')
        .select(columns)
        .eq('branch', branch)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })

    let data: unknown = null
    let error: { code?: string; message?: string } | null = null

    // ننزل تدريجياً عبر مجموعات الأعمدة حتى تنجح واحدة مع الهجرات المطبّقة فعلياً
    for (const columns of ORDER_INCOME_COLUMN_TIERS) {
      const result = await fetchOrders(columns)
      data = result.data
      error = result.error
      if (!error || !isMissingColumnError(error)) break
      console.warn('⚠️ أعمدة غير موجودة في جدول الطلبات — يُرجى تطبيق الهجرات 67 و82')
    }

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('⚠️ orders table does not exist')
        return []
      }
      console.error('Error fetching orders income:', error.message || error)
      return []
    }

    const entries: Income[] = []

    for (const order of (data || []) as unknown as OrderIncomeRow[]) {
      const orderLabel = order.order_number || order.id.substring(0, 8)
      const customerName = order.client_name || 'عميل'
      const receivedAt = order.order_received_date || order.created_at || ''
      const deliveredAt = order.delivery_date || order.updated_at || order.created_at || ''
      const breakdown = computePaymentBreakdown(order)

      const push = (
        suffix: string,
        kind: IncomeEntryKind,
        method: PaymentMethod,
        amount: number,
        title: string,
        occurredAt: string,
        phase?: 'deposit' | 'delivery'
      ) => {
        if (amount < 0.005) return
        // فواتير الأستاذ تخص الشبكة فقط؛ الكاش يبقى إيصالاً محلياً
        const alostaz = method === 'network' && phase ? buildAlostazLink(order, phase) : null
        entries.push({
          id: `${order.id}-${suffix}`,
          branch,
          order_id: order.id,
          order_number: orderLabel,
          customer_name: customerName,
          description: `${title} — طلب ${orderLabel}`,
          amount: Number(amount.toFixed(2)),
          payment_method: method,
          entry_kind: kind,
          date: occurredAt.substring(0, 10),
          occurred_at: occurredAt || null,
          is_automatic: true,
          created_at: order.created_at || occurredAt,
          ...(alostaz ?? {}),
          alostaz_billing_version: Number(order.alostaz_billing_version) || 1
        })
      }

      // ما قُبض قبل التسليم (عربون الطلب ودفعاته الإضافية)
      push('deposit-cash', 'order_deposit', 'cash', breakdown.preDeliveryCash, 'عربون كاش', receivedAt)
      push('deposit-network', 'order_deposit', 'network', breakdown.preDeliveryNetwork, 'عربون شبكة', receivedAt, 'deposit')

      // ما قُبض لحظة التسليم (الدفعة المتبقية بطريقتيها)
      push('delivery-cash', 'order_delivery', 'cash', breakdown.remainingCash, 'كاش عند التسليم', deliveredAt)
      push('delivery-network', 'order_delivery', 'network', breakdown.remainingNetwork, 'شبكة عند التسليم', deliveredAt, 'delivery')
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

/**
 * طلبات سُلِّمت وما زال عليها رصيد لم يُسجَّل تحصيله في النظام.
 * ─────────────────────────────────────────────────────────────
 * الواردات لا تحتسب هذه المبالغ لأنها غير مُثبتة كدفعات، لكنها تُعرض كتنبيه
 * حتى لا تختفي بصمت: إمّا أن العميلة لم تدفع فعلاً، أو أن الدفعة قُبضت
 * ولم تُسجَّل (طلبات ما قبل تفعيل تفصيل طرق الدفع).
 */
export interface UnrecordedDeliveredOrder {
  id: string
  order_number: string
  customer_name: string
  price: number
  paid_amount: number
  outstanding: number
  date: string
}

export async function getUnrecordedDeliveredOrders(
  branch: BranchType
): Promise<UnrecordedDeliveredOrder[]> {
  if (!isSupabaseConfigured()) return []

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, client_name, price, paid_amount, delivery_date, order_received_date, updated_at, created_at')
      .eq('branch', branch)
      .eq('status', 'delivered')
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return []
      console.error('Error fetching unrecorded delivered orders:', error.message || error)
      return []
    }

    return ((data || []) as OrderIncomeRow[])
      .map(order => {
        const price = Number(order.price) || 0
        const paid = Number(order.paid_amount) || 0
        return {
          id: order.id,
          order_number: order.order_number || order.id.substring(0, 8),
          customer_name: order.client_name || 'عميل',
          price,
          paid_amount: paid,
          outstanding: Number(Math.max(0, price - paid).toFixed(2)),
          date: (order.delivery_date || order.updated_at || order.created_at || '').substring(0, 10)
        }
      })
      .filter(order => order.outstanding >= 0.005)
  } catch (err) {
    console.error('Error fetching unrecorded delivered orders:', err)
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

type CashPortionRow = {
  amount: number
  payment_method?: string | null
  cash_amount?: number | null
}

// إجمالي المبيعات الكاش (يرفع رصيد الصندوق) — حتى تاريخ معيّن اختيارياً
// المبيعة المختلطة (mixed) تدخل بجزء الكاش وحده؛ جزء الشبكة لا يمسّ الصندوق.
async function getAllTimeCashIncome(branch: BranchType, asOfDate?: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0

  const sumCashPortion = (rows: CashPortionRow[] | null) =>
    (rows || []).reduce(
      (sum, row) =>
        sum +
        (row.payment_method === 'mixed'
          ? Math.max(Number(row.cash_amount) || 0, 0)
          : row.amount || 0),
      0
    )

  const runQuery = (columns: string) => {
    let query = supabase
      .from('income')
      .select(columns)
      .eq('branch', branch)
      .in('payment_method', ['cash', 'mixed'])

    if (asOfDate) query = query.lte('date', asOfDate)
    return query
  }

  try {
    const { data, error } = await runQuery('amount, payment_method, cash_amount')

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) return 0

      // لم تُطبَّق الهجرة 86 بعد: لا توجد مبيعات مختلطة أصلاً، فالكاش وحده يكفي
      if (isMissingSplitAmountColumns(error)) {
        const { data: legacyData, error: legacyError } = await runQuery('amount, payment_method')
        if (legacyError) {
          console.error('Error fetching all-time cash income:', legacyError.message || legacyError)
          return 0
        }
        return sumCashPortion(legacyData as unknown as CashPortionRow[] | null)
      }

      console.error('Error fetching all-time cash income:', error.message || error)
      return 0
    }

    return sumCashPortion(data as unknown as CashPortionRow[] | null)
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
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('get_cash_box_balance', {
        p_branch: branch,
        p_as_of: asOfDate || null
      })

      if (!error) {
        return Number(data) || 0
      }

      // التوافق مع البيئات التي لم تُطبّق فيها هجرة صندوق التفصيل بعد.
      if (error.code !== '42883' && error.code !== 'PGRST202') {
        console.error('Error fetching cash box balance RPC:', error.message || error)
      }
    } catch (err) {
      console.error('Error fetching cash box balance RPC:', err)
    }
  }

  const [cashIncome, boxPurchases, adjustments] = await Promise.all([
    getAllTimeCashIncome(branch, asOfDate),
    getAllTimeBoxPurchases(branch, asOfDate),
    getCashBoxAdjustmentsTotal(branch, asOfDate)
  ])

  return cashIncome - boxPurchases + adjustments
}

/**
 * سجل حركات الصندوق الموحد: كاش الطلبات عند الإنشاء والتسليم، الواردات،
 * المصروفات من الصندوق، التعديلات، وعمليات السحب.
 */
export async function getCashBoxTransactions(
  branch: BranchType,
  limit = 100
): Promise<CashBoxTransaction[]> {
  if (!isSupabaseConfigured()) return []

  try {
    const { data, error } = await supabase.rpc('get_cash_box_transactions', {
      p_branch: branch,
      p_limit: Math.max(1, Math.min(limit, 200))
    })

    if (error) {
      if (error.code === '42883' || error.code === 'PGRST202') {
        throw new Error('سجل الصندوق غير مفعّل في قاعدة البيانات بعد.')
      }
      throw new Error(error.message || 'تعذّر تحميل سجل الصندوق.')
    }

    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      transaction_id: String(row.transaction_id || ''),
      transaction_type: row.transaction_type as CashBoxTransaction['transaction_type'],
      amount: Number(row.amount) || 0,
      occurred_at: String(row.occurred_at || ''),
      title: String(row.title || ''),
      description: String(row.description || ''),
      actor_name: row.actor_name ? String(row.actor_name) : null,
      reference_id: row.reference_id ? String(row.reference_id) : null
    }))
  } catch (err) {
    console.error('Error fetching cash box transactions:', err)
    throw err instanceof Error ? err : new Error('تعذّر تحميل سجل الصندوق.')
  }
}

/**
 * ينفذ السحب داخل قاعدة البيانات كعملية ذرية؛ لا يمكن أن يصبح الرصيد سالباً
 * حتى عند ضغط الزر من جهازين في الوقت نفسه.
 */
export async function withdrawFromCashBox(
  input: CreateCashBoxWithdrawalInput
): Promise<CreateCashBoxWithdrawalResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('قاعدة البيانات غير متصلة. تعذّر حفظ عملية السحب.')
  }

  const amount = Math.round((Number(input.amount) + Number.EPSILON) * 100) / 100
  const reason = input.reason.trim()

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('أدخل قيمة سحب صحيحة أكبر من صفر.')
  }
  if (reason.length < 3 || reason.length > 500) {
    throw new Error('سبب السحب يجب أن يكون بين 3 و500 حرف.')
  }

  const { data, error } = await supabase.rpc('withdraw_from_cash_box', {
    p_branch: input.branch,
    p_amount: amount,
    p_reason: reason
  })

  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') {
      throw new Error('ميزة السحب غير مفعّلة في قاعدة البيانات بعد.')
    }
    throw new Error(error.message || 'تعذّر حفظ عملية السحب.')
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  if (!row?.withdrawal_id) {
    throw new Error('لم تُرجع قاعدة البيانات تأكيد عملية السحب.')
  }

  const balanceBefore = Number(row.balance_before) || 0
  const balanceAfter = Number(row.balance_after) || 0
  const createdAt = String(row.created_at || new Date().toISOString())

  return {
    withdrawal: {
      id: String(row.withdrawal_id),
      branch: input.branch,
      amount,
      reason,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      created_by_name: String(row.created_by_name || 'مستخدم النظام'),
      created_at: createdAt
    },
    newBalance: balanceAfter
  }
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
