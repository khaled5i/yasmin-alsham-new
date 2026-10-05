/**
 * إعدادات مسارات الدفع (المرحلة 5).
 *
 * مفتاحان منفصلان عن قصد (الخطة: «عند العطل أوقف إنشاء دفعات جديدة مع استمرار
 * استقبال أحداث المدفوعات القائمة والمطابقة والاسترداد»):
 * - `FABRIC_STORE_PAYMENTS_ENABLED` يتحكم في **بدء** دفع جديد فقط.
 * - الـwebhook وصفحة الرجوع ومهمة إعادة المعالجة تعمل ما دام ميسر مهيّأً، ولو أُطفئ
 *   المفتاح — فلا تضيع دفعة بدأت قبل الإطفاء.
 */

import { timingSafeEqual, createHash } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { errorResponse, getFabricStoreServiceClient } from './http'
import { createMoyasarClient, getMoyasarConfig } from './moyasar'
import { afterVerifiedPayment } from './outbox-context'
import type { PaymentDeps } from './payments'

/**
 * المرحلة 9: المطابقة الدورية مع ميسر وتنبيهات الموظفين — مفتاح مستقل، مطفأ افتراضياً.
 * لا يمس بدء الدفع ولا الـwebhook ولا الاسترداد.
 */
export function isReconcileEnabled(): boolean {
  return (process.env.FABRIC_STORE_RECONCILE_ENABLED ?? '').trim().toLowerCase() === 'true'
}

export function isNewPaymentsEnabled(): boolean {
  return (process.env.FABRIC_STORE_PAYMENTS_ENABLED ?? '').trim().toLowerCase() === 'true'
}

export function getPaymentDeps(): { ok: true; deps: PaymentDeps } | { ok: false; response: NextResponse } {
  const client = getFabricStoreServiceClient()
  const moyasar = getMoyasarConfig()
  if (!client || !moyasar.ok) {
    if (!moyasar.ok && moyasar.reason !== 'missing-key') {
      console.error('fabric-store: Moyasar configuration refused:', moyasar.reason)
    }
    return { ok: false, response: errorResponse(503, 'payments-not-configured', 'الدفع الإلكتروني غير متاح حالياً') }
  }
  return {
    ok: true,
    deps: {
      rpc: (fn, args) => client.rpc(fn, args),
      moyasar: createMoyasarClient(moyasar.config),
      config: moyasar.config,
      onPaid: afterVerifiedPayment,
    },
  }
}

/** مهمة مجدولة: `Authorization: Bearer <CRON_SECRET>` (نمط Vercel Cron). */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? ''
  if (secret.length < 16) return false
  const given = request.headers.get('authorization') ?? ''
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`))
}
