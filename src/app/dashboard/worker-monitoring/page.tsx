'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from '@/hooks/useTranslation'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { useSelectedMonth } from '@/hooks/useSelectedMonth'
import { workerService, WorkerWithUser } from '@/lib/services/worker-service'
import { orderService } from '@/lib/services/order-service'
import {
  ArrowRight,
  Users,
  Star,
  Package,
  CheckCircle,
  LogOut,
  Loader2,
  Fingerprint,
  UserCog,
  RotateCw,
} from 'lucide-react'
import {
  computeMonthSummary,
  computeRoleStats,
  cutMonthOf,
  type QualityRole,
  type WorkerQualityStats,
} from '@/lib/worker-alteration-stats'
import { useWorkerQualityData } from '@/components/worker-quality/worker-quality-data'
import { MonthSelect } from '@/components/worker-quality/worker-quality-ui'
import {
  MonthQualitySummary,
  SortChips,
  WorkerQualityCard,
  sortWorkersByQuality,
  type QualitySort,
} from '@/components/worker-quality/worker-quality-list'

type Segment = 'tailors' | 'cutters' | 'shak'

export default function WorkerMonitoringPage() {
  const { t, isArabic } = useTranslation()
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()

  const [managers, setManagers] = useState<WorkerWithUser[]>([])
  const [cutCounts, setCutCounts] = useState<Record<string, number>>({})
  const [cutError, setCutError] = useState<string | null>(null)
  const [shakWorkers, setShakWorkers] = useState<WorkerWithUser[]>([])
  const [shakPendingTotal, setShakPendingTotal] = useState(0)
  const [shakDoneCounts, setShakDoneCounts] = useState<Record<string, number>>({})
  const [tailors, setTailors] = useState<WorkerWithUser[]>([])
  // كل الخياطين بمن فيهم غير المتاحين — يظهر غير المتاح في تقييم الشهر إن كانت له طلبات فيه
  const [allTailors, setAllTailors] = useState<WorkerWithUser[]>([])
  const [activeOrderCounts, setActiveOrderCounts] = useState<Record<string, number>>({})
  const [completedOrderCounts, setCompletedOrderCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  // الشهر المشترك مع بقية أقسام متابعة العمال وصفحة الرواتب — محفوظ لبقية اليوم
  const [sharedMonth, setSharedMonth] = useSelectedMonth()
  const [allMonths, setAllMonths] = useState(false)
  const selectedMonth = allMonths ? '' : sharedMonth
  const isAdmin = user?.role === 'admin'
  const [segment, setSegment] = useState<Segment>('tailors')
  const [qualitySort, setQualitySort] = useState<QualitySort>('best')

  // تقييم التعديلات وأسبابها للمدير فقط، ولشهر محدد (التقييم شهري بطبيعته)
  const quality = useWorkerQualityData({
    enabled: isAdmin && !!selectedMonth,
    fromMonth: selectedMonth,
    toMonth: selectedMonth,
    kinds: ['completed', 'cut'],
  })
  const qualityReady = isAdmin && !!selectedMonth && !!quality.data && !quality.loading
  const tailorStats = useMemo(() => (
    quality.data && selectedMonth
      ? computeRoleStats({
          role: 'tailor',
          month: selectedMonth,
          orders: quality.data.completed,
          alterations: quality.data.alterations,
          reviews: quality.data.reviews,
          workerIds: allTailors.map(worker => worker.id),
        })
      : new Map<string, WorkerQualityStats>()
  ), [quality.data, selectedMonth, allTailors])
  const cutterStats = useMemo(() => (
    quality.data && selectedMonth
      ? computeRoleStats({
          role: 'cutter',
          month: selectedMonth,
          orders: quality.data.cut,
          alterations: quality.data.alterations,
          reviews: quality.data.reviews,
          workerIds: managers.map(worker => worker.id),
        })
      : new Map<string, WorkerQualityStats>()
  ), [quality.data, selectedMonth, managers])
  const monthSummary = useMemo(() => (
    quality.data && selectedMonth ? computeMonthSummary(selectedMonth, quality.data.completed, quality.data.alterations) : null
  ), [quality.data, selectedMonth])
  const qualityTailors = useMemo(() => sortWorkersByQuality(
    allTailors.filter(worker => worker.is_available || (tailorStats.get(worker.id)?.orders ?? 0) > 0),
    tailorStats,
    qualitySort
  ), [allTailors, tailorStats, qualitySort])
  // قيد التنفيذ للقصّاص: طلبات قصّها في الشهر ولم تكتمل بعد
  const cutterActiveCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const order of quality.data?.cut || []) {
      if (!order.cutter_id || cutMonthOf(order) !== selectedMonth) continue
      if (order.status !== 'pending' && order.status !== 'in_progress') continue
      counts[order.cutter_id] = (counts[order.cutter_id] || 0) + 1
    }
    return counts
  }, [quality.data, selectedMonth])
  const qualityCutters = useMemo(() => sortWorkersByQuality(managers, cutterStats, qualitySort), [managers, cutterStats, qualitySort])

  // «كل الأشهر» ليس شهراً، فيبقى محلياً ولا يمحو الشهر المختار للأقسام الأخرى
  function handleMonthChange(value: string) {
    setAllMonths(!value)
    if (value) setSharedMonth(value)
  }

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

  // Fetch tailors + active order counts
  useEffect(() => {
    if (!user) return
    if (permissionsLoading) return

    async function fetchData() {
      setIsLoading(true)
      try {
        const [workersResult, activeResult, completedResult, cutResult, shakPendingResult, shakDoneResult] = await Promise.all([
          workerService.getAll(),
          orderService.getAll({
            status: ['pending', 'in_progress'],
            noPagination: true,
            lightweight: true,
          }),
          orderService.getAll({
            status: ['completed', 'delivered'],
            noPagination: true,
            lightweight: true,
            monthFilter: selectedMonth || undefined,
          }),
          orderService.getAll({ cutOrdersOnly: true, cutMonth: selectedMonth || undefined, noPagination: true }),
          // طلبات الشك المعلّقة مشتركة بين كل الشكّاكين، فتُعرض كرقم واحد
          orderService.getAll({ hasShakWork: true, shakCompleted: false, noPagination: true, lightweight: true }),
          orderService.getAll({ hasShakWork: true, shakCompleted: true, noPagination: true, lightweight: true }),
        ])
        setManagers((workersResult.data || []).filter(w => w.worker_type === 'workshop_manager'))
        setShakWorkers((workersResult.data || []).filter(w => w.worker_type === 'shak_worker'))
        setShakPendingTotal(shakPendingResult.total ?? (shakPendingResult.data || []).length)
        const shakCounts: Record<string, number> = {}
        for (const order of shakDoneResult.data || []) {
          if (order.shak_worker_id) shakCounts[order.shak_worker_id] = (shakCounts[order.shak_worker_id] || 0) + 1
        }
        setShakDoneCounts(shakCounts)
        setCutError(cutResult.error || workersResult.error)
        const counts: Record<string, number> = {}
        for (const order of cutResult.data || []) {
          if (order.cutter_id) counts[order.cutter_id] = (counts[order.cutter_id] || 0) + 1
        }
        setCutCounts(counts)

        const tailorsList = (workersResult.data || []).filter(
          (w) => w.worker_type === 'tailor' && w.is_available
        )
        setTailors(tailorsList)
        setAllTailors((workersResult.data || []).filter((w) => w.worker_type === 'tailor'))

        // Count active orders per worker_id
        const activeCounts: Record<string, number> = {}
        for (const order of activeResult.data || []) {
          if (order.worker_id) {
            activeCounts[order.worker_id] = (activeCounts[order.worker_id] || 0) + 1
          }
        }
        setActiveOrderCounts(activeCounts)

        // Count completed+delivered orders per worker_id
        const completedCounts: Record<string, number> = {}
        for (const order of completedResult.data || []) {
          if (order.worker_id) {
            completedCounts[order.worker_id] = (completedCounts[order.worker_id] || 0) + 1
          }
        }
        setCompletedOrderCounts(completedCounts)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [user, permissionsLoading, selectedMonth])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  // Summary stats
  const totalTailors = tailors.length
  const availableCount = tailors.filter((w) => w.is_available).length
  const totalActiveOrders = Object.values(activeOrderCounts).reduce((s, c) => s + c, 0)
  const totalCompletedOrders = Object.values(completedOrderCounts).reduce((s, c) => s + c, 0)
  if (permissionsLoading || (isLoading && tailors.length === 0)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-slate-50" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-teal-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-teal-600 hover:text-teal-700 transition-colors flex items-center gap-1"
              >
                <ArrowRight className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">لوحة التحكم</span>
              </Link>
              <div className="w-px h-5 bg-gray-200" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-teal-400 to-cyan-400 rounded-lg">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-base sm:text-lg font-bold text-gray-800">متابعة العمال</h1>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-500 hover:text-red-500 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page title + month filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">العمال</h2>
            <p className="text-sm text-gray-500 mt-1">متابعة أداء العمال وطلباتهم{isAdmin ? ' وتعديلاتهم' : ''}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:self-auto">
            {user?.role === 'admin' && (
              <Link
                href="/dashboard/workers"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3.5 text-sm font-bold text-teal-800 shadow-sm transition-colors hover:bg-teal-50"
              >
                <UserCog className="h-4 w-4" />
                إدارة العمال
              </Link>
            )}
            <Link
              href="/dashboard/worker-monitoring/attendance"
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-800 ${user?.role === 'admin' ? '' : 'col-span-2'}`}
            >
              <Fingerprint className="h-4 w-4" />
              الحضور والانصراف
            </Link>
            <MonthSelect
              value={selectedMonth}
              onChange={handleMonthChange}
              includeAll
              className="col-span-2 sm:w-48"
            />
          </div>
        </motion.div>

        {/* Summary stats bar — يُستبدل بملخص التعديلات في عرض المدير الشهري */}
        {!(isAdmin && selectedMonth) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8"
        >
          <div className="bg-white rounded-xl border border-teal-100 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-teal-600">{totalTailors}</p>
            <p className="text-xs text-gray-500 mt-1">إجمالي الخياطين</p>
          </div>
          <div className="bg-white rounded-xl border border-green-100 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">{availableCount}</p>
            <p className="text-xs text-gray-500 mt-1">متاحون الآن</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-100 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-blue-600">{totalActiveOrders}</p>
            <p className="text-xs text-gray-500 mt-1">الطلبات النشطة</p>
          </div>
          <div className="bg-white rounded-xl border border-purple-100 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-purple-600">{totalCompletedOrders}</p>
            <p className="text-xs text-gray-500 mt-1">الطلبات المكتملة</p>
          </div>
        </motion.div>
        )}

        {isAdmin && selectedMonth ? (
          <QualityView
            month={selectedMonth}
            loading={quality.loading || !qualityReady}
            error={quality.error}
            onRetry={quality.retry}
            summary={monthSummary}
            segment={segment}
            onSegmentChange={setSegment}
            sort={qualitySort}
            onSortChange={setQualitySort}
            tailors={qualityTailors}
            cutters={qualityCutters}
            shakWorkers={shakWorkers}
            tailorStats={tailorStats}
            cutterStats={cutterStats}
            activeCounts={activeOrderCounts}
            cutterActiveCounts={cutterActiveCounts}
            shakDoneCounts={shakDoneCounts}
            shakPendingTotal={shakPendingTotal}
          />
        ) : (
        <>
        {isAdmin && !selectedMonth ? (
          <p className="mb-4 rounded-xl border border-pink-100 bg-pink-50/60 px-4 py-3 text-sm font-bold text-pink-800">
            اختر شهراً لعرض تقييم التعديلات وترتيب العمال.
          </p>
        ) : null}
        {/* Worker grid */}
        {tailors.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Users className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-base font-medium">لا يوجد خياطون مسجّلون حتى الآن</p>
            <p className="text-gray-400 text-sm mt-1">سيظهر هنا الخياطون بعد إضافتهم من قسم إدارة العمال</p>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tailors.map((worker, index) => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                activeOrders={activeOrderCounts[worker.id] || 0}
                completedOrders={completedOrderCounts[worker.id] || 0}
                index={index}
              />
            ))}
          </div>
        )}
        <section className="mt-10" aria-label={t('workshop_managers')}>
          <h2 className="mb-4 text-xl font-bold text-gray-800">{t('workshop_managers')}</h2>
          {cutError && <p role="alert" className="mb-3 text-sm text-red-600">{cutError}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {managers.map(manager => (
              <Link key={manager.id} href={`/dashboard/worker-monitoring/${manager.id}`} className="rounded-2xl border-2 border-teal-100 bg-white p-5 transition-colors hover:border-teal-400">
                <h3 className="font-bold text-gray-800">{manager.user?.full_name || t('not_specified')}</h3>
                <p className="mt-1 text-xs text-gray-500">{t('cutter')}</p>
                <p className="mt-4 text-sm text-teal-700">{t('cut_orders')}: <strong>{cutError ? '—' : cutCounts[manager.id] || 0}</strong></p>
              </Link>
            ))}
          </div>
        </section>
        {shakWorkers.length > 0 && (
          <section className="mt-10" aria-label={t('shak_workers') || 'الشكّاكون'}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-gray-800">{t('shak_workers') || 'الشكّاكون'}</h2>
              <p className="text-sm text-gray-500">
                {t('shak_pending_orders') || 'شك قيد التنفيذ'}: <strong className="text-amber-700">{shakPendingTotal}</strong>
                <span className="mx-1 text-gray-300">|</span>
                <span className="text-xs">{isArabic ? 'مشتركة بين الجميع' : 'shared by all'}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shakWorkers.map(shakWorker => (
                <Link key={shakWorker.id} href={`/dashboard/worker-monitoring/${shakWorker.id}`} className="rounded-2xl border-2 border-indigo-100 bg-white p-5 transition-colors hover:border-indigo-400">
                  <h3 className="font-bold text-gray-800">{shakWorker.user?.full_name || t('not_specified')}</h3>
                  <p className="mt-1 text-xs text-gray-500">{t('shak_worker') || 'شكّاك'}</p>
                  <p className="mt-4 text-sm text-indigo-700">
                    {t('shak_completed_orders') || 'شك مكتمل'}: <strong>{shakDoneCounts[shakWorker.id] || 0}</strong>
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
        </>
        )}
      </main>
    </div>
  )
}

function WorkerCard({
  worker,
  activeOrders,
  completedOrders,
  index,
}: {
  worker: WorkerWithUser
  activeOrders: number
  completedOrders: number
  index: number
}) {
  const name = worker.user?.full_name || 'بدون اسم'
  const firstLetter = name[0] || '؟'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.05 }}
    >
      <Link
        href={`/dashboard/worker-monitoring/${worker.id}`}
        className="group block p-5 bg-white rounded-2xl border-2 border-slate-100 hover:border-teal-300 hover:shadow-xl transition-all duration-300"
      >
        {/* Avatar + availability dot */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold shadow-md group-hover:scale-105 transition-transform duration-300">
              {firstLetter}
            </div>
            <span
              className={`absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2 border-white ${
                worker.is_available ? 'bg-green-400' : 'bg-gray-300'
              }`}
            />
          </div>

          {/* Name */}
          <h3 className="font-bold text-gray-800 text-base leading-tight mb-1">{name}</h3>

          {/* Specialty badge */}
          {worker.specialty && (
            <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-medium border border-teal-100 mb-3">
              {worker.specialty}
            </span>
          )}

          {/* Stats row */}
          <div className="flex justify-around w-full border-t border-slate-100 pt-3 mt-1">
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-lg font-bold text-blue-600">{activeOrders}</span>
              </div>
              <span className="text-xs text-gray-400">نشطة</span>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                <span className="text-lg font-bold text-green-600">{completedOrders}</span>
              </div>
              <span className="text-xs text-gray-400">مكتملة</span>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-lg font-bold text-yellow-600">
                  {worker.performance_rating ? worker.performance_rating.toFixed(1) : '—'}
                </span>
              </div>
              <span className="text-xs text-gray-400">تقييم</span>
            </div>
          </div>

          {/* Availability badge */}
          <span
            className={`mt-3 text-xs px-3 py-1 rounded-full font-medium ${
              worker.is_available
                ? 'bg-green-50 text-green-700 border border-green-100'
                : 'bg-gray-50 text-gray-500 border border-gray-100'
            }`}
          >
            {worker.is_available ? 'متاح' : 'غير متاح'}
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

// ============================================================================
// عرض المدير لشهر محدد: ملخص تعديلات الشهر + تقييم وترتيب كل عامل
// ============================================================================

function QualityView({
  month,
  loading,
  error,
  onRetry,
  summary,
  segment,
  onSegmentChange,
  sort,
  onSortChange,
  tailors,
  cutters,
  shakWorkers,
  tailorStats,
  cutterStats,
  activeCounts,
  cutterActiveCounts,
  shakDoneCounts,
  shakPendingTotal,
}: {
  month: string
  loading: boolean
  error: string | null
  onRetry: () => void
  summary: ReturnType<typeof computeMonthSummary> | null
  segment: Segment
  onSegmentChange: (segment: Segment) => void
  sort: QualitySort
  onSortChange: (sort: QualitySort) => void
  tailors: WorkerWithUser[]
  cutters: WorkerWithUser[]
  shakWorkers: WorkerWithUser[]
  tailorStats: Map<string, WorkerQualityStats>
  cutterStats: Map<string, WorkerQualityStats>
  activeCounts: Record<string, number>
  cutterActiveCounts: Record<string, number>
  shakDoneCounts: Record<string, number>
  shakPendingTotal: number
}) {
  const segments: Array<{ key: Segment; label: string; count: number }> = [
    { key: 'tailors', label: 'الخياطون', count: tailors.length },
    { key: 'cutters', label: 'القصّاصون', count: cutters.length },
    ...(shakWorkers.length > 0 ? [{ key: 'shak' as Segment, label: 'الشكّاكون', count: shakWorkers.length }] : []),
  ]
  const active: Segment = segment === 'shak' && shakWorkers.length === 0 ? 'tailors' : segment
  const role: QualityRole = active === 'cutters' ? 'cutter' : 'tailor'
  const list = active === 'cutters' ? cutters : tailors
  const stats = active === 'cutters' ? cutterStats : tailorStats

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">تعذّر تحميل تعديلات الشهر</p>
          <p className="mt-1 break-words">{error}</p>
          <button type="button" onClick={onRetry} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-bold">
            <RotateCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      ) : loading || !summary ? (
        <div className="h-40 animate-pulse rounded-2xl border border-pink-100 bg-white/80" />
      ) : (
        <MonthQualitySummary month={month} summary={summary} />
      )}

      <div
        role="tablist"
        aria-label="نوع العمال"
        className={`grid gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm ${segments.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} sm:max-w-lg`}
      >
        {segments.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active === item.key}
            onClick={() => onSegmentChange(item.key)}
            className={`h-11 rounded-xl px-2 text-sm font-bold transition ${
              active === item.key ? 'bg-gradient-to-l from-pink-500 to-purple-500 text-white shadow-sm' : 'text-slate-600 hover:bg-pink-50'
            }`}
          >
            {item.label} <span className="tabular-nums opacity-80">({item.count})</span>
          </button>
        ))}
      </div>

      {active === 'shak' ? (
        <section aria-label="الشكّاكون" className="space-y-3">
          <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm leading-6 text-indigo-800">
            لا تقييم للشكّاكين (لا يوجد سبب تعديل يُنسب إليهم). شك قيد التنفيذ:{' '}
            <strong className="tabular-nums">{shakPendingTotal}</strong>
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shakWorkers.map((shakWorker) => (
              <Link
                key={shakWorker.id}
                href={`/dashboard/worker-monitoring/${shakWorker.id}`}
                className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-white p-4 transition-colors hover:border-indigo-400"
              >
                <span className="min-w-0">
                  <span className="block truncate font-extrabold text-slate-900">{shakWorker.user?.full_name || 'بدون اسم'}</span>
                  <span className="text-sm text-slate-500">شكّاك</span>
                </span>
                <span className="shrink-0 text-sm text-indigo-700">
                  شك مكتمل: <strong className="tabular-nums">{shakDoneCounts[shakWorker.id] || 0}</strong>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <>
          <SortChips value={sort} onChange={onSortChange} />
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-56 animate-pulse rounded-2xl border border-slate-100 bg-white/80" />
              ))}
            </div>
          ) : error ? null : list.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="font-bold text-slate-700">
                {active === 'cutters' ? 'لا يوجد قصّاصون مسجّلون' : 'لا يوجد خياطون متاحون أو لهم طلبات في هذا الشهر'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((worker, index) => (
                <WorkerQualityCard
                  key={worker.id}
                  worker={worker}
                  role={role}
                  stats={stats.get(worker.id)}
                  activeOrders={(active === 'cutters' ? cutterActiveCounts : activeCounts)[worker.id] || 0}
                  index={index}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
