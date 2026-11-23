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
} from 'lucide-react'
import toast from 'react-hot-toast'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { useAuthStore } from '@/store/authStore'
import {
  createAlterationPrintStation,
  cancelAlterationPrintJob,
  getAlterationPrintStationOverview,
  queueAlterationStationTest,
  releaseAlterationPrintStationLease,
  retryAlterationPrintJob,
  rotateAlterationPrintStationSecret,
  setAlterationPrintStationEnabled,
  type AlterationPrintStationDevice,
  type AlterationPrintStationLease,
  type AlterationPrintStationOverview,
  type AlterationAttentionJob,
} from '@/lib/services/alteration-print-station-service'
import {
  BottomSheet,
  ConfirmSheet,
  formatAlterationDateTime,
  formatAlterationTime,
} from '@/components/alterations/alteration-ui'

const HEARTBEAT_STALE_MS = 20_000
const REFRESH_INTERVAL_MS = 5_000

type StationState = 'active' | 'standby' | 'offline' | 'disabled'
type ActionKey = string | null

interface PairingReveal {
  stationName: string
  pairingCode: string
}

interface PendingConfirm {
  title: string
  message: string
  confirmLabel: string
  tone: 'danger' | 'primary' | 'warning'
  onConfirm: () => void
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isLeaseActive(lease: AlterationPrintStationLease | null, now: number): boolean {
  return !!lease && toTimestamp(lease.lease_expires_at) > now
}

function stationState(
  station: AlterationPrintStationDevice,
  lease: AlterationPrintStationLease | null,
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
  return formatAlterationDateTime(value)
}

const STATE_STYLE: Record<
  StationState,
  { label: string; detail: string; className: string; dotClassName: string }
> = {
  active: {
    label: 'نشطة الآن',
    detail: 'هذه المحطة تملك حجز الطباعة الآن',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dotClassName: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]',
  },
  standby: {
    label: 'جاهزة احتياطياً',
    detail: 'متصلة وستستلم القيادة تلقائيًا عند الحاجة',
    className: 'border-sky-200 bg-sky-50 text-sky-800',
    dotClassName: 'bg-sky-500',
  },
  offline: {
    label: 'غير متصلة',
    detail: 'لم تصل نبضة حياة حديثة من الجهاز',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    dotClassName: 'bg-rose-500',
  },
  disabled: {
    label: 'موقوفة',
    detail: 'لن تستلم مهامًا حتى يعاد تشغيلها',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
    dotClassName: 'bg-slate-400',
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
  station: AlterationPrintStationDevice
  lease: AlterationPrintStationLease | null
  rank: number
  now: number
  actionKey: ActionKey
  onRotate: (station: AlterationPrintStationDevice) => void
  onToggle: (station: AlterationPrintStationDevice) => void
  onRelease: (station: AlterationPrintStationDevice) => void
}) {
  const state = stationState(station, lease, now)
  const style = STATE_STYLE[state]
  const isBusy = actionKey?.endsWith(station.id) === true

  return (
    <article className="relative overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-pink-500 to-purple-500" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-white">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-pink-600">
                {rank === 0 ? 'الأولوية الأولى · الرئيسي' : 'الأولوية الثانية · الاحتياطي'}
              </p>
              <h2 className="truncate text-lg font-extrabold text-slate-900">{station.name}</h2>
              <p className="mt-0.5 truncate font-mono text-xs text-slate-400" dir="ltr" title={station.id}>
                {station.id.slice(0, 8)}…
              </p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${style.className}`}>
            <span className={`h-2 w-2 rounded-full ${style.dotClassName}`} />
            {style.label}
          </span>
        </div>

        <p className="mt-3 text-sm text-slate-600">{style.detail}</p>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
          <div className="bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">آخر ظهور</dt>
            <dd className="mt-1 text-sm font-bold text-slate-800">{relativeTime(station.last_seen_at)}</dd>
          </div>
          <div className="bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">الطابعة</dt>
            <dd className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${station.printer_reachable ? 'text-emerald-700' : 'text-rose-700'}`}>
              {station.printer_reachable ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {station.printer_reachable ? 'متاحة' : 'غير متاحة'}
            </dd>
          </div>
          <div className="bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">عنوان الطابعة</dt>
            <dd className="mt-1 truncate font-mono text-sm font-bold text-slate-800" dir="ltr">
              {station.printer_ip || '—'}
            </dd>
          </div>
          <div className="bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">نسخة المحطة</dt>
            <dd className="mt-1 truncate font-mono text-sm font-bold text-slate-800" dir="ltr">
              {station.app_version || '—'}
            </dd>
          </div>
        </dl>

        {station.last_error ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{station.last_error}</span>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => onRotate(station)}
            disabled={isBusy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            رمز إقران جديد
          </button>
          {state === 'active' ? (
            <button
              type="button"
              onClick={() => onRelease(station)}
              disabled={isBusy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-bold text-sky-800 transition hover:bg-sky-100 disabled:opacity-50"
            >
              <Unplug className="h-4 w-4" />
              تسليم القيادة
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onToggle(station)}
            disabled={isBusy}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition disabled:opacity-50 ${
              station.enabled
                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            {station.enabled ? 'إيقاف المحطة' : 'تشغيل المحطة'}
          </button>
        </div>
      </div>
    </article>
  )
}

function AlterationPrintStationDashboard() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'
  const [overview, setOverview] = useState<AlterationPrintStationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionKey, setActionKey] = useState<ActionKey>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [stationName, setStationName] = useState('')
  const [stationPriority, setStationPriority] = useState<1 | 2>(1)
  const [pairing, setPairing] = useState<PairingReveal | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const loadOverview = useCallback(async (silent = false) => {
    if (!isAdmin) return
    if (!silent) setLoading(true)

    try {
      const next = await getAlterationPrintStationOverview()
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

  // تأكيد قبل كل إجراء حساس، بدل نافذة المتصفح
  const askConfirm = (confirm: Omit<PendingConfirm, 'onConfirm'>, onConfirm: () => void) => {
    setPendingConfirm({ ...confirm, onConfirm })
  }

  const handleCreate = () => {
    const name = stationName.trim()
    if (name.length < 2) {
      toast.error('أدخل اسمًا واضحًا للمحطة.')
      return
    }

    void runAction('create', async () => {
      const result = await createAlterationPrintStation(name, stationPriority)
      setPairing({ stationName: result.station.name, pairingCode: result.pairingCode })
      setShowCreate(false)
      setStationName('')
      setCopied(false)
      toast.success('أُنشئت المحطة. استخدم رمز الإقران في تطبيق أندرويد.')
    })
  }

  const handleRotate = (station: AlterationPrintStationDevice) => {
    askConfirm({
      title: 'رمز إقران جديد؟',
      message: `إنشاء رمز إقران جديد للمحطة «${station.name}»؟ سيتوقف الرمز السابق فورًا.`,
      confirmLabel: 'إنشاء الرمز',
      tone: 'warning',
    }, () => {
      void runAction(`rotate:${station.id}`, async () => {
        const result = await rotateAlterationPrintStationSecret(station.id)
        setPairing({ stationName: station.name, pairingCode: result.pairingCode })
        setCopied(false)
        toast.success('تم إنشاء رمز إقران جديد.')
      })
    })
  }

  const handleToggle = (station: AlterationPrintStationDevice) => {
    const nextEnabled = !station.enabled
    const verb = nextEnabled ? 'تشغيل' : 'إيقاف'
    askConfirm({
      title: `${verb} المحطة؟`,
      message: `${verb} المحطة «${station.name}»؟`,
      confirmLabel: verb,
      tone: nextEnabled ? 'primary' : 'danger',
    }, () => {
      void runAction(`toggle:${station.id}`, async () => {
        await setAlterationPrintStationEnabled(station.id, nextEnabled)
        toast.success(nextEnabled ? 'تم تشغيل المحطة.' : 'تم إيقاف المحطة.')
      })
    })
  }

  const handleRelease = (station: AlterationPrintStationDevice) => {
    askConfirm({
      title: 'تسليم القيادة؟',
      message: `تسليم قيادة الطباعة من «${station.name}»؟ ستستلمها المحطة الجاهزة التالية تلقائيًا.`,
      confirmLabel: 'تسليم القيادة',
      tone: 'warning',
    }, () => {
      void runAction(`release:${station.id}`, async () => {
        await releaseAlterationPrintStationLease(station.id)
        toast.success('تم تحرير حجز القيادة.')
      })
    })
  }

  const handleRetryJob = (job: AlterationAttentionJob) => {
    const message = job.status === 'unknown'
      ? 'نتيجة هذه المهمة غير مؤكدة لأن الاتصال انقطع بعد بدء الإرسال. قد تؤدي الإعادة إلى طباعة ورقة ثانية. هل راجعت الطابعة وتريد إعادة المهمة فعلًا؟'
      : `إعادة ورقة التعديل «${job.alterationNumber}» إلى طابور الطباعة؟`
    askConfirm({
      title: 'إعادة الطباعة؟',
      message,
      confirmLabel: 'إعادة الطباعة',
      tone: job.status === 'unknown' ? 'warning' : 'primary',
    }, () => {
      void runAction(`retry-job:${job.id}`, async () => {
        await retryAlterationPrintJob(job.id)
        toast.success('أُعيدت المهمة إلى طابور الطباعة.')
      })
    })
  }

  const handleCancelJob = (job: AlterationAttentionJob) => {
    askConfirm({
      title: 'إلغاء مهمة الطباعة؟',
      message: `إلغاء ورقة التعديل «${job.alterationNumber}» نهائيًا؟`,
      confirmLabel: 'إلغاء نهائياً',
      tone: 'danger',
    }, () => {
      void runAction(`cancel-job:${job.id}`, async () => {
        await cancelAlterationPrintJob(job.id)
        toast.success('أُلغيت مهمة الطباعة.')
      })
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
      <main dir="rtl" className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4">
        <section className="w-full max-w-md rounded-3xl border border-pink-100 bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-pink-500" />
          <h1 className="text-xl font-extrabold text-slate-900">إدارة المحطات للمدير الأكبر فقط</h1>
          <p className="mt-2 text-[15px] leading-7 text-slate-600">
            تستمر أوراق التعديلات بالدخول إلى الطابور، ولا يلزم فتح هذه الصفحة على أجهزة الموظفين.
          </p>
          <Link href="/dashboard/alterations" className="mt-5 inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 px-5 text-[15px] font-bold text-white">
            <ArrowRight className="h-4 w-4" />
            العودة
          </Link>
        </section>
      </main>
    )
  }

  const queue = overview?.queue ?? { pending: 0, printing: 0, error: 0, unknown: 0 }
  const stationCount = overview?.stations.length ?? 0

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 pb-10 text-slate-900">
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-30 border-b border-pink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 sm:px-6">
          <Link
            href="/dashboard/alterations"
            className="-ms-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-pink-50 hover:text-pink-700"
            aria-label="العودة"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold sm:text-xl">محطات طباعة الورشة</h1>
            <p className="truncate text-xs text-slate-500 sm:text-sm">رئيسي واحتياطي مع انتقال تلقائي</p>
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-pink-300 hover:text-pink-700 disabled:opacity-50"
            aria-label="تحديث"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-4 sm:px-6">
        {loadError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold">تعذّر قراءة حالة النظام</p>
              <p className="mt-1 break-words text-sm leading-6">{loadError}</p>
            </div>
          </div>
        ) : null}

        {/* حالة القيادة */}
        <section className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${
          activeStation ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${activeStation ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
              {activeStation ? <Activity className="h-6 w-6" /> : <CircleOff className="h-6 w-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-bold ${activeStation ? 'text-emerald-700' : 'text-rose-700'}`}>حالة القيادة</p>
              <h2 className="mt-0.5 text-lg font-extrabold leading-7">
                {activeStation ? `${activeStation.name} تطبع الآن` : 'لا توجد محطة نشطة'}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {activeStation
                  ? `الحجز صالح حتى ${formatAlterationTime(overview?.lease?.lease_expires_at)}`
                  : 'تبقى المهام محفوظة، وستبدأ تلقائيًا عند اتصال إحدى المحطتين.'}
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className={`h-2 w-2 rounded-full ${activeStation ? 'animate-pulse bg-emerald-500' : 'bg-rose-400'}`} />
                تحديث تلقائي كل 5 ثوانٍ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void runAction('test', async () => {
              await queueAlterationStationTest()
              toast.success('أُضيفت ورقة اختبار إلى الطابور.')
            })}
            disabled={!!actionKey || !activeStation}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 px-4 text-[15px] font-bold text-white shadow-sm transition hover:from-pink-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            title={activeStation ? 'إرسال ورقة اختبار إلى المحطة النشطة' : 'لا توجد محطة نشطة'}
          >
            {actionKey === 'test' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
            اختبار الطباعة
          </button>
        </section>

        {/* الطابور */}
        <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {[
            { label: 'بانتظار الطباعة', value: queue.pending, icon: Clock3, tone: 'text-amber-600 bg-amber-50' },
            { label: 'قيد الطباعة', value: queue.printing, icon: Printer, tone: 'text-sky-600 bg-sky-50' },
            { label: 'تحتاج مراجعة', value: queue.unknown, icon: AlertTriangle, tone: 'text-orange-600 bg-orange-50' },
            { label: 'أخطاء نهائية', value: queue.error, icon: CircleOff, tone: 'text-rose-600 bg-rose-50' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-extrabold leading-7 tabular-nums">{item.value}</p>
                  <p className="truncate text-[13px] font-semibold text-slate-500">{item.label}</p>
                </div>
              </div>
            )
          })}
        </section>

        {/* المحطات */}
        <div className="flex items-end justify-between gap-3 pt-2">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">أجهزة الورشة المقترنة</h2>
            <p className="mt-0.5 text-sm text-slate-500">الأولوية 1 للرئيسي، والأولوية 2 للاحتياطي.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextPriority: 1 | 2 = stationCount === 0 ? 1 : 2
              setStationPriority(nextPriority)
              setStationName(nextPriority === 1 ? 'تابلت الورشة الرئيسي' : 'تابلت الورشة الاحتياطي')
              setShowCreate(true)
            }}
            disabled={stationCount >= 2}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-pink-200 bg-white px-3 text-sm font-bold text-pink-700 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            إضافة محطة
          </button>
        </div>

        {loading && !overview ? (
          <div className="grid min-h-56 place-items-center rounded-3xl border border-pink-100 bg-white/70">
            <div className="text-center text-slate-500">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-pink-500" />
              <p className="text-sm font-bold">جارٍ تحميل المحطات</p>
            </div>
          </div>
        ) : overview?.stations.length ? (
          <section className="grid gap-3 lg:grid-cols-2 lg:gap-4">
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
          <section className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-pink-200 bg-white/60 p-6 text-center">
            <div>
              <Smartphone className="mx-auto mb-4 h-10 w-10 text-pink-300" />
              <h3 className="text-lg font-extrabold">لم تُقرن أي محطة بعد</h3>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-7 text-slate-600">
                أضف تابلت الورشة الرئيسي أولًا، ثم الاحتياطي. سيظهر رمز الإقران مرة واحدة لكل جهاز.
              </p>
            </div>
          </section>
        )}

        {/* المهام التي تحتاج قراراً */}
        {overview?.attentionJobs.length ? (
          <section className="overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-orange-100 bg-orange-50/60 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-extrabold">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  مهام تحتاج قرارًا
                </h2>
                <p className="mt-0.5 text-sm leading-6 text-slate-500">
                  المهام غير المؤكدة لا تُعاد تلقائيًا لحمايتك من طباعة الورقة مرتين.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-800">
                {overview.attentionJobs.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {overview.attentionJobs.map((job) => {
                const retrying = actionKey === `retry-job:${job.id}`
                const cancelling = actionKey === `cancel-job:${job.id}`
                return (
                  <li key={job.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-extrabold">
                        تعديل <span dir="ltr">{job.alterationNumber}</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        job.status === 'unknown'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {job.status === 'unknown' ? 'نتيجة غير مؤكدة' : 'خطأ نهائي'}
                      </span>
                    </div>
                    {job.title ? (
                      <p className="mt-1 truncate text-sm font-semibold text-slate-600">{job.title}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-slate-500">{formatAlterationDateTime(job.createdAt) || '—'}</p>
                    {job.errorMessage ? (
                      <p className="mt-2 break-words rounded-xl bg-slate-100 px-3 py-2 text-sm leading-6 text-slate-700">
                        {job.errorMessage}
                      </p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={() => handleRetryJob(job)}
                        disabled={!!actionKey}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-4 text-sm font-bold text-pink-700 transition hover:bg-pink-100 disabled:opacity-50"
                      >
                        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        إعادة الطباعة
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelJob(job)}
                        disabled={!!actionKey}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
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

        <aside className="flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-4 text-sm leading-7 text-slate-700">
          <ReceiptText className="mt-1 h-5 w-5 shrink-0 text-purple-500" />
          <p>
            صفحة التعديلات ترسل الورقة إلى الطابور فقط. لا تحتاج هذه الصفحة أن تبقى مفتوحة، ولا يتصل أي جهاز بالطابعة مباشرة.
            التابلت النشط وحده يطبع، والاحتياطي يستلم تلقائيًا بعد انتهاء حجز الجهاز الأول.
            كل مهمة تُخرج ورقتين: العربية ثم الهندية، ويفصل بينهما قطع كامل.
          </p>
        </aside>
      </div>

      {/* إقران محطة جديدة */}
      <BottomSheet
        open={showCreate}
        onClose={() => { if (actionKey !== 'create') setShowCreate(false) }}
        size="sm"
        zIndex="z-[100]"
        eyebrow="محطة جديدة"
        title="إقران تابلت الورشة"
        footer={(
          <button
            type="button"
            onClick={handleCreate}
            disabled={actionKey === 'create'}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 px-4 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {actionKey === 'create' ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
            إنشاء وإظهار رمز الإقران
          </button>
        )}
      >
        <label className="block text-sm font-bold text-slate-700" htmlFor="station-name">اسم الجهاز</label>
        <input
          id="station-name"
          value={stationName}
          onChange={(event) => setStationName(event.target.value)}
          className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-[15px] font-semibold outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
          maxLength={80}
          autoFocus
        />

        <p className="mt-4 text-sm font-bold text-slate-700">الدور</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="الدور">
          {([
            { value: 1, label: 'رئيسي', hint: 'الأولوية 1' },
            { value: 2, label: 'احتياطي', hint: 'الأولوية 2' },
          ] as const).map(option => {
            const isSelected = stationPriority === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setStationPriority(option.value)}
                className={`min-h-14 rounded-2xl border px-3 py-2 text-start transition ${isSelected ? 'border-pink-500 bg-pink-50 text-pink-800 ring-2 ring-pink-100' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                <span className="block text-[15px] font-bold">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.hint}</span>
              </button>
            )
          })}
        </div>
      </BottomSheet>

      {/* رمز الإقران يظهر مرة واحدة */}
      <BottomSheet
        open={Boolean(pairing)}
        onClose={() => undefined}
        hideClose
        size="lg"
        zIndex="z-[110]"
        eyebrow="يظهر مرة واحدة"
        title={`رمز إقران ${pairing?.stationName || ''}`}
        footer={(
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleCopyPairing()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 px-4 text-[15px] font-bold text-white"
            >
              {copied ? <Check className="h-5 w-5" /> : <Clipboard className="h-5 w-5" />}
              {copied ? 'تم النسخ' : 'نسخ الرمز'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPairing(null)
                setCopied(false)
              }}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-700 hover:bg-slate-50"
            >
              إغلاق بعد الإقران
            </button>
          </div>
        )}
      >
        <p className="text-[15px] leading-7 text-slate-600">
          افتح تطبيق محطة الطباعة على التابلت، ثم الصق الرمز واحفظه. بعد إغلاق هذه النافذة لن يظهر الرمز نفسه مجددًا.
        </p>
        <code dir="ltr" className="mt-4 block select-all break-all rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left font-mono text-sm leading-7 text-pink-200">
          {pairing?.pairingCode}
        </code>
      </BottomSheet>

      <ConfirmSheet
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title || ''}
        message={pendingConfirm?.message}
        confirmLabel={pendingConfirm?.confirmLabel || 'تأكيد'}
        tone={pendingConfirm?.tone}
        zIndex="z-[120]"
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => {
          const confirm = pendingConfirm
          setPendingConfirm(null)
          confirm?.onConfirm()
        }}
      />
    </main>
  )
}

export default function AlterationPrintStationPage() {
  return (
    <ProtectedWorkerRoute staffPermission={'settings.print_stations'}>
      <AlterationPrintStationDashboard />
    </ProtectedWorkerRoute>
  )
}
