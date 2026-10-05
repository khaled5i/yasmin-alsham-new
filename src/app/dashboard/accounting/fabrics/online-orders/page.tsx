'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Copy, FlaskConical, Loader2, MessageCircle,
  PackageCheck, RefreshCw, Search, Store, Truck, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { formatFabricCurrency as formatCurrency, formatFabricNumber } from '@/lib/fabric-number-format'
import {
  FULFILLMENT_STATUS_LABELS,
  IS_FABRIC_STORE_ORDERS_ENABLED,
  IS_FABRIC_STORE_REFUNDS_ENABLED,
  PAYMENT_STATUS_LABELS,
  customerWhatsAppLink,
  type FabricStoreDeliveryMethod,
  type FabricStoreFulfillmentStatus,
  type FabricStorePaymentStatus,
} from '@/lib/fabric-store/order-status'
import { STORE_ENTITY } from '@/lib/store-legal'
import {
  clearPending, isSettled, loadPending, savePending, type ActionOutcome, type PendingAction,
} from '@/lib/fabric-store/pending-action'

/**
 * طلبات المتجر الإلكتروني (المرحلة 7) — للمدير ومدير متجر الأقمشة (قرار المالك).
 * كل تغيير يمر بالخادم فالقاعدة، ويُسجَّل باسم الموظف في سجل الطلب. الإلغاء هنا للطلب
 * غير المدفوع فقط؛ المدفوع يُلغى مع استرداده (المرحلة 8، للمدير).
 */

type View = 'active' | 'review' | 'unpaid' | 'done' | 'all'

interface OrderRow {
  id: string
  orderNumber: string
  createdAt: string
  paidAt: string | null
  customerName: string
  customerPhone: string
  deliveryMethod: FabricStoreDeliveryMethod
  totalHalalas: number
  paymentStatus: FabricStorePaymentStatus
  fulfillmentStatus: FabricStoreFulfillmentStatus
  needsReview: boolean
  saleRecorded: boolean
  isTest: boolean
}

interface OrderDetail {
  order: OrderRow & {
    customerEmail: string | null
    deliveryLabel: string | null
    itemsNetHalalas: number
    shippingHalalas: number
    vatHalalas: number
    reviewReason: string | null
    reviewSnapshot: { reason: string | null; eventId: string | null; alertIds: string[] }
    cutStartedAt?: string | null
    cancelReason: string | null
    shippingCarrier: string | null
    trackingNumber: string | null
    trackingUrl: string | null
    paymentDueAt: string
  }
  items: Array<{ lineNumber: number; name: string; code: string | null; color: string | null; imageUrl: string | null;
                 purchaseMode: string; pieceLengthCm: number | null; quantityCm: number | null; consumptionCm: number;
                 grossHalalas: number }>
  address: null | { recipient_name: string | null; recipient_phone: string | null; city: string | null; district: string | null;
                    street: string | null; building_number: string | null; postal_code: string | null;
                    additional_number: string | null; short_address: string | null; notes: string | null; anonymized_at: string | null }
  attempts: Array<{ id: string; environment: string; status: string; amountHalalas: number; paymentId: string | null; createdAt: string }>
  sale: null | { invoiceNumber: number | null; date: string; amount: number; alostazStatus: string | null; alostazCode: string | null }
  tasks: Array<{ id: string; topic: string; status: string; attempts: number; maxAttempts: number; lastError: string | null; reason: unknown }>
  events: Array<{ id: number; type: string; from: string | null; to: string | null; actorType: string; actorName: string | null;
                  note: string | null; createdAt: string }>
  // المرحلة 8
  viewerRole?: 'admin' | 'fabric_store_manager'
  refundsEnabled?: boolean
  refundableHalalas?: number
  refunds?: Array<{ id: string; amountHalalas: number; reason: string; status: string; cancelsOrder: boolean;
                    failureMessage: string | null; requestedBy: string | null; createdAt: string; completedAt: string | null;
                    hasIncomeRow: boolean; creditNoteCode: string | null; creditNoteNeeded: boolean
                    providerCalledAt?: string | null; reviewReference?: string | null; reviewNote?: string | null
                    reviewedAt?: string | null }>
  restocks?: Array<{ lineNumber: number; quantityCm: number; reason: string; note: string | null; createdAt: string }>
}

/** «12.5» أو «12.50» ⇒ 1250 (بالهللة أو بالسنتيمتر) بلا فاصلة عائمة؛ غير ذلك null. */
function toHundredths(text: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const value = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return value > 0 ? value : null
}

const newKey = () => crypto.randomUUID()

interface StoreAlert {
  kind: string
  orderId: string | null
  orderNumber: string | null
  since: string | null
  environment: string | null
  detail: string
}

