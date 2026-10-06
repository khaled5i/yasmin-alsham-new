import { NextRequest, NextResponse } from 'next/server'
import { getPaymentDeps, isAuthorizedCron, isReconcileEnabled } from '@/lib/server/fabric-store/payment-context'
import { processPendingPaymentEvents, reconcilePayments } from '@/lib/server/fabric-store/payments'
import { processFabricStoreOutbox } from '@/lib/server/fabric-store/confirm'
import { processPendingRefunds } from '@/lib/server/fabric-store/refunds'
import { getOutboxDeps, isAlostazSendEnabled } from '@/lib/server/fabric-store/outbox-context'
import { isOrdersServerEnabled, isRefundsServerEnabled } from '@/lib/server/fabric-store/staff-auth'
import { getFabricStoreServiceClient } from '@/lib/server/fabric-store/http'

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
 *
 * الدفعة D (AUD-13): ميزانية زمنية — لا تبدأ خطوة بعد 40 ثانية (المهلة 60)، فالباقي للتشغيل
 * التالي بعد 5 دقائق بدل أن يُقتل التشغيل في منتصف خطوة. (الدفع والاسترداد آمنان للقطع أصلاً؛
 * إرسال الأستاذ المقطوع يتحول بعد 10 دقائق إلى «مراجعة» — alostaz-fabric-invoice.ts.)
 * والدفعة D (AUD-10): محو عناوين الشحن بعد 90 يوماً من انتهاء الطلب.
 */
const STEP_BUDGET_MS = 40_000
// (R-CD-05) والحلقات نفسها لا تبدأ عنصراً بعد 45 ث (هامش لعنصر جارٍ قبل 60 ث)
const ITEM_DEADLINE_MS = 45_000
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ ok: false }, { status: 401 })

  const result: Record<string, unknown> = { ok: true }
  const startedAt = Date.now()
  const deadline = startedAt + ITEM_DEADLINE_MS
  const skipped: string[] = []
  const hasTime = (step: string) => {
    if (Date.now() - startedAt < STEP_BUDGET_MS) return true
    skipped.push(step)
    return false
  }

  // 1) أحداث ميسر المعلّقة — فقط إن كان ميسر مهيّأً (قبل ذلك لا أحداث أصلاً).
  const payment = getPaymentDeps()
  if (payment.ok && hasTime('paymentEvents')) {
    try {
      result.paymentEvents = await processPendingPaymentEvents(payment.deps, 20, deadline)
    } catch (error) {
      console.error('fabric-store job: payment events failed:', (error as Error).message)
      result.ok = false
      result.paymentEvents = 'failed'
    }
    // 1أ) المرحلة 9: مطابقة المحاولات مع ميسر (دفعة بلا webhook، واسترداد خارج النظام).
    if (isReconcileEnabled() && hasTime('reconcile')) {
      try {
        result.reconcile = await reconcilePayments(payment.deps, 20, deadline)
      } catch (error) {
        console.error('fabric-store job: reconciliation failed:', (error as Error).message)
        result.ok = false
        result.reconcile = 'failed'
      }
    }
    // 1ب) المرحلة 8: استردادات معلّقة (رد ميسر ضاع أو توقف الخادم) — تُطابق ولا تتكرر.
    if (hasTime('refunds')) {
      try {
        result.refunds = await processPendingRefunds(payment.deps, 10, isRefundsServerEnabled(), deadline)
      } catch (error) {
        console.error('fabric-store job: refunds failed:', (error as Error).message)
        result.ok = false
        result.refunds = 'failed'
      }
    }
  }

  // 2) الطابور
  const outbox = getOutboxDeps({ withAlostaz: true })
  if (!outbox) {
    return NextResponse.json({ ok: false, error: 'not-configured' }, { status: 503 })
  }
  if (hasTime('outbox')) {
    try {
      result.outbox = await processFabricStoreOutbox(outbox, { limit: 20, deadline })
      result.alostaz = isAlostazSendEnabled() ? 'enabled' : 'disabled'
    } catch (error) {
      console.error('fabric-store job: outbox failed:', (error as Error).message)
      result.ok = false
      result.outbox = 'failed'
    }
  }

  // 3) الدفعة D (AUD-10): محو عناوين الشحن المنتهية (90 يوماً، قرار المالكة) — بمفتاح الطلبات.
  const client = getFabricStoreServiceClient()
  if (client && isOrdersServerEnabled() && hasTime('addresses')) {
    const { data, error } = await client.rpc('fabric_store_purge_addresses', { p_limit: 50 })
    if (error) {
      // قبل تطبيق هجرة الدفعة D لا توجد الدالة: لا يُعدّ فشلاً للمهمة
      if (error.code !== 'PGRST202') {
        console.error('fabric-store job: address purge failed:', error.message)
        result.ok = false
      }
      result.addresses = error.code === 'PGRST202' ? 'not-installed' : 'failed'
    } else {
      result.addresses = data
    }
  }
  if (skipped.length) result.skipped = skipped

  return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
