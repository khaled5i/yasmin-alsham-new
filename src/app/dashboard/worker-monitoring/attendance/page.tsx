'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleDot,
  Clock3,
  Fingerprint,
  LogIn,
  LogOut,
  MoonStar,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Unplug,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import type { WorkerWithUser } from '@/lib/services/worker-service'
import {
  attendanceService,
  type AttendanceDevice,
  type AttendanceDeviceUser,
  type AttendanceEvent,
  type AttendanceMapping,
} from '@/lib/services/attendance-service'
import {
  analyzeAttendanceDay,
  formatAttendanceDuration,
  type AttendanceDayAnalysis,
  type AttendancePrayerTime,
} from '@/lib/attendance-analysis'
import MonthlyAttendanceReport from './MonthlyAttendanceReport'

const RIYADH_TIME_ZONE = 'Asia/Riyadh'

function getRiyadhDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function formatTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ar-SA', {
    timeZone: RIYADH_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function formatLastSeen(value: string | null) {
  if (!value) return 'لم يتصل بعد'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'متصل الآن'
  if (seconds < 3600) return `منذ ${Math.floor(seconds / 60)} د`
  return formatTime(value)
}

function getDeviceHealth(device: AttendanceDevice) {
  if (!device.last_seen_at) return { label: 'بانتظار الموصل', tone: 'slate' as const, online: false }
  const age = Date.now() - new Date(device.last_seen_at).getTime()
  if (device.last_error) return { label: 'يحتاج مراجعة', tone: 'amber' as const, online: false }
  if (age <= 3 * 60 * 1000) return { label: 'متصل', tone: 'emerald' as const, online: true }
  return { label: 'غير متصل', tone: 'rose' as const, online: false }
}

interface AttendanceDayData {
  devices: AttendanceDevice[]
  deviceUsers: AttendanceDeviceUser[]
  mappings: AttendanceMapping[]
  events: AttendanceEvent[]
}

interface UnmatchedPerson {
  key: string
  deviceId: string
  deviceUserId: string
  displayName: string | null
  deviceName: string
  direction: 'entry' | 'exit'
  lastEvent: AttendanceEvent | null
}

interface WorkerDayRow {
  worker: WorkerWithUser
  events: AttendanceEvent[]
  lastEvent: AttendanceEvent | null
  analysis: AttendanceDayAnalysis
}

