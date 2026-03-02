/**
 * Supabase Client Configuration
 * تهيئة عميل Supabase
 *
 * هذا الملف يقوم بإنشاء وتصدير عميل Supabase للاستخدام في جميع أنحاء التطبيق
 */

import { createClient } from '@supabase/supabase-js'

// التحقق من وجود متغيرات البيئة
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables are not set. Using fallback mode.')
}

/**
 * عميل Supabase الرئيسي
 * يستخدم في جميع عمليات قاعدة البيانات
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

/**
 * Track when the page was last hidden (backgrounded).
 *
 * We do NOT call refreshSession() here to avoid a race condition with
 * Supabase's own internal visibilitychange handler (autoRefreshToken).
 * Supabase uses Refresh Token Rotation — if two refresh calls fire
 * concurrently with the same token, the second one will fail and
 * GoTrueClient will sign the user out entirely.
 *
 * Instead, we expose `wasRecentlyBackgrounded()` so that code like
 * `buildUploadHeaders()` can decide to wait for Supabase's internal
 * refresh to settle before reading the session.
 */
let _lastHiddenAt = 0
let _lastVisibleAt = 0

// ══════════════════════════════════════════════════════════════════════
// App Resume Detection — for mobile (Capacitor / mobile browsers)
// ══════════════════════════════════════════════════════════════════════

type ResumeCallback = () => void
const _resumeCallbacks = new Set<ResumeCallback>()

/**
 * Register a callback that fires when the app resumes from background.
 * Callbacks fire AFTER a short delay (to allow Supabase token refresh).
 * Returns an unsubscribe function.
 */
export function onAppResume(callback: ResumeCallback): () => void {
  _resumeCallbacks.add(callback)
  return () => { _resumeCallbacks.delete(callback) }
}

/** Current resume generation — increments each time the app resumes. */
let _resumeGeneration = 0

/** Get the current resume generation (useful for stale-check in callbacks). */
export function getResumeGeneration(): number {
  return _resumeGeneration
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _lastHiddenAt = Date.now()
    } else {
      _lastVisibleAt = Date.now()

      const wasHiddenFor = _lastHiddenAt > 0 ? (_lastVisibleAt - _lastHiddenAt) : 0

      // Only fire resume callbacks if the app was hidden for > 1 second
      // (ignore quick tab switches or split-screen on desktop)
      if (wasHiddenFor > 1_000) {
        _resumeGeneration++
        const gen = _resumeGeneration

        // Wait 2 seconds for Supabase's auto-refresh to complete,
        // then notify components to re-fetch their data.
        setTimeout(() => {
          // Only fire if no newer resume has happened
          if (gen === _resumeGeneration) {
            console.log(`🔄 App resumed after ${Math.round(wasHiddenFor / 1000)}s — notifying ${_resumeCallbacks.size} listeners`)
            _resumeCallbacks.forEach(cb => {
              try { cb() } catch (e) { console.error('Resume callback error:', e) }
            })
          }
        }, 2000)
      }
    }
  })
}

/**
 * Returns true if the page was recently backgrounded (hidden for > 3 s)
 * and came back within the last 10 seconds.  Upload code should use this
 * to decide whether to force a session refresh.
 */
export function wasRecentlyBackgrounded(): boolean {
  if (_lastHiddenAt === 0 || _lastVisibleAt === 0) return false
  const wasHiddenFor = _lastVisibleAt - _lastHiddenAt
  const timeSinceVisible = Date.now() - _lastVisibleAt
  return wasHiddenFor > 3_000 && timeSinceVisible < 10_000
}

/**
 * التحقق من تكوين Supabase
 * @returns true إذا كانت متغيرات البيئة مضبوطة بشكل صحيح
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== 'https://placeholder.supabase.co' &&
    supabaseAnonKey !== 'placeholder-key' &&
    !supabaseUrl.includes('your_supabase_project_url_here') &&
    !supabaseAnonKey.includes('your_supabase_anon_key_here')
  )
}

/**
 * اختبار الاتصال بـ Supabase
 * @returns Promise<boolean> true إذا كان الاتصال ناجحاً
 */
export async function testSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Supabase is not configured')
    return false
  }

  try {
    // محاولة جلب بيانات بسيطة للتحقق من الاتصال
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true })

    if (error) {
      console.error('❌ Supabase connection test failed:', error.message)
      return false
    }

    console.log('✅ Supabase connection successful')
    return true
  } catch (error) {
    console.error('❌ Supabase connection error:', error)
    return false
  }
}

/**
 * التحقق من وجود جلسة صالحة قبل العمليات الحساسة (إنشاء/تحديث/حذف).
 * - يقرأ الجلسة الحالية أولاً
 * - إذا كانت منتهية أو غير موجودة، يحاول تجديدها
 * - إذا فشل التجديد، يرمي خطأ واضح للمستخدم
 *
 * ⚠️ لا تستدعي هذه الدالة لعمليات القراءة (SELECT) حتى لا تبطئ التحميل.
 */
export async function ensureValidSession(): Promise<void> {
  if (!isSupabaseConfigured()) return

  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.access_token) {
      // الجلسة موجودة — تحقق هل هي قريبة من الانتهاء (أقل من 60 ثانية)
      const expiresAt = session.expires_at // Unix timestamp بالثواني
      if (expiresAt && (expiresAt - Math.floor(Date.now() / 1000)) < 60) {
        console.log('⏰ الجلسة قريبة من الانتهاء، جاري التجديد...')
        const { error } = await supabase.auth.refreshSession()
        if (error) {
          console.error('❌ فشل تجديد الجلسة:', error.message)
          throw new Error('SESSION_EXPIRED')
        }
        console.log('✅ تم تجديد الجلسة بنجاح')
      }
      return // الجلسة صالحة
    }

    // لا توجد جلسة — محاولة تجديد
    console.log('⚠️ لا توجد جلسة، جاري محاولة التجديد...')
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

    if (refreshError || !refreshData.session) {
      console.error('❌ فشل تجديد الجلسة:', refreshError?.message)
      throw new Error('SESSION_EXPIRED')
    }

    console.log('✅ تم تجديد الجلسة بنجاح')
  } catch (err: any) {
    if (err.message === 'SESSION_EXPIRED') {
      throw new Error('جلستك انتهت. يرجى إعادة تسجيل الدخول ثم المحاولة مرة أخرى')
    }
    // أخطاء شبكة أو غيرها — لا نمنع العملية
    console.warn('⚠️ تعذر التحقق من الجلسة:', err.message)
  }
}

/**
 * الحصول على حالة Supabase
 * @returns كائن يحتوي على معلومات حالة الاتصال
 */
export async function getSupabaseStatus() {
  const isConfigured = isSupabaseConfigured()

  if (!isConfigured) {
    return {
      configured: false,
      connected: false,
      message: 'Supabase is not configured. Please set environment variables.',
    }
  }

  const isConnected = await testSupabaseConnection()

  return {
    configured: true,
    connected: isConnected,
    message: isConnected
      ? 'Supabase is configured and connected successfully'
      : 'Supabase is configured but connection failed',
  }
}
