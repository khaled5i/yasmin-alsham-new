import { createClient } from '@supabase/supabase-js'

// Get Supabase configuration from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Check if we have valid Supabase configuration
const isValidSupabaseConfig =
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder.key'

// Create Supabase client with error handling
export const supabase = isValidSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

// Helper function to check if Supabase is properly configured
export const isSupabaseConfigured = () => isValidSupabaseConfig

// Helper function to get configuration status
export const getSupabaseStatus = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      configured: false,
      message: 'متغيرات البيئة مفقودة - Environment variables missing'
    }
  }

  if (!isValidSupabaseConfig) {
    return {
      configured: false,
      message: 'يرجى تحديث متغيرات البيئة بقيم حقيقية - Please update environment variables with real values'
    }
  }

  return {
    configured: true,
    message: 'Supabase مُعد بشكل صحيح - Supabase configured correctly'
  }
}
