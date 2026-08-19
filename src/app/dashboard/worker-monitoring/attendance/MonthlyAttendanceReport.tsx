'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  ClockArrowDown,
  ClockArrowUp,
  FileText,
  Printer,
  RefreshCw,
  TriangleAlert,
  UserRoundX,
} from 'lucide-react'
import type { WorkerWithUser } from '@/lib/services/worker-service'
import {
  attendanceService,
  type AttendanceEvent,
  type AttendanceMapping,
} from '@/lib/services/attendance-service'
import {
  buildAttendanceMonthSummary,
  formatAttendanceDuration,
  groupAttendanceEventsByRiyadhDate,
  type AttendanceDayAnalysis,
  type AttendancePrayerTime,
} from '@/lib/attendance-analysis'

interface MonthlyAttendanceReportProps {
  workers: WorkerWithUser[]
  initialMonth: string
}

interface MonthData {
  mappings: AttendanceMapping[]
  events: AttendanceEvent[]
}

const STATUS_STYLES: Record<AttendanceDayAnalysis['status'], { label: string; classes: string }> = {
  present: { label: 'حاضر', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  absent: { label: 'غياب', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
  friday: { label: 'عطلة الجمعة', classes: 'bg-slate-100 text-slate-600 ring-slate-200' },
  friday_work: { label: 'عمل يوم عطلة', classes: 'bg-sky-50 text-sky-700 ring-sky-200' },
  pending: { label: 'لم يكتمل اليوم', classes: 'bg-slate-100 text-slate-600 ring-slate-200' },
  needs_review: { label: 'يحتاج مراجعة', classes: 'bg-amber-50 text-amber-800 ring-amber-200' },
}

function formatReportDate(dateKey: string) {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${dateKey}T12:00:00+03:00`))
}

function durationOrDash(minutes: number) {
  return minutes > 0 ? formatAttendanceDuration(minutes) : '—'
}

export default function MonthlyAttendanceReport({ workers, initialMonth }: MonthlyAttendanceReportProps) {
  const [monthKey, setMonthKey] = useState(initialMonth)
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? '')
  const [monthData, setMonthData] = useState<MonthData>({ mappings: [], events: [] })
  const [prayerTimes, setPrayerTimes] = useState<AttendancePrayerTime[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workerId && workers[0]) setWorkerId(workers[0].id)
  }, [workerId, workers])

  useEffect(() => {
    let isCurrent = true

    async function loadMonth() {
      setIsLoading(true)
      setError(null)
      const [attendanceResult, prayersResult] = await Promise.allSettled([
        attendanceService.getMonth(monthKey),
        attendanceService.getPrayerTimesMonth(monthKey),
      ])
      if (!isCurrent) return

      if (attendanceResult.status === 'rejected') {
        console.error('Failed to load monthly attendance:', attendanceResult.reason)
        setError('تعذر تحميل سجلات الشهر. أعد المحاولة بعد التحقق من اتصال قاعدة البيانات.')
        setMonthData({ mappings: [], events: [] })
      } else {
        setMonthData({
          mappings: attendanceResult.value.mappings,
          events: attendanceResult.value.events,
        })
      }

      if (prayersResult.status === 'rejected') {
        console.error('Failed to load monthly prayer times:', prayersResult.reason)
        setPrayerTimes([])
        setError((current) => current || 'تعذر تحميل مواقيت الصلاة؛ أيام الشهر تحتاج مراجعة قبل اعتماد التقرير.')
      } else {
        setPrayerTimes(prayersResult.value)
      }
      setIsLoading(false)
    }

    void loadMonth()
    return () => { isCurrent = false }
  }, [monthKey])

  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? null

  const report = useMemo(() => {
    const mappingWorkerByTerminal = new Map(monthData.mappings.map((mapping) => [
      `${mapping.device_id}:${mapping.device_user_id}`,
      mapping.worker_id,
    ]))
    const workerEvents = monthData.events.filter((event) => (
      (event.worker_id || mappingWorkerByTerminal.get(`${event.device_id}:${event.device_user_id}`)) === workerId
    ))
    const eventsByDate = groupAttendanceEventsByRiyadhDate(workerEvents)
    const prayersByDate = new Map(prayerTimes.map((day) => [day.date, day]))
    return buildAttendanceMonthSummary(monthKey, eventsByDate, prayersByDate)
  }, [monthData.events, monthData.mappings, monthKey, prayerTimes, workerId])

  return (
    <section className="mt-6 space-y-5 print:mt-0" aria-labelledby="monthly-report-title">
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#ecfdf5_55%,#ecfeff_100%)] px-5 py-5 sm:px-6">
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-teal-500 via-cyan-500 to-amber-400" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black text-teal-700">
                <FileText className="h-4 w-4" />
                سجل شهري قابل للمراجعة
              </p>
              <h2 id="monthly-report-title" className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                تقرير {selectedWorker?.user.full_name || 'العامل'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                الجمعة مستبعدة من الغياب، والتأخير منفصل عن ساعات العمل الإضافية.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_160px_auto] print:hidden">
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                العامل
                <select
                  value={workerId}
                  onChange={(event) => setWorkerId(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>{worker.user.full_name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                الشهر
                <input
                  type="month"
                  value={monthKey}
                  onChange={(event) => setMonthKey(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <button
                type="button"
                onClick={() => window.print()}
                className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-teal-950"
              >
                <Printer className="h-4 w-4" />
                طباعة
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="m-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="grid min-h-72 place-items-center">
            <div className="text-center">
              <RefreshCw className="mx-auto h-7 w-7 animate-spin text-teal-600" />
              <p className="mt-3 text-sm font-bold text-slate-500">جاري إعداد تقرير الشهر...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6 sm:p-6">
              <ReportMetric label="أيام الدوام" value={String(report.scheduledDays)} icon={CalendarRange} tone="slate" />
              <ReportMetric label="أيام الحضور" value={String(report.presentDays)} icon={CheckCircle2} tone="emerald" />
              <ReportMetric label="أيام الغياب" value={String(report.absentDays)} icon={UserRoundX} tone="rose" />
              <ReportMetric label="إجمالي التأخير" value={formatAttendanceDuration(report.totalDelayMinutes)} icon={ClockArrowDown} tone="amber" />
              <ReportMetric label="إجمالي النقص" value={formatAttendanceDuration(report.totalDeficitMinutes)} icon={TriangleAlert} tone="rose" />
              <ReportMetric label="العمل الإضافي" value={formatAttendanceDuration(report.totalOvertimeMinutes)} icon={ClockArrowUp} tone="sky" />
            </div>

            <div className="mx-5 mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs sm:mx-6 sm:grid-cols-3 sm:p-5">
              <Breakdown label="تفصيل التأخير" items={[
                ['الصباح', report.totalMorningLateMinutes],
                ['الصلاة', report.totalPrayerOverrunMinutes],
                ['بعد الاستراحة', report.totalBreakLateMinutes],
              ]} />
              <Breakdown label="تفصيل النقص" items={[
                ['خروج غير مبرر', report.totalUnexcusedMinutes],
                ['تبكير في الانصراف', report.totalEarlyDepartureMinutes],
                ['أيام تحتاج مراجعة', report.reviewDays, ' يوم'],
              ]} />
              <Breakdown label="تفصيل الإضافي" items={[
                ['تأخر خروج الاستراحة', report.totalBreakOvertimeMinutes],
                ['بعد 10:30', report.totalEndOvertimeMinutes],
                ['عمل الجمعة', report.totalHolidayOvertimeMinutes],
              ]} />
            </div>
          </>
        )}
      </div>

      {!isLoading && (
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <h3 className="font-black text-slate-950">تفاصيل الأيام</h3>
            <p className="mt-1 text-xs text-slate-500">اضغط على يوم في نسخة الجوال لرؤية تفاصيل التأخير والإضافي.</p>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {report.days.map((day) => <MobileDayCard key={day.dateKey} day={day} />)}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] border-collapse text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-black">اليوم</th>
                  <th className="px-4 py-3 font-black">الحالة</th>
                  <th className="px-4 py-3 font-black">دخول</th>
                  <th className="px-4 py-3 font-black">الصباح</th>
                  <th className="px-4 py-3 font-black">الصلاة</th>
                  <th className="px-4 py-3 font-black">الاستراحة</th>
                  <th className="px-4 py-3 font-black">خروج مبكر</th>
                  <th className="px-4 py-3 font-black">غير مبرر</th>
                  <th className="px-4 py-3 font-black">النقص</th>
                  <th className="px-4 py-3 font-black">الإضافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.days.map((day) => (
                  <tr key={day.dateKey} className="transition hover:bg-teal-50/30">
                    <td className="whitespace-nowrap px-4 py-3 font-black text-slate-800">{formatReportDate(day.dateKey)}</td>
                    <td className="px-4 py-3"><StatusPill status={day.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{formatTime(day.firstEntryAt)}</td>
                    <td className="px-4 py-3">{durationOrDash(day.morningLateMinutes)}</td>
                    <td className="px-4 py-3">{durationOrDash(day.prayerOverrunMinutes)}</td>
                    <td className="px-4 py-3">{durationOrDash(day.breakLateMinutes)}</td>
                    <td className="px-4 py-3">{durationOrDash(day.earlyDepartureMinutes)}</td>
                    <td className="px-4 py-3">{durationOrDash(day.unexcusedMinutes)}</td>
                    <td className="px-4 py-3 font-black text-rose-700">{durationOrDash(day.totalDeficitMinutes)}</td>
                    <td className="px-4 py-3 font-black text-sky-700">{durationOrDash(day.totalOvertimeMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function formatTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function StatusPill({ status }: { status: AttendanceDayAnalysis['status'] }) {
  const style = STATUS_STYLES[status]
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 font-black ring-1 ${style.classes}`}>{style.label}</span>
}

function ReportMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: typeof CalendarRange
  tone: 'slate' | 'emerald' | 'rose' | 'amber' | 'sky'
}) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-800',
    sky: 'bg-sky-100 text-sky-700',
  }[tone]

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_10px_25px_-22px_rgba(15,23,42,0.8)]">
      <span className={`grid h-8 w-8 place-items-center rounded-xl ${styles}`}><Icon className="h-4 w-4" /></span>
      <strong className="mt-3 block truncate text-lg font-black tabular-nums text-slate-950" title={value}>{value}</strong>
      <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{label}</span>
    </div>
  )
}

