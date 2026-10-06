'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileUp, ScanLine, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import HalaComparisonTable from '@/components/HalaComparisonTable'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { HALA_BRANCHES, dateRange, type HalaReport } from '@/lib/hala-reconciliation'
import { HALA_STATUS_LABELS, halaReportDays, isHalaMatched } from '@/lib/hala-report-view'

const money = (halalas: number) => new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(halalas/100)+' ر.س'

function initialDates() {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const p = (type:string) => parts.find(x=>x.type===type)?.value??''
  const today=`${p('year')}-${p('month')}-${p('day')}`
  return { start:today.slice(0,8)+'01',end:today }
}

function exportReport(report: HalaReport) {
  const cell = (value:unknown) => {
    let text=String(value??'')
    if (/^[=+\-@\t\r]/.test(text) || /^\d{16,}$/.test(text)) text="'"+text
    return '"'+text.replace(/"/g,'""')+'"'
  }
  const rows:unknown[][]=[['التاريخ','الفرع','وقت هلا','مرجع هلا','مبلغ هلا','النتيجة','فاتورة / سجل الموقع','اسم الزبونة','مبلغ الموقع','الملاحظات']]
  halaReportDays(report,'all','all').forEach(d=>d.rows.forEach(r=>rows.push([r.date,r.branch?HALA_BRANCHES[r.branch].name:r.bank?.terminal,r.bank?.time,r.bank?.reference,r.bank?(r.bank.amount/100).toFixed(2):'',HALA_STATUS_LABELS[r.status],r.site?.invoice,r.site?.customerName,r.site?(r.site.amount/100).toFixed(2):'',r.explanation])))
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download=`hala-comparison-${report.start}-${report.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export default function HalaReconciliationPage() {
  const router=useRouter(),{user,isLoading}=useAuthStore()
  const [dates,setDates]=useState(initialDates)
  const [file,setFile]=useState<File|null>(null)
  const [report,setReport]=useState<HalaReport|null>(null)
  const [error,setError]=useState(''),[progress,setProgress]=useState('')
  const request=useRef<AbortController|null>(null)
  const busy=Boolean(progress)

  useEffect(()=>{
    if(!isLoading && !user) router.replace('/login')
    else if(!isLoading && user?.role!=='admin') router.replace('/dashboard')
  },[user,isLoading,router])
  useEffect(()=>()=>request.current?.abort(),[])

  const issueCount=report ? report.bankRows.filter(r=>!isHalaMatched(r.status)).length+report.unmatchedSite.length : 0
  const matchedCount=report?.bankRows.filter(r=>isHalaMatched(r.status)).length??0
  const missingCount=report?.bankRows.filter(r=>r.status==='missing').length??0

  async function compare() {
    if (!file || busy) return
    setError('');setReport(null)
    try {
      dateRange(dates.start,dates.end)
      setProgress('قراءة ملف هلا…')
      const { readHalaPdf }=await import('@/lib/hala-pdf')
      const text=await readHalaPdf(file)
      setProgress('مقارنة العمليات بسجلات الموقع…')
      const {data:{session}}=await supabase.auth.getSession()
      if(!session) throw new Error('انتهت الجلسة؛ سجل الدخول ثم أعد المقارنة.')
      request.current?.abort();const controller=new AbortController();request.current=controller
      const response=await fetch('/api/accounting/hala-reconciliation',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({text,...dates}),signal:controller.signal,cache:'no-store',
      })
      const payload=await response.json()
      if(!response.ok || !payload.report) throw new Error(payload.error??'تعذر إكمال المقارنة.')
      setReport(payload.report)
    } catch(e) { if(!(e instanceof Error && e.name==='AbortError')) setError(e instanceof Error?e.message:'تعذر قراءة الملف.') }
    finally {setProgress('')}
  }

  if(isLoading || user?.role!=='admin') return <div className="p-12 text-center text-gray-500">جاري التحقق من الصلاحية…</div>

  return <main dir="rtl" className="min-h-screen bg-[#f4f5ef] text-[#183d32]">
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <Link href="/dashboard/accounting" className="mb-8 inline-flex items-center gap-2 text-sm text-[#527367] hover:text-[#183d32]"><ArrowRight size={18}/>المحاسبة</Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-[#cbd4c7] pb-7">
        <div><p className="mb-2 text-xs font-bold tracking-wide text-[#62786b]">التحصيلات / هلا</p><h1 className="text-3xl font-bold md:text-4xl">مطابقة مدفوعات الشبكة</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#627367]">ارفع تقرير عمليات هلا وحدد الفترة، ثم راجع ما يقابله في فواتير النسائي والأقمشة والتفصيل.</p></div>
        <span className="rounded-full border border-[#cbd4c7] px-4 py-2 text-xs">رفع يدوي · مقارنة مباشرة</span>
      </header>

      <section className="mb-7 grid overflow-hidden rounded-2xl border border-[#ced7c8] bg-white lg:grid-cols-[1fr_1.3fr]" aria-label="إعداد المقارنة">
        <div className="border-b border-[#e2e7dc] bg-[#edf1e7] p-6 lg:border-b-0 lg:border-l">
          <FileUp className="mb-4" size={30}/><h2 className="mb-2 text-xl font-bold">ملف العمليات</h2>
          <p className="mb-5 text-sm leading-7 text-[#627367]">تقرير PDF المصدّر من هلا، مثل ملف العمليات الذي قارناه سابقاً. الحد الأقصى 10 ميغابايت.</p>
          <label className="block text-sm font-semibold" htmlFor="hala-file">اختر ملف هلا</label>
          <input id="hala-file" type="file" accept=".pdf,application/pdf" disabled={busy} className="mt-2 block w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-[#183d32] file:px-4 file:py-3 file:text-white disabled:opacity-50" onChange={e=>{setFile(e.target.files?.[0]??null);setReport(null);setError('')}}/>
          {file && <p className="mt-3 break-all text-xs text-[#627367]">{file.name} · {(file.size/1024).toFixed(0)} كيلوبايت</p>}
        </div>
        <div className="p-6">
          <h2 className="mb-5 text-xl font-bold">فترة المقارنة</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">من تاريخ<input type="date" value={dates.start} disabled={busy} onChange={e=>{setDates(d=>({...d,start:e.target.value}));setReport(null);setError('')}} className="mt-2 block w-full rounded-lg border border-[#ccd6c5] bg-[#fafbf8] p-3 text-base"/></label>
            <label className="text-sm font-semibold">إلى تاريخ<input type="date" value={dates.end} disabled={busy} min={dates.start} onChange={e=>{setDates(d=>({...d,end:e.target.value}));setReport(null);setError('')}} className="mt-2 block w-full rounded-lg border border-[#ccd6c5] bg-[#fafbf8] p-3 text-base"/></label>
          </div>
          <p className="mt-3 text-xs leading-6 text-[#627367]">تشمل المقارنة يوم البداية ويوم النهاية. اختر فترة يغطيها الملف بالكامل.</p>
          <button onClick={compare} disabled={!file||busy||!dates.start||!dates.end} className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-lg bg-[#183d32] px-5 py-3.5 font-semibold text-white transition hover:bg-[#285645] disabled:cursor-not-allowed disabled:opacity-40">{busy?<Loader2 className="animate-spin" size={20}/>:<ScanLine size={20}/>} {progress||'بدء المقارنة'}</button>
        </div>
      </section>
      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {!report && !busy && <p className="text-sm leading-7 text-[#627367]">ستظهر النتائج والتنبيهات هنا بعد المقارنة. الملف لا يتضمن كشف رسوم المحفظة؛ صافي المحفظة يحتاج كشف الحساب.</p>}

      {report && <>
        <div role="status" className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${issueCount?'border-amber-300 bg-amber-50 text-amber-950':'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {issueCount?<AlertTriangle className="mt-1 shrink-0" size={22}/>:<CheckCircle2 className="mt-1 shrink-0" size={22}/>}
          <div><p className="font-bold">{matchedCount} دفعة صحيحة{issueCount?` · ${issueCount} حالة نقص أو اختلاف، منها ${missingCount} دفعة هلا غير مسجلة`:' · جميع الدفعات لها مقابل بنفس اليوم والمبلغ والفرع'}</p><p className="mt-1 text-xs leading-6">من {report.start} إلى {report.end} · لا يؤثر اختلاف الساعة على المطابقة.</p></div>
        </div>
        <section className="mb-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="إجماليات الفروع">
          {report.summary.map(s=><article key={s.branch} className="rounded-xl border border-[#ced7c8] bg-white p-5">
            <p className="text-xs text-[#718371]" dir="ltr">{HALA_BRANCHES[s.branch].terminal}</p><h2 className="mt-2 text-lg font-bold">{HALA_BRANCHES[s.branch].name}</h2>
            <dl className="mt-5 grid grid-cols-2 gap-5"><div><dt className="text-xs text-[#627367]">هلا · {s.bankCount} عملية</dt><dd className="mt-1 text-2xl font-semibold">{money(s.bankAmount)}</dd></div><div><dt className="text-xs text-[#627367]">الموقع · {s.siteCount} سجل</dt><dd className="mt-1 text-2xl font-semibold">{money(s.siteAmount)}</dd></div></dl>
            <p className={`mt-5 border-t border-[#e2e7dc] pt-3 text-sm font-semibold ${s.difference?'text-red-700':'text-[#285645]'}`}>الفرق الصافي: {money(s.difference)}</p>
            <p className="mt-1 text-xs text-[#627367]">{s.bankCount-s.missingCount-s.reviewCount} صحيحة · {s.missingCount} غير مسجلة · {s.reviewCount} بيانات متعارضة</p>
          </article>)}
        </section>
        <HalaComparisonTable key={report.comparedAt} report={report} onExport={()=>exportReport(report)}/>
        <aside className="mt-6 rounded-xl border border-[#ced7c8] p-5 text-xs leading-7 text-[#627367]"><h2 className="mb-2 font-bold text-[#183d32]">ملاحظات المقارنة</h2><ul className="list-inside list-disc">{report.warnings.map((w,i)=><li key={i}>{w}</li>)}<li>النتائج تخص الملف والفترة المحددين. تقرير العمليات لا يؤكد الرسوم الفعلية أو رصيد المحفظة.</li></ul></aside>
      </>}
    </div>
  </main>
}
