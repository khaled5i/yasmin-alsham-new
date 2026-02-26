'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Package, Clock, CheckCircle, AlertCircle, Phone, MessageSquare, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { formatGregorianDate } from '@/lib/date-utils'
import NumericInput from '@/components/NumericInput'
import Header from '@/components/Header'

export default function TrackOrderPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchType, setSearchType] = useState<'order' | 'phone'>('order')
  const [orderData, setOrderData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { loadOrderByNumber, loadOrdersByPhone, currentOrder, orders } = useOrderStore()
  const { workers } = useWorkerStore()

  // البحث عن الطلب
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchTerm.trim()) {
      setError(searchType === 'order' ? 'يرجى إدخال رقم الطلب' : 'يرجى إدخال رقم الهاتف')
      return
    }

    setIsLoading(true)
    setError(null)
    setOrderData(null)

    try {
      console.log('🔍 Searching for order:', searchTerm, 'type:', searchType)

      if (searchType === 'order') {
        // البحث برقم الطلب
        await loadOrderByNumber(searchTerm)

        // استخدام getState() للحصول على أحدث قيمة من المخزن بعد التحميل
        // (المتغيرات المغلقة من useOrderStore() تحتفظ بالقيمة القديمة من آخر render)
        const latestState = useOrderStore.getState()

        if (latestState.error) {
          setError('لم يتم العثور على طلب بهذا الرقم. يرجى التأكد من رقم الطلب والمحاولة مرة أخرى.')
        } else if (latestState.currentOrder) {
          // تحويل البيانات إلى الصيغة المطلوبة
          const order = latestState.currentOrder
          const orderInfo = {
            order_number: order.order_number,
            client_name: order.client_name,
            client_phone: order.client_phone,
            dress_type: order.description,
            order_date: order.created_at,
            due_date: order.due_date,
            proof_delivery_date: order.proof_delivery_date,
            status: order.status,
            estimated_price: order.price,
            progress_percentage: getProgressPercentage(order.status),
            notes: order.notes,
            fabric: order.fabric,
            measurements: order.measurements
          }

          setOrderData(orderInfo)
          console.log('✅ Order found:', orderInfo)
        } else {
          setError('لم يتم العثور على طلب بهذا الرقم. يرجى التأكد من رقم الطلب والمحاولة مرة أخرى.')
        }
      } else {
        // البحث برقم الهاتف
        await loadOrdersByPhone(searchTerm)

        // استخدام getState() للحصول على أحدث قيمة من المخزن بعد التحميل
        const latestState = useOrderStore.getState()

        if (latestState.error) {
          setError('لم يتم العثور على طلبات مرتبطة بهذا الرقم. يرجى التأكد من رقم الهاتف والمحاولة مرة أخرى.')
        } else if (latestState.orders && latestState.orders.length > 0) {
          // عرض أول طلب (يمكن تحسين هذا لعرض جميع الطلبات)
          let foundOrder = latestState.orders[0]

          // جلب التفاصيل الكاملة للطلب بما فيها المقاسات
          await latestState.loadOrderById(foundOrder.id)
          const fullOrderState = useOrderStore.getState()
          if (fullOrderState.currentOrder && fullOrderState.currentOrder.id === foundOrder.id) {
            foundOrder = fullOrderState.currentOrder
          }

          const orderInfo = {
            order_number: foundOrder.order_number,
            client_name: foundOrder.client_name,
            client_phone: foundOrder.client_phone,
            dress_type: foundOrder.description,
            order_date: foundOrder.created_at,
            due_date: foundOrder.due_date,
            proof_delivery_date: foundOrder.proof_delivery_date,
            status: foundOrder.status,
            estimated_price: foundOrder.price,
            progress_percentage: getProgressPercentage(foundOrder.status),
            notes: foundOrder.notes,
            fabric: foundOrder.fabric,
            measurements: foundOrder.measurements
          }

          setOrderData(orderInfo)
          console.log('✅ Order found by phone:', orderInfo)
        } else {
          setError('لم يتم العثور على طلبات مرتبطة بهذا الرقم. يرجى التأكد من رقم الهاتف والمحاولة مرة أخرى.')
        }
      }
    } catch (error) {
      console.error('❌ Error searching for order:', error)
      setError('حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsLoading(false)
    }
  }

  // حساب نسبة التقدم حسب الحالة
  const getProgressPercentage = (status: string) => {
    const progressMap = {
      pending: 10,
      in_progress: 50,
      completed: 90,
      delivered: 100
    }
    return progressMap[status as keyof typeof progressMap] || 0
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: { label: 'في الانتظار', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
      assigned: { label: 'تم التعيين', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Package },
      in_progress: { label: 'قيد التنفيذ', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: Package },
      completed: { label: 'مكتمل', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
      delivered: { label: 'تم التسليم', color: 'text-green-700', bgColor: 'bg-green-200', icon: CheckCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  const formatDate = (dateString: string) => {
    // التاريخ الميلادي فقط
    return formatGregorianDate(dateString, 'ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // دالة ترجمة أسماء المقاسات إلى العربية (ثابتة بالعربية للزبائن)
  const getMeasurementNameInArabic = (key: string) => {
    const measurementNames: { [key: string]: string } = {
      // المقاسات الجديدة
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
      'LB': 'طول الخلف',
      'additional_notes': 'مقاسات إضافية',
      // المقاسات القديمة (للتوافق)
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
      'backLength': 'طول الخلف'
    }
    return measurementNames[key] || key
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">

          {/* العنوان */}
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

          <div className="max-w-4xl mx-auto">
            {/* نموذج البحث */}
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

            {/* نتائج البحث */}
            {orderData && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-8"
              >
                {/* معلومات الطلب الأساسية */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
                  <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-3 space-x-reverse">
                    <Package className="w-6 h-6 text-pink-600" />
                    <span>معلومات الطلب</span>
                  </h2>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* العمود الأول */}
                    <div className="space-y-4">
                      {/* 1. اسم العميلة */}
                      <div>
                        <span className="text-sm text-gray-500">اسم العميلة</span>
                        <p className="text-lg font-medium text-gray-800">{orderData.client_name}</p>
                      </div>

                      {/* 2. رقم الطلب */}
                      <div>
                        <span className="text-sm text-gray-500">رقم الطلب</span>
                        <p className="text-lg font-bold text-pink-600">{orderData.order_number}</p>
                      </div>

                      {/* 3. رقم الهاتف */}
                      <div>
                        <span className="text-sm text-gray-500">رقم الهاتف</span>
                        <p className="text-lg font-medium text-gray-800">{orderData.client_phone}</p>
                      </div>
                    </div>

                    {/* العمود الثاني */}
                    <div className="space-y-4">
                      {/* 4. موعد تسليم البروفا */}
                      {orderData.proof_delivery_date && (
                        <div>
                          <span className="text-sm text-gray-500">موعد تسليم البروفا</span>
                          <p className="text-lg font-medium text-gray-800">{formatDate(orderData.proof_delivery_date)}</p>
                        </div>
                      )}

                      {/* 5. تاريخ الطلب */}
                      <div>
                        <span className="text-sm text-gray-500">تاريخ الطلب</span>
                        <p className="text-lg font-medium text-gray-800">{formatDate(orderData.order_date)}</p>
                      </div>
                    </div>
                  </div>

                  {/* حالة الطلب */}
                  <div className="mt-6 p-6 bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl border border-pink-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3 space-x-reverse">
                        <div className={`w-12 h-12 rounded-full ${getStatusInfo(orderData.status).bgColor} flex items-center justify-center`}>
                          {React.createElement(getStatusInfo(orderData.status).icon, {
                            className: `w-6 h-6 ${getStatusInfo(orderData.status).color}`
                          })}
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">حالة الطلب</p>
                          <p className={`text-xl font-bold ${getStatusInfo(orderData.status).color}`}>
                            {getStatusInfo(orderData.status).label}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-gray-500">موعد التسليم المتوقع</p>
                        <p className="text-lg font-bold text-gray-800">{formatDate(orderData.due_date)}</p>
                      </div>
                    </div>

                    {/* رسالة إكمال الطلب */}
                    {orderData.status === 'completed' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.8 }}
                        className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200"
                      >
                        <div className="flex items-center space-x-3 space-x-reverse">
                          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-green-800 mb-1">طلبك جاهز للاستلام!</p>
                            <p className="text-sm text-green-700">
                              مكتمل - بإمكانك الحضور واستلام الفستان في أي وقت تريدينه
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* عرض المقاسات إن وُجدت */}
                {orderData.measurements && Object.keys(orderData.measurements).filter(key =>
                  !['image_annotations', 'image_drawings', 'custom_design_image', 'saved_design_comments'].includes(key) &&
                  orderData.measurements[key] !== null &&
                  orderData.measurements[key] !== undefined &&
                  orderData.measurements[key] !== ''
                ).length > 0 && (
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
                      <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-3 space-x-reverse">
                        <Package className="w-6 h-6 text-pink-600" />
                        <span>المقاسات</span>
                      </h3>

                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(orderData.measurements)
                          .filter(([key]) =>
                            !['image_annotations', 'image_drawings', 'custom_design_image', 'saved_design_comments'].includes(key)
                          )
                          .filter(([_, value]) => value !== null && value !== undefined && value !== '')
                          .map(([key, value]) => {
                            // إذا كان الحقل additional_notes، نعرضه بشكل مختلف
                            if (key === 'additional_notes') {
                              return (
                                <div key={key} className="md:col-span-2 lg:col-span-3 p-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl border border-pink-100">
                                  <span className="text-sm text-gray-500 block mb-2">{getMeasurementNameInArabic(key)}</span>
                                  <p className="text-base font-medium text-gray-800 whitespace-pre-wrap">{String(value)}</p>
                                </div>
                              )
                            }

                            return (
                              <div key={key} className="p-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl border border-pink-100">
                                <span className="text-sm text-gray-500 block mb-1">{getMeasurementNameInArabic(key)}</span>
                                <span className="text-lg font-medium text-gray-800">{String(value)} انش</span>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}

                {/* معلومات التواصل */}
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-100">
                  <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
                    هل لديك استفسار حول طلبك؟
                  </h3>
                  <p className="text-gray-600 text-center mb-6">
                    لا تترددي في التواصل معنا للحصول على مزيد من التفاصيل
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a
                      href="tel:+966598862609"
                      className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse"
                    >
                      <Phone className="w-5 h-5" />
                      <span>اتصلي بنا</span>
                    </a>

                    <a
                      href={`https://wa.me/+966598862609?text=استفسار عن الطلب رقم: ${orderData.order_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span>واتساب</span>
                    </a>
                  </div>
                </div>
              </motion.div>
            )}

            {/* نصائح للاستخدام */}
            {!orderData && !isLoading && (
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

