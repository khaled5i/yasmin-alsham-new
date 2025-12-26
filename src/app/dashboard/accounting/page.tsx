'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Scissors,
  Package,
  Shirt,
  ArrowLeft,
  Clock,
  Calculator
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'

// ============================================================================
// بيانات الفروع
// ============================================================================

const branches = [
  {
    id: 'tailoring',
    name: 'قسم التفصيل',
    description: 'إدارة مالية قسم تفصيل الفساتين',
    icon: Scissors,
    href: '/dashboard/accounting/tailoring',
    color: 'from-pink-500 to-rose-600',
    bgColor: 'bg-pink-50',
    available: true
  },
  {
    id: 'fabrics',
    name: 'قسم الأقمشة',
    description: 'إدارة مالية قسم بيع الأقمشة',
    icon: Package,
    href: '/dashboard/accounting/fabrics',
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-50',
    available: true
  },
  {
    id: 'ready_designs',
    name: 'قسم الجاهز',
    description: 'إدارة مالية قسم الفساتين الجاهزة',
    icon: Shirt,
    href: '/dashboard/accounting/ready-designs',
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-50',
    available: true
  }
]

// ============================================================================
// المكون الرئيسي
// ============================================================================

function AccountingMainContent() {
  const { user } = useAuthStore()
  const { workerType, getDashboardRoute } = useWorkerPermissions()

  // تحديد مسار العودة حسب نوع المستخدم
  const getBackRoute = () => {
    if (user?.role === 'admin') {
      return '/dashboard'
    }
    if (user?.role === 'worker' && workerType) {
      return getDashboardRoute()
    }
    return '/dashboard'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <Link
              href={getBackRoute()}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                <Calculator className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">المحاسبة</h1>
                <p className="text-gray-500">اختر القسم لإدارة الحسابات المالية</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* بطاقات الفروع */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {branches.map((branch, index) => (
            <motion.div
              key={branch.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {branch.available ? (
                <Link href={branch.href}>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:scale-105 transition-all cursor-pointer group h-full">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${branch.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                      <branch.icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
                      {branch.name}
                    </h3>
                    <p className="text-gray-500 text-sm">
                      {branch.description}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 opacity-60 h-full">
                  <div className={`w-16 h-16 rounded-2xl bg-gray-300 flex items-center justify-center mb-4`}>
                    <branch.icon className="w-8 h-8 text-gray-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-500 mb-2">
                    {branch.name}
                  </h3>
                  <p className="text-gray-400 text-sm mb-3">
                    {branch.description}
                  </p>
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>قريباً</span>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* ملاحظة */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-center"
        >
          <p className="text-blue-700 text-sm">
            💡 كل قسم له حساباته المالية الخاصة (واردات، مصروفات، رواتب)
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default function AccountingPage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()

  useEffect(() => {
    // التحقق من تسجيل الدخول
    if (!isLoading && !user) {
      router.push('/login')
      return
    }

    // التحقق من الصلاحيات - السماح للمدير والمحاسب فقط
    if (!isLoading && !permissionsLoading && user) {
      const isAdmin = user.role === 'admin'
      const isAccountant = user.role === 'worker' && workerType === 'accountant'

      if (!isAdmin && !isAccountant) {
        router.push('/dashboard')
        return
      }
    }
  }, [user, workerType, isLoading, permissionsLoading, router])

  if (isLoading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return <AccountingMainContent />
}

