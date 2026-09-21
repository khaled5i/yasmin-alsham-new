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

export async function DELETE(request: NextRequest) {
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

    // 2. قراءة workerId من query parameters
    const { searchParams } = new URL(request.url)
    const workerId = searchParams.get('id')

    if (!workerId) {
      return NextResponse.json(
        { error: 'Worker ID is required' },
        { status: 400 }
      )
    }

    console.log('🗑️ Deleting worker via API:', workerId)

    // 3. الحصول على user_id من جدول workers
    const { data: workerData, error: fetchError } = await supabaseAdmin
      .from('workers')
      .select('user_id')
      .eq('id', workerId)
      .single()

    if (fetchError) {
      console.error('❌ Error fetching worker:', fetchError)
      return NextResponse.json(
        { error: `فشل جلب بيانات العامل: ${fetchError.message}` },
        { status: 400 }
      )
    }

    if (!workerData) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    const userId = workerData.user_id

    console.log('👤 Found user_id:', userId)

    // 4. حذف العامل من جدول workers
    const { error: deleteWorkerError } = await supabaseAdmin
      .from('workers')
      .delete()
      .eq('id', workerId)

    if (deleteWorkerError) {
      console.error('❌ Error deleting from workers table:', deleteWorkerError)
      return NextResponse.json(
        { error: `فشل حذف العامل: ${deleteWorkerError.message}` },
        { status: 400 }
      )
    }

    console.log('✅ Deleted from workers table')

    // 5. حذف المستخدم من جدول users
    const { error: deleteUserError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    if (deleteUserError) {
      console.error('❌ Error deleting from users table:', deleteUserError)
      // لا نرجع خطأ هنا لأن العامل تم حذفه بالفعل
      console.warn('⚠️ Worker deleted but user deletion failed')
    } else {
      console.log('✅ Deleted from users table')
    }

    // 6. حذف المستخدم من Supabase Auth
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      console.error('❌ Error deleting from Auth:', deleteAuthError)
      // لا نرجع خطأ هنا لأن العامل تم حذفه من قاعدة البيانات
      console.warn('⚠️ Worker deleted but Auth user deletion failed')
    } else {
      console.log('✅ Deleted from Auth')
    }

    console.log('✅ Worker deleted successfully')

    return NextResponse.json({ success: true, error: null })

  } catch (error: any) {
    console.error('❌ Error in delete worker API:', error)
    return NextResponse.json(
      { error: error.message || 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

