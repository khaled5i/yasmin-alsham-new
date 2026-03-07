'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { orderService } from '@/lib/services/order-service'
import { formatGregorianDate } from '@/lib/date-utils'
import { useAppResume } from '@/hooks/useAppResume'
import OrderModal from '@/components/OrderModal'
import EditOrderModal from '@/components/EditOrderModal'
import CompletedWorkUpload from '@/components/CompletedWorkUpload'
import DeleteOrderModal from '@/components/DeleteOrderModal'
import MeasurementsModal from '@/components/MeasurementsModal'
import NumericInput from '@/components/NumericInput'
import OrderDateFilterPicker from '@/components/OrderDateFilterPicker'
import PaginationControls from '@/components/PaginationControls'
import {
  ArrowRight,
  Package,
  Search,
  Filter,
  Eye,
  Edit,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  User,
  X,
  Languages,
  Trash2,
  TrendingUp,
  Loader,
  PackageCheck,
  Truck,
  Camera,
  Ruler,
  Printer
} from 'lucide-react'
import PrintOrderModal from '@/components/PrintOrderModal'

const PAGE_SIZE = 50

function OrdersPageInner() {
  const { user, isLoading: authLoading } = useAuthStore()
  const {
    orders,
    loadOrders,
    updateOrder,
    deleteOrder,
    startOrderWork,
    completeOrder,
    isLoading: ordersLoading,
    totalOrders
  } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, language, changeLanguage, isArabic } = useTranslation()
  const { getDashboardRoute, workerType } = useWorkerPermissions()
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)

  // التحقق من الصلاحيات وتحميل البيانات
  useEffect(() => {
    // انتظار انتهاء التحقق من المصادقة
    if (authLoading) {
      return
    }

    if (!user) {
      router.push('/login')
      return
    }

    // تحميل الطلبات والعمال - server-side status filtering
    // Only load active orders (exclude delivered/completed to reduce payload)
    loadOrders({
      status: ['pending', 'in_progress', 'cancelled'],
      page: currentPage,
      pageSize: PAGE_SIZE
    })
    loadWorkers()
  }, [user, authLoading, router, loadOrders, loadWorkers, currentPage])

  // Re-fetch data when the app resumes from background (mobile).
  // This ensures that data is refreshed after the session token is updated.
  useAppResume(() => {
    if (!user) return
    console.log('🔄 OrdersPage: re-fetching data after app resume')
    loadOrders({
      status: ['pending', 'in_progress', 'cancelled'],
      page: currentPage,
      pageSize: PAGE_SIZE
    })
    loadWorkers()
  })

  const searchParams = useSearchParams()

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilterType, setDateFilterType] = useState<'received' | 'delivery'>('received')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  // Read URL query params on first render (set from schedule calendar page)
  useEffect(() => {
    const dateParam = searchParams?.get('date')
    const typeParam = searchParams?.get('type')
    if (dateParam) setDateFilter(dateParam)
    if (typeParam === 'delivery' || typeParam === 'proof') {
      setDateFilterType('delivery')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (totalOrders === null) return

    const maxPage = Math.max(0, Math.ceil(totalOrders / PAGE_SIZE) - 1)
    if (currentPage > maxPage) {
      setCurrentPage(maxPage)
    }
  }, [currentPage, totalOrders])

  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completedImages, setCompletedImages] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // حالات modal حذف الطلب
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)

  // حالات modal المقاسات
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false)
  const [measurementsOrder, setMeasurementsOrder] = useState<any>(null)

  // حالات modal الطباعة
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printOrder, setPrintOrder] = useState<any>(null)
  const [measurementsSaveSuccess, setMeasurementsSaveSuccess] = useState(false)
  const [measurementsSaveError, setMeasurementsSaveError] = useState<string | null>(null)

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: { label: t('pending') || (isArabic ? 'قيد الانتظار' : 'Pending'), color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
      in_progress: { label: t('in_progress') || (isArabic ? 'جاري التنفيذ' : 'In Progress'), color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Package },
      completed: { label: t('completed') || (isArabic ? 'مكتمل' : 'Completed'), color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
      delivered: { label: t('delivered') || (isArabic ? 'تم التسليم' : 'Delivered'), color: 'text-purple-600', bgColor: 'bg-purple-100', icon: CheckCircle },
      cancelled: { label: t('cancelled') || (isArabic ? 'ملغي' : 'Cancelled'), color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  // الحصول على اسم العامل
  const getWorkerName = (workerId?: string) => {
    if (!workerId) return null
    const worker = workers.find(w => w.id === workerId)
    return worker?.user?.full_name || null
  }

  // فتح نافذة العرض
  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  // فتح نافذة التعديل
  const handleEditOrder = (order: any) => {
    setSelectedOrder(order)
    setShowEditModal(true)
  }

  // حفظ التعديلات
  const handleSaveOrder = async (orderId: string, updates: any) => {
    console.log('💾 Saving order updates:', orderId, updates)

    // تحويل البيانات إلى صيغة Supabase
    // ملاحظة: EditOrderModal يُرسل البيانات بصيغة snake_case مباشرة
    const supabaseUpdates: any = {}

    // المعلومات الأساسية - دعم كلا الصيغتين (snake_case و camelCase)
    if (updates.order_number !== undefined) supabaseUpdates.order_number = updates.order_number || null
    else if (updates.orderNumber !== undefined) supabaseUpdates.order_number = updates.orderNumber || null

    if (updates.client_name) supabaseUpdates.client_name = updates.client_name
    else if (updates.clientName) supabaseUpdates.client_name = updates.clientName

    if (updates.client_phone) supabaseUpdates.client_phone = updates.client_phone
    else if (updates.clientPhone) supabaseUpdates.client_phone = updates.clientPhone

    if (updates.description !== undefined) supabaseUpdates.description = updates.description
    if (updates.fabric !== undefined) supabaseUpdates.fabric = updates.fabric
    if (updates.price !== undefined) supabaseUpdates.price = updates.price
    if (updates.paid_amount !== undefined) supabaseUpdates.paid_amount = updates.paid_amount

    if (updates.payment_method !== undefined) supabaseUpdates.payment_method = updates.payment_method
    else if (updates.paymentMethod !== undefined) supabaseUpdates.payment_method = updates.paymentMethod

    // ملاحظة: payment_status سيتم حسابه تلقائياً بواسطة trigger في قاعدة البيانات
    if (updates.status) supabaseUpdates.status = updates.status

    // تحويل string فارغ إلى null لحقول UUID
    if (updates.worker_id !== undefined) {
      supabaseUpdates.worker_id = updates.worker_id === '' ? null : updates.worker_id
    } else if (updates.assignedWorker !== undefined) {
      supabaseUpdates.worker_id = updates.assignedWorker === '' ? null : updates.assignedWorker
    }

    if (updates.order_received_date) supabaseUpdates.order_received_date = updates.order_received_date
    else if (updates.orderReceivedDate) supabaseUpdates.order_received_date = updates.orderReceivedDate

    if (updates.due_date) supabaseUpdates.due_date = updates.due_date
    else if (updates.dueDate) supabaseUpdates.due_date = updates.dueDate

    if (updates.proof_delivery_date !== undefined) {
      supabaseUpdates.proof_delivery_date = updates.proof_delivery_date || null
    }

    // الملاحظات الإضافية
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes

    // الملاحظات الصوتية
    if (updates.voice_notes !== undefined) {
      supabaseUpdates.voice_notes = updates.voice_notes
    } else if (updates.voiceNotes !== undefined) {
      supabaseUpdates.voice_notes = updates.voiceNotes.map((vn: any) => typeof vn === 'string' ? vn : vn.data)
    }

    if (updates.voice_transcriptions !== undefined) {
      supabaseUpdates.voice_transcriptions = updates.voice_transcriptions
    }

    // الصور
    if (updates.images !== undefined) supabaseUpdates.images = updates.images

    // تعليقات التصميم - يجب تخزينها في measurements
    const hasMeasurementsUpdates =
      updates.saved_design_comments !== undefined ||
      updates.image_annotations !== undefined ||
      updates.image_drawings !== undefined ||
      updates.custom_design_image !== undefined ||
      updates.measurements !== undefined

    if (hasMeasurementsUpdates) {
      const normalizedSavedDesignComments = updates.saved_design_comments !== undefined
        ? updates.saved_design_comments.map((comment: any) => ({
          ...comment,
          image: typeof comment.image === 'string' && comment.image.startsWith('data:')
            ? 'custom'
            : (comment.image || null)
        }))
        : undefined

      // جلب البيانات الكاملة للطلب من قاعدة البيانات (القائمة تستخدم التحميل الخفيف بدون measurements)
      let currentMeasurements: any = {}
      try {
        const fullOrderResult = await orderService.getById(orderId)
        if (fullOrderResult.data) {
          currentMeasurements = (fullOrderResult.data.measurements as any) || {}
        }
      } catch (err) {
        console.error('⚠️ Failed to fetch full order for measurements merge:', err)
      }

      supabaseUpdates.measurements = {
        ...currentMeasurements,
        ...(updates.measurements || {}),
        ...(updates.saved_design_comments !== undefined && { saved_design_comments: normalizedSavedDesignComments }),
        ...(updates.image_annotations !== undefined && { image_annotations: updates.image_annotations }),
        ...(updates.image_drawings !== undefined && { image_drawings: updates.image_drawings }),
        ...(updates.custom_design_image !== undefined && { custom_design_image: updates.custom_design_image })
      }
    }

    console.log('📤 Sending to Supabase:', JSON.stringify(supabaseUpdates, null, 2))

    const result = await updateOrder(orderId, supabaseUpdates)

    console.log('📥 Result from updateOrder:', result)

    if (result.success) {
      toast.success(t('order_updated_success') || 'تم تحديث الطلب بنجاح', {
        icon: '✓',
      })
    } else {
      toast.error(result.error || t('order_update_error') || 'حدث خطأ أثناء تحديث الطلب', {
        icon: '✗',
      })
    }

    setShowEditModal(false)
    setSelectedOrder(null)
  }

  // إغلاق النوافذ
  const handleCloseModals = () => {
    setShowViewModal(false)
    setShowEditModal(false)
    setShowCompleteModal(false)
    setSelectedOrder(null)
    setCompletedImages([])
  }

  // فتح modal حذف الطلب
  const handleDeleteOrder = (order: any) => {
    setOrderToDelete(order)
    setDeleteModalOpen(true)
  }

  // تأكيد حذف الطلب
  const confirmDeleteOrder = async () => {
    if (orderToDelete) {
      console.log('🗑️ Deleting order:', orderToDelete.id)
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

  // فتح modal المقاسات
  const handleOpenMeasurements = async (order: any) => {
    // يجب تحميل تفاصيل الطلب الكاملة أولاً لأن القائمة تحمل بيانات "خفيفة" فقط
    // وهذا ضروري لضمان وجود حقل measurements بكامل محتوياته (بما في ذلك التعليقات)
    setIsProcessing(true)
    try {
      // استخدام loadOrderById من المتجر للحصول على أحدث البيانات الكاملة
      // ولكننا نحتاج إلى التعامل مع النتيجة مباشرة هنا
      // لذلك سنستخدم orderService مباشرة أو نعتمد على أن loadOrderById يضع النتيجة في currentOrder
      // الأفضل هنا هو طلب البيانات مباشرة لضمان عدم التداخل مع currentOrder المستخدم في مكان آخر

      /* 
         ملاحظة: يمكننا استخدام loadOrderById من الـ store، لكنها ستغير state.currentOrder
         وهذا قد يؤثر على أشياء أخرى إذا كانت مفتوحة.
         لذلك سنستخدم orderService مباشرة هنا للحصول على البيانات وتمريرها للمودال.
      */
      const { orderService } = await import('@/lib/services/order-service')
      const result = await orderService.getById(order.id)

      if (result.error || !result.data) {
        toast.error(t('error_loading_order') || 'خطأ في تحميل تفاصيل الطلب')
        return
      }

      setMeasurementsOrder(result.data)
      setShowMeasurementsModal(true)
    } catch (error) {
      console.error('Error fetching full order details:', error)
      toast.error(t('error_loading_order') || 'خطأ في تحميل تفاصيل الطلب')
    } finally {
      setIsProcessing(false)
    }
  }

  // فتح modal الطباعة
  const handlePrintOrder = (order: any) => {
    setPrintOrder(order)
    setShowPrintModal(true)
  }

  // حفظ المقاسات
  const handleSaveMeasurements = async (measurements: any) => {
    if (!measurementsOrder) return

    try {
      // الحفاظ على بيانات التعليقات والرسومات عند حفظ المقاسات
      const existingMeasurements = measurementsOrder.measurements || {}
      const updatedMeasurements = {
        ...measurements,
        // الاحتفاظ بالتعليقات والرسومات والصورة المخصصة
        saved_design_comments: existingMeasurements.saved_design_comments || [],
        image_annotations: existingMeasurements.image_annotations || [],
        image_drawings: existingMeasurements.image_drawings || [],
        custom_design_image: existingMeasurements.custom_design_image || null
      }

      const result = await updateOrder(measurementsOrder.id, { measurements: updatedMeasurements })

      if (result.success) {
        setMeasurementsSaveSuccess(true)
        setTimeout(() => setMeasurementsSaveSuccess(false), 1200)
        setShowMeasurementsModal(false)
        setMeasurementsOrder(null)
      } else {
        setMeasurementsSaveError(result.error || t('measurements_save_error') || 'حدث خطأ أثناء حفظ المقاسات')
      }
    } catch (error) {
      console.error('Error saving measurements:', error)
      setMeasurementsSaveError(t('measurements_save_error') || 'حدث خطأ أثناء حفظ المقاسات')
    }
  }

  // بدء العمل في الطلب (للعمال)
  const handleStartWork = async (orderId: string) => {
    if (!user || user.role !== 'worker') return

    setIsProcessing(true)
    try {
      console.log('▶️ Starting work on order:', orderId)
      const result = await startOrderWork(orderId)

      if (result.success) {
        toast.success(t('work_started_success') || 'تم بدء العمل على الطلب', {
          icon: '✓',
        })
      } else {
        toast.error(result.error || t('work_start_error') || 'حدث خطأ أثناء بدء العمل', {
          icon: '✗',
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // فتح نافذة إنهاء الطلب
  const handleOpenCompleteModal = (order: any) => {
    setSelectedOrder(order)
    setShowCompleteModal(true)
  }

  // إنهاء الطلب (للعمال)
  const handleCompleteWork = async () => {
    if (!selectedOrder || !user || user.role !== 'worker') return

    setIsProcessing(true)
    try {
      console.log('✅ Completing order:', selectedOrder.id)
      const result = await completeOrder(selectedOrder.id, completedImages)

      if (result.success) {
        toast.success(t('order_completed_success') || 'تم إنهاء العمل على الطلب بنجاح', {
          icon: '✓',
        })
        setShowCompleteModal(false)
        setSelectedOrder(null)
        setCompletedImages([])
      } else {
        toast.error(result.error || t('order_complete_error') || 'حدث خطأ أثناء إنهاء العمل', {
          icon: '✗',
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return formatGregorianDate(dateString, 'ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // الحصول على معرف العامل الحالي
  const getCurrentWorkerId = () => {
    if (user?.role !== 'worker') return null
    const currentWorker = workers.find(w => w.user_id === user.id)
    return currentWorker?.id || null
  }

  const currentWorkerId = getCurrentWorkerId()

  const filteredOrders = orders.filter(order => {
    // Server-side filtering already excludes delivered/completed orders.
    // Client-side filtering handles search, role, and date only.

    // فلترة حسب الدور
    // - Admin: يرى جميع الطلبات
    // - Workshop Manager: يرى جميع الطلبات
    // - العمال الآخرون: يرون طلباتهم المعينة لهم فقط
    let matchesRole = user?.role === 'admin' || workerType === 'workshop_manager'

    if (!matchesRole && user?.role === 'worker') {
      // البحث عن العامل الذي user_id يطابق user.id
      const currentWorker = workers.find(w => w.user_id === user.id)
      if (currentWorker) {
        matchesRole = order.worker_id === currentWorker.id
      }
    }

    // البحث الشامل في جميع الحقول: الاسم، الهاتف، رقم الطلب
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      (order.client_name || '').toLowerCase().includes(searchLower) ||
      (order.client_phone || '').toLowerCase().includes(searchLower) ||
      (order.order_number || '').toLowerCase().includes(searchLower)

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter

    const selectedOrderDate = dateFilterType === 'received'
      ? (order.order_received_date || order.created_at)
      : order.due_date

    const matchesDate = !dateFilter || Boolean(selectedOrderDate?.startsWith(dateFilter))

    return matchesRole && matchesSearch && matchesStatus && matchesDate
  })

  // عرض شاشة التحميل أثناء التحقق من المصادقة
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{authLoading ? 'جاري التحقق من الجلسة...' : t('loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <button
            onClick={() => router.push(getDashboardRoute())}
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard')}</span>
          </button>
        </motion.div>

        {/* العنوان والأزرار */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                {t('orders')}
              </span>
            </h1>
            <p className="text-lg text-gray-600">
              {t('view_manage_orders')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user.role === 'admin' && (
              <Link
                href="/dashboard/add-order"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse px-6 py-3 group"
              >
                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>{t('add_new_order')}</span>
              </Link>
            )}
          </div>
        </motion.div>

        {/* البحث والفلاتر - تصميم محسّن */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6"
        >
          {/* صف واحد: حقل البحث والفلاتر - عرض أفقي حتى في الجوال */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 overflow-x-auto">
            {/* حقل البحث الشامل */}
            <div className="relative min-w-0">
              <Search className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-7 sm:pr-10 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all"
                placeholder={isArabic ? 'بحث...' : 'Search...'}
              />
            </div>

            {/* فلتر الحالة */}
            <div className="relative min-w-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all appearance-none bg-white"
              >
                <option value="all">{t('all_orders')}</option>
                <option value="pending">{t('pending')}</option>
                <option value="in_progress">{t('in_progress')}</option>
              </select>
              <Filter className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* فلتر التاريخ */}
            <div className="min-w-0">
              <OrderDateFilterPicker
                selectedDate={dateFilter}
                onDateChange={setDateFilter}
                filterType={dateFilterType}
                onFilterTypeChange={setDateFilterType}
                orders={orders}
              />
            </div>
          </div>
        </motion.div>

        {/* قائمة الطلبات */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className={filteredOrders.length === 0 ? "space-y-6" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}
        >
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-600 mb-2">
                {user.role === 'worker' ? t('no_orders_assigned') : t('no_orders_found')}
              </h3>
              <p className="text-gray-500">
                {user.role === 'worker'
                  ? t('no_orders_assigned_desc')
                  : t('no_orders_found_desc')
                }
              </p>
            </div>
          ) : (
            filteredOrders.map((order, index) => {
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
                          <span className="font-medium">{t('phone') || (isArabic ? 'الهاتف:' : 'Phone:')}</span> <span dir="ltr">{order.client_phone}</span>
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
                      <div className="flex flex-col gap-2 mt-1">
                        {/* Admin Buttons */}
                        {user.role === 'admin' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenMeasurements(order)
                              }}
                              className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-100"
                              title={order.measurements && Object.keys(order.measurements).length > 0 ? (t('edit_measurements') || 'تعديل المقاسات') : (t('add_measurements') || 'إضافة مقاسات')}
                            >
                              <Ruler className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditOrder(order)
                              }}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                              title={t('edit') || 'تعديل'}
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePrintOrder(order)
                              }}
                              className="p-2 text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors border border-transparent hover:border-pink-100"
                              title={t('print_order') || 'طباعة'}
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteOrder(order)
                              }}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                              title={t('delete') || 'حذف'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {/* Worker Buttons */}
                        {user.role === 'worker' && currentWorkerId && order.worker_id === currentWorkerId && (
                          <>
                            {order.status === 'pending' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStartWork(order.id)
                                }}
                                disabled={isProcessing}
                                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-blue-100"
                                title={t('start_work') || 'بدء العمل'}
                              >
                                {isProcessing ? (
                                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Package className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            {order.status === 'in_progress' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenCompleteModal(order)
                                }}
                                disabled={isProcessing}
                                className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-green-100"
                                title={t('complete_order') || 'إنهاء الطلب'}
                              >
                                {isProcessing ? (
                                  <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer - Price (Full Width) */}
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
          )}</motion.div >

        {/* النوافذ المنبثقة */}
        < OrderModal
          order={selectedOrder}
          workers={workers}
          isOpen={showViewModal}
          onClose={handleCloseModals}
        />

        <EditOrderModal
          order={selectedOrder}
          workers={workers}
          isOpen={showEditModal}
          onClose={handleCloseModals}
          onSave={handleSaveOrder}
        />

        {/* نافذة إنهاء الطلب */}
        {
          showCompleteModal && selectedOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModals} />

              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-800">{t('complete_order_modal_title')}</h3>
                    <button
                      onClick={handleCloseModals}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg font-medium text-gray-800 mb-2">
                      {t('order_label')} {selectedOrder.description}
                    </h4>
                    <p className="text-gray-600">
                      {t('for_client')} {selectedOrder.client_name}
                    </p>
                  </div>

                  <CompletedWorkUpload
                    onImagesChange={setCompletedImages}
                    maxImages={3}
                    disabled={isProcessing}
                  />

                  {/* رسالة التحذير - رفع الصور إلزامي */}
                  <div className={`p-4 rounded-lg border ${completedImages.length === 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                    }`}>
                    <div className="flex items-start space-x-3 space-x-reverse">
                      <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${completedImages.length === 0
                        ? 'text-red-600'
                        : 'text-yellow-600'
                        }`} />
                      <div>
                        <p className={`font-medium mb-1 ${completedImages.length === 0
                          ? 'text-red-800'
                          : 'text-yellow-800'
                          }`}>
                          {completedImages.length === 0
                            ? 'تنبيه مهم - رفع الصور إلزامي'
                            : t('important_warning')}
                        </p>
                        <p className={`text-sm ${completedImages.length === 0
                          ? 'text-red-700'
                          : 'text-yellow-700'
                          }`}>
                          {completedImages.length === 0
                            ? 'يجب رفع صورة واحدة على الأقل للعمل المكتمل قبل إنهاء الطلب. الصور ضرورية لتوثيق جودة العمل.'
                            : t('complete_order_warning')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* رسالة التحقق عند عدم رفع صور */}
                  {completedImages.length === 0 && (
                    <div className="bg-red-100 border-l-4 border-red-500 p-4 rounded">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Camera className="w-5 h-5 text-red-600 flex-shrink-0" />
                        <p className="text-sm font-medium text-red-800">
                          لا يمكن إنهاء الطلب بدون رفع صور للعمل المكتمل
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4 justify-end">
                    <button
                      onClick={handleCloseModals}
                      disabled={isProcessing}
                      className="btn-secondary px-6 py-2"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleCompleteWork}
                      disabled={isProcessing || completedImages.length === 0}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 space-x-reverse"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>{t('completing')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>{t('complete_order')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )
        }

        {/* نافذة حذف الطلب */}
        <PaginationControls
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          totalItems={totalOrders ?? filteredOrders.length}
          currentCount={filteredOrders.length}
          isLoading={ordersLoading}
          onPageChange={setCurrentPage}
        />

        <DeleteOrderModal
          isOpen={deleteModalOpen}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteOrder}
          orderInfo={orderToDelete}
        />

        {/* نافذة المقاسات */}
        {
          measurementsOrder && (
            <MeasurementsModal
              isOpen={showMeasurementsModal}
              onClose={() => {
                setShowMeasurementsModal(false)
                setMeasurementsOrder(null)
              }}
              onSave={handleSaveMeasurements}
              initialMeasurements={measurementsOrder.measurements || {}}
              orderId={measurementsOrder.id}
            />
          )
        }

        {/* مودال الطباعة */}
        {
          printOrder && (
            <PrintOrderModal
              isOpen={showPrintModal}
              onClose={() => {
                setShowPrintModal(false)
                setPrintOrder(null)
              }}
              order={printOrder}
            />
          )
        }
        {/* مودال رسالة نجاح حفظ المقاسات - تصميم مطابق لصفحة الأقمشة */}
        {measurementsSaveSuccess && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">تم إتمام الإجراء بنجاح</h3>
            </motion.div>
          </div>
        )}

        {/* مودال رسالة خطأ حفظ المقاسات - تصميم مطابق لصفحة الأقمشة */}
        {measurementsSaveError && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setMeasurementsSaveError(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">{measurementsSaveError}</h3>
              <button
                onClick={() => setMeasurementsSaveError(null)}
                className="mt-4 px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                حسناً
              </button>
            </motion.div>
          </div>
        )}
      </div >
    </div >
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OrdersPageInner />
    </Suspense>
  )
}
