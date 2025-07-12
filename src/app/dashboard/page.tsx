'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useTranslation } from '@/hooks/useTranslation'
import ProtectedRoute from '@/components/ProtectedRoute'
import {
  BarChart3,
  Users,
  Calendar,
  Package,
  Settings,
  LogOut,
  TrendingUp,
  Clock,
  CheckCircle,
  Plus,
  ArrowRight,
  Languages,
  Palette
} from 'lucide-react'

function DashboardContent() {
  const { user, signOut } = useAuthStore()
  const { orders, appointments, getStats } = useDataStore()
  const { t, language, changeLanguage, isArabic } = useTranslation()
  const router = useRouter()



  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }



  // حساب الإحصائيات الحقيقية
  const realStats = getStats()

  // حساب المواعيد اليوم
  const todayAppointments = appointments.filter(appointment => {
    const today = new Date().toISOString().split('T')[0]
    return appointment.appointmentDate === today && appointment.status !== 'cancelled'
  }).length

  // الإحصائيات حسب الدور
  const getStatsForRole = () => {
    if (user?.role === 'worker') {
      // إحصائيات العامل - طلباته فقط
      const workerOrders = orders.filter(order => order.assignedWorker === user?.id)
      const workerCompletedOrders = workerOrders.filter(order => order.status === 'completed')
      const workerActiveOrders = workerOrders.filter(order => ['pending', 'in_progress'].includes(order.status))

      return [
        {
          title: t('my_active_orders'),
          value: workerActiveOrders.length.toString(),
          change: '+0%',
          icon: Package,
          color: 'from-blue-400 to-blue-600'
        },
        {
          title: t('my_completed_orders'),
          value: workerCompletedOrders.length.toString(),
          change: '+0%',
          icon: CheckCircle,
          color: 'from-green-400 to-green-600'
        },
        {
          title: t('my_total_orders'),
          value: workerOrders.length.toString(),
          change: '+0%',
          icon: Users,
          color: 'from-purple-400 to-purple-600'
        }
      ]
    } else {
      // إحصائيات المدير - جميع البيانات
      return [
        {
          title: t('active_orders'),
          value: realStats.activeOrders.toString(),
          change: '+0%',
          icon: Package,
          color: 'from-blue-400 to-blue-600'
        },
        {
          title: t('today_appointments'),
          value: todayAppointments.toString(),
          change: '+0',
          icon: Calendar,
          color: 'from-green-400 to-green-600'
        },
        {
          title: t('completed_orders'),
          value: realStats.completedOrders.toString(),
          change: '+0%',
          icon: CheckCircle,
          color: 'from-purple-400 to-purple-600'
        },
        {
          title: t('total_orders'),
          value: realStats.totalOrders.toString(),
          change: '+0%',
          icon: Users,
          color: 'from-pink-400 to-pink-600'
        }
      ]
    }
  }

  const stats = getStatsForRole()

  // أحدث الطلبات (آخر 3 طلبات) - مفلترة حسب الدور
  const recentOrders = orders
    .filter(order => {
      // إذا كان المستخدم عامل، اعرض طلباته فقط
      if (user?.role === 'worker') {
        return order.assignedWorker === user?.id
      }
      // إذا كان مدير، اعرض جميع الطلبات
      return true
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)
    .map(order => ({
      id: order.id,
      client: order.clientName,
      type: order.description,
      status: order.status,
      dueDate: order.dueDate
    }))

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      delivered: 'bg-purple-100 text-purple-800'
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: t('pending'),
      in_progress: t('in_progress'),
      completed: t('completed'),
      delivered: t('delivered')
    }
    return labels[status as keyof typeof labels] || status
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: { label: t('pending'), color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
      in_progress: { label: t('in_progress'), color: 'text-blue-600', bgColor: 'bg-blue-100' },
      completed: { label: t('completed'), color: 'text-green-600', bgColor: 'bg-green-100' },
      delivered: { label: t('delivered'), color: 'text-purple-600', bgColor: 'bg-purple-100' },
      cancelled: { label: t('cancelled'), color: 'text-red-600', bgColor: 'bg-red-100' }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }



  return (
    <>
      <style jsx global>{`
        /* ضمان ظهور زر تغيير اللغة في جميع الأوضاع */
        button[title*="تغيير اللغة"],
        button[title*="Change Language"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          position: relative !important;
          z-index: 99999 !important;
          flex-shrink: 0 !important;
        }

        /* للشاشات الكبيرة جداً */
        @media (min-width: 1920px) {
          button[title*="تغيير اللغة"],
          button[title*="Change Language"] {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        }

        /* للشاشات 4K وما فوق */
        @media (min-width: 2560px) {
          button[title*="تغيير اللغة"],
          button[title*="Change Language"] {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        }

        /* وضع الشاشة الكاملة */
        @media (display-mode: fullscreen) {
          button[title*="تغيير اللغة"],
          button[title*="Change Language"] {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        }

        /* للتأكد من عدم إخفاء الزر بواسطة overflow */
        .language-btn-container {
          overflow: visible !important;
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
        {/* الهيدر المحسن */}
      <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 shadow-sm">
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          {/* هيدر للشاشات الكبيرة */}
          <div className="hidden lg:flex items-center justify-between h-16">
            <div className="flex items-center space-x-4 space-x-reverse">
              <Link
                href="/"
                className="text-pink-600 hover:text-pink-700 transition-colors duration-300 group flex items-center space-x-2 space-x-reverse"
              >
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                <span className="text-sm font-medium">{t('homepage')}</span>
              </Link>
              <div className="w-px h-6 bg-gray-300"></div>
              <div className="max-w-md">
                <h1 className="text-xl xl:text-2xl font-bold text-gray-800 truncate">
                  {t('welcome_back')}، {user?.full_name || user?.email}
                </h1>
                <p className="text-gray-600 text-sm">
                  {user?.role === 'admin' ? t('admin_dashboard') : t('worker_dashboard')}
                </p>
              </div>
              <span className="px-3 py-1 bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 rounded-full text-sm font-medium whitespace-nowrap">
                {user?.role === 'admin' ? t('admin') : t('worker')}
              </span>
            </div>

            <div className="flex items-center space-x-4 space-x-reverse language-btn-container">
              <div className="flex items-center space-x-3 space-x-reverse language-btn-container">
                <div className="text-right max-w-xs">
                  <p className="font-medium text-gray-800 truncate">{user?.full_name}</p>
                  <p className="text-sm text-gray-600 truncate">{user?.email}</p>
                </div>

                {/* زر تغيير اللغة للشاشات الكبيرة */}
                <button
                  onClick={() => changeLanguage(language === 'ar' ? 'en' : 'ar')}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-pink-600 bg-gray-100 hover:bg-pink-50 rounded-full transition-all duration-300 font-medium min-w-[70px] text-center"
                  title={t('change_language')}
                  style={{
                    display: 'block',
                    visibility: 'visible',
                    position: 'relative',
                    zIndex: 99999,
                    minWidth: '70px',
                    flexShrink: 0,
                    opacity: 1
                  }}
                >
                  {language === 'ar' ? 'English' : 'عربي'}
                </button>

                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-600 hover:text-red-600 transition-colors duration-300"
                  title={t('logout')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* هيدر للشاشات الصغيرة والمتوسطة */}
          <div className="lg:hidden">
            {/* الصف الأول */}
            <div className="flex items-center justify-between h-14 sm:h-16">
              <div className="flex items-center space-x-2 space-x-reverse min-w-0 flex-1 overflow-hidden">
                <Link
                  href="/"
                  className="text-pink-600 hover:text-pink-700 transition-colors duration-300 group flex items-center space-x-1 space-x-reverse flex-shrink-0"
                >
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform duration-300" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline whitespace-nowrap">{t('homepage')}</span>
                  <span className="text-xs font-medium sm:hidden whitespace-nowrap">{t('home')}</span>
                </Link>
                <div className="w-px h-4 sm:h-6 bg-gray-300 flex-shrink-0"></div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <h1 className="text-sm sm:text-lg md:text-xl font-bold text-gray-800 truncate">
                    {t('welcome_back')}، {user?.full_name || user?.email}
                  </h1>
                </div>
              </div>

              <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse flex-shrink-0 min-w-0 language-btn-container">
                <span className="px-2 sm:px-3 py-1 bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap">
                  {t(user?.role === 'admin' ? 'admin' : 'worker')}
                </span>
                <button
                  onClick={() => changeLanguage(language === 'ar' ? 'en' : 'ar')}
                  className="px-2 sm:px-3 py-1 text-xs sm:text-sm text-gray-600 hover:text-pink-600 bg-gray-100 hover:bg-pink-50 rounded-full transition-all duration-300 flex-shrink-0 font-medium min-w-[60px] sm:min-w-[70px] text-center"
                  title={t('change_language')}
                  style={{
                    display: 'block',
                    visibility: 'visible',
                    position: 'relative',
                    zIndex: 99999,
                    minWidth: '60px',
                    flexShrink: 0,
                    opacity: 1
                  }}
                >
                  {language === 'ar' ? 'English' : 'عربي'}
                </button>

                <button
                  onClick={handleSignOut}
                  className="p-1.5 sm:p-2 text-gray-600 hover:text-red-600 transition-colors duration-300 flex-shrink-0"
                  title={t('logout')}
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* الصف الثاني - معلومات المستخدم */}
            <div className="pb-3 sm:pb-4 border-t border-gray-100">
              <div className="pt-2 sm:pt-3">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">
                  {t('dashboard')} - {t(user?.role === 'admin' ? 'admin' : 'worker')}
                </p>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 text-sm sm:text-base truncate">{user?.full_name}</p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* الترحيب وأزرار العمل المحسن */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex flex-col gap-4 sm:gap-6">
            {/* قسم الترحيب */}
            <div className="text-center sm:text-right overflow-hidden">
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800 mb-2 sm:mb-3 break-words">
                <span className="block sm:hidden">{t('welcome_back')}</span>
                <span className="hidden sm:inline">{t('welcome_back')}، </span>
                <span className="text-pink-600 break-words">{user?.full_name}</span>
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-2xl mx-auto sm:mx-0 break-words">
                {t('overview_today')}
              </p>
            </div>

            {/* أزرار العمل للمدير */}
            {user?.role === 'admin' && (
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center sm:justify-start w-full">
                <Link
                  href="/dashboard/add-order"
                  className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse px-4 sm:px-6 py-3 sm:py-4 group text-sm sm:text-base w-full sm:w-auto min-w-0 flex-shrink-0"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform duration-300 flex-shrink-0" />
                  <span className="whitespace-nowrap">{t('add_new_order')}</span>
                </Link>

                <Link
                  href="/book-appointment"
                  className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse px-4 sm:px-6 py-3 sm:py-4 group text-sm sm:text-base w-full sm:w-auto min-w-0 flex-shrink-0"
                >
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform duration-300 flex-shrink-0" />
                  <span className="whitespace-nowrap">{t('book_appointment')}</span>
                </Link>
              </div>
            )}

            {/* رسالة ترحيب للعامل */}
            {user?.role === 'worker' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg sm:rounded-xl p-4 sm:p-6 text-center sm:text-right overflow-hidden">
                <h3 className="text-lg sm:text-xl font-semibold text-blue-800 mb-2 break-words">
                  {t('welcome_worker')}
                </h3>
                <p className="text-sm sm:text-base text-blue-600 break-words">
                  {t('worker_description')}
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* الإحصائيات - تصميم مختلف للشاشات الصغيرة والكبيرة */}

        {/* الإحصائيات للشاشات الكبيرة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden lg:grid lg:grid-cols-4 gap-6 mb-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-green-600 flex items-center space-x-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>{stat.change}</span>
                </span>
              </div>

              <h3 className="text-2xl font-bold text-gray-800 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.title}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* الإحصائيات للشاشات الصغيرة - تصميم مضغوط */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="block lg:hidden mb-8"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-pink-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center space-x-2 space-x-reverse">
              <BarChart3 className="w-5 h-5 text-pink-600" />
              <span>{t('statistics')}</span>
            </h3>

            <div className="grid grid-cols-3 gap-3">
              {stats.map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  className="text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200"
                >
                  <div className={`w-8 h-8 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center mx-auto mb-2`}>
                    <stat.icon className="w-4 h-4 text-white" />
                  </div>

                  <h4 className="text-lg font-bold text-gray-800 mb-1">{stat.value}</h4>
                  <p className="text-xs text-gray-600 leading-tight">{stat.title}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ترتيب مختلف للشاشات الصغيرة والكبيرة */}
        <div className="block lg:hidden space-y-8">
          {/* الطلبات الحديثة - للشاشات الصغيرة (في الأعلى) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
              <Package className="w-5 h-5 text-pink-600" />
              <span>{t('recent_orders')}</span>
            </h3>

            <div className="space-y-4">
              {recentOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg border border-pink-200"
                >
                  <div>
                    <h4 className="font-medium text-gray-800">{order.client}</h4>
                    <p className="text-sm text-gray-600">{order.type}</p>
                    <p className="text-xs text-gray-500">#{order.id}</p>
                  </div>

                  <div className="text-right flex items-center space-x-2 space-x-reverse">
                    <div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color}`}>
                        {getStatusInfo(order.status).label}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(order.dueDate)}</p>
                    </div>


                  </div>
                </motion.div>
              ))}

              {recentOrders.length === 0 && (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">{t('no_orders_found')}</p>
                </div>
              )}
            </div>

            <Link
              href="/dashboard/orders"
              className="w-full mt-4 btn-secondary py-2 text-sm inline-flex items-center justify-center"
            >
              {t('view_all')} {t('orders')}
            </Link>
          </motion.div>



          {/* الإجراءات السريعة - للمدير فقط في الشاشات الصغيرة */}
          {user?.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100"
            >
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <Settings className="w-5 h-5 text-pink-600" />
                <span>{t('quick_actions')}</span>
              </h3>

              <div className="grid gap-4 grid-cols-2">
                <Link
                  href="/dashboard/add-order"
                  className="p-4 bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg border border-pink-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Plus className="w-6 h-6 text-pink-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-pink-800">{t('add_new_order')}</span>
                </Link>
                <Link
                  href="/dashboard/add-dress"
                  className="p-4 bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg border border-pink-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Palette className="w-6 h-6 text-pink-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-pink-800">إضافة فستان جديد</span>
                </Link>

                <Link
                  href="/dashboard/ready-designs"
                  className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Palette className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-purple-800">إدارة التصاميم الجاهزة</span>
                </Link>

                <Link
                  href="/dashboard/workers"
                  className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Users className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-blue-800">{t('worker_management')}</span>
                </Link>

                <Link
                  href="/dashboard/appointments"
                  className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200 hover:shadow-md transition-all duration-300 text-center block col-span-2"
                >
                  <Calendar className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-purple-800">{t('appointments')}</span>
                </Link>
              </div>

              <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                <h4 className="font-medium text-gray-800 mb-2">{t('reminder')}</h4>
                <p className="text-sm text-gray-600">
                  {t('you_have')} {todayAppointments} {t('today_appointments_reminder')} {t('and')} {realStats.activeOrders} {t('orders_need_follow')}
                </p>
              </div>
            </motion.div>
          )}



          {/* التقارير - للشاشات الصغيرة في الأسفل */}
          {user?.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100"
            >
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <BarChart3 className="w-5 h-5 text-green-600" />
                <span>{t('reports')}</span>
              </h3>

              <Link
                href="/dashboard/reports"
                className="w-full p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200 hover:shadow-md transition-all duration-300 text-center block"
              >
                <BarChart3 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <span className="text-base font-medium text-green-800">{t('detailed_reports')}</span>
              </Link>
            </motion.div>
          )}
        </div>

        {/* التخطيط الأصلي للشاشات الكبيرة */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-8">
          {/* الطلبات الحديثة */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
              <Package className="w-5 h-5 text-pink-600" />
              <span>{t('recent_orders')}</span>
            </h3>

            <div className="space-y-4">
              {recentOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg border border-pink-200"
                >
                  <div>
                    <h4 className="font-medium text-gray-800">{order.client}</h4>
                    <p className="text-sm text-gray-600">{order.type}</p>
                    <p className="text-xs text-gray-500">#{order.id}</p>
                  </div>

                  <div className="text-right flex items-center space-x-2 space-x-reverse">
                    <div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                      <p className="text-xs text-gray-500 mt-1 flex items-center space-x-1 space-x-reverse">
                        <Clock className="w-3 h-3" />
                        <span>{order.dueDate}</span>
                      </p>
                    </div>


                  </div>
                </motion.div>
              ))}
            </div>

            <Link
              href="/dashboard/orders"
              className="w-full mt-4 btn-secondary py-2 text-sm inline-flex items-center justify-center"
            >
              {t('view_all')} {t('orders')}
            </Link>
          </motion.div>

          {/* الإجراءات السريعة - للمدير فقط */}
          {user?.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100"
            >
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <Settings className="w-5 h-5 text-pink-600" />
                <span>{t('quick_actions')}</span>
              </h3>

              <div className="grid gap-4 grid-cols-2">
                <Link
                  href="/dashboard/add-order"
                  className="p-4 bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg border border-pink-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Plus className="w-6 h-6 text-pink-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-pink-800">{t('add_new_order')}</span>
                </Link>
                <Link
                  href="/dashboard/add-dress"
                  className="p-4 bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg border border-pink-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Palette className="w-6 h-6 text-pink-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-pink-800">إضافة فستان جديد</span>
                </Link>

                <Link
                  href="/dashboard/ready-designs"
                  className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Palette className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-purple-800">إدارة التصاميم الجاهزة</span>
                </Link>

                <Link
                  href="/dashboard/workers"
                  className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Users className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-blue-800">{t('worker_management')}</span>
                </Link>

                <Link
                  href="/dashboard/reports"
                  className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <BarChart3 className="w-6 h-6 text-green-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-green-800">{t('reports')}</span>
                </Link>

                <Link
                  href="/dashboard/appointments"
                  className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Calendar className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-purple-800">{t('appointments')}</span>
                </Link>
                <Link
                  href="/dashboard/ready-designs"
                  className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200 hover:shadow-md transition-all duration-300 text-center block"
                >
                  <Palette className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                  <span className="text-sm font-medium text-purple-800">إدارة التصاميم الجاهزة</span>
                </Link>
              </div>

              <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                <h4 className="font-medium text-gray-800 mb-2">{t('reminder')}</h4>
                <p className="text-sm text-gray-600">
                  {t('you_have')} {todayAppointments} {t('today_appointments_reminder')} {t('and')} {realStats.activeOrders} {t('orders_need_follow')}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
