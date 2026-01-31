'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import OrderModal from '@/components/OrderModal'
import EditOrderModal from '@/components/EditOrderModal'
import CompletedWorkUpload from '@/components/CompletedWorkUpload'
import DeleteOrderModal from '@/components/DeleteOrderModal'
import MeasurementsModal from '@/components/MeasurementsModal'
import NumericInput from '@/components/NumericInput'
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
  Calendar,
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

export default function OrdersPage() {
  const { user } = useAuthStore()
  const { orders, loadOrders, updateOrder, deleteOrder, startOrderWork, completeOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, language, changeLanguage, isArabic } = useTranslation()
  const { getDashboardRoute, workerType } = useWorkerPermissions()
  const router = useRouter()

  // التحقق من الصلاحيات وتحميل البيانات
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    // تحميل الطلبات والعمال
    loadOrders()
    loadWorkers()
  }, [user, router, loadOrders, loadWorkers])

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
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
    const supabaseUpdates: any = {}

    if (updates.orderNumber !== undefined) supabaseUpdates.order_number = updates.orderNumber || null
    if (updates.clientName) supabaseUpdates.client_name = updates.clientName
    if (updates.clientPhone) supabaseUpdates.client_phone = updates.clientPhone
    if (updates.description) supabaseUpdates.description = updates.description
    if (updates.fabric !== undefined) supabaseUpdates.fabric = updates.fabric
    if (updates.price !== undefined) supabaseUpdates.price = updates.price
    if (updates.paid_amount !== undefined) supabaseUpdates.paid_amount = updates.paid_amount
    // ملاحظة: payment_status سيتم حسابه تلقائياً بواسطة trigger في قاعدة البيانات
    if (updates.status) supabaseUpdates.status = updates.status
    // تحويل string فارغ إلى null لحقول UUID
    if (updates.assignedWorker !== undefined) {
      supabaseUpdates.worker_id = updates.assignedWorker === '' ? null : updates.assignedWorker
    }
    if (updates.dueDate) supabaseUpdates.due_date = updates.dueDate
    if (updates.proof_delivery_date !== undefined) {
      supabaseUpdates.proof_delivery_date = updates.proof_delivery_date || null
    }
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes
    if (updates.voiceNotes !== undefined) {
      supabaseUpdates.voice_notes = updates.voiceNotes.map((vn: any) => vn.data)
    }
    if (updates.voice_transcriptions !== undefined) {
      supabaseUpdates.voice_transcriptions = updates.voice_transcriptions
    }
    if (updates.images !== undefined) supabaseUpdates.images = updates.images
    if (updates.measurements) supabaseUpdates.measurements = updates.measurements

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
  const handleOpenMeasurements = (order: any) => {
    setMeasurementsOrder(order)
    setShowMeasurementsModal(true)
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
        image_annotations: existingMeasurements.image_annotations || [],
        image_drawings: existingMeasurements.image_drawings || [],
        custom_design_image: existingMeasurements.custom_design_image || null
      }

      const result = await updateOrder(measurementsOrder.id, { measurements: updatedMeasurements })

      if (result.success) {
        toast.success(t('measurements_saved_successfully'), {
          icon: '✓',
        })
        setShowMeasurementsModal(false)
        setMeasurementsOrder(null)
      } else {
        toast.error(result.error || t('measurements_save_error'), {
          icon: '✗',
        })
      }
    } catch (error) {
      console.error('Error saving measurements:', error)
      toast.error(t('measurements_save_error'), {
        icon: '✗',
      })
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
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory', // استخدام التقويم الميلادي
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
    // استبعاد الطلبات المسلمة - يجب أن تظهر فقط في صفحة "الطلبات المسلمة"
    if (order.status === 'delivered') {
      return false
    }

    // استبعاد الطلبات المكتملة - يجب أن تظهر فقط في صفحة "الطلبات المكتملة"
    if (order.status === 'completed') {
      return false
    }

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

    const matchesDate = !dateFilter || order.created_at.startsWith(dateFilter)

    return matchesRole && matchesSearch && matchesStatus && matchesDate
  })

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loading')}</p>
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
            <div className="relative min-w-0">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all"
              />
              <Calendar className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </motion.div>

        {/* قائمة الطلبات */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="space-y-6"
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
            filteredOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => handleViewOrder(order)}
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-pink-300 hover:shadow-md transition-all duration-200 cursor-pointer"
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
                      {order.fabric && (
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate">{order.fabric}</span>
                        </div>
                      )}
                    </div>

                    {/* السعر */}
                    {workerType !== 'workshop_manager' && (
                      <div className="mt-3 inline-flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md">
                        <span className="text-xs text-gray-600">{t('price_label')}:</span>
                        <span className="text-sm font-bold text-green-600">{order.price} {t('sar')}</span>
                      </div>
                    )}
                  </div>

                  {/* الإجراءات */}
                  <div className="flex lg:flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    {/* زر المقاسات - للمدراء فقط */}
                    {user.role === 'admin' && (
                      <>
                        <button
                          onClick={() => handleOpenMeasurements(order)}
                          className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200 rounded-lg transition-all duration-200"
                          title={order.measurements && Object.keys(order.measurements).length > 0 ? t('edit_measurements') : t('add_measurements')}
                        >
                          <Ruler className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleEditOrder(order)}
                          className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg transition-all duration-200"
                          title={t('edit')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {/* زر الطباعة */}
                        <button
                          onClick={() => handlePrintOrder(order)}
                          className="p-2 bg-pink-50 hover:bg-pink-100 text-pink-600 border border-pink-200 rounded-lg transition-all duration-200"
                          title={t('print_order')}
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteOrder(order)}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-all duration-200"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {/* أزرار العامل - تحديث حالة الطلب */}
                    {user.role === 'worker' && currentWorkerId && order.worker_id === currentWorkerId && (
                      <>
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleStartWork(order.id)}
                            disabled={isProcessing}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2 px-4 text-sm rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 inline-flex items-center justify-center space-x-1 space-x-reverse disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                          >
                            {isProcessing ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>{t('processing') || 'جاري المعالجة...'}</span>
                              </>
                            ) : (
                              <>
                                <Package className="w-4 h-4" />
                                <span>{t('start_work') || 'بدء العمل'}</span>
                              </>
                            )}
                          </button>
                        )}

                        {order.status === 'in_progress' && (
                          <button
                            onClick={() => handleOpenCompleteModal(order)}
                            disabled={isProcessing}
                            className="bg-gradient-to-r from-green-500 to-green-600 text-white py-2 px-4 text-sm rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 inline-flex items-center justify-center space-x-1 space-x-reverse disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                          >
                            {isProcessing ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>{t('processing') || 'جاري المعالجة...'}</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                <span>{t('complete_order') || 'إنهاء الطلب'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* النوافذ المنبثقة */}
        <OrderModal
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
        {showCompleteModal && selectedOrder && (
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
        )}

        {/* نافذة حذف الطلب */}
        <DeleteOrderModal
          isOpen={deleteModalOpen}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteOrder}
          orderInfo={orderToDelete}
        />

        {/* نافذة المقاسات */}
        {measurementsOrder && (
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
        )}

        {/* مودال الطباعة */}
        {printOrder && (
          <PrintOrderModal
            isOpen={showPrintModal}
            onClose={() => {
              setShowPrintModal(false)
              setPrintOrder(null)
            }}
            order={printOrder}
          />
        )}
      </div>
    </div>
  )
}
