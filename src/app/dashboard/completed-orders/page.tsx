'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import RemainingPaymentWarningModal from '@/components/RemainingPaymentWarningModal'
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
  MessageSquare,
  Ruler,
  Mic,
  Wrench,
  MessageCircle,
  Search,
  Filter,
  AlertCircle,
  Trash2
} from 'lucide-react'
import { useAppResume } from '@/hooks/useAppResume'
import OrderModal from '@/components/OrderModal'
import DeleteOrderModal from '@/components/DeleteOrderModal'
import VoiceNotes from '@/components/VoiceNotes'
import { sendReadyForPickupWhatsApp, sendDeliveredWhatsApp } from '@/utils/whatsapp'
import { formatGregorianDate } from '@/lib/date-utils'
import toast from 'react-hot-toast'

export default function CompletedOrdersPage() {
  const { user, isLoading: authLoading } = useAuthStore()
  const { orders, loadOrders, updateOrder, deleteOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()
  const { workerType, isLoading: permissionsLoading, getDashboardRoute } = useWorkerPermissions()

  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [deliverySuccess, setDeliverySuccess] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [showPaymentWarning, setShowPaymentWarning] = useState(false)
  const [orderToDeliver, setOrderToDeliver] = useState<any>(null)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // حالات modal حذف الطلب
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)

  // التحقق من الصلاحيات - المدراء ومدراء الورشة
  useEffect(() => {
    // انتظار انتهاء التحقق من المصادقة
    if (authLoading) {
      return
    }

    if (!user) {
      router.push('/login')
      return
    }

    // OPTIMIZATION: Load only completed orders from the server
    loadOrders({ status: 'completed' })
    loadWorkers()
  }, [user, authLoading, router, loadOrders, loadWorkers])

  // Re-fetch data when the app resumes from background (mobile)
  useAppResume(() => {
    if (!user) return
    loadOrders({ status: 'completed' })
    loadWorkers()
  })

  // Separate effect for permission-based redirect (runs in parallel)
  useEffect(() => {
    if (authLoading || permissionsLoading || !user) return

    // السماح للمدير ومدير الورشة فقط
    const isAdmin = user.role === 'admin'
    const isWorkshopManager = user.role === 'worker' && workerType === 'workshop_manager'

    if (!isAdmin && !isWorkshopManager) {
      router.push('/dashboard')
    }
  }, [user, authLoading, workerType, permissionsLoading, router])

  // فلترة الطلبات - server-side filtering already ensures only completed orders
  const completedOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      (order.client_name || '').toLowerCase().includes(searchLower) ||
      (order.client_phone || '').toLowerCase().includes(searchLower) ||
      (order.order_number || '').toLowerCase().includes(searchLower)

    const matchesDate = !dateFilter || order.created_at.startsWith(dateFilter)

    return matchesSearch && matchesDate
  })

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return t('not_specified') || 'غير محدد'
    const worker = workers.find(w => w.id === workerId)
    return worker ? (worker.user?.full_name || worker.id) : t('not_specified') || 'غير محدد'
  }

  const formatDate = (dateString: string) => {
    return formatGregorianDate(dateString, 'ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // دالة ترجمة أسماء المقاسات
  const getMeasurementName = (key: string) => {
    const measurementNames: { [key: string]: { ar: string; en: string } } = {
      'shoulder': { ar: 'الكتف', en: 'Shoulder' },
      'shoulderCircumference': { ar: 'دوران الكتف', en: 'Shoulder Circumference' },
      'chest': { ar: 'الصدر', en: 'Chest' },
      'waist': { ar: 'الخصر', en: 'Waist' },
      'hips': { ar: 'الأرداف', en: 'Hips' },
      'dartLength': { ar: 'طول البنس', en: 'Dart Length' },
      'bodiceLength': { ar: 'طول الصدرية', en: 'Bodice Length' },
      'neckline': { ar: 'فتحة الصدر', en: 'Neckline' },
      'armpit': { ar: 'الإبط', en: 'Armpit' },
      'sleeveLength': { ar: 'طول الكم', en: 'Sleeve Length' },
      'forearm': { ar: 'الزند', en: 'Forearm' },
      'cuff': { ar: 'الأسوارة', en: 'Cuff' },
      'frontLength': { ar: 'طول الأمام', en: 'Front Length' },
      'backLength': { ar: 'طول الخلف', en: 'Back Length' }
    }
    const name = measurementNames[key]
    return name ? (isArabic ? name.ar : name.en) : key
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: { label: t('pending'), color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
      in_progress: { label: t('in_progress'), color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Package },
      completed: { label: t('completed'), color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
      delivered: { label: t('delivered'), color: 'text-purple-600', bgColor: 'bg-purple-100', icon: CheckCircle },
      cancelled: { label: t('cancelled'), color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  const handleMarkAsDelivered = async (orderId: string) => {
    // البحث عن الطلب
    const order = orders.find(o => o.id === orderId)
    if (!order) return

    // التحقق من وجود دفعة متبقية
    const remainingAmount = order.remaining_amount || 0
    if (remainingAmount > 0) {
      // عرض نافذة التحذير
      setOrderToDeliver(order)
      setShowPaymentWarning(true)
      return
    }

    // إذا لم يكن هناك دفعة متبقية، تسليم الطلب مباشرة
    await deliverOrder(orderId, false)
  }

  const deliverOrder = async (orderId: string, markAsPaid: boolean) => {
    setIsProcessing(true)
    try {
      // الحصول على بيانات الطلب قبل التحديث
      const order = orders.find(o => o.id === orderId)

      const updates: any = {
        status: 'delivered',
        delivery_date: new Date().toISOString()
      }

      // إذا تم اختيار "تم الدفع"، تحديث المبلغ المدفوع
      if (markAsPaid) {
        if (order) {
          updates.paid_amount = order.price
          updates.payment_status = 'paid'
        }
      }

      const result = await updateOrder(orderId, updates)
      if (result.success) {
        setDeliverySuccess(true)
        setTimeout(() => setDeliverySuccess(false), 3000)
        setShowPaymentWarning(false)
        setOrderToDeliver(null)

        // إرسال رسالة واتساب تلقائياً بعد التسليم
        if (order && order.client_phone && order.client_phone.trim() !== '') {
          try {
            sendDeliveredWhatsApp(order.client_name, order.client_phone)
            toast.success('تم فتح واتساب لإرسال رسالة التقييم للعميل', {
              icon: '📱',
              duration: 3000,
            })
          } catch (whatsappError) {
            console.error('❌ Error opening WhatsApp:', whatsappError)
            // لا نعرض رسالة خطأ هنا لأن التسليم تم بنجاح
          }
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // إرسال رسالة "جاهز للاستلام" عبر واتساب
  const handleSendReadyForPickup = (order: any) => {
    if (!order.client_phone || order.client_phone.trim() === '') {
      toast.error('لا يوجد رقم هاتف للعميل', {
        icon: '⚠️',
      })
      return
    }

    try {
      sendReadyForPickupWhatsApp(order.client_name, order.client_phone)
      toast.success('تم فتح واتساب لإرسال رسالة الاستلام', {
        icon: '📱',
        duration: 3000,
      })
    } catch (error) {
      console.error('❌ Error opening WhatsApp:', error)
      toast.error('حدث خطأ أثناء فتح واتساب', {
        icon: '⚠️',
      })
    }
  }

  const handleCloseModal = () => {
    setShowViewModal(false)
    setSelectedOrder(null)
  }

  // فتح modal حذف الطلب
  const handleDeleteOrder = (order: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setOrderToDelete(order)
    setDeleteModalOpen(true)
  }

  // تأكيد حذف الطلب
  const confirmDeleteOrder = async () => {
    if (orderToDelete) {
      const result = await deleteOrder(orderToDelete.id)

      if (result.success) {
        toast.success(t('order_deleted_success') || 'تم حذف الطلب بنجاح', {
          icon: '✓',
        })
      } else {
        toast.error(result.error || t('order_delete_error') || 'حدث خطأ أثناء حذف الطلب', {
          icon: '✗',
        })
      }

      setDeleteModalOpen(false)
      setOrderToDelete(null)
    }
  }

  // إغلاق modal حذف الطلب
  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setOrderToDelete(null)
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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      {/* الهيدر */}
      <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push(getDashboardRoute())}
              className="text-pink-600 hover:text-pink-700 transition-colors duration-300 group flex items-center space-x-2 space-x-reverse"
            >
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              <span className="text-sm font-medium">{t('back_to_dashboard') || 'العودة للوحة التحكم'}</span>
            </button>
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

        {/* البحث والفلاتر - تصميم محسّن */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6"
        >
          {/* صف واحد: حقل البحث والفلاتر - عرض أفقي حتى في الجوال */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 overflow-x-auto">
            {/* حقل البحث الشامل */}
            <div className="relative min-w-0">
              <Search className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-7 sm:pr-10 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all"
                placeholder={t('search_placeholder') || 'البحث بالاسم، رقم الهاتف، أو رقم الطلب...'}
              />
            </div>

            {/* فلتر التاريخ */}
            <div className="relative min-w-0">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all"
              />
              <Calendar className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* زر إعادة تعيين الفلاتر */}
          {(searchTerm || dateFilter) && (
            <div className="mt-3 flex justify-between items-center">
              <div className="text-xs sm:text-sm text-gray-600">
                {t('showing')} {completedOrders.length} {t('orders')}
              </div>
              <button
                onClick={() => {
                  setSearchTerm('')
                  setDateFilter('')
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all duration-300"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{t('reset_filters')}</span>
              </button>
            </div>
          )}
        </motion.div>

        {/* عداد الطلبات */}


        {/* قائمة الطلبات */}
        <div className={completedOrders.length === 0 ? "space-y-6" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
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
            completedOrders.map((order, index) => {
              const statusInfo = getStatusInfo(order.status)
              const StatusIcon = statusInfo.icon

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: Math.min(index, 5) * 0.1 }}
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
                            <span className="font-medium">{t('due_date') || (isArabic ? 'موعد التسليم:' : 'Due Date:')}</span>{' '}
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
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusInfo.bgColor}`}>
                        <StatusIcon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                        <span className={`text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>

                      {/* Action Buttons Stack */}
                      {!isWorkshopManager && (
                        <div className="flex flex-col gap-2 mt-1">
                          <Link
                            href={`/dashboard/alterations/add?orderId=${order.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-100"
                            title={t('request_alteration') || 'طلب تعديل'}
                          >
                            <Wrench className="w-4 h-4" />
                          </Link>

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSendReadyForPickup(order)
                            }}
                            disabled={!order.client_phone || order.client_phone.trim() === ''}
                            className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-green-100"
                            title={!order.client_phone ? (t('no_client_phone') || 'لا يوجد رقم هاتف للعميل') : (t('send_pickup_message') || 'إرسال رسالة استلام')}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMarkAsDelivered(order.id)
                            }}
                            disabled={isProcessing}
                            className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-purple-100"
                            title={t('mark_as_delivered') || 'تم التسليم'}
                          >
                            {isProcessing ? (
                              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <Truck className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={(e) => handleDeleteOrder(order, e)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title={t('delete_order') || 'حذف الطلب'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
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
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{t('paid') || (isArabic ? 'المدفوع' : 'Paid')}</p>
                        <p className="text-sm font-semibold text-green-600">
                          {(order.paid_amount || 0).toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      {/* نوافذ منبثقة */}
      <OrderModal
        order={selectedOrder}
        workers={workers}
        isOpen={showViewModal}
        onClose={handleCloseModal}
      />

      <RemainingPaymentWarningModal
        isOpen={showPaymentWarning}
        remainingAmount={orderToDeliver?.remaining_amount || 0}
        onCancel={() => {
          setShowPaymentWarning(false)
          setOrderToDeliver(null)
        }}
        onMarkAsPaid={() => {
          if (orderToDeliver) {
            deliverOrder(orderToDeliver.id, true)
          }
        }}
        onIgnore={() => {
          if (orderToDeliver) {
            deliverOrder(orderToDeliver.id, false)
          }
        }}
      />

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
