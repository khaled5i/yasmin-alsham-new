'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Lock,
  Unlock,
  RefreshCw,
  Save,
  Search,
  Wallet,
  UserPlus,
  X,
  Trash2,
  DollarSign,
  History,
  LayoutDashboard,
  ArrowRight,
  Tag,
  Star,
  Calendar,
  Clock,
  User,
  Phone,
  Package,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  PlayCircle
} from 'lucide-react'
import { orderService, type Order } from '@/lib/services/order-service'
import { formatGregorianDate } from '@/lib/date-utils'
import { useAuthStore } from '@/store/authStore'
import { workerService, type WorkerWithUser } from '@/lib/services/worker-service'
import {
  deleteWorkerPayrollOperation,
  getLastNegativeBalanceBeforeMonth,
  getLastSalaryInfoBeforeMonth,
  getSuspendedWorkerIds,
  suspendWorkerPayroll,
  unsuspendWorkerPayroll,
  getWorkerOperationsAllPeriods,
  getWorkerPayrollMonths,
  getWorkerPayrollOperations,
  getWorkerPayrollPeriodLock,
  getWorkerPayrollBigDebts,
  lockWorkerPayrollPeriod,
  unlockWorkerPayrollPeriod,
  propagateSalaryToFutureMonths,
  registerWorkerPayrollAdjustment,
  registerWorkerPayrollPayment,
  saveWorkerPayrollSnapshot,
  getWorkerDeductionPayments,
  settleWorkerDebtFromSalary,
  deleteWorkerDeductionPayment,
  type WorkerDeductionPayment
} from '@/lib/services/worker-payroll-service'
import type {
  PayrollOperationType,
  PayrollSalaryType,
  PayrollStatus,
  WorkerPayrollMonth,
  WorkerPayrollOperation
} from '@/types/worker-payroll'

const BRANCH = 'tailoring' as const
const OVERTIME_RATE = 12.5
const NUMBER_INPUT_CLASS = 'rounded-lg border border-gray-200 px-2 py-2 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'


interface SalaryFormState {
  salaryType: PayrollSalaryType
  fixedSalary: string
  pieceCount: string
  pieceRate: string
  overtimeAmount: string
  operationDate: string
  reference: string
  note: string
}

type PanelTab = 'salary' | 'payments' | 'debts' | 'log'

type LedgerEntry =
  | { kind: 'operation'; createdAt: string; op: WorkerPayrollOperation }
  | { kind: 'debt_payment'; createdAt: string; payment: WorkerDeductionPayment }

interface PaymentFormState {
  amount: string
  operationDate: string
  reference: string
  note: string
}

interface NewWorkerFormState {
  full_name: string
  phone: string
  specialty: string
}

interface TailoringPayrollDashboardProps {
  embeddedWorkerId?: string
}

// ============================================================================
// بيانات التسعير والتقييم
// ============================================================================

interface OrderPricingData {
  orderId: string
  price: string
  notes: string
  bonus: string
  rating: number // 0-5
}

function orderToPricingData(order: Order): OrderPricingData {
  return {
    orderId: order.id,
    price:  order.worker_price  != null ? String(order.worker_price)  : '',
    bonus:  order.worker_bonus  != null ? String(order.worker_bonus)  : '',
    rating: order.worker_rating ?? 0,
    notes:  order.worker_notes  ?? '',
  }
}

function getPricingSummary(forms: Record<string, OrderPricingData>): { pricedCount: number; totalPriced: number } {
  return Object.values(forms).reduce(
    (summary, form) => {
      if (form.price.trim() === '') return summary

      summary.pricedCount += 1
      if (toNumber(form.price) > 0) {
        summary.totalPriced = roundMoney(
          summary.totalPriced + toNumber(form.price) + toNumber(form.bonus)
        )
      }
      return summary
    },
    { pricedCount: 0, totalPriced: 0 }
  )
}


interface SalaryCalculation {
  fixedSalaryValue: number
  pieceCount: number
  pieceRate: number
  pieceTotal: number
  overtimeAmount: number
  overtimeTotal: number
  basicSalaryForSnapshot: number
  worksTotalForSnapshot: number
  grossBeforeDeductions: number
  netAfterDeductions: number
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function toMonthValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function parseMonthValue(monthValue: string): { year: number; month: number } {
  const [yearStr, monthStr] = monthValue.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!year || !month) {
    throw new Error('Invalid month value')
  }
  return { year, month }
}

function monthEndDate(monthValue: string): string {
  const { year, month } = parseMonthValue(monthValue)
  const day = new Date(year, month, 0).getDate()
  return `${monthValue}-${String(day).padStart(2, '0')}`
}

