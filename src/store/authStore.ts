import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// تعريف نوع المستخدم
export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'worker' | 'client'
  is_active: boolean
  created_at: string
  updated_at: string
  token?: string
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  error: string | null
  anonymousUserId: string | null
  lastVerifiedAt: number | null
  _hasHydrated: boolean

  // Actions
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  setUserWithTimestamp: (user: AuthUser | null) => void
  clearError: () => void
  checkAuth: () => Promise<void>
  forceRevalidate: () => Promise<void>
  isAuthenticated: () => boolean
  isSessionFresh: () => boolean
  ensureAnonymousUser: () => Promise<string>
  invalidateDataCaches: () => void
}

// بيانات المستخدمين الافتراضية (سيتم استبدالها بنظام إدارة العمال)
const getStoredUsers = () => {
  if (typeof window === 'undefined') return []

  const stored = localStorage.getItem('yasmin-users')
  if (stored) {
    return JSON.parse(stored)
  }

  // المستخدمين الافتراضيين
  const defaultUsers = [
    {
      id: '1',
      email: 'admin@yasminalsham.com',
      password: 'admin123',
      full_name: 'مدير النظام',
      role: 'admin' as const,
      is_active: true
    }
  ]

  localStorage.setItem('yasmin-users', JSON.stringify(defaultUsers))
  return defaultUsers
}

// Listeners for data cache invalidation (used by orderStore, etc.)
type CacheInvalidationListener = () => void
const _cacheInvalidationListeners: Set<CacheInvalidationListener> = new Set()

