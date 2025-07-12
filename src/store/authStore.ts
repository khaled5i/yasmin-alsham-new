import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// تعريف نوع المستخدم
export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'worker'
  is_active: boolean
  created_at: string
  updated_at: string
  token?: string
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  error: string | null

  // Actions
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  clearError: () => void
  checkAuth: () => Promise<void>
  isAuthenticated: () => boolean
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null })

        try {
          console.log('🔐 بدء عملية تسجيل الدخول...', { email })

          // محاكاة تأخير الشبكة
          await new Promise(resolve => setTimeout(resolve, 1500))

          // البحث عن المستخدم في البيانات المحفوظة
          const users = getStoredUsers()
          const foundUser = users.find(
            (user: any) => user.email.toLowerCase() === email.toLowerCase() && user.password === password
          )

          if (foundUser) {
            console.log('✅ تم العثور على المستخدم:', foundUser.full_name)

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

            // حفظ في localStorage أولاً
            if (typeof window !== 'undefined') {
              localStorage.setItem('yasmin-auth-user', JSON.stringify(user))
              console.log('💾 تم حفظ المستخدم في localStorage')
            }

            // تحديث حالة المتجر
            set({ user, isLoading: false, error: null })
            console.log('🎉 تم تسجيل الدخول بنجاح!')

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
          // محاكاة تأخير تسجيل الخروج
          await new Promise(resolve => setTimeout(resolve, 500))

          // مسح البيانات من localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('yasmin-auth-user')
          }

          set({ user: null, isLoading: false, error: null })
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

      clearError: () => {
        set({ error: null })
      },

      checkAuth: async () => {
        set({ isLoading: true })

        try {
          // التحقق من وجود مستخدم محفوظ في localStorage
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

      isAuthenticated: () => {
        const state = get()
        return state.user !== null && state.user.is_active
      }
    }),
    {
      name: 'yasmin-auth-storage',
      partialize: (state) => ({ user: state.user })
    }
  )
)
