import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// إنشاء Supabase Admin Client مع Service Role Key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service Role Key - يجب إضافته في .env.local
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: NextRequest) {
  try {
    // 1. التحقق من صلاحيات Admin
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized - No auth header' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // التحقق من صلاحيات المستخدم الحالي
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      )
    }

    // التحقق من أن المستخدم هو Admin
    // قرار الصلاحية يُتخذ بعميل الخادم بعد التحقق من التوكن، حتى لا يعتمد على
    // سياسات القراءة في users، ومع فحص نشاط الحساب صراحةً: الحساب الموقوف
    // الذي ما زال يحمل رمزاً صالحاً يجب أن يُرفض حتى لو كان دوره admin.
    const { data: userData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (roleError || !userData?.is_active) {
      return NextResponse.json(
        { error: 'Forbidden - Account is inactive or missing' },
        { status: 403 }
      )
    }

    if (userData.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin only' },
        { status: 403 }
      )
    }

    // 2. قراءة بيانات العامل من الطلب
    const workerData = await request.json()
    const { email, password, full_name, phone, specialty, worker_type, experience_years, hourly_rate, skills, bio, is_available } = workerData

    console.log('🔧 Creating worker via API:', email, 'Type:', worker_type)

    // 3. إنشاء مستخدم في Supabase Auth باستخدام Admin API
    const { data: authData, error: authError2 } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // تأكيد البريد الإلكتروني تلقائياً
      user_metadata: {
        full_name,
        phone,
        role: 'worker'
      }
    })

    if (authError2) {
      console.error('❌ Auth error:', authError2)
      return NextResponse.json(
        { error: `فشل إنشاء حساب المصادقة: ${authError2.message}` },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'فشل إنشاء المستخدم - لم يتم إرجاع بيانات المستخدم' },
        { status: 400 }
      )
    }

    console.log('✅ Auth user created:', authData.user.id)

    // 4. إنشاء سجل في جدول users
    const { data: userData2, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        phone,
        role: 'worker',
        is_active: true
      })
      .select()
      .single()

    if (userError) {
      console.error('❌ User table error:', userError)
      // حذف المستخدم من Auth إذا فشل إنشاء السجل في users
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json(
        { error: `فشل إنشاء سجل المستخدم: ${userError.message}` },
        { status: 400 }
      )
    }

    console.log('✅ User record created')

    // 5. إنشاء سجل في جدول workers
    const { data: workerRecord, error: workerError } = await supabaseAdmin
      .from('workers')
      .insert({
        user_id: authData.user.id,
        specialty,
        worker_type: worker_type || 'tailor', // نوع العامل (افتراضي: خياط)
        experience_years: experience_years || 0,
        hourly_rate: hourly_rate || 0,
        skills: skills || [],
        bio: bio || '',
        is_available: is_available !== false
      })
      .select()
      .single()

    if (workerError) {
      console.error('❌ Worker table error:', workerError)
      // حذف المستخدم من Auth و users إذا فشل إنشاء العامل
      await supabaseAdmin.from('users').delete().eq('id', authData.user.id)
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json(
        { error: `فشل إنشاء سجل العامل: ${workerError.message}` },
        { status: 400 }
      )
    }

    console.log('✅ Worker record created')

    // 6. إرجاع البيانات الكاملة
    const newWorker = {
      ...workerRecord,
      user: userData2
    }

    return NextResponse.json({ data: newWorker, error: null })

  } catch (error: any) {
    console.error('❌ Error in create worker API:', error)
    return NextResponse.json(
      { error: error.message || 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

