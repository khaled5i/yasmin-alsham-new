import { after, NextResponse, type NextRequest } from 'next/server'
import { readSameOriginJson } from '@/lib/server/fabric-store/http'
import { prepareWhatsAppClick, shouldRecordWhatsAppClick } from '@/lib/server/whatsapp-clicks'
import { WHATSAPP_SITE_SOURCE, cleanTrackingToken, isWhatsAppShop, normalizeLinkSource } from '@/lib/whatsapp-tracking'

/**
 * ضغطة واتساب من متصفح حقيقي (طلب fetch بـkeepalive):
 * - زر داخل الموقع أو المتجر (SiteInsights): { shop, placement, visitSource } ⇒ source = 'website'.
 * - صفحة الرابط الوسيط /wa/<shop>/<source>/: { shop, source } ⇒ مصدر الرابط (instagram، tiktok...).
 * من نفس الأصل فقط، والرد 204 فوراً والكتابة بعده.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: NextRequest) {
  const parsed = await readSameOriginJson(request)
  if (!parsed.ok) return parsed.response

  const body = (parsed.body ?? {}) as { shop?: unknown; source?: unknown; placement?: unknown; visitSource?: unknown }
  if (!isWhatsAppShop(body.shop)) return noContent()

  if (shouldRecordWhatsAppClick(request)) {
    const fromLink = typeof body.source === 'string' && body.source !== WHATSAPP_SITE_SOURCE
    after(prepareWhatsAppClick(request, fromLink
      ? { shop: body.shop, source: normalizeLinkSource(body.source as string) }
      : {
          shop: body.shop,
          source: WHATSAPP_SITE_SOURCE,
          placement: cleanTrackingToken(body.placement),
          visitSource: cleanTrackingToken(body.visitSource, 40),
        }))
  }
  return noContent()
}
