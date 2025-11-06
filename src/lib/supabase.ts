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

