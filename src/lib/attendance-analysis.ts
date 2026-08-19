export type AttendanceDirection = 'entry' | 'exit'

export type PrayerName = 'dhuhr' | 'maghrib' | 'isha'

export interface AttendanceAnalysisEvent {
  id: string
  direction: AttendanceDirection
  occurred_at: string
}

export interface AttendancePrayerTime {
  date: string
  dhuhr_at: string
  maghrib_at: string
  isha_at: string
  source?: string
  method?: string
}

export interface AttendancePrayerTrip {
  prayer: PrayerName
  exitAt: string
  entryAt: string
  durationMinutes: number
  overrunMinutes: number
}

export type AttendanceDayStatus =
  | 'present'
  | 'absent'
  | 'friday'
  | 'friday_work'
  | 'pending'
  | 'needs_review'

export interface AttendanceDayAnalysis {
  dateKey: string
  status: AttendanceDayStatus
  isFriday: boolean
  isClosed: boolean
  isInside: boolean
  firstEntryAt: string | null
  lastExitAt: string | null
  morningLateMinutes: number
  breakLateMinutes: number
  prayerOverrunMinutes: number
  unexcusedMinutes: number
  earlyDepartureMinutes: number
  totalDelayMinutes: number
  totalDeficitMinutes: number
  breakOvertimeMinutes: number
  endOvertimeMinutes: number
  holidayOvertimeMinutes: number
  totalOvertimeMinutes: number
  prayerTrips: AttendancePrayerTrip[]
  anomalies: string[]
}

export interface AttendanceMonthSummary {
  days: AttendanceDayAnalysis[]
  scheduledDays: number
  presentDays: number
  absentDays: number
  reviewDays: number
  fridayWorkDays: number
  totalMorningLateMinutes: number
  totalBreakLateMinutes: number
  totalPrayerOverrunMinutes: number
  totalDelayMinutes: number
  totalUnexcusedMinutes: number
  totalEarlyDepartureMinutes: number
  totalDeficitMinutes: number
  totalBreakOvertimeMinutes: number
  totalEndOvertimeMinutes: number
  totalHolidayOvertimeMinutes: number
  totalOvertimeMinutes: number
}

export const ATTENDANCE_POLICY = {
  timeZone: 'Asia/Riyadh',
  shiftStart: '09:00',
  breakStart: '13:30',
  breakEnd: '16:00',
  shiftEnd: '22:30',
  prayerWindowMinutes: 60,
  prayerAllowanceMinutes: 20,
  fridayDayIndex: 5,
} as const

const MINUTE_MS = 60 * 1000
const RIYADH_OFFSET = '+03:00'
const PRAYERS: PrayerName[] = ['dhuhr', 'maghrib', 'isha']

interface NormalizedEvent extends AttendanceAnalysisEvent {
  timestamp: number
}

interface TimeInterval {
  start: number
  end: number
}

interface AttendanceOuting extends TimeInterval {
  exitAt: string
  entryAt: string
}

function timeOnDate(dateKey: string, time: string) {
  return Date.parse(`${dateKey}T${time}:00${RIYADH_OFFSET}`)
}

function elapsedMinutes(start: number, end: number) {
  return Math.max(0, Math.round((end - start) / MINUTE_MS))
}

function overlapMinutes(interval: TimeInterval, range: TimeInterval) {
  return elapsedMinutes(
    Math.max(interval.start, range.start),
    Math.min(interval.end, range.end),
  )
}

function getRiyadhDateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_POLICY.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function formatAttendanceDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (safeMinutes === 0) return '0 د'
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  if (hours === 0) return `${remainder} د`
  if (remainder === 0) return `${hours} س`
  return `${hours} س ${remainder} د`
}

