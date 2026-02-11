'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Truck,
  Calendar,
  User,
  Clock,
  Phone,
  X,
  Package,
  Trash2,
  Wrench,
  MessageCircle // Import MessageCircle
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast' // Import toast
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { useTranslation } from '@/hooks/useTranslation'
import OrderModal from '@/components/OrderModal'
import DeleteOrderModal from '@/components/DeleteOrderModal'

export default function DeliveredOrdersPage() {
  const router = useRouter()
  const { t, isArabic } = useTranslation() // Add translation hook
  const { user, isLoading: authLoading } = useAuthStore()
  const { orders, loadOrders, deleteOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { workerType, isLoading: permissionsLoading, getDashboardRoute } = useWorkerPermissions()
  const [showViewModal, setShowViewModal] = useState(false)

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)

  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // OPTIMIZATION: Load data immediately, don't wait for permissions
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/login')
      return
    }
    // Load data immediately - don't wait for permission check
    loadOrders()
    loadWorkers()
  }, [user, authLoading, router, loadOrders, loadWorkers])

  // Separate effect for permission-based redirect (runs in parallel)
  useEffect(() => {
    if (authLoading || permissionsLoading || !user) return

    const isAdmin = user.role === 'admin'
    const isWorkshopManager = user.role === 'worker' && workerType === 'workshop_manager'

    if (!isAdmin && !isWorkshopManager) {
      router.push('/dashboard')
    }
  }, [user, authLoading, workerType, permissionsLoading, router])

  // فلترة الطلبات المسلمة فقط
  const deliveredOrders = orders.filter(order => {
    if (order.status !== 'delivered') return false

    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      (order.client_name || '').toLowerCase().includes(searchLower) ||
      (order.client_phone || '').toLowerCase().includes(searchLower) ||
      (order.order_number || '').toLowerCase().includes(searchLower)

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

  // View Order
  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  // Send Thank You WhatsApp Message
  const handleSendThankYouMessage = (order: any) => {
    if (!order.client_phone) {
      toast.error('لا يوجد رقم هاتف للعميل')
      return
    }

    const message = `مرحباً ${order.client_name}

لقد تم تسليم فستانك بنجاح!

نأمل أن ينال إعجابك.

يمكنك ترك تعليق لطيف لنا عبر الرابط التالي:
https://maps.app.goo.gl/oor8FHoTwaGS8GMb9

ننتظر زيارتكم مرة أخرى

ياسمين الشام للأزياء`

    const encodedMessage = encodeURIComponent(message)
    const whatsappUrl = `https://wa.me/${order.client_phone}?text=${encodedMessage}`
    window.open(whatsappUrl, '_blank')
  }

  // Delete Order Handlers
  const handleDeleteOrder = (order: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setOrderToDelete(order)
    setDeleteModalOpen(true)
  }

  const confirmDeleteOrder = async () => {
    if (orderToDelete) {
      const result = await deleteOrder(orderToDelete.id)
      if (result.success) {
        // simple success handling, maybe toast later if added
      }
      setDeleteModalOpen(false)
      setOrderToDelete(null)
      await loadOrders()
    }
  }

  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setOrderToDelete(null)
  }

  const handleCloseViewModal = () => {
    setShowViewModal(false)
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

        {/* البحث والفلاتر - تصميم محسّن */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
          {/* صف واحد: حقل البحث والفلاتر - عرض أفقي حتى في الجوال */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 overflow-x-auto">
            {/* حقل البحث الشامل */}
            <div className="relative min-w-0">
              <Package className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-7 sm:pr-10 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                placeholder="البحث بالاسم، رقم الهاتف، أو رقم الطلب..."
              />
            </div>

            {/* فلتر التاريخ */}
            <div className="relative min-w-0">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
              <Calendar className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
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
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => handleViewOrder(order)}
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* معلومات الطلب الأساسية */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-800">
                            {order.client_name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-600">
                            {t('delivered') || 'تم التسليم'}
                          </span>
                        </div>
                        <p className="text-sm text-purple-600 font-medium">{order.description}</p>
                        <p className="text-xs text-gray-500 mt-1">#{order.order_number || order.id}</p>
                      </div>
                    </div>

                    {/* تفاصيل الطلب */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formatDate(order.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formatDate(order.due_date)}</span>
                      </div>
                      {order.worker_id && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate">{getWorkerName(order.worker_id)}</span>
                        </div>
                      )}
                      {order.client_phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate">{workerType === 'workshop_manager' ? '***' : order.client_phone}</span>
                        </div>
                      )}
                    </div>

                    {/* السعر */}
                    {workerType !== 'workshop_manager' && (
                      <div className="mt-3 inline-flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md">
                        <span className="text-xs text-gray-600">{t('price_label') || 'السعر'}:</span>
                        <span className="text-sm font-bold text-green-600">{order.price} {t('sar') || 'ريال'}</span>
                      </div>
                    )}
                  </div>

                  {/* الإجراءات */}
                  <div className="flex lg:flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/dashboard/alterations/add?orderId=${order.id}`}
                      className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg transition-all duration-200 text-center"
                      title={t('request_alteration') || 'طلب تعديل'}
                    >
                      <Wrench className="w-5 h-5 mx-auto" />
                    </Link>

                    <button
                      onClick={() => handleSendThankYouMessage(order)}
                      disabled={!order.client_phone}
                      className="p-3 bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 rounded-lg transition-all duration-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                      title="إرسال رسالة شكر"
                    >
                      <MessageCircle className="w-5 h-5 mx-auto" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteOrder(order, e)}
                      className="p-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-all duration-200 text-center"
                      title={t('delete_order') || 'حذف الطلب'}
                    >
                      <Trash2 className="w-5 h-5 mx-auto" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* مودال عرض التفاصيل الموحد */}
      <OrderModal
        order={selectedOrder}
        workers={workers}
        isOpen={showViewModal}
        onClose={handleCloseViewModal}
      />

      {/* مودال الحذف الموحد */}
      <DeleteOrderModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteOrder}
        orderInfo={{
          id: orderToDelete?.order_number || orderToDelete?.id || '',
          clientName: orderToDelete?.client_name || '',
          description: orderToDelete?.description || ''
        }}
      />

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

