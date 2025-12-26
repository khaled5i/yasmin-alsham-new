'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { ArrowRight, Calculator, FileText, LogOut } from 'lucide-react'

export default function AccountantDashboard() {
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const { workerType, permissions, isLoading } = useWorkerPermissions()

  useEffect(() => {
    // التحقق من تسجيل الدخول
    if (!user) {
      router.push('/login')
      return
    }

    // التحقق من الصلاحيات
    if (!isLoading && workerType !== 'accountant' && user.role !== 'admin') {
      router.push('/dashboard')
      return
    }
  }, [user, workerType, isLoading, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4 transition-colors"
          >
            <ArrowRight className="w-5 h-5 ml-2" />
            العودة للرئيسية
          </Link>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-blue-100">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  لوحة تحكم المحاسب
                </h1>
                <p className="text-gray-600">
                  مرحباً {user?.full_name} - إدارة الحسابات والتقارير المالية
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">تسجيل الخروج</span>
                </button>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-indigo-400 rounded-full flex items-center justify-center">
                  <Calculator className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid md:grid-cols-2 gap-6 mb-8"
        >
          <Link
            href="/dashboard/accounting"
            className="group bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-100 hover:shadow-lg transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors rotate-180" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">النظام المحاسبي</h3>
            <p className="text-gray-600 text-sm">
              إدارة الحسابات والقيود المحاسبية
            </p>
          </Link>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">التقارير المالية</h3>
            <p className="text-gray-600 text-sm mb-4">
              عرض التقارير والإحصائيات المالية
            </p>
            <Link
              href="/dashboard/accounting?tab=reports"
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              عرض التقارير ←
            </Link>
          </div>
        </motion.div>

      </div>
    </div>
  )
}

