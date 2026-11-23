/**
 * حسابات قسم «التعديلات» في صفحة التقارير — دوال صافية بلا واجهة.
 *
 * قواعد النسب (اعتمدها المدير 2026-11-19):
 * - التعديل يُنسب لتاريخ تسجيله (created_at بالتوقيت المحلي للمتصفح = الرياض) داخل فترة التقرير.
 * - «لكل 100 طلب» = تعديلات الفترة ÷ الطلبات المنجزة في الفترة × 100.
 * - «طلبات عليها تعديل» = من الطلبات المنجزة في الفترة، كم عليه تعديل في أي وقت (ترتفع لاحقاً).
 * - من يتحمّل التعديل: reasonKeyOf/bucketOf من worker-alteration-stats، ولا قواعد خاصة هنا.
 * - العمال لا يُحسبون هنا: القسم يستدعي computeRoleStats كما في متابعة العمال.
 */

import type { AlterationType, ReportAlteration } from '@/lib/services/alteration-service'
import type { AlterationReportOrder } from '@/lib/services/order-service'
import type { QualityReviewAttemptSummary } from '@/lib/services/order-quality-review-service'
import {
  ALTERATION_TYPE_ORDER,
  bucketOf,
  emptyTypeCounts,
  reasonKeyOf,
  shiftMonthKey,
  type ReasonBucket,
  type ReasonKey,
  type TypeCounts,
} from '@/lib/worker-alteration-stats'
import { ISSUE_ACTIONS, ISSUE_AREAS, classifyIssueText } from './alteration-issue-keywords'

/** أقل من هذا العدد في مجموعة مقارنة → تنبيه «بيانات غير كافية». */
export const MIN_GROUP_FOR_CONCLUSION = 10
export const TREND_MONTHS = 6
/** «قريب من موعد التسليم»: سُجّل التعديل قبل الموعد بهذا العدد من الأيام أو أقل. */
export const NEAR_DUE_DAYS = 3

export interface ReportItem extends ReportAlteration {
  order: AlterationReportOrder | null
  reason: ReasonKey
  bucket: ReasonBucket
  areas: Set<string>
  actions: Set<string>
  hasNote: boolean
}

const DAY_MS = 86_400_000

