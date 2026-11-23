'use client'

import { useCallback, useEffect, useState } from 'react'
import { alterationService, type WorkerQualityAlteration } from '@/lib/services/alteration-service'
import { orderService, type WorkerQualityOrder } from '@/lib/services/order-service'
import {
  orderQualityReviewService,
  type QualityReviewAttemptSummary,
} from '@/lib/services/order-quality-review-service'

export interface WorkerQualityData {
  completed: WorkerQualityOrder[]
  cut: WorkerQualityOrder[]
  alterations: WorkerQualityAlteration[]
  reviews: QualityReviewAttemptSummary[]
  legacyCount: number | null
}

/**
 * بيانات جودة العمال لفترة: الطلبات المنجزة/المقصوصة، تعديلاتها مع السبب، ومحاولات المراجعة.
 * للمدير فقط — المستدعي يمرّر enabled=false لغير المدير فلا يُطلب السبب أصلاً.
 */
export function useWorkerQualityData({
  enabled,
  fromMonth,
  toMonth,
  kinds,
  withLegacyCount = false,
}: {
  enabled: boolean
  fromMonth: string
  toMonth: string
  kinds: Array<'completed' | 'cut'>
  withLegacyCount?: boolean
}) {
  const [data, setData] = useState<WorkerQualityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const kindsKey = kinds.join(',')

  useEffect(() => {
    if (!enabled || !fromMonth || !toMonth) return
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      const wanted = kindsKey.split(',') as Array<'completed' | 'cut'>
      const [completedResult, cutResult, legacyResult] = await Promise.all([
        wanted.includes('completed')
          ? orderService.getQualityOrders({ kind: 'completed', fromMonth, toMonth })
          : Promise.resolve({ data: [] as WorkerQualityOrder[], error: null }),
        wanted.includes('cut')
          ? orderService.getQualityOrders({ kind: 'cut', fromMonth, toMonth })
          : Promise.resolve({ data: [] as WorkerQualityOrder[], error: null }),
        withLegacyCount ? alterationService.countWithoutOrder() : Promise.resolve({ data: null, error: null }),
      ])
      const ordersError = completedResult.error || cutResult.error
      if (ordersError) throw new Error(ordersError)

      const ids = [...new Set([...completedResult.data, ...cutResult.data].map((order) => order.id))]
      const [alterationsResult, reviewsResult] = await Promise.all([
        alterationService.getForOrders(ids, { includeErrorType: true }),
        orderQualityReviewService.getAttemptSummariesForOrders(ids),
      ])
      if (alterationsResult.error) throw new Error(alterationsResult.error)

      if (cancelled) return
      setData({
        completed: completedResult.data,
        cut: cutResult.data,
        alterations: alterationsResult.data,
        // المراجعات للعرض فقط؛ تعذّرها لا يُسقط الصفحة
        reviews: reviewsResult.error ? [] : reviewsResult.data,
        legacyCount: legacyResult.data,
      })
    })()
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'تعذّر تحميل بيانات التعديلات')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [enabled, fromMonth, toMonth, kindsKey, withLegacyCount, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { data, loading, error, retry }
}
