/**
 * تسجيل ضغطة واتساب في whatsapp_clicks (الكتابة بعميل الخدمة وحده؛ الجدول مغلق عن المتصفح).
 *
 * لا تُسجَّل الضغطة إذا كانت:
 * - خارج النطاق الرسمي (localhost، الشبكة المحلية، روابط Vercel التجريبية) — نفس قاعدة GA.
 * - من جهاز موظف (كوكي ys-staff-device، يُضبط مع علامة localStorage في analytics-privacy).
 * - من روبوت معاينة روابط أو طلب prefetch.
 *
 * «الشخص» = بصمة HMAC لعنوان IP مع المتصفح، بمفتاح يتبدّل كل شهر: لا يُخزَّن العنوان ولا يُعكس،
 * والعدّ داخل الشهر تقريبي (الجوال قد يغيّر عنوانه).
 */

import { createHmac } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { STAFF_DEVICE_COOKIE, isAnalyticsProductionHost } from '@/lib/analytics-privacy'
import { getFabricStoreAccessSecret, getFabricStoreServiceClient } from '@/lib/server/fabric-store/http'
import { isBotUserAgent, type WhatsAppShop } from '@/lib/whatsapp-tracking'

export interface WhatsAppClickInput {
  shop: WhatsAppShop
  source: string
  placement?: string | null
  visitSource?: string | null
}

/** هل تُحسب هذه الضغطة؟ */
export function shouldRecordWhatsAppClick(request: NextRequest): boolean {
  if (!isAnalyticsProductionHost(request.nextUrl.hostname)) return false
  if (request.cookies.get(STAFF_DEVICE_COOKIE)?.value === '1') return false
  const purpose = `${request.headers.get('purpose') ?? ''} ${request.headers.get('sec-purpose') ?? ''}`
  if (/prefetch|prerender/i.test(purpose)) return false
  return !isBotUserAgent(request.headers.get('user-agent'))
}

function visitorHash(request: NextRequest, secret: string | null): string | null {
  if (!secret) return null
  const ip =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  if (!ip) return null
  const month = new Date().toISOString().slice(0, 7)
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 300)
  return createHmac('sha256', secret).update(`wa:${month}:${ip}|${ua}`, 'utf8').digest('hex')
}

/**
 * يقرأ بيانات الطلب الآن، ويعيد دالة الكتابة لتُمرَّر إلى after() فتعمل بعد إرسال الرد.
 * الدالة لا ترمي أبداً: فشل التسجيل لا يمس الزبون.
 */
export function prepareWhatsAppClick(request: NextRequest, input: WhatsAppClickInput): () => Promise<void> {
  const row = {
    shop: input.shop,
    source: input.source,
    placement: input.placement ?? null,
    visit_source: input.visitSource ?? null,
    visitor_hash: visitorHash(request, getFabricStoreAccessSecret()),
  }
  return async () => {
    const client = getFabricStoreServiceClient()
    if (!client) {
      console.error('whatsapp-clicks: Supabase service role is not configured')
      return
    }
    try {
      const { error } = await client.from('whatsapp_clicks').insert(row)
      if (error) console.error('whatsapp-clicks: insert failed', error.message)
    } catch (error) {
      console.error('whatsapp-clicks: insert failed', error)
    }
  }
}
