import { NextRequest, NextResponse } from 'next/server'
import { getPaymentDeps, isAuthorizedCron, isReconcileEnabled } from '@/lib/server/fabric-store/payment-context'
import { processPendingPaymentEvents, reconcilePayments } from '@/lib/server/fabric-store/payments'
import { processFabricStoreOutbox } from '@/lib/server/fabric-store/confirm'
import { processPendingRefunds } from '@/lib/server/fabric-store/refunds'
import { getOutboxDeps, isAlostazSendEnabled } from '@/lib/server/fabric-store/outbox-context'
import { isRefundsServerEnabled } from '@/lib/server/fabric-store/staff-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * المهمة المجدولة للمتجر الإلكتروني (المرحلة 6) — شبكة الأمان لكل ما يحدث فور السداد:
 * 1. أحداث ميسر المحفوظة التي تعذّرت معالجتها (ميسر أو القاعدة لم يردا).
 * 2. الطابور: اعتماد بيع الطلبات المدفوعة، ثم فواتير الأستاذ (إن كان
 *    `FABRIC_STORE_ALOSTAZ_ENABLED=true`).
 *
 * محمي بـ`Authorization: Bearer <CRON_SECRET>` (Vercel Cron يرسله تلقائياً حين يُضبط
 * المتغير). آمن للتكرار: كل خطوة لا يتكرر أثرها. الجدولة في vercel.json.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ ok: false }, { status: 401 })

  const result: Record<string, unknown> = { ok: true }

  // 1) أحداث ميسر المعلّقة — فقط إن كان ميسر مهيّأً (قبل ذلك لا أحداث أصلاً).
  const payment = getPaymentDeps()
  if (payment.ok) {
    try {
      result.paymentEvents = await processPendingPaymentEvents(payment.deps, 20)
    } catch (error) {
      console.error('fabric-store job: payment events failed:', (error as Error).message)
      result.ok = false
      result.paymentEvents = 'failed'
    }
    // 1أ) المرحلة 9: مطابقة المحاولات مع ميسر (دفعة بلا webhook، واسترداد خارج النظام).
    if (isReconcileEnabled()) {
      try {
        result.reconcile = await reconcilePayments(payment.deps, 20)
      } catch (error) {
        console.error('fabric-store job: reconciliation failed:', (error as Error).message)
        result.ok = false
        result.reconcile = 'failed'
      }
    }
    // 1ب) المرحلة 8: استردادات معلّقة (رد ميسر ضاع أو توقف الخادم) — تُطابق ولا تتكرر.
    try {
      result.refunds = await processPendingRefunds(payment.deps, 10, isRefundsServerEnabled())
    } catch (error) {
      console.error('fabric-store job: refunds failed:', (error as Error).message)
      result.ok = false
      result.refunds = 'failed'
    }
  }

  // 2) الطابور
  const outbox = getOutboxDeps({ withAlostaz: true })
  if (!outbox) {
    return NextResponse.json({ ok: false, error: 'not-configured' }, { status: 503 })
  }
  try {
    result.outbox = await processFabricStoreOutbox(outbox, { limit: 20 })
    result.alostaz = isAlostazSendEnabled() ? 'enabled' : 'disabled'
  } catch (error) {
    console.error('fabric-store job: outbox failed:', (error as Error).message)
    result.ok = false
    result.outbox = 'failed'
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
