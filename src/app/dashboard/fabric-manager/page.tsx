'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { ArrowRight, Package, Sparkles, TrendingUp, LogOut, Calculator } from 'lucide-react'

export default function FabricManagerDashboard() {
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
    if (!isLoading && workerType !== 'fabric_store_manager' && user.role !== 'admin') {
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 py-8 px-4 sm:py-12">
      <div className="max-w-6xl mx-auto">
        {/* Header with Welcome Message */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 sm:mb-12"
        >
          <Link
            href="/"
            className="inline-flex items-center text-pink-600 hover:text-pink-700 mb-6 transition-colors group"
          >
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            <span className="font-medium">العودة للرئيسية</span>
          </Link>

          <div className="bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-10 shadow-xl border border-pink-100/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <Package className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent">
                      لوحة تحكم مدير الأقمشة
                    </h1>
                  </div>
                </div>
                <p className="text-gray-600 text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-pink-500" />
                  مرحباً <span className="font-semibold text-pink-600">{user?.full_name}</span> - إدارة الأقمشة والمخزون
                </p>
              </div>

              {/* زر تسجيل الخروج */}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-full transition-all duration-300 font-medium border border-red-200 hover:border-red-300 shadow-sm hover:shadow-md"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Main Action Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <Link
            href="/dashboard/fabrics"
            className="group block"
          >
            <div className="bg-gradient-to-br from-white via-pink-50/30 to-purple-50/30 backdrop-blur-md rounded-3xl p-8 sm:p-12 shadow-xl border border-pink-100/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-500">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex-1 text-center sm:text-right">
                  <div className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-100 to-purple-100 px-4 py-2 rounded-full mb-4">
                    <TrendingUp className="w-4 h-4 text-pink-600" />
                    <span className="text-sm font-semibold text-pink-700">إدارة شاملة</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">
                    إدارة الأقمشة
                  </h2>
                  <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                    عرض، إضافة، تعديل وحذف الأقمشة المتوفرة في المتجر
                  </p>
                  <div className="inline-flex items-center gap-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-8 py-4 rounded-full font-semibold text-lg shadow-lg group-hover:shadow-xl group-hover:from-pink-600 group-hover:to-rose-600 transition-all duration-300">
                    <span>الذهاب إلى إدارة الأقمشة</span>
                    <ArrowRight className="w-5 h-5 rotate-180 group-hover:translate-x-2 transition-transform" />
                  </div>
                </div>
                <div className="relative">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 bg-gradient-to-br from-pink-400 via-rose-400 to-purple-500 rounded-3xl flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                    <Package className="w-16 h-16 sm:w-20 sm:h-20 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Action Cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8"
        >
          {/* بطاقة عرض الأقمشة */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-pink-100/50 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center mb-4 shadow-md">
              <span className="text-2xl">✓</span>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">عرض الأقمشة</h3>
            <p className="text-gray-600 text-sm mb-4">استعراض جميع الأقمشة المتوفرة في المخزون</p>
            <div className="flex gap-2 text-xs text-gray-500">
              <span>✏️ تعديل</span>
              <span>•</span>
              <span>📦 إدارة المخزون</span>
            </div>
          </div>

          {/* بطاقة النظام المحاسبي */}
          <Link
            href="/dashboard/accounting/fabrics"
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-pink-100/50 hover:shadow-xl transition-all duration-300 text-right group block"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-orange-600 transition-colors">النظام المحاسبي</h3>
            <p className="text-gray-600 text-sm mb-4">محاسبة قسم الأقمشة والتقارير المالية</p>
            <div className="flex gap-2 text-xs text-gray-500">
              <span>💰 المبيعات</span>
              <span>•</span>
              <span>📊 المصروفات</span>
            </div>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}

