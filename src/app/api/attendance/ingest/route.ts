import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 512 * 1024
const MAX_CLOCK_SKEW_SECONDS = 5 * 60

const attendanceEventSchema = z.object({
  eventKey: z.string().regex(/^[a-f0-9]{64}$/),
  deviceUserId: z.string().trim().min(1).max(100),
  personName: z.string().trim().max(160).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }),
  verificationMethod: z.number().int().min(0).max(32767).nullable().optional(),
  attendanceState: z.number().int().min(0).max(32767).nullable().optional(),
  wasSuccessful: z.boolean().default(true),
})

const attendanceDeviceUserSchema = z.object({
  deviceUserId: z.string().trim().min(1).max(100),
  displayName: z.string().trim().max(160).nullable().optional(),
  userType: z.string().trim().max(80).nullable().optional(),
  userStatus: z.string().trim().max(80).nullable().optional(),
})

const ingestSchema = z.object({
  connectorId: z.string().trim().min(3).max(80),
  deviceCode: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,49}$/),
  events: z.array(attendanceEventSchema).max(500),
  userSnapshot: z.boolean().default(false),
  users: z.array(attendanceDeviceUserSchema).max(2000).optional(),
}).superRefine((payload, context) => {
  if (payload.userSnapshot && !payload.users) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['users'],
      message: 'users is required when userSnapshot is true',
    })
  }
})

function signaturesMatch(provided: string, expected: string) {
  const normalized = provided.replace(/^sha256=/i, '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) return false

  const providedBuffer = Buffer.from(normalized, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ingestSecret = process.env.ATTENDANCE_INGEST_SECRET

  if (!supabaseUrl || !serviceRoleKey || !ingestSecret || ingestSecret.length < 32) {
    console.error('Attendance ingest is missing secure server configuration')
    return NextResponse.json({ error: 'الخدمة غير مهيأة بعد' }, { status: 503 })
  }

  const timestampHeader = request.headers.get('x-attendance-timestamp')
  const signatureHeader = request.headers.get('x-attendance-signature')
  const timestamp = Number(timestampHeader)

  if (!timestampHeader || !signatureHeader || !Number.isInteger(timestamp)) {
    return NextResponse.json({ error: 'طلب غير مصرح' }, { status: 401 })
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return NextResponse.json({ error: 'وقت الطلب غير صالح' }, { status: 401 })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'الدفعة أكبر من الحد المسموح' }, { status: 413 })
  }

  const expectedSignature = createHmac('sha256', ingestSecret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')

  if (!signaturesMatch(signatureHeader, expectedSignature)) {
    return NextResponse.json({ error: 'طلب غير مصرح' }, { status: 401 })
  }

  let payload: z.infer<typeof ingestSchema>
  try {
    payload = ingestSchema.parse(JSON.parse(rawBody))
  } catch (error) {
    const details = error instanceof z.ZodError
      ? error.issues.map((issue) => issue.message).slice(0, 3)
      : undefined
    return NextResponse.json({ error: 'بيانات غير صالحة', details }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: device, error: deviceError } = await supabase
    .from('attendance_devices')
    .select('id, direction, last_event_at')
    .eq('code', payload.deviceCode)
    .eq('is_active', true)
    .maybeSingle()

  if (deviceError) {
    console.error('Attendance device lookup failed:', deviceError.message)
    return NextResponse.json({ error: 'تعذر التحقق من الجهاز' }, { status: 500 })
  }

  if (!device) {
    return NextResponse.json({ error: 'الجهاز غير مسجل أو غير مفعل' }, { status: 404 })
  }

  const deviceUserIds = [...new Set(payload.events.map((event) => event.deviceUserId))]
  const mappings = new Map<string, string>()

  if (deviceUserIds.length > 0) {
    const { data, error } = await supabase
      .from('attendance_worker_mappings')
      .select('device_user_id, worker_id')
      .eq('device_id', device.id)
      .eq('is_active', true)
      .in('device_user_id', deviceUserIds)

    if (error) {
      console.error('Attendance mapping lookup failed:', error.message)
      return NextResponse.json({ error: 'تعذر مطابقة العمال' }, { status: 500 })
    }

    for (const mapping of data || []) {
      mappings.set(mapping.device_user_id, mapping.worker_id)
    }
  }

  const rows = payload.events.map((event) => ({
    event_key: event.eventKey,
    device_id: device.id,
    worker_id: mappings.get(event.deviceUserId) || null,
    device_user_id: event.deviceUserId,
    device_person_name: event.personName || null,
    direction: device.direction,
    occurred_at: event.occurredAt,
    verification_method: event.verificationMethod ?? null,
    attendance_state: event.attendanceState ?? null,
    was_successful: event.wasSuccessful,
  }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('attendance_events')
      .upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true })

    if (insertError) {
      console.error('Attendance event insert failed:', insertError.message)
      await supabase
        .from('attendance_devices')
        .update({
          connector_id: payload.connectorId,
          last_seen_at: new Date().toISOString(),
          last_error: 'event_insert_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id)
      return NextResponse.json({ error: 'تعذر حفظ السجلات' }, { status: 500 })
    }
  }

  let usersReceived = 0
  if (payload.userSnapshot) {
    const uniqueUsers = [
      ...new Map(
        (payload.users || []).map((terminalUser) => [terminalUser.deviceUserId, terminalUser])
      ).values(),
    ]

    const { error: userSyncError } = await supabase.rpc('sync_attendance_device_users', {
      p_device_id: device.id,
      p_users: uniqueUsers,
    })

    if (userSyncError) {
      console.error('Attendance device user sync failed:', userSyncError.message)
      await supabase
        .from('attendance_devices')
        .update({
          connector_id: payload.connectorId,
          last_seen_at: new Date().toISOString(),
          last_error: 'user_sync_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id)
      return NextResponse.json({ error: 'تعذر حفظ قائمة مستخدمي الجهاز' }, { status: 500 })
    }

    usersReceived = uniqueUsers.length
  }

  const lastEventAt = payload.events.reduce<string | null>((latest, event) => {
    if (!latest || Date.parse(event.occurredAt) > Date.parse(latest)) return event.occurredAt
    return latest
  }, null)

  const deviceUpdate: Record<string, string | null> = {
    connector_id: payload.connectorId,
    last_seen_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  if (
    lastEventAt
    && (!device.last_event_at || Date.parse(lastEventAt) > Date.parse(device.last_event_at))
  ) {
    deviceUpdate.last_event_at = lastEventAt
  }

  const { error: heartbeatError } = await supabase
    .from('attendance_devices')
    .update(deviceUpdate)
    .eq('id', device.id)

  if (heartbeatError) {
    console.error('Attendance heartbeat update failed:', heartbeatError.message)
    return NextResponse.json({ error: 'حُفظت السجلات وتعذر تحديث حالة الجهاز' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    received: payload.events.length,
    mapped: payload.events.filter((event) => mappings.has(event.deviceUserId)).length,
    userSnapshotAccepted: payload.userSnapshot,
    usersReceived,
  })
}
