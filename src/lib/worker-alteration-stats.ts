/**
 * جودة العمال من التعديلات — مصدر واحد لقواعد النسب والأوزان ومعادلة التقييم.
 * تقرأ منه قائمة العمال وتبويب «التعديلات» في صفحة العامل ونافذة «كيف حُسب؟»،
 * حتى لا تختلف الأرقام بين الشاشات.
 *
 * القواعد (اعتمدها المدير في 2026-11-19):
 * - التعديل يُحسب على شهر إنهاء الطلب: للخياط شهر الإنجاز الفعلي (نفس عدّاد «مكتملة»)،
 *   وللقصّاص شهر القص (cut_at بتوقيت الرياض).
 * - خطأ الخياط ← orders.worker_id، خطأ القصاص ← orders.cutter_id.
 * - خطأ قياس / خطأ الاستقبال ← «خارج الورشة»، خطأ زبونة ← لا أحد.
 * - «خطأ آخر» أو بلا سبب ← «غير مصنّف»، يُعرض ولا يدخل التقييم.
 * - الأوزان: البروفة الأولى 1، الثانية 2، بعد التسليم 3.
 * - التقييم = 100 − 50 × (نقاط الخطأ ÷ الطلبات المنجزة)، ولا يقل عن 0.
 * - الترتيب لمن أنجز 5 طلبات فأكثر في الشهر، بين العمال من نفس النوع.
 * - تقييم المدير ومراجعة الجودة للعرض فقط ولا يدخلان المعادلة.
 */

import type { AlterationErrorType, AlterationType, WorkerQualityAlteration } from '@/lib/services/alteration-service'
import type { WorkerQualityOrder } from '@/lib/services/order-service'
import type { QualityReviewAttemptSummary } from '@/lib/services/order-quality-review-service'
import { currentMonthKey } from '@/lib/selected-month'

export type QualityRole = 'tailor' | 'cutter'

export const ALTERATION_TYPE_ORDER: AlterationType[] = ['first_proof', 'second_proof', 'after_delivery']

export const TYPE_WEIGHTS: Record<AlterationType, number> = {
  first_proof: 1,
  second_proof: 2,
  after_delivery: 3,
}

export const SCORE_PENALTY = 50
export const MIN_ORDERS_FOR_RANK = 5
/** فوق هذه النسبة من التعديلات بلا سبب يظهر تنبيه أن التقييم غير موثوق بعد. */
export const UNCLASSIFIED_WARNING_SHARE = 0.3

// ============================================================================
// الأسباب
// ============================================================================

export type ReasonKey = Exclude<AlterationErrorType, 'other_error'> | 'unclassified'

export const REASON_DISPLAY_ORDER: ReasonKey[] = [
  'tailor_error',
  'cutter_error',
  'measurement_error',
  'reception_error',
  'customer_error',
  'unclassified',
]

const CLASSIFIED_REASONS = new Set<string>(['tailor_error', 'cutter_error', 'measurement_error', 'reception_error', 'customer_error'])

export function reasonKeyOf(errorType: string | null | undefined): ReasonKey {
  return errorType && CLASSIFIED_REASONS.has(errorType) ? (errorType as ReasonKey) : 'unclassified'
}

export type ReasonBucket = 'tailor' | 'cutter' | 'outside' | 'customer' | 'unclassified'

export function bucketOf(reason: ReasonKey): ReasonBucket {
  switch (reason) {
    case 'tailor_error': return 'tailor'
    case 'cutter_error': return 'cutter'
    case 'measurement_error':
    case 'reception_error': return 'outside'
    case 'customer_error': return 'customer'
    default: return 'unclassified'
  }
}

// ============================================================================
// الأشهر
// ============================================================================

export const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  const index = year * 12 + (month - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function monthName(key: string): string {
  const month = Number(key.split('-')[1])
  return ARABIC_MONTHS[month - 1] || key
}

export function monthLabel(key: string): string {
  return `${monthName(key)} ${key.split('-')[0]}`
}

/** الأشهر من الأحدث إلى الأقدم، بدءاً من الشهر الحالي بتوقيت الرياض. */
export function recentMonthKeys(count: number, from: string = currentMonthKey()): string[] {
  return Array.from({ length: count }, (_, index) => shiftMonthKey(from, -index))
}

/** شهر نص تاريخ/توقيت. التوقيتات بلا منطقة تُقرأ كما هي، مثل فلتر الخادم. */
function utcMonthOf(value: string | null | undefined): string | null {
  if (!value) return null
  if (!/[T ]\d{2}:/.test(value)) return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 7) : parsed.toISOString().slice(0, 7)
}

/** شهر إنجاز الخياط للطلب — نفس سلسلة monthFilter في orderService.getAll. */
export function completionMonthOf(order: WorkerQualityOrder): string | null {
  return utcMonthOf(order.worker_completed_at || order.admin_completed_at || order.delivery_date)
}