/** المرحلة 9: أنواع التنبيهات كما تراها الموظفة. */
const ALERT_LABELS: Record<string, string> = {
  sale_missing: 'مدفوع بلا مبيعة',
  task_dead: 'مهمة متوقفة',
  sale_amount_mismatch: 'مبلغ المبيعة لا يطابق',
  refund_ledger_mismatch: 'سجل الاسترداد لا يطابق',
  refund_unconfirmed: 'استرداد لم يظهر لدى ميسر',
  refund_review_due: 'موعد قرار المدير في استرداد',
  refund_stuck: 'استرداد معلّق',
  credit_note_missing: 'إشعار دائن مطلوب',
  payment_quarantined: 'دفعة محجورة',
  alostaz_review: 'فاتورة الأستاذ',
  needs_review: 'تحت المراجعة',
}

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'active', label: 'قيد التنفيذ' },
  { id: 'review', label: 'تحتاج مراجعة' },
  { id: 'unpaid', label: 'بانتظار الدفع' },
  { id: 'done', label: 'منتهية' },
  { id: 'all', label: 'الكل' },
]

const money = (halalas: number) => formatCurrency(halalas / 100)
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }) : '—'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('الجلسة منتهية — سجّلي الدخول من جديد')
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'تعذّر تنفيذ الطلب')
  return data as T
}

