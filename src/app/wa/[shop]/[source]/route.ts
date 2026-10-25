import { after, NextResponse, type NextRequest } from 'next/server'
import { prepareWhatsAppClick, shouldRecordWhatsAppClick } from '@/lib/server/whatsapp-clicks'
import { WHATSAPP_SHOPS, isWhatsAppShop, normalizeLinkSource } from '@/lib/whatsapp-tracking'

/**
 * رابط واتساب وسيط: /wa/fabrics/instagram/ ← https://wa.me/<رقم الأقمشة>
 *
 * - 302 لا 301: المتصفح يحفظ 301 فلا تصل الضغطات التالية إلى السيرفر ولا تُعدّ.
 * - التسجيل في after(): يُرسل التحويل أولاً، ثم تُكتب الضغطة — لا انتظار لقاعدة البيانات.
 * - لا HTML ولا GA ⇒ لا «زيارة صفحة»، وnoindex حتى لا يظهر الرابط في البحث.
 * - ?text= اختياري لرسالة جاهزة (≤ 500 حرف).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ shop: string; source: string }> }

const REDIRECT_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}

function whatsappUrl(request: NextRequest, number: string): string {
  const text = request.nextUrl.searchParams.get('text')?.trim().slice(0, 500)
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

async function resolve(request: NextRequest, context: RouteContext) {
  const { shop, source } = await context.params
  if (!isWhatsAppShop(shop)) return null
  return { shop, source: normalizeLinkSource(source), url: whatsappUrl(request, WHATSAPP_SHOPS[shop].number) }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const target = await resolve(request, context)
  if (!target) return new NextResponse('Not found', { status: 404, headers: REDIRECT_HEADERS })

  if (shouldRecordWhatsAppClick(request)) {
    after(prepareWhatsAppClick(request, { shop: target.shop, source: target.source }))
  }
  return NextResponse.redirect(target.url, { status: 302, headers: REDIRECT_HEADERS })
}

/** روبوتات المعاينة تبدأ غالباً بـHEAD: نفس التحويل بلا تسجيل. */
export async function HEAD(request: NextRequest, context: RouteContext) {
  const target = await resolve(request, context)
  if (!target) return new NextResponse(null, { status: 404, headers: REDIRECT_HEADERS })
  return NextResponse.redirect(target.url, { status: 302, headers: REDIRECT_HEADERS })
}
