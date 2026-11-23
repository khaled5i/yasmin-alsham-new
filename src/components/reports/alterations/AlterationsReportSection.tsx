'use client'

/**
 * قسم «التعديلات» في صفحة التقارير (للمدير فقط): ما المشاكل المتكررة، ومتى، وعلى من، وجودة البيانات.
 * يتبع فترة التقارير. كل رقم يفتح التعديلات التي خلفه.
 * العمال يُحسبون بـ computeRoleStats و useWorkerQualityData حرفياً كما في متابعة العمال.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronLeft, Loader2, RotateCw, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import OrderModal from '@/components/OrderModal'
import { ALTERATION_TYPE_META } from '@/components/alterations/alteration-ui'
import { alterationService, type ReportAlteration } from '@/lib/services/alteration-service'
import { orderService, type AlterationReportOrder, type Order } from '@/lib/services/order-service'
import { orderQualityReviewService, type QualityReviewAttemptSummary } from '@/lib/services/order-quality-review-service'
import { workerService, type WorkerWithUser } from '@/lib/services/worker-service'
import { currentMonthKey } from '@/lib/selected-month'
import {
  ALTERATION_TYPE_ORDER,
  UNCLASSIFIED_WARNING_SHARE,
  computeRoleStats,
  monthLabel,
  monthName,
  shiftMonthKey,
  type QualityRole,
  type WorkerQualityStats,
} from '@/lib/worker-alteration-stats'
import { useWorkerQualityData } from '@/components/worker-quality/worker-quality-data'
import { MonthSelect, ScoreBlock, TypeStackBar, UnclassifiedWarning, rankText } from '@/components/worker-quality/worker-quality-ui'
import {
  NEAR_DUE_DAYS,
  TREND_MONTHS,
  buildItems,
  completedAtOf,
  computeBuckets,
  computeCohort,
  computeConcentration,
  computeIssues,
  computeRepeatCustomers,
  computeReviewGaps,
  computeTiming,
  computeTrend,
  localMonthKey,
  parseLocal,
  per100Text,
  percentOf,
  type GroupComparison,
  type ReportItem,
} from './alterations-report-data'
import { BarRow, Block, EmptyState, ItemsSheet, Notice, StatCard, type DrillState } from './alterations-report-ui'

interface RawData {
  trendAlterations: ReportAlteration[]
  cohortAlterations: ReportAlteration[]
  completed: AlterationReportOrder[]
  orders: Map<string, AlterationReportOrder>
  reviews: QualityReviewAttemptSummary[]
}

const inRange = (date: Date | null, start: Date, end: Date) => !!date && date >= start && date <= end

function useAlterationsReportData(enabled: boolean, start: Date, end: Date) {
  const [data, setData] = useState<RawData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const startMs = start.getTime()
  const endMs = end.getTime()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const periodStart = new Date(startMs)
      const periodEnd = new Date(endMs)
      const trendFirst = shiftMonthKey(localMonthKey(periodEnd), -(TREND_MONTHS - 1))
      const [year, month] = trendFirst.split('-').map(Number)
      const trendStart = new Date(Math.min(new Date(year, month - 1, 1).getTime(), startMs))
      // هامش يوم على الخادم، ثم فلترة دقيقة بالتوقيت المحلي
      const pad = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000).toISOString()

      const [altResult, completedResult] = await Promise.all([
        alterationService.getForReport({ createdFrom: trendStart.toISOString(), createdTo: periodEnd.toISOString() }),
        orderService.getAlterationReportOrders({ completedFrom: pad(trendStart, -1), completedTo: pad(periodEnd, 1) }),
      ])
      if (altResult.error) throw new Error(altResult.error)
      if (completedResult.error) throw new Error(completedResult.error)

      const completed = completedResult.data.filter((order) => inRange(completedAtOf(order), trendStart, periodEnd))
      const periodCompletedIds = completed.filter((order) => inRange(completedAtOf(order), periodStart, periodEnd)).map((order) => order.id)
      const orders = new Map(completed.map((order) => [order.id, order]))

      const cohortResult = await alterationService.getForReport({ orderIds: periodCompletedIds })
      if (cohortResult.error) throw new Error(cohortResult.error)

      const missing = [...new Set(altResult.data.map((row) => row.original_order_id).filter((id): id is string => !!id && !orders.has(id)))]
      const periodOrderIds = [...new Set(
        altResult.data
          .filter((row) => inRange(parseLocal(row.created_at), periodStart, periodEnd))
          .map((row) => row.original_order_id)
          .filter((id): id is string => !!id)
      )]
      const [missingResult, reviewsResult] = await Promise.all([
        orderService.getAlterationReportOrders({ ids: missing }),
        orderQualityReviewService.getAttemptSummariesForOrders(periodOrderIds, { includeCreatedAt: true }),
      ])
      if (missingResult.error) throw new Error(missingResult.error)
      for (const order of missingResult.data) orders.set(order.id, order)

      if (cancelled) return
      setData({
        trendAlterations: altResult.data,
        cohortAlterations: cohortResult.data,
        completed,
        orders,
        // المراجعات للعرض فقط؛ تعذّرها لا يُسقط القسم
        reviews: reviewsResult.error ? [] : reviewsResult.data,
      })
    })()
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'تعذّر تحميل التعديلات')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [enabled, startMs, endMs, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { data, loading, error, retry }
}

// ============================================================================

export default function AlterationsReportSection({
  isAdmin,
  startDate,
  endDate,
  periodLabel,
}: {
  isAdmin: boolean
  startDate: Date
  endDate: Date
  periodLabel: string
}) {
  const { data, loading, error, retry } = useAlterationsReportData(isAdmin, startDate, endDate)
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [drill, setDrill] = useState<DrillState | null>(null)
  const [orderModal, setOrderModal] = useState<{ order: Order; returnTo: DrillState | null } | null>(null)
  const [openingOrder, setOpeningOrder] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    workerService.getAll().then((result) => setWorkers(result.data || []))
  }, [isAdmin])

  const workerNames = useMemo(() => new Map(workers.map((worker) => [worker.id, worker.user?.full_name?.trim() || 'بدون اسم'])), [workers])
  const workerName = useCallback((id: string | null | undefined) => (id ? workerNames.get(id) ?? null : null), [workerNames])

  const view = useMemo(() => {
    if (!data) return null
    const trendItems = buildItems(data.trendAlterations, data.orders)
    const items = trendItems.filter((item) => inRange(parseLocal(item.created_at), startDate, endDate))
    const completedInPeriod = data.completed.filter((order) => inRange(completedAtOf(order), startDate, endDate))
    const cohort = computeCohort(completedInPeriod, buildItems(data.cohortAlterations, data.orders))
    const classified = items.filter((item) => item.reason !== 'unclassified')
    return {
      items,
      classified,
      completedInPeriod,
      cohort,
      afterDelivery: items.filter((item) => item.alteration_type === 'after_delivery'),
      trend: computeTrend(localMonthKey(endDate), trendItems, data.completed),
      issues: computeIssues(items),
      buckets: computeBuckets(items),
      concentration: computeConcentration(cohort, completedInPeriod),
      timing: computeTiming(items),
      repeat: computeRepeatCustomers(items),
      review: computeReviewGaps(items, data.reviews),
      unclassifiedShare: items.length > 0 ? (items.length - classified.length) / items.length : 0,
    }
  }, [data, startDate, endDate])

  const openOrder = useCallback(async (orderId: string) => {
    if (openingOrder) return
    setOpeningOrder(true)
    const { data: order, error: orderError } = await orderService.getById(orderId)
    setOpeningOrder(false)
    if (orderError || !order) {
      toast.error(orderError || 'تعذّر فتح الطلب')
      return
    }
    // نافذة الطلب تحت طبقة الـ sheet، فنغلقها ونعيدها عند إغلاق الطلب
    setOrderModal({ order, returnTo: drill })
    setDrill(null)
  }, [drill, openingOrder])

  const show = (title: string, items: ReportItem[], subtitle?: string, note?: string) => setDrill({ title, items, subtitle, note })

  if (!isAdmin) return null

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.9 }} className="mb-8" dir="rtl">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-800 sm:mb-6 sm:text-2xl">
        <Wrench className="h-5 w-5 text-pink-600 sm:h-6 sm:w-6" />
        <span>التعديلات</span>
      </h2>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">تعذّر تحميل التعديلات</p>
          <button type="button" onClick={retry} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-bold">
            <RotateCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      ) : loading || !view ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-pink-100 bg-pink-50/40" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {view.items.length > 0 && view.unclassifiedShare > UNCLASSIFIED_WARNING_SHARE ? (
            <Notice>
              <strong className="tabular-nums">{percentOf(view.items.length - view.classified.length, view.items.length)}</strong> من تعديلات الفترة بلا سبب محدد («خطأ آخر» أو فارغ)، فتوزيع الأسباب غير كافٍ للاستنتاج. المواضع والتوقيت أدناه لا تعتمد على السبب.
            </Notice>
          ) : null}

          <KpiGrid view={view} periodLabel={periodLabel} show={show} />
          <TrendBlock trend={view.trend} show={show} />
          <IssuesBlock issues={view.issues} total={view.items.length} show={show} />
          <WorkersBlock endDate={endDate} workers={workers} />
          <ReasonsBlock buckets={view.buckets} total={view.items.length} classified={view.classified.length} show={show} />
          <ConcentrationBlock concentration={view.concentration} show={show} />
          <TimingBlock timing={view.timing} show={show} />
          <RepeatBlock repeat={view.repeat} show={show} />
          <ReviewBlock review={view.review} show={show} />
          <DataQualityBlock trend={view.trend} show={show} />
        </div>
      )}

      {openingOrder ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/20">
          <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
        </div>
      ) : null}

      <ItemsSheet drill={drill} onClose={() => setDrill(null)} workerName={workerName} onOpenOrder={(id) => { void openOrder(id) }} />

      <OrderModal
        order={orderModal?.order ?? null}
        workers={workers}
        isOpen={!!orderModal}
        onOrderUpdated={(updated) => setOrderModal((current) => (current ? { ...current, order: updated } : current))}
        onClose={() => {
          const returnTo = orderModal?.returnTo ?? null
          setOrderModal(null)
          if (returnTo) setDrill(returnTo)
        }}
      />
    </motion.div>
  )
}

interface View {
  items: ReportItem[]
  classified: ReportItem[]
  completedInPeriod: AlterationReportOrder[]
  cohort: ReturnType<typeof computeCohort>
  afterDelivery: ReportItem[]
  trend: ReturnType<typeof computeTrend>
  issues: ReturnType<typeof computeIssues>
  buckets: ReturnType<typeof computeBuckets>
  concentration: ReturnType<typeof computeConcentration>
  timing: ReturnType<typeof computeTiming>
  repeat: ReturnType<typeof computeRepeatCustomers>
  review: ReturnType<typeof computeReviewGaps>
  unclassifiedShare: number
}

type Show = (title: string, items: ReportItem[], subtitle?: string, note?: string) => void

// ============================================================================
// 1. مؤشرات الفترة
// ============================================================================

function KpiGrid({ view, periodLabel, show }: { view: View; periodLabel: string; show: Show }) {
  const total = view.items.length
  const completed = view.completedInPeriod.length
  const cohortItemsFor = (orders: AlterationReportOrder[]) => {
    const ids = new Set(orders.map((order) => order.id))
    return view.cohort.items.filter((item) => item.original_order_id && ids.has(item.original_order_id))
  }
  return (
    <Block title="مؤشرات الفترة" hint={`${periodLabel} · حسب تاريخ تسجيل التعديل`}>
      {total === 0 ? <EmptyState>لا تعديلات مسجّلة في هذه الفترة</EmptyState> : null}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <StatCard label="تعديل في الفترة" value={String(total)} onClick={() => show('تعديلات الفترة', view.items, periodLabel)} />
        <StatCard
          label="لكل 100 طلب منجز"
          value={completed > 0 ? per100Text((total * 100) / completed) : '—'}
          hint={completed > 0 ? `${completed} طلباً منجزاً` : 'لا طلبات منجزة'}
          tone="purple"
          onClick={() => show('تعديلات الفترة', view.items, periodLabel)}
        />
        <StatCard
          label="طلبات منجزة عليها تعديل"
          value={percentOf(view.cohort.withAlteration.length, completed)}
          hint={completed > 0 ? `${view.cohort.withAlteration.length} من ${completed} · ترتفع لاحقاً` : undefined}
          onClick={() => show('تعديلات الطلبات المنجزة في الفترة', view.cohort.items, periodLabel, 'كل تعديلات الطلبات التي أُنجزت في الفترة، أياً كان تاريخ تسجيلها. تعديلات ما بعد التسليم تصل متأخرة، فترتفع النسبة للفترات الحديثة مع الوقت.')}
        />
        <StatCard
          label="بتعديلين فأكثر"
          value={percentOf(view.cohort.withTwoPlus.length, completed)}
          hint={completed > 0 ? `${view.cohort.withTwoPlus.length} طلباً` : undefined}
          tone="red"
          onClick={() => show('طلبات بتعديلين فأكثر', cohortItemsFor(view.cohort.withTwoPlus), periodLabel)}
        />
        <StatCard
          label="بعد التسليم"
          value={percentOf(view.afterDelivery.length, total)}
          hint={total > 0 ? `${view.afterDelivery.length} تعديلاً` : undefined}
          tone="red"
          onClick={() => show('تعديلات بعد التسليم', view.afterDelivery, periodLabel)}
        />
        <StatCard
          label="سببها مسجّل"
          value={percentOf(view.classified.length, total)}
          hint={total > 0 ? `${view.classified.length} من ${total}` : undefined}
          tone={view.unclassifiedShare > UNCLASSIFIED_WARNING_SHARE ? 'slate' : 'emerald'}
          onClick={() => show('تعديلات سببها مسجّل', view.classified, periodLabel)}
        />
      </div>
    </Block>
  )
}

// ============================================================================
// 2. الاتجاه الشهري
// ============================================================================

function TrendBlock({ trend, show }: { trend: View['trend']; show: Show }) {
  const max = Math.max(1, ...trend.map((month) => month.total))
  const anyData = trend.some((month) => month.total > 0 || month.completedOrders > 0)
  return (
    <Block title="الاتجاه شهرياً" hint={`آخر ${TREND_MONTHS} أشهر حتى نهاية الفترة`}>
      {!anyData ? <EmptyState>لا بيانات في هذه الأشهر</EmptyState> : (
        <>
          <div className="grid grid-cols-6 items-end gap-1.5" style={{ height: 168 }}>
            {trend.map((month) => {
              const height = (month.total / max) * 120
              return (
                <button
                  key={month.month}
                  type="button"
                  disabled={month.total === 0}
                  onClick={() => show(`تعديلات ${monthLabel(month.month)}`, month.items)}
                  className="flex h-full min-w-0 flex-col items-center justify-end gap-1 rounded-lg pb-0.5 enabled:hover:bg-pink-50/70"
                  aria-label={`${monthLabel(month.month)}: ${month.total} تعديل`}
                >
                  <span className="text-sm font-extrabold tabular-nums text-slate-900">{month.total}</span>
                  <span className="flex w-full max-w-[40px] flex-col-reverse overflow-hidden rounded-md bg-slate-100" style={{ height: Math.max(height, 4) }}>
                    {ALTERATION_TYPE_ORDER.map((type) => month.counts[type] > 0 ? (
                      <span key={type} className={ALTERATION_TYPE_META[type].bar} style={{ height: `${(month.counts[type] / Math.max(1, month.total)) * 100}%` }} />
                    ) : null)}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-6 gap-1.5 border-t border-slate-100 pt-2 text-center">
            {trend.map((month) => (
              <div key={month.month} className="min-w-0">
                <p className="truncate text-[13px] font-bold text-slate-700">{monthName(month.month)}</p>
                <p className="text-[13px] text-slate-500">
                  <span className="font-extrabold tabular-nums text-purple-700">{per100Text(month.per100)}</span>
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500">الرقم البنفسجي = تعديلات لكل 100 طلب منجز في نفس الشهر.</p>
          <TypeLegend />
        </>
      )}
    </Block>
  )
}

function TypeLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
      {ALTERATION_TYPE_ORDER.map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${ALTERATION_TYPE_META[type].bar}`} />
          {ALTERATION_TYPE_META[type].short.ar}
        </span>
      ))}
    </div>
  )
}

// ============================================================================
// 3. ما هي المشاكل
// ============================================================================

function IssuesBlock({ issues, total, show }: { issues: View['issues']; total: number; show: Show }) {
  const [tab, setTab] = useState<'areas' | 'actions'>('areas')
  const rows = tab === 'areas' ? issues.areas : issues.actions
  const max = Math.max(1, ...rows.map((row) => row.items.length))
  return (
    <Block
      title="ما هي المشاكل؟"
      hint="من الملاحظات المكتوبة على التعديل، بقاموس كلمات ثابت. التعديل الواحد قد يذكر أكثر من موضع."
    >
      {total === 0 ? <EmptyState>لا تعديلات في الفترة</EmptyState> : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {([['areas', 'المواضع'], ['actions', 'نوع التعديل']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-11 rounded-lg text-sm font-bold transition ${tab === key ? 'bg-white text-pink-700 shadow-sm' : 'text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {issues.withNote.length < 10 ? <Notice>الملاحظات المكتوبة قليلة في هذه الفترة ({issues.withNote.length})، فالترتيب غير كافٍ للاستنتاج.</Notice> : null}
          {rows.length === 0 ? <EmptyState>لا كلمات مطابقة</EmptyState> : (
            <div className="-mx-2">
              {rows.map((row) => (
                <BarRow
                  key={row.key}
                  label={row.label}
                  count={row.items.length}
                  max={max}
                  sub={`· ${percentOf(row.items.length, issues.withNote.length)}`}
                  onClick={() => show(row.label, row.items, undefined, `يُعدّ التعديل هنا إذا ورد في ملاحظته: ${row.words.join('، ')}`)}
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-sm text-slate-500">
            <span>النسبة من {issues.withNote.length} تعديلاً فيه ملاحظة.</span>
            {issues.noNote.length > 0 ? (
              <button type="button" onClick={() => show('تعديلات بلا ملاحظة', issues.noNote)} className="min-h-[44px] font-bold text-pink-700 underline-offset-2 hover:underline">
                بلا ملاحظة: <span className="tabular-nums">{issues.noNote.length}</span>
              </button>
            ) : null}
            {issues.unmatched.length > 0 ? (
              <button type="button" onClick={() => show('ملاحظات لم تطابق أي موضع', issues.unmatched)} className="min-h-[44px] font-bold text-pink-700 underline-offset-2 hover:underline">
                غير مصنّفة: <span className="tabular-nums">{issues.unmatched.length}</span>
              </button>
            ) : null}
          </div>
        </>
      )}
    </Block>
  )
}

// ============================================================================
// 4. العمال — نفس متابعة العمال حرفياً
// ============================================================================

function WorkersBlock({ endDate, workers }: { endDate: Date; workers: WorkerWithUser[] }) {
  const periodMonth = localMonthKey(endDate)
  const nowMonth = currentMonthKey()
  const [month, setMonth] = useState(periodMonth > nowMonth ? nowMonth : periodMonth)
  const [lastPeriodMonth, setLastPeriodMonth] = useState(periodMonth)
  if (periodMonth !== lastPeriodMonth) {
    setLastPeriodMonth(periodMonth)
    setMonth(periodMonth > nowMonth ? nowMonth : periodMonth)
  }
  const [role, setRole] = useState<QualityRole>('tailor')

  const quality = useWorkerQualityData({ enabled: true, fromMonth: month, toMonth: month, kinds: ['completed', 'cut'] })
  const roleWorkers = useMemo(
    () => workers.filter((worker) => worker.worker_type === (role === 'tailor' ? 'tailor' : 'workshop_manager')),
    [workers, role]
  )
  const stats = useMemo(() => {
    if (!quality.data) return null
    return computeRoleStats({
      role,
      month,
      orders: role === 'tailor' ? quality.data.completed : quality.data.cut,
      alterations: quality.data.alterations,
      reviews: quality.data.reviews,
      workerIds: roleWorkers.map((worker) => worker.id),
    })
  }, [quality.data, role, month, roleWorkers])

  const rows = useMemo(() => {
    if (!stats) return []
    const list = [...stats.values()].filter((entry) => entry.orders > 0)
    return list.sort((a, b) => {
      if (a.ranked !== b.ranked) return a.ranked ? -1 : 1
      if (a.ranked && b.ranked) return (a.rank ?? 0) - (b.rank ?? 0)
      return b.orders - a.orders
    })
  }, [stats])
  const totals = useMemo(() => {
    const all = [...(stats?.values() ?? [])]
    const onOrders = all.reduce((sum, entry) => sum + entry.onOrdersTotal, 0)
    const unclassified = all.reduce((sum, entry) => sum + entry.reasonCounts.unclassified, 0)
    return { onOrders, share: onOrders > 0 ? unclassified / onOrders : 0 }
  }, [stats])
  const nameOf = (id: string) => workers.find((worker) => worker.id === id)?.user?.full_name?.trim() || 'بدون اسم'

  return (
    <Block
      title="العمال"
      hint="نفس معادلة متابعة العمال: الشهر هنا شهر إنهاء الطلب (الإنجاز للخياط، القص للقصّاص)."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <MonthSelect value={month} onChange={setMonth} />
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {([['tailor', 'الخياطون'], ['cutter', 'القصّاصون']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setRole(key)} className={`h-11 rounded-lg text-sm font-bold ${role === key ? 'bg-white text-pink-700 shadow-sm' : 'text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {quality.error ? (
        <Notice tone="red">
          تعذّر تحميل تقييم العمال.{' '}
          <button type="button" onClick={quality.retry} className="min-h-[44px] font-bold underline">إعادة المحاولة</button>
        </Notice>
      ) : quality.loading || !stats ? (
        <div className="space-y-2">{[0, 1, 2].map((index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-50" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState>لا طلبات {role === 'tailor' ? 'منجزة' : 'مقصوصة'} في {monthLabel(month)}</EmptyState>
      ) : (
        <>
          {totals.onOrders > 0 && totals.share > UNCLASSIFIED_WARNING_SHARE ? <UnclassifiedWarning /> : null}
          <ul className="space-y-2">
            {rows.map((entry) => <WorkerRow key={entry.workerId} entry={entry} name={nameOf(entry.workerId)} role={role} />)}
          </ul>
        </>
      )}
    </Block>
  )
}

function WorkerRow({ entry, name, role }: { entry: WorkerQualityStats; name: string; role: QualityRole }) {
  return (
    <li>
      <Link
        href={`/dashboard/worker-monitoring/${entry.workerId}?tab=alterations`}
        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition hover:border-pink-300 hover:shadow-md"
      >
        <ScoreBlock stats={entry} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-slate-900">{name}</p>
          <p className={`text-sm font-bold ${entry.ranked ? 'text-pink-700' : 'text-slate-400'}`}>{rankText(entry)}</p>
          <p className="text-sm text-slate-600">
            <span className="tabular-nums">{entry.orders}</span> {role === 'tailor' ? 'منجز' : 'مقصوص'} · عليه <strong className="tabular-nums text-red-600">{entry.attributedTotal}</strong> · كل تعديلات طلباته <span className="tabular-nums">{entry.onOrdersTotal}</span>
          </p>
        </div>
        <ChevronLeft className="h-5 w-5 shrink-0 text-slate-300" />
      </Link>
    </li>
  )
}

// ============================================================================
// 5. الأسباب ومن يتحمّلها
// ============================================================================

function ReasonsBlock({ buckets, total, classified, show }: { buckets: View['buckets']; total: number; classified: number; show: Show }) {
  const max = Math.max(1, ...buckets.map((row) => row.items.length))
  return (
    <Block title="الأسباب ومن يتحمّلها" hint="بنفس قواعد متابعة العمال. السبب يظهر للمدير فقط.">
      {total === 0 ? <EmptyState>لا تعديلات في الفترة</EmptyState> : (
        <>
          {classified < 10 ? <Notice>الأسباب المسجّلة {classified} فقط من {total}، فهذا التوزيع لا يكفي للاستنتاج.</Notice> : null}
          <div className="-mx-2">
            {buckets.map((row) => (
              <BarRow
                key={row.bucket}
                label={row.label}
                count={row.items.length}
                max={max}
                sub={`· ${percentOf(row.items.length, total)}`}
                barClass={row.bucket === 'unclassified' ? 'bg-slate-300' : 'bg-gradient-to-l from-pink-500 to-purple-500'}
                onClick={() => show(row.label, row.items, undefined, row.bucket === 'unclassified' ? 'سبب «خطأ آخر» أو بلا سبب. لا تُحسب على أحد.' : undefined)}
              />
            ))}
          </div>
        </>
      )}
    </Block>
  )
}

// ============================================================================
// 6. أين تتركّز
// ============================================================================

function ConcentrationBlock({ concentration, show }: { concentration: View['concentration']; show: Show }) {
  return (
    <Block title="أين تتركّز المشاكل؟" hint="على الطلبات المنجزة في الفترة: كم تعديلاً لكل طلب في كل مجموعة.">
      <ComparisonGroup title="مصدر المقاس" rows={concentration.measurement} show={show} />
      <ComparisonGroup
        title="البروفة الثانية"
        rows={concentration.secondProof}
        show={show}
        note="دون تعديلات البروفة الثانية نفسها، لأنها لا توجد إلا مع بروفة ثانية."
      />
    </Block>
  )
}

function ComparisonGroup({ title, rows, show, note }: { title: string; rows: GroupComparison[]; show: Show; note?: string }) {
  const max = Math.max(0.01, ...rows.map((row) => row.perOrder ?? 0))
  const enough = rows.filter((row) => row.enough).length >= 2
  return (
    <div className="rounded-xl bg-slate-50/70 p-3">
      <p className="mb-1 text-sm font-extrabold text-slate-800">{title}</p>
      {note ? <p className="mb-1 text-sm text-slate-500">{note}</p> : null}
      {rows.length === 0 ? <EmptyState>لا طلبات منجزة في الفترة</EmptyState> : (
        <div className="-mx-2">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              disabled={row.alterations.length === 0}
              onClick={() => show(`${title}: ${row.label}`, row.alterations)}
              className="block min-h-[44px] w-full rounded-xl px-2 py-1.5 text-start enabled:hover:bg-white"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">{row.label}</span>
                <span dir="ltr" className="shrink-0 text-sm font-extrabold tabular-nums text-purple-700">
                  {row.perOrder == null ? '—' : row.perOrder.toFixed(2)}
                </span>
              </span>
              <span className="mt-1 block h-2.5 w-full overflow-hidden rounded-full bg-white">
                <span className="block h-full rounded-full bg-purple-400" style={{ width: `${((row.perOrder ?? 0) / max) * 100}%` }} />
              </span>
              <span className="mt-0.5 block text-[13px] text-slate-500">
                <span className="tabular-nums">{row.orders}</span> طلباً · <span className="tabular-nums">{row.alterations.length}</span> تعديلاً · عليها تعديل {percentOf(row.ordersWithAlteration, row.orders)}
              </span>
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 && !enough ? <div className="mt-2"><Notice>إحدى المجموعتين أقل من 10 طلبات، فالمقارنة غير كافية للاستنتاج.</Notice></div> : null}
    </div>
  )
}

// ============================================================================
// 7. التوقيت
// ============================================================================

function TimingBlock({ timing, show }: { timing: View['timing']; show: Show }) {
  const anyMeasured = timing.byType.some((row) => row.measured > 0)
  return (
    <Block title="التوقيت" hint="الأيام من استلام الطلب حتى تسجيل التعديل.">
      {!anyMeasured ? <EmptyState>لا تعديلات مرتبطة بطلب في الفترة</EmptyState> : (
        <div className="space-y-3">
          {timing.byType.filter((row) => row.measured > 0).map((row) => {
            const meta = ALTERATION_TYPE_META[row.type]
            const max = Math.max(1, ...row.buckets.map((bucket) => bucket.items.length))
            return (
              <div key={row.type} className={`rounded-xl border p-3 ${meta.soft}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-extrabold text-slate-800">{meta.short.ar}</span>
                  <span className="text-sm text-slate-600">
                    المتوسط الأوسط <strong className="tabular-nums text-slate-900">{row.median ?? '—'}</strong> يوماً
                  </span>
                </div>
                <div className="-mx-2 mt-1">
                  {row.buckets.map((bucket) => (
                    <BarRow
                      key={bucket.key}
                      label={bucket.label}
                      count={bucket.items.length}
                      max={max}
                      barClass={meta.bar}
                      onClick={() => show(`${meta.short.ar}: ${bucket.label}`, bucket.items)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {timing.withDue > 0 ? (
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard
            label={`قبل الموعد بـ ${NEAR_DUE_DAYS} أيام أو أقل`}
            value={String(timing.nearDue.length)}
            hint={`من ${timing.withDue} تعديل بروفة`}
            tone="purple"
            onClick={() => show('تعديلات قريبة من موعد التسليم', timing.nearDue, undefined, `تعديلات بروفة سُجّلت قبل موعد تسليم الطلب بـ ${NEAR_DUE_DAYS} أيام أو أقل.`)}
          />
          <StatCard
            label="بعد فوات الموعد"
            value={String(timing.afterDue.length)}
            hint={`من ${timing.withDue} تعديل بروفة`}
            tone="red"
            onClick={() => show('تعديلات بروفة بعد موعد التسليم', timing.afterDue)}
          />
        </div>
      ) : null}
    </Block>
  )
}

// ============================================================================
// 8. الزبونات المتكررة
// ============================================================================

function RepeatBlock({ repeat, show }: { repeat: View['repeat']; show: Show }) {
  return (
    <Block title="زبونات بأكثر من تعديل بعد التسليم" hint="في الفترة المختارة، حسب رقم الجوال.">
      {repeat.length === 0 ? <EmptyState>لا توجد زبونة بتعديلين فأكثر بعد التسليم في هذه الفترة</EmptyState> : (
        <ul className="space-y-2">
          {repeat.map((customer) => {
            const orderNumbers = [...new Set(customer.items.map((item) => item.order?.order_number).filter(Boolean))]
            return (
              <li key={customer.key}>
                <button
                  type="button"
                  onClick={() => show(customer.name, customer.items, 'تعديلات بعد التسليم')}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-red-100 bg-red-50/50 px-3 py-2 text-start hover:border-red-300"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-base font-extrabold tabular-nums text-red-700">{customer.items.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold text-slate-900">{customer.name}</span>
                    <span dir="ltr" className="block truncate text-end text-sm tabular-nums text-slate-500">
                      {orderNumbers.length > 0 ? orderNumbers.map((number) => `#${number}`).join('  ') : '—'}
                    </span>
                  </span>
                  <ChevronLeft className="h-5 w-5 shrink-0 text-slate-300" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}

// ============================================================================
// 9. مراجعة الجودة
// ============================================================================

function ReviewBlock({ review, show }: { review: View['review']; show: Show }) {
  return (
    <Block title="مراجعة الجودة" hint="تعديلات سُجّلت بعد أن نجحت مراجعة الجودة لنفس الطلب في نفس المرحلة.">
      {review.reviewed.length === 0 ? <EmptyState>لا تعديلات في الفترة على طلبات راجعتها الجودة</EmptyState> : (
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard
            label="بعد مراجعة ناجحة"
            value={String(review.afterPass.length)}
            hint={`من ${review.reviewed.length} تعديل على طلبات مُراجَعة`}
            tone="purple"
            onClick={() => show('تعديلات بعد مراجعة ناجحة', review.afterPass, undefined, 'البروفة الأولى ← مراجعة الأولى، الثانية ← مراجعة الثانية، بعد التسليم ← مراجعة الفستان النهائي.')}
          />
          <StatCard label="مراجعات فشلت" value={String(review.failedReviews)} hint={`من ${review.totalReviews} محاولة على طلبات الفترة`} tone="slate" />
        </div>
      )}
      {review.reviewed.length > 0 && review.failedReviews <= 1 ? (
        <Notice tone="slate">المراجعة نادراً ما تفشل، فهي لا تكشف حالياً ما يظهر لاحقاً في البروفة.</Notice>
      ) : null}
    </Block>
  )
}

// ============================================================================
// 10. جودة البيانات
// ============================================================================

function DataQualityBlock({ trend, show }: { trend: View['trend']; show: Show }) {
  const months = trend.filter((month) => month.total > 0)
  return (
    <Block title="جودة البيانات" hint="هل يكفي ما يُسجَّل لنفهم سبب التعديل؟">
      {months.length === 0 ? <EmptyState>لا تعديلات في هذه الأشهر</EmptyState> : (
        <ul className="space-y-2">
          {months.slice().reverse().map((month) => (
            <li key={month.month} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-extrabold text-slate-800">{monthLabel(month.month)}</span>
                <span className="text-sm text-slate-500"><span className="tabular-nums">{month.total}</span> تعديل</span>
              </div>
              <TypeStackBar counts={month.counts} className="mt-1.5 h-2" />
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <QualityLine label="«خطأ آخر»" part={month.otherError} total={month.total} bad onClick={() => show(`«خطأ آخر» — ${monthLabel(month.month)}`, month.items.filter((item) => item.error_type === 'other_error'))} />
                <QualityLine label="بلا سبب" part={month.noReason} total={month.total} bad onClick={() => show(`بلا سبب — ${monthLabel(month.month)}`, month.items.filter((item) => !item.error_type))} />
                <QualityLine label="بلا ملاحظة" part={month.noNote} total={month.total} onClick={() => show(`بلا ملاحظة — ${monthLabel(month.month)}`, month.items.filter((item) => !item.hasNote))} />
                <QualityLine label="بلا خياط/طلب" part={month.unlinked} total={month.total} onClick={() => show(`غير منسوبة لخياط — ${monthLabel(month.month)}`, month.items.filter((item) => !item.order || !item.order.worker_id))} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-500">«خطأ آخر» ما زال ظاهراً في نموذج التعديل المنشور. النموذج الجديد يلغيه، فتتحسّن هذه النسب بعد نشره.</p>
    </Block>
  )
}

function QualityLine({ label, part, total, bad = false, onClick }: { label: string; part: number; total: number; bad?: boolean; onClick: () => void }) {
  const share = total > 0 ? part / total : 0
  const tone = bad && share > UNCLASSIFIED_WARNING_SHARE ? 'text-red-600' : 'text-slate-900'
  return (
    <button type="button" disabled={part === 0} onClick={onClick} className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-1 text-start text-sm enabled:hover:bg-pink-50/70">
      <span className="text-slate-600">{label}</span>
      <strong className={`tabular-nums ${tone}`}>{percentOf(part, total)}</strong>
    </button>
  )
}
