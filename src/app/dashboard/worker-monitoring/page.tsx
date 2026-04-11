'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { workerService, WorkerWithUser } from '@/lib/services/worker-service'
import { orderService } from '@/lib/services/order-service'
import {
  ArrowRight,
  Users,
  Star,
  Package,
  CheckCircle,
  LogOut,
  Loader2
} from 'lucide-react'

export default function WorkerMonitoringPage() {
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()

  const [tailors, setTailors] = useState<WorkerWithUser[]>([])
  const [activeOrderCounts, setActiveOrderCounts] = useState<Record<string, number>>({})
  const [completedOrderCounts, setCompletedOrderCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)

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
        const [workersResult, activeResult, completedResult] = await Promise.all([
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
          }),
        ])

        const tailorsList = (workersResult.data || []).filter(
          (w) => w.worker_type === 'tailor' && w.is_available
        )
        setTailors(tailorsList)

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
  }, [user, permissionsLoading])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  // Summary stats
  const totalTailors = tailors.length
  const availableCount = tailors.filter((w) => w.is_available).length
  const totalActiveOrders = Object.values(activeOrderCounts).reduce((s, c) => s + c, 0)
  const totalCompletedOrders = Object.values(completedOrderCounts).reduce((s, c) => s + c, 0)
  const avgRating =
    tailors.length > 0
      ? (tailors.reduce((s, w) => s + (w.performance_rating || 0), 0) / tailors.length).toFixed(1)
      : '—'

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
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-slate-50" dir="rtl">
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
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">الخياطون</h2>
          <p className="text-sm text-gray-500 mt-1">عرض ومتابعة أداء جميع الخياطين وطلباتهم</p>
        </motion.div>

        {/* Summary stats bar */}
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
