'use client'

// ============================================================================
// محطة الطباعة عن بُعد — تُفتح على جهاز الكاشير الموصول بطابعة CityPOS
// ----------------------------------------------------------------------------
// تستمع لطلبات الطباعة (print_jobs) عبر Supabase Realtime، تطالب بكل طلب ذرياً،
// ترسمه في iframe مخفي وتطبعه صامتاً (مع تشغيل Chrome بوضع --kiosk-printing)،
// ثم تعلّمه 'done'. الطلبات تُعالَج بالتسلسل لتجنّب تداخل الطباعة.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Printer,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { supabase } from '@/lib/supabase'
import { buildFabricSaleReceiptHtml } from '@/lib/print-fabric-receipt'
import {
  getPendingPrintJobs,
  claimPrintJob,
  markPrintJobDone,
  markPrintJobError,
  type PrintJob,
} from '@/lib/services/print-job-service'

type ConnectionStatus = 'connecting' | 'live' | 'error'

interface LogEntry {
  id: string
  label: string
  status: 'done' | 'error'
  message?: string
  at: number
}

// يرسم الإيصال في iframe مخفي ويستدعي print(). مع --kiosk-printing يطبع صامتاً
// إلى الطابعة الافتراضية بلا حوار. بدون kiosk (أثناء التطوير) يظهر حوار الطباعة.
function printReceiptViaIframe(job: PrintJob): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    // خارج الشاشة بارتفاع حقيقي: يضمن حساب تخطيط المحتوى كاملاً قبل الطباعة
    iframe.style.position = 'fixed'
    iframe.style.left = '-10000px'
    iframe.style.top = '0'
    iframe.style.width = '80mm'
    iframe.style.height = '297mm'
    iframe.style.border = '0'

    const cleanup = () => {
      setTimeout(() => {
        try { iframe.remove() } catch { /* noop */ }
      }, 1500)
    }

    const finish = (err?: unknown) => {
      if (settled) return
      settled = true
      if (err) reject(err instanceof Error ? err : new Error(String(err)))
      else resolve()
      cleanup()
    }

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow
        if (!win) throw new Error('تعذّر الوصول لإطار الطباعة')
        // مهلة صغيرة لضمان اكتمال التخطيط قبل الطباعة
        setTimeout(() => {
          try {
            win.focus()
            win.print()
            finish()
          } catch (e) {
            finish(e)
          }
        }, 250)
      } catch (e) {
        finish(e)
      }
    }

    // مهلة أمان: لا نُبقي طلباً معلّقاً للأبد لو تعثّر الإطار
    setTimeout(() => finish(new Error('انتهت مهلة الطباعة')), 12000)

    iframe.srcdoc = buildFabricSaleReceiptHtml(job.payload)
    document.body.appendChild(iframe)
  })
}

function jobLabel(job: PrintJob): string {
  const inv = job.payload?.invoice_number
  if (inv != null) return `فاتورة #${inv}`
  const name = job.payload?.customer_name || job.payload?.description
  return name ? `فاتورة: ${name}` : 'فاتورة قماش'
}

