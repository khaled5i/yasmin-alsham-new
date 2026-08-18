'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDot,
  Clock3,
  Fingerprint,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
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
  type AttendanceEvent,
  type AttendanceMapping,
} from '@/lib/services/attendance-service'

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
  mappings: AttendanceMapping[]
  events: AttendanceEvent[]
}

interface WorkerDayRow {
  worker: WorkerWithUser
  events: AttendanceEvent[]
  firstEntry: AttendanceEvent | null
  lastExit: AttendanceEvent | null
  lastEvent: AttendanceEvent | null
  workedMinutes: number | null
}

export default function AttendanceMonitoringPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()
  const [dateKey, setDateKey] = useState(getRiyadhDateKey)
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [attendance, setAttendance] = useState<AttendanceDayData>({ devices: [], mappings: [], events: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
    try {
      const [workersResult, attendanceResult] = await Promise.all([
        attendanceService.getWorkers(),
        attendanceService.getDay(dateKey),
      ])

      setWorkers(workersResult.filter((worker) => worker.user?.is_active !== false))
      setAttendance(attendanceResult)
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

  const effectiveWorkerByEvent = useMemo(() => {
    const mappings = new Map(
      attendance.mappings.map((mapping) => [
        `${mapping.device_id}:${mapping.device_user_id}`,
        mapping.worker_id,
      ])
    )

    return new Map(attendance.events.map((event) => [
      event.id,
      event.worker_id || mappings.get(`${event.device_id}:${event.device_user_id}`) || null,
    ]))
  }, [attendance.events, attendance.mappings])

  const rows = useMemo<WorkerDayRow[]>(() => workers.map((worker) => {
    const events = attendance.events.filter((event) => effectiveWorkerByEvent.get(event.id) === worker.id)
    const entries = events.filter((event) => event.direction === 'entry')
    const exits = events.filter((event) => event.direction === 'exit')
    const firstEntry = entries[0] || null
    const lastExit = exits.at(-1) || null
    const lastEvent = events.at(-1) || null
    const workedMinutes = firstEntry && lastExit && Date.parse(lastExit.occurred_at) >= Date.parse(firstEntry.occurred_at)
      ? Math.round((Date.parse(lastExit.occurred_at) - Date.parse(firstEntry.occurred_at)) / 60000)
      : null

    return { worker, events, firstEntry, lastExit, lastEvent, workedMinutes }
  }), [attendance.events, effectiveWorkerByEvent, workers])

  const unmatchedPeople = useMemo(() => {
    const unique = new Map<string, AttendanceEvent>()
    for (const event of attendance.events) {
      if (effectiveWorkerByEvent.get(event.id)) continue
      const key = `${event.device_id}:${event.device_user_id}`
      if (!unique.has(key)) unique.set(key, event)
    }
    return [...unique.entries()].map(([key, event]) => ({ key, event }))
  }, [attendance.events, effectiveWorkerByEvent])

  const summary = useMemo(() => ({
    present: rows.filter((row) => row.events.length > 0).length,
    inside: rows.filter((row) => row.lastEvent?.direction === 'entry').length,
    completed: rows.filter((row) => row.firstEntry && row.lastExit).length,
    absent: rows.filter((row) => row.events.length === 0).length,
  }), [rows])

  const saveMapping = async (key: string, event: AttendanceEvent) => {
    const workerId = mappingChoices[key]
    if (!workerId) return
    setSavingMapping(key)
    setError(null)
    try {
      await attendanceService.saveMapping(event.device_id, event.device_user_id, workerId)
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
          <button
            type="button"
            onClick={() => void loadAttendance()}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
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
                  لوحة تشغيل يومية
                </p>
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">من دخل، من خرج، ومن لم يسجل بعد</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-teal-100/80">
                  تُحفظ أوقات الحركة فقط. صور الوجه وقوالب البصمة تبقى داخل الجهاز ولا تُرسل إلى الموقع.
                </p>
              </div>
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
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="سجلوا اليوم" value={summary.present} icon={UserRoundCheck} tone="teal" />
          <SummaryCard label="داخل الموقع" value={summary.inside} icon={LogIn} tone="cyan" />
          <SummaryCard label="اكتمل يومهم" value={summary.completed} icon={Check} tone="emerald" />
          <SummaryCard label="بلا تسجيل" value={summary.absent} icon={UsersRound} tone="slate" />
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
                <h3 className="font-black text-slate-900">أرقام تحتاج ربطًا</h3>
                <p className="mt-1 text-xs text-slate-500">تظهر مرة واحدة عند وصول عامل جديد من الجهاز.</p>
              </div>
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-amber-100 px-2 text-xs font-black text-amber-800">
                {unmatchedPeople.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {unmatchedPeople.length === 0 ? (
                <EmptyInline icon={Check} text="كل الأرقام الواردة مرتبطة بعمال الموقع." />
              ) : unmatchedPeople.map(({ key, event }) => (
                <div key={key} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{event.device_person_name || `رقم ${event.device_user_id}`}</p>
                      <p className="mt-0.5 text-xs text-slate-500">معرّف الجهاز: {event.device_user_id}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-amber-800 shadow-sm">
                      {event.direction === 'entry' ? 'دخول' : 'خروج'}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <select
                      aria-label={`اختر العامل للرقم ${event.device_user_id}`}
                      value={mappingChoices[key] || ''}
                      onChange={(choice) => setMappingChoices((current) => ({ ...current, [key]: choice.target.value }))}
                      className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">اختر العامل</option>
                      {workers.map((worker) => (
                        <option key={worker.id} value={worker.id}>{worker.user.full_name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!mappingChoices[key] || savingMapping === key}
                      onClick={() => void saveMapping(key, event)}
                      className="rounded-xl bg-teal-700 px-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingMapping === key ? '...' : 'ربط'}
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
              <p className="mt-1 text-xs text-slate-500">أول دخول وآخر خروج وعدد الحركات المسجلة.</p>
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

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof LogIn
  tone: 'teal' | 'cyan' | 'emerald' | 'slate'
}) {
  const styles = {
    teal: 'bg-teal-50 text-teal-800 ring-teal-100',
    cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-100',
  }[tone]

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ring-1 ${styles}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="text-2xl font-black tabular-nums text-slate-950 sm:text-3xl">{value}</p>
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
  const hasEvents = row.events.length > 0
  const isInside = row.lastEvent?.direction === 'entry'
  const status = !hasEvents
    ? { label: 'بلا تسجيل', classes: 'bg-slate-100 text-slate-600' }
    : isInside
      ? { label: 'داخل الموقع', classes: 'bg-cyan-100 text-cyan-800' }
      : row.firstEntry && row.lastExit
        ? { label: 'اكتمل اليوم', classes: 'bg-emerald-100 text-emerald-800' }
        : { label: 'خروج فقط', classes: 'bg-amber-100 text-amber-800' }

  const duration = row.workedMinutes === null
    ? '—'
    : `${Math.floor(row.workedMinutes / 60)} س ${row.workedMinutes % 60} د`

  return (
    <article className="grid gap-4 px-5 py-4 transition hover:bg-slate-50/70 sm:grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(90px,0.75fr))] sm:items-center sm:px-6">
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-sm font-black text-teal-800 ring-1 ring-teal-100">
          {row.worker.user.full_name.trim().charAt(0) || 'ع'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900">{row.worker.user.full_name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{row.worker.specialty || 'عامل'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black sm:hidden ${status.classes}`}>{status.label}</span>
      </div>
      <TimeCell label="أول دخول" value={formatTime(row.firstEntry?.occurred_at || null)} icon={LogIn} />
      <TimeCell label="آخر خروج" value={formatTime(row.lastExit?.occurred_at || null)} icon={LogOut} />
      <TimeCell label="المدة" value={duration} icon={Clock3} />
      <div className="hidden justify-end sm:flex">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${status.classes}`}>{status.label}</span>
      </div>
      <p className="text-[11px] text-slate-400 sm:col-start-2 sm:col-span-3 sm:-mt-3">
        {row.events.length > 0 ? `${row.events.length} حركة مسجلة` : 'لم تصل أي حركة لهذا اليوم'}
      </p>
    </article>
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
