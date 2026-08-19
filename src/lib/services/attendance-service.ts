import { supabase } from '@/lib/supabase'
import type { WorkerWithUser } from '@/lib/services/worker-service'
import type { AttendancePrayerTime } from '@/lib/attendance-analysis'

export type AttendanceDirection = 'entry' | 'exit'

export interface AttendanceDevice {
  id: string
  code: string
  name: string
  direction: AttendanceDirection
  is_active: boolean
  connector_id: string | null
  last_seen_at: string | null
  last_event_at: string | null
  last_error: string | null
}

export interface AttendanceMapping {
  id: string
  device_id: string
  device_user_id: string
  worker_id: string
  is_active: boolean
}

export interface AttendanceDeviceUser {
  id: string
  device_id: string
  device_user_id: string
  display_name: string | null
  user_type: string | null
  user_status: string | null
  is_present_on_device: boolean
  first_seen_at: string
  last_seen_at: string
}

export interface AttendanceEvent {
  id: string
  event_key: string
  device_id: string
  worker_id: string | null
  device_user_id: string
  device_person_name: string | null
  direction: AttendanceDirection
  occurred_at: string
  verification_method: number | null
  attendance_state: number | null
  was_successful: boolean
  received_at: string
}

function getRiyadhDayBounds(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+03:00`)
  if (Number.isNaN(start.getTime())) throw new Error('تاريخ غير صالح')

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function getRiyadhMonthBounds(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) throw new Error('شهر غير صالح')
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error('شهر غير صالح')

  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
  return {
    start: new Date(`${monthKey}-01T00:00:00+03:00`).toISOString(),
    end: new Date(`${nextMonthKey}-01T00:00:00+03:00`).toISOString(),
  }
}

async function getAttendanceEventsRange(start: string, end: string) {
  const pageSize = 1000
  const rows: AttendanceEvent[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('attendance_events')
      .select('id, event_key, device_id, worker_id, device_user_id, device_person_name, direction, occurred_at, verification_method, attendance_state, was_successful, received_at')
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .eq('was_successful', true)
      .order('occurred_at', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    const page = (data || []) as AttendanceEvent[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

export const attendanceService = {
  async getWorkers() {
    const { data, error } = await supabase
      .from('workers')
      .select('*, user:users(*)')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data || []).map((worker) => ({
      ...worker,
      user: Array.isArray(worker.user) ? worker.user[0] : worker.user,
    })) as WorkerWithUser[]
  },

  async getDay(dateKey: string) {
    const { start, end } = getRiyadhDayBounds(dateKey)

    const [devicesResult, deviceUsersResult, mappingsResult, eventsResult] = await Promise.all([
      supabase
        .from('attendance_devices')
        .select('id, code, name, direction, is_active, connector_id, last_seen_at, last_event_at, last_error')
        .order('direction', { ascending: true }),
      supabase
        .from('attendance_device_users')
        .select('id, device_id, device_user_id, display_name, user_type, user_status, is_present_on_device, first_seen_at, last_seen_at')
        .eq('is_present_on_device', true)
        .order('display_name', { ascending: true, nullsFirst: false }),
      supabase
        .from('attendance_worker_mappings')
        .select('id, device_id, device_user_id, worker_id, is_active')
        .eq('is_active', true),
      supabase
        .from('attendance_events')
        .select('id, event_key, device_id, worker_id, device_user_id, device_person_name, direction, occurred_at, verification_method, attendance_state, was_successful, received_at')
        .gte('occurred_at', start)
        .lt('occurred_at', end)
        .eq('was_successful', true)
        .order('occurred_at', { ascending: true }),
    ])

    const firstError = devicesResult.error || deviceUsersResult.error || mappingsResult.error || eventsResult.error
    if (firstError) throw new Error(firstError.message)

    return {
      devices: (devicesResult.data || []) as AttendanceDevice[],
      deviceUsers: (deviceUsersResult.data || []) as AttendanceDeviceUser[],
      mappings: (mappingsResult.data || []) as AttendanceMapping[],
      events: (eventsResult.data || []) as AttendanceEvent[],
    }
  },

  async getMonth(monthKey: string) {
    const { start, end } = getRiyadhMonthBounds(monthKey)
    const [devicesResult, mappingsResult, events] = await Promise.all([
      supabase
        .from('attendance_devices')
        .select('id, code, name, direction, is_active, connector_id, last_seen_at, last_event_at, last_error')
        .order('direction', { ascending: true }),
      supabase
        .from('attendance_worker_mappings')
        .select('id, device_id, device_user_id, worker_id, is_active')
        .eq('is_active', true),
      getAttendanceEventsRange(start, end),
    ])

    const firstError = devicesResult.error || mappingsResult.error
    if (firstError) throw new Error(firstError.message)

    return {
      devices: (devicesResult.data || []) as AttendanceDevice[],
      mappings: (mappingsResult.data || []) as AttendanceMapping[],
      events,
    }
  },

  async getPrayerTimesMonth(monthKey: string) {
    const response = await fetch(`/api/attendance/prayer-times?month=${encodeURIComponent(monthKey)}`, {
      cache: 'no-store',
    })
    const payload = await response.json() as { error?: string; days?: AttendancePrayerTime[] }
    if (!response.ok || !payload.days) {
      throw new Error(payload.error || 'تعذر تحميل مواقيت الصلاة')
    }
    return payload.days
  },

  async saveMapping(deviceId: string, deviceUserId: string, workerId: string) {
    const { error } = await supabase
      .from('attendance_worker_mappings')
      .upsert({
        device_id: deviceId,
        device_user_id: deviceUserId,
        worker_id: workerId,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'device_id,device_user_id' })

    if (error) throw new Error(error.message)
  },
}
