import { NextRequest, NextResponse } from 'next/server'
import { getPaymentDeps, isAuthorizedCron } from '@/lib/server/fabric-store/payment-context'
import { processPendingPaymentEvents } from '@/lib/server/fabric-store/payments'

export const dynamic = 'force-dynamic'

/**
 * إعادة معالجة أحداث ميسر المحفوظة التي تعذّرت معالجتها (ميسر أو القاعدة لم يردا).
 * محمي بـ`Authorization: Bearer <CRON_SECRET>`. المجدول هو `/api/fabric-store/jobs/run/`
 * (المرحلة 6) ويشمل هذه الخطوة؛ هذا المسار للتشغيل اليدوي. آمن للتكرار.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ ok: false }, { status: 401 })
  const payment = getPaymentDeps()
  if (!payment.ok) return payment.response
  try {
    const outcomes = await processPendingPaymentEvents(payment.deps, 20)
    return NextResponse.json({ ok: true, outcomes }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('fabric-store payment events job failed:', (error as Error).message)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