/** نص تاريخ → Date محلي. تاريخ اليوم وحده (YYYY-MM-DD) يُقرأ منتصف ليل محلياً. */
export function parseLocal(value: string | null | undefined): Date | null {
  if (!value) return null
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function localMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** تاريخ إنجاز الطلب — نفس سلسلة getQualityOrders. */
export function completedAtOf(order: AlterationReportOrder): Date | null {
  return parseLocal(order.worker_completed_at || order.admin_completed_at || order.delivery_date)
}

const daysBetween = (later: Date, earlier: Date) => Math.floor((startOfDay(later) - startOfDay(earlier)) / DAY_MS)
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

export function buildItems(alterations: ReportAlteration[], orders: Map<string, AlterationReportOrder>): ReportItem[] {
  return alterations
    .map((alteration) => {
      const reason = reasonKeyOf(alteration.error_type)
      const text = [alteration.notes, alteration.error_notes].filter(Boolean).join(' ')
      const { areas, actions } = classifyIssueText(text)
      return {
        ...alteration,
        order: alteration.original_order_id ? orders.get(alteration.original_order_id) ?? null : null,
        reason,
        bucket: bucketOf(reason),
        areas,
        actions,
        hasNote: !!alteration.notes?.trim(),
      }
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

export function typeCountsOf(items: ReportItem[]): TypeCounts {
  const counts = emptyTypeCounts()
  for (const item of items) counts[item.alteration_type] = (counts[item.alteration_type] || 0) + 1
  return counts
}

const isClassified = (item: ReportItem) => item.reason !== 'unclassified'

// ============================================================================
// المؤشرات
// ============================================================================

export interface CohortStats {
  orders: number
  withAlteration: AlterationReportOrder[]
  withTwoPlus: AlterationReportOrder[]
  /** تعديلات طلبات الفترة المنجزة (في أي وقت). */
  items: ReportItem[]
}

export function computeCohort(completedInPeriod: AlterationReportOrder[], cohortItems: ReportItem[]): CohortStats {
  const ids = new Set(completedInPeriod.map((order) => order.id))
  const perOrder = new Map<string, number>()
  const items = cohortItems.filter((item) => item.original_order_id && ids.has(item.original_order_id))
  for (const item of items) perOrder.set(item.original_order_id!, (perOrder.get(item.original_order_id!) || 0) + 1)
  return {
    orders: completedInPeriod.length,
    withAlteration: completedInPeriod.filter((order) => (perOrder.get(order.id) || 0) >= 1),
    withTwoPlus: completedInPeriod.filter((order) => (perOrder.get(order.id) || 0) >= 2),
    items,
  }
}

// ============================================================================
// الاتجاه الشهري
// ============================================================================

export interface TrendMonth {
  month: string
  counts: TypeCounts
  total: number
  completedOrders: number
  per100: number | null
  items: ReportItem[]
  unclassified: number
  otherError: number
  noReason: number
  noNote: number
  unlinked: number
}

export function computeTrend(endMonth: string, items: ReportItem[], completed: AlterationReportOrder[]): TrendMonth[] {
  const months = Array.from({ length: TREND_MONTHS }, (_, index) => shiftMonthKey(endMonth, index - (TREND_MONTHS - 1)))
  const completedByMonth = new Map<string, number>()
  for (const order of completed) {
    const at = completedAtOf(order)
    if (!at) continue
    const key = localMonthKey(at)
    completedByMonth.set(key, (completedByMonth.get(key) || 0) + 1)
  }
  return months.map((month) => {
    const monthItems = items.filter((item) => {
      const at = parseLocal(item.created_at)
      return at ? localMonthKey(at) === month : false
    })
    const completedOrders = completedByMonth.get(month) || 0
    return {
      month,
      counts: typeCountsOf(monthItems),
      total: monthItems.length,
      completedOrders,
      per100: completedOrders > 0 ? (monthItems.length * 100) / completedOrders : null,
      items: monthItems,
      unclassified: monthItems.filter((item) => !isClassified(item)).length,
      otherError: monthItems.filter((item) => item.error_type === 'other_error').length,
      noReason: monthItems.filter((item) => !item.error_type).length,
      noNote: monthItems.filter((item) => !item.hasNote).length,
      unlinked: monthItems.filter((item) => !item.order || !item.order.worker_id).length,
    }
  })
}

// ============================================================================
// المشاكل (المواضع والإجراءات)
// ============================================================================

export interface IssueRow {
  key: string
  label: string
  words: string[]
  items: ReportItem[]
}

export function computeIssues(items: ReportItem[]) {
  const rows = (groups: typeof ISSUE_AREAS, pick: (item: ReportItem) => Set<string>): IssueRow[] =>
    groups
      .map((group) => ({ key: group.key, label: group.label, words: group.words, items: items.filter((item) => pick(item).has(group.key)) }))
      .filter((row) => row.items.length > 0)
      .sort((a, b) => b.items.length - a.items.length)
  const withNote = items.filter((item) => item.hasNote)
  return {
    areas: rows(ISSUE_AREAS, (item) => item.areas),
    actions: rows(ISSUE_ACTIONS, (item) => item.actions),
    withNote,
    noNote: items.filter((item) => !item.hasNote),
    /** فيها ملاحظة لكن لا تطابق أي موضع. */
    unmatched: withNote.filter((item) => item.areas.size === 0),
  }
}

// ============================================================================
// الأسباب ومن يتحمّلها
// ============================================================================

export const BUCKET_ORDER: ReasonBucket[] = ['tailor', 'cutter', 'outside', 'customer', 'unclassified']

export const BUCKET_LABELS: Record<ReasonBucket, string> = {
  tailor: 'الخياط',
  cutter: 'القصّاص',
  outside: 'خارج الورشة (قياس/استقبال)',
  customer: 'الزبونة',
  unclassified: 'بلا سبب محدد',
}

export function computeBuckets(items: ReportItem[]) {
  return BUCKET_ORDER.map((bucket) => ({ bucket, label: BUCKET_LABELS[bucket], items: items.filter((item) => item.bucket === bucket) }))
}

// ============================================================================
// أين تتركّز (على الطلبات المنجزة في الفترة)
// ============================================================================

export interface GroupComparison {
  key: string
  label: string
  orders: number
  alterations: ReportItem[]
  ordersWithAlteration: number
  perOrder: number | null
  enough: boolean
}

function compareGroups(
  cohort: CohortStats,
  completed: AlterationReportOrder[],
  groupOf: (order: AlterationReportOrder) => { key: string; label: string },
  includeItem: (item: ReportItem) => boolean = () => true
): GroupComparison[] {
  const groups = new Map<string, GroupComparison>()
  const orderGroup = new Map<string, string>()
  for (const order of completed) {
    const { key, label } = groupOf(order)
    orderGroup.set(order.id, key)
    const entry = groups.get(key) ?? { key, label, orders: 0, alterations: [], ordersWithAlteration: 0, perOrder: null, enough: false }
    entry.orders += 1
    groups.set(key, entry)
  }
  const touched = new Map<string, Set<string>>()
  for (const item of cohort.items) {
    if (!includeItem(item) || !item.original_order_id) continue
    const key = orderGroup.get(item.original_order_id)
    const entry = key ? groups.get(key) : null
    if (!entry) continue
    entry.alterations.push(item)
    const set = touched.get(entry.key) ?? new Set<string>()
    set.add(item.original_order_id)
    touched.set(entry.key, set)
  }
  for (const entry of groups.values()) {
    entry.ordersWithAlteration = touched.get(entry.key)?.size ?? 0
    entry.perOrder = entry.orders > 0 ? entry.alterations.length / entry.orders : null
    entry.enough = entry.orders >= MIN_GROUP_FOR_CONCLUSION
  }
  return [...groups.values()].sort((a, b) => b.orders - a.orders)
}

export const MEASUREMENT_SOURCE_LABELS: Record<string, string> = {
  yasmin_alsham: 'مقاس ياسمين الشام',
  external: 'مقاس خارجي',
}

export function computeConcentration(cohort: CohortStats, completed: AlterationReportOrder[]) {
  return {
    measurement: compareGroups(cohort, completed, (order) => (
      order.measurement_source && MEASUREMENT_SOURCE_LABELS[order.measurement_source]
        ? { key: order.measurement_source, label: MEASUREMENT_SOURCE_LABELS[order.measurement_source] }
        : { key: 'unknown', label: 'غير محدد' }
    )),
    // تعديلات البروفة الثانية تُستبعد: لا توجد إلا مع بروفة ثانية، فالمقارنة بها محسومة سلفاً
    secondProof: compareGroups(
      cohort,
      completed,
      (order) => (order.has_second_proof ? { key: 'yes', label: 'مع بروفة ثانية' } : { key: 'no', label: 'بلا بروفة ثانية' }),
      (item) => item.alteration_type !== 'second_proof'
    ),
  }
}

// ============================================================================
// التوقيت
// ============================================================================

export const DAY_BUCKETS = [
  { key: '0-7', label: 'أسبوع أو أقل', min: 0, max: 7 },
  { key: '8-14', label: '8–14 يوماً', min: 8, max: 14 },
  { key: '15-30', label: '15–30 يوماً', min: 15, max: 30 },
  { key: '31+', label: 'أكثر من 30 يوماً', min: 31, max: Infinity },
]

export interface TimingByType {
  type: AlterationType
  median: number | null
  measured: number
  buckets: Array<{ key: string; label: string; items: ReportItem[] }>
}

const median = (values: number[]) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/** الأيام من استلام الطلب (order_received_date، وإلا تاريخ إنشائه) إلى تسجيل التعديل. */
export function daysFromReceived(item: ReportItem): number | null {
  const received = parseLocal(item.order?.order_received_date || item.order?.created_at)
  const created = parseLocal(item.created_at)
  if (!received || !created) return null
  const days = daysBetween(created, received)
  return days >= 0 ? days : null
}

export function computeTiming(items: ReportItem[]) {
  const byType: TimingByType[] = ALTERATION_TYPE_ORDER.map((type) => {
    const typed = items.filter((item) => item.alteration_type === type)
    const measured = typed.map((item) => ({ item, days: daysFromReceived(item) })).filter((row): row is { item: ReportItem; days: number } => row.days != null)
    return {
      type,
      median: median(measured.map((row) => row.days)),
      measured: measured.length,
      buckets: DAY_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        items: measured.filter((row) => row.days >= bucket.min && row.days <= bucket.max).map((row) => row.item),
      })),
    }
  })

  // تعديلات البروفات (قبل التسليم) مقارنة بموعد تسليم الطلب
  const beforeDelivery = items.filter((item) => item.alteration_type !== 'after_delivery')
  const nearDue: ReportItem[] = []
  const afterDue: ReportItem[] = []
  let withDue = 0
  for (const item of beforeDelivery) {
    const due = parseLocal(item.order?.due_date)
    const created = parseLocal(item.created_at)
    if (!due || !created) continue
    withDue += 1
    const left = daysBetween(due, created)
    if (left < 0) afterDue.push(item)
    else if (left <= NEAR_DUE_DAYS) nearDue.push(item)
  }
  return { byType, beforeDeliveryCount: beforeDelivery.length, withDue, nearDue, afterDue }
}

// ============================================================================
// الزبونات المتكررة بعد التسليم
// ============================================================================

export interface RepeatCustomer {
  key: string
  name: string
  items: ReportItem[]
}

const phoneKey = (phone: string | null | undefined) => (phone || '').replace(/\D/g, '').slice(-9)

export function computeRepeatCustomers(items: ReportItem[]): RepeatCustomer[] {
  const groups = new Map<string, RepeatCustomer>()
  for (const item of items) {
    if (item.alteration_type !== 'after_delivery') continue
    const key = phoneKey(item.client_phone) || `name:${(item.client_name || '').trim()}`
    if (key === 'name:') continue
    const entry = groups.get(key) ?? { key, name: item.client_name?.trim() || 'بدون اسم', items: [] }
    entry.items.push(item)
    groups.set(key, entry)
  }
  return [...groups.values()].filter((entry) => entry.items.length >= 2).sort((a, b) => b.items.length - a.items.length)
}

// ============================================================================
// مراجعة الجودة
// ============================================================================

const REVIEW_STAGE_FOR: Record<AlterationType, string> = {
  first_proof: 'first_proof',
  second_proof: 'second_proof',
  after_delivery: 'final_dress',
}

/** تعديلات سُجّلت بعد مراجعة جودة ناجحة لنفس الطلب في نفس المرحلة. */
export function computeReviewGaps(items: ReportItem[], reviews: QualityReviewAttemptSummary[]) {
  const passedAt = new Map<string, string>()
  const failedOrders = new Set<string>()
  for (const review of reviews) {
    if (review.status === 'failed') failedOrders.add(review.order_id)
    if (review.status !== 'passed' || !review.created_at) continue
    const key = `${review.order_id}|${review.stage}`
    const previous = passedAt.get(key)
    if (!previous || review.created_at < previous) passedAt.set(key, review.created_at)
  }
  const reviewed: ReportItem[] = []
  const afterPass: ReportItem[] = []
  for (const item of items) {
    if (!item.original_order_id) continue
    const at = passedAt.get(`${item.original_order_id}|${REVIEW_STAGE_FOR[item.alteration_type]}`)
    if (!at) continue
    reviewed.push(item)
    if (at < item.created_at) afterPass.push(item)
  }
  return { reviewed, afterPass, failedReviews: reviews.filter((review) => review.status === 'failed').length, totalReviews: reviews.length }
}

// ============================================================================
// تنسيق
// ============================================================================

export function percentOf(part: number, total: number): string {
  if (!total || total <= 0 || !Number.isFinite(part)) return '—'
  return `${Math.round((part / total) * 100)}%`
}

export function per100Text(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return String(Math.round(value))
}
