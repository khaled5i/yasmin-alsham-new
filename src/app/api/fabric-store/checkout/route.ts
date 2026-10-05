import { NextRequest } from 'next/server'
import {
  FABRIC_DELIVERY_OPTIONS,
  FABRIC_STORE_MAX_ORDER_LINES,
  FABRIC_STORE_POLICY_VERSIONS,
  describeFabricCheckoutIssue,
  fabricCheckoutRequestSchema,
  type FabricCheckoutRequest,
  type FabricCheckoutSuccess,
  type FabricOrderSummary,
} from '@/lib/fabric-store/checkout-contract'
import {
  deriveAccessToken,
  errorResponse,
  getServerContext,
  jsonResponse,
  readOrderToken,
  readSameOriginJson,
  setOrderCookie,
  sha256Hex,
  toByteaHex,
} from '@/lib/server/fabric-store/http'
import { loadQuoteSnapshot, priceCart } from '@/lib/server/fabric-store/quote-service'

export const dynamic = 'force-dynamic'

/**
 * إنشاء طلب المتجر — **بلا دفع ولا حجز** (الدفعة B، AUD-02): القماش يُحجز عند «ادفعي»
 * (payment/start)، وللزبونة 30 دقيقة لتضغطه. الطلب حتى FABRIC_STORE_MAX_ORDER_LINES سطراً.
 *
 * الخادم يعيد التسعير بنفسه ولا يقبل مبلغ المتصفح إلا للمقارنة: إن اختلف عمّا
 * رأته الزبونة يُعاد عرض السعر ولا يُنشأ طلب. القاعدة تتحقق من الأرقام والسعر والمتاح
 * تحت القفل دون أن تحجز (public.fabric_store_create_checkout).
 *
 * عدم التكرار: checkoutKey من المتصفح + بصمة المدخلات. نفس المفتاح بنفس المدخلات
 * يعيد الطلب نفسه (انقطاع الشبكة، نقرتان)؛ بمدخلات أخرى يُرفض.
 */
