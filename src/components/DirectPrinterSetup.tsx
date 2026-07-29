'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RadioTower,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  getTailoringPrintStationOverview,
  type TailoringPrintStationOverview,
} from '@/lib/services/tailoring-print-station-service'

const PRINT_STATION_APK_PATH = '/downloads/yasmin-print-bridge.apk'

function activeStationName(overview: TailoringPrintStationOverview | null): string | null {
  if (!overview?.lease) return null
  if (new Date(overview.lease.lease_expires_at).getTime() <= Date.now()) return null
  return overview.stations.find((station) => station.id === overview.lease?.station_id)?.name ?? null
}

/**
 * Kept under its historical export name so existing dashboard call sites do
 * not churn. It now describes and monitors the central station system; it
 * never probes localhost and never stores a printer IP on the employee phone.
 */
export default function DirectPrinterSetup() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'
  const [isOpen, setIsOpen] = useState(false)
  const [overview, setOverview] = useState<TailoringPrintStationOverview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !isAdmin) return

    let active = true
    void getTailoringPrintStationOverview()
      .then((result) => {
        if (!active) return
        setOverview(result)
        setError('')
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'تعذّر قراءة حالة المحطات.')
      })

    return () => {
      active = false
    }
  }, [isAdmin, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const activeName = useMemo(() => activeStationName(overview), [overview])
  const queuedCount = overview?.queue.pending ?? 0
  const statusDotClass = activeName
    ? 'bg-emerald-500'
    : overview || error
      ? 'bg-amber-400'
      : 'bg-stone-400'

  return (
    <div dir="rtl" className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href="/dashboard/print-station"
        aria-label="فتح إدارة محطات طباعة التفصيل"
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        <RadioTower className="h-4 w-4" />
        <span className="hidden sm:inline">محطات الطباعة</span>
      </Link>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300"
        aria-haspopup="dialog"
        aria-label="عرض حالة نظام طباعة إيصالات التفصيل"
      >
        <ReceiptText className="h-4 w-4" />
        <span className="hidden sm:inline">طباعة التفصيل</span>
        <span
          className={`h-2 w-2 rounded-full ${statusDotClass}`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[9999] grid place-items-center bg-stone-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-station-system-title"
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-stone-700 bg-stone-950 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.45)]"
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute left-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/10 text-stone-200 transition hover:bg-white/20"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="border-b border-white/10 bg-amber-300/[0.08] p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300 text-stone-950">
                  <RadioTower className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black tracking-[0.17em] text-amber-300">QUEUE-FIRST</p>
                  <h2 id="print-station-system-title" className="mt-1 text-xl font-black">
                    نظام محطة طباعة التفصيل
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">
                    كل هاتف يرسل الفاتورة إلى طابور آمن فقط. التابلت النشط يتولى الطباعة،
                    ويستلم التابلت الاحتياطي تلقائيًا إذا انقطع الأول.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <Smartphone className="mb-3 h-5 w-5 text-amber-300" />
                  <p className="text-xs text-stone-400">المحطات المقترنة</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {isAdmin ? overview?.stations.length ?? '—' : '2'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  {activeName ? (
                    <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-300" />
                  ) : (
                    <WifiOff className="mb-3 h-5 w-5 text-rose-300" />
                  )}
                  <p className="text-xs text-stone-400">المحطة النشطة</p>
                  <p className="mt-1 truncate text-sm font-black">{isAdmin ? activeName || 'لا توجد' : 'تلقائية'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <ReceiptText className="mb-3 h-5 w-5 text-sky-300" />
                  <p className="text-xs text-stone-400">في الانتظار</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">{isAdmin ? queuedCount : '—'}</p>
                </div>
              </div>

              {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              ) : null}

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <p>
                  لا تثبّت تطبيق المحطة على كل هاتف. يثبت فقط على تابلتي الاستقبال،
                  ولا يلزم إبقاء موقع ياسمين الشام مفتوحًا عليهما.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {isAdmin ? (
                  <Link
                    href="/dashboard/print-station"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-stone-950 transition hover:bg-amber-200"
                  >
                    <Settings2 className="h-4 w-4" />
                    إدارة الرئيسي والاحتياطي
                  </Link>
                ) : null}
                <a
                  href={PRINT_STATION_APK_PATH}
                  download
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-stone-200 transition hover:bg-white/10"
                >
                  <Download className="h-4 w-4" />
                  تنزيل تطبيق المحطة للتابلت
                </a>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
