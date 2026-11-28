'use client'

import OrderTakerLabel from '@/components/OrderTakerLabel'
import { useState, useEffect, useMemo } from 'react'
import { Search, Loader2, Package, CalendarClock, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { orderService, Order } from '@/lib/services/order-service'
import toast from 'react-hot-toast'
import {
  BottomSheet,
  formatAlterationDate,
  getOrderStatusMeta,
  todayDateKey,
} from '@/components/alterations/alteration-ui'
import { extractDateKey } from '@/lib/date-utils'

interface OrderSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectOrder: (order: Order) => void
}

// عرض جزء من النتائج يكفي للاختيار ويُبقي الهاتف سريعاً؛ البحث يضيّق الباقي
const MAX_VISIBLE_RESULTS = 60

export default function OrderSearchModal({
  isOpen,
  onClose,
  onSelectOrder
}: OrderSearchModalProps) {
  const { isArabic } = useTranslation()
  const tr = (ar: string, en: string) => (isArabic ? ar : en)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])

  // تحميل جميع الطلبات عند فتح المودال
  useEffect(() => {
    if (isOpen) {
      loadAllOrders()
    }
  }, [isOpen])

  const loadAllOrders = async () => {
    setIsSearching(true)
    try {
      const { data, error } = await orderService.getAll({ noPagination: true })
      if (error) {
        toast.error(error)
        return
      }

      // استبعاد الطلبات الملغاة فقط
      const today = new Date().toISOString().split('T')[0]
      const filteredOrders = (data?.filter(order => order.status !== 'cancelled') || [])
        .sort((a, b) => {
          const aIsToday = a.due_date?.startsWith(today) ? 0 : 1
          const bIsToday = b.due_date?.startsWith(today) ? 0 : 1
          if (aIsToday !== bIsToday) return aIsToday - bIsToday
          // ثم الأحدث أولاً
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
      setAllOrders(filteredOrders)
      setSearchResults(filteredOrders)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSearching(false)
    }
  }

  // البحث في الطلبات
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(allOrders)
      return
    }

    const term = searchTerm.trim().replace(/^#/, '').toLowerCase()
    const filtered = allOrders.filter(order =>
      (order.client_name || '').toLowerCase().includes(term) ||
      (order.client_phone || '').toLowerCase().includes(term) ||
      (order.order_number || '').toLowerCase().includes(term)
    )
    setSearchResults(filtered)
  }, [searchTerm, allOrders])

  const handleSelectOrder = (order: Order) => {
    onSelectOrder(order)
    onClose()
    setSearchTerm('')
  }

  const visibleResults = useMemo(() => searchResults.slice(0, MAX_VISIBLE_RESULTS), [searchResults])
  const todayKey = todayDateKey()
  const Chevron = isArabic ? ChevronLeft : ChevronRight

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      size="full"
      zIndex="z-50"
      dir={isArabic ? 'rtl' : 'ltr'}
      eyebrow={tr('تعديل جديد · الخطوة 1 من 2', 'New alteration · step 1 of 2')}
      title={tr('اختاري الطلب الأصلي', 'Choose the original order')}
      bodyClassName="px-0 py-0"
    >
      {/* البحث ثابت أعلى النتائج */}
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={tr('ابحثي بالاسم أو الهاتف أو رقم الطلب', 'Search by name, phone, or order number')}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pe-11 ps-10 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-100"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute end-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:text-slate-700"
              aria-label={tr('مسح البحث', 'Clear search')}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {!isSearching && searchResults.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {searchResults.length > MAX_VISIBLE_RESULTS
              ? tr(
                  `يظهر أول ${MAX_VISIBLE_RESULTS} من ${searchResults.length} طلب — اكتبي للبحث`,
                  `Showing the first ${MAX_VISIBLE_RESULTS} of ${searchResults.length} — type to search`
                )
              : tr(`${searchResults.length} طلب`, `${searchResults.length} orders`)}
          </p>
        ) : null}
      </div>

      <div className="px-4 py-3 sm:px-6">
        {isSearching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <p className="text-[15px] text-slate-500">{tr('لا توجد نتائج', 'No results found')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleResults.map((order) => {
              const status = getOrderStatusMeta(order.status)
              const dueKey = order.due_date ? extractDateKey(order.due_date) : ''
              const isToday = dueKey === todayKey
              const description = (order.description || '').trim()
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectOrder(order)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-start transition hover:border-pink-300 hover:bg-pink-50/50 active:bg-pink-50"
                  >
                    <div className="min-w-0 flex-1">
                      <OrderTakerLabel name={order.taken_by} isArabic={isArabic} />
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate text-[15px] font-extrabold text-slate-900">
                          {order.client_name || tr('بدون اسم', 'No name')}
                        </h4>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${status.badge}`}>
                          {isArabic ? status.label.ar : status.label.en}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                        <span>
                          {tr('طلب', 'Order')} <span dir="ltr" className="font-semibold text-slate-700">{order.order_number || '—'}</span>
                        </span>
                        {order.client_phone ? (
                          <>
                            <span aria-hidden>·</span>
                            <span dir="ltr">{order.client_phone}</span>
                          </>
                        ) : null}
                      </p>
                      {description ? (
                        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{description}</p>
                      ) : null}
                      <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-bold ${isToday ? 'text-pink-600' : 'text-slate-500'}`}>
                        <CalendarClock className="h-4 w-4" />
                        {tr('التسليم:', 'Due:')}{' '}
                        {isToday
                          ? tr('اليوم', 'Today')
                          : order.due_date
                            ? <span dir="ltr">{formatAlterationDate(order.due_date)}</span>
                            : '—'}
                      </p>
                    </div>
                    <Chevron className="h-5 w-5 shrink-0 text-slate-300" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  )
}
