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
  Eye,
  Fingerprint,
  LogIn,
  LogOut,
  MoonStar,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Unlink,
  Unplug,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import type { WorkerWithUser } from '@/lib/services/worker-service'
import {
  attendanceService,
  isAttendanceSuspendedOnDate,
  isAttendanceSuspensionActive,
  type AttendanceDevice,
  type AttendanceDeviceUser,
  type AttendanceEvent,
  type AttendanceMapping,
  type AttendanceWorkerSuspension,
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

interface SuspendedWorkerEntry {
  worker: WorkerWithUser
  suspension: AttendanceWorkerSuspension
}

interface AttendanceAction {
  type: 'suspend' | 'resume'
  worker: WorkerWithUser
}

interface MappingRemovalAction {
  mapping: AttendanceMapping
  worker: WorkerWithUser
  device: AttendanceDevice | null
}

export default function AttendanceMonitoringPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()
  const [dateKey, setDateKey] = useState(getRiyadhDateKey)
  const [workers, setWorkers] = useState<WorkerWithUser[]>([])
  const [suspensions, setSuspensions] = useState<AttendanceWorkerSuspension[]>([])
  const [attendance, setAttendance] = useState<AttendanceDayData>({ devices: [], deviceUsers: [], mappings: [], events: [] })
  const [prayerTimes, setPrayerTimes] = useState<AttendancePrayerTime[]>([])
  const [view, setView] = useState<'daily' | 'monthly'>('daily')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prayerError, setPrayerError] = useState<string | null>(null)
  const [mappingChoices, setMappingChoices] = useState<Record<string, string>>({})
  const [savingMapping, setSavingMapping] = useState<string | null>(null)
  const [mappingRemovalAction, setMappingRemovalAction] = useState<MappingRemovalAction | null>(null)
  const [removingMappingId, setRemovingMappingId] = useState<string | null>(null)
  const [attendanceAction, setAttendanceAction] = useState<AttendanceAction | null>(null)
  const [updatingSuspensionWorkerId, setUpdatingSuspensionWorkerId] = useState<string | null>(null)

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
      const [workersResult, suspensionsResult, attendanceResult, prayersResult] = await Promise.all([
        attendanceService.getWorkers(),
        attendanceService.getWorkerSuspensions(),
        attendanceService.getDay(dateKey),
        attendanceService.getPrayerTimesMonth(dateKey.slice(0, 7)).catch((prayerLoadError) => {
          console.error('Failed to load prayer times:', prayerLoadError)
          return null
        }),
      ])

      setWorkers(workersResult.filter((worker) => worker.user?.is_active !== false))
      setSuspensions(suspensionsResult)
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

  const activeSuspensionByWorker = useMemo(() => {
    const byWorker = new Map<string, AttendanceWorkerSuspension>()
    for (const suspension of suspensions) {
      if (isAttendanceSuspensionActive(suspension) && !byWorker.has(suspension.worker_id)) {
        byWorker.set(suspension.worker_id, suspension)
      }
    }
    return byWorker
  }, [suspensions])

  const selectedDateSuspensionByWorker = useMemo(() => {
    const byWorker = new Map<string, AttendanceWorkerSuspension>()
    for (const suspension of suspensions) {
      if (isAttendanceSuspendedOnDate(suspension, dateKey) && !byWorker.has(suspension.worker_id)) {
        byWorker.set(suspension.worker_id, suspension)
      }
    }
    return byWorker
  }, [dateKey, suspensions])

  const activeWorkers = useMemo(() => workers.filter(
    (worker) => !activeSuspensionByWorker.has(worker.id)
  ), [activeSuspensionByWorker, workers])

  const attendanceWorkers = useMemo(() => activeWorkers.filter(
    (worker) => !selectedDateSuspensionByWorker.has(worker.id)
  ), [activeWorkers, selectedDateSuspensionByWorker])

  const activeSuspendedWorkers = useMemo<SuspendedWorkerEntry[]>(() => workers.flatMap((worker) => {
    const suspension = activeSuspensionByWorker.get(worker.id)
    return suspension ? [{ worker, suspension }] : []
  }), [activeSuspensionByWorker, workers])

  const historicalSuspendedWorkers = useMemo<SuspendedWorkerEntry[]>(() => workers.flatMap((worker) => {
    const suspension = selectedDateSuspensionByWorker.get(worker.id)
    if (!suspension || activeSuspensionByWorker.has(worker.id)) return []
    return [{ worker, suspension }]
  }), [activeSuspensionByWorker, selectedDateSuspensionByWorker, workers])

  const devicesById = useMemo(() => new Map(
    attendance.devices.map((device) => [device.id, device])
  ), [attendance.devices])

  const deviceUsersByTerminal = useMemo(() => new Map(
    attendance.deviceUsers.map((deviceUser) => [
      `${deviceUser.device_id}:${deviceUser.device_user_id}`,
      deviceUser,
    ])
  ), [attendance.deviceUsers])

  const mappingsByWorker = useMemo(() => {
    const grouped = new Map<string, AttendanceMapping[]>()
    for (const mapping of attendance.mappings) {
      const workerMappings = grouped.get(mapping.worker_id) || []
      workerMappings.push(mapping)
      grouped.set(mapping.worker_id, workerMappings)
    }
    return grouped
  }, [attendance.mappings])

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

  const rows = useMemo<WorkerDayRow[]>(() => attendanceWorkers.map((worker) => {
    const events = eventsByWorker.get(worker.id) || []
    const lastEvent = events.at(-1) || null
    const analysis = analyzeAttendanceDay(dateKey, events, selectedPrayerTimes)

    return { worker, events, lastEvent, analysis }
  }), [attendanceWorkers, dateKey, eventsByWorker, selectedPrayerTimes])

  const unmatchedPeople = useMemo<UnmatchedPerson[]>(() => {
    const devices = new Map(attendance.devices.map((device) => [device.id, device]))
    const lastEventByTerminal = new Map<string, AttendanceEvent>()
    for (const event of attendance.events) {
      const key = `${event.device_id}:${event.device_user_id}`
      lastEventByTerminal.set(key, event)
    }

    const unique = new Map<string, UnmatchedPerson>()
    for (const terminalUser of attendance.deviceUsers) {
      if (!terminalUser.is_present_on_device) continue
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

  const confirmMappingRemoval = async () => {
    if (!mappingRemovalAction) return
    const { mapping } = mappingRemovalAction
    setRemovingMappingId(mapping.id)
    setError(null)

    try {
      await attendanceService.removeMapping(mapping.id)
      setMappingRemovalAction(null)
      await loadAttendance()
    } catch (removalError) {
      console.error('Failed to remove attendance mapping:', removalError)
      setError('تعذر إزالة ربط معرّف الجهاز. تحقق من صلاحيات الحساب وأعد المحاولة.')
      setMappingRemovalAction(null)
    } finally {
      setRemovingMappingId(null)
    }
  }

  const confirmAttendanceAction = async () => {
    if (!attendanceAction) return
    const { type, worker } = attendanceAction
    setUpdatingSuspensionWorkerId(worker.id)
    setError(null)

    try {
      if (type === 'suspend') {
        await attendanceService.suspendWorker(worker.id)
      } else {
        await attendanceService.resumeWorker(worker.id)
      }
      setAttendanceAction(null)
      await loadAttendance()
    } catch (actionError) {
      console.error(`Failed to ${type} attendance worker:`, actionError)
      setError(type === 'suspend'
        ? 'تعذر تعليق العامل من الحضور. تحقق من صلاحيات الحساب وأعد المحاولة.'
        : 'تعذر استئناف العامل في الحضور. تحقق من صلاحيات الحساب وأعد المحاولة.')
      setAttendanceAction(null)
    } finally {
      setUpdatingSuspensionWorkerId(null)
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

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <SuspendedWorkersSection
          activeEntries={activeSuspendedWorkers}
          historicalEntries={view === 'daily' ? historicalSuspendedWorkers : []}
          selectedDateKey={view === 'daily' ? dateKey : null}
          mappingsByWorker={mappingsByWorker}
          devicesById={devicesById}
          deviceUsersByTerminal={deviceUsersByTerminal}
          removingMappingId={removingMappingId}
          updatingWorkerId={updatingSuspensionWorkerId}
          onResume={(worker) => setAttendanceAction({ type: 'resume', worker })}
          onRemoveMapping={(worker, mapping) => setMappingRemovalAction({
            worker,
            mapping,
            device: devicesById.get(mapping.device_id) || null,
          })}
        />

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
                      {activeWorkers.map((worker) => (
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
              {rows.map((row) => (
                <WorkerAttendanceRow
                  key={row.worker.id}
                  row={row}
                  mappings={mappingsByWorker.get(row.worker.id) || []}
                  devicesById={devicesById}
                  deviceUsersByTerminal={deviceUsersByTerminal}
                  removingMappingId={removingMappingId}
                  isUpdating={updatingSuspensionWorkerId === row.worker.id}
                  onSuspend={(worker) => setAttendanceAction({ type: 'suspend', worker })}
                  onRemoveMapping={(worker, mapping) => setMappingRemovalAction({
                    worker,
                    mapping,
                    device: devicesById.get(mapping.device_id) || null,
                  })}
                />
              ))}
            </div>
          )}
            </section>
          </>
        ) : (
          <MonthlyAttendanceReport
            workers={activeWorkers}
            suspensions={suspensions}
            initialMonth={dateKey.slice(0, 7)}
          />
        )}
      </main>
      {attendanceAction && (
        <AttendanceActionDialog
          action={attendanceAction}
          isSaving={updatingSuspensionWorkerId === attendanceAction.worker.id}
          onCancel={() => setAttendanceAction(null)}
          onConfirm={() => void confirmAttendanceAction()}
        />
      )}
      {mappingRemovalAction && (
        <MappingRemovalDialog
          action={mappingRemovalAction}
          isSaving={removingMappingId === mappingRemovalAction.mapping.id}
          onCancel={() => setMappingRemovalAction(null)}
          onConfirm={() => void confirmMappingRemoval()}
        />
      )}
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

function SuspendedWorkersSection({
  activeEntries,
  historicalEntries,
  selectedDateKey,
  mappingsByWorker,
  devicesById,
  deviceUsersByTerminal,
  removingMappingId,
  updatingWorkerId,
  onResume,
  onRemoveMapping,
}: {
  activeEntries: SuspendedWorkerEntry[]
  historicalEntries: SuspendedWorkerEntry[]
  selectedDateKey: string | null
  mappingsByWorker: ReadonlyMap<string, AttendanceMapping[]>
  devicesById: ReadonlyMap<string, AttendanceDevice>
  deviceUsersByTerminal: ReadonlyMap<string, AttendanceDeviceUser>
  removingMappingId: string | null
  updatingWorkerId: string | null
  onResume: (worker: WorkerWithUser) => void
  onRemoveMapping: (worker: WorkerWithUser, mapping: AttendanceMapping) => void
}) {
  const hasEntries = activeEntries.length > 0 || historicalEntries.length > 0

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-amber-200/80 bg-white shadow-sm print:hidden" aria-labelledby="suspended-workers-title">
      <div className="flex flex-col gap-3 border-b border-amber-100 bg-[linear-gradient(120deg,#fffbeb_0%,#ffffff_70%)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800 ring-1 ring-amber-200">
            <Eye className="h-5 w-5" />
          </span>
          <div>
            <h3 id="suspended-workers-title" className="font-black text-slate-900">العمال المستثنون من الحضور</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              تظهر أسماؤهم هنا للاطلاع فقط، وتبقى حركات البصمة محفوظة دون أن تدخل في الجداول أو الإحصاءات.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-900 ring-1 ring-amber-200">
          {activeEntries.length} معلّق حاليًا
        </span>
      </div>

      {!hasEntries ? (
        <div className="flex min-h-24 items-center justify-center gap-2 px-5 text-center text-xs font-semibold text-slate-500">
          <Check className="h-4 w-4 text-teal-600" />
          لا يوجد عمال مستثنون حاليًا.
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          {activeEntries.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {activeEntries.map((entry) => (
                <SuspendedWorkerCard
                  key={entry.suspension.id}
                  entry={entry}
                  isActive
                  mappings={mappingsByWorker.get(entry.worker.id) || []}
                  devicesById={devicesById}
                  deviceUsersByTerminal={deviceUsersByTerminal}
                  removingMappingId={removingMappingId}
                  isUpdating={updatingWorkerId === entry.worker.id}
                  onResume={onResume}
                  onRemoveMapping={onRemoveMapping}
                />
              ))}
            </div>
          )}

          {historicalEntries.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-black text-slate-500">
                <span className="h-px flex-1 bg-slate-200" />
                مستثنون في {selectedDateKey ? formatSelectedDate(selectedDateKey) : 'اليوم المحدد'}
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {historicalEntries.map((entry) => (
                  <SuspendedWorkerCard
                    key={entry.suspension.id}
                    entry={entry}
                    isActive={false}
                    mappings={mappingsByWorker.get(entry.worker.id) || []}
                    devicesById={devicesById}
                    deviceUsersByTerminal={deviceUsersByTerminal}
                    removingMappingId={removingMappingId}
                    isUpdating={false}
                    onResume={onResume}
                    onRemoveMapping={onRemoveMapping}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SuspendedWorkerCard({
  entry,
  isActive,
  mappings,
  devicesById,
  deviceUsersByTerminal,
  removingMappingId,
  isUpdating,
  onResume,
  onRemoveMapping,
}: {
  entry: SuspendedWorkerEntry
  isActive: boolean
  mappings: AttendanceMapping[]
  devicesById: ReadonlyMap<string, AttendanceDevice>
  deviceUsersByTerminal: ReadonlyMap<string, AttendanceDeviceUser>
  removingMappingId: string | null
  isUpdating: boolean
  onResume: (worker: WorkerWithUser) => void
  onRemoveMapping: (worker: WorkerWithUser, mapping: AttendanceMapping) => void
}) {
  const { worker, suspension } = entry

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-slate-700 ring-1 ring-slate-200">
            {worker.user.full_name.trim().charAt(0) || 'ع'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">{worker.user.full_name}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
              عُلّق {formatSuspensionDate(suspension.suspended_at)}
              {!isActive && suspension.resumed_at ? ` · استؤنف ${formatSuspensionDate(suspension.resumed_at)}` : ''}
            </p>
          </div>
        </div>
        {isActive ? (
          <button
            type="button"
            onClick={() => onResume(worker)}
            disabled={isUpdating}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-xs font-black text-white transition hover:bg-teal-900 disabled:cursor-wait disabled:opacity-60"
          >
            {isUpdating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            استئناف العامل
          </button>
        ) : (
          <span className="w-fit shrink-0 rounded-full bg-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-600">تم الاستئناف</span>
        )}
      </div>
      <WorkerDeviceMappings
        className="mt-3"
        worker={worker}
        mappings={mappings}
        devicesById={devicesById}
        deviceUsersByTerminal={deviceUsersByTerminal}
        removingMappingId={removingMappingId}
        onRemoveMapping={onRemoveMapping}
      />
    </article>
  )
}

function WorkerDeviceMappings({
  worker,
  mappings,
  devicesById,
  deviceUsersByTerminal,
  removingMappingId,
  onRemoveMapping,
  className = '',
}: {
  worker: WorkerWithUser
  mappings: AttendanceMapping[]
  devicesById: ReadonlyMap<string, AttendanceDevice>
  deviceUsersByTerminal: ReadonlyMap<string, AttendanceDeviceUser>
  removingMappingId: string | null
  onRemoveMapping: (worker: WorkerWithUser, mapping: AttendanceMapping) => void
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-teal-100 bg-white p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-black text-slate-800">المعرّفات المتصلة بالعامل</p>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-800">
          {mappings.length}
        </span>
      </div>
      {mappings.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
          لا يوجد معرّف جهاز مرتبط بهذا العامل.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {mappings.map((mapping) => {
            const device = devicesById.get(mapping.device_id)
            const deviceUser = deviceUsersByTerminal.get(`${mapping.device_id}:${mapping.device_user_id}`)
            const direction = device?.direction === 'exit' ? 'خروج' : 'دخول'
            const isRemoving = removingMappingId === mapping.id

            return (
              <div key={mapping.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black ${
                      device?.direction === 'exit' ? 'bg-cyan-100 text-cyan-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {direction}
                    </span>
                    <b dir="ltr" className="truncate font-mono text-xs text-slate-900" title={mapping.device_user_id}>
                      {mapping.device_user_id}
                    </b>
                    <span className="truncate text-[11px] font-bold text-slate-700" title={deviceUser?.display_name || 'بدون اسم مسجل'}>
                      {deviceUser?.display_name || 'بدون اسم مسجل'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">
                    {device?.name || 'جهاز غير متاح'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMapping(worker, mapping)}
                  disabled={isRemoving}
                  aria-label={`إزالة ربط المعرّف ${mapping.device_user_id} من ${worker.user.full_name}`}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                >
                  {isRemoving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  إزالة الربط
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MappingRemovalDialog({
  action,
  isSaving,
  onCancel,
  onConfirm,
}: {
  action: MappingRemovalAction
  isSaving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mapping-removal-title">
      <div className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-800">
            <Unlink className="h-5 w-5" />
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="إغلاق"
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="mapping-removal-title" className="mt-4 text-xl font-black text-slate-950">إزالة ربط معرّف الجهاز؟</h2>
        <p className="mt-2 text-sm font-bold text-slate-800">{action.worker.user.full_name}</p>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{action.device?.name || 'جهاز غير متاح'}</p>
          <p dir="ltr" className="mt-1 text-left font-mono text-sm font-black text-slate-900">{action.mapping.device_user_id}</p>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          ستبقى سجلات الحضور السابقة محفوظة للعامل. الحركات الجديدة لهذا المعرّف ستظهر ضمن قائمة غير المرتبطين حتى يتم ربطه من جديد.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-black text-white transition hover:bg-rose-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            تأكيد الإزالة
          </button>
        </div>
      </div>
    </div>
  )
}

function AttendanceActionDialog({
  action,
  isSaving,
  onCancel,
  onConfirm,
}: {
  action: AttendanceAction
  isSaving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const isSuspending = action.type === 'suspend'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="attendance-action-title">
      <div className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isSuspending ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'}`}>
            {isSuspending ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="إغلاق"
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="attendance-action-title" className="mt-4 text-xl font-black text-slate-950">
          {isSuspending ? 'تعليق العامل من الحضور؟' : 'استئناف العامل في الحضور؟'}
        </h2>
        <p className="mt-2 text-sm font-bold text-slate-800">{action.worker.user.full_name}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isSuspending
            ? 'سيُخفى العامل من جدول الحضور ومن جميع الإحصاءات ابتداءً من اليوم. ستبقى سجلات جهاز البصمة محفوظة للرجوع فقط.'
            : 'سيعود العامل إلى الجدول والاحتساب ابتداءً من اليوم، مع بقاء أيام التعليق السابقة مستثناة من التقارير.'}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white transition disabled:cursor-wait disabled:opacity-60 ${isSuspending ? 'bg-amber-700 hover:bg-amber-800' : 'bg-teal-800 hover:bg-teal-900'}`}
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : isSuspending ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isSuspending ? 'تأكيد التعليق' : 'تأكيد الاستئناف'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatSuspensionDate(value: string) {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    timeZone: RIYADH_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatSelectedDate(dateKey: string) {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    timeZone: RIYADH_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00+03:00`))
}

function WorkerAttendanceRow({
  row,
  mappings,
  devicesById,
  deviceUsersByTerminal,
  removingMappingId,
  isUpdating,
  onSuspend,
  onRemoveMapping,
}: {
  row: WorkerDayRow
  mappings: AttendanceMapping[]
  devicesById: ReadonlyMap<string, AttendanceDevice>
  deviceUsersByTerminal: ReadonlyMap<string, AttendanceDeviceUser>
  removingMappingId: string | null
  isUpdating: boolean
  onSuspend: (worker: WorkerWithUser) => void
  onRemoveMapping: (worker: WorkerWithUser, mapping: AttendanceMapping) => void
}) {
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
            <p className="mt-0.5 truncate text-[10px] font-bold text-teal-700" title={mappings.map((mapping) => mapping.device_user_id).join('، ')}>
              المعرفات: {mappings.length > 0 ? mappings.map((mapping) => mapping.device_user_id).join('، ') : 'لا يوجد'}
            </p>
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
        <WorkerDeviceMappings
          className="mb-4"
          worker={row.worker}
          mappings={mappings}
          devicesById={devicesById}
          deviceUsersByTerminal={deviceUsersByTerminal}
          removingMappingId={removingMappingId}
          onRemoveMapping={onRemoveMapping}
        />
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-slate-800">إدارة إدراج العامل في الحضور</p>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500">التعليق لا يحذف أي حركة من جهاز البصمة.</p>
          </div>
          <button
            type="button"
            onClick={() => onSuspend(row.worker)}
            disabled={isUpdating}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
          >
            {isUpdating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            تعليق من الحضور
          </button>
        </div>
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
