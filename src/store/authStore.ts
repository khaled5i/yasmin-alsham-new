import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// Session TTL: 55 minutes — Supabase tokens last 1 hour; refresh happens automatically.
// A 5-minute TTL was the root cause of excessive re-verification.
const SESSION_TTL_MS = 55 * 60 * 1000

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
  lastVerifiedAt: number | null  // Timestamp of last successful session verification
  _hasHydrated: boolean           // Whether Zustand has rehydrated from localStorage

  // Actions
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  setUserWithTimestamp: (user: AuthUser | null) => void  // setUser + update lastVerifiedAt
  clearError: () => void
  checkAuth: () => Promise<void>
  forceRevalidate: () => Promise<void>  // Force a fresh session check
  isAuthenticated: () => boolean
  isSessionFresh: () => boolean  // Check if session was recently verified
  ensureAnonymousUser: () => Promise<string>
  invalidateDataCaches: () => void  // Signal to data stores to clear their caches
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

// Deduplication guard: only one checkAuth() call runs at a time.
// Subsequent callers receive the same promise.
let _checkAuthPromise: Promise<void> | null = null

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
      _hasHydrated: false,

      // Check if the session was verified recently (within TTL)
      isSessionFresh: () => {
        const state = get()
        if (!state.user || !state.lastVerifiedAt) return false
        const now = Date.now()
        return (now - state.lastVerifiedAt) < SESSION_TTL_MS
      },

      // Signal to data stores to invalidate their caches
      invalidateDataCaches: () => {
        console.log('🔄 Invalidating data caches...')
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

          set({ user: null, isLoading: false, error: null, lastVerifiedAt: null })
          // Invalidate data caches to prevent stale data on next login
          get().invalidateDataCaches()
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

      // Update user AND mark session as freshly verified (used by AuthProvider on TOKEN_REFRESHED)
      setUserWithTimestamp: (user: AuthUser | null) => {
        set({ user, lastVerifiedAt: user ? Date.now() : null })

        // تحديث localStorage
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

      checkAuth: async () => {
        const state = get()

        // OPTIMIZATION: If session was recently verified, skip re-verification
        if (state.isSessionFresh()) {
          console.log('⚡ Session is fresh, skipping re-verification')
          return
        }

        // DEDUPLICATION: If a checkAuth is already in-flight, wait for it instead of starting another
        if (_checkAuthPromise) {
          console.log('⏳ checkAuth already in-flight, waiting for existing call...')
          return _checkAuthPromise
        }

        const doCheck = async () => {
          set({ isLoading: true })

          try {
            // أولاً: التحقق من جلسة Supabase Auth
            if (isSupabaseConfigured()) {
              console.log('🔐 التحقق من جلسة Supabase...')

              const { data: { session }, error: sessionError } = await supabase.auth.getSession()

              if (sessionError) {
                console.error('❌ خطأ في جلب جلسة Supabase:', sessionError.message)
              }

              if (session?.user) {
                console.log('✅ جلسة Supabase موجودة:', session.user.email)

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

                  // تحديث localStorage
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('yasmin-auth-user', JSON.stringify(user))
                  }

                  // Mark session as freshly verified
                  set({ user, isLoading: false, lastVerifiedAt: Date.now() })
                  console.log('🎉 تم استعادة الجلسة بنجاح!')
                  return
                }
              } else {
                console.log('⚠️ لا توجد جلسة Supabase نشطة')
                // IMPORTANT: If Supabase session is expired, clear stale localStorage data
                if (typeof window !== 'undefined') {
                  const savedUser = localStorage.getItem('yasmin-auth-user')
                  if (savedUser) {
                    console.log('🧹 Clearing stale localStorage user (Supabase session expired)')
                    localStorage.removeItem('yasmin-auth-user')
                  }
                }
                set({ user: null, isLoading: false, lastVerifiedAt: null })
                return
              }
            }

            // Fallback: التحقق من وجود مستخدم محفوظ في localStorage
            // Only use this if Supabase is not configured
            if (typeof window !== 'undefined') {
              const savedUser = localStorage.getItem('yasmin-auth-user')
              if (savedUser) {
                const user = JSON.parse(savedUser) as AuthUser
                console.log('📦 تم استعادة المستخدم من localStorage:', user.email)
                set({ user, isLoading: false, lastVerifiedAt: Date.now() })
                return
              }
            }

            set({ user: null, isLoading: false, lastVerifiedAt: null })
          } catch (error) {
            console.error('خطأ في التحقق من المصادقة:', error)
            set({ user: null, isLoading: false, lastVerifiedAt: null })
          } finally {
            // Clear the deduplication guard
            _checkAuthPromise = null
          }
        }

        _checkAuthPromise = doCheck()
        return _checkAuthPromise
      },

      // Force a fresh session check, bypassing the TTL cache
      forceRevalidate: async () => {
        console.log('🔄 Force revalidating session...')
        set({ lastVerifiedAt: null })  // Clear the cache
        _checkAuthPromise = null       // Clear deduplication guard
        await get().checkAuth()
      },

      isAuthenticated: () => {
        const state = get()
        return state.user !== null && state.user.is_active
      }
    }),
    {
      name: 'yasmin-auth-storage',
      partialize: (state) => ({ user: state.user, lastVerifiedAt: state.lastVerifiedAt }),
    }
  )
)

// Hydration tracking — MUST be done after store creation to avoid circular reference.
// On the server there's no localStorage, so mark hydrated immediately.
if (typeof window === 'undefined') {
  useAuthStore.setState({ _hasHydrated: true })
} else {
  // Client-side: track when persist middleware finishes loading from localStorage
  const persistApi = (useAuthStore as any).persist
  if (persistApi?.onFinishHydration) {
    persistApi.onFinishHydration(() => {
      useAuthStore.setState({ _hasHydrated: true })
      console.log('💧 Auth store hydrated from localStorage')
    })
    // If hydration already completed synchronously
    if (persistApi.hasHydrated?.()) {
      useAuthStore.setState({ _hasHydrated: true })
    }
  } else {
    // Fallback: if persist API doesn't have onFinishHydration, mark as hydrated
    useAuthStore.setState({ _hasHydrated: true })
  }
}
