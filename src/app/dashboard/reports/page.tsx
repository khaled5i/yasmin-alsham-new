'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
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
  Filter
} from 'lucide-react'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const { orders, workers, appointments, getStats } = useDataStore()
  const { t } = useTranslation()
  const router = useRouter()

  // التحقق من الصلاحيات
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  const [selectedPeriod, setSelectedPeriod] = useState('month')

  // حساب الإحصائيات الحقيقية
  const stats = getStats()

  // حساب أفضل العمال
  const getTopWorkers = () => {
    const workerStats = workers.map(worker => {
      const workerOrders = orders.filter(order =>
        order.assignedWorker === worker.id && order.status === 'completed'
      )
      const revenue = workerOrders.reduce((sum, order) => sum + order.price, 0)

      return {
        name: worker.full_name,
        orders: workerOrders.length,
        revenue
      }
    })

    return workerStats
      .filter(worker => worker.orders > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3)
  }

  // حساب الطلبات حسب النوع
  const getOrdersByType = () => {
    const typeCount: { [key: string]: number } = {}

    orders.forEach(order => {
      const type = order.description.includes('زفاف') ? t('wedding_dress') :
                   order.description.includes('سهرة') ? t('evening_dress') :
                   order.description.includes('خطوبة') ? t('engagement_dress') :
                   order.description.includes('يومي') ? t('casual_dress') : t('other')

      typeCount[type] = (typeCount[type] || 0) + 1
    })

    const total = orders.length

    return Object.entries(typeCount).map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
    }))
  }

  // حساب الاتجاه الشهري (آخر 4 أشهر)
  const getMonthlyTrend = () => {
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                   'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

    const trend = []
    const currentDate = new Date()

    for (let i = 3; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1)
      const monthName = months[date.getMonth()]

      const monthOrders = orders.filter(order => {
        const orderDate = new Date(order.createdAt)
        return orderDate.getMonth() === date.getMonth() &&
               orderDate.getFullYear() === date.getFullYear()
      })

      const revenue = monthOrders
        .filter(order => order.status === 'completed')
        .reduce((sum, order) => sum + order.price, 0)

      trend.push({
        month: monthName,
        revenue,
        orders: monthOrders.length
      })
    }

    return trend
  }

  const reportData = {
    totalRevenue: stats.totalRevenue,
    revenueChange: 0, // يمكن حسابها بمقارنة الشهر الحالي مع السابق
    totalOrders: stats.totalOrders,
    ordersChange: 0, // يمكن حسابها بمقارنة الشهر الحالي مع السابق
    completedOrders: stats.completedOrders,
    completionRate: stats.totalOrders > 0 ? Number(((stats.completedOrders / stats.totalOrders) * 100).toFixed(1)) : 0,
    averageOrderValue: stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0,
    topWorkers: getTopWorkers(),
    ordersByType: getOrdersByType(),
    monthlyTrend: getMonthlyTrend()
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('checking_permissions')}</p>
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
            <span>{t('back_to_dashboard')}</span>
          </Link>
        </motion.div>

        {/* العنوان والفلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                {t('reports_analytics')}
              </span>
            </h1>
            <p className="text-lg text-gray-600">
              {t('comprehensive_analysis')}
            </p>
          </div>

          <div className="flex items-center space-x-4 space-x-reverse">
            <div className="relative">
              <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
              >
                <option value="week">{t('this_week')}</option>
                <option value="month">{t('this_month')}</option>
                <option value="quarter">{t('this_quarter')}</option>
                <option value="year">{t('this_year')}</option>
              </select>
            </div>

            <button className="btn-secondary inline-flex items-center space-x-2 space-x-reverse px-4 py-2">
              <Download className="w-4 h-4" />
              <span>{t('export')}</span>
            </button>
          </div>
        </motion.div>

        {/* المؤشرات الرئيسية */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-emerald-500 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center space-x-1 space-x-reverse text-sm ${
                reportData.revenueChange > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {reportData.revenueChange > 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>{Math.abs(reportData.revenueChange)}%</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">
              {reportData.totalRevenue.toLocaleString()} ر.س
            </h3>
            <p className="text-gray-600 text-sm">{t('total_revenue')}</p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-500 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center space-x-1 space-x-reverse text-sm ${
                reportData.ordersChange > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {reportData.ordersChange > 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>{Math.abs(reportData.ordersChange)}%</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">
              {reportData.totalOrders}
            </h3>
            <p className="text-gray-600 text-sm">{t('total_orders')}</p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-purple-500 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div className="text-sm text-purple-600">
                {reportData.completionRate}%
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">
              {reportData.completedOrders}
            </h3>
            <p className="text-gray-600 text-sm">{t('completed_orders')}</p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-pink-400 to-rose-500 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-1">
              {reportData.averageOrderValue.toLocaleString()} ر.س
            </h3>
            <p className="text-gray-600 text-sm">{t('average_order_value')}</p>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* أفضل العمال */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
              <Users className="w-5 h-5 text-pink-600" />
              <span>{t('top_workers_month')}</span>
            </h3>

            <div className="space-y-4">
              {reportData.topWorkers.map((worker, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                      index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-800">{worker.name}</h4>
                      <p className="text-sm text-gray-600">{worker.orders} {t('orders_count')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{worker.revenue.toLocaleString()} ر.س</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* الطلبات حسب النوع */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
              <Package className="w-5 h-5 text-pink-600" />
              <span>{t('orders_by_type')}</span>
            </h3>

            <div className="space-y-4">
              {reportData.ordersByType.map((type, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 font-medium">{type.type}</span>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <span className="text-sm text-gray-600">{type.count}</span>
                      <span className="text-sm font-medium text-pink-600">{type.percentage}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-pink-500 to-rose-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${type.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* الاتجاه الشهري */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100"
        >
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
            <BarChart3 className="w-5 h-5 text-pink-600" />
            <span>{t('monthly_trend')}</span>
          </h3>

          <div className="grid md:grid-cols-4 gap-6">
            {reportData.monthlyTrend.map((month, index) => (
              <div key={index} className="text-center p-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">{month.month}</h4>
                <div className="space-y-2">
                  <div>
                    <p className="text-lg font-bold text-green-600">{month.revenue.toLocaleString()} ر.س</p>
                    <p className="text-xs text-gray-600">{t('revenue_label')}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{month.orders}</p>
                    <p className="text-xs text-gray-600">{t('orders_label')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
