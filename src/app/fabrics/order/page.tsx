'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Loader2, MapPin, Search, Truck } from 'lucide-react'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import {
  IS_FABRIC_STORE_ORDERS_ENABLED,
  PAYMENT_STATUS_LABELS,
  customerStepIndex,
  customerSteps,
  type FabricStoreDeliveryMethod,
  type FabricStorePaymentStatus,
} from '@/lib/fabric-store/order-status'
import { STORE_ENTITY, STORE_SUPPORT_PHONE } from '@/lib/store-legal'

/**
 * تتبّع طلب المتجر الإلكتروني (المرحلة 7). يعمل برابط واتساب (`?t=…`) أو من المتصفح الذي
 * أنشأ الطلب (كوكي)، أو بالبحث برقم الطلب أو رقم الجوال. الرمز يُرسل للخادم في ترويسة، لا في عنوان المسار.
 * مستقل عن تتبّع طلبات التفصيل (/track-order) — لا يمسّه.
 */

interface TrackedOrder {
  orderNumber: string
  createdAt: string
  paidAt: string | null
  deliveryMethod: FabricStoreDeliveryMethod
  deliveryLabel: string | null
  city: string | null
  itemsNetHalalas: number
  shippingHalalas: number
  vatHalalas: number
  totalHalalas: number
  paymentStatus: FabricStorePaymentStatus
  fulfillmentStatus: string
  carrier: string | null
  trackingNumber: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  items: Array<{ name: string; code: string | null; color: string | null; purchaseMode: string;
                 pieceLengthCm: number | null; quantityCm: number | null; grossHalalas: number }>
  timeline: Array<{ status: string; at: string }>
}

const money = (halalas: number) => `${formatFabricNumber(halalas / 100)} ريال`
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }) : ''

const card = 'mx-auto max-w-lg rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-6'

function OrderView() {
  const params = useSearchParams()
  const token = (params.get('t') ?? '').trim()
  // null = لم يُحمَّل بعد؛ [] = لا طلب محفوظ ⇒ نموذج البحث.
  const [orders, setOrders] = useState<TrackedOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/fabric-store/track/', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: /^[0-9a-f]{64}$/i.test(token) ? { 'x-order-token': token } : undefined,
    })
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (!active) return
        if (response.ok && data?.ok) { setOrders([data.order]); return }
        setOrders([])
        // لا رمز في هذا المتصفح ليس خطأً: نعرض البحث مباشرة.
        if (data?.code !== 'no-token') setError(data?.error || 'تعذّر تحميل الطلب')
      })
      .catch(() => { if (active) { setOrders([]); setError('انقطع الاتصال — حدّثي الصفحة') } })
    return () => { active = false }
  }, [token])

  const search = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!query.trim() || isSearching) return
    setIsSearching(true)
    setError(null)
    try {
      const response = await fetch('/api/fabric-store/track/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query }),
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) setOrders(data.orders)
      else { setOrders([]); setError(data?.error || 'تعذّر البحث الآن') }
    } catch {
      setError('انقطع الاتصال — أعيدي المحاولة')
    }
    setIsSearching(false)
  }

  if (orders === null) {
    return <div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6b1726]" aria-hidden="true" /></div>
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className={`${card} space-y-3`}>
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#6b1726]">تتبّع طلب الأقمشة</h1>
          <p className="mt-1 text-sm text-[#211b19]/65">اكتبي رقم الطلب (مثل FS-100123) أو رقم الجوال المسجّل في الطلب</p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            dir="ltr"
            inputMode="text"
            maxLength={40}
            placeholder="FS-100123 / 05xxxxxxxx"
            aria-label="رقم الطلب أو رقم الجوال"
            className="min-w-0 flex-1 rounded-xl border-2 border-[#d8c5ae] bg-white px-3 py-2.5 text-center text-sm focus:border-[#6b1726] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
          />
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#6b1726] px-4 py-2.5 text-sm font-bold text-[#f6f0e8] transition-colors hover:bg-[#2f0c14] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            <span>بحث</span>
          </button>
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-sm font-semibold text-[#6b1726]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </form>

      {orders.map(order => <OrderCard key={order.orderNumber} order={order} />)}
    </div>
  )
}

