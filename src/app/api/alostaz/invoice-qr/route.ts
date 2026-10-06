import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireActiveStaff } from '@/lib/server/api-auth'
import { getInvoiceZatcaSnapshot } from '@/lib/services/alostaz-service'
import {
  ALOSTAZ_BRANCH_ID,
  ALOSTAZ_FABRICS_BRANCH_ID,
  ALOSTAZ_WOMEN_WORKSHOP_BRANCH_ID,
} from '@/lib/alostaz-config'

/**
 * بيانات طباعة نسخة فاتورة الأستاذ: الرقم والإجماليات ورمز QR الموقّع.
 *
 * لا يقبل معرّف فاتورة أستاذ مباشرة؛ يأخذ مرجع سجل في الموقع (مبيعة/طلب/عملية)
 * ويقرأ معرّف الفاتورة المحفوظ عليه، فلا يمكن استعماله لاستعراض فواتير أخرى.
 * قراءة فقط من الأستاذ — لا يُنشئ ولا يعدّل أي فاتورة.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type InvoiceSource =
  | 'income'
  | 'order_deposit'
  | 'order_delivery'
  | 'order_measurement'
  | 'women_workshop'

const ORDER_INVOICE_COLUMNS = {
  order_deposit: { id: 'alostaz_deposit_invoice_id', branchId: ALOSTAZ_BRANCH_ID },
  order_delivery: { id: 'alostaz_invoice_id', branchId: ALOSTAZ_BRANCH_ID },
  order_measurement: {
    id: 'alostaz_measurement_invoice_id',
    branchId: ALOSTAZ_WOMEN_WORKSHOP_BRANCH_ID,
  },
} as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// الأستاذ يوقّع الفاتورة لحظة إصدارها عادةً؛ مهلة قصيرة تغطي أي تأخر نادر.
const QR_RETRY_DELAYS_MS = [0, 800, 1600]

async function resolveInvoice(
  source: InvoiceSource,
  id: string
): Promise<{ invoiceId: number; branchId: number } | null> {
  if (source === 'income') {
    const { data } = await supabaseAdmin
      .from('income')
      .select('branch, alostaz_invoice_id')
      .eq('id', id)
      .maybeSingle()
    const invoiceId = Number(data?.alostaz_invoice_id)
    if (!data || !(invoiceId > 0)) return null
    if (data.branch === 'fabrics') return { invoiceId, branchId: ALOSTAZ_FABRICS_BRANCH_ID }
    if (data.branch === 'tailoring') return { invoiceId, branchId: ALOSTAZ_BRANCH_ID }
    return null
  }

  if (source === 'women_workshop') {
    const { data } = await supabaseAdmin
      .from('women_workshop_transactions')
      .select('alostaz_invoice_id')
      .eq('id', id)
      .maybeSingle()
    const invoiceId = Number(data?.alostaz_invoice_id)
    return invoiceId > 0
      ? { invoiceId, branchId: ALOSTAZ_WOMEN_WORKSHOP_BRANCH_ID }
      : null
  }

  const column = ORDER_INVOICE_COLUMNS[source]
  const { data } = await supabaseAdmin
    .from('orders')
    .select(column.id)
    .eq('id', id)
    .maybeSingle()
  const invoiceId = Number((data as Record<string, unknown> | null)?.[column.id])
  return invoiceId > 0 ? { invoiceId, branchId: column.branchId } : null
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth.response

  try {
    const payload = await request.json().catch(() => null)
    const source = String(payload?.source || '') as InvoiceSource
    const id = String(payload?.id || '').trim()

    if (
      source !== 'income' &&
      source !== 'women_workshop' &&
      !(source in ORDER_INVOICE_COLUMNS)
    ) {
      return NextResponse.json({ error: 'مصدر الفاتورة غير صالح' }, { status: 400 })
    }
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'معرّف السجل غير صالح' }, { status: 400 })
    }

    const target = await resolveInvoice(source, id)
    if (!target) {
      return NextResponse.json(
        { error: 'لا توجد فاتورة أستاذ محفوظة لهذا السجل' },
        { status: 404 }
      )
    }

    let snapshot = null
    for (const delay of QR_RETRY_DELAYS_MS) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      snapshot = await getInvoiceZatcaSnapshot(target.invoiceId, target.branchId)
      if (snapshot.qr) break
    }

    return NextResponse.json({ data: snapshot, error: null })
  } catch (error: unknown) {
    console.error('invoice-qr error:', error)
    const message = error instanceof Error ? error.message : 'تعذّر قراءة الفاتورة من الأستاذ'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
