import { NextRequest } from 'next/server'
import { errorResponse, getServerContext, jsonResponse, readOrderToken, sha256Hex } from '@/lib/server/fabric-store/http'
import { getPaymentDeps } from '@/lib/server/fabric-store/payment-context'
import { viewPaymentForReturn } from '@/lib/server/fabric-store/payments'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * حالة الدفع لصفحة الرجوع: من خادمنا لا من رابط ميسر (`status=paid` في الرابط ليس
 * إثباتاً). عند الحاجة يسأل ميسر عن الفاتورة (مرة كل 10 ثوانٍ على الأكثر) ويطبّق
 * دفعاتها، فلا يعتمد الإتمام على وصول الـwebhook. لا يحتاج مفتاح «الدفع الجديد».
 */
export async function GET(request: NextRequest) {
  const server = getServerContext(request, { requireCheckoutFlag: false })
  if (!server.ok) return server.response

  const attemptId = request.nextUrl.searchParams.get('attempt') ?? ''
  if (!UUID.test(attemptId)) return errorResponse(400, 'bad-request', 'رابط غير صالح')
  const token = readOrderToken(request)
  if (!token) return errorResponse(404, 'no-order', 'لم نجد طلبك في هذا المتصفح')

  const payment = getPaymentDeps()
  if (!payment.ok) return payment.response

  try {
    const view = await viewPaymentForReturn(payment.deps, {
      accessHash: sha256Hex(token),
      clientHash: server.context.clientHash,
      attemptId,
    })
    if (view.status === 'rate_limited') return errorResponse(429, 'rate-limited', 'انتظري قليلاً ثم حدّثي الصفحة')
    if (view.status !== 'ok' || !view.attempt) return errorResponse(404, 'no-order', 'لم نجد هذه العملية لطلبك')
    return jsonResponse({
      ok: true,
      orderNumber: view.order_number,
      totalHalalas: view.total_halalas,
      paymentStatus: view.payment_status,
      fulfillmentStatus: view.fulfillment_status,
      needsReview: view.needs_review,
      holdExpiresAt: view.hold_expires_at,
      attemptStatus: view.attempt.status,
      attemptExpiresAt: view.attempt.expires_at,
      // الدفعة C (AUD-06): دفعة ببطاقة ميسر التجريبية — لافتة للزبونة «لن يُسلَّم شيء»
      isTest: view.attempt.environment === 'test',
    })
  } catch (error) {
    console.error('fabric-store payment status failed:', (error as Error).message)
    return errorResponse(503, 'unavailable', 'تعذّر التحقق الآن — سنعيد المحاولة')
  }
}
