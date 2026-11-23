'use client'

/**
 * مكوّنات عرض جودة العمال من التعديلات — تستخدم ألوان وأسماء قسم التعديلات (alteration-ui)
 * وقواعد الحساب من worker-alteration-stats، ولا تعرّف ألواناً أو أوزاناً خاصة بها.
 */

import { Calendar, Info } from 'lucide-react'
import { ALTERATION_TYPE_META } from '@/components/alterations/alteration-ui'
import {
  ALTERATION_TYPE_ORDER,
  monthLabel,
  recentMonthKeys,
  scoreTone,
  type TypeCounts,
  type WorkerQualityStats,
} from '@/lib/worker-alteration-stats'

export const UNCLASSIFIED_BADGE = 'border-slate-300 bg-slate-50 text-slate-600'

// ============================================================================
// اختيار الشهر
// ============================================================================

export function MonthSelect({
  value,
  onChange,
  includeAll = false,
  count = 18,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  includeAll?: boolean
  count?: number
  className?: string
}) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">الشهر</span>
      <Calendar className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-500" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-pink-200 bg-white pe-9 ps-4 text-[15px] font-bold text-slate-700 shadow-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
      >
        {includeAll ? <option value="">كل الأشهر</option> : null}
        {recentMonthKeys(count).map((key) => (
          <option key={key} value={key}>{monthLabel(key)}</option>
        ))}
      </select>
    </label>
  )
}

// ============================================================================
// أنواع التعديل: شريط ملوّن + أعداد
// ============================================================================

export function TypeStackBar({ counts, className = 'h-2' }: { counts: TypeCounts; className?: string }) {
  const total = ALTERATION_TYPE_ORDER.reduce((sum, type) => sum + counts[type], 0)
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${className}`} aria-hidden>
      {total > 0
        ? ALTERATION_TYPE_ORDER.map((type) => counts[type] > 0 ? (
            <span key={type} className={ALTERATION_TYPE_META[type].bar} style={{ width: `${(counts[type] / total) * 100}%` }} />
          ) : null)
        : null}
    </div>
  )
}

/** أعداد الأنواع كنقاط ملوّنة صغيرة في سطر واحد. */
export function TypeDots({ counts }: { counts: TypeCounts }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
      {ALTERATION_TYPE_ORDER.map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${ALTERATION_TYPE_META[type].bar}`} />
          {ALTERATION_TYPE_META[type].short.ar}
          <strong className="tabular-nums text-slate-900">{counts[type]}</strong>
        </span>
      ))}
    </div>
  )
}

// ============================================================================
// التقييم والترتيب
// ============================================================================

export function rankText(stats: WorkerQualityStats | undefined): string {
  if (!stats || stats.orders === 0) return 'لا طلبات هذا الشهر'
  if (!stats.ranked) return 'غير مرتّب (طلبات قليلة)'
  return `الترتيب ${stats.rank} من ${stats.rankedCount}`
}

export function ScoreBlock({ stats, size = 'md' }: { stats: WorkerQualityStats | undefined; size?: 'md' | 'lg' }) {
  const score = stats?.score ?? null
  const tone = scoreTone(score)
  const big = size === 'lg'
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center rounded-2xl ring-1 ${tone.bg} ${tone.ring} ${big ? 'h-20 w-24' : 'h-14 w-16'}`}>
      <span className="text-[11px] font-bold text-slate-500">تقييم الشهر</span>
      <span dir="ltr" className={`mt-0.5 font-extrabold leading-none tabular-nums ${tone.text} ${big ? 'text-3xl' : 'text-xl'} ${stats?.ranked ? '' : 'opacity-60'}`}>
        {score == null ? '—' : `${score}%`}
      </span>
    </div>
  )
}

export function UnclassifiedWarning() {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
      <Info className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
      أغلب التعديلات بلا سبب محدد، فالتقييم غير دقيق بعد.
    </p>
  )
}
