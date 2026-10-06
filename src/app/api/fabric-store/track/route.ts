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
import { normalizeSaudiMobile, toLatinDigits } from '@/lib/fabric-store/checkout-contract'
import { isOrdersServerEnabled } from '@/lib/server/fabric-store/staff-auth'

export const dynamic = 'force-dynamic'

/**
 * تتبّع الزبونة لطلبها (المرحلة 7). من كوكي المتصفح الذي أنشأ الطلب، أو من رابط واتساب
 * `/fabrics/order/#n=<رقم>&k=<رمز تتبّع>` (الدفعة D) تمرّره الصفحة في ترويستين — لا في عنوان المسار.
 * (تصحيح المراجعة R-CD-02: رمز الوصول لم يعد يُقبل في ترويسة — كان رابط `?t=` القديم يحمله،
 * والرمز نفسه يخوّل «ادفعي». المتجر لم يُطلق، فلا روابط قديمة لدى زبونات.)
 *
 * أو (POST) بالبحث برقم الطلب أو رقم الجوال — مثل تتبّع طلبات التفصيل (/track-order).
 *
 * أقل بيانات لازمة (الخطة): لا هاتف، ولا عنوان تفصيلي (المدينة فقط)، ولا ملاحظات الموظفين.
 * مستقل عن مفتاح الدفع: طلب مدفوع يبقى قابلاً للتتبّع ولو أُوقف الدفع الجديد.
 */
const ORDER_COLUMNS = `id, order_number, created_at, paid_at, delivery_method, delivery_option_label, items_net_halalas,
  shipping_net_halalas, shipping_vat_halalas, vat_halalas, total_halalas, payment_status, fulfillment_status,
  shipping_carrier, tracking_number, shipped_at, delivered_at, cancelled_at, paid_attempt_id,
  fabric_store_order_items (line_number, fabric_name, fabric_code, color_name, purchase_mode, piece_length_cm,
    quantity_cm, gross_halalas)`

/** أقصى عدد طلبات يُعاد عند البحث برقم الجوال (الأحدث أولاً). */
const MAX_PHONE_RESULTS = 5

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any