function OrderCard({ order }: { order: TrackedOrder }) {
  const cancelled = order.fulfillmentStatus === 'cancelled'
  const steps = customerSteps(order.deliveryMethod)
  const current = customerStepIndex(order.paymentStatus, order.fulfillmentStatus)
  const stepTime = (key: string) => key === 'paid'
    ? order.paidAt
    : [...order.timeline].reverse().find(t => t.status === key)?.at ?? null

  return (
    <div className={`${card} space-y-5`}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#6b1726]">طلبك من متجر الأقمشة</h2>
        <p className="mt-1 text-sm text-[#211b19]/70">
          رقم الطلب <span dir="ltr" className="font-bold text-[#211b19]">{order.orderNumber}</span> · {when(order.createdAt)}
        </p>
      </div>

      {cancelled ? (
        <p className="rounded-xl bg-white/70 p-4 text-center font-semibold">
          أُلغي هذا الطلب {when(order.cancelledAt)}
          {order.paymentStatus === 'refunded' && (
            <span className="mt-1 block text-sm font-normal">استُرد المبلغ إلى وسيلة الدفع نفسها؛ يظهر في حسابك حسب البنك.</span>
          )}
        </p>
      ) : order.paymentStatus === 'refunded' ? (
        <p className="rounded-xl bg-white/70 p-4 text-center font-semibold">
          استُرد مبلغ هذا الطلب
          <span className="mt-1 block text-sm font-normal">يُعاد المبلغ إلى وسيلة الدفع نفسها؛ يظهر في حسابك حسب البنك.</span>
        </p>
      ) : current === 0 ? (
        <p className="rounded-xl bg-white/70 p-4 text-center font-semibold">{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</p>
      ) : (
        <>
        {order.paymentStatus === 'partially_refunded' && (
          <p className="rounded-xl bg-white/70 p-3 text-center text-sm">استُرد جزء من مبلغ هذا الطلب إلى وسيلة الدفع نفسها.</p>
        )}
        <ol className="space-y-3" aria-label="حالة الطلب">
          {steps.map((step, index) => {
            const done = index < current
            return (
              <li key={step.key} className="flex items-start gap-3">
                {done
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#6b1726]" aria-hidden="true" />
                  : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-[#211b19]/30" aria-hidden="true" />}
                <div>
                  <p className={done ? 'font-bold' : 'text-[#211b19]/50'}>{step.label}</p>
                  {done && stepTime(step.key) && <p className="text-xs text-[#211b19]/60">{when(stepTime(step.key))}</p>}
                </div>
              </li>
            )
          })}
        </ol>
        </>
      )}

      {order.deliveryMethod === 'shipping' && order.trackingNumber && (
        <div className="flex items-start gap-3 rounded-xl bg-white/70 p-4">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[#6b1726]" aria-hidden="true" />
          <div className="text-sm">
            <p>شركة الشحن: <span className="font-bold">{order.carrier}</span></p>
            <p>رقم البوليصة: <span dir="ltr" className="font-bold">{order.trackingNumber}</span></p>
          </div>
        </div>
      )}
      {order.deliveryMethod === 'pickup' && !cancelled && (
        <div className="flex items-start gap-3 rounded-xl bg-white/70 p-4 text-sm">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#6b1726]" aria-hidden="true" />
          <p>الاستلام من المحل: {STORE_ENTITY.address}</p>
        </div>
      )}

      <div className="rounded-xl bg-white/70 p-4 text-sm">
        <ul className="divide-y divide-[#d8c5ae]">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3 py-2">
              <span>
                {item.name}{item.color ? ` · ${item.color}` : ''}
                <span className="block text-xs text-[#211b19]/60">
                  {item.purchaseMode === 'piece'
                    ? `قطعة كاملة ${formatFabricNumber((item.pieceLengthCm ?? 0) / 100)} م`
                    : `${formatFabricNumber((item.quantityCm ?? 0) / 100)} م`}
                </span>
              </span>
              <span className="whitespace-nowrap font-semibold">{money(item.grossHalalas)}</span>
            </li>
          ))}
        </ul>
        {order.shippingHalalas > 0 && (
          <p className="flex justify-between border-t border-[#d8c5ae] pt-2">
            <span>الشحن{order.city ? ` إلى ${order.city}` : ''}</span><span>{money(order.shippingHalalas)}</span>
          </p>
        )}
        <p className="mt-2 flex justify-between border-t border-[#d8c5ae] pt-2 text-base font-bold">
          <span>الإجمالي شامل الضريبة</span><span>{money(order.totalHalalas)}</span>
        </p>
      </div>

      <p className="text-center text-sm text-[#211b19]/70">
        لأي استفسار تواصلي معنا على
        <a href={STORE_SUPPORT_PHONE.whatsappUrl} className="mx-1 font-semibold text-[#6b1726]" target="_blank" rel="noreferrer">واتساب</a>
        واذكري رقم الطلب.
      </p>
    </div>
  )
}

export default function FabricOrderTrackingPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f3] px-4 py-10 text-[#211b19]" dir="rtl">
      <div className="mx-auto mb-6 max-w-lg">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6b1726] hover:text-[#2f0c14] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <span>العودة إلى الصفحة الرئيسية</span>
        </Link>
      </div>
      {IS_FABRIC_STORE_ORDERS_ENABLED ? (
        <Suspense fallback={<div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6b1726]" aria-hidden="true" /></div>}>
          <OrderView />
        </Suspense>
      ) : (
        <p className="text-center">
          الصفحة غير متاحة حالياً. <Link href="/fabrics/" className="font-semibold text-[#6b1726]">متجر الأقمشة</Link>
        </p>
      )}
    </main>
  )
}
