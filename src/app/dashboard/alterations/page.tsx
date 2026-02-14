'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import { alterationService, Alteration } from '@/lib/services/alteration-service'
import AlterationTypeModal from '@/components/AlterationTypeModal'
import OrderSearchModal from '@/components/OrderSearchModal'
import { Order } from '@/lib/services/order-service'
import {
  Search,
  Plus,
  Loader2,
  Package,
  Trash2,
  Printer,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight
} from 'lucide-react'

const PAGE_SIZE = 30

export default function AlterationsPage() {
  const { user } = useAuthStore()
  const { isArabic } = useTranslation()
  const router = useRouter()

  // States
  const [alterations, setAlterations] = useState<Alteration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [totalAlterations, setTotalAlterations] = useState(0)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showOrderSearchModal, setShowOrderSearchModal] = useState(false)

  const totalPages = Math.max(1, Math.ceil(totalAlterations / PAGE_SIZE))

  // التحقق من الصلاحيات وتحميل البيانات
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    loadAlterations(currentPage, debouncedSearchTerm)
  }, [user, router, currentPage, debouncedSearchTerm])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    setCurrentPage(0)
  }, [debouncedSearchTerm])

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1))
    }
  }, [currentPage, totalPages])

  const loadAlterations = async (page = 0, search = '') => {
    setIsLoading(true)
    try {
      const { data, error, total } = await alterationService.getAll({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined
      })
      if (error) {
        toast.error(error)
        return
      }
      setAlterations(data || [])
      setTotalAlterations(total ?? 0)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load alterations')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddNewAlteration = () => {
    setShowTypeModal(true)
  }

  const handleSelectType = (type: 'existing' | 'new') => {
    if (type === 'existing') {
      setShowOrderSearchModal(true)
    } else {
      // فستان خارجي - الانتقال مباشرة لصفحة إضافة طلب تعديل
      router.push('/dashboard/alterations/add')
    }
  }

  const handleSelectOrder = (order: Order) => {
    // الانتقال لصفحة إضافة طلب تعديل مع بيانات الطلب الأصلي
    router.push(`/dashboard/alterations/add?orderId=${order.id}`)
  }

  const handleDeleteAlteration = async (id: string) => {
    if (!confirm(isArabic ? 'هل أنت متأكد من حذف طلب التعديل؟' : 'Are you sure you want to delete this alteration?')) {
      return
    }

    try {
      const { error } = await alterationService.delete(id)
      if (error) {
        toast.error(error)
        return
      }
      toast.success(isArabic ? 'تم حذف طلب التعديل بنجاح' : 'Alteration deleted successfully')
      loadAlterations(currentPage, debouncedSearchTerm)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete alteration')
    }
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: { label: isArabic ? 'قيد الانتظار' : 'Pending', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
      in_progress: { label: isArabic ? 'قيد التنفيذ' : 'In Progress', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Package },
      completed: { label: isArabic ? 'مكتمل' : 'Completed', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
      delivered: { label: isArabic ? 'تم التسليم' : 'Delivered', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: CheckCircle },
      cancelled: { label: isArabic ? 'ملغي' : 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back to Dashboard Button */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => router.push('/dashboard')}
            className="text-pink-600 hover:text-pink-700 transition-colors duration-300 group flex items-center space-x-2 space-x-reverse"
          >
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            <span className="text-sm font-medium">{isArabic ? 'العودة إلى لوحة التحكم' : 'Back to Dashboard'}</span>
          </button>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isArabic ? 'قسم التعديلات' : 'Alterations Section'}
          </h1>
          <p className="text-gray-600">
            {isArabic ? 'إدارة طلبات التعديلات على الفساتين' : 'Manage dress alteration requests'}
          </p>
        </motion.div>

        {/* Search and Add Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6"
        >
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${isArabic ? 'right-3' : 'left-3'}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isArabic ? 'ابحث بالاسم أو رقم الهاتف أو رقم الطلب...' : 'Search by name, phone, or order number...'}
                className={`w-full ${isArabic ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent`}
                dir={isArabic ? 'rtl' : 'ltr'}
              />
            </div>

            {/* Add Button */}
            <button
              onClick={handleAddNewAlteration}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-md hover:shadow-lg whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              {isArabic ? 'إضافة طلب تعديل جديد' : 'Add New Alteration'}
            </button>
          </div>
        </motion.div>

        {!isLoading && (
          <div className="mb-4 text-sm text-gray-600">
            {isArabic
              ? `عرض ${alterations.length} من أصل ${totalAlterations} طلب تعديل`
              : `Showing ${alterations.length} of ${totalAlterations} alterations`}
          </div>
        )}

        {/* Alterations List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-pink-500 animate-spin" />
          </div>
        ) : alterations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
          >
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isArabic ? 'لا توجد طلبات تعديل' : 'No alterations found'}
            </h3>
            <p className="text-gray-500 mb-6">
              {isArabic ? 'ابدأ بإضافة طلب تعديل جديد' : 'Start by adding a new alteration request'}
            </p>
            <button
              onClick={handleAddNewAlteration}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-md hover:shadow-lg"
            >
              <Plus className="w-5 h-5" />
              {isArabic ? 'إضافة طلب تعديل' : 'Add Alteration'}
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {alterations.map((alteration, index) => {
              const statusInfo = getStatusInfo(alteration.status)
              const StatusIcon = statusInfo.icon

              return (
                <motion.div
                  key={alteration.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 cursor-pointer" onClick={() => router.push(`/dashboard/alterations/add?editId=${alteration.id}`)}>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {alteration.client_name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {alteration.alteration_number}
                      </p>
                      {/* Internal/External Label */}
                      <div className="mt-1">
                        {alteration.original_order_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {isArabic ? 'تعديل داخلي' : 'Internal Alteration'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {isArabic ? 'تعديل خارجي' : 'External Alteration'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${statusInfo.bgColor}`}>
                        <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                        <span className={`text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      {/* أزرار الإجراءات - عمودياً */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/alterations/print/${alteration.id}`)
                          }}
                          className="p-2 text-gray-600 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                          title={isArabic ? 'طباعة' : 'Print'}
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteAlteration(alteration.id)
                          }}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={isArabic ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 mb-4 cursor-pointer" onClick={() => router.push(`/dashboard/alterations/add?editId=${alteration.id}`)}>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{isArabic ? 'الهاتف:' : 'Phone:'}</span> {alteration.client_phone}
                    </p>
                    {alteration.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        <span className="font-medium">{isArabic ? 'الوصف:' : 'Description:'}</span> {alteration.description}
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{isArabic ? 'موعد التسليم:' : 'Due Date:'}</span>{' '}
                      {new Date(alteration.alteration_due_date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US')}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 cursor-pointer" onClick={() => router.push(`/dashboard/alterations/add?editId=${alteration.id}`)}>
                    <div>
                      <p className="text-xs text-gray-500">{isArabic ? 'السعر' : 'Price'}</p>
                      <p className="text-lg font-bold text-gray-900">
                        {alteration.price.toFixed(2)} {isArabic ? 'ر.س' : 'SAR'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{isArabic ? 'المدفوع' : 'Paid'}</p>
                      <p className="text-sm font-semibold text-green-600">
                        {alteration.paid_amount.toFixed(2)} {isArabic ? 'ر.س' : 'SAR'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {!isLoading && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {isArabic ? 'السابق' : 'Previous'}
            </button>

            <span className="px-3 py-2 text-sm text-gray-700">
              {isArabic
                ? `صفحة ${currentPage + 1} من ${totalPages}`
                : `Page ${currentPage + 1} of ${totalPages}`}
            </span>

            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {isArabic ? 'التالي' : 'Next'}
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <AlterationTypeModal
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onSelectType={handleSelectType}
      />

      <OrderSearchModal
        isOpen={showOrderSearchModal}
        onClose={() => setShowOrderSearchModal(false)}
        onSelectOrder={handleSelectOrder}
      />
    </div>
  )
}
