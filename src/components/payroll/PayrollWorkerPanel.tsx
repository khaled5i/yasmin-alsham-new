'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Wallet,
  History,
  Settings2,
  CircleDollarSign,
  ArrowUpRight,
  Check,
  PauseCircle,
  PlayCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { WorkerWithUser } from '@/lib/services/worker-service'
import type {
  WorkerPayrollMonth,
  WorkerPayrollOperation,
  PayrollSalaryType
} from '@/types/worker-payroll'
import {
  registerWorkerPayrollPayment,
  registerWorkerPayrollAdjustment,
  settleWorkerDebtFromSalary,
  saveTailoringSalarySettings,
  deleteWorkerPayrollOperation,
  deleteWorkerDeductionPayment,
  suspendWorkerPayroll,
  unsuspendWorkerPayroll,
  type WorkerDeductionPayment
} from '@/lib/services/worker-payroll-service'
import {
  payrollAmounts,
  payrollDate,
  payrollMoney,
  notifyPayrollChanged,
  isDebtSettlement
} from '@/lib/payroll-display'
import PayrollDialog, { payrollInput, payrollPrimary, payrollSecondary } from './PayrollDialog'
import PayrollLedger from './PayrollLedger'

export type PayrollPanelTab = 'payments' | 'debts' | 'log' | 'settings'
export interface PayrollWorkerPanelProps {
  worker: WorkerWithUser
  row?: WorkerPayrollMonth
  previous?: WorkerPayrollMonth
  operations: WorkerPayrollOperation[]
  debt: number
  suspended: boolean
  month: string
  arabic: boolean
  admin: boolean
  initialTab?: PayrollPanelTab
  quickPay?: boolean
  revision: number
  onRefresh: () => Promise<void>
  onDirty: (dirty: boolean) => void
  onBusy: (busy: boolean) => void
}