/** شهر القص بتوقيت الرياض — نفس فلتر cutMonth. */
export function cutMonthOf(order: WorkerQualityOrder): string | null {
  if (!order.cut_at) return null
  const parsed = new Date(order.cut_at)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getTime() + 3 * 3_600_000).toISOString().slice(0, 7)
}

export function cohortMonthOf(order: WorkerQualityOrder, role: QualityRole): string | null {
  return role === 'tailor' ? completionMonthOf(order) : cutMonthOf(order)
}

export function ownerOf(order: WorkerQualityOrder, role: QualityRole): string | null {
  return role === 'tailor' ? order.worker_id : order.cutter_id
}

// ============================================================================
// الحساب
// ============================================================================

export type TypeCounts = Record<AlterationType, number>

export const emptyTypeCounts = (): TypeCounts => ({ first_proof: 0, second_proof: 0, after_delivery: 0 })

const emptyReasonCounts = (): Record<ReasonKey, number> => ({
  tailor_error: 0,
  cutter_error: 0,
  measurement_error: 0,
  reception_error: 0,
  customer_error: 0,
  unclassified: 0,
})

export const typeCountsTotal = (counts: TypeCounts) => counts.first_proof + counts.second_proof + counts.after_delivery

export const weightedPoints = (counts: TypeCounts) => ALTERATION_TYPE_ORDER.reduce((sum, type) => sum + counts[type] * TYPE_WEIGHTS[type], 0)

export function scoreFor(points: number, orders: number): number | null {
  if (orders <= 0) return null
  return Math.max(0, Math.round(100 - (SCORE_PENALTY * points) / orders))
}

export interface WorkerAlterationItem extends WorkerQualityAlteration {
  order: WorkerQualityOrder
  reason: ReasonKey
  /** يُحسب على هذا العامل (سببه يخص دوره). */
  attributed: boolean
}

export interface WorkerQualityStats {
  workerId: string
  role: QualityRole
  month: string
  orders: number
  attributed: TypeCounts
  attributedTotal: number
  points: number
  /** التعديلات المنسوبة لكل 10 طلبات. */
  ratePer10: number | null
  score: number | null
  ranked: boolean
  rank: number | null
  rankedCount: number
  /** كل تعديلات طلباته حسب السبب، منسوبة أو لا. */
  reasonCounts: Record<ReasonKey, number>
  onOrdersTotal: number
  unclassifiedShare: number
  managerRating: { average: number | null; count: number }
  firstPass: { passed: number; total: number }
  /** كل تعديلات طلباته، الأحدث أولاً. */
  items: WorkerAlterationItem[]
}

function emptyStats(workerId: string, role: QualityRole, month: string): WorkerQualityStats {
  return {
    workerId,
    role,
    month,
    orders: 0,
    attributed: emptyTypeCounts(),
    attributedTotal: 0,
    points: 0,
    ratePer10: null,
    score: null,
    ranked: false,
    rank: null,
    rankedCount: 0,
    reasonCounts: emptyReasonCounts(),
    onOrdersTotal: 0,
    unclassifiedShare: 0,
    managerRating: { average: null, count: 0 },
    firstPass: { passed: 0, total: 0 },
    items: [],
  }
}

/**
 * إحصاءات كل عامل من دور واحد في شهر واحد.
 * `workerIds` تُضاف حتى لو لم يكن لها طلبات (تظهر «لا طلبات»).
 */
export function computeRoleStats({
  role,
  month,
  orders,
  alterations,
  reviews = [],
  workerIds = [],
}: {
  role: QualityRole
  month: string
  orders: WorkerQualityOrder[]
  alterations: WorkerQualityAlteration[]
  reviews?: QualityReviewAttemptSummary[]
  workerIds?: string[]
}): Map<string, WorkerQualityStats> {
  const stats = new Map<string, WorkerQualityStats>()
  const ensure = (id: string) => {
    let entry = stats.get(id)
    if (!entry) {
      entry = emptyStats(id, role, month)
      stats.set(id, entry)
    }
    return entry
  }
  workerIds.forEach(ensure)

  const cohort = new Map<string, WorkerQualityOrder>()
  const ratingSums = new Map<string, number>()
  for (const order of orders) {
    if (cohortMonthOf(order, role) !== month) continue
    const owner = ownerOf(order, role)
    if (!owner) continue
    cohort.set(order.id, order)
    const entry = ensure(owner)
    entry.orders += 1
    if (role === 'tailor' && Number(order.worker_rating) > 0) {
      entry.managerRating.count += 1
      ratingSums.set(owner, (ratingSums.get(owner) || 0) + Number(order.worker_rating))
    }
  }

  for (const alteration of alterations) {
    const order = cohort.get(alteration.original_order_id)
    if (!order) continue
    const owner = ownerOf(order, role)
    if (!owner) continue
    const entry = ensure(owner)
    const reason = reasonKeyOf(alteration.error_type)
    const attributed = bucketOf(reason) === role
    entry.reasonCounts[reason] += 1
    entry.onOrdersTotal += 1
    if (attributed) {
      entry.attributed[alteration.alteration_type] = (entry.attributed[alteration.alteration_type] || 0) + 1
    }
    entry.items.push({ ...alteration, order, reason, attributed })
  }

  for (const review of reviews) {
    if (review.attempt_number !== 1 || review.stage === 'post_delivery') continue
    const order = cohort.get(review.order_id)
    const owner = order ? ownerOf(order, role) : null
    if (!owner) continue
    const entry = ensure(owner)
    entry.firstPass.total += 1
    if (review.status === 'passed') entry.firstPass.passed += 1
  }

  for (const entry of stats.values()) {
    entry.attributedTotal = typeCountsTotal(entry.attributed)
    entry.points = weightedPoints(entry.attributed)
    entry.ratePer10 = entry.orders > 0 ? (entry.attributedTotal * 10) / entry.orders : null
    entry.score = scoreFor(entry.points, entry.orders)
    entry.ranked = entry.orders >= MIN_ORDERS_FOR_RANK
    entry.unclassifiedShare = entry.onOrdersTotal > 0 ? entry.reasonCounts.unclassified / entry.onOrdersTotal : 0
    if (entry.managerRating.count > 0) {
      entry.managerRating.average = (ratingSums.get(entry.workerId) || 0) / entry.managerRating.count
    }
    entry.items.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  }

  // الترتيب: الأعلى تقييماً، ثم الأقل تعديلات بعد التسليم، ثم الأكثر طلبات
  const ranked = [...stats.values()].filter(entry => entry.ranked).sort(compareForRank)
  ranked.forEach((entry, index) => {
    const previous = ranked[index - 1]
    entry.rank = previous && compareForRank(previous, entry) === 0 ? previous.rank : index + 1
    entry.rankedCount = ranked.length
  })
  for (const entry of stats.values()) entry.rankedCount = ranked.length

  return stats
}

