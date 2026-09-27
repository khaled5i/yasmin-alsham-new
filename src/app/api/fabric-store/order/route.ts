import { NextRequest } from 'next/server'
import { errorResponse, getServerContext, jsonResponse, readOrderToken, sha256Hex, toByteaHex } from '@/lib/server/fabric-store/http'

export const dynamic = 'force-dynamic'

/**
 * آخر طلب أنشأه هذا المتصفح (من كوكي الوصول httpOnly). أقل بيانات لازمة لصفحة
 * التأكيد: لا اسم ولا هاتف ولا عنوان. رقم الطلب وحده لا يخوّل شيئاً.
 */
export async function GET(request: NextRequest) {
  const server = getServerContext(request)
  if (!server.ok) return server.response

  const token = readOrderToken(request)
  if (!token) return errorResponse(404, 'no-order', 'لا يوجد طلب في هذا المتصفح')

  const { client } = server.context
  const { data: order, error } = await client
    .from('fabric_store_orders')
    .select(`id, order_number, delivery_method, delivery_option_label, items_net_halalas, shipping_net_halalas,
      vat_halalas, total_halalas, payment_status, fulfillment_status, payment_due_at, created_at,
      fabric_store_order_items (line_number, fabric_name, fabric_code, color_name, purchase_mode,
        piece_length_cm, quantity_cm, gross_halalas)`)
    .eq('access_token_hash', toByteaHex(sha256Hex(token)))
    .gt('access_expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    console.error('fabric-store order lookup failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر تحميل الطلب الآن')
  }
  if (!order) return errorResponse(404, 'no-order', 'لا يوجد طلب في هذا المتصفح')

  const { data: holds } = await client
    .from('fabric_store_stock_reservations')
    .select('status, expires_at')
    .eq('order_id', order.id)
  const now = Date.now()
  const holdActive = (holds ?? []).length > 0 &&
    (holds ?? []).every(hold => hold.status === 'active' && Date.parse(hold.expires_at) > now)

  const items = [...(order.fabric_store_order_items ?? [])].sort((a, b) => a.line_number - b.line_number)
  return jsonResponse({
    ok: true,
    order: {
      orderNumber: order.order_number,
      createdAt: order.created_at,
      deliveryMethod: order.delivery_method,
      deliveryLabel: order.delivery_option_label,
      itemsNetHalalas: Number(order.items_net_halalas),
      shippingNetHalalas: Number(order.shipping_net_halalas),
      vatHalalas: Number(order.vat_halalas),
      totalHalalas: Number(order.total_halalas),
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      holdExpiresAt: order.payment_due_at,
      holdActive,
      items: items.map(item => ({
        name: item.fabric_name,
        code: item.fabric_code,
        color: item.color_name,
        purchaseMode: item.purchase_mode,
        pieceLengthCm: item.piece_length_cm,
        quantityCm: item.quantity_cm,
        grossHalalas: Number(item.gross_halalas),
      })),
    },
  })
}
