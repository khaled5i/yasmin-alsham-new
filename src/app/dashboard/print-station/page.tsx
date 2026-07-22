'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Printer,
  ReceiptText,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { supabase } from '@/lib/supabase'
import {
  buildTailoringReceiptHtml,
  type TailoringReceiptPayload,
} from '@/lib/print-tailoring-receipt'
import {
  claimPrintJob,
  getPendingPrintJobs,
  markPrintJobDone,
  markPrintJobError,
  type PrintJob,
} from '@/lib/services/print-job-service'

type ConnectionStatus = 'connecting' | 'live' | 'error'

interface PrintLogEntry {
  id: string
  orderNumber: string
  invoiceCode: string
  status: 'done' | 'error'
  message?: string
  at: number
}

function printReceiptViaIframe(job: PrintJob<TailoringReceiptPayload>): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.left = '-10000px'
    iframe.style.top = '0'
    iframe.style.width = '80mm'
    iframe.style.height = '297mm'
    iframe.style.border = '0'

    const cleanup = () => {
      setTimeout(() => {
        try { iframe.remove() } catch { /* لا إجراء */ }
      }, 1500)
    }

    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (error) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve()
      cleanup()
    }

    iframe.onload = () => {
      try {
        const frameWindow = iframe.contentWindow
        if (!frameWindow) throw new Error('تعذّر الوصول إلى إطار الطباعة')

        setTimeout(() => {
          try {
            frameWindow.focus()
            frameWindow.print()
            finish()
          } catch (error) {
            finish(error)
          }
        }, 250)
      } catch (error) {
        finish(error)
      }
    }

    setTimeout(() => finish(new Error('انتهت مهلة الطباعة')), 12_000)
    iframe.srcdoc = buildTailoringReceiptHtml(job.payload)
    document.body.appendChild(iframe)
  })
}