export async function POST(request: NextRequest) {
  const server = getServerContext(request)
  if (!server.ok) return server.response
  const input = await readSameOriginJson(request)
  if (!input.ok) return input.response

  const parsed = fabricCheckoutRequestSchema.safeParse(input.body)
  if (!parsed.success) return errorResponse(400, 'bad-request', describeFabricCheckoutIssue(parsed.error.issues))
  const checkout = parsed.data
  // القاعدة تفرضه أيضاً (FABRIC_STORE_TOO_MANY_LINES)؛ هنا قبل إعادة التسعير وبرسالة واضحة.
  if (checkout.lines.length > FABRIC_STORE_MAX_ORDER_LINES) {
    return errorResponse(400, 'too-many-lines',
      `الطلب الإلكتروني يصل إلى ${FABRIC_STORE_MAX_ORDER_LINES} أقمشة؛ للكميات الأكبر تواصلي مع المحل`)
  }

  const { client, secret, clientHash } = server.context
  const token = deriveAccessToken(secret, checkout.checkoutKey)
  const accessHash = sha256Hex(token)
  const fingerprint = sha256Hex(canonicalCheckout(checkout))

  // إعادة إرسال طلب أُنشئ فعلاً: تُحسم قبل إعادة التسعير، لأن حجز الطلب نفسه
  // صار يُنقص المتاح فيبدو أن الكمية لم تعد متوفرة.
  const { data: existing, error: existingError } = await client
    .from('fabric_store_orders')
    .select('order_number, total_halalas, payment_due_at, payment_status, fulfillment_status, request_fingerprint, access_token_hash')
    .eq('checkout_key', checkout.checkoutKey)
    .maybeSingle()
  if (existingError) {
    console.error('fabric-store checkout lookup failed:', existingError.message)
    return errorResponse(503, 'unavailable', 'تعذّر إنشاء الطلب الآن، أعيدي المحاولة')
  }
  if (existing) {
    if (existing.request_fingerprint !== toByteaHex(fingerprint) || existing.access_token_hash !== toByteaHex(accessHash)) {
      return errorResponse(409, 'checkout-key-reused', 'تغيّرت بيانات الطلب؛ أعيدي الإرسال')
    }
    return success(token, true, {
      orderNumber: existing.order_number,
      totalHalalas: Number(existing.total_halalas),
      holdExpiresAt: existing.payment_due_at,
      paymentStatus: existing.payment_status,
      fulfillmentStatus: existing.fulfillment_status,
    })
  }

  const snapshot = await loadQuoteSnapshot(client, checkout.lines.map(line => line.fabricId), clientHash)
  if (snapshot.status === 'rate_limited') {
    return errorResponse(429, 'rate-limited', 'طلبات كثيرة خلال وقت قصير — انتظري دقائق ثم أعيدي المحاولة')
  }
  if (snapshot.status !== 'ok') return errorResponse(503, 'unavailable', 'تعذّر إنشاء الطلب الآن، أعيدي المحاولة')

  const priced = priceCart(snapshot.rows, checkout.lines, checkout.deliveryMethod)
  if (!priced.order || !priced.quote.canCheckout) {
    return jsonResponse({
      ok: false,
      code: priced.quote.overOrderCap ? 'over-order-cap' : 'cart-changed',
      error: priced.quote.overOrderCap
        ? 'مبلغ الطلب أكبر من الحد المسموح للطلب الإلكتروني الواحد — تواصلي معنا'
        : 'تغيّر توفر بعض الأقمشة أو أسعارها؛ راجعي الملخّص',
      quote: priced.quote,
    }, 409)
  }
  if (priced.order.totalHalalas !== checkout.expectedTotalHalalas) {
    return jsonResponse({
      ok: false,
      code: 'total-changed',
      error: 'تغيّر إجمالي الطلب منذ فتحتِ الصفحة؛ راجعي الملخّص الجديد ثم أكّدي',
      quote: priced.quote,
    }, 409)
  }

  // طلب سابق من هذا المتصفح لم يُدفع: تستبدله القاعدة (تلغيه وتحرر حجزه) في المعاملة نفسها.
  const previousToken = readOrderToken(request)
  const delivery = FABRIC_DELIVERY_OPTIONS[checkout.deliveryMethod]
  const address = checkout.address

  const { data, error } = await client.rpc('fabric_store_create_checkout', {
    p_request: {
      checkout_key: checkout.checkoutKey,
      request_fingerprint: fingerprint,
      access_token_hash: accessHash,
      client_hash: clientHash,
      supersede_access_hash: previousToken && previousToken !== token ? sha256Hex(previousToken) : null,
      customer: { name: checkout.customer.name, phone: checkout.customer.phone, email: checkout.customer.email },
      delivery: {
        method: delivery.method,
        option_code: delivery.code,
        option_label: delivery.label,
        shipping_net_halalas: priced.order.shippingNetHalalas,
        shipping_vat_halalas: priced.order.shippingVatHalalas,
      },
      address: address
        ? {
            recipient_name: address.recipientName,
            recipient_phone: address.recipientPhone,
            city: address.city,
            district: address.district,
            street: address.street,
            building_number: address.buildingNumber,
            postal_code: address.postalCode,
            additional_number: address.additionalNumber,
            short_address: address.shortAddress,
            notes: address.notes,
          }
        : null,
      totals: {
        items_net_halalas: priced.order.itemsNetHalalas,
        vat_halalas: priced.order.vatHalalas,
        total_halalas: priced.order.totalHalalas,
      },
      policies: FABRIC_STORE_POLICY_VERSIONS,
      marketing_opt_in: checkout.marketingOptIn,
      items: priced.order.items,
    },
  })

  if (error) {
    // 55P03: مبيعة في المحل تمسك القماش نفسه الآن؛ الطلب الإلكتروني يتراجع ولا يؤخرها.
    if (error.code === '55P03') {
      return errorResponse(503, 'busy', 'القماش قيد البيع في المحل هذه اللحظة — أعيدي المحاولة بعد ثوانٍ')
    }
    console.error('fabric-store checkout failed:', error.code, error.message)
    return errorResponse(503, 'unavailable', 'تعذّر إنشاء الطلب الآن، أعيدي المحاولة')
  }

  const result = (data || {}) as {
    status?: string; code?: string; message?: string; order_number?: string; total_halalas?: number
    hold_expires_at?: string; payment_status?: string; fulfillment_status?: string
  }
  switch (result.status) {
    case 'created':
    case 'existing':
      return success(token, result.status === 'existing', {
        orderNumber: result.order_number as string,
        totalHalalas: Number(result.total_halalas),
        holdExpiresAt: result.hold_expires_at as string,
        paymentStatus: result.payment_status as string,
        fulfillmentStatus: result.fulfillment_status as string,
      })
    case 'key_reused':
      return errorResponse(409, 'checkout-key-reused', 'تغيّرت بيانات الطلب؛ أعيدي الإرسال')
    case 'rate_limited':
      return errorResponse(429, 'rate-limited', 'طلبات كثيرة خلال وقت قصير — انتظري دقائق ثم أعيدي المحاولة')
    case 'phone_limit':
      return errorResponse(429, 'phone-limit', 'لهذا الرقم طلبات قيد الدفع بالفعل — أكمليها أو انتظري انتهاء حجزها')
    case 'store_busy':
      return errorResponse(503, 'store-busy', 'الطلبات الإلكترونية كثيرة الآن — أعيدي المحاولة بعد دقائق')
    case 'rejected': {
      // رسائل القاعدة عربية ومكتوبة للزبونة (أعيدي مراجعة السلة…). نعيد عرض السعر معها.
      const fresh = await loadQuoteSnapshot(client, checkout.lines.map(line => line.fabricId), clientHash)
      return jsonResponse({
        ok: false,
        code: result.code || 'rejected',
        error: result.message || 'تعذّر إنشاء الطلب؛ راجعي السلة',
        quote: fresh.status === 'ok' ? priceCart(fresh.rows, checkout.lines, checkout.deliveryMethod).quote : undefined,
      }, 409)
    }
    default:
      console.error('fabric-store checkout: unexpected result', result.status)
      return errorResponse(400, 'bad-request', 'طلب غير صالح')
  }
}

function success(token: string, replayed: boolean, order: FabricOrderSummary) {
  const body: FabricCheckoutSuccess = { ok: true, replayed, order }
  const response = jsonResponse(body)
  setOrderCookie(response, token)
  return response
}

/** كل ما يحدد الطلب بترتيب ثابت. تغيّر أي حقل ⇒ بصمة أخرى ⇒ المفتاح نفسه يُرفض. */
function canonicalCheckout(checkout: FabricCheckoutRequest): string {
  const address = checkout.address
  return JSON.stringify([
    'fabric-store-checkout-v1',
    checkout.lines.map(line => [line.fabricId, line.purchaseMode, line.quantity]),
    checkout.deliveryMethod,
    [checkout.customer.name, checkout.customer.phone, checkout.customer.email],
    address
      ? [address.recipientName, address.recipientPhone, address.city, address.district, address.street,
         address.buildingNumber, address.postalCode, address.additionalNumber, address.shortAddress, address.notes]
      : null,
    checkout.marketingOptIn,
    checkout.expectedTotalHalalas,
  ])
}