function PrintStationInner() {
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [pendingCount, setPendingCount] = useState(0)
  const [lastPrintedAt, setLastPrintedAt] = useState<number | null>(null)
  const [totalPrinted, setTotalPrinted] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])

  // حراسة التسلسل: طلب واحد قيد المعالجة في كل مرة، مع إعادة تشغيل إن وصل حدث جديد أثناء المعالجة
  const processingRef = useRef(false)
  const rerunRef = useRef(false)

  const addLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 20))
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
        let jobs: PrintJob[] = []
        try {
          jobs = await getPendingPrintJobs('fabrics')
        } catch (e) {
          console.error('فشل جلب طلبات الطباعة:', e)
          setConnection('error')
          break
        }
        setPendingCount(jobs.length)

        for (const job of jobs) {
          // مطالبة ذرية: لو فاز عميل آخر بالطلب نتخطّاه
          let claimed: PrintJob | null = null
          try {
            claimed = await claimPrintJob(job.id)
          } catch (e) {
            console.error('فشل المطالبة بالطلب:', e)
            continue
          }
          if (!claimed) continue

          try {
            await printReceiptViaIframe(claimed)
            await markPrintJobDone(claimed.id)
            setLastPrintedAt(Date.now())
            setTotalPrinted((n) => n + 1)
            addLog({ id: claimed.id, label: jobLabel(claimed), status: 'done', at: Date.now() })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            try { await markPrintJobError(claimed.id, msg) } catch { /* noop */ }
            addLog({ id: claimed.id, label: jobLabel(claimed), status: 'error', message: msg, at: Date.now() })
          }

          // مهلة قصيرة بين الطلبات حتى يلتقط طابور الطباعة أنفاسه
          await new Promise((r) => setTimeout(r, 400))
        }
        setPendingCount(0)
      } while (rerunRef.current)
    } finally {
      processingRef.current = false
    }
  }, [addLog])

  useEffect(() => {
    // 1) التقاط الطلبات المتراكمة عند بدء التشغيل (لو كان الكاشير مطفأً وقت الإرسال)
    processQueue()

    // 2) الاستماع اللحظي للطلبات الجديدة
    const channel = supabase
      .channel('fabrics_print_station')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'print_jobs' },
        () => { processQueue() }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('error')
      })

    // 3) استطلاع أمان دوري (كل 25 ثانية) في حال فات حدث Realtime
    const poll = setInterval(() => { processQueue() }, 25_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [processQueue])

  const statusBadge = {
    connecting: { icon: RefreshCw, text: 'جارٍ الاتصال...', cls: 'bg-amber-100 text-amber-700', spin: true },
    live: { icon: Wifi, text: 'متصلة — جاهزة للطباعة', cls: 'bg-emerald-100 text-emerald-700', spin: false },
    error: { icon: WifiOff, text: 'انقطع الاتصال — يُعاد المحاولة', cls: 'bg-red-100 text-red-700', spin: false },
  }[connection]

  const StatusIcon = statusBadge.icon

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Printer className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">محطة الطباعة</h1>
              <p className="text-sm text-slate-500">قسم الأقمشة — تُطبع الفواتير المرسَلة من الجوال تلقائياً</p>
            </div>
          </div>
          <Link
            href="/dashboard/accounting/fabrics/income"
            className="p-2 text-slate-500 hover:bg-white rounded-lg transition-colors"
            title="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* شريط الحالة */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl mb-4 font-medium ${statusBadge.cls}`}>
          <StatusIcon className={`w-5 h-5 ${statusBadge.spin ? 'animate-spin' : ''}`} />
          <span>{statusBadge.text}</span>
        </div>

        {/* بطاقات مؤشرات */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <Clock className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold text-slate-800">{pendingCount}</p>
            <p className="text-xs text-slate-500">في الانتظار</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-2xl font-bold text-slate-800">{totalPrinted}</p>
            <p className="text-xs text-slate-500">طُبعت الآن</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <Printer className="w-5 h-5 mx-auto text-slate-500 mb-1" />
            <p className="text-sm font-bold text-slate-800 mt-1">
              {lastPrintedAt ? new Date(lastPrintedAt).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
            <p className="text-xs text-slate-500">آخر طباعة</p>
          </div>
        </div>

        {/* تنبيه الإبقاء مفتوحة */}
        <div className="flex items-start gap-2 bg-sky-50 text-sky-800 rounded-xl p-3 mb-6 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>أبقِ هذه الصفحة مفتوحة على جهاز الكاشير. للطباعة الصامتة (بلا نافذة حوار) شغّل Chrome بوضع <code className="font-mono">--kiosk-printing</code> واجعل طابعة CityPOS هي الافتراضية.</p>
        </div>

        {/* سجل آخر العمليات */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="font-bold text-slate-700 text-sm">آخر العمليات</h2>
            <button
              onClick={() => processQueue()}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              تحديث
            </button>
          </div>
          {log.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">لا توجد عمليات بعد</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {log.map((entry) => (
                <li key={`${entry.id}-${entry.at}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {entry.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm text-slate-700">{entry.label}</p>
                      {entry.message && <p className="text-xs text-red-500">{entry.message}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(entry.at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PrintStationPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <PrintStationInner />
    </ProtectedWorkerRoute>
  )
}
