'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CreditCard,
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
  ArrowRight,
  Tag,
  Star,
  Calendar,
  Clock,
  User,
  Phone,
  Package,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { orderService, type Order } from '@/lib/services/order-service'
import { formatGregorianDate } from '@/lib/date-utils'
import { useAuthStore } from '@/store/authStore'
import { workerService, type WorkerWithUser } from '@/lib/services/worker-service'
import {
  deleteWorkerPayrollOperation,
  getLastSalaryInfoBeforeMonth,
  getWorkerPayrollMonths,
  getWorkerPayrollOperations,
  getWorkerPayrollPeriodLock,
  lockWorkerPayrollPeriod,
  unlockWorkerPayrollPeriod,
  propagateSalaryToFutureMonths,
  registerWorkerPayrollAdjustment,
  registerWorkerPayrollPayment,
  saveWorkerPayrollSnapshot
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
  overtimeHours: string
  advancesTotal: string
  operationDate: string
  reference: string
  note: string
}

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

interface AdvanceFormState {
  amount: string
  operationDate: string
  note: string
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

const PRICING_STORAGE_KEY = 'tailoring-payroll-order-pricing-v1'

function getAllPricingData(): Record<string, OrderPricingData> {
  try {
    const stored = localStorage.getItem(PRICING_STORAGE_KEY)
    if (!stored) return {}
    return JSON.parse(stored)
  } catch {
    return {}
  }
}

function savePricingData(orderId: string, data: OrderPricingData): void {
  try {
    const all = getAllPricingData()
    all[orderId] = data
    localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(all))
  } catch (error) {
    console.error('Failed to save pricing data:', error)
  }
}

function getPricingData(orderId: string): OrderPricingData {
  const all = getAllPricingData()
  return all[orderId] || { orderId, price: '', notes: '', bonus: '', rating: 0 }
}