export function getMonthDateKeys(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) return []
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return []
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: days }, (_, index) => (
    `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
  ))
}

function getFridayState(dateKey: string) {
  const noon = new Date(`${dateKey}T12:00:00${RIYADH_OFFSET}`)
  return noon.getUTCDay() === ATTENDANCE_POLICY.fridayDayIndex
}

function normalizeEvents(events: AttendanceAnalysisEvent[]) {
  return events
    .map((event) => ({ ...event, timestamp: Date.parse(event.occurred_at) }))
    .filter((event) => Number.isFinite(event.timestamp))
    .sort((first, second) => first.timestamp - second.timestamp)
}

function prayerTimestamp(prayerTimes: AttendancePrayerTime | null, prayer: PrayerName) {
  if (!prayerTimes) return null
  const value = prayerTimes[`${prayer}_at`]
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function analyzeAttendanceDay(
  dateKey: string,
  events: AttendanceAnalysisEvent[],
  prayerTimes: AttendancePrayerTime | null,
  now: Date = new Date(),
): AttendanceDayAnalysis {
  const shiftStart = timeOnDate(dateKey, ATTENDANCE_POLICY.shiftStart)
  const breakStart = timeOnDate(dateKey, ATTENDANCE_POLICY.breakStart)
  const breakEnd = timeOnDate(dateKey, ATTENDANCE_POLICY.breakEnd)
  const shiftEnd = timeOnDate(dateKey, ATTENDANCE_POLICY.shiftEnd)
  const nowTimestamp = now.getTime()
  const isClosed = nowTimestamp >= shiftEnd
  const isFriday = getFridayState(dateKey)
  const normalized = normalizeEvents(events)
  const anomalies: string[] = []
  const insideIntervals: TimeInterval[] = []
  const outings: AttendanceOuting[] = []

  let insideSince: NormalizedEvent | null = null
  let openExit: NormalizedEvent | null = null
  let hasLeadingExit = false

  for (const event of normalized) {
    if (event.direction === 'entry') {
      if (insideSince) {
        anomalies.push('دخول متكرر دون خروج بينهما')
        continue
      }

      if (openExit) {
        outings.push({
          start: openExit.timestamp,
          end: event.timestamp,
          exitAt: openExit.occurred_at,
          entryAt: event.occurred_at,
        })
        openExit = null
      }
      insideSince = event
      continue
    }

    if (!insideSince) {
      if (!openExit) {
        openExit = event
        if (insideIntervals.length === 0 && !normalized.some((item) => (
          item.direction === 'entry' && item.timestamp < event.timestamp
        ))) {
          hasLeadingExit = true
        }
      } else {
        anomalies.push('خروج متكرر دون دخول بينهما')
      }
      continue
    }

    insideIntervals.push({ start: insideSince.timestamp, end: event.timestamp })
    insideSince = null
    openExit = event
  }

  if (hasLeadingExit) anomalies.push('أول حركة في اليوم خروج؛ تسجيل الدخول مفقود')
  if (insideSince && isClosed) anomalies.push('تسجيل الخروج النهائي مفقود')

  const entries = normalized.filter((event) => event.direction === 'entry')
  const exits = normalized.filter((event) => event.direction === 'exit')
  const firstEntryAt = entries[0]?.occurred_at ?? null
  const lastExitAt = exits.at(-1)?.occurred_at ?? null
  const isInside = normalized.at(-1)?.direction === 'entry'

  let morningLateMinutes = 0
  if (!isFriday && firstEntryAt && !hasLeadingExit) {
    morningLateMinutes = elapsedMinutes(shiftStart, Math.max(shiftStart, Date.parse(firstEntryAt)))
  }

  let breakOvertimeMinutes = 0
  const intervalAcrossBreakStart = insideIntervals.find((interval) => (
    interval.start <= breakStart && interval.end > breakStart
  ))
  if (intervalAcrossBreakStart) {
    breakOvertimeMinutes = overlapMinutes(intervalAcrossBreakStart, { start: breakStart, end: breakEnd })
  } else if (insideSince && insideSince.timestamp <= breakStart) {
    const runningEnd = Math.min(breakEnd, nowTimestamp)
    if (runningEnd > breakStart) {
      breakOvertimeMinutes = elapsedMinutes(breakStart, runningEnd)
    }
  }

  const prayerTrips: AttendancePrayerTrip[] = []
  const usedPrayers = new Set<PrayerName>()
  let prayerOverrunMinutes = 0
  let breakLateMinutes = 0
  let unexcusedMinutes = 0

  for (const outing of outings) {
    const matchedPrayer = PRAYERS.find((prayer) => {
      if (usedPrayers.has(prayer)) return false
      const adhan = prayerTimestamp(prayerTimes, prayer)
      return adhan !== null
        && outing.start >= adhan
        && outing.start <= adhan + ATTENDANCE_POLICY.prayerWindowMinutes * MINUTE_MS
    })

    if (matchedPrayer) {
      usedPrayers.add(matchedPrayer)
      const durationMinutes = elapsedMinutes(outing.start, outing.end)
      const overrunMinutes = Math.max(0, durationMinutes - ATTENDANCE_POLICY.prayerAllowanceMinutes)
      prayerOverrunMinutes += overrunMinutes
      prayerTrips.push({
        prayer: matchedPrayer,
        exitAt: outing.exitAt,
        entryAt: outing.entryAt,
        durationMinutes,
        overrunMinutes,
      })
      continue
    }

    const spansBreakReturn = outing.start < breakEnd && outing.end > breakEnd
    unexcusedMinutes += overlapMinutes(outing, { start: shiftStart, end: breakStart })

    if (spansBreakReturn) {
      breakLateMinutes = Math.max(
        breakLateMinutes,
        overlapMinutes(outing, { start: breakEnd, end: shiftEnd }),
      )
    } else {
      unexcusedMinutes += overlapMinutes(outing, { start: breakEnd, end: shiftEnd })
    }
  }

  let earlyDepartureMinutes = 0
  if (!isFriday && isClosed && openExit && entries.length > 0 && !insideSince) {
    const remaining = { start: openExit.timestamp, end: shiftEnd }
    earlyDepartureMinutes = overlapMinutes(remaining, { start: shiftStart, end: breakStart })
      + overlapMinutes(remaining, { start: breakEnd, end: shiftEnd })
  }

  let endOvertimeMinutes = 0
  if (!isFriday) {
    for (const interval of insideIntervals) {
      if (interval.start <= shiftEnd && interval.end > shiftEnd) {
        endOvertimeMinutes += elapsedMinutes(shiftEnd, interval.end)
      }
    }
  }

  let holidayOvertimeMinutes = 0
  if (isFriday) {
    holidayOvertimeMinutes = insideIntervals.reduce(
      (total, interval) => total + elapsedMinutes(interval.start, interval.end),
      0,
    )
  }

  let status: AttendanceDayStatus
  if (isFriday) {
    status = normalized.length === 0
      ? 'friday'
      : anomalies.length > 0 || insideSince !== null
        ? 'needs_review'
        : 'friday_work'
  } else if (normalized.length === 0) {
    status = isClosed ? 'absent' : 'pending'
  } else if (hasLeadingExit || (insideSince && isClosed)) {
    status = 'needs_review'
  } else {
    status = 'present'
  }

  if (!prayerTimes && normalized.length > 0 && !isFriday) {
    anomalies.push('مواقيت الصلاة غير متاحة لهذا اليوم')
    if (status === 'present') status = 'needs_review'
  }

  const totalDelayMinutes = morningLateMinutes + breakLateMinutes + prayerOverrunMinutes
  const totalDeficitMinutes = totalDelayMinutes + unexcusedMinutes + earlyDepartureMinutes
  const totalOvertimeMinutes = breakOvertimeMinutes + endOvertimeMinutes + holidayOvertimeMinutes

  return {
    dateKey,
    status,
    isFriday,
    isClosed,
    isInside,
    firstEntryAt,
    lastExitAt,
    morningLateMinutes,
    breakLateMinutes,
    prayerOverrunMinutes,
    unexcusedMinutes,
    earlyDepartureMinutes,
    totalDelayMinutes,
    totalDeficitMinutes,
    breakOvertimeMinutes,
    endOvertimeMinutes,
    holidayOvertimeMinutes,
    totalOvertimeMinutes,
    prayerTrips,
    anomalies,
  }
}

export function buildAttendanceMonthSummary(
  monthKey: string,
  eventsByDate: Map<string, AttendanceAnalysisEvent[]>,
  prayerTimesByDate: Map<string, AttendancePrayerTime>,
  now: Date = new Date(),
): AttendanceMonthSummary {
  const todayKey = getRiyadhDateKey(now)
  const days = getMonthDateKeys(monthKey)
    .filter((dateKey) => dateKey <= todayKey)
    .map((dateKey) => analyzeAttendanceDay(
      dateKey,
      eventsByDate.get(dateKey) ?? [],
      prayerTimesByDate.get(dateKey) ?? null,
      now,
    ))

  const total = (selector: (day: AttendanceDayAnalysis) => number) => (
    days.reduce((sum, day) => sum + selector(day), 0)
  )

  return {
    days,
    scheduledDays: days.filter((day) => !day.isFriday && day.status !== 'pending').length,
    presentDays: days.filter((day) => !day.isFriday && (
      day.status === 'present' || day.status === 'needs_review'
    )).length,
    absentDays: days.filter((day) => day.status === 'absent').length,
    reviewDays: days.filter((day) => day.status === 'needs_review').length,
    fridayWorkDays: days.filter((day) => day.status === 'friday_work').length,
    totalMorningLateMinutes: total((day) => day.morningLateMinutes),
    totalBreakLateMinutes: total((day) => day.breakLateMinutes),
    totalPrayerOverrunMinutes: total((day) => day.prayerOverrunMinutes),
    totalDelayMinutes: total((day) => day.totalDelayMinutes),
    totalUnexcusedMinutes: total((day) => day.unexcusedMinutes),
    totalEarlyDepartureMinutes: total((day) => day.earlyDepartureMinutes),
    totalDeficitMinutes: total((day) => day.totalDeficitMinutes),
    totalBreakOvertimeMinutes: total((day) => day.breakOvertimeMinutes),
    totalEndOvertimeMinutes: total((day) => day.endOvertimeMinutes),
    totalHolidayOvertimeMinutes: total((day) => day.holidayOvertimeMinutes),
    totalOvertimeMinutes: total((day) => day.totalOvertimeMinutes),
  }
}

export function groupAttendanceEventsByRiyadhDate(events: AttendanceAnalysisEvent[]) {
  const grouped = new Map<string, AttendanceAnalysisEvent[]>()
  for (const event of events) {
    const dateKey = getRiyadhDateKey(event.occurred_at)
    const dayEvents = grouped.get(dateKey) ?? []
    dayEvents.push(event)
    grouped.set(dateKey, dayEvents)
  }
  return grouped
}
