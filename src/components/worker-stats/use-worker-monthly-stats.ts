'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { orderService } from '@/lib/services/order-service'
import { alterationService } from '@/lib/services/alteration-service'
import { currentMonthKey } from '@/lib/selected-month'
import {
  ALTERATIONS_RECORDED_SINCE,
  computeWorkerMonthlyStats,
  type WorkerMonthlyStats,
} from '@/lib/worker-monthly-stats'

export interface WorkerMonthlyStatsState {
  data: WorkerMonthlyStats | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * إحصائيات الخياط نفسه من حسابه: يجد سجله في workers من user_id، ثم فساتينه المنجزة
 * والتعديلات عليها. RLS تسمح له بطلباته وتعديلاتها فقط. لا يُطلب سبب التعديل (error_type):
 * العامل يرى العدد الكلي، وتصنيف «عليه» يبقى للمدير في متابعة العمال.
 */
export function useMyMonthlyStats({ userId, enabled }: { userId: string; enabled: boolean }): WorkerMonthlyStatsState {
  const [data, setData] = useState<WorkerMonthlyStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false
    setData(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      const { data: workerRow, error: workerError } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()
      if (workerError) throw new Error(workerError.message)
      const workerId = (workerRow as { id?: string } | null)?.id
      if (!workerId) throw new Error('worker-not-found')

      const ordersResult = await orderService.getWorkerHistoryOrders({ workerId, role: 'tailor' })
      if (ordersResult.error) throw new Error(ordersResult.error)

      const alterationsResult = await alterationService.getForOrders(ordersResult.data.map((order) => order.id))
      if (alterationsResult.error) throw new Error(alterationsResult.error)

      if (cancelled) return
      setData(computeWorkerMonthlyStats({
        workerId,
        role: 'tailor',
        orders: ordersResult.data,
        alterations: alterationsResult.data,
        withAlterations: true,
        trackingStartMonth: ALTERATIONS_RECORDED_SINCE,
        currentMonth: currentMonthKey(),
      }))
    })()
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'load-failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, enabled, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { data, loading, error, retry }
}
