'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { useTranslation } from '@/hooks/useTranslation'
import {
  Package,
  CheckCircle,
  Clock,
  ArrowRight,
  Truck,
  LogOut,
  Scissors,
  Languages
} from 'lucide-react'

export default function WorkerDashboard() {
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const { orders, loadOrders } = useOrderStore()
  const { workerType, permissions, isLoading } = useWorkerPermissions()
  const { t, language, changeLanguage, isArabic } = useTranslation()

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    // التحقق من أن المستخدم عامل خياط فقط
    if (!isLoading) {
      if (user.role !== 'worker') {
        router.push('/dashboard')
        return
      }

      // إذا كان العامل ليس خياط، إعادة توجيهه إلى لوحة التحكم المناسبة
      if (workerType && workerType !== 'tailor') {
        const correctRoute = permissions?.dashboardRoute || '/dashboard'
        router.push(correctRoute)
        return
      }
    }

    loadOrders()
  }, [user, workerType, isLoading, permissions, router, loadOrders])

  // تصفية الطلبات المعينة للخياط فقط
  const myOrders = orders.filter(order => order.worker_id === user?.id)
  const pendingOrders = myOrders.filter(o => o.status === 'pending')
  const inProgressOrders = myOrders.filter(o => o.status === 'in_progress')
  const completedOrders = myOrders.filter(o => o.status === 'completed')
  const deliveredOrders = myOrders.filter(o => o.status === 'delivered')

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }



  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      {/* الهيدر */}
      <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 space-x-reverse">
              <Scissors className="w-8 h-8 text-pink-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-800">{t('tailor_dashboard')}</h1>
                <p className="text-sm text-gray-600">{user?.full_name}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse">
              {/* زر تغيير اللغة */}
              <button
                onClick={() => changeLanguage(language === 'ar' ? 'en' : 'ar')}
                className="flex items-center space-x-1 space-x-reverse px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-300"
                title={t('change_language')}
              >
                <Languages className="w-4 h-4" />
                <span className="hidden sm:inline">{language === 'ar' ? 'EN' : 'عربي'}</span>
                <span className="sm:hidden">{language === 'ar' ? 'EN' : 'ع'}</span>
              </button>

              {/* زر تسجيل الخروج */}
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('logout')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-6 border-r-4 border-yellow-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('new_orders')}</p>
                <p className="text-3xl font-bold text-yellow-600">{pendingOrders.length}</p>
              </div>
              <Clock className="w-12 h-12 text-yellow-600 opacity-20" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-lg p-6 border-r-4 border-blue-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('in_progress')}</p>
                <p className="text-3xl font-bold text-blue-600">{inProgressOrders.length}</p>
              </div>
              <Package className="w-12 h-12 text-blue-600 opacity-20" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-lg p-6 border-r-4 border-green-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('completed')}</p>
                <p className="text-3xl font-bold text-green-600">{completedOrders.length}</p>
              </div>
              <CheckCircle className="w-12 h-12 text-green-600 opacity-20" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-lg p-6 border-r-4 border-purple-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('delivered_orders_count')}</p>
                <p className="text-3xl font-bold text-purple-600">{deliveredOrders.length}</p>
              </div>
              <Truck className="w-12 h-12 text-purple-600 opacity-20" />
            </div>
          </motion.div>
        </div>

        {/* الأزرار السريعة - للخياط فقط */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* زر الطلبات */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push('/dashboard/orders')}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all group text-right"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{t('view_all_orders_button')}</h3>
                <p className="text-gray-600">{t('view_manage_orders')}</p>
              </div>
              <ArrowRight className="w-8 h-8 text-pink-600 group-hover:translate-x-2 transition-transform" />
            </div>
          </motion.button>

          {/* زر الطلبات المكتملة */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push('/dashboard/worker-completed-orders')}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all group text-right"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{t('view_completed_orders_button')}</h3>
                <p className="text-gray-600">{t('my_completed_orders')}</p>
              </div>
              <ArrowRight className="w-8 h-8 text-green-600 group-hover:translate-x-2 transition-transform" />
            </div>
          </motion.button>
        </div>

        {/* رسالة ترحيبية */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl shadow-lg p-6 text-white"
        >
          <h2 className="text-2xl font-bold mb-2">{t('welcome')} {user?.full_name}! 👋</h2>
          <p className="text-pink-100">{t('productive_day_message')}</p>
        </motion.div>
      </div>
    </div>
  )
}

