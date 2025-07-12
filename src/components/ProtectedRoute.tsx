'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { motion } from 'framer-motion'
import { Shield, AlertCircle } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'worker'
  redirectTo?: string
}

export default function ProtectedRoute({ 
  children, 
  requiredRole, 
  redirectTo = '/login' 
}: ProtectedRouteProps) {
  const { user, isLoading, checkAuth } = useAuthStore()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      await checkAuth()
      setIsChecking(false)
    }
    
    initAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isChecking && !isLoading) {
      if (!user) {
        router.push(redirectTo)
        return
      }

      if (requiredRole && user.role !== requiredRole) {
        router.push('/dashboard')
        return
      }

      if (!user.is_active) {
        router.push('/login')
        return
      }
    }
  }, [user, isChecking, isLoading, requiredRole, router, redirectTo])

  // عرض شاشة التحميل أثناء التحقق من المصادقة
  if (isChecking || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">جاري التحقق من الصلاحيات...</p>
        </motion.div>
      </div>
    )
  }

  // عرض رسالة خطأ إذا لم يكن المستخدم مخول
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-md mx-auto px-4"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">غير مخول للوصول</h2>
          <p className="text-gray-600 mb-6">
            يجب تسجيل الدخول للوصول إلى هذه الصفحة
          </p>
          <button
            onClick={() => router.push('/login')}
            className="btn-primary px-6 py-3"
          >
            تسجيل الدخول
          </button>
        </motion.div>
      </div>
    )
  }

  if (requiredRole && user.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-md mx-auto px-4"
        >
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">صلاحيات غير كافية</h2>
          <p className="text-gray-600 mb-6">
            ليس لديك الصلاحيات اللازمة للوصول إلى هذه الصفحة
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn-primary px-6 py-3"
          >
            العودة إلى لوحة التحكم
          </button>
        </motion.div>
      </div>
    )
  }

  if (!user.is_active) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-md mx-auto px-4"
        >
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-gray-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">حساب غير نشط</h2>
          <p className="text-gray-600 mb-6">
            تم إلغاء تفعيل حسابك. يرجى التواصل مع المدير.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="btn-primary px-6 py-3"
          >
            تسجيل الدخول
          </button>
        </motion.div>
      </div>
    )
  }

  // عرض المحتوى إذا كان كل شيء صحيح
  return <>{children}</>
}
