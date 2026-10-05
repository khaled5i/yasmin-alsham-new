'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react'
import FabricPayNowButton from '@/components/fabrics/FabricPayNowButton'
import { IS_FABRIC_STORE_PAYMENTS_ENABLED } from '@/lib/fabric-store/checkout-contract'
import { IS_FABRIC_STORE_ORDERS_ENABLED } from '@/lib/fabric-store/order-status'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { useFabricCartStore } from '@/store/fabricCartStore'

/**
 * صفحة الرجوع من ميسر (المرحلة 5). **لا تثق بالرابط**: ما يضيفه ميسر إلى العنوان
 * ليس إثباتاً. الصفحة تسأل خادمنا، وهو يسأل ميسر بمفتاحه ويعتمد السداد في القاعدة.
 * تعيد السؤال كل 3 ثوانٍ لدقيقة تقريباً؛ الـwebhook ومهمة إعادة المعالجة يكملان بعدها.
 */

interface StatusResponse {
  ok: boolean
  error?: string
  orderNumber?: string
  totalHalalas?: number
  paymentStatus?: string
  needsReview?: boolean
  attemptStatus?: string
}

const POLL_MS = 3_000
const MAX_POLLS = 20

function ReturnView() {
  const params = useSearchParams()
  const attemptId = params.get('attempt') ?? ''
  const cameBack = params.get('back') === '1'
  const clearCart = useFabricCartStore(state => state.clear)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polls, setPolls] = useState(0)
  const cleared = useRef(false)

  const check = useCallback(async () => {
    try {
      const response = await fetch(`/api/fabric-store/payment/status/?attempt=${encodeURIComponent(attemptId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const data = (await response.json().catch(() => null)) as StatusResponse | null
      if (response.ok && data?.ok) {
        setStatus(data)
        setError(null)
      } else if (response.status !== 429) {
        setError(data?.error || 'تعذّر التحقق من الدفع الآن')
      }
    } catch {
      setError('انقطع الاتصال — سنعيد المحاولة')
    } finally {
      setPolls(count => count + 1)
    }
  }, [attemptId])

  const paid = status?.paymentStatus === 'paid' || status?.paymentStatus === 'partially_refunded'
  const attemptEnded = ['failed', 'cancelled', 'expired'].includes(status?.attemptStatus ?? '')
  const notCompleted = !paid && (attemptEnded || (cameBack && polls >= 2))
  const stillWaiting = !paid && !notCompleted && polls >= MAX_POLLS

  useEffect(() => {
    if (!attemptId) return
    if (paid || notCompleted || stillWaiting) return
    const timer = setTimeout(() => void check(), polls === 0 ? 0 : POLL_MS)
    return () => clearTimeout(timer)
  }, [attemptId, check, paid, notCompleted, stillWaiting, polls])

  // السلة تُفرَّغ بعد السداد الموثّق فقط، لا عند الضغط على «ادفعي».
  useEffect(() => {
    if (paid && !cleared.current) {
      cleared.current = true
      clearCart()
    }
  }, [paid, clearCart])

  const card = 'mx-auto max-w-lg rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-6 text-center'

  if (!attemptId) {
    return <div className={card}><p>رابط غير صالح.</p><Link href="/fabrics/" className="mt-4 inline-block font-semibold text-[#6b1726]">متجر الأقمشة</Link></div>
  }

  if (paid) {
    return (
      <div className={card}>
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[#6b1726]" aria-hidden="true" />
        <h1 className="mb-2 text-2xl font-bold text-[#6b1726]">تم الدفع بنجاح</h1>
        <p className="mb-1 text-sm text-[#211b19]/70">
          رقم الطلب <span dir="ltr" className="font-bold text-[#211b19]">{status?.orderNumber}</span>
        </p>
        {status?.totalHalalas != null && (
          <p className="mb-4 text-lg font-bold">{formatFabricNumber(status.totalHalalas / 100)} ريال</p>
        )}
        <p className="text-sm text-[#211b19]/75">
          {status?.needsReview
            ? 'وصلنا الدفع، وسنتواصل معكِ لتأكيد تفاصيل الطلب.'
            : 'سنبدأ تجهيز طلبك ونبلغك حين يكون جاهزاً.'}
        </p>
        {IS_FABRIC_STORE_ORDERS_ENABLED && (
          <Link href="/fabrics/order/" className="mt-5 inline-block rounded-xl border-2 border-[#6b1726] px-5 py-2 font-semibold text-[#6b1726] hover:bg-[#6b1726] hover:text-[#f6f0e8]">
            تتبّعي طلبك
          </Link>
        )}
        <br />
        <Link href="/fabrics/" className="mt-6 inline-block text-sm font-semibold text-[#6b1726] hover:text-[#2f0c14]">
          العودة إلى متجر الأقمشة
        </Link>
      </div>
    )
  }

  if (notCompleted) {
    return (
      <div className={card}>
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-[#6b1726]" aria-hidden="true" />
        <h1 className="mb-2 text-xl font-bold text-[#6b1726]">لم يكتمل الدفع</h1>
        <p className="mb-5 text-sm text-[#211b19]/75">لم يُخصم شيء مقابل هذه المحاولة. يمكنكِ المحاولة مرة أخرى ما دام القماش محجوزاً لكِ.</p>
        {IS_FABRIC_STORE_PAYMENTS_ENABLED && <FabricPayNowButton label="إعادة محاولة الدفع" />}
        <Link href="/fabrics/cart/" className="mt-4 inline-block text-sm font-semibold text-[#6b1726]">العودة إلى السلة</Link>
      </div>
    )
  }

  if (stillWaiting) {
    return (
      <div className={card}>
        <Clock className="mx-auto mb-3 h-10 w-10 text-[#6b1726]" aria-hidden="true" />
        <h1 className="mb-2 text-xl font-bold">لم يصلنا تأكيد الدفع بعد</h1>
        <p className="mb-5 text-sm text-[#211b19]/75">
          إن كنتِ أتممتِ الدفع فسيُعتمد تلقائياً خلال دقائق، ولا حاجة للدفع مرة أخرى. رقم طلبك
          <span dir="ltr" className="mx-1 font-bold">{status?.orderNumber}</span>.
        </p>
        <button
          type="button"
          onClick={() => { setPolls(0) }}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-[#6b1726] px-5 py-2 font-semibold text-[#6b1726] hover:bg-[#6b1726] hover:text-[#f6f0e8]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> تحقّقي مرة أخرى
        </button>
      </div>
    )
  }

  return (
    <div className={card} role="status" aria-live="polite">
      <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-[#6b1726]" aria-hidden="true" />
      <h1 className="mb-2 text-xl font-bold">جارٍ التحقق من الدفع...</h1>
      <p className="text-sm text-[#211b19]/70">لا تغلقي الصفحة ولا تدفعي مرة أخرى.</p>
      {error && <p className="mt-3 text-sm font-semibold text-[#6b1726]">{error}</p>}
    </div>
  )
}

export default function FabricPaymentReturnPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f3] px-4 py-10 text-[#211b19]">
      <Suspense fallback={<div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6b1726]" aria-hidden="true" /></div>}>
        <ReturnView />
      </Suspense>
    </main>
  )
}
