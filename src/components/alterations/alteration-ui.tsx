'use client'

/**
 * اللغة البصرية المشتركة لقسم التعديلات: أسماء وألوان الأنواع والحالات وأسباب التعديل،
 * وصيغة تاريخ ثابتة (DD/MM/YYYY بأرقام إنجليزية)، ونافذة bottom sheet موحّدة.
 * أي صفحة أو مكوّن يعرض تعديلاً يأخذ أسماءه وألوانه من هنا، حتى لا تتفرّق الألوان مجدداً.
 */

import type { ReactNode } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import type { Alteration, AlterationErrorType, AlterationType } from '@/lib/services/alteration-service'
import { extractDateKey, parseDateForDisplay, shiftDate, toLocalDateKey } from '@/lib/date-utils'

type Lang = { ar: string; en: string }

const pick = (label: Lang, isArabic: boolean) => (isArabic ? label.ar : label.en)

// ============================================================================
// أنواع التعديل — نفس ألوان قسم التعديلات داخل الطلب التي اعتادها الموظفون
// ============================================================================

export const ALTERATION_TYPE_META: Record<AlterationType, {
  label: Lang
  short: Lang
  badge: string
  bar: string
  soft: string
  selected: string
}> = {
  first_proof: {
    label: { ar: 'تعديل البروفة الأولى', en: 'First proof alteration' },
    short: { ar: 'البروفة الأولى', en: 'First proof' },
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    bar: 'bg-amber-400',
    soft: 'border-amber-200 bg-amber-50/70',
    selected: 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-200',
  },
  second_proof: {
    label: { ar: 'تعديل البروفة الثانية', en: 'Second proof alteration' },
    short: { ar: 'البروفة الثانية', en: 'Second proof' },
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    bar: 'bg-emerald-500',
    soft: 'border-emerald-200 bg-emerald-50/70',
    selected: 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200',
  },
  after_delivery: {
    label: { ar: 'تعديل بعد التسليم', en: 'Post-delivery alteration' },
    short: { ar: 'بعد التسليم', en: 'After delivery' },
    badge: 'border-red-200 bg-red-50 text-red-700',
    bar: 'bg-red-500',
    soft: 'border-red-200 bg-red-50/70',
    selected: 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-200',
  },
}

export function getAlterationTypeMeta(type: string | null | undefined) {
  return ALTERATION_TYPE_META[type as AlterationType] ?? ALTERATION_TYPE_META.after_delivery
}

export function getAlterationTypeLabel(type: string | null | undefined, isArabic = true, short = false) {
  const meta = getAlterationTypeMeta(type)
  return pick(short ? meta.short : meta.label, isArabic)
}

// ============================================================================
// حالات التعديل
// ============================================================================

export type AlterationStatus = Alteration['status']

export const ALTERATION_STATUS_KEYS: AlterationStatus[] = ['pending', 'in_progress', 'completed', 'delivered', 'cancelled']