export default function AttendanceMonitoringPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()
  const [dateKey, setDateKey] = useState(getRiyadhDateKey)
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [attendance, setAttendance] = useState<AttendanceDayData>({ devices: [], deviceUsers: [], mappings: [], events: [] })
  const [prayerTimes, setPrayerTimes] = useState<AttendancePrayerTime[]>([])
  const [view, setView] = useState<'daily' | 'monthly'>('daily')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prayerError, setPrayerError] = useState<string | null>(null)
  const [mappingChoices, setMappingChoices] = useState<Record<string, string>>({})
  const [savingMapping, setSavingMapping] = useState<string | null>(null)

  const isAuthorized = Boolean(
    user && (
      user.role === 'admin'
      || (user.role === 'worker' && workerType === 'workshop_manager')
    )
  )

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    if (!permissionsLoading && !isAuthorized) router.push('/dashboard')
  }, [isAuthorized, permissionsLoading, router, user])

  const loadAttendance = useCallback(async () => {
    if (!isAuthorized) return
    setIsLoading(true)
    setError(null)
    setPrayerError(null)
    try {
      const [workersResult, attendanceResult, prayersResult] = await Promise.all([
        attendanceService.getWorkers(),
        attendanceService.getDay(dateKey),
        attendanceService.getPrayerTimesMonth(dateKey.slice(0, 7)).catch((prayerLoadError) => {
          console.error('Failed to load prayer times:', prayerLoadError)
          return null
        }),
      ])

      setWorkers(workersResult.filter((worker) => worker.user?.is_active !== false))
      setAttendance(attendanceResult)
      setPrayerTimes(prayersResult || [])
      if (!prayersResult) {
        setPrayerError('تعذر تحميل مواقيت الصلاة؛ لا تعتمد تصنيف الخروج لهذا اليوم قبل المراجعة.')
      }
    } catch (loadError) {
      console.error('Failed to load attendance dashboard:', loadError)
      setError('تعذر تحميل سجلات الحضور. تأكد من تطبيق تحديث قاعدة البيانات ثم أعد المحاولة.')
    } finally {
      setIsLoading(false)
    }
  }, [dateKey, isAuthorized])

  useEffect(() => {
    void loadAttendance()
  }, [loadAttendance])

  const mappingWorkerByTerminal = useMemo(() => new Map(
      attendance.mappings.map((mapping) => [
        `${mapping.device_id}:${mapping.device_user_id}`,
        mapping.worker_id,
      ])
    ), [attendance.mappings])

  const effectiveWorkerByEvent = useMemo(() => new Map(attendance.events.map((event) => [
      event.id,
      event.worker_id || mappingWorkerByTerminal.get(`${event.device_id}:${event.device_user_id}`) || null,
    ])), [attendance.events, mappingWorkerByTerminal])

  const eventsByWorker = useMemo(() => {
    const grouped = new Map<string, AttendanceEvent[]>()
    for (const event of attendance.events) {
      const workerId = effectiveWorkerByEvent.get(event.id)
      if (!workerId) continue
      const events = grouped.get(workerId) || []
      events.push(event)
      grouped.set(workerId, events)
    }
    return grouped
  }, [attendance.events, effectiveWorkerByEvent])

  const prayerTimesByDate = useMemo(() => new Map(
    prayerTimes.map((day) => [day.date, day])
  ), [prayerTimes])

  const selectedPrayerTimes = prayerTimesByDate.get(dateKey) || null

  const rows = useMemo<WorkerDayRow[]>(() => workers.map((worker) => {
    const events = eventsByWorker.get(worker.id) || []
    const lastEvent = events.at(-1) || null
    const analysis = analyzeAttendanceDay(dateKey, events, selectedPrayerTimes)

    return { worker, events, lastEvent, analysis }
  }), [dateKey, eventsByWorker, selectedPrayerTimes, workers])

  const unmatchedPeople = useMemo<UnmatchedPerson[]>(() => {
    const devices = new Map(attendance.devices.map((device) => [device.id, device]))
    const lastEventByTerminal = new Map<string, AttendanceEvent>()
    for (const event of attendance.events) {
      const key = `${event.device_id}:${event.device_user_id}`
      lastEventByTerminal.set(key, event)
    }

    const unique = new Map<string, UnmatchedPerson>()
    for (const terminalUser of attendance.deviceUsers) {
      const key = `${terminalUser.device_id}:${terminalUser.device_user_id}`
      if (mappingWorkerByTerminal.has(key)) continue
      const device = devices.get(terminalUser.device_id)
      if (!device) continue
      unique.set(key, {
        key,
        deviceId: terminalUser.device_id,
        deviceUserId: terminalUser.device_user_id,
        displayName: terminalUser.display_name,
        deviceName: device.name,
        direction: device.direction,
        lastEvent: lastEventByTerminal.get(key) || null,
      })
    }

    for (const event of attendance.events) {
      if (effectiveWorkerByEvent.get(event.id)) continue
      const key = `${event.device_id}:${event.device_user_id}`
      if (unique.has(key)) continue
      const device = devices.get(event.device_id)
      unique.set(key, {
        key,
        deviceId: event.device_id,
        deviceUserId: event.device_user_id,
        displayName: event.device_person_name,
        deviceName: device?.name || (event.direction === 'entry' ? 'جهاز الدخول' : 'جهاز الخروج'),
        direction: event.direction,
        lastEvent: event,
      })
    }

    return [...unique.values()].sort((first, second) =>
      (first.displayName || first.deviceUserId).localeCompare(second.displayName || second.deviceUserId, 'ar')
    )
  }, [attendance.deviceUsers, attendance.devices, attendance.events, effectiveWorkerByEvent, mappingWorkerByTerminal])

  const summary = useMemo(() => ({
    present: rows.filter((row) => row.events.length > 0).length,
    inside: rows.filter((row) => row.lastEvent?.direction === 'entry').length,
    absent: rows.filter((row) => row.analysis.status === 'absent').length,
    delayMinutes: rows.reduce((total, row) => total + row.analysis.totalDelayMinutes, 0),
    deficitMinutes: rows.reduce((total, row) => total + row.analysis.totalDeficitMinutes, 0),
    overtimeMinutes: rows.reduce((total, row) => total + row.analysis.totalOvertimeMinutes, 0),
  }), [rows])

  const saveMapping = async (person: UnmatchedPerson) => {
    const { key } = person
    const workerId = mappingChoices[key]
    if (!workerId) return
    setSavingMapping(key)
    setError(null)
    try {
      await attendanceService.saveMapping(person.deviceId, person.deviceUserId, workerId)
      await loadAttendance()
    } catch (saveError) {
      console.error('Failed to save attendance mapping:', saveError)
      setError('تعذر ربط رقم الجهاز بالعامل. تحقق من صلاحيات الحساب وأعد المحاولة.')
    } finally {
      setSavingMapping(null)
    }
  }

  if (!user || permissionsLoading || !isAuthorized) {
    return <AttendanceLoading />
  }

  return (
    <div className="min-h-screen bg-[#f4faf9] text-slate-900" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-teal-100/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard/worker-monitoring"
              className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-teal-700 transition hover:text-teal-900"
            >
              <ArrowRight className="h-5 w-5" />
              <span className="hidden sm:inline">متابعة العمال</span>
            </Link>
            <span className="h-5 w-px bg-slate-200" />
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-950 text-white shadow-sm">
                <Fingerprint className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold sm:text-base">الحضور والانصراف</h1>
                <p className="hidden text-xs text-slate-500 sm:block">توقيت الرياض · تحديث آمن من جهازي البصمة</p>
              </div>
            </div>
          </div>
          {view === 'daily' && (
            <button
              type="button"
              onClick={() => void loadAttendance()}
              disabled={isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[1.75rem] bg-teal-950 text-white shadow-[0_20px_60px_-35px_rgba(15,118,110,0.7)]">
          <div className="relative px-5 py-6 sm:px-7 sm:py-8">
            <div className="absolute -left-10 -top-20 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-teal-200">
                  <CircleDot className="h-3.5 w-3.5" />
                  {view === 'daily' ? 'لوحة تشغيل يومية' : 'دفتر الحضور الشهري'}
                </p>
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                  {view === 'daily' ? 'الحركة اليومية محسوبة بالدقيقة' : 'مراجعة الغياب والتأخير والعمل الإضافي'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-teal-100/80">
                  {view === 'daily'
                    ? 'الصلاة لها نافذة خروج ساعة بعد الأذان، ومدة سماح 20 دقيقة. سجلات الجهاز الخام تبقى محفوظة دون تعديل.'
                    : 'الجمعة عطلة، وإجمالي النقص منفصل عن ساعات العمل الإضافية حتى تبقى المراجعة واضحة.'}
                </p>
              </div>
              {view === 'daily' && (
                <label className="flex w-full max-w-xs items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur sm:w-auto">
                  <CalendarDays className="h-5 w-5 text-cyan-300" />
                  <span className="text-xs font-semibold text-teal-100">اليوم</span>
                  <input
                    type="date"
                    value={dateKey}
                    onChange={(event) => setDateKey(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-left text-sm font-bold text-white outline-none [color-scheme:dark]"
                  />
                </label>
              )}
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm print:hidden">
          <button
            type="button"
            onClick={() => setView('daily')}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
              view === 'daily' ? 'bg-teal-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            السجل اليومي
          </button>
          <button
            type="button"
            onClick={() => setView('monthly')}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
              view === 'monthly' ? 'bg-teal-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            التقرير الشهري
          </button>
        </div>

        {view === 'daily' && error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {view === 'daily' ? (
          <>
            {prayerError && (
              <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>{prayerError}</p>
              </div>
            )}

            <PrayerSchedule prayerTimes={selectedPrayerTimes} />

            <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <SummaryCard label="سجلوا اليوم" value={summary.present} icon={UserRoundCheck} tone="teal" />
              <SummaryCard label="داخل الموقع" value={summary.inside} icon={LogIn} tone="cyan" />
              <SummaryCard label="غياب" value={summary.absent} icon={UsersRound} tone="slate" />
              <SummaryCard label="إجمالي التأخير" value={formatAttendanceDuration(summary.delayMinutes)} icon={TimerReset} tone="amber" />
              <SummaryCard label="إجمالي النقص" value={formatAttendanceDuration(summary.deficitMinutes)} icon={LogOut} tone="rose" />
              <SummaryCard label="العمل الإضافي" value={formatAttendanceDuration(summary.overtimeMinutes)} icon={Clock3} tone="sky" />
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900">حالة الأجهزة</h3>
                <p className="mt-1 text-xs text-slate-500">الاتصال يعني أن الموصل يرسل نبضات متابعة للموقع.</p>
              </div>
              <ShieldCheck className="h-6 w-6 text-teal-600" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {attendance.devices.length > 0 ? attendance.devices.map((device) => (
                <DeviceCard key={device.id} device={device} />
              )) : (
                <EmptyInline icon={Unplug} text="ستظهر أجهزة الدخول والخروج بعد تطبيق تحديث قاعدة البيانات." />
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900">مستخدمون يحتاجون ربطًا</h3>
                <p className="mt-1 text-xs text-slate-500">القائمة الكاملة المستردة من جهازي الدخول والخروج.</p>
              </div>
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-amber-100 px-2 text-xs font-black text-amber-800">
                {unmatchedPeople.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {unmatchedPeople.length === 0 ? (
                <EmptyInline icon={Check} text="كل الأرقام الواردة مرتبطة بعمال الموقع." />
              ) : unmatchedPeople.map((person) => (
                <div key={person.key} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{person.displayName || `رقم ${person.deviceUserId}`}</p>
                      <p className="mt-0.5 text-xs text-slate-500">معرّف الجهاز: {person.deviceUserId} · {person.deviceName}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-amber-800 shadow-sm">
                        {person.direction === 'entry' ? 'دخول' : 'خروج'}
                      </span>
                      {!person.lastEvent && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">لم يسجل حركة اليوم</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <select
                      aria-label={`اختر العامل للرقم ${person.deviceUserId}`}
                      value={mappingChoices[person.key] || ''}
                      onChange={(choice) => setMappingChoices((current) => ({ ...current, [person.key]: choice.target.value }))}
                      className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">اختر العامل</option>
                      {workers.map((worker) => (
                        <option key={worker.id} value={worker.id}>{worker.user.full_name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!mappingChoices[person.key] || savingMapping === person.key}
                      onClick={() => void saveMapping(person)}
                      className="rounded-xl bg-teal-700 px-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingMapping === person.key ? '...' : 'ربط'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h3 className="font-black text-slate-900">سجل العمال اليومي</h3>
              <p className="mt-1 text-xs text-slate-500">افتح سطر العامل لرؤية تفاصيل التأخير والصلاة والعمل الإضافي.</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{rows.length} عامل</span>
          </div>

          {isLoading ? (
            <div className="grid min-h-56 place-items-center">
              <RefreshCw className="h-7 w-7 animate-spin text-teal-600" />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">لا يوجد عمال نشطون لعرضهم.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => <WorkerAttendanceRow key={row.worker.id} row={row} />)}
            </div>
          )}
            </section>
          </>
        ) : (
          <MonthlyAttendanceReport workers={workers} initialMonth={dateKey.slice(0, 7)} />
        )}
      </main>
    </div>
  )
}

function AttendanceLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f4faf9]" dir="rtl">
      <div className="text-center">
        <Fingerprint className="mx-auto h-10 w-10 animate-pulse text-teal-700" />
        <p className="mt-3 text-sm font-semibold text-slate-600">جاري تجهيز سجل الحضور...</p>
      </div>
    </div>
  )
}

function PrayerSchedule({ prayerTimes }: { prayerTimes: AttendancePrayerTime | null }) {
  const prayers = [
    { key: 'dhuhr_at' as const, label: 'الظهر' },
    { key: 'maghrib_at' as const, label: 'المغرب' },
    { key: 'isha_at' as const, label: 'العشاء' },
  ]

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-teal-100 bg-[linear-gradient(120deg,#ffffff_0%,#f0fdfa_65%,#ecfeff_100%)] shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-950 text-cyan-200 shadow-sm">
            <MoonStar className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900">نوافذ الصلاة في الخبر</h3>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500">الخروج من الأذان ولمدة ساعة · السماح خارج المشغل 20 دقيقة</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[390px]">
          {prayers.map((prayer) => (
            <div key={prayer.key} className="rounded-xl border border-white bg-white/80 px-3 py-2 text-center shadow-sm">
              <span className="block text-[10px] font-bold text-slate-400">{prayer.label}</span>
              <strong className="mt-0.5 block text-sm font-black tabular-nums text-teal-900">
                {formatTime(prayerTimes?.[prayer.key] || null)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  icon: typeof LogIn
  tone: 'teal' | 'cyan' | 'emerald' | 'slate' | 'amber' | 'rose' | 'sky'
}) {
  const styles = {
    teal: 'bg-teal-50 text-teal-800 ring-teal-100',
    cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-100',
    amber: 'bg-amber-50 text-amber-800 ring-amber-100',
    rose: 'bg-rose-50 text-rose-800 ring-rose-100',
    sky: 'bg-sky-50 text-sky-800 ring-sky-100',
  }[tone]

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ring-1 ${styles}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="truncate text-xl font-black tabular-nums text-slate-950 sm:text-2xl" title={String(value)}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
    </div>
  )
}

function DeviceCard({ device }: { device: AttendanceDevice }) {
  const health = getDeviceHealth(device)
  const tone = {
    emerald: 'bg-emerald-500 shadow-emerald-200',
    amber: 'bg-amber-500 shadow-amber-200',
    rose: 'bg-rose-500 shadow-rose-200',
    slate: 'bg-slate-400 shadow-slate-200',
  }[health.tone]

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`mt-1 h-2.5 w-2.5 rounded-full shadow-[0_0_0_5px] ${tone}`} />
          <div>
            <h4 className="text-sm font-black text-slate-900">{device.name}</h4>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{health.label}</p>
          </div>
        </div>
        {device.direction === 'entry'
          ? <LogIn className="h-5 w-5 text-teal-700" />
          : <LogOut className="h-5 w-5 text-cyan-700" />}
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
        <span>آخر اتصال</span>
        <span className="font-bold text-slate-700">{formatLastSeen(device.last_seen_at)}</span>
      </div>
    </article>
  )
}

function EmptyInline({ icon: Icon, text }: { icon: typeof Check; text: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 px-4 text-center text-xs font-semibold leading-5 text-slate-500 sm:col-span-2">
      <Icon className="h-4 w-4 shrink-0 text-teal-600" />
      <span>{text}</span>
    </div>
  )
}

function WorkerAttendanceRow({ row }: { row: WorkerDayRow }) {
  const status = getDayStatus(row.analysis)
  const metric = (minutes: number) => minutes > 0 ? formatAttendanceDuration(minutes) : '—'

  return (
    <details className="group transition open:bg-slate-50/60">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:grid-cols-[minmax(180px,1.35fr)_repeat(4,minmax(90px,0.72fr))_auto] sm:items-center sm:px-6 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-sm font-black text-teal-800 ring-1 ring-teal-100">
            {row.worker.user.full_name.trim().charAt(0) || 'ع'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-900">{row.worker.user.full_name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{row.worker.specialty || 'عامل'} · {row.events.length} حركة</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black sm:hidden ${status.classes}`}>{status.label}</span>
        </div>
        <TimeCell label="أول دخول" value={formatTime(row.analysis.firstEntryAt)} icon={LogIn} />
        <TimeCell label="التأخير" value={metric(row.analysis.totalDelayMinutes)} icon={TimerReset} />
        <TimeCell label="إجمالي النقص" value={metric(row.analysis.totalDeficitMinutes)} icon={LogOut} />
        <TimeCell label="العمل الإضافي" value={metric(row.analysis.totalOvertimeMinutes)} icon={Clock3} />
        <div className="hidden items-center justify-end gap-2 sm:flex">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black ${status.classes}`}>{status.label}</span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-180">⌄</span>
        </div>
      </summary>

      <div className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <DetailMetric label="آخر خروج" value={formatTime(row.analysis.lastExitAt)} tone="slate" />
          <DetailMetric label="تأخير الصباح" value={metric(row.analysis.morningLateMinutes)} tone="amber" />
          <DetailMetric label="تجاوز الصلاة" value={metric(row.analysis.prayerOverrunMinutes)} tone="amber" />
          <DetailMetric label="بعد الاستراحة" value={metric(row.analysis.breakLateMinutes)} tone="amber" />
          <DetailMetric label="خروج غير مبرر" value={metric(row.analysis.unexcusedMinutes)} tone="rose" />
          <DetailMetric label="خروج مبكر" value={metric(row.analysis.earlyDepartureMinutes)} tone="rose" />
          <DetailMetric label="إضافي الاستراحة" value={metric(row.analysis.breakOvertimeMinutes)} tone="sky" />
          <DetailMetric label="إضافي بعد 10:30" value={metric(row.analysis.endOvertimeMinutes + row.analysis.holidayOvertimeMinutes)} tone="sky" />
        </div>

        {row.analysis.prayerTrips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {row.analysis.prayerTrips.map((trip) => (
              <span key={`${trip.prayer}-${trip.exitAt}`} className="rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-bold text-teal-800 ring-1 ring-teal-100">
                {getPrayerLabel(trip.prayer)}: {formatTime(trip.exitAt)}–{formatTime(trip.entryAt)} · {formatAttendanceDuration(trip.durationMinutes)}
                {trip.overrunMinutes > 0 ? ` · تجاوز ${formatAttendanceDuration(trip.overrunMinutes)}` : ''}
              </span>
            ))}
          </div>
        )}

        {row.events.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <span className="ml-1 text-[10px] font-black text-slate-400">تسلسل الحركات</span>
            {row.events.map((event) => (
              <span key={event.id} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${
                event.direction === 'entry' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}>
                {event.direction === 'entry' ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                {formatTime(event.occurred_at)}
              </span>
            ))}
          </div>
        )}

        {row.analysis.anomalies.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-900">
            {row.analysis.anomalies.join(' · ')}
          </p>
        )}
      </div>
    </details>
  )
}

function getDayStatus(analysis: AttendanceDayAnalysis) {
  if (analysis.isInside && !analysis.isClosed) return { label: 'داخل الموقع', classes: 'bg-cyan-100 text-cyan-800' }
  return {
    present: { label: 'حاضر', classes: 'bg-emerald-100 text-emerald-800' },
    absent: { label: 'غياب', classes: 'bg-rose-100 text-rose-800' },
    friday: { label: 'عطلة الجمعة', classes: 'bg-slate-100 text-slate-600' },
    friday_work: { label: 'عمل الجمعة', classes: 'bg-sky-100 text-sky-800' },
    pending: { label: 'بانتظار التسجيل', classes: 'bg-slate-100 text-slate-600' },
    needs_review: { label: 'يحتاج مراجعة', classes: 'bg-amber-100 text-amber-800' },
  }[analysis.status]
}

function getPrayerLabel(prayer: 'dhuhr' | 'maghrib' | 'isha') {
  return { dhuhr: 'الظهر', maghrib: 'المغرب', isha: 'العشاء' }[prayer]
}

function DetailMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'slate' | 'amber' | 'rose' | 'sky'
}) {
  const styles = {
    slate: 'bg-white text-slate-800 ring-slate-200',
    amber: 'bg-amber-50/70 text-amber-900 ring-amber-100',
    rose: 'bg-rose-50/70 text-rose-900 ring-rose-100',
    sky: 'bg-sky-50/70 text-sky-900 ring-sky-100',
  }[tone]
  return (
    <div className={`rounded-xl px-3 py-2.5 ring-1 ${styles}`}>
      <span className="block text-[10px] font-bold opacity-60">{label}</span>
      <strong className="mt-1 block text-xs font-black tabular-nums">{value}</strong>
    </div>
  )
}

function TimeCell({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock3 }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 sm:block sm:bg-transparent sm:p-0">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <strong className="text-sm font-black tabular-nums text-slate-800 sm:mt-1 sm:block">{value}</strong>
    </div>
  )
}
