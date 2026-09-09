'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, Loader2, Shirt } from 'lucide-react'
import { orderService, type Order } from '@/lib/services/order-service'
import { useTranslation } from '@/hooks/useTranslation'
import { useWorkerStore } from '@/store/workerStore'
import PaginationControls from './PaginationControls'

const PAGE_SIZE = 20

/**
 * طلبات الشك في ملف الشكّاك.
 * الطلبات المعلّقة مشتركة بين كل الشكّاكين (لا إسناد)، أما المنتهية فتُنسب لمن أنهاها.
 */
export default function ShakOrdersTab({ workerId, refreshKey, onOrderClick }: {
  workerId: string
  refreshKey: number
  onOrderClick: (order: Order) => void
}) {
  const { t, isArabic } = useTranslation()
  const workers = useWorkerStore(state => state.workers)
  const [view, setView] = useState<'pending' | 'completed'>('pending')
  const [page, setPage] = useState(0)
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    orderService.getAll({
      hasShakWork: true,
      shakCompleted: view === 'completed',
      // المنتهية تخصّ هذا الشكّاك وحده؛ المعلّقة تظهر لكل الشكّاكين
      ...(view === 'completed' ? { shakWorkerId: workerId } : {}),
      orderBy: view === 'completed' ? 'shak_completed_at' : 'due_date',
      orderAscending: view !== 'completed',
      page,
      pageSize: PAGE_SIZE,
    }).then(result => {
      if (cancelled) return
      setOrders(result.data)
      setTotal(result.total || 0)
      setError(result.error)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setError(isArabic ? 'تعذّر تحميل الطلبات' : 'Unable to load orders')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [workerId, refreshKey, view, page, retry, isArabic])

  function formatDate(value?: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
  }

  const tabs = [
    { key: 'pending' as const, label: t('shak_pending_orders') || 'شك قيد التنفيذ', icon: Clock },
    { key: 'completed' as const, label: t('shak_completed_orders') || 'شك مكتمل', icon: CheckCircle },
  ]

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-800">
          {(view === 'completed' ? (t('shak_completed_orders') || 'شك مكتمل') : (t('shak_pending_orders') || 'شك قيد التنفيذ'))} ({total})
        </h3>
        <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setView(tab.key); setPage(0) }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === tab.key ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'pending' && (
        <p className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          {isArabic
            ? 'طلبات الشك تصل تلقائياً إلى كل الشكّاكين — لا يوجد إسناد يدوي.'
            : 'Shak orders reach every shak worker automatically — there is no manual assignment.'}
        </p>
      )}

      {loading ? (
        <Loader2 className="mx-auto my-10 h-7 w-7 animate-spin text-teal-600" />
      ) : error ? (
        <div role="alert" className="text-sm text-red-600">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 underline">
            {isArabic ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          <Shirt className="mx-auto mb-3 h-8 w-8 text-teal-300" />
          {view === 'completed'
            ? (t('no_completed_shak_orders') || 'لا توجد طلبات انتهى فيها عمل الشك')
            : (t('no_pending_shak_orders') || 'لا توجد طلبات شك قيد التنفيذ')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orders.map(order => (
            <button
              type="button"
              key={order.id}
              onClick={() => onOrderClick(order)}
              className="rounded-xl border border-teal-100 bg-white p-4 text-start transition-colors hover:border-teal-400 hover:bg-teal-50/40"
            >
              <span className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-sm text-gray-800">{order.client_name}</strong>
                <span className="text-xs text-gray-500">#{order.order_number}</span>
              </span>
              {view === 'completed' ? (
                <span className="block text-xs text-green-700">
                  {t('shak_done') || 'انتهى عمل الشك'}: {formatDate(order.shak_completed_at)}
                </span>
              ) : (
                <span className="block text-xs text-amber-700">
                  {isArabic ? 'التسليم' : 'Delivery'}: {formatDate(order.due_date)}
                </span>
              )}
              <span className="mt-2 block text-xs text-gray-600">
                {t('assigned_worker')}: {workers.find(worker => worker.id === order.worker_id)?.user?.full_name || t('not_specified')}
              </span>
              <span className="mt-2 block text-xs text-gray-500">{t('status')}: {t(order.status)}</span>
            </button>
          ))}
        </div>
      )}

      {!error && !loading && (
        <PaginationControls currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </div>
  )
}
