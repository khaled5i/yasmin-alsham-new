import { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/lib/server/fabric-store/http'
import { requireFabricStoreStaff } from '@/lib/server/fabric-store/staff-auth'

export const dynamic = 'force-dynamic'

/**
 * تنبيهات المتجر التي تحتاج تصرفاً (المرحلة 9) — للمدير ومدير متجر الأقمشة.
 * تُحسب في القاعدة لحظة الطلب (`fabric_store_staff_alerts`)، فتزول وحدها حين يُصلح سببها.
 * الدفعة D (AUD-09): خلف مفتاح الطلبات وحده (requireFabricStoreStaff) — لا مفتاح المطابقة: سداد بلا مبيعة
 * أو مهمة متوقفة أو استرداد لم يظهر لا تعتمد على المطابقة، وكانت تختفي كلها بإطفائها.
 */
export async function GET(request: NextRequest) {
  const auth = await requireFabricStoreStaff(request)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.staff.client.rpc('fabric_store_staff_alerts')
  if (error) {
    console.error('fabric-store staff alerts failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر تحميل التنبيهات')
  }
  const alerts = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  return jsonResponse({
    ok: true,
    alerts: alerts.map(a => ({
      kind: String(a.kind),
      orderId: (a.order_id as string | null) ?? null,
      orderNumber: (a.order_number as string | null) ?? null,
      since: (a.since as string | null) ?? null,
      environment: (a.environment as string | null) ?? null,
      detail: String(a.detail ?? ''),
    })),
  })
}
