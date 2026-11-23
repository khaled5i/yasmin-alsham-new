'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Calendar, ChevronDown, RotateCw, Table2 } from 'lucide-react'
import { ARABIC_MONTHS, formatOneDecimal } from '@/lib/worker-alteration-stats'
import type { WorkerMonthPoint, WorkerMonthlyStats } from '@/lib/worker-monthly-stats'
import { useMyMonthlyStats } from './use-worker-monthly-stats'

type Language = 'ar' | 'en'

// لونا السلسلتين (تحقّقنا منهما لعمى الألوان والتباين على الأبيض): pink-500 و violet-500
const DRESSES_COLOR = 'bg-pink-500'
const ALTERATIONS_COLOR = 'bg-violet-500'
const PLOT_HEIGHT = 112
const MIN_COLUMN_WIDTH = 48

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthName(key: string, language: Language, short = false): string {
  const index = Number(key.split('-')[1]) - 1
  if (language === 'ar') return ARABIC_MONTHS[index] || key
  const name = EN_MONTHS[index] || key
  return short ? name.slice(0, 3) : name
}

function monthLabel(key: string, language: Language): string {
  return `${monthName(key, language)} ${key.split('-')[0]}`
}

function monthsCount(count: number, language: Language): string {
  if (language === 'en') return `${count} ${count === 1 ? 'month' : 'months'}`
  if (count === 1) return 'شهر واحد'
  if (count === 2) return 'شهرين'
  return `${count} ${count <= 10 ? 'أشهر' : 'شهراً'}`
}

const TEXT = {
  ar: {
    title: 'إحصائياتي',
    since: (month: string) => `كل الأشهر منذ ${month}`,
    total: 'إجمالي فساتينك',
    during: (months: string) => `خلال ${months}`,
    average: 'المتوسط الشهري',
    averageSub: 'للأشهر المكتملة',
    averageWait: 'بعد اكتمال أول شهر',
    best: 'أفضل شهر',
    rate: 'تعديلات لكل 10 فساتين',
    rateSub: (count: number) => `${count} تعديل منذ سبتمبر 2026`,
    monthCard: 'تفاصيل الشهر',
    chooseMonth: 'اختيار الشهر',
    currentTag: ' (الحالي)',
    unit: 'فستان',
    dresses: 'الفساتين',
    soFar: 'حتى الآن',
    vsAverage: 'عن متوسطك الشهري',
    notFinished: 'الشهر لم يكتمل',
    yourAverage: (value: string) => `متوسطك ${value}`,
    alterations: 'التعديلات',
    notRecorded: 'غير مسجّلة بعد',
    per10: 'لكل 10 فساتين',
    chartTitle: 'فساتينك والتعديلات شهرياً',
    chartHint: 'الضغط على أي شهر في الرسم يعرض تفاصيله في الأعلى أيضاً.',
    showTable: 'عرض الأرقام كجدول',
    hideTable: 'إخفاء الجدول',
    month: 'الشهر',
    note: 'التعديلات تشمل كل تعديل على فساتينك مهما كان سببه، وتُحسب على شهر إنجاز الفستان. تسجيل التعديلات بدأ في سبتمبر 2026، فما قبله «—».',
    empty: 'لا توجد فساتين منجزة بعد.',
    error: 'تعذّر تحميل الإحصائيات',
    retry: 'إعادة المحاولة',
  },
  en: {
    title: 'My statistics',
    since: (month: string) => `All months since ${month}`,
    total: 'Your total dresses',
    during: (months: string) => `over ${months}`,
    average: 'Monthly average',
    averageSub: 'finished months only',
    averageWait: 'after your first full month',
    best: 'Best month',
    rate: 'Alterations per 10 dresses',
    rateSub: (count: number) => `${count} alterations since Sep 2026`,
    monthCard: 'Month details',
    chooseMonth: 'Choose month',
    currentTag: ' (current)',
    unit: 'dresses',
    dresses: 'Dresses',
    soFar: 'so far',
    vsAverage: 'vs your monthly average',
    notFinished: 'month not finished',
    yourAverage: (value: string) => `your average ${value}`,
    alterations: 'Alterations',
    notRecorded: 'not recorded yet',
    per10: 'per 10 dresses',
    chartTitle: 'Your dresses and alterations per month',
    chartHint: 'Tap any month in the chart to see its details above.',
    showTable: 'Show numbers as a table',
    hideTable: 'Hide table',
    month: 'Month',
    note: 'Alterations include every alteration on your dresses, whatever the reason, counted in the month the dress was finished. Alterations were first recorded in September 2026, so earlier months show “—”.',
    empty: 'No finished dresses yet.',
    error: 'Could not load the statistics',
    retry: 'Try again',
  },
} as const

