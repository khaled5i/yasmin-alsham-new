'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, CreditCard, Loader2, MessageCircle, ShieldCheck, Store, Truck } from 'lucide-react'
import { IS_FABRIC_CART_ENABLED, formatQuantityLabel } from '@/lib/fabric-commerce'
import {
  FABRIC_DELIVERY_OPTIONS,
  FABRIC_LINE_STATUS_MESSAGES,
  FABRIC_STORE_HOLD_MINUTES,
  FABRIC_STORE_MAX_ORDER_LINES,
  FABRIC_STORE_PAYMENT_HOLD_MINUTES,
  IS_FABRIC_STORE_CHECKOUT_ENABLED,
  IS_FABRIC_STORE_PAYMENTS_ENABLED,
  describeFabricCheckoutIssue,
  fabricCheckoutFormSchema,
  type FabricCheckoutFailure,
  type FabricCheckoutSuccess,
  type FabricDeliveryMethod,
  type FabricOrderSummary,
  type FabricQuoteResponse,
} from '@/lib/fabric-store/checkout-contract'
import FabricPayNowButton from '@/components/fabrics/FabricPayNowButton'
import { parseBuyNowLine, type FabricBuyNowLine } from '@/lib/fabric-store/buy-now'
import { FABRIC_STORE_WHATSAPP_NUMBER } from '@/lib/fabric-cart-whatsapp'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { useFabricCartStore } from '@/store/fabricCartStore'

/**
 * صفحة إتمام الطلب: إنشاء الطلب ثم الانتقال لصفحة دفع ميسر بضغطة واحدة («ادفعي الآن»).
 *
 * مصدر الأسطر إما السلة، أو سطر واحد من «شراء الآن» في عنوان الصفحة
 * (`?buy=…&mode=…&qty=…`) — وفي الحالة الثانية لا تُلمس السلة.
 *
 * كل رقم معروض هنا من عرض سعر الخادم، لا من حساب المتصفح. عند الإرسال يعيد الخادم
 * التسعير ويقارنه بما رأته الزبونة؛ إن اختلف يعرض الملخّص الجديد ولا يُنشئ طلباً.
 * خلف مفتاحين مطفأين: NEXT_PUBLIC_FABRIC_STORE_CHECKOUT_ENABLED (هنا) وFABRIC_STORE_CHECKOUT_ENABLED (الخادم).
 */

const sar = (halalas: number) => `${formatFabricNumber(halalas / 100)} ريال`

const riyadhTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })

interface FormState {
  name: string
  phone: string
  email: string
  city: string
  shortAddress: string
  district: string
  street: string
  buildingNumber: string
  postalCode: string
  notes: string
  acceptPolicies: boolean
  marketingOptIn: boolean
}

const EMPTY_FORM: FormState = {
  name: '', phone: '', email: '', city: '', shortAddress: '',
  district: '', street: '', buildingNumber: '', postalCode: '', notes: '',
  acceptPolicies: false, marketingOptIn: false,
}

/**
 * مسودة النموذج في هذا المتصفح فقط، حتى لا تضيع البيانات إن أُغلقت الصفحة بالخطأ.
 * الموافقة على الشروط لا تُحفظ (تُعطى صراحةً في كل طلب)، وتُمسح المسودة بعد إنشاء الطلب.
 */
const DRAFT_STORAGE_KEY = 'yasmin-fabric-checkout-draft-v1'
const DRAFT_TEXT_FIELDS = ['name', 'phone', 'email', 'city', 'shortAddress', 'district', 'street', 'buildingNumber', 'postalCode', 'notes'] as const

interface CheckoutDraft {
  form: Partial<FormState>
  deliveryMethod: FabricDeliveryMethod
}

function readDraft(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { form?: Record<string, unknown>; deliveryMethod?: unknown }
    const form: Partial<FormState> = {}
    for (const key of DRAFT_TEXT_FIELDS) {
      const value = parsed.form?.[key]
      if (typeof value === 'string') form[key] = value.slice(0, 300)
    }
    if (typeof parsed.form?.marketingOptIn === 'boolean') form.marketingOptIn = parsed.form.marketingOptIn
    return { form, deliveryMethod: parsed.deliveryMethod === 'shipping' ? 'shipping' : 'pickup' }
  } catch {
    return null
  }
}

