'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useWorkerStore } from '@/store/workerStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { workerService, WorkerWithUser } from '@/lib/services/worker-service'
import { orderService, getEffectiveCompletionDate, Order } from '@/lib/services/order-service'
import {
  formatGregorianDate,
  formatGregorianDateTime,
  fromDateTimeLocalValue,
  shiftDate,
  toDateTimeLocalValue,
} from '@/lib/date-utils'
import OrderModal from '@/components/OrderModal'
import PaginationControls from '@/components/PaginationControls'
import {
  ArrowRight,
  Package,
  CheckCircle,
  Star,
  Loader2,
  Clock,
  TrendingUp,
  ChevronLeft,
  LogOut,
  Tag,
  Save,
  X,
  Eye,
  Calendar,
  Filter,
  BellRing,
  Wallet,
  Fingerprint,
  Wrench,
  Pencil,
} from 'lucide-react'

const PAGE_SIZE = 20

const WorkerPayrollMiniDashboard = dynamic(
  () => import('@/components/TailoringPayrollDashboard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/70">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-indigo-500" />
          جاري تحميل بيانات الراتب...
        </div>
      </div>
    ),
  }
)

const WorkerAttendanceMiniDashboard = dynamic(
  () => import('@/components/AttendanceMonitoringDashboard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-teal-100 bg-teal-50/60">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-teal-600" />
          جاري تحميل سجل الحضور...
        </div>
      </div>
    ),
  }
)

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

function orderHasWorkerEvaluation(order: Order): boolean {
  return order.worker_price != null
    || order.worker_bonus != null
    || (order.worker_rating ?? 0) > 0
    || (typeof order.worker_notes === 'string' && order.worker_notes.trim() !== '')
}

function pricingFormHasWorkerEvaluation(form?: OrderPricingData): boolean {
  return (form?.price?.trim() ?? '') !== ''
    || (form?.bonus?.trim() ?? '') !== ''
    || (form?.rating ?? 0) > 0
    || (form?.notes?.trim() ?? '') !== ''
}

function sanitizeNum(val: string): string {
  const cleaned = val.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned
}

type TabType = 'active' | 'completed' | 'payroll' | 'attendance'