type Text = (typeof TEXT)[Language]

/**
 * «إحصائياتي» في لوحة الخياط نفسه: فساتينه والتعديلات عليها لكل الأشهر.
 * بطاقات سريعة + تفاصيل شهر من قائمة منسدلة + رسم أعمدة + جدول اختياري.
 */
export default function WorkerMonthlyStatsSection({ userId, language }: { userId: string; language: Language }) {
  const { data, loading, error, retry } = useMyMonthlyStats({ userId, enabled: !!userId })
  const text = TEXT[language]

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      aria-labelledby="my-stats-title"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className="mt-6 rounded-xl border border-pink-100 bg-white/80 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 flex-shrink-0 text-pink-600 sm:h-6 sm:w-6" />
        <div className="min-w-0">
          <h3 id="my-stats-title" className="text-lg font-bold text-gray-800 sm:text-xl md:text-2xl">{text.title}</h3>
          {data && data.months.length > 0 ? (
            <p className="text-xs text-slate-500">{text.since(monthLabel(data.months[0].month, language))}</p>
          ) : null}
        </div>
      </div>

      {error && !data ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">{text.error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-bold"
          >
            <RotateCw className="h-4 w-4" /> {text.retry}
          </button>
        </div>
      ) : loading || !data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-[84px] animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-xl bg-slate-50" />
        </div>
      ) : data.months.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.empty}</p>
      ) : (
        <StatsBody data={data} language={language} text={text} />
      )}
    </motion.section>
  )
}

// ============================================================================

function StatsBody({ data, language, text }: { data: WorkerMonthlyStats; language: Language; text: Text }) {
  const lastMonth = data.months[data.months.length - 1].month
  const [selectedMonth, setSelectedMonth] = useState(lastMonth)
  const [showTable, setShowTable] = useState(false)
  const selected = data.months.find((point) => point.month === selectedMonth) ?? data.months[data.months.length - 1]

  useEffect(() => {
    if (!data.months.some((point) => point.month === selectedMonth)) setSelectedMonth(lastMonth)
  }, [data.months, lastMonth, selectedMonth])

  const tiles: Array<{ key: string; label: string; value: string; sub: string | null }> = [
    { key: 'total', label: text.total, value: String(data.total), sub: text.during(monthsCount(data.months.length, language)) },
    {
      key: 'average',
      label: text.average,
      value: formatOneDecimal(data.monthlyAverage),
      sub: data.monthlyAverage == null ? text.averageWait : text.averageSub,
    },
    {
      key: 'best',
      label: text.best,
      value: data.best ? String(data.best.orders) : '—',
      sub: data.best ? monthLabel(data.best.month, language) : null,
    },
    {
      key: 'rate',
      label: text.rate,
      value: formatOneDecimal(data.alterationsPer10),
      sub: data.alterationsTotal != null ? text.rateSub(data.alterationsTotal) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex flex-col rounded-xl bg-slate-50 px-3 py-2.5">
            <dt className="text-xs font-bold leading-5 text-slate-500">{tile.label}</dt>
            <dd className="text-2xl font-extrabold leading-8 text-slate-900">{tile.value}</dd>
            {tile.sub ? <dd className="truncate text-xs leading-5 text-slate-500">{tile.sub}</dd> : null}
          </div>
        ))}
      </dl>

      <SelectedMonthCard
        months={data.months}
        point={selected}
        isCurrent={selected.month === lastMonth}
        monthlyAverage={data.monthlyAverage}
        onSelect={setSelectedMonth}
        language={language}
        text={text}
      />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-extrabold text-slate-900">{text.chartTitle}</h4>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${DRESSES_COLOR}`} aria-hidden /> {text.dresses}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${ALTERATIONS_COLOR}`} aria-hidden /> {text.alterations}
            </span>
          </div>
        </div>

        <MonthlyColumns months={data.months} selectedMonth={selected.month} onSelect={setSelectedMonth} language={language} text={text} />
        <p className="mt-1 text-xs text-slate-400">{text.chartHint}</p>
      </div>

      <div>
        <button
          type="button"
          aria-expanded={showTable}
          onClick={() => setShowTable((value) => !value)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <Table2 className="h-4 w-4 text-slate-500" />
          {showTable ? text.hideTable : text.showTable}
        </button>
        {showTable ? <MonthsTable months={data.months} language={language} text={text} /> : null}
      </div>

      <p className="text-xs leading-5 text-slate-400">{text.note}</p>
    </div>
  )
}

