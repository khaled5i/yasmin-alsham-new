'use client'

import { useEffect, useMemo, useState } from 'react'
import { History, RefreshCw, Trash2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { getPayrollHistory } from '@/lib/services/payroll-workspace-service'
import type { WorkerPayrollOperation } from '@/types/worker-payroll'
import type { WorkerDeductionPayment } from '@/lib/services/worker-payroll-service'
import { isDebtSettlement, payrollMoney } from '@/lib/payroll-display'
import { payrollSecondary } from './PayrollDialog'

type HistoryData = Awaited<ReturnType<typeof getPayrollHistory>>
export default function PayrollLedger({
  workerId,
  month,
  revision,
  arabic,
  admin,
  onDelete
}: {
  workerId: string
  month: string
  revision: number
  arabic: boolean
  admin: boolean
  onDelete: (entry: WorkerPayrollOperation | WorkerDeductionPayment, debtPayment: boolean) => void
}) {
  const [allPeriods, setAllPeriods] = useState(false)
  const [data, setData] = useState<HistoryData | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [limit, setLimit] = useState(20)
  const t = (ar: string, en: string) => (arabic ? ar : en)
  useEffect(() => {
    setData(null)
    setLimit(20)
  }, [workerId, month, allPeriods])
  useEffect(() => {
    let active = true
    setError(false)
    getPayrollHistory(workerId, allPeriods ? undefined : month)
      .then((result) => {
        if (active) setData(result)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [workerId, month, allPeriods, revision, retry])

  const entries = useMemo(() => {
    if (!data) return []
    const paymentIds = new Set(data.payments.map((p) => p.id))
    const settlements = new Map(
      data.operations
        .filter(isDebtSettlement)
        .map((op) => [String(op.metadata.debt_payment_id), op])
    )
    return [
      ...data.operations
        .filter(
          (op) => !isDebtSettlement(op) || !paymentIds.has(String(op.metadata.debt_payment_id))
        )
        .map((op) => ({ kind: 'operation' as const, at: op.created_at, op })),
      ...data.payments
        .filter((p) => allPeriods || p.payment_date.startsWith(month) || settlements.has(p.id))
        .map((payment) => ({
          kind: 'debt' as const,
          at: payment.created_at,
          payment,
          settlement: settlements.get(payment.id)
        })),
      ...data.pricing.map((event) => ({ kind: 'pricing' as const, at: event.created_at, event }))
    ].sort((a, b) => b.at.localeCompare(a.at))
  }, [data, allPeriods, month])

  const date = (value: string, time = false) =>
    new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value).toLocaleString(
      arabic ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB',
      {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(time ? { hour: '2-digit' as const, minute: '2-digit' as const } : {})
      }
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          {t(
            'كل عملية وسببها وأثرها على رصيد العامل.',
            'Each entry explains its purpose and effect on the worker’s balance.'
          )}
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={allPeriods}
            onChange={(e) => setAllPeriods(e.target.checked)}
            className="h-4 w-4 accent-teal-800"
          />
          {t('جميع الشهور', 'All months')}
        </label>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
          <p>
            {t(
              'تعذر تحميل السجل. لا يعني ذلك عدم وجود عمليات.',
              'History could not be loaded. This does not mean there are no entries.'
            )}
          </p>
          <button className={`${payrollSecondary} mt-3`} onClick={() => setRetry((v) => v + 1)}>
            <RefreshCw className="h-4 w-4" />
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="py-10 text-center text-stone-500">
          {t('جاري تحميل السجل…', 'Loading history…')}
        </p>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-stone-500">
          <History className="mx-auto mb-3 h-7 w-7" />
          {t('لا توجد عمليات في الفترة المحددة.', 'No entries in this period.')}
        </div>
      ) : (
        <ol className="divide-y divide-stone-100">
          {entries.slice(0, limit).map((entry) => {
            const op = entry.kind === 'operation' ? entry.op : null
            const debt = entry.kind === 'debt' ? entry.payment : null
            const pricing = entry.kind === 'pricing' ? entry.event : null
            const title = pricing
              ? t('تحديث تلقائي لراتب القطعة', 'Automatic piecework update')
              : debt
                ? t('سداد دين', 'Debt repayment')
                : op?.operation_type === 'salary'
                  ? t('حفظ إعداد الراتب', 'Salary settings saved')
                  : op?.operation_type === 'deduction'
                    ? t('دين جديد للعامل', 'New worker debt')
                    : op?.operation_type === 'advance'
                      ? t('خصم تاريخي من الراتب', 'Historical salary adjustment')
                      : op && isDebtSettlement(op)
                        ? t('تسوية دين من الراتب', 'Debt settled from salary')
                        : t('دفعة راتب', 'Salary payment')
            const description = pricing
              ? t(
                  'أُعيد حساب مبلغ القطع والمكافآت من تسعير الأعمال المكتملة تلقائيًا. الدفعات المسجلة محفوظة.',
                  'Completed-work prices and bonuses automatically recalculated piecework pay. Recorded payments are preserved.'
                )
              : debt
                ? entry.kind === 'debt' && entry.settlement
                  ? t(
                      `خُفّض الدين، واحتُسب ${payrollMoney(entry.settlement.amount, true)} ضمن سداد راتب ${entry.settlement.payroll_year}-${String(entry.settlement.payroll_month).padStart(2, '0')}، دون صرف نقد جديد.`,
                      `${payrollMoney(entry.settlement.amount, false)} was settled from salary for ${entry.settlement.payroll_year}-${String(entry.settlement.payroll_month).padStart(2, '0')}, reducing debt without new cash outflow.`
                    )
                  : t(
                      'سداد مسجل في حساب الدين. أثره المؤكد أدناه هو انخفاض الدين؛ قد لا يتضمن السجل القديم رابطًا بدفعة راتب.',
                      'Recorded debt repayment. The confirmed effect below is the debt reduction; older entries may have no linked salary payment.'
                    )
                : op?.operation_type === 'salary'
                  ? t(
                      'حُفظت مكونات راتب الشهر. هذه عملية احتساب استحقاق، وليست دفعة نقدية للعامل.',
                      'Monthly salary components were saved. This records entitlement, not a cash payment.'
                    )
                  : op?.operation_type === 'deduction'
                    ? t(
                        'مبلغ صُرف للعامل وسُجّل دينًا مستقلًا. لا يُخصم من الراتب تلقائيًا؛ يُسوّى عند تسجيل سداد الدين.',
                        'Money issued to the worker and recorded as a separate debt. It is not automatically deducted from salary.'
                      )
                    : op?.operation_type === 'advance'
                      ? t(
                          'قيد من النظام السابق خُصم من مستحق الراتب. حُفظ أثره المالي كما سُجّل، ولا تُنشأ قيود جديدة من هذا النوع.',
                          'An adjustment from the previous system reduced salary entitlement. Its recorded financial effect is preserved; no new entries of this type are created.'
                        )
                      : t(
                          'دفعة تخفّض المتبقي من راتب الشهر. الديون المستقلة لا تتغير بهذه العملية.',
                          'This payment reduces the remaining monthly salary. Separate debts are unchanged.'
                        )
            const before = pricing?.before_amount ?? debt?.before_amount ?? op?.before_amount ?? 0
            const after = pricing?.after_amount ?? debt?.after_amount ?? op?.after_amount ?? 0
            const amount = pricing
              ? pricing.after_amount - pricing.before_amount
              : (debt?.amount ?? op?.amount ?? 0)
            const id = pricing?.id ?? debt?.id ?? op?.id
            return (
              <li key={`${entry.kind}-${id}`} className="py-5 first:pt-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">{title}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {date(debt?.payment_date ?? op?.operation_date ?? entry.at)}
                    </p>
                  </div>
                  <p
                    className="shrink-0 font-bold tabular-nums text-stone-900"
                    dir={arabic ? 'rtl' : 'ltr'}
                  >
                    {pricing && amount > 0 ? '+ ' : ''}
                    {payrollMoney(amount, arabic)}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
                {op?.operation_type === 'salary' &&
                  Number(op.metadata.future_months_updated) > 0 && (
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {t(
                        `طُبّق نوع الراتب وقيمته أيضًا على ${op.metadata.future_months_updated} من الشهور اللاحقة المسجلة، مع الحفاظ على دفعاتها وديونها وعملها الإضافي.`,
                        `Salary type and amount were also applied to ${op.metadata.future_months_updated} existing later months, preserving their payments, debts and overtime.`
                      )}
                    </p>
                  )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600">
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {pricing
                      ? t('القطع قبل:', 'Piecework before:')
                      : debt
                        ? t('الدين قبل:', 'Debt before:')
                        : t('متبقي الراتب قبل:', 'Salary remaining before:')}{' '}
                    {payrollMoney(before, arabic)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    {t('بعد:', 'After:')} {payrollMoney(after, arabic)}
                  </span>
                </div>
                {(op?.note || debt?.note) && (
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                    {op?.note || debt?.note}
                  </p>
                )}
                <details className="mt-3 text-xs text-stone-500">
                  <summary className="w-fit cursor-pointer py-2">
                    {t('تفاصيل التسجيل', 'Entry details')}
                  </summary>
                  <p>
                    {t('سُجّل:', 'Recorded:')} {date(entry.at, true)}
                  </p>
                  {op && (
                    <p className="mt-1 break-all">
                      {t('المرجع:', 'Reference:')} {op.reference}
                    </p>
                  )}
                </details>
                {admin && (op || debt) && (
                  <button
                    className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs text-rose-700"
                    onClick={() => onDelete((op || debt)!, !!debt)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('حذف العملية وتصحيح أثرها', 'Delete entry and reverse its effect')}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {entries.length > limit && (
        <button className={`${payrollSecondary} w-full`} onClick={() => setLimit((v) => v + 20)}>
          {t('عرض المزيد من السجل', 'Show more entries')}
        </button>
      )}
    </div>
  )
}