interface SalaryCalculation {
  fixedSalaryValue: number
  pieceCount: number
  pieceRate: number
  pieceTotal: number
  overtimeHours: number
  overtimeTotal: number
  advancesTotal: number
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

function getWorkerName(worker: WorkerWithUser): string {
  return worker.user?.full_name || worker.user?.email || worker.id
}

function operationTypeLabel(type: PayrollOperationType): string {
  if (type === 'salary') return 'راتب'
  if (type === 'payment') return 'دفعة'
  if (type === 'advance') return 'سلفة'
  return 'خصم'
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
  const overtimeHours = roundMoney(toNumber(form.overtimeHours))
  const overtimeTotal = roundMoney(overtimeHours * OVERTIME_RATE)
  const advancesTotal = roundMoney(toNumber(form.advancesTotal))

  const basicSalaryForSnapshot = form.salaryType === 'fixed' ? fixedSalaryValue : 0
  const worksTotalForSnapshot = form.salaryType === 'fixed'
    ? overtimeTotal
    : roundMoney(pieceTotal + overtimeTotal)
  const grossBeforeDeductions = roundMoney(basicSalaryForSnapshot + worksTotalForSnapshot)
  const netAfterDeductions = roundMoney(grossBeforeDeductions - advancesTotal)

  return {
    fixedSalaryValue,
    pieceCount,
    pieceRate,
    pieceTotal,
    overtimeHours,
    overtimeTotal,
    advancesTotal,
    basicSalaryForSnapshot,
    worksTotalForSnapshot,
    grossBeforeDeductions,
    netAfterDeductions
  }
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function TailoringPayrollDashboard() {
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
  const [selectedWorkerForSalary, setSelectedWorkerForSalary] = useState<WorkerWithUser | null>(null)
  const [selectedWorkerForAdvances, setSelectedWorkerForAdvances] = useState<WorkerWithUser | null>(null)
  const [advanceForms, setAdvanceForms] = useState<Record<string, AdvanceFormState>>({})
  const [newWorkerForm, setNewWorkerForm] = useState<NewWorkerFormState>({
    full_name: '',
    phone: '',
    specialty: ''
  })

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

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const prevMonth = previousMonthValue(selectedMonth)
      const [workerResult, months, operations, lockRow, previousMonths, lastSalaryInfo] = await Promise.all([
        workerService.getAll(),
        getWorkerPayrollMonths(BRANCH, selectedMonth),
        getWorkerPayrollOperations(BRANCH, selectedMonth),
        getWorkerPayrollPeriodLock(BRANCH, selectedMonth),
        getWorkerPayrollMonths(BRANCH, prevMonth),
        getLastSalaryInfoBeforeMonth(BRANCH, selectedMonth)
      ])

      const tailoringWorkers = (workerResult.data || []).filter(
        (worker) => (worker.worker_type === 'tailor' || worker.worker_type === 'workshop_manager') && worker.user?.is_active !== false
      )

      const allWorkers = tailoringWorkers

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
      const previousNegativeMap: Record<string, number> = {}
      previousMonths.forEach((row) => {
        if (row.remaining_due > 0.009) {
          previousRemainingMap[row.worker_id] = row.remaining_due
        } else if (row.remaining_due < -0.009) {
          previousNegativeMap[row.worker_id] = Math.abs(row.remaining_due)
        }
      })

      const defaultDate = monthEndDate(selectedMonth)
      const todayDate = new Date().toISOString().split('T')[0]
      const isPeriodLocked = lockRow?.is_locked === true

      // حفظ تلقائي للراتب الثابت فقط: إذا كان المستخدم أدمن والشهر غير مقفل،
      // نحفظ تلقائياً الراتب للعمال ذوي الراتب الثابت الذين لا يوجد لهم سجل في الشهر الحالي.
      // عمال القطعة لا يُحفظون تلقائياً لأن عدد القطع يتغير كل شهر.
      if (isAdmin && !isPeriodLocked) {
        const workersNeedingAutoSave = allWorkers.filter((worker) => {
          if (monthMap[worker.id]) return false
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

      setWorkers(allWorkers)
      setMonthRowsByWorker(monthMap)
      setOperationsByWorker(operationMap)
      setPreviousRemainingByWorker(previousRemainingMap)
      setPreviousNegativeByWorker(previousNegativeMap)
      setIsLocked(isPeriodLocked)
      setLockReason(lockRow?.lock_reason || '')

      setSalaryForms(() => {
        const next: Record<string, SalaryFormState> = {}
        allWorkers.forEach((worker) => {
          const month = monthMap[worker.id]

          // If no record exists for this month, use the last fixed salary from previous months
          let fixedSalaryValue = 0
          let pieceCountValue = 0
          let pieceRateValue = 0
          let overtimeHoursValue = 0
          let advancesTotalValue = 0
          let salaryType: PayrollSalaryType = 'fixed'

          if (month) {
            // Month record exists - use its values
            fixedSalaryValue = month.fixed_salary_value || month.basic_salary || 0
            pieceCountValue = month.piece_count || 0
            pieceRateValue = month.piece_rate || 0
            overtimeHoursValue = month.overtime_hours || 0
            advancesTotalValue = month.advances_total || 0
            salaryType = month.salary_type === 'piecework' ? 'piecework' : 'fixed'
          } else {
            // لا يوجد سجل لهذا الشهر - نستخدم آخر معلومات راتب معروفة مع الحفاظ على نوع الراتب
            const lastInfo = lastSalaryInfo[worker.id]
            if (lastInfo) {
              salaryType = lastInfo.salary_type
              fixedSalaryValue = lastInfo.fixed_salary_value
              // لعمال القطعة: نُبقي عدد القطع وسعرها من آخر شهر كمرجع
              pieceCountValue = lastInfo.piece_count
              pieceRateValue = lastInfo.piece_rate
            }
          }

          next[worker.id] = {
            salaryType,
            fixedSalary: fixedSalaryValue > 0 ? fixedSalaryValue.toString() : '',
            pieceCount: pieceCountValue > 0 ? pieceCountValue.toString() : '',
            pieceRate: pieceRateValue > 0 ? pieceRateValue.toString() : '',
            overtimeHours: overtimeHoursValue > 0 ? overtimeHoursValue.toString() : '',
            advancesTotal: advancesTotalValue > 0 ? advancesTotalValue.toString() : '',
            operationDate: defaultDate,
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
            operationDate: defaultDate,
            reference: '',
            note: ''
          }
        })
        return next
      })

      setAdvanceForms(() => {
        const next: Record<string, AdvanceFormState> = {}
        allWorkers.forEach((worker) => {
          next[worker.id] = {
            amount: '',
            operationDate: todayDate,
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
  }, [selectedMonth, isAdmin])

  useEffect(() => {
    loadData()
  }, [loadData])

  const getMonthRow = useCallback((worker: WorkerWithUser) => {
    return monthRowsByWorker[worker.id] || buildEmptyMonth(worker, selectedMonth)
  }, [monthRowsByWorker, selectedMonth])

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
  const pieceworkWorkers = useMemo(() => {
    return filteredWorkers.filter((worker) => {
      const row = monthRowsByWorker[worker.id]
      return row?.salary_type === 'piecework'
    })
  }, [filteredWorkers, monthRowsByWorker])

  const fixedSalaryWorkers = useMemo(() => {
    return filteredWorkers.filter((worker) => {
      const row = monthRowsByWorker[worker.id]
      return !row || row.salary_type === 'fixed'
    })
  }, [filteredWorkers, monthRowsByWorker])

  const totals = useMemo(() => {
    return filteredWorkers.reduce(
      (acc, worker) => {
        const row = getMonthRow(worker)
        acc.salary += row.basic_salary + row.works_total
        acc.deductions += row.deductions_total + row.advances_total
        acc.paid += row.total_paid
        acc.remaining += row.remaining_due
        return acc
      },
      { salary: 0, deductions: 0, paid: 0, remaining: 0 }
    )
  }, [filteredWorkers, getMonthRow])

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
        salary.overtimeHours,
        salary.advancesTotal
      ].some((v) => v < 0)
    ) {
      alert('لا يمكن إدخال قيم سالبة في مكونات الراتب')
      return
    }

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
        overtimeHours: salary.overtimeHours,
        overtimeRate: OVERTIME_RATE,
        allowancesTotal: 0,
        deductionsTotal: 0,
        advancesTotal: salary.advancesTotal,
        operationDate: form.operationDate,
        reference: form.reference || undefined,
        note: form.note || undefined
      })

      // نُحدّث جميع الأشهر المستقبلية غير المقفلة بنوع الراتب والقيمة الجديدة
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
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, salaryForms, selectedMonth, loadData])

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
        overtimeHours: salary.overtimeHours,
        overtimeRate: OVERTIME_RATE,
        allowancesTotal: 0,
        deductionsTotal: 0,
        advancesTotal: salary.advancesTotal,
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
  }, [isAdmin, isLocked, salaryForms, selectedMonth, loadData])

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
    const row = getMonthRow(worker)
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
  }, [getMonthRow, isAdmin, isLocked, loadData, paymentForms, selectedMonth])

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

  const handleDeleteOperation = useCallback(async (operationId: string, operationType: string) => {
    if (!isAdmin) {
      alert('حذف العمليات مسموح للأدمن فقط.')
      return
    }

    if (isLocked) {
      alert('الشهر مقفل. لا يمكن حذف العمليات.')
      return
    }

    const operationTypeAr = operationType === 'payment' ? 'الدفعة' : operationType === 'advance' ? 'السلفة' : operationType === 'salary' ? 'عملية الراتب' : 'العملية'
    if (!confirm(`هل أنت متأكد من حذف ${operationTypeAr}؟`)) {
      return
    }

    setActionKey(`delete-operation-${operationId}`)
    try {
      await deleteWorkerPayrollOperation(operationId)
      alert('تم حذف العملية بنجاح')
      await loadData(true)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, loadData])

  const handleRegisterAdvance = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. لا يمكن تسجيل سلفة.')
      return
    }
    if (!isAdmin) {
      alert('تسجيل السُّلَف مسموح للأدمن فقط.')
      return
    }

    const form = advanceForms[worker.id]
    if (!form) return

    const amount = toNumber(form.amount)
    if (amount <= 0) {
      alert('يرجى إدخال مبلغ سلفة صحيح')
      return
    }

    setActionKey(`advance-${worker.id}`)
    try {
      await registerWorkerPayrollAdjustment({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        operationType: 'advance',
        operationDate: form.operationDate,
        amount,
        note: form.note || undefined
      })
      // إعادة تعيين النموذج
      setAdvanceForms((prev) => ({
        ...prev,
        [worker.id]: { ...prev[worker.id], amount: '', note: '' }
      }))
      await loadData(true)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, advanceForms, selectedMonth, loadData])

  // ============================================================================
  // معالجات التسعير والتقييم
  // ============================================================================

  const handleOpenPricingModal = useCallback(async (worker: WorkerWithUser) => {
    setSelectedWorkerForPricing(worker)
    setSelectedOrderForPricing(null)
    setPricingOrdersLoading(true)
    try {
      const result = await orderService.getAll({
        status: 'completed',
        worker_id: worker.id,
        pageSize: 200
      })
      const orders = result.data || []
      setPricingOrders(orders)
      // تحميل بيانات التسعير المحفوظة
      const forms: Record<string, OrderPricingData> = {}
      orders.forEach((order) => {
        forms[order.id] = getPricingData(order.id)
      })
      setPricingForms(forms)
    } catch (error) {
      console.error('Failed to load orders for pricing:', error)
    } finally {
      setPricingOrdersLoading(false)
    }
  }, [])

  const handleClosePricingModal = useCallback(() => {
    setSelectedWorkerForPricing(null)
    setPricingOrders([])
    setSelectedOrderForPricing(null)
    setPricingForms({})
    setOrderFullDetails({})
    setLightboxImage(null)
  }, [])

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
    savePricingData(orderId, data)
    setPricingForms((prev) => ({ ...prev, [orderId]: data }))
  }, [])

  const handleApplyPricingToSalary = useCallback((worker: WorkerWithUser) => {
    const pricedOrders = Object.values(pricingForms).filter(
      (f) => f.price && toNumber(f.price) > 0
    )
    const pieceCount = pricedOrders.length
    const totalPrice = pricedOrders.reduce((sum, f) => sum + toNumber(f.price), 0)

    setSalaryForms((prev) => ({
      ...prev,
      [worker.id]: {
        ...prev[worker.id],
        salaryType: 'piecework',
        pieceCount: pieceCount > 0 ? pieceCount.toString() : '',
        pieceRate: pieceCount > 0 ? (totalPrice / pieceCount).toFixed(2) : ''
      }
    }))

    handleClosePricingModal()
    setSelectedWorkerForSalary(worker)
  }, [pricingForms, handleClosePricingModal])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
        <div className="mx-auto max-w-7xl rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">
          جاري تحميل نظام الرواتب...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
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
                  نظام شهري مترابط: الراتب، الدفعات، السلف، الخصومات، والقيود المحاسبية.
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

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-blue-200 bg-white p-4">
            <p className="text-sm text-blue-600">إجمالي الرواتب</p>
            <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(totals.salary)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-white p-4">
            <p className="text-sm text-red-600">إجمالي الخصومات</p>
            <p className="mt-1 text-xl font-bold text-red-700">{formatCurrency(totals.deductions)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600">إجمالي المدفوع</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(totals.paid)}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-white p-4">
            <p className="text-sm text-green-600">المتبقي</p>
            <p className="mt-1 text-xl font-bold text-green-700">{formatCurrency(totals.remaining)}</p>
          </div>
        </div>

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
                      <th className="px-3 py-2.5">إجمالي الخصومات</th>
                      <th className="px-3 py-2.5">إجمالي المدفوع</th>
                      <th className="px-3 py-2.5">المتبقي</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pieceworkWorkers.map((worker) => {
                      const row = getMonthRow(worker)
                      const isPayrollWorker = worker.user?.email?.startsWith('payroll.worker.') === true
                      const prevCarryover = previousNegativeByWorker[worker.id] || 0
                      const hasPreviousPositive = (previousRemainingByWorker[worker.id] || 0) > 0.009
                      const displayedRemaining = row.remaining_due - prevCarryover
                      return (
                        <tr key={worker.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{getWorkerName(worker)}</span>
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
                          <td className="px-3 py-2.5 font-semibold text-red-700">
                            {formatCurrency(row.deductions_total + row.advances_total + prevCarryover)}
                            {prevCarryover > 0.009 && (
                              <p className="text-xs font-normal text-orange-600 mt-0.5">خصومات متراكمة</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-gray-900">{formatCurrency(row.total_paid)}</td>
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
                                onClick={() => setSelectedWorkerForAdvances(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-600 transition-all hover:bg-amber-100 hover:shadow-sm"
                                title="إدارة السُّلَف"
                              >
                                <CreditCard className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelectedWorkerForSalary(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-sm"
                                title="فئة الراتب الشهري"
                              >
                                <DollarSign className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleOpenPricingModal(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-pink-200 bg-pink-50 p-2 text-pink-600 transition-all hover:bg-pink-100 hover:shadow-sm"
                                title="تسعير وتقييم الطلبات"
                              >
                                <Tag className="h-4 w-4" />
                              </button>
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
                      <th className="px-3 py-2.5">إجمالي الخصومات</th>
                      <th className="px-3 py-2.5">إجمالي المدفوع</th>
                      <th className="px-3 py-2.5">المتبقي</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fixedSalaryWorkers.map((worker) => {
                      const row = getMonthRow(worker)
                      const isPayrollWorker = worker.user?.email?.startsWith('payroll.worker.') === true
                      const prevCarryover = previousNegativeByWorker[worker.id] || 0
                      const hasPreviousPositive = (previousRemainingByWorker[worker.id] || 0) > 0.009
                      const displayedRemaining = row.remaining_due - prevCarryover
                      return (
                        <tr key={worker.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{getWorkerName(worker)}</span>
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
                          <td className="px-3 py-2.5 font-semibold text-red-700">
                            {formatCurrency(row.deductions_total + row.advances_total + prevCarryover)}
                            {prevCarryover > 0.009 && (
                              <p className="text-xs font-normal text-orange-600 mt-0.5">خصومات متراكمة</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-gray-900">{formatCurrency(row.total_paid)}</td>
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
                                onClick={() => setSelectedWorkerForAdvances(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-600 transition-all hover:bg-amber-100 hover:shadow-sm"
                                title="إدارة السُّلَف"
                              >
                                <CreditCard className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelectedWorkerForSalary(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-sm"
                                title="فئة الراتب الشهري"
                              >
                                <DollarSign className="h-4 w-4" />
                              </button>
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

        {/* نافذة إدارة السُّلَف */}
        {selectedWorkerForAdvances && (() => {
          const worker = selectedWorkerForAdvances
          const row = getMonthRow(worker)
          const advanceForm = advanceForms[worker.id]
          const operations = operationsByWorker[worker.id] || []
          const advanceOperations = operations.filter((op) => op.operation_type === 'advance')
          const totalAdvances = advanceOperations.reduce((sum, op) => sum + op.amount, 0)

          if (!advanceForm) return null

          return (
            <div key={worker.id} className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" dir="rtl" onClick={() => setSelectedWorkerForAdvances(null)}>
              <div className="mx-auto my-8 max-w-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                  {/* رأس النافذة */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-amber-100 p-2">
                        <CreditCard className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">إدارة السُّلَف</h2>
                        <p className="text-sm text-gray-600">{getWorkerName(worker)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedWorkerForAdvances(null)}
                      className="rounded-lg p-2 hover:bg-gray-100"
                      title="إغلاق"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  {/* ملخص السُّلَف */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                      <p className="text-xs text-amber-700">إجمالي السُّلَف</p>
                      <p className="mt-1 text-lg font-bold text-amber-900">{formatCurrency(totalAdvances)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                      <p className="text-xs text-gray-600">صافي الراتب المستحق</p>
                      <p className="mt-1 text-lg font-bold text-gray-900">{formatCurrency(row.net_due)}</p>
                    </div>
                  </div>

                  {/* نموذج إضافة سلفة جديدة */}
                  {!isReadOnly && (
                    <div className="rounded-xl border border-amber-200 p-4 space-y-3">
                      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                        <CreditCard className="h-4 w-4 text-amber-600" />
                        تسجيل سلفة جديدة
                      </h3>

                      <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        السلفة تُخصم تلقائيًا من صافي الراتب عند حفظ الراتب الشهري
                      </div>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="مبلغ السلفة"
                        value={advanceForm.amount}
                        onChange={(e) => setAdvanceForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], amount: sanitizeNonNegativeInput(e.target.value) }
                        }))}
                        className={'w-full ' + NUMBER_INPUT_CLASS}
                      />

                      <input
                        type="date"
                        value={advanceForm.operationDate}
                        onChange={(e) => setAdvanceForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], operationDate: e.target.value }
                        }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                      />

                      <input
                        type="text"
                        placeholder="ملاحظة (اختياري)"
                        value={advanceForm.note}
                        onChange={(e) => setAdvanceForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], note: e.target.value }
                        }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                      />

                      <button
                        onClick={() => handleRegisterAdvance(worker)}
                        disabled={!!actionKey}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        <CreditCard className="h-4 w-4" />
                        {actionKey === 'advance-' + worker.id ? 'جاري التسجيل...' : 'تسجيل السلفة'}
                      </button>
                    </div>
                  )}

                  {/* سجل السُّلَف */}
                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                      <History className="h-4 w-4 text-gray-600" />
                      سجل السُّلَف ({advanceOperations.length})
                    </h3>

                    {advanceOperations.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                        لا توجد سُلَف مسجلة لهذا الشهر
                      </div>
                    ) : (
                      <div className="max-h-[350px] space-y-2 overflow-y-auto">
                        {advanceOperations.map((op) => (
                          <div
                            key={op.id}
                            className="group flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 transition-all hover:border-amber-300 hover:shadow-sm"
                          >
                            <div className="flex items-start gap-2">
                              <div className="rounded-lg bg-amber-100 p-1.5">
                                <CreditCard className="h-4 w-4 text-amber-700" />
                              </div>
                              <div>
                                <p className="font-semibold text-amber-900">{formatCurrency(op.amount)}</p>
                                <p className="text-xs text-amber-700">
                                  {new Date(op.operation_date).toLocaleDateString('ar-SA-u-nu-latn', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </p>
                                {op.note && (
                                  <p className="text-xs text-gray-600 mt-0.5">{op.note}</p>
                                )}
                              </div>
                            </div>
                            {isAdmin && !isLocked && (
                              <button
                                onClick={() => handleDeleteOperation(op.id, 'advance')}
                                disabled={!!actionKey}
                                className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 opacity-0 transition-all hover:bg-red-100 group-hover:opacity-100 disabled:opacity-60"
                                title="حذف السلفة"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* نافذة فئة الراتب الشهري */}
        {selectedWorkerForSalary && (() => {
          const worker = selectedWorkerForSalary
          const row = getMonthRow(worker)
          const salaryForm = salaryForms[worker.id]
          const paymentForm = paymentForms[worker.id]
          const previousRemaining = previousRemainingByWorker[worker.id] || 0
          const operations = operationsByWorker[worker.id] || []
          const paymentOperations = operations.filter((op) => op.operation_type === 'payment')
          const salaryOperations = operations.filter((op) => op.operation_type === 'salary')
          const totalPayments = paymentOperations.reduce((sum, op) => sum + op.amount, 0)

          if (!salaryForm || !paymentForm) return null
          const salaryCalculation = calculateSalaryValues(salaryForm)

          return (
            <div key={worker.id} className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" dir="rtl" onClick={() => setSelectedWorkerForSalary(null)}>
              <div className="mx-auto my-8 max-w-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                  {/* رأس النافذة */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-indigo-100 p-2">
                        <DollarSign className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">فئة الراتب الشهري</h2>
                        <p className="text-sm text-gray-600">{getWorkerName(worker)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedWorkerForSalary(null)}
                      className="rounded-lg p-2 hover:bg-gray-100"
                      title="إغلاق"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

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

                    {/* ملاحظة: تم تحميل آخر راتب ثابت */}
                    {!monthRowsByWorker[worker.id] && salaryForm.fixedSalary && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        <span className="font-semibold">ℹ️ تم تحميل آخر راتب ثابت تلقائيًا:</span> يمكنك تعديله أو تركه كما هو
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="عدد القطع"
                        value={salaryForm.pieceCount}
                        onChange={(e) => setSalaryForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], pieceCount: sanitizeNonNegativeInput(e.target.value) }
                        }))}
                        className={'w-full ' + NUMBER_INPUT_CLASS}
                      />
                    )}

                    {/* ساعات إضافية - تظهر فقط للراتب الثابت */}
                    {salaryForm.salaryType === 'fixed' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="ساعات إضافية"
                          value={salaryForm.overtimeHours}
                          onChange={(e) => setSalaryForms((prev) => ({
                            ...prev,
                            [worker.id]: { ...prev[worker.id], overtimeHours: sanitizeNonNegativeInput(e.target.value) }
                          }))}
                          className={NUMBER_INPUT_CLASS}
                        />
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 flex items-center">
                          قيمة الإضافي: {formatCurrency(salaryCalculation.overtimeTotal)}
                        </div>
                      </div>
                    )}

                    {/* الملخص */}
                    <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm space-y-1">
                      <div className="flex justify-between text-gray-700">
                        <span>الصافي المتوقع:</span>
                        <span className="font-bold text-indigo-700">{formatCurrency(salaryCalculation.netAfterDeductions)}</span>
                      </div>
                      {salaryForm.salaryType === 'piecework' && (
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>إجمالي القطعة:</span>
                          <span>{formatCurrency(salaryCalculation.pieceTotal)}</span>
                        </div>
                      )}
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

                  <div id={'payments-table-' + worker.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
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
                        <span>المدفوع: {formatCurrency(totalPayments)}</span>
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

                    {/* زر تسجيل الدفعة */}
                    <button
                      onClick={() => handleRegisterPayment(worker)}
                      disabled={!!actionKey || row.salary_status === 'negative' || isReadOnly}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Wallet className="h-4 w-4" />
                      {actionKey === 'payment-' + worker.id ? 'جاري التسجيل...' : 'تسجيل دفعة'}
                    </button>

                    {/* سجل الدفعات */}
                    {paymentOperations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700">سجل الدفعات</h4>
                        <div className="max-h-[300px] space-y-2 overflow-y-auto">
                          {paymentOperations.map((op) => (
                            <div
                              key={op.id}
                              className="group flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 transition-all hover:border-emerald-300 hover:shadow-sm"
                            >
                              <div className="flex items-start gap-2">
                                <div className="rounded-lg bg-emerald-100 p-1.5">
                                  <Wallet className="h-4 w-4 text-emerald-700" />
                                </div>
                                <div>
                                  <p className="font-semibold text-emerald-900">{formatCurrency(op.amount)}</p>
                                  <p className="text-xs text-emerald-700">
                                    {new Date(op.operation_date).toLocaleDateString('ar-SA-u-nu-latn', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </p>
                                  {op.reference && (
                                    <p className="text-xs text-gray-600">
                                      المرجع: {op.reference}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {isAdmin && !isLocked && (
                                <button
                                  onClick={() => handleDeleteOperation(op.id, 'payment')}
                                  disabled={!!actionKey}
                                  className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 opacity-0 transition-all hover:bg-red-100 group-hover:opacity-100 disabled:opacity-60"
                                  title="حذف الدفعة"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* سجل عمليات الراتب */}
                  {salaryOperations.length > 0 && (
                    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                        <History className="h-4 w-4 text-gray-600" />
                        سجل عمليات الراتب ({salaryOperations.length})
                      </h3>
                      <div className="max-h-[300px] space-y-2 overflow-y-auto">
                        {salaryOperations.map((op) => (
                          <div
                            key={op.id}
                            className="group flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 p-3 transition-all hover:border-indigo-300 hover:shadow-sm"
                          >
                            <div className="flex items-start gap-2">
                              <div className="rounded-lg bg-indigo-100 p-1.5">
                                <DollarSign className="h-4 w-4 text-indigo-700" />
                              </div>
                              <div>
                                <p className="font-semibold text-indigo-900">{formatCurrency(op.amount)}</p>
                                <p className="text-xs text-indigo-700">
                                  {new Date(op.operation_date).toLocaleDateString('ar-SA-u-nu-latn', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </p>
                                {op.reference && (
                                  <p className="text-xs text-gray-600">
                                    المرجع: {op.reference}
                                  </p>
                                )}
                              </div>
                            </div>
                            {isAdmin && !isLocked && (
                              <button
                                onClick={() => handleDeleteOperation(op.id, 'salary')}
                                disabled={!!actionKey}
                                className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 opacity-0 transition-all hover:bg-red-100 group-hover:opacity-100 disabled:opacity-60"
                                title="حذف عملية الراتب"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
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
                      <p className="text-sm text-gray-500">{getWorkerName(selectedWorkerForPricing)}</p>
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
                    <h3 className="text-xl font-bold text-gray-800 mb-2">لا توجد طلبات مكتملة</h3>
                    <p className="text-gray-600">لا توجد طلبات مكتملة لهذا العامل حتى الآن</p>
                  </div>
                ) : (
                  <>
                    {/* ملخص التسعير */}
                    {(() => {
                      const pricedCount = Object.values(pricingForms).filter(f => toNumber(f.price) > 0).length
                      const totalPriced = Object.values(pricingForms).reduce((s, f) => s + toNumber(f.price), 0)
                      return pricedCount > 0 ? (
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
                            <button
                              onClick={() => handleApplyPricingToSalary(selectedWorkerForPricing)}
                              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                            >
                              <DollarSign className="h-4 w-4" />
                              ترحيل إلى الراتب الشهري
                            </button>
                          </div>
                        </div>
                      ) : null
                    })()}

                    {/* قائمة الطلبات */}
                    <div className="space-y-4">
                      {pricingOrders.map((order, index) => {
                        const isSelected = selectedOrderForPricing?.id === order.id
                        const formData = pricingForms[order.id] || { orderId: order.id, price: '', notes: '', bonus: '', rating: 0 }
                        const hasPricing = toNumber(formData.price) > 0

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
                    const pricedCount = Object.values(pricingForms).filter(f => toNumber(f.price) > 0).length
                    const totalPriced = Object.values(pricingForms).reduce((s, f) => s + toNumber(f.price), 0)
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
                          {pricedCount > 0 && (
                            <button
                              onClick={() => handleApplyPricingToSalary(selectedWorkerForPricing)}
                              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                            >
                              <DollarSign className="h-4 w-4" />
                              ترحيل إلى الراتب الشهري
                            </button>
                          )}
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
