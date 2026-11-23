'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, Package, RotateCw } from 'lucide-react'
import { useSelectedMonth } from '@/hooks/useSelectedMonth'
import {
  ALTERATION_REASON_META,
  ALTERATION_TYPE_META,
  formatAlterationTimestampDate,
} from '@/components/alterations/alteration-ui'
import {
  ALTERATION_TYPE_ORDER,
  UNCLASSIFIED_WARNING_SHARE,
  computeRoleStats,
  formatPercent,
  monthName,
  peerAverages,
  shiftMonthKey,
  type QualityRole,
  type WorkerAlterationItem,
  type WorkerQualityStats,
} from '@/lib/worker-alteration-stats'
import { useWorkerQualityData } from './worker-quality-data'
import { MonthSelect, ScoreBlock, UNCLASSIFIED_BADGE, UnclassifiedWarning, rankText } from './worker-quality-ui'

const TREND_MONTHS = 6

/**
 * تبويب «التعديلات» في صفحة العامل (للمدير فقط): تقييم الشهر وترتيبه، الأنواع،
 * الاتجاه خلال 6 أشهر، وقائمة التعديلات على طلباته.
 */
export default function WorkerAlterationsTab({
  workerId,
  role,
  onOpenOrder,
}: {
  workerId: string
  role: QualityRole
  onOpenOrder: (orderId: string) => void
}) {
  const router = useRouter()
  const [month, setMonth] = useSelectedMonth()
  const months = useMemo(
    () => Array.from({ length: TREND_MONTHS }, (_, index) => shiftMonthKey(month, index - (TREND_MONTHS - 1))),
    [month]
  )

  const { data, loading, error, retry } = useWorkerQualityData({
    enabled: true,
    fromMonth: months[0],
    toMonth: month,
    kinds: [role === 'tailor' ? 'completed' : 'cut'],
  })

  const perMonth = useMemo(() => {
    if (!data) return null
    const orders = role === 'tailor' ? data.completed : data.cut
    return months.map((key) => computeRoleStats({
      role,
      month: key,
      orders,
      alterations: data.alterations,
      reviews: data.reviews,
      workerIds: [workerId],
    }))
  }, [data, months, role, workerId])

  const current = perMonth?.[perMonth.length - 1]
  const me = current?.get(workerId)
  const peers = current ? peerAverages(current.values(), workerId) : null
  const trend = perMonth?.map((stats, index) => ({
    month: months[index],
    me: stats.get(workerId),
    peerScore: peerAverages(stats.values(), workerId).score,
  }))

  const onHim = me?.items.filter((item) => item.attributed) ?? []
  const otherReason = me?.items.filter((item) => !item.attributed && item.reason !== 'unclassified') ?? []
  const noReason = me?.items.filter((item) => item.reason === 'unclassified') ?? []
  // كل تعديلات طلباته حسب النوع (عليه وعلى غيره وبلا سبب)
  const allByType = ALTERATION_TYPE_ORDER.map((type) => ({
    type,
    total: me?.items.filter((item) => item.alteration_type === type).length ?? 0,
    onHim: me?.attributed[type] ?? 0,
  }))
  const openAlteration = (id: string) => router.push(`/dashboard/alterations/add?editId=${id}`)

  return (
    <div dir="rtl" className="space-y-4">
      <MonthSelect value={month} onChange={setMonth} className="sm:w-56" />

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">تعذّر تحميل التعديلات</p>
          <button type="button" onClick={retry} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-bold">
            <RotateCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      ) : loading || !me || !trend || !peers ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
          ))}
        </div>
      ) : (
        <>
          {/* التقييم والأنواع */}
          <section className="rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50/70 to-white p-4">
            <div className="flex items-center gap-4">
              <ScoreBlock stats={me} size="lg" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className={`text-base font-extrabold ${me.ranked ? 'text-pink-700' : 'text-slate-500'}`}>{rankText(me)}</p>
                <p className="text-sm text-slate-600">
                  <span className="tabular-nums">{me.orders}</span> {role === 'tailor' ? 'طلب منجز' : 'طلب مقصوص'}
                </p>
                {peers.score != null ? (
                  <p className="text-sm text-slate-600">
                    متوسط الزملاء: <strong className="tabular-nums text-slate-900">{Math.round(peers.score)}</strong>
                  </p>
                ) : null}
              </div>
            </div>

            {me.onOrdersTotal > 0 && me.unclassifiedShare > UNCLASSIFIED_WARNING_SHARE ? (
              <div className="mt-3"><UnclassifiedWarning /></div>
            ) : null}
          </section>

          {/* كل تعديلات طلباته: على من، وحسب النوع */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="mb-3 text-sm font-extrabold text-slate-900">تعديلات طلباته هذا الشهر</h4>
            <dl className="grid grid-cols-4 divide-x divide-x-reverse divide-slate-100 rounded-xl bg-slate-50 py-2 text-center">
              {[
                { key: 'all', label: 'الكل', value: me.onOrdersTotal, tone: 'text-slate-900' },
                { key: 'him', label: 'عليه', value: me.attributedTotal, tone: 'text-red-700' },
                { key: 'other', label: 'سبب آخر', value: otherReason.length, tone: 'text-blue-700' },
                { key: 'none', label: 'بلا سبب', value: noReason.length, tone: 'text-slate-600' },
              ].map((cell) => (
                <div key={cell.key} className="flex flex-col px-0.5">
                  <dt className="order-2 text-xs font-bold leading-5 text-slate-500">{cell.label}</dt>
                  <dd className={`order-1 text-xl font-extrabold leading-7 tabular-nums ${cell.tone}`}>{cell.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1.5 text-xs text-slate-500">«سبب آخر» و«بلا سبب» تُعدّ على غيره ولا تنقص تقييمه.</p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {allByType.map(({ type, total, onHim: onHimCount }) => {
                const meta = ALTERATION_TYPE_META[type]
                return (
                  <div key={type} className={`rounded-xl border px-1 py-2 text-center ${meta.soft}`}>
                    <p className="text-2xl font-extrabold leading-8 tabular-nums text-slate-900">{total}</p>
                    <p className="text-[13px] font-bold leading-5 text-slate-700">{meta.short.ar}</p>
                    <p className="text-xs leading-5 text-slate-500">عليه <span className="font-bold tabular-nums text-red-700">{onHimCount}</span></p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* الاتجاه خلال 6 أشهر */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-slate-900">آخر {TREND_MONTHS} أشهر</h4>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-4 border-t-2 border-dashed border-slate-400" /> متوسط الزملاء
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:gap-3">
              {trend.map((point) => (
                <TrendColumn key={point.month} month={point.month} me={point.me} peerScore={point.peerScore} isCurrent={point.month === month} />
              ))}
            </div>
          </section>

          {/* القوائم */}
          <AlterationGroup
            title="التعديلات عليه"
            items={onHim}
            defaultOpen
            emptyText="لا تعديلات عليه في هذا الشهر."
            onOpenAlteration={openAlteration}
            onOpenOrder={onOpenOrder}
          />
          <AlterationGroup
            title="بسبب آخر"
            items={otherReason}
            emptyText="لا تعديلات بسبب آخر."
            onOpenAlteration={openAlteration}
            onOpenOrder={onOpenOrder}
          />
          <AlterationGroup
            title="بلا سبب"
            items={noReason}
            emptyText="كل تعديلات طلباته لها سبب."
            onOpenAlteration={openAlteration}
            onOpenOrder={onOpenOrder}
          />

          <p className="px-1 text-xs leading-5 text-slate-400">
            {role === 'tailor' ? `تقييم المدير: ${me.managerRating.average == null ? 'لا يوجد' : `${me.managerRating.average.toFixed(1)} من 5`} · ` : ''}
            نجاح أول مراجعة جودة: {me.firstPass.total > 0 ? formatPercent(me.firstPass.passed, me.firstPass.total) : 'لا مراجعات'} — للاطلاع فقط.
          </p>
        </>
      )}
    </div>
  )
}

// ============================================================================

function TrendColumn({
  month,
  me,
  peerScore,
  isCurrent,
}: {
  month: string
  me: WorkerQualityStats | undefined
  peerScore: number | null
  isCurrent: boolean
}) {
  const score = me?.score ?? null
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className={`text-sm font-extrabold tabular-nums ${score == null ? 'text-slate-300' : 'text-slate-800'}`}>{score ?? '—'}</span>
      <div className="relative mt-1 flex h-24 w-full items-end justify-center rounded-lg bg-slate-50">
        {score != null ? (
          <motion.span
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(score, 3)}%` }}
            transition={{ duration: 0.5 }}
            className={`block w-3/4 max-w-10 rounded-t-md ${me?.ranked ? 'bg-pink-500' : 'bg-pink-200'}`}
          />
        ) : null}
        {peerScore != null ? (
          <span className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-400" style={{ bottom: `${peerScore}%` }} aria-hidden />
        ) : null}
      </div>
      <span className={`mt-1 truncate text-xs ${isCurrent ? 'font-extrabold text-pink-700' : 'font-bold text-slate-600'}`}>{monthName(month)}</span>
    </div>
  )
}

function AlterationGroup({
  title,
  items,
  defaultOpen = false,
  emptyText,
  onOpenAlteration,
  onOpenOrder,
}: {
  title: string
  items: WorkerAlterationItem[]
  defaultOpen?: boolean
  emptyText: string
  onOpenAlteration: (id: string) => void
  onOpenOrder: (orderId: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-start"
      >
        <span className="flex items-center gap-2 text-[15px] font-extrabold text-slate-900">
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">{items.length}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="border-t border-slate-100 p-3">
          {items.length === 0 ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {emptyText}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {items.map((item) => (
                <AlterationCard key={item.id} item={item} onOpenAlteration={onOpenAlteration} onOpenOrder={onOpenOrder} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

/** الضغط على البطاقة يفتح التعديل، وزر «الطلب» يفتح الطلب. */
function AlterationCard({
  item,
  onOpenAlteration,
  onOpenOrder,
}: {
  item: WorkerAlterationItem
  onOpenAlteration: (id: string) => void
  onOpenOrder: (orderId: string) => void
}) {
  const typeMeta = ALTERATION_TYPE_META[item.alteration_type] ?? ALTERATION_TYPE_META.after_delivery
  // السبب كما سُجّل: «خطأ آخر» باسمه، والفارغ «غير محدد»
  const reasonMeta = item.error_type ? ALTERATION_REASON_META[item.error_type] : null
  const date = formatAlterationTimestampDate(item.created_at)
  const clientName = item.client_name || item.order.client_name || 'بدون اسم'

  return (
    <article className="relative flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white">
      <span className={`absolute inset-y-0 start-0 w-1.5 ${typeMeta.bar}`} aria-hidden />
      <button
        type="button"
        onClick={() => onOpenAlteration(item.id)}
        className="min-w-0 flex-1 py-3 pe-2 ps-4 text-start transition hover:bg-pink-50/40"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[15px] font-extrabold text-slate-900">{clientName}</span>
          {date ? <span dir="ltr" className="shrink-0 text-sm tabular-nums text-slate-500">{date}</span> : null}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${typeMeta.badge}`}>{typeMeta.short.ar}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${reasonMeta?.badge ?? UNCLASSIFIED_BADGE}`}>
            {reasonMeta?.label.ar ?? 'غير محدد'}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onOpenOrder(item.order.id)}
        className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 border-s border-slate-100 text-xs font-bold text-pink-700 transition hover:bg-pink-50"
        aria-label={`فتح الطلب ${item.order.order_number || ''}`}
      >
        <Package className="h-4 w-4" />
        <span dir="ltr" className="max-w-full truncate px-1 tabular-nums">{item.order.order_number || 'الطلب'}</span>
      </button>
    </article>
  )
}
