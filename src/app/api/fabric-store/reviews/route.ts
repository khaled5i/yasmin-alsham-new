import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  errorResponse,
  getFabricStoreAccessSecret,
  getFabricStoreServiceClient,
  jsonResponse,
  readOrderToken,
  readSameOriginJson,
  sha256Hex,
  toByteaHex,
  trackTokenMatches,
} from '@/lib/server/fabric-store/http'
import { isOrdersServerEnabled } from '@/lib/server/fabric-store/staff-auth'
import { fabricReviewRequestSchema } from '@/lib/fabric-store/reviews'

export const dynamic = 'force-dynamic'

/**
 * تقييم الأقمشة بعد الشراء. إثبات الشراء نفس إثبات تتبّع الطلب: كوكي المتصفح الذي
 * أنشأ الطلب، أو رابط التتبّع (ترويستا x-order-number وx-track-token). البحث برقم
 * الجوال لا يكفي — لا سرّ فيه.
 *
 * يُقبل التقييم لطلب مدفوع ومستلَم، غير تجريبي، ولقماش من بنوده، مرة واحدة لكل قماش.
 */

const ORDER_COLUMNS = `id, checkout_key, payment_status, fulfillment_status, paid_attempt_id,
  fabric_store_order_items (line_number, fabric_id, fabric_name, color_name)`

