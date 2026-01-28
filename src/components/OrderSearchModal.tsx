'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X, Search, Loader2, Package } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { orderService, Order } from '@/lib/services/order-service'
import toast from 'react-hot-toast'

interface OrderSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectOrder: (order: Order) => void
}

export default function OrderSearchModal({
  isOpen,
  onClose,
  onSelectOrder
}: OrderSearchModalProps) {
  const { t, isArabic } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])

  // تحميل جميع الطلبات عند فتح المودال
  useEffect(() => {
    if (isOpen) {
      loadAllOrders()
    }
  }, [isOpen])

  const loadAllOrders = async () => {
    setIsSearching(true)
    try {
      const { data, error } = await orderService.getAll()
      if (error) {
        toast.error(error)
        return
      }

      // استبعاد الطلبات الملغاة فقط
      const filteredOrders = data?.filter(order => order.status !== 'cancelled') || []
      setAllOrders(filteredOrders)
      setSearchResults(filteredOrders)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSearching(false)
    }
  }

  // البحث في الطلبات
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(allOrders)
      return
    }

    const term = searchTerm.toLowerCase()
    const filtered = allOrders.filter(order =>
      order.client_name.toLowerCase().includes(term) ||
      order.client_phone.toLowerCase().includes(term) ||
      order.order_number.toLowerCase().includes(term)
    )
    setSearchResults(filtered)
  }, [searchTerm, allOrders])

  const handleSelectOrder = (order: Order) => {
    onSelectOrder(order)
    onClose()
    setSearchTerm('')
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: isArabic ? 'قيد الانتظار' : 'Pending', color: 'bg-yellow-100 text-yellow-800' },
      in_progress: { label: isArabic ? 'قيد التنفيذ' : 'In Progress', color: 'bg-blue-100 text-blue-800' },
      completed: { label: isArabic ? 'مكتمل' : 'Completed', color: 'bg-green-100 text-green-800' },
      delivered: { label: isArabic ? 'تم التسليم' : 'Delivered', color: 'bg-purple-100 text-purple-800' },
      cancelled: { label: isArabic ? 'ملغي' : 'Cancelled', color: 'bg-red-100 text-red-800' }
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold text-gray-900"
                  >
                    {isArabic ? 'البحث عن طلب' : 'Search for Order'}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Search Input */}
                <div className="mb-6">
                  <div className="relative">
                    <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${isArabic ? 'right-3' : 'left-3'}`} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={isArabic ? 'ابحث بالاسم أو رقم الهاتف أو رقم الطلب...' : 'Search by name, phone, or order number...'}
                      className={`w-full ${isArabic ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent`}
                      dir={isArabic ? 'rtl' : 'ltr'}
                    />
                  </div>
                </div>

                {/* Results */}
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">
                        {isArabic ? 'لا توجد نتائج' : 'No results found'}
                      </p>
                    </div>
                  ) : (
                    searchResults.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => handleSelectOrder(order)}
                        className="w-full p-4 border border-gray-200 rounded-lg hover:border-pink-500 hover:bg-pink-50 transition-all text-left group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-gray-900">
                                {order.client_name}
                              </h4>
                              {getStatusBadge(order.status)}
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              <p>
                                <span className="font-medium">
                                  {isArabic ? 'رقم الطلب:' : 'Order #:'}
                                </span>{' '}
                                {order.order_number}
                              </p>
                              <p>
                                <span className="font-medium">
                                  {isArabic ? 'الهاتف:' : 'Phone:'}
                                </span>{' '}
                                {order.client_phone}
                              </p>
                              <p>
                                <span className="font-medium">
                                  {isArabic ? 'الوصف:' : 'Description:'}
                                </span>{' '}
                                {order.description}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              {order.price.toFixed(2)} {isArabic ? 'ر.س' : 'SAR'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(order.created_at).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US')}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={onClose}
                    className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {isArabic ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}


