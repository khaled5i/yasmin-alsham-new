/**
 * «إحصائياتي» في لوحة العامل نفسه (/dashboard/worker): فساتينه والتعديلات عليها شهراً بشهر منذ البداية.
 *
 * القواعد نفسها في worker-alteration-stats حتى لا تختلف الأرقام بين الشاشات:
 * - الخياط: شهر الإنجاز الفعلي (worker_completed_at ← admin_completed_at ← delivery_date).
 * - القصّاص: شهر القص بتوقيت الرياض.
 * - التعديل يُحسب على شهر إنجاز/قص الطلب، لا على شهر تسجيل التعديل.
 * - الأشهر قبل ALTERATIONS_RECORDED_SINCE تُعرض «—» لا «0»: لم تكن التعديلات تُسجَّل بعد.
 */

import type { WorkerQualityAlteration } from '@/lib/services/alteration-service'
import type { WorkerQualityOrder } from '@/lib/services/order-service'
import {
  cohortMonthOf,
  computeRoleStats,
  shiftMonthKey,
  type QualityRole,
} from '@/lib/worker-alteration-stats'

/** حد أقصى لعدد الأشهر المعروضة، حماية من تاريخ شاذ قديم يمدّ الرسم سنوات فارغة. */
const MAX_MONTHS = 36

/**
 * أول شهر سُجّلت فيه تعديلات في النظام (أقدم تعديل في قاعدة البيانات: سبتمبر 2026).
 * ثابت لا استعلام: العامل يرى تعديلات طلباته فقط (RLS)، فأقدم ما يراه ليس بداية التسجيل.
 */
export const ALTERATIONS_RECORDED_SINCE = '2026-09'

export interface WorkerMonthPoint {
  month: string
  orders: number
  /** كل تعديلات طلبات هذا الشهر. null = غير مسجّلة بعد، أو مخفية عن المشاهد. */
  alterations: number | null
  /** منها ما سببه يخص دور العامل («عليه») — يحتاج error_type، فهو صفر إن لم يُطلب السبب. */
  attributed: number | null
}

export interface WorkerMonthlyStats {
  /** من أول شهر فيه عمل حتى الشهر الحالي، الأقدم أولاً. */
  months: WorkerMonthPoint[]
  total: number
  current: WorkerMonthPoint | null
  previous: WorkerMonthPoint | null
  /** متوسط الأشهر المكتملة فقط (بدون الشهر الحالي). */
  monthlyAverage: number | null
  best: WorkerMonthPoint | null
  /** مجاميع الأشهر التي كانت التعديلات تُسجَّل فيها. null إن كانت مخفية. */
  alterationsTotal: number | null
  attributedTotal: number | null
  alterationsPer10: number | null
  trackingStartMonth: string | null
}

const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function computeWorkerMonthlyStats({
  workerId,
  role,
  orders,
  alterations,
  withAlterations,
  trackingStartMonth,
  currentMonth,
}: {
  workerId: string
  role: QualityRole
  orders: WorkerQualityOrder[]
  alterations: WorkerQualityAlteration[]
  withAlterations: boolean
  /** شهر أول تعديل في النظام؛ null = لا قيد. */
  trackingStartMonth: string | null
  currentMonth: string
}): WorkerMonthlyStats {
  const counts = new Map<string, number>()
  for (const order of orders) {
    const month = cohortMonthOf(order, role)
    if (!month) continue
    counts.set(month, (counts.get(month) || 0) + 1)
  }

  const keys = [...counts.keys()].sort(compareKeys)
  const empty: WorkerMonthlyStats = {
    months: [],
    total: 0,
    current: null,
    previous: null,
    monthlyAverage: null,
    best: null,
    alterationsTotal: withAlterations ? 0 : null,
    attributedTotal: withAlterations ? 0 : null,
    alterationsPer10: null,
    trackingStartMonth,
  }
  if (keys.length === 0) return empty

  const lastKey = compareKeys(keys[keys.length - 1], currentMonth) > 0 ? keys[keys.length - 1] : currentMonth
  let firstKey = keys[0]
  const earliestAllowed = shiftMonthKey(lastKey, -(MAX_MONTHS - 1))
  if (compareKeys(firstKey, earliestAllowed) < 0) firstKey = earliestAllowed

  const range: string[] = []
  for (let key = firstKey; compareKeys(key, lastKey) <= 0; key = shiftMonthKey(key, 1)) range.push(key)

  const isTracked = (month: string) => withAlterations && (!trackingStartMonth || compareKeys(month, trackingStartMonth) >= 0)

  const months: WorkerMonthPoint[] = range.map((month) => {
    const ordersCount = counts.get(month) || 0
    if (!isTracked(month)) return { month, orders: ordersCount, alterations: null, attributed: null }
    const entry = computeRoleStats({ role, month, orders, alterations, workerIds: [workerId] }).get(workerId)
    return {
      month,
      orders: ordersCount,
      alterations: entry?.onOrdersTotal ?? 0,
      attributed: entry?.attributedTotal ?? 0,
    }
  })

  const total = months.reduce((sum, point) => sum + point.orders, 0)
  const current = months.find((point) => point.month === currentMonth) ?? null
  const previous = months.find((point) => point.month === shiftMonthKey(currentMonth, -1)) ?? null

  const complete = months.filter((point) => compareKeys(point.month, currentMonth) < 0)
  const monthlyAverage = complete.length > 0
    ? complete.reduce((sum, point) => sum + point.orders, 0) / complete.length
    : null

  // الأعلى، وعند التساوي الأحدث
  const best = months.reduce<WorkerMonthPoint | null>(
    (top, point) => (point.orders > 0 && (!top || point.orders >= top.orders) ? point : top),
    null
  )

  const tracked = months.filter((point) => point.alterations != null)
  const trackedOrders = tracked.reduce((sum, point) => sum + point.orders, 0)
  const alterationsTotal = withAlterations ? tracked.reduce((sum, point) => sum + (point.alterations ?? 0), 0) : null
  const attributedTotal = withAlterations ? tracked.reduce((sum, point) => sum + (point.attributed ?? 0), 0) : null

  return {
    months,
    total,
    current,
    previous,
    monthlyAverage,
    best,
    alterationsTotal,
    attributedTotal,
    alterationsPer10: alterationsTotal != null && trackedOrders > 0 ? (alterationsTotal * 10) / trackedOrders : null,
    trackingStartMonth,
  }
}
