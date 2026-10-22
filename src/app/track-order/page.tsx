'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Package, Clock, CheckCircle, AlertCircle, Phone, MessageSquare, Ruler, Scissors, CalendarDays, ArrowRight } from 'lucide-react'
import { useOrderStore } from '@/store/orderStore'
import { formatGregorianDate, shiftDate } from '@/lib/date-utils'
import NumericInput from '@/components/NumericInput'
import SiteHeader from '@/components/SiteHeader'
import { homeDisplay, homeSans } from '@/components/home/home-fonts'
import { useTranslation } from '@/hooks/useTranslation'

const EXCLUDED_KEYS = [
  'image_annotations', 'image_drawings', 'custom_design_image', 'saved_design_comments',
  'cartoon_image', 'ai_generated_images', 'design_thumbnail', 'design_summary_notes',
  // أعلام نُقلت لأعمدة مستقلة (migration 29) - تُبقى للتوافق مع البيانات القديمة
  'is_printed', 'has_measurements', 'whatsapp_sent', 'needs_review', 'is_pre_booking', 'fabric_type'
]

// ألوان الهوية الجديدة (نفس متغيرات home.module.css)
const display = 'font-[family-name:var(--font-home-display)]'
const card = 'rounded-3xl border border-[#d8c5ae] bg-white shadow-[0_18px_50px_-30px_rgba(47,12,20,0.35)]'
const field = 'rounded-2xl bg-[#fbf8f3] p-3.5'
const fieldLabel = 'mb-1 block text-xs text-[#211b19]/55'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-white'

interface OrderInfo {
  order_number: string
  client_name: string
  client_phone: string
  order_date: string
  due_date: string
  customer_due_date?: string | null  // التاريخ الحقيقي للزبون (migration 49)
  proof_delivery_date?: string
  has_second_proof?: boolean
  second_proof_date?: string | null
  first_proof_review_status?: 'pending' | 'passed' | 'failed'
  second_proof_review_status?: 'pending' | 'passed' | 'failed'
  final_review_status?: 'pending' | 'passed' | 'failed'
  status: string
  admin_confirmed?: boolean
  measurements?: Record<string, unknown>
}

// قسم «مراحل جاهزية الطلب» مخفي حالياً عن الزبونة — غيّره إلى true لإظهاره.
const SHOW_READINESS_STAGES = false

