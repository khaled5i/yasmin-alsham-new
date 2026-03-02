'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LogIn, User, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Calendar, Info } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { getWorkerDashboardRoute } from '@/lib/worker-types'
import type { WorkerType } from '@/lib/services/worker-service'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidatingSession, setIsValidatingSession] = useState(true)

  const { signIn, isLoading: authLoading, user, isSessionFresh, _hasHydrated } = useAuthStore()
  const router = useRouter()

  // Validate session on page load - only redirect if session is actually valid
  // This prevents the auto-login loop caused by stale cached users
  useEffect(() => {
    // KEY FIX: Wait for Zustand hydration before validating — prevents false "no user" state
    if (!_hasHydrated) {
      console.log('⏳ Login: Waiting for store hydration...')
      return
    }

    async function validateAndRedirect() {
      // If user exists from cache, validate their session with Supabase first
      if (user && user.is_active) {
        console.log('👤 Cached user found, validating session...')

        // If session is fresh (verified within TTL), redirect immediately
        if (isSessionFresh()) {
          console.log('✅ Session is fresh, redirecting...')
          await redirectUser(user)
          setIsValidatingSession(false)
          return
        }

        // Session is not fresh, need to validate with Supabase server
        if (isSupabaseConfigured()) {
          try {
            // getUser() يتصل بالسيرفر فعلياً للتحقق من صلاحية الـ token
            // بخلاف getSession() الذي يقرأ من localStorage فقط
            const { data: { user: supabaseUser }, error: sessionError } = await supabase.auth.getUser()

            if (sessionError || !supabaseUser) {
              console.log('⚠️ Supabase session is invalid or expired, staying on login page')
              // Clear stale user data - let them log in again
              useAuthStore.setState({ user: null, lastVerifiedAt: null })
              if (typeof window !== 'undefined') {
                localStorage.removeItem('yasmin-auth-user')
              }
              setIsValidatingSession(false)
              return
            }

            // Session is valid, update lastVerifiedAt and redirect
            console.log('✅ Supabase session validated with server, redirecting...')
            useAuthStore.setState({ lastVerifiedAt: Date.now() })
            await redirectUser(user)
          } catch (err) {
            console.error('Error validating session:', err)
            // On error, stay on login page
            setIsValidatingSession(false)
            return
          }
        } else {
          // Supabase not configured, trust localStorage (demo mode)
          await redirectUser(user)
        }
      }
      setIsValidatingSession(false)
    }

    async function redirectUser(currentUser: typeof user) {
      if (!currentUser) return

      if (currentUser.role === 'admin') {
        router.push('/dashboard')
        return
      }

      if (currentUser.role === 'worker') {
        try {
          const { data, error } = await supabase
            .from('workers')
            .select('worker_type')
            .eq('user_id', currentUser.id)
            .single()

          if (!error && data?.worker_type) {
            const dashboardRoute = getWorkerDashboardRoute(data.worker_type as WorkerType)
            console.log('🔀 Redirecting worker to:', dashboardRoute)
            router.push(dashboardRoute)
            return
          }
        } catch (err) {
          console.error('Error fetching worker type:', err)
        }
      }

      router.push('/dashboard')
    }

    validateAndRedirect()
    // KEY FIX: removed isSessionFresh from deps — it's a function reference that changes
    // on every Zustand update, causing unnecessary re-runs. We call it inside the effect instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, _hasHydrated])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      setError('يرجى ملء جميع الحقول')
      return
    }

    console.log('📝 بدء عملية تسجيل الدخول من النموذج...', { email })
    setError(null)

    try {
      const success = await signIn(email, password)

      console.log('📊 نتيجة تسجيل الدخول:', success)

      if (success) {
        console.log('🚀 تسجيل الدخول نجح، جاري التوجيه إلى لوحة التحكم...')

        // إضافة تأخير قصير للتأكد من تحديث الحالة
        await new Promise(resolve => setTimeout(resolve, 100))

        // الحصول على المستخدم المحدث
        const authState = useAuthStore.getState()
        const currentUser = authState.user

        if (!currentUser) {
          console.error('❌ لم يتم العثور على بيانات المستخدم بعد تسجيل الدخول')
          router.push('/dashboard')
          return
        }

        // توجيه المستخدم حسب نوعه
        if (currentUser.role === 'admin') {
          console.log('✅ توجيه المدير إلى /dashboard')
          router.push('/dashboard')
        } else if (currentUser.role === 'worker') {
          // جلب نوع العامل من قاعدة البيانات
          try {
            const { data, error } = await supabase
              .from('workers')
              .select('worker_type')
              .eq('user_id', currentUser.id)
              .single()

            if (!error && data?.worker_type) {
              const dashboardRoute = getWorkerDashboardRoute(data.worker_type as WorkerType)
              console.log('✅ توجيه العامل من نوع', data.worker_type, 'إلى:', dashboardRoute)
              router.push(dashboardRoute)
            } else {
              console.error('❌ خطأ في جلب نوع العامل:', error)
              router.push('/dashboard')
            }
          } catch (err) {
            console.error('❌ خطأ في جلب نوع العامل:', err)
            router.push('/dashboard')
          }
        } else {
          // client أو أي نوع آخر
          console.log('✅ توجيه المستخدم إلى /dashboard')
          router.push('/dashboard')
        }

        console.log('✅ تم إرسال طلب التوجيه')
      } else {
        console.log('❌ فشل تسجيل الدخول')
        // الخطأ سيكون موجود في authStore.error
        const authState = useAuthStore.getState()
        if (authState.error) {
          setError(authState.error)
        } else {
          setError('فشل في تسجيل الدخول')
        }
      }
    } catch (error) {
      console.error('💥 خطأ في تسجيل الدخول:', error)
      setError('حدث خطأ غير متوقع أثناء تسجيل الدخول')
    }
  }

  // Show loading while validating session
  if (isValidatingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">جاري التحقق من الجلسة...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-md mx-auto">
          {/* العنوان */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-8"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <LogIn className="w-10 h-10 text-white" />
            </div>

            <h1 className="text-3xl font-bold mb-4">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                تسجيل الدخول
              </span>
            </h1>
            <p className="text-gray-600">
              أدخل بياناتك للوصول إلى لوحة التحكم
            </p>
          </motion.div>

          {/* ملاحظة للزبائن */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start space-x-3 space-x-reverse">
                <div className="flex-shrink-0">
                  <Info className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-blue-800 mb-2">
                    ملاحظة للزبائن
                  </h3>
                  <p className="text-blue-700 mb-4 leading-relaxed">
                    هذه الصفحة مخصصة للمدير والعمال فقط
                  </p>
                  {/* [HIDDEN TEMPORARILY] حجز موعد - مخفي مؤقتاً
                  <Link
                    href="/book-appointment"
                    className="inline-flex items-center space-x-2 space-x-reverse bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-all duration-300"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>احجزي موعدك الآن</span>
                  </Link>
                  */}
                </div>
              </div>
            </div>
          </motion.div>

          {/* نموذج تسجيل الدخول */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100 shadow-xl"
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg flex items-center space-x-3 space-x-reverse"
              >
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* البريد الإلكتروني */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      // إصلاح مشكلة Backspace على Capacitor
                      if (e.key === 'Backspace' && typeof window !== 'undefined' && (window as any).Capacitor) {
                        e.stopPropagation()
                      }
                    }}
                    className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                    placeholder="أدخل البريد الإلكتروني"
                    required
                    disabled={authLoading}
                    autoComplete="email"
                  />
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
              </div>

              {/* كلمة المرور */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      // إصلاح مشكلة Backspace على Capacitor
                      if (e.key === 'Backspace' && typeof window !== 'undefined' && (window as any).Capacitor) {
                        e.stopPropagation()
                      }
                    }}
                    className="w-full px-4 py-3 pl-12 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                    placeholder="أدخل كلمة المرور"
                    required
                    disabled={authLoading}
                    autoComplete="current-password"
                  />
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-300"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* زر تسجيل الدخول */}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authLoading ? (
                  <div className="flex items-center justify-center space-x-2 space-x-reverse">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري تسجيل الدخول...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2 space-x-reverse">
                    <LogIn className="w-5 h-5" />
                    <span>تسجيل الدخول</span>
                  </div>
                )}
              </button>
            </form>
          </motion.div>

          {/* رابط العودة للصفحة الرئيسية */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-center mt-8"
          >
            <a
              href="/"
              className="text-pink-600 hover:text-pink-700 transition-colors duration-300 text-sm font-medium"
            >
              العودة إلى الصفحة الرئيسية
            </a>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
