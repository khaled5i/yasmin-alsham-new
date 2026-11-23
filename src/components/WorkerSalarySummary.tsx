'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Eye,
  EyeOff,
  HandCoins,
  Hourglass,
  RefreshCw,
  Wallet
} from 'lucide-react'
import { payrollMoney, payrollMonth, shiftPayrollMonth } from '@/lib/payroll-display'
import {
  getMyWorkerSalarySummary,
  type WorkerSalarySummary as WorkerSalarySummaryData
} from '@/lib/services/worker-salary-summary-service'

interface WorkerSalarySummaryProps {
  userId: string
  language: 'ar' | 'en'
}

const HIDE_KEY = 'worker-salary-hidden'
const EPS = 0.009
const MONTH_OPTIONS = 12

export default function WorkerSalarySummary({ userId, language }: WorkerSalarySummaryProps) {
  const ar = language === 'ar'
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const currentMonth = payrollMonth()
  const [month, setMonth] = useState(currentMonth)
  const [summary, setSummary] = useState<WorkerSalarySummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [hidden, setHidden] = useState(false)
  const request = useRef(0)

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === '1')
    } catch {
      /* التخزين غير متاح: تبقى المبالغ ظاهرة */
    }
  }, [])

  const toggleHidden = () => {
    setHidden((value) => {
      try {
        localStorage.setItem(HIDE_KEY, value ? '0' : '1')
      } catch {
        /* يكفي تغيير العرض الحالي */
      }
      return !value
    })
  }

  const load = useCallback(async () => {
    const id = ++request.current
    setIsLoading(true)
    setHasError(false)
    try {
      const data = await getMyWorkerSalarySummary(userId, month)
      if (id === request.current) setSummary(data)
    } catch (error) {
      console.error('Failed to load worker salary summary:', error)
      if (id === request.current) setHasError(true)
    } finally {
      if (id === request.current) setIsLoading(false)
    }
  }, [userId, month])

  useEffect(() => {
    void load()
  }, [load])

  const money = (value: number) => (hidden ? '••••' : payrollMoney(value, ar))
  const show = (value: number) => (isLoading && !summary ? '...' : money(value))

  const monthLabel = (value: string) =>
    new Date(`${value}-15T12:00:00+03:00`).toLocaleDateString(ar ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
      month: 'long',
      year: 'numeric'
    })
  const monthOptions = Array.from({ length: MONTH_OPTIONS }, (_, index) => shiftPayrollMonth(currentMonth, -index))
  const paymentDate = (date: string) =>
    new Date(`${date}T12:00:00+03:00`).toLocaleDateString(ar ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
      day: 'numeric',
      month: 'short'
    })

  const isCurrent = month === currentMonth
  const s = summary && summary.month === month ? summary : null
  const remaining = s?.remaining ?? 0
  const overpaid = remaining < -EPS
  const fullyPaid = !!s && s.due > EPS && Math.abs(remaining) <= EPS
  const cashPayments = s?.payments.filter((p) => !p.isDebtSettlement).length ?? 0

  const breakdown = s
    ? [
        {
          label: s.salaryType === 'piecework' ? tx('قيمة الأعمال المسعّرة', 'Priced work') : tx('الراتب الثابت', 'Fixed salary'),
          value: s.base,
          sign: 1
        },
        { label: tx('عمل إضافي', 'Overtime'), value: s.overtime, sign: 1 },
        { label: tx('بدلات', 'Allowances'), value: s.allowances, sign: 1 },
        { label: tx('سلف مخصومة', 'Advances deducted'), value: s.advances, sign: -1 },
        { label: tx('خصم من الراتب', 'Salary deduction'), value: s.salaryDeductions, sign: -1 }
      ].filter((line, index) => index === 0 || Math.abs(line.value) > EPS)
    : []

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 }}
      className="relative mb-6 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm sm:mb-8"
      aria-labelledby="worker-salary-title"
      dir={ar ? 'rtl' : 'ltr'}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-indigo-500 via-violet-400 to-fuchsia-400" />
      <div className="p-4 sm:p-6">
        {/* العنوان + الشهر */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-950 text-white shadow-sm">
              <Wallet className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="worker-salary-title" className="text-lg font-black text-slate-900 sm:text-xl">
                {tx('راتبي', 'My salary')}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {isCurrent ? tx('راتب الشهر الحالي', 'This month’s salary') : tx('راتب شهر سابق', 'A previous month’s salary')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleHidden}
              className="grid h-9 w-9 place-items-center rounded-xl border border-indigo-200 text-indigo-700 transition hover:bg-indigo-50"
              title={hidden ? tx('إظهار المبالغ', 'Show amounts') : tx('إخفاء المبالغ', 'Hide amounts')}
              aria-label={hidden ? tx('إظهار المبالغ', 'Show amounts') : tx('إخفاء المبالغ', 'Hide amounts')}
              aria-pressed={hidden}
            >
              {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="grid h-9 w-9 place-items-center rounded-xl border border-indigo-200 text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60"
              title={tx('تحديث', 'Refresh')}
              aria-label={tx('تحديث', 'Refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* اختيار الشهر: قائمة واضحة بآخر 12 شهراً */}
        <label className="mt-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            {tx('الشهر', 'Month')}
          </span>
          <span className="relative block w-full sm:w-64">
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border-2 border-indigo-200 bg-indigo-50/60 pe-10 ps-4 text-base font-bold text-indigo-950 outline-none transition hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              {monthOptions.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                  {value === currentMonth ? ` — ${tx('الشهر الحالي', 'current')}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-600" />
          </span>
        </label>

        {hasError ? (
          <div
            className="mt-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{tx('تعذر تحميل ملخص الراتب', 'Salary summary could not be loaded')}</span>
          </div>
        ) : s && !s.hasSalary && !(s.debt > EPS) ? (
          <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {tx('لا يوجد راتب مسجّل لك في', 'No salary recorded for you in')} {monthLabel(month)}.
          </p>
        ) : (
          <div aria-live="polite" aria-busy={isLoading}>
            {s?.suspended && (
              <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                {tx(
                  'راتبك معلّق في هذا الشهر. للاستفسار راجع الإدارة.',
                  'Your salary is on hold this month. Please contact management.'
                )}
              </p>
            )}

            {/* الأرقام الأساسية */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
                  <CircleDollarSign className="h-4 w-4 shrink-0" />
                  {tx('الراتب الكلي', 'Total salary')}
                </div>
                <p className="mt-3 text-xl font-black tabular-nums text-slate-950 sm:text-2xl">{show(s?.due ?? 0)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {s?.salaryType === 'piecework'
                    ? tx('حسب القطع المسعّرة', 'Based on priced pieces')
                    : tx('راتب شهري ثابت', 'Fixed monthly salary')}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <HandCoins className="h-4 w-4 shrink-0" />
                  {tx('المدفوع لك', 'Paid to you')}
                </div>
                <p className="mt-3 text-xl font-black tabular-nums text-slate-950 sm:text-2xl">{show(s?.paid ?? 0)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {cashPayments > 0
                    ? tx(
                        cashPayments === 1 ? 'دفعة واحدة' : cashPayments === 2 ? 'دفعتان' : `${cashPayments} دفعات`,
                        `${cashPayments} payment${cashPayments === 1 ? '' : 's'}`
                      )
                    : tx('لا دفعات بعد', 'No payments yet')}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  overpaid
                    ? 'border-sky-100 bg-[linear-gradient(135deg,#f0f9ff_0%,#ffffff_100%)]'
                    : 'border-violet-100 bg-[linear-gradient(135deg,#f5f3ff_0%,#ffffff_100%)]'
                }`}
              >
                <div className={`flex items-center gap-2 text-xs font-bold ${overpaid ? 'text-sky-700' : 'text-violet-700'}`}>
                  {fullyPaid ? <BadgeCheck className="h-4 w-4 shrink-0" /> : <Hourglass className="h-4 w-4 shrink-0" />}
                  {overpaid ? tx('مدفوع مقدّماً', 'Paid in advance') : tx('المتبقي من الراتب', 'Salary remaining')}
                </div>
                <p className="mt-3 text-xl font-black tabular-nums text-slate-950 sm:text-2xl">
                  {show(overpaid ? Math.abs(remaining) : Math.max(0, remaining))}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {overpaid
                    ? tx('استلمت أكثر من مستحقك حتى الآن', 'You received more than earned so far')
                    : fullyPaid
                      ? tx('استلمت راتبك كاملاً', 'Salary fully paid')
                      : tx('لم يُصرف بعد', 'Not paid yet')}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  (s?.debt ?? 0) > EPS
                    ? 'border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)]'
                    : 'border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]'
                }`}
              >
                <div className={`flex items-center gap-2 text-xs font-bold ${(s?.debt ?? 0) > EPS ? 'text-amber-700' : 'text-slate-600'}`}>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {tx('الدين عليك', 'Your debt')}
                </div>
                <p className="mt-3 text-xl font-black tabular-nums text-slate-950 sm:text-2xl">{show(s?.debt ?? 0)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {(s?.debt ?? 0) > EPS
                    ? isCurrent
                      ? tx('دين مستقل عن الراتب', 'Separate from salary')
                      : tx('رصيدك الحالي، مستقل عن الراتب', 'Current balance, separate from salary')
                    : tx('لا يوجد دين', 'No debt')}
                </p>
              </div>
            </div>

            {s && (s.hasSalary || s.payments.length > 0) && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {/* تفاصيل الراتب */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <h3 className="text-sm font-black text-slate-800">{tx('تفاصيل الراتب', 'Salary details')}</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    {breakdown.map((line) => (
                      <div key={line.label} className="flex items-center justify-between gap-3">
                        <dt className="text-slate-600">{line.label}</dt>
                        <dd className={`font-bold tabular-nums ${line.sign < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                          {line.sign < 0 && !hidden ? '− ' : ''}
                          {money(line.value)}
                        </dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                      <dt className="font-bold text-slate-800">{tx('الراتب الكلي', 'Total salary')}</dt>
                      <dd className="font-black tabular-nums text-indigo-900">{money(s.due)}</dd>
                    </div>
                  </dl>
                  {s.isEstimated && (
                    <p className="mt-3 text-[11px] text-slate-500">
                      {tx('حسب آخر راتب ثابت محفوظ لك.', 'Based on your last saved fixed salary.')}
                    </p>
                  )}
                  {s.salaryType === 'piecework' && isCurrent && (
                    <p className="mt-3 text-[11px] text-slate-500">
                      {tx('يزيد راتبك مع كل قطعة تُسعَّر لك هذا الشهر.', 'Your salary grows with every piece priced this month.')}
                    </p>
                  )}
                </div>

                {/* دفعات الشهر */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <h3 className="text-sm font-black text-slate-800">
                    {tx('دفعات', 'Payments for')} {monthLabel(month)}
                  </h3>
                  {s.payments.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">{tx('لا توجد دفعات مسجّلة.', 'No payments recorded.')}</p>
                  ) : (
                    <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
                      {s.payments.map((payment) => (
                        <li key={payment.id} className="flex items-center justify-between gap-3">
                          <span className="text-slate-600">
                            {paymentDate(payment.date)}
                            {payment.isDebtSettlement && (
                              <span className="ms-2 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                                {tx('تسوية دين', 'Debt settlement')}
                              </span>
                            )}
                          </span>
                          <span className="font-bold tabular-nums text-emerald-800">{money(payment.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.section>
  )
}
