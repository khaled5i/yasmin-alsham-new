'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useWorkerStore } from '@/store/workerStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { workerService, WorkerWithUser } from '@/lib/services/worker-service'
import { orderService, Order } from '@/lib/services/order-service'
import { formatGregorianDate } from '@/lib/date-utils'
import OrderModal from '@/components/OrderModal'
import PaginationControls from '@/components/PaginationControls'
import {
  ArrowRight,
  Users,
  Package,
  CheckCircle,
  Star,
  BarChart3,
  Loader2,
  Clock,
  TrendingUp,
  DollarSign,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Tag,
  Save,
  X,
  Eye,
  Calendar,
  Filter,
} from 'lucide-react'

const PAGE_SIZE = 20

// ============================================================================
// بيانات التسعير والتقييم — مخزَّنة في أعمدة الطلب في قاعدة البيانات (migration 43)
// ============================================================================

interface OrderPricingData {
  orderId: string
  price: string
  notes: string
  bonus: string
  rating: number
}

function orderToPricingData(order: Order): OrderPricingData {
  return {
    orderId: order.id,
    price:  order.worker_price  != null ? String(order.worker_price)  : '',
    bonus:  order.worker_bonus  != null ? String(order.worker_bonus)  : '',
    rating: order.worker_rating ?? 0,
    notes:  order.worker_notes  ?? '',
  }
}

function sanitizeNum(val: string): string {
  const cleaned = val.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned
}

type TabType = 'active' | 'completed' | 'reports'


const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد الانتظار', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  in_progress: { label: 'جارٍ التنفيذ', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  completed: { label: 'مكتمل', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  delivered: { label: 'تم التسليم', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  cancelled: { label: 'ملغي', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
}

