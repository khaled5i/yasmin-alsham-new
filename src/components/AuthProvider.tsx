'use client'

import { useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore, AuthUser } from '@/store/authStore'

/**
 * AuthProvider - مزود المصادقة
 * يدير جلسة Supabase Auth ويستمع لتغييرات حالة المصادقة
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, checkAuth } = useAuthStore()
  const initialized = useRef(false)

  useEffect(() => {
    // منع التهيئة المتكررة
    if (initialized.current) return
    initialized.current = true

    console.log('🔐 AuthProvider: بدء التهيئة...')

    // التحقق من المصادقة عند التحميل
    checkAuth()

    // الاستماع لتغييرات حالة المصادقة في Supabase
    if (isSupabaseConfigured()) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔄 Auth state changed:', event, session?.user?.email)

          if (event === 'SIGNED_IN' && session?.user) {
            // جلب بيانات المستخدم من جدول users
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single()

            if (!userError && userData) {
              const user: AuthUser = {
                id: userData.id,
                email: userData.email,
                full_name: userData.full_name,
                role: userData.role,
                is_active: userData.is_active,
                created_at: userData.created_at,
                updated_at: userData.updated_at,
                token: session.access_token
              }

              setUser(user)
              console.log('✅ تم تحديث المستخدم بعد SIGNED_IN')
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null)
            console.log('👋 تم تسجيل الخروج')
          } else if (event === 'TOKEN_REFRESHED' && session?.user) {
            // تحديث token في حالة المستخدم
            const currentUser = useAuthStore.getState().user
            if (currentUser) {
              setUser({
                ...currentUser,
                token: session.access_token
              })
              console.log('🔄 تم تحديث token')
            }
          }
        }
      )

      // تنظيف الاشتراك عند إلغاء التحميل
      return () => {
        subscription.unsubscribe()
      }
    }
  }, [checkAuth, setUser])

  return <>{children}</>
}

