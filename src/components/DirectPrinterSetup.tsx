'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Printer,
  RadioTower,
  Unplug,
  Wifi,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  DEFAULT_DIRECT_PRINTER_IP,
  getDirectPrinterConfig,
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

  const handleTest = async () => {
    if (testState === 'testing') return
    setTestState('testing')
    setMessage('سيطلب Chrome السماح بالوصول إلى الشبكة المحلية إن كانت هذه أول مرة.')

    try {
      const next = await testDirectPrinter(ipAddress)
      setConfig(next)
      setIpAddress(next.ipAddress)
      setTestState('success')
      setMessage('أُرسلت ورقة الاختبار. أصبحت الطباعة التلقائية مفعّلة على هذا الجهاز.')
      toast.success('تم ربط الطابعة وتفعيل الطباعة المباشرة', { icon: '🧾' })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'تعذّر اختبار الطابعة.'
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
    <section
      dir="rtl"
      className="relative mb-6 overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 text-stone-50 shadow-[0_16px_50px_rgba(28,25,23,0.16)]"
      aria-labelledby="direct-printer-title"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
          backgroundSize: '18px 18px',
        }}
      />

      <div className="relative grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] sm:p-6">
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
                    : 'border-stone-600 bg-stone-800 text-stone-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-stone-500'}`} />
                {enabled ? 'متصلة مباشرة' : 'تحتاج ربطًا مرة واحدة'}
              </span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-stone-300">
              TA POS TA-900UWB · تطبع تلقائيًا من هذا الجهاز عند تسليم الطلب، دون كمبيوتر أو محطة مفتوحة.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-400">
              <span className="inline-flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5 text-amber-300" />
                الهاتف والطابعة على نفس Wi‑Fi
              </span>
              <span className="inline-flex items-center gap-1.5">
                <RadioTower className="h-3.5 w-3.5 text-amber-300" />
                إذن الشبكة المحلية يُمنح مرة واحدة
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-sm">
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
              <span>{message || (enabled ? 'الطباعة التلقائية جاهزة على هذا الجهاز.' : 'اضغط مرة واحدة ثم اختر «سماح» في Chrome.')}</span>
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
  )
}

