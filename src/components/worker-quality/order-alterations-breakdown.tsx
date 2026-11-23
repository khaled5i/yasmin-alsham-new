'use client'

import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { alterationService, type WorkerQualityAlteration } from '@/lib/services/alteration-service'
import { ALTERATION_REASON_META, ALTERATION_TYPE_META } from '@/components/alterations/alteration-ui'
import { ALTERATION_TYPE_ORDER } from '@/lib/worker-alteration-stats'
import { UNCLASSIFIED_BADGE } from './worker-quality-ui'

/**
 * كل تعديلات مجموعة طلبات (كل الأنواع، بلا الملغاة) مجمّعة حسب الطلب — دفعة واحدة للقائمة كلها.
 * السبب لا يُطلب إلا مع includeErrorType (المدير).
 */
export function useOrdersAlterations(orderIds: string[], includeErrorType: boolean) {
  const [byOrder, setByOrder] = useState<Record<string, WorkerQualityAlteration[]> | null>(null)
  const key = `${includeErrorType}|${[...orderIds].sort().join(',')}`

  useEffect(() => {
    const ids = key.split('|')[1].split(',').filter(Boolean)
    if (ids.length === 0) { setByOrder({}); return }
    let cancelled = false
    void alterationService.getForOrders(ids, { includeErrorType }).then(({ data, error }) => {
      if (cancelled || error) return
      const grouped: Record<string, WorkerQualityAlteration[]> = {}
      for (const alteration of data) {
        ;(grouped[alteration.original_order_id] ||= []).push(alteration)
      }
      setByOrder(grouped)
    })
    return () => { cancelled = true }
  }, [key, includeErrorType])

  return byOrder
}

/** عدد كل التعديلات، ثم تفصيلها حسب النوع، وحسب من تسبّب بها (للمدير). */
export function OrderAlterationsBreakdown({
  alterations,
  showReasons,
}: {
  alterations: WorkerQualityAlteration[]
  showReasons: boolean
}) {
  if (alterations.length === 0) return null

  const typeCounts = ALTERATION_TYPE_ORDER
    .map((type) => ({ type, count: alterations.filter((item) => item.alteration_type === type).length }))
    .filter((entry) => entry.count > 0)

  const reasonCounts = new Map<string, number>()
  for (const item of alterations) {
    const reasonKey = item.error_type || 'none'
    reasonCounts.set(reasonKey, (reasonCounts.get(reasonKey) || 0) + 1)
  }

  return (
    <div className="mb-2 w-full rounded-xl border border-purple-100 bg-purple-50/40 px-3 py-2">
      <p className="flex items-center gap-1.5 text-sm font-bold text-purple-800">
        <Wrench className="h-3.5 w-3.5" />
        التعديلات: <span className="tabular-nums">{alterations.length}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {typeCounts.map(({ type, count }) => (
          <span key={type} className={`rounded-full border px-2 py-0.5 text-xs font-bold ${ALTERATION_TYPE_META[type].badge}`}>
            {ALTERATION_TYPE_META[type].short.ar} <span className="tabular-nums">{count}</span>
          </span>
        ))}
      </div>
      {showReasons ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500">السبب:</span>
          {[...reasonCounts.entries()].map(([reasonKey, count]) => {
            const meta = reasonKey === 'none' ? null : ALTERATION_REASON_META[reasonKey as keyof typeof ALTERATION_REASON_META]
            return (
              <span key={reasonKey} className={`rounded-full border px-2 py-0.5 text-xs font-bold ${meta?.badge ?? UNCLASSIFIED_BADGE}`}>
                {meta?.label.ar ?? 'غير محدد'} <span className="tabular-nums">{count}</span>
              </span>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
