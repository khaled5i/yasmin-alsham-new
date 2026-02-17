'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { useTranslation } from '@/hooks/useTranslation'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { workerService, type WorkerWithUser } from '@/lib/services/worker-service'
import { createExpense, getExpenses } from '@/lib/services/simple-accounting-service'
import type { CreateExpenseInput, Expense } from '@/types/simple-accounting'

const OVERTIME_RATE = 12.5
const PAYROLL_TYPE_STORAGE_KEY = 'tailoring-salary-payroll-types-v1'
const BASE_SALARY_STORAGE_KEY = 'tailoring-salary-fixed-base-v1'
const LOCAL_WORKERS_STORAGE_KEY = 'tailoring-salary-local-workers-v1'

const SMALL_ADVANCE_CATEGORIES = new Set(['advance', 'small_advance'])
const LARGE_DEBT_CATEGORIES = new Set(['debt', 'large_debt', 'deduction'])

type PayrollType = 'fixed' | 'piece_rate'
type TransactionType = 'small_advance' | 'large_debt'
type ActiveTab = 'calculate' | 'history' | 'statistics'

interface LocalWorker {
  id: string
  full_name: string
  specialty?: string
  phone?: string
  created_at: string
  isLocal: true
}

interface SalarySettlementMeta {
  salaryDashboardMeta: true
  version: 1
  kind: 'salary_settlement'
  workerId: string
  workerName: string
  payrollType: PayrollType
  month: string
  baseSalary: number
  overtimeHours: number
  overtimeRate: number
  overtimeValue: number
  pieceIncome: number
  smallAdvances: number
  largeDebtBeforeRepayment: number
  debtRepayment: number
  grossIncome: number
  finalNetSalary: number
  itemPrices: Array<{
    orderId: string
    orderNumber: string
    title: string
    price: number
  }>
}

interface TransactionMeta {
  salaryDashboardMeta: true
  version: 1
  kind: TransactionType
  workerId: string
  workerName: string
  month: string
  amount: number
  note?: string
}

type SalaryMeta = SalarySettlementMeta | TransactionMeta

interface PieceOrderItem {
  id: string
  orderNumber: string
  title: string
  clientName: string
  completionDate: string
}

interface MonthlyCalculation {
  grossIncome: number
  smallAdvances: number
  largeDebtOutstanding: number
  debtRepayment: number
  netSalary: number
  overtimeHours: number
  overtimeValue: number
  baseSalary: number
  pieceIncome: number
}

interface TransactionFormState {
  workerId: string
  type: TransactionType
  amount: string
  date: string
  note: string
}

function toMonthValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthRange(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split('-')
  const year = Number(yearStr)
  const monthNumber = Number(monthStr)

  if (!year || !monthNumber) {
    const now = new Date()
    const nowMonth = toMonthValue(now)
    return getMonthRange(nowMonth)
  }

  const start = `${month}-01`
  const lastDay = new Date(year, monthNumber, 0).getDate()
  const end = `${month}-${String(lastDay).padStart(2, '0')}`

  return { start, end }
}

