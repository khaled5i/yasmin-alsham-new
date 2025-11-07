'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import {
  ArrowRight,
  Package,
  Eye,
  CheckCircle,
  Calendar,
  User,
  DollarSign,
  Clock,
  Truck,
  Image as ImageIcon,
  Phone,
  X,
  MessageSquare
} from 'lucide-react'

export default function CompletedOrdersPage() {
  const { user } = useAuthStore()
  const { orders, loadOrders, updateOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()

  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [deliverySuccess, setDeliverySuccess] = useState(false)

  // التحقق من الصلاحيات - المدراء فقط
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    if (user.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    // تحميل البيانات
    loadOrders()
    loadWorkers()
  }, [user, router, loadOrders, loadWorkers])

  // فلترة الطلبات المكتملة فقط
  const completedOrders = orders.filter(order => order.status === 'completed')

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return t('not_specified') || 'غير محدد'
    const worker = workers.find(w => w.id === workerId)
    return worker ? (worker.user?.full_name || worker.id) : t('not_specified') || 'غير محدد'
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  const handleMarkAsDelivered = async (orderId: string) => {
    setIsProcessing(true)
    try {
      const result = await updateOrder(orderId, {
        status: 'delivered',
        delivery_date: new Date().toISOString()
      })
      if (result.success) {
        setDeliverySuccess(true)
        setTimeout(() => setDeliverySuccess(false), 3000)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCloseModal = () => {
    setShowViewModal(false)
    setSelectedOrder(null)
  }

  if (!user || user.role !== 'admin') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      {/* الهيدر */}
      <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/dashboard"
              className="text-pink-600 hover:text-pink-700 transition-colors duration-300 group flex items-center space-x-2 space-x-reverse"
            >
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              <span className="text-sm font-medium">{t('back_to_dashboard') || 'العودة للوحة التحكم'}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">الطلبات المكتملة</h1>
              <p className="text-gray-600 mt-1">
                الطلبات التي أنهاها العمال وجاهزة للتسليم
              </p>
            </div>
          </div>
        </motion.div>

        {/* عداد الطلبات */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-6"
        >
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-green-600" />
                <span className="text-gray-700 font-medium">
                  إجمالي الطلبات المكتملة:
                </span>
              </div>
              <span className="text-2xl font-bold text-green-600">
                {completedOrders.length}
              </span>
            </div>
          </div>
        </motion.div>

        {/* قائمة الطلبات */}
        <div className="space-y-6">
          {completedOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 border border-pink-100 text-center"
            >
              <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                لا توجد طلبات مكتملة
              </h3>
              <p className="text-gray-600">
                لا توجد طلبات مكتملة في الوقت الحالي. ستظهر الطلبات هنا بعد أن ينهيها العمال.
              </p>
            </motion.div>
          ) : (
            completedOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 hover:shadow-lg transition-all duration-300"
              >
                <div className="grid lg:grid-cols-4 gap-6">
                  {/* معلومات الطلب */}
                  <div className="lg:col-span-2">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">
                          {order.client_name}
                        </h3>
                        <p className="text-pink-600 font-medium">{order.description}</p>
                        <p className="text-sm text-gray-500">#{order.order_number || order.id}</p>
                      </div>
                      
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-600">
                        ✓ مكتمل
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Calendar className="w-4 h-4" />
                        <span>تاريخ الطلب: {formatDate(order.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Clock className="w-4 h-4" />
                        <span>موعد التسليم: {formatDate(order.due_date)}</span>
                      </div>
                      {order.worker_id && (
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <User className="w-4 h-4" />
                          <span>العامل: {getWorkerName(order.worker_id)}</span>
                        </div>
                      )}
                      {order.client_phone && (
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <Phone className="w-4 h-4" />
                          <span>الهاتف: {order.client_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* السعر والصور */}
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">السعر</p>
                      <p className="text-lg font-bold text-green-600">{order.price} ريال</p>
                    </div>

                    {order.completed_images && order.completed_images.length > 0 && (
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <div className="flex items-center space-x-2 space-x-reverse mb-2">
                          <ImageIcon className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-800">
                            صور العمل المكتمل
                          </span>
                        </div>
                        <p className="text-xs text-green-600">
                          {order.completed_images.length} صورة
                        </p>
                      </div>
                    )}
                  </div>

                  {/* الإجراءات */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="btn-secondary py-2 px-4 text-sm inline-flex items-center justify-center space-x-1 space-x-reverse"
                    >
                      <Eye className="w-4 h-4" />
                      <span>عرض</span>
                    </button>

                    <button
                      onClick={() => handleMarkAsDelivered(order.id)}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-purple-500 to-purple-600 text-white py-2 px-4 text-sm rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all duration-300 inline-flex items-center justify-center space-x-1 space-x-reverse disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>جاري المعالجة...</span>
                        </>
                      ) : (
                        <>
                          <Truck className="w-4 h-4" />
                          <span>تم التسليم</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* نافذة عرض التفاصيل */}
      {showViewModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModal} />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* رأس النافذة */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">تفاصيل الطلب المكتمل</h3>
                    <p className="text-sm text-gray-600">#{selectedOrder.order_number || selectedOrder.id}</p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* محتوى النافذة */}
            <div className="p-6 space-y-6">
              {/* معلومات العميل */}
              <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-lg border border-pink-200">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-pink-600" />
                  معلومات العميل
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">اسم العميل</p>
                    <p className="font-medium text-gray-800">{selectedOrder.client_name}</p>
                  </div>
                  {selectedOrder.client_phone && (
                    <div>
                      <p className="text-sm text-gray-600">رقم الهاتف</p>
                      <p className="font-medium text-gray-800">{selectedOrder.client_phone}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* معلومات الطلب */}
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  معلومات الطلب
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">الوصف</p>
                    <p className="font-medium text-gray-800">{selectedOrder.description}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">السعر</p>
                    <p className="font-medium text-green-600 text-lg">{selectedOrder.price} ريال</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">تاريخ الطلب</p>
                    <p className="font-medium text-gray-800">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">موعد التسليم</p>
                    <p className="font-medium text-gray-800">{formatDate(selectedOrder.due_date)}</p>
                  </div>
                  {selectedOrder.worker_id && (
                    <div>
                      <p className="text-sm text-gray-600">العامل المسؤول</p>
                      <p className="font-medium text-gray-800">{getWorkerName(selectedOrder.worker_id)}</p>
                    </div>
                  )}
                  {selectedOrder.fabric && (
                    <div>
                      <p className="text-sm text-gray-600">القماش</p>
                      <p className="font-medium text-gray-800">{selectedOrder.fabric}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* صور العمل المكتمل */}
              {selectedOrder.completed_images && selectedOrder.completed_images.length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-green-600" />
                    صور العمل المكتمل ({selectedOrder.completed_images.length})
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedOrder.completed_images.map((image: string, index: number) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden border-2 border-green-300 shadow-md">
                          <img
                            src={image}
                            alt={`صورة العمل المكتمل ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-300"
                            onClick={() => window.open(image, '_blank')}
                          />
                        </div>
                        <div className="absolute bottom-2 left-2 bg-green-600/90 text-white text-xs px-2 py-1 rounded-full font-medium">
                          {index + 1}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 rounded-lg flex items-center justify-center">
                          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-green-700 mt-3 text-center">
                    انقر على أي صورة لعرضها بالحجم الكامل
                  </p>
                </div>
              )}

              {/* الملاحظات */}
              {selectedOrder.notes && (
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-4 rounded-lg border border-yellow-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-yellow-600" />
                    الملاحظات
                  </h4>
                  <p className="text-gray-700">{selectedOrder.notes}</p>
                </div>
              )}
            </div>

            {/* تذييل النافذة */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
              <div className="flex gap-4 justify-end">
                <button
                  onClick={handleCloseModal}
                  className="btn-secondary px-6 py-2"
                >
                  إغلاق
                </button>
                <button
                  onClick={() => {
                    handleMarkAsDelivered(selectedOrder.id)
                    handleCloseModal()
                  }}
                  disabled={isProcessing}
                  className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg inline-flex items-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  <span>تم التسليم</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* رسالة نجاح التسليم */}
      {deliverySuccess && (
        <div className="fixed top-4 right-4 z-50">
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="bg-purple-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 space-x-reverse"
          >
            <CheckCircle className="w-5 h-5" />
            <span>تم تحديث حالة الطلب إلى "تم التسليم" بنجاح</span>
          </motion.div>
        </div>
      )}
    </div>
  )
}

