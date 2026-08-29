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
  ShieldCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { supabase } from '@/lib/supabase'
import { buildFabricSaleReceiptHtml, getFabricReceiptNumber } from '@/lib/print-fabric-receipt'
import {
  FABRIC_INVENTORY_LABEL_JOB_TYPE,
  FABRIC_LABEL_SIZES,
  buildFabricInventoryLabelHtml,
  getFabricLabelSize,
  isFabricInventoryLabelPayload,
  isFabricLabelSize,
  type FabricInventoryLabelPayload,
  type FabricLabelSize,
} from '@/lib/print-fabric-inventory-label'
import {
  getFabricsAutoSendEnabled,
  setFabricsAutoSendEnabled,
} from '@/lib/services/alostaz-client'
import {
  getPendingPrintJobs,
  claimPrintJob,
  markPrintJobDone,
  markPrintJobError,
  retryPrintJob,
  type PrintJob,
} from '@/lib/services/print-job-service'
import { useAuthStore } from '@/store/authStore'
import type { Income } from '@/types/simple-accounting'

type ConnectionStatus = 'connecting' | 'live' | 'error'
type StationPrintMode = 'receipts' | 'labels'
type FabricStationPayload = Income | FabricInventoryLabelPayload

const STATION_MODE_STORAGE_KEY = 'yasmin-alsham:fabrics-print-station-mode:v1'
const LABEL_SIZE_STORAGE_KEY = 'yasmin-alsham:fabrics-label-size:v1'
const FABRIC_RECEIPT_JOB_TYPE = 'fabric_sale_receipt'

interface LogEntry {
  id: string
  label: string
  status: 'done' | 'error'
  message?: string
  at: number
}

// يرسم الإيصال في iframe مخفي ويستدعي print(). مع --kiosk-printing يطبع صامتاً
// إلى الطابعة الافتراضية بلا حوار. بدون kiosk (أثناء التطوير) يظهر حوار الطباعة.
function printJobViaIframe(
  job: PrintJob<FabricStationPayload>,
  labelSize: FabricLabelSize
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    // خارج الشاشة بارتفاع حقيقي: يضمن حساب تخطيط المحتوى كاملاً قبل الطباعة
    iframe.style.position = 'fixed'
    iframe.style.left = '-10000px'
    iframe.style.top = '0'
    const isLabelJob = job.job_type === FABRIC_INVENTORY_LABEL_JOB_TYPE
    const labelDimensions = getFabricLabelSize(labelSize)
    iframe.style.width = isLabelJob ? `${labelDimensions.widthMm}mm` : '80mm'
    iframe.style.height = isLabelJob ? `${labelDimensions.heightMm}mm` : '297mm'
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

    if (isLabelJob) {
      if (!isFabricInventoryLabelPayload(job.payload)) {
        finish(new Error('بيانات ملصق القماش غير صالحة'))
        return
      }
      iframe.srcdoc = buildFabricInventoryLabelHtml(job.payload, { size: labelSize })
    } else {
      iframe.srcdoc = buildFabricSaleReceiptHtml(job.payload as Income)
    }
    document.body.appendChild(iframe)
  })
}

function jobLabel(job: PrintJob<FabricStationPayload>): string {
  if (
    job.job_type === FABRIC_INVENTORY_LABEL_JOB_TYPE &&
    isFabricInventoryLabelPayload(job.payload)
  ) {
    return `ملصق ${job.payload.product_code} — ${job.payload.color_name}`
  }
  try {
    return `فاتورة ${getFabricReceiptNumber(job.payload as Income)}`
  } catch {
    // طلب قديم أُرسل للطابور قبل وصول رقم الأستاذ.
  }
  const receiptPayload = job.payload as Income
  const name = receiptPayload?.customer_name || receiptPayload?.description
  return name ? `فاتورة: ${name}` : 'فاتورة قماش'
}

