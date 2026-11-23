'use client'

import { useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import type { StaffPermissionKey } from '@/lib/staff-permissions'

interface ProtectedWorkerRouteProps {
  children: ReactNode
  /** الصلاحية المطلوبة (أو أي واحدة من القائمة) من نظام الصلاحيات التفصيلي. */
  staffPermission?: StaffPermissionKey | StaffPermissionKey[]
  /** @deprecated استعمل staffPermission */
  requiredPermission?: 'canAccessOrders' | 'canAccessFabrics' | 'canAccessProducts' | 'canAccessAccounting' | 'canAccessWorkers' | 'canAccessAppointments' | 'canAccessSettings'
  allowAdmin?: boolean
}

export default function ProtectedWorkerRoute({
  children,
  staffPermission,
  requiredPermission,
  allowAdmin = true
}: ProtectedWorkerRouteProps) {
  const router = useRouter()
  const { user } = useAuthStore()
  const { permissions, isLoading, isAdmin, canAny, getDashboardRoute } = useWorkerPermissions()

  const staffKeys = staffPermission
    ? (Array.isArray(staffPermission) ? staffPermission : [staffPermission])
    : null

  const allowed = (() => {
    if (!user) return false
    if (allowAdmin && isAdmin) return true
    if (staffKeys) return canAny(staffKeys)
    if (requiredPermission) return !!permissions?.[requiredPermission]
    return true
  })()

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    if (isLoading || allowed) return
    // بدون الصلاحية: صفحة العامل الرئيسية
    router.replace(getDashboardRoute())
  }, [user, isLoading, allowed, router, getDashboardRoute])

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

  if (!allowed) {
    return <NoPermissionNotice homeHref={getDashboardRoute()} />
  }

  return <>{children}</>
}

export function NoPermissionNotice({ homeHref = '/dashboard' }: { homeHref?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 px-4" dir="rtl">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-pink-100 shadow-sm p-6 text-center">
        <ShieldOff className="w-10 h-10 text-pink-500 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-gray-900 mb-1">لا تملك صلاحية هذا القسم</h1>
        <p className="text-sm text-gray-600 mb-5">اطلب من المدير الأكبر منحك الصلاحية من «إدارة العمال».</p>
        <Link href={homeHref} className="inline-flex items-center justify-center rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pink-700">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  )
}