function getAmount(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (!value) {
    return 0
  }

  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function getDateMonth(dateValue?: string | null): string {
  if (!dateValue) {
    return ''
  }

  if (dateValue.length >= 7 && /^\d{4}-\d{2}/.test(dateValue)) {
    return dateValue.slice(0, 7)
  }

  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return toMonthValue(parsed)
}

function isExpenseInMonth(expense: Expense, month: string): boolean {
  return getDateMonth(expense.date) === month
}

function parseSalaryMeta(notes?: string): SalaryMeta | null {
  if (!notes) {
    return null
  }

  try {
    const parsed = JSON.parse(notes)
    if (parsed?.salaryDashboardMeta === true && parsed?.version === 1) {
      return parsed as SalaryMeta
    }
    return null
  } catch {
    return null
  }
}

function expenseBelongsToWorker(expense: Expense, worker: WorkerWithUser): boolean {
  const meta = parseSalaryMeta(expense.notes)
  if (meta?.workerId) {
    return meta.workerId === worker.id
  }

  const name = worker.user?.full_name?.trim().toLowerCase()
  if (!name) {
    return false
  }

  return (expense.description || '').toLowerCase().includes(name)
}

function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)} ر.س`
}

function inferCompletionDate(order: {
  delivery_date?: string | null
  proof_delivery_date?: string | null
  updated_at?: string | null
  created_at?: string | null
}): string {
  return order.delivery_date || order.proof_delivery_date || order.updated_at || order.created_at || ''
}

function getWorkerDisplayName(worker: WorkerWithUser | LocalWorker): string {
  if ('isLocal' in worker && worker.isLocal) {
    return worker.full_name
  }
  const w = worker as WorkerWithUser
  return w.user?.full_name || w.user?.email || w.id
}

function isLocalWorker(worker: WorkerWithUser | LocalWorker): worker is LocalWorker {
  return 'isLocal' in worker && worker.isLocal === true
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor
}: {
  title: string
  value: string | number
  icon: any
  color: string
  bgColor: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`${bgColor} p-3 rounded-xl`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
      </div>
    </div>
  )
}

function AddWorkerModal({
  isOpen,
  onClose,
  onAdd
}: {
  isOpen: boolean
  onClose: () => void
  onAdd: (worker: Omit<LocalWorker, 'id' | 'created_at' | 'isLocal'>) => void
}) {
  const [formData, setFormData] = useState({
    full_name: '',
    specialty: '',
    phone: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.full_name.trim()) {
      alert('الرجاء إدخال اسم العامل')
      return
    }
    onAdd(formData)
    setFormData({ full_name: '', specialty: '', phone: '' })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">إضافة عامل جديد</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              اسم العامل <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="أدخل اسم العامل الكامل"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              التخصص
            </label>
            <input
              type="text"
              value={formData.specialty}
              onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
              placeholder="مثال: خياط، مساعد، إداري"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              رقم الهاتف
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="05xxxxxxxx"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
            >
              إضافة العامل
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl border-2 border-gray-200 hover:bg-gray-50 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function WorkerCard({
  worker,
  payrollType,
  calculation,
  isExpanded,
  onToggleExpand,
  onChangePayrollType,
  onDeleteWorker,
  fixedSalaryInputs,
  pieceRateInputs,
  onSaveSalary,
  isSaving
}: {
  worker: WorkerWithUser | LocalWorker
  payrollType: PayrollType
  calculation: MonthlyCalculation
  isExpanded: boolean
  onToggleExpand: () => void
  onChangePayrollType: (type: PayrollType) => void
  onDeleteWorker?: () => void
  fixedSalaryInputs?: React.ReactNode
  pieceRateInputs?: React.ReactNode
  onSaveSalary: () => void
  isSaving: boolean
}) {
  const { t } = useTranslation()
  const hasDebt = calculation.largeDebtOutstanding > 0
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const isLocal = isLocalWorker(worker)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {getWorkerDisplayName(worker).charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">{getWorkerDisplayName(worker)}</h3>
                {isLocal && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    محلي
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {isLocal ? (worker as LocalWorker).specialty || 'عامل' : (worker as WorkerWithUser).specialty || t('worker')}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${payrollType === 'fixed'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  {payrollType === 'fixed' ? t('fixed_salary_option') : t('piece_rate_option')}
                </span>
                {hasDebt && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    دين: {formatCurrency(calculation.largeDebtOutstanding)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isLocal && (
              <button
                onClick={() =>
                  onChangePayrollType(payrollType === 'fixed' ? 'piece_rate' : 'fixed')
                }
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                تبديل النظام
              </button>
            )}
            {isLocal && onDeleteWorker && (
              <button
                onClick={onDeleteWorker}
                className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                title="حذف العامل"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onToggleExpand}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Quick Summary */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">الدخل الإجمالي</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(calculation.grossIncome)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-50">
            <p className="text-xs text-red-600 mb-1">الخصومات</p>
            <p className="text-lg font-bold text-red-600">
              {formatCurrency(calculation.smallAdvances + calculation.debtRepayment)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-emerald-50">
            <p className="text-xs text-emerald-600 mb-1">الصافي</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(calculation.netSalary)}</p>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-6 space-y-6">
          {/* Inputs */}
          {payrollType === 'fixed' ? fixedSalaryInputs : pieceRateInputs}

          {/* Detailed Calculation */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900">الحساب التفصيلي</h4>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {payrollType === 'fixed' ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">الراتب الأساسي</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(calculation.baseSalary)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">
                      الساعات الإضافية ({calculation.overtimeHours}س × {OVERTIME_RATE})
                    </span>
                    <span className="font-semibold text-gray-900">{formatCurrency(calculation.overtimeValue)}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">إجمالي دخل القطع</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(calculation.pieceIncome)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-gray-600">الدخل الإجمالي</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(calculation.grossIncome)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">السلف الصغيرة (تلقائي)</span>
                <span className="font-semibold text-red-600">- {formatCurrency(calculation.smallAdvances)}</span>
              </div>
              {calculation.largeDebtOutstanding > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">الدين المتبقي</span>
                    <span className="font-semibold text-amber-600">
                      {formatCurrency(calculation.largeDebtOutstanding)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">السداد (يدوي)</span>
                    <span className="font-semibold text-red-600">- {formatCurrency(calculation.debtRepayment)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between pt-3 border-t-2 border-gray-300">
                <span className="font-bold text-gray-900">الراتب الصافي النهائي</span>
                <span className="font-bold text-xl text-emerald-600">{formatCurrency(calculation.netSalary)}</span>
              </div>
            </div>
          </div>

          {/* Transaction Form Toggle */}
          <div>
            <button
              onClick={() => setShowTransactionForm(!showTransactionForm)}
              className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm font-medium text-gray-600 hover:text-indigo-600 flex items-center justify-center gap-2"
            >
              {showTransactionForm ? (
                <>
                  <X className="w-4 h-4" />
                  إلغاء
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  إضافة سلفة أو دين
                </>
              )}
            </button>

            {showTransactionForm && (
              <div className="mt-3 p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
                <p className="text-sm font-medium text-gray-700">إضافة معاملة جديدة</p>
                {/* Transaction form will be implemented here */}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onSaveSalary}
              disabled={isSaving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  حفظ الراتب الشهري
                </>
              )}
            </button>
            <button className="px-4 py-3 rounded-xl border-2 border-gray-200 hover:bg-gray-50 transition-colors">
              <FileText className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SalariesContent() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ActiveTab>('calculate')
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [localWorkers, setLocalWorkers] = useState<LocalWorker[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthValue(new Date()))
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false)

  const [payrollTypeByWorker, setPayrollTypeByWorker] = useState<Record<string, PayrollType>>({})
  const [fixedBaseSalaryByWorker, setFixedBaseSalaryByWorker] = useState<Record<string, string>>({})
  const [overtimeHoursByWorker, setOvertimeHoursByWorker] = useState<Record<string, string>>({})
  const [debtRepaymentByWorker, setDebtRepaymentByWorker] = useState<Record<string, string>>({})
  const [itemPricesByWorker, setItemPricesByWorker] = useState<Record<string, Record<string, string>>>({})
  const [pieceOrdersByWorker, setPieceOrdersByWorker] = useState<Record<string, PieceOrderItem[]>>({})
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set())

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingOrdersByWorker, setLoadingOrdersByWorker] = useState<Record<string, boolean>>({})
  const [savingSalaryWorkerId, setSavingSalaryWorkerId] = useState<string | null>(null)

  const initializedDefaults = useRef(false)

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const [workerResult, salaryExpenses] = await Promise.all([
        workerService.getAll(),
        getExpenses('tailoring', 'salary')
      ])

      if (workerResult.error) {
        console.error('Failed loading workers:', workerResult.error)
      }

      const tailoringWorkers = (workerResult.data || []).filter(
        (worker) => worker.worker_type === 'tailor' && worker.user?.is_active !== false
      )

      setWorkers(tailoringWorkers)
      setExpenses(salaryExpenses)
    } catch (error) {
      console.error('Failed loading salary dashboard data:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Load local workers from localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(LOCAL_WORKERS_STORAGE_KEY)
        if (stored) {
          setLocalWorkers(JSON.parse(stored))
        }
      } catch (error) {
        console.error('Failed loading local workers:', error)
      }
    }
  }, [loadData])

  // Save local workers to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && localWorkers.length >= 0) {
      localStorage.setItem(LOCAL_WORKERS_STORAGE_KEY, JSON.stringify(localWorkers))
    }
  }, [localWorkers])

  const addLocalWorker = useCallback((workerData: Omit<LocalWorker, 'id' | 'created_at' | 'isLocal'>) => {
    const newWorker: LocalWorker = {
      ...workerData,
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      isLocal: true
    }
    setLocalWorkers((prev) => [...prev, newWorker])
    setShowAddWorkerModal(false)
  }, [])

  const deleteLocalWorker = useCallback((workerId: string) => {
    if (confirm('هل أنت متأكد من حذف هذا العامل؟')) {
      setLocalWorkers((prev) => prev.filter((w) => w.id !== workerId))
      // Also remove related data
      setPayrollTypeByWorker((prev) => {
        const next = { ...prev }
        delete next[workerId]
        return next
      })
      setFixedBaseSalaryByWorker((prev) => {
        const next = { ...prev }
        delete next[workerId]
        return next
      })
    }
  }, [])

  // Combine imported workers and local workers
  const allWorkers = useMemo(() => {
    const combined: Array<WorkerWithUser | LocalWorker> = [...workers, ...localWorkers]
    return combined
  }, [workers, localWorkers])

  const settlementEntries = useMemo(() => {
    return expenses
      .map((expense) => {
        const meta = parseSalaryMeta(expense.notes)
        if (!meta || meta.kind !== 'salary_settlement') {
          return null
        }
        return { expense, meta }
      })
      .filter(Boolean) as Array<{ expense: Expense; meta: SalarySettlementMeta }>
  }, [expenses])

  const latestSettlementByWorker = useMemo(() => {
    const latest = new Map<string, SalarySettlementMeta>()

    for (const entry of settlementEntries) {
      const current = latest.get(entry.meta.workerId)
      if (!current) {
        latest.set(entry.meta.workerId, entry.meta)
        continue
      }

      if ((entry.expense.date || '') > (current.month || '')) {
        latest.set(entry.meta.workerId, entry.meta)
      }
    }

    return latest
  }, [settlementEntries])

  useEffect(() => {
    if (!allWorkers.length || initializedDefaults.current) {
      return
    }

    initializedDefaults.current = true

    let storedPayrollTypes: Record<string, PayrollType> = {}
    let storedBaseSalaries: Record<string, string> = {}

    if (typeof window !== 'undefined') {
      try {
        storedPayrollTypes = JSON.parse(localStorage.getItem(PAYROLL_TYPE_STORAGE_KEY) || '{}')
      } catch {
        storedPayrollTypes = {}
      }

      try {
        storedBaseSalaries = JSON.parse(localStorage.getItem(BASE_SALARY_STORAGE_KEY) || '{}')
      } catch {
        storedBaseSalaries = {}
      }
    }

    const nextPayrollTypes: Record<string, PayrollType> = {}
    const nextBaseSalaries: Record<string, string> = {}

    allWorkers.forEach((worker) => {
      const fromSettlement = latestSettlementByWorker.get(worker.id)

      // Local workers default to 'fixed', imported workers can be either
      nextPayrollTypes[worker.id] =
        storedPayrollTypes[worker.id] ||
        fromSettlement?.payrollType ||
        (isLocalWorker(worker) ? 'fixed' : 'fixed')

      if (storedBaseSalaries[worker.id] !== undefined) {
        nextBaseSalaries[worker.id] = storedBaseSalaries[worker.id]
      } else if (fromSettlement?.baseSalary) {
        nextBaseSalaries[worker.id] = String(fromSettlement.baseSalary)
      } else {
        nextBaseSalaries[worker.id] = ''
      }
    })

    setPayrollTypeByWorker(nextPayrollTypes)
    setFixedBaseSalaryByWorker(nextBaseSalaries)
  }, [allWorkers, latestSettlementByWorker])

  useEffect(() => {
    if (typeof window === 'undefined' || !Object.keys(payrollTypeByWorker).length) {
      return
    }
    localStorage.setItem(PAYROLL_TYPE_STORAGE_KEY, JSON.stringify(payrollTypeByWorker))
  }, [payrollTypeByWorker])

  useEffect(() => {
    if (typeof window === 'undefined' || !Object.keys(fixedBaseSalaryByWorker).length) {
      return
    }
    localStorage.setItem(BASE_SALARY_STORAGE_KEY, JSON.stringify(fixedBaseSalaryByWorker))
  }, [fixedBaseSalaryByWorker])

  useEffect(() => {
    setOvertimeHoursByWorker({})
    setDebtRepaymentByWorker({})
    setItemPricesByWorker({})
  }, [selectedMonth])

  const pieceWorkerIds = useMemo(() => {
    // Only imported workers can be piece-rate (they need to be linked to orders)
    return workers
      .filter((worker) => payrollTypeByWorker[worker.id] === 'piece_rate')
      .map((worker) => worker.id)
  }, [workers, payrollTypeByWorker])

  const loadPieceOrdersForMonth = useCallback(
    async (workerId: string, month: string) => {
      if (!isSupabaseConfigured()) {
        return []
      }

      const { data, error } = await supabase
        .from('orders')
        .select('id,order_number,description,client_name,status,delivery_date,proof_delivery_date,updated_at,created_at')
        .eq('worker_id', workerId)
        .in('status', ['completed', 'delivered'])
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Failed loading piece-rate items:', error)
        return []
      }

      return (data || [])
        .filter((order) => getDateMonth(inferCompletionDate(order)) === month)
        .map((order) => ({
          id: order.id,
          orderNumber: order.order_number || order.id.slice(0, 8),
          title: order.description || 'فستان / قطعة',
          clientName: order.client_name || '-',
          completionDate: inferCompletionDate(order)
        }))
    },
    []
  )

  useEffect(() => {
    if (!pieceWorkerIds.length) {
      setPieceOrdersByWorker({})
      return
    }

    let cancelled = false

    const run = async () => {
      const loadingState: Record<string, boolean> = {}
      pieceWorkerIds.forEach((id) => {
        loadingState[id] = true
      })
      setLoadingOrdersByWorker((prev) => ({ ...prev, ...loadingState }))

      const result = await Promise.all(
        pieceWorkerIds.map(async (workerId) => {
          const items = await loadPieceOrdersForMonth(workerId, selectedMonth)
          return { workerId, items }
        })
      )

      if (cancelled) {
        return
      }

      const ordersMap: Record<string, PieceOrderItem[]> = {}
      const loadingDone: Record<string, boolean> = {}

      result.forEach(({ workerId, items }) => {
        ordersMap[workerId] = items
        loadingDone[workerId] = false
      })

      setPieceOrdersByWorker((prev) => ({ ...prev, ...ordersMap }))
      setLoadingOrdersByWorker((prev) => ({ ...prev, ...loadingDone }))
    }

    run()

    return () => {
      cancelled = true
    }
  }, [pieceWorkerIds, loadPieceOrdersForMonth, selectedMonth])



  const filteredWorkers = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase()
    if (!normalized) {
      return allWorkers
    }

    return allWorkers.filter((worker) => {
      if (isLocalWorker(worker)) {
        const haystack = [worker.full_name, worker.specialty, worker.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalized)
      } else {
        const haystack = [
          worker.user?.full_name,
          worker.user?.email,
          worker.user?.phone,
          worker.specialty
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalized)
      }
    })
  }, [allWorkers, searchTerm])

  const smallAdvancesByWorker = useMemo(() => {
    const map: Record<string, number> = {}

    for (const worker of allWorkers) {
      let total = 0

      for (const expense of expenses) {
        const meta = parseSalaryMeta(expense.notes)
        const isSmallAdvance =
          meta?.kind === 'small_advance' || SMALL_ADVANCE_CATEGORIES.has(expense.category)

        if (!isSmallAdvance) {
          continue
        }

        if (!isExpenseInMonth(expense, selectedMonth)) {
          continue
        }

        // Check by metadata workerId for both local and imported workers
        if (meta?.workerId === worker.id) {
          total += expense.amount || 0
          continue
        }

        // Fallback: check by name for imported workers only
        if (!isLocalWorker(worker) && expenseBelongsToWorker(expense, worker)) {
          total += expense.amount || 0
        }
      }

      map[worker.id] = total
    }

    return map
  }, [allWorkers, expenses, selectedMonth])

  const largeDebtOutstandingByWorker = useMemo(() => {
    const issuedMap: Record<string, number> = {}
    const repaidMap: Record<string, number> = {}

    for (const worker of allWorkers) {
      issuedMap[worker.id] = 0
      repaidMap[worker.id] = 0
    }

    for (const worker of allWorkers) {
      for (const expense of expenses) {
        const meta = parseSalaryMeta(expense.notes)

        const isLargeDebtIssue =
          meta?.kind === 'large_debt' || LARGE_DEBT_CATEGORIES.has(expense.category)

        if (isLargeDebtIssue) {
          // Check by metadata workerId first
          if (meta?.workerId === worker.id) {
            issuedMap[worker.id] += expense.amount || 0
          }
          // Fallback: check by name for imported workers only
          else if (!isLocalWorker(worker) && expenseBelongsToWorker(expense, worker)) {
            issuedMap[worker.id] += expense.amount || 0
          }
        }

        if (meta?.kind === 'salary_settlement' && meta.workerId === worker.id) {
          repaidMap[worker.id] += meta.debtRepayment || 0
        }
      }
    }

    const remainingMap: Record<string, number> = {}
    for (const worker of allWorkers) {
      remainingMap[worker.id] = Math.max((issuedMap[worker.id] || 0) - (repaidMap[worker.id] || 0), 0)
    }

    return remainingMap
  }, [allWorkers, expenses])

  const calculateFixed = useCallback(
    (workerId: string): MonthlyCalculation => {
      const baseSalary = getAmount(fixedBaseSalaryByWorker[workerId])
      const overtimeHours = getAmount(overtimeHoursByWorker[workerId])
      const overtimeValue = overtimeHours * OVERTIME_RATE
      const grossIncome = baseSalary + overtimeValue
      const smallAdvances = smallAdvancesByWorker[workerId] || 0
      const largeDebtOutstanding = largeDebtOutstandingByWorker[workerId] || 0
      const debtRepaymentRaw = getAmount(debtRepaymentByWorker[workerId])
      const debtRepayment = Math.max(Math.min(debtRepaymentRaw, largeDebtOutstanding), 0)
      const netSalary = grossIncome - smallAdvances - debtRepayment

      return {
        grossIncome,
        smallAdvances,
        largeDebtOutstanding,
        debtRepayment,
        netSalary,
        overtimeHours,
        overtimeValue,
        baseSalary,
        pieceIncome: 0
      }
    },
    [
      debtRepaymentByWorker,
      fixedBaseSalaryByWorker,
      largeDebtOutstandingByWorker,
      overtimeHoursByWorker,
      smallAdvancesByWorker
    ]
  )

  const calculatePieceRate = useCallback(
    (workerId: string): MonthlyCalculation => {
      const items = pieceOrdersByWorker[workerId] || []
      const priceMap = itemPricesByWorker[workerId] || {}
      const pieceIncome = items.reduce((sum, item) => sum + getAmount(priceMap[item.id]), 0)

      const smallAdvances = smallAdvancesByWorker[workerId] || 0
      const largeDebtOutstanding = largeDebtOutstandingByWorker[workerId] || 0
      const debtRepaymentRaw = getAmount(debtRepaymentByWorker[workerId])
      const debtRepayment = Math.max(Math.min(debtRepaymentRaw, largeDebtOutstanding), 0)
      const netSalary = pieceIncome - smallAdvances - debtRepayment

      return {
        grossIncome: pieceIncome,
        smallAdvances,
        largeDebtOutstanding,
        debtRepayment,
        netSalary,
        overtimeHours: 0,
        overtimeValue: 0,
        baseSalary: 0,
        pieceIncome
      }
    },
    [
      debtRepaymentByWorker,
      itemPricesByWorker,
      largeDebtOutstandingByWorker,
      pieceOrdersByWorker,
      smallAdvancesByWorker
    ]
  )

  const statistics = useMemo(() => {
    let totalNetSalary = 0
    let totalAdvances = 0
    let totalDebts = 0

    filteredWorkers.forEach((worker) => {
      const calc =
        payrollTypeByWorker[worker.id] === 'piece_rate'
          ? calculatePieceRate(worker.id)
          : calculateFixed(worker.id)

      totalNetSalary += calc.netSalary
      totalAdvances += calc.smallAdvances
      totalDebts += calc.largeDebtOutstanding
    })

    return {
      totalNetSalary,
      totalAdvances,
      totalDebts,
      workerCount: filteredWorkers.length
    }
  }, [filteredWorkers, payrollTypeByWorker, calculateFixed, calculatePieceRate])

  const saveSalarySettlement = useCallback(
    async (worker: WorkerWithUser | LocalWorker) => {
      const payrollType = payrollTypeByWorker[worker.id] || 'fixed'
      const calculation = payrollType === 'piece_rate'
        ? calculatePieceRate(worker.id)
        : calculateFixed(worker.id)

      if (calculation.netSalary < 0) {
        alert(t('negative_net_salary_alert'))
        return
      }

      const { end } = getMonthRange(selectedMonth)
      const workerName = getWorkerDisplayName(worker)

      const itemPricesMeta = (pieceOrdersByWorker[worker.id] || []).map((item) => ({
        orderId: item.id,
        orderNumber: item.orderNumber,
        title: item.title,
        price: getAmount(itemPricesByWorker[worker.id]?.[item.id])
      }))

      const meta: SalarySettlementMeta = {
        salaryDashboardMeta: true,
        version: 1,
        kind: 'salary_settlement',
        workerId: worker.id,
        workerName,
        payrollType,
        month: selectedMonth,
        baseSalary: calculation.baseSalary,
        overtimeHours: calculation.overtimeHours,
        overtimeRate: OVERTIME_RATE,
        overtimeValue: calculation.overtimeValue,
        pieceIncome: calculation.pieceIncome,
        smallAdvances: calculation.smallAdvances,
        largeDebtBeforeRepayment: calculation.largeDebtOutstanding,
        debtRepayment: calculation.debtRepayment,
        grossIncome: calculation.grossIncome,
        finalNetSalary: calculation.netSalary,
        itemPrices: itemPricesMeta
      }

      const expenseInput: CreateExpenseInput = {
        branch: 'tailoring',
        type: 'salary',
        category: payrollType === 'piece_rate' ? 'piece_rate' : 'monthly_salary',
        description: `${workerName} - ${payrollType === 'piece_rate' ? 'راتب بالقطعة' : 'راتب ثابت'} - ${selectedMonth}`,
        amount: calculation.netSalary,
        date: end,
        notes: JSON.stringify(meta)
      }

      setSavingSalaryWorkerId(worker.id)
      try {
        const result = await createExpense(expenseInput)
        if (!result) {
          alert(t('salary_settlement_error'))
          return
        }

        alert(t('salary_settlement_success'))
        await loadData(true)
      } catch (error) {
        console.error('Failed saving salary settlement:', error)
        alert(t('salary_settlement_error'))
      } finally {
        setSavingSalaryWorkerId(null)
      }
    },
    [
      calculateFixed,
      calculatePieceRate,
      itemPricesByWorker,
      loadData,
      payrollTypeByWorker,
      pieceOrdersByWorker,
      selectedMonth,
      t
    ]
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="inline-flex items-center gap-3 text-gray-700">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-lg font-medium">{t('loading_salary_dashboard')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/accounting/tailoring"
              className="p-2.5 rounded-xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-gray-200"
            >
              <ArrowLeft className="w-5 h-5 rotate-180 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {t('salary_dashboard_title')}
              </h1>
              <p className="text-gray-500 mt-1">{t('salary_dashboard_desc')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddWorkerModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
            >
              <UserPlus className="w-4 h-4" />
              إضافة عامل
            </button>
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:shadow-md transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg hover:shadow-xl">
              <Download className="w-4 h-4" />
              تصدير Excel
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="إجمالي الرواتب الصافية"
            value={formatCurrency(statistics.totalNetSalary)}
            icon={Wallet}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
          />
          <StatCard
            title="إجمالي السلف"
            value={formatCurrency(statistics.totalAdvances)}
            icon={TrendingUp}
            color="text-red-600"
            bgColor="bg-red-50"
          />
          <StatCard
            title="إجمالي الديون المتبقية"
            value={formatCurrency(statistics.totalDebts)}
            icon={AlertTriangle}
            color="text-amber-600"
            bgColor="bg-amber-50"
          />
          <StatCard
            title="عدد العمال"
            value={statistics.workerCount}
            icon={Users}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('calculate')}
                className={`flex-1 px-6 py-4 font-semibold transition-all ${activeTab === 'calculate'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                حساب الرواتب
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-6 py-4 font-semibold transition-all ${activeTab === 'history'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                سجل الرواتب
              </button>
              <button
                onClick={() => setActiveTab('statistics')}
                className={`flex-1 px-6 py-4 font-semibold transition-all ${activeTab === 'statistics'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                الإحصائيات
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'calculate' && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="البحث عن عامل..."
                      className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Workers List */}
                {filteredWorkers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">لا يوجد عمال</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredWorkers.map((worker) => {
                      const payrollType = payrollTypeByWorker[worker.id] || 'fixed'
                      const calculation =
                        payrollType === 'piece_rate'
                          ? calculatePieceRate(worker.id)
                          : calculateFixed(worker.id)

                      return (
                        <WorkerCard
                          key={worker.id}
                          worker={worker}
                          payrollType={payrollType}
                          calculation={calculation}
                          isExpanded={expandedWorkers.has(worker.id)}
                          onToggleExpand={() => {
                            setExpandedWorkers((prev) => {
                              const next = new Set(prev)
                              if (next.has(worker.id)) {
                                next.delete(worker.id)
                              } else {
                                next.add(worker.id)
                              }
                              return next
                            })
                          }}
                          onChangePayrollType={(type) => {
                            setPayrollTypeByWorker((prev) => ({ ...prev, [worker.id]: type }))
                          }}
                          onDeleteWorker={
                            isLocalWorker(worker) ? () => deleteLocalWorker(worker.id) : undefined
                          }
                          fixedSalaryInputs={
                            <div className="grid gap-4 md:grid-cols-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  الراتب الأساسي
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={fixedBaseSalaryByWorker[worker.id] || ''}
                                  onChange={(e) =>
                                    setFixedBaseSalaryByWorker((prev) => ({
                                      ...prev,
                                      [worker.id]: e.target.value
                                    }))
                                  }
                                  placeholder="0.00"
                                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  الساعات الإضافية
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={overtimeHoursByWorker[worker.id] || ''}
                                  onChange={(e) =>
                                    setOvertimeHoursByWorker((prev) => ({
                                      ...prev,
                                      [worker.id]: e.target.value
                                    }))
                                  }
                                  placeholder="0"
                                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  سداد الدين
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={debtRepaymentByWorker[worker.id] || ''}
                                  onChange={(e) =>
                                    setDebtRepaymentByWorker((prev) => ({
                                      ...prev,
                                      [worker.id]: e.target.value
                                    }))
                                  }
                                  placeholder="0.00"
                                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>
                          }
                          pieceRateInputs={
                            <div className="space-y-4">
                              <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                  <h4 className="font-semibold text-gray-900">
                                    القطع المنجزة ({selectedMonth})
                                  </h4>
                                </div>
                                {loadingOrdersByWorker[worker.id] ? (
                                  <div className="p-6 text-center">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                                    <p className="text-sm text-gray-500 mt-2">جاري التحميل...</p>
                                  </div>
                                ) : (pieceOrdersByWorker[worker.id] || []).length === 0 ? (
                                  <div className="p-6 text-center text-sm text-gray-500">
                                    لا توجد قطع منجزة لهذا الشهر
                                  </div>
                                ) : (
                                  <div className="divide-y divide-gray-100">
                                    {(pieceOrdersByWorker[worker.id] || []).map((item) => (
                                      <div
                                        key={item.id}
                                        className="p-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center hover:bg-gray-50"
                                      >
                                        <div>
                                          <p className="font-medium text-gray-900">
                                            #{item.orderNumber} - {item.title}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            {item.clientName} • {item.completionDate.slice(0, 10)}
                                          </p>
                                        </div>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={
                                            itemPricesByWorker[worker.id]?.[item.id] || ''
                                          }
                                          onChange={(e) =>
                                            setItemPricesByWorker((prev) => ({
                                              ...prev,
                                              [worker.id]: {
                                                ...(prev[worker.id] || {}),
                                                [item.id]: e.target.value
                                              }
                                            }))
                                          }
                                          placeholder="السعر"
                                          className="w-full md:w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  سداد الدين
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={debtRepaymentByWorker[worker.id] || ''}
                                  onChange={(e) =>
                                    setDebtRepaymentByWorker((prev) => ({
                                      ...prev,
                                      [worker.id]: e.target.value
                                    }))
                                  }
                                  placeholder="0.00"
                                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                            </div>
                          }
                          onSaveSalary={() => saveSalarySettlement(worker)}
                          isSaving={savingSalaryWorkerId === worker.id}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">سجل الرواتب (قريباً)</p>
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">الإحصائيات والرسوم البيانية (قريباً)</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Worker Modal */}
      <AddWorkerModal
        isOpen={showAddWorkerModal}
        onClose={() => setShowAddWorkerModal(false)}
        onAdd={addLocalWorker}
      />
    </div>
  )
}

export default function TailoringSalariesPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <SalariesContent />
    </ProtectedWorkerRoute>
  )
}
