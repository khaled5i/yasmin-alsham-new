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
  CheckCircle,
  Trash2,
  AlertTriangle,
  Ruler,
  Mic,
  Wrench
} from 'lucide-react'
import Link from 'next/link'
import VoiceNotes from '@/components/VoiceNotes'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'

export default function DeliveredOrdersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { orders, loadOrders, deleteOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { workerType, isLoading: permissionsLoading, getDashboardRoute } = useWorkerPermissions()
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchType, setSearchType] = useState<'name' | 'phone' | 'order_number'>('name')
  const [dateFilter, setDateFilter] = useState('')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // التحقق من الصلاحيات - المدراء ومدراء الورشة
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    // السماح للمدير ومدير الورشة فقط
    if (!permissionsLoading) {
      const isAdmin = user.role === 'admin'
      const isWorkshopManager = user.role === 'worker' && workerType === 'workshop_manager'

      if (!isAdmin && !isWorkshopManager) {
        router.push('/dashboard')
        return
      }
    }

    // تحميل البيانات
    loadOrders()
    loadWorkers()
  }, [user, workerType, permissionsLoading, router, loadOrders, loadWorkers])

  // فلترة الطلبات المسلمة فقط
  const deliveredOrders = orders.filter(order => {
    if (order.status !== 'delivered') return false

    const matchesSearch = searchType === 'phone'
      ? (order.client_phone || '').toLowerCase().includes(searchTerm.toLowerCase())
      : searchType === 'order_number'
        ? (order.order_number || '').toLowerCase().includes(searchTerm.toLowerCase())
        : (order.client_name || '').toLowerCase().includes(searchTerm.toLowerCase())

    const matchesDate = !dateFilter || order.created_at.startsWith(dateFilter)

    return matchesSearch && matchesDate
  })

  // الحصول على اسم العامل
  const getWorkerName = (workerId: string | null | undefined) => {
    if (!workerId) return 'غير محدد'
    const worker = workers.find(w => w.id === workerId)
    return worker?.user?.full_name || 'غير محدد'
  }

  // تنسيق التاريخ
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory', // استخدام التقويم الميلادي
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // دالة ترجمة أسماء المقاسات
  const getMeasurementName = (key: string) => {
    const measurementNames: { [key: string]: string } = {
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
      'cuff': 'الأسوارة',
      'frontLength': 'طول الأمام',
      'backLength': 'طول الخلف'
    }
    return measurementNames[key] || key
  }

  // عرض تفاصيل الطلب
  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  // فتح نافذة تأكيد الحذف
  const handleDeleteClick = (order: any) => {
    setSelectedOrder(order)
    setShowDeleteModal(true)
  }

  // حذف الطلب
  const handleConfirmDelete = async () => {
    if (!selectedOrder) return

    setIsDeleting(true)
    try {
      await deleteOrder(selectedOrder.id)
      setShowDeleteModal(false)
      setSelectedOrder(null)
      // إعادة تحميل الطلبات
      await loadOrders()
    } catch (error) {
      console.error('Error deleting order:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  // إغلاق النافذة
  const handleCloseModal = () => {
    setShowViewModal(false)
    setShowDeleteModal(false)
    setSelectedOrder(null)
  }

  // التحقق من الصلاحيات قبل العرض
  if (!user) {
    return null
  }

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  const isAdmin = user.role === 'admin'
  const isWorkshopManager = user.role === 'worker' && workerType === 'workshop_manager'

  if (!isAdmin && !isWorkshopManager) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-4 md:p-8">
      {/* رأس الصفحة */}
      <div className="max-w-7xl mx-auto mb-8">
        <button
          onClick={() => router.push(getDashboardRoute())}
          className="mb-6 flex items-center space-x-2 space-x-reverse text-purple-600 hover:text-purple-800 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
          <span>العودة إلى لوحة التحكم</span>
        </button>

        <div className="flex items-center space-x-4 space-x-reverse mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">الطلبات المسلمة</h1>
            <p className="text-gray-600">عرض جميع الطلبات التي تم تسليمها للعملاء</p>
          </div>
        </div>

        {/* البحث والفلاتر */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-purple-100 mb-6">
          {/* صف واحد: أزرار البحث + حقل البحث + فلتر التاريخ */}
          <div className="flex flex-col lg:flex-row gap-2 sm:gap-3">
            {/* أزرار تبديل نوع البحث */}
            <div className="flex space-x-2 space-x-reverse">
              <button
                onClick={() => {
                  setSearchType('name')
                  setSearchTerm('')
                }}
                className={`flex-1 lg:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium transition-all duration-300 whitespace-nowrap ${searchType === 'name'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                البحث بالاسم
              </button>
              <button
                onClick={() => {
                  setSearchType('phone')
                  setSearchTerm('')
                }}
                className={`flex-1 lg:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium transition-all duration-300 whitespace-nowrap ${searchType === 'phone'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                البحث بالهاتف
              </button>
              <button
                onClick={() => {
                  setSearchType('order_number')
                  setSearchTerm('')
                }}
                className={`flex-1 lg:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium transition-all duration-300 whitespace-nowrap ${searchType === 'order_number'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                رقم الطلب
              </button>
            </div>

            {/* حقل البحث */}
            <div className="relative flex-1">
              <Package className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-8 sm:pr-9 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                placeholder={
                  searchType === 'phone'
                    ? 'أدخل رقم الهاتف...'
                    : searchType === 'order_number'
                      ? 'أدخل رقم الطلب...'
                      : 'البحث في الطلبات المسلمة...'
                }
              />
            </div>

            {/* فلتر التاريخ */}
            <div className="relative w-full lg:w-40">
              <Calendar className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full pr-8 sm:pr-9 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
              />
            </div>
          </div>

          {/* زر إعادة تعيين الفلاتر */}
          {(searchTerm || dateFilter) && (
            <div className="mt-3 flex justify-between items-center">
              <div className="text-xs sm:text-sm text-gray-600">
                عرض {deliveredOrders.length} طلب
              </div>
              <button
                onClick={() => {
                  setSearchTerm('')
                  setDateFilter('')
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all duration-300"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>إعادة تعيين</span>
              </button>
            </div>
          )}
        </div>

        {/* عداد الطلبات */}
        <div className="bg-white px-6 py-3 rounded-lg border border-purple-200 shadow-sm mb-6">
          <p className="text-sm text-gray-600">إجمالي الطلبات المسلمة</p>
          <p className="text-2xl font-bold text-purple-600">{deliveredOrders.length}</p>
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
                        <span>الهاتف: {workerType === 'workshop_manager' ? '***' : order.client_phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* السعر والصور */}
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200 text-center">
                      <p className="text-sm text-gray-600 mb-1">السعر الإجمالي</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {workerType === 'workshop_manager' ? '---' : `${order.price} ريال`}
                      </p>
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

                  {/* أزرار الإجراءات */}
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg inline-flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      <span className="font-medium">عرض التفاصيل</span>
                    </button>

                    <Link
                      href={`/dashboard/alterations/add?orderId=${order.id}`}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-600 text-white px-6 py-3 rounded-lg hover:from-orange-600 hover:to-amber-700 transition-all duration-300 shadow-md hover:shadow-lg inline-flex items-center justify-center gap-2"
                    >
                      <Wrench className="w-5 h-5" />
                      <span className="font-medium">طلب تعديل</span>
                    </Link>

                    <button
                      onClick={() => handleDeleteClick(order)}
                      className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 shadow-md hover:shadow-lg inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="font-medium">حذف</span>
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
                      <p className="font-medium text-gray-800">
                        {workerType === 'workshop_manager' ? '***' : selectedOrder.client_phone}
                      </p>
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
                    <p className="font-medium text-purple-600 text-lg">
                      {workerType === 'workshop_manager' ? '---' : `${selectedOrder.price} ريال`}
                    </p>
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

              {/* المقاسات */}
              {selectedOrder.measurements && Object.keys(selectedOrder.measurements).length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-purple-600" />
                    المقاسات
                  </h4>
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 text-sm">
                    {Object.entries(selectedOrder.measurements).map(([key, value]) => (
                      value && (
                        <div key={key} className="bg-white p-2 rounded text-center border border-purple-100">
                          <p className="text-gray-500 text-xs">{getMeasurementName(key)}</p>
                          <p className="font-medium text-purple-700">{String(value)}</p>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* صور التصميم */}
              {selectedOrder.images && selectedOrder.images.length > 0 && (
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-lg border border-indigo-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600" />
                    صور التصميم ({selectedOrder.images.length})
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedOrder.images.map((image: string, index: number) => (
                      <div
                        key={index}
                        className="relative group cursor-pointer"
                        onClick={() => setLightboxImage(image)}
                      >
                        <div className="aspect-square rounded-lg overflow-hidden border-2 border-indigo-300 shadow-md">
                          <img
                            src={image}
                            alt={`صورة التصميم ${index + 1}`}
                            className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <div className="absolute bottom-2 left-2 bg-indigo-600/90 text-white text-xs px-2 py-1 rounded-full font-medium pointer-events-none">
                          {index + 1}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 rounded-lg flex items-center justify-center pointer-events-none">
                          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* صور العمل المكتمل */}
              {selectedOrder.completed_images && selectedOrder.completed_images.length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-green-600" />
                    صور العمل المكتمل ({selectedOrder.completed_images.length})
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedOrder.completed_images.map((image: string, index: number) => (
                      <div
                        key={index}
                        className="relative group cursor-pointer"
                        onClick={() => setLightboxImage(image)}
                      >
                        <div className="aspect-square rounded-lg overflow-hidden border-2 border-green-300 shadow-md">
                          <img
                            src={image}
                            alt={`صورة العمل المكتمل ${index + 1}`}
                            className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <div className="absolute bottom-2 left-2 bg-green-600/90 text-white text-xs px-2 py-1 rounded-full font-medium pointer-events-none">
                          {index + 1}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 rounded-lg flex items-center justify-center pointer-events-none">
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

              {/* الملاحظات الصوتية */}
              {selectedOrder.voice_notes && selectedOrder.voice_notes.length > 0 && (
                <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-lg border border-pink-200">
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Mic className="w-5 h-5 text-pink-600" />
                    الملاحظات الصوتية ({selectedOrder.voice_notes.length})
                  </h4>
                  <VoiceNotes
                    voiceNotes={selectedOrder.voice_notes.map((vn: string, idx: number) => ({
                      id: `vn-${idx}`,
                      data: vn,
                      timestamp: Date.now()
                    }))}
                    onVoiceNotesChange={() => { }}
                    disabled={true}
                  />
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

      {/* نافذة تأكيد الحذف */}
      {showDeleteModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModal} />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8"
          >
            {/* أيقونة التحذير */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-12 h-12 text-red-600" />
              </div>
            </div>

            {/* العنوان */}
            <h3 className="text-2xl font-bold text-gray-800 text-center mb-4">
              تأكيد حذف الطلب
            </h3>

            {/* الرسالة */}
            <p className="text-gray-600 text-center mb-2">
              هل أنت متأكد من حذف طلب <span className="font-bold text-gray-800">{selectedOrder.client_name}</span>؟
            </p>
            <p className="text-sm text-red-600 text-center mb-8">
              لا يمكن التراجع عن هذا الإجراء!
            </p>

            {/* الأزرار */}
            <div className="flex gap-4">
              <button
                onClick={handleCloseModal}
                disabled={isDeleting}
                className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition-all duration-300 font-medium disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 shadow-md hover:shadow-lg font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    <span>حذف</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lightbox لعرض الصور بالحجم الكامل */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxImage}
            alt="صورة مكبرة"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

