import { NextResponse, type NextRequest } from 'next/server'
import { getStaffServiceClient, requireActiveStaff, type StaffAuthResult } from './api-auth'

export type StaffAiOperation =
  | 'translate-text' | 'generate-design-prompt' | 'generate-design-image'
  | 'convert-to-cartoon' | 'remove-model' | 'spatial-ocr' | 'transcribe-audio'

/** Auth is mandatory. Distributed quotas are enabled after the owner applies the migration. */
export async function requirePaidStaff(
  request: NextRequest,
  operation: StaffAiOperation
): Promise<StaffAuthResult> {
  try {
    const auth = await requireActiveStaff(request)
    if (!auth.ok) return auth
    if ((process.env.STAFF_AI_RATE_LIMIT_ENABLED ?? '').trim().toLowerCase() !== 'true') return auth

    const client = getStaffServiceClient()
    if (!client) return unavailable()
    const { data, error } = await client.rpc('staff_ai_take_request_budget', {
      p_user_id: auth.staff.userId, p_operation: operation,
    })
    if (error) {
      console.error('staff-ai: budget unavailable', error.code)
      return unavailable()
    }
    if (data?.status === 'allowed') return auth
    if (data?.status === 'forbidden') {
      return { ok: false, response: NextResponse.json({ error: 'غير مسموح' }, { status: 403 }) }
    }
    if (data?.status === 'rate_limited' && Number.isInteger(data.retry_after_seconds)
      && data.retry_after_seconds > 0 && data.retry_after_seconds <= 86400) {
      return { ok: false, response: NextResponse.json(
        { error: 'طلبات كثيرة للخدمة خلال فترة قصيرة؛ انتظر ثم أعد المحاولة' },
        { status: 429, headers: { 'Retry-After': String(data.retry_after_seconds), 'Cache-Control': 'no-store' } }
      ) }
    }
    return unavailable()
  } catch {
    console.error('staff-ai: authorization or budget service unavailable')
    return unavailable()
  }
}

function unavailable(): StaffAuthResult {
  return { ok: false, response: NextResponse.json(
    { error: 'الخدمة غير متاحة مؤقتاً؛ أعد المحاولة لاحقاً' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  ) }
}
