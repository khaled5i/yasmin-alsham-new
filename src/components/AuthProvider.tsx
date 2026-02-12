'use client'

import { useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore, AuthUser } from '@/store/authStore'

/**
 * AuthProvider - مزود المصادقة
 * يدير جلسة Supabase Auth ويستمع لتغييرات حالة المصادقة
 * 
 * KEY FIX: Waits for Zustand hydration before calling checkAuth(),
 * preventing race conditions where user is null during hydration.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setUserWithTimestamp, checkAuth, _hasHydrated } = useAuthStore()
  const initialized = useRef(false)

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage before doing anything
    if (!_hasHydrated) {
      console.log('⏳ AuthProvider: Waiting for store hydration...')
      return
    }

    // منع التهيئة المتكررة (safe for Strict Mode: subscription is managed separately)
    if (initialized.current) return
    initialized.current = true

    console.log('🔐 AuthProvider: بدء التهيئة (hydration complete)...')

    // التحقق من المصادقة عند التحميل
    checkAuth()
  }, [_hasHydrated, checkAuth, setUser, setUserWithTimestamp])

  // Supabase auth state listener — managed in a separate effect so cleanup works correctly
  // even with React Strict Mode's double-invocation
  useEffect(() => {
    if (!isSupabaseConfigured()) return

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

            // Use setUserWithTimestamp to also update lastVerifiedAt
            setUserWithTimestamp(user)
            console.log('✅ تم تحديث المستخدم بعد SIGNED_IN')
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          console.log('👋 تم تسجيل الخروج')
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // KEY FIX: Update both token AND lastVerifiedAt so isSessionFresh() returns true
          // Previously only the token was updated, causing unnecessary re-verification
          const currentUser = useAuthStore.getState().user
          if (currentUser) {
            setUserWithTimestamp({
              ...currentUser,
              token: session.access_token
            })
            console.log('🔄 تم تحديث token + lastVerifiedAt')
          }
        }
      }
    )

    // تنظيف الاشتراك عند إلغاء التحميل
    return () => {
      subscription.unsubscribe()
    }
  }, [setUser, setUserWithTimestamp])

  return <>{children}</>
}
