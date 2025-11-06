'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import OrderModal from '@/components/OrderModal'
import EditOrderModal from '@/components/EditOrderModal'
import CompletedWorkUpload from '@/components/CompletedWorkUpload'
import DeleteOrderModal from '@/components/DeleteOrderModal'
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
  Trash2
} from 'lucide-react'

export default function OrdersPage() {
  const { user } = useAuthStore()
  const { orders, loadOrders, updateOrder, deleteOrder, startOrderWork, completeOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, language, changeLanguage, isArabic } = useTranslation()
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
  const [searchType, setSearchType] = useState<'text' | 'orderNumber'>('text')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completedImages, setCompletedImages] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // حالات modal حذف الطلب
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

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
    return worker ? worker.full_name : null
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

    if (updates.clientName) supabaseUpdates.client_name = updates.clientName
    if (updates.clientPhone) supabaseUpdates.client_phone = updates.clientPhone
    if (updates.description) supabaseUpdates.description = updates.description
    if (updates.fabric !== undefined) supabaseUpdates.fabric = updates.fabric
    if (updates.price !== undefined) supabaseUpdates.price = updates.price
    if (updates.status) supabaseUpdates.status = updates.status
    if (updates.assignedWorker !== undefined) supabaseUpdates.worker_id = updates.assignedWorker
    if (updates.dueDate) supabaseUpdates.due_date = updates.dueDate
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes
    if (updates.voiceNotes !== undefined) {
      supabaseUpdates.voice_notes = updates.voiceNotes.map((vn: any) => vn.data)
    }
    if (updates.images !== undefined) supabaseUpdates.images = updates.images
    if (updates.measurements) supabaseUpdates.measurements = updates.measurements

    await updateOrder(orderId, supabaseUpdates)
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
      await deleteOrder(orderToDelete.id)
      setDeleteModalOpen(false)
      setOrderToDelete(null)
      setDeleteSuccess(true)

      // إخفاء رسالة النجاح بعد 3 ثوان
      setTimeout(() => {
        setDeleteSuccess(false)
      }, 3000)
    }
  }

  // إغلاق modal حذف الطلب
  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setOrderToDelete(null)
  }

  // بدء العمل في الطلب (للعمال)
  const handleStartWork = async (orderId: string) => {
    if (!user || user.role !== 'worker') return

    setIsProcessing(true)
    try {
      console.log('▶️ Starting work on order:', orderId)
      await startOrderWork(orderId)
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
      await completeOrder(selectedOrder.id, completedImages)
      setShowCompleteModal(false)
      setSelectedOrder(null)
      setCompletedImages([])
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      calendar: 'gregory'
    })
  }

  const filteredOrders = orders.filter(order => {
    // فلترة حسب الدور - العمال يرون طلباتهم فقط
    // يجب مقارنة order.worker_id مع worker.id (وليس user.id)
    let matchesRole = user?.role === 'admin'

    if (!matchesRole && user?.role === 'worker') {
      // البحث عن العامل الذي user_id يطابق user.id
      const currentWorker = workers.find(w => w.user_id === user.id)
      if (currentWorker) {
        matchesRole = order.worker_id === currentWorker.id
      }
    }

    const matchesSearch = searchType === 'orderNumber'
      ? (order.order_number || order.id).toLowerCase().includes(searchTerm.toLowerCase())
      : (order.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.order_number || order.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.description || '').toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter

    return matchesRole && matchesSearch && matchesStatus
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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard')} {t('dashboard')}</span>
          </Link>
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

        {/* البحث والفلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 mb-8"
        >
          <div className="grid md:grid-cols-2 gap-4">
            {/* البحث */}
            <div className="space-y-3">
              {/* أزرار تبديل نوع البحث */}
              <div className="flex space-x-2 space-x-reverse">
                <button
                  onClick={() => {
                    setSearchType('text')
                    setSearchTerm('')
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    searchType === 'text'
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t('search_by_text')}
                </button>
                <button
                  onClick={() => {
                    setSearchType('orderNumber')
                    setSearchTerm('')
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    searchType === 'orderNumber'
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t('search_by_order_number')}
                </button>
              </div>

              {/* حقل البحث */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                {searchType === 'orderNumber' ? (
                  <NumericInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    type="orderNumber"
                    placeholder={t('enter_order_number')}
                    className="pr-10"
                  />
                ) : (
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                    placeholder={t('search_placeholder')}
                  />
                )}
              </div>
            </div>

            {/* فلتر الحالة */}
            <div className="relative">
              <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
              >
                <option value="all">{t('all_orders')}</option>
                <option value="pending">{t('pending')}</option>
                <option value="in_progress">{t('in_progress')}</option>
                <option value="completed">{t('completed')}</option>
                <option value="delivered">{t('delivered')}</option>
              </select>
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
                      
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color}`}>
                        {getStatusInfo(order.status).label}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Calendar className="w-4 h-4" />
                        <span>{t('order_date_label')}: {formatDate(order.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Clock className="w-4 h-4" />
                        <span>{t('delivery_date_label')}: {formatDate(order.due_date)}</span>
                      </div>
                      {order.worker_id && (
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <User className="w-4 h-4" />
                          <span>{t('worker_label')}: {getWorkerName(order.worker_id)}</span>
                        </div>
                      )}
                      {order.fabric && (
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <Package className="w-4 h-4" />
                          <span>{t('fabric_label')} {order.fabric}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* السعر والحالة */}
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">{t('price_label')}</p>
                      <p className="text-lg font-bold text-green-600">{order.price} {t('sar')}</p>
                    </div>

                    {order.notes && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">{t('notes_label')}</p>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{order.notes}</p>
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
                      <span>{t('view')}</span>
                    </button>

                    {user.role === 'admin' && (
                      <>
                        <button
                          onClick={() => handleEditOrder(order)}
                          className="btn-primary py-2 px-4 text-sm inline-flex items-center justify-center space-x-1 space-x-reverse"
                        >
                          <Edit className="w-4 h-4" />
                          <span>{t('edit')}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteOrder(order)}
                          className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 text-sm inline-flex items-center justify-center space-x-1 space-x-reverse rounded-lg transition-colors duration-200"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{t('delete')}</span>
                        </button>
                      </>
                    )}

                    {/* أزرار العامل */}
                    {user.role === 'worker' && order.worker_id === user.id && (
                      <>
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleStartWork(order.id)}
                            disabled={isProcessing}
                            className="bg-blue-600 text-white py-2 px-4 text-sm rounded-lg hover:bg-blue-700 transition-colors duration-300 inline-flex items-center justify-center space-x-1 space-x-reverse disabled:opacity-50"
                          >
                            <Package className="w-4 h-4" />
                            <span>{t('start_work')}</span>
                          </button>
                        )}

                        {order.status === 'in_progress' && (
                          <button
                            onClick={() => handleOpenCompleteModal(order)}
                            disabled={isProcessing}
                            className="bg-green-600 text-white py-2 px-4 text-sm rounded-lg hover:bg-green-700 transition-colors duration-300 inline-flex items-center justify-center space-x-1 space-x-reverse disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>{t('complete_order')}</span>
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

        {/* إحصائيات سريعة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-yellow-600 mb-1">
              {orders.filter(o => {
                const currentWorker = workers.find(w => w.user_id === user.id)
                const matchesRole = user.role === 'admin' || (currentWorker && o.worker_id === currentWorker.id)
                return matchesRole && o.status === 'pending'
              }).length}
            </div>
            <div className="text-sm text-gray-600">{t('pending')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-blue-600 mb-1">
              {orders.filter(o => {
                const currentWorker = workers.find(w => w.user_id === user.id)
                const matchesRole = user.role === 'admin' || (currentWorker && o.worker_id === currentWorker.id)
                return matchesRole && o.status === 'in_progress'
              }).length}
            </div>
            <div className="text-sm text-gray-600">{t('in_progress')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {orders.filter(o => {
                const currentWorker = workers.find(w => w.user_id === user.id)
                const matchesRole = user.role === 'admin' || (currentWorker && o.worker_id === currentWorker.id)
                return matchesRole && o.status === 'completed'
              }).length}
            </div>
            <div className="text-sm text-gray-600">{t('completed')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-purple-600 mb-1">
              {orders.filter(o => {
                const currentWorker = workers.find(w => w.user_id === user.id)
                const matchesRole = user.role === 'admin' || (currentWorker && o.worker_id === currentWorker.id)
                return matchesRole && o.status === 'delivered'
              }).length}
            </div>
            <div className="text-sm text-gray-600">{t('delivered')}</div>
          </div>
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

                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <div className="flex items-start space-x-3 space-x-reverse">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-yellow-800 mb-1">{t('important_warning')}</p>
                      <p className="text-yellow-700 text-sm">
                        {t('complete_order_warning')}
                      </p>
                    </div>
                  </div>
                </div>

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
                    disabled={isProcessing}
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

        {/* رسالة نجاح الحذف */}
        {deleteSuccess && (
          <div className="fixed top-4 right-4 z-50">
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 space-x-reverse"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{t('order_deleted_successfully')}</span>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}
