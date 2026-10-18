import { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/lib/server/fabric-store/http'
import { requireFabricStoreStaff } from '@/lib/server/fabric-store/staff-auth'

export const dynamic = 'force-dynamic'

/**
 * أحدث الطلبات المدفوعة بعد وقت معيّن — للنافذة المنبثقة «طلب جديد» في اللوحة (استطلاع خفيف).
 * GET ?since=ISO ⇒ حتى 5 طلبات مدفوعة بعده، الأحدث أولاً، و`now` وقت الخادم للاستطلاع التالي.
 */
export async function GET(request: NextRequest) {
  const auth = await requireFabricStoreStaff(request)
  if (!auth.ok) return auth.response
  const { client } = auth.staff

  const sinceParam = request.nextUrl.searchParams.get('since') ?? ''
  const since = Date.parse(sinceParam)
  if (!Number.isFinite(since)) return errorResponse(400, 'bad-request', 'وقت غير صالح')
  // لا أقدم من يوم: لا يغرق الجهاز بطلبات قديمة بعد غياب طويل
  const from = new Date(Math.max(since, Date.now() - 24 * 3600_000)).toISOString()

  const { data, error } = await client
    .from('fabric_store_orders')
    .select('id, order_number, customer_name, total_halalas, delivery_method, paid_at')
    .in('payment_status', ['paid', 'partially_refunded'])
    .is('deleted_at', null)
    .gt('paid_at', from)
    .order('paid_at', { ascending: false })
    .limit(5)
  if (error) {
    console.error('fabric-store latest orders failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر تحميل الطلبات')
  }

  return jsonResponse({
    ok: true,
    now: new Date().toISOString(),
    orders: (data ?? []).map(o => ({
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      totalHalalas: Number(o.total_halalas),
      deliveryMethod: o.delivery_method,
      paidAt: o.paid_at,
    })),
  })
}