export default function TrackOrderPage() {
  const { isArabic } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchType, setSearchType] = useState<'order' | 'phone'>('order')
  const [ordersData, setOrdersData] = useState<OrderInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const { loadOrderByNumber, loadOrdersByPhone } = useOrderStore()

  const toOrderInfo = (order: any): OrderInfo => ({
    order_number: order.order_number,
    client_name: order.client_name,
    client_phone: order.client_phone,
    order_date: order.created_at,
    due_date: order.due_date,
    customer_due_date: order.customer_due_date,
    proof_delivery_date: order.proof_delivery_date,
    has_second_proof: order.has_second_proof,
    second_proof_date: order.second_proof_date,
    first_proof_review_status: order.first_proof_review_status,
    second_proof_review_status: order.second_proof_review_status,
    final_review_status: order.final_review_status,
    status: order.status,
    admin_confirmed: order.admin_confirmed,
    measurements: order.measurements
  })

  const scrollToResults = () => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
  }

  const performSearch = async (term: string, type: 'order' | 'phone') => {
    const trimmedTerm = term.trim()

    if (!trimmedTerm) {
      setError(type === 'order' ? 'يرجى إدخال رقم الطلب' : 'يرجى إدخال رقم الهاتف')
      return
    }

    setIsLoading(true)
    setError(null)
    setOrdersData([])

    try {
      if (type === 'order') {
        await loadOrderByNumber(trimmedTerm)
        const state = useOrderStore.getState()

        if (state.error || !state.currentOrder) {
          setError('لم يتم العثور على طلب بهذا الرقم. يرجى التأكد من رقم الطلب والمحاولة مرة أخرى.')
        } else {
          setOrdersData([toOrderInfo(state.currentOrder)])
          scrollToResults()
        }
      } else {
        await loadOrdersByPhone(trimmedTerm)
        const state = useOrderStore.getState()

        if (state.error || !state.orders || state.orders.length === 0) {
          setError('لم يتم العثور على طلبات مرتبطة بهذا الرقم. يرجى التأكد من رقم الهاتف والمحاولة مرة أخرى.')
        } else {
          // جلب التفاصيل الكاملة لكل طلب بما فيها المقاسات
          const results: OrderInfo[] = []
          for (const order of state.orders) {
            await state.loadOrderById(order.id)
            const fullState = useOrderStore.getState()
            if (fullState.currentOrder && fullState.currentOrder.id === order.id) {
              results.push(toOrderInfo(fullState.currentOrder))
            } else {
              results.push(toOrderInfo(order))
            }
          }
          setOrdersData(results)
          scrollToResults()
        }
      }
    } catch (err) {
      console.error('❌ Error searching:', err)
      setError('حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    await performSearch(searchTerm, searchType)
  }

  // عند فتح الصفحة عبر رابط يتضمّن رقم الطلب (مثل: /track-order/?order=2026-0001)
  // نعبّئ الحقل ونبدأ البحث تلقائياً
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderParam = params.get('order')
    if (orderParam && orderParam.trim()) {
      setSearchType('order')
      setSearchTerm(orderParam.trim())
      performSearch(orderParam.trim(), 'order')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getStatusInfo = (status: string, adminConfirmed?: boolean) => {
    const statusMap = {
      pending: { label: 'في الانتظار', chip: 'bg-[#d8c5ae]/40 text-[#2f0c14]', icon: Clock },
      assigned: { label: 'تم التعيين', chip: 'bg-[#b99a68]/20 text-[#7a5f33]', icon: Package },
      in_progress: { label: 'قيد التنفيذ', chip: 'bg-[#b99a68]/20 text-[#7a5f33]', icon: Scissors },
      completed: { label: 'مكتمل وجاهز للتسليم', chip: 'bg-[#6b1726] text-[#f6f0e8]', icon: CheckCircle },
      delivered: { label: 'تم التسليم', chip: 'bg-[#2f0c14] text-[#f6f0e8]', icon: CheckCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  const formatDate = (dateString: string) => {
    // ar-SA-u-nu-latn: أسماء الأشهر بالعربية مع أرقام لاتينية (إنجليزية)
    return formatGregorianDate(dateString, 'ar-SA-u-nu-latn', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getMeasurementNameInArabic = (key: string) => {
    const measurementNames: { [key: string]: string } = {
      'sh': 'الكتف',
      'shr': 'دوران الكتف',
      'ch': 'الصدر',
      'w': 'الخصر',
      'hi': 'الأرداف',
      'p': 'طول البنس',
      'L': 'طول الصدرية',
      'v': 'فتحة الصدر',
      'HF': 'الإبط',
      'K': 'طول الكم',
      'S': 'الزند',
      'S1': 'الإسوارة',
      'L_front': 'طول الأمام',
      'additional_notes': 'مقاسات إضافية',
      'shoulder': 'الكتف',
      'shoulderCircumference': 'دوران الكتف',
      'chest': 'الصدر',
      'waist': 'الخصر',
      'hips': 'الأرداف',
      'dartLength': 'طول البنس',
      'bodiceLength': 'طول الصدرية',
      'neckline': 'فتحة الصدر',
      'armpit': 'الإبط',
      'sleeveLength': 'طول الكم',
      'forearm': 'الزند',
      'cuff': 'الإسوارة',
      'frontLength': 'طول الأمام',
      'LB': 'طول الخلف',
      'backLength': 'طول الخلف',
    }
    return measurementNames[key] || key
  }

  const switchSearchType = (type: 'order' | 'phone') => {
    setSearchType(type)
    setSearchTerm('')
    setError(null)
  }

  const renderOrderCard = (orderData: OrderInfo, index: number, total: number) => {
    const statusInfo = getStatusInfo(orderData.status, orderData.admin_confirmed)
    const hasMeasurements = orderData.measurements &&
      Object.keys(orderData.measurements).some(key =>
        !EXCLUDED_KEYS.includes(key) &&
        orderData.measurements![key] !== null &&
        orderData.measurements![key] !== undefined &&
        orderData.measurements![key] !== ''
      )
    const readinessStages = [
      {
        key: 'first-proof',
        number: 1,
        status: orderData.first_proof_review_status,
        readyLabel: isArabic ? 'البروفا الأولى جاهزة' : 'First proof ready',
        pendingLabel: isArabic ? 'البروفا الأولى قيد التجهيز' : 'First proof in preparation',
      },
      ...(orderData.has_second_proof
        ? [{
            key: 'second-proof',
            number: 2,
            status: orderData.second_proof_review_status,
            readyLabel: isArabic ? 'البروفا الثانية جاهزة' : 'Second proof ready',
            pendingLabel: isArabic ? 'البروفا الثانية قيد التجهيز' : 'Second proof in preparation',
          }]
        : []),
      {
        key: 'final-dress',
        number: 3,
        status: orderData.final_review_status,
        readyLabel: isArabic ? 'الفستان جاهز للتسليم' : 'Dress ready for delivery',
        pendingLabel: isArabic ? 'الفستان قيد التجهيز' : 'Dress in preparation',
      },
    ]

    return (
      <div key={orderData.order_number || index} className="space-y-5">
        {/* عنوان الطلب عند وجود أكثر من طلب */}
        {total > 1 && (
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#b99a68] text-sm font-semibold text-[#6b1726]">
              {index + 1}
            </span>
            <h3 className={`${display} text-lg font-semibold text-[#2f0c14]`}>طلب {index + 1}</h3>
            <div className="h-px flex-1 bg-[#d8c5ae]"></div>
          </div>
        )}

        {/* معلومات الطلب */}
        <section className={`${card} overflow-hidden`}>
          {/* رأس البطاقة: رقم الطلب + الحالة */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#2f0c14] px-5 py-4 text-[#f6f0e8] sm:px-6">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-medium tracking-[0.12em] text-[#b99a68]">رقم الطلب</p>
              <p dir="ltr" className="text-right text-lg font-semibold">{orderData.order_number}</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
              orderData.status === 'completed' || orderData.status === 'delivered'
                ? 'bg-[#f6f0e8] text-[#6b1726]'
                : 'bg-[#f6f0e8]/10 text-[#f6f0e8] ring-1 ring-[#f6f0e8]/25'
            }`}>
              {React.createElement(statusInfo.icon, { className: 'h-4 w-4', 'aria-hidden': true })}
              {statusInfo.label}
            </span>
          </div>

          <div className="space-y-3 p-5 sm:p-6">
            {/* الاسم + رقم الهاتف أو رقم الطلب حسب طريقة البحث */}
            <div className="grid grid-cols-2 gap-3">
              <div className={field}>
                <span className={fieldLabel}>الاسم</span>
                <p className="truncate text-base font-semibold text-[#211b19]">{orderData.client_name}</p>
              </div>
              {searchType === 'order' ? (
                <div className={field}>
                  <span className={fieldLabel}>رقم الهاتف</span>
                  <p dir="ltr" className="text-right text-sm font-medium text-[#211b19]">{orderData.client_phone}</p>
                </div>
              ) : (
                <div className={field}>
                  <span className={fieldLabel}>رقم الطلب</span>
                  <p dir="ltr" className="text-right text-sm font-semibold text-[#6b1726]">{orderData.order_number}</p>
                </div>
              )}
            </div>

            {/* مواعيد البروفا */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`${field} ${!orderData.has_second_proof ? 'col-span-2' : ''}`}>
                <span className={fieldLabel}>{orderData.has_second_proof ? 'موعد البروفا الأولى' : 'موعد البروفا'}</span>
                <p className="text-sm font-medium text-[#211b19]">
                  {orderData.proof_delivery_date ? formatDate(orderData.proof_delivery_date) : '—'}
                </p>
              </div>
              {orderData.has_second_proof && orderData.due_date && (
                <div className={field}>
                  <span className={fieldLabel}>موعد البروفا الثانية</span>
                  <p className="text-sm font-medium text-[#211b19]">
                    {formatDate(orderData.second_proof_date || shiftDate(orderData.due_date, -1))}
                  </p>
                </div>
              )}
            </div>

            {/* موعد التسليم */}
            <div className="flex items-center gap-4 rounded-2xl border border-[#b99a68]/50 bg-[#f6f0e8] p-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#6b1726]">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[#211b19]/60">موعد التسليم</p>
                {/* للطلبات الجديدة: التاريخ الحقيقي للزبون من customer_due_date (migration 49).
                    للطلبات القديمة: نُبقي السلوك السابق (due_date + 2). */}
                <p className={`${display} text-xl font-semibold text-[#6b1726]`}>
                  {formatDate(orderData.customer_due_date || shiftDate(orderData.due_date, 2))}
                </p>
              </div>
            </div>

            {orderData.status === 'completed' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-start gap-3 rounded-2xl bg-[#6b1726] p-4 text-[#f6f0e8]"
              >
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#d8c5ae]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">الطلب مكتمل وجاهز للتسليم</p>
                  <p className="mt-0.5 text-xs text-[#f6f0e8]/80">
                    يرجى إحضار المتبقي من الحساب كاش
                  </p>
                </div>
              </motion.div>
            )}

            {/* مراحل فحص الجاهزية الجديدة؛ حالة الطلب الأصلية أعلاه تبقى كما هي. */}
            {SHOW_READINESS_STAGES && (
            <div className="rounded-2xl border border-[#d8c5ae] bg-[#fbf8f3] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#2f0c14]">
                    {isArabic ? 'مراحل جاهزية الطلب' : 'Order readiness stages'}
                  </p>
                  <p className="mt-0.5 text-xs text-[#211b19]/60">
                    {isArabic ? 'تتحدث بعد مراجعة الورشة لكل مرحلة' : 'Updated after the workshop reviews each stage'}
                  </p>
                </div>
                <CheckCircle className="h-5 w-5 flex-none text-[#b99a68]" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                {readinessStages.map(readiness => {
                  const isReady = readiness.status === 'passed'
                  return (
                    <div
                      key={readiness.key}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                        isReady
                          ? 'border-[#6b1726]/25 bg-white text-[#6b1726]'
                          : 'border-[#d8c5ae] bg-white/60 text-[#211b19]/55'
                      }`}
                    >
                      <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                        isReady ? 'bg-[#6b1726] text-white' : 'bg-[#d8c5ae]/50 text-[#211b19]/70'
                      }`}>
                        {isReady ? <CheckCircle className="h-4 w-4" /> : readiness.number}
                      </span>
                      <span className="text-sm font-semibold">
                        {isReady ? readiness.readyLabel : readiness.pendingLabel}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            )}
          </div>
        </section>

        {/* المقاسات */}
        <section className={`${card} overflow-hidden`}>
          <div className="flex items-center gap-3 border-b border-[#d8c5ae]/70 px-5 py-4 sm:px-6">
            <Ruler className="h-5 w-5 text-[#b99a68]" aria-hidden="true" />
            <h3 className={`${display} text-xl font-semibold text-[#2f0c14]`}>المقاسات</h3>
            <span className="ms-auto text-xs text-[#211b19]/50">بالإنش</span>
          </div>

          {hasMeasurements ? (
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {Object.entries(orderData.measurements!)
                  .filter(([key]) => !EXCLUDED_KEYS.includes(key))
                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                  .map(([key, value]) => {
                    if (key === 'additional_notes') {
                      return (
                        <div key={key} className="col-span-3 rounded-2xl bg-[#fbf8f3] p-3.5 sm:col-span-4">
                          <span className={fieldLabel}>{getMeasurementNameInArabic(key)}</span>
                          <p className="whitespace-pre-wrap text-sm font-medium text-[#211b19]">{String(value)}</p>
                        </div>
                      )
                    }
                    return (
                      <div key={key} className="rounded-2xl bg-[#fbf8f3] px-2 py-3 text-center">
                        <span className="mb-1 block text-xs text-[#211b19]/55">{getMeasurementNameInArabic(key)}</span>
                        <span className="text-lg font-semibold text-[#6b1726]">{String(value)}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-base text-[#211b19]/60">لا توجد مقاسات مسجلة لهذا الطلب حتى الآن</p>
            </div>
          )}
        </section>

        {/* أحدث تصاميم ياسمين الشام */}
        <section className="rounded-3xl bg-[#2f0c14] px-6 py-8 text-center text-[#f6f0e8]">
          <p className="text-[0.7rem] font-medium tracking-[0.12em] text-[#b99a68]">ياسمين الشام</p>
          <h3 className={`${display} mt-1 text-2xl font-semibold`}>
            اطّلعي على أحدث تصاميمنا
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[#f6f0e8]/75">
            تابعينا على تيك توك لمشاهدة آخر التصاميم والإطلالات الجديدة
          </p>
          <a
            href="https://www.tiktok.com/@yasminalshamtextile"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#f6f0e8] px-6 py-3 font-semibold text-[#2f0c14] transition-colors duration-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2f0c14]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.22 8.22 0 0 0 4.79 1.53V4.56a4.85 4.85 0 0 1-1.02-.12z" />
            </svg>
            <span>تابعينا على تيك توك</span>
          </a>
        </section>
      </div>
    )
  }

  return (
    <div className={`${homeSans.variable} ${homeDisplay.variable} min-h-screen bg-[#fbf8f3] font-[family-name:var(--font-home-sans)] text-[#211b19]`}>
      <SiteHeader tone="wine" />
      <main className="pb-20 pt-28 sm:pt-32">
        <div className="mx-auto w-[min(100%-32px,640px)]">

          {/* العنوان - يختفي بعد ظهور النتائج */}
          {ordersData.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="mb-10 text-center"
            >
              <p className="text-xs font-semibold tracking-[0.14em] text-[#b99a68]">تفصيل ياسمين الشام</p>
              <h1 className={`${display} mt-2 text-4xl font-semibold leading-tight text-[#6b1726] sm:text-5xl`}>
                استعلام عن الطلب
              </h1>
              <div className="mx-auto mt-4 h-px w-16 bg-[#b99a68]" aria-hidden="true" />
              <p className="mx-auto mt-4 max-w-md leading-relaxed text-[#211b19]/70">
                تابعي حالة طلبك في أي وقت. أدخلي رقم الطلب لمعرفة مرحلة التفصيل والموعد المتوقع للتسليم
              </p>
            </motion.div>
          )}

          {/* نموذج البحث - يختفي بعد ظهور النتائج */}
          {ordersData.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className={`${card} mb-6 p-5 sm:p-7`}
            >
              <form onSubmit={handleSearch} className="space-y-5">
                {/* اختيار نوع البحث */}
                <div role="tablist" aria-label="طريقة البحث" className="grid grid-cols-2 gap-1 rounded-full bg-[#f6f0e8] p-1">
                  {([
                    { type: 'order', label: 'رقم الطلب', icon: Package },
                    { type: 'phone', label: 'رقم الهاتف', icon: Phone },
                  ] as const).map(option => {
                    const active = searchType === option.type
                    return (
                      <button
                        key={option.type}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => switchSearchType(option.type)}
                        className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-colors duration-200 ${focusRing} ${
                          active
                            ? 'bg-[#6b1726] text-[#f6f0e8] shadow-sm'
                            : 'text-[#211b19]/65 hover:text-[#6b1726]'
                        }`}
                      >
                        <option.icon className="h-4 w-4" aria-hidden="true" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>

                {/* حقل البحث */}
                <div>
                  <label htmlFor="track-search" className="mb-2 block text-sm font-medium text-[#211b19]/75">
                    {searchType === 'order' ? 'أدخلي رقم الطلب' : 'أدخلي رقم الهاتف'}
                  </label>
                  <div className="relative">
                    {searchType === 'phone' ? (
                      <NumericInput
                        id="track-search"
                        value={searchTerm}
                        onChange={setSearchTerm}
                        type="phone"
                        placeholder="مثال: 0512345678"
                        className="rounded-2xl! border-[#d8c5ae]! bg-[#fbf8f3]! px-12! py-3.5! text-center text-lg focus:border-[#6b1726]! focus:ring-[#b99a68]!"
                        disabled={isLoading}
                      />
                    ) : (
                      <input
                        id="track-search"
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-2xl border border-[#d8c5ae] bg-[#fbf8f3] px-12 py-3.5 text-center text-lg text-[#211b19] transition-colors duration-200 placeholder:text-[#211b19]/35 focus:border-[#6b1726] focus:outline-none focus:ring-2 focus:ring-[#b99a68]"
                        placeholder="مثال: 2026-0001"
                        disabled={isLoading}
                      />
                    )}
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#b99a68]" aria-hidden="true" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`flex w-full items-center justify-center gap-2 rounded-full bg-[#6b1726] py-3.5 text-base font-semibold text-[#f6f0e8] shadow-lg shadow-[#6b1726]/20 transition-colors duration-300 hover:bg-[#2f0c14] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
                >
                  {isLoading ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#f6f0e8] border-t-transparent" aria-hidden="true"></span>
                      <span>جاري البحث...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-5 w-5" aria-hidden="true" />
                      <span>البحث عن الطلب</span>
                    </>
                  )}
                </button>
              </form>

              {/* رسالة الخطأ */}
              {error && (
                <motion.div
                  role="alert"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex items-start gap-3 rounded-2xl bg-[#6b1726]/8 p-4 text-sm font-medium text-[#6b1726]"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* نتائج البحث */}
          {ordersData.length > 0 && (
            <motion.div
              ref={resultsRef}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="scroll-mt-28 space-y-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className={`${display} text-3xl font-semibold text-[#6b1726]`}>
                  {ordersData.length > 1 ? 'طلباتك' : 'طلبك'}
                </h1>
                {/* زر البحث عن طلب آخر */}
                <button
                  type="button"
                  onClick={() => {
                    setOrdersData([])
                    setSearchTerm('')
                    setError(null)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-[#6b1726]/30 px-4 py-2 text-sm font-semibold text-[#6b1726] transition-colors duration-200 hover:bg-white ${focusRing}`}
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  <span>بحث عن طلب آخر</span>
                </button>
              </div>

              {/* عدد النتائج عند وجود أكثر من طلب */}
              {ordersData.length > 1 && (
                <p className="-mt-5 text-sm text-[#211b19]/65">
                  تم العثور على <span className="font-semibold text-[#6b1726]">{ordersData.length}</span> طلبات مرتبطة بهذا الرقم
                </p>
              )}

              {ordersData.map((order, index) => renderOrderCard(order, index, ordersData.length))}
            </motion.div>
          )}

          {/* نصائح للاستخدام */}
          {ordersData.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="rounded-3xl border border-[#d8c5ae] bg-[#f6f0e8] p-5 sm:p-7"
            >
              <h3 className={`${display} mb-5 text-center text-xl font-semibold text-[#2f0c14]`}>
                كيفية العثور على رقم طلبك
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: MessageSquare,
                    title: 'رسالة التأكيد',
                    text: 'ستجدين رقم الطلب في رسالة التأكيد التي وصلتك عبر الواتساب أو الرسائل النصية',
                  },
                  {
                    icon: Phone,
                    title: 'باستخدام رقم الهاتف',
                    text: 'إذا لم تجدي رقم الطلب، يمكنك البحث باستخدام رقم هاتفك المسجل لدينا',
                  },
                ].map(tip => (
                  <div key={tip.title} className="flex items-start gap-3 rounded-2xl bg-white/70 p-4">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#b99a68]/60 text-[#6b1726]">
                      <tip.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h4 className="mb-1 font-semibold text-[#211b19]">{tip.title}</h4>
                      <p className="text-sm leading-relaxed text-[#211b19]/65">{tip.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