export function onCacheInvalidation(listener: CacheInvalidationListener): () => void {
  _cacheInvalidationListeners.add(listener)
  return () => { _cacheInvalidationListeners.delete(listener) }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,
      anonymousUserId: null,
      lastVerifiedAt: null,
      _hasHydrated: true, // Always true — no hydration gating in old system

      // Returns true only if session was verified within the last 5 minutes
      isSessionFresh: () => {
        const { user, lastVerifiedAt } = get()
        if (!user || !lastVerifiedAt) return false
        const SESSION_TTL = 5 * 60 * 1000 // 5 دقائق
        return (Date.now() - lastVerifiedAt) < SESSION_TTL
      },

      // Signal to data stores to invalidate their caches
      invalidateDataCaches: () => {
        _cacheInvalidationListeners.forEach(listener => {
          try { listener() } catch (e) { console.error('Cache invalidation listener error:', e) }
        })
      },

      ensureAnonymousUser: async () => {
        const state = get()

        // إذا كان المستخدم مسجل دخول، استخدم user_id الخاص به
        if (state.user) {
          return state.user.id
        }

        // إذا كان لدينا anonymous user ID محفوظ، استخدمه
        if (state.anonymousUserId) {
          return state.anonymousUserId
        }

        // إنشاء anonymous user جديد في Supabase
        if (isSupabaseConfigured()) {
          try {
            console.log('🔐 إنشاء مستخدم مجهول جديد...')

            const { data, error } = await supabase.auth.signInAnonymously()

            if (error) {
              console.error('❌ خطأ في إنشاء مستخدم مجهول:', error.message)
              throw error
            }

            if (data.user) {
              console.log('✅ تم إنشاء مستخدم مجهول:', data.user.id)
              set({ anonymousUserId: data.user.id })
              return data.user.id
            }
          } catch (error: any) {
            console.error('❌ خطأ في إنشاء مستخدم مجهول:', error)
          }
        }

        // Fallback: استخدام session_id من localStorage
        const sessionId = localStorage.getItem('yasmin-session-id')
        if (sessionId) {
          return sessionId
        }

        // إنشاء session_id جديد
        const newSessionId = crypto.randomUUID()
        localStorage.setItem('yasmin-session-id', newSessionId)
        return newSessionId
      },

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null })

        try {
          console.log('🔐 بدء عملية تسجيل الدخول...', { email })

          // محاولة تسجيل الدخول عبر Supabase أولاً
          if (isSupabaseConfigured()) {
            console.log('🌐 محاولة تسجيل الدخول عبر Supabase...')

            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
              email,
              password
            })

            if (authError) {
              console.error('❌ خطأ في تسجيل الدخول عبر Supabase:', authError.message)
              // الانتقال إلى localStorage كـ fallback
              console.log('⚠️ التحول إلى localStorage...')
            } else if (authData.user) {
              console.log('✅ تم تسجيل الدخول عبر Supabase:', authData.user.email)

              // جلب بيانات المستخدم من جدول users
              const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', authData.user.id)
                .single()

              if (userError || !userData) {
                console.error('❌ خطأ في جلب بيانات المستخدم:', userError?.message)
                set({
                  isLoading: false,
                  error: 'لم يتم العثور على بيانات المستخدم في قاعدة البيانات'
                })
                return false
              }

              const user: AuthUser = {
                id: userData.id,
                email: userData.email,
                full_name: userData.full_name,
                role: userData.role,
                is_active: userData.is_active,
                created_at: userData.created_at,
                updated_at: userData.updated_at,
                token: authData.session?.access_token
              }

              // حفظ في localStorage
              if (typeof window !== 'undefined') {
                localStorage.setItem('yasmin-auth-user', JSON.stringify(user))
                console.log('💾 تم حفظ المستخدم في localStorage')
              }

              set({ user, isLoading: false, error: null, lastVerifiedAt: Date.now() })
              // Invalidate data caches so fresh data is fetched after login
              get().invalidateDataCaches()
              console.log('🎉 تم تسجيل الدخول بنجاح عبر Supabase!')
              return true
            }
          }

          // Fallback: استخدام localStorage
          console.log('📦 استخدام localStorage للمصادقة...')
          await new Promise(resolve => setTimeout(resolve, 1000))

          const users = getStoredUsers()
          const foundUser = users.find(
            (user: any) => user.email.toLowerCase() === email.toLowerCase() && user.password === password
          )

          if (foundUser) {
            console.log('✅ تم العثور على المستخدم في localStorage:', foundUser.full_name)

            const user: AuthUser = {
              id: foundUser.id,
              email: foundUser.email,
              full_name: foundUser.full_name,
              role: foundUser.role,
              is_active: foundUser.is_active,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              token: `demo-token-${foundUser.id}-${Date.now()}`
            }

            if (typeof window !== 'undefined') {
              localStorage.setItem('yasmin-auth-user', JSON.stringify(user))
              console.log('💾 تم حفظ المستخدم في localStorage')
            }

            set({ user, isLoading: false, error: null, lastVerifiedAt: Date.now() })
            get().invalidateDataCaches()
            console.log('🎉 تم تسجيل الدخول بنجاح عبر localStorage!')

            return true
          } else {
            console.log('❌ بيانات تسجيل الدخول غير صحيحة')
            set({
              error: 'بيانات تسجيل الدخول غير صحيحة. يرجى التحقق من البريد الإلكتروني وكلمة المرور.',
              isLoading: false
            })
            return false
          }
        } catch (error) {
          console.error('💥 خطأ في تسجيل الدخول:', error)
          set({ error: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.', isLoading: false })
          return false
        }
      },

      signOut: async () => {
        set({ isLoading: true })

        try {
          // تسجيل الخروج من Supabase إذا كان متصلاً
          if (isSupabaseConfigured()) {
            console.log('🚪 تسجيل الخروج من Supabase...')
            await supabase.auth.signOut()
          }

          // مسح البيانات من localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('yasmin-auth-user')
          }

          set({ user: null, isLoading: false, error: null })
          console.log('👋 تم تسجيل الخروج بنجاح')
        } catch (error) {
          console.error('خطأ في تسجيل الخروج:', error)
          set({ isLoading: false, error: 'خطأ في تسجيل الخروج' })
        }
      },

      setUser: (user: AuthUser | null) => {
        set({ user })

        // تحديث localStorage
        if (typeof window !== 'undefined') {
          if (user) {
            localStorage.setItem('yasmin-auth-user', JSON.stringify(user))
          } else {
            localStorage.removeItem('yasmin-auth-user')
          }
        }
      },

      // Stub: same as setUser (kept for interface compatibility)
      setUserWithTimestamp: (user: AuthUser | null) => {
        set({ user })

        if (typeof window !== 'undefined') {
          if (user) {
            localStorage.setItem('yasmin-auth-user', JSON.stringify(user))
          } else {
            localStorage.removeItem('yasmin-auth-user')
          }
        }
      },

      clearError: () => {
        set({ error: null })
      },

      // النظام القديم البسيط: يقرأ فقط من localStorage
      checkAuth: async () => {
        set({ isLoading: true })
        try {
          if (typeof window !== 'undefined') {
            const savedUser = localStorage.getItem('yasmin-auth-user')
            if (savedUser) {
              const user = JSON.parse(savedUser) as AuthUser
              set({ user, isLoading: false })
              return
            }
          }
          set({ user: null, isLoading: false })
        } catch (error) {
          console.error('خطأ في التحقق من المصادقة:', error)
          set({ user: null, isLoading: false })
        }
      },

      // Stub: just calls checkAuth (kept for interface compatibility)
      forceRevalidate: async () => {
        await get().checkAuth()
      },

      isAuthenticated: () => {
        const state = get()
        return state.user !== null && state.user.is_active
      }
    }),
    {
      name: 'yasmin-auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