function compareForRank(a: WorkerQualityStats, b: WorkerQualityStats): number {
  return (b.score ?? -1) - (a.score ?? -1)
    || a.attributed.after_delivery - b.attributed.after_delivery
    || b.orders - a.orders
}

/** متوسط الزملاء المرتّبين من نفس الدور، باستثناء العامل نفسه. */
export function peerAverages(stats: Iterable<WorkerQualityStats>, excludeId?: string) {
  const peers = [...stats].filter(entry => entry.ranked && entry.workerId !== excludeId)
  if (peers.length === 0) return { score: null as number | null, ratePer10: null as number | null, count: 0 }
  const sum = (pick: (entry: WorkerQualityStats) => number) => peers.reduce((total, entry) => total + pick(entry), 0)
  return {
    score: sum(entry => entry.score ?? 0) / peers.length,
    ratePer10: sum(entry => entry.ratePer10 ?? 0) / peers.length,
    count: peers.length,
  }
}

// ============================================================================
// ملخص الشهر (على الطلبات التي أُنجزت فيه)
// ============================================================================

export interface MonthAlterationSummary {
  total: number
  byType: TypeCounts
  tailor: number
  cutter: number
  outside: number
  customer: number
  unclassified: number
  /** سببه خطأ خياط/قصاص لكن الطلب بلا خياط/قصاص مسجّل. */
  unassigned: number
  unclassifiedShare: number
}

export function computeMonthSummary(
  month: string,
  completedOrders: WorkerQualityOrder[],
  alterations: WorkerQualityAlteration[]
): MonthAlterationSummary {
  const cohort = new Map<string, WorkerQualityOrder>()
  for (const order of completedOrders) {
    if (completionMonthOf(order) === month) cohort.set(order.id, order)
  }
  const summary: MonthAlterationSummary = {
    total: 0,
    byType: emptyTypeCounts(),
    tailor: 0,
    cutter: 0,
    outside: 0,
    customer: 0,
    unclassified: 0,
    unassigned: 0,
    unclassifiedShare: 0,
  }
  for (const alteration of alterations) {
    const order = cohort.get(alteration.original_order_id)
    if (!order) continue
    summary.total += 1
    summary.byType[alteration.alteration_type] = (summary.byType[alteration.alteration_type] || 0) + 1
    const bucket = bucketOf(reasonKeyOf(alteration.error_type))
    if (bucket === 'tailor') {
      if (order.worker_id) summary.tailor += 1
      else summary.unassigned += 1
    } else if (bucket === 'cutter') {
      if (order.cutter_id) summary.cutter += 1
      else summary.unassigned += 1
    } else {
      summary[bucket] += 1
    }
  }
  summary.unclassifiedShare = summary.total > 0 ? summary.unclassified / summary.total : 0
  return summary
}

// ============================================================================
// تنسيق
// ============================================================================

/** رقم بخانة عشرية واحدة بأرقام إنجليزية، بلا «.0» زائدة. */
export function formatOneDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((part / total) * 100)}%`
}

export function scoreTone(score: number | null): { text: string; bg: string; ring: string } {
  if (score == null) return { text: 'text-slate-400', bg: 'bg-slate-50', ring: 'ring-slate-200' }
  if (score >= 90) return { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200' }
  if (score >= 75) return { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200' }
  return { text: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200' }
}
