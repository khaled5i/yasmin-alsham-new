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
import OrderModal from '@/components/OrderModal'
import DeleteOrderModal from '@/components/DeleteOrderModal'
import VoiceNotes from '@/components/VoiceNotes'
import { sendReadyForPickupWhatsApp, sendDeliveredWhatsApp } from '@/utils/whatsapp'
import { formatGregorianDate } from '@/lib/date-utils'
import toast from 'react-hot-toast'

export default function WorkerCompletedOrdersPage() {
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
  const [selectedMonth, setSelectedMonth] = useState('')
  const [showPaymentWarning, setShowPaymentWarning] = useState(false)
  const [orderToDeliver, setOrderToDeliver] = useState<any>(null)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // حالات modal حذف الطلب
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)

  // التحقق من الصلاحيات
  useEffect(() => {
    // انتظار انتهاء التحقق من المصادقة
    if (authLoading) {
      return
    }

    if (!user) {
      router.push('/login')
      return
    }

    // السماح للعمال فقط (وخاصة الخياطين)
    if (user.role !== 'worker' && user.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    loadOrders()
    loadWorkers()
  }, [user, authLoading, router, loadOrders, loadWorkers])

  // الشهر الحالي كـ "YYYY-MM"
  const currentMonthKey = new Date().toISOString().slice(0, 7)

  // دالة لاستخراج مفتاح الشهر من الطلب (worker_completed_at أو الشهر الحالي للطلبات القديمة)
  const getOrderMonthKey = (order: any): string => {
    if (order.worker_completed_at) return order.worker_completed_at.slice(0, 7)
    return currentMonthKey
  }

  // دالة لتنسيق اسم الشهر بالعربي
  const formatMonthLabel = (monthKey: string): string => {
    const [year, month] = monthKey.split('-')
    return `${month}/${year}`
  }

  // فلترة الطلبات المكتملة فقط والخاصة بهذا العامل
  // للعمال: تظهر الطلبات المكتملة والمسلمة معاً حتى لا تختفي بعد التسليم
  // للأدمن: المكتملة فقط (لا تغيير)
  const validStatuses = user?.role !== 'admin' ? ['completed', 'delivered'] : ['completed']

  const completedOrders = orders.filter(order => {
    if (!validStatuses.includes(order.status)) return false

    // الحصول على معرف العامل الحالي
    const currentWorker = workers.find(w => w.user_id === user?.id)
    const currentWorkerId = currentWorker?.id

    // التأكد من أن الطلب يخص هذا العامل فقط (إذا لم يكن أدمن)
    if (user?.role !== 'admin') {
      if (!currentWorkerId) return false
      if (order.worker_id !== currentWorkerId) return false
    }

    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      (order.client_name || '').toLowerCase().includes(searchLower) ||
      (order.client_phone || '').toLowerCase().includes(searchLower) ||
      (order.order_number || '').toLowerCase().includes(searchLower)

    const matchesMonth = !selectedMonth || getOrderMonthKey(order) === selectedMonth

    return matchesSearch && matchesMonth
  })

  // الأشهر المتاحة مرتبة تنازلياً (من الأحدث للأقدم)
  const availableMonths: string[] = Array.from(
    new Set(
      orders
        .filter(order => {
          if (!validStatuses.includes(order.status)) return false
          const currentWorker = workers.find(w => w.user_id === user?.id)
          const currentWorkerId = currentWorker?.id
          if (user?.role !== 'admin') {
            if (!currentWorkerId) return false
            if (order.worker_id !== currentWorkerId) return false
          }
          return true
        })
        .map(o => getOrderMonthKey(o))
    )
  ).sort((a, b) => b.localeCompare(a))

  // تجميع الطلبات المفلترة حسب الشهر
  const ordersByMonth: Record<string, typeof completedOrders> = {}
  completedOrders.forEach(order => {
    const key = getOrderMonthKey(order)
    if (!ordersByMonth[key]) ordersByMonth[key] = []
    ordersByMonth[key].push(order)
  })
  // رتّب كل شهر من الأقدم للأحدث بناءً على worker_completed_at أو created_at
  Object.keys(ordersByMonth).forEach(key => {
    ordersByMonth[key].sort((a, b) => {
      const dateA = a.worker_completed_at || a.created_at
      const dateB = b.worker_completed_at || b.created_at
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })
  })
  const sortedMonthKeys = Object.keys(ordersByMonth).sort((a, b) => b.localeCompare(a))

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return t('not_specified') || 'غير محدد'
    const worker = workers.find(w => w.id === workerId)
    return worker ? (worker.user?.full_name || worker.id) : t('not_specified') || 'غير محدد'
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return ''
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  // تحديد الصلاحيات لإظهار الأزرار
  // الأدمن فقط يرى الأزرار، أما العمال ومدراء الورشة فلا يرون الأزرار (مطابق لصفحة مدير الورشة)
  const showActions = user.role === 'admin'

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
              <h1 className="text-3xl font-bold text-gray-800">{t('completed_orders')}</h1>
              <p className="text-gray-600 mt-1">
                {t('completed_orders_subtitle')}
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
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
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

            {/* فلتر الشهر */}
            <div className="relative min-w-0">
              <Filter className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full pr-7 sm:pr-10 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all bg-white appearance-none"
              >
                <option value="">{t('all_months')}</option>
                {availableMonths.map(monthKey => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthLabel(monthKey)}
                    {monthKey === currentMonthKey ? ` (${t('current_month_label')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* زر إعادة تعيين الفلاتر */}
          {(searchTerm || selectedMonth) && (
            <div className="mt-3 flex justify-between items-center">
              <div className="text-xs sm:text-sm text-gray-600">
                {t('showing')} {completedOrders.length} {t('orders')}
              </div>
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedMonth('')
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-6"
        >
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-green-600" />
                <span className="text-gray-700 font-medium">
                  {selectedMonth ? `${t('orders_of_month')} ${formatMonthLabel(selectedMonth)}` : t('total_completed_orders_label')}
                </span>
              </div>
              <span className="text-2xl font-bold text-green-600">
                {completedOrders.length}
              </span>
            </div>
          </div>
        </motion.div>

        {/* قائمة الطلبات مجمّعة حسب الشهر */}
        <div className="space-y-8">
          {completedOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 border border-pink-100 text-center"
            >
              <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {t('no_completed_orders_title')}
              </h3>
              <p className="text-gray-600">
                {t('no_completed_orders_message')}
              </p>
            </motion.div>
          ) : (
            sortedMonthKeys.map((monthKey) => (
              <div key={monthKey}>
                {/* رأس الشهر */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-xl shadow-sm">
                    <Calendar className="w-4 h-4" />
                    <span className="font-bold text-sm">
                      {formatMonthLabel(monthKey)}
                      {monthKey === currentMonthKey ? ` · ${t('current_month_label')}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white border border-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                    <Package className="w-3.5 h-3.5" />
                    <span>{ordersByMonth[monthKey].length} {t('month_orders_label')}</span>
                  </div>
                  <div className="flex-1 h-px bg-green-100" />
                </div>

                {/* طلبات الشهر */}
                <div className="space-y-4">
                {ordersByMonth[monthKey].map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                onClick={() => handleViewOrder(order)}
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-pink-300 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* معلومات الطلب الأساسية */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold shrink-0">
                            {ordersByMonth[monthKey].length - index}
                          </span>
                          <h3 className="text-lg font-semibold text-gray-800">
                            {order.client_name}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color}`}>
                            {getStatusInfo(order.status).label}
                          </span>
                        </div>
                        <p className="text-sm text-pink-600 font-medium">{order.description}</p>
                        <p className="text-xs text-gray-500 mt-1">#{order.order_number || order.id}</p>
                      </div>
                    </div>

                    {/* تفاصيل الطلب */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
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
                          <span className="truncate">{order.client_phone}</span>
                        </div>
                      )}
                    </div>

                    {/* تاريخ إنهاء العمل - للعمال فقط */}
                    {user?.role !== 'admin' && order.worker_completed_at && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-green-700">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <span>
                          {t('completed_at_label')}:{' '}
                          <span className="font-semibold">
                            {formatDateTime(order.worker_completed_at!)}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* السعر - مخفي للعمال */}
                  </div>

                  {/* الإجراءات */}
                  {showActions && (
                    <div className="flex lg:flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/dashboard/alterations/add?orderId=${order.id}`}
                        className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg transition-all duration-200 text-center"
                        title={t('request_alteration') || 'طلب تعديل'}
                      >
                        <Wrench className="w-5 h-5 mx-auto" />
                      </Link>

                      <button
                        onClick={() => handleSendReadyForPickup(order)}
                        disabled={!order.client_phone || order.client_phone.trim() === ''}
                        className="p-3 bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 rounded-lg transition-all duration-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!order.client_phone ? 'لا يوجد رقم هاتف للعميل' : 'إرسال رسالة استلام'}
                      >
                        <MessageCircle className="w-5 h-5 mx-auto" />
                      </button>

                      <button
                        onClick={() => handleMarkAsDelivered(order.id)}
                        disabled={isProcessing}
                        className="p-3 bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200 rounded-lg transition-all duration-200 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="تم التسليم"
                      >
                        {isProcessing ? (
                          <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        ) : (
                          <Truck className="w-5 h-5 mx-auto" />
                        )}
                      </button>

                      <button
                        onClick={(e) => handleDeleteOrder(order, e)}
                        className="p-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-all duration-200 text-center"
                        title={t('delete_order') || 'حذف الطلب'}
                      >
                        <Trash2 className="w-5 h-5 mx-auto" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
                </div>
              </div>
            ))
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
            <span>{t('delivery_success_message')}</span>
          </motion.div>
        </div>
      )}

      {/* نافذة التحذير عند وجود دفعة متبقية */}
      <RemainingPaymentWarningModal
        isOpen={showPaymentWarning}
        remainingAmount={orderToDeliver?.remaining_amount || 0}
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
        onCancel={() => {
          setShowPaymentWarning(false)
          setOrderToDeliver(null)
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
