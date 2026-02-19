'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Wallet
} from 'lucide-react'
import { workerService, type WorkerWithUser } from '@/lib/services/worker-service'
import {
  createWorkerPayrollAdjustmentRequest,
  getWorkerPayrollMonths,
  getWorkerPayrollOperations,
  getWorkerPayrollPeriodLock,
  lockWorkerPayrollPeriod,
  registerWorkerPayrollAdjustment,
  registerWorkerPayrollPayment,
  saveWorkerPayrollSnapshot
} from '@/lib/services/worker-payroll-service'
import type {
  PayrollOperationType,
  PayrollPaymentAccount,
  PayrollStatus,
  WorkerPayrollMonth,
  WorkerPayrollOperation
} from '@/types/worker-payroll'

const BRANCH = 'tailoring' as const

interface SalaryFormState {
  basicSalary: string
  worksTotal: string
  allowancesTotal: string
  deductionsTotal: string
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
  paymentAccount: PayrollPaymentAccount
}

interface AdjustmentFormState {
  operationType: Extract<PayrollOperationType, 'advance' | 'deduction'>
  amount: string
  operationDate: string
  reference: string
  note: string
  paymentAccount: PayrollPaymentAccount
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

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (!value) return 0
  const parsed = Number(String(value).replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : 0
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

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function TailoringPayrollDashboard() {
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [monthRowsByWorker, setMonthRowsByWorker] = useState<Record<string, WorkerPayrollMonth>>({})
  const [operationsByWorker, setOperationsByWorker] = useState<Record<string, WorkerPayrollOperation[]>>({})
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthValue(new Date()))
  const [searchTerm, setSearchTerm] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [lockReason, setLockReason] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set())
  const [salaryForms, setSalaryForms] = useState<Record<string, SalaryFormState>>({})
  const [paymentForms, setPaymentForms] = useState<Record<string, PaymentFormState>>({})
  const [adjustmentForms, setAdjustmentForms] = useState<Record<string, AdjustmentFormState>>({})

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const [workerResult, months, operations, lockRow] = await Promise.all([
        workerService.getAll(),
        getWorkerPayrollMonths(BRANCH, selectedMonth),
        getWorkerPayrollOperations(BRANCH, selectedMonth),
        getWorkerPayrollPeriodLock(BRANCH, selectedMonth)
      ])

      const tailoringWorkers = (workerResult.data || []).filter(
        (worker) => worker.worker_type === 'tailor' && worker.user?.is_active !== false
      )

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

      setWorkers(tailoringWorkers)
      setMonthRowsByWorker(monthMap)
      setOperationsByWorker(operationMap)
      setIsLocked(lockRow?.is_locked === true)
      setLockReason(lockRow?.lock_reason || '')

      const defaultDate = monthEndDate(selectedMonth)

      setSalaryForms((prev) => {
        const next = { ...prev }
        tailoringWorkers.forEach((worker) => {
          const month = monthMap[worker.id] || buildEmptyMonth(worker, selectedMonth)
          next[worker.id] = {
            basicSalary: month.basic_salary.toString(),
            worksTotal: month.works_total.toString(),
            allowancesTotal: month.allowances_total.toString(),
            deductionsTotal: month.deductions_total.toString(),
            advancesTotal: month.advances_total.toString(),
            operationDate: defaultDate,
            reference: '',
            note: ''
          }
        })
        return next
      })

      setPaymentForms((prev) => {
        const next = { ...prev }
        tailoringWorkers.forEach((worker) => {
          const month = monthMap[worker.id] || buildEmptyMonth(worker, selectedMonth)
          next[worker.id] = {
            amount: month.remaining_due > 0 ? month.remaining_due.toFixed(2) : '',
            operationDate: defaultDate,
            reference: '',
            note: '',
            paymentAccount: 'cash'
          }
        })
        return next
      })

