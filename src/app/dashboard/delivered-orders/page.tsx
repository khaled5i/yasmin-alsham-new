'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Truck,
  Eye,
  Calendar,
  User,
  DollarSign,
  Clock,
  Image as ImageIcon,
  Phone,
  X,
  MessageSquare,
  Package,
  CheckCircle
} from 'lucide-react'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useAuthStore } from '@/store/authStore'

export default function DeliveredOrdersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { orders, loadOrders } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

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

  // فلترة الطلبات المسلمة فقط
  const deliveredOrders = orders.filter(order => order.status === 'delivered')

  // الحصول على اسم العامل
  const getWorkerName = (workerId: string | null | undefined) => {
    if (!workerId) return 'غير محدد'
    const worker = workers.find(w => w.id === workerId)
    return worker?.name || 'غير محدد'
  }

  // تنسيق التاريخ
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // عرض تفاصيل الطلب
  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  // إغلاق النافذة
  const handleCloseModal = () => {
    setShowViewModal(false)
    setSelectedOrder(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-4 md:p-8">
      {/* رأس الصفحة */}
      <div className="max-w-7xl mx-auto mb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="mb-6 flex items-center space-x-2 space-x-reverse text-purple-600 hover:text-purple-800 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
          <span>العودة إلى لوحة التحكم</span>
        </button>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4 space-x-reverse">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">الطلبات المسلمة</h1>
              <p className="text-gray-600">عرض جميع الطلبات التي تم تسليمها للعملاء</p>
            </div>
          </div>

          <div className="bg-white px-6 py-3 rounded-lg border border-purple-200 shadow-sm">
            <p className="text-sm text-gray-600">إجمالي الطلبات المسلمة</p>
            <p className="text-2xl font-bold text-purple-600">{deliveredOrders.length}</p>
          </div>
        </div>
      </div>

      {/* قائمة الطلبات المسلمة */}
      <div className="max-w-7xl mx-auto">
        {deliveredOrders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl p-12 text-center border border-purple-100"
          >
            <Truck className="w-16 h-16 text-purple-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">لا توجد طلبات مسلمة</h3>
            <p className="text-gray-600">لم يتم تسليم أي طلبات حتى الآن</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {deliveredOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-purple-100 hover:shadow-lg transition-all duration-300"
              >
                <div className="grid lg:grid-cols-4 gap-6">
                  {/* معلومات الطلب */}
                  <div className="lg:col-span-2 space-y-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 mb-1">{order.client_name}</h3>
                      <p className="text-purple-600 font-medium">{order.description}</p>
                      <p className="text-sm text-gray-500">#{order.order_number || order.id}</p>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Calendar className="w-4 h-4 text-purple-500" />
                        <span>تاريخ الطلب: {formatDate(order.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Clock className="w-4 h-4 text-purple-500" />
                        <span>موعد التسليم: {formatDate(order.due_date)}</span>
                      </div>
                      {order.delivery_date && (
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <Truck className="w-4 h-4 text-purple-500" />
                          <span className="font-medium text-purple-700">تم التسليم: {formatDate(order.delivery_date)}</span>
                        </div>
                      )}
                      {order.worker_id && (
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <User className="w-4 h-4 text-purple-500" />
                          <span>العامل: {getWorkerName(order.worker_id)}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Phone className="w-4 h-4 text-purple-500" />
                        <span>الهاتف: {order.client_phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* السعر والصور */}
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200 text-center">
                      <p className="text-sm text-gray-600 mb-1">السعر الإجمالي</p>
                      <p className="text-2xl font-bold text-purple-600">{order.price} ريال</p>
                    </div>

                    {order.completed_images && order.completed_images.length > 0 && (
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200">
                        <div className="flex items-center space-x-2 space-x-reverse mb-2">
                          <ImageIcon className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-800">صور العمل المكتمل</span>
                        </div>
                        <p className="text-xs text-green-600 font-medium">{order.completed_images.length} صورة</p>
                      </div>
                    )}

                    <div className="bg-gradient-to-br from-purple-100 to-indigo-100 p-3 rounded-lg border border-purple-300">
                      <div className="flex items-center justify-center space-x-2 space-x-reverse">
                        <CheckCircle className="w-5 h-5 text-purple-700" />
                        <span className="text-sm font-bold text-purple-800">تم التسليم</span>
                      </div>
                    </div>
                  </div>

                  {/* زر العرض */}
                  <div className="flex items-center">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg inline-flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      <span className="font-medium">عرض التفاصيل</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
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
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">تفاصيل الطلب المسلم</h3>
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
              {/* حالة التسليم */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200">
                <div className="flex items-center justify-center space-x-3 space-x-reverse">
                  <CheckCircle className="w-6 h-6 text-purple-600" />
                  <h4 className="font-bold text-purple-800 text-lg">تم تسليم الطلب بنجاح</h4>
                </div>
                {selectedOrder.delivery_date && (
                  <p className="text-center text-sm text-purple-700 mt-2">
                    تاريخ التسليم: {formatDate(selectedOrder.delivery_date)}
                  </p>
                )}
              </div>

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
                  {selectedOrder.client_email && (
                    <div>
                      <p className="text-sm text-gray-600">البريد الإلكتروني</p>
                      <p className="font-medium text-gray-800">{selectedOrder.client_email}</p>
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
                    <p className="font-medium text-purple-600 text-lg">{selectedOrder.price} ريال</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">تاريخ الطلب</p>
                    <p className="font-medium text-gray-800">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">موعد التسليم المحدد</p>
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

              {/* ملاحظات المدير */}
              {selectedOrder.admin_notes && (
                <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-lg border border-orange-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-orange-600" />
                    ملاحظات المدير
                  </h4>
                  <p className="text-gray-700">{selectedOrder.admin_notes}</p>
                </div>
              )}
            </div>

            {/* تذييل النافذة */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
              <div className="flex gap-4 justify-end">
                <button
                  onClick={handleCloseModal}
                  className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-2 rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

