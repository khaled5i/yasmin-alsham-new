'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, CheckCheck, LoaderCircle, VolumeX, X } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { formatGregorianDate } from '@/lib/date-utils'

export interface BulkSilentDeliveryItem {
  id: string
  client_name: string
  due_date: string
}

interface BulkSilentDeliveryModalProps {
  orders: BulkSilentDeliveryItem[]
  isLoading: boolean
  isSubmitting: boolean
  onClose: () => void
  onConfirm: (orderIds: string[]) => void | Promise<void>
}

export default function BulkSilentDeliveryModal({
  orders,
  isLoading,
  isSubmitting,
  onClose,
  onConfirm,
}: BulkSilentDeliveryModalProps) {
  const { isArabic } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const allSelected = orders.length > 0 && selectedIds.size === orders.length

  const toggleOrder = (orderId: string) => {
    if (isSubmitting) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const toggleAll = () => {
    if (isSubmitting) return
    setSelectedIds(allSelected ? new Set() : new Set(orders.map((order) => order.id)))
  }

  const formatDueDate = (date: string) => formatGregorianDate(
    date,
    isArabic ? 'ar-SA-u-nu-latn' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' },
  )

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.button
        type="button"
        aria-label={isArabic ? 'إغلاق' : 'Close'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/70 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 18 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-silent-delivery-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-50 shadow-2xl"
      >
        <div className="relative overflow-hidden bg-slate-900 px-5 py-5 text-white sm:px-6">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-amber-400" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/20">
                <VolumeX className="h-6 w-6" />
              </span>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 id="bulk-silent-delivery-title" className="text-lg font-bold sm:text-xl">
                    {isArabic ? 'تسليم صامت متعدد' : 'Bulk silent delivery'}
                  </h2>
                  <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    {isArabic ? 'أداة مؤقتة' : 'Temporary tool'}
                  </span>
                </div>
                <p className="max-w-xl text-xs leading-5 text-slate-300 sm:text-sm">
                  {isArabic
                    ? 'اختر الطلبات المكتملة المراد تسليمها. لن تتغير الدفعات ولن يُرسل واتساب أو طباعة أو أي فاتورة للمحاسبة.'
                    : 'Select completed orders to deliver. Payments stay unchanged, with no WhatsApp, printing, or accounting invoices.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isArabic ? 'إغلاق' : 'Close'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={toggleAll}
            disabled={isLoading || isSubmitting || orders.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            {allSelected
              ? isArabic ? 'إلغاء تحديد الكل' : 'Clear all'
              : isArabic ? 'تحديد الكل' : 'Select all'}
          </button>
          <div className="text-xs font-semibold text-slate-500" aria-live="polite">
            {isArabic
              ? `${selectedIds.size} محدد من ${orders.length}`
              : `${selectedIds.size} of ${orders.length} selected`}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {isLoading ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-slate-500">
              <LoaderCircle className="h-8 w-8 animate-spin text-amber-500" />
              <p className="text-sm font-medium">
                {isArabic ? 'جارٍ تحميل جميع الطلبات المكتملة...' : 'Loading all completed orders...'}
              </p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white text-slate-500">
              <CheckCheck className="h-9 w-9 text-emerald-500" />
              <p className="text-sm font-bold">
                {isArabic ? 'لا توجد طلبات مكتملة حالياً' : 'No completed orders available'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(9rem,0.8fr)] items-center border-b border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500 sm:text-xs">
                <span />
                <span>{isArabic ? 'اسم الطلب' : 'Order name'}</span>
                <span>{isArabic ? 'موعد التسليم' : 'Due date'}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const isSelected = selectedIds.has(order.id)
                  return (
                    <label
                      key={order.id}
                      className={`grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_minmax(9rem,0.8fr)] items-center px-3 py-3 transition ${
                        isSelected ? 'bg-amber-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOrder(order.id)}
                        disabled={isSubmitting}
                        className="h-4 w-4 rounded border-slate-300 text-amber-500 accent-amber-500 focus:ring-amber-400"
                      />
                      <span className="truncate pe-3 text-sm font-bold text-slate-800">
                        {order.client_name || (isArabic ? 'بدون اسم' : 'Unnamed')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 sm:text-sm">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {formatDueDate(order.due_date)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm([...selectedIds])}
            disabled={selectedIds.size === 0 || isLoading || isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-200 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {isSubmitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <VolumeX className="h-5 w-5" />}
            {isSubmitting
              ? isArabic ? 'جارٍ التسليم الصامت...' : 'Delivering silently...'
              : isArabic
                ? `تجاهل وتسليم بصمت (${selectedIds.size})`
                : `Ignore and deliver silently (${selectedIds.size})`}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