export const ALTERATION_STATUS_META: Record<AlterationStatus, { label: Lang; badge: string; dot: string }> = {
  pending: { label: { ar: 'قيد الانتظار', en: 'Pending' }, badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  in_progress: { label: { ar: 'قيد التنفيذ', en: 'In progress' }, badge: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  completed: { label: { ar: 'مكتمل', en: 'Completed' }, badge: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
  delivered: { label: { ar: 'تم التسليم', en: 'Delivered' }, badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  cancelled: { label: { ar: 'ملغي', en: 'Cancelled' }, badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-400' },
}

export function getAlterationStatusMeta(status: string | null | undefined) {
  return ALTERATION_STATUS_META[status as AlterationStatus] ?? ALTERATION_STATUS_META.pending
}

export function StatusBadge({ status, isArabic = true, className = '' }: { status: string | null | undefined; isArabic?: boolean; className?: string }) {
  const meta = getAlterationStatusMeta(status)
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${meta.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {pick(meta.label, isArabic)}
    </span>
  )
}

/** حالات الطلب الأصلي (orders.status) بالعربي. */
export const ORDER_STATUS_META: Record<string, { label: Lang; badge: string }> = {
  pending: { label: { ar: 'في الانتظار', en: 'Pending' }, badge: 'bg-yellow-50 text-yellow-800' },
  in_progress: { label: { ar: 'قيد التنفيذ', en: 'In progress' }, badge: 'bg-sky-50 text-sky-700' },
  completed: { label: { ar: 'مكتمل', en: 'Completed' }, badge: 'bg-teal-50 text-teal-700' },
  delivered: { label: { ar: 'تم التسليم', en: 'Delivered' }, badge: 'bg-violet-50 text-violet-700' },
  cancelled: { label: { ar: 'ملغي', en: 'Cancelled' }, badge: 'bg-rose-50 text-rose-700' },
}

export function getOrderStatusMeta(status: string | null | undefined) {
  return ORDER_STATUS_META[status || ''] ?? { label: { ar: 'غير محدد', en: 'Unknown' }, badge: 'bg-slate-100 text-slate-600' }
}

// ============================================================================
// سبب التعديل — الخمسة المعتمدة، و«خطأ آخر» للسجلات القديمة فقط
// ============================================================================

export const ALTERATION_REASON_OPTIONS: Array<{ value: Exclude<AlterationErrorType, 'other_error'>; tone: string }> = [
  { value: 'tailor_error', tone: 'red' },
  { value: 'cutter_error', tone: 'orange' },
  { value: 'measurement_error', tone: 'yellow' },
  { value: 'customer_error', tone: 'blue' },
  { value: 'reception_error', tone: 'purple' },
]

export const ALTERATION_REASON_META: Record<AlterationErrorType, { label: Lang; badge: string }> = {
  tailor_error: { label: { ar: 'خطأ الخياط', en: 'Tailor error' }, badge: 'border-red-200 bg-white text-red-700' },
  cutter_error: { label: { ar: 'خطأ القصاص', en: 'Cutter error' }, badge: 'border-orange-200 bg-white text-orange-700' },
  measurement_error: { label: { ar: 'خطأ قياس', en: 'Measurement error' }, badge: 'border-yellow-300 bg-white text-yellow-800' },
  customer_error: { label: { ar: 'خطأ زبونة', en: 'Customer error' }, badge: 'border-blue-200 bg-white text-blue-700' },
  reception_error: { label: { ar: 'خطأ الاستقبال', en: 'Reception error' }, badge: 'border-purple-200 bg-white text-purple-700' },
  other_error: { label: { ar: 'خطأ آخر', en: 'Other error' }, badge: 'border-slate-200 bg-white text-slate-600' },
}

export function getAlterationReasonMeta(reason: string | null | undefined) {
  return reason ? ALTERATION_REASON_META[reason as AlterationErrorType] ?? null : null
}

// ============================================================================
// التواريخ: صيغة ثابتة DD/MM/YYYY بأرقام إنجليزية
// ============================================================================

/** تاريخ يوم (عمود DATE أو بداية نص ISO) → 19/11/2026. القيمة الفارغة → ''. */
export function formatAlterationDate(value: string | null | undefined): string {
  if (!value) return ''
  const key = extractDateKey(value)
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[3]}/${match[2]}/${match[1]}`
}

/** توقيت كامل (timestamptz) بالتوقيت المحلي → 19/11/2026. */
export function formatAlterationTimestampDate(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return formatAlterationDate(value)
  return formatAlterationDate(toLocalDateKey(parsed))
}

/** توقيت كامل → 19/11/2026 · 3:05 م */
export function formatAlterationDateTime(value: string | null | undefined, isArabic = true): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${formatAlterationDate(toLocalDateKey(parsed))} · ${formatAlterationTime(value, isArabic)}`
}

/** الساعة فقط → 3:05 م */
export function formatAlterationTime(value: string | null | undefined, isArabic = true): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const hours = parsed.getHours()
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  const suffix = hours < 12 ? (isArabic ? 'ص' : 'AM') : (isArabic ? 'م' : 'PM')
  return `${hour12}:${minutes} ${suffix}`
}

export function todayDateKey(): string {
  return toLocalDateKey(new Date())
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = parseDateForDisplay(fromKey)
  const to = parseDateForDisplay(toKey)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function arabicDays(count: number): string {
  if (count === 1) return 'يوم'
  if (count === 2) return 'يومين'
  if (count <= 10) return `${count} أيام`
  return `${count} يوماً`
}

export type DueKind = 'none' | 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'closed'

/** الحالات التي لا يُعدّ فيها التعديل متأخراً (انتهى أو أُلغي). */
export const ALTERATION_CLOSED_STATUSES: AlterationStatus[] = ['completed', 'delivered', 'cancelled']

export function getDueInfo(
  dueDate: string | null | undefined,
  status: string | null | undefined,
  isArabic = true
): { kind: DueKind; date: string; relative: string; tone: string } {
  const date = formatAlterationDate(dueDate)
  if (!date || !dueDate) {
    return { kind: 'none', date: '', relative: '', tone: 'border-slate-200 bg-slate-50 text-slate-500' }
  }

  const diff = daysBetween(todayDateKey(), extractDateKey(dueDate))
  const closed = ALTERATION_CLOSED_STATUSES.includes(status as AlterationStatus)

  if (closed) {
    return { kind: 'closed', date, relative: '', tone: 'border-slate-200 bg-slate-50 text-slate-600' }
  }
  if (diff < 0) {
    const days = Math.abs(diff)
    return {
      kind: 'overdue',
      date,
      relative: isArabic ? `متأخر ${arabicDays(days)}` : `${days} day${days === 1 ? '' : 's'} late`,
      tone: 'border-red-200 bg-red-50 text-red-700',
    }
  }
  if (diff === 0) {
    return { kind: 'today', date, relative: isArabic ? 'اليوم' : 'Today', tone: 'border-pink-300 bg-pink-50 text-pink-700' }
  }
  if (diff === 1) {
    return { kind: 'tomorrow', date, relative: isArabic ? 'غداً' : 'Tomorrow', tone: 'border-purple-200 bg-purple-50 text-purple-700' }
  }
  return {
    kind: 'upcoming',
    date,
    relative: isArabic ? `بعد ${arabicDays(diff)}` : `in ${diff} days`,
    tone: 'border-slate-200 bg-white text-slate-700',
  }
}

/** موعد البروفة الثانية للطلب: المخزّن، وإلا due_date − 1 عند وجود بروفة ثانية. */
export function getSecondProofDate(order: {
  has_second_proof?: boolean | null
  second_proof_date?: string | null
  due_date?: string | null
}): string {
  if (!order.has_second_proof || !order.due_date) return ''
  return order.second_proof_date || shiftDate(order.due_date, -1)
}

// ============================================================================
// Bottom sheet: تنزلق من الأسفل على الهاتف، ونافذة في الوسط على الشاشات الكبيرة
// ============================================================================

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  size = 'md',
  zIndex = 'z-[80]',
  dir = 'rtl',
  hideClose = false,
  bodyClassName = 'px-4 py-4 sm:px-6',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
  zIndex?: string
  dir?: 'rtl' | 'ltr'
  hideClose?: boolean
  bodyClassName?: string
}) {
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : size === 'full' ? 'sm:max-w-3xl' : 'sm:max-w-xl'
  const height = size === 'full' ? 'h-[92dvh] sm:h-[85vh]' : 'max-h-[92dvh] sm:max-h-[88vh]'

  return (
    <Dialog open={open} onClose={onClose} className={`relative ${zIndex}`}>
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          transition
          dir={dir}
          className={`flex w-full ${width} ${height} flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl transition duration-200 ease-out data-[closed]:translate-y-full sm:rounded-3xl sm:data-[closed]:translate-y-4 sm:data-[closed]:scale-95 sm:data-[closed]:opacity-0`}
        >
          <div className="shrink-0 border-b border-pink-100 bg-gradient-to-b from-pink-50/80 to-white px-4 pb-3 pt-2 sm:px-6 sm:pt-4">
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {eyebrow ? <div className="mb-0.5 text-xs font-bold text-pink-600">{eyebrow}</div> : null}
                <DialogTitle className="text-lg font-extrabold leading-7 text-slate-900">{title}</DialogTitle>
                {subtitle ? <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div> : null}
              </div>
              {hideClose ? null : (
                <button
                  type="button"
                  onClick={onClose}
                  className="-me-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="إغلاق"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>{children}</div>

          {footer ? (
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
              {footer}
            </div>
          ) : (
            <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}

// ============================================================================
// تأكيد بديل لـ window.confirm
// ============================================================================

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'تراجع',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
  zIndex = 'z-[90]',
}: {
  open: boolean
  title: ReactNode
  message?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary' | 'warning'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  zIndex?: string
}) {
  const confirmClass = tone === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : tone === 'warning'
      ? 'bg-amber-500 text-white hover:bg-amber-600'
      : 'bg-gradient-to-l from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600'
  const iconClass = tone === 'danger' ? 'bg-red-50 text-red-600' : tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-pink-50 text-pink-600'

  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      zIndex={zIndex}
      footer={(
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold shadow-sm transition disabled:opacity-60 ${confirmClass}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      )}
    >
      {message ? (
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="pt-1 text-[15px] leading-7 text-slate-600">{message}</div>
        </div>
      ) : null}
    </BottomSheet>
  )
}

// ============================================================================
// عارض صورة بملء الشاشة
// ============================================================================

export function ImageViewer({ src, onClose, alt = '' }: { src: string | null; onClose: () => void; alt?: string }) {
  return (
    <Dialog open={Boolean(src)} onClose={onClose} className="relative z-[95]">
      <DialogBackdrop transition className="fixed inset-0 bg-black/90 transition-opacity duration-200 data-[closed]:opacity-0" />
      <div className="fixed inset-0 flex items-center justify-center p-3">
        <DialogPanel transition className="relative flex h-full w-full items-center justify-center transition duration-200 data-[closed]:opacity-0">
          <DialogTitle className="sr-only">{alt || 'صورة'}</DialogTitle>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored images can be data URLs
            <img src={src} alt={alt} className="max-h-full max-w-full rounded-xl object-contain" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="absolute end-1 top-[calc(0.25rem+env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
            aria-label="إغلاق"
          >
            <X className="h-6 w-6" />
          </button>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
