import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const EXPENSE_CONFIG = {
  salaries: 'رواتب',
  workshop_supplies: 'مستلزمات للمشغل',
  other: 'مصروفات أخرى',
} as const

type ExpenseCategory = keyof typeof EXPENSE_CONFIG
type PaymentMethod = 'cash' | 'card'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرّح - لا يوجد توكن صالح' }, { status: 401 })
    }

    const token = authHeader.slice('Bearer '.length)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'غير مصرّح - توكن غير صالح' }, { status: 401 })
    }

    const { data: userData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (roleError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مسموح - للمدير فقط' }, { status: 403 })
    }

    const payload = await request.json()
    const transactionId = String(payload?.transactionId || '').trim()
    const expenseCategory = String(payload?.expenseCategory || '') as ExpenseCategory
    const paymentMethod = String(payload?.paymentMethod || '') as PaymentMethod
    const amount = Math.round((Number(payload?.amount) + Number.EPSILON) * 100) / 100

    if (!UUID_PATTERN.test(transactionId)) {
      return NextResponse.json({ error: 'معرّف العملية غير صالح' }, { status: 400 })
    }
    if (!(expenseCategory in EXPENSE_CONFIG)) {
      return NextResponse.json({ error: 'نوع المصروف غير صالح' }, { status: 400 })
    }
    if (!['cash', 'card'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const { data: transaction, error: insertError } = await supabaseAdmin
      .from('women_workshop_transactions')
      .insert({
        id: transactionId,
        source: 'manual_expense',
        transaction_kind: 'expense',
        expense_category: expenseCategory,
        operation_type: 'other',
        operation_name: EXPENSE_CONFIG[expenseCategory],
        amount,
        payment_method: paymentMethod,
        created_by: user.id,
        occurred_at: nowIso,
        alostaz_sync_status: 'not_required',
      })
      .select('*')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('women_workshop_transactions')
          .select('*')
          .eq('id', transactionId)
          .eq('source', 'manual_expense')
          .maybeSingle()

        if (existing) {
          return NextResponse.json({ data: existing, duplicate: true })
        }
      }

      return NextResponse.json(
        { error: `تعذّر حفظ المصروف داخل الموقع: ${insertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: transaction })
  } catch (error: unknown) {
    console.error('women-workshop expense error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