      setAdjustmentForms((prev) => {
        const next = { ...prev }
        tailoringWorkers.forEach((worker) => {
          next[worker.id] = {
            operationType: 'advance',
            amount: '',
            operationDate: defaultDate,
            reference: '',
            note: '',
            paymentAccount: 'cash'
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

  const totals = useMemo(() => {
    return filteredWorkers.reduce(
      (acc, worker) => {
        const row = getMonthRow(worker)
        acc.works += row.works_total
        acc.deductions += row.deductions_total
        acc.paid += row.total_paid
        acc.remaining += row.remaining_due
        return acc
      },
      { works: 0, deductions: 0, paid: 0, remaining: 0 }
    )
  }, [filteredWorkers, getMonthRow])

  const handleSaveSnapshot = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. التعديل متاح فقط عبر إشعار تعديل رسمي.')
      return
    }

    const form = salaryForms[worker.id]
    if (!form) return

    const basicSalary = toNumber(form.basicSalary)
    const worksTotal = toNumber(form.worksTotal)
    const allowancesTotal = toNumber(form.allowancesTotal)
    const deductionsTotal = toNumber(form.deductionsTotal)
    const advancesTotal = toNumber(form.advancesTotal)

    if ([basicSalary, worksTotal, allowancesTotal, deductionsTotal, advancesTotal].some((v) => v < 0)) {
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
        basicSalary,
        worksTotal,
        allowancesTotal,
        deductionsTotal,
        advancesTotal,
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
  }, [isLocked, salaryForms, selectedMonth, loadData])

  const handleRegisterPayment = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. التعديل متاح فقط عبر إشعار تعديل رسمي.')
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
        note: form.note || undefined,
        paymentAccount: form.paymentAccount
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
  }, [isLocked, paymentForms, getMonthRow, selectedMonth, loadData])

  const handleRegisterAdjustment = useCallback(async (worker: WorkerWithUser) => {
    if (isLocked) {
      alert('الشهر مقفل. التعديل متاح فقط عبر إشعار تعديل رسمي.')
      return
    }

    const form = adjustmentForms[worker.id]
    if (!form) return
    const amount = toNumber(form.amount)
    if (amount <= 0) {
      alert('يرجى إدخال مبلغ صحيح')
      return
    }

    setActionKey(`adjust-${worker.id}`)
    try {
      await registerWorkerPayrollAdjustment({
        branch: BRANCH,
        workerId: worker.id,
        workerName: getWorkerName(worker),
        monthValue: selectedMonth,
        operationType: form.operationType,
        operationDate: form.operationDate,
        amount,
        reference: form.reference || undefined,
        note: form.note || undefined,
        paymentAccount: form.paymentAccount
      })
      await loadData(true)
    } catch (error) {
      const message = toReadableError(error)
      if (message.includes('uq_worker_payroll_deduction_duplicate')) {
        alert('لا يمكن تسجيل خصم مكرر بنفس التاريخ والقيمة')
      } else {
        alert(message)
      }
    } finally {
      setActionKey(null)
    }
  }, [adjustmentForms, isLocked, selectedMonth, loadData])

  const handleLockMonth = useCallback(async () => {
    if (isLocked) return
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
  }, [isLocked, loadData, selectedMonth])

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
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                تحديث
              </button>
              <button
                onClick={handleLockMonth}
                disabled={isLocked || actionKey === 'lock-month'}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <Lock className="h-4 w-4" />
                {isLocked ? 'الشهر مقفل' : 'قفل الشهر'}
              </button>
            </div>
          </div>

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
          <StatCard title="إجمالي الأعمال" value={formatCurrency(totals.works)} />
          <StatCard title="إجمالي الخصومات" value={formatCurrency(totals.deductions)} />
          <StatCard title="إجمالي المدفوع" value={formatCurrency(totals.paid)} />
          <StatCard title="المتبقي" value={formatCurrency(totals.remaining)} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5">العامل</th>
                  <th className="px-3 py-2.5">إجمالي الأعمال</th>
                  <th className="px-3 py-2.5">إجمالي الخصومات</th>
                  <th className="px-3 py-2.5">إجمالي المدفوع</th>
                  <th className="px-3 py-2.5">المتبقي</th>
                  <th className="px-3 py-2.5">الحالة</th>
                  <th className="px-3 py-2.5">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWorkers.map((worker) => {
                  const row = getMonthRow(worker)
                  const isExpanded = expandedWorkers.has(worker.id)
                  return (
                    <tr key={worker.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{getWorkerName(worker)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{formatCurrency(row.works_total)}</td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {formatCurrency(row.deductions_total + row.advances_total)}
                      </td>
                      <td className="px-3 py-2.5 text-emerald-700">{formatCurrency(row.total_paid)}</td>
                      <td className="px-3 py-2.5 font-semibold text-amber-700">{formatCurrency(row.remaining_due)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLE[row.salary_status]}`}>
                          {STATUS_LABEL[row.salary_status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => {
                            setExpandedWorkers((prev) => {
                              const next = new Set(prev)
                              if (next.has(worker.id)) next.delete(worker.id)
                              else next.add(worker.id)
                              return next
                            })
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs hover:bg-gray-100"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {isExpanded ? 'إخفاء' : 'إدارة'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {filteredWorkers.map((worker) => {
          if (!expandedWorkers.has(worker.id)) return null
          const row = getMonthRow(worker)
          const salaryForm = salaryForms[worker.id]
          const paymentForm = paymentForms[worker.id]
          const adjustmentForm = adjustmentForms[worker.id]
          const operations = operationsByWorker[worker.id] || []

          if (!salaryForm || !paymentForm || !adjustmentForm) return null

          return (
            <div key={worker.id} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-gray-900">{getWorkerName(worker)}</h2>
                <div className="text-sm text-gray-500">
                  صافي المستحق: <span className="font-semibold text-gray-900">{formatCurrency(row.net_due)}</span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                    <Save className="h-4 w-4 text-indigo-600" />
                    اعتماد راتب الشهر
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" step="0.01" placeholder="الراتب الأساسي" value={salaryForm.basicSalary} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], basicSalary: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <input type="number" min="0" step="0.01" placeholder="إجمالي الأعمال" value={salaryForm.worksTotal} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], worksTotal: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <input type="number" min="0" step="0.01" placeholder="البدلات" value={salaryForm.allowancesTotal} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], allowancesTotal: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <input type="number" min="0" step="0.01" placeholder="الخصومات" value={salaryForm.deductionsTotal} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], deductionsTotal: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <input type="number" min="0" step="0.01" placeholder="السلف" value={salaryForm.advancesTotal} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], advancesTotal: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <input type="date" value={salaryForm.operationDate} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], operationDate: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                  </div>
                  <input type="text" placeholder="مرجع العملية (اختياري)" value={salaryForm.reference} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], reference: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                  <textarea placeholder="ملاحظة (اختياري)" value={salaryForm.note} onChange={(e) => setSalaryForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], note: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" rows={2} />
                  <button onClick={() => handleSaveSnapshot(worker)} disabled={!!actionKey} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    {actionKey === `snapshot-${worker.id}` ? 'جاري الحفظ...' : 'حفظ واعتماد الراتب'}
                  </button>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    تسجيل دفعة
                  </h3>
                  <input type="number" min="0" step="0.01" placeholder="المبلغ" value={paymentForm.amount} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], amount: e.target.value } }))} className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="date" value={paymentForm.operationDate} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], operationDate: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <select value={paymentForm.paymentAccount} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], paymentAccount: e.target.value as PayrollPaymentAccount } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm">
                      <option value="cash">الصندوق</option>
                      <option value="bank">البنك</option>
                    </select>
                  </div>
                  <input type="text" placeholder="مرجع الدفعة" value={paymentForm.reference} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], reference: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                  <textarea placeholder="ملاحظة (اختياري)" value={paymentForm.note} onChange={(e) => setPaymentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], note: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" rows={2} />
                  <p className="mt-2 text-xs text-gray-500">المتبقي قبل العملية: {formatCurrency(row.remaining_due)}</p>
                  <button onClick={() => handleRegisterPayment(worker)} disabled={!!actionKey || row.salary_status === 'negative'} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    <Wallet className="h-4 w-4" />
                    {actionKey === `payment-${worker.id}` ? 'جاري التسجيل...' : 'تسجيل الدفعة'}
                  </button>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                    {adjustmentForm.operationType === 'advance' ? (
                      <PlusCircle className="h-4 w-4 text-orange-600" />
                    ) : (
                      <MinusCircle className="h-4 w-4 text-rose-600" />
                    )}
                    تسجيل سلفة / خصم
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={adjustmentForm.operationType} onChange={(e) => setAdjustmentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], operationType: e.target.value as Extract<PayrollOperationType, 'advance' | 'deduction'> } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm">
                      <option value="advance">سلفة</option>
                      <option value="deduction">خصم</option>
                    </select>
                    <input type="number" min="0" step="0.01" placeholder="المبلغ" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], amount: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="date" value={adjustmentForm.operationDate} onChange={(e) => setAdjustmentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], operationDate: e.target.value } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                    <select value={adjustmentForm.paymentAccount} onChange={(e) => setAdjustmentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], paymentAccount: e.target.value as PayrollPaymentAccount } }))} className="rounded-lg border border-gray-200 px-2 py-2 text-sm">
                      <option value="cash">الصندوق</option>
                      <option value="bank">البنك</option>
                    </select>
                  </div>
                  <input type="text" placeholder="مرجع العملية" value={adjustmentForm.reference} onChange={(e) => setAdjustmentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], reference: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" />
                  <textarea placeholder="ملاحظة (اختياري)" value={adjustmentForm.note} onChange={(e) => setAdjustmentForms((prev) => ({ ...prev, [worker.id]: { ...prev[worker.id], note: e.target.value } }))} className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" rows={2} />
                  <button onClick={() => handleRegisterAdjustment(worker)} disabled={!!actionKey} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
                    {actionKey === `adjust-${worker.id}` ? 'جاري التسجيل...' : 'تسجيل العملية'}
                  </button>
                  {isLocked && (
                    <button onClick={() => handleAdjustmentRequest(worker)} disabled={!!actionKey} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                      {actionKey === `request-${worker.id}` ? 'جاري الإرسال...' : 'إشعار تعديل رسمي'}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <FileText className="h-4 w-4 text-gray-700" />
                    سجل العمليات الزمني
                  </h3>
                </div>
                {operations.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">لا توجد عمليات لهذا العامل في هذا الشهر.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2.5">التاريخ</th>
                          <th className="px-3 py-2.5">النوع</th>
                          <th className="px-3 py-2.5">قبل العملية</th>
                          <th className="px-3 py-2.5">قيمة العملية</th>
                          <th className="px-3 py-2.5">بعد العملية</th>
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
                                ? `- ${formatCurrency(op.amount)}`
                                : op.operation_type === 'salary'
                                  ? `= ${formatCurrency(op.amount)}`
                                  : `+ ${formatCurrency(op.amount)}`}
                            </td>
                            <td className="px-3 py-2.5">{formatCurrency(op.after_amount)}</td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLE[op.salary_status_after]}`}>
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
          )
        })}
      </div>
    </div>
  )
}
