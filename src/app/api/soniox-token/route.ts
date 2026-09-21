/**
 * تفويض التحويل اللحظي (SEC-01).
 *
 * قبل: GET مفتوح للجميع يعيد SONIOX_API_KEY الدائم في JSON. أي زائر يقرأه
 *      ويستخدمه بلا حد على حساب المالك، ولا تنتهي صلاحيته.
 *
 * بعد: POST يتطلب جلسة موظف نشط، ويعيد **مفتاحاً مؤقتاً** من Soniox:
 *      صالح 60 ثانية · للاستخدام مرة واحدة · مقيّد بنوع transcribe_websocket
 *      · ومربوط بمعرّف المستخدم في سجلات الاستخدام.
 *      المفتاح الدائم لا يغادر الخادم إطلاقاً.
 *
 * مرجع: https://soniox.com/docs/api-reference/auth/create_temporary_api_key
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireActiveStaff } from '@/lib/server/api-auth'

const SONIOX_TEMP_KEY_URL = 'https://api.soniox.com/v1/auth/temporary-api-key'

// يكفي لفتح اتصال WebSocket؛ بعد الفتح يبقى الاتصال حياً ولا يحتاج المفتاح.
const EXPIRES_IN_SECONDS = 60
// الحد الأقصى لمدة جلسة التسجيل الواحدة.
const MAX_SESSION_DURATION_SECONDS = 3600

export async function POST(request: NextRequest) {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth.response

  const apiKey = process.env.SONIOX_API_KEY
  if (!apiKey || apiKey === 'your_soniox_api_key_here') {
    console.error('SONIOX_API_KEY is not configured')
    return NextResponse.json({ error: 'خدمة التحويل الصوتي غير مهيأة' }, { status: 500 })
  }

  try {
    const res = await fetch(SONIOX_TEMP_KEY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: EXPIRES_IN_SECONDS,
        max_session_duration_seconds: MAX_SESSION_DURATION_SECONDS,
        single_use: true,
        // يُسجَّل في سجلات استخدام Soniox ولا يستطيع العميل تجاوزه.
        client_reference_id: auth.staff.userId,
      }),
    })

    if (!res.ok) {
      // لا نمرّر نص خطأ المزوّد إلى العميل: قد يحوي تفاصيل عن الحساب أو المفتاح.
      console.error('Soniox temporary key request failed:', res.status, await res.text())
      return NextResponse.json({ error: 'تعذّر بدء التحويل الصوتي' }, { status: 502 })
    }

    const data = (await res.json()) as { api_key?: string; expires_at?: string }
    if (!data.api_key) {
      console.error('Soniox temporary key response missing api_key')
      return NextResponse.json({ error: 'تعذّر بدء التحويل الصوتي' }, { status: 502 })
    }

    // اسم الحقل `apiKey` مُبقى كما كان حتى لا تتغيّر عقود العملاء الثلاثة.
    // القيمة الآن مفتاح مؤقت، لا المفتاح الدائم.
    return NextResponse.json(
      { apiKey: data.api_key, expiresAt: data.expires_at ?? null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Soniox temporary key error:', error)
    return NextResponse.json({ error: 'تعذّر بدء التحويل الصوتي' }, { status: 502 })
  }
}
