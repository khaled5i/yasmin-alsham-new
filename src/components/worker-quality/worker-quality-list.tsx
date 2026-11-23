'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { CheckCircle, Package, Users, Wrench } from 'lucide-react'
import type { WorkerWithUser } from '@/lib/services/worker-service'
import {
  UNCLASSIFIED_WARNING_SHARE,
  monthLabel,
  scoreTone,
  type MonthAlterationSummary,
  type QualityRole,
  type WorkerQualityStats,
} from '@/lib/worker-alteration-stats'
import { TypeDots, TypeStackBar, UnclassifiedWarning, rankText } from './worker-quality-ui'

export type QualitySort = 'best' | 'worst' | 'most'

export const QUALITY_SORT_OPTIONS: Array<{ key: QualitySort; label: string }> = [
  { key: 'best', label: 'الأفضل' },
  { key: 'worst', label: 'الأسوأ' },
  { key: 'most', label: 'الأكثر تعديلات' },
]

/** المرتّبون أولاً حسب الاختيار، ثم غير المرتّبين حسب عدد الطلبات. */
export function sortWorkersByQuality<T extends { id: string }>(
  workers: T[],
  stats: Map<string, WorkerQualityStats>,
  sort: QualitySort
): T[] {
  return [...workers].sort((a, b) => {
    const sa = stats.get(a.id)
    const sb = stats.get(b.id)
    if (sort === 'most') {
      return (sb?.attributedTotal ?? 0) - (sa?.attributedTotal ?? 0)
        || (sb?.ratePer10 ?? 0) - (sa?.ratePer10 ?? 0)
        || (sb?.orders ?? 0) - (sa?.orders ?? 0)
    }
    const ra = sa?.ranked ? 0 : 1
    const rb = sb?.ranked ? 0 : 1
    if (ra !== rb) return ra - rb
    if (ra === 0) {
      const byRank = (sa?.rank ?? 0) - (sb?.rank ?? 0)
      return sort === 'best' ? byRank : -byRank
    }
    return (sb?.orders ?? 0) - (sa?.orders ?? 0)
  })
}

