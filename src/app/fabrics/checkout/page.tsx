'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck, Store, Truck } from 'lucide-react'
import { IS_FABRIC_CART_ENABLED, formatQuantityLabel } from '@/lib/fabric-commerce'
import {
  FABRIC_DELIVERY_OPTIONS,
  FABRIC_LINE_STATUS_MESSAGES,
  FABRIC_STORE_HOLD_MINUTES,
  IS_FABRIC_STORE_CHECKOUT_ENABLED,
  IS_FABRIC_STORE_PAYMENTS_ENABLED,
  type FabricCheckoutFailure,
  type FabricCheckoutSuccess,
  type FabricDeliveryMethod,
  type FabricOrderSummary,
  type FabricQuoteResponse,
} from '@/lib/fabric-store/checkout-contract'
import FabricPayNowButton from '@/components/fabrics/FabricPayNowButton'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { useFabricCartStore } from '@/store/fabricCartStore'

/**
 * صفحة إتمام الطلب — المرحلة 4 من خطة الدفع: إنشاء الطلب وحجز القماش **بلا دفع**.
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
  recipientName: string
  recipientPhone: string
  city: string
  shortAddress: string
  district: string
  street: string
  buildingNumber: string
  postalCode: string
  additionalNumber: string
  notes: string
  acceptPolicies: boolean
  marketingOptIn: boolean
}

const EMPTY_FORM: FormState = {
  name: '', phone: '', email: '', recipientName: '', recipientPhone: '', city: '', shortAddress: '',
  district: '', street: '', buildingNumber: '', postalCode: '', additionalNumber: '', notes: '',
  acceptPolicies: false, marketingOptIn: false,
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
  const cartLines = useFabricCartStore(state => state.lines)
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

  const requestLines = useMemo(
    () => cartLines.map(line => ({ fabricId: line.fabricId, purchaseMode: line.purchaseMode, quantity: line.quantity })),
    [cartLines]
  )
  const labels = useMemo(() => new Map(cartLines.map(line => [line.fabricId, line])), [cartLines])

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
    if (!hasHydrated || order) return
    retryKey.current = null
    void loadQuote()
  }, [hasHydrated, loadQuote, order])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    retryKey.current = null
    setForm(previous => ({ ...previous, [key]: value }))
  }

  const canSubmit = Boolean(quote?.canCheckout && quote.totals && form.acceptPolicies && !isSubmitting && !isQuoting)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !quote?.totals) return
    setIsSubmitting(true)
    setSubmitError(null)
    const checkoutKey = retryKey.current ?? crypto.randomUUID()
    retryKey.current = checkoutKey
    const shipping = deliveryMethod === 'shipping'
    try {
      const { status, data } = await postJson<FabricCheckoutSuccess | FabricCheckoutFailure>('/api/fabric-store/checkout/', {
        checkoutKey,
        lines: requestLines,
        deliveryMethod,
        customer: { name: form.name, phone: form.phone, email: form.email },
        address: shipping
          ? {
              recipientName: form.recipientName || form.name,
              recipientPhone: form.recipientPhone || form.phone,
              city: form.city,
              shortAddress: form.shortAddress,
              district: form.district,
              street: form.street,
              buildingNumber: form.buildingNumber,
              postalCode: form.postalCode,
              additionalNumber: form.additionalNumber,
              notes: form.notes,
            }
          : null,
        acceptPolicies: form.acceptPolicies,
        marketingOptIn: form.marketingOptIn,
        expectedTotalHalalas: quote.totals.totalHalalas,
      })
      if (data?.ok) {
        setOrder(data.order)
        return
      }
      // 5xx وانتظار القفل: المفتاح نفسه لإعادة المحاولة. غير ذلك: طلب جديد بمفتاح جديد.
      if (status < 500) retryKey.current = null
      setSubmitError(data?.error || 'تعذّر إنشاء الطلب الآن، أعيدي المحاولة')
      if (data && 'quote' in data && data.quote) setQuote(data.quote)
    } catch {
      setSubmitError('انقطع الاتصال — اضغطي «تأكيد الطلب» مرة أخرى؛ لن يُكرَّر الطلب')
    } finally {
      setIsSubmitting(false)
    }
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
            <span>القماش محجوز لكِ حتى الساعة {riyadhTime(order.holdExpiresAt)}</span>
          </p>
          {IS_FABRIC_STORE_PAYMENTS_ENABLED ? (
            <div className="text-start">
              <FabricPayNowButton />
              <p className="mt-2 text-xs text-[#211b19]/60">إن لم يكتمل الدفع قبل انتهاء الحجز يعود القماش للبيع تلقائياً.</p>
            </div>
          ) : (
            <p className="rounded-xl bg-[#b99a68]/20 px-4 py-3 text-sm font-semibold text-[#2f0c14]">
              الدفع الإلكتروني لم يُفعَّل بعد — هذه مرحلة تجريبية، ولن يُحصَّل أي مبلغ. إن لم يكتمل الدفع يعود القماش للبيع تلقائياً.
            </p>
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
          href="/fabrics/cart/"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6b1726] hover:text-[#2f0c14] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <span>العودة إلى السلة</span>
        </Link>
        <h1 className="mb-6 mt-4 text-2xl font-bold text-[#6b1726] sm:text-3xl">إتمام الطلب</h1>

        {hasHydrated && cartLines.length === 0 && (
          <p className="rounded-xl bg-[#f6f0e8] px-4 py-6 text-center">
            سلتك فارغة. <Link href="/fabrics/" className="font-semibold text-[#6b1726]">تصفّحي الأقمشة</Link>
          </p>
        )}

        {cartLines.length > 0 && (
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
                        onChange={() => { retryKey.current = null; setDeliveryMethod(option.method) }}
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
                          {option.shippingNetHalalas ? `${sar(option.shippingNetHalalas)} + الضريبة` : 'بلا رسوم'}
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
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      اسم المستلمة <span className="font-normal text-[#211b19]/55">(إن اختلف)</span>
                      <input className={`${inputClass} mt-1`} value={form.recipientName} maxLength={120}
                        onChange={event => update('recipientName', event.target.value)} />
                    </label>
                    <label className="text-sm font-semibold">
                      جوال المستلمة <span className="font-normal text-[#211b19]/55">(إن اختلف)</span>
                      <input className={`${inputClass} mt-1`} value={form.recipientPhone} dir="ltr" inputMode="tel" maxLength={20}
                        onChange={event => update('recipientPhone', event.target.value)} />
                    </label>
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
                    <label className="text-sm font-semibold">
                      الرقم الإضافي <span className="font-normal text-[#211b19]/55">(4 أرقام)</span>
                      <input className={`${inputClass} mt-1`} value={form.additionalNumber} dir="ltr" inputMode="numeric" maxLength={4}
                        onChange={event => update('additionalNumber', event.target.value)} />
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
                      const cartLine = labels.get(line.fabricId)
                      return (
                        <li key={line.fabricId} className="flex items-start justify-between gap-3">
                          <span>
                            <span className="font-semibold">{line.label ?? cartLine?.snapshot?.label ?? 'قماش'}</span>
                            {cartLine && (
                              <span className="block text-xs text-[#211b19]/60">
                                {formatQuantityLabel(cartLine.quantity, cartLine.purchaseMode)}
                              </span>
                            )}
                            {line.status !== 'ok' && (
                              <span className="block text-xs font-semibold text-[#6b1726]">
                                {FABRIC_LINE_STATUS_MESSAGES[line.status]}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-semibold">{line.netHalalas != null ? sar(line.netHalalas) : '—'}</span>
                        </li>
                      )
                    })}
                  </ul>

                  {quote.totals && (
                    <dl className="space-y-1.5 border-t-2 border-[#d8c5ae] pt-3 text-sm">
                      <div className="flex justify-between"><dt className="text-[#211b19]/70">الأقمشة قبل الضريبة</dt><dd>{sar(quote.totals.itemsNetHalalas)}</dd></div>
                      {shipping && (
                        <div className="flex justify-between"><dt className="text-[#211b19]/70">الشحن قبل الضريبة</dt><dd>{sar(quote.totals.shippingNetHalalas)}</dd></div>
                      )}
                      <div className="flex justify-between"><dt className="text-[#211b19]/70">ضريبة القيمة المضافة (15%)</dt><dd>{sar(quote.totals.vatHalalas)}</dd></div>
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
                          : 'بعض عناصر السلة تحتاج مراجعة قبل إتمام الطلب. عدّليها من السلة.'}
                      </span>
                    </p>
                  )}
                </>
              )}

              <label className="mt-4 flex items-start gap-2 text-xs leading-relaxed">
                <input type="checkbox" checked={form.acceptPolicies} className="mt-0.5 accent-[#6b1726]"
                  onChange={event => update('acceptPolicies', event.target.checked)} />
                {/* نص السياسات نفسه يُعتمد ويُنشر في المرحلة 10 قبل الإطلاق؛ لا يُكتب هنا ما لم يقرره المالك. */}
                <span>أوافق على شروط البيع وسياسة الاسترجاع وسياسة الخصوصية.</span>
              </label>
              <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-[#211b19]/75">
                <input type="checkbox" checked={form.marketingOptIn} className="mt-0.5 accent-[#6b1726]"
                  onChange={event => update('marketingOptIn', event.target.checked)} />
                <span>أرغب في تلقي عروض ياسمين الشام (اختياري)</span>
              </label>

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
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
                <span>{isSubmitting ? 'جاري تسجيل الطلب...' : 'تأكيد الطلب وحجز القماش'}</span>
              </button>
              <p className="mt-3 text-xs leading-relaxed text-[#211b19]/65">
                يُحجز القماش لكِ {FABRIC_STORE_HOLD_MINUTES} دقيقة لإتمام الدفع، ثم يعود للبيع إن لم يكتمل.
              </p>
            </aside>
          </form>
        )}
      </div>
    </main>
  )
}
