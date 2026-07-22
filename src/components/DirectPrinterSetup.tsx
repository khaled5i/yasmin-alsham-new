'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Printer,
  RadioTower,
  ReceiptText,
  RefreshCw,
  Unplug,
  Wifi,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  DEFAULT_DIRECT_PRINTER_IP,
  getDirectPrinterConfig,
  PRINT_BRIDGE_APK_PATH,
  saveDirectPrinterConfig,
  testDirectPrinter,
  type DirectPrinterConfig,
} from '@/lib/services/direct-thermal-printer'

type TestState = 'idle' | 'testing' | 'success' | 'error'

export default function DirectPrinterSetup() {
  const [config, setConfig] = useState<DirectPrinterConfig | null>(null)
  const [ipAddress, setIpAddress] = useState(DEFAULT_DIRECT_PRINTER_IP)
  const [testState, setTestState] = useState<TestState>('idle')
  const [message, setMessage] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const stored = getDirectPrinterConfig()
    setConfig(stored)
    setIpAddress(stored.ipAddress)

    const handleConfigChange = (event: Event) => {
      const next = (event as CustomEvent<DirectPrinterConfig>).detail
      if (!next) return
      setConfig(next)
      setIpAddress(next.ipAddress)
    }
    window.addEventListener('direct-printer-config-changed', handleConfigChange)
    return () => window.removeEventListener('direct-printer-config-changed', handleConfigChange)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleTest = async () => {
    if (testState === 'testing') return
    setTestState('testing')
    setMessage('يتم الآن فحص جسر الطباعة ثم إرسال ورقة اختبار حقيقية عبر TCP 9100.')

    try {
      const next = await testDirectPrinter(ipAddress)
      setConfig(next)
      setIpAddress(next.ipAddress)
      setTestState('success')
      setMessage('أُرسلت ورقة الاختبار. أصبحت الطباعة التلقائية مفعّلة على هذا الجهاز.')
      toast.success('تم ربط الطابعة وتفعيل الطباعة المباشرة', { icon: '🧾' })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'تعذّر اختبار الطابعة.'
      try {
        setConfig(saveDirectPrinterConfig({ enabled: false, ipAddress }))
      } catch {
        // رسالة التحقق الأصلية أدق من خطأ حفظ الإعداد المحلي.
      }
      setTestState('error')
      setMessage(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleDisable = () => {
    const next = saveDirectPrinterConfig({ enabled: false, ipAddress })
    setConfig(next)
    setTestState('idle')
    setMessage('تم إيقاف الطباعة المباشرة على هذا الجهاز؛ ستُستخدم محطة الطباعة الاحتياطية.')
    toast.success('تم إيقاف الطباعة المباشرة')
  }

  const enabled = config?.enabled === true

  return (
    <div dir="rtl" className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href="/dashboard/print-station"
        aria-label="فتح محطة إيصالات التفصيل"
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        <ReceiptText className="h-4 w-4" />
        <span className="hidden sm:inline">محطة الإيصالات</span>
      </Link>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300"
        aria-haspopup="dialog"
        aria-label="فتح إعدادات طابعة إيصالات التفصيل"
      >
        <Printer className="h-4 w-4" />
        <span className="hidden sm:inline">طابعة إيصالات التفصيل</span>
        <span
          className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-rose-500'}`}
          aria-hidden="true"
        />
      </button>

      {config !== null && !enabled ? (
        <button
          type="button"
          onClick={() => { void handleTest() }}
          disabled={testState === 'testing'}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-rose-200 transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {testState === 'testing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {testState === 'testing' ? 'جاري الاتصال' : 'إعادة الاتصال'}
        </button>
      ) : null}

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
            aria-labelledby="direct-printer-title"
            className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-stone-700 bg-stone-950 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.4)]"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
                backgroundSize: '18px 18px',
              }}
            />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute left-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/10 text-stone-200 transition hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="إغلاق إعدادات الطابعة"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative grid gap-5 p-5 pt-16 sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] sm:p-6 sm:pt-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-300">
                  <Printer className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 id="direct-printer-title" className="text-lg font-black tracking-tight">
                      طابعة إيصالات التفصيل
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                        enabled
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                          : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      {enabled ? 'متصلة عبر الجسر' : 'الاتصال مقطوع'}
                    </span>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-stone-300">
                    TA POS TA-900UWB · تطبع تلقائيًا من نسخة Chrome عبر جسر أندرويد خفيف، دون كمبيوتر أو محطة مفتوحة.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Wifi className="h-3.5 w-3.5 text-amber-300" />
                      الهاتف والطابعة على نفس Wi‑Fi
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <RadioTower className="h-3.5 w-3.5 text-amber-300" />
                      جسر الطباعة يعمل في خلفية الهاتف
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-sm">
                {!enabled ? (
                  <a
                    href={PRINT_BRIDGE_APK_PATH}
                    download
                    className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2.5 text-xs font-black text-amber-200 transition hover:bg-amber-300/20 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                  >
                    <Download className="h-4 w-4" />
                    تنزيل جسر الطباعة لأندرويد APK
                  </a>
                ) : null}
                <label htmlFor="direct-printer-ip" className="mb-1.5 block text-xs font-bold text-stone-300">
                  عنوان الطابعة الثابت
                </label>
                <div className="flex gap-2" dir="ltr">
                  <input
                    id="direct-printer-ip"
                    type="text"
                    inputMode="decimal"
                    value={ipAddress}
                    onChange={(event) => {
                      setIpAddress(event.target.value)
                      setTestState('idle')
                      setMessage('')
                    }}
                    disabled={testState === 'testing'}
                    className="min-w-0 flex-1 rounded-lg border border-stone-600 bg-stone-900 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 disabled:opacity-60"
                    aria-describedby="direct-printer-message"
                  />
                  <button
                    type="button"
                    onClick={() => { void handleTest() }}
                    disabled={testState === 'testing'}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-black text-stone-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950 disabled:cursor-wait disabled:opacity-60"
                  >
                    {testState === 'testing' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : enabled ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Wifi className="h-4 w-4" />
                    )}
                    <span>{testState === 'testing' ? 'جارٍ الربط' : enabled ? 'إعادة الاختبار' : 'ربط واختبار'}</span>
                  </button>
                </div>

                <div className="mt-2.5 flex min-h-5 items-start justify-between gap-3">
                  <p
                    id="direct-printer-message"
                    role="status"
                    aria-live="polite"
                    className={`flex items-start gap-1.5 text-[11px] leading-5 ${
                      testState === 'error'
                        ? 'text-rose-300'
                        : testState === 'success' || enabled
                          ? 'text-emerald-300'
                          : 'text-stone-400'
                    }`}
                  >
                    {testState === 'error' ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : enabled ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : null}
                    <span>
                      {message || (enabled
                        ? 'الطباعة التلقائية جاهزة على هذا الجهاز.'
                        : 'نزّل الجسر وافتحه وشغّل الخدمة، ثم اضغط «ربط واختبار».')}
                    </span>
                  </p>
                  {enabled ? (
                    <button
                      type="button"
                      onClick={handleDisable}
                      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-stone-400 transition hover:text-rose-300"
                    >
                      <Unplug className="h-3.5 w-3.5" />
                      إيقاف
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
