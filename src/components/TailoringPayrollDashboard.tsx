'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Search,
  Wallet,
  Users,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  ArrowUpRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import { usePayrollRefresh } from '@/hooks/usePayrollRefresh'
import {
  getPayrollWorkspace,
  type PayrollWorkspace
} from '@/lib/services/payroll-workspace-service'
import { saveTailoringSalarySettings } from '@/lib/services/worker-payroll-service'
import { workerService } from '@/lib/services/worker-service'
import {
  payrollAmounts,
  payrollDate,
  payrollMoney,
  payrollMonth,
  shiftPayrollMonth
} from '@/lib/payroll-display'
import PayrollWorkerPanel, { type PayrollPanelTab } from '@/components/payroll/PayrollWorkerPanel'
import PayrollDialog, {
  payrollInput,
  payrollPrimary,
  payrollSecondary,
  payrollButton
} from '@/components/payroll/PayrollDialog'

type WorkerFilter = 'all' | 'due' | 'paid' | 'debt' | 'suspended'
interface Selection {
  id: string
  tab: PayrollPanelTab
  quick: boolean
}

export default function TailoringPayrollDashboard({
  embeddedWorkerId
}: { embeddedWorkerId?: string } = {}) {
  const { isArabic } = useTranslation()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const t = (ar: string, en: string) => (isArabic ? ar : en)
  const money = (n: number) => payrollMoney(n, isArabic)
  const [month, setMonth] = useState(payrollMonth)
  const [data, setData] = useState<PayrollWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<WorkerFilter>('all')
  const [salaryFilter, setSalaryFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [dirty, setDirty] = useState(false)
  const [panelBusy, setPanelBusy] = useState(false)
  const [discard, setDiscard] = useState<(() => void) | null>(null)
  const [revision, setRevision] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [newWorker, setNewWorker] = useState({ name: '', phone: '', specialty: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const request = useRef(0)
  const preparing = useRef(new Set<string>())

  const load = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    try {
      const workspace = await getPayrollWorkspace(month, embeddedWorkerId)
      // Preserve automatic fixed salaries for the current month only, never while browsing other months.
      if (admin && month === payrollMonth()) {
        const existing = new Set(workspace.rows.map((row) => row.worker_id))
        const last = new Map(workspace.previous.map((row) => [row.worker_id, row]))
        const missing = workspace.workers.filter((worker) => {
          const prior = last.get(worker.id)
          return (
            !existing.has(worker.id) &&
            !workspace.suspended.has(worker.id) &&
            prior?.salary_type === 'fixed' &&
            prior.fixed_salary_value > 0 &&
            !preparing.current.has(`${month}:${worker.id}`)
          )
        })
        const results = await Promise.allSettled(
          missing.map(async (worker) => {
            const key = `${month}:${worker.id}`
            preparing.current.add(key)
            try {
              const prior = last.get(worker.id)!
              const saved = await saveTailoringSalarySettings({
                workerId: worker.id,
                monthValue: month,
                salaryType: 'fixed',
                fixedSalaryValue: prior.fixed_salary_value,
                onlyIfMissing: true,
                operationDate: payrollDate(month),
                note: 'تجهيز الراتب الثابت للشهر الحالي حسب آخر إعداد محفوظ'
              })
              workspace.rows.push(saved.month)
              if (saved.operation) workspace.operations.push(saved.operation)
            } finally {
              preparing.current.delete(key)
            }
          })
        )
        if (results.some((result) => result.status === 'rejected'))
          throw new Error('Payroll preparation failed')
      }
      if (id !== request.current) return
      setData(workspace)
      setError(false)
      setRevision((v) => v + 1)
    } catch {
      if (id === request.current) setError(true)
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [admin, month, embeddedWorkerId])

  const invalidateRequest = useCallback(() => {
    request.current++
  }, [])
  useEffect(() => {
    setData(null)
    void load()
    return invalidateRequest
  }, [load, invalidateRequest])
  usePayrollRefresh(() => {
    if (!loading) void load()
  })
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  const rows = useMemo(() => {
    if (!data) return []
    const current = new Map(data.rows.map((row) => [row.worker_id, row]))
    const previous = new Map(data.previous.map((row) => [row.worker_id, row]))
    const debts = new Map(data.debts.map((row) => [row.worker_id, Number(row.remaining_amount)]))
    const operations = new Map<string, typeof data.operations>()
    for (const op of data.operations) {
      const group = operations.get(op.worker_id) || []
      group.push(op)
      operations.set(op.worker_id, group)
    }
    return data.workers
      .map((worker) => {
        const row = current.get(worker.id),
          prior = previous.get(worker.id),
          ops = operations.get(worker.id) || []
        return {
          worker,
          row,
          previous: prior,
          operations: ops,
          debt: debts.get(worker.id) || 0,
          suspended: data.suspended.has(worker.id),
          salaryType: row?.salary_type || prior?.salary_type || 'fixed',
          ...payrollAmounts(row, ops)
        }
      })
      .sort(
        (a, b) =>
          Number(a.suspended) - Number(b.suspended) ||
          a.worker.user.full_name.localeCompare(b.worker.user.full_name, 'ar')
      )
  }, [data])

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, entry) => {
          // Suspension changes entitlement totals, never hides actual disbursements or debts.
          sum.cash += entry.cashOut
          sum.debt += entry.debt
          if (!entry.suspended) {
            sum.due += entry.due
            sum.paid += entry.paid
            sum.remaining += Math.max(0, entry.remaining)
            if (entry.remaining > 0.009) sum.pending++
          }
          return sum
        },
        { due: 0, paid: 0, remaining: 0, cash: 0, debt: 0, pending: 0 }
      ),
    [rows]
  )

  const visible = rows.filter((entry) => {
    const needle = search.trim().toLowerCase()
    if (
      needle &&
      !`${entry.worker.user.full_name} ${entry.worker.user.phone || ''} ${entry.worker.specialty}`
        .toLowerCase()
        .includes(needle)
    )
      return false
    if (salaryFilter !== 'all' && entry.salaryType !== salaryFilter) return false
    if (filter === 'due') return !entry.suspended && entry.remaining > 0.009
    if (filter === 'paid')
      return !entry.suspended && entry.paid > 0 && Math.abs(entry.remaining) <= 0.009
    if (filter === 'debt') return entry.debt > 0.009
    if (filter === 'suspended') return entry.suspended
    return true
  })
  const selected = rows.find((entry) => entry.worker.id === (embeddedWorkerId || selection?.id))
  function guard(action: () => void) {
    if (panelBusy) return
    if (dirty) setDiscard(() => action)
    else action()
  }
  function open(id: string, quick = false, tab: PayrollPanelTab = 'payments') {
    setDirty(false)
    setSelection({ id, quick, tab })
  }
  function changeMonth(next: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(next) || next < '2000-01' || next > '2100-12') return
    guard(() => {
      setDirty(false)
      setSelection(null)
      setMonth(next)
    })
  }
  function status(entry: (typeof rows)[number]) {
    if (entry.suspended) return t('معلّق', 'Suspended')
    if (!entry.row)
      return entry.previous?.salary_type === 'piecework'
        ? t('لا أعمال مسعّرة', 'No priced work')
        : t('لم يُحدد الراتب', 'Salary not set')
    if (entry.remaining < -0.009) return t('رصيد سالب', 'Negative balance')
    if (entry.remaining > 0.009)
      return entry.paid > 0
        ? t('مدفوع جزئيًا', 'Partly paid')
        : t('بانتظار الدفع', 'Awaiting payment')
    return entry.due > 0 ? t('مكتمل', 'Paid') : t('لا مستحقات', 'No entitlement')
  }
  const titleMonth = new Date(`${month}-15T12:00:00+03:00`).toLocaleDateString(
    isArabic ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB',
    { month: 'long', year: 'numeric' }
  )

  async function addWorker(event: React.FormEvent) {
    event.preventDefault()
    if (!admin || creating) return
    setCreating(true)
    setCreateError('')
    try {
      const unique = crypto.randomUUID()
      const result = await workerService.create({
        full_name: newWorker.name.trim(),
        phone: newWorker.phone.trim() || undefined,
        specialty: newWorker.specialty.trim(),
        worker_type: 'tailor',
        email: `payroll.worker.${unique}@yasmin-alsham.internal`,
        password: crypto.randomUUID() + crypto.randomUUID()
      })
      if (result.error || !result.data) throw new Error(result.error || 'Unable to create worker')
      setShowAdd(false)
      setNewWorker({ name: '', phone: '', specialty: '' })
      await load()
      setSelection({ id: result.data.id, tab: 'settings', quick: false })
      toast.success(
        t('أُضيف العامل. حدد نوع راتبه للبدء.', 'Worker added. Set their salary type to begin.')
      )
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : t('تعذر إضافة العامل', 'Unable to add worker')
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      dir={isArabic ? 'rtl' : 'ltr'}
      className={
        embeddedWorkerId
          ? 'min-w-0'
          : 'min-h-screen bg-[#f6f5f2] px-3 py-5 text-stone-900 sm:px-6 sm:py-8'
      }
    >
      <div className={embeddedWorkerId ? 'space-y-5' : 'mx-auto max-w-6xl space-y-6'}>
        <header className="space-y-5">
          {!embeddedWorkerId && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Link
                  href="/dashboard/accounting/tailoring/"
                  className="mb-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-stone-500"
                >
                  <ArrowRight className={`h-3.5 w-3.5 ${isArabic ? '' : 'rotate-180'}`} />
                  {t('محاسبة التفصيل', 'Tailoring accounting')}
                </Link>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('رواتب العمال', 'Worker payroll')}
                </h1>
                <p className="mt-2 text-sm text-stone-500">
                  {t(
                    'مستحقات واضحة، ودفعات وديون في مكان واحد.',
                    'Clear entitlements, payments and debts in one place.'
                  )}
                </p>
              </div>
              <details className="relative self-start pt-2">
                <summary className={`${payrollSecondary} list-none cursor-pointer`}>
                  {t('المزيد', 'More')}
                </summary>
                <div className="absolute end-0 z-20 mt-2 w-48 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
                  {admin && (
                    <button
                      className={`${payrollButton} w-full justify-start text-stone-700`}
                      onClick={() => setShowAdd(true)}
                    >
                      <Plus className="h-4 w-4" />
                      {t('إضافة عامل', 'Add worker')}
                    </button>
                  )}
                  <Link
                    className={`${payrollButton} w-full justify-start text-stone-700`}
                    href="/dashboard/reports/"
                  >
                    {t('التقارير', 'Reports')}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </details>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1 rounded-xl border border-stone-200 bg-white p-1">
              <button
                aria-label={t('الشهر السابق', 'Previous month')}
                className={`${payrollButton} px-3`}
                onClick={() => changeMonth(shiftPayrollMonth(month, -1))}
              >
                {isArabic ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
              <label className="relative flex min-h-11 min-w-0 items-center rounded-lg text-center text-sm font-semibold text-stone-800 focus-within:ring-2 focus-within:ring-teal-700">
                <span className="pointer-events-none block px-1">{titleMonth}</span>
                <input
                  type="month"
                  aria-label={t('شهر الراتب', 'Payroll month')}
                  value={month}
                  min="2000-01"
                  max="2100-12"
                  onChange={(e) => changeMonth(e.target.value)}
                  className="absolute inset-0 w-full cursor-pointer opacity-0"
                />
              </label>
              <button
                aria-label={t('الشهر التالي', 'Next month')}
                className={`${payrollButton} px-3`}
                onClick={() => changeMonth(shiftPayrollMonth(month, 1))}
              >
                {isArabic ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </div>
            <button
              disabled={loading}
              onClick={() => load()}
              className={`${payrollButton} shrink-0 px-3 text-stone-500`}
              aria-label={t('تحديث البيانات', 'Refresh data')}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('تحديث', 'Refresh')}</span>
            </button>
          </div>
        </header>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800"
          >
            {t(
              'تعذر تحميل أحدث بيانات الرواتب. أعد المحاولة قبل تسجيل أي عملية.',
              'Unable to load current payroll data. Retry before recording an entry.'
            )}
            <button className="ms-3 underline" onClick={() => load()}>
              {t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        )}
        {!data && loading && (
          <div role="status" className="space-y-3 py-4">
            <p className="text-sm text-stone-500">{t('جاري تحميل الرواتب…', 'Loading payroll…')}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200/60" />
            ))}
          </div>
        )}
        {data && !embeddedWorkerId && (
          <>
            <section
              className="rounded-2xl bg-teal-900 px-5 py-5 text-white sm:px-7 sm:py-6"
              aria-label={t('ملخص الشهر', 'Monthly summary')}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-teal-100">
                    {t('المتبقي للصرف هذا الشهر', 'Remaining to pay this month')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                    {money(totals.remaining)}
                  </p>
                </div>
                <p className="flex items-center gap-2 text-sm text-teal-100">
                  <Users className="h-4 w-4" />
                  {totals.pending} {t('عامل لديهم مستحقات', 'workers with outstanding pay')}
                </p>
              </div>
              <details className="mt-4 border-t border-white/15 pt-3">
                <summary className="cursor-pointer py-1 text-sm text-teal-100">
                  {t('تفاصيل إجماليات الشهر', 'Monthly totals')}
                </summary>
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-4">
                  {[
                    [t('مستحق الرواتب', 'Salary entitlement'), totals.due],
                    [t('المسدّد من الراتب', 'Salary settled'), totals.paid],
                    [t('النقد المصروف', 'Cash disbursed'), totals.cash],
                    [t('الديون المستقلة', 'Separate debts'), totals.debt]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-teal-100">{label}</dt>
                      <dd className="mt-1 font-semibold tabular-nums">{money(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-xs leading-6 text-teal-100">
                  {t(
                    'النقد المصروف يشمل دفعات الراتب والديون الجديدة، ويستبعد تسويات الدين غير النقدية. الإجماليات تخص الشهر كاملًا ولا تتغير عند البحث.',
                    'Cash disbursed includes salary payments and new debts, excluding non-cash debt settlements. Totals cover the full month and do not change with search.'
                  )}
                </p>
              </details>
            </section>
            <section className="space-y-4" aria-label={t('قائمة العمال', 'Workers')}>
              <div className="flex gap-2">
                <label className="relative block min-w-0 flex-1">
                  <Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-stone-400" />
                  <input
                    aria-label={t('البحث عن عامل', 'Search workers')}
                    placeholder={t('ابحث باسم العامل أو هاتفه…', 'Search by name or phone…')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-stone-200 bg-white py-3 pe-3 ps-10 text-sm outline-none focus:border-teal-600"
                  />
                </label>
                <button
                  aria-label={t('تصفية العمال', 'Filter workers')}
                  aria-expanded={showFilters}
                  className={payrollSecondary}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', t('الكل', 'All')],
                    ['due', t('لديهم مستحقات', 'Outstanding pay')],
                    ['debt', t('عليهم ديون', 'With debt')]
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={`${payrollButton} border ${filter === value ? 'border-teal-800 bg-teal-800 text-white' : 'border-stone-200 bg-white text-stone-600'}`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ms-auto flex items-center text-xs text-stone-500">
                  {visible.length} / {rows.length}
                </span>
              </div>
              {showFilters && (
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-stone-100 p-3">
                  <label className="text-xs text-stone-600">
                    {t('الحالة', 'Status')}
                    <select
                      className={payrollInput}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as WorkerFilter)}
                    >
                      <option value="all">{t('الكل', 'All')}</option>
                      <option value="due">{t('لديهم مستحقات', 'Outstanding pay')}</option>
                      <option value="paid">{t('مكتمل السداد', 'Fully paid')}</option>
                      <option value="debt">{t('عليهم ديون', 'With debt')}</option>
                      <option value="suspended">{t('معلّقون', 'Suspended')}</option>
                    </select>
                  </label>
                  <label className="text-xs text-stone-600">
                    {t('نوع الراتب', 'Salary type')}
                    <select
                      className={payrollInput}
                      value={salaryFilter}
                      onChange={(e) => setSalaryFilter(e.target.value)}
                    >
                      <option value="all">{t('الكل', 'All')}</option>
                      <option value="fixed">{t('ثابت', 'Fixed')}</option>
                      <option value="piecework">{t('بالقطعة', 'Piecework')}</option>
                    </select>
                  </label>
                </div>
              )}
              {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">
                  {t('لا يوجد عمال مطابقون لهذه الخيارات.', 'No workers match these filters.')}
                </div>
              ) : (
                <>
                  <div className="space-y-3 lg:hidden">
                    {visible.map((entry) => (
                      <article
                        key={entry.worker.id}
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              className="min-h-9 break-words text-start font-bold text-stone-900"
                              onClick={() => open(entry.worker.id)}
                            >
                              {entry.worker.user.full_name}
                            </button>
                            <p className="mt-1 text-xs text-stone-500">
                              {entry.salaryType === 'piecework'
                                ? t('بالقطعة · تلقائي', 'Piecework · automatic')
                                : t('راتب ثابت', 'Fixed salary')}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium ${entry.suspended ? 'bg-stone-100 text-stone-500' : entry.remaining > 0.009 ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800'}`}
                          >
                            {status(entry)}
                          </span>
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-xs text-stone-500">
                              {t('المتبقي من الراتب', 'Salary remaining')}
                            </p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
                              {money(entry.remaining)}
                            </p>
                          </div>
                          {entry.debt > 0.009 && (
                            <button
                              className="min-h-11 text-xs font-medium text-amber-800"
                              onClick={() => open(entry.worker.id, false, 'debts')}
                            >
                              {t('دين:', 'Debt:')} {money(entry.debt)}
                            </button>
                          )}
                        </div>
                        <div className="mt-4 flex gap-2">
                          {admin && (
                            <button
                              disabled={error || entry.remaining <= 0.009}
                              className={`${payrollPrimary} flex-1`}
                              onClick={() => open(entry.worker.id, true)}
                            >
                              <Wallet className="h-4 w-4" />
                              {t('تسجيل دفعة', 'Pay')}
                            </button>
                          )}
                          <button
                            className={`${payrollSecondary} ${admin ? '' : 'flex-1'}`}
                            onClick={() => open(entry.worker.id)}
                          >
                            {t('التفاصيل', 'Details')}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white lg:block">
                    <table className="w-full text-start text-sm">
                      <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
                        <tr>
                          {[
                            t('العامل', 'Worker'),
                            t('مستحق الشهر', 'Entitlement'),
                            t('المسدّد', 'Settled'),
                            t('المتبقي', 'Remaining'),
                            t('الحالة', 'Status'),
                            t('الإجراء', 'Action')
                          ].map((label) => (
                            <th key={label} className="px-4 py-4 text-start font-medium">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {visible.map((entry) => (
                          <tr key={entry.worker.id} className="hover:bg-stone-50/60">
                            <td className="px-4 py-4">
                              <button
                                onClick={() => open(entry.worker.id)}
                                className="min-h-9 text-start font-semibold text-stone-900"
                              >
                                {entry.worker.user.full_name}
                              </button>
                              <p className="text-xs text-stone-500">
                                {entry.salaryType === 'piecework'
                                  ? t('بالقطعة · تلقائي', 'Piecework · automatic')
                                  : t('راتب ثابت', 'Fixed salary')}
                                {entry.debt > 0.009
                                  ? ` · ${t('دين', 'Debt')} ${money(entry.debt)}`
                                  : ''}
                              </p>
                            </td>
                            <td className="px-4 py-4 tabular-nums">{money(entry.due)}</td>
                            <td className="px-4 py-4 tabular-nums text-stone-500">
                              {money(entry.paid)}
                            </td>
                            <td className="px-4 py-4 font-bold tabular-nums">
                              {money(entry.remaining)}
                            </td>
                            <td className="px-4 py-4 text-xs text-stone-600">{status(entry)}</td>
                            <td className="px-4 py-4">
                              {admin && entry.remaining > 0.009 ? (
                                <button
                                  disabled={error}
                                  className={payrollPrimary}
                                  onClick={() => open(entry.worker.id, true)}
                                >
                                  {t('تسجيل دفعة', 'Pay')}
                                </button>
                              ) : (
                                <button
                                  className={payrollSecondary}
                                  onClick={() => open(entry.worker.id)}
                                >
                                  {t('التفاصيل', 'Details')}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}
        {selected && embeddedWorkerId && (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
            <PayrollWorkerPanel
              key={`${selected.worker.id}-${month}`}
              {...selected}
              month={month}
              arabic={isArabic}
              admin={admin && !error}
              revision={revision}
              onRefresh={load}
              onDirty={setDirty}
              onBusy={setPanelBusy}
            />
          </div>
        )}
        {data && embeddedWorkerId && !selected && (
          <p className="py-8 text-center text-sm text-stone-500">
            {t('تعذر العثور على ملف العامل.', 'Worker record not found.')}
          </p>
        )}
      </div>
      {selected && selection && !embeddedWorkerId && (
        <PayrollDialog
          full
          title={selected.worker.user.full_name}
          arabic={isArabic}
          onClose={() =>
            guard(() => {
              setSelection(null)
              setDirty(false)
            })
          }
        >
          <PayrollWorkerPanel
            key={`${selected.worker.id}-${month}`}
            {...selected}
            month={month}
            arabic={isArabic}
            admin={admin && !error}
            initialTab={selection.tab}
            quickPay={selection.quick}
            revision={revision}
            onRefresh={load}
            onDirty={setDirty}
            onBusy={setPanelBusy}
          />
        </PayrollDialog>
      )}
      {discard && (
        <PayrollDialog
          title={t('تغييرات غير محفوظة', 'Unsaved changes')}
          arabic={isArabic}
          onClose={() => setDiscard(null)}
        >
          <p className="text-sm leading-7 text-stone-600">
            {t(
              'لديك مدخلات لم تُحفظ. هل تريد تركها والمتابعة؟',
              'You have unsaved input. Discard it and continue?'
            )}
          </p>
          <div className="mt-4 flex gap-2">
            <button className={payrollPrimary} onClick={() => setDiscard(null)}>
              {t('العودة للتعديل', 'Keep editing')}
            </button>
            <button
              className={payrollSecondary}
              onClick={() => {
                discard()
                setDiscard(null)
                setDirty(false)
              }}
            >
              {t('تجاهل والمتابعة', 'Discard and continue')}
            </button>
          </div>
        </PayrollDialog>
      )}
      {showAdd && (
        <PayrollDialog
          title={t('إضافة عامل للرواتب', 'Add payroll worker')}
          arabic={isArabic}
          onClose={() => {
            if (!creating) setShowAdd(false)
          }}
        >
          <form onSubmit={addWorker} className="space-y-4">
            <fieldset disabled={creating} className="space-y-4">
              <label className="block text-sm text-stone-700">
                {t('اسم العامل', 'Worker name')}
                <input
                  autoFocus
                  required
                  className={payrollInput}
                  value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                />
              </label>
              <label className="block text-sm text-stone-700">
                {t('التخصص', 'Specialty')}
                <input
                  required
                  className={payrollInput}
                  value={newWorker.specialty}
                  onChange={(e) => setNewWorker({ ...newWorker, specialty: e.target.value })}
                />
              </label>
              <label className="block text-sm text-stone-700">
                {t('الهاتف · اختياري', 'Phone · optional')}
                <input
                  type="tel"
                  className={payrollInput}
                  value={newWorker.phone}
                  onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })}
                />
              </label>
              {createError && (
                <p role="alert" className="text-sm text-rose-700">
                  {createError}
                </p>
              )}
              <button type="submit" className={`${payrollPrimary} w-full`}>
                {creating
                  ? t('جاري الإضافة…', 'Adding…')
                  : t('إضافة وتحديد الراتب', 'Add and set salary')}
              </button>
            </fieldset>
          </form>
        </PayrollDialog>
      )}
    </div>
  )
}
