/**
 * أدوات مسارات المتجر الإلكتروني على الخادم (المرحلة 4 من خطة الدفع).
 *
 * - مفتاح الخادم `FABRIC_STORE_CHECKOUT_ENABLED` (مطفأ افتراضياً ⇒ 404).
 * - عميل الخدمة: جداول المتجر مغلقة عن المتصفح، ودوال القاعدة ممنوحة لـservice_role وحده.
 * - حماية CSRF: POST بـJSON فقط، ومن نفس الأصل (Origin + Sec-Fetch-Site)، وجسم محدود.
 * - رمز وصول الزائر: HMAC(السر، مفتاح الطلب) في كوكي httpOnly؛ القاعدة تخزّن بصمته فقط.
 *   اشتقاقه من المفتاح يجعل إعادة الإرسال بعد انقطاع الشبكة تعيد الطلب نفسه ورمزه نفسه.
 * - بصمة صاحب الطلب لحدود المعدّل: HMAC لعنوان IP، فلا يُخزَّن العنوان ولا يُعكس.
 *
 * السر `FABRIC_STORE_ACCESS_SECRET` يضعه المالك في البيئة (32 حرفاً على الأقل)،
 * وليس NEXT_PUBLIC. بدونه تردّ المسارات 503 ولا يُنشأ شيء.
 */

import { createHash, createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const FABRIC_ORDER_COOKIE = 'ys_fabric_order'
const ORDER_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60
const MAX_BODY_BYTES = 16 * 1024

export function isCheckoutServerEnabled(): boolean {
  return (process.env.FABRIC_STORE_CHECKOUT_ENABLED ?? '').trim().toLowerCase() === 'true'
}

let serviceClient: SupabaseClient | null = null

export function getFabricStoreServiceClient(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null
  }
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return serviceClient
}

function getAccessSecret(): string | null {
  const secret = process.env.FABRIC_STORE_ACCESS_SECRET ?? ''
  return secret.length >= 32 ? secret : null
}

export const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

/** bytea لـPostgREST: نص سداسي بالبادئة `\x`. */
export const toByteaHex = (hex: string) => `\\x${hex}`

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function errorResponse(status: number, code: string, error: string): NextResponse {
  return jsonResponse({ ok: false, code, error }, status)
}

export interface FabricStoreServerContext {
  client: SupabaseClient
  secret: string
  /** بصمة صاحب الطلب (HMAC لعنوان IP) بالسداسي، 64 حرفاً. */
  clientHash: string
}

/**
 * المفتاح، والإعدادات، وبصمة صاحب الطلب. أي نقص ⇒ استجابة جاهزة.
 * `requireCheckoutFlag: false` لصفحة الرجوع: دفعة بدأت يجب أن تُتابَع ولو أُطفئ الطلب الجديد.
 */
export function getServerContext(
  request: NextRequest,
  options: { requireCheckoutFlag?: boolean } = {}
): { ok: true; context: FabricStoreServerContext } | { ok: false; response: NextResponse } {
  if ((options.requireCheckoutFlag ?? true) && !isCheckoutServerEnabled()) {
    return { ok: false, response: errorResponse(404, 'not-found', 'غير موجود') }
  }
  const client = getFabricStoreServiceClient()
  const secret = getAccessSecret()
  if (!client || !secret) {
    console.error('fabric-store: service role or FABRIC_STORE_ACCESS_SECRET is not configured')
    return { ok: false, response: errorResponse(503, 'not-configured', 'الطلب الإلكتروني غير متاح حالياً') }
  }
  // على Vercel يضبط الخادم x-real-ip وx-forwarded-for بنفسه. محلياً قد يغيبان
  // فيتشارك الجميع حداً واحداً — مقبول للتطوير.
  const ip =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const clientHash = createHmac('sha256', secret).update(`client:${ip}`, 'utf8').digest('hex')
  return { ok: true, context: { client, secret, clientHash } }
}

/** رمز الوصول للطلب مشتق من مفتاحه: نفس المفتاح ⇒ نفس الرمز، ولا يُعرف بلا السر. */
export function deriveAccessToken(secret: string, checkoutKey: string): string {
  return createHmac('sha256', secret).update(`access:${checkoutKey}`, 'utf8').digest('hex')
}

export function readOrderToken(request: NextRequest): string | null {
  const token = request.cookies.get(FABRIC_ORDER_COOKIE)?.value || ''
  return /^[0-9a-f]{64}$/.test(token) ? token : null
}

export function setOrderCookie(response: NextResponse, token: string) {
  response.cookies.set(FABRIC_ORDER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ORDER_COOKIE_MAX_AGE_SECONDS,
  })
}

/**
 * حماية POST من مواقع أخرى (CSRF) وحدّ حجمه:
 * - `Content-Type: application/json` — طلب عابر للمواقع بهذا النوع يحتاج preflight لا نجيبه.
 * - `Origin` موجود ومضيفه هو مضيف الطلب نفسه، و`Sec-Fetch-Site` (إن أرسله المتصفح) same-origin.
 * - الجسم ≤ 16KB ويُقرأ JSON صالحاً.
 */
export async function readSameOriginJson(
  request: NextRequest
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const deny = () => ({ ok: false as const, response: errorResponse(403, 'forbidden', 'طلب غير مسموح') })

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('application/json')) return deny()

  const host = request.headers.get('host')
  const origin = request.headers.get('origin')
  if (!host || !origin) return deny()
  try {
    if (new URL(origin).host !== host) return deny()
  } catch {
    return deny()
  }
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return deny()

  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, 'too-large', 'الطلب أكبر من المسموح') }
  }
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, 'too-large', 'الطلب أكبر من المسموح') }
  }
  try {
    return { ok: true, body: JSON.parse(text) }
  } catch {
    return { ok: false, response: errorResponse(400, 'bad-request', 'طلب غير صالح') }
  }
}
