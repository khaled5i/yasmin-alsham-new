// ============================================================================
// أنواع النظام المحاسبي البسيط
// ============================================================================

// نوع الفرع
export type BranchType = 'tailoring' | 'fabrics' | 'ready_designs'

// نوع المصروف
export type ExpenseType = 'material' | 'fixed' | 'salary' | 'other'

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
  created_at: string
  created_by?: string
}

export interface CreateExpenseInput {
  branch: BranchType
  type: ExpenseType
  category: string
  description: string
  amount: number
  date: string
  notes?: string
}

// ============================================================================
// الواردات (من الطلبات المسلمة)
// ============================================================================

export interface Income {
  id: string
  branch: BranchType
  order_id?: string       // رقم الطلب المرتبط
  customer_name: string
  description: string
  amount: number
  date: string
  is_automatic: boolean   // هل تم إضافته تلقائياً من الطلبات
  created_at: string
}

export interface CreateIncomeInput {
  branch: BranchType
  order_id?: string
  customer_name: string
  description?: string
  amount: number
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

