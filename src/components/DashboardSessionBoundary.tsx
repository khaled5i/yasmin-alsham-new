'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/store/authStore'

type SessionCheckState = 'checking' | 'authenticated' | 'error'

const USER_PROFILE_COLUMNS = 'id,email,full_name,role,is_active,created_at,updated_at'
const SESSION_CHECK_TIMEOUT_MS = 10_000

async function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('SESSION_CHECK_TIMEOUT'))
        }, SESSION_CHECK_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function getCurrentDashboardPath(): string {
  if (typeof window === 'undefined') return '/dashboard'

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function getLoginUrl(): string {
  return `/login?next=${encodeURIComponent(getCurrentDashboardPath())}`
}

function isInvalidSessionError(error: { name?: string; status?: number }): boolean {
  return (
    error.name === 'AuthSessionMissingError' ||
    error.status === 401 ||
    error.status === 403
  )
}

function clearCachedUser(): void {
  useAuthStore.setState({
    user: null,
    lastVerifiedAt: null,
    isLoading: false,
  })

  if (typeof window !== 'undefined') {
    localStorage.removeItem('yasmin-auth-user')
  }
}

export default function DashboardSessionBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const hasHydrated = useAuthStore((state) => state._hasHydrated)
  const [checkState, setCheckState] = useState<SessionCheckState>('checking')
  const [retryAttempt, setRetryAttempt] = useState(0)

  const retry = useCallback(() => {
    setCheckState('checking')
    setRetryAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    if (!hasHydrated) return

    let isCurrentCheck = true

    async function validateSession() {
      const cachedUser = useAuthStore.getState().user

      // Keep the existing local development fallback intact when Supabase is
      // intentionally not configured. Production sessions are always verified.
      if (!isSupabaseConfigured()) {
        if (cachedUser?.is_active) {
          setCheckState('authenticated')
        } else {
          router.replace(getLoginUrl())
        }
        return
      }

      try {
        const {
          data: { user: supabaseUser },
          error: sessionError,
        } = await withTimeout(supabase.auth.getUser())

        if (!isCurrentCheck) return

        if (sessionError) {
          if (isInvalidSessionError(sessionError)) {
            clearCachedUser()
            router.replace(getLoginUrl())
            return
          }

          console.error('Dashboard session verification failed:', sessionError)
          setCheckState('error')
          return
        }

        if (!supabaseUser) {
          clearCachedUser()
          router.replace(getLoginUrl())
          return
        }

        // Refresh role and active status from the protected users table instead
        // of authorizing from a possibly stale localStorage profile.
        const { data: profile, error: profileError } = await withTimeout(
          supabase
            .from('users')
            .select(USER_PROFILE_COLUMNS)
            .eq('id', supabaseUser.id)
            .single(),
        )

        if (!isCurrentCheck) return

        if (profileError || !profile) {
          console.error('Dashboard user profile verification failed:', profileError)
          setCheckState('error')
          return
        }

        if (
          (profile.role !== 'admin' && profile.role !== 'worker' && profile.role !== 'client') ||
          !profile.is_active
        ) {
          clearCachedUser()
          router.replace(getLoginUrl())
          return
        }

        const { data: sessionData } = await supabase.auth.getSession()
        if (!isCurrentCheck) return

        const verifiedUser: AuthUser = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          is_active: profile.is_active,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          token: sessionData.session?.access_token,
        }

        useAuthStore.getState().setUserWithTimestamp(verifiedUser)
        setCheckState('authenticated')
      } catch (error) {
        if (!isCurrentCheck) return
        console.error('Unexpected dashboard session verification error:', error)
        setCheckState('error')
      }
    }

    validateSession()

    return () => {
      isCurrentCheck = false
    }
  }, [hasHydrated, retryAttempt, router])

  if (!hasHydrated || checkState === 'checking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <ShieldCheck className="w-12 h-12 text-pink-500 mx-auto mb-4" />
          <div className="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    )
  }

  if (checkState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-lg">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">تعذر التحقق من الجلسة</h1>
          <p className="text-sm leading-6 text-gray-600 mb-6">
            لم يتم تغيير الصفحة أو صلاحياتك. تحقق من الاتصال ثم أعد المحاولة.
          </p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-pink-700"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
