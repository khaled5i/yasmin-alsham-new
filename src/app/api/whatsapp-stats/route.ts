import { NextRequest, NextResponse } from 'next/server'
import { getStaffServiceClient, requireActiveStaff } from '@/lib/server/api-auth'

/**
 * إحصائيات ضغطات واتساب للفترة ?from=yyyy-mm-dd&to=yyyy-mm-dd (بتوقيت الرياض، تشمل اليومين).
 * للمدير فقط — نفس قاعدة تقارير المؤسسة.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 400

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth.response
  if (auth.staff.role !== 'admin') return reply({ error: 'إحصائيات واتساب متاحة للمدير فقط.' }, 403)

  const from = request.nextUrl.searchParams.get('from') ?? ''
  const to = request.nextUrl.searchParams.get('to') ?? ''
  if (!DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) {
    return reply({ error: 'حدد فترة صحيحة.' }, 400)
  }
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) return reply({ error: 'الفترة أطول من المسموح.' }, 400)

  const db = getStaffServiceClient()
  if (!db) return reply({ error: 'خطأ في إعدادات الخادم' }, 500)

  const { data, error } = await db.rpc('whatsapp_click_stats', {
    p_from: `${from}T00:00:00+03:00`,
    p_until: `${nextDay(to)}T00:00:00+03:00`,
  })
  if (error) {
    console.error('whatsapp-stats:', error.message)
    const missing = /whatsapp_click_stats|whatsapp_clicks/.test(error.message)
    return reply({ error: missing ? 'جدول العدّاد غير مفعّل بعد (هجرة 20261025120000).' : 'تعذر تحميل الإحصائيات.' }, 500)
  }
  return reply({ rows: data ?? [] })
}