// ============================================================================

/** قائمة منسدلة بأشهر العامل فقط (الأحدث أولاً) + أرقام الشهر المختار. */
function SelectedMonthCard({
  months,
  point,
  isCurrent,
  monthlyAverage,
  onSelect,
  language,
  text,
}: {
  months: WorkerMonthPoint[]
  point: WorkerMonthPoint
  isCurrent: boolean
  monthlyAverage: number | null
  onSelect: (month: string) => void
  language: Language
  text: Text
}) {
  const options = [...months].reverse()
  // الفرق عن المتوسط للأشهر المكتملة فقط؛ الشهر الحالي لم ينتهِ بعد
  const diff = !isCurrent && monthlyAverage != null ? point.orders - monthlyAverage : null
  const diffText = diff == null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatOneDecimal(Math.abs(diff))}`
  const rate = point.alterations != null && point.orders > 0 ? formatOneDecimal((point.alterations * 10) / point.orders) : '—'

  const cells: Array<{ key: string; label: string; value: string; sub: string | null; swatch?: string }> = [
    { key: 'dresses', label: text.dresses, value: String(point.orders), sub: isCurrent ? text.soFar : null, swatch: DRESSES_COLOR },
    {
      key: 'diff',
      label: text.vsAverage,
      value: diffText,
      sub: isCurrent ? text.notFinished : monthlyAverage != null ? text.yourAverage(formatOneDecimal(monthlyAverage)) : null,
    },
    {
      key: 'alterations',
      label: text.alterations,
      value: point.alterations == null ? '—' : String(point.alterations),
      sub: point.alterations == null ? text.notRecorded : null,
      swatch: ALTERATIONS_COLOR,
    },
    { key: 'rate', label: text.per10, value: rate, sub: null },
  ]

  return (
    <section className="rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50/70 to-white p-3 sm:p-4" aria-live="polite">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-extrabold text-slate-900">{text.monthCard}</h4>
        <label className="relative block sm:w-64">
          <span className="sr-only">{text.chooseMonth}</span>
          <Calendar className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-500" aria-hidden />
          <select
            value={point.month}
            onChange={(event) => onSelect(event.target.value)}
            className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-pink-200 bg-white pe-9 ps-9 text-[15px] font-bold text-slate-800 shadow-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
          >
            {options.map((option, index) => (
              <option key={option.month} value={option.month}>
                {monthLabel(option.month, language)}{index === 0 ? text.currentTag : ''} — {option.orders} {text.unit}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        </label>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.key} className="flex flex-col rounded-xl border border-slate-100 bg-white px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs font-bold leading-5 text-slate-500">
              {cell.swatch ? <span className={`h-2 w-2 flex-shrink-0 rounded-full ${cell.swatch}`} aria-hidden /> : null}
              {cell.label}
            </dt>
            <dd className="text-xl font-extrabold leading-7 text-slate-900">{cell.value}</dd>
            {cell.sub ? <dd className="truncate text-xs leading-5 text-slate-500">{cell.sub}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  )
}

function MonthlyColumns({
  months,
  selectedMonth,
  onSelect,
  language,
  text,
}: {
  months: WorkerMonthPoint[]
  selectedMonth: string
  onSelect: (month: string) => void
  language: Language
  text: Text
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // محور واحد للسلسلتين (الوحدة نفسها: عدد)
  const max = Math.max(1, ...months.map((point) => Math.max(point.orders, point.alterations ?? 0)))

  // الأحدث في آخر الرسم: نمرّر إليه عند الفتح إن زاد العرض عن الشاشة
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || element.scrollWidth <= element.clientWidth) return
    const rtl = getComputedStyle(element).direction === 'rtl'
    element.scrollLeft = rtl ? -element.scrollWidth : element.scrollWidth
  }, [months.length])

  return (
    <div ref={scrollRef} className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex" style={{ minWidth: months.length * MIN_COLUMN_WIDTH }}>
        {months.map((point, index) => {
          const isSelected = point.month === selectedMonth
          const showYear = index === 0 || point.month.endsWith('-01')
          const label = `${monthLabel(point.month, language)}: ${point.orders} ${text.unit}, ${text.alterations} ${point.alterations ?? '—'}`
          return (
            <button
              key={point.month}
              type="button"
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => onSelect(point.month)}
              className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 pt-1 transition-colors ${
                isSelected ? 'bg-pink-50 ring-1 ring-pink-200' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex w-full items-end justify-center gap-0.5 border-b border-slate-200" style={{ height: PLOT_HEIGHT + 18 }}>
                <Column value={point.orders} max={max} color={DRESSES_COLOR} strong />
                <Column value={point.alterations} max={max} color={ALTERATIONS_COLOR} />
              </div>
              <span className={`mt-1 max-w-full truncate text-[11px] leading-4 ${isSelected ? 'font-extrabold text-pink-700' : 'font-bold text-slate-600'}`}>
                {monthName(point.month, language, true)}
              </span>
              <span className="text-[10px] leading-3 tabular-nums text-slate-400">{showYear ? point.month.slice(0, 4) : ' '}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Column({ value, max, color, strong = false }: { value: number | null; max: number; color: string; strong?: boolean }) {
  const height = value ? Math.max(3, Math.round((value / max) * PLOT_HEIGHT)) : 0
  return (
    <div className="flex h-full w-4 flex-col items-center justify-end">
      <span className={`mb-0.5 text-[11px] font-bold leading-4 tabular-nums ${value == null ? 'text-slate-300' : strong ? 'text-slate-800' : 'text-slate-500'}`}>
        {value == null ? '—' : value}
      </span>
      {height > 0 ? (
        <motion.span
          initial={{ height: 0 }}
          animate={{ height }}
          transition={{ duration: 0.5 }}
          className={`block w-full rounded-t ${color}`}
        />
      ) : null}
    </div>
  )
}

function MonthsTable({ months, language, text }: { months: WorkerMonthPoint[]; language: Language; text: Text }) {
  const rows = [...months].reverse()
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs font-bold text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2 text-start">{text.month}</th>
            <th scope="col" className="px-3 py-2 text-center">{text.dresses}</th>
            <th scope="col" className="px-3 py-2 text-center">{text.alterations}</th>
            <th scope="col" className="px-3 py-2 text-center">{text.per10}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((point) => (
            <tr key={point.month}>
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-start font-bold text-slate-800">{monthLabel(point.month, language)}</th>
              <td className="px-3 py-2 text-center font-bold text-slate-900">{point.orders}</td>
              <td className="px-3 py-2 text-center text-slate-700">{point.alterations ?? '—'}</td>
              <td className="px-3 py-2 text-center text-slate-700">
                {point.alterations != null && point.orders > 0 ? formatOneDecimal((point.alterations * 10) / point.orders) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
