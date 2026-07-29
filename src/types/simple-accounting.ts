// ============================================================================
// أنواع النظام المحاسبي البسيط
// ============================================================================

// نوع الفرع
export type BranchType = 'tailoring' | 'fabrics' | 'ready_designs'

// نوع المصروف
export type ExpenseType = 'material' | 'fixed' | 'salary' | 'other'
export type ExpenseRecurrenceType = 'one_time' | 'monthly'

// مصدر تمويل المصروف: من الصندوق أو من خارج الصندوق
export type ExpenseCashSource = 'box' | 'external'

// ============================================================================
// المصروفات
// ============================================================================

export interface Expense {
  id: string
  branch: BranchType
  type: ExpenseType
  category: string        // تصنيف المصروف (خيوط، أقمشة، إيجار، كهرباء...)
  description: string     // وصف المصروف
  amount: number
  date: string
  notes?: string
  recurrence_type?: ExpenseRecurrenceType
  recurring_day_of_month?: number | null
  recurring_source_id?: string | null
  recurring_month?: string | null
  is_auto_generated?: boolean
  created_at: string
  created_by?: string
  supplier_id?: string    // معرف المورد (اختياري)
  supplier_name?: string  // اسم المورد (اختياري - للتسهيل)
  payment_method?: PaymentMethod | null
  cash_source?: ExpenseCashSource | null // مصدر التمويل: من الصندوق أو من خارجه
}

export interface CreateExpenseInput {
  branch: BranchType
  type: ExpenseType
  category: string
  description: string
  amount: number
  date: string
  notes?: string
  supplier_id?: string
  supplier_name?: string
  payment_method?: PaymentMethod | null
  cash_source?: ExpenseCashSource | null
  recurrence_type?: ExpenseRecurrenceType
  recurring_day_of_month?: number | null
  recurring_source_id?: string | null
  recurring_month?: string | null
  is_auto_generated?: boolean
}

// ============================================================================
// الواردات (من الطلبات المسلمة)
// ============================================================================

// طريقة الدفع
export type PaymentMethod = 'cash' | 'network'

// بند قماش واحد داخل مبيعة أقمشة (تدعم عدّة أقمشة في مبيعة واحدة)
export interface FabricSaleItem {
  inventory_id?: string | null   // معرّف صنف المخزون المطابق (للمرجع)
  name: string                   // اسم القماش (يُطابَق به منتج الأستاذ)
  quantity_meters?: number | null // الكمية بالمتر لهذا القماش
}

export interface Income {
  id: string
  branch: BranchType
  category?: string       // فئة المبيعة (اختياري)
  order_id?: string       // رقم الطلب المرتبط
  customer_name: string
  description: string
  amount: number
  quantity_meters?: number | null // الكمية بالمتر (الإجمالي الكلّي عند تعدّد الأقمشة)
  fabric_items?: FabricSaleItem[] | null // بنود القماش المتعدّدة [{name, quantity_meters}] — NULL = قماش واحد
  payment_method?: PaymentMethod | null // طريقة الدفع: كاش أو شبكة
  customer_source?: string | null        // مصدر الزبونة: ياسمين الشام أو مصدر آخر
  fabric_images?: string[] | null        // روابط صور القماش المباع (خصوصاً قماش الشك)
  buyer_name?: string | null             // اسم العميل (اختياري) — customer_name يخزن اسم القماش
  buyer_phone?: string | null            // رقم هاتف العميل (اختياري)
  invoice_number?: number | null          // رقم الفاتورة التسلسلي (فرع الأقمشة فقط، يُعيَّن تلقائياً)
  date: string
  is_automatic: boolean   // هل تم إضافته تلقائياً من الطلبات
  created_at: string
  // ── الربط مع الأستاذ للمحاسبة (فرع الأقمشة) ──
  alostaz_customer_id?: number | null      // معرّف العميل (partner) في الأستاذ
  alostaz_invoice_id?: number | null       // معرّف الفاتورة في الأستاذ (وجوده = أُرسِلت)
  alostaz_invoice_code?: string | null     // رقم الفاتورة النصّي في الأستاذ
  alostaz_sync_status?: 'sending' | 'sent' | 'failed' | 'review_required' | null
  alostaz_synced_at?: string | null        // وقت آخر مزامنة
}

