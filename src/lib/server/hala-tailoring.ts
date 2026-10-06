import { computePaymentBreakdown, type OrderPaymentInput } from '@/lib/payment-breakdown'
import { halaCustomerName, toHalalas, validDate, type SiteEntry } from '@/lib/hala-reconciliation'

export type TailoringOrder = OrderPaymentInput & {
  id: string; order_number: string | null; client_name: string | null; status: string | null
  order_received_date: string | null; delivery_date: string | null
  created_at: string; updated_at: string | null
  alostaz_billing_version: number | null
  alostaz_invoice_code: string | null; alostaz_deposit_invoice_code: string | null
}
export type TailoringPayment = {
  id: string; order_id: string; method: 'cash' | 'card'; amount: number | string
  occurred_at: string; alostaz_invoice_code: string | null
}

export function halaRiyadhDate(value: string): string {
  if (validDate(value)) return value
  const time = Date.parse(value)
  if (!Number.isFinite(time)) throw new Error('Invalid payment date')
  return new Date(time + 3 * 3600000).toISOString().slice(0,10)
}

/** Same payment phases as tailoring income; subtract additional payments from the deposit only once. */
export function tailoringHalaEntries(orders: TailoringOrder[], payments: TailoringPayment[], start: string, end: string) {
  const entries: SiteEntry[] = [], warnings: string[] = []
  const byOrder = new Map<string, TailoringPayment[]>()
  for (const p of payments) byOrder.set(p.order_id,[...(byOrder.get(p.order_id)??[]),p])
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    const breakdown = computePaymentBreakdown(order)
    const extra = byOrder.get(order.id)??[]
    // All dates are needed here: later payments already contribute to the aggregate deposit fields.
    const extraNetwork = extra.filter(p=>p.method==='card').reduce((n,p)=>n+toHalalas(p.amount),0)
    const add = (suffix: string, amount: number, dateValue: string, invoice: string | null, fallback = false) => {
      if (amount<=0) return
      const date = halaRiyadhDate(dateValue)
      if (date<start || date>end) return
      entries.push({id:`tailoring:${order.id}:${suffix}`,branch:'tailoring',date,amount,invoice:invoice||order.order_number,customerName:halaCustomerName(order.client_name),notes:'',settlement:false})
      if (fallback) warnings.push(`طلب التفصيل ${order.order_number||order.id}: تاريخ الدفعة مشتق من إنشاء/تحديث الطلب لغياب تاريخ المرحلة؛ يحتاج تأكيداً.`)
    }
    add('deposit',Math.max(0,toHalalas(breakdown.preDeliveryNetwork.toFixed(2))-extraNetwork),order.order_received_date||order.created_at,order.alostaz_deposit_invoice_code,!order.order_received_date)
    for (const p of extra) if (p.method==='card') add(`payment:${p.id}`,toHalalas(p.amount),p.occurred_at,p.alostaz_invoice_code)
    add('delivery',toHalalas(breakdown.remainingNetwork.toFixed(2)),order.delivery_date||order.updated_at||order.created_at,order.alostaz_invoice_code,!order.delivery_date)
  }
  return { entries, warnings }
}
