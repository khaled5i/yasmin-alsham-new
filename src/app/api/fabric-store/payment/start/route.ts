import { NextRequest } from 'next/server'
import {
  errorResponse,
  getServerContext,
  jsonResponse,
  readOrderToken,
  readSameOriginJson,
  sha256Hex,
} from '@/lib/server/fabric-store/http'
import { getPaymentDeps, isNewPaymentsEnabled } from '@/lib/server/fabric-store/payment-context'
import { startPayment } from '@/lib/server/fabric-store/payments'

export const dynamic = 'force-dynamic'

/**
 * بدء دفع طلب هذا المتصفح (كوكي الوصول): فاتورة ميسر مستضافة، ثم يحوّل المتصفح إليها.
 * المبلغ من الطلب في القاعدة، لا من المتصفح. خلف FABRIC_STORE_CHECKOUT_ENABLED
 * وFABRIC_STORE_PAYMENTS_ENABLED معاً.
 */
export async function POST(request: NextRequest) {
  const server = getServerContext(request)
  if (!server.ok) return server.response
  if (!isNewPaymentsEnabled()) return errorResponse(404, 'not-found', 'غير موجود')

  const input = await readSameOriginJson(request)
  if (!input.ok) return input.response

  const token = readOrderToken(request)
  if (!token) return errorResponse(404, 'no-order', 'لم نجد طلبك في هذا المتصفح — أعيدي إنشاء الطلب من السلة')

  const payment = getPaymentDeps()
  if (!payment.ok) return payment.response

  // Origin سبق التحقق من أنه مضيف الطلب نفسه (readSameOriginJson)، فعنوان الرجوع لا يوجَّه لموقع آخر.
  const origin = new URL(request.headers.get('origin') as string).origin
  try {
    const result = await startPayment(payment.deps, {
      accessHash: sha256Hex(token),
      clientHash: server.context.clientHash,
      origin,
    })
    if (!result.ok) return errorResponse(result.httpStatus, result.code, result.error)
    return jsonResponse({ ok: true, checkoutUrl: result.checkoutUrl, attemptId: result.attemptId })
  } catch (error) {
    // فشل القاعدة بعد إنشاء الفاتورة: المحاولة تبقى created وتُغلق عند الضغطة التالية
    // (بعد دقيقتين)، وأي دفعة عليها تُطابَق بـmetadata.
    console.error('fabric-store payment start failed:', (error as Error).message)
    return errorResponse(503, 'unavailable', 'تعذّر بدء الدفع الآن — أعيدي المحاولة بعد قليل')
  }
}