function TailoringPrintStation() {
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [pendingCount, setPendingCount] = useState(0)
  const [printedCount, setPrintedCount] = useState(0)
  const [lastPrintedAt, setLastPrintedAt] = useState<number | null>(null)
  const [log, setLog] = useState<PrintLogEntry[]>([])
  const processingRef = useRef(false)
  const rerunRef = useRef(false)

  const appendLog = useCallback((entry: PrintLogEntry) => {
    setLog((current) => [entry, ...current].slice(0, 20))
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current) {
      rerunRef.current = true
      return
    }

    processingRef.current = true
    try {
      do {
        rerunRef.current = false
        let jobs: PrintJob<TailoringReceiptPayload>[]

        try {
          jobs = await getPendingPrintJobs<TailoringReceiptPayload>('tailoring')
          setConnection('live')
        } catch (error) {
          console.error('فشل جلب إيصالات التفصيل:', error)
          setConnection('error')
          break
        }

        setPendingCount(jobs.length)
        for (const job of jobs) {
          let claimed: PrintJob<TailoringReceiptPayload> | null = null
          try {
            claimed = await claimPrintJob<TailoringReceiptPayload>(job.id)
          } catch (error) {
            console.error('فشل حجز طلب الطباعة:', error)
          }
          if (!claimed) continue

          const baseLog = {
            id: claimed.id,
            orderNumber: claimed.payload.order_number,
            invoiceCode: claimed.payload.invoice_code,
            at: Date.now(),
          }

          try {
            await printReceiptViaIframe(claimed)
            await markPrintJobDone(claimed.id)
            setLastPrintedAt(Date.now())
            setPrintedCount((count) => count + 1)
            appendLog({ ...baseLog, status: 'done' })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            try { await markPrintJobError(claimed.id, message) } catch { /* لا إجراء */ }
            appendLog({ ...baseLog, status: 'error', message })
          }

          await new Promise((resolve) => setTimeout(resolve, 400))
        }
        setPendingCount(0)
      } while (rerunRef.current)
    } finally {
      processingRef.current = false
    }
  }, [appendLog])

  useEffect(() => {
    void processQueue()

    const channel = supabase
      .channel('tailoring_print_station')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'print_jobs',
          filter: 'branch=eq.tailoring',
        },
        () => { void processQueue() }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('error')
      })

    const poll = window.setInterval(() => { void processQueue() }, 25_000)
    const handleOnline = () => { void processQueue() }
    window.addEventListener('online', handleOnline)

    return () => {
      void supabase.removeChannel(channel)
      window.clearInterval(poll)
      window.removeEventListener('online', handleOnline)
    }
  }, [processQueue])

  const status = {
    connecting: {
      icon: RefreshCw,
      label: 'جارٍ الاتصال بالطابور',
      detail: 'لحظات وتصبح المحطة جاهزة',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      iconClassName: 'animate-spin text-amber-600',
    },
    live: {
      icon: Wifi,
      label: 'جاهزة للطباعة',
      detail: 'ستُطبع إيصالات الطلبات المسلّمة تلقائيًا',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      iconClassName: 'text-emerald-600',
    },
    error: {
      icon: WifiOff,
      label: 'الاتصال غير مستقر',
      detail: 'ستستمر المحطة في إعادة المحاولة تلقائيًا',
      className: 'border-rose-200 bg-rose-50 text-rose-950',
      iconClassName: 'text-rose-600',
    },
  }[connection]
  const StatusIcon = status.icon

  return (
    <main dir="rtl" className="min-h-screen bg-[#f1eee7] px-4 py-6 text-stone-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-stone-300 pb-5">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-stone-950 text-[#f7c95c] shadow-[0_10px_30px_rgba(28,25,23,0.18)]">
              <ReceiptText className="h-7 w-7" />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold tracking-[0.24em] text-amber-700">ياسمين الشام</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">محطة إيصالات التفصيل</h1>
              <p className="mt-1 text-sm text-stone-600">الطابعة الحرارية الافتراضية · ورق 80mm</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-300 bg-white/70 text-stone-700 transition hover:-translate-x-0.5 hover:bg-white"
            title="العودة إلى الشاشة الرئيسية"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
        </header>

        <section className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 ${status.className}`}>
          <StatusIcon className={`h-6 w-6 shrink-0 ${status.iconClassName}`} />
          <div>
            <p className="font-black">{status.label}</p>
            <p className="text-xs opacity-75">{status.detail}</p>
          </div>
          <span className="mr-auto h-2.5 w-2.5 rounded-full bg-current opacity-70" />
        </section>

        <section className="mb-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-stone-300 bg-white/75 shadow-sm">
          <div className="border-l border-stone-200 p-4 text-center">
            <Clock3 className="mx-auto mb-2 h-5 w-5 text-amber-600" />
            <p className="text-2xl font-black tabular-nums">{pendingCount}</p>
            <p className="text-xs text-stone-500">في الانتظار</p>
          </div>
          <div className="border-l border-stone-200 p-4 text-center">
            <Printer className="mx-auto mb-2 h-5 w-5 text-emerald-700" />
            <p className="text-2xl font-black tabular-nums">{printedCount}</p>
            <p className="text-xs text-stone-500">طُبعت الآن</p>
          </div>
          <div className="p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-stone-700" />
            <p className="mt-1 text-sm font-black tabular-nums">
              {lastPrintedAt
                ? new Date(lastPrintedAt).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </p>
            <p className="mt-1 text-xs text-stone-500">آخر إيصال</p>
          </div>
        </section>

        <aside className="mb-6 flex items-start gap-3 rounded-2xl bg-stone-950 p-4 text-sm leading-6 text-stone-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#f7c95c]" />
          <p>
            اترك هذه الصفحة مفتوحة على جهاز الطابعة. يجب تشغيل المتصفح بخيار{' '}
            <code dir="ltr" className="rounded bg-white/10 px-1.5 py-0.5 text-[#f7c95c]">--kiosk-printing</code>{' '}
            للطباعة المباشرة بلا نافذة تأكيد.
          </p>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-stone-300 bg-white/80 shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div>
              <h2 className="font-black">سجل هذه الجلسة</h2>
              <p className="text-xs text-stone-500">آخر 20 عملية طباعة</p>
            </div>
            <button
              type="button"
              onClick={() => { void processQueue() }}
              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold transition hover:border-amber-400 hover:text-amber-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              فحص الآن
            </button>
          </div>

          {log.length === 0 ? (
            <div className="grid min-h-40 place-items-center px-4 py-10 text-center text-stone-400">
              <div>
                <Printer className="mx-auto mb-3 h-8 w-8 opacity-40" />
                <p className="text-sm">بانتظار أول طلب يتم تسليمه</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-stone-200">
              {log.map((entry) => (
                <li key={`${entry.id}-${entry.at}`} className="flex items-center gap-3 px-4 py-3">
                  {entry.status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">طلب {entry.orderNumber}</p>
                    <p dir="ltr" className="truncate text-left text-xs text-stone-500">{entry.invoiceCode}</p>
                    {entry.message ? <p className="mt-1 text-xs text-rose-600">{entry.message}</p> : null}
                  </div>
                  <time className="text-xs tabular-nums text-stone-400">
                    {new Date(entry.at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

export default function PrintStationPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessOrders" allowAdmin={true}>
      <TailoringPrintStation />
    </ProtectedWorkerRoute>
  )
}
