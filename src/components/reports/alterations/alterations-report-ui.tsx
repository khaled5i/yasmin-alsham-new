'use client'

/**
 * قطع العرض في قسم «التعديلات» بالتقارير. الأسماء والألوان والتاريخ من alteration-ui،
 * فلا ألوان أو صيغ خاصة هنا.
 */

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, FileText, Info, Inbox } from 'lucide-react'
import {
  ALTERATION_TYPE_META,
  BottomSheet,
  formatAlterationTimestampDate,
  getAlterationReasonMeta,
} from '@/components/alterations/alteration-ui'
import type { ReportItem } from './alterations-report-data'

// ============================================================================
// تنبيهات وحالات فارغة
// ============================================================================

export function Notice({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'slate' | 'red' }) {
  const styles = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    red: 'border-red-200 bg-red-50 text-red-800',
  }[tone]
  const Icon = tone === 'red' ? AlertTriangle : Info
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm leading-6 ${styles}`}>
      <Icon className="mt-1 h-4 w-4 shrink-0 opacity-70" />
      <span>{children}</span>
    </p>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
      <Inbox className="h-6 w-6 text-slate-300" />
      {children}
    </div>
  )
}

// ============================================================================
// بطاقة قسم فرعي
// ============================================================================

export function Block({ title, hint, children, action }: { title: string; hint?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-pink-100 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-slate-900 sm:text-lg">{title}</h3>
          {hint ? <p className="mt-0.5 text-sm leading-6 text-slate-500">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

// ============================================================================
// بطاقة رقم قابلة للفتح
// ============================================================================

export function StatCard({
  label,
  value,
  hint,
  tone = 'pink',
  onClick,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'pink' | 'purple' | 'red' | 'slate' | 'emerald'
  onClick?: () => void
}) {
  const valueTone = {
    pink: 'text-pink-700',
    purple: 'text-purple-700',
    red: 'text-red-600',
    slate: 'text-slate-700',
    emerald: 'text-emerald-700',
  }[tone]
  const content = (
    <>
      <span dir="ltr" className={`block text-2xl font-extrabold leading-none tabular-nums sm:text-3xl ${valueTone}`}>{value}</span>
      <span className="mt-1.5 block text-sm font-bold leading-5 text-slate-700">{label}</span>
      {hint ? <span className="mt-0.5 block text-[13px] leading-5 text-slate-500">{hint}</span> : null}
    </>
  )
  const base = 'flex min-h-[96px] w-full flex-col items-start rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50/50 to-white p-3 text-start'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition hover:border-pink-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400`}>
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  )
}

// ============================================================================
// صف شريط أفقي قابل للفتح
// ============================================================================

export function BarRow({
  label,
  count,
  max,
  sub,
  barClass = 'bg-gradient-to-l from-pink-500 to-purple-500',
  onClick,
}: {
  label: string
  count: number
  max: number
  sub?: string
  barClass?: string
  onClick?: () => void
}) {
  const width = max > 0 ? Math.max(count > 0 ? 4 : 0, (count / max) * 100) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || count === 0}
      className="block min-h-[44px] w-full rounded-xl px-2 py-1.5 text-start transition enabled:hover:bg-pink-50/70 disabled:cursor-default"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-bold text-slate-800">{label}</span>
        <span className="shrink-0 text-sm text-slate-500">
          <strong className="tabular-nums text-slate-900">{count}</strong>
          {sub ? <span className="ms-1 tabular-nums">{sub}</span> : null}
        </span>
      </span>
      <span className="mt-1 block h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
      </span>
    </button>
  )
}

// ============================================================================
// نافذة التعديلات خلف رقم
// ============================================================================

export interface DrillState {
  title: string
  subtitle?: string
  items: ReportItem[]
  note?: string
}

const PAGE = 40

export function ItemsSheet({
  drill,
  onClose,
  workerName,
  onOpenOrder,
}: {
  drill: DrillState | null
  onClose: () => void
  workerName: (id: string | null | undefined) => string | null
  onOpenOrder: (orderId: string) => void
}) {
  const [shown, setShown] = useState(PAGE)
  const [lastDrill, setLastDrill] = useState<DrillState | null>(drill)
  if (drill !== lastDrill) {
    setLastDrill(drill)
    setShown(PAGE)
  }
  const items = drill?.items ?? []

  return (
    <BottomSheet
      open={!!drill}
      onClose={onClose}
      title={drill?.title ?? ''}
      subtitle={drill ? `${drill.subtitle ? `${drill.subtitle} · ` : ''}${items.length} تعديل` : undefined}
      size="lg"
      bodyClassName="px-3 py-3 sm:px-5"
    >
      <div className="space-y-2.5">
        {drill?.note ? <Notice tone="slate">{drill.note}</Notice> : null}
        {items.length === 0 ? <EmptyState>لا تعديلات هنا</EmptyState> : null}
        {items.slice(0, shown).map((item) => (
          <ItemCard key={item.id} item={item} workerName={workerName} onOpenOrder={onOpenOrder} />
        ))}
        {items.length > shown ? (
          <button
            type="button"
            onClick={() => setShown((value) => value + PAGE)}
            className="h-11 w-full rounded-xl border border-pink-200 bg-white text-sm font-bold text-pink-700"
          >
            عرض المزيد ({items.length - shown})
          </button>
        ) : null}
      </div>
    </BottomSheet>
  )
}

function ItemCard({
  item,
  workerName,
  onOpenOrder,
}: {
  item: ReportItem
  workerName: (id: string | null | undefined) => string | null
  onOpenOrder: (orderId: string) => void
}) {
  const type = ALTERATION_TYPE_META[item.alteration_type] ?? ALTERATION_TYPE_META.after_delivery
  const reason = item.reason !== 'unclassified' ? getAlterationReasonMeta(item.error_type) : null
  const tailor = workerName(item.order?.worker_id)
  const date = formatAlterationTimestampDate(item.created_at)
  const note = item.notes?.trim() || item.error_notes?.trim() || ''

  return (
    <article className={`rounded-2xl border p-3 ${type.soft}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${type.badge}`}>{type.short.ar}</span>
        {reason ? <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${reason.badge}`}>{reason.label.ar}</span> : null}
        {date ? <span dir="ltr" className="ms-auto text-sm tabular-nums text-slate-500">{date}</span> : null}
      </div>
      <p className="mt-2 truncate text-[15px] font-extrabold text-slate-900">{item.client_name?.trim() || 'بدون اسم'}</p>
      <p className="mt-0.5 text-sm text-slate-600">
        {item.order?.order_number ? <>طلب <span dir="ltr" className="tabular-nums">#{item.order.order_number}</span></> : 'بلا طلب مرتبط'}
        {item.order ? <> · {tailor ? `الخياط: ${tailor}` : 'بلا خياط'}</> : null}
      </p>
      <p className={`mt-1.5 line-clamp-2 text-sm leading-6 ${note ? 'text-slate-700' : 'italic text-slate-400'}`}>
        {note || 'بلا ملاحظة مكتوبة'}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Link
          href={`/dashboard/alterations/add?editId=${item.id}`}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-white text-sm font-bold text-pink-700"
        >
          <FileText className="h-4 w-4" /> فتح التعديل
        </Link>
        {item.original_order_id ? (
          <button
            type="button"
            onClick={() => onOpenOrder(item.original_order_id!)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-white text-sm font-bold text-purple-700"
          >
            <ExternalLink className="h-4 w-4" /> فتح الطلب
          </button>
        ) : (
          <span className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-100 bg-white/60 text-sm text-slate-400">بلا طلب</span>
        )}
      </div>
    </article>
  )
}
