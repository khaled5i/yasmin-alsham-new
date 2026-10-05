/**
 * ربط طابور المتجر الإلكتروني بالخادم (المرحلة 6).
 *
 * - اعتماد البيع يعمل فور السداد الموثّق (webhook أو صفحة الرجوع)، داخل الطلب نفسه:
 *   عملية قاعدة بيانات واحدة سريعة. إن فشل (قفل مشغول خلف مبيعة محل) تبقى المهمة للطابور.
 * - فاتورة الأستاذ خلف `FABRIC_STORE_ALOSTAZ_ENABLED=true` (قاعدة المالك: لا فاتورة حقيقية
 *   أثناء الاختبار). تُرسل بعد الرد (`after`) ثم بالمهمة المجدولة إن تعذّر.
 * - المهمة المجدولة `/api/fabric-store/jobs/run/` هي شبكة الأمان لكل ما سبق.
 */

import { after } from 'next/server'
import { sendFabricIncomeToAlostaz } from '@/lib/server/alostaz-fabric-invoice'
import { getFabricStoreServiceClient } from './http'
import { alostazTaskOutcome, processFabricStoreOutbox, type OutboxDeps } from './confirm'

export function isAlostazSendEnabled(): boolean {
  return (process.env.FABRIC_STORE_ALOSTAZ_ENABLED ?? '').trim().toLowerCase() === 'true'
}

export function getOutboxDeps(options: { withAlostaz: boolean }): OutboxDeps | null {
  const client = getFabricStoreServiceClient()
  if (!client) return null
  return {
    rpc: (fn, args) => client.rpc(fn, args),
    sendAlostazInvoice: options.withAlostaz && isAlostazSendEnabled()
      ? async incomeId => alostazTaskOutcome(await sendFabricIncomeToAlostaz(client, incomeId))
      : undefined,
  }
}

/**
 * بعد سداد موثّق: اعتماد البيع الآن (لا يرمي أبداً — السداد مسجّل مهما حدث هنا)،
 * وفاتورة الأستاذ بعد الرد إن كان الإرسال مفعّلاً.
 */
export async function afterVerifiedPayment(orderId: string): Promise<void> {
  const deps = getOutboxDeps({ withAlostaz: false })
  if (!deps) return
  try {
    const counts = await processFabricStoreOutbox(deps, { orderId })
    if (Object.keys(counts).length) console.info('fabric-store: after payment', orderId, JSON.stringify(counts))
  } catch (error) {
    console.error('fabric-store: confirming the sale failed (the job will retry):', (error as Error).message)
  }
  if (isAlostazSendEnabled()) {
    after(async () => {
      const withAlostaz = getOutboxDeps({ withAlostaz: true })
      if (!withAlostaz) return
      try {
        await processFabricStoreOutbox(withAlostaz, { orderId })
      } catch (error) {
        console.error('fabric-store: alostaz invoice after payment failed (the job will retry):', (error as Error).message)
      }
    })
  }
}
