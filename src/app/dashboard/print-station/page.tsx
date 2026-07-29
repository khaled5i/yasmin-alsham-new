'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CircleOff,
  Clipboard,
  Clock3,
  KeyRound,
  Loader2,
  Plus,
  Power,
  Printer,
  RadioTower,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { useAuthStore } from '@/store/authStore'
import {
  createTailoringPrintStation,
  cancelTailoringPrintJob,
  getTailoringPrintStationOverview,
  queueTailoringStationTest,
  releaseTailoringPrintStationLease,
  retryTailoringPrintJob,
  rotateTailoringPrintStationSecret,
  setTailoringPrintStationEnabled,
  type TailoringPrintStationDevice,
  type TailoringPrintStationLease,
  type TailoringPrintStationOverview,
  type TailoringAttentionJob,
} from '@/lib/services/tailoring-print-station-service'

const HEARTBEAT_STALE_MS = 20_000
const REFRESH_INTERVAL_MS = 5_000

type StationState = 'active' | 'standby' | 'offline' | 'disabled'
type ActionKey = string | null

interface PairingReveal {
  stationName: string
  pairingCode: string
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isLeaseActive(lease: TailoringPrintStationLease | null, now: number): boolean {
  return !!lease && toTimestamp(lease.lease_expires_at) > now
}

function stationState(
  station: TailoringPrintStationDevice,
  lease: TailoringPrintStationLease | null,
  now: number
): StationState {
  if (!station.enabled) return 'disabled'
  if (lease?.station_id === station.id && isLeaseActive(lease, now)) return 'active'
  if (now - toTimestamp(station.last_seen_at) <= HEARTBEAT_STALE_MS) return 'standby'
  return 'offline'
}

function relativeTime(value: string | null): string {
  const timestamp = toTimestamp(value)
  if (!timestamp) return 'لم يتصل بعد'

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 10) return 'الآن'
  if (seconds < 60) return `منذ ${seconds} ثانية`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  return new Date(timestamp).toLocaleString('ar-SA-u-nu-latn', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const STATE_STYLE: Record<
  StationState,
  { label: string; detail: string; className: string; dotClassName: string }
> = {
  active: {
    label: 'ACTIVE · المحطة النشطة',
    detail: 'هذه المحطة تملك حجز الطباعة الآن',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    dotClassName: 'bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.14)]',
  },
  standby: {
    label: 'STANDBY · جاهزة للاحتياط',
    detail: 'متصلة وستستلم القيادة تلقائيًا عند الحاجة',
    className: 'border-sky-300 bg-sky-50 text-sky-950',
    dotClassName: 'bg-sky-500',
  },
  offline: {
    label: 'OFFLINE · غير متصلة',
    detail: 'لم تصل نبضة حياة حديثة من الجهاز',
    className: 'border-rose-200 bg-rose-50 text-rose-950',
    dotClassName: 'bg-rose-500',
  },
  disabled: {
    label: 'موقوفة',
    detail: 'لن تستلم مهامًا حتى يعاد تشغيلها',
    className: 'border-stone-300 bg-stone-100 text-stone-700',
    dotClassName: 'bg-stone-400',
  },
}

function StationCard({
  station,
  lease,
  rank,
  now,
  actionKey,
  onRotate,
  onToggle,
  onRelease,
}: {
  station: TailoringPrintStationDevice
  lease: TailoringPrintStationLease | null
  rank: number
  now: number
  actionKey: ActionKey
  onRotate: (station: TailoringPrintStationDevice) => void
  onToggle: (station: TailoringPrintStationDevice) => void
  onRelease: (station: TailoringPrintStationDevice) => void
}) {
  const state = stationState(station, lease, now)
  const style = STATE_STYLE[state]
  const isBusy = actionKey?.endsWith(station.id) === true

  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-stone-300 bg-white/90 shadow-[0_18px_45px_rgba(41,37,36,0.08)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-amber-400 via-stone-900 to-stone-900" />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-950 text-amber-300">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[0.18em] text-amber-700">
                {rank === 0 ? 'الأولوية الأولى · الرئيسي' : 'الأولوية الثانية · الاحتياطي'}
              </p>
              <h2 className="truncate text-xl font-black">{station.name}</h2>
              <p className="mt-0.5 font-mono text-[10px] text-stone-400" dir="ltr">
                {station.id}
              </p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black ${style.className}`}>
            <span className={`h-2 w-2 rounded-full ${style.dotClassName}`} />
            {style.label}
          </span>
        </div>

        <p className="mt-4 text-sm text-stone-600">{style.detail}</p>

        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-4">
          <div className="bg-stone-50 p-3">
            <dt className="text-[10px] font-bold text-stone-500">آخر ظهور</dt>
            <dd className="mt-1 text-xs font-black">{relativeTime(station.last_seen_at)}</dd>
          </div>
          <div className="bg-stone-50 p-3">
            <dt className="text-[10px] font-bold text-stone-500">الطابعة</dt>
            <dd className={`mt-1 flex items-center gap-1.5 text-xs font-black ${station.printer_reachable ? 'text-emerald-700' : 'text-rose-700'}`}>
              {station.printer_reachable ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {station.printer_reachable ? 'متاحة' : 'غير متاحة'}
            </dd>
          </div>
          <div className="bg-stone-50 p-3">
            <dt className="text-[10px] font-bold text-stone-500">عنوان الطابعة</dt>
            <dd className="mt-1 truncate font-mono text-xs font-black" dir="ltr">
              {station.printer_ip || '—'}
            </dd>
          </div>
          <div className="bg-stone-50 p-3">
            <dt className="text-[10px] font-bold text-stone-500">نسخة المحطة</dt>
            <dd className="mt-1 truncate font-mono text-xs font-black" dir="ltr">
              {station.app_version || '—'}
            </dd>
          </div>
        </dl>

        {station.last_error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{station.last_error}</span>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRotate(station)}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-black text-stone-800 transition hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            رمز إقران جديد
          </button>
          {state === 'active' ? (
            <button
              type="button"
              onClick={() => onRelease(station)}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-900 transition hover:bg-sky-100 disabled:opacity-50"
            >
              <Unplug className="h-4 w-4" />
              تسليم القيادة
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onToggle(station)}
            disabled={isBusy}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
              station.enabled
                ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Power className="h-4 w-4" />
            {station.enabled ? 'إيقاف المحطة' : 'تشغيل المحطة'}
          </button>
        </div>
      </div>
    </article>
  )
}

function TailoringPrintStationDashboard() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'
  const [overview, setOverview] = useState<TailoringPrintStationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionKey, setActionKey] = useState<ActionKey>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [stationName, setStationName] = useState('')
  const [stationPriority, setStationPriority] = useState<1 | 2>(1)
  const [pairing, setPairing] = useState<PairingReveal | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const loadOverview = useCallback(async (silent = false) => {
    if (!isAdmin) return
    if (!silent) setLoading(true)

    try {
      const next = await getTailoringPrintStationOverview()
      setOverview(next)
      setLoadError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      setLoadError(message || 'تعذّر تحميل حالة محطات الطباعة.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }

    void loadOverview()
    const interval = window.setInterval(() => {
      setNow(Date.now())
      void loadOverview(true)
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [isAdmin, loadOverview])

  const activeStation = useMemo(() => {
    if (!overview || !isLeaseActive(overview.lease, now)) return null
    return overview.stations.find((station) => station.id === overview.lease?.station_id) ?? null
  }, [overview, now])

  const runAction = useCallback(async (key: string, action: () => Promise<void>) => {
    if (actionKey) return
    setActionKey(key)
    try {
      await action()
      await loadOverview(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تنفيذ العملية.')
    } finally {
      setActionKey(null)
    }
  }, [actionKey, loadOverview])

  const handleCreate = () => {
    const name = stationName.trim()
    if (name.length < 2) {
      toast.error('أدخل اسمًا واضحًا للمحطة.')
      return
    }

    void runAction('create', async () => {
      const result = await createTailoringPrintStation(name, stationPriority)
      setPairing({ stationName: result.station.name, pairingCode: result.pairingCode })
      setShowCreate(false)
      setStationName('')
      setCopied(false)
      toast.success('أُنشئت المحطة. استخدم رمز الإقران في تطبيق أندرويد.')
    })
  }

  const handleRotate = (station: TailoringPrintStationDevice) => {
    if (!window.confirm(`إنشاء رمز إقران جديد للمحطة «${station.name}»؟ سيتوقف الرمز السابق فورًا.`)) return
    void runAction(`rotate:${station.id}`, async () => {
      const result = await rotateTailoringPrintStationSecret(station.id)
      setPairing({ stationName: station.name, pairingCode: result.pairingCode })
      setCopied(false)
      toast.success('تم إنشاء رمز إقران جديد.')
    })
  }

  const handleToggle = (station: TailoringPrintStationDevice) => {
    const nextEnabled = !station.enabled
    const verb = nextEnabled ? 'تشغيل' : 'إيقاف'
    if (!window.confirm(`${verb} المحطة «${station.name}»؟`)) return
    void runAction(`toggle:${station.id}`, async () => {
      await setTailoringPrintStationEnabled(station.id, nextEnabled)
      toast.success(nextEnabled ? 'تم تشغيل المحطة.' : 'تم إيقاف المحطة.')
    })
  }

  const handleRelease = (station: TailoringPrintStationDevice) => {
    if (!window.confirm(`تسليم قيادة الطباعة من «${station.name}»؟ ستستلمها المحطة الجاهزة التالية تلقائيًا.`)) return
    void runAction(`release:${station.id}`, async () => {
      await releaseTailoringPrintStationLease(station.id)
      toast.success('تم تحرير حجز القيادة.')
    })
  }

  const handleRetryJob = (job: TailoringAttentionJob) => {
    const message = job.status === 'unknown'
      ? 'نتيجة هذه المهمة غير مؤكدة لأن الاتصال انقطع بعد بدء الإرسال. قد تؤدي الإعادة إلى طباعة نسخة ثانية. هل راجعت الطابعة وتريد إعادة المهمة فعلًا؟'
      : `إعادة مهمة الطلب «${job.orderNumber}» إلى طابور الطباعة؟`
    if (!window.confirm(message)) return

    void runAction(`retry-job:${job.id}`, async () => {
      await retryTailoringPrintJob(job.id)
      toast.success('أُعيدت المهمة إلى طابور الطباعة.')
    })
  }

  const handleCancelJob = (job: TailoringAttentionJob) => {
    if (!window.confirm(`إلغاء مهمة الطلب «${job.orderNumber}» نهائيًا؟`)) return
    void runAction(`cancel-job:${job.id}`, async () => {
      await cancelTailoringPrintJob(job.id)
      toast.success('أُلغيت مهمة الطباعة.')
    })
  }

  const handleCopyPairing = async () => {
    if (!pairing) return
    try {
      await navigator.clipboard.writeText(pairing.pairingCode)
      setCopied(true)
      toast.success('نُسخ رمز الإقران.')
    } catch {
      toast.error('تعذّر النسخ التلقائي. حدّد الرمز وانسخه يدويًا.')
    }
  }

  if (!isAdmin) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-[#f1eee7] p-6 text-stone-950">
        <section className="max-w-md rounded-3xl border border-stone-300 bg-white p-7 text-center shadow-xl">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-amber-700" />
          <h1 className="text-xl font-black">إدارة المحطات للمدير فقط</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            تستمر الفواتير بالدخول إلى الطابور تلقائيًا، ولا يلزم فتح هذه الصفحة على أجهزة الموظفين.
          </p>
          <Link href="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white">
            <ArrowRight className="h-4 w-4" />
            العودة
          </Link>
        </section>
      </main>
    )
  }

  const queue = overview?.queue ?? { pending: 0, printing: 0, error: 0, unknown: 0 }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f1eee7] px-4 py-6 text-stone-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-5 border-b border-stone-300 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-stone-950 text-[#f7c95c] shadow-[0_10px_30px_rgba(28,25,23,0.18)]">
              <RadioTower className="h-7 w-7" />
            </div>
            <div>
              <p className="mb-1 text-xs font-black tracking-[0.22em] text-amber-700">ياسمين الشام · قسم التفصيل</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">نظام محطات الطباعة</h1>
              <p className="mt-1 text-sm text-stone-600">رئيسي واحتياطي مع انتقال تلقائي وحجز قيادة واحد</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction('test', async () => {
                await queueTailoringStationTest()
                toast.success('أُضيفت فاتورة اختبار إلى الطابور.')
              })}
              disabled={!!actionKey || !activeStation}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-300 px-4 py-2.5 text-sm font-black text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              title={activeStation ? 'إرسال فاتورة اختبار إلى المحطة النشطة' : 'لا توجد محطة نشطة'}
            >
              {actionKey === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              اختبار الطباعة
            </button>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-black transition hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <Link href="/dashboard" className="grid h-11 w-11 place-items-center rounded-xl border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-50" aria-label="العودة">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {loadError ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">تعذّر قراءة حالة النظام</p>
              <p className="mt-1 text-xs leading-5">{loadError}</p>
            </div>
          </div>
        ) : null}

        <section className={`mb-5 overflow-hidden rounded-[1.75rem] border p-5 shadow-sm ${
          activeStation
            ? 'border-emerald-300 bg-emerald-950 text-white'
            : 'border-rose-300 bg-rose-950 text-white'
        }`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${activeStation ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
                {activeStation ? <Activity className="h-6 w-6" /> : <CircleOff className="h-6 w-6" />}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-65">حالة القيادة</p>
                <h2 className="mt-1 text-xl font-black">
                  {activeStation ? `${activeStation.name} تطبع الآن` : 'لا توجد محطة نشطة'}
                </h2>
                <p className="mt-1 text-xs opacity-75">
                  {activeStation
                    ? `الحجز صالح حتى ${new Date(overview?.lease?.lease_expires_at || '').toLocaleTimeString('ar-SA-u-nu-latn')}`
                    : 'تبقى المهام محفوظة، وستبدأ تلقائيًا عند اتصال إحدى المحطتين.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className={`h-2.5 w-2.5 rounded-full ${activeStation ? 'animate-pulse bg-emerald-300' : 'bg-rose-300'}`} />
              تحديث تلقائي كل 5 ثوانٍ
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'بانتظار الطباعة', value: queue.pending, icon: Clock3, tone: 'text-amber-700' },
            { label: 'قيد الطباعة', value: queue.printing, icon: Printer, tone: 'text-sky-700' },
            { label: 'تحتاج مراجعة', value: queue.unknown, icon: AlertTriangle, tone: 'text-orange-700' },
            { label: 'أخطاء نهائية', value: queue.error, icon: CircleOff, tone: 'text-rose-700' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="rounded-2xl border border-stone-300 bg-white/80 p-4 shadow-sm">
                <Icon className={`mb-3 h-5 w-5 ${item.tone}`} />
                <p className="text-3xl font-black tabular-nums">{item.value}</p>
                <p className="mt-1 text-xs font-bold text-stone-500">{item.label}</p>
              </div>
            )
          })}
        </section>

        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">الأجهزة المقترنة</h2>
            <p className="mt-1 text-xs text-stone-500">الأولوية 1 للرئيسي، والأولوية 2 للاحتياطي.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextPriority: 1 | 2 = (overview?.stations.length ?? 0) === 0 ? 1 : 2
              setStationPriority(nextPriority)
              setStationName(nextPriority === 1 ? 'تابلت الاستقبال الرئيسي' : 'تابلت الاستقبال الاحتياطي')
              setShowCreate(true)
            }}
            disabled={(overview?.stations.length ?? 0) >= 2}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            إضافة محطة
          </button>
        </div>

        {loading && !overview ? (
          <div className="grid min-h-64 place-items-center rounded-3xl border border-stone-300 bg-white/70">
            <div className="text-center text-stone-500">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-amber-700" />
              <p className="text-sm font-bold">جارٍ تحميل المحطات</p>
            </div>
          </div>
        ) : overview?.stations.length ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {overview.stations.map((station, index) => (
              <StationCard
                key={station.id}
                station={station}
                lease={overview.lease}
                rank={index}
                now={now}
                actionKey={actionKey}
                onRotate={handleRotate}
                onToggle={handleToggle}
                onRelease={handleRelease}
              />
            ))}
          </section>
        ) : (
          <section className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-stone-400 bg-white/60 p-7 text-center">
            <div>
              <Smartphone className="mx-auto mb-4 h-10 w-10 text-stone-400" />
              <h3 className="text-lg font-black">لم تُقرن أي محطة بعد</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                أضف التابلت الرئيسي أولًا، ثم الاحتياطي. سيظهر رمز الإقران مرة واحدة لكل جهاز.
              </p>
            </div>
          </section>
        )}

        {overview?.attentionJobs.length ? (
          <section className="mt-6 overflow-hidden rounded-[1.75rem] border border-stone-300 bg-white/85 shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  مهام تحتاج قرارًا
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  المهام غير المؤكدة لا تُعاد تلقائيًا لحمايتك من طباعة فاتورة مرتين.
                </p>
              </div>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">
                {overview.attentionJobs.length}
              </span>
            </div>
            <ul className="divide-y divide-stone-200">
              {overview.attentionJobs.map((job) => {
                const retrying = actionKey === `retry-job:${job.id}`
                const cancelling = actionKey === `cancel-job:${job.id}`
                return (
                  <li key={job.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">طلب {job.orderNumber}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                          job.status === 'unknown'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {job.status === 'unknown' ? 'نتيجة غير مؤكدة' : 'خطأ نهائي'}
                        </span>
                      </div>
                      {job.invoiceCode ? (
                        <p dir="ltr" className="mt-1 truncate text-left font-mono text-xs text-stone-500">
                          {job.invoiceCode}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-stone-500">
                        {new Date(job.createdAt).toLocaleString('ar-SA-u-nu-latn', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                      {job.errorMessage ? (
                        <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-700">
                          {job.errorMessage}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleRetryJob(job)}
                        disabled={!!actionKey}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        إعادة الطباعة
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelJob(job)}
                        disabled={!!actionKey}
                        className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-black text-stone-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50"
                      >
                        {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        إلغاء
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <aside className="mt-6 flex items-start gap-3 rounded-2xl border border-stone-800 bg-stone-950 p-4 text-sm leading-6 text-stone-100">
          <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p>
            جميع الهواتف ترسل الفاتورة إلى الطابور فقط. لا تحتاج هذه الصفحة أن تبقى مفتوحة، ولا يتصل أي هاتف بالطابعة مباشرة.
            التابلت النشط وحده يطبع، والاحتياطي يستلم تلقائيًا بعد انتهاء حجز الجهاز الأول.
          </p>
        </aside>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/65 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="create-station-title" className="w-full max-w-md rounded-3xl border border-stone-700 bg-stone-950 p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-amber-300">محطة جديدة</p>
                <h2 id="create-station-title" className="mt-1 text-xl font-black">إقران تابلت الاستقبال</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-stone-300 hover:bg-white/20" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-6 block text-xs font-bold text-stone-300" htmlFor="station-name">اسم الجهاز</label>
            <input
              id="station-name"
              value={stationName}
              onChange={(event) => setStationName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-3 text-sm font-bold outline-none focus:border-amber-300"
              maxLength={80}
              autoFocus
            />

            <label className="mt-4 block text-xs font-bold text-stone-300" htmlFor="station-priority">الدور</label>
            <select
              id="station-priority"
              value={stationPriority}
              onChange={(event) => setStationPriority(Number(event.target.value) === 1 ? 1 : 2)}
              className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-3 text-sm font-bold outline-none focus:border-amber-300"
            >
              <option value={1}>رئيسي · الأولوية 1</option>
              <option value={2}>احتياطي · الأولوية 2</option>
            </select>

            <button
              type="button"
              onClick={handleCreate}
              disabled={actionKey === 'create'}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-stone-950 hover:bg-amber-200 disabled:opacity-50"
            >
              {actionKey === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              إنشاء وإظهار رمز الإقران
            </button>
          </section>
        </div>
      ) : null}

      {pairing ? (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-stone-950/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="pairing-code-title" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-amber-300/30 bg-stone-950 text-white shadow-2xl">
            <div className="border-b border-white/10 bg-amber-300/10 p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300 text-stone-950">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black tracking-[0.16em] text-amber-300">يظهر مرة واحدة</p>
                  <h2 id="pairing-code-title" className="mt-1 text-xl font-black">رمز إقران {pairing.stationName}</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-300">
                    افتح تطبيق محطة الطباعة على التابلت، ثم الصق الرمز واحفظه. بعد إغلاق هذه النافذة لن يظهر الرمز نفسه مجددًا.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <code dir="ltr" className="block select-all break-all rounded-2xl border border-white/10 bg-black/30 p-4 text-left font-mono text-sm leading-7 text-amber-200">
                {pairing.pairingCode}
              </code>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleCopyPairing()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-stone-950 hover:bg-amber-200"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copied ? 'تم النسخ' : 'نسخ الرمز'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPairing(null)
                    setCopied(false)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-stone-200 hover:bg-white/10"
                >
                  إغلاق بعد الإقران
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default function PrintStationPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessSettings" allowAdmin={true}>
      <TailoringPrintStationDashboard />
    </ProtectedWorkerRoute>
  )
}
