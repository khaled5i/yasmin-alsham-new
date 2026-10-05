import { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/lib/server/fabric-store/http'
import { requireFabricStoreStaff } from '@/lib/server/fabric-store/staff-auth'

export const dynamic = 'force-dynamic'

/**
 * قائمة طلبات المتجر للوحة (المرحلة 7) — للمدير ومدير متجر الأقمشة.
 * العرض: active (مدفوعة ولم تنتهِ) · review (عليها علامة مراجعة) · unpaid · done · all.
 * البحث: رقم الطلب أو الهاتف أو الاسم.
 */
const VIEWS = ['active', 'review', 'unpaid', 'done', 'all'] as const
type View = (typeof VIEWS)[number]

export async function GET(request: NextRequest) {
  const auth = await requireFabricStoreStaff(request)
  if (!auth.ok) return auth.response
  const { client } = auth.staff

  const view = (request.nextUrl.searchParams.get('view') ?? 'active') as View
  if (!VIEWS.includes(view)) return errorResponse(400, 'bad-request', 'عرض غير معروف')
  // حروف وأرقام ومسافات وشرطة و+ فقط: يمنع كسر صيغة فلتر PostgREST (الفواصل والأقواس).
  const q = (request.nextUrl.searchParams.get('q') ?? '').replace(/[^\p{L}\p{N}\s+\-]/gu, '').trim().slice(0, 40)

  let query = client
    .from('fabric_store_orders')
    .select(`id, order_number, created_at, paid_at, customer_name, customer_phone, delivery_method, total_halalas,
      payment_status, fulfillment_status, needs_review, income_id, tracking_number,
      paid_attempt:fabric_store_payment_attempts!fabric_store_orders_paid_attempt_id_fkey (environment)`)
    .order('created_at', { ascending: false })
    .limit(200)

  let doneFilter: string | null = null
  let searchFilter: string | null = null
  if (view === 'active') {
    query = query.in('payment_status', ['paid', 'partially_refunded']).not('fulfillment_status', 'in', '(delivered,cancelled)')
  } else if (view === 'review') {
    query = query.eq('needs_review', true)
  } else if (view === 'unpaid') {
    query = query.in('payment_status', ['pending', 'authorized', 'failed']).neq('fulfillment_status', 'cancelled')
  } else if (view === 'done') {
    // المرحلة 8: المسترد كاملاً بعد القص (لا يُسلَّم) منتهٍ أيضاً، وإلا اختفى إلا من «الكل».
    doneFilter = 'fulfillment_status.in.(delivered,cancelled),payment_status.eq.refunded'
  }
  if (q) {
    const digits = q.replace(/\D/g, '')
    // القيمة بين علامتي تنصيص: الاسم قد يحوي مسافة (والتنصيص نفسه محذوف من q أعلاه).
    const parts = [`order_number.ilike."*${q}*"`, `customer_name.ilike."*${q}*"`]
    if (digits.length >= 4) parts.push(`customer_phone.like.*${digits.replace(/^0+/, '')}*`)
    searchFilter = parts.join(',')
  }
  // عند اجتماعهما: شرط `or` واحد بصيغة and(or(..),or(..)) — لا نعتمد على دمج معاملَي or.
  if (doneFilter && searchFilter) query = query.or(`and(or(${doneFilter}),or(${searchFilter}))`)
  else if (doneFilter || searchFilter) query = query.or((doneFilter || searchFilter)!)

  const { data, error } = await query
  if (error) {
    console.error('fabric-store staff list failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر تحميل الطلبات')
  }

  // عدّاد الشارات (يُحسب دائماً، مهما كان العرض)
  const [{ count: reviewCount }, { count: activeCount }] = await Promise.all([
    client.from('fabric_store_orders').select('id', { count: 'exact', head: true }).eq('needs_review', true),
    client.from('fabric_store_orders').select('id', { count: 'exact', head: true })
      .in('payment_status', ['paid', 'partially_refunded']).not('fulfillment_status', 'in', '(delivered,cancelled)'),
  ])

  return jsonResponse({
    ok: true,
    counts: { review: reviewCount ?? 0, active: activeCount ?? 0 },
    orders: (data ?? []).map(order => {
      const attempt = Array.isArray(order.paid_attempt) ? order.paid_attempt[0] : order.paid_attempt
      return {
        id: order.id,
        orderNumber: order.order_number,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryMethod: order.delivery_method,
        totalHalalas: Number(order.total_halalas),
        paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status,
        needsReview: order.needs_review,
        saleRecorded: order.income_id != null,
        trackingNumber: order.tracking_number,
        isTest: attempt?.environment === 'test',
      }
    }),
  })
}