function StatusBadges({ order }: { order: OrderRow }) {
  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded'
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className={`rounded-full px-2 py-0.5 ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
        {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
      </span>
      {paid && (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
          {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus}
        </span>
      )}
      {!paid && order.fulfillmentStatus === 'cancelled' && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">ملغى</span>
      )}
      {order.needsReview && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">مراجعة</span>}
      {order.isTest && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">اختبار</span>}
      {paid && !order.isTest && !order.saleRecorded && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">المبيعة لم تُسجَّل</span>
      )}
    </div>
  )
}

function OnlineOrdersContent() {
  const { user } = useAuthStore()
  const { workerType } = useWorkerPermissions()
  const allowed = user?.role === 'admin' || (user?.role === 'worker' && workerType === 'fabric_store_manager')

  const [view, setView] = useState<View>('active')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [counts, setCounts] = useState({ review: 0, active: 0 })
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  // المرحلة 9: null = القسم غير مفعّل (المسار يرد 404) فلا يظهر
  const [alerts, setAlerts] = useState<StoreAlert[] | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ view })
      if (query) params.set('q', query)
      const data = await api<{ orders: OrderRow[]; counts: { review: number; active: number } }>(
        `/api/fabric-store/staff/orders/?${params.toString()}`)
      setOrders(data.orders)
      setCounts(data.counts)
      try {
        const alertData = await api<{ alerts: StoreAlert[] }>('/api/fabric-store/staff/alerts/')
        setAlerts(alertData.alerts)
      } catch {
        setAlerts(null)
      }
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [view, query])

  useEffect(() => { if (allowed && IS_FABRIC_STORE_ORDERS_ENABLED) void load() }, [allowed, load])

  if (!IS_FABRIC_STORE_ORDERS_ENABLED) {
    return <div className="p-10 text-center text-gray-500" dir="rtl">قسم طلبات المتجر غير مفعّل.</div>
  }
  if (user && !allowed) {
    return <div className="p-10 text-center text-gray-500" dir="rtl">طلبات المتجر للمدير ومدير متجر الأقمشة فقط.</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboard/accounting/fabrics" className="rounded-xl p-2 transition-colors hover:bg-gray-100">
            <ArrowLeft className="h-6 w-6 rotate-180" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-rose-600 to-rose-800 p-3 shadow-lg">
              <ClipboardList className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">طلبات المتجر الإلكتروني</h1>
              <p className="text-sm text-gray-500">التجهيز والاستلام والشحن والمراجعة</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} className="mr-auto rounded-xl p-2 text-gray-600 hover:bg-gray-100" title="تحديث">
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {alerts && alerts.length > 0 && (
          <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <button type="button" onClick={() => setAlertsOpen(o => !o)} className="flex w-full items-center justify-between font-bold">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> تنبيهات تحتاج تصرفاً ({alerts.length})</span>
              <span className="text-xs font-normal">{alertsOpen ? 'إخفاء' : 'عرض'}</span>
            </button>
            {alertsOpen && (
              <ul className="mt-3 space-y-2">
                {alerts.map((a, i) => (
                  <li key={`${a.kind}-${a.orderId ?? ''}-${i}`} className="rounded-xl bg-white/70 p-2">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold">{ALERT_LABELS[a.kind] ?? a.kind}</span>
                      {a.environment === 'test' && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">اختبار</span>}
                      {a.orderId && a.orderNumber && (
                        <button type="button" onClick={() => setOpenId(a.orderId)} className="font-semibold underline" dir="ltr">{a.orderNumber}</button>
                      )}
                      <span className="text-xs text-red-700/70">{when(a.since)}</span>
                    </p>
                    <p className="mt-1 text-red-800">{a.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {VIEWS.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                view === v.id ? 'bg-rose-700 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {v.label}
              {v.id === 'active' && counts.active > 0 && <span className="mr-1.5 rounded-full bg-white/20 px-1.5">{counts.active}</span>}
              {v.id === 'review' && counts.review > 0 && (
                <span className="mr-1.5 rounded-full bg-amber-400 px-1.5 text-amber-950">{counts.review}</span>
              )}
            </button>
          ))}
        </div>

        <form onSubmit={e => { e.preventDefault(); setQuery(search.trim()) }} className="relative mb-5">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحثي برقم الطلب أو اسم الزبونة أو جوالها"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-rose-500"
          />
        </form>

        {loading && !orders.length ? (
          <div className="py-16 text-center text-gray-400"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>
        ) : !orders.length ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-gray-400">لا طلبات هنا</div>
        ) : (
          <ul className="space-y-3">
            {orders.map(order => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(order.id)}
                  className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-right shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">
                        <span dir="ltr">{order.orderNumber}</span>
                        <span className="mr-2 text-sm font-normal text-gray-500">{order.customerName}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {when(order.createdAt)} · {order.deliveryMethod === 'pickup' ? 'استلام من المحل' : 'شحن'}
                      </p>
                      <div className="mt-2"><StatusBadges order={order} /></div>
                    </div>
                    <p className="whitespace-nowrap text-lg font-bold text-emerald-700">{money(order.totalHalalas)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {openId && <OrderPanel id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </div>
  )
}

function OrderPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')

  const load = useCallback(async () => {
    try {
      setDetail(await api<OrderDetail>(`/api/fabric-store/staff/orders/${id}/`))
    } catch (error) {
      toast.error((error as Error).message)
      onClose()
    }
  }, [id, onClose])

  useEffect(() => { void load() }, [load])

  const act = async (body: Record<string, unknown>, success: string) => {
    setBusy(true)
    try {
      await api(`/api/fabric-store/staff/orders/${id}/`, { method: 'POST', body: JSON.stringify(body) })
      toast.success(success)
      setNote(''); setReviewNote(''); setCancelReason('')
      await load()
      onChanged()
    } catch (error) {
      toast.error((error as Error).message)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (to: FabricStoreFulfillmentStatus, extra: Record<string, unknown> = {}) =>
    act({ action: 'fulfillment', to, ...extra }, `الحالة الآن: ${FULFILLMENT_STATUS_LABELS[to]}`)

  if (!detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    )
  }

  const { order, items, address, attempts, sale, tasks, events } = detail
  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded'
  const canProgress = paid && !order.needsReview && (order.saleRecorded || order.isTest)
  const openAlerts = tasks.filter(t => (t.topic === 'notify_staff' && t.status !== 'done') || t.status === 'dead')
  const whatsapp = customerWhatsAppLink(order.customerPhone, {
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    deliveryMethod: order.deliveryMethod,
    fulfillmentStatus: order.fulfillmentStatus,
    carrier: order.shippingCarrier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    pickupAddress: STORE_ENTITY.address,
  })
  const button = 'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900" dir="ltr">{order.orderNumber}</h2>
            <p className="text-xs text-gray-500">{when(order.createdAt)}</p>
            <div className="mt-2"><StatusBadges order={order} /></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        {order.isTest && (
          <p className="mb-4 flex items-center gap-2 rounded-xl bg-purple-50 p-3 text-sm text-purple-800">
            <FlaskConical className="h-4 w-4" /> دفعة اختبار: لا مبيعة ولا خصم من المخزون.
          </p>
        )}

        {/* المراجعة */}
        {order.needsReview && (
          <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-bold text-amber-900"><AlertTriangle className="h-4 w-4" /> يحتاج مراجعة</p>
            <p className="mt-1 text-sm text-amber-900">{order.reviewReason}</p>
            <textarea
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="ماذا فعلتِ؟ (مثال: تأكدت من توفر القماش / رُدّ الدفع الزائد من لوحة ميسر)"
              className="mt-3 w-full rounded-xl border border-amber-200 bg-white p-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || reviewNote.trim().length < 3}
              onClick={() => void act({ action: 'resolve_review', note: reviewNote, reviewSnapshot: order.reviewSnapshot }, 'حُسمت المراجعة')}
              className={`${button} mt-2 bg-amber-600 text-white hover:bg-amber-700`}
            >
              <CheckCircle2 className="h-4 w-4" /> حسم المراجعة
            </button>
          </section>
        )}

        {/* الإجراءات */}
        <section className="mb-4 rounded-2xl border border-gray-100 p-4">
          <h3 className="mb-3 font-bold text-gray-900">الحالة: {paid ? FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus] : PAYMENT_STATUS_LABELS[order.paymentStatus]}</h3>
          {paid && !order.isTest && !order.saleRecorded && !order.needsReview && (
            <p className="mb-3 text-sm text-red-700">المبيعة لم تُسجَّل في الواردات بعد — تُسجَّل آلياً خلال دقائق. لا يبدأ التجهيز قبلها.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {canProgress && order.fulfillmentStatus === 'unfulfilled' && (
              <button type="button" disabled={busy} onClick={() => void setStatus('preparing')} className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>
                <PackageCheck className="h-4 w-4" /> بدء التجهيز
              </button>
            )}
            {canProgress && order.fulfillmentStatus === 'preparing' && order.deliveryMethod === 'pickup' && (
              <button type="button" disabled={busy} onClick={() => void setStatus('ready_for_pickup')} className={`${button} bg-emerald-600 text-white hover:bg-emerald-700`}>
                <Store className="h-4 w-4" /> جاهز للاستلام
              </button>
            )}
            {canProgress && ['ready_for_pickup', 'shipped'].includes(order.fulfillmentStatus) && (
              <button type="button" disabled={busy} onClick={() => void setStatus('delivered')} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}>
                <CheckCircle2 className="h-4 w-4" /> {order.deliveryMethod === 'pickup' ? 'استلمته الزبونة' : 'تم التسليم'}
              </button>
            )}
            {order.fulfillmentStatus === 'preparing' && (
              <button type="button" disabled={busy} onClick={() => void setStatus('unfulfilled')} className={`${button} border border-gray-200 text-gray-700 hover:bg-gray-50`}>
                إرجاع إلى «لم يُجهَّز»
              </button>
            )}
          </div>

          {canProgress && order.fulfillmentStatus === 'preparing' && order.deliveryMethod === 'shipping' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="شركة الشحن" maxLength={80}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              <input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="رقم البوليصة" dir="ltr" maxLength={60}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              <button type="button" disabled={busy || !carrier.trim() || !tracking.trim()}
                onClick={() => void setStatus('shipped', { carrier, tracking })}
                className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}>
                <Truck className="h-4 w-4" /> تم الشحن
              </button>
            </div>
          )}

          {!paid && order.fulfillmentStatus !== 'cancelled' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="سبب الإلغاء (اختياري)" maxLength={300}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              <button type="button" disabled={busy}
                onClick={() => { if (confirm('إلغاء الطلب غير المدفوع؟ يعود قماشه للبيع فوراً.')) void setStatus('cancelled', { note: cancelReason || null }) }}
                className={`${button} border border-red-200 text-red-700 hover:bg-red-50`}>
                إلغاء الطلب
              </button>
            </div>
          )}
          {paid && order.fulfillmentStatus === 'unfulfilled' && (
            <p className="mt-3 text-xs text-gray-500">إلغاء طلب مدفوع يكون مع استرداد مبلغه — من المدير.</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            <a href={whatsapp} target="_blank" rel="noreferrer" className={`${button} bg-green-600 text-white hover:bg-green-700`}>
              <MessageCircle className="h-4 w-4" /> واتساب للزبونة
            </a>
            {order.trackingUrl && (
              <button type="button" className={`${button} border border-gray-200 text-gray-700 hover:bg-gray-50`}
                onClick={() => { void navigator.clipboard.writeText(order.trackingUrl!).then(() => toast.success('نُسخ رابط التتبّع')) }}>
                <Copy className="h-4 w-4" /> نسخ رابط التتبّع
              </button>
            )}
          </div>
        </section>

        {IS_FABRIC_STORE_REFUNDS_ENABLED && detail.refundsEnabled && (
          <RefundSection detail={detail} busy={busy} setBusy={setBusy} reload={load} onChanged={onChanged} />
        )}

        {/* تنبيهات */}
        {openAlerts.length > 0 && (
          <section className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
            <p className="mb-1 font-bold">تنبيهات</p>
            <ul className="list-disc space-y-1 pr-5">
              {openAlerts.map(task => (
                <li key={task.id}>
                  {task.topic === 'notify_staff' ? `تنبيه: ${String(task.reason ?? '')}` :
                   task.topic === 'alostaz_invoice' ? 'فاتورة الأستاذ توقفت وتحتاج مراجعة في الأستاذ' :
                   `${task.topic} متوقفة`}
                  {task.lastError && <span className="block text-xs opacity-75">{task.lastError}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* الزبونة والاستلام */}
        <section className="mb-4 rounded-2xl border border-gray-100 p-4 text-sm">
          <h3 className="mb-2 font-bold text-gray-900">الزبونة</h3>
          <p>{order.customerName} · <span dir="ltr">{order.customerPhone}</span>{order.customerEmail ? ` · ${order.customerEmail}` : ''}</p>
          <p className="mt-2 font-semibold">{order.deliveryMethod === 'pickup' ? 'استلام من المحل' : (order.deliveryLabel || 'شحن')}</p>
          {address && (address.anonymized_at ? <p className="text-gray-500">العنوان مُحي بعد انتهاء الطلب</p> : (
            <p className="text-gray-700">
              {[address.recipient_name, address.recipient_phone, address.city, address.district, address.street,
                address.building_number && `مبنى ${address.building_number}`, address.postal_code && `الرمز ${address.postal_code}`,
                address.additional_number && `الإضافي ${address.additional_number}`, address.short_address && `العنوان المختصر ${address.short_address}`]
                .filter(Boolean).join(' · ')}
              {address.notes && <span className="block text-gray-500">ملاحظات: {address.notes}</span>}
            </p>
          ))}
          {order.trackingNumber && (
            <p className="mt-2">الشحن: {order.shippingCarrier} · <span dir="ltr" className="font-semibold">{order.trackingNumber}</span></p>
          )}
        </section>

        {/* الأسطر */}
        <section className="mb-4 rounded-2xl border border-gray-100 p-4 text-sm">
          <h3 className="mb-2 font-bold text-gray-900">القماش</h3>
          <ul className="divide-y divide-gray-100">
            {items.map(item => (
              <li key={item.lineNumber} className="flex justify-between gap-3 py-2">
                <span>
                  {item.name}{item.code ? ` (${item.code})` : ''}{item.color ? ` · ${item.color}` : ''}
                  <span className="block text-xs text-gray-500">
                    {item.purchaseMode === 'piece'
                      ? `قطعة كاملة ${formatFabricNumber((item.pieceLengthCm ?? 0) / 100)} م`
                      : `${formatFabricNumber((item.quantityCm ?? 0) / 100)} م`}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold">{money(item.grossHalalas)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-gray-700">
            {order.shippingHalalas > 0 && <p className="flex justify-between"><span>الشحن مع ضريبته</span><span>{money(order.shippingHalalas)}</span></p>}
            <p className="flex justify-between"><span>منها الضريبة</span><span>{money(order.vatHalalas)}</span></p>
            <p className="flex justify-between text-base font-bold text-gray-900"><span>الإجمالي</span><span>{money(order.totalHalalas)}</span></p>
          </div>
        </section>

        {/* الدفع والمبيعة */}
        <section className="mb-4 rounded-2xl border border-gray-100 p-4 text-sm">
          <h3 className="mb-2 font-bold text-gray-900">الدفع والمحاسبة</h3>
          {attempts.length === 0 ? <p className="text-gray-500">لم تبدأ أي محاولة دفع</p> : (
            <ul className="space-y-1">
              {attempts.map(a => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{when(a.createdAt)} · {a.environment === 'test' ? 'اختبار' : 'حقيقي'} · {a.status}</span>
                  <span dir="ltr" className="text-xs text-gray-500">{a.paymentId ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
          {sale && (
            <p className="mt-2">
              مبيعة الواردات رقم <span className="font-semibold">{sale.invoiceNumber}</span> ({sale.date}) ·
              الأستاذ: {sale.alostazStatus === 'sent' ? `أُرسلت ${sale.alostazCode ?? ''}` : sale.alostazStatus ?? 'لم تُرسل بعد'}
            </p>
          )}
        </section>

        {/* السجل */}
        <section className="mb-4 rounded-2xl border border-gray-100 p-4 text-sm">
          <h3 className="mb-2 font-bold text-gray-900">سجل الطلب</h3>
          <ol className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="border-r-2 border-gray-200 pr-3">
                <p className="text-xs text-gray-500">
                  {when(e.createdAt)} · {e.actorName || ({ customer: 'الزبونة', provider: 'ميسر', system: 'النظام', staff: 'موظف' } as Record<string, string>)[e.actorType] || e.actorType}
                </p>
                <p>
                  {e.type === 'order_created' && 'أُنشئ الطلب'}
                  {e.type === 'payment_status' && `الدفع: ${PAYMENT_STATUS_LABELS[e.to as FabricStorePaymentStatus] ?? e.to}`}
                  {e.type === 'fulfillment_status' && `التنفيذ: ${FULFILLMENT_STATUS_LABELS[e.to as FabricStoreFulfillmentStatus] ?? e.to}`}
                  {e.type === 'review_flag' && (e.to === 'true' ? 'رُفعت علامة مراجعة' : 'حُسمت المراجعة')}
                  {e.type === 'note' && 'ملاحظة'}
                  {e.note && <span className="block text-gray-600">{e.note}</span>}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="أضيفي ملاحظة للسجل"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <button type="button" disabled={busy || note.trim().length < 2}
              onClick={() => void act({ action: 'note', note }, 'أُضيفت الملاحظة')}
              className={`${button} border border-gray-200 text-gray-700 hover:bg-gray-50`}>
              إضافة
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * المرحلة 8: الاسترداد (للمدير فقط — قرار المالك)، وإعادة المرتجع للمخزون، ورقم الإشعار الدائن.
 * القص يبدأ عند «بدء التجهيز»: قبله «إلغاء واسترداد كامل» يعيد القماش آلياً، وبعده استرداد
 * بمبلغ وسبب. كل إجراء يحمل مفتاحاً فالضغطة المكررة لا تكرر الأثر.
 */
function RefundSection({ detail, busy, setBusy, reload, onChanged }: {
  detail: OrderDetail
  busy: boolean
  setBusy: (value: boolean) => void
  reload: () => Promise<void>
  onChanged: () => void
}) {
  const { order, items } = detail
  const refunds = detail.refunds ?? []
  const restocks = detail.restocks ?? []
  const isAdmin = detail.viewerRole === 'admin'
  const refundable = detail.refundableHalalas ?? 0
  // (مراجعة 2) واقعة القص دائمة: الرجوع إلى «لم يُجهَّز» لا يعيد أهلية الإلغاء.
  const beforeCut = order.fulfillmentStatus === 'unfulfilled' && !order.cutStartedAt
  const cancelled = order.fulfillmentStatus === 'cancelled'
  const pending = refunds.some(r => r.status === 'pending')

  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [restockNote, setRestockNote] = useState('')
  const [restockMeters, setRestockMeters] = useState<Record<number, string>>({})
  const [creditCodes, setCreditCodes] = useState<Record<string, string>>({})
  const [closeRefs, setCloseRefs] = useState<Record<string, { reference: string; note: string }>>({})
  // عملية أُرسلت ولم تُعرف نتيجتها: مفتاحها وبياناتها محفوظة (وتبقى بعد إعادة التحميل)،
  // وتُعاد كما هي. لا عملية جديدة من النوع نفسه قبل حسمها.
  const storage = (): Storage | null => { try { return window.localStorage } catch { return null } }
  const [unsettled, setUnsettled] = useState<PendingAction | null>(() => loadPending(storage(), order.id))

  const send = async (action: PendingAction, success: string): Promise<boolean> => {
    savePending(storage(), order.id, action)
    setUnsettled(action)
    setBusy(true)
    let outcome: ActionOutcome = { kind: 'network' }
    let data: { ok?: boolean; code?: string; error?: string; result?: { message?: string } } | null = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('no session')
      const response = await fetch(`/api/fabric-store/staff/orders/${order.id}/`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...action.body, key: action.key }),
      })
      data = await response.json().catch(() => null)
      outcome = { kind: 'http', status: response.status, code: data?.code ?? null }
    } catch { /* لا رد: النتيجة مجهولة */ }
    let done = false
    if (isSettled(outcome)) {
      clearPending(storage(), order.id)
      setUnsettled(null)
      if (outcome.kind === 'http' && outcome.status < 300 && data?.ok) {
        toast.success(data.result?.message || success, { duration: 6000 })
        done = true
      } else {
        toast.error(data?.error || 'تعذّر تنفيذ الإجراء', { duration: 8000 })
      }
    } else {
      toast.error('لم تصل نتيجة العملية — أعيدي المحاولة من الزر الظاهر؛ تُرسل بالمفتاح نفسه فلا تتكرر', { duration: 10000 })
    }
    await reload()
    onChanged()
    setBusy(false)
    return done
  }

  const act = async (body: Record<string, unknown>, success: string) => {
    setBusy(true)
    try {
      await api(`/api/fabric-store/staff/orders/${order.id}/`, { method: 'POST', body: JSON.stringify(body) })
      toast.success(success)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      await reload(); onChanged(); setBusy(false)
    }
  }

  const refund = async (cancel: boolean) => {
    const halalas = cancel ? refundable : toHundredths(amount)
    if (!halalas || halalas > refundable) { toast.error('اكتبي مبلغاً لا يتجاوز المتبقي'); return }
    if (reason.trim().length < 3) { toast.error('اكتبي سبب الاسترداد'); return }
    const question = cancel
      ? `إلغاء الطلب واسترداد ${money(halalas)} كاملاً للزبونة؟ يعود القماش للمخزون، ولا تراجع عن ذلك.`
      : `استرداد ${money(halalas)} للزبونة؟ لا تراجع عن الاسترداد.`
    if (!confirm(question)) return
    if (await send({ kind: 'refund', key: newKey(), body: { action: 'refund', amountHalalas: halalas, reason, cancel } }, 'تم')) {
      setReason(''); setAmount('')
    }
  }

  const restock = async () => {
    const lines = Object.entries(restockMeters)
      .map(([line, meters]) => ({ lineNumber: Number(line), quantityCm: toHundredths(meters) }))
      .filter((l): l is { lineNumber: number; quantityCm: number } => l.quantityCm !== null)
    if (!lines.length) { toast.error('اكتبي الطول الصالح المُعاد (بالمتر)'); return }
    if (restockNote.trim().length < 3) { toast.error('اكتبي ملاحظة الفحص'); return }
    if (!confirm('إعادة هذا الطول للمخزون؟ يصبح متاحاً للبيع في المحل والمتجر فوراً.')) return
    if (await send({ kind: 'restock', key: newKey(), body: { action: 'restock', lines, note: restockNote } }, 'أُعيد القماش للمخزون')) {
      setRestockMeters({}); setRestockNote('')
    }
  }

  const restockedCm = (line: number) => restocks.filter(r => r.lineNumber === line).reduce((s, r) => s + r.quantityCm, 0)
  const canRestock = order.saleRecorded && !!order.cutStartedAt && !unsettled
  const button = 'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50'
  const refundStatus: Record<string, string> = { pending: 'بانتظار تأكيد ميسر', succeeded: 'تم', failed: 'لم يتم' }

  if (!refunds.length && !canRestock && !unsettled && !(isAdmin && refundable > 0)) return null

  return (
    <section className="mb-4 rounded-2xl border border-rose-100 p-4 text-sm">
      <h3 className="mb-3 font-bold text-gray-900">الاسترداد والمرتجع</h3>

      {unsettled && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold">{unsettled.kind === 'refund' ? 'استرداد' : 'إعادة للمخزون'} أُرسلت ولم تصل نتيجتها</p>
          <p className="mt-1 text-xs">أعيدي الإرسال من هنا: تُرسل العملية نفسها بمفتاحها، فإن كانت قد نُفّذت لا تتكرر. لا عملية جديدة قبل حسمها.</p>
          <button type="button" disabled={busy} onClick={() => void send(unsettled, 'حُسمت العملية')}
            className={`${button} mt-2 bg-amber-600 text-white hover:bg-amber-700`}>إعادة الإرسال</button>
        </div>
      )}

      {refunds.length > 0 && (
        <ul className="mb-3 space-y-2">
          {refunds.map(r => (
            <li key={r.id} className="rounded-xl bg-gray-50 p-3">
              <p className="flex justify-between gap-2">
                <span className="font-semibold">{r.cancelsOrder ? 'إلغاء واسترداد' : 'استرداد'} {money(r.amountHalalas)}</span>
                <span className={r.status === 'succeeded' ? 'text-emerald-700' : r.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>
                  {refundStatus[r.status] ?? r.status}
                </span>
              </p>
              <p className="text-xs text-gray-500">{when(r.createdAt)}{r.requestedBy ? ` · ${r.requestedBy}` : ''} · {r.reason}</p>
              {r.failureMessage && <p className="text-xs text-red-700">{r.failureMessage}</p>}
              {r.reviewReference && (
                <p className="text-xs text-gray-600">قرار المدير {when(r.reviewedAt)} — المرجع <span dir="ltr">{r.reviewReference}</span>{r.reviewNote ? ` — ${r.reviewNote}` : ''}</p>
              )}
              {r.status === 'pending' && isAdmin && (() => {
                // (مراجعة) نداء أُرسل ولم يظهر: 24 ساعة موعد المراجعة لا فشل؛ الإغلاق بمرجع التسوية فقط.
                const dueAt = r.providerCalledAt ? Date.parse(r.providerCalledAt) + 24 * 3600_000 : null
                if (dueAt !== null && dueAt > Date.now()) {
                  return <p className="mt-1 text-xs text-amber-800">أُرسل لميسر ولم يظهر بعد. المهمة تتابعه؛ موعد المراجعة {when(new Date(dueAt).toISOString())}.</p>
                }
                const form = closeRefs[r.id] ?? { reference: '', note: '' }
                return (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                    <p className="text-xs text-amber-900">
                      {r.providerCalledAt
                        ? 'مضت 24 ساعة ولم يظهر الاسترداد لدى ميسر. أغلقيه فقط بعد التحقق من التسوية أو من دعم ميسر؛ إن أظهر ميسر أي حركة يُرفض الإغلاق.'
                        : 'لم يُرسل هذا الاسترداد لميسر. يمكن إغلاقه بقرار موثّق.'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input value={form.reference} dir="ltr" maxLength={120} placeholder="مرجع التسوية أو مراسلة ميسر"
                        onChange={e => setCloseRefs(c => ({ ...c, [r.id]: { ...form, reference: e.target.value } }))}
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
                      <input value={form.note} maxLength={500} placeholder="القرار وسببه"
                        onChange={e => setCloseRefs(c => ({ ...c, [r.id]: { ...form, note: e.target.value } }))}
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
                      <button type="button" disabled={busy || form.reference.trim().length < 3 || form.note.trim().length < 3}
                        onClick={() => { if (confirm('إغلاق هذا الاسترداد على أنه لم يُنفَّذ؟ يُسجَّل قرارك ومرجعه، ويصبح بدء استرداد جديد ممكناً.')) void act({ action: 'refund_close', refundId: r.id, reference: form.reference, note: form.note }, 'أُغلق الاسترداد بقرارك') }}
                        className={`${button} border border-amber-300 text-amber-900 hover:bg-amber-100`}>إغلاق دون تنفيذ</button>
                    </div>
                  </div>
                )
              })()}
              {r.creditNoteCode && <p className="text-xs text-gray-600">الإشعار الدائن في الأستاذ: <span dir="ltr">{r.creditNoteCode}</span></p>}
              {r.status === 'succeeded' && r.hasIncomeRow && !r.creditNoteCode && (
                <div className="mt-2">
                  <p className={`text-xs ${r.creditNoteNeeded ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>
                    {r.creditNoteNeeded
                      ? 'مطلوب إشعار دائن في الأستاذ بهذا المبلغ على فاتورة البيع — أصدريه ثم اكتبي رقمه هنا'
                      : 'فاتورة البيع لم تصل الأستاذ بعد؛ إن أُرسلت لاحقاً يلزم إشعار دائن بهذا المبلغ'}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <input value={creditCodes[r.id] ?? ''} onChange={e => setCreditCodes(c => ({ ...c, [r.id]: e.target.value }))}
                      placeholder="رقم الإشعار الدائن" maxLength={60} dir="ltr"
                      className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
                    <button type="button" disabled={busy || !(creditCodes[r.id] ?? '').trim()}
                      onClick={() => void act({ action: 'credit_note', refundId: r.id, code: creditCodes[r.id] }, 'سُجّل رقم الإشعار الدائن')}
                      className={`${button} border border-gray-200 text-gray-700 hover:bg-gray-50`}>حفظ</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && refundable > 0 && !pending && !unsettled && (
        <div className="rounded-xl border border-gray-100 p-3">
          <p className="mb-2 text-gray-700">
            المتبقي القابل للاسترداد: <span className="font-bold">{money(refundable)}</span>
            {order.isTest && <span className="mr-2 text-purple-700">(دفعة اختبار: يُرد في ميسر test)</span>}
          </p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={500}
            placeholder={beforeCut ? 'سبب الإلغاء (مثال: طلبت الزبونة الإلغاء قبل القص)' : cancelled ? 'سبب الاسترداد (مثال: سداد وصل بعد إلغاء الطلب)' : 'سبب الاسترداد (مثال: عيب في القماش، نقص في الطول، رسوم الشحن)'}
            className="w-full rounded-xl border border-gray-200 p-2 text-sm" />
          {beforeCut ? (
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void refund(true)}
              className={`${button} mt-2 bg-red-600 text-white hover:bg-red-700`}>
              إلغاء الطلب واسترداد {money(refundable)}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" dir="ltr"
                placeholder="المبلغ بالريال" className="w-40 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              <button type="button" disabled={busy || reason.trim().length < 3 || !toHundredths(amount)} onClick={() => void refund(false)}
                className={`${button} bg-red-600 text-white hover:bg-red-700`}>
                استرداد المبلغ
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {beforeCut
              ? 'قبل القص: يُلغى الطلب ويُرد كامل المبلغ ويعود القماش للمخزون آلياً.'
              : cancelled
                ? 'الطلب ملغى ووصله سداد متأخر: يُرد المبلغ ويبقى الطلب ملغى (لا مبيعة ولا قماش خُصم).'
                : 'بدأ القص (ولو أُعيد إلى «لم يُجهَّز»): الإلغاء غير متاح. الاسترداد بسبب مكتوب، والقماش المرتجع يُعاد للمخزون من القسم أدناه بعد فحصه.'}
          </p>
        </div>
      )}
      {!isAdmin && refundable > 0 && <p className="text-xs text-gray-500">الاسترداد للمدير فقط.</p>}

      {canRestock && (
        <div className="mt-3 rounded-xl border border-gray-100 p-3">
          <p className="mb-2 font-semibold text-gray-800">إعادة قماش مرتجع للمخزون (بعد استلامه وفحصه)</p>
          <ul className="space-y-2">
            {items.map(item => {
              const sold = item.consumptionCm
              const back = restockedCm(item.lineNumber)
              return (
                <li key={item.lineNumber} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {item.name}{item.color ? ` · ${item.color}` : ''}
                    <span className="block text-xs text-gray-500">
                      خُصم {formatFabricNumber(sold / 100)} م{back > 0 ? ` · أُعيد ${formatFabricNumber(back / 100)} م` : ''}
                    </span>
                  </span>
                  <input value={restockMeters[item.lineNumber] ?? ''} disabled={back >= sold}
                    onChange={e => setRestockMeters(m => ({ ...m, [item.lineNumber]: e.target.value }))}
                    inputMode="decimal" dir="ltr" placeholder="الطول بالمتر"
                    className="w-32 rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
                </li>
              )
            })}
          </ul>
          <input value={restockNote} onChange={e => setRestockNote(e.target.value)} maxLength={500}
            placeholder="ملاحظة الفحص (مثال: القطعة سليمة غير مقصوصة)"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          <button type="button" disabled={busy} onClick={() => void restock()}
            className={`${button} mt-2 border border-gray-200 text-gray-700 hover:bg-gray-50`}>
            إعادة للمخزون
          </button>
        </div>
      )}

      {restocks.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-gray-600">
          {restocks.map((r, i) => (
            <li key={i}>
              {when(r.createdAt)} · السطر {r.lineNumber}: {formatFabricNumber(r.quantityCm / 100)} م ·{' '}
              {r.reason === 'cancelled_before_cut' ? 'أُلغي قبل القص' : 'مرتجع'}{r.note ? ` · ${r.note}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function OnlineOrdersPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <OnlineOrdersContent />
    </ProtectedWorkerRoute>
  )
}
