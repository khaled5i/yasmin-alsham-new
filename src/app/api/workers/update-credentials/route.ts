import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * تحديث بيانات دخول العامل (البريد الإلكتروني و/أو كلمة المرور)
 * يحدّث Supabase Auth أولاً ثم جدول users حتى لا يفترقا
 */
export async function POST(request: NextRequest) {
  try {
    // 1. التحقق من صلاحيات Admin
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'غير مصرح - لا يوجد رمز دخول' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'غير مصرح - رمز دخول غير صالح' }, { status: 401 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not defined')
      return NextResponse.json({ error: 'خطأ في إعدادات الخادم' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // قرار الصلاحية يُتخذ بعميل الخادم بعد التحقق من التوكن، حتى لا يعتمد على
    // سياسات القراءة في users، ومع فحص نشاط الحساب صراحةً: الحساب الموقوف
    // الذي ما زال يحمل رمزاً صالحاً يجب أن يُرفض حتى لو كان دوره admin.
    const { data: currentUserData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (roleError || !currentUserData?.is_active) {
      return NextResponse.json({ error: 'غير مصرح - الحساب غير نشط أو غير موجود' }, { status: 403 })
    }

    if (currentUserData.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - للمدير فقط' }, { status: 403 })
    }

    // 2. قراءة البيانات المطلوبة
    const { userId, email, password } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'معرّف المستخدم مفقود' }, { status: 400 })
    }

    if (!email && !password) {
      return NextResponse.json({ error: 'لا توجد بيانات للتحديث' }, { status: 400 })
    }

    // 3. تحديث Supabase Auth
    const authUpdates: { email?: string; email_confirm?: boolean; password?: string } = {}
    if (email) {
      authUpdates.email = email
      authUpdates.email_confirm = true // تأكيد البريد تلقائياً بدون رسالة تفعيل
    }
    if (password) {
      authUpdates.password = password
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates)

    if (updateError) {
      console.error('❌ Error updating auth credentials:', updateError)

      // رسائل عربية للأخطاء الشائعة
      let message = updateError.message
      if (/at least 6 characters/i.test(message)) {
        message = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
      } else if (/already been registered|already exists/i.test(message)) {
        message = 'البريد الإلكتروني مستخدم من قبل حساب آخر'
      } else if (/invalid.*email/i.test(message)) {
        message = 'صيغة البريد الإلكتروني غير صحيحة'
      }

      return NextResponse.json({ error: message }, { status: 400 })
    }

    // 4. مزامنة البريد في جدول users
    if (email) {
      const { error: userError } = await supabaseAdmin
        .from('users')
        .update({ email })
        .eq('id', userId)

      if (userError) {
        console.error('❌ Error syncing email in users table:', userError)
        return NextResponse.json(
          { error: `تم تحديث بيانات الدخول لكن فشلت مزامنة البريد: ${userError.message}` },
          { status: 400 }
        )
      }
    }

    console.log('✅ Credentials updated for user:', userId, { email: !!email, password: !!password })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('❌ Error in update-credentials API:', error)
    return NextResponse.json(
      { error: error.message || 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