export interface CreateIncomeInput {
  /** معرّف ثابت لمحاولة الإنشاء لمنع التكرار إذا انقطع رد الشبكة بعد الحفظ */
  id?: string
  branch: BranchType
  category?: string       // فئة المبيعة (اختياري)
  order_id?: string
  customer_name: string
  description?: string
  amount: number
  quantity_meters?: number | null // الكمية بالمتر (الإجمالي الكلّي عند تعدّد الأقمشة)
  fabric_items?: FabricSaleItem[] | null // بنود القماش المتعدّدة [{name, quantity_meters}]
  payment_method?: PaymentMethod | null // طريقة الدفع: كاش أو شبكة
  customer_source?: string | null        // مصدر الزبونة: ياسمين الشام أو مصدر آخر
  fabric_images?: string[] | null        // روابط صور القماش المباع (خصوصاً قماش الشك)
  buyer_name?: string | null             // اسم العميل (اختياري) — customer_name يخزن اسم القماش
  buyer_phone?: string | null            // رقم هاتف العميل (اختياري)
  date: string
  is_automatic?: boolean
}

// ============================================================================
// ملخص مالي
// ============================================================================

export interface FinancialSummary {
  branch: BranchType
  period: {
    startDate: string
    endDate: string
  }
  totalIncome: number           // إجمالي الواردات
  totalMaterialExpenses: number // إجمالي مصروفات المواد
  totalFixedExpenses: number    // إجمالي المصاريف الثابتة
  totalSalaries: number         // إجمالي الرواتب
  totalExpenses: number         // إجمالي المصروفات
  netProfit: number             // صافي الربح
  cashBoxBalance: number        // رصيد الصندوق = كاش الطلبات والواردات - حركات الخروج والسحب
}

// ============================================================================
// صندوق النقد
// ============================================================================

export type CashBoxTransactionType =
  | 'order_deposit'
  | 'order_delivery'
  | 'cash_income'
  | 'box_expense'
  | 'balance_adjustment'
  | 'withdrawal'

export interface CashBoxTransaction {
  transaction_id: string
  transaction_type: CashBoxTransactionType
  /** موجبة للوارد وسالبة للصادر */
  amount: number
  occurred_at: string
  title: string
  description: string
  actor_name?: string | null
  reference_id?: string | null
}

export interface CashBoxWithdrawal {
  id: string
  branch: BranchType
  amount: number
  reason: string
  balance_before: number
  balance_after: number
  created_by_name: string
  created_at: string
}

export interface CreateCashBoxWithdrawalInput {
  branch: BranchType
  amount: number
  reason: string
}

export interface CreateCashBoxWithdrawalResult {
  withdrawal: CashBoxWithdrawal
  newBalance: number
}

// ============================================================================
// تصنيفات المصروفات الثابتة
// ============================================================================

export const FIXED_EXPENSE_CATEGORIES = [
  { id: 'rent', label: 'إيجار المحل' },
  { id: 'electricity', label: 'الكهرباء' },
  { id: 'water', label: 'المياه' },
  { id: 'internet', label: 'الإنترنت' },
  { id: 'phone', label: 'الهاتف' },
  { id: 'insurance', label: 'التأمين' },
  { id: 'maintenance', label: 'الصيانة' },
  { id: 'cleaning', label: 'النظافة' },
  { id: 'other', label: 'أخرى' }
]

// ============================================================================
// تصنيفات مصروفات المواد (للتفصيل)
// ============================================================================

export const MATERIAL_EXPENSE_CATEGORIES = [
  { id: 'fabric', label: 'أقمشة' },
  { id: 'thread', label: 'خيوط' },
  { id: 'buttons', label: 'أزرار' },
  { id: 'zippers', label: 'سحابات' },
  { id: 'lace', label: 'دانتيل' },
  { id: 'beads', label: 'خرز وتطريز' },
  { id: 'accessories', label: 'إكسسوارات' },
  { id: 'packaging', label: 'تغليف' },
  { id: 'other', label: 'أخرى' }
]

// ============================================================================
// أسماء الفروع بالعربية
// ============================================================================

export const BRANCH_NAMES: Record<BranchType, string> = {
  tailoring: 'قسم التفصيل',
  fabrics: 'قسم الأقمشة',
  ready_designs: 'قسم الجاهز'
}