function PrintStationInner() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [pendingCount, setPendingCount] = useState(0)
  const [lastPrintedAt, setLastPrintedAt] = useState<number | null>(null)
  const [totalPrinted, setTotalPrinted] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [autoSend, setAutoSend] = useState(true)
  const [autoSendBusy, setAutoSendBusy] = useState(false)
  const [stationMode, setStationMode] = useState<StationPrintMode>('receipts')
  const [labelSize, setLabelSize] = useState<FabricLabelSize>('70x50')
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [isPrintingJob, setIsPrintingJob] = useState(false)

  // حراسة التسلسل: طلب واحد قيد المعالجة في كل مرة، مع إعادة تشغيل إن وصل حدث جديد أثناء المعالجة
  const processingRef = useRef(false)
  const rerunRef = useRef(false)
  const stationModeRef = useRef<StationPrintMode>('receipts')
  const labelSizeRef = useRef<FabricLabelSize>('70x50')

  const addLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 20))
  }, [])

  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem(STATION_MODE_STORAGE_KEY)
      const savedSize = window.localStorage.getItem(LABEL_SIZE_STORAGE_KEY)
      if (savedMode === 'receipts' || savedMode === 'labels') {
        stationModeRef.current = savedMode
        setStationMode(savedMode)
      }
      if (isFabricLabelSize(savedSize)) {
        labelSizeRef.current = savedSize
        setLabelSize(savedSize)
      }
    } catch {
      // تعمل المحطة بالقيم الآمنة الافتراضية إذا كان التخزين المحلي غير متاح.
    } finally {
      setPreferencesReady(true)
    }
  }, [])

  useEffect(() => {
    let active = true
    getFabricsAutoSendEnabled()
      .then((enabled) => {
        if (active) setAutoSend(enabled)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const handleToggleAutoSend = async () => {
    if (!isAdmin || autoSendBusy) return

    const next = !autoSend
    setAutoSend(next)
    setAutoSendBusy(true)
    const { error } = await setFabricsAutoSendEnabled(next)
    setAutoSendBusy(false)

    if (error) {
      setAutoSend(!next)
      toast.error('تعذّر تحديث إعداد الإرسال التلقائي: ' + error)
      return
    }

    toast.success(
      next
        ? 'تم تفعيل الإرسال التلقائي لفواتير الشبكة'
        : 'تم إيقاف الإرسال التلقائي لفواتير الشبكة'
    )
  }

  const handleStationModeChange = (nextMode: StationPrintMode) => {
    if (isPrintingJob || nextMode === stationMode) return
    stationModeRef.current = nextMode
    setStationMode(nextMode)
    setPendingCount(0)
    try {
      window.localStorage.setItem(STATION_MODE_STORAGE_KEY, nextMode)
    } catch {
      // يبقى الاختيار فعالاً للجلسة الحالية.
    }
  }

  const handleLabelSizeChange = (nextSize: FabricLabelSize) => {
    labelSizeRef.current = nextSize
    setLabelSize(nextSize)
    try {
      window.localStorage.setItem(LABEL_SIZE_STORAGE_KEY, nextSize)
    } catch {
      // يبقى المقاس فعالاً للجلسة الحالية.
    }
  }

  const processQueue = useCallback(async () => {
    if (processingRef.current) {
      rerunRef.current = true
      return
    }
    processingRef.current = true
    try {
      do {
        rerunRef.current = false
        const activeMode = stationModeRef.current
        let jobs: PrintJob<FabricStationPayload>[] = []
        try {
          jobs = await getPendingPrintJobs<FabricStationPayload>('fabrics', [
            activeMode === 'labels'
              ? FABRIC_INVENTORY_LABEL_JOB_TYPE
              : FABRIC_RECEIPT_JOB_TYPE,
          ])
        } catch (e) {
          console.error('فشل جلب طلبات الطباعة:', e)
          setConnection('error')
          break
        }
        setPendingCount(jobs.length)

        for (const job of jobs) {
          if (stationModeRef.current !== activeMode) {
            rerunRef.current = true
            break
          }
          // مطالبة ذرية: لو فاز عميل آخر بالطلب نتخطّاه
          let claimed: PrintJob<FabricStationPayload> | null = null
          try {
            claimed = await claimPrintJob<FabricStationPayload>(job.id)
          } catch (e) {
            console.error('فشل المطالبة بالطلب:', e)
            continue
          }
          if (!claimed) continue
          if (stationModeRef.current !== activeMode) {
            try { await retryPrintJob(claimed.id) } catch { /* سيبقى ظاهراً للإدارة إن تعذّر تحريره */ }
            rerunRef.current = true
            break
          }

          setIsPrintingJob(true)
          try {
            await printJobViaIframe(claimed, labelSizeRef.current)
            await markPrintJobDone(claimed.id)
            setLastPrintedAt(Date.now())
            setTotalPrinted((n) => n + 1)
            addLog({ id: claimed.id, label: jobLabel(claimed), status: 'done', at: Date.now() })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            try { await markPrintJobError(claimed.id, msg) } catch { /* noop */ }
            addLog({ id: claimed.id, label: jobLabel(claimed), status: 'error', message: msg, at: Date.now() })
          } finally {
            setIsPrintingJob(false)
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
    if (!preferencesReady) return

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
  }, [preferencesReady, processQueue, stationMode])

  const statusBadge = {
    connecting: { icon: RefreshCw, text: 'جارٍ الاتصال...', cls: 'bg-amber-100 text-amber-700', spin: true },
    live: { icon: Wifi, text: 'متصلة — جاهزة للطباعة', cls: 'bg-emerald-100 text-emerald-700', spin: false },
    error: { icon: WifiOff, text: 'انقطع الاتصال — يُعاد المحاولة', cls: 'bg-red-100 text-red-700', spin: false },
  }[connection]

  const StatusIcon = statusBadge.icon
  const isLabelMode = stationMode === 'labels'
  const activeModeLabel = isLabelMode ? 'ملصقات المخزون' : 'فواتير المبيعات'

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
              <p className="text-sm text-slate-500">قسم الأقمشة — فواتير المبيعات وملصقات المخزون</p>
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

        {/* نوع المستند والطابعة المستخدمة حالياً */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-800">وضع محطة الطباعة</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                تعالج المحطة نوعاً واحداً فقط، وتترك النوع الآخر محفوظاً في الطابور.
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
              isLabelMode ? 'bg-slate-900 text-white' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {activeModeLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="اختيار وضع محطة الطباعة">
            <button
              type="button"
              onClick={() => handleStationModeChange('receipts')}
              disabled={isPrintingJob}
              aria-pressed={!isLabelMode}
              className={`rounded-lg px-3 py-2.5 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${
                !isLabelMode
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
              }`}
            >
              فواتير المبيعات
            </button>
            <button
              type="button"
              onClick={() => handleStationModeChange('labels')}
              disabled={isPrintingJob}
              aria-pressed={isLabelMode}
              className={`rounded-lg px-3 py-2.5 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${
                isLabelMode
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
              }`}
            >
              ملصقات المخزون
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="fabric-label-size" className="block text-xs font-black text-slate-700">
                مقاس ملصق TA-452
              </label>
              <select
                id="fabric-label-size"
                value={labelSize}
                disabled={isPrintingJob}
                onChange={(event) => {
                  const nextSize = event.target.value
                  if (isFabricLabelSize(nextSize)) handleLabelSizeChange(nextSize)
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                {FABRIC_LABEL_SIZES.map((size) => (
                  <option key={size.id} value={size.id}>{size.label}</option>
                ))}
              </select>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                اضبطه قبل التحويل إلى وضع الملصقات، ويجب أن يطابق تعريف الورق في إعدادات الطابعة على Windows.
              </p>
          </div>
        </div>

        {/* التحكم المحصور داخل محطة الطباعة */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  autoSend
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">
                  الإرسال التلقائي للمحاسبة
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {autoSend
                    ? 'مفعّل — تُرسل مبيعات الشبكة الجديدة إلى الأستاذ تلقائياً.'
                    : 'متوقف — لن تُرسل المبيعات الجديدة حتى إعادة التفعيل.'}
                </p>
              </div>
            </div>

            {isAdmin ? (
              <button
                type="button"
                onClick={handleToggleAutoSend}
                disabled={autoSendBusy}
                role="switch"
                aria-checked={autoSend}
                aria-label="الإرسال التلقائي لفواتير الأقمشة"
                dir="ltr"
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                  autoSend ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                    autoSend ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            ) : (
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                  autoSend
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {autoSend ? 'مفعّل' : 'متوقف'}
              </span>
            )}
          </div>
        </div>

        {/* بطاقات مؤشرات */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <Clock className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold text-slate-800">{pendingCount}</p>
            <p className="text-xs text-slate-500">بانتظار {isLabelMode ? 'الملصقات' : 'الفواتير'}</p>
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
          <p>
            أبقِ هذه الصفحة مفتوحة على جهاز الكاشير. للطباعة الصامتة شغّل Chrome بوضع <code className="font-mono">--kiosk-printing</code> واجعل{' '}
            <strong>{isLabelMode ? 'TA POS TA-452' : 'طابعة الفواتير CityPOS'}</strong>{' '}
            هي طابعة Windows الافتراضية. لا حاجة لفصل الطابعة الأخرى؛ تغيير الافتراضية يكفي.
          </p>
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