export function SortChips({ value, onChange }: { value: QualitySort; onChange: (value: QualitySort) => void }) {
  return (
    <div className="flex gap-2" role="group" aria-label="ترتيب العمال">
      {QUALITY_SORT_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={`h-11 flex-1 rounded-xl border px-2 text-sm font-bold transition sm:flex-none sm:px-4 ${
            value === option.key
              ? 'border-pink-400 bg-pink-50 text-pink-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-pink-300'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// ملخص الشهر: العدد، شريط الأنواع، وعلى من تقع التعديلات
// ============================================================================

export function MonthQualitySummary({ month, summary }: { month: string; summary: MonthAlterationSummary }) {
  const onWorkers = summary.tailor + summary.cutter
  // «بلا سبب» يُعدّ على غير العمال، لكنه يبقى ظاهراً ضمن العدد
  const tiles = [
    { key: 'total', label: 'الإجمالي', value: summary.total, tone: 'text-slate-900', hint: '' },
    { key: 'workers', label: 'على العمال', value: onWorkers, tone: 'text-red-700', hint: '' },
    {
      key: 'others',
      label: 'على غيرهم',
      value: summary.total - onWorkers,
      tone: 'text-blue-700',
      hint: summary.unclassified > 0 ? `منها ${summary.unclassified} بلا سبب` : '',
    },
  ]

  return (
    <section className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm" aria-label="ملخص تعديلات الشهر">
      <h2 className="text-base font-extrabold text-slate-900">تعديلات {monthLabel(month)}</h2>

      {summary.total === 0 ? (
        <p className="mt-2 text-sm font-bold text-emerald-700">لا تعديلات على طلبات هذا الشهر</p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            <TypeStackBar counts={summary.byType} className="h-2.5" />
            <TypeDots counts={summary.byType} />
          </div>
          <dl className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 rounded-xl bg-slate-50 py-2 text-center">
            {tiles.map((tile) => (
              <div key={tile.key} className="flex flex-col px-1">
                <dt className="order-2 text-xs font-bold leading-5 text-slate-500">{tile.label}</dt>
                <dd className={`order-1 text-xl font-extrabold leading-7 tabular-nums ${tile.tone}`}>{tile.value}</dd>
                {tile.hint ? <span className="order-3 text-[11px] leading-4 text-slate-400">{tile.hint}</span> : null}
              </div>
            ))}
          </dl>
          {summary.unclassifiedShare > UNCLASSIFIED_WARNING_SHARE ? (
            <div className="mt-3"><UnclassifiedWarning /></div>
          ) : null}
        </>
      )}
    </section>
  )
}

// ============================================================================
// بطاقة العامل — مربّعة مثل البطاقة القديمة، وكلها رابط لتفاصيل تعديلاته
// ============================================================================

export function WorkerQualityCard({
  worker,
  role,
  stats,
  activeOrders,
  index,
}: {
  worker: WorkerWithUser
  role: QualityRole
  stats: WorkerQualityStats | undefined
  activeOrders: number
  index: number
}) {
  const name = worker.user?.full_name || 'بدون اسم'
  const onHim = stats?.attributedTotal ?? 0
  // باقي تعديلات طلباته: سببها يخص غيره، أو بلا سبب (يُعدّ على غير العامل)
  const onOthers = stats ? stats.onOrdersTotal - stats.attributedTotal : 0
  const tone = scoreTone(stats?.score ?? null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
    >
      <Link
        href={`/dashboard/worker-monitoring/${worker.id}?tab=alterations`}
        className="group relative block rounded-2xl border-2 border-slate-100 bg-white p-5 transition-all hover:border-pink-300 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
      >
        <RankCorner stats={stats} />
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-pink-400 to-purple-500 text-2xl font-bold text-white shadow-md transition-transform group-hover:scale-105">
              {name[0] || '؟'}
            </div>
            <span className={`absolute bottom-0.5 end-0.5 h-4 w-4 rounded-full border-2 border-white ${worker.is_available ? 'bg-green-400' : 'bg-gray-300'}`} />
          </div>
          <h3 className="max-w-full truncate text-base font-extrabold leading-tight text-slate-900">{name}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{role === 'tailor' ? 'خياط' : 'قصّاص'}</p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <span className={`rounded-full px-3 py-1 text-sm font-extrabold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
              تقييم الشهر: {stats?.score == null ? '—' : <span dir="ltr" className="tabular-nums">{stats.score}%</span>}
            </span>
            {stats?.ranked ? null : <span className="text-sm font-bold text-slate-400">{rankText(stats)}</span>}
          </div>

          <dl className="mt-4 grid w-full grid-cols-4 divide-x divide-x-reverse divide-slate-100 border-t border-slate-100 pt-3">
            <CardStat icon={<CheckCircle className="h-3.5 w-3.5 text-green-500" />} value={stats?.orders ?? 0} label={role === 'tailor' ? 'مكتملة' : 'مقصوصة'} valueClass="text-green-600" />
            <CardStat icon={<Package className="h-3.5 w-3.5 text-blue-500" />} value={activeOrders} label="قيد التنفيذ" valueClass="text-blue-600" />
            <CardStat icon={<Wrench className="h-3.5 w-3.5 text-red-500" />} value={onHim} label="تعديل عليه" valueClass="text-red-600" />
            <CardStat icon={<Users className="h-3.5 w-3.5 text-slate-400" />} value={onOthers} label="على غيره" valueClass="text-slate-600" />
          </dl>
        </div>
      </Link>
    </motion.div>
  )
}

/** المراكز الثلاثة الأولى: ذهبي، فضي، برونزي. */
const RANK_TONES: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-300 to-yellow-500 text-white ring-amber-200',
  2: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white ring-slate-200',
  3: 'bg-gradient-to-br from-orange-300 to-amber-700 text-white ring-orange-200',
}

function RankCorner({ stats }: { stats: WorkerQualityStats | undefined }) {
  if (!stats?.ranked || stats.rank == null) return null
  const tone = RANK_TONES[stats.rank] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span
      className={`absolute start-3 top-3 grid h-10 w-10 place-items-center rounded-full text-lg font-extrabold tabular-nums shadow-sm ring-2 ${tone}`}
      aria-label={`الترتيب ${stats.rank} من ${stats.rankedCount}`}
      title={`الترتيب ${stats.rank} من ${stats.rankedCount}`}
    >
      {stats.rank}
    </span>
  )
}

function CardStat({ icon, value, label, valueClass }: { icon: ReactNode; value: number; label: string; valueClass: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-0.5">
      <dt className="order-2 text-xs font-bold leading-4 text-slate-500">{label}</dt>
      <dd className={`order-1 flex items-center gap-1 text-lg font-extrabold tabular-nums ${valueClass}`}>
        {icon}
        {value}
      </dd>
    </div>
  )
}
