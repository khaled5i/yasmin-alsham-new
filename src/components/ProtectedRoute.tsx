'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { motion } from 'framer-motion'
import { Shield, AlertCircle, RefreshCw } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'worker'
  redirectTo?: string
}

// Timeout for auth check — prevents infinite spinner
const AUTH_CHECK_TIMEOUT_MS = 8000

export default function ProtectedRoute({
  children,
  requiredRole,
  redirectTo = '/login'
}: ProtectedRouteProps) {
  const { user, isLoading, isSessionFresh, _hasHydrated } = useAuthStore()
  const router = useRouter()
  const [isTimedOut, setIsTimedOut] = useState(false)

  // Timeout safety: if auth takes too long, show error with retry
  useEffect(() => {
    if (_hasHydrated && user) return // Already authenticated, no timeout needed

    const timer = setTimeout(() => {
      if (!user) {
        setIsTimedOut(true)
      }
    }, AUTH_CHECK_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [_hasHydrated, user])

  // Handle redirects after hydration + auth check complete
  useEffect(() => {
    // Don't do anything until hydration is complete
    if (!_hasHydrated) return
    // Don't redirect while still loading
    if (isLoading) return

    if (!user) {
      // Only redirect if not timed out (timed out shows retry UI instead)
      if (!isTimedOut) {
        router.push(redirectTo)
      }
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
  }, [user, _hasHydrated, isLoading, requiredRole, router, redirectTo, isTimedOut])

  // FAST PATH: If user exists, is active, and session is fresh — render immediately.
  // No loading screen, no waiting. This is the key fix for instant dashboard access.
  if (user && user.is_active && (_hasHydrated || isSessionFresh())) {
    if (requiredRole && user.role !== requiredRole) {
      return null // Will be redirected by useEffect
    }
    return <>{children}</>
  }

  // Waiting for hydration from localStorage — show nothing (prevents flash)
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  // Timed out — show error with retry button instead of infinite spinner
  if (isTimedOut && !user) {
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
          <h2 className="text-2xl font-bold text-gray-800 mb-4">تعذر التحقق من الجلسة</h2>
          <p className="text-gray-600 mb-6">
            حدث خطأ أثناء التحقق من صلاحياتك. يرجى المحاولة مرة أخرى.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setIsTimedOut(false)
                useAuthStore.getState().forceRevalidate()
              }}
              className="btn-primary px-6 py-3 inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </button>
            <button
              onClick={() => router.push('/login')}
              className="btn-secondary px-6 py-3"
            >
              تسجيل الدخول
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // Loading state — auth check is in progress
  if (isLoading || !user) {
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
