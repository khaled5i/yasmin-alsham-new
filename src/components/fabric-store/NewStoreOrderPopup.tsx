'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { IS_FABRIC_STORE_ORDERS_ENABLED } from '@/lib/fabric-store/order-status'
import { formatFabricCurrency as formatCurrency } from '@/lib/fabric-number-format'

/**
 * نافذة منبثقة «يوجد طلب جديد» في اللوحة للمدير ومدير متجر الأقمشة (18 أكتوبر 2026).
 * تستطلع أحدث الطلبات المدفوعة كل 30 ثانية والصفحة ظاهرة، وفوراً عند وصول إشعار المتصفح
 * (رسالة من عامل الخدمة). ما ظهر مرة لا يظهر ثانية على هذا المتصفح.
 */

interface NewOrder {
  id: string
  orderNumber: string
  customerName: string
  totalHalalas: number
  deliveryMethod: 'pickup' | 'shipping'
  paidAt: string
}

const ORDERS_PATH = '/dashboard/accounting/fabrics/online-orders/'
const SINCE_KEY = 'ys-store-new-orders-since'
const SHOWN_KEY = 'ys-store-new-orders-shown'
const POLL_MS = 30_000
// تداخل دقيقتين: طلب سُجّل وقت سداده قبل الاستطلاع وثبت بعده لا يفوت (والمعروض لا يتكرر)
const OVERLAP_MS = 120_000

const storage = (): Storage | null => { try { return window.localStorage } catch { return null } }

function loadShown(): string[] {
  try { return JSON.parse(storage()?.getItem(SHOWN_KEY) ?? '[]') as string[] } catch { return [] }
}

export default function NewStoreOrderPopup() {
  const { user } = useAuthStore()
  const { workerType } = useWorkerPermissions()
  const allowed = IS_FABRIC_STORE_ORDERS_ENABLED
    && (user?.role === 'admin' || (user?.role === 'worker' && workerType === 'fabric_store_manager'))

  const [orders, setOrders] = useState<NewOrder[]>([])
  const busy = useRef(false)

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState !== 'visible') return
    busy.current = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const store = storage()
      const since = store?.getItem(SINCE_KEY) ?? new Date().toISOString()
      const response = await fetch(`/api/fabric-store/staff/orders/latest/?since=${encodeURIComponent(since)}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; now?: string; orders?: NewOrder[] } | null
      if (!response.ok || !data?.ok || !data.now) return
      store?.setItem(SINCE_KEY, new Date(Date.parse(data.now) - OVERLAP_MS).toISOString())
      const shown = loadShown()
      const fresh = (data.orders ?? []).filter(o => !shown.includes(o.id))
      if (!fresh.length) return
      store?.setItem(SHOWN_KEY, JSON.stringify([...fresh.map(o => o.id), ...shown].slice(0, 100)))
      setOrders(current => [...fresh, ...current.filter(c => !fresh.some(f => f.id === c.id))].slice(0, 5))
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* لا اهتزاز */ }
    } catch {
      /* الشبكة: المحاولة التالية بعد 30 ثانية */
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    if (!allowed) return
    void check()
    const timer = window.setInterval(() => void check(), POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'fabric-store-new-order') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [allowed, check])

  if (!allowed || !orders.length) return null
  const [latest] = orders

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" dir="rtl" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <button type="button" onClick={() => setOrders([])} className="float-left rounded-xl p-1 text-gray-400 hover:bg-gray-100" aria-label="إغلاق">
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-3 flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-rose-100">
          <BellRing className="h-8 w-8 text-rose-700" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {orders.length > 1 ? `يوجد ${orders.length} طلبات جديدة` : 'يوجد طلب جديد'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">من المتجر الإلكتروني — مدفوع وبانتظار التجهيز</p>

        <ul className="mt-4 space-y-2 text-right">
          {orders.map(order => (
            <li key={order.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="flex justify-between gap-2 font-bold text-gray-900">
                <span dir="ltr">{order.orderNumber}</span>
                <span className="text-emerald-700">{formatCurrency(order.totalHalalas / 100)}</span>
              </p>
              <p className="text-gray-600">
                {order.customerName} · {order.deliveryMethod === 'pickup' ? 'استلام من المحل' : 'شحن'}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <a
            href={orders.length === 1 ? `${ORDERS_PATH}?order=${latest.id}` : ORDERS_PATH}
            onClick={() => setOrders([])}
            className="rounded-2xl bg-rose-700 px-4 py-3 font-semibold text-white hover:bg-rose-800"
          >
            الذهاب إلى طلبات المتجر الإلكتروني
          </a>
          <button type="button" onClick={() => setOrders([])} className="rounded-2xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  )
}
