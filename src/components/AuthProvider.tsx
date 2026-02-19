'use client'

/**
 * AuthProvider - Passthrough wrapper
 * النظام القديم: لا يراقب أحداث Supabase Auth
 * المصادقة تتم فقط عبر localStorage في authStore
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
