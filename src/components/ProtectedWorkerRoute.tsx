'use client'

import { useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'

interface ProtectedWorkerRouteProps {
  children: ReactNode
  requiredPermission?: 'canAccessOrders' | 'canAccessFabrics' | 'canAccessProducts' | 'canAccessAccounting' | 'canAccessWorkers' | 'canAccessAppointments' | 'canAccessSettings'
  allowAdmin?: boolean
}

export default function ProtectedWorkerRoute({
  children,
  requiredPermission,
  allowAdmin = true
}: ProtectedWorkerRouteProps) {
  const router = useRouter()
  const { user } = useAuthStore()
  const { permissions, isLoading, isAdmin } = useWorkerPermissions()

  useEffect(() => {
    // التحقق من تسجيل الدخول
    if (!user) {
      router.push('/login')
      return
    }

    // السماح للمدير بالوصول إذا كان allowAdmin = true
    if (allowAdmin && isAdmin) {
      return
    }

    // التحقق من الصلاحيات
    if (!isLoading && requiredPermission) {
      if (!permissions || !permissions[requiredPermission]) {
        // إعادة التوجيه إلى لوحة التحكم المناسبة
        router.push('/dashboard')
      }
    }
  }, [user, permissions, isLoading, requiredPermission, allowAdmin, isAdmin, router])

  // عرض شاشة التحميل أثناء التحقق من الصلاحيات
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    )
  }

  // عرض المحتوى إذا كانت الصلاحيات متوفرة
  return <>{children}</>
}

