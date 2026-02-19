'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  Lock,
  RefreshCw,
  Save,
  Search,
  Wallet,
  UserPlus,
  X,
  Trash2,
  DollarSign,
  Scissors,
  History
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { workerService, type WorkerWithUser } from '@/lib/services/worker-service'
import {
  createWorkerPayrollAdjustmentRequest,
  getWorkerPayrollMonths,
  getWorkerPayrollOperations,
  getWorkerPayrollPeriodLock,
  lockWorkerPayrollPeriod,
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
const LOCAL_WORKERS_STORAGE_KEY = 'tailoring-payroll-local-workers-v1'

// دوال للعمال المحليين
function getLocalWorkers(): LocalWorker[] {
  try {
    const stored = localStorage.getItem(LOCAL_WORKERS_STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error('Failed to load local workers:', error)
    return []
  }
}

function saveLocalWorkers(workers: LocalWorker[]): void {
  try {
    localStorage.setItem(LOCAL_WORKERS_STORAGE_KEY, JSON.stringify(workers))
  } catch (error) {
    console.error('Failed to save local workers:', error)
  }
}

function createLocalWorker(data: { full_name: string; phone: string; specialty: string }): LocalWorker {
  const now = new Date().toISOString()
  const id = `local-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  return {
    id,
    user_id: id,
    specialty: data.specialty,
    worker_type: 'tailor',
    experience_years: 0,
    hourly_rate: 0,
    performance_rating: 0,
    total_completed_orders: 0,
    skills: [],
    availability: {},
    bio: '',
    portfolio_images: [],
    is_available: true,
    created_at: now,
    updated_at: now,
    is_local: true,
    user: {
      id,
      email: '',
      full_name: data.full_name,
      phone: data.phone || undefined,
      role: 'worker',
      is_active: true,
      created_at: now,
      updated_at: now
    }
  }
}

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

interface LocalWorker {
  id: string
  user_id: string
  specialty: string
  worker_type: 'tailor'
  experience_years: number
  hourly_rate: number
  performance_rating: number
  total_completed_orders: number
  skills: string[]
  availability: Record<string, string>
  bio: string
  portfolio_images: string[]
  is_available: boolean
  created_at: string
  updated_at: string
  is_local: true
  user: {
    id: string
    email: string
    full_name: string
    phone?: string
    role: 'worker'
    is_active: boolean
    created_at: string
    updated_at: string
  }
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
  return `${new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [monthRowsByWorker, setMonthRowsByWorker] = useState<Record<string, WorkerPayrollMonth>>({})
  const [operationsByWorker, setOperationsByWorker] = useState<Record<string, WorkerPayrollOperation[]>>({})
  const [previousRemainingByWorker, setPreviousRemainingByWorker] = useState<Record<string, number>>({})
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthValue(new Date()))
  const [searchTerm, setSearchTerm] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [lockReason, setLockReason] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [salaryForms, setSalaryForms] = useState<Record<string, SalaryFormState>>({})
  const [paymentForms, setPaymentForms] = useState<Record<string, PaymentFormState>>({})
  const [showPaymentsByWorker, setShowPaymentsByWorker] = useState<Record<string, boolean>>({})
  const [showNewWorkerModal, setShowNewWorkerModal] = useState(false)
  const [selectedWorkerForDeductions, setSelectedWorkerForDeductions] = useState<WorkerWithUser | null>(null)
  const [selectedWorkerForSalary, setSelectedWorkerForSalary] = useState<WorkerWithUser | null>(null)
  const [selectedWorkerForOperations, setSelectedWorkerForOperations] = useState<WorkerWithUser | null>(null)
  const [newWorkerForm, setNewWorkerForm] = useState<NewWorkerFormState>({
    full_name: '',
    phone: '',
    specialty: ''
  })

  const isReadOnly = isLocked || !isAdmin

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const prevMonth = previousMonthValue(selectedMonth)
      const [workerResult, months, operations, lockRow, previousMonths] = await Promise.all([
        workerService.getAll(),
        getWorkerPayrollMonths(BRANCH, selectedMonth),
        getWorkerPayrollOperations(BRANCH, selectedMonth),
        getWorkerPayrollPeriodLock(BRANCH, selectedMonth),
        getWorkerPayrollMonths(BRANCH, prevMonth)
      ])

      const tailoringWorkers = (workerResult.data || []).filter(
        (worker) => worker.worker_type === 'tailor' && worker.user?.is_active !== false
      )

      // دمج العمال المحليين
      const localWorkers = getLocalWorkers()
      const allWorkers = [...tailoringWorkers, ...localWorkers] as WorkerWithUser[]

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
      previousMonths.forEach((row) => {
        if (row.remaining_due > 0.009) {
          previousRemainingMap[row.worker_id] = row.remaining_due
        }
      })

      setWorkers(allWorkers)
      setMonthRowsByWorker(monthMap)
      setOperationsByWorker(operationMap)
      setPreviousRemainingByWorker(previousRemainingMap)
      setIsLocked(lockRow?.is_locked === true)
      setLockReason(lockRow?.lock_reason || '')

      const defaultDate = monthEndDate(selectedMonth)

      setSalaryForms(() => {
        const next: Record<string, SalaryFormState> = {}
        allWorkers.forEach((worker) => {
          const month = monthMap[worker.id] || buildEmptyMonth(worker, selectedMonth)
          next[worker.id] = {
            salaryType: month.salary_type === 'piecework' ? 'piecework' : 'fixed',
            fixedSalary: (month.fixed_salary_value || month.basic_salary || 0).toString(),
            pieceCount: (month.piece_count || 0).toString(),
            pieceRate: (month.piece_rate || 0).toString(),
            overtimeHours: (month.overtime_hours || 0).toString(),
            advancesTotal: month.advances_total.toString(),
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
    } catch (error) {
      console.error('Failed loading payroll dashboard:', error)
      alert('فشل تحميل بيانات الرواتب')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedMonth])

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
        acc.deductions += row.deductions_total + row.advances_total
        acc.paid += row.total_paid
        acc.remaining += row.remaining_due
        return acc
      },
      { deductions: 0, paid: 0, remaining: 0 }
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
      await loadData(true)
    } catch (error) {
      alert(toReadableError(error))
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

    if (row.net_due < 0) {
      alert('لا يمكن الدفع، صافي المستحق بالسالب')
      return
    }

    const amount = toNumber(form.amount)
    if (amount <= 0) {
      alert('يرجى إدخال مبلغ صحيح')
      return
    }

    if (amount > row.remaining_due + 0.009) {
      alert('لا يمكن أن تتجاوز الدفعة صافي المستحق')
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

  const handleOpenPaymentsTable = useCallback((workerId: string) => {
    setShowPaymentsByWorker((prev) => ({ ...prev, [workerId]: true }))
    const table = document.getElementById(`payments-table-${workerId}`)
    if (table) {
      table.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleSaveSmallAdvance = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. التعديل متاح فقط عبر إشعار تعديل رسمي.')
      return
    }

    if (!isAdmin) {
      alert('حفظ السلفة مسموح للأدمن فقط.')
      return
    }

    const form = salaryForms[worker.id]
    if (!form) return

    const salary = calculateSalaryValues(form)

    if (salary.advancesTotal < 0) {
      alert('لا يمكن إدخال قيمة سلفة سالبة')
      return
    }

    setActionKey(`save-advance-${worker.id}`)
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
      await loadData(true)
      setSelectedWorkerForDeductions(null)
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [isAdmin, isLocked, salaryForms, selectedMonth, loadData])

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

  const handleAdjustmentRequest = useCallback(async (worker: WorkerWithUser) => {
    const reason = prompt('سبب طلب التعديل الرسمي:')
    if (!reason) return

    setActionKey(`request-${worker.id}`)
    try {
      await createWorkerPayrollAdjustmentRequest({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        reason
      })
      alert('تم إنشاء إشعار التعديل الرسمي بنجاح')
    } catch (error) {
      alert(toReadableError(error))
    } finally {
      setActionKey(null)
    }
  }, [selectedMonth])

  const handleDeleteLocalWorker = useCallback(async (workerId: string) => {
    if (!isAdmin) {
      alert('حذف العامل المحلي مسموح للأدمن فقط.')
      return
    }

    if (!confirm('هل أنت متأكد من حذف هذا العامل المحلي؟')) {
      return
    }

    setActionKey(`delete-worker-${workerId}`)
    try {
      const existingWorkers = getLocalWorkers()
      const updatedWorkers = existingWorkers.filter(w => w.id !== workerId)
      saveLocalWorkers(updatedWorkers)

      alert('تم حذف العامل المحلي بنجاح')
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
      // إنشاء عامل محلي
      const newLocalWorker = createLocalWorker({
        full_name: newWorkerForm.full_name.trim(),
        phone: newWorkerForm.phone.trim(),
        specialty: newWorkerForm.specialty.trim()
      })

      // حفظ في localStorage
      const existingWorkers = getLocalWorkers()
      saveLocalWorkers([...existingWorkers, newLocalWorker])

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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">رواتب العمال - قسم التفصيل</h1>
              <p className="mt-1 text-sm text-gray-500">
                نظام شهري مترابط: الراتب، الدفعات، السلف، الخصومات، والقيود المحاسبية.
              </p>
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
              <button
                onClick={handleLockMonth}
                disabled={isLocked || actionKey === 'lock-month' || !isAdmin}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <Lock className="h-4 w-4" />
                {isLocked ? 'الشهر مقفل' : 'قفل الشهر'}
              </button>
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

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="إجمالي الخصومات" value={formatCurrency(totals.deductions)} />
          <StatCard title="إجمالي المدفوع" value={formatCurrency(totals.paid)} />
          <StatCard title="المتبقي" value={formatCurrency(totals.remaining)} />
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
                      const isLocalWorker = 'is_local' in worker && worker.is_local === true
                      return (
                        <tr key={worker.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{getWorkerName(worker)}</span>
                              {isLocalWorker && (
                                <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                  محلي
                                </span>
                              )}
                              {isLocalWorker && isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteLocalWorker(worker.id)
                                  }}
                                  disabled={!!actionKey}
                                  className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                  title="حذف العامل المحلي"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{formatCurrency(row.deductions_total + row.advances_total)}</td>
                          <td className="px-3 py-2.5 text-emerald-700">{formatCurrency(row.total_paid)}</td>
                          <td className="px-3 py-2.5 font-semibold text-amber-700">{formatCurrency(row.remaining_due)}</td>
                          <td className="px-3 py-2.5">
                            <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs ' + STATUS_STYLE[row.salary_status]}>
                              {STATUS_LABEL[row.salary_status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedWorkerForDeductions(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-orange-200 bg-orange-50 p-2 text-orange-600 transition-all hover:bg-orange-100 hover:shadow-sm"
                                title="فئة الخصومات"
                              >
                                <Scissors className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelectedWorkerForSalary(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-sm"
                                title="فئة الراتب الشهري"
                              >
                                <DollarSign className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelectedWorkerForOperations(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-gray-300 bg-gray-50 p-2 text-gray-600 transition-all hover:bg-gray-100 hover:shadow-sm"
                                title="سجل العمليات"
                              >
                                <History className="h-4 w-4" />
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
                      const isLocalWorker = 'is_local' in worker && worker.is_local === true
                      return (
                        <tr key={worker.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{getWorkerName(worker)}</span>
                              {isLocalWorker && (
                                <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                  محلي
                                </span>
                              )}
                              {isLocalWorker && isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteLocalWorker(worker.id)
                                  }}
                                  disabled={!!actionKey}
                                  className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                  title="حذف العامل المحلي"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{formatCurrency(row.deductions_total + row.advances_total)}</td>
                          <td className="px-3 py-2.5 text-emerald-700">{formatCurrency(row.total_paid)}</td>
                          <td className="px-3 py-2.5 font-semibold text-amber-700">{formatCurrency(row.remaining_due)}</td>
                          <td className="px-3 py-2.5">
                            <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs ' + STATUS_STYLE[row.salary_status]}>
                              {STATUS_LABEL[row.salary_status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedWorkerForDeductions(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-orange-200 bg-orange-50 p-2 text-orange-600 transition-all hover:bg-orange-100 hover:shadow-sm"
                                title="فئة الخصومات"
                              >
                                <Scissors className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelectedWorkerForSalary(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-sm"
                                title="فئة الراتب الشهري"
                              >
                                <DollarSign className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelectedWorkerForOperations(worker)}
                                className="group inline-flex items-center justify-center rounded-lg border border-gray-300 bg-gray-50 p-2 text-gray-600 transition-all hover:bg-gray-100 hover:shadow-sm"
                                title="سجل العمليات"
                              >
                                <History className="h-4 w-4" />
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

        {/* نافذة فئة الخصومات */}
        {selectedWorkerForDeductions && (() => {
          const worker = selectedWorkerForDeductions
          const row = getMonthRow(worker)
          const salaryForm = salaryForms[worker.id]

          if (!salaryForm) return null
          const salaryCalculation = calculateSalaryValues(salaryForm)

          return (
            <div key={worker.id} className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" dir="rtl" onClick={() => setSelectedWorkerForDeductions(null)}>
              <div className="mx-auto my-8 max-w-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                  {/* رأس النافذة */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-orange-100 p-2">
                        <Scissors className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">السلفة الصغيرة</h2>
                        <p className="text-sm text-gray-600">{getWorkerName(worker)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedWorkerForDeductions(null)}
                      className="rounded-lg p-2 hover:bg-gray-100"
                      title="إغلاق"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                      <Wallet className="h-4 w-4 text-indigo-600" />
                      إدارة السلفة الصغيرة
                    </h3>

                    <div className="space-y-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="مبلغ السلفة الصغيرة"
                        value={salaryForm.advancesTotal}
                        onChange={(e) => setSalaryForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], advancesTotal: sanitizeNonNegativeInput(e.target.value) }
                        }))}
                        className={'w-full ' + NUMBER_INPUT_CLASS}
                      />

                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        السلفة الصغيرة تُخصم تلقائيًا من صافي الراتب فورًا.
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        <p className="font-semibold">صافي الراتب بعد السلفة:</p>
                        <p className="mt-1 text-lg font-bold text-indigo-700">{formatCurrency(salaryCalculation.netAfterDeductions)}</p>
                      </div>

                      <button
                        onClick={() => handleSaveSmallAdvance(worker)}
                        disabled={!!actionKey || isReadOnly}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {actionKey === 'save-advance-' + worker.id ? 'جاري الحفظ...' : 'حفظ السلفة'}
                      </button>
                    </div>

                    {isLocked && (
                      <button
                        onClick={() => handleAdjustmentRequest(worker)}
                        disabled={!!actionKey}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        {actionKey === 'request-' + worker.id ? 'جاري الإرسال...' : 'طلب تعديل رسمي'}
                      </button>
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
          const totalPayments = paymentOperations.reduce((sum, op) => sum + op.amount, 0)
          const isPaymentTableVisible = showPaymentsByWorker[worker.id] === true

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

                  <div className="rounded-xl border border-gray-200 p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                      <Save className="h-4 w-4 text-indigo-600" />
                      حساب الراتب الشهري
                    </h3>

                    <button
                      onClick={() => setSalaryForms((prev) => ({
                        ...prev,
                        [worker.id]: {
                          ...prev[worker.id],
                          salaryType: prev[worker.id].salaryType === 'fixed' ? 'piecework' : 'fixed'
                        }
                      }))}
                      className="mb-2 inline-flex w-full items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs font-semibold text-indigo-700"
                    >
                      تبديل النظام: {salaryForm.salaryType === 'fixed' ? 'راتب ثابت' : 'راتب حسب القطعة'}
                    </button>

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
                      <div className="grid grid-cols-2 gap-2">
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
                          className={NUMBER_INPUT_CLASS}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="سعر القطعة"
                          value={salaryForm.pieceRate}
                          onChange={(e) => setSalaryForms((prev) => ({
                            ...prev,
                            [worker.id]: { ...prev[worker.id], pieceRate: sanitizeNonNegativeInput(e.target.value) }
                          }))}
                          className={NUMBER_INPUT_CLASS}
                        />
                      </div>
                    )}

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="عدد ساعات إضافية"
                        value={salaryForm.overtimeHours}
                        onChange={(e) => setSalaryForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], overtimeHours: sanitizeNonNegativeInput(e.target.value) }
                        }))}
                        className={NUMBER_INPUT_CLASS}
                      />
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700">
                        قيمة الإضافي ({OVERTIME_RATE} ر.س): {formatCurrency(salaryCalculation.overtimeTotal)}
                      </div>
                      <input
                        type="date"
                        value={salaryForm.operationDate}
                        onChange={(e) => setSalaryForms((prev) => ({
                          ...prev,
                          [worker.id]: { ...prev[worker.id], operationDate: e.target.value }
                        }))}
                        className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
                      />
                      <button
                        onClick={() => handleOpenPaymentsTable(worker.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        الانتقال إلى جدول الدفعات
                      </button>
                    </div>

                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700">
                      <p>إجمالي القطعة: {formatCurrency(salaryCalculation.pieceTotal)}</p>
                      <p>الصافي المتوقع بعد السلفة: {formatCurrency(salaryCalculation.netAfterDeductions)}</p>
                    </div>

                    <input type="text" placeholder="مرجع (اختياري)" value={salaryForm.reference} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], reference: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <textarea placeholder="ملاحظة (اختياري)" value={salaryForm.note} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], note: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" rows={2} />
                    <button onClick={() => handleSaveSnapshot(worker)} disabled={!!actionKey || isReadOnly} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      {actionKey === 'snapshot-' + worker.id ? 'جاري الحفظ...' : 'حفظ واعتماد الراتب'}
                    </button>
                  </div>

                  <div id={'payments-table-' + worker.id} className="rounded-xl border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                          <FileText className="h-4 w-4 text-gray-700" />
                          جدول الدفعات الشهرية
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="grid gap-2 text-xs text-gray-700 md:grid-cols-3">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">عدد الدفعات: <span className="font-semibold text-gray-900">{paymentOperations.length}</span></div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">إجمالي المدفوع: <span className="font-semibold text-emerald-700">{formatCurrency(totalPayments)}</span></div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">المتبقي الحالي: <span className="font-semibold text-amber-700">{formatCurrency(row.remaining_due)}</span></div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <input type="number" min="0" step="0.01" placeholder="مبلغ الدفعة" value={paymentForm.amount} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], amount: sanitizeNonNegativeInput(e.target.value) } }))} className={NUMBER_INPUT_CLASS} />
                        <input type="date" value={paymentForm.operationDate} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], operationDate: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                      </div>
                      <input type="text" placeholder="مرجع الدفعة" value={paymentForm.reference} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], reference: e.target.value } }))} className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                      <textarea placeholder="ملاحظة (اختياري)" value={paymentForm.note} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], note: e.target.value } }))} className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" rows={2} />
                      <button onClick={() => handleRegisterPayment(worker)} disabled={!!actionKey || row.salary_status === 'negative' || isReadOnly} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                        <Wallet className="h-4 w-4" />
                        {actionKey === 'payment-' + worker.id ? 'جاري التسجيل...' : 'تسجيل دفعة'}
                      </button>

                      {paymentOperations.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">لا توجد دفعات لهذا العامل في هذا الشهر.</div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-right text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                              <tr>
                                <th className="px-3 py-2.5">التاريخ</th>
                                <th className="px-3 py-2.5">المبلغ</th>
                                <th className="px-3 py-2.5">المرجع</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {paymentOperations.map((op) => (
                                <tr key={op.id}>
                                  <td className="px-3 py-2.5 text-gray-600">{op.operation_date}</td>
                                  <td className="px-3 py-2.5 font-semibold text-emerald-700">{formatCurrency(op.amount)}</td>
                                  <td className="px-3 py-2.5 text-gray-600">{op.reference || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* نافذة سجل العمليات */}
        {selectedWorkerForOperations && (() => {
          const worker = selectedWorkerForOperations
          const operations = operationsByWorker[worker.id] || []

          return (
            <div key={worker.id} className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" dir="rtl" onClick={() => setSelectedWorkerForOperations(null)}>
              <div className="mx-auto my-8 max-w-4xl" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                  {/* رأس النافذة */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-gray-100 p-2">
                        <History className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">سجل العمليات</h2>
                        <p className="text-sm text-gray-600">{getWorkerName(worker)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedWorkerForOperations(null)}
                      className="rounded-lg p-2 hover:bg-gray-100"
                      title="إغلاق"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  {operations.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">لا توجد عمليات لهذا العامل في هذا الشهر.</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-3 py-2.5">التاريخ</th>
                            <th className="px-3 py-2.5">النوع</th>
                            <th className="px-3 py-2.5">قبل الحركة</th>
                            <th className="px-3 py-2.5">القيمة</th>
                            <th className="px-3 py-2.5">بعد الحركة</th>
                            <th className="px-3 py-2.5">الحالة</th>
                            <th className="px-3 py-2.5">المرجع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {operations.map((op) => (
                            <tr key={op.id}>
                              <td className="px-3 py-2.5 text-gray-600">{op.operation_date}</td>
                              <td className="px-3 py-2.5 font-medium text-gray-900">{operationTypeLabel(op.operation_type)}</td>
                              <td className="px-3 py-2.5">{formatCurrency(op.before_amount)}</td>
                              <td className="px-3 py-2.5 font-semibold">
                                {op.operation_type === 'payment'
                                  ? '- ' + formatCurrency(op.amount)
                                  : op.operation_type === 'salary'
                                    ? '= ' + formatCurrency(op.amount)
                                    : '+ ' + formatCurrency(op.amount)}
                              </td>
                              <td className="px-3 py-2.5">{formatCurrency(op.after_amount)}</td>
                              <td className="px-3 py-2.5">
                                <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs ' + STATUS_STYLE[op.salary_status_after]}>
                                  {STATUS_LABEL[op.salary_status_after]}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-600">{op.reference}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
    </div>
  )
}