export default function WorkerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const workerId = params.workerId as string

  const { user, signOut } = useAuthStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()

  const [worker, setWorker] = useState<WorkerWithUser | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('active')

  // Active orders tab
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [activeOrdersTotal, setActiveOrdersTotal] = useState(0)
  const [activeOrdersPage, setActiveOrdersPage] = useState(0)
  const [isLoadingActive, setIsLoadingActive] = useState(true)

  // Completed orders tab
  const [completedOrders, setCompletedOrders] = useState<Order[]>([])
  const [completedOrdersTotal, setCompletedOrdersTotal] = useState(0)
  const [completedOrdersPage, setCompletedOrdersPage] = useState(0)
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false)

  // Completed orders filters
  const [completedMonthFilter, setCompletedMonthFilter] = useState('')
  const [completedUnratedOnly, setCompletedUnratedOnly] = useState(false)

  // Reports tab
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [isLoadingReports, setIsLoadingReports] = useState(false)

  // Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // حالة التسعير والتقييم (للمدير فقط — مشتركة مع قسم المحاسبة)
  const isAdmin = user?.role === 'admin'
  const [pricingForms, setPricingForms] = useState<Record<string, OrderPricingData>>({})
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set())
  const [orderFullDetails, setOrderFullDetails] = useState<Record<string, Order>>({})
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [isExpandingAll, setIsExpandingAll] = useState(false)

  const loadedTabs = useRef<Set<TabType>>(new Set())

  // Access guard
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    if (permissionsLoading) return
    const isAdmin = user.role === 'admin'
    const isWorkshopManager = user.role === 'worker' && workerType === 'workshop_manager'
    if (!isAdmin && !isWorkshopManager) {
      router.push('/dashboard')
    }
  }, [user, workerType, permissionsLoading, router])

  // Fetch worker profile
  useEffect(() => {
    if (!workerId) return
    workerService.getById(workerId).then(({ data }) => {
      if (data) setWorker(data)
    })
  }, [workerId])

  // Load workers for OrderModal prop
  useEffect(() => {
    if (workers.length === 0) loadWorkers()
  }, [workers.length, loadWorkers])

  // Fetch active orders (on mount)
  const fetchActiveOrders = useCallback(async (page: number) => {
    setIsLoadingActive(true)
    try {
      const { data, total } = await orderService.getAll({
        worker_id: workerId,
        status: ['pending', 'in_progress'],
        page,
        pageSize: PAGE_SIZE,
      })
      setActiveOrders(data || [])
      setActiveOrdersTotal(total || 0)
    } finally {
      setIsLoadingActive(false)
    }
  }, [workerId])

  useEffect(() => {
    if (!workerId) return
    fetchActiveOrders(activeOrdersPage)
  }, [workerId, activeOrdersPage, fetchActiveOrders])

  // Fetch completed orders (lazy)
  const fetchCompletedOrders = useCallback(async (page: number, monthFilter?: string, unratedOnly?: boolean) => {
    setIsLoadingCompleted(true)
    try {
      const { data, total } = await orderService.getAll({
        worker_id: workerId,
        status: ['completed', 'delivered'],
        page,
        pageSize: PAGE_SIZE,
        monthFilter: monthFilter || undefined,
        unratedOnly: unratedOnly || undefined,
        orderBy: 'worker_completed_at',
        orderAscending: false,
      })
      setCompletedOrders(data || [])
      setCompletedOrdersTotal(total || 0)
      // قراءة بيانات التسعير من أعمدة الطلب مباشرةً
      const forms: Record<string, OrderPricingData> = {}
      ;(data || []).forEach((order) => {
        forms[order.id] = orderToPricingData(order)
      })
      setPricingForms((prev) => ({ ...prev, ...forms }))
    } finally {
      setIsLoadingCompleted(false)
    }
  }, [workerId])

  // Fetch reports data (lazy)
  const fetchReports = useCallback(async () => {
    setIsLoadingReports(true)
    try {
      const { data } = await orderService.getAll({
        worker_id: workerId,
        noPagination: true,
        lightweight: true,
      })
      setAllOrders(data || [])
    } finally {
      setIsLoadingReports(false)
    }
  }, [workerId])

  // Tab switch handler
  function handleTabSwitch(tab: TabType) {
    setActiveTab(tab)
    if (!loadedTabs.current.has(tab)) {
      loadedTabs.current.add(tab)
      if (tab === 'completed') fetchCompletedOrders(0, completedMonthFilter, completedUnratedOnly)
      if (tab === 'reports') fetchReports()
    }
  }

  const handleCompletedFilterChange = useCallback((monthFilter: string, unratedOnly: boolean) => {
    setCompletedMonthFilter(monthFilter)
    setCompletedUnratedOnly(unratedOnly)
    setCompletedOrdersPage(0)
    fetchCompletedOrders(0, monthFilter, unratedOnly)
  }, [fetchCompletedOrders])

  function openOrderModal(order: Order) {
    setSelectedOrder(order)
    setIsModalOpen(true)
  }

  // معالجات التسعير
  const handleTogglePricing = useCallback(async (order: Order) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev)
      if (next.has(order.id)) { next.delete(order.id) } else { next.add(order.id) }
      return next
    })
    if (!orderFullDetails[order.id]) {
      try {
        const result = await orderService.getById(order.id)
        if (result.data) {
          setOrderFullDetails((prev) => ({ ...prev, [order.id]: result.data! }))
        }
      } catch { /* تجاهل — الصور ستكون غير متاحة */ }
    }
  }, [orderFullDetails])

  const handleExpandAll = useCallback(async () => {
    if (isExpandingAll) return
    setIsExpandingAll(true)
    // افتح جميع البطاقات فوراً
    setExpandedOrderIds(new Set(completedOrders.map((o) => o.id)))
    // جلب التفاصيل الكاملة بالتوازي لكل طلب لم يُحمَّل بعد
    try {
      const missing = completedOrders.filter((o) => !orderFullDetails[o.id])
      await Promise.all(
        missing.map(async (order) => {
          try {
            const result = await orderService.getById(order.id)
            if (result.data) {
              setOrderFullDetails((prev) => ({ ...prev, [order.id]: result.data! }))
            }
          } catch { /* تجاهل */ }
        })
      )
    } finally {
      setIsExpandingAll(false)
    }
  }, [completedOrders, orderFullDetails, isExpandingAll])

  const handleSavePricing = useCallback((orderId: string, data: OrderPricingData) => {
    setPricingForms((prev) => ({ ...prev, [orderId]: data }))
    orderService.update(orderId, {
      worker_price:  data.price  ? parseFloat(data.price)  : null,
      worker_bonus:  data.bonus  ? parseFloat(data.bonus)  : null,
      worker_rating: data.rating || null,
      worker_notes:  data.notes  || null,
    }).catch(() => { /* تجاهل — الحالة المحلية لا تزال محدَّثة */ })
  }, [])

  const handleToggleRatingVisibility = useCallback(async (order: Order) => {
    const newVal = !order.worker_rating_visible
    setCompletedOrders((prev) =>
      prev.map((o) => o.id === order.id ? { ...o, worker_rating_visible: newVal } : o)
    )
    await orderService.update(order.id, { worker_rating_visible: newVal })
  }, [])

  const [isShowingAllRatings, setIsShowingAllRatings] = useState(false)

  const handleShowAllRatings = useCallback(async () => {
    if (isShowingAllRatings) return
    // الطلبات التي تحتوي على تقييم أو سعر ولم تُرسَل للعامل بعد
    const targets = completedOrders.filter((o) => {
      const form = pricingForms[o.id]
      const hasData = (form?.price && parseFloat(form.price) > 0) || (form?.rating ?? 0) > 0 || form?.notes?.trim()
      return hasData && !o.worker_rating_visible
    })
    if (targets.length === 0) return
    setIsShowingAllRatings(true)
    try {
      await Promise.all(
        targets.map((o) => orderService.update(o.id, { worker_rating_visible: true }))
      )
      setCompletedOrders((prev) =>
        prev.map((o) => targets.some((t) => t.id === o.id) ? { ...o, worker_rating_visible: true } : o)
      )
    } finally {
      setIsShowingAllRatings(false)
    }
  }, [completedOrders, pricingForms, isShowingAllRatings])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (permissionsLoading || (!worker && isLoadingActive)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  const name = worker?.user?.full_name || 'عاملة'
  const firstLetter = name[0] || '؟'

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-slate-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-teal-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/dashboard/worker-monitoring"
                className="text-teal-600 hover:text-teal-700 transition-colors flex items-center gap-1 flex-shrink-0"
              >
                <ArrowRight className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">متابعة العمال</span>
              </Link>
              <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-gray-800 truncate">{name}</h1>
                {worker?.specialty && (
                  <p className="text-xs text-gray-500 truncate">{worker.specialty}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-500 hover:text-red-500 transition-colors flex-shrink-0"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Worker Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6"
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                {firstLetter}
              </div>
              <span
                className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${
                  worker?.is_available ? 'bg-green-400' : 'bg-gray-300'
                }`}
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-right">
              <h2 className="text-xl font-bold text-gray-800">{name}</h2>
              {worker?.specialty && (
                <p className="text-sm text-teal-600 font-medium mt-0.5">{worker.specialty}</p>
              )}
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                {worker?.experience_years ? (
                  <span className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-full text-xs border border-slate-100">
                    {worker.experience_years} سنوات خبرة
                  </span>
                ) : null}
                <span
                  className={`px-2.5 py-1 rounded-full text-xs border font-medium ${
                    worker?.is_available
                      ? 'bg-green-50 text-green-700 border-green-100'
                      : 'bg-gray-50 text-gray-500 border-gray-100'
                  }`}
                >
                  {worker?.is_available ? 'متاح' : 'غير متاح'}
                </span>
              </div>
            </div>

            {/* Quick KPIs */}
            <div className="flex gap-4 sm:gap-6 flex-shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{activeOrdersTotal}</p>
                <p className="text-xs text-gray-400 mt-0.5">نشطة</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{worker?.total_completed_orders || 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">مكتملة</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <p className="text-2xl font-bold text-yellow-600">
                    {worker?.performance_rating ? worker.performance_rating.toFixed(1) : '—'}
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">تقييم</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
        >
          {/* Tab nav */}
          <div className="flex border-b border-slate-100">
            {(
              [
                { key: 'active' as TabType, label: 'الطلبات النشطة', icon: Package, count: activeOrdersTotal },
                { key: 'completed' as TabType, label: 'الطلبات المكتملة', icon: CheckCircle, count: completedOrdersTotal },
                { key: 'reports' as TabType, label: 'التقارير', icon: BarChart3, count: null },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-teal-500 text-teal-600 bg-teal-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">
                    {tab.key === 'active' ? 'نشطة' : tab.key === 'completed' ? 'مكتملة' : 'تقارير'}
                  </span>
                  {tab.count !== null && tab.count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-4 sm:p-6">
            {activeTab === 'active' && (
              <OrdersTab
                orders={activeOrders}
                total={activeOrdersTotal}
                page={activeOrdersPage}
                isLoading={isLoadingActive}
                onPageChange={(p) => setActiveOrdersPage(p)}
                onOrderClick={openOrderModal}
                emptyMessage="لا توجد طلبات نشطة لهذه الخياطة حالياً"
              />
            )}
            {activeTab === 'completed' && (
              <CompletedOrdersTab
                orders={completedOrders}
                total={completedOrdersTotal}
                page={completedOrdersPage}
                isLoading={isLoadingCompleted}
                isAdmin={isAdmin}
                pricingForms={pricingForms}
                expandedOrderIds={expandedOrderIds}
                orderFullDetails={orderFullDetails}
                isExpandingAll={isExpandingAll}
                monthFilter={completedMonthFilter}
                unratedOnly={completedUnratedOnly}
                onFilterChange={handleCompletedFilterChange}
                onPageChange={(p) => {
                  setCompletedOrdersPage(p)
                  fetchCompletedOrders(p, completedMonthFilter, completedUnratedOnly)
                }}
                onTogglePricing={handleTogglePricing}
                onSavePricing={handleSavePricing}
                onOpenModal={openOrderModal}
                onLightbox={setLightboxImage}
                onExpandAll={handleExpandAll}
                onToggleRatingVisibility={handleToggleRatingVisibility}
                onShowAllRatings={handleShowAllRatings}
                isShowingAllRatings={isShowingAllRatings}
              />
            )}
            {activeTab === 'reports' && (
              <ReportsTab orders={allOrders} isLoading={isLoadingReports} />
            )}
          </div>
        </motion.div>
      </main>

      {/* Order Modal */}
      <OrderModal
        order={selectedOrder}
        workers={workers}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedOrder(null) }}
      />

      {/* Lightbox — عرض صورة بالشاشة الكاملة */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 left-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-7 h-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImage}
            alt="صورة العمل"
            className="max-w-full max-h-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Orders Tab
// ============================================================================

function OrdersTab({
  orders,
  total,
  page,
  isLoading,
  onPageChange,
  onOrderClick,
  emptyMessage,
  showCompletedAt = false,
}: {
  orders: Order[]
  total: number
  page: number
  isLoading: boolean
  onPageChange: (page: number) => void
  onOrderClick: (order: Order) => void
  emptyMessage: string
  showCompletedAt?: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-3">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} onClick={() => onOrderClick(order)} showCompletedAt={showCompletedAt} />
        ))}
      </div>
      {total > PAGE_SIZE && (
        <div className="mt-6">
          <PaginationControls
            currentPage={page}
            pageSize={PAGE_SIZE}
            totalItems={total}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  )
}

function OrderRow({ order, onClick, showCompletedAt = false }: { order: Order; onClick: () => void; showCompletedAt?: boolean }) {
  const status = STATUS_MAP[order.status] || { label: order.status, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' }
  const thumbnail = (order as any).design_thumbnail || '/front2.png'

  return (
    <div
      onClick={onClick}
      className="w-full text-right bg-white rounded-2xl border border-gray-200 hover:shadow-lg hover:border-teal-200 transition-all duration-200 cursor-pointer p-4 shadow-sm"
    >
      <div className="flex gap-4">
        {/* صورة التصميم المصغرة */}
        <div className="flex-shrink-0 w-20 sm:w-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt="صورة التصميم"
            className="w-full rounded-xl border border-pink-100 object-contain shadow-sm bg-gray-50"
            style={{ aspectRatio: '3/4' }}
          />
        </div>

        {/* المعلومات */}
        <div className="flex-1 min-w-0">
          {/* الحالة */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.bg} ${status.color}`}>
              {status.label}
            </span>
            {(order as any).is_pre_booking && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">حجز مسبق</span>
            )}
            {(order as any).needs_review && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">يحتاج مراجعة</span>
            )}
            {(order as any).has_alterations && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                تعديل{(order as any).alteration_count > 1 ? ` (${(order as any).alteration_count})` : ''}
              </span>
            )}
          </div>

          {/* الاسم ورقم الطلب */}
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-gray-900 truncate">{order.client_name}</p>
            {order.order_number && (
              <span className="text-xs text-gray-400 flex-shrink-0">#{order.order_number}</span>
            )}
          </div>

          {order.description && (
            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{order.description}</p>
          )}

          <div className="space-y-1">
            {order.due_date && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" />
                موعد التسليم:{' '}
                {formatGregorianDate(order.due_date, 'ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
            {showCompletedAt && order.worker_completed_at && (
              <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                <CheckCircle className="w-3 h-3 flex-shrink-0" />
                أنهاه العامل:{' '}
                {formatGregorianDate(order.worker_completed_at, 'ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        {/* السعر + سهم */}
        <div className="flex flex-col items-end justify-between flex-shrink-0">
          {order.price ? (
            <span className="text-sm font-bold text-gray-800">
              {order.price.toLocaleString('ar-SA')} ر.س
            </span>
          ) : <span />}
          <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-teal-400" />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Completed Orders Tab — يستخدم CompletedOrderRow للمدير
// ============================================================================

function getRecentMonths(count: number): { key: string; label: string }[] {
  const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  const months = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ key, label: `${arabicMonths[d.getMonth()]} ${d.getFullYear()}` })
  }
  return months
}

function CompletedOrdersTab({
  orders,
  total,
  page,
  isLoading,
  isAdmin,
  pricingForms,
  expandedOrderIds,
  orderFullDetails,
  isExpandingAll,
  monthFilter,
  unratedOnly,
  onFilterChange,
  onPageChange,
  onTogglePricing,
  onSavePricing,
  onOpenModal,
  onLightbox,
  onExpandAll,
  onToggleRatingVisibility,
  onShowAllRatings,
  isShowingAllRatings,
}: {
  orders: Order[]
  total: number
  page: number
  isLoading: boolean
  isAdmin: boolean
  pricingForms: Record<string, OrderPricingData>
  expandedOrderIds: Set<string>
  orderFullDetails: Record<string, Order>
  isExpandingAll: boolean
  monthFilter: string
  unratedOnly: boolean
  onFilterChange: (monthFilter: string, unratedOnly: boolean) => void
  onPageChange: (page: number) => void
  onTogglePricing: (order: Order) => void
  onSavePricing: (orderId: string, data: OrderPricingData) => void
  onOpenModal: (order: Order) => void
  onLightbox: (src: string) => void
  onExpandAll: () => void
  onToggleRatingVisibility: (order: Order) => void
  onShowAllRatings: () => void
  isShowingAllRatings: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    )
  }

  const recentMonths = getRecentMonths(18)
  const hasActiveFilters = !!monthFilter || unratedOnly

  const evaluatedCount = orders.filter(
    (o) => (pricingForms[o.id]?.price && parseFloat(pricingForms[o.id].price) > 0) || (pricingForms[o.id]?.rating ?? 0) > 0
  ).length

  const pendingVisibilityCount = orders.filter((o) => {
    const form = pricingForms[o.id]
    const hasData = (form?.price && parseFloat(form.price) > 0) || (form?.rating ?? 0) > 0 || form?.notes?.trim()
    return hasData && !o.worker_rating_visible
  }).length

  return (
    <div>
      {/* شريط الفلاتر */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* فلتر الشهر */}
        <div className="relative">
          <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <select
            value={monthFilter}
            onChange={(e) => onFilterChange(e.target.value, unratedOnly)}
            className="pr-8 pl-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 appearance-none cursor-pointer"
          >
            <option value="">كل الأشهر</option>
            {recentMonths.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* فلتر غير مقيّمة */}
        <button
          onClick={() => onFilterChange(monthFilter, !unratedOnly)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
            unratedOnly
              ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          غير مقيّمة فقط
        </button>

        {/* مسح الفلاتر */}
        {hasActiveFilters && (
          <button
            onClick={() => onFilterChange('', false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            مسح الفلاتر
          </button>
        )}
      </div>

      {orders.length === 0 && (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {hasActiveFilters ? 'لا توجد طلبات تطابق الفلاتر المحددة' : 'لا توجد طلبات مكتملة لهذه الخياطة حتى الآن'}
          </p>
        </div>
      )}

      {orders.length > 0 && (
      <>
      {/* أزرار الأعلى */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={onExpandAll}
          disabled={isExpandingAll}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isExpandingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Package className="w-4 h-4" />
          )}
          {isExpandingAll ? 'جاري تحميل الصور...' : 'تحميل جميع صور العمل المكتمل'}
        </button>

        {isAdmin && pendingVisibilityCount > 0 && (
          <button
            onClick={onShowAllRatings}
            disabled={isShowingAllRatings}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isShowingAllRatings ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            {isShowingAllRatings
              ? 'جاري الإرسال...'
              : `عرض جميع التقييمات للعامل (${pendingVisibilityCount})`}
          </button>
        )}

        {/* شريط ملخص التقييم — للمدير */}
        {isAdmin && evaluatedCount > 0 && (
          <div className="flex-1 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">
              <span className="font-bold">{evaluatedCount}</span> طلب مقيَّم من أصل{' '}
              <span className="font-bold">{orders.length}</span>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <CompletedOrderRow
            key={order.id}
            order={order}
            isAdmin={isAdmin}
            pricingData={pricingForms[order.id] || { orderId: order.id, price: '', notes: '', bonus: '', rating: 0 }}
            isExpanded={expandedOrderIds.has(order.id)}
            orderFullDetail={orderFullDetails[order.id] || null}
            onToggle={onTogglePricing}
            onSavePricing={onSavePricing}
            onOpenModal={onOpenModal}
            onLightbox={onLightbox}
            onToggleRatingVisibility={onToggleRatingVisibility}
          />
        ))}
      </div>
      {total > PAGE_SIZE && (
        <div className="mt-6">
          <PaginationControls
            currentPage={page}
            pageSize={PAGE_SIZE}
            totalItems={total}
            onPageChange={onPageChange}
          />
        </div>
      )}
      </>
      )}
    </div>
  )
}

// ============================================================================
// Completed Order Row — مع التسعير والتقييم (للمدير فقط)
// ============================================================================

function CompletedOrderRow({
  order,
  isAdmin,
  pricingData,
  isExpanded,
  orderFullDetail,
  onToggle,
  onSavePricing,
  onOpenModal,
  onLightbox,
  onToggleRatingVisibility,
}: {
  order: Order
  isAdmin: boolean
  pricingData: OrderPricingData
  isExpanded: boolean
  orderFullDetail: Order | null
  onToggle: (order: Order) => void
  onSavePricing: (orderId: string, data: OrderPricingData) => void
  onOpenModal: (order: Order) => void
  onLightbox: (src: string) => void
  onToggleRatingVisibility: (order: Order) => void
}) {
  const status = STATUS_MAP[order.status] || { label: order.status, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' }
  const hasPricing = parseFloat(pricingData.price) > 0
  const isEvaluated = hasPricing || pricingData.rating > 0
  const thumbnail = (order as any).design_thumbnail || '/front2.png'

  // حفظ ثم طي البطاقة
  function handleSaveAndCollapse() {
    onSavePricing(order.id, pricingData)
    onToggle(order) // ينغلق لأنه مفتوح حالياً
  }

  const completedImages = orderFullDetail?.completed_images || []

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 shadow-sm ${
        isExpanded
          ? 'border-pink-300 shadow-md'
          : isEvaluated
          ? 'border-green-300 bg-green-50/20 hover:border-green-400 hover:shadow-md'
          : 'border-gray-200 bg-white hover:border-pink-200 hover:shadow-md'
      }`}
    >
      {/* ===== وجه البطاقة ===== */}
      <div className="p-4">
        <div className="flex gap-4">
          {/* صورة التصميم المصغرة */}
          <button
            onClick={() => onOpenModal(order)}
            className="flex-shrink-0 w-20 sm:w-24 self-start"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail}
              alt="صورة التصميم"
              className="w-full rounded-xl border border-pink-100 object-contain shadow-sm bg-gray-50 hover:opacity-90 transition-opacity"
              style={{ aspectRatio: '3/4' }}
            />
          </button>

          {/* المعلومات */}
          <div className="flex-1 min-w-0">
            {/* الحالة + شارة التقييم */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.bg} ${status.color}`}>
                {status.label}
              </span>
              {isEvaluated && !isExpanded && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                  <CheckCircle className="w-3 h-3" />
                  تم التقييم
                </span>
              )}
            </div>

            {/* الاسم ورقم الطلب */}
            <button onClick={() => onOpenModal(order)} className="text-right w-full">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold text-gray-900 truncate">{order.client_name}</p>
                {order.order_number && (
                  <span className="text-xs text-gray-400 flex-shrink-0">#{order.order_number}</span>
                )}
              </div>
              {order.description && (
                <p className="text-sm text-gray-500 line-clamp-2 mb-2">{order.description}</p>
              )}
            </button>

            <div className="space-y-1 mt-1">
              {order.worker_completed_at && (
                <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  أنهاه العامل:{' '}
                  {formatGregorianDate(order.worker_completed_at, 'ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
              {order.due_date && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  موعد التسليم:{' '}
                  {formatGregorianDate(order.due_date, 'ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
              {hasPricing && !isExpanded && (
                <p className="text-xs font-semibold text-pink-700 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {parseFloat(pricingData.price).toLocaleString('ar-SA')} ر.س
                </p>
              )}
              {pricingData.rating > 0 && !isExpanded && (
                <div className="flex items-center gap-0.5 mt-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i < pricingData.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* يمين: السعر + أزرار التقييم */}
          <div className="flex flex-col items-end justify-between flex-shrink-0 gap-2">
            {order.price ? (
              <span className="text-sm font-bold text-gray-800">{order.price.toLocaleString('ar-SA')} ر.س</span>
            ) : <span />}
            {isAdmin && (
              <>
                <button
                  onClick={() => onToggle(order)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    isExpanded
                      ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                      : isEvaluated
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-pink-50 hover:text-pink-700'
                  }`}
                >
                  <Star className="w-3.5 h-3.5" />
                  {isExpanded ? 'إغلاق' : isEvaluated ? 'تعديل' : 'تقييم'}
                </button>
                {isEvaluated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleRatingVisibility(order) }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      order.worker_rating_visible
                        ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                    title={order.worker_rating_visible ? 'إخفاء التقييم عن العامل' : 'عرض التقييم للعامل'}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {order.worker_rating_visible ? 'مرئي للعامل' : 'عرض للعامل'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== قسم التسعير والتقييم — يظهر عند الفتح ===== */}
      {isAdmin && isExpanded && (
        <div className="border-t border-pink-100 p-4 bg-gradient-to-br from-pink-50/50 to-purple-50/30">

          {/* صور العمل + فورم التسعير جنباً لجنب */}
          <div className="flex flex-col sm:flex-row gap-4">

            {/* الصور (يمين في RTL) */}
            <div className="sm:w-2/5">
              {!orderFullDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  جاري تحميل صور العمل...
                </div>
              ) : completedImages.length === 0 ? (
                <div className="text-xs text-gray-400 py-4 flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  لا توجد صور للعمل المكتمل
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-pink-500" />
                    صور العمل ({completedImages.length})
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {completedImages.map((src, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onLightbox(src)}
                        className="relative aspect-square overflow-hidden rounded-lg border-2 border-pink-200 hover:border-pink-400 transition-all group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`صورة ${i + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* فورم التسعير (يسار في RTL = start في RTL يعني اليمين، لكن بالعرض يبدو على اليسار في layout LTR) */}
            <div className="sm:w-3/5 space-y-3">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-pink-600" />
                التسعير والتقييم
              </h4>

              {/* السعر */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">السعر (ر.س)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="أدخل السعر"
                  value={pricingData.price}
                  onChange={(e) => onSavePricing(order.id, { ...pricingData, price: sanitizeNum(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {/* المكافأة */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">المكافأة (ر.س)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="أدخل المكافأة"
                  value={pricingData.bonus}
                  onChange={(e) => onSavePricing(order.id, { ...pricingData, bonus: sanitizeNum(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {/* الملاحظات */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">الملاحظات</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات اختيارية..."
                  value={pricingData.notes}
                  onChange={(e) => onSavePricing(order.id, { ...pricingData, notes: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100 resize-none"
                />
              </div>

              {/* التقييم بالنجوم */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">التقييم</label>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const newRating = pricingData.rating === i + 1 ? 0 : i + 1
                        onSavePricing(order.id, { ...pricingData, rating: newRating })
                      }}
                      className="transition-transform hover:scale-110 focus:outline-none"
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          i < pricingData.rating
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300 hover:text-yellow-300'
                        }`}
                      />
                    </button>
                  ))}
                  {pricingData.rating > 0 && (
                    <span className="text-xs text-gray-500 mr-1">{pricingData.rating}/5</span>
                  )}
                </div>
              </div>

              {/* زر الحفظ */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSaveAndCollapse}
                  className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 transition-colors shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  حفظ وطي
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Reports Tab
// ============================================================================

function ReportsTab({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">لا توجد بيانات كافية لعرض التقارير</p>
      </div>
    )
  }

  // ---- Computed metrics ----
  const total = orders.length
  const completedCount = orders.filter((o) => ['completed', 'delivered'].includes(o.status)).length
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length
  const activeCount = orders.filter((o) => ['pending', 'in_progress'].includes(o.status)).length
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0

  // Financial
  const totalRevenue = orders
    .filter((o) => ['completed', 'delivered'].includes(o.status))
    .reduce((s, o) => s + (o.price || 0), 0)
  const avgOrderValue = completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0
  const totalOutstanding = orders
    .filter((o) => !['cancelled', 'delivered'].includes(o.status))
    .reduce((s, o) => s + Math.max(0, (o.price || 0) - (o.paid_amount || 0)), 0)

  // Status counts
  const statusGroups: Record<string, number> = {
    pending: orders.filter((o) => o.status === 'pending').length,
    in_progress: orders.filter((o) => o.status === 'in_progress').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  }

  // Monthly trend (last 6 months)
  const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  const monthBuckets: { label: string; key: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    monthBuckets.push({
      label: arabicMonths[d.getMonth()],
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      count: 0,
    })
  }
  for (const order of orders) {
    if (['completed', 'delivered'].includes(order.status) && order.created_at) {
      const key = order.created_at.slice(0, 7)
      const bucket = monthBuckets.find((m) => m.key === key)
      if (bucket) bucket.count++
    }
  }
  const maxMonthCount = Math.max(...monthBuckets.map((m) => m.count), 1)

  // Status bar colors
  const statusBarColors: Record<string, string> = {
    pending: 'bg-yellow-400',
    in_progress: 'bg-blue-400',
    completed: 'bg-green-400',
    delivered: 'bg-purple-400',
    cancelled: 'bg-red-300',
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Overview KPIs */}
      <section>
        <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal-500" />
          نظرة عامة
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="إجمالي الطلبات"
            value={total}
            icon={<Package className="w-4 h-4" />}
            colorClass="text-slate-700 bg-slate-50 border-slate-200"
          />
          <KpiCard
            label="نسبة الإنجاز"
            value={`${completionRate}%`}
            icon={<CheckCircle className="w-4 h-4" />}
            colorClass="text-green-700 bg-green-50 border-green-200"
          />
          <KpiCard
            label="طلبات نشطة"
            value={activeCount}
            icon={<Clock className="w-4 h-4" />}
            colorClass="text-blue-700 bg-blue-50 border-blue-200"
          />
          <KpiCard
            label="طلبات ملغاة"
            value={cancelledCount}
            icon={<AlertCircle className="w-4 h-4" />}
            colorClass="text-red-700 bg-red-50 border-red-200"
          />
        </div>
      </section>

      {/* Section 2: Status Breakdown */}
      <section>
        <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-teal-500" />
          توزيع حالات الطلبات
        </h3>
        <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
          {Object.entries(statusGroups).map(([status, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            const info = STATUS_MAP[status]
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">
                  {info?.label || status}
                </span>
                <div className="flex-1 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${statusBarColors[status] || 'bg-gray-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-600 w-8 flex-shrink-0">{count}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section 3: Monthly trend */}
      <section>
        <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal-500" />
          الطلبات المكتملة شهرياً (آخر 6 أشهر)
        </h3>
        <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
          <div className="flex items-end justify-around gap-2 h-32">
            {monthBuckets.map((m) => {
              const heightPct = (m.count / maxMonthCount) * 100
              return (
                <div key={m.key} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-xs font-medium text-gray-600">{m.count > 0 ? m.count : ''}</span>
                  <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                    <div
                      className="w-full max-w-[32px] bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t-md transition-all duration-700"
                      style={{ height: m.count > 0 ? `${heightPct}%` : '4px', opacity: m.count > 0 ? 1 : 0.2 }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 text-center leading-tight">{m.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Section 4: Financial KPIs */}
      <section>
        <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-teal-500" />
          المؤشرات المالية
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            label="إجمالي الإيرادات"
            value={`${totalRevenue.toLocaleString('ar-SA')} ريال`}
            icon={<DollarSign className="w-4 h-4" />}
            colorClass="text-green-700 bg-green-50 border-green-200"
          />
          <KpiCard
            label="متوسط قيمة الطلب"
            value={`${avgOrderValue.toLocaleString('ar-SA')} ريال`}
            icon={<TrendingUp className="w-4 h-4" />}
            colorClass="text-teal-700 bg-teal-50 border-teal-200"
          />
          <KpiCard
            label="المبالغ المتبقية"
            value={`${totalOutstanding.toLocaleString('ar-SA')} ريال`}
            icon={<AlertCircle className="w-4 h-4" />}
            colorClass="text-orange-700 bg-orange-50 border-orange-200"
          />
        </div>
      </section>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  colorClass: string
}) {
  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <div className="flex items-center gap-2 mb-2 opacity-70">{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}
