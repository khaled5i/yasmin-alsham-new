'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { orderService, Order } from '@/lib/services/order-service'
import { getExpenses } from '@/lib/services/simple-accounting-service'
import { getWorkerPayrollMonthsInRange } from '@/lib/services/worker-payroll-service'
import type { Expense } from '@/types/simple-accounting'
import type { WorkerPayrollMonth } from '@/types/worker-payroll'

import { useTranslation } from '@/hooks/useTranslation'
import {
  ArrowRight,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Calendar,
  Download,
  Filter,
  Clock,
  CheckCircle,
  Loader,
  PackageCheck,
  Truck,
  XCircle,
  FileText,
  Printer,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Target,
  Activity,
  Star,
  UserCheck,
  CalendarCheck,
  CalendarX,
  Phone,
  Mail,
  Percent,
  Receipt,
  Scissors,
  Wrench,
  UserCog,
  ShoppingBag
} from 'lucide-react'

// ============================================================================
// Helper Functions
// ============================================================================

// دالة لتنسيق التاريخ بالميلادي مع أسماء الأشهر بالعربية
const formatDateInArabic = (date: Date): string => {
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ]

  const day = date.getDate()
  const month = arabicMonths[date.getMonth()]
  const year = date.getFullYear()

  return `${day} ${month} ${year}`
}

// ============================================================================
// Types
// ============================================================================

type DateRange = 'today' | 'last7days' | 'last14days' | 'last21days' | 'week' | 'last30days' | 'month' | 'specific_month' | 'last60days' | 'quarter' | 'year' | 'specific_day' | 'custom'

interface DateFilter {
  startDate: Date
  endDate: Date
}

// تحويل تاريخ إلى صيغة input[type=date] محلية (yyyy-mm-dd)
const toDateInput = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ============================================================================
// Custom Analysis Chart - Metric Definitions
// ============================================================================

type CustomMetricKey =
  | 'totalOrders'
  | 'completedOrders'
  | 'totalValue'
  | 'revenue'
  | 'paidAmount'
  | 'avgOrderValue'
  | 'preBooking'

interface CustomMetricDef {
  key: CustomMetricKey
  label: string
  isMoney: boolean
  isAverage?: boolean
  // created: يُحسب حسب تاريخ إنشاء الطلب | completed: حسب تاريخ الإنجاز
  basis: 'created' | 'completed'
  color: string // gradient classes للأعمدة
  compute: (orders: Order[]) => number
}

const CUSTOM_METRICS: CustomMetricDef[] = [
  {
    key: 'totalOrders',
    label: 'إجمالي الطلبات',
    isMoney: false,
    basis: 'created',
    color: 'from-blue-400 to-cyan-600',
    compute: (o) => o.length,
  },
  {
    key: 'completedOrders',
    label: 'الطلبات المكتملة',
    isMoney: false,
    basis: 'completed',
    color: 'from-green-400 to-emerald-600',
    compute: (o) => o.length,
  },
  {
    key: 'totalValue',
    label: 'إجمالي قيمة الطلبات',
    isMoney: true,
    basis: 'created',
    color: 'from-teal-400 to-cyan-600',
    compute: (o) => o.reduce((s, x) => s + Number(x.price || 0), 0),
  },
  {
    key: 'revenue',
    label: 'الإيرادات المحققة',
    isMoney: true,
    basis: 'completed',
    color: 'from-pink-400 to-rose-600',
    compute: (o) => o.reduce((s, x) => s + Number(x.price || 0), 0),
  },
  {
    key: 'paidAmount',
    label: 'المبالغ المحصلة',
    isMoney: true,
    basis: 'created',
    color: 'from-emerald-400 to-green-600',
    compute: (o) => o.reduce((s, x) => s + Number(x.paid_amount || 0), 0),
  },
  {
    key: 'avgOrderValue',
    label: 'متوسط قيمة الطلب',
    isMoney: true,
    isAverage: true,
    basis: 'created',
    color: 'from-orange-400 to-amber-600',
    compute: (o) => {
      // يستثني الحجز المسبق والطلبات أقل من 100 ريال (مطابق لمنطق KPIs)
      const eligible = o.filter(x => !(x as any).is_pre_booking && Number(x.price || 0) >= 100)
      if (eligible.length === 0) return 0
      return Math.round(eligible.reduce((s, x) => s + Number(x.price || 0), 0) / eligible.length)
    },
  },
  {
    key: 'preBooking',
    label: 'الحجوزات المسبقة',
    isMoney: false,
    basis: 'created',
    color: 'from-indigo-400 to-purple-600',
    compute: (o) => o.filter(x => (x as any).is_pre_booking === true).length,
  },
]

// أزرار الفترات السريعة للرسم المخصص
const CUSTOM_PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'last7', label: 'آخر ٧ أيام' },
  { key: 'thisWeek', label: 'هذا الأسبوع' },
  { key: 'lastWeek', label: 'الأسبوع الماضي' },
  { key: 'last30', label: 'آخر ٣٠ يوم' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: 'year', label: 'هذا العام' },
]

// ============================================================================
// Main Component
// ============================================================================