// ترتيب الطلبات المنجزة تنازلياً حسب تاريخ الإنجاز الفعلي.
// لا نكتفي بترتيب الخادم (worker_completed_at) لأن الطلبات المُسلَّمة تسليماً صامتاً
// تخلو منه فتقفز إلى آخر القائمة بدل موقعها الزمني الصحيح.
function sortByCompletionDesc(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const aDate = getEffectiveCompletionDate(a)
    const bDate = getEffectiveCompletionDate(b)
    const aTime = aDate ? new Date(aDate).getTime() : 0
    const bTime = bDate ? new Date(bDate).getTime() : 0
    return bTime - aTime
  })
}

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

  // Completed orders tab — تُعرض كل طلبات الشهر دفعةً واحدة بدون ترقيم صفحات
  const [completedOrders, setCompletedOrders] = useState<Order[]>([])
  const [completedOrdersTotal, setCompletedOrdersTotal] = useState(0)
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false)

  // Completed orders filters
  const [completedMonthFilter, setCompletedMonthFilter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [completedUnratedOnly, setCompletedUnratedOnly] = useState(false)

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
  const [isShowingAllRatings, setIsShowingAllRatings] = useState(false)

  // تعديل تاريخ وساعة إنهاء العامل للطلب — للمدير فقط
  const [editingCompletedAtId, setEditingCompletedAtId] = useState<string | null>(null)
  const [savingCompletedAtId, setSavingCompletedAtId] = useState<string | null>(null)
  const [completedAtError, setCompletedAtError] = useState<string | null>(null)

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

  // Fetch completed orders (lazy) — بدون ترقيم: نعرض كل طلبات الشهر المحدد دفعةً واحدة
  // `silent` = إعادة جلب في الخلفية دون إظهار مؤشر التحميل (بعد تعديل تاريخ الإنهاء مثلاً)
  const fetchCompletedOrders = useCallback(async (monthFilter?: string, unratedOnly?: boolean, silent = false) => {
    if (!silent) setIsLoadingCompleted(true)
    try {
      const { data, total } = await orderService.getAll({
        worker_id: workerId,
        status: ['completed', 'delivered'],
        noPagination: true,
        monthFilter: monthFilter || undefined,
        unratedOnly: unratedOnly || undefined,
        orderBy: 'worker_completed_at',
        orderAscending: false,
      })
      let loadedOrders = sortByCompletionDesc(data || [])

      // في حساب المدير، أي تقييم أو تسعير محفوظ يصبح ظاهراً للعامل تلقائياً.
      if (isAdmin) {
        const visibilityTargets = loadedOrders.filter((order) => (
          orderHasWorkerEvaluation(order) && !order.worker_rating_visible
        ))
        if (visibilityTargets.length > 0) {
          setIsShowingAllRatings(true)
          try {
            const results = await Promise.all(
              visibilityTargets.map((order) => orderService.update(order.id, { worker_rating_visible: true }))
            )
            const visibleOrderIds = new Set(
              visibilityTargets
                .filter((_, index) => !results[index].error)
                .map((order) => order.id)
            )
            loadedOrders = loadedOrders.map((order) => (
              visibleOrderIds.has(order.id) ? { ...order, worker_rating_visible: true } : order
            ))
          } finally {
            setIsShowingAllRatings(false)
          }
        }
      }

      setCompletedOrders(loadedOrders)
      setCompletedOrdersTotal(total || 0)
      // قراءة بيانات التسعير من أعمدة الطلب مباشرةً
      const forms: Record<string, OrderPricingData> = {}
      loadedOrders.forEach((order) => {
        forms[order.id] = orderToPricingData(order)
      })
      setPricingForms((prev) => ({ ...prev, ...forms }))
    } finally {
      if (!silent) setIsLoadingCompleted(false)
    }
  }, [isAdmin, workerId])

  // Tab switch handler
  function handleTabSwitch(tab: TabType) {
    setActiveTab(tab)
    if (!loadedTabs.current.has(tab)) {
      loadedTabs.current.add(tab)
      if (tab === 'completed') fetchCompletedOrders(completedMonthFilter, completedUnratedOnly)
    }
  }

  const handleCompletedFilterChange = useCallback((monthFilter: string, unratedOnly: boolean) => {
    setCompletedMonthFilter(monthFilter)
    setCompletedUnratedOnly(unratedOnly)
    fetchCompletedOrders(monthFilter, unratedOnly)
  }, [fetchCompletedOrders])

  function openOrderModal(order: Order) {
    setSelectedOrder(order)
    setIsModalOpen(true)
  }

  // تبديل حالة جهوزية البروفا الثانية من قبل المدير — يُسجَّل تماماً كما لو غيّرها العامل
  const [togglingSecondProofId, setTogglingSecondProofId] = useState<string | null>(null)
  const handleToggleSecondProof = useCallback(async (order: Order) => {
    const markCompleted = !order.second_proof_completed
    const completedAt = markCompleted ? new Date().toISOString() : null
    const patch = {
      second_proof_completed: markCompleted,
      second_proof_completed_at: completedAt,
      // عند التراجع: نُصفّر حالة الإرسال والإخفاء — كما في صفحة العامل
      ...(markCompleted ? {} : { second_proof_whatsapp_sent: false, second_proof_dismissed: false }),
    }
    setTogglingSecondProofId(order.id)
    // تحديث متفائل للحالة المحلية
    setActiveOrders((prev) =>
      prev.map((o) => o.id === order.id ? { ...o, ...patch } : o)
    )
    try {
      await orderService.update(order.id, patch as any)
    } catch {
      // تراجع عن التحديث المتفائل عند الفشل
      setActiveOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...order } : o)
      )
    } finally {
      setTogglingSecondProofId(null)
    }
  }, [])

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
    const updates = {
      worker_price:  data.price  ? parseFloat(data.price)  : null,
      worker_bonus:  data.bonus  ? parseFloat(data.bonus)  : null,
      worker_rating: data.rating || null,
      worker_notes:  data.notes  || null,
      worker_rating_visible: true,
    }
    setCompletedOrders((prev) => prev.map((order) => (
      order.id === orderId ? { ...order, ...updates } : order
    )))
    orderService.update(orderId, updates).catch(() => { /* تجاهل — الحالة المحلية لا تزال محدَّثة */ })
  }, [])

  const handleToggleRatingVisibility = useCallback(async (order: Order) => {
    const newVal = !order.worker_rating_visible
    setCompletedOrders((prev) =>
      prev.map((o) => o.id === order.id ? { ...o, worker_rating_visible: newVal } : o)
    )
    await orderService.update(order.id, { worker_rating_visible: newVal })
  }, [])

  const handleShowAllRatings = useCallback(async () => {
    if (isShowingAllRatings) return
    // الطلبات التي تحتوي على تقييم أو سعر ولم تُرسَل للعامل بعد
    const targets = completedOrders.filter((o) => {
      const form = pricingForms[o.id]
      return pricingFormHasWorkerEvaluation(form) && !o.worker_rating_visible
    })
    if (targets.length === 0) return
    setIsShowingAllRatings(true)
    try {
      const results = await Promise.all(
        targets.map((o) => orderService.update(o.id, { worker_rating_visible: true }))
      )
      const visibleOrderIds = new Set(
        targets
          .filter((_, index) => !results[index].error)
          .map((order) => order.id)
      )
      setCompletedOrders((prev) =>
        prev.map((o) => visibleOrderIds.has(o.id) ? { ...o, worker_rating_visible: true } : o)
      )
    } finally {
      setIsShowingAllRatings(false)
    }
  }, [completedOrders, pricingForms, isShowingAllRatings])

  // ==========================================================================
  // تعديل تاريخ وساعة إنهاء العامل للقطعة — للمدير فقط، وللطلبات المكتملة فقط
  // ==========================================================================
  const handleStartEditCompletedAt = useCallback((order: Order) => {
    setCompletedAtError(null)
    setEditingCompletedAtId(order.id)
  }, [])

  const handleCancelEditCompletedAt = useCallback(() => {
    setCompletedAtError(null)
    setEditingCompletedAtId(null)
  }, [])

  const handleSaveCompletedAt = useCallback(async (order: Order, localValue: string) => {
    const iso = fromDateTimeLocalValue(localValue)
    if (!iso) {
      setCompletedAtError('يرجى إدخال تاريخ وساعة صالحين')
      return
    }
    // لا شيء تغيّر فعلياً (حقل datetime-local يعرض الدقائق فقط) → أغلق دون حفظ
    if (localValue === toDateTimeLocalValue(order.worker_completed_at)) {
      setEditingCompletedAtId(null)
      return
    }

    setCompletedAtError(null)
    setSavingCompletedAtId(order.id)
    try {
      const { error } = await orderService.update(order.id, { worker_completed_at: iso })
      if (error) {
        setCompletedAtError(error)
        return
      }

      // تحديث متفائل + إعادة ترتيب تنازلياً حسب تاريخ الإنهاء (نفس ترتيب القائمة)
      setCompletedOrders((prev) => sortByCompletionDesc(
        prev.map((o) => (o.id === order.id ? { ...o, worker_completed_at: iso } : o))
      ))
      setEditingCompletedAtId(null)

      // إعادة جلب صامتة: التاريخ الجديد قد يُخرج الطلب من فلتر الشهر الحالي
      fetchCompletedOrders(completedMonthFilter, completedUnratedOnly, true)
    } catch (err) {
      setCompletedAtError(err instanceof Error ? err.message : 'تعذّر حفظ تاريخ الإنهاء')
    } finally {
      setSavingCompletedAtId(null)
    }
  }, [completedMonthFilter, completedUnratedOnly, fetchCompletedOrders])

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
                { key: 'payroll' as TabType, label: 'الراتب', icon: Wallet, count: null },
                { key: 'attendance' as TabType, label: 'الحضور', icon: Fingerprint, count: null },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 px-1 py-3 text-xs font-medium transition-colors border-b-2 sm:gap-2 sm:px-3 sm:py-4 sm:text-sm ${
                    activeTab === tab.key
                      ? 'border-teal-500 text-teal-600 bg-teal-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">
                    {tab.key === 'active' ? 'نشطة' : tab.key === 'completed' ? 'مكتملة' : tab.key === 'payroll' ? 'الراتب' : 'الحضور'}
                  </span>
                  {tab.count !== null && tab.count > 0 && (
                    <span className="hidden rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 sm:inline-flex">
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
                onToggleSecondProof={handleToggleSecondProof}
                togglingSecondProofId={togglingSecondProofId}
              />
            )}
            {activeTab === 'completed' && (
              <CompletedOrdersTab
                orders={completedOrders}
                total={completedOrdersTotal}
                isLoading={isLoadingCompleted}
                isAdmin={isAdmin}
                pricingForms={pricingForms}
                expandedOrderIds={expandedOrderIds}
                orderFullDetails={orderFullDetails}
                isExpandingAll={isExpandingAll}
                monthFilter={completedMonthFilter}
                unratedOnly={completedUnratedOnly}
                onFilterChange={handleCompletedFilterChange}
                onTogglePricing={handleTogglePricing}
                onSavePricing={handleSavePricing}
                onOpenModal={openOrderModal}
                onLightbox={setLightboxImage}
                onExpandAll={handleExpandAll}
                onToggleRatingVisibility={handleToggleRatingVisibility}
                onShowAllRatings={handleShowAllRatings}
                isShowingAllRatings={isShowingAllRatings}
                editingCompletedAtId={editingCompletedAtId}
                savingCompletedAtId={savingCompletedAtId}
                completedAtError={completedAtError}
                onStartEditCompletedAt={handleStartEditCompletedAt}
                onCancelEditCompletedAt={handleCancelEditCompletedAt}
                onSaveCompletedAt={handleSaveCompletedAt}
              />
            )}
            {activeTab === 'payroll' && (
              <WorkerPayrollMiniDashboard embeddedWorkerId={workerId} />
            )}
            {activeTab === 'attendance' && (
              <WorkerAttendanceMiniDashboard embeddedWorkerId={workerId} />
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
  onToggleSecondProof,
  togglingSecondProofId = null,
}: {
  orders: Order[]
  total: number
  page: number
  isLoading: boolean
  onPageChange: (page: number) => void
  onOrderClick: (order: Order) => void
  emptyMessage: string
  showCompletedAt?: boolean
  onToggleSecondProof?: (order: Order) => void
  togglingSecondProofId?: string | null
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
          <OrderRow
            key={order.id}
            order={order}
            onClick={() => onOrderClick(order)}
            showCompletedAt={showCompletedAt}
            onToggleSecondProof={onToggleSecondProof}
            isTogglingSecondProof={togglingSecondProofId === order.id}
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
    </div>
  )
}

function OrderRow({
  order,
  onClick,
  showCompletedAt = false,
  onToggleSecondProof,
  isTogglingSecondProof = false,
}: {
  order: Order
  onClick: () => void
  showCompletedAt?: boolean
  onToggleSecondProof?: (order: Order) => void
  isTogglingSecondProof?: boolean
}) {
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
                {formatGregorianDate(order.due_date, 'ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
            {showCompletedAt && order.worker_completed_at && (
              <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                <CheckCircle className="w-3 h-3 flex-shrink-0" />
                أنهاه العامل:{' '}
                {formatGregorianDate(order.worker_completed_at, 'ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
            {order.has_second_proof && (
              <p className="text-xs text-amber-600 flex items-center gap-1 font-medium">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                موعد البروفا الثانية:{' '}
                {formatGregorianDate(order.second_proof_date || shiftDate(order.due_date, -1), 'ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>

          {/* حالة جهوزية البروفا الثانية — قابلة للضغط لتغييرها من قبل المدير */}
          {order.has_second_proof && (
            <div className="mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSecondProof?.(order) }}
                disabled={isTogglingSecondProof || !onToggleSecondProof}
                title={order.second_proof_completed
                  ? 'البروفا الثانية جاهزة — اضغط للتراجع'
                  : 'اضغط لتحديد البروفا الثانية كجاهزة'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  order.second_proof_completed
                    ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                    : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {isTogglingSecondProof ? (
                  <div className={`w-3 h-3 border-2 ${order.second_proof_completed ? 'border-green-600' : 'border-amber-600'} border-t-transparent rounded-full animate-spin`} />
                ) : order.second_proof_completed ? (
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <BellRing className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span>
                  {order.second_proof_completed ? 'البروفا الثانية جاهزة' : 'البروفا الثانية غير جاهزة'}
                </span>
              </button>
              {order.second_proof_completed && order.second_proof_completed_at && (
                <p className="text-[11px] text-green-600 mt-1">
                  حُدِّدت:{' '}
                  {formatGregorianDate(order.second_proof_completed_at, 'ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* السعر + سهم */}
        <div className="flex flex-col items-end justify-between flex-shrink-0">
          {order.price ? (
            <span className="text-sm font-bold text-gray-800">
              {order.price.toLocaleString('ar-SA-u-nu-latn')} ر.س
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

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const totalHours = Math.floor(ms / 3600000)
  const totalDays = Math.floor(ms / 86400000)
  if (totalDays >= 1) {
    const remainingHours = totalHours - totalDays * 24
    return remainingHours > 0 ? `${totalDays} يوم و ${remainingHours} ساعة` : `${totalDays} يوم`
  }
  if (totalHours >= 1) {
    const remainingMinutes = totalMinutes - totalHours * 60
    return remainingMinutes > 0 ? `${totalHours} ساعة و ${remainingMinutes} دقيقة` : `${totalHours} ساعة`
  }
  return totalMinutes > 0 ? `${totalMinutes} دقيقة` : 'أقل من دقيقة'
}

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
  isLoading,
  isAdmin,
  pricingForms,
  expandedOrderIds,
  orderFullDetails,
  isExpandingAll,
  monthFilter,
  unratedOnly,
  onFilterChange,
  onTogglePricing,
  onSavePricing,
  onOpenModal,
  onLightbox,
  onExpandAll,
  onToggleRatingVisibility,
  onShowAllRatings,
  isShowingAllRatings,
  editingCompletedAtId,
  savingCompletedAtId,
  completedAtError,
  onStartEditCompletedAt,
  onCancelEditCompletedAt,
  onSaveCompletedAt,
}: {
  orders: Order[]
  total: number
  isLoading: boolean
  isAdmin: boolean
  pricingForms: Record<string, OrderPricingData>
  expandedOrderIds: Set<string>
  orderFullDetails: Record<string, Order>
  isExpandingAll: boolean
  monthFilter: string
  unratedOnly: boolean
  onFilterChange: (monthFilter: string, unratedOnly: boolean) => void
  onTogglePricing: (order: Order) => void
  onSavePricing: (orderId: string, data: OrderPricingData) => void
  onOpenModal: (order: Order) => void
  onLightbox: (src: string) => void
  onExpandAll: () => void
  onToggleRatingVisibility: (order: Order) => void
  onShowAllRatings: () => void
  isShowingAllRatings: boolean
  editingCompletedAtId: string | null
  savingCompletedAtId: string | null
  completedAtError: string | null
  onStartEditCompletedAt: (order: Order) => void
  onCancelEditCompletedAt: () => void
  onSaveCompletedAt: (order: Order, localValue: string) => void
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

  const evaluatedCount = orders.filter((order) => (
    pricingFormHasWorkerEvaluation(pricingForms[order.id])
  )).length

  const pendingVisibilityCount = orders.filter((o) => {
    const form = pricingForms[o.id]
    return pricingFormHasWorkerEvaluation(form) && !o.worker_rating_visible
  }).length

  // مجموع تسعير القطع للطلبات المعروضة (أي طلبات الشهر المحدَّد في الفلتر)
  const totalWorkerPrice = orders.reduce((sum, order) => {
    const value = parseFloat(pricingForms[order.id]?.price ?? '')
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
  const monthLabel = monthFilter
    ? (recentMonths.find((m) => m.key === monthFilter)?.label || monthFilter)
    : 'كل الأشهر'

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

        {/* مجموع تسعير القطع للشهر المعروض — للمدير */}
        {isAdmin && totalWorkerPrice > 0 && (
          <div className="flex-1 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Tag className="w-4 h-4 text-pink-600 flex-shrink-0" />
            <p className="text-sm text-pink-800">
              مجموع تسعير القطع ({monthLabel}):{' '}
              <span className="font-bold">
                {totalWorkerPrice.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })} ر.س
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {orders.map((order, index) => {
          // وقت الإنجاز = الفرق بين إنجاز هذا الطلب والطلب الذي أُنجز قبله (التالي في القائمة المرتبة تنازلياً)
          const nextOrder = orders[index + 1]
          let completionGap: number | null = null
          if (order.worker_completed_at && nextOrder?.worker_completed_at) {
            const diff = new Date(order.worker_completed_at).getTime() - new Date(nextOrder.worker_completed_at).getTime()
            if (diff > 0) completionGap = diff
          }
          return (
            <CompletedOrderRow
              key={order.id}
              order={order}
              isAdmin={isAdmin}
              pricingData={pricingForms[order.id] || { orderId: order.id, price: '', notes: '', bonus: '', rating: 0 }}
              isExpanded={expandedOrderIds.has(order.id)}
              orderFullDetail={orderFullDetails[order.id] || null}
              completionGap={completionGap}
              onToggle={onTogglePricing}
              onSavePricing={onSavePricing}
              onOpenModal={onOpenModal}
              onLightbox={onLightbox}
              onToggleRatingVisibility={onToggleRatingVisibility}
              isEditingCompletedAt={editingCompletedAtId === order.id}
              isSavingCompletedAt={savingCompletedAtId === order.id}
              completedAtError={editingCompletedAtId === order.id ? completedAtError : null}
              onStartEditCompletedAt={onStartEditCompletedAt}
              onCancelEditCompletedAt={onCancelEditCompletedAt}
              onSaveCompletedAt={onSaveCompletedAt}
            />
          )
        })}
      </div>
      {total > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          إجمالي طلبات {monthFilter ? 'الشهر' : 'العامل'}: <span className="font-bold text-gray-700">{total}</span> طلب
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
  completionGap,
  onToggle,
  onSavePricing,
  onOpenModal,
  onLightbox,
  onToggleRatingVisibility,
  isEditingCompletedAt,
  isSavingCompletedAt,
  completedAtError,
  onStartEditCompletedAt,
  onCancelEditCompletedAt,
  onSaveCompletedAt,
}: {
  order: Order
  isAdmin: boolean
  pricingData: OrderPricingData
  isExpanded: boolean
  orderFullDetail: Order | null
  completionGap: number | null
  onToggle: (order: Order) => void
  onSavePricing: (orderId: string, data: OrderPricingData) => void
  onOpenModal: (order: Order) => void
  onLightbox: (src: string) => void
  onToggleRatingVisibility: (order: Order) => void
  isEditingCompletedAt: boolean
  isSavingCompletedAt: boolean
  completedAtError: string | null
  onStartEditCompletedAt: (order: Order) => void
  onCancelEditCompletedAt: () => void
  onSaveCompletedAt: (order: Order, localValue: string) => void
}) {
  const status = STATUS_MAP[order.status] || { label: order.status, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' }
  const hasPricing = pricingData.price.trim() !== ''
  const isEvaluated = hasPricing || pricingData.rating > 0
  const thumbnail = (order as any).design_thumbnail || '/front2.png'

  // مسوّدة تاريخ/ساعة إنهاء العامل أثناء التعديل — تُعاد للقيمة المحفوظة عند كل فتح
  const [completedAtDraft, setCompletedAtDraft] = useState('')
  useEffect(() => {
    if (isEditingCompletedAt) {
      setCompletedAtDraft(toDateTimeLocalValue(order.worker_completed_at))
    }
  }, [isEditingCompletedAt, order.worker_completed_at])

  // حفظ ثم طي البطاقة
  function handleSaveAndCollapse() {
    onSavePricing(order.id, pricingData)
    onToggle(order) // ينغلق لأنه مفتوح حالياً
  }

  const completedImages = orderFullDetail?.completed_images || []

  // طلب سُلِّم دون المرور بحالة «مكتمل» (تسليم صامت) لا يحمل تاريخ إنهاء.
  // نعرض له التاريخ البديل الذي وضعه في هذا الشهر حتى لا يبدو ظهوره عشوائياً.
  const fallbackCompletionDate = order.worker_completed_at ? null : getEffectiveCompletionDate(order)
  const fallbackCompletionLabel = order.admin_completed_at ? 'أكمله المدير' : 'سُلِّم'

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
              {Number(order.alteration_count || 0) > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">
                  <Wrench className="h-3 w-3" />
                  تعديلات بعد التسليم: {Number(order.alteration_count)}
                </span>
              ) : null}
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
              {/* تاريخ وساعة إنهاء العامل — قابل للتعديل يدوياً من قبل المدير */}
              {isEditingCompletedAt ? (
                <div className="rounded-xl border border-green-200 bg-green-50/60 p-2.5 space-y-2">
                  <label className="text-xs font-semibold text-green-800 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    تعديل تاريخ وساعة إنهاء العامل
                  </label>
                  <input
                    type="datetime-local"
                    value={completedAtDraft}
                    onChange={(e) => setCompletedAtDraft(e.target.value)}
                    disabled={isSavingCompletedAt}
                    dir="ltr"
                    className="w-full text-sm text-right px-3 py-2 rounded-lg border border-green-300 bg-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:opacity-60"
                  />
                  {completedAtError && (
                    <p className="text-xs text-red-600 font-medium">{completedAtError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSaveCompletedAt(order, completedAtDraft) }}
                      disabled={isSavingCompletedAt || !completedAtDraft}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSavingCompletedAt ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {isSavingCompletedAt ? 'جاري الحفظ...' : 'حفظ'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onCancelEditCompletedAt() }}
                      disabled={isSavingCompletedAt}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-600 border border-gray-200 text-xs font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" />
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {order.worker_completed_at ? (
                    <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3 h-3 flex-shrink-0" />
                      أنهاه العامل:{' '}
                      {formatGregorianDateTime(order.worker_completed_at)}
                    </p>
                  ) : fallbackCompletionDate ? (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 flex-shrink-0" />
                      لا يوجد تاريخ إنهاء — {fallbackCompletionLabel}:{' '}
                      {formatGregorianDateTime(fallbackCompletionDate)}
                    </p>
                  ) : isAdmin ? (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 flex-shrink-0" />
                      لا يوجد تاريخ إنهاء
                    </p>
                  ) : null}
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStartEditCompletedAt(order) }}
                      title="تعديل تاريخ وساعة إنهاء العامل"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      تعديل
                    </button>
                  )}
                </div>
              )}
              {completionGap !== null && (
                <p className="text-xs text-indigo-600 flex items-center gap-1 font-medium">
                  <TrendingUp className="w-3 h-3 flex-shrink-0" />
                  وقت الإنجاز:{' '}
                  <span className="bg-indigo-50 border border-indigo-200 rounded-md px-1.5 py-0.5">
                    {formatDuration(completionGap)}
                  </span>
                </p>
              )}
              {order.due_date && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  موعد التسليم:{' '}
                  {formatGregorianDate(order.due_date, 'ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
              {hasPricing && !isExpanded && (
                <p className="text-xs font-semibold text-pink-700 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {parseFloat(pricingData.price).toLocaleString('ar-SA-u-nu-latn')} ر.س
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
              <span className="text-sm font-bold text-gray-800">{order.price.toLocaleString('ar-SA-u-nu-latn')} ر.س</span>
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
