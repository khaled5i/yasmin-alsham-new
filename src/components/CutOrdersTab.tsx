'use client'

import { useEffect, useState } from 'react'
import { Loader2, Scissors } from 'lucide-react'
import { orderService, type Order } from '@/lib/services/order-service'
import { useTranslation } from '@/hooks/useTranslation'
import { shiftDate } from '@/lib/date-utils'
import { useWorkerStore } from '@/store/workerStore'
import OrderCutterInfo from './OrderCutterInfo'
import PaginationControls from './PaginationControls'
import ReportPeriodPicker, { computePresetRange, type DateRange } from './ReportPeriodPicker'

const PAGE_SIZE = 20
// The picker represents calendar days; apply their boundaries in Riyadh.
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function CutOrdersTab({ workerId, refreshKey, onOrderClick }: {
  workerId: string
  refreshKey: number
  onOrderClick: (order: Order) => void
}) {
  const { t, isArabic } = useTranslation()
  const workers = useWorkerStore(state => state.workers)
  const [period, setPeriod] = useState<DateRange>('month')
  const [range, setRange] = useState(() => computePresetRange('month'))
  const [allDates, setAllDates] = useState(false)
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
      cutter_id: workerId,
      cutFrom: allDates ? undefined : `${dayKey(range.startDate)}T00:00:00+03:00`,
      cutTo: allDates ? undefined : `${shiftDate(dayKey(range.endDate), 1)}T00:00:00+03:00`,
      orderBy: 'cut_at',
      orderAscending: false,
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
  }, [workerId, refreshKey, range, allDates, page, retry, isArabic])

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-800">{t('cut_orders')} ({total})</h3>
        <div className="flex flex-wrap items-center gap-3">
          <ReportPeriodPicker period={period} range={range} onApply={(nextPeriod, nextRange) => {
            setPeriod(nextPeriod); setRange(nextRange); setAllDates(false); setPage(0)
          }} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={allDates} onChange={event => { setAllDates(event.target.checked); setPage(0) }} />
            {isArabic ? 'كل التواريخ' : 'All dates'}
          </label>
        </div>
      </div>
      {loading ? <Loader2 className="mx-auto my-10 h-7 w-7 animate-spin text-teal-600" /> : error ? (
        <div role="alert" className="text-sm text-red-600">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 underline">{isArabic ? 'إعادة المحاولة' : 'Retry'}</button>
        </div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-gray-500"><Scissors className="mx-auto mb-3 h-8 w-8 text-teal-300" />{t('no_cut_orders')}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orders.map(order => (
            <button type="button" key={order.id} onClick={() => onOrderClick(order)} className="rounded-xl border border-teal-100 bg-white p-4 text-start transition-colors hover:border-teal-400 hover:bg-teal-50/40">
              <span className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-sm text-gray-800">{order.client_name}</strong>
                <span className="text-xs text-gray-500">#{order.order_number}</span>
              </span>
              <OrderCutterInfo order={order} showDate />
              <span className="mt-2 block text-xs text-gray-600">{t('assigned_worker')}: {workers.find(worker => worker.id === order.worker_id)?.user?.full_name || t('not_specified')}</span>
              <span className="mt-2 block text-xs text-gray-500">{t('status')}: {t(order.status)}</span>
            </button>
          ))}
        </div>
      )}
      {!error && !loading && <PaginationControls currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />}
    </div>
  )
}