function previousMonthValue(monthValue: string): string {
  const { year, month } = parseMonthValue(monthValue)
  const date = new Date(year, month - 1, 1)
  date.setMonth(date.getMonth() - 1)
  return toMonthValue(date)
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (!value) return 0
  const parsed = Number(String(value).replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function sanitizeNonNegativeInput(value: string): string {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return ''
  if (!/^\d*\.?\d*$/.test(normalized)) return ''
  return normalized
}

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)} ر.س`
}

/** التاريخ المحاسبي للعملية (يوم فقط) */
function formatOperationDay(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** وقت التسجيل الفعلي (تاريخ + ساعة ودقيقة) لسهولة مراجعة سجل العمليات */
function formatRecordedAt(timestamp: string): string {
  return new Date(timestamp).toLocaleString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getWorkerName(worker: WorkerWithUser): string {
  return worker.user?.full_name || worker.user?.email || worker.id
}

function operationTypeLabel(type: PayrollOperationType): string {
  if (type === 'salary') return 'راتب'
  if (type === 'payment') return 'دفعة'
  if (type === 'advance') return 'سلفة'
  return 'دين'
}

/**
 * دفعة راتب ناتجة عن تسوية دين (وليست نقداً فعلياً)
 * تُسجَّل من settle_worker_debt_from_salary مع metadata.debt_settlement
 */
function isDebtSettlementOp(op: WorkerPayrollOperation): boolean {
  const flag = op.metadata?.['debt_settlement']
  return flag === true || flag === 'true'
}

const STATUS_STYLE: Record<PayrollStatus, string> = {
  unpaid: 'bg-red-50 text-red-700 border-red-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-rose-100 text-rose-800 border-rose-300',
  zero: 'bg-slate-100 text-slate-700 border-slate-300'
}

const STATUS_LABEL: Record<PayrollStatus, string> = {
  unpaid: 'غير مدفوع',
  partial: 'مدفوع جزئيًا',
  paid: 'مكتمل',
  negative: 'سالب',
  zero: 'صفر'
}

function buildEmptyMonth(worker: WorkerWithUser, monthValue: string): WorkerPayrollMonth {
  const { year, month } = parseMonthValue(monthValue)
  return {
    id: `virtual-${worker.id}-${monthValue}`,
    branch: BRANCH,
    worker_id: worker.id,
    worker_name: getWorkerName(worker),
    payroll_year: year,
    payroll_month: month,
    period_key: monthValue,
    basic_salary: 0,
    works_total: 0,
    salary_type: 'fixed',
    fixed_salary_value: 0,
    piece_count: 0,
    piece_rate: 0,
    piece_total: 0,
    overtime_hours: 0,
    overtime_rate: OVERTIME_RATE,
    overtime_total: 0,
    allowances_total: 0,
    deductions_total: 0,
    advances_total: 0,
    net_due: 0,
    total_paid: 0,
    remaining_due: 0,
    salary_status: 'zero',
    approved_at: null,
    approved_by: null,
    is_locked: false,
    locked_at: null,
    locked_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null
  }
}

function toReadableError(error: unknown): string {
  if (!error) return 'حدث خطأ غير متوقع'
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'حدث خطأ غير متوقع'
}

function calculateSalaryValues(form: SalaryFormState): SalaryCalculation {
  const fixedSalaryValue = roundMoney(toNumber(form.fixedSalary))
  const pieceCount = roundMoney(toNumber(form.pieceCount))
  const pieceRate = roundMoney(toNumber(form.pieceRate))
  const pieceTotal = roundMoney(pieceCount * pieceRate)
  // العمل الإضافي: مبلغ مباشر بالريال (يُخزَّن في القاعدة كـ hours=المبلغ مع rate=1)
  const overtimeAmount = roundMoney(toNumber(form.overtimeAmount))
  const overtimeTotal = overtimeAmount

  const basicSalaryForSnapshot = form.salaryType === 'fixed' ? fixedSalaryValue : 0
  const worksTotalForSnapshot = form.salaryType === 'fixed'
    ? overtimeTotal
    : roundMoney(pieceTotal + overtimeTotal)
  const grossBeforeDeductions = roundMoney(basicSalaryForSnapshot + worksTotalForSnapshot)
  const netAfterDeductions = grossBeforeDeductions

  return {
    fixedSalaryValue,
    pieceCount,
    pieceRate,
    pieceTotal,
    overtimeAmount,
    overtimeTotal,
    basicSalaryForSnapshot,
    worksTotalForSnapshot,
    grossBeforeDeductions,
    netAfterDeductions
  }
}

export default function TailoringPayrollDashboard({ embeddedWorkerId }: TailoringPayrollDashboardProps = {}) {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [monthRowsByWorker, setMonthRowsByWorker] = useState<Record<string, WorkerPayrollMonth>>({})
  const [operationsByWorker, setOperationsByWorker] = useState<Record<string, WorkerPayrollOperation[]>>({})
  const [previousRemainingByWorker, setPreviousRemainingByWorker] = useState<Record<string, number>>({})
  const [previousNegativeByWorker, setPreviousNegativeByWorker] = useState<Record<string, number>>({})
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthValue(new Date()))
  const [searchTerm, setSearchTerm] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [lockReason, setLockReason] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [salaryForms, setSalaryForms] = useState<Record<string, SalaryFormState>>({})
  const [paymentForms, setPaymentForms] = useState<Record<string, PaymentFormState>>({})
  const [showNewWorkerModal, setShowNewWorkerModal] = useState(false)
  // لوحة التحكم الموحدة للعامل: الراتب + الدفعات + الديون + سجل العمليات
  const [selectedWorkerForPanel, setSelectedWorkerForPanel] = useState<WorkerWithUser | null>(null)
  const [panelTab, setPanelTab] = useState<PanelTab>('salary')
  const [allOperationsForWorker, setAllOperationsForWorker] = useState<WorkerPayrollOperation[]>([])
  const [allOperationsLoading, setAllOperationsLoading] = useState(false)
  const [newWorkerForm, setNewWorkerForm] = useState<NewWorkerFormState>({
    full_name: '',
    phone: '',
    specialty: ''
  })

  // حالة الديون
  const [bigDebtsByWorker, setBigDebtsByWorker] = useState<Record<string, number>>({})
  const [deductionPaymentsForWorker, setDeductionPaymentsForWorker] = useState<WorkerDeductionPayment[]>([])
  const [deductionPaymentsLoading, setDeductionPaymentsLoading] = useState(false)
  const [deductionPaymentForms, setDeductionPaymentForms] = useState<Record<string, { amount: string; paymentDate: string; note: string }>>({})
  const [newDeductionForms, setNewDeductionForms] = useState<Record<string, { amount: string; operationDate: string; note: string }>>({})

  // حالة تعليق الرواتب (مخزنة في localStorage لكل شهر)
  const [suspendedWorkers, setSuspendedWorkers] = useState<Set<string>>(() => new Set())

  // حالة نافذة التسعير والتقييم
  const [selectedWorkerForPricing, setSelectedWorkerForPricing] = useState<WorkerWithUser | null>(null)
  const [pricingOrders, setPricingOrders] = useState<Order[]>([])
  const [pricingOrdersLoading, setPricingOrdersLoading] = useState(false)
  const [selectedOrderForPricing, setSelectedOrderForPricing] = useState<Order | null>(null)
  const [pricingForms, setPricingForms] = useState<Record<string, OrderPricingData>>({})
  // كاش التفاصيل الكاملة للطلبات (يشمل completed_images)
  const [orderFullDetails, setOrderFullDetails] = useState<Record<string, Order>>({})
  // الصورة المعروضة في معرض الصور الكامل
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const isReadOnly = isLocked || !isAdmin

  /**
   * فتح لوحة التحكم الموحدة للعامل على تبويب محدد
   * تُحمِّل سجل العمليات (كل الفترات) ودفعات الديون معاً
   */
  const openWorkerPanel = useCallback(async (worker: WorkerWithUser, tab: PanelTab | null = 'salary') => {
    setSelectedWorkerForPanel(worker)
    if (tab) setPanelTab(tab)

    const today = new Date().toISOString().split('T')[0]
    const isCurrentMonth = selectedMonth === toMonthValue(new Date())
    const deductionDefaultDate = isCurrentMonth ? today : monthEndDate(selectedMonth)
    setDeductionPaymentForms((prev) => ({
      ...prev,
      [worker.id]: prev[worker.id] || { amount: '', paymentDate: today, note: '' }
    }))
    setNewDeductionForms((prev) => ({
      ...prev,
      [worker.id]: prev[worker.id] || { amount: '', operationDate: deductionDefaultDate, note: '' }
    }))

    setAllOperationsLoading(true)
    setDeductionPaymentsLoading(true)
    setAllOperationsForWorker([])
    setDeductionPaymentsForWorker([])
    try {
      const [operations, debtPayments] = await Promise.all([
        getWorkerOperationsAllPeriods(BRANCH, worker.id),
        getWorkerDeductionPayments(BRANCH, worker.id)
      ])
      setAllOperationsForWorker(operations)
      setDeductionPaymentsForWorker(debtPayments)
    } catch {
      setAllOperationsForWorker([])
      setDeductionPaymentsForWorker([])
    } finally {
      setAllOperationsLoading(false)
      setDeductionPaymentsLoading(false)
    }
  }, [selectedMonth])

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const prevMonth = previousMonthValue(selectedMonth)
      const [workerResult, months, operations, lockRow, previousMonths, lastNegativeBalances, lastSalaryInfo, suspendedIds, bigDebts] = await Promise.all([
        workerService.getAll(),
        getWorkerPayrollMonths(BRANCH, selectedMonth),
        getWorkerPayrollOperations(BRANCH, selectedMonth),
        getWorkerPayrollPeriodLock(BRANCH, selectedMonth),
        getWorkerPayrollMonths(BRANCH, prevMonth),
        getLastNegativeBalanceBeforeMonth(BRANCH, selectedMonth),
        getLastSalaryInfoBeforeMonth(BRANCH, selectedMonth),
        getSuspendedWorkerIds(BRANCH, selectedMonth),
        getWorkerPayrollBigDebts(BRANCH)
      ])

      const activeWorkers = (workerResult.data || []).filter(
        (worker) => worker.user?.is_active !== false
      )
      const tailoringWorkers = activeWorkers.filter(
        (worker) => (worker.worker_type === 'tailor' || worker.worker_type === 'workshop_manager') && worker.user?.is_active !== false
      )

      const allWorkers = embeddedWorkerId
        ? activeWorkers.filter((worker) => worker.id === embeddedWorkerId)
        : tailoringWorkers

      const monthMap: Record<string, WorkerPayrollMonth> = {}
      months.forEach((row) => {
        monthMap[row.worker_id] = row
      })

      const operationMap: Record<string, WorkerPayrollOperation[]> = {}
      operations.forEach((operation) => {
        if (!operationMap[operation.worker_id]) {
          operationMap[operation.worker_id] = []
        }
        operationMap[operation.worker_id].push(operation)
      })

      const previousRemainingMap: Record<string, number> = {}
      // الرصيد السالب: نبدأ بآخر رصيد معروف قبل هذا الشهر (يحفظ الدين عبر شهور التعليق)
      const previousNegativeMap: Record<string, number> = { ...lastNegativeBalances }

      // نُعيد تطبيق بيانات الشهر السابق المباشر (M-1) لتكون هي المرجع النهائي:
      // - إذا كان M-1 موجوداً وسالباً → يُستخدم مباشرةً
      // - إذا كان M-1 موجوداً وإيجابياً (دين سُدّد) → نمسح الدين القديم
      // - إذا لم يكن M-1 موجوداً (عامل معلق) → يبقى lastNegativeBalances كـ fallback
      previousMonths.forEach((row) => {
        if (row.remaining_due > 0.009) {
          previousRemainingMap[row.worker_id] = row.remaining_due
        }
        if (row.remaining_due < -0.009) {
          previousNegativeMap[row.worker_id] = Math.abs(row.remaining_due)
        } else {
          // M-1 موجود وغير سالب → الدين سُدّد أو لا يوجد، نمسح أي قيمة قديمة
          delete previousNegativeMap[row.worker_id]
        }
      })

      const defaultDate = monthEndDate(selectedMonth)
      // الدفعات والسلف تُسجَّل افتراضياً بتاريخ اليوم عندما يكون الشهر المحدد هو الشهر الحالي فقط.
      // أما للأشهر السابقة فيجب أن ينتمي تاريخ العملية لشهر الراتب المحدد وإلا رفضته قاعدة البيانات
      // (assert_worker_payroll_operation_period: Operation date must belong to payroll month).
      const isCurrentMonth = selectedMonth === toMonthValue(new Date())
      const operationDefaultDate = isCurrentMonth
        ? new Date().toISOString().split('T')[0]
        : defaultDate
      const isPeriodLocked = lockRow?.is_locked === true

      // حفظ تلقائي للراتب الثابت فقط: إذا كان المستخدم أدمن والشهر غير مقفل،
      // نحفظ تلقائياً الراتب للعمال ذوي الراتب الثابت الذين لا يوجد لهم سجل في الشهر الحالي.
      // عمال القطعة لا يُحفظون تلقائياً لأن عدد القطع يتغير كل شهر.
      if (isAdmin && !isPeriodLocked) {
        const workersNeedingAutoSave = allWorkers.filter((worker) => {
          if (monthMap[worker.id]) return false
          // العمال المعلقون لا يُحفظون تلقائياً (راتبهم صفر في الشهر المعلق)
          if (suspendedIds.has(worker.id)) return false
          const info = lastSalaryInfo[worker.id]
          return info && info.salary_type === 'fixed' && info.fixed_salary_value > 0
        })

        if (workersNeedingAutoSave.length > 0) {
          await Promise.allSettled(
            workersNeedingAutoSave.map((worker) => {
              const info = lastSalaryInfo[worker.id]
              const lastSalary = info.fixed_salary_value
              return saveWorkerPayrollSnapshot({
                branch: BRANCH,
                workerId: worker.id,
                workerName: getWorkerName(worker),
                monthValue: selectedMonth,
                basicSalary: lastSalary,
                worksTotal: 0,
                salaryType: 'fixed',
                fixedSalaryValue: lastSalary,
                pieceCount: 0,
                pieceRate: 0,
                overtimeHours: 0,
                overtimeRate: OVERTIME_RATE,
                allowancesTotal: 0,
                deductionsTotal: 0,
                advancesTotal: 0,
                operationDate: defaultDate
              })
            })
          )

          // إعادة تحميل سجلات الشهر بعد الحفظ التلقائي
          const updatedMonths = await getWorkerPayrollMonths(BRANCH, selectedMonth)
          updatedMonths.forEach((row) => {
            monthMap[row.worker_id] = row
          })
        }
      }

      const bigDebtsMap: Record<string, number> = {}
      ;(bigDebts || []).forEach((debt) => {
        bigDebtsMap[debt.worker_id] = debt.remaining_amount || 0
      })

      setWorkers(allWorkers)
      setMonthRowsByWorker(monthMap)
      setOperationsByWorker(operationMap)
      setPreviousRemainingByWorker(previousRemainingMap)
      setPreviousNegativeByWorker(previousNegativeMap)
      setIsLocked(isPeriodLocked)
      setLockReason(lockRow?.lock_reason || '')
      setSuspendedWorkers(suspendedIds)
      setBigDebtsByWorker(bigDebtsMap)

      setSalaryForms(() => {
        const next: Record<string, SalaryFormState> = {}
        allWorkers.forEach((worker) => {
          const month = monthMap[worker.id]

          // If no record exists for this month, use the last fixed salary from previous months
          let fixedSalaryValue = 0
          let pieceCountValue = 0
          let pieceRateValue = 0
          let overtimeAmountValue = 0
          let salaryType: PayrollSalaryType = 'fixed'

          if (month) {
            // Month record exists - use its values
            fixedSalaryValue = month.fixed_salary_value || month.basic_salary || 0
            pieceCountValue = month.piece_count || 0
            pieceRateValue = month.piece_rate || 0
            overtimeAmountValue = month.overtime_total || 0
            salaryType = month.salary_type === 'piecework' ? 'piecework' : 'fixed'
          } else {
            // لا يوجد سجل لهذا الشهر - نحافظ على نوع الراتب من آخر شهر معروف
            const lastInfo = lastSalaryInfo[worker.id]
            if (lastInfo) {
              salaryType = lastInfo.salary_type
              if (salaryType === 'fixed') {
                fixedSalaryValue = lastInfo.fixed_salary_value
              }
              // عمال القطعة: لا تُنسخ مبالغ الشهر السابق — راتبهم يُحسب من جديد كل شهر
            }
          }

          // لعمال القطعة: نطبّع القيم دائماً كـ (إجمالي الراتب × 1) حتى يتمكن المستخدم من تعديل المبلغ مباشرة
          const normalizedPieceCount = salaryType === 'piecework' && pieceCountValue > 0 && pieceRateValue > 0
            ? roundMoney(pieceCountValue * pieceRateValue)
            : pieceCountValue
          const normalizedPieceRate = salaryType === 'piecework' && pieceCountValue > 0 && pieceRateValue > 0
            ? 1
            : pieceRateValue

          next[worker.id] = {
            salaryType,
            fixedSalary: fixedSalaryValue > 0 ? fixedSalaryValue.toString() : '',
            pieceCount: salaryType === 'piecework' ? normalizedPieceCount.toString() : '',
            pieceRate: salaryType === 'piecework'
              ? (normalizedPieceRate > 0 ? normalizedPieceRate.toString() : '1')
              : '',
            overtimeAmount: overtimeAmountValue > 0 ? overtimeAmountValue.toString() : '',
            // في الشهر الحالي تُسجَّل عملية الراتب بتاريخ اليوم الفعلي، وللأشهر السابقة بنهاية الشهر
            operationDate: operationDefaultDate,
            reference: '',
            note: ''
          }
        })
        return next
      })

      setPaymentForms(() => {
        const next: Record<string, PaymentFormState> = {}
        allWorkers.forEach((worker) => {
          const month = monthMap[worker.id] || buildEmptyMonth(worker, selectedMonth)
          next[worker.id] = {
            amount: month.remaining_due > 0 ? month.remaining_due.toFixed(2) : '',
            operationDate: operationDefaultDate,
            reference: '',
            note: ''
          }
        })
        return next
      })
    } catch (error) {
      console.error('Failed loading payroll dashboard:', error)
      alert('فشل تحميل بيانات الرواتب')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedMonth, isAdmin, embeddedWorkerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!embeddedWorkerId || isLoading) return

    const embeddedWorker = workers.find((worker) => worker.id === embeddedWorkerId)
    if (embeddedWorker) {
      void openWorkerPanel(embeddedWorker, null)
    }
  }, [embeddedWorkerId, isLoading, openWorkerPanel, workers])

const getMonthRow = useCallback((worker: WorkerWithUser) => {
    return monthRowsByWorker[worker.id] || buildEmptyMonth(worker, selectedMonth)
  }, [monthRowsByWorker, selectedMonth])

  const toggleSuspendWorker = useCallback(async (worker: WorkerWithUser) => {
    const workerId = worker.id
    const isSuspended = suspendedWorkers.has(workerId)

    // تحديث فوري في الواجهة
    setSuspendedWorkers((prev) => {
      const next = new Set(prev)
      if (isSuspended) {
        next.delete(workerId)
      } else {
        next.add(workerId)
      }
      return next
    })

    try {
      if (isSuspended) {
        await unsuspendWorkerPayroll(BRANCH, workerId, selectedMonth)
      } else {
        await suspendWorkerPayroll(BRANCH, workerId, getWorkerName(worker), selectedMonth)
      }
    } catch (err) {
      // تراجع عند الخطأ
      setSuspendedWorkers((prev) => {
        const next = new Set(prev)
        if (isSuspended) {
          next.add(workerId)
        } else {
          next.delete(workerId)
        }
        return next
      })
      alert('فشل تحديث حالة التعليق: ' + (err instanceof Error ? err.message : 'خطأ غير متوقع'))
    }
  }, [suspendedWorkers, selectedMonth])

  const filteredWorkers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) return workers
    return workers.filter((worker) => {
      const haystack = [
        worker.user?.full_name,
        worker.user?.email,
        worker.user?.phone,
        worker.specialty
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [searchTerm, workers])

  // تقسيم العمال حسب نوع الراتب
  // عند عدم وجود سجل لهذا الشهر نعتمد على نوع الراتب من آخر شهر معروف (المحمَّل في النموذج)
  // حتى لا يعود عمال القطعة لجدول الراتب الثابت في الأشهر الجديدة
  const isPieceworkWorker = useCallback((worker: WorkerWithUser) => {
    const row = monthRowsByWorker[worker.id]
    if (row) return row.salary_type === 'piecework'
    return salaryForms[worker.id]?.salaryType === 'piecework'
  }, [monthRowsByWorker, salaryForms])

  const pieceworkWorkers = useMemo(
    () => filteredWorkers.filter((worker) => isPieceworkWorker(worker)),
    [filteredWorkers, isPieceworkWorker]
  )

  const fixedSalaryWorkers = useMemo(
    () => filteredWorkers.filter((worker) => !isPieceworkWorker(worker)),
    [filteredWorkers, isPieceworkWorker]
  )

  /**
   * النقد الفعلي المصروف على العامل خلال الشهر المحدد:
   * + الدفعات النقدية (بدون دفعات تسوية الدين)
   * + الديون الجديدة المسجلة هذا الشهر (مال حقيقي خرج من الصندوق)
   */
  const getRealPaid = useCallback((workerId: string) => {
    const ops = operationsByWorker[workerId] || []
    return ops.reduce((sum, op) => {
      if (op.operation_type === 'payment' && !isDebtSettlementOp(op)) return sum + op.amount
      if (op.operation_type === 'deduction') return sum + op.amount
      return sum
    }, 0)
  }, [operationsByWorker])

  const totals = useMemo(() => {
    return filteredWorkers.reduce(
      (acc, worker) => {
        // العمال المعلقون لا يُحتسبون في الإجماليات
        if (suspendedWorkers.has(worker.id)) return acc
        const row = getMonthRow(worker)
        acc.salary += row.basic_salary + row.works_total
        acc.deductions += bigDebtsByWorker[worker.id] || 0
        // إجمالي المدفوع = النقد الفعلي المصروف خلال هذا الشهر
        acc.paid += getRealPaid(worker.id)
        acc.remaining += row.remaining_due
        return acc
      },
      { salary: 0, deductions: 0, paid: 0, remaining: 0 }
    )
  }, [filteredWorkers, getMonthRow, suspendedWorkers, bigDebtsByWorker, getRealPaid])

  const handleSaveSnapshot = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. التعديل متاح فقط عبر إشعار تعديل رسمي.')
      return
    }

    if (!isAdmin) {
      alert('الإضافات والتعديلات مسموحة للأدمن فقط.')
      return
    }

    const form = salaryForms[worker.id]
    if (!form) return

    const salary = calculateSalaryValues(form)

    if (
      [
        salary.fixedSalaryValue,
        salary.pieceCount,
        salary.pieceRate,
        salary.overtimeAmount
      ].some((v) => v < 0)
    ) {
      alert('لا يمكن إدخال قيم سالبة في مكونات الراتب')
      return
    }

    const monthRow = monthRowsByWorker[worker.id]

    setActionKey(`snapshot-${worker.id}`)
    try {
      await saveWorkerPayrollSnapshot({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        basicSalary: salary.basicSalaryForSnapshot,
        worksTotal: salary.worksTotalForSnapshot,
        salaryType: form.salaryType,
        fixedSalaryValue: salary.fixedSalaryValue,
        pieceCount: salary.pieceCount,
        pieceRate: salary.pieceRate,
        // دفعة العمل الإضافي تُخزَّن كمبلغ مباشر (hours = المبلغ، rate = 1)
        overtimeHours: salary.overtimeAmount,
        overtimeRate: 1,
        allowancesTotal: monthRow?.allowances_total ?? 0,
        // الحفاظ على ديون وسلف الشهر المسجلة سابقاً بدل تصفيرها عند إعادة حفظ الراتب
        deductionsTotal: monthRow?.deductions_total ?? 0,
        advancesTotal: monthRow?.advances_total ?? 0,
        operationDate: form.operationDate,
        reference: form.reference || undefined,
        note: form.note || undefined
      })

      // نُحدّث نوع الراتب في الأشهر المستقبلية غير المقفلة
      // (لعمال القطعة يُنقل النوع فقط دون نسخ المبالغ)
      await propagateSalaryToFutureMonths(
        BRANCH,
        worker.id,
        getWorkerName(worker),
        selectedMonth,
        form.salaryType,
        salary.fixedSalaryValue,
        salary.pieceRate
      )

      await loadData(true)

      // تحديث سجل العمليات في لوحة التحكم المفتوحة
      const operations = await getWorkerOperationsAllPeriods(BRANCH, worker.id)
      setAllOperationsForWorker(operations)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, salaryForms, monthRowsByWorker, selectedMonth, loadData])

  /**
   * يُستدعى عند تغيير نوع الراتب من dropdown/radio
   * يحفظ التغيير تلقائياً ويُطبّقه على جميع الأشهر المستقبلية غير المقفلة
   */
  const handleSalaryTypeChange = useCallback(async (worker: WorkerWithUser, newSalaryType: PayrollSalaryType) => {
    // تحديث الواجهة فوراً (optimistic update)
    setSalaryForms((prev) => ({
      ...prev,
      [worker.id]: { ...prev[worker.id], salaryType: newSalaryType }
    }))

    // إذا كان الشهر مقفلاً أو المستخدم ليس أدمن، لا نحفظ - فقط نحدّث الواجهة
    if (isLocked || !isAdmin) return

    // لا حفظ تلقائي إذا لم يوجد سجل لهذا الشهر بعد:
    // الحفظ التلقائي هنا كان يسجّل راتب الشهر السابق للشهر الجديد بالخطأ.
    // النوع سيُحفظ عند ضغط "حفظ واعتماد الراتب" مع القيم الصحيحة.
    const monthRow = monthRowsByWorker[worker.id]
    if (!monthRow) return

    const currentForm = salaryForms[worker.id]
    if (!currentForm) return

    // حساب قيم الراتب بالنوع الجديد
    const updatedForm: SalaryFormState = { ...currentForm, salaryType: newSalaryType }
    const salary = calculateSalaryValues(updatedForm)

    setActionKey(`snapshot-${worker.id}`)
    try {
      // حفظ الشهر الحالي بالنوع الجديد
      await saveWorkerPayrollSnapshot({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        basicSalary: salary.basicSalaryForSnapshot,
        worksTotal: salary.worksTotalForSnapshot,
        salaryType: newSalaryType,
        fixedSalaryValue: salary.fixedSalaryValue,
        pieceCount: salary.pieceCount,
        pieceRate: salary.pieceRate,
        overtimeHours: salary.overtimeAmount,
        overtimeRate: 1,
        allowancesTotal: monthRow.allowances_total ?? 0,
        deductionsTotal: monthRow.deductions_total ?? 0,
        advancesTotal: monthRow.advances_total ?? 0,
        operationDate: currentForm.operationDate
      })

      // تطبيق النوع الجديد على جميع الأشهر المستقبلية غير المقفلة
      await propagateSalaryToFutureMonths(
        BRANCH,
        worker.id,
        getWorkerName(worker),
        selectedMonth,
        newSalaryType,
        salary.fixedSalaryValue,
        salary.pieceRate
      )

      await loadData(true)
    } catch (error) {
      console.error('Error saving salary type change:', error)
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, salaryForms, monthRowsByWorker, selectedMonth, loadData])

  const handleRegisterPayment = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. التعديل متاح فقط عبر إشعار تعديل رسمي.')
      return
    }

    if (!isAdmin) {
      alert('تسجيل الدفعات مسموح للأدمن فقط.')
      return
    }

    const form = paymentForms[worker.id]
    if (!form) return

    const amount = toNumber(form.amount)
    if (amount <= 0) {
      alert('يرجى إدخال مبلغ صحيح')
      return
    }

    setActionKey(`payment-${worker.id}`)
    try {
      await registerWorkerPayrollPayment({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        operationDate: form.operationDate,
        amount,
        reference: form.reference || undefined,
        note: form.note || undefined
      })
      await loadData(true)

      // تحديث سجل العمليات في لوحة التحكم المفتوحة
      const operations = await getWorkerOperationsAllPeriods(BRANCH, worker.id)
      setAllOperationsForWorker(operations)
    } catch (error) {
      const message = toReadableError(error)
      if (message.includes('uq_worker_payroll_payment_duplicate')) {
        alert('لا يمكن تسجيل نفس الدفعة مرتين')
      } else {
        alert(message)
      }
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, loadData, paymentForms, selectedMonth])

  const handleLockMonth = useCallback(async () => {
    if (isLocked) return
    if (!isAdmin) {
      alert('قفل الشهر مسموح للأدمن فقط.')
      return
    }
    const reason = prompt('سبب قفل الشهر (اختياري):') || ''
    setActionKey('lock-month')
    try {
      await lockWorkerPayrollPeriod({
        branch: BRANCH,
        monthValue: selectedMonth,
        reason: reason || undefined
      })
      await loadData(true)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, loadData, selectedMonth])

  const handleUnlockMonth = useCallback(async () => {
    if (!isLocked) return
    if (!isAdmin) {
      alert('إلغاء قفل الشهر مسموح للأدمن فقط.')
      return
    }
    const confirmed = confirm('هل أنت متأكد من إلغاء قفل هذا الشهر؟ سيتم السماح بالتعديلات مرة أخرى.')
    if (!confirmed) return

    setActionKey('unlock-month')
    try {
      await unlockWorkerPayrollPeriod({
        branch: BRANCH,
        monthValue: selectedMonth
      })
      await loadData(true)
      alert('تم إلغاء قفل الشهر بنجاح')
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, loadData, selectedMonth])

  const handleDeleteWorker = useCallback(async (workerId: string) => {
    if (!isAdmin) {
      alert('حذف العامل مسموح للأدمن فقط.')
      return
    }

    if (!confirm('هل أنت متأكد من حذف هذا العامل؟ سيتم حذفه نهائياً من قاعدة البيانات.')) {
      return
    }

    setActionKey(`delete-worker-${workerId}`)
    try {
      const { error } = await workerService.delete(workerId)
      if (error) throw new Error(error)

      alert('تم حذف العامل بنجاح')
      await loadData(true)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, loadData])

  const handleCreateWorker = useCallback(async () => {
    if (!isAdmin) {
      alert('إضافة عامل جديد مسموحة للأدمن فقط.')
      return
    }

    // التحقق من البيانات الإجبارية
    if (!newWorkerForm.full_name.trim()) {
      alert('الرجاء إدخال اسم العامل')
      return
    }

    if (!newWorkerForm.specialty.trim()) {
      alert('الرجاء إدخال التخصص')
      return
    }

    setActionKey('create-worker')
    try {
      // توليد بيانات اعتماد تلقائية للعامل (لا يحتاج لتسجيل دخول)
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 9)
      const autoEmail = `payroll.worker.${timestamp}.${randomStr}@yasmin-alsham.internal`
      const autoPassword = `PWR-${timestamp}-${Math.random().toString(36).substring(2, 15)}`

      const { data, error } = await workerService.create({
        email: autoEmail,
        password: autoPassword,
        full_name: newWorkerForm.full_name.trim(),
        phone: newWorkerForm.phone.trim() || undefined,
        specialty: newWorkerForm.specialty.trim(),
        worker_type: 'tailor'
      })

      if (error || !data) throw new Error(error || 'فشل إنشاء العامل')

      alert('تم إضافة العامل بنجاح!')

      // إعادة تعيين النموذج وإغلاق النافذة
      setNewWorkerForm({
        full_name: '',
        phone: '',
        specialty: ''
      })
      setShowNewWorkerModal(false)

      // تحديث قائمة العمال
      await loadData(true)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, newWorkerForm, loadData])

  /**
   * حذف أي عملية من سجل العمليات (راتب، دفعة، دين، سلفة، تسوية دين)
   * القاعدة تعكس الآثار الجانبية تلقائياً (migration 60):
   * - حذف دين → يُنقص الدين المتراكم
   * - حذف دفعة تسوية → يُعاد المبلغ للدين المتراكم ويُحذف سجل السداد المرتبط
   * قفل الشهر يُتحقق منه في القاعدة حسب شهر العملية نفسها (وليس الشهر المعروض)
   */
  const handleDeleteOperation = useCallback(async (op: WorkerPayrollOperation) => {
    if (!isAdmin) {
      alert('حذف العمليات مسموح للأدمن فقط.')
      return
    }

    const isSettlement = op.operation_type === 'payment' && isDebtSettlementOp(op)
    const operationTypeAr = isSettlement
      ? 'دفعة تسوية الدين'
      : op.operation_type === 'payment'
        ? 'الدفعة'
        : op.operation_type === 'salary'
          ? 'عملية الراتب'
          : op.operation_type === 'deduction'
            ? 'الدين'
            : 'السلفة'

    let message = `هل أنت متأكد من حذف ${operationTypeAr} (${formatCurrency(op.amount)})؟`
    if (isSettlement) {
      message += '\nسيُعاد مبلغ التسديد إلى الدين المتراكم ويُخصم من سداد الراتب.'
    } else if (op.operation_type === 'deduction') {
      message += '\nسيُنقص المبلغ من الدين المتراكم للعامل.'
    }
    if (!confirm(message)) {
      return
    }

    setActionKey(`delete-operation-${op.id}`)
    try {
      await deleteWorkerPayrollOperation(op.id)
      alert('تم حذف العملية بنجاح')
      await loadData(true)
      // تحديث سجل العمليات ودفعات الديون إذا كانت لوحة التحكم مفتوحة لعامل
      if (selectedWorkerForPanel) {
        const [operations, debtPayments] = await Promise.all([
          getWorkerOperationsAllPeriods(BRANCH, selectedWorkerForPanel.id),
          getWorkerDeductionPayments(BRANCH, selectedWorkerForPanel.id)
        ])
        setAllOperationsForWorker(operations)
        setDeductionPaymentsForWorker(debtPayments)
      }
    } catch (error) {
      const errorMessage = toReadableError(error)
      if (errorMessage.includes('period is locked')) {
        alert(`شهر ${op.payroll_month}/${op.payroll_year} مقفل — يجب إلغاء قفله أولاً لحذف هذه العملية.`)
      } else {
        alert(errorMessage)
      }
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, loadData, selectedWorkerForPanel])

  /**
   * حذف سجل سداد دين: يُعاد المبلغ إلى الدين المتراكم،
   * وإن كان محتسباً ضمن سداد الراتب (تسوية) تُحذف دفعة التسوية معه
   */
  const handleDeleteDebtPayment = useCallback(async (payment: WorkerDeductionPayment) => {
    if (!isAdmin) {
      alert('حذف العمليات مسموح للأدمن فقط.')
      return
    }

    if (!confirm(
      `هل أنت متأكد من حذف سداد الدين (${formatCurrency(payment.amount)})؟\n` +
      'سيُعاد المبلغ إلى الدين المتراكم للعامل، وإن كان محتسباً ضمن سداد الراتب فسيُخصم منه أيضاً.'
    )) {
      return
    }

    setActionKey(`delete-debt-payment-${payment.id}`)
    try {
      await deleteWorkerDeductionPayment(payment.id)
      alert('تم حذف سداد الدين بنجاح')
      await loadData(true)
      if (selectedWorkerForPanel) {
        const [operations, debtPayments] = await Promise.all([
          getWorkerOperationsAllPeriods(BRANCH, selectedWorkerForPanel.id),
          getWorkerDeductionPayments(BRANCH, selectedWorkerForPanel.id)
        ])
        setAllOperationsForWorker(operations)
        setDeductionPaymentsForWorker(debtPayments)
      }
    } catch (error) {
      const errorMessage = toReadableError(error)
      if (errorMessage.includes('period is locked')) {
        alert('شهر دفعة التسوية المرتبطة مقفل — يجب إلغاء قفله أولاً.')
      } else {
        alert(errorMessage)
      }
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, loadData, selectedWorkerForPanel])

  // ============================================================================
  // معالجات الديون
  // ============================================================================

  const handleAddDeduction = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. لا يمكن إضافة دين.')
      return
    }
    if (!isAdmin) {
      alert('إضافة الديون مسموحة للأدمن فقط.')
      return
    }
    const form = newDeductionForms[worker.id]
    if (!form) return
    const amount = toNumber(form.amount)
    if (amount <= 0) {
      alert('يرجى إدخال مبلغ دين صحيح')
      return
    }
    setActionKey(`deduction-${worker.id}`)
    try {
      await registerWorkerPayrollAdjustment({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        operationType: 'deduction',
        operationDate: form.operationDate,
        amount,
        note: form.note || undefined
      })
      setNewDeductionForms((prev) => ({
        ...prev,
        [worker.id]: { ...prev[worker.id], amount: '', note: '' }
      }))
      await loadData(true)
      const [payments, operations] = await Promise.all([
        getWorkerDeductionPayments(BRANCH, worker.id),
        getWorkerOperationsAllPeriods(BRANCH, worker.id)
      ])
      setDeductionPaymentsForWorker(payments)
      setAllOperationsForWorker(operations)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, newDeductionForms, selectedMonth, loadData])

  const handlePayDeductionDebt = useCallback(async (worker: WorkerWithUser) => {
    if (!isAdmin) {
      alert('سداد الديون مسموح للأدمن فقط.')
      return
    }
    const form = deductionPaymentForms[worker.id]
    if (!form) return
    const amount = toNumber(form.amount)
    if (amount <= 0) {
      alert('يرجى إدخال مبلغ السداد')
      return
    }
    const remainingDebt = bigDebtsByWorker[worker.id] || 0
    if (amount > remainingDebt + 0.009) {
      alert(`مبلغ السداد (${formatCurrency(amount)}) أكبر من الدين المتبقي (${formatCurrency(remainingDebt)})`)
      return
    }
    setActionKey(`deduction-pay-${worker.id}`)
    try {
      // التسديد يُخفّض الدين ويُحتسب تلقائياً ضمن سداد راتب الشهر (تسوية غير نقدية)
      await settleWorkerDebtFromSalary({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        amount,
        paymentDate: form.paymentDate,
        note: form.note || undefined
      })
      setDeductionPaymentForms((prev) => ({
        ...prev,
        [worker.id]: { ...prev[worker.id], amount: '', note: '' }
      }))
      await loadData(true)
      const [payments, operations] = await Promise.all([
        getWorkerDeductionPayments(BRANCH, worker.id),
        getWorkerOperationsAllPeriods(BRANCH, worker.id)
      ])
      setDeductionPaymentsForWorker(payments)
      setAllOperationsForWorker(operations)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, deductionPaymentForms, bigDebtsByWorker, selectedMonth, loadData])

  // ============================================================================
  // معالجات التسعير والتقييم
  // ============================================================================

  const handleOpenPricingModal = useCallback(async (worker: WorkerWithUser) => {
    setSelectedWorkerForPricing(worker)
    setSelectedOrderForPricing(null)
    setPricingOrdersLoading(true)
    try {
      const result = await orderService.getAll({
        status: ['completed', 'delivered'],
        worker_id: worker.id,
        monthFilter: selectedMonth,
        pageSize: 200
      })
      const orders = result.data || []
      setPricingOrders(orders)
      // قراءة بيانات التسعير مباشرةً من أعمدة الطلب
      const forms: Record<string, OrderPricingData> = {}
      orders.forEach((order) => {
        forms[order.id] = orderToPricingData(order)
      })
      setPricingForms(forms)
    } catch (error) {
      console.error('Failed to load orders for pricing:', error)
    } finally {
      setPricingOrdersLoading(false)
    }
  }, [selectedMonth])

  const handleClosePricingModal = useCallback(() => {
    setSelectedWorkerForPricing(null)
    setPricingOrders([])
    setSelectedOrderForPricing(null)
    setPricingForms({})
    setOrderFullDetails({})
    setLightboxImage(null)
    void loadData(true)
  }, [loadData])

  // اختيار طلب للتسعير + جلب صوره الكاملة عند الحاجة
  const handleSelectOrderForPricing = useCallback(async (order: Order) => {
    // إغلاق إذا كان مفتوحاً
    if (selectedOrderForPricing?.id === order.id) {
      setSelectedOrderForPricing(null)
      return
    }
    setSelectedOrderForPricing(order)
    // جلب التفاصيل الكاملة إذا لم تكن محفوظة في الكاش
    if (!orderFullDetails[order.id]) {
      try {
        const result = await orderService.getById(order.id)
        if (result.data) {
          setOrderFullDetails((prev) => ({ ...prev, [order.id]: result.data! }))
        }
      } catch {
        // تجاهل الخطأ — الصور ستكون غير متاحة فقط
      }
    }
  }, [selectedOrderForPricing, orderFullDetails])

  const handleSavePricingForm = useCallback((orderId: string, data: OrderPricingData) => {
    // حفظ فوري في الحالة المحلية (responsive UI)
    setPricingForms((prev) => ({ ...prev, [orderId]: data }))
    // حفظ في قاعدة البيانات
    orderService.update(orderId, {
      worker_price:  data.price  ? parseFloat(data.price)  : null,
      worker_bonus:  data.bonus  ? parseFloat(data.bonus)  : null,
      worker_rating: data.rating || null,
      worker_notes:  data.notes  || null,
    }).catch(() => { /* تجاهل — الحالة المحلية لا تزال محدَّثة */ })
  }, [])

  if (isLoading) {
    return (
      <div className={embeddedWorkerId ? 'bg-transparent' : 'min-h-screen bg-gray-50 p-6'} dir="rtl">
        <div className={`mx-auto rounded-xl border border-gray-200 bg-white text-center text-gray-600 ${embeddedWorkerId ? 'p-8' : 'max-w-7xl p-6'}`}>
          <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-indigo-500" />
          جاري تحميل بيانات الراتب...
        </div>
      </div>
    )
  }

  const embeddedWorker = embeddedWorkerId
    ? workers.find((worker) => worker.id === embeddedWorkerId) || null
    : null

  if (embeddedWorkerId && !embeddedWorker) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800" dir="rtl">
        تعذر العثور على سجل راتب لهذا العامل. جرّب تحديث الصفحة أو تأكد أن حساب العامل ما زال نشطًا.
      </div>
    )
  }

  return (
    <div className={embeddedWorkerId ? 'bg-transparent' : 'min-h-screen bg-gray-50 p-6'} dir="rtl">
      <div className={embeddedWorkerId ? 'space-y-4' : 'mx-auto max-w-7xl space-y-6'}>
        {embeddedWorker && (
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-l from-indigo-50 via-white to-white p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">
                    <Wallet className="h-3.5 w-3.5" />
                    نافذة الرواتب المرتبطة
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    isLocked
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}>
                    {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {isLocked ? 'الشهر مقفل' : 'الشهر مفتوح'}
                  </span>
                  {suspendedWorkers.has(embeddedWorker.id) && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                      <PauseCircle className="h-3.5 w-3.5" />
                      الراتب معلّق
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-lg font-bold text-slate-900 sm:text-xl">إدارة راتب {getWorkerName(embeddedWorker)}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                  تستخدم هذه النافذة نفس بيانات وأوامر قسم الرواتب الأساسي؛ أي تعديل يظهر في المكانين مباشرة.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                <label className="col-span-2 block min-w-0 sm:w-44">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">الشهر المحاسبي</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  disabled={isRefreshing}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  تحديث
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => toggleSuspendWorker(embeddedWorker)}
                    disabled={!!actionKey}
                    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                      suspendedWorkers.has(embeddedWorker.id)
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {suspendedWorkers.has(embeddedWorker.id) ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                    {suspendedWorkers.has(embeddedWorker.id) ? 'إلغاء التعليق' : 'تعليق الراتب'}
                  </button>
                )}
              </div>
            </div>

            {!isAdmin && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                العرض متاح لك، أما الإضافات والتعديلات المالية فمتاحة للأدمن فقط.
              </div>
            )}
            {isLocked && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>هذا الشهر مقفل ولا يمكن تعديله. سبب القفل: {lockReason || 'غير محدد'}.</span>
              </div>
            )}
          </div>
        )}

        {!embeddedWorkerId && (
          <>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                title="رجوع"
              >
                <ArrowRight className="h-4 w-4" />
                رجوع
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">رواتب العمال - قسم التفصيل</h1>
                <p className="mt-1 text-sm text-gray-500">
                  نظام شهري مترابط: الراتب، الدفعات، الديون، والقيود المحاسبية.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowNewWorkerModal(true)}
                disabled={!isAdmin}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                إضافة عامل جديد
              </button>
              <button
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                تحديث
              </button>
              {isLocked ? (
                <button
                  onClick={handleUnlockMonth}
                  disabled={actionKey === 'unlock-month' || !isAdmin}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Unlock className="h-4 w-4" />
                  {actionKey === 'unlock-month' ? 'جاري الإلغاء...' : 'إلغاء قفل الشهر'}
                </button>
              ) : (
                <button
                  onClick={handleLockMonth}
                  disabled={actionKey === 'lock-month' || !isAdmin}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" />
                  قفل الشهر
                </button>
              )}
            </div>
          </div>

          {!isAdmin && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              الإضافات والتعديلات متاحة للأدمن فقط.
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">الشهر المحاسبي</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="relative">
              <label className="mb-1 block text-sm font-medium text-gray-700">بحث عامل</label>
              <Search className="pointer-events-none absolute right-3 top-[38px] h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="اسم العامل أو الهاتف..."
                className="w-full rounded-lg border border-gray-200 py-2 pr-9 pl-3 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        {isLocked && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">هذا الشهر مقفل. لا يمكن التعديل أو الحذف.</p>
                <p className="mt-1 text-sm">سبب القفل: {lockReason || 'غير محدد'}</p>
                <p className="mt-1 text-sm">أي تعديل يجب أن يتم عبر إشعار تعديل رسمي.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="rounded-xl border border-blue-200 bg-white p-4">
            <p className="text-sm text-blue-600">إجمالي الرواتب</p>
            <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(totals.salary)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-white p-4">
            <p className="text-sm text-red-600">إجمالي الديون المتراكمة</p>
            <p className="mt-1 text-xl font-bold text-red-700">{formatCurrency(totals.deductions)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600">إجمالي المدفوع</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(totals.paid)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">النقد الفعلي المصروف هذا الشهر (دفعات + ديون جديدة، بدون تسويات الدين)</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-white p-4">
            <p className="text-sm text-green-600">المتبقي</p>
            <p className="mt-1 text-xl font-bold text-green-700">{formatCurrency(totals.remaining)}</p>
          </div>
        </div>

        {/* إشعار العمال المعلقين */}
        {suspendedWorkers.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
            <PauseCircle className="h-4 w-4 shrink-0 text-orange-500" />
            <p className="text-sm text-orange-700">
              <span className="font-semibold">{suspendedWorkers.size}</span>{' '}
              {suspendedWorkers.size === 1 ? 'عامل معلَّق دائماً' : 'عمال معلَّقون دائماً'} — رواتبهم مستثناة من الإجماليات في هذا الشهر وجميع الشهور القادمة حتى إلغاء التعليق
            </p>
          </div>
        )}

        {/* جدول عمال نظام القطعة */}
        {pieceworkWorkers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-1 rounded-full bg-indigo-600"></div>
              <h2 className="text-lg font-bold text-gray-900">عمال نظام القطعة</h2>
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                {pieceworkWorkers.length} عامل
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2.5">العامل</th>
                      <th className="px-3 py-2.5">الراتب</th>
                      <th className="px-3 py-2.5">الديون</th>
                      <th className="px-3 py-2.5">إجمالي المدفوع</th>
                      <th className="px-3 py-2.5">المتبقي من الراتب</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pieceworkWorkers.map((worker) => {
                      const row = getMonthRow(worker)
                      const realPaid = getRealPaid(worker.id)
                      const isPayrollWorker = worker.user?.email?.startsWith('payroll.worker.') === true
                      const prevCarryover = previousNegativeByWorker[worker.id] || 0
                      const hasPreviousPositive = (previousRemainingByWorker[worker.id] || 0) > 0.009
                      const displayedRemaining = row.remaining_due - prevCarryover
                      const isSuspended = suspendedWorkers.has(worker.id)
                      const workerDebt = bigDebtsByWorker[worker.id] || 0
                      return (
                        <tr key={worker.id} className={isSuspended ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isSuspended ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{getWorkerName(worker)}</span>
                              {isSuspended && (
                                <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">
                                  معلّق
                                </span>
                              )}
                              {isPayrollWorker && isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteWorker(worker.id)
                                  }}
                                  disabled={!!actionKey}
                                  className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                  title="حذف العامل"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-blue-700">{formatCurrency(row.basic_salary + row.works_total)}</td>
                          <td className="px-3 py-2.5">
                            {workerDebt > 0.009 ? (
                              <p className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                                دين: {formatCurrency(workerDebt)}
                              </p>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-gray-900" title="النقد الفعلي المصروف هذا الشهر: الدفعات النقدية + الديون الجديدة (بدون تسويات الدين)">{formatCurrency(realPaid)}</td>
                          <td className={`px-3 py-2.5 font-semibold ${displayedRemaining < 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {formatCurrency(displayedRemaining)}
                            {hasPreviousPositive && (
                              <p className="text-xs font-normal text-amber-600 mt-0.5">هنالك متبقي من الشهر السابق</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs ' + STATUS_STYLE[row.salary_status]}>
                              {STATUS_LABEL[row.salary_status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openWorkerPanel(worker)}
                                className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-sm"
                                title="لوحة التحكم: الراتب، الدفعات، الديون، سجل العمليات"
                              >
                                <LayoutDashboard className="h-4 w-4" />
                                لوحة التحكم
                              </button>
                              {workerDebt > 0.009 && (
                                <button
                                  onClick={() => openWorkerPanel(worker, 'debts')}
                                  className="group inline-flex items-center justify-center rounded-lg border border-red-300 bg-red-50 p-2 text-red-600 transition-all hover:bg-red-100 hover:shadow-sm"
                                  title="يوجد دين متراكم — إدارة الديون"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenPricingModal(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-pink-200 bg-pink-50 p-2 text-pink-600 transition-all hover:bg-pink-100 hover:shadow-sm"
                                title="تسعير وتقييم الطلبات"
                              >
                                <Tag className="h-4 w-4" />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => toggleSuspendWorker(worker)}
                                  className={`group inline-flex items-center justify-center rounded-lg border p-2 transition-all hover:shadow-sm ${
                                    isSuspended
                                      ? 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'
                                      : 'border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100'
                                  }`}
                                  title={isSuspended ? 'إلغاء التعليق الدائم' : 'تعليق دائم (جميع الشهور القادمة)'}
                                >
                                  {isSuspended ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* جدول عمال الراتب الثابت */}
        {fixedSalaryWorkers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-1 rounded-full bg-emerald-600"></div>
              <h2 className="text-lg font-bold text-gray-900">عمال الراتب الثابت</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {fixedSalaryWorkers.length} عامل
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2.5">العامل</th>
                      <th className="px-3 py-2.5">الراتب</th>
                      <th className="px-3 py-2.5">الديون</th>
                      <th className="px-3 py-2.5">إجمالي المدفوع</th>
                      <th className="px-3 py-2.5">المتبقي من الراتب</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fixedSalaryWorkers.map((worker) => {
                      const row = getMonthRow(worker)
                      const realPaid = getRealPaid(worker.id)
                      const isPayrollWorker = worker.user?.email?.startsWith('payroll.worker.') === true
                      const prevCarryover = previousNegativeByWorker[worker.id] || 0
                      const hasPreviousPositive = (previousRemainingByWorker[worker.id] || 0) > 0.009
                      const displayedRemaining = row.remaining_due - prevCarryover
                      const isSuspended = suspendedWorkers.has(worker.id)
                      const workerDebt = bigDebtsByWorker[worker.id] || 0
                      return (
                        <tr key={worker.id} className={isSuspended ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isSuspended ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{getWorkerName(worker)}</span>
                              {isSuspended && (
                                <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">
                                  معلّق
                                </span>
                              )}
                              {isPayrollWorker && isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteWorker(worker.id)
                                  }}
                                  disabled={!!actionKey}
                                  className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                  title="حذف العامل"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-blue-700">{formatCurrency(row.basic_salary + row.works_total)}</td>
                          <td className="px-3 py-2.5">
                            {workerDebt > 0.009 ? (
                              <p className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                                دين: {formatCurrency(workerDebt)}
                              </p>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-gray-900" title="النقد الفعلي المصروف هذا الشهر: الدفعات النقدية + الديون الجديدة (بدون تسويات الدين)">{formatCurrency(realPaid)}</td>
                          <td className={`px-3 py-2.5 font-semibold ${displayedRemaining < 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {formatCurrency(displayedRemaining)}
                            {hasPreviousPositive && (
                              <p className="text-xs font-normal text-amber-600 mt-0.5">هنالك متبقي من الشهر السابق</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs ' + STATUS_STYLE[row.salary_status]}>
                              {STATUS_LABEL[row.salary_status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openWorkerPanel(worker)}
                                className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-sm"
                                title="لوحة التحكم: الراتب، الدفعات، الديون، سجل العمليات"
                              >
                                <LayoutDashboard className="h-4 w-4" />
                                لوحة التحكم
                              </button>
                              {workerDebt > 0.009 && (
                                <button
                                  onClick={() => openWorkerPanel(worker, 'debts')}
                                  className="group inline-flex items-center justify-center rounded-lg border border-red-300 bg-red-50 p-2 text-red-600 transition-all hover:bg-red-100 hover:shadow-sm"
                                  title="يوجد دين متراكم — إدارة الديون"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => toggleSuspendWorker(worker)}
                                  className={`group inline-flex items-center justify-center rounded-lg border p-2 transition-all hover:shadow-sm ${
                                    isSuspended
                                      ? 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'
                                      : 'border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100'
                                  }`}
                                  title={isSuspended ? 'إلغاء التعليق الدائم' : 'تعليق دائم (جميع الشهور القادمة)'}
                                >
                                  {isSuspended ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
          </>
        )}

        {/* لوحة تحكم العامل الموحدة: الراتب + الدفعات + الديون + سجل العمليات */}
        {selectedWorkerForPanel && (() => {
          const worker = selectedWorkerForPanel
          const row = getMonthRow(worker)
          const salaryForm = salaryForms[worker.id]
          const paymentForm = paymentForms[worker.id]
          const workerDebt = bigDebtsByWorker[worker.id] || 0
          const previousRemaining = previousRemainingByWorker[worker.id] || 0
          const operations = operationsByWorker[worker.id] || []
          const paymentOperations = operations.filter((op) => op.operation_type === 'payment')
          const monthDeductions = operations.filter((op) => op.operation_type === 'deduction')
          const deductionPayForm = deductionPaymentForms[worker.id] || { amount: '', paymentDate: new Date().toISOString().split('T')[0], note: '' }
          const newDeductionForm = newDeductionForms[worker.id] || { amount: '', operationDate: monthEndDate(selectedMonth), note: '' }

          if (!salaryForm || !paymentForm) return null
          const salaryCalculation = calculateSalaryValues(salaryForm)

          // النقد الفعلي المصروف هذا الشهر + إجمالي تسويات الدين المحتسبة في الراتب
          const realPaid = getRealPaid(worker.id)
          const settlementPaid = paymentOperations
            .filter((op) => isDebtSettlementOp(op))
            .reduce((sum, op) => sum + op.amount, 0)

          // سجل موحّد: عمليات الرواتب عبر كل الفترات + دفعات سداد الديون
          const ledgerLoading = allOperationsLoading || deductionPaymentsLoading
          // دفعات التسوية تُستثنى هنا لأن كل تسوية تظهر بسجلها الخاص «سداد دين»
          // (تبقى ظاهرة في تبويب الدفعات بشارة «تسوية دين»)
          const ledgerEntries: LedgerEntry[] = [
            ...allOperationsForWorker
              .filter((op) => !(op.operation_type === 'payment' && isDebtSettlementOp(op)))
              .map((op) => ({ kind: 'operation' as const, createdAt: op.created_at, op })),
            ...deductionPaymentsForWorker.map((payment) => ({ kind: 'debt_payment' as const, createdAt: payment.created_at, payment }))
          ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

          const panelTabs: { key: PanelTab; label: string; icon: typeof DollarSign }[] = [
            { key: 'salary', label: 'الراتب', icon: DollarSign },
            { key: 'payments', label: 'الدفعات', icon: Wallet },
            { key: 'debts', label: 'الديون', icon: AlertTriangle },
            { key: 'log', label: 'سجل العمليات', icon: History }
          ]

          const operationTypeStyles: Record<PayrollOperationType, { border: string; bg: string; iconBg: string; iconText: string; amountText: string; icon: typeof DollarSign }> = {
            salary:    { border: 'border-indigo-200',  bg: 'bg-indigo-50',  iconBg: 'bg-indigo-100',  iconText: 'text-indigo-700',  amountText: 'text-indigo-900',  icon: DollarSign },
            payment:   { border: 'border-emerald-200', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconText: 'text-emerald-700', amountText: 'text-emerald-900', icon: Wallet },
            deduction: { border: 'border-red-200',     bg: 'bg-red-50',     iconBg: 'bg-red-100',     iconText: 'text-red-700',     amountText: 'text-red-900',     icon: AlertTriangle },
            advance:   { border: 'border-amber-200',   bg: 'bg-amber-50',   iconBg: 'bg-amber-100',   iconText: 'text-amber-700',   amountText: 'text-amber-900',   icon: History }
          }

          return (
            <div
              key={worker.id}
              className={embeddedWorkerId ? 'w-full' : 'fixed inset-0 z-50 overflow-y-auto bg-black/50 p-2 sm:p-4'}
              dir="rtl"
              onClick={embeddedWorkerId ? undefined : () => setSelectedWorkerForPanel(null)}
            >
              <div
                className={embeddedWorkerId ? 'w-full' : 'mx-auto my-4 max-w-3xl sm:my-8'}
                onClick={embeddedWorkerId ? undefined : (e) => e.stopPropagation()}
              >
                <div className={`space-y-4 rounded-2xl border border-gray-200 bg-white p-3 sm:p-6 ${embeddedWorkerId ? 'shadow-sm' : 'shadow-2xl'}`}>
                  {/* رأس اللوحة */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-indigo-100 p-2">
                        <LayoutDashboard className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">{embeddedWorkerId ? 'تفاصيل الراتب والعمليات' : 'لوحة تحكم العامل'}</h2>
                        <p className="text-sm text-gray-600">{getWorkerName(worker)} — شهر {selectedMonth}</p>
                      </div>
                    </div>
                    {!embeddedWorkerId && (
                      <button
                        onClick={() => setSelectedWorkerForPanel(null)}
                        className="rounded-lg p-2 hover:bg-gray-100"
                        title="إغلاق"
                      >
                        <X className="h-5 w-5 text-gray-500" />
                      </button>
                    )}
                  </div>

                  {/* ملخص سريع */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                      <p className="text-xs text-blue-700">الراتب الصافي</p>
                      <p className="mt-1 text-base font-bold text-blue-900">{formatCurrency(row.net_due)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                      <p className="text-xs text-emerald-700">المدفوع من الراتب</p>
                      <p className="mt-1 text-base font-bold text-emerald-900">{formatCurrency(row.total_paid)}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                      <p className="text-xs text-amber-700">المتبقي</p>
                      <p className="mt-1 text-base font-bold text-amber-900">{formatCurrency(row.remaining_due)}</p>
                    </div>
                    <div className={`rounded-xl border p-3 text-center ${workerDebt > 0.009 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                      <p className={`text-xs ${workerDebt > 0.009 ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>الدين المتراكم</p>
                      <p className={`mt-1 text-base font-bold ${workerDebt > 0.009 ? 'text-red-900' : 'text-gray-500'}`}>{formatCurrency(workerDebt)}</p>
                    </div>
                  </div>

                  {/* شريط التبويبات */}
                  <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
                    {panelTabs.map((tab) => {
                      const TabIcon = tab.icon
                      const isActive = panelTab === tab.key
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setPanelTab(tab.key)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-all sm:text-sm ${
                            isActive ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <TabIcon className="h-4 w-4" />
                          <span className="hidden sm:inline">{tab.label}</span>
                          <span className="sm:hidden">{tab.key === 'log' ? 'السجل' : tab.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* ===== تبويب الراتب ===== */}
                  {panelTab === 'salary' && (
                    <div className="space-y-4">
                      {previousRemaining > 0.009 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-sm font-semibold text-amber-800">متبقي من الشهر السابق (قسم مستقل)</p>
                          <p className="mt-1 text-lg font-bold text-amber-900">{formatCurrency(previousRemaining)}</p>
                        </div>
                      )}

                      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                          <Save className="h-4 w-4 text-indigo-600" />
                          حساب الراتب الشهري
                        </h3>

                        {!monthRowsByWorker[worker.id] && salaryForm.salaryType === 'fixed' && salaryForm.fixedSalary && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                            <span className="font-semibold">ℹ️ تم تحميل آخر راتب ثابت تلقائيًا:</span> يمكنك تعديله أو تركه كما هو
                          </div>
                        )}
                        {!monthRowsByWorker[worker.id] && salaryForm.salaryType === 'piecework' && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                            عامل قطعة: راتب هذا الشهر يتزامن تلقائياً مع تسعير القطع والمكافآت في قسم متابعة العمال، ويظهر 0 عند عدم وجود مبلغ.
                          </div>
                        )}

                        {/* نوع الراتب */}
                        <div className="flex gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={salaryForm.salaryType === 'fixed'}
                              onChange={() => handleSalaryTypeChange(worker, 'fixed')}
                              className="h-4 w-4 text-indigo-600"
                            />
                            <span className="text-sm text-gray-700">راتب ثابت</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={salaryForm.salaryType === 'piecework'}
                              onChange={() => handleSalaryTypeChange(worker, 'piecework')}
                              className="h-4 w-4 text-indigo-600"
                            />
                            <span className="text-sm text-gray-700">راتب بالقطعة</span>
                          </label>
                        </div>

                        {/* حقول الراتب */}
                        {salaryForm.salaryType === 'fixed' ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="قيمة الراتب الشهري الثابت"
                            value={salaryForm.fixedSalary}
                            onChange={(e) => setSalaryForms((prev) => ({
                              ...prev,
                              [worker.id]: { ...prev[worker.id], fixedSalary: sanitizeNonNegativeInput(e.target.value) }
                            }))}
                            className={'w-full ' + NUMBER_INPUT_CLASS}
                          />
                        ) : (
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-indigo-700">
                              إجمالي تسعير القطع والمكافآت — متزامن تلقائياً
                            </label>
                            <input
                              type="number"
                              value={salaryForm.pieceCount}
                              readOnly
                              aria-readonly="true"
                              className={'w-full cursor-default bg-indigo-50 font-semibold text-indigo-900 ' + NUMBER_INPUT_CLASS}
                            />
                            <p className="mt-1 text-[11px] text-gray-500">
                              يتم تحديثه من قسم متابعة العمال، ولا يحتاج إلى ترحيل يدوي.
                            </p>
                          </div>
                        )}

                        {/* دفعة العمل الإضافي (لكلا النوعين) */}
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">دفعة العمل الإضافي (ر.س) — اختياري</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="مبلغ الأوفر تايم فوق الراتب الشهري"
                            value={salaryForm.overtimeAmount}
                            onChange={(e) => setSalaryForms((prev) => ({
                              ...prev,
                              [worker.id]: { ...prev[worker.id], overtimeAmount: sanitizeNonNegativeInput(e.target.value) }
                            }))}
                            className={'w-full ' + NUMBER_INPUT_CLASS}
                          />
                        </div>

                        {/* تاريخ العملية */}
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">تاريخ العملية</label>
                          <input
                            type="date"
                            value={salaryForm.operationDate}
                            onChange={(e) => setSalaryForms((prev) => ({
                              ...prev,
                              [worker.id]: { ...prev[worker.id], operationDate: e.target.value }
                            }))}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                          <p className="mt-1 text-[11px] text-gray-400">يجب أن يكون التاريخ ضمن شهر الراتب المحدد ({selectedMonth})</p>
                        </div>

                        {/* الملخص */}
                        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm space-y-1">
                          {salaryForm.salaryType === 'piecework' && (
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>إجمالي القطعة:</span>
                              <span>{formatCurrency(salaryCalculation.pieceTotal)}</span>
                            </div>
                          )}
                          {salaryCalculation.overtimeTotal > 0 && (
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>العمل الإضافي:</span>
                              <span>{formatCurrency(salaryCalculation.overtimeTotal)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-gray-700">
                            <span>الصافي المتوقع:</span>
                            <span className="font-bold text-indigo-700">{formatCurrency(salaryCalculation.netAfterDeductions)}</span>
                          </div>
                        </div>

                        {/* زر الحفظ */}
                        <button
                          onClick={() => handleSaveSnapshot(worker)}
                          disabled={!!actionKey || isReadOnly}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" />
                          {actionKey === 'snapshot-' + worker.id ? 'جاري الحفظ...' : 'حفظ واعتماد الراتب'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ===== تبويب الدفعات ===== */}
                  {panelTab === 'payments' && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                          <Wallet className="h-4 w-4 text-emerald-600" />
                          تسجيل دفعة جديدة
                        </h3>

                        {/* ملخص الدفعات */}
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">المتبقي:</span>
                            <span className="font-bold text-emerald-700 text-lg">{formatCurrency(row.remaining_due)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-gray-600 mt-1">
                            <span>عدد الدفعات: {paymentOperations.length}</span>
                            <span>المدفوع من الراتب: {formatCurrency(row.total_paid)}</span>
                          </div>
                          {settlementPaid > 0.009 && (
                            <div className="flex justify-between items-center text-xs text-teal-700 mt-1">
                              <span>منها تسوية ديون (غير نقدية):</span>
                              <span>{formatCurrency(settlementPaid)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 mt-1 border-t border-emerald-200 pt-1">
                            <span>النقد الفعلي المصروف هذا الشهر:</span>
                            <span>{formatCurrency(realPaid)}</span>
                          </div>
                        </div>

                        {/* حقول الدفعة */}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="مبلغ الدفعة"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForms((prev) => ({
                            ...prev,
                            [worker.id]: { ...prev[worker.id], amount: sanitizeNonNegativeInput(e.target.value) }
                          }))}
                          className={'w-full ' + NUMBER_INPUT_CLASS}
                        />
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">تاريخ الدفعة</label>
                          <input
                            type="date"
                            value={paymentForm.operationDate}
                            onChange={(e) => setPaymentForms((prev) => ({
                              ...prev,
                              [worker.id]: { ...prev[worker.id], operationDate: e.target.value }
                            }))}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                          />
                          <p className="mt-1 text-[11px] text-gray-400">يجب أن يكون التاريخ ضمن شهر الراتب المحدد ({selectedMonth})</p>
                        </div>
                        <input
                          type="text"
                          placeholder="ملاحظة (اختياري)"
                          value={paymentForm.note}
                          onChange={(e) => setPaymentForms((prev) => ({
                            ...prev,
                            [worker.id]: { ...prev[worker.id], note: e.target.value }
                          }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        />

                        {/* تنبيه عند الرصيد السالب */}
                        {row.salary_status === 'negative' && (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
                            صافي المستحق سالب — أي دفعة تُسجَّل ستُضاف كدين يُرحَّل للشهر القادم تحت «ديون متراكمة».
                          </div>
                        )}

                        {/* زر تسجيل الدفعة */}
                        <button
                          onClick={() => handleRegisterPayment(worker)}
                          disabled={!!actionKey || isReadOnly}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Wallet className="h-4 w-4" />
                          {actionKey === 'payment-' + worker.id ? 'جاري التسجيل...' : 'تسجيل دفعة'}
                        </button>
                      </div>

                      {/* سجل دفعات هذا الشهر */}
                      {paymentOperations.length > 0 && (
                        <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                          <h4 className="text-sm font-semibold text-gray-700">دفعات هذا الشهر ({paymentOperations.length})</h4>
                          <div className="max-h-[300px] space-y-2 overflow-y-auto">
                            {paymentOperations.map((op) => {
                              const isSettlement = isDebtSettlementOp(op)
                              return (
                                <div
                                  key={op.id}
                                  className={`group flex items-start justify-between gap-3 rounded-lg border p-3 transition-all hover:shadow-sm ${
                                    isSettlement
                                      ? 'border-teal-200 bg-teal-50 hover:border-teal-300'
                                      : 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`rounded-lg p-1.5 ${isSettlement ? 'bg-teal-100' : 'bg-emerald-100'}`}>
                                      <Wallet className={`h-4 w-4 ${isSettlement ? 'text-teal-700' : 'text-emerald-700'}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className={`font-semibold ${isSettlement ? 'text-teal-900' : 'text-emerald-900'}`}>{formatCurrency(op.amount)}</p>
                                        {isSettlement && (
                                          <span className="rounded-full border border-teal-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                                            تسوية دين — غير نقدية
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-xs ${isSettlement ? 'text-teal-700' : 'text-emerald-700'}`}>التاريخ: {formatOperationDay(op.operation_date)}</p>
                                      <p className="text-[11px] text-gray-500">سُجِّلت: {formatRecordedAt(op.created_at)}</p>
                                      {op.note && <p className="text-xs text-gray-600 mt-0.5">📝 {op.note}</p>}
                                    </div>
                                  </div>
                                  {isAdmin && !isLocked && (
                                    <button
                                      onClick={() => handleDeleteOperation(op)}
                                      disabled={!!actionKey}
                                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 opacity-100 transition-all hover:bg-red-100 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                                      title={isSettlement ? 'حذف التسوية (يُعاد المبلغ للدين المتراكم)' : 'حذف الدفعة'}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ===== تبويب الديون ===== */}
                  {panelTab === 'debts' && (
                    <div className="space-y-4">

                  {/* ملخص */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                      <p className="text-xs text-red-700">ديون هذا الشهر</p>
                      <p className="mt-1 text-lg font-bold text-red-900">{formatCurrency(row.deductions_total)}</p>
                    </div>
                    <div className={`rounded-xl border p-3 text-center ${workerDebt > 0.009 ? 'border-red-300 bg-red-100' : 'border-gray-200 bg-gray-50'}`}>
                      <p className={`text-xs ${workerDebt > 0.009 ? 'text-red-700 font-semibold' : 'text-gray-600'}`}>إجمالي الدين المتراكم</p>
                      <p className={`mt-1 text-lg font-bold ${workerDebt > 0.009 ? 'text-red-900' : 'text-gray-500'}`}>{formatCurrency(workerDebt)}</p>
                    </div>
                  </div>

                  {/* تنبيه: منطق الديون والنقد الفعلي */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-0.5">
                    <p>• <span className="font-semibold">الدين الجديد</span> = نقد فعلي خرج من الصندوق → يُحتسب ضمن «إجمالي المدفوع» لهذا الشهر</p>
                    <p>• <span className="font-semibold">تسديد الدين</span> يُحتسب ضمن سداد راتب الشهر (ليكتمل الراتب) لكنه لا يُحتسب نقداً فعلياً</p>
                  </div>

                  {/* قسم إضافة دين جديد */}
                  {!isReadOnly && (
                    <div className="rounded-xl border border-red-200 p-4 space-y-3">
                      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        تسجيل دين جديد
                      </h3>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="مبلغ الدين"
                        value={newDeductionForm.amount}
                        onChange={(e) => setNewDeductionForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], amount: sanitizeNonNegativeInput(e.target.value) }
                        }))}
                        className={'w-full ' + NUMBER_INPUT_CLASS}
                      />
                      <input
                        type="date"
                        value={newDeductionForm.operationDate}
                        onChange={(e) => setNewDeductionForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], operationDate: e.target.value }
                        }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                      />
                      <input
                        type="text"
                        placeholder="سبب الدين (اختياري)"
                        value={newDeductionForm.note}
                        onChange={(e) => setNewDeductionForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], note: e.target.value }
                        }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                      />
                      <button
                        onClick={() => handleAddDeduction(worker)}
                        disabled={!!actionKey}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        {actionKey === 'deduction-' + worker.id ? 'جاري التسجيل...' : 'تسجيل الدين'}
                      </button>
                    </div>
                  )}

                  {/* قسم تسديد دفعة من الدين */}
                  {workerDebt > 0.009 && (
                    <div className="rounded-xl border border-emerald-200 p-4 space-y-3">
                      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                        تسديد دفعة من الدين
                      </h3>
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        الدين المتبقي: <span className="font-bold">{formatCurrency(workerDebt)}</span> — يمكن تسديد جزء أو كامل المبلغ.
                        سيُحتسب التسديد تلقائياً ضمن سداد راتب شهر {selectedMonth} (بحد أقصى المتبقي من الراتب) دون احتسابه نقداً فعلياً.
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="مبلغ السداد"
                        value={deductionPayForm.amount}
                        onChange={(e) => setDeductionPaymentForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], amount: sanitizeNonNegativeInput(e.target.value) }
                        }))}
                        className={'w-full ' + NUMBER_INPUT_CLASS}
                      />
                      <input
                        type="date"
                        value={deductionPayForm.paymentDate}
                        onChange={(e) => setDeductionPaymentForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], paymentDate: e.target.value }
                        }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                      <input
                        type="text"
                        placeholder="ملاحظة (اختياري)"
                        value={deductionPayForm.note}
                        onChange={(e) => setDeductionPaymentForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], note: e.target.value }
                        }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                      <button
                        onClick={() => handlePayDeductionDebt(worker)}
                        disabled={!!actionKey || !isAdmin}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Wallet className="h-4 w-4" />
                        {actionKey === 'deduction-pay-' + worker.id ? 'جاري التسديد...' : 'تسديد الدفعة'}
                      </button>
                    </div>
                  )}

                  {/* سجل ديون هذا الشهر */}
                  {monthDeductions.length > 0 && (
                    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                        <History className="h-4 w-4 text-gray-600" />
                        ديون هذا الشهر ({monthDeductions.length})
                      </h3>
                      <div className="max-h-[200px] space-y-2 overflow-y-auto">
                        {monthDeductions.map((op) => (
                          <div key={op.id} className="group flex items-start justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-red-900">{formatCurrency(op.amount)}</p>
                              <p className="text-xs text-red-700">التاريخ: {formatOperationDay(op.operation_date)}</p>
                              <p className="text-[11px] text-gray-500">سُجِّلت: {formatRecordedAt(op.created_at)}</p>
                              {op.note && <p className="text-xs text-gray-600 mt-0.5">{op.note}</p>}
                            </div>
                            {isAdmin && !isLocked && (
                              <button
                                onClick={() => handleDeleteOperation(op)}
                                disabled={!!actionKey}
                                className="rounded-lg border border-red-200 bg-white p-1.5 text-red-700 opacity-100 transition-all hover:bg-red-100 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                                title="حذف الدين (يُنقص من الدين المتراكم)"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* سجل دفعات الدين */}
                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                      <History className="h-4 w-4 text-gray-600" />
                      سجل دفعات الدين ({deductionPaymentsLoading ? '...' : deductionPaymentsForWorker.length})
                    </h3>
                    {deductionPaymentsLoading ? (
                      <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                        جاري التحميل...
                      </div>
                    ) : deductionPaymentsForWorker.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                        لا توجد دفعات مسجلة
                      </div>
                    ) : (
                      <div className="max-h-[250px] space-y-2 overflow-y-auto">
                        {deductionPaymentsForWorker.map((payment) => (
                          <div key={payment.id} className="group flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold text-emerald-900">{formatCurrency(payment.amount)}</p>
                              <p className="text-xs text-emerald-700">التاريخ: {formatOperationDay(payment.payment_date)}</p>
                              <p className="text-[11px] text-gray-500">سُجِّلت: {formatRecordedAt(payment.created_at)}</p>
                              {payment.note && <p className="text-xs text-gray-600 mt-0.5">{payment.note}</p>}
                            </div>
                            <div className="flex w-full items-start justify-between gap-2 sm:w-auto sm:justify-start">
                              <div className="text-left text-xs text-gray-500">
                                <p>قبل: {formatCurrency(payment.before_amount)}</p>
                                <p>بعد: {formatCurrency(payment.after_amount)}</p>
                              </div>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteDebtPayment(payment)}
                                  disabled={!!actionKey}
                                  className="rounded-lg border border-red-200 bg-white p-1.5 text-red-700 opacity-100 transition-all hover:bg-red-100 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                                  title="حذف سداد الدين (يُعاد المبلغ للدين المتراكم)"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                    </div>
                  )}

                  {/* ===== تبويب سجل العمليات ===== */}
                  {panelTab === 'log' && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        جميع العمليات المسجَّلة على ملف العامل عبر كل الفترات: الرواتب، الدفعات، الديون، وسداد الديون — مرتبة حسب وقت التسجيل الفعلي من الأحدث إلى الأقدم.
                      </div>

                      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                          <History className="h-4 w-4 text-gray-600" />
                          كل العمليات ({ledgerLoading ? '...' : ledgerEntries.length})
                        </h3>

                        {ledgerLoading ? (
                          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                            جاري التحميل...
                          </div>
                        ) : ledgerEntries.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                            لا توجد عمليات مسجلة
                          </div>
                        ) : (
                          <div className="max-h-[440px] space-y-2 overflow-y-auto">
                            {ledgerEntries.map((entry) => {
                              if (entry.kind === 'debt_payment') {
                                const payment = entry.payment
                                return (
                                  <div
                                    key={'debt-payment-' + payment.id}
                                    className="group flex flex-col gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 sm:flex-row sm:items-start sm:justify-between"
                                  >
                                    <div className="flex items-start gap-2">
                                      <div className="rounded-lg bg-teal-100 p-1.5">
                                        <Wallet className="h-4 w-4 text-teal-700" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-full border border-teal-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                                            سداد دين
                                          </span>
                                          <p className="font-semibold text-teal-900">{formatCurrency(payment.amount)}</p>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-600">التاريخ: {formatOperationDay(payment.payment_date)}</p>
                                        <p className="text-[11px] text-gray-500">سُجِّلت: {formatRecordedAt(payment.created_at)}</p>
                                        {payment.note && <p className="mt-0.5 text-xs text-gray-700">📝 {payment.note}</p>}
                                      </div>
                                    </div>
                                    <div className="flex w-full items-start justify-between gap-2 sm:w-auto sm:justify-start">
                                      <div className="text-left text-xs text-gray-500">
                                        <p>قبل: {formatCurrency(payment.before_amount)}</p>
                                        <p>بعد: {formatCurrency(payment.after_amount)}</p>
                                      </div>
                                      {isAdmin && (
                                        <button
                                          onClick={() => handleDeleteDebtPayment(payment)}
                                          disabled={!!actionKey}
                                          className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 opacity-100 transition-all hover:bg-red-100 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                                          title="حذف سداد الدين (يُعاد المبلغ للدين المتراكم)"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              }

                              const op = entry.op
                              const isSettlement = op.operation_type === 'payment' && isDebtSettlementOp(op)
                              const style = operationTypeStyles[op.operation_type] || operationTypeStyles.salary
                              const OpIcon = style.icon
                              // الحذف متاح لجميع أنواع العمليات — القاعدة تتحقق من قفل شهر العملية نفسها
                              const canDelete = isAdmin
                              return (
                                <div
                                  key={op.id}
                                  className={`group flex flex-col gap-3 rounded-lg border ${style.border} ${style.bg} p-3 sm:flex-row sm:items-start sm:justify-between`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`rounded-lg ${style.iconBg} p-1.5`}>
                                      <OpIcon className={`h-4 w-4 ${style.iconText}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border ${style.border} bg-white px-2 py-0.5 text-[11px] font-semibold ${style.iconText}`}>
                                          {isSettlement ? 'دفعة — تسوية دين' : operationTypeLabel(op.operation_type)}
                                        </span>
                                        <p className={`font-semibold ${style.amountText}`}>{formatCurrency(op.amount)}</p>
                                        <span className="text-[11px] text-gray-400">الفترة {op.payroll_month}/{op.payroll_year}</span>
                                      </div>
                                      <p className="mt-1 text-xs text-gray-600">التاريخ: {formatOperationDay(op.operation_date)}</p>
                                      <p className="text-[11px] text-gray-500">سُجِّلت: {formatRecordedAt(op.created_at)}</p>
                                      {op.note && (
                                        <p className="mt-0.5 text-xs text-gray-700">📝 {op.note}</p>
                                      )}
                                      {op.reference && (
                                        <p className="mt-0.5 text-xs text-gray-500">المرجع: {op.reference}</p>
                                      )}
                                    </div>
                                  </div>
                                  {canDelete && (
                                    <button
                                      onClick={() => handleDeleteOperation(op)}
                                      disabled={!!actionKey}
                                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 opacity-100 transition-all hover:bg-red-100 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                                      title="حذف العملية"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

      </div>

      {/* نافذة إضافة عامل جديد */}
      {showNewWorkerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl">
            {/* رأس النافذة */}
            <div className="flex items-center justify-between border-b border-gray-200 p-5">
              <h2 className="text-xl font-bold text-gray-900">إضافة عامل جديد</h2>
              <button
                onClick={() => setShowNewWorkerModal(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* محتوى النافذة */}
            <div className="space-y-4 p-5">
              {/* اسم العامل */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  اسم العامل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newWorkerForm.full_name}
                  onChange={(e) => setNewWorkerForm({ ...newWorkerForm, full_name: e.target.value })}
                  placeholder="مثال: محمد أحمد"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              {/* رقم الهاتف */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={newWorkerForm.phone}
                  onChange={(e) => setNewWorkerForm({ ...newWorkerForm, phone: e.target.value })}
                  placeholder="مثال: +966501234567"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              {/* التخصص */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  التخصص <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newWorkerForm.specialty}
                  onChange={(e) => setNewWorkerForm({ ...newWorkerForm, specialty: e.target.value })}
                  placeholder="مثال: فساتين زفاف، فساتين سهرة، عباءات"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              {/* ملاحظة */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                <p className="font-semibold">ملاحظة:</p>
                <p className="mt-1">سيتم تسجيل العامل محلياً لحساب الراتب فقط (بدون إنشاء حساب دخول)</p>
              </div>
            </div>

            {/* أزرار الإجراءات */}
            <div className="flex gap-3 border-t border-gray-200 p-5">
              <button
                onClick={handleCreateWorker}
                disabled={!!actionKey}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                {actionKey === 'create-worker' ? 'جاري الإضافة...' : 'إضافة العامل'}
              </button>
              <button
                onClick={() => setShowNewWorkerModal(false)}
                disabled={!!actionKey}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* نافذة التسعير والتقييم */}
      {/* ============================================================ */}
      {selectedWorkerForPricing && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-2 sm:p-4"
          dir="rtl"
          onClick={handleClosePricingModal}
        >
          <div
            className="mx-auto my-4 sm:my-8 max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
              {/* رأس النافذة */}
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-pink-100 p-2">
                      <Tag className="h-5 w-5 text-pink-600" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-gray-800">تسعير وتقييم الطلبات</h2>
                      <p className="text-sm text-gray-500">{getWorkerName(selectedWorkerForPricing)} — شهر {selectedMonth}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClosePricingModal}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-300 rounded-full hover:bg-gray-100"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>

              {/* محتوى النافذة */}
              <div className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {pricingOrdersLoading ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    جاري تحميل الطلبات...
                  </div>
                ) : pricingOrders.length === 0 ? (
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 border border-pink-100 text-center">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-800 mb-2">لا توجد طلبات مكتملة في هذا الشهر</h3>
                    <p className="text-gray-600">لا توجد قطع نفّذها هذا العامل خلال شهر {selectedMonth}</p>
                  </div>
                ) : (
                  <>
                    {/* ملخص التسعير */}
                    {(() => {
                      const { pricedCount, totalPriced } = getPricingSummary(pricingForms)
                      return pricingOrders.length > 0 ? (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Tag className="w-5 h-5 text-green-600" />
                              <div>
                                <p className="text-sm font-semibold text-green-800">
                                  {pricedCount} طلب مسعَّر من {pricingOrders.length}
                                </p>
                                <p className="text-xs text-green-600">
                                  الإجمالي: {formatCurrency(totalPriced)}
                                </p>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
                              <RefreshCw className="h-4 w-4" />
                              الراتب متزامن تلقائياً
                            </span>
                          </div>
                        </div>
                      ) : null
                    })()}

                    {/* قائمة الطلبات */}
                    <div className="space-y-4">
                      {pricingOrders.map((order, index) => {
                        const isSelected = selectedOrderForPricing?.id === order.id
                        const formData = pricingForms[order.id] || { orderId: order.id, price: '', notes: '', bonus: '', rating: 0 }
                        const hasPricing = formData.price.trim() !== ''

                        const getStatusInfo = (status: string) => {
                          if (status === 'completed') return { label: 'مكتمل', bgColor: 'bg-green-100', color: 'text-green-700' }
                          if (status === 'delivered') return { label: 'تم التسليم', bgColor: 'bg-blue-100', color: 'text-blue-700' }
                          return { label: status, bgColor: 'bg-gray-100', color: 'text-gray-700' }
                        }
                        const statusInfo = getStatusInfo(order.status)

                        const formatDate = (dateString: string) => {
                          return formatGregorianDate(dateString, 'ar-SA-u-nu-latn', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        }

                        return (
                          <div
                            key={order.id}
                            style={{ animationDelay: `${index * 0.05}s` }}
                            className={`bg-white rounded-xl border transition-all duration-200 ${isSelected
                              ? 'border-pink-400 shadow-md'
                              : hasPricing
                                ? 'border-green-300 hover:border-green-400 hover:shadow-md'
                                : 'border-gray-200 hover:border-pink-300 hover:shadow-md'
                              }`}
                          >
                            {/* بطاقة الطلب - قابلة للنقر */}
                            <div
                              className="p-4 cursor-pointer"
                              onClick={() => handleSelectOrderForPricing(order)}
                            >
                              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h3 className="text-lg font-semibold text-gray-800">
                                          {order.client_name}
                                        </h3>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
                                          {statusInfo.label}
                                        </span>
                                        {hasPricing && (
                                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                                            <Tag className="w-3 h-3" />
                                            {formatCurrency(toNumber(formData.price))}
                                          </span>
                                        )}
                                        {formData.rating > 0 && (
                                          <span className="flex items-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                              <Star
                                                key={i}
                                                className={`w-3 h-3 ${i < formData.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                                              />
                                            ))}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-pink-600 font-medium">{order.description}</p>
                                      <p className="text-xs text-gray-500 mt-1">#{order.order_number || order.id}</p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                      <span>{formatDate(order.created_at)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                                      <span>{formatDate(order.due_date)}</span>
                                    </div>
                                    {order.worker_id && (
                                      <div className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="truncate">{getWorkerName(selectedWorkerForPricing)}</span>
                                      </div>
                                    )}
                                    {order.client_phone && (
                                      <div className="flex items-center gap-1.5">
                                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="truncate">***</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* مؤشر التوسع */}
                                <div className="flex items-center justify-center text-gray-400">
                                  {isSelected ? (
                                    <ChevronLeft className="w-5 h-5 rotate-90" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5 -rotate-90" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* قسم التسعير والتقييم - يظهر عند النقر */}
                            {isSelected && (
                              <div className="border-t border-pink-100 p-4 bg-gradient-to-r from-pink-50/50 to-purple-50/50">

                                {/* ===== صور العمل المكتمل ===== */}
                                {(() => {
                                  const fullOrder = orderFullDetails[order.id]
                                  const imgs = fullOrder?.completed_images
                                  if (!fullOrder) {
                                    return (
                                      <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
                                        <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
                                        جاري تحميل صور العمل...
                                      </div>
                                    )
                                  }
                                  if (!imgs || imgs.length === 0) return null
                                  return (
                                    <div className="mb-5">
                                      <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                                        <Package className="w-3.5 h-3.5 text-pink-500" />
                                        صور العمل المكتمل ({imgs.length})
                                      </p>
                                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {imgs.map((src, imgIdx) => (
                                          <button
                                            key={imgIdx}
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setLightboxImage(src) }}
                                            className="relative aspect-square overflow-hidden rounded-lg border-2 border-pink-200 hover:border-pink-400 transition-all duration-200 hover:shadow-md group focus:outline-none"
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={src}
                                              alt={`صورة العمل ${imgIdx + 1}`}
                                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                              loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                                              <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16zm0 0v.01" />
                                              </svg>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })()}

                                <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                                  <Tag className="w-4 h-4 text-pink-600" />
                                  التسعير والتقييم
                                </h4>
                                <div className="space-y-4">
                                  {/* السعر */}
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                      السعر (ر.س)
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="أدخل السعر"
                                      value={formData.price}
                                      onChange={(e) => {
                                        const updated = { ...formData, price: sanitizeNonNegativeInput(e.target.value) }
                                        handleSavePricingForm(order.id, updated)
                                      }}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                  </div>

                                  {/* الملاحظات */}
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                      الملاحظات
                                    </label>
                                    <textarea
                                      rows={2}
                                      placeholder="أدخل الملاحظات"
                                      value={formData.notes}
                                      onChange={(e) => {
                                        const updated = { ...formData, notes: e.target.value }
                                        handleSavePricingForm(order.id, updated)
                                      }}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100 resize-none"
                                    />
                                  </div>

                                  {/* المكافأة */}
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                      المكافأة (ر.س)
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="أدخل قيمة المكافأة"
                                      value={formData.bonus}
                                      onChange={(e) => {
                                        const updated = { ...formData, bonus: sanitizeNonNegativeInput(e.target.value) }
                                        handleSavePricingForm(order.id, updated)
                                      }}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                  </div>

                                  {/* التقييم */}
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                                      التقييم
                                    </label>
                                    <div className="flex items-center gap-1">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => {
                                            const newRating = formData.rating === i + 1 ? 0 : i + 1
                                            const updated = { ...formData, rating: newRating }
                                            handleSavePricingForm(order.id, updated)
                                          }}
                                          className="transition-transform hover:scale-110 focus:outline-none"
                                          title={`${i + 1} نجوم`}
                                        >
                                          <Star
                                            className={`w-7 h-7 transition-colors ${i < formData.rating
                                              ? 'text-yellow-400 fill-yellow-400'
                                              : 'text-gray-300 hover:text-yellow-300'
                                              }`}
                                          />
                                        </button>
                                      ))}
                                      {formData.rating > 0 && (
                                        <span className="text-xs text-gray-500 mr-2">
                                          {formData.rating} / 5
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* زر الحفظ */}
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => setSelectedOrderForPricing(null)}
                                      className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 transition-colors"
                                    >
                                      <Save className="h-4 w-4" />
                                      حفظ التسعير
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* تذييل النافذة */}
              {!pricingOrdersLoading && pricingOrders.length > 0 && (
                <div className="border-t border-gray-200 p-4 sm:p-5 bg-gray-50 rounded-b-2xl">
                  {(() => {
                    const { pricedCount, totalPriced } = getPricingSummary(pricingForms)
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-800">{pricedCount}</span> طلب مسعَّر
                          {pricedCount > 0 && (
                            <span className="mr-2 text-green-700 font-semibold">
                              — إجمالي: {formatCurrency(totalPriced)}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <span className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
                            <RefreshCw className="h-4 w-4" />
                            مزامنة تلقائية
                          </span>
                          <button
                            onClick={handleClosePricingModal}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            إغلاق
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Lightbox: عرض الصورة بالشاشة الكاملة ===== */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          {/* زر الإغلاق */}
          <button
            className="absolute top-4 left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxImage(null)}
            title="إغلاق"
          >
            <X className="w-6 h-6" />
          </button>
          {/* الصورة */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImage}
            alt="صورة العمل المكتمل"
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
