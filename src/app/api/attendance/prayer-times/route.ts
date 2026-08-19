import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const PRAYER_SOURCE = 'aladhan'
const PRAYER_METHOD = 4
const PRAYER_TIME_ZONE = 'Asia/Riyadh'

interface AladhanCalendarDay {
  timings: {
    Dhuhr: string
    Maghrib: string
    Isha: string
  }
  date: {
    gregorian: {
      date: string
    }
  }
  meta?: {
    method?: { name?: string }
  }
}

interface CachedPrayerDay {
  prayer_date: string
  dhuhr_at: string
  maghrib_at: string
  isha_at: string
  source: string
  method_name: string | null
}

function getMonthBounds(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
  return {
    start: `${monthKey}-01`,
    end: `${nextMonthKey}-01`,
    year,
    month,
  }
}

function normalizeCalendarDay(day: AladhanCalendarDay) {
  const [dayPart, monthPart, yearPart] = day.date.gregorian.date.split('-')
  const date = `${yearPart}-${monthPart}-${dayPart}`
  const fetchedAt = new Date().toISOString()
  return {
    prayer_date: date,
    dhuhr_at: day.timings.Dhuhr,
    maghrib_at: day.timings.Maghrib,
    isha_at: day.timings.Isha,
    source: PRAYER_SOURCE,
    method_id: PRAYER_METHOD,
    method_name: day.meta?.method?.name ?? 'Umm Al-Qura University, Makkah',
    timezone: PRAYER_TIME_ZONE,
    fetched_at: fetchedAt,
    updated_at: fetchedAt,
  }
}

function responseDays(rows: Array<CachedPrayerDay | ReturnType<typeof normalizeCalendarDay>>) {
  return rows.map((row) => ({
    date: row.prayer_date,
    dhuhr_at: row.dhuhr_at,
    maghrib_at: row.maghrib_at,
    isha_at: row.isha_at,
    source: row.source,
    method: row.method_name ?? 'Umm Al-Qura University, Makkah',
  }))
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsedMonth = monthSchema.safeParse(url.searchParams.get('month'))
  if (!parsedMonth.success) {
    return NextResponse.json({ error: 'الشهر غير صالح' }, { status: 400 })
  }

  const monthKey = parsedMonth.data
  const { start, end, year, month } = getMonthBounds(monthKey)
  const expectedDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

  if (supabase) {
    const { data: cachedRows, error: cacheReadError } = await supabase
      .from('attendance_prayer_times')
      .select('prayer_date, dhuhr_at, maghrib_at, isha_at, source, method_name')
      .gte('prayer_date', start)
      .lt('prayer_date', end)
      .order('prayer_date', { ascending: true })

    if (!cacheReadError && cachedRows && cachedRows.length === expectedDays) {
      return NextResponse.json({ month: monthKey, cached: true, days: responseDays(cachedRows) })
    }

    if (cacheReadError && cacheReadError.code !== '42P01') {
      console.error('Attendance prayer cache read failed:', cacheReadError.message)
    }
  }

  const providerUrl = new URL(`https://api.aladhan.com/v1/calendarByCity/${year}/${month}`)
  providerUrl.searchParams.set('city', 'Khobar')
  providerUrl.searchParams.set('country', 'Saudi Arabia')
  providerUrl.searchParams.set('method', String(PRAYER_METHOD))
  providerUrl.searchParams.set('timezonestring', PRAYER_TIME_ZONE)
  providerUrl.searchParams.set('iso8601', 'true')

  try {
    const providerResponse = await fetch(providerUrl, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 * 24 * 60 * 60 },
    })
    if (!providerResponse.ok) throw new Error(`provider_status_${providerResponse.status}`)

    const payload = await providerResponse.json() as { code?: number; data?: AladhanCalendarDay[] }
    if (payload.code !== 200 || !Array.isArray(payload.data)) {
      throw new Error('provider_payload_invalid')
    }

    const rows = payload.data.map(normalizeCalendarDay)
    if (supabase && rows.length > 0) {
      const { error: cacheWriteError } = await supabase
        .from('attendance_prayer_times')
        .upsert(rows, { onConflict: 'prayer_date' })
      if (cacheWriteError && cacheWriteError.code !== '42P01') {
        console.error('Attendance prayer cache write failed:', cacheWriteError.message)
      }
    }

    return NextResponse.json({ month: monthKey, cached: false, days: responseDays(rows) })
  } catch (error) {
    console.error('Attendance prayer provider failed:', error)
    return NextResponse.json({ error: 'تعذر جلب مواقيت الصلاة لمدينة الخبر' }, { status: 502 })
  }
}
