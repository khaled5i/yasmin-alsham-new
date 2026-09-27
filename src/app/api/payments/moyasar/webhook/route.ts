import { NextRequest, NextResponse } from 'next/server'
import { getPaymentDeps } from '@/lib/server/fabric-store/payment-context'
import { handleMoyasarWebhook } from '@/lib/server/fabric-store/payments'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024

/**
 * Webhook ميسر. التوثيق: الجسم يحمل `secret_token` (ليس توقيع HMAC)، ويُعاد الإرسال
 * 5 مرات خلال ~4 ساعات عند أي رد غير 2xx ثم يُسقط.
 *
 * - سرّ خاطئ ⇒ 401 ولا يُحفظ شيء.
 * - يُحفظ الحدث أولاً (بلا بيانات البطاقة)، ثم يُجلب الدفع من ميسر بمفتاحنا ويُطبَّق.
 * - 2xx فقط بعد الحفظ؛ فشل المعالجة بعده يُعاد بمهمة `/api/fabric-store/jobs/payment-events/`.
 *
 * لا يتبع مفتاح «الدفع الجديد»: دفعة بدأت قبل الإطفاء يجب أن تُعتمد. لا فحص Origin:
 * المرسل خادم ميسر، والتوثيق بالسر.
 */
export async function POST(request: NextRequest) {
  const payment = getPaymentDeps()
  if (!payment.ok) return payment.response

  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 })
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 })

  const result = await handleMoyasarWebhook(payment.deps, raw)
  return NextResponse.json(result.body, { status: result.httpStatus, headers: { 'Cache-Control': 'no-store' } })
}