export default function ReportsPage() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(true)
  const [materialExpenses, setMaterialExpenses] = useState<Expense[]>([])
  const [fixedExpenses, setFixedExpenses] = useState<Expense[]>([])
  const [workerSalaries, setWorkerSalaries] = useState<WorkerPayrollMonth[]>([])
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
  const [specificDay, setSpecificDay] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [specificMonth, setSpecificMonth] = useState<string>(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  })
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  // ============================================================================
  // Custom Analysis Chart State (فلترة مستقلة بالتاريخ + نوع المؤشر)
  // ============================================================================

  const [customChartMetric, setCustomChartMetric] = useState<CustomMetricKey>('totalOrders')
  const [customChartStart, setCustomChartStart] = useState<string>(() => {
    const now = new Date()
    return toDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  })
  const [customChartEnd, setCustomChartEnd] = useState<string>(() => toDateInput(new Date()))
  const [customChartPreset, setCustomChartPreset] = useState<string>('month')

  // ============================================================================
  // Effects
  // ============================================================================

  // تحميل جميع الطلبات بدون pagination للتقارير الدقيقة
  useEffect(() => {
    setIsLoadingOrders(true)
    orderService.getAll({ noPagination: true }).then(({ data }) => {
      setOrders(data || [])
      setIsLoadingOrders(false)
    })
    // تحميل بيانات المحاسبة (التفصيل)
    getExpenses('tailoring', 'material').then(setMaterialExpenses).catch(() => { })
    getExpenses('tailoring', 'fixed').then(setFixedExpenses).catch(() => { })
  }, [])

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
    const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000)

    switch (selectedPeriod) {
      case 'today':
        return {
          startDate: today,
          endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case 'last7days':
        return { startDate: daysAgo(6), endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case 'last14days':
        return { startDate: daysAgo(13), endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case 'last21days':
        return { startDate: daysAgo(20), endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case 'week': {
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        return {
          startDate: weekStart,
          endDate: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
        }
      }
      case 'last30days':
        return { startDate: daysAgo(29), endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case 'month':
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1),
          endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        }
      case 'specific_month': {
        const [y, m] = specificMonth.split('-').map(Number)
        return {
          startDate: new Date(y, m - 1, 1),
          endDate: new Date(y, m, 0, 23, 59, 59)
        }
      }
      case 'last60days':
        return { startDate: daysAgo(59), endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case 'quarter': {
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3
        return {
          startDate: new Date(now.getFullYear(), quarterMonth, 1),
          endDate: new Date(now.getFullYear(), quarterMonth + 3, 0, 23, 59, 59)
        }
      }
      case 'year':
        return {
          startDate: new Date(now.getFullYear(), 0, 1),
          endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59)
        }
      case 'specific_day': {
        const day = specificDay ? new Date(specificDay) : today
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
        return {
          startDate: dayStart,
          endDate: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
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

    // Filter orders by creation date
    const currentOrders = orders.filter(order =>
      isInDateRange(order.created_at, dateRange)
    )
    const previousOrders = orders.filter(order =>
      isInDateRange(order.created_at, previousRange)
    )

    // الطلبات التي اكتملت (completed/delivered) خلال الفترة المحددة
    // بغض النظر عن تاريخ إنشاء الطلب
    // الأولوية: worker_completed_at (العامل) → admin_completed_at (المدير) → delivery_date
    // الطلبات القديمة التي لا تحتوي على أي من هذه الحقول لن تُحسب (مقصود)
    const completedOrdersInPeriod = orders.filter(order => {
      if (order.status !== 'completed' && order.status !== 'delivered') return false
      const completionDate = order.worker_completed_at || order.admin_completed_at || order.delivery_date
      if (!completionDate) return false
      return isInDateRange(completionDate, dateRange)
    })

    return {
      currentOrders,
      previousOrders,
      completedOrdersInPeriod,
      dateRange,
      previousRange
    }
  }, [orders, selectedPeriod, customDateRange, specificDay, specificMonth])

  // ============================================================================
  // Comprehensive Statistics Calculations
  // ============================================================================

  const comprehensiveStats = useMemo(() => {
    const { currentOrders, previousOrders, completedOrdersInPeriod } = filteredData

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

    // الطلبات المكتملة خلال الفترة (بغض النظر عن تاريخ الإنشاء)
    const completedOrders = completedOrdersInPeriod.length
    const completionRate = currentOrders.length > 0
      ? Number(((completedOrders / currentOrders.length) * 100).toFixed(1))
      : 0

    // حجز مسبق
    const preBookingOrders = currentOrders.filter(o => (o as any).is_pre_booking === true)
    const preBookingCount = preBookingOrders.length

    // متوسط قيمة الطلب: يستثني الحجز المسبق والطلبات أقل من 100 ريال
    // البسط: مجموع قيمة الطلبات (بغض النظر عن حالة الدفع)
    // المقام: عدد الطلبات المستوفية للشرط
    const avgEligibleOrders = currentOrders.filter(
      o => !(o as any).is_pre_booking && Number(o.price || 0) >= 100
    )
    const avgEligibleTotal = avgEligibleOrders.reduce((sum, o) => sum + Number(o.price || 0), 0)
    const averageOrderValue = avgEligibleOrders.length > 0
      ? Math.round(avgEligibleTotal / avgEligibleOrders.length)
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



    // Customer Insights
    const uniqueCustomers = new Set(currentOrders.map(o => o.client_phone)).size
    const previousUniqueCustomers = new Set(previousOrders.map(o => o.client_phone)).size
    const customerGrowth = previousUniqueCustomers > 0
      ? Number((((uniqueCustomers - previousUniqueCustomers) / previousUniqueCustomers) * 100).toFixed(1))
      : 0

    // Payment Statistics — يشمل الدفعات المسبقة من طلبات الحجز + باقي الطلبات
    const totalPaid = currentOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0)
    const totalDue = currentRevenue - totalPaid
    // نسبة التحصيل من إجمالي قيمة جميع الطلبات (ليس فقط المكتملة)
    const totalAllOrdersValueForRate = currentOrders.reduce((sum, o) => sum + Number(o.price || 0), 0)
    const paymentCollectionRate = totalAllOrdersValueForRate > 0
      ? Number(((totalPaid / totalAllOrdersValueForRate) * 100).toFixed(1))
      : 0

    // Total value of all orders regardless of status or payment
    const totalAllOrdersValue = currentOrders.reduce((sum, o) => sum + Number(o.price || 0), 0)
    const previousTotalAllOrdersValue = previousOrders.reduce((sum, o) => sum + Number(o.price || 0), 0)
    const totalAllOrdersValueChange = previousTotalAllOrdersValue > 0
      ? Number((((totalAllOrdersValue - previousTotalAllOrdersValue) / previousTotalAllOrdersValue) * 100).toFixed(1))
      : 0

    return {
      // Revenue
      currentRevenue,
      previousRevenue,
      revenueChange,
      totalPaid,
      totalDue,
      paymentCollectionRate,
      totalAllOrdersValue,
      totalAllOrdersValueChange,

      // Orders
      totalOrders: currentOrders.length,
      ordersChange,
      completedOrders,
      completionRate,
      averageOrderValue,
      avgCompletionTime,
      ordersByStatus,
      // Pre-booking
      preBookingCount,

      // Customers
      uniqueCustomers,
      customerGrowth
    }
  }, [filteredData])

  // حسابات مصروفات التفصيل المفلترة بالتاريخ
  const tailoringExpensesStats = useMemo(() => {
    const { dateRange } = filteredData

    const filteredMaterial = materialExpenses.filter(e =>
      isInDateRange(e.date, dateRange)
    )
    const filteredFixed = fixedExpenses.filter(e =>
      isInDateRange(e.date, dateRange)
    )

    // رواتب العمال: تصفية بالأشهر التي تقع ضمن نطاق التاريخ
    const filteredSalaries = workerSalaries.filter(s => {
      const salaryDate = new Date(s.payroll_year, s.payroll_month - 1, 1)
      const startOfMonth = new Date(dateRange.startDate.getFullYear(), dateRange.startDate.getMonth(), 1)
      const endOfMonth = new Date(dateRange.endDate.getFullYear(), dateRange.endDate.getMonth(), 1)
      return salaryDate >= startOfMonth && salaryDate <= endOfMonth
    })

    const totalMaterialExpenses = filteredMaterial.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const totalFixedExpenses = filteredFixed.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const totalWorkerSalaries = filteredSalaries.reduce((sum, s) => sum + Number(s.net_due || 0), 0)
    const totalExpenses = totalMaterialExpenses + totalFixedExpenses + totalWorkerSalaries

    const completedOrdersCount = filteredData.completedOrdersInPeriod.length
    const avgDressCost = completedOrdersCount > 0
      ? Math.round(totalExpenses / completedOrdersCount)
      : 0

    return {
      totalMaterialExpenses,
      totalFixedExpenses,
      totalWorkerSalaries,
      totalExpenses,
      avgDressCost,
      completedOrdersCount,
      materialCount: filteredMaterial.length,
      fixedCount: filteredFixed.length,
      workerCount: new Set(filteredSalaries.map(s => s.worker_id)).size
    }
  }, [filteredData, materialExpenses, fixedExpenses, workerSalaries])

  // تحميل رواتب العمال عند تغيير نطاق التاريخ
  useEffect(() => {
    const range = getDateRange()
    getWorkerPayrollMonthsInRange('tailoring', range.startDate, range.endDate)
      .then(setWorkerSalaries)
      .catch(() => { })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, customDateRange, specificDay, specificMonth])

  // Price Distribution
  const priceDistribution = useMemo(() => {
    const { currentOrders } = filteredData

    const ranges = [
      { label: 'أقل من 700', min: 0, max: 699 },
      { label: '700', min: 700, max: 799 },
      { label: '800', min: 800, max: 899 },
      { label: '900', min: 900, max: 999 },
      { label: '1000', min: 1000, max: 1099 },
      { label: '1100', min: 1100, max: 1199 },
      { label: '1200', min: 1200, max: 1299 },
      { label: 'أكثر من 1200', min: 1300, max: Infinity },
    ]

    return ranges.map(range => ({
      label: range.label,
      count: currentOrders.filter(o => {
        const price = Number(o.price || 0)
        if (price < 700 && ((o as any).is_pre_booking === true || price === 1)) return false
        return price >= range.min && price <= range.max
      }).length,
    }))
  }, [filteredData])

  // ============================================================================
  // Custom Analysis Chart - Presets + Binned Data
  // ============================================================================

  const applyCustomPreset = (preset: string) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayMs = 24 * 60 * 60 * 1000
    let s = today
    let e = today

    switch (preset) {
      case 'today':
        s = today; e = today; break
      case 'last7':
        s = new Date(today.getTime() - 6 * dayMs); e = today; break
      case 'thisWeek': {
        const ws = new Date(today)
        ws.setDate(today.getDate() - today.getDay())
        s = ws; e = today; break
      }
      case 'lastWeek': {
        const ws = new Date(today)
        ws.setDate(today.getDate() - today.getDay() - 7)
        s = ws; e = new Date(ws.getTime() + 6 * dayMs); break
      }
      case 'last30':
        s = new Date(today.getTime() - 29 * dayMs); e = today; break
      case 'month':
        s = new Date(now.getFullYear(), now.getMonth(), 1); e = today; break
      case 'lastMonth':
        s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        e = new Date(now.getFullYear(), now.getMonth(), 0); break
      case 'year':
        s = new Date(now.getFullYear(), 0, 1); e = today; break
    }

    setCustomChartStart(toDateInput(s))
    setCustomChartEnd(toDateInput(e))
    setCustomChartPreset(preset)
  }

  const customChart = useMemo(() => {
    const def = CUSTOM_METRICS.find(m => m.key === customChartMetric) || CUSTOM_METRICS[0]
    const start = new Date(customChartStart + 'T00:00:00')
    const end = new Date(customChartEnd + 'T23:59:59')
    const valid = !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end

    if (!valid) {
      return {
        valid: false, def, buckets: [] as { label: string; value: number }[],
        periodName: 'يوم', sum: 0, overallValue: 0, bucketAverage: 0,
        peak: null as { label: string; value: number } | null, nBuckets: 0,
      }
    }

    const dayMs = 24 * 60 * 60 * 1000
    const rangeDays = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1

    // تقسيم تلقائي: يومي للمدد القصيرة، أسبوعي للمتوسطة، شهري للطويلة
    let granularity: 'day' | 'week' | 'month'
    if (rangeDays <= 16) granularity = 'day'
    else if (rangeDays <= 92) granularity = 'week'
    else granularity = 'month'

    const arabicMonthsShort = ['ينا', 'فبر', 'مار', 'أبر', 'مايو', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس']
    const rawBuckets: { start: Date; end: Date; label: string }[] = []

    if (granularity === 'day') {
      let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      while (cur <= end) {
        const bStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0)
        const bEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 23, 59, 59)
        rawBuckets.push({ start: bStart, end: bEnd > end ? end : bEnd, label: `${bStart.getDate()}/${bStart.getMonth() + 1}` })
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
      }
    } else if (granularity === 'week') {
      let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      while (cur <= end) {
        const bStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0)
        const tentativeEnd = new Date(bStart.getTime() + 7 * dayMs - 1000)
        const bEnd = tentativeEnd > end ? end : tentativeEnd
        rawBuckets.push({ start: bStart, end: bEnd, label: `${bStart.getDate()}/${bStart.getMonth() + 1}` })
        cur = new Date(bStart.getTime() + 7 * dayMs)
      }
    } else {
      let cur = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cur <= end) {
        const mStart = new Date(cur.getFullYear(), cur.getMonth(), 1, 0, 0, 0)
        const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59)
        rawBuckets.push({
          start: mStart < start ? start : mStart,
          end: mEnd > end ? end : mEnd,
          label: arabicMonthsShort[cur.getMonth()],
        })
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
    }

    // إسناد الطلبات لكل فترة حسب أساس المؤشر (تاريخ الإنشاء أو الإنجاز)
    const assign = (rangeStart: Date, rangeEnd: Date): Order[] => {
      if (def.basis === 'created') {
        return orders.filter(o => {
          const d = new Date(o.created_at)
          return d >= rangeStart && d <= rangeEnd
        })
      }
      return orders.filter(o => {
        if (o.status !== 'completed' && o.status !== 'delivered') return false
        const cd = o.worker_completed_at || o.admin_completed_at || o.delivery_date
        if (!cd) return false
        const d = new Date(cd)
        return d >= rangeStart && d <= rangeEnd
      })
    }

    const buckets = rawBuckets.map(b => ({
      label: b.label,
      value: def.compute(assign(b.start, b.end)),
    }))

    const sum = buckets.reduce((s, b) => s + b.value, 0)
    const overallValue = def.compute(assign(start, end))
    const nBuckets = buckets.length
    const bucketAverage = nBuckets > 0 ? Math.round(sum / nBuckets) : 0
    const peak = buckets.reduce<{ label: string; value: number } | null>(
      (a, b) => (a === null || b.value > a.value) ? b : a, null
    )
    const periodName = granularity === 'day' ? 'يوم' : granularity === 'week' ? 'أسبوع' : 'شهر'

    return { valid: true, def, buckets, periodName, sum, overallValue, bucketAverage, peak, nBuckets }
  }, [orders, customChartMetric, customChartStart, customChartEnd])

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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-16 sm:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-3"
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
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-2 sm:mb-3">
                <span className="bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {t('reports_analytics') || 'التقارير والتحليلات'}
                </span>
              </h1>
              <p className="text-sm sm:text-base lg:text-lg text-gray-600 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600" />
                <span>{t('comprehensive_analysis') || 'تحليل شامل لأداء الأعمال'}</span>
              </p>
            </div>

            {/* Filters and Export Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {/* Date Range Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value as DateRange)}
                    className="w-full sm:w-auto pr-9 sm:pr-10 pl-3 sm:pl-4 py-2 sm:py-2.5 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all duration-300 bg-white hover:border-pink-300 cursor-pointer text-xs sm:text-sm font-medium"
                  >
                    <option value="today">اليوم</option>
                    <option value="specific_day">يوم محدد</option>
                    <option disabled>──────────</option>
                    <option value="last7days">آخر أسبوع</option>
                    <option value="last14days">آخر أسبوعين</option>
                    <option value="last21days">آخر 3 أسابيع</option>
                    <option value="week">هذا الأسبوع</option>
                    <option disabled>──────────</option>
                    <option value="last30days">آخر شهر</option>
                    <option value="month">هذا الشهر</option>
                    <option value="specific_month">شهر محدد</option>
                    <option value="last60days">آخر شهرين</option>
                    <option disabled>──────────</option>
                    <option value="quarter">هذا الربع</option>
                    <option value="year">هذا العام</option>
                  </select>
                </div>

                {/* Specific Day Picker */}
                {selectedPeriod === 'specific_day' && (
                  <div className="relative flex items-center">
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-500 pointer-events-none" />
                    <input
                      type="date"
                      value={specificDay}
                      onChange={(e) => setSpecificDay(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="pr-9 pl-3 py-2 sm:py-2.5 border-2 border-pink-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all duration-300 bg-white cursor-pointer text-xs sm:text-sm font-medium"
                    />
                  </div>
                )}

                {/* Specific Month Picker */}
                {selectedPeriod === 'specific_month' && (
                  <div className="relative flex items-center">
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500 pointer-events-none" />
                    <input
                      type="month"
                      value={specificMonth}
                      onChange={(e) => setSpecificMonth(e.target.value)}
                      max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
                      className="pr-9 pl-3 py-2 sm:py-2.5 border-2 border-purple-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-300 bg-white cursor-pointer text-xs sm:text-sm font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Export Buttons */}
              <div className="flex gap-2">
                <button
                  className="btn-secondary inline-flex items-center justify-center space-x-1.5 sm:space-x-2 space-x-reverse px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm flex-1 sm:flex-initial"
                  title="تصدير PDF"
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>PDF</span>
                </button>

                <button
                  className="btn-secondary inline-flex items-center justify-center space-x-1.5 sm:space-x-2 space-x-reverse px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm flex-1 sm:flex-initial"
                  title="تصدير Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Excel</span>
                </button>

                <button
                  className="btn-secondary inline-flex items-center justify-center space-x-1.5 sm:space-x-2 space-x-reverse px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm flex-1 sm:flex-initial"
                  title="طباعة"
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>طباعة</span>
                </button>
              </div>
            </div>
          </div>

          {/* Period Info */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 text-blue-800 text-sm sm:text-base">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-semibold">الفترة المحددة:</span>
                <span className="font-bold">
                  {selectedPeriod === 'today' && 'اليوم'}
                  {selectedPeriod === 'specific_day' && (specificDay ? formatDateInArabic(new Date(specificDay + 'T12:00:00')) : 'يوم محدد')}
                  {selectedPeriod === 'last7days' && 'آخر أسبوع'}
                  {selectedPeriod === 'last14days' && 'آخر أسبوعين'}
                  {selectedPeriod === 'last21days' && 'آخر 3 أسابيع'}
                  {selectedPeriod === 'week' && 'هذا الأسبوع'}
                  {selectedPeriod === 'last30days' && 'آخر شهر'}
                  {selectedPeriod === 'month' && 'هذا الشهر'}
                  {selectedPeriod === 'specific_month' && (() => {
                    const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
                    const [y, m] = specificMonth.split('-').map(Number)
                    return `${arabicMonths[m - 1]} ${y}`
                  })()}
                  {selectedPeriod === 'last60days' && 'آخر شهرين'}
                  {selectedPeriod === 'quarter' && 'هذا الربع'}
                  {selectedPeriod === 'year' && 'هذا العام'}
                  {selectedPeriod === 'custom' && 'مخصص'}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-blue-600">
                {formatDateInArabic(new Date(filteredData.dateRange.startDate))} - {formatDateInArabic(new Date(filteredData.dateRange.endDate))}
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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />
            <span>مؤشرات الأداء الرئيسية (KPIs)</span>
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {/* Total Orders */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border-2 border-blue-200 shadow-md sm:shadow-lg hover:shadow-lg sm:hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-blue-200/30 rounded-full -mr-8 sm:-mr-10 lg:-mr-12 -mt-8 sm:-mt-10 lg:-mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                  <div className={`flex items-center space-x-1 space-x-reverse text-xs sm:text-sm font-semibold ${comprehensiveStats.ordersChange > 0 ? 'text-green-600' : comprehensiveStats.ordersChange < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                    {comprehensiveStats.ordersChange > 0 ? (
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                    ) : comprehensiveStats.ordersChange < 0 ? (
                      <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
                    ) : null}
                    <span>{Math.abs(comprehensiveStats.ordersChange)}%</span>
                  </div>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-blue-700 mb-0.5 sm:mb-1 leading-tight">
                  {isLoadingOrders ? '...' : comprehensiveStats.totalOrders}
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-blue-800 leading-tight">إجمالي الطلبات</p>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-0.5 sm:mt-1">في الفترة المحددة</p>
              </div>
            </motion.div>

            {/* Completion Rate */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border-2 border-purple-200 shadow-md sm:shadow-lg hover:shadow-lg sm:hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-purple-200/30 rounded-full -mr-8 sm:-mr-10 lg:-mr-12 -mt-8 sm:-mt-10 lg:-mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                    <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 space-x-reverse text-xs sm:text-sm font-semibold text-purple-600">
                    <Percent className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{comprehensiveStats.completionRate}%</span>
                  </div>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-purple-700 mb-0.5 sm:mb-1 leading-tight">
                  {comprehensiveStats.completedOrders}
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-purple-800 leading-tight">طلبات مكتملة</p>
                <p className="text-[10px] sm:text-xs text-purple-600 mt-0.5 sm:mt-1">معدل الإنجاز {comprehensiveStats.completionRate}%</p>
              </div>
            </motion.div>

            {/* Average Order Value */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border-2 border-orange-200 shadow-md sm:shadow-lg hover:shadow-lg sm:hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-orange-200/30 rounded-full -mr-8 sm:-mr-10 lg:-mr-12 -mt-8 sm:-mt-10 lg:-mt-12 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-orange-400 to-yellow-400 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                    <Activity className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 space-x-reverse text-xs sm:text-sm font-semibold text-orange-600">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">{comprehensiveStats.avgCompletionTime} يوم</span>
                    <span className="sm:hidden">{comprehensiveStats.avgCompletionTime}د</span>
                  </div>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-orange-700 mb-0.5 sm:mb-1 leading-tight">
                  {comprehensiveStats.averageOrderValue.toLocaleString('en-US')} ر.س
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-orange-800 leading-tight">متوسط قيمة الطلب</p>
                <p className="text-[10px] sm:text-xs text-orange-600 mt-0.5 sm:mt-1">متوسط وقت الإنجاز</p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Secondary KPIs Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-8"
        >
          {/* Pre-booking Orders */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-lg flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-indigo-600">
                {comprehensiveStats.totalOrders > 0
                  ? Number(((comprehensiveStats.preBookingCount / comprehensiveStats.totalOrders) * 100).toFixed(1))
                  : 0}%
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.preBookingCount}</h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-tight">طلبات الحجز المسبق</p>
          </div>



          {/* Payment Collection Rate */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-green-400 to-emerald-400 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-green-600">
                {comprehensiveStats.paymentCollectionRate}%
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.totalPaid.toLocaleString('en-US')} ر.س</h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-tight">المبالغ المحصلة</p>
          </div>

          {/* Total Orders Value (regardless of payment) */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-gray-200 hover:border-pink-300 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-teal-400 to-cyan-400 rounded-lg flex items-center justify-center">
                <Receipt className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div className={`text-xs sm:text-sm font-semibold ${comprehensiveStats.totalAllOrdersValueChange > 0 ? 'text-green-600' : comprehensiveStats.totalAllOrdersValueChange < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {comprehensiveStats.totalAllOrdersValueChange > 0 ? '+' : ''}{comprehensiveStats.totalAllOrdersValueChange}%
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.totalAllOrdersValue.toLocaleString('en-US')} ر.س</h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-tight">إجمالي قيمة الطلبات</p>
            <p className="text-[10px] sm:text-xs text-teal-600 mt-0.5">بغض النظر عن الدفع</p>
          </div>
        </motion.div>

        {/* Tailoring Expenses KPIs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.75 }}
          className="mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
            <Scissors className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />
            <span>مصروفات قسم التفصيل</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {/* مصروفات المواد */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border-2 border-amber-200 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-amber-200/30 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-amber-400 to-orange-400 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                    <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                    {tailoringExpensesStats.materialCount} سجل
                  </div>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-amber-700 mb-0.5 sm:mb-1 leading-tight">
                  {isLoadingOrders ? '...' : tailoringExpensesStats.totalMaterialExpenses.toLocaleString('en-US')} ر.س
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-amber-800 leading-tight">مصروفات المواد</p>
                <p className="text-[10px] sm:text-xs text-amber-600 mt-0.5 sm:mt-1">خيوط، أقمشة، مستلزمات</p>
              </div>
            </motion.div>

            {/* المصاريف الثابتة */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.85 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-gray-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border-2 border-slate-200 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-slate-200/30 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-slate-400 to-gray-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                    <Wrench className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-full">
                    {tailoringExpensesStats.fixedCount} سجل
                  </div>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-slate-700 mb-0.5 sm:mb-1 leading-tight">
                  {isLoadingOrders ? '...' : tailoringExpensesStats.totalFixedExpenses.toLocaleString('en-US')} ر.س
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-tight">المصاريف الثابتة</p>
                <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1">إيجار، كهرباء، صيانة</p>
              </div>
            </motion.div>

            {/* رواتب العمال */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="relative overflow-hidden bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border-2 border-violet-200 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-violet-200/30 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-violet-400 to-purple-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                    <UserCog className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-violet-700 bg-violet-100 px-2 py-1 rounded-full">
                    {tailoringExpensesStats.workerCount} عامل
                  </div>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-violet-700 mb-0.5 sm:mb-1 leading-tight">
                  {isLoadingOrders ? '...' : tailoringExpensesStats.totalWorkerSalaries.toLocaleString('en-US')} ر.س
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-violet-800 leading-tight">رواتب العمال</p>
                <p className="text-[10px] sm:text-xs text-violet-600 mt-0.5 sm:mt-1">صافي المستحق للعمال</p>
              </div>
            </motion.div>
          </div>

          {/* إجمالي المصروفات */}
          <div className="mt-4 bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-xl p-3 sm:p-4 lg:p-5 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-red-400 to-rose-500 rounded-lg flex items-center justify-center shadow-md">
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-red-800">إجمالي مصروفات التفصيل</p>
                <p className="text-[10px] sm:text-xs text-red-600">مواد + ثابتة + رواتب</p>
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-700">
              {tailoringExpensesStats.totalExpenses.toLocaleString('en-US')} ر.س
            </h3>
          </div>

          {/* متوسط تكلفة الفستان */}
          <div className="mt-3 bg-gradient-to-r from-pink-50 to-rose-50 border-2 border-pink-300 rounded-xl p-3 sm:p-4 lg:p-5 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center shadow-md">
                <Scissors className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-pink-800">متوسط تكلفة الفستان</p>
                <p className="text-[10px] sm:text-xs text-pink-600">
                  {tailoringExpensesStats.totalExpenses.toLocaleString('en-US')} ÷ {tailoringExpensesStats.completedOrdersCount} طلب مكتمل
                </p>
              </div>
            </div>
            <div className="text-left">
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-pink-700">
                {tailoringExpensesStats.avgDressCost.toLocaleString('en-US')} ر.س
              </h3>
              {tailoringExpensesStats.completedOrdersCount === 0 && (
                <p className="text-[10px] text-pink-500 text-left">لا توجد طلبات مكتملة</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Orders Status Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />
            <span>حالة الطلبات</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Pending */}
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Clock className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-yellow-600" />
                <span className="text-[10px] sm:text-xs font-semibold text-yellow-700 bg-yellow-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.pending / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-yellow-700 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.ordersByStatus.pending}</h3>
              <p className="text-xs sm:text-sm font-semibold text-yellow-800 leading-tight">قيد الانتظار</p>
            </div>

            {/* In Progress */}
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-blue-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Loader className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-blue-600 animate-spin" />
                <span className="text-[10px] sm:text-xs font-semibold text-blue-700 bg-blue-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.in_progress / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-blue-700 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.ordersByStatus.in_progress}</h3>
              <p className="text-xs sm:text-sm font-semibold text-blue-800 leading-tight">قيد التنفيذ</p>
            </div>

            {/* Completed */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <PackageCheck className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-green-600" />
                <span className="text-[10px] sm:text-xs font-semibold text-green-700 bg-green-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.completed / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-green-700 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.ordersByStatus.completed}</h3>
              <p className="text-xs sm:text-sm font-semibold text-green-800 leading-tight">مكتملة</p>
            </div>

            {/* Delivered */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border-2 border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Truck className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-purple-600" />
                <span className="text-[10px] sm:text-xs font-semibold text-purple-700 bg-purple-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                  {comprehensiveStats.totalOrders > 0 ? Math.round((comprehensiveStats.ordersByStatus.delivered / comprehensiveStats.totalOrders) * 100) : 0}%
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-purple-700 mb-0.5 sm:mb-1 leading-tight">{comprehensiveStats.ordersByStatus.delivered}</h3>
              <p className="text-xs sm:text-sm font-semibold text-purple-800 leading-tight">تم التسليم</p>
            </div>

          </div>
        </motion.div>

        {/* Price Distribution Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.87 }}
          className="mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />
            <span>توزيع أسعار الفساتين</span>
          </h2>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 border-2 border-pink-100 hover:shadow-xl transition-all duration-300">
            {(() => {
              const maxCount = Math.max(...priceDistribution.map(b => b.count), 1)
              const chartColors = [
                'from-sky-400 to-blue-600',
                'from-indigo-400 to-indigo-600',
                'from-violet-400 to-violet-600',
                'from-purple-400 to-purple-600',
                'from-fuchsia-400 to-pink-600',
                'from-pink-400 to-rose-600',
                'from-rose-400 to-red-600',
                'from-orange-400 to-amber-600',
              ]
              const peak = priceDistribution.reduce((a, b) => b.count > a.count ? b : a, priceDistribution[0])
              const total = priceDistribution.reduce((sum, b) => sum + b.count, 0)

              return (
                <>
                  {/* Bar Chart */}
                  <div className="flex items-end gap-1.5 sm:gap-3 mb-2" style={{ height: '180px' }}>
                    {priceDistribution.map((bucket, index) => {
                      const barHeightPx = maxCount > 0
                        ? Math.max((bucket.count / maxCount) * 160, bucket.count > 0 ? 6 : 0)
                        : 0
                      return (
                        <div key={index} className="flex-1 flex flex-col items-center justify-end h-full">
                          {bucket.count > 0 && (
                            <span className="text-[10px] sm:text-xs font-bold text-gray-700 mb-1 leading-none">{bucket.count}</span>
                          )}
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: barHeightPx }}
                            transition={{ duration: 0.7, delay: 0.9 + index * 0.06, ease: 'easeOut' }}
                            className={`w-full bg-gradient-to-t ${chartColors[index]} rounded-t-md shadow-sm`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  {/* X-axis labels */}
                  <div className="flex gap-1.5 sm:gap-3 border-t-2 border-gray-200 pt-2 mb-4">
                    {priceDistribution.map((bucket, index) => (
                      <div key={index} className="flex-1 text-center">
                        <span className="text-[9px] sm:text-[11px] font-medium text-gray-600 leading-tight block">{bucket.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                    <div className="bg-pink-50 rounded-lg p-3 text-center">
                      <p className="text-[10px] sm:text-xs text-pink-600 mb-1">أكثر فئة سعرية</p>
                      <p className="font-bold text-pink-700 text-sm sm:text-base">{peak?.label}</p>
                      <p className="text-[10px] text-pink-500">{peak?.count} فستان</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-[10px] sm:text-xs text-blue-600 mb-1">إجمالي الفساتين</p>
                      <p className="font-bold text-blue-700 text-sm sm:text-base">{total}</p>
                      <p className="text-[10px] text-blue-500">في الفترة المحددة</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] sm:text-xs text-green-600 mb-1">متوسط السعر</p>
                      <p className="font-bold text-green-700 text-sm sm:text-base">{comprehensiveStats.averageOrderValue.toLocaleString('en-US')} ر.س</p>
                      <p className="text-[10px] text-green-500">للفساتين المؤهلة</p>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </motion.div>

        {/* Custom Analysis Chart - تحليل مخصص حسب الفترة والمؤشر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.95 }}
          className="mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            <span>تحليل مخصص حسب الفترة</span>
          </h2>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 border-2 border-purple-100 hover:shadow-xl transition-all duration-300">

            {/* Controls */}
            <div className="space-y-4 mb-5">
              {/* Metric selector */}
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-purple-500" /> نوع الإحصائية
                </p>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_METRICS.map(m => (
                    <button
                      key={m.key}
                      onClick={() => setCustomChartMetric(m.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border-2 transition-all duration-200 ${
                        customChartMetric === m.key
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent shadow-md'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date controls */}
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-pink-500" /> الفترة الزمنية
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {CUSTOM_PRESETS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => applyCustomPreset(p.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all duration-200 ${
                        customChartPreset === p.key
                          ? 'bg-pink-500 text-white border-transparent shadow'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] sm:text-xs font-semibold text-gray-500">من</span>
                    <input
                      type="date"
                      value={customChartStart}
                      max={customChartEnd}
                      onChange={(e) => { setCustomChartStart(e.target.value); setCustomChartPreset('custom') }}
                      className="px-3 py-2 border-2 border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white cursor-pointer text-xs sm:text-sm font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] sm:text-xs font-semibold text-gray-500">إلى</span>
                    <input
                      type="date"
                      value={customChartEnd}
                      min={customChartStart}
                      max={toDateInput(new Date())}
                      onChange={(e) => { setCustomChartEnd(e.target.value); setCustomChartPreset('custom') }}
                      className="px-3 py-2 border-2 border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white cursor-pointer text-xs sm:text-sm font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            {(() => {
              const { buckets, def, peak, sum, overallValue, bucketAverage, nBuckets, periodName, valid } = customChart
              const fmtVal = (v: number) =>
                def.isMoney ? `${Math.round(v).toLocaleString('en-US')} ر.س` : v.toLocaleString('en-US')

              if (!valid || buckets.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-400">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3" />
                    <p className="text-sm">يرجى اختيار فترة زمنية صحيحة</p>
                  </div>
                )
              }

              const maxValue = Math.max(...buckets.map(b => b.value), 1)
              const granularityLabel = periodName === 'يوم' ? 'يومي' : periodName === 'أسبوع' ? 'أسبوعي' : 'شهري'

              return (
                <>
                  {/* Metric headline */}
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-gray-700">{def.label}</span>
                      <span className="text-[10px] sm:text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{granularityLabel}</span>
                    </div>
                    <div className="text-sm sm:text-base font-bold text-purple-600">{fmtVal(overallValue)}</div>
                  </div>

                  {/* Bar chart */}
                  <div className="flex items-end gap-1 sm:gap-2 mb-2" style={{ height: '180px' }}>
                    {buckets.map((bucket, index) => {
                      const barHeightPx = Math.max((bucket.value / maxValue) * 160, bucket.value > 0 ? 6 : 0)
                      return (
                        <div key={index} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                          {bucket.value > 0 && (
                            <span className="text-[9px] sm:text-[11px] font-bold text-gray-700 mb-1 leading-none whitespace-nowrap">
                              {def.isMoney && bucket.value >= 10000
                                ? `${Math.round(bucket.value / 1000)}k`
                                : bucket.value.toLocaleString('en-US')}
                            </span>
                          )}
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: barHeightPx }}
                            transition={{ duration: 0.6, delay: index * 0.04, ease: 'easeOut' }}
                            className={`w-full bg-gradient-to-t ${def.color} rounded-t-md shadow-sm`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  {/* X-axis labels */}
                  <div className="flex gap-1 sm:gap-2 border-t-2 border-gray-200 pt-2 mb-4">
                    {buckets.map((bucket, index) => (
                      <div key={index} className="flex-1 text-center min-w-0">
                        <span className="text-[8px] sm:text-[10px] font-medium text-gray-500 leading-tight block truncate">{bucket.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-[10px] sm:text-xs text-purple-600 mb-1">أعلى {periodName}</p>
                      <p className="font-bold text-purple-700 text-sm sm:text-base truncate">{peak ? fmtVal(peak.value) : '-'}</p>
                      <p className="text-[10px] text-purple-500">{peak?.label || '—'}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-[10px] sm:text-xs text-blue-600 mb-1">{def.isAverage ? 'المتوسط العام' : 'الإجمالي خلال الفترة'}</p>
                      <p className="font-bold text-blue-700 text-sm sm:text-base">{def.isAverage ? fmtVal(overallValue) : fmtVal(sum)}</p>
                      <p className="text-[10px] text-blue-500">{nBuckets} {periodName}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] sm:text-xs text-green-600 mb-1">متوسط لكل {periodName}</p>
                      <p className="font-bold text-green-700 text-sm sm:text-base">{fmtVal(bucketAverage)}</p>
                      <p className="text-[10px] text-green-500">بالمتوسط</p>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </motion.div>

        {/* Summary Footer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4 }}
          className="bg-gradient-to-r from-pink-100 via-purple-100 to-blue-100 rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 border-2 border-pink-200"
        >
          <div className="flex items-center justify-between flex-wrap gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-pink-500 to-purple-500 rounded-lg sm:rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-800">تقرير شامل</h3>
                <p className="text-xs sm:text-sm text-gray-600">تم إنشاؤه في {formatDateInArabic(new Date())}</p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="btn-primary inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>تحميل التقرير</span>
              </button>
              <button className="btn-secondary inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>طباعة</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
