import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireActiveStaff } from '@/lib/server/api-auth'
import { readAll } from '@/lib/server/hala-read-all'
import { halaRiyadhDate, tailoringHalaEntries, type TailoringOrder, type TailoringPayment } from '@/lib/server/hala-tailoring'
import { dateRange, halaCustomerName, parseHalaText, reconcileHala, toHalalas, type SiteEntry } from '@/lib/hala-reconciliation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const MAX_BODY = 2200000

export async function POST(request: NextRequest) {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth.response
  // Cross-branch finance is restricted to the owner/admin, including on the server.
  if (auth.staff.role !== 'admin') return reply({ error: 'مطابقة هلا متاحة للمدير فقط.' }, 403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'صيغة الطلب غير صالحة.' }, 400)
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return reply({ error: 'الملف أكبر من الحد المسموح.' }, 413)
  let body: { text?: unknown; start?: unknown; end?: unknown }
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return reply({ error: 'الملف أكبر من الحد المسموح.' }, 413)
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || typeof body.text !== 'string' || typeof body.start !== 'string' || typeof body.end !== 'string') throw new Error('حدد الملف وفترة المقارنة.')
    dateRange(body.start, body.end)
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'طلب غير صالح.' }, 400) }

  let parsed, range
  try {
    parsed = parseHalaText(body.text as string)
    range = dateRange(body.start as string, body.end as string)
    // Validate period and coverage before issuing financial database reads.
    reconcileHala(parsed, [], body.start as string, body.end as string)
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'تعذر قراءة الملف.' }, 400) }

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const [women, income, orders, payments] = await Promise.all([
      readAll<{ id: string; occurred_at: string; amount: number; customer_name: string | null; notes: string | null; alostaz_invoice_code: string | null }>(async (from, to) =>
        db.from('women_workshop_transactions').select('id,occurred_at,amount,customer_name,notes,alostaz_invoice_code').eq('transaction_kind','income').eq('payment_method','card')
          .gte('occurred_at',range.from).lt('occurred_at',range.until).order('id',{ascending:true}).range(from,to)),
      readAll<{ id: string; branch: 'fabrics' | 'tailoring'; order_id: string | null; date: string; amount: number; network_amount: number | null; payment_method: string; customer_name: string | null; buyer_name: string | null; notes: string | null; invoice_number: number | null; alostaz_invoice_code: string | null }>(async (from, to) =>
        db.from('income').select('id,branch,order_id,date,amount,network_amount,payment_method,customer_name,buyer_name,notes,invoice_number,alostaz_invoice_code').in('branch',['fabrics','tailoring'])
          .in('payment_method',['network','card','mixed']).gte('date',body.start as string).lte('date',body.end as string).order('id',{ascending:true}).range(from,to)),
      readAll<TailoringOrder>(async (from,to)=>db.from('orders')
        .select('id,order_number,client_name,status,order_received_date,delivery_date,created_at,updated_at,price,paid_amount,deposit_amount,payment_method,pre_delivery_cash_amount,pre_delivery_network_amount,remaining_payment_method,remaining_cash_amount,remaining_network_amount,alostaz_billing_version,alostaz_invoice_code,alostaz_deposit_invoice_code')
        .eq('branch','tailoring').not('status','eq','cancelled').order('id',{ascending:true}).range(from,to)),
      readAll<TailoringPayment>(async (from,to)=>db.from('order_additional_payments')
        .select('id,order_id,method,amount,occurred_at,alostaz_invoice_code').eq('branch','tailoring').eq('method','card').order('id',{ascending:true}).range(from,to)),
    ])
    const tailoring = tailoringHalaEntries(orders,payments,body.start as string,body.end as string)
    const isSettlement = (notes: string) => /RECON-[\w-]*NET\d+|تسوية مستقلة للفرق الصافي/.test(notes)
    const site: SiteEntry[] = [
      ...women.map(r => ({ id:r.id,branch:'women' as const,date:halaRiyadhDate(r.occurred_at),amount:toHalalas(r.amount),invoice:r.alostaz_invoice_code,customerName:halaCustomerName(r.customer_name),notes:r.notes??'',settlement:isSettlement(r.notes??'') })),
      // Order-linked legacy income duplicates the derived payment phases; keep manual tailoring income only.
      ...income.filter(r=>r.branch!=='tailoring'||!r.order_id).map(r => ({ id:`income:${r.id}`,branch:r.branch,date:r.date,amount:toHalalas(r.payment_method==='mixed' ? r.network_amount??0 : r.amount),invoice:r.alostaz_invoice_code??(r.invoice_number ? String(r.invoice_number):null),customerName:halaCustomerName(r.branch==='fabrics'?r.buyer_name:r.customer_name),notes:r.notes??'',settlement:isSettlement(r.notes??'') })).filter(r=>r.amount>0),
      ...tailoring.entries,
    ]
    const report = reconcileHala(parsed,site,body.start as string,body.end as string)
    report.warnings.push(...tailoring.warnings)
    return reply({ report })
  } catch (error) {
    console.error('hala-reconciliation read failed:', error instanceof Error ? error.message : 'unknown')
    return reply({ error: 'تعذر إكمال المقارنة مع سجلات الموقع. لم تُعرض نتيجة جزئية؛ أعد المحاولة أو اختر فترة أقصر.' }, 500)
  }
}