function Breakdown({
  label,
  items,
}: {
  label: string
  items: Array<[string, number, string?]>
}) {
  return (
    <div>
      <h4 className="mb-2 font-black text-slate-800">{label}</h4>
      <dl className="space-y-1.5 text-slate-500">
        {items.map(([itemLabel, minutes, suffix]) => (
          <div key={itemLabel} className="flex items-center justify-between gap-3">
            <dt>{itemLabel}</dt>
            <dd className="font-black tabular-nums text-slate-800">
              {suffix ? `${minutes}${suffix}` : formatAttendanceDuration(minutes)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function MobileDayCard({ day }: { day: AttendanceDayAnalysis }) {
  return (
    <details className="group px-4 py-4 open:bg-slate-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-black text-slate-900">{formatReportDate(day.dateKey)}</p>
          <div className="mt-1"><StatusPill status={day.status} /></div>
        </div>
        <div className="text-left">
          <p className="text-[10px] font-bold text-slate-400">النقص / الإضافي</p>
          <p className="mt-1 text-xs font-black tabular-nums">
            <span className="text-rose-700">{durationOrDash(day.totalDeficitMinutes)}</span>
            <span className="px-1 text-slate-300">/</span>
            <span className="text-sky-700">{durationOrDash(day.totalOvertimeMinutes)}</span>
          </p>
        </div>
      </summary>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs">
        <MobileValue label="دخول الصباح" value={formatTime(day.firstEntryAt)} />
        <MobileValue label="تأخير الصباح" value={durationOrDash(day.morningLateMinutes)} />
        <MobileValue label="تجاوز الصلاة" value={durationOrDash(day.prayerOverrunMinutes)} />
        <MobileValue label="بعد الاستراحة" value={durationOrDash(day.breakLateMinutes)} />
        <MobileValue label="خروج مبكر" value={durationOrDash(day.earlyDepartureMinutes)} />
        <MobileValue label="خروج غير مبرر" value={durationOrDash(day.unexcusedMinutes)} />
      </div>
      {day.anomalies.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-800">
          {day.anomalies.join(' · ')}
        </p>
      )}
    </details>
  )
}

function MobileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100">
      <span className="block text-[10px] font-bold text-slate-400">{label}</span>
      <strong className="mt-1 block font-black tabular-nums text-slate-800">{value}</strong>
    </div>
  )
}