export default function PayrollWorkerPanel({
  worker,
  row,
  previous,
  operations,
  debt,
  suspended,
  month,
  arabic,
  admin,
  initialTab = 'payments',
  quickPay = false,
  revision,
  onRefresh,
  onDirty,
  onBusy
}: PayrollWorkerPanelProps) {
  const t = (ar: string, en: string) => (arabic ? ar : en)
  const money = (n: number) => payrollMoney(n, arabic)
  const [tab, setTab] = useState<PayrollPanelTab>(initialTab)
  const [form, setForm] = useState<'payment' | 'debt' | 'settlement' | null>(
    quickPay ? 'payment' : null
  )
  const [amount, setAmount] = useState('')
  const [full, setFull] = useState(false)
  const [date, setDate] = useState(payrollDate(month))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<{
    message: string
    run: () => Promise<unknown>
  } | null>(null)
  const [salaryType, setSalaryType] = useState<PayrollSalaryType>(
    row?.salary_type || previous?.salary_type || 'fixed'
  )
  const initialFixed = Number(row?.fixed_salary_value ?? previous?.fixed_salary_value ?? 0)
  const [fixed, setFixed] = useState(String(Math.round(initialFixed)))
  const [overtime, setOvertime] = useState(String(Math.round(row?.overtime_total || 0)))
  const [future, setFuture] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  useEffect(() => {
    onDirty(formDirty || settingsDirty)
  }, [formDirty, settingsDirty, onDirty])
  useEffect(() => {
    if (settingsDirty) return
    setSalaryType(row?.salary_type || previous?.salary_type || 'fixed')
    setFixed(String(Math.round(initialFixed)))
    setOvertime(String(Math.round(row?.overtime_total || 0)))
  }, [settingsDirty, row?.salary_type, previous?.salary_type, initialFixed, row?.overtime_total])
  const values = payrollAmounts(row, operations)
  const workerName = worker.user?.full_name || worker.id
  const available =
    form === 'settlement'
      ? Math.max(0, Math.min(debt, values.remaining))
      : Math.max(0, values.remaining)
  const paymentAmount = full ? available : Number(amount || 0)
  const maxDate = payrollDate(month) // current month defaults to today; past months to the last day
  const periodEnd = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`

  async function perform(task: () => Promise<unknown>, success: string, settings = false) {
    if (busyRef.current || !admin) return
    busyRef.current = true
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      await task()
      setForm(null)
      setAmount('')
      setFull(false)
      setNote('')
      setConfirmation(null)
      setFormDirty(false)
      toast.success(success)
      notifyPayrollChanged()
      try {
        await onRefresh()
      } catch {
        toast.error(
          t(
            'حُفظت العملية. تعذر تحديث العرض؛ أعد تحميل البيانات.',
            'Entry saved. The view could not refresh; reload the data.'
          )
        )
      }
      if (settings) {
        setSettingsDirty(false)
        setFuture(false)
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('تعذر حفظ العملية. حاول مرة أخرى.', 'Unable to save. Please try again.')
      setError(
        message.includes('uq_worker_payroll_payment_duplicate')
          ? t('هذه الدفعة مسجلة بالفعل.', 'This payment is already recorded.')
          : message
      )
    } finally {
      busyRef.current = false
      setBusy(false)
      onBusy(false)
    }
  }

  async function submitTransaction(event: React.FormEvent) {
    event.preventDefault()
    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      (!full && !Number.isInteger(paymentAmount))
    ) {
      setError(t('أدخل مبلغًا صحيحًا أكبر من صفر.', 'Enter a whole amount greater than zero.'))
      return
    }
    if (!date.startsWith(`${month}-`) || date > periodEnd) {
      setError(t('اختر تاريخًا ضمن الشهر المعروض.', 'Choose a date within the displayed month.'))
      return
    }
    if (form !== 'debt' && paymentAmount > available + 0.009) {
      setError(
        t(
          'المبلغ أكبر من المستحق المتاح. لتسجيل مبلغ مستقل استخدم إضافة دين.',
          'Amount exceeds the available entitlement. Use Add debt for a separate amount.'
        )
      )
      return
    }
    const base = {
      branch: 'tailoring' as const,
      workerId: worker.id,
      workerName,
      monthValue: month,
      amount: paymentAmount,
      operationDate: date,
      note
    }
    await perform(
      async () => {
        if (form === 'payment') return registerWorkerPayrollPayment(base)
        if (form === 'debt')
          return registerWorkerPayrollAdjustment({ ...base, operationType: 'deduction' })
        return settleWorkerDebtFromSalary({ ...base, paymentDate: date })
      },
      t('تم تسجيل العملية وتحديث الرصيد', 'Entry recorded and balance updated')
    )
  }

  function startForm(next: 'payment' | 'debt' | 'settlement') {
    setForm(next)
    setAmount('')
    setFull(false)
    setNote('')
    setError('')
    setDate(maxDate)
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    const fixedValue = fixed === String(Math.round(initialFixed)) ? initialFixed : Number(fixed)
    const previousOvertime = Number(row?.overtime_total || 0)
    const overtimeValue =
      overtime === String(Math.round(previousOvertime)) ? previousOvertime : Number(overtime)
    if (![fixedValue, overtimeValue].every((n) => Number.isFinite(n) && n >= 0)) {
      setError(t('تحقق من مبالغ الراتب والعمل الإضافي.', 'Check salary and overtime amounts.'))
      return
    }
    await perform(
      async () => {
        await saveTailoringSalarySettings({
          workerId: worker.id,
          monthValue: month,
          salaryType,
          fixedSalaryValue: fixedValue,
          overtimeTotal: overtimeValue,
          applyFuture: future,
          operationDate: payrollDate(month),
          note: t(
            'تحديث إعداد راتب الشهر من صفحة الرواتب',
            'Monthly salary settings updated from payroll'
          )
        })
      },
      t('تم حفظ إعداد الراتب', 'Salary settings saved'),
      true
    )
  }

  function confirmDelete(
    entry: WorkerPayrollOperation | WorkerDeductionPayment,
    debtPayment: boolean
  ) {
    setConfirmation({
      message: t(
        `سيتم حذف العملية بقيمة ${money(entry.amount)} وتصحيح أثرها على الراتب أو الدين. سيبقى باقي السجل محفوظًا.`,
        `Delete the ${money(entry.amount)} entry and reverse its salary or debt effect. Other entries are preserved.`
      ),
      run: () =>
        debtPayment
          ? deleteWorkerDeductionPayment(entry.id)
          : deleteWorkerPayrollOperation(entry.id)
    })
  }

  const tabs = [
    { id: 'payments' as const, label: t('الدفعات', 'Payments'), icon: Wallet },
    { id: 'debts' as const, label: t('الديون', 'Debts'), icon: CircleDollarSign },
    { id: 'log' as const, label: t('السجل', 'History'), icon: History },
    { id: 'settings' as const, label: t('إعداد الراتب', 'Salary'), icon: Settings2 }
  ]

  return (
    <div className="space-y-5" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">
            {t('المتبقي من راتب', 'Salary remaining for')} {month}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-teal-900">
            {money(values.remaining)}
          </p>
        </div>
        <Link
          href={`/dashboard/worker-monitoring/${worker.id}/`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-teal-800"
        >
          {t('متابعة أعمال العامل', 'Worker activity')}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-stone-100 pb-5 text-sm text-stone-600">
        <span>
          {t('مستحق الشهر:', 'Monthly entitlement:')}{' '}
          <strong className="font-semibold text-stone-900">{money(values.due)}</strong>
        </span>
        <span>
          {t('المسدّد من الراتب:', 'Salary settled:')}{' '}
          <strong className="font-semibold text-stone-900">{money(values.paid)}</strong>
        </span>
        {debt > 0.009 && (
          <span>
            {t('دين مستقل:', 'Separate debt:')}{' '}
            <strong className="font-semibold text-amber-800">{money(debt)}</strong>
          </span>
        )}
      </div>
      {!admin && (
        <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
          {t(
            'يمكنك مراجعة التفاصيل؛ تسجيل العمليات متاح للإدارة.',
            'You can review details; only administrators can record changes.'
          )}
        </p>
      )}
      {suspended && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t(
            'راتب العامل معلّق ومستبعد من ملخص المستحقات. سجلاته السابقة متاحة للمراجعة.',
            'Payroll is suspended and excluded from the entitlement summary. Previous entries remain available.'
          )}
        </p>
      )}
      <div
        className="grid grid-cols-4 gap-1 border-b border-stone-200"
        role="group"
        aria-label={t('تفاصيل العامل', 'Worker details')}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            aria-controls={`payroll-tab-${worker.id}`}
            disabled={busy}
            onClick={() => {
              if (formDirty) {
                setError(
                  t(
                    'احفظ العملية أو ألغها قبل الانتقال.',
                    'Save or cancel the entry before switching.'
                  )
                )
                return
              }
              setTab(id)
              setForm(null)
              setError('')
            }}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 text-[11px] font-semibold sm:flex-row sm:gap-2 sm:text-sm ${tab === id ? 'border-teal-800 text-teal-900' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">
          {error}
        </p>
      )}
      <div id={`payroll-tab-${worker.id}`}>
        {tab === 'payments' && (
          <div className="space-y-5">
            {previous && previous.remaining_due > 0.009 && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                {t(
                  `يوجد ${money(previous.remaining_due)} متبقٍ في آخر شهر مسجل (${previous.payroll_year}-${String(previous.payroll_month).padStart(2, '0')}). راجعه في شهره؛ لا يُضاف إلى مبلغ الشهر الحالي.`,
                  `${money(previous.remaining_due)} remains in the previous recorded month (${previous.payroll_year}-${String(previous.payroll_month).padStart(2, '0')}). Review it in that month; it is not included here.`
                )}
              </div>
            )}
            {!form && admin && (
              <button
                className={`${payrollPrimary} w-full sm:w-auto`}
                disabled={values.remaining <= 0.009 || !row}
                onClick={() => startForm('payment')}
              >
                <Wallet className="h-4 w-4" />
                {t('تسجيل دفعة', 'Record payment')}
              </button>
            )}
            {!row && (
              <p className="text-sm leading-6 text-stone-500">
                {previous?.salary_type === 'piecework'
                  ? t(
                      'لا توجد أعمال مسعّرة لهذا الشهر بعد. عند تسعير عمل مكتمل سيظهر مستحقه هنا تلقائيًا.',
                      'No priced work for this month yet. Pricing completed work will automatically add its entitlement here.'
                    )
                  : t(
                      'لم يُحدد راتب لهذا الشهر بعد. افتح إعداد الراتب لتحديد نوعه مرة واحدة؛ مبالغ القطع تتحدث تلقائيًا بعد ذلك.',
                      'Salary is not set for this month. Open Salary to set its type once; piecework amounts then update automatically.'
                    )}
              </p>
            )}
            {values.settledDebt > 0.009 && (
              <p className="text-sm leading-6 text-stone-500">
                {t(
                  `من المسدّد: ${money(values.cashPaid)} دفعات نقدية و${money(values.settledDebt)} تسويات ديون.`,
                  `Settled amount includes ${money(values.cashPaid)} in cash payments and ${money(values.settledDebt)} in debt settlements.`
                )}
              </p>
            )}
            {!form && operations.some((op) => op.operation_type === 'payment') && (
              <div>
                <p className="mb-2 text-sm font-semibold text-stone-700">
                  {t('آخر الدفعات', 'Recent payments')}
                </p>
                {[...operations]
                  .filter((op) => op.operation_type === 'payment')
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .slice(0, 3)
                  .map((op) => (
                    <div
                      key={op.id}
                      className="flex items-center justify-between gap-3 border-b border-stone-100 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-stone-700">
                          {isDebtSettlement(op)
                            ? t('تسوية دين من الراتب', 'Debt settled from salary')
                            : t('دفعة راتب', 'Salary payment')}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">{op.operation_date}</p>
                      </div>
                      <strong className="tabular-nums text-stone-900">{money(op.amount)}</strong>
                    </div>
                  ))}
                <button
                  className="mt-3 min-h-11 text-sm font-semibold text-teal-800"
                  onClick={() => setTab('log')}
                >
                  {t('عرض السجل والتفاصيل', 'View history and details')}
                </button>
              </div>
            )}
          </div>
        )}
        {tab === 'debts' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-stone-500">
                {t('الدين المتبقي على العامل', 'Outstanding worker debt')}
              </p>
              <p className="mt-1 text-2xl font-bold text-stone-900">{money(debt)}</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {t(
                  'الدين مستقل عن الراتب. عند تسويته من المستحق ينخفض الدين والمتبقي من الراتب معًا، دون صرف مبلغ جديد.',
                  'Debt is separate from salary. Settling it from entitlement reduces both debt and remaining salary, without a new cash payment.'
                )}
              </p>
            </div>
            {!form && admin && (
              <div className="grid grid-cols-2 gap-2">
                <button className={payrollSecondary} onClick={() => startForm('debt')}>
                  {t('إضافة دين', 'Add debt')}
                </button>
                <button
                  className={payrollPrimary}
                  disabled={debt <= 0.009 || values.remaining <= 0.009}
                  onClick={() => startForm('settlement')}
                >
                  {t('تسوية من الراتب', 'Settle from salary')}
                </button>
              </div>
            )}
            {debt > 0.009 && values.remaining <= 0.009 && (
              <p className="text-sm text-stone-500">
                {t(
                  'لا يوجد مستحق متاح للتسوية في هذا الشهر. اختر شهرًا لديه مستحقات.',
                  'This month has no entitlement available for settlement. Select a month with remaining salary.'
                )}
              </p>
            )}
          </div>
        )}
        {(tab === 'payments' || tab === 'debts') && form && (
          <form
            onSubmit={submitTransaction}
            className="mt-4 space-y-4 rounded-2xl border border-stone-200 p-4 sm:p-5"
          >
            <fieldset
              disabled={busy || !admin}
              className="space-y-4"
              onChange={() => setFormDirty(true)}
            >
              <legend className="mb-3 font-semibold text-stone-900">
                {form === 'payment'
                  ? t('دفعة جديدة', 'New payment')
                  : form === 'debt'
                    ? t('تسجيل دين جديد', 'Record new debt')
                    : t('تسوية الدين من مستحق الشهر', 'Settle debt from monthly salary')}
              </legend>
              <label className="block text-sm font-medium text-stone-700">
                {t('المبلغ بالريال', 'Amount in SAR')}
                <input
                  className={payrollInput}
                  autoFocus
                  type={full ? 'text' : 'number'}
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={
                    full
                      ? t(
                          `كامل المستحق · ${money(available)}`,
                          `Full entitlement · ${money(available)}`
                        )
                      : amount
                  }
                  readOnly={full}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setError('')
                  }}
                  required
                />
              </label>
              {form !== 'debt' && (
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800"
                  onClick={() => {
                    setFull(!full)
                    setFormDirty(true)
                  }}
                >
                  {full && <Check className="h-4 w-4" />}
                  {full
                    ? t('تم اختيار كامل المبلغ المتاح', 'Full available amount selected')
                    : t(
                        `استخدام كامل المبلغ: ${money(available)}`,
                        `Use full amount: ${money(available)}`
                      )}
                </button>
              )}
              <details className="text-sm text-stone-600">
                <summary className="cursor-pointer py-2">
                  {t('التاريخ والملاحظة', 'Date and note')} · {date}
                </summary>
                <div className="mt-2 space-y-3">
                  <label className="block">
                    {t('تاريخ العملية', 'Entry date')}
                    <input
                      className={payrollInput}
                      type="date"
                      required
                      min={`${month}-01`}
                      max={periodEnd}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    {t('ملاحظة اختيارية', 'Optional note')}
                    <textarea
                      rows={2}
                      className={payrollInput}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                </div>
              </details>
              {paymentAmount > 0 && (
                <p className="rounded-xl bg-teal-50 p-3 text-sm leading-6 text-teal-900">
                  {form === 'debt'
                    ? t(
                        `الدين بعد التسجيل: ${money(debt + paymentAmount)}. مستحق الراتب لا يتغير.`,
                        `Debt after this entry: ${money(debt + paymentAmount)}. Salary entitlement is unchanged.`
                      )
                    : t(
                        `المتبقي من الراتب بعد العملية: ${money(values.remaining - paymentAmount)}${form === 'settlement' ? `، والدين: ${money(debt - paymentAmount)}` : ''}.`,
                        `Salary remaining after this entry: ${money(values.remaining - paymentAmount)}${form === 'settlement' ? `; debt: ${money(debt - paymentAmount)}` : ''}.`
                      )}
                </p>
              )}
              <div className="flex gap-2">
                <button type="submit" className={`${payrollPrimary} flex-1`}>
                  {busy ? t('جاري الحفظ…', 'Saving…') : t('تسجيل العملية', 'Record entry')}
                </button>
                <button
                  type="button"
                  className={payrollSecondary}
                  onClick={() => {
                    setForm(null)
                    setAmount('')
                    setNote('')
                    setFull(false)
                    setError('')
                    setFormDirty(false)
                  }}
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {tab === 'log' && (
          <PayrollLedger
            workerId={worker.id}
            month={month}
            revision={revision}
            arabic={arabic}
            admin={admin && !busy}
            onDelete={confirmDelete}
          />
        )}
        {tab === 'settings' && (
          <form className="space-y-5" onSubmit={saveSettings}>
            <p className="text-sm leading-6 text-stone-500">
              {t(
                'يُضبط نوع الراتب عادةً مرة واحدة. لا تحتاج إلى فتح هذا القسم لتسجيل الدفعات أو لترحيل تسعير القطع.',
                'Salary type is usually configured once. Payments and automatic piecework updates do not require opening these settings.'
              )}
            </p>
            <fieldset
              disabled={!admin || busy}
              className="space-y-4"
              onChange={() => setSettingsDirty(true)}
            >
              <label className="block text-sm font-medium text-stone-700">
                {t('نوع الراتب', 'Salary type')}
                <select
                  className={payrollInput}
                  value={salaryType}
                  onChange={(e) => setSalaryType(e.target.value as PayrollSalaryType)}
                >
                  <option value="fixed">{t('راتب ثابت', 'Fixed salary')}</option>
                  <option value="piecework">{t('حسب تسعير القطع', 'Priced piecework')}</option>
                </select>
              </label>
              {salaryType === 'fixed' ? (
                <label className="block text-sm font-medium text-stone-700">
                  {t('الراتب الشهري', 'Monthly salary')}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    className={payrollInput}
                    value={fixed}
                    onChange={(e) => setFixed(e.target.value)}
                    required
                  />
                </label>
              ) : (
                <div className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
                  <p className="font-semibold">
                    {t(
                      'القطع والمكافآت متزامنة تلقائيًا',
                      'Piece prices and bonuses sync automatically'
                    )}
                  </p>
                  <p className="mt-1">
                    {t(
                      'تعديل تسعير العمل المكتمل في متابعة العمال يحدّث راتب شهر إتمامه تلقائيًا، حتى عند تصفير السعر. لا يوجد زر ترحيل.',
                      'Editing completed-work pricing in Worker activity automatically updates its completion-month salary, including clearing prices to zero. No transfer action is needed.'
                    )}
                  </p>
                  <p className="mt-2 font-bold">{money(row?.piece_total || 0)}</p>
                </div>
              )}
              <label className="block text-sm font-medium text-stone-700">
                {t('إضافة عمل إضافي لهذا الشهر', 'Overtime addition for this month')}
                <input
                  className={payrollInput}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={overtime}
                  onChange={(e) => setOvertime(e.target.value)}
                />
              </label>
              {Number(row?.advances_total) > 0 && (
                <p className="text-sm leading-6 text-stone-500">
                  {t(
                    `يوجد خصم تاريخي محفوظ بقيمة ${money(row!.advances_total)} ضمن حساب مستحق هذا الشهر. تفاصيله في السجل.`,
                    `A historical adjustment of ${money(row!.advances_total)} is preserved in this month’s entitlement. See History for details.`
                  )}
                </p>
              )}
              <label className="flex items-start gap-2 text-sm leading-6 text-stone-600">
                <input
                  className="mt-1 h-4 w-4 shrink-0 accent-teal-800"
                  type="checkbox"
                  checked={future}
                  onChange={(e) => setFuture(e.target.checked)}
                />
                {t(
                  'تطبيق نوع الراتب وقيمته الثابتة على الشهور اللاحقة المسجلة أيضًا. لا تُنسخ مبالغ القطع أو العمل الإضافي.',
                  'Also apply salary type and fixed amount to existing later months. Piecework and overtime amounts are not copied.'
                )}
              </label>
              <button className={`${payrollPrimary} w-full sm:w-auto`} type="submit">
                {busy ? t('جاري الحفظ…', 'Saving…') : t('حفظ إعداد الراتب', 'Save salary settings')}
              </button>
              {settingsDirty && (
                <button
                  type="button"
                  className={payrollSecondary}
                  onClick={() => {
                    setSettingsDirty(false)
                    setFuture(false)
                    setError('')
                  }}
                >
                  {t('إلغاء التعديلات', 'Discard changes')}
                </button>
              )}
            </fieldset>
            {admin && (
              <div className="border-t border-stone-100 pt-4">
                <button
                  type="button"
                  disabled={busy}
                  className={payrollSecondary}
                  onClick={() =>
                    setConfirmation({
                      message: suspended
                        ? t(
                            'إعادة إدراج العامل في إجماليات الرواتب من تاريخ التعليق؟',
                            'Include this worker in payroll totals again from the suspension date?'
                          )
                        : t(
                            `تعليق احتساب راتب العامل من ${month} وما بعده؟ ستبقى السجلات والدفعات محفوظة.`,
                            `Suspend payroll from ${month} onward? Existing entries and payments are preserved.`
                          ),
                      run: () =>
                        suspended
                          ? unsuspendWorkerPayroll('tailoring', worker.id, month)
                          : suspendWorkerPayroll('tailoring', worker.id, workerName, month)
                    })
                  }
                >
                  {suspended ? (
                    <PlayCircle className="h-4 w-4" />
                  ) : (
                    <PauseCircle className="h-4 w-4" />
                  )}
                  {suspended
                    ? t('إلغاء تعليق العامل', 'Resume worker payroll')
                    : t('تعليق راتب العامل', 'Suspend worker payroll')}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
      {confirmation && (
        <PayrollDialog
          title={t('تأكيد العملية', 'Confirm action')}
          arabic={arabic}
          onClose={() => {
            if (!busy) setConfirmation(null)
          }}
        >
          <p className="text-sm leading-7 text-stone-700">{confirmation.message}</p>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button
              disabled={busy}
              className={payrollPrimary}
              onClick={() => perform(confirmation.run, t('تم تنفيذ العملية', 'Action completed'))}
            >
              {busy ? t('جاري التنفيذ…', 'Working…') : t('تأكيد', 'Confirm')}
            </button>
            <button
              disabled={busy}
              className={payrollSecondary}
              onClick={() => setConfirmation(null)}
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </PayrollDialog>
      )}
    </div>
  )
}