const REVIEWABLE_PAYMENT_STATUSES = new Set(['paid', 'partially_refunded'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any

type OrderLookup = { ok: true; order: OrderRow } | { ok: false; status: number; code: string; error: string }

async function findProvenOrder(client: SupabaseClient, request: NextRequest): Promise<OrderLookup> {
  const missing = { ok: false as const, status: 404, code: 'no-order', error: 'افتحي رابط طلبك أولاً لتقييم مشترياتك' }
  const failed = { ok: false as const, status: 503, code: 'unavailable', error: 'تعذّر التحقق من الطلب الآن' }
  const now = new Date().toISOString()

  const trackToken = (request.headers.get('x-track-token') ?? '').trim().toLowerCase()
  const trackNumber = (request.headers.get('x-order-number') ?? '').trim().toUpperCase()
  if (trackToken || trackNumber) {
    const secret = getFabricStoreAccessSecret()
    if (!secret || !/^FS-\d{6,8}$/.test(trackNumber) || !/^[0-9a-f]{64}$/.test(trackToken)) return missing
    const { data, error } = await client
      .from('fabric_store_orders')
      .select(ORDER_COLUMNS)
      .eq('order_number', trackNumber)
      .gt('access_expires_at', now)
      .maybeSingle()
    if (error) return failed
    if (!data || !trackTokenMatches(secret, String((data as OrderRow).checkout_key), trackToken)) return missing
    return { ok: true, order: data }
  }

  const token = readOrderToken(request)
  if (!token) return missing
  const { data, error } = await client
    .from('fabric_store_orders')
    .select(ORDER_COLUMNS)
    .eq('access_token_hash', toByteaHex(sha256Hex(token)))
    .gt('access_expires_at', now)
    .maybeSingle()
  if (error) return failed
  if (!data) return missing
  return { ok: true, order: data }
}

/** سبب عدم قبول التقييم لهذا الطلب، أو null إن كان مقبولاً. */
async function reviewBlocker(client: SupabaseClient, order: OrderRow): Promise<string | null> {
  if (!REVIEWABLE_PAYMENT_STATUSES.has(order.payment_status)) return 'التقييم متاح للطلبات المدفوعة فقط'
  if (order.fulfillment_status !== 'delivered') return 'يمكنك التقييم بعد استلام طلبك'
  if (order.paid_attempt_id) {
    const { data: attempt } = await client
      .from('fabric_store_payment_attempts')
      .select('environment')
      .eq('id', order.paid_attempt_id)
      .maybeSingle()
    if ((attempt as { environment?: string } | null)?.environment === 'test') return 'الطلبات التجريبية لا تُقيَّم'
  }
  return null
}

function orderFabrics(order: OrderRow) {
  const seen = new Map<string, { fabricId: string; name: string; color: string | null }>()
  for (const item of [...(order.fabric_store_order_items ?? [])].sort((a: OrderRow, b: OrderRow) => a.line_number - b.line_number)) {
    if (!seen.has(item.fabric_id)) seen.set(item.fabric_id, { fabricId: item.fabric_id, name: item.fabric_name, color: item.color_name })
  }
  return [...seen.values()]
}

/** أقمشة هذا الطلب وحالة تقييم كل منها — لنموذج التقييم في صفحة التتبّع. */
export async function GET(request: NextRequest) {
  if (!isOrdersServerEnabled()) return errorResponse(404, 'not-found', 'غير موجود')
  const client = getFabricStoreServiceClient()
  if (!client) return errorResponse(503, 'not-configured', 'غير متاح حالياً')

  const lookup = await findProvenOrder(client, request)
  if (!lookup.ok) return errorResponse(lookup.status, lookup.code, lookup.error)
  const { order } = lookup

  const [blocker, { data: existing, error }] = await Promise.all([
    reviewBlocker(client, order),
    client.from('fabric_product_reviews').select('fabric_id, rating, comment, reviewer_name').eq('order_id', order.id),
  ])
  if (error) {
    console.error('fabric-store reviews lookup failed:', error.message)
    return errorResponse(503, 'unavailable', 'التقييم غير متاح حالياً')
  }

  const reviewed = new Map((existing ?? []).map(row => [row.fabric_id as string, row]))
  return jsonResponse({
    ok: true,
    canReview: blocker === null,
    reason: blocker,
    items: orderFabrics(order).map(item => {
      const review = reviewed.get(item.fabricId)
      return {
        ...item,
        review: review ? { rating: review.rating, comment: review.comment, reviewerName: review.reviewer_name } : null,
      }
    }),
  })
}

export async function POST(request: NextRequest) {
  if (!isOrdersServerEnabled()) return errorResponse(404, 'not-found', 'غير موجود')
  const client = getFabricStoreServiceClient()
  if (!client) return errorResponse(503, 'not-configured', 'غير متاح حالياً')

  const input = await readSameOriginJson(request)
  if (!input.ok) return input.response
  const parsed = fabricReviewRequestSchema.safeParse(input.body)
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '')
    const message = field === 'rating' ? 'اختاري عدد النجوم من 1 إلى 5'
      : field === 'reviewerName' ? 'اكتبي الاسم الذي يظهر مع تقييمك (حرفان على الأقل)'
      : field === 'comment' ? 'التعليق أطول من 1000 حرف'
      : 'بيانات التقييم غير صالحة'
    return errorResponse(400, 'invalid-review', message)
  }

  const lookup = await findProvenOrder(client, request)
  if (!lookup.ok) return errorResponse(lookup.status, lookup.code, lookup.error)
  const { order } = lookup

  const blocker = await reviewBlocker(client, order)
  if (blocker) return errorResponse(403, 'not-eligible', blocker)

  const review = parsed.data
  if (!orderFabrics(order).some(item => item.fabricId === review.fabricId)) {
    return errorResponse(403, 'not-in-order', 'هذا القماش ليس من مشتريات هذا الطلب')
  }

  const { error } = await client.from('fabric_product_reviews').insert({
    fabric_id: review.fabricId,
    order_id: order.id,
    rating: review.rating,
    comment: review.comment,
    reviewer_name: review.reviewerName,
  })
  if (error) {
    if (error.code === '23505') return errorResponse(409, 'already-reviewed', 'قيّمتِ هذا القماش من قبل — شكراً لكِ')
    console.error('fabric-store review insert failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر حفظ التقييم الآن — أعيدي المحاولة بعد قليل')
  }
  return jsonResponse({ ok: true })
}
