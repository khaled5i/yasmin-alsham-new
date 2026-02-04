'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { useTranslation } from '@/hooks/useTranslation'
import {
  ArrowRight,
  LogOut,
  Package,
  PackageCheck,
  Scissors,
  Languages
} from 'lucide-react'

export default function WorkerDashboard() {
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const { workerType, permissions, isLoading } = useWorkerPermissions()
  const { t, isArabic, language, changeLanguage } = useTranslation()

  useEffect(() => {
    // التحقق من تسجيل الدخول
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
  }, [user, workerType, isLoading, permissions, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-sm sm:text-base text-gray-600">{t('loading') || 'جاري التحميل...'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      {/* الهيدر */}
      <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 shadow-sm">
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-3 sm:py-0 sm:h-16 gap-3 sm:gap-0">
            {/* القسم الأيمن - معلومات المستخدم */}
            <div className="flex items-center space-x-2 sm:space-x-4 space-x-reverse w-full sm:w-auto">
              <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse flex-shrink-0 text-pink-600">
                <Scissors className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="w-px h-4 sm:h-6 bg-gray-300 hidden sm:block"></div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-800 truncate">
                  {t('welcome')}, {user?.full_name || user?.email}
                </h1>
                <p className="text-gray-600 text-xs sm:text-sm truncate">
                  {t('tailor_dashboard') || 'لوحة تحكم الخياط'}
                </p>
              </div>
              <span className="px-2 sm:px-3 py-1 bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0">
                {t('tailor') || 'خياط'}
              </span>
            </div>

            {/* القسم الأيسر - زر تحويل اللغة وتسجيل الخروج */}
            <div className="flex items-center space-x-2 sm:space-x-4 space-x-reverse self-end sm:self-auto">
              {/* زر تحويل اللغة */}
              <button
                onClick={() => changeLanguage(language === 'ar' ? 'en' : 'ar')}
                className="flex items-center space-x-1 space-x-reverse px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-300"
                title={t('change_language') || 'تغيير اللغة'}
              >
                <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{language === 'ar' ? 'EN' : 'عربي'}</span>
                <span className="sm:hidden">{language === 'ar' ? 'EN' : 'ع'}</span>
              </button>

              {/* زر تسجيل الخروج */}
              <button
                onClick={handleSignOut}
                className="p-2 text-gray-600 hover:text-red-600 transition-colors duration-300"
                title={t('logout') || 'تسجيل الخروج'}
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* قسم الترحيب */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 sm:mb-8"
        >
          <div className="text-center sm:text-right">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800 mb-2 sm:mb-3">
              {t('welcome_back')}, <span className="text-pink-600">{user?.full_name}</span>
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600">
              {t('tailor_dashboard_desc') || 'إدارة ومتابعة طلبات الخياطة الخاصة بك'}
            </p>
          </div>
        </motion.div>

        {/* رسالة ترحيب */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8"
        >
          <div className="flex items-start space-x-3 sm:space-x-4 space-x-reverse">
            <div className="p-2 sm:p-3 bg-pink-100 rounded-lg flex-shrink-0">
              <Scissors className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg md:text-xl font-semibold text-pink-800 mb-1 sm:mb-2">
                {t('tailor_workspace') || 'مساحة عمل الخياط'}
              </h3>
              <p className="text-xs sm:text-sm md:text-base text-pink-700">
                {t('tailor_workspace_info') || 'يمكنك متابعة طلباتك الحالية، وتحديث حالاتها، وعرض أرشيف الطلبات المكتملة'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* لوحة التحكم - البطاقات */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-white/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-pink-100"
        >
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center space-x-2 space-x-reverse">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600 flex-shrink-0" />
            <span>{t('orders_management') || 'إدارة الطلبات'}</span>
          </h3>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {/* بطاقة الطلبات الجارية */}
            <Link
              href="/dashboard/orders"
              className="group p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <Package className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-bold text-blue-800 mb-1 sm:mb-2">
                    {t('current_orders') || 'الطلبات الجارية'}
                  </h4>
                  <p className="text-xs sm:text-sm text-blue-600">
                    {t('view_update_orders') || 'عرض وتحديث حالة الطلبات المسندة إليك'}
                  </p>
                </div>
              </div>
            </Link>

            {/* بطاقة الطلبات المكتملة */}
            <Link
              href="/dashboard/worker-completed-orders"
              className="group p-4 sm:p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 hover:border-green-400 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <PackageCheck className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-bold text-green-800 mb-1 sm:mb-2">
                    {t('completed_orders') || 'الطلبات المكتملة'}
                  </h4>
                  <p className="text-xs sm:text-sm text-green-600">
                    {t('view_completed_archive') || 'عرض سجل الطلبات التي أنجزتها'}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
