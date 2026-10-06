import type { BankEntry, HalaBranch, HalaReport, MatchStatus, SiteEntry } from './hala-reconciliation'

export type DetailStatus = MatchStatus | 'site-only' | 'settlement'
export type BranchFilter = HalaBranch | 'all' | 'unmapped'
export type ResultFilter = DetailStatus | 'all' | 'issues' | 'matched'
export const HALA_STATUS_LABELS: Record<DetailStatus,string> = {
  reference:'صحيحة · مطابق بالمرجع', day:'صحيحة · نفس اليوم والمبلغ',
  missing:'دفعة هلا غير مسجلة', review:'بيانات متعارضة', unmapped:'فرع غير محدد',
  'site-only':'سجل موقع دون مقابل', settlement:'تسوية صافية',
}
export function isHalaMatched(status: DetailStatus) { return status==='reference'||status==='day' }
export type DailyRow = { id: string; date: string; branch: HalaBranch|null; bank: BankEntry|null; site: SiteEntry|null; status: DetailStatus; explanation: string }
export type HalaDay = { date: string; tone: 'green'|'yellow'; rows: DailyRow[]; bankAmount: number; siteAmount: number; bankCount: number; siteCount: number }

/** Keep both sides on their actual day; totals remain complete for the selected branch regardless of status filter. */
export function halaReportDays(report: HalaReport, branch: BranchFilter, result: ResultFilter): HalaDay[] {
  const rows: DailyRow[] = [
    ...report.bankRows.map(r=>({id:`bank:${r.reference}`,date:r.date,branch:r.branch,bank:r,site:r.site,status:r.status,explanation:r.explanation})),
    ...report.unmatchedSite.map(s=>({id:`site:${s.id}`,date:s.date,branch:s.branch,bank:null,site:s,status:'site-only' as const,explanation:'مسجل في الموقع دون دفعة مقابلة بنفس الفرع والمبلغ واليوم في الملف.'})),
    ...report.settlements.map(s=>({id:`settlement:${s.id}`,date:s.date,branch:s.branch,bank:null,site:s,status:'settlement' as const,explanation:'تدخل في إجمالي الموقع؛ تسوية فرق صافي وليست مقابلاً لدفعة هلا منفردة.'})),
  ]
  const days = new Map<string,HalaDay>()
  for (const row of rows) {
    if (branch!=='all' && row.branch!==(branch==='unmapped'?null:branch)) continue
    let day=days.get(row.date)
    if (!day) {
      const offset=Math.round((Date.parse(row.date)-Date.parse(report.start))/86400000)
      day={date:row.date,tone:offset%2===0?'green':'yellow',rows:[],bankAmount:0,siteAmount:0,bankCount:0,siteCount:0}
      days.set(row.date,day)
    }
    if(row.bank){day.bankAmount+=row.bank.amount;day.bankCount++}
    if(row.site){day.siteAmount+=row.site.amount;day.siteCount++}
    const visible=result==='all'||(result==='matched'?isHalaMatched(row.status):result==='issues'?!isHalaMatched(row.status)&&row.status!=='settlement':row.status===result)
    if(visible)day.rows.push(row)
  }
  return [...days.values()].filter(d=>d.rows.length).sort((a,b)=>a.date.localeCompare(b.date))
}
