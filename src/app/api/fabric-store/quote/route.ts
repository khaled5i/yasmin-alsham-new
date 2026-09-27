import { NextRequest } from 'next/server'
import { fabricQuoteRequestSchema } from '@/lib/fabric-store/checkout-contract'
import { errorResponse, getServerContext, jsonResponse, readSameOriginJson } from '@/lib/server/fabric-store/http'
import { loadQuoteSnapshot, priceCart } from '@/lib/server/fabric-store/quote-service'

export const dynamic = 'force-dynamic'

/**
 * عرض سعر السلة من الخادم: الأسعار والخصم والمخزون المتاح (الفعلي − المحجوز)
 * الآن، بعقد التسعير نفسه. لا يحجز شيئاً. خلف FABRIC_STORE_CHECKOUT_ENABLED.
 */
export async function POST(request: NextRequest) {
  const server = getServerContext(request)
  if (!server.ok) return server.response
  const input = await readSameOriginJson(request)
  if (!input.ok) return input.response

  const parsed = fabricQuoteRequestSchema.safeParse(input.body)
  if (!parsed.success) return errorResponse(400, 'bad-request', 'بيانات السلة غير صالحة')

  const { client, clientHash } = server.context
  const snapshot = await loadQuoteSnapshot(client, parsed.data.lines.map(line => line.fabricId), clientHash)
  if (snapshot.status === 'rate_limited') {
    return errorResponse(429, 'rate-limited', 'طلبات كثيرة خلال وقت قصير — انتظري دقائق ثم أعيدي المحاولة')
  }
  if (snapshot.status !== 'ok') return errorResponse(503, 'unavailable', 'تعذّر حساب السعر الآن، أعيدي المحاولة')

  return jsonResponse(priceCart(snapshot.rows, parsed.data.lines, parsed.data.deliveryMethod).quote)
}
