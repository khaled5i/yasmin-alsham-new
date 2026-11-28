import { NextResponse, type NextRequest } from 'next/server'
import { requireActiveStaff, getStaffServiceClient } from '@/lib/server/api-auth'

/**
 * حسابات «المدير الأكبر» (users.role = 'admin').
 *
 * GET    → قائمة الحسابات النشطة
 * POST   → إضافة حساب جديد (بريد + كلمة مرور + اسم + جوال)
 * DELETE → «حذف» حساب قديم
 *
 * لماذا الحذف إيقاف دائم لا حذف فعلي؟
 * حساب المدير مرتبط بمئات السجلات (عمليات الرواتب، سحوبات الصندوق، الدخل…)
 * عبر مفاتيح ON DELETE NO ACTION على auth.users، فالحذف الفعلي يفشل، ولو
 * نُقلت السجلات لحساب آخر لتزوّر سجل «من أنشأ». لذلك: يُمنع الدخول نهائياً
 * (ban في Auth) ويُطفأ is_active (فيسقط is_admin() فوراً)، ويختفي من القائمة،
 * ويبقى اسمه على السجلات القديمة.
 *
 * حماية: لا يحذف المدير حسابه الذي يستعمله الآن، ولا يُحذف آخر مدير نشط.
 */

const PERMANENT_BAN = '876000h' // ≈ 100 سنة

async function requireOwner(request: NextRequest) {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth
  if (auth.staff.role !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'غير مصرح - للمدير الأكبر فقط' }, { status: 403 }),
    }
  }
  return auth
}

function serviceClientOrError() {
  const admin = getStaffServiceClient()
  if (!admin) {
    return { admin: null, response: NextResponse.json({ error: 'خطأ في إعدادات الخادم' }, { status: 500 }) }
  }
  return { admin, response: null }
}

function translateAuthError(message: string): string {
  if (/at least 6 characters|password should be/i.test(message)) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
  if (/already been registered|already exists|duplicate/i.test(message)) return 'البريد الإلكتروني مستخدم من قبل حساب آخر'
  if (/invalid.*email|email.*invalid/i.test(message)) return 'صيغة البريد الإلكتروني غير صحيحة'
  return message
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response
  const { admin, response } = serviceClientOrError()
  if (!admin) return response

  const { data, error } = await admin
    .from('users')
    .select('id, email, full_name, phone, created_at')
    .eq('role', 'admin')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('admins GET:', error.message)
    return NextResponse.json({ error: 'تعذّر تحميل حسابات المدير الأكبر' }, { status: 500 })
  }

  const accounts = await Promise.all(
    (data || []).map(async row => {
      const { data: authUser } = await admin.auth.admin.getUserById(row.id)
      return {
        ...row,
        last_sign_in_at: authUser?.user?.last_sign_in_at ?? null,
        is_self: row.id === auth.staff.userId,
      }
    })
  )

  return NextResponse.json({ data: accounts })
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response
  const { admin, response } = serviceClientOrError()
  if (!admin) return response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const phone = String(body.phone ?? '').trim()

  if (!email || !password || !fullName || !phone) {
    return NextResponse.json({ error: 'يرجى ملء جميع الحقول المطلوبة' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
  }

  // Auth يرفض البريد المكرر بنفسه؛ هذا فحص مبكر لسجل users بلا حساب Auth
  const { data: existing } = await admin.from('users').select('id').eq('email', email).limit(1).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'البريد الإلكتروني مستخدم من قبل حساب آخر' }, { status: 400 })
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, role: 'admin' },
  })

  if (createError || !created?.user) {
    console.error('admins POST auth:', createError?.message)
    return NextResponse.json(
      { error: `فشل إنشاء الحساب: ${translateAuthError(createError?.message || 'خطأ غير معروف')}` },
      { status: 400 }
    )
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .insert({ id: created.user.id, email, full_name: fullName, phone, role: 'admin', is_active: true })
    .select('id, email, full_name, phone, created_at')
    .single()

  if (profileError || !profile) {
    console.error('admins POST profile:', profileError?.message)
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json(
      { error: `فشل إنشاء سجل الحساب: ${profileError?.message || 'خطأ غير معروف'}` },
      { status: 400 }
    )
  }

  console.log('✅ Admin account created:', profile.id, 'by', auth.staff.userId)
  return NextResponse.json({ data: { ...profile, last_sign_in_at: null, is_self: false } })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response
  const { admin, response } = serviceClientOrError()
  if (!admin) return response

  const targetId = new URL(request.url).searchParams.get('id')?.trim()
  if (!targetId) {
    return NextResponse.json({ error: 'معرّف الحساب مفقود' }, { status: 400 })
  }
  if (targetId === auth.staff.userId) {
    return NextResponse.json(
      { error: 'لا يمكنك حذف الحساب الذي تستخدمه الآن. ادخل بالحساب الآخر ثم احذف هذا منه.' },
      { status: 400 }
    )
  }

  const { data: target, error: targetError } = await admin
    .from('users')
    .select('id, role, is_active')
    .eq('id', targetId)
    .maybeSingle()

  if (targetError || !target || target.role !== 'admin' || !target.is_active) {
    return NextResponse.json({ error: 'الحساب غير موجود أو محذوف من قبل' }, { status: 404 })
  }

  const { count, error: countError } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', targetId)

  if (countError || !count || count < 1) {
    return NextResponse.json({ error: 'لا يمكن حذف آخر حساب للمدير الأكبر' }, { status: 400 })
  }

  // 1) منع الدخول نهائياً (يرفض أي تسجيل دخول أو تجديد جلسة)
  const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: PERMANENT_BAN })
  if (banError) {
    console.error('admins DELETE ban:', banError.message)
    return NextResponse.json({ error: `فشل إيقاف الحساب: ${banError.message}` }, { status: 400 })
  }

  // 2) إطفاء الحساب في users: يسقط is_admin() ومسارات الخادم فوراً حتى لرمز ما زال صالحاً
  const { error: deactivateError } = await admin
    .from('users')
    .update({ is_active: false })
    .eq('id', targetId)

  if (deactivateError) {
    console.error('admins DELETE deactivate:', deactivateError.message)
    await admin.auth.admin.updateUserById(targetId, { ban_duration: 'none' })
    return NextResponse.json({ error: `فشل حذف الحساب: ${deactivateError.message}` }, { status: 400 })
  }

  // تنظيف ما لا قيمة تاريخية له: اشتراكات إشعارات أجهزته
  await admin.from('staff_push_subscriptions').delete().eq('user_id', targetId)

  console.log('🗑️ Admin account removed (banned + deactivated):', targetId, 'by', auth.staff.userId)
  return NextResponse.json({ success: true })
}
