import { after, NextResponse, type NextRequest } from 'next/server'
import { readSameOriginJson } from '@/lib/server/fabric-store/http'
import { prepareWhatsAppClick, shouldRecordWhatsAppClick } from '@/lib/server/whatsapp-clicks'
import { WHATSAPP_SITE_SOURCE, cleanTrackingToken, isWhatsAppShop } from '@/lib/whatsapp-tracking'

/**
 * ضغطة على زر واتساب داخل الموقع أو المتجر (navigator.sendBeacon من SiteInsights).
 * من نفس الأصل فقط، والرد 204 فوراً والكتابة بعده.
 * جسم الطلب: { shop: 'fabrics' | 'tailoring', placement, visitSource }.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: NextRequest) {
  const parsed = await readSameOriginJson(request)
  if (!parsed.ok) return parsed.response

  const body = (parsed.body ?? {}) as { shop?: unknown; placement?: unknown; visitSource?: unknown }
  if (!isWhatsAppShop(body.shop)) return noContent()

  if (shouldRecordWhatsAppClick(request)) {
    after(prepareWhatsAppClick(request, {
      shop: body.shop,
      source: WHATSAPP_SITE_SOURCE,
      placement: cleanTrackingToken(body.placement),
      visitSource: cleanTrackingToken(body.visitSource, 40),
    }))
  }
  return noContent()
}
