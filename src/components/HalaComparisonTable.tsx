'use client'

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { HALA_BRANCHES, type HalaBranch, type HalaReport } from '@/lib/hala-reconciliation'
import { HALA_STATUS_LABELS, halaReportDays, type BranchFilter, type DetailStatus, type ResultFilter } from '@/lib/hala-report-view'

const moneyFormatter=new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})
const dayFormatter=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',weekday:'long',day:'numeric',month:'long',year:'numeric'})
const money=(n:number)=>moneyFormatter.format(n/100)+' ر.س'
const dayLabel=(date:string)=>dayFormatter.format(new Date(`${date}T12:00:00+03:00`))
const statusColors:Record<DetailStatus,string>={reference:'bg-emerald-100 text-emerald-950',day:'bg-emerald-100 text-emerald-950',missing:'bg-red-100 text-red-900',review:'bg-red-100 text-red-900',unmapped:'bg-slate-200 text-slate-800','site-only':'bg-orange-100 text-orange-950',settlement:'bg-sky-100 text-sky-950'}
const DAYS_PER_PAGE=7

export default function HalaComparisonTable({report,onExport}:{report:HalaReport;onExport:()=>void}) {
  const [branch,setBranch]=useState<BranchFilter>('all')
  const [result,setResult]=useState<ResultFilter>('all')
  const [page,setPage]=useState(1)
  const days=useMemo(()=>halaReportDays(report,branch,result),[report,branch,result])
  const pages=Math.max(1,Math.ceil(days.length/DAYS_PER_PAGE))
  const currentPage=Math.min(page,pages)
  const visibleDays=days.slice((currentPage-1)*DAYS_PER_PAGE,currentPage*DAYS_PER_PAGE)
  return <section aria-label="تفاصيل المطابقة اليومية" className="overflow-hidden rounded-xl border border-[#ced7c8] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e2e7dc] p-5">
      <div><h2 className="text-xl font-bold">تفاصيل المطابقة حسب اليوم</h2><p className="mt-2 text-sm text-[#527367]">ملف هلا يميناً، والموقع يساراً. نفس الفرع والمبلغ واليوم = دفعة صحيحة، مهما اختلفت الساعة.</p><p className="mt-1 text-xs text-[#627367]">{days.length} يوم · {days.reduce((n,d)=>n+d.rows.length,0)} صف ضمن الفلاتر · ألوان الأخضر والأصفر تفصل الأيام، ولا تعبّر عن صحة الدفعة.</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor="branch-filter" className="text-xs text-[#627367]">الفرع<select id="branch-filter" value={branch} onChange={e=>{setBranch(e.target.value as BranchFilter);setPage(1)}} className="mt-1 block max-w-full rounded-lg border border-[#ccd6c5] bg-[#fafbf8] p-2 text-sm text-[#183d32]"><option value="all">جميع الفروع</option>{(Object.keys(HALA_BRANCHES) as HalaBranch[]).map(b=><option key={b} value={b}>{HALA_BRANCHES[b].name}</option>)}<option value="unmapped">فرع غير محدد</option></select></label>
        <label htmlFor="result-filter" className="text-xs text-[#627367]">نتيجة المطابقة<select id="result-filter" value={result} onChange={e=>{setResult(e.target.value as ResultFilter);setPage(1)}} className="mt-1 block rounded-lg border border-[#ccd6c5] bg-[#fafbf8] p-2 text-sm text-[#183d32]"><option value="all">جميع السجلات</option><option value="matched">الدفعات الصحيحة</option><option value="issues">النقص والاختلافات</option>{(Object.keys(HALA_STATUS_LABELS) as DetailStatus[]).map(s=><option key={s} value={s}>{HALA_STATUS_LABELS[s]}</option>)}</select></label>
        <button onClick={onExport} className="inline-flex items-center gap-2 rounded-lg border border-[#ccd6c5] px-3 py-2 text-sm"><Download size={16}/>تحميل جميع النتائج</button>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table dir="rtl" className="w-full min-w-[1000px] text-right text-sm">
        <caption className="sr-only">مطابقة عمليات ملف هلا على اليمين مع سجلات الموقع على اليسار، مجمعة حسب اليوم.</caption>
        <thead>
          <tr className="bg-[#183d32] text-white"><th colSpan={3} scope="colgroup" className="p-4 text-base">المسجل في ملف هلا</th><th scope="col" className="border-x border-white/20 p-4 text-center">نتيجة المطابقة</th><th colSpan={3} scope="colgroup" className="p-4 text-base">المسجل في الموقع</th></tr>
          <tr className="bg-[#edf1e7] text-xs text-[#527367]">{['الفرع','مرجع هلا','المبلغ','الحالة','المبلغ','الفاتورة / الزبونة','الفرع'].map((h,i)=><th scope="col" key={i} className={`p-3 font-semibold ${i===3?'border-x border-[#ccd6c5] text-center':''}`}>{h}</th>)}</tr>
        </thead>
        {visibleDays.map(day=><tbody key={day.date} data-day={day.date} data-day-tone={day.tone} className={day.tone==='green'?'bg-emerald-50/70':'bg-amber-50/80'}>
          <tr><th colSpan={7} scope="rowgroup" className={`border-y p-4 ${day.tone==='green'?'border-emerald-200 bg-emerald-100 text-emerald-950':'border-amber-200 bg-amber-100 text-amber-950'}`}><div className="flex items-center justify-between gap-4"><span className="text-base font-bold">{dayLabel(day.date)}</span><span dir="ltr" className="font-mono text-xs">{day.date}</span></div></th></tr>
          <tr className="font-semibold"><td colSpan={3} className="p-3">إجمالي هلا: {money(day.bankAmount)} <span className="text-xs font-normal">({day.bankCount} دفعة)</span></td><td className="border-x border-[#ced7c8] p-3 text-center text-xs">الفرق: {money(day.bankAmount-day.siteAmount)}</td><td colSpan={3} className="p-3">إجمالي الموقع: {money(day.siteAmount)} <span className="text-xs font-normal">({day.siteCount} سجل)</span></td></tr>
          {day.rows.map(row=><tr key={row.id} className="border-t border-[#dbe3d4] align-top" data-match-status={row.status}>
            {row.bank?<><td className="p-3 text-xs leading-6">{row.bank.branch?HALA_BRANCHES[row.bank.branch].name:<span>نقطة غير مرتبطة<br/>{row.bank.terminal}</span>}</td><td className="p-3"><span dir="ltr" className="inline-block font-mono text-xs">{row.bank.reference}</span><span className="mt-1 block text-xs text-[#627367]">{row.bank.method} · {row.bank.time}</span></td><td className="whitespace-nowrap p-3 font-bold tabular-nums">{money(row.bank.amount)}</td></>:<td colSpan={3} className="p-3 text-center text-xs text-[#627367]">{row.status==='settlement'?'تسوية مستقلة عن عمليات الملف':'لا توجد دفعة مقابلة في ملف هلا'}</td>}
            <td className="max-w-[240px] border-x border-[#ced7c8] p-3 text-center"><span className={`inline-block rounded-md px-2 py-1.5 text-xs font-semibold ${statusColors[row.status]}`}>{HALA_STATUS_LABELS[row.status]}</span>{row.status!=='day'&&row.status!=='reference'&&<p className="mt-2 text-xs leading-6 text-[#627367]">{row.explanation}</p>}</td>
            {row.site?<><td className="whitespace-nowrap p-3 font-bold tabular-nums">{money(row.site.amount)}</td><td className="p-3"><span dir="auto" className="break-all text-xs">{row.site.invoice??'بدون رقم فاتورة'}</span>{row.site.customerName&&<p dir="auto" className="mt-1 break-words text-sm font-semibold text-[#183d32]">الزبونة: {row.site.customerName}</p>}<p dir="ltr" className="mt-1 text-right text-xs text-[#627367]">{row.site.date}</p></td><td className="p-3 text-xs leading-6">{HALA_BRANCHES[row.site.branch].name}</td></>:<td colSpan={3} className="p-3 text-center text-xs text-red-800">لا يوجد سجل موقع مطابق في هذا اليوم</td>}
          </tr>)}
        </tbody>)}
        {!days.length&&<tbody><tr><td colSpan={7} className="p-8 text-center text-[#627367]">لا توجد سجلات ضمن هذه التصفية.</td></tr></tbody>}
      </table>
    </div>
    {days.length>0&&<p className="border-t border-[#e2e7dc] px-5 py-3 text-xs text-[#627367]">إجماليات كل يوم تشمل جميع سجلات الفرع المختار، بما فيها التسويات، حتى عند تصفية نتيجة المطابقة.</p>}
    {pages>1&&<div className="flex items-center justify-center gap-5 border-t border-[#e2e7dc] p-4 text-sm"><button disabled={currentPage===1} className="disabled:opacity-30" onClick={()=>setPage(p=>Math.max(1,p-1))}>الأيام السابقة</button><span>{currentPage} / {pages}</span><button disabled={currentPage===pages} className="disabled:opacity-30" onClick={()=>setPage(p=>p+1)}>الأيام التالية</button></div>}
  </section>
}
