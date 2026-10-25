import { NextResponse, type NextRequest } from 'next/server'
import { WHATSAPP_SHOPS, isWhatsAppShop, normalizeLinkSource } from '@/lib/whatsapp-tracking'

/**
 * رابط واتساب وسيط: /wa/fabrics/instagram/ ← https://wa.me/<رقم الأقمشة>
 *
 * الرد صفحة صغيرة جداً لا تحويل 302: سيرفرات فحص الروابط في إنستغرام وتيك توك تطلب الرابط بهوية
 * متصفح جوال عادي (عند حفظ البايو، وبعد كل ضغطة) فكانت تُعدّ ضغطات. الصفحة تعدّ الضغطة بسطر
 * JavaScript ثم تحوّل فوراً — والفاحص يقرأ الصفحة ولا يشغّل الكود فلا يُعدّ.
 * - العدّ عبر /api/wa-click/ (keepalive يكمل الطلب بعد مغادرة الصفحة)، والسيرفر هناك يستثني
 *   الموظفين والروبوتات وما خارج النطاق الرسمي.
 * - لا GA ولا Clarity في الصفحة ⇒ لا «زيارة صفحة»، وnoindex حتى لا يظهر الرابط في البحث.
 * - بلا JavaScript: meta refresh يحوّل، ورابط ظاهر احتياطاً.
 * - ?text= اختياري لرسالة جاهزة (≤ 500 حرف).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ shop: string; source: string }> }

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  // same-origin لا no-referrer: مع no-referrer يرسل المتصفح Origin: null في POST فيرفضه فحص نفس الأصل.
  // wa.me (أصل آخر) لا يصله المُحيل في الحالتين.
  'Referrer-Policy': 'same-origin',
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

/** JSON داخل <script>: يمنع إغلاق الوسم من داخل النص. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function redirectPage(target: { shop: string; source: string; url: string }): string {
  const url = escapeAttr(target.url)
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>واتساب</title><script>(function(){var t=${scriptJson(target.url)};try{if(!navigator.webdriver){fetch('/api/wa-click/',{method:'POST',keepalive:true,credentials:'same-origin',referrerPolicy:'same-origin',headers:{'Content-Type':'application/json'},body:${scriptJson(JSON.stringify({ shop: target.shop, source: target.source }))}}).catch(function(){})}}catch(e){}location.replace(t)})()</script><meta http-equiv="refresh" content="1;url=${url}"></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 16px"><a href="${url}" style="color:#128c4b;font-weight:600">فتح واتساب</a></body></html>`
}

export async function GET(request: NextRequest, context: RouteContext) {
  const target = await resolve(request, context)
  if (!target) return new NextResponse('Not found', { status: 404, headers: NO_STORE_HEADERS })
  return new NextResponse(redirectPage(target), {
    status: 200,
    headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

/** طلبات HEAD (فاحصات الروابط): تحويل مباشر بلا عدّ. */
export async function HEAD(request: NextRequest, context: RouteContext) {
  const target = await resolve(request, context)
  if (!target) return new NextResponse(null, { status: 404, headers: NO_STORE_HEADERS })
  return NextResponse.redirect(target.url, { status: 302, headers: NO_STORE_HEADERS })
}
