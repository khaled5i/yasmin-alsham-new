'use client'

import { useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

/**
 * AuthProvider - يراقب أحداث Supabase Auth
 * عند انتهاء الجلسة أو تسجيل الخروج التلقائي → يمسح بيانات المستخدم ويوجهه للدخول
 * عند تجديد الـ token → يحدّث الـ token المحفوظ
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const hasSetup = useRef(false)

  useEffect(() => {
    // تشغيل مرة واحدة فقط
    if (hasSetup.current || !isSupabaseConfigured()) return
    hasSetup.current = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = useAuthStore.getState().user

      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        // الجلسة انتهت أو تم تسجيل الخروج تلقائياً
        if (currentUser) {
          console.log('🔒 الجلسة انتهت — جاري تسجيل الخروج...')
          // مسح بيانات المستخدم من الـ store و localStorage
          useAuthStore.setState({ user: null, lastVerifiedAt: null })
          if (typeof window !== 'undefined') {
            localStorage.removeItem('yasmin-auth-user')
          }
          // توجيه لصفحة الدخول
          window.location.href = '/login'
        }
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        // تم تجديد الـ token بنجاح — تحديث الـ token المحفوظ
        if (currentUser) {
          const updatedUser = { ...currentUser, token: session.access_token }
          useAuthStore.setState({ user: updatedUser, lastVerifiedAt: Date.now() })
          if (typeof window !== 'undefined') {
            localStorage.setItem('yasmin-auth-user', JSON.stringify(updatedUser))
          }
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return <>{children}</>
}
