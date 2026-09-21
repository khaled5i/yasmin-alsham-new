import { NextRequest, NextResponse } from 'next/server'
import { getPartnerServiceClient, setPartnerSessionCookie } from '@/lib/server/partner-session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const client = getPartnerServiceClient()
  if (!client) {
    return NextResponse.json({ error: 'الخدمة غير مهيأة على الخادم' }, { status: 503 })
  }

  let body: { username?: unknown; password?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const username = String(body.username ?? '').trim().toLowerCase().slice(0, 40)
  const password = String(body.password ?? '').slice(0, 200)
  if (!username || !password) {
    return NextResponse.json({ error: 'أدخل اسم المستخدم وكلمة المرور' }, { status: 400 })
  }

  const { data, error } = await client.rpc('partner_portal_login', {
    p_username: username,
    p_password: password,
    p_user_agent: request.headers.get('user-agent'),
  })
  if (error) {
    console.error('partner login failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تسجيل الدخول، حاول لاحقاً' }, { status: 500 })
  }

  const result = (data || {}) as { status?: string; token?: string }
  if (result.status === 'locked') {
    return NextResponse.json(
      { error: 'محاولات كثيرة خاطئة — حاول مجدداً بعد 15 دقيقة' },
      { status: 429 }
    )
  }
  if (result.status === 'inactive') {
    return NextResponse.json({ error: 'الحساب موقوف، تواصل مع ياسمين الشام' }, { status: 403 })
  }
  if (result.status !== 'ok' || !result.token) {
    return NextResponse.json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  setPartnerSessionCookie(response, result.token)
  return response
}
