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
  Clock,
  Image as ImageIcon,
  X,
  Ruler,
  MessageSquare,
  Hash
} from 'lucide-react'

export default function WorkerCompletedOrdersPage() {
  const { user } = useAuthStore()
  const { orders, loadOrders } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t } = useTranslation()
  const router = useRouter()

  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // التحقق من الصلاحيات - العمال فقط
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    if (user.role !== 'worker') {
      router.push('/dashboard')
      return
    }

    loadOrders()
    loadWorkers()
  }, [user, router, loadOrders, loadWorkers])

  // الحصول على معرف العامل الحالي
  const currentWorker = workers.find(w => w.user_id === user?.id)
  const currentWorkerId = currentWorker?.id

  // فلترة الطلبات المكتملة للعامل الحالي فقط
  const completedOrders = orders.filter(order => {
    if (order.status !== 'completed' && order.status !== 'delivered') return false
    if (order.worker_id !== currentWorkerId) return false

    const matchesSearch = searchTerm === '' ||
      (order.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.order_number || '').toLowerCase().includes(searchTerm.toLowerCase())

    return matchesSearch
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  const handleCloseModal = () => {
    setShowViewModal(false)
    setSelectedOrder(null)
  }

  const getStatusBadge = (status: string) => {
    if (status === 'delivered') {
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-600">✓ {t('delivered') || 'تم التسليم'}</span>
    }
    return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-600">✓ {t('completed') || 'مكتمل'}</span>
  }

  // دالة ترجمة أسماء المقاسات إلى العربية
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
    return name ? (t('language') === 'en' ? name.en : name.ar) : key
  }

  if (!user || user.role !== 'worker') {
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
              <h1 className="text-3xl font-bold text-gray-800">{t('my_completed_orders') || 'طلباتي المكتملة'}</h1>
              <p className="text-gray-600 mt-1">
                {t('worker_completed_orders_desc') || 'الطلبات التي أنهيت العمل عليها'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* البحث */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-pink-100 mb-6"
        >
          <div className="relative">
            <Package className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder={t('search_by_name_or_order') || 'ابحث باسم العميل أو رقم الطلب...'}
            />
          </div>
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
                <span className="text-gray-700 font-medium">{t('total_completed_orders') || 'إجمالي طلباتي المكتملة'}:</span>
              </div>
              <span className="text-2xl font-bold text-green-600">{completedOrders.length}</span>
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
              <h3 className="text-xl font-bold text-gray-800 mb-2">{t('no_completed_orders') || 'لا توجد طلبات مكتملة'}</h3>
              <p className="text-gray-600">{t('no_completed_orders_desc') || 'لم تكمل أي طلبات بعد. ستظهر الطلبات هنا بعد إنهائها.'}</p>
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
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* معلومات الطلب */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">{order.client_name}</h3>
                        <p className="text-pink-600 font-medium text-sm">{order.description}</p>
                        <div className="flex items-center gap-1 text-sm text-blue-600 font-medium mt-1">
                          <Hash className="w-4 h-4" />
                          <span>{order.order_number || order.id}</span>
                        </div>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(order.created_at)}</span>
                      </div>
                      {order.completed_images && order.completed_images.length > 0 && (
                        <div className="flex items-center gap-1 text-green-600">
                          <ImageIcon className="w-4 h-4" />
                          <span>{order.completed_images.length} {t('photos') || 'صور'}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* زر العرض */}
                  <button
                    onClick={() => handleViewOrder(order)}
                    className="btn-secondary py-2 px-4 text-sm inline-flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    <span>{t('view_details') || 'عرض التفاصيل'}</span>
                  </button>
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
            className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* رأس النافذة */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{t('order_details') || 'تفاصيل الطلب'}</h3>
                    <div className="flex items-center gap-1 text-sm text-blue-600 font-medium">
                      <Hash className="w-4 h-4" />
                      <span>{selectedOrder.order_number || selectedOrder.id}</span>
                    </div>
                  </div>
                </div>
                <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* محتوى النافذة */}
            <div className="p-4 space-y-4">
              {/* معلومات العميل */}
              <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-lg border border-pink-200">
                <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <User className="w-5 h-5 text-pink-600" />
                  {t('customer_information') || 'معلومات العميل'}
                </h4>
                <div className="text-sm">
                  <div>
                    <p className="text-gray-500">{t('name') || 'الاسم'}</p>
                    <p className="font-medium">{selectedOrder.client_name}</p>
                  </div>
                </div>
              </div>

              {/* معلومات الطلب */}
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  {t('order_info') || 'معلومات الطلب'}
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">{t('description') || 'الوصف'}</p>
                    <p className="font-medium">{selectedOrder.description}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t('order_date') || 'تاريخ الطلب'}</p>
                    <p className="font-medium">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t('delivery_date') || 'موعد التسليم'}</p>
                    <p className="font-medium">{formatDate(selectedOrder.due_date)}</p>
                  </div>
                </div>
              </div>

              {/* المقاسات */}
              {selectedOrder.measurements && Object.keys(selectedOrder.measurements).length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-200">
                  <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-purple-600" />
                    {t('measurements') || 'المقاسات'}
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {Object.entries(selectedOrder.measurements).map(([key, value]) => (
                      value && (
                        <div key={key} className="bg-white p-2 rounded text-center">
                          <p className="text-gray-500 text-xs">{getMeasurementName(key)}</p>
                          <p className="font-medium">{String(value)}</p>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* الملاحظات */}
              {selectedOrder.notes && (
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-4 rounded-lg border border-yellow-200">
                  <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-yellow-600" />
                    {t('notes') || 'ملاحظات'}
                  </h4>
                  <p className="text-sm text-gray-700">{selectedOrder.notes}</p>
                </div>
              )}

              {/* صور التصميم */}
              {selectedOrder.images && selectedOrder.images.length > 0 && (
                <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-lg border border-pink-200">
                  <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-pink-600" />
                    {t('design_images') || 'صور التصميم'} ({selectedOrder.images.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedOrder.images.map((img: string, idx: number) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`${t('design') || 'تصميم'} ${idx + 1}`}
                        className="w-full h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxImage(img)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* صور العمل المكتمل */}
              {selectedOrder.completed_images && selectedOrder.completed_images.length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    {t('completed_work_images') || 'صور العمل المكتمل'} ({selectedOrder.completed_images.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedOrder.completed_images.map((img: string, idx: number) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`${t('completed') || 'مكتمل'} ${idx + 1}`}
                        className="w-full h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxImage(img)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* زر الإغلاق */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 rounded-b-2xl">
              <button
                onClick={handleCloseModal}
                className="w-full btn-secondary py-2"
              >
                {t('close') || 'إغلاق'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lightbox لتكبير الصور */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxImage}
            alt={t('enlarged_image') || 'صورة مكبرة'}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
