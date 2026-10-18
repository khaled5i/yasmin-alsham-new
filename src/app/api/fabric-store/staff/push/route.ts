import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, jsonResponse } from '@/lib/server/fabric-store/http'
import { requireFabricStoreStaff } from '@/lib/server/fabric-store/staff-auth'
import { isStaffPushConfigured, sendStaffPush } from '@/lib/server/fabric-store/staff-push'

export const dynamic = 'force-dynamic'

/**
 * اشتراك جهاز الموظف في إشعارات «طلب جديد» (المدير ومدير متجر الأقمشة).
 * POST { action: 'subscribe', subscription } · { action: 'unsubscribe', endpoint } · { action: 'test' }
 */
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('subscribe'),
    subscription: z.object({
      endpoint: z.string().url().max(1000).startsWith('https://'),
      keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
    }),
  }),
  z.object({ action: z.literal('unsubscribe'), endpoint: z.string().max(1000) }),
  z.object({ action: z.literal('test') }),
])

export async function POST(request: NextRequest) {
  const auth = await requireFabricStoreStaff(request)
  if (!auth.ok) return auth.response
  const { client, userId } = auth.staff
  if (!isStaffPushConfigured()) return errorResponse(503, 'not-configured', 'إشعارات المتصفح غير مهيّأة على الخادم')

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(400, 'bad-request', 'طلب غير صالح')
  const body = parsed.data

  if (body.action === 'subscribe') {
    const { error } = await client.from('staff_push_subscriptions').upsert({
      user_id: userId,
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth: body.subscription.keys.auth,
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300) || null,
    }, { onConflict: 'endpoint' })
    if (error) {
      console.error('staff push: subscribe failed:', error.message)
      return errorResponse(503, 'unavailable', 'تعذّر حفظ الاشتراك — هل طُبّقت هجرة الإشعارات؟')
    }
    return jsonResponse({ ok: true })
  }

  if (body.action === 'unsubscribe') {
    await client.from('staff_push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', userId)
    return jsonResponse({ ok: true })
  }

  const result = await sendStaffPush(client, {
    title: 'إشعار تجريبي — طلبات المتجر',
    body: 'الإشعارات تعمل على هذا الجهاز ✅',
    url: '/dashboard/accounting/fabrics/online-orders/',
    tag: 'fabric-store-test',
  }, { userId })
  if (!result.sent) return errorResponse(409, 'not-sent', 'لم يصل الإشعار لأي جهاز — فعّلي الإشعارات من جديد')
  return jsonResponse({ ok: true, sent: result.sent })
}