function writeDraft(form: FormState, deliveryMethod: FabricDeliveryMethod) {
  try {
    const saved: Partial<FormState> = { marketingOptIn: form.marketingOptIn }
    for (const key of DRAFT_TEXT_FIELDS) saved[key] = form[key]
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ form: saved, deliveryMethod }))
  } catch { /* التخزين محجوب: النموذج يعمل بلا مسودة. */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* لا شيء نمسحه. */ }
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => null)) as T | null
  return { status: response.status, data }
}

export default function FabricCheckoutPage() {
  const hasHydrated = useFabricCartStore(state => state.hasHydrated)
  const storedCartLines = useFabricCartStore(state => state.lines)
  // undefined = لم يُقرأ العنوان بعد؛ null = الشراء من السلة.
  const [buyNowLine, setBuyNowLine] = useState<FabricBuyNowLine | null | undefined>(undefined)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [deliveryMethod, setDeliveryMethod] = useState<FabricDeliveryMethod>('pickup')
  const [quote, setQuote] = useState<FabricQuoteResponse | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [order, setOrder] = useState<FabricOrderSummary | null>(null)
  // يبقى المفتاح نفسه فقط لإعادة إرسال الطلب نفسه بعد انقطاع أو خطأ خادم؛ أي تغيير يولّد مفتاحاً جديداً.
  const retryKey = useRef<string | null>(null)
  const quoteRequest = useRef(0)

  const isBuyNow = Boolean(buyNowLine)
  const isSourceReady = buyNowLine !== undefined && (isBuyNow || hasHydrated)

  const requestLines = useMemo(
    () => buyNowLine
      ? [buyNowLine]
      : storedCartLines.map(line => ({ fabricId: line.fabricId, purchaseMode: line.purchaseMode, quantity: line.quantity })),
    [buyNowLine, storedCartLines]
  )
  const labels = useMemo(
    () => new Map(storedCartLines.map(line => [line.fabricId, line.snapshot?.label ?? null])),
    [storedCartLines]
  )

  // مصدر الأسطر + مسودة النموذج: تُقرأ بعد التركيب فقط (لا وجود لـwindow على الخادم).
  useEffect(() => {
    setBuyNowLine(parseBuyNowLine(window.location.search))
    const draft = readDraft()
    if (draft) {
      setForm(previous => ({ ...previous, ...draft.form }))
      setDeliveryMethod(draft.deliveryMethod)
    }
    setDraftLoaded(true)
  }, [])

  useEffect(() => {
    if (draftLoaded && !order) writeDraft(form, deliveryMethod)
  }, [draftLoaded, form, deliveryMethod, order])

  const loadQuote = useCallback(async () => {
    if (requestLines.length === 0) { setQuote(null); return }
    const current = ++quoteRequest.current
    setIsQuoting(true)
    setQuoteError(null)
    try {
      const { status, data } = await postJson<FabricQuoteResponse | FabricCheckoutFailure>(
        '/api/fabric-store/quote/', { lines: requestLines, deliveryMethod })
      if (current !== quoteRequest.current) return
      if (status === 200 && data?.ok) setQuote(data)
      else setQuoteError((data && !data.ok && data.error) || 'تعذّر حساب السعر الآن')
    } catch {
      if (current === quoteRequest.current) setQuoteError('تعذّر الاتصال — تحققي من الشبكة ثم أعيدي المحاولة')
    } finally {
      if (current === quoteRequest.current) setIsQuoting(false)
    }
  }, [requestLines, deliveryMethod])

  useEffect(() => {
    if (!isSourceReady || order) return
    retryKey.current = null
    void loadQuote()
  }, [isSourceReady, loadQuote, order])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    retryKey.current = null
    setSubmitError(null)
    setForm(previous => ({ ...previous, [key]: value }))
  }

  // اسم المستلمة وجوالها هما بيانات الطلب نفسها — لا تُطلب مرتين.
  const buildAddress = () => deliveryMethod === 'shipping'
    ? {
        recipientName: form.name,
        recipientPhone: form.phone,
        city: form.city,
        shortAddress: form.shortAddress,
        district: form.district,
        street: form.street,
        buildingNumber: form.buildingNumber,
        postalCode: form.postalCode,
        notes: form.notes,
      }
    : null

  /** بعد إنشاء الطلب (والكوكي معه) نفتح صفحة ميسر مباشرة — لا خطوة «ادفعي» منفصلة. */
  const startPayment = async (): Promise<boolean> => {
    try {
      const { data } = await postJson<{ ok?: boolean; checkoutUrl?: string; error?: string }>('/api/fabric-store/payment/start/', {})
      if (data?.ok && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
        return true
      }
      setPayError(data?.error || 'تعذّر فتح صفحة الدفع الآن، أعيدي المحاولة')
    } catch {
      setPayError('انقطع الاتصال قبل فتح صفحة الدفع — أعيدي المحاولة')
    }
    return false
  }

  // الدفعة B: الطلب الإلكتروني حتى FABRIC_STORE_MAX_ORDER_LINES سطراً (السلة نفسها أكبر).
  const tooManyLines = requestLines.length > FABRIC_STORE_MAX_ORDER_LINES
  const canSubmit = Boolean(quote?.canCheckout && quote.totals && !tooManyLines && !isSubmitting && !isQuoting)
  const submitLabel = IS_FABRIC_STORE_PAYMENTS_ENABLED ? 'ادفعي الآن' : 'تأكيد الطلب'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !quote?.totals) return

    // نفس قواعد الخادم قبل الإرسال، برسالة تسمّي الحقل الناقص بالضبط.
    const address = buildAddress()
    const checked = fabricCheckoutFormSchema.safeParse({
      customer: { name: form.name, phone: form.phone, email: form.email },
      address,
    })
    if (!checked.success) {
      setSubmitError(describeFabricCheckoutIssue(checked.error.issues))
      return
    }
    if (!form.acceptPolicies) {
      setSubmitError('ضعي علامة الموافقة على شروط البيع وسياسة الاسترجاع والخصوصية')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setPayError(null)
    const checkoutKey = retryKey.current ?? crypto.randomUUID()
    retryKey.current = checkoutKey
    try {
      const { status, data } = await postJson<FabricCheckoutSuccess | FabricCheckoutFailure>('/api/fabric-store/checkout/', {
        checkoutKey,
        lines: requestLines,
        deliveryMethod,
        customer: { name: form.name, phone: form.phone, email: form.email },
        address,
        acceptPolicies: form.acceptPolicies,
        marketingOptIn: form.marketingOptIn,
        expectedTotalHalalas: quote.totals.totalHalalas,
      })
      if (data?.ok) {
        clearDraft()
        if (IS_FABRIC_STORE_PAYMENTS_ENABLED && await startPayment()) return // تبقى حالة التحميل حتى تنتقل الصفحة
        setOrder(data.order)
        setIsSubmitting(false)
        return
      }
      // 5xx وانتظار القفل: المفتاح نفسه لإعادة المحاولة. غير ذلك: طلب جديد بمفتاح جديد.
      if (status < 500) retryKey.current = null
      setSubmitError(data?.error || 'تعذّر إنشاء الطلب الآن، أعيدي المحاولة')
      if (data && 'quote' in data && data.quote) setQuote(data.quote)
    } catch {
      setSubmitError(`انقطع الاتصال — اضغطي «${submitLabel}» مرة أخرى؛ لن يُكرَّر الطلب`)
    }
    setIsSubmitting(false)
  }

  if (!IS_FABRIC_CART_ENABLED || !IS_FABRIC_STORE_CHECKOUT_ENABLED) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf8f3] px-4 text-center">
        <div>
          <h1 className="mb-3 text-2xl font-bold text-[#211b19]">إتمام الطلب غير متاح حالياً</h1>
          <Link href="/fabrics/cart/" className="inline-flex items-center gap-2 text-[#6b1726] hover:text-[#2f0c14]">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <span>العودة إلى السلة</span>
          </Link>
        </div>
      </main>
    )
  }

  if (order) {
    return (
      <main className="min-h-screen bg-[#fbf8f3] px-4 py-10 text-[#211b19]">
        <div className="mx-auto max-w-lg rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[#6b1726]" aria-hidden="true" />
          <h1 className="mb-2 text-2xl font-bold text-[#6b1726]">تم تسجيل طلبك</h1>
          <p className="mb-4 text-sm text-[#211b19]/70">
            رقم الطلب <span dir="ltr" className="font-bold text-[#211b19]">{order.orderNumber}</span>
          </p>
          <p className="mb-2 text-lg font-bold">{sar(order.totalHalalas)}</p>
          <p className="mb-5 flex items-center justify-center gap-1.5 text-sm text-[#211b19]/75">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>أكملي الدفع قبل الساعة {riyadhTime(order.holdExpiresAt)}</span>
          </p>
          {IS_FABRIC_STORE_PAYMENTS_ENABLED ? (
            <div className="text-start">
              {payError && (
                <p role="alert" className="mb-3 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-sm font-semibold text-[#6b1726]">
                  {payError}
                </p>
              )}
              <FabricPayNowButton label="إعادة محاولة الدفع" />
              <p className="mt-2 text-xs text-[#211b19]/60">
                يُحجز القماش لكِ {FABRIC_STORE_PAYMENT_HOLD_MINUTES} دقيقة من لحظة الضغط على «ادفعي». قبل ذلك قد يُباع في المحل.
              </p>
            </div>
          ) : (
            // قبل اعتماد ميسر: مسار الشراء كاملاً ظاهر، والدفع نفسه «قريباً» ويُكمَل الطلب عبر واتساب.
            <div className="space-y-3 text-start">
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#d8c5ae]/60 px-6 py-3.5 font-bold text-[#211b19]/50"
              >
                <CreditCard className="h-5 w-5" aria-hidden="true" />
                <span>الدفع الإلكتروني — قريباً</span>
              </button>
              <p className="rounded-xl bg-[#b99a68]/20 px-4 py-3 text-sm font-semibold text-[#2f0c14]">
                الدفع بالبطاقة (مدى، Visa، Mastercard) يُفعَّل قريباً. لإتمام طلبك الآن أرسلي رقم الطلب عبر واتساب، ولم يُحصَّل منكِ أي مبلغ. القماش لا يُحجز قبل الدفع.
              </p>
              <a
                href={`https://wa.me/${FABRIC_STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(`مرحباً، أود إتمام طلبي من متجر الأقمشة رقم ${order.orderNumber}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6b1726] px-6 py-3.5 font-bold text-[#f6f0e8] shadow-lg transition-all duration-300 hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                <span>إتمام الطلب عبر واتساب</span>
              </a>
            </div>
          )}
          <Link href="/fabrics/" className="mt-6 inline-block text-sm font-semibold text-[#6b1726] hover:text-[#2f0c14]">
            العودة إلى متجر الأقمشة
          </Link>
        </div>
      </main>
    )
  }

  const shipping = deliveryMethod === 'shipping'
  const inputClass =
    'w-full rounded-xl border-2 border-[#d8c5ae] bg-white px-3 py-2.5 text-sm text-[#211b19] focus:border-[#6b1726] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]'

  return (
    <main className="min-h-screen bg-[#fbf8f3] pt-4 text-[#211b19] lg:pt-8">
      <div className="container mx-auto px-4 py-4 pb-16 sm:px-6 lg:px-8">
        <Link
          href={buyNowLine ? `/fabrics/${buyNowLine.fabricId}` : '/fabrics/cart/'}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6b1726] hover:text-[#2f0c14] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <span>{buyNowLine ? 'العودة إلى القماش' : 'العودة إلى السلة'}</span>
        </Link>
        <h1 className="mb-6 mt-4 text-2xl font-bold text-[#6b1726] sm:text-3xl">إتمام الطلب</h1>
        {!IS_FABRIC_STORE_PAYMENTS_ENABLED && (
          <p role="status" className="mb-6 flex items-start gap-2 rounded-xl border-2 border-[#b99a68]/60 bg-[#b99a68]/15 px-4 py-3 text-sm font-semibold text-[#2f0c14]">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#6b1726]" aria-hidden="true" />
            <span>الدفع الإلكتروني بالبطاقة قريباً. يمكنكِ الآن تسجيل طلبك وحجز القماش، ثم إتمامه معنا عبر واتساب.</span>
          </p>
        )}

        {isSourceReady && requestLines.length === 0 && (
          <p className="rounded-xl bg-[#f6f0e8] px-4 py-6 text-center">
            سلتك فارغة. <Link href="/fabrics/" className="font-semibold text-[#6b1726]">تصفّحي الأقمشة</Link>
          </p>
        )}

        {requestLines.length > 0 && (
          <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start" noValidate>
            <div className="space-y-6">
              <fieldset className="rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-4 sm:p-5">
                <legend className="px-1 text-lg font-bold">طريقة الاستلام</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {Object.values(FABRIC_DELIVERY_OPTIONS).map(option => (
                    <label
                      key={option.method}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${
                        deliveryMethod === option.method ? 'border-[#6b1726] bg-white' : 'border-[#d8c5ae]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="delivery"
                        value={option.method}
                        checked={deliveryMethod === option.method}
                        onChange={() => { retryKey.current = null; setSubmitError(null); setDeliveryMethod(option.method) }}
                        className="mt-1 accent-[#6b1726]"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 font-semibold">
                          {option.method === 'pickup'
                            ? <Store className="h-4 w-4" aria-hidden="true" />
                            : <Truck className="h-4 w-4" aria-hidden="true" />}
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs text-[#211b19]/65">{option.description}</span>
                        <span className="mt-1 block text-xs font-semibold text-[#6b1726]">
                          {option.shippingGrossHalalas ? `${sar(option.shippingGrossHalalas)} شامل الضريبة` : 'بلا رسوم'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-4 sm:p-5">
                <legend className="px-1 text-lg font-bold">بياناتك</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    الاسم
                    <input className={`${inputClass} mt-1`} value={form.name} autoComplete="name" maxLength={120}
                      onChange={event => update('name', event.target.value)} required />
                  </label>
                  <label className="text-sm font-semibold">
                    رقم الجوال
                    <input className={`${inputClass} mt-1`} value={form.phone} dir="ltr" inputMode="tel" autoComplete="tel"
                      placeholder="05xxxxxxxx" maxLength={20} onChange={event => update('phone', event.target.value)} required />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    البريد الإلكتروني <span className="font-normal text-[#211b19]/55">(اختياري)</span>
                    <input className={`${inputClass} mt-1`} value={form.email} dir="ltr" type="email" autoComplete="email"
                      maxLength={254} onChange={event => update('email', event.target.value)} />
                  </label>
                </div>
              </fieldset>

              {shipping && (
                <fieldset className="rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-4 sm:p-5">
                  <legend className="px-1 text-lg font-bold">عنوان الشحن</legend>
                  <p className="mb-3 text-xs text-[#211b19]/65">
                    اكتبي العنوان المختصر من «العنوان الوطني» (مثل RRRD2929)، أو الحي والشارع.
                    يُسلَّم الطلب باسمك ورقم جوالك المكتوبين أعلاه.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      المدينة
                      <input className={`${inputClass} mt-1`} value={form.city} autoComplete="address-level2" maxLength={60}
                        onChange={event => update('city', event.target.value)} required />
                    </label>
                    <label className="text-sm font-semibold">
                      العنوان المختصر
                      <input className={`${inputClass} mt-1`} value={form.shortAddress} dir="ltr" maxLength={8}
                        placeholder="ABCD1234" onChange={event => update('shortAddress', event.target.value)} />
                    </label>
                    <label className="text-sm font-semibold">
                      الحي
                      <input className={`${inputClass} mt-1`} value={form.district} maxLength={80}
                        onChange={event => update('district', event.target.value)} />
                    </label>
                    <label className="text-sm font-semibold">
                      الشارع
                      <input className={`${inputClass} mt-1`} value={form.street} maxLength={120}
                        onChange={event => update('street', event.target.value)} />
                    </label>
                    <label className="text-sm font-semibold">
                      رقم المبنى <span className="font-normal text-[#211b19]/55">(4 أرقام)</span>
                      <input className={`${inputClass} mt-1`} value={form.buildingNumber} dir="ltr" inputMode="numeric" maxLength={4}
                        onChange={event => update('buildingNumber', event.target.value)} />
                    </label>
                    <label className="text-sm font-semibold">
                      الرمز البريدي <span className="font-normal text-[#211b19]/55">(5 أرقام)</span>
                      <input className={`${inputClass} mt-1`} value={form.postalCode} dir="ltr" inputMode="numeric" maxLength={5}
                        onChange={event => update('postalCode', event.target.value)} />
                    </label>
                    <label className="text-sm font-semibold sm:col-span-2">
                      ملاحظات للتوصيل <span className="font-normal text-[#211b19]/55">(اختياري)</span>
                      <textarea className={`${inputClass} mt-1`} value={form.notes} rows={2} maxLength={300}
                        onChange={event => update('notes', event.target.value)} />
                    </label>
                  </div>
                </fieldset>
              )}
            </div>

            <aside className="rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-4 sm:p-5 lg:sticky lg:top-8">
              <h2 className="mb-3 text-lg font-bold">ملخّص الطلب</h2>

              {quoteError && (
                <div role="alert" className="mb-3 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-sm font-semibold text-[#6b1726]">
                  <p>{quoteError}</p>
                  <button type="button" onClick={() => void loadQuote()} className="mt-1 underline">إعادة المحاولة</button>
                </div>
              )}

              {!quote && !quoteError && (
                <p className="flex items-center gap-2 text-sm text-[#211b19]/60">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> جاري حساب السعر...
                </p>
              )}

              {quote && (
                <>
                  <ul className="mb-3 space-y-2 text-sm">
                    {quote.lines.map(line => {
                      const requested = requestLines.find(item => item.fabricId === line.fabricId)
                      return (
                        <li key={line.fabricId} className="flex items-start justify-between gap-3">
                          <span>
                            <span className="font-semibold">{line.label ?? labels.get(line.fabricId) ?? 'قماش'}</span>
                            {requested && (
                              <span className="block text-xs text-[#211b19]/60">
                                {formatQuantityLabel(requested.quantity, requested.purchaseMode)}
                              </span>
                            )}
                            {line.status !== 'ok' && (
                              <span className="block text-xs font-semibold text-[#6b1726]">
                                {FABRIC_LINE_STATUS_MESSAGES[line.status]}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-left font-semibold">
                            {line.netHalalas != null ? <>{sar(line.netHalalas)}<span className="block text-xs font-normal text-[#211b19]/60">قبل الضريبة</span></> : '—'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {quote.totals && (
                    <dl className="space-y-1.5 border-t-2 border-[#d8c5ae] pt-3 text-sm">
                      <div className="flex justify-between"><dt className="text-[#211b19]/70">الأقمشة شاملة الضريبة</dt><dd>{sar(quote.totals.totalHalalas - quote.totals.shippingGrossHalalas)}</dd></div>
                      {shipping && (
                        <div className="flex justify-between"><dt className="text-[#211b19]/70">الشحن شامل الضريبة</dt><dd>{sar(quote.totals.shippingGrossHalalas)}</dd></div>
                      )}
                      <div className="flex justify-between"><dt className="text-[#211b19]/70">الضريبة المضمّنة في الإجمالي (15%)</dt><dd>{sar(quote.totals.vatHalalas)}</dd></div>
                      <div className="flex justify-between border-t-2 border-[#d8c5ae] pt-2 text-base font-bold">
                        <dt>الإجمالي</dt><dd className="text-[#6b1726]">{sar(quote.totals.totalHalalas)}</dd>
                      </div>
                    </dl>
                  )}

                  {!quote.canCheckout && (
                    <p role="status" className="mt-3 flex items-start gap-1.5 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-xs font-semibold text-[#6b1726]">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {quote.overOrderCap
                          ? 'مبلغ الطلب أكبر من الحد المسموح للطلب الإلكتروني الواحد — تواصلي معنا.'
                          : isBuyNow
                            ? 'هذا القماش أو كميته غير متاحة الآن — عودي لصفحة القماش وعدّلي الكمية.'
                            : 'بعض عناصر السلة تحتاج مراجعة قبل إتمام الطلب. عدّليها من السلة.'}
                      </span>
                    </p>
                  )}
                </>
              )}

              <label className="mt-4 flex items-start gap-2 text-xs leading-relaxed">
                <input type="checkbox" checked={form.acceptPolicies} className="mt-0.5 accent-[#6b1726]"
                  onChange={event => update('acceptPolicies', event.target.checked)} />
                {/* الإصدارات المحفوظة مع الطلب: FABRIC_STORE_POLICY_VERSIONS؛ المضمون في store-legal.ts */}
                <span>
                  أوافق على{' '}
                  <Link href="/sales-terms" target="_blank" className="font-semibold text-[#6b1726] underline">شروط البيع</Link> و
                  <Link href="/return-policy" target="_blank" className="font-semibold text-[#6b1726] underline">سياسة الاسترجاع والاستبدال</Link> و
                  <Link href="/privacy-policy" target="_blank" className="font-semibold text-[#6b1726] underline">سياسة الخصوصية</Link>.
                  {' '}القماش المقصوص بالمتر لا يُسترجع إلا لعيب أو خطأ منّا.
                </span>
              </label>
              <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-[#211b19]/75">
                <input type="checkbox" checked={form.marketingOptIn} className="mt-0.5 accent-[#6b1726]"
                  onChange={event => update('marketingOptIn', event.target.checked)} />
                <span>أرغب في تلقي عروض ياسمين الشام (اختياري)</span>
              </label>

              {tooManyLines && (
                <p role="alert" className="mt-3 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-sm font-semibold text-[#6b1726]">
                  الطلب الإلكتروني يصل إلى {FABRIC_STORE_MAX_ORDER_LINES} أقمشة — احذفي من السلة ما يزيد، أو تواصلي مع المحل للكميات الأكبر.
                </p>
              )}
              {submitError && (
                <p role="alert" className="mt-3 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-sm font-semibold text-[#6b1726]">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] ${
                  canSubmit ? 'bg-[#6b1726] text-[#f6f0e8] shadow-lg hover:bg-[#2f0c14]' : 'cursor-not-allowed bg-[#d8c5ae]/60 text-[#211b19]/40'
                }`}
              >
                {isSubmitting
                  ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  : IS_FABRIC_STORE_PAYMENTS_ENABLED
                    ? <CreditCard className="h-5 w-5" aria-hidden="true" />
                    : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
                <span>{isSubmitting ? (IS_FABRIC_STORE_PAYMENTS_ENABLED ? 'جاري فتح صفحة الدفع...' : 'جاري تسجيل الطلب...') : submitLabel}</span>
              </button>
              <p className="mt-3 text-xs leading-relaxed text-[#211b19]/65">
                {IS_FABRIC_STORE_PAYMENTS_ENABLED
                  ? `تنتقلين مباشرة لصفحة ميسر الآمنة، ويُحجز القماش لكِ ${FABRIC_STORE_PAYMENT_HOLD_MINUTES} دقيقة لإتمام الدفع. بيانات بطاقتك لا تمر بموقعنا.`
                  : `بعد التأكيد لديكِ ${FABRIC_STORE_HOLD_MINUTES} دقيقة لإتمام الطلب معنا.`}
              </p>
            </aside>
          </form>
        )}
      </div>
    </main>
  )
}
