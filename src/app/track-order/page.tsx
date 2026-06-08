'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Package, Clock, CheckCircle, AlertCircle, Phone, MessageSquare } from 'lucide-react'
import { useOrderStore } from '@/store/orderStore'
import { formatGregorianDate, shiftDate } from '@/lib/date-utils'
import NumericInput from '@/components/NumericInput'
import Header from '@/components/Header'

const EXCLUDED_KEYS = [
  'image_annotations', 'image_drawings', 'custom_design_image', 'saved_design_comments',
  'cartoon_image', 'ai_generated_images', 'design_thumbnail', 'design_summary_notes',
  // أعلام نُقلت لأعمدة مستقلة (migration 29) - تُبقى للتوافق مع البيانات القديمة
  'is_printed', 'has_measurements', 'whatsapp_sent', 'needs_review', 'is_pre_booking', 'fabric_type'
]

interface OrderInfo {
  order_number: string
  client_name: string
  client_phone: string
  order_date: string
  due_date: string
  customer_due_date?: string | null  // التاريخ الحقيقي للزبون (migration 49)
  proof_delivery_date?: string
  has_second_proof?: boolean
  status: string
  admin_confirmed?: boolean
  measurements?: Record<string, unknown>
}

export default function TrackOrderPage() {
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
      pending: { label: 'في الانتظار', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
      assigned: { label: 'تم التعيين', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Package },
      in_progress: { label: 'قيد التنفيذ', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: Package },
      completed: { label: 'مكتمل وجاهز للتسليم', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
      delivered: { label: 'تم التسليم', color: 'text-green-700', bgColor: 'bg-green-200', icon: CheckCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  const formatDate = (dateString: string) => {
    return formatGregorianDate(dateString, 'ar-SA', {
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

  const renderOrderCard = (orderData: OrderInfo, index: number, total: number) => {
    const statusInfo = getStatusInfo(orderData.status, orderData.admin_confirmed)
    const hasMeasurements = orderData.measurements &&
      Object.keys(orderData.measurements).some(key =>
        !EXCLUDED_KEYS.includes(key) &&
        orderData.measurements![key] !== null &&
        orderData.measurements![key] !== undefined &&
        orderData.measurements![key] !== ''
      )

    return (
      <div key={orderData.order_number || index} className="space-y-4">
        {/* عنوان الطلب عند وجود أكثر من طلب */}
        {total > 1 && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              {index + 1}
            </div>
            <h3 className="text-base font-bold text-gray-700">طلب {index + 1}</h3>
            <div className="flex-1 h-px bg-pink-100"></div>
          </div>
        )}

        {/* معلومات الطلب */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden border border-pink-100 shadow-sm">
          <div className="px-6 py-4 flex items-center space-x-3 space-x-reverse border-b border-pink-100">
            <Package className="w-5 h-5 text-pink-500" />
            <h2 className="text-lg font-bold text-gray-800">معلومات الطلب</h2>
          </div>

          <div className="p-5 space-y-3">
            {/* السطر الأول: الاسم + موعد البروفا */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-xs text-gray-400 block mb-1">الاسم</span>
                <p className="text-base font-semibold text-gray-800 truncate">{orderData.client_name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-xs text-gray-400 block mb-1">{orderData.has_second_proof ? 'موعد البروفا الأولى' : 'موعد البروفا'}</span>
                <p className="text-sm font-medium text-gray-800">
                  {orderData.proof_delivery_date ? formatDate(orderData.proof_delivery_date) : '—'}
                </p>
              </div>
            </div>

            {/* موعد البروفا الثانية */}
            {orderData.has_second_proof && orderData.due_date && (
              <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-200">
                <span className="text-xs text-yellow-700 block mb-1">موعد البروفا الثانية</span>
                <p className="text-sm font-semibold text-yellow-800">
                  {formatDate(shiftDate(orderData.due_date, -1))}
                </p>
              </div>
            )}

            {/* السطر الثاني: رقم الهاتف أو رقم الطلب + تاريخ الطلب */}
            <div className="grid grid-cols-2 gap-3">
              {searchType === 'order' ? (
                <div className="bg-gray-50 rounded-xl p-3">
                  <span className="text-xs text-gray-400 block mb-1">رقم الهاتف</span>
                  <p className="text-sm font-medium text-gray-800 dir-ltr text-right">{orderData.client_phone}</p>
                </div>
              ) : (
                <div className="bg-pink-50 rounded-xl p-3">
                  <span className="text-xs text-pink-400 block mb-1">رقم الطلب</span>
                  <p className="text-sm font-bold text-pink-600">{orderData.order_number}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-xs text-gray-400 block mb-1">تاريخ الطلب</span>
                <p className="text-sm font-medium text-gray-800">{formatDate(orderData.order_date)}</p>
              </div>
            </div>

            {/* حالة الطلب */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full ${statusInfo.bgColor} flex items-center justify-center flex-shrink-0`}>
                    {React.createElement(statusInfo.icon, {
                      className: `w-5 h-5 ${statusInfo.color}`
                    })}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">حالة الطلب</p>
                    <p className={`text-base font-bold whitespace-nowrap ${statusInfo.color}`}>
                      {statusInfo.label}
                    </p>
                  </div>
                </div>
                <div className="text-left flex-shrink-0">
                  <p className="text-xs text-gray-500 whitespace-nowrap">موعد التسليم</p>
                  {/* للطلبات الجديدة: التاريخ الحقيقي للزبون من customer_due_date (migration 49).
                      للطلبات القديمة: نُبقي السلوك السابق (due_date + 2). */}
                  <p className="text-sm font-bold text-gray-800">{formatDate(orderData.customer_due_date || shiftDate(orderData.due_date, 2))}</p>
                </div>
              </div>

              {orderData.status === 'completed' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200"
                >
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800 text-sm">الطلب مكتمل وجاهز للتسليم</p>
                      <p className="text-xs text-green-700 mt-0.5">
                        يرجى إحضار المتبقي من الحساب كاش
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* المقاسات */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden border border-pink-100 shadow-sm">
          <div className="px-6 py-4 flex items-center space-x-3 space-x-reverse border-b border-pink-100">
            <Package className="w-5 h-5 text-pink-500" />
            <h3 className="text-lg font-bold text-gray-800">المقاسات</h3>
          </div>

          {hasMeasurements ? (
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(orderData.measurements!)
                  .filter(([key]) => !EXCLUDED_KEYS.includes(key))
                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                  .map(([key, value]) => {
                    if (key === 'additional_notes') {
                      return (
                        <div key={key} className="col-span-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="text-xs text-gray-500 block mb-1">{getMeasurementNameInArabic(key)}</span>
                          <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap">{String(value)}</p>
                        </div>
                      )
                    }
                    return (
                      <div key={key} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                        <span className="text-xs text-gray-500 block mb-1">{getMeasurementNameInArabic(key)}</span>
                        <span className="text-base font-semibold text-gray-800">{String(value)}</span>
                        <span className="text-xs text-gray-400 block">انش</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-base">لا توجد مقاسات مسجلة لهذا الطلب حتى الآن</p>
            </div>
          )}
        </div>

        {/* أحدث تصاميم ياسمين الشام */}
        <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-6 border border-pink-100 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-2 text-center">
            اطّلعي على أحدث تصاميم ياسمين الشام
          </h3>
          <p className="text-gray-500 text-sm text-center mb-4">
            تابعينا على تيك توك لمشاهدة آخر التصاميم والإطلالات الجديدة
          </p>
          <div className="flex justify-center">
            <a
              href="https://www.tiktok.com/@yasminalsham.fashion"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-black transition-colors duration-300"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.22 8.22 0 0 0 4.79 1.53V4.56a4.85 4.85 0 0 1-1.02-.12z" />
              </svg>
              <span>تابعينا على تيك توك</span>
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">

          {/* العنوان - يختفي بعد ظهور النتائج */}
          {ordersData.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-12"
            >
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                  استعلام عن الطلب
                </span>
              </h1>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                تابعي حالة طلبك في أي وقت. أدخلي رقم الطلب لمعرفة مرحلة التفصيل والموعد المتوقع للتسليم
              </p>
            </motion.div>
          )}

          <div className="max-w-4xl mx-auto">
            {/* نموذج البحث - يختفي بعد ظهور النتائج */}
            {ordersData.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100 mb-8"
            >
              <form onSubmit={handleSearch} className="space-y-6">
                {/* اختيار نوع البحث */}
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-4 text-center">
                    اختاري طريقة البحث
                  </label>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchType('order')
                        setSearchTerm('')
                        setError(null)
                      }}
                      className={`p-4 rounded-xl border-2 transition-all duration-300 ${searchType === 'order'
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-pink-300'
                        }`}
                    >
                      <Package className="w-6 h-6 mx-auto mb-2" />
                      <span className="font-medium">رقم الطلب</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchType('phone')
                        setSearchTerm('')
                        setError(null)
                      }}
                      className={`p-4 rounded-xl border-2 transition-all duration-300 ${searchType === 'phone'
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-pink-300'
                        }`}
                    >
                      <Phone className="w-6 h-6 mx-auto mb-2" />
                      <span className="font-medium">رقم الهاتف</span>
                    </button>
                  </div>
                </div>

                {/* حقل البحث */}
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-4 text-center">
                    {searchType === 'order' ? 'أدخلي رقم الطلب' : 'أدخلي رقم الهاتف'}
                  </label>
                  <div className="relative">
                    {searchType === 'phone' ? (
                      <NumericInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        type="phone"
                        placeholder="مثال: 0512345678"
                        className="px-6 py-4 text-lg rounded-xl text-center"
                        disabled={isLoading}
                      />
                    ) : (
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-6 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300 text-center"
                        placeholder="مثال: 2026-0001"
                        disabled={isLoading}
                      />
                    )}
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full btn-primary py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2 space-x-reverse">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري البحث...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2 space-x-reverse">
                      <Search className="w-5 h-5" />
                      <span>البحث عن الطلب</span>
                    </div>
                  )}
                </button>
              </form>

              {/* رسالة الخطأ */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg flex items-center space-x-3 space-x-reverse"
                >
                  <AlertCircle className="w-5 h-5 text-red-600" />
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
                className="space-y-8"
              >
                {/* زر البحث عن طلب آخر */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOrdersData([])
                      setSearchTerm('')
                      setError(null)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse"
                  >
                    <Search className="w-5 h-5" />
                    <span>بحث عن طلب آخر</span>
                  </button>
                </div>

                {/* عنوان النتائج عند وجود أكثر من طلب */}
                {ordersData.length > 1 && (
                  <div className="text-center">
                    <p className="text-gray-600 font-medium">
                      تم العثور على <span className="text-pink-600 font-bold">{ordersData.length}</span> طلبات مرتبطة بهذا الرقم
                    </p>
                  </div>
                )}

                {ordersData.map((order, index) => renderOrderCard(order, index, ordersData.length))}
              </motion.div>
            )}

            {/* نصائح للاستخدام */}
            {ordersData.length === 0 && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100"
              >
                <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
                  كيفية العثور على رقم طلبك
                </h3>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="font-bold text-gray-800 mb-2">رسالة التأكيد</h4>
                    <p className="text-gray-600 text-sm">
                      ستجدين رقم الطلب في رسالة التأكيد التي وصلتك عبر الواتساب أو الرسائل النصية
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Phone className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="font-bold text-gray-800 mb-2">باستخدام رقم الهاتف</h4>
                    <p className="text-gray-600 text-sm">
                      إذا لم تجدي رقم الطلب، يمكنك البحث باستخدام رقم هاتفك المسجل لدينا
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
