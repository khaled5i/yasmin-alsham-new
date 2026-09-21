import { NextRequest, NextResponse } from 'next/server'
import {
  clearPartnerSessionCookie,
  getPartnerServiceClient,
  readPartnerToken,
} from '@/lib/server/partner-session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = readPartnerToken(request)
  if (!token) {
    return NextResponse.json({ error: 'غير مسجّل الدخول' }, { status: 401 })
  }

  const client = getPartnerServiceClient()
  if (!client) {
    return NextResponse.json({ error: 'الخدمة غير مهيأة على الخادم' }, { status: 503 })
  }

  const { data, error } = await client.rpc('partner_portal_dashboard', { p_token: token })
  if (error) {
    console.error('partner dashboard failed:', error.message)
    return NextResponse.json({ error: 'تعذّر تحميل البيانات' }, { status: 500 })
  }
  if (!data) {
    // جلسة منتهية أو حساب موقوف أو كلمة مرور تغيّرت
    const response = NextResponse.json({ error: 'انتهت الجلسة' }, { status: 401 })
    clearPartnerSessionCookie(response)
    return response
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
