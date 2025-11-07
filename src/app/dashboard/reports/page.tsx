'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useAppointmentStore } from '@/store/appointmentStore'
import { useTranslation } from '@/hooks/useTranslation'
import {
  ArrowRight,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Users,
  Calendar,
  Download,
  Filter,
  Clock,
  CheckCircle,
  Loader,
  PackageCheck,
  Truck,
  XCircle,
  AlertCircle,
  FileText,
  Printer,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Target,
  Award,
  Activity,
  Zap,
  Star,
  UserCheck,
  CalendarCheck,
  CalendarX,
  Phone,
  Mail,
  Percent
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

interface DateFilter {
  startDate: Date
  endDate: Date
}

// ============================================================================
// Main Component
// ============================================================================

export default function ReportsPage() {
  const { user } = useAuthStore()
  const { orders, loadOrders, getStats: getOrderStats } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { appointments, loadAppointments } = useAppointmentStore()
  const { t } = useTranslation()
  const router = useRouter()

  // ============================================================================
  // State
  // ============================================================================

  const [selectedPeriod, setSelectedPeriod] = useState<DateRange>('month')
  const [customDateRange, setCustomDateRange] = useState<DateFilter>({
    startDate: new Date(),
    endDate: new Date()
  })
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  // ============================================================================
  // Effects
  // ============================================================================

  // تحميل البيانات عند تحميل الصفحة
  useEffect(() => {
    loadOrders()
    loadWorkers()
    loadAppointments()
  }, [loadOrders, loadWorkers, loadAppointments])

  // التحقق من الصلاحيات
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  // ============================================================================
  // Helper Functions - Date Filtering
  // ============================================================================

  const getDateRange = (): DateFilter => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (selectedPeriod) {
      case 'today':
        return {
          startDate: today,
          endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      case 'week':
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        return {
          startDate: weekStart,
          endDate: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
        }
      case 'month':
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1),
          endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        }
      case 'quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3
        return {
          startDate: new Date(now.getFullYear(), quarterMonth, 1),
          endDate: new Date(now.getFullYear(), quarterMonth + 3, 0, 23, 59, 59)
        }
      case 'year':
        return {
          startDate: new Date(now.getFullYear(), 0, 1),
          endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59)
        }
      case 'custom':
        return customDateRange
      default:
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1),
          endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        }
    }
  }

  const getPreviousDateRange = (): DateFilter => {
    const current = getDateRange()
    const diff = current.endDate.getTime() - current.startDate.getTime()

    return {
      startDate: new Date(current.startDate.getTime() - diff),
      endDate: new Date(current.endDate.getTime() - diff)
    }
  }

  const isInDateRange = (dateString: string, range: DateFilter): boolean => {
    const date = new Date(dateString)
    return date >= range.startDate && date <= range.endDate
  }

  // ============================================================================
  // Data Calculations - Memoized for Performance
  // ============================================================================

  const filteredData = useMemo(() => {
    const dateRange = getDateRange()
    const previousRange = getPreviousDateRange()

    // Filter orders
    const currentOrders = orders.filter(order =>
      isInDateRange(order.created_at, dateRange)
    )
    const previousOrders = orders.filter(order =>
      isInDateRange(order.created_at, previousRange)
    )

    // Filter appointments
    const currentAppointments = appointments.filter(apt =>
      isInDateRange(apt.created_at, dateRange)
    )
    const previousAppointments = appointments.filter(apt =>
      isInDateRange(apt.created_at, previousRange)
    )

    return {
      currentOrders,
      previousOrders,
      currentAppointments,
      previousAppointments,
      dateRange,
      previousRange
    }
  }, [orders, appointments, selectedPeriod, customDateRange])

  // ============================================================================
  // Comprehensive Statistics Calculations
  // ============================================================================

  const comprehensiveStats = useMemo(() => {
    const { currentOrders, previousOrders, currentAppointments, previousAppointments } = filteredData

    // Orders Statistics
    const currentRevenue = currentOrders
      .filter(o => o.status === 'completed' || o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.price || 0), 0)

    const previousRevenue = previousOrders
      .filter(o => o.status === 'completed' || o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.price || 0), 0)

    const revenueChange = previousRevenue > 0
      ? Number((((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1))
      : 0

    const ordersChange = previousOrders.length > 0
      ? Number((((currentOrders.length - previousOrders.length) / previousOrders.length) * 100).toFixed(1))
      : 0

    const completedOrders = currentOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length
    const completionRate = currentOrders.length > 0
      ? Number(((completedOrders / currentOrders.length) * 100).toFixed(1))
      : 0

    const averageOrderValue = currentOrders.length > 0
      ? Math.round(currentRevenue / currentOrders.length)
      : 0

    // Calculate average completion time
    const completedOrdersWithDates = currentOrders.filter(o =>
      (o.status === 'completed' || o.status === 'delivered') && o.delivery_date
    )
    const avgCompletionTime = completedOrdersWithDates.length > 0
      ? Math.round(
          completedOrdersWithDates.reduce((sum, o) => {
            const start = new Date(o.created_at).getTime()
            const end = new Date(o.delivery_date!).getTime()
            return sum + (end - start) / (1000 * 60 * 60 * 24) // days
          }, 0) / completedOrdersWithDates.length
        )
      : 0

    // Orders by Status
    const ordersByStatus = {
      pending: currentOrders.filter(o => o.status === 'pending').length,
      in_progress: currentOrders.filter(o => o.status === 'in_progress').length,
      completed: currentOrders.filter(o => o.status === 'completed').length,
      delivered: currentOrders.filter(o => o.status === 'delivered').length,
      cancelled: currentOrders.filter(o => o.status === 'cancelled').length
    }

    // Appointments Statistics
    const appointmentsByStatus = {
      pending: currentAppointments.filter(a => a.status === 'pending').length,
      confirmed: currentAppointments.filter(a => a.status === 'confirmed').length,
      completed: currentAppointments.filter(a => a.status === 'completed').length,
      cancelled: currentAppointments.filter(a => a.status === 'cancelled').length
    }

    const appointmentConversionRate = currentAppointments.length > 0
      ? Number(((appointmentsByStatus.completed / currentAppointments.length) * 100).toFixed(1))
      : 0

    // Customer Insights
    const uniqueCustomers = new Set(currentOrders.map(o => o.client_phone)).size
    const previousUniqueCustomers = new Set(previousOrders.map(o => o.client_phone)).size
    const customerGrowth = previousUniqueCustomers > 0
      ? Number((((uniqueCustomers - previousUniqueCustomers) / previousUniqueCustomers) * 100).toFixed(1))
      : 0

    // Payment Statistics
    const totalPaid = currentOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0)
    const totalDue = currentRevenue - totalPaid
    const paymentCollectionRate = currentRevenue > 0
      ? Number(((totalPaid / currentRevenue) * 100).toFixed(1))
      : 0

    return {
      // Revenue
      currentRevenue,
      previousRevenue,
      revenueChange,
      totalPaid,
      totalDue,
      paymentCollectionRate,

      // Orders
      totalOrders: currentOrders.length,
      ordersChange,
      completedOrders,
      completionRate,
      averageOrderValue,
      avgCompletionTime,
      ordersByStatus,

      // Appointments
      totalAppointments: currentAppointments.length,
      appointmentsByStatus,
      appointmentConversionRate,

      // Customers
      uniqueCustomers,
      customerGrowth
    }
  }, [filteredData])

  // Worker Performance
  const workerPerformance = useMemo(() => {
    const { currentOrders } = filteredData

    return workers.map(worker => {
      const workerOrders = currentOrders.filter(o => o.worker_id === worker.id)
      const completedOrders = workerOrders.filter(o => o.status === 'completed' || o.status === 'delivered')
      const revenue = completedOrders.reduce((sum, o) => sum + Number(o.price || 0), 0)

      const completionRate = workerOrders.length > 0
        ? Number(((completedOrders.length / workerOrders.length) * 100).toFixed(1))
        : 0

      // Calculate average completion time for this worker
      const completedWithDates = completedOrders.filter(o => o.delivery_date)
      const avgTime = completedWithDates.length > 0
        ? Math.round(
            completedWithDates.reduce((sum, o) => {
              const start = new Date(o.created_at).getTime()
              const end = new Date(o.delivery_date!).getTime()
              return sum + (end - start) / (1000 * 60 * 60 * 24)
            }, 0) / completedWithDates.length
          )
        : 0

      return {
        id: worker.id,
        name: worker.user?.full_name || worker.user?.email || 'عامل',
        totalOrders: workerOrders.length,
        completedOrders: completedOrders.length,
        completionRate,
        revenue,
        avgCompletionTime: avgTime,
        efficiency: completionRate >= 80 ? 'excellent' : completionRate >= 60 ? 'good' : 'needs_improvement'
      }
    })
    .filter(w => w.totalOrders > 0)
    .sort((a, b) => b.revenue - a.revenue)
  }, [workers, filteredData])

  // Orders by Type
  const ordersByType = useMemo(() => {
    const { currentOrders } = filteredData
    const typeCount: { [key: string]: number } = {}

    currentOrders.forEach(order => {
      const desc = order.description.toLowerCase()
      const type = desc.includes('زفاف') || desc.includes('wedding') ? 'فستان زفاف' :
                   desc.includes('سهرة') || desc.includes('evening') ? 'فستان سهرة' :
                   desc.includes('خطوبة') || desc.includes('engagement') ? 'فستان خطوبة' :
                   desc.includes('يومي') || desc.includes('casual') ? 'فستان يومي' : 'أخرى'

      typeCount[type] = (typeCount[type] || 0) + 1
    })

    const total = currentOrders.length

    return Object.entries(typeCount).map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      revenue: currentOrders
        .filter(o => {
          const desc = o.description.toLowerCase()
          if (type === 'فستان زفاف') return desc.includes('زفاف') || desc.includes('wedding')
          if (type === 'فستان سهرة') return desc.includes('سهرة') || desc.includes('evening')
          if (type === 'فستان خطوبة') return desc.includes('خطوبة') || desc.includes('engagement')
          if (type === 'فستان يومي') return desc.includes('يومي') || desc.includes('casual')
          return true
        })
        .filter(o => o.status === 'completed' || o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.price || 0), 0)
    }))
    .sort((a, b) => b.count - a.count)
  }, [filteredData])

  // Monthly Trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                   'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    const trend = []
    const currentDate = new Date()

    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1)
      const monthName = months[date.getMonth()]
      const monthShort = monthName.substring(0, 3)

      const monthOrders = orders.filter(order => {
        const orderDate = new Date(order.created_at)
        return orderDate.getMonth() === date.getMonth() &&
               orderDate.getFullYear() === date.getFullYear()
      })

      const revenue = monthOrders
        .filter(order => order.status === 'completed' || order.status === 'delivered')
        .reduce((sum, order) => sum + Number(order.price || 0), 0)

      const monthAppointments = appointments.filter(apt => {
        const aptDate = new Date(apt.created_at)
        return aptDate.getMonth() === date.getMonth() &&
               aptDate.getFullYear() === date.getFullYear()
      })

      trend.push({
        month: monthShort,
        fullMonth: monthName,
        revenue,
        orders: monthOrders.length,
        appointments: monthAppointments.length,
        completedOrders: monthOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length
      })
    }

    return trend
  }, [orders, appointments])

  // ============================================================================
  // Loading & Permission Check
  // ============================================================================

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('checking_permissions') || 'جاري التحقق من الصلاحيات...'}</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300 group"
          >
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
            <span>{t('back_to_dashboard') || 'العودة للوحة التحكم'}</span>
          </Link>
        </motion.div>

        {/* العنوان والفلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">
                <span className="bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {t('reports_analytics') || 'التقارير والتحليلات'}
                </span>
              </h1>
              <p className="text-base sm:text-lg text-gray-600 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-pink-600" />
                <span>{t('comprehensive_analysis') || 'تحليل شامل لأداء الأعمال'}</span>
              </p>
            </div>

            {/* Filters and Export Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Date Range Selector */}
              <div className="relative">
                <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value as DateRange)}
                  className="pr-10 pl-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all duration-300 bg-white hover:border-pink-300 cursor-pointer text-sm font-medium"
                >
                  <option value="today">اليوم</option>
                  <option value="week">هذا الأسبوع</option>
                  <option value="month">هذا الشهر</option>
                  <option value="quarter">هذا الربع</option>
                  <option value="year">هذا العام</option>
                </select>
              </div>

              {/* Export Buttons */}
              <div className="flex gap-2">
                <button
                  className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse px-4 py-2.5 text-sm"
                  title="تصدير PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">PDF</span>
                </button>

                <button
                  className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse px-4 py-2.5 text-sm"
                  title="تصدير Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel</span>
                </button>

                <button
                  className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse px-4 py-2.5 text-sm"
                  title="طباعة"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">طباعة</span>
                </button>
              </div>
            </div>
          </div>

          {/* Period Info */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-blue-800">
                <Calendar className="w-5 h-5" />
                <span className="font-semibold">الفترة المحددة:</span>
                <span className="font-bold">
                  {selectedPeriod === 'today' && 'اليوم'}
                  {selectedPeriod === 'week' && 'هذا الأسبوع'}
                  {selectedPeriod === 'month' && 'هذا الشهر'}
                  {selectedPeriod === 'quarter' && 'هذا الربع'}
                  {selectedPeriod === 'year' && 'هذا العام'}
                </span>
              </div>
              <div className="text-sm text-blue-600">
                {new Date(filteredData.dateRange.startDate).toLocaleDateString('ar-SA')} - {new Date(filteredData.dateRange.endDate).toLocaleDateString('ar-SA')}
              </div>
            </div>
          </div>
        </motion.div>

        {/* KPIs Section - المؤشرات الرئيسية */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Target className="w-6 h-6 text-pink-600" />
            <span>مؤشرات الأداء الرئيسية (KPIs)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Revenue */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border-2 border-green-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-200/30 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-400 rounded-xl flex items-center justify-center shadow-md">
                    <DollarSign className="w-7 h-7 text-white" />
                  </div>
                  <div className={`flex items-center space-x-1 space-x-reverse text-sm font-semibold ${
                    comprehensiveStats.revenueChange > 0 ? 'text-green-600' : comprehensiveStats.revenueChange < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {comprehensiveStats.revenueChange > 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : comprehensiveStats.revenueChange < 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : null}
                    <span>{Math.abs(comprehensiveStats.revenueChange)}%</span>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-green-700 mb-1">
                  {comprehensiveStats.currentRevenue.toLocaleString()} ر.س
                </h3>
                <p className="text-sm font-semibold text-green-800">إجمالي الإيرادات</p>
                <p className="text-xs text-green-600 mt-1">من الطلبات المكتملة</p>
              </div>
            </motion.div>

            {/* Total Orders */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border-2 border-blue-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-200/30 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-xl flex items-center justify-center shadow-md">
                    <Package className="w-7 h-7 text-white" />
                  </div>
                  <div className={`flex items-center space-x-1 space-x-reverse text-sm font-semibold ${
                    comprehensiveStats.ordersChange > 0 ? 'text-green-600' : comprehensiveStats.ordersChange < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {comprehensiveStats.ordersChange > 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : comprehensiveStats.ordersChange < 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : null}
                    <span>{Math.abs(comprehensiveStats.ordersChange)}%</span>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-blue-700 mb-1">
                  {comprehensiveStats.totalOrders}
                </h3>
                <p className="text-sm font-semibold text-blue-800">إجمالي الطلبات</p>
                <p className="text-xs text-blue-600 mt-1">في الفترة المحددة</p>
              </div>
            </motion.div>

            {/* Completion Rate */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-200/30 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl flex items-center justify-center shadow-md">
                    <CheckCircle className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 space-x-reverse text-sm font-semibold text-purple-600">
                    <Percent className="w-4 h-4" />
                    <span>{comprehensiveStats.completionRate}%</span>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-purple-700 mb-1">
                  {comprehensiveStats.completedOrders}
                </h3>
                <p className="text-sm font-semibold text-purple-800">طلبات مكتملة</p>
                <p className="text-xs text-purple-600 mt-1">معدل الإنجاز {comprehensiveStats.completionRate}%</p>
              </div>
            </motion.div>

            {/* Average Order Value */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="relative overflow-hidden bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl p-6 border-2 border-orange-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-200/30 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-yellow-400 rounded-xl flex items-center justify-center shadow-md">
                    <Activity className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 space-x-reverse text-sm font-semibold text-orange-600">
                    <Clock className="w-4 h-4" />
                    <span>{comprehensiveStats.avgCompletionTime} يوم</span>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-orange-700 mb-1">
                  {comprehensiveStats.averageOrderValue.toLocaleString()} ر.س
                </h3>
                <p className="text-sm font-semibold text-orange-800">متوسط قيمة الطلب</p>
                <p className="text-xs text-orange-600 mt-1">متوسط وقت الإنجاز</p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Secondary KPIs Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          {/* Unique Customers */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className={`text-sm font-semibold ${comprehensiveStats.customerGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {comprehensiveStats.customerGrowth >= 0 ? '+' : ''}{comprehensiveStats.customerGrowth}%
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">{comprehensiveStats.uniqueCustomers}</h3>
            <p className="text-sm text-gray-600">عملاء فريدون</p>
          </div>

          {/* Total Appointments */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div className="text-sm font-semibold text-blue-600">
                {comprehensiveStats.appointmentConversionRate}%
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">{comprehensiveStats.totalAppointments}</h3>
            <p className="text-sm text-gray-600">إجمالي المواعيد</p>
          </div>

          {/* Payment Collection Rate */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-400 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div className="text-sm font-semibold text-green-600">
                {comprehensiveStats.paymentCollectionRate}%
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">{comprehensiveStats.totalPaid.toLocaleString()} ر.س</h3>
            <p className="text-sm text-gray-600">المبالغ المحصلة</p>
          </div>

          {/* Outstanding Balance */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-400 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div className="text-sm font-semibold text-orange-600">
                متبقي
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">{comprehensiveStats.totalDue.toLocaleString()} ر.س</h3>
            <p className="text-sm text-gray-600">المبالغ المستحقة</p>
          </div>
        </motion.div>

        {/* Orders Status Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Package className="w-6 h-6 text-pink-600" />
            <span>حالة الطلبات</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Pending */}
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-5 border-2 border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <Clock className="w-8 h-8 text-yellow-600" />
                <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.pending / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-yellow-700 mb-1">{comprehensiveStats.ordersByStatus.pending}</h3>
              <p className="text-sm font-semibold text-yellow-800">قيد الانتظار</p>
            </div>

            {/* In Progress */}
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border-2 border-blue-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.in_progress / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-blue-700 mb-1">{comprehensiveStats.ordersByStatus.in_progress}</h3>
              <p className="text-sm font-semibold text-blue-800">قيد التنفيذ</p>
            </div>

            {/* Completed */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border-2 border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <PackageCheck className="w-8 h-8 text-green-600" />
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.completed / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-green-700 mb-1">{comprehensiveStats.ordersByStatus.completed}</h3>
              <p className="text-sm font-semibold text-green-800">مكتملة</p>
            </div>

            {/* Delivered */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <Truck className="w-8 h-8 text-purple-600" />
                <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.delivered / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-purple-700 mb-1">{comprehensiveStats.ordersByStatus.delivered}</h3>
              <p className="text-sm font-semibold text-purple-800">تم التسليم</p>
            </div>

            {/* Cancelled */}
            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-5 border-2 border-red-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <XCircle className="w-8 h-8 text-red-600" />
                <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.cancelled / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-red-700 mb-1">{comprehensiveStats.ordersByStatus.cancelled}</h3>
              <p className="text-sm font-semibold text-red-800">ملغاة</p>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Worker Performance */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-pink-100 hover:shadow-xl transition-all duration-300"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
              <Award className="w-6 h-6 text-pink-600" />
              <span>أداء العمال</span>
            </h3>

            <div className="space-y-4">
              {workerPerformance.slice(0, 5).map((worker, index) => (
                <div key={worker.id} className="relative overflow-hidden bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl p-4 border border-pink-200 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 space-x-reverse flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-md ${
                        index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' :
                        index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' :
                        index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                        'bg-gradient-to-br from-pink-400 to-pink-600'
                      }`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-800 truncate">{worker.name}</h4>
                        <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {worker.totalOrders} طلب
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {worker.completionRate}%
                          </span>
                          {worker.avgCompletionTime > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {worker.avgCompletionTime} يوم
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600 text-lg">{worker.revenue.toLocaleString()} ر.س</p>
                      <div className={`text-xs font-semibold px-2 py-1 rounded-full inline-block mt-1 ${
                        worker.efficiency === 'excellent' ? 'bg-green-100 text-green-700' :
                        worker.efficiency === 'good' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {worker.efficiency === 'excellent' ? 'ممتاز' : worker.efficiency === 'good' ? 'جيد' : 'يحتاج تحسين'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {workerPerformance.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>لا توجد بيانات عمال في هذه الفترة</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Orders by Type */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-pink-100 hover:shadow-xl transition-all duration-300"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
              <BarChart3 className="w-6 h-6 text-pink-600" />
              <span>الطلبات حسب النوع</span>
            </h3>

            <div className="space-y-5">
              {ordersByType.map((type, index) => {
                const colors = [
                  { bg: 'from-pink-500 to-rose-500', text: 'text-pink-700', light: 'bg-pink-50' },
                  { bg: 'from-purple-500 to-indigo-500', text: 'text-purple-700', light: 'bg-purple-50' },
                  { bg: 'from-blue-500 to-cyan-500', text: 'text-blue-700', light: 'bg-blue-50' },
                  { bg: 'from-green-500 to-emerald-500', text: 'text-green-700', light: 'bg-green-50' },
                  { bg: 'from-orange-500 to-yellow-500', text: 'text-orange-700', light: 'bg-orange-50' }
                ]
                const color = colors[index % colors.length]

                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${color.text}`}>{type.type}</span>
                      <div className="flex items-center space-x-3 space-x-reverse">
                        <span className="text-sm text-gray-600">{type.count} طلب</span>
                        <span className={`text-sm font-bold ${color.text} ${color.light} px-2 py-1 rounded-full`}>
                          {type.percentage}%
                        </span>
                        <span className="text-sm font-semibold text-green-600">
                          {type.revenue.toLocaleString()} ر.س
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${type.percentage}%` }}
                        transition={{ duration: 1, delay: 1.2 + index * 0.1 }}
                        className={`bg-gradient-to-r ${color.bg} h-3 rounded-full shadow-sm`}
                      ></motion.div>
                    </div>
                  </div>
                )
              })}

              {ordersByType.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>لا توجد طلبات في هذه الفترة</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Appointments Analytics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.1 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-pink-600" />
            <span>تحليل المواعيد</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Pending Appointments */}
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-5 border-2 border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <Clock className="w-8 h-8 text-yellow-600" />
                <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalAppointments > 0 ? Math.round((comprehensiveStats.appointmentsByStatus.pending / comprehensiveStats.totalAppointments) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-yellow-700 mb-1">{comprehensiveStats.appointmentsByStatus.pending}</h3>
              <p className="text-sm font-semibold text-yellow-800">قيد الانتظار</p>
            </div>

            {/* Confirmed Appointments */}
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border-2 border-blue-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <CalendarCheck className="w-8 h-8 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalAppointments > 0 ? Math.round((comprehensiveStats.appointmentsByStatus.confirmed / comprehensiveStats.totalAppointments) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-blue-700 mb-1">{comprehensiveStats.appointmentsByStatus.confirmed}</h3>
              <p className="text-sm font-semibold text-blue-800">مؤكدة</p>
            </div>

            {/* Completed Appointments */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border-2 border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <UserCheck className="w-8 h-8 text-green-600" />
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalAppointments > 0 ? Math.round((comprehensiveStats.appointmentsByStatus.completed / comprehensiveStats.totalAppointments) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-green-700 mb-1">{comprehensiveStats.appointmentsByStatus.completed}</h3>
              <p className="text-sm font-semibold text-green-800">مكتملة</p>
            </div>

            {/* Cancelled Appointments */}
            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-5 border-2 border-red-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <CalendarX className="w-8 h-8 text-red-600" />
                <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-1 rounded-full">
                  {comprehensiveStats.totalAppointments > 0 ? Math.round((comprehensiveStats.appointmentsByStatus.cancelled / comprehensiveStats.totalAppointments) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-red-700 mb-1">{comprehensiveStats.appointmentsByStatus.cancelled}</h3>
              <p className="text-sm font-semibold text-red-800">ملغاة</p>
            </div>
          </div>

          {/* Conversion Rate Card */}
          <div className="mt-6 bg-gradient-to-r from-purple-50 via-pink-50 to-rose-50 rounded-2xl p-6 border-2 border-purple-200">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-purple-700">معدل التحويل: {comprehensiveStats.appointmentConversionRate}%</h3>
                  <p className="text-sm text-purple-600">نسبة المواعيد التي تحولت إلى طلبات مكتملة</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">المواعيد المكتملة</p>
                <p className="text-3xl font-bold text-purple-700">{comprehensiveStats.appointmentsByStatus.completed}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Monthly Trend - الاتجاه الشهري */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-pink-100 hover:shadow-xl transition-all duration-300 mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-pink-600" />
            <span>الاتجاه الشهري (آخر 6 أشهر)</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {monthlyTrend.map((month, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.3 + index * 0.1 }}
                className="relative overflow-hidden bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-4 border-2 border-pink-200 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-pink-200/30 rounded-full -mr-8 -mt-8 group-hover:scale-150 transition-transform duration-500"></div>
                <div className="relative">
                  <h4 className="font-bold text-gray-800 mb-3 text-center">{month.month}</h4>
                  <div className="space-y-3">
                    <div className="bg-white/70 rounded-lg p-2">
                      <p className="text-xl font-bold text-green-600 text-center">{month.revenue.toLocaleString()}</p>
                      <p className="text-xs text-gray-600 text-center">ر.س</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-white/70 rounded-lg p-2">
                        <p className="text-lg font-bold text-blue-600 text-center">{month.orders}</p>
                        <p className="text-xs text-gray-600 text-center">طلب</p>
                      </div>
                      <div className="flex-1 bg-white/70 rounded-lg p-2">
                        <p className="text-lg font-bold text-purple-600 text-center">{month.appointments}</p>
                        <p className="text-xs text-gray-600 text-center">موعد</p>
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2">
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <p className="text-sm font-bold text-green-600">{month.completedOrders}</p>
                      </div>
                      <p className="text-xs text-gray-600 text-center">مكتمل</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {monthlyTrend.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg">لا توجد بيانات شهرية متاحة</p>
            </div>
          )}
        </motion.div>

        {/* Summary Footer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4 }}
          className="bg-gradient-to-r from-pink-100 via-purple-100 to-blue-100 rounded-2xl p-6 border-2 border-pink-200"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-500 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">تقرير شامل</h3>
                <p className="text-sm text-gray-600">تم إنشاؤه في {new Date().toLocaleDateString('ar-SA')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                <Download className="w-4 h-4" />
                <span>تحميل التقرير</span>
              </button>
              <button className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm">
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