/** يبني عرض الزبونة للطلب: المدينة فقط من العنوان، وسجل الحالات. */
async function buildOrderView(client: SupabaseClient, order: OrderRow) {
  const [{ data: city }, { data: events }, { data: paidAttempt }] = await Promise.all([
    order.delivery_method === 'shipping'
      ? client.from('fabric_store_order_addresses').select('city').eq('order_id', order.id).maybeSingle()
      : Promise.resolve({ data: null }),
    client.from('fabric_store_order_events')
      .select('event_type, to_value, created_at')
      .eq('order_id', order.id)
      .in('event_type', ['payment_status', 'fulfillment_status'])
      .order('id'),
    // الدفعة C (AUD-06): بيئة الدفعة المعتمدة — لافتة «دفعة تجريبية» للزبونة
    order.paid_attempt_id
      ? client.from('fabric_store_payment_attempts').select('environment').eq('id', order.paid_attempt_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const items = [...(order.fabric_store_order_items ?? [])].sort(
    (a: { line_number: number }, b: { line_number: number }) => a.line_number - b.line_number
  )
  return {
    orderNumber: order.order_number,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    deliveryMethod: order.delivery_method,
    deliveryLabel: order.delivery_option_label,
    city: (city as { city?: string } | null)?.city ?? null,
    itemsNetHalalas: Number(order.items_net_halalas),
    shippingHalalas: Number(order.shipping_net_halalas) + Number(order.shipping_vat_halalas),
    vatHalalas: Number(order.vat_halalas),
    totalHalalas: Number(order.total_halalas),
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    carrier: order.shipping_carrier,
    trackingNumber: order.tracking_number,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at,
    cancelledAt: order.cancelled_at,
    isTest: (paidAttempt as { environment?: string } | null)?.environment === 'test',
    items: items.map((item: OrderRow) => ({
      name: item.fabric_name,
      code: item.fabric_code,
      color: item.color_name,
      purchaseMode: item.purchase_mode,
      pieceLengthCm: item.piece_length_cm,
      quantityCm: item.quantity_cm,
      grossHalalas: Number(item.gross_halalas),
    })),
    timeline: (events ?? []).map(e => ({ status: e.to_value, at: e.created_at })),
  }
}

export async function GET(request: NextRequest) {
  if (!isOrdersServerEnabled()) return errorResponse(404, 'not-found', 'غير موجود')
  const client = getFabricStoreServiceClient()
  if (!client) return errorResponse(503, 'not-configured', 'غير متاح حالياً')

  // الدفعة D (AUD-07): رابط التتبّع الجديد — رقم الطلب + رمز تتبّع للقراءة فقط (بعد # في الرابط،
  // فيصل هنا في ترويسة لا في العنوان). لا يخوّل أي فعل غير القراءة.
  const trackToken = (request.headers.get('x-track-token') ?? '').trim().toLowerCase()
  const trackNumber = (request.headers.get('x-order-number') ?? '').trim().toUpperCase()
  if (trackToken || trackNumber) {
    const secret = getFabricStoreAccessSecret()
    if (!secret || !/^FS-\d{6,8}$/.test(trackNumber) || !/^[0-9a-f]{64}$/.test(trackToken)) {
      return errorResponse(404, 'no-order', 'لم نجد الطلب أو انتهت صلاحية الرابط')
    }
    const { data: tracked, error: trackError } = await client
      .from('fabric_store_orders')
      .select(`checkout_key, ${ORDER_COLUMNS}`)
      .eq('order_number', trackNumber)
      .gt('access_expires_at', new Date().toISOString())
      .maybeSingle()
    if (trackError) {
      console.error('fabric-store track failed:', trackError.message)
      return errorResponse(503, 'unavailable', 'تعذّر تحميل الطلب الآن')
    }
    if (!tracked || !trackTokenMatches(secret, String((tracked as OrderRow).checkout_key), trackToken)) {
      return errorResponse(404, 'no-order', 'لم نجد الطلب أو انتهت صلاحية الرابط')
    }
    return jsonResponse({ ok: true, order: await buildOrderView(client, tracked) })
  }

  // كوكي المتصفح الذي أنشأ الطلب وحده (لا ترويسة برمز الوصول — R-CD-02).
  const token = readOrderToken(request)
  // لا رمز ⇒ ليست مشكلة: الصفحة تعرض نموذج البحث برقم الطلب أو الجوال.
  if (!token) return errorResponse(404, 'no-token', 'ابحثي برقم الطلب أو رقم الجوال')

  const { data: order, error } = await client
    .from('fabric_store_orders')
    .select(ORDER_COLUMNS)
    .eq('access_token_hash', toByteaHex(sha256Hex(token)))
    .gt('access_expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) {
    console.error('fabric-store track failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر تحميل الطلب الآن')
  }
  if (!order) return errorResponse(404, 'no-order', 'لم نجد الطلب أو انتهت صلاحية الرابط')

  return jsonResponse({ ok: true, order: await buildOrderView(client, order) })
}

/** البحث: `{ query }` رقم طلب (FS-100123 أو 100123) أو جوال سعودي بأي صيغة شائعة. */
export async function POST(request: NextRequest) {
  if (!isOrdersServerEnabled()) return errorResponse(404, 'not-found', 'غير موجود')
  const client = getFabricStoreServiceClient()
  if (!client) return errorResponse(503, 'not-configured', 'غير متاح حالياً')

  const input = await readSameOriginJson(request)
  if (!input.ok) return input.response
  const raw = (input.body as { query?: unknown } | null)?.query
  const query = typeof raw === 'string' ? toLatinDigits(raw).trim().slice(0, 40) : ''

  const orderMatch = /^(?:FS)?[-\s]?(\d{6,8})$/i.exec(query.replace(/\s+/g, ''))
  const phone = orderMatch ? null : normalizeSaudiMobile(query)
  if (!orderMatch && !phone) {
    return errorResponse(400, 'bad-query', 'اكتبي رقم الطلب مثل FS-100123، أو رقم الجوال مثل 05xxxxxxxx')
  }

  const base = client.from('fabric_store_orders').select(ORDER_COLUMNS)
  const { data: rows, error } = orderMatch
    ? await base.eq('order_number', `FS-${orderMatch[1]}`).limit(1)
    : await base.eq('customer_phone', phone as string).order('created_at', { ascending: false }).limit(MAX_PHONE_RESULTS)
  if (error) {
    console.error('fabric-store track search failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر البحث الآن — أعيدي المحاولة بعد قليل')
  }
  if (!rows || rows.length === 0) {
    return errorResponse(404, 'no-order', orderMatch
      ? 'لا يوجد طلب أقمشة بهذا الرقم — تأكدي من رقم الطلب'
      : 'لا توجد طلبات أقمشة مسجّلة بهذا الرقم — تأكدي من رقم الجوال')
  }

  const orders = await Promise.all(rows.map(row => buildOrderView(client, row)))
  return jsonResponse({ ok: true, orders })
}
