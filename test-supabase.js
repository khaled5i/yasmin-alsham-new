import { createClient } from '@supabase/supabase-js'

// ضع هنا معلومات مشروعك الحقيقية من لوحة Supabase
const SUPABASE_URL = 'https://qbbijtyrikhybgszzbjz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYmlqdHlyaWtoeWJnc3p6Ymp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MzQ5OTUsImV4cCI6MjA3NzQxMDk5NX0.8frVX_2mIRlVt_ofKcjEZRn3por7_x8j2Bhlu6_W87Q'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testConnection() {
  console.log("🚀 بدء الاتصال بـ Supabase...")

  // مجرد طلب بسيط بدون جدول، نتحقق من الرد
  const { data, error } = await supabase.from('test').select('*').limit(1)

  if (error) {
    console.error("❌ خطأ:", error.message)
  } else {
    console.log("✅ الاتصال ناجح! البيانات:", data)
  }

  console.log("🎯 تم تنفيذ الكود بالكامل.")
}

testConnection()
