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
import { formatGregorianDate } from '@/lib/date-utils'
import { useAppResume } from '@/hooks/useAppResume'
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
    loadOrders({ status: 'delivered' })
    loadWorkers()
  }, [user, authLoading, router, loadOrders, loadWorkers])

  // Re-fetch data when the app resumes from background (mobile)
  useAppResume(() => {
    if (!user) return
    loadOrders({ status: 'delivered' })
    loadWorkers()
  })

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
    return formatGregorianDate(dateString, 'ar-SA', {
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
          <div className={deliveredOrders.length === 0 ? "space-y-6" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
            {deliveredOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all"
              >
                {/* Container for Main Content (Left) and Actions (Right) */}
                <div className="flex items-start justify-between mb-2">
                  {/* Left Side: Info & Details */}
                  <div className="flex-1 cursor-pointer" onClick={() => handleViewOrder(order)}>
                    {/* Basic Info */}
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {order.client_name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-2">
                      <span className="font-medium">{t('order_number') || (isArabic ? 'رقم الطلب:' : 'Order #')}</span> {order.order_number || order.id}
                    </p>

                    {/* Fabric Label */}
                    {order.fabric && (
                      <div className="mb-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                          {order.fabric}
                        </span>
                      </div>
                    )}

                    {/* Details - integrated here to avoid specific gap from right column height */}
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">{t('phone') || (isArabic ? 'الهاتف:' : 'Phone:')}</span> <span dir="ltr">{workerType === 'workshop_manager' ? '***' : order.client_phone}</span>
                      </p>
                      {order.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">
                          <span className="font-medium">{t('description') || (isArabic ? 'الوصف:' : 'Description:')}</span> {order.description}
                        </p>
                      )}
                      <div className="flex flex-col gap-1">
                        {order.proof_delivery_date && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">{t('proof_delivery_date') || (isArabic ? 'موعد البروفة:' : 'Proof Date:')}</span>{' '}
                            {formatDate(order.proof_delivery_date)}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">{t('delivered_date') || (isArabic ? 'تاريخ التسليم:' : 'Delivered Date:')}</span>{' '}
                          {formatDate(order.due_date)}
                        </p>
                      </div>
                      {order.worker_id && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">{t('worker') || (isArabic ? 'العامل:' : 'Worker:')}</span>{' '}
                          {getWorkerName(order.worker_id)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Status & Buttons */}
                  <div className="flex flex-col items-end gap-3 ml-4">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-600">
                      <Truck className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">
                        {t('delivered') || 'تم التسليم'}
                      </span>
                    </div>

                    {/* Action Buttons Stack */}
                    <div className="flex flex-col gap-2 mt-1">
                      <Link
                        href={`/dashboard/alterations/add?orderId=${order.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-100"
                        title={t('request_alteration') || 'طلب تعديل'}
                      >
                        <Wrench className="w-4 h-4" />
                      </Link>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSendThankYouMessage(order)
                        }}
                        disabled={!order.client_phone}
                        className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-green-100"
                        title="إرسال رسالة شكر"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteOrder(order, e)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title={t('delete_order') || 'حذف الطلب'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer - Price */}
                {workerType !== 'workshop_manager' && (
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4 cursor-pointer" onClick={() => handleViewOrder(order)}>
                    <div>
                      <p className="text-xs text-gray-500">{t('price_label') || (isArabic ? 'السعر' : 'Price')}</p>
                      <p className="text-lg font-bold text-gray-900">
                        {order.price?.toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                      </p>
                    </div>
                    {/* For delivered orders, it's usually paid, but we can check paid_amount if available or assume price */}
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{t('paid') || (isArabic ? 'المدفوع' : 'Paid')}</p>
                      <p className="text-sm font-semibold text-green-600">
                        {(order.paid_amount || order.price || 0).toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                      </p>
                    </div>
                  </div>
                )}
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
