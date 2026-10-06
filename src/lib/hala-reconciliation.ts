/** Read-only reconciliation. All money is in integer halalas. */
export const HALA_BRANCHES = {
  women: { name: 'ياسمين الشام 2 — النسائي', terminal: '1656601901300001' },
  fabrics: { name: 'بروكار الشرقية — الأقمشة', terminal: '1656597201300001' },
  tailoring: { name: 'ياسمين الشام للخياطة — التفصيل', terminal: '1658362601300001' },
} as const
export type HalaBranch = keyof typeof HALA_BRANCHES
export type BankEntry = {
  number: number; date: string; time: string; reference: string; terminal: string
  method: string; amount: number; branch: HalaBranch | null
}
export type SiteEntry = {
  id: string; branch: HalaBranch; date: string; amount: number
  invoice: string | null; customerName: string | null; notes: string; settlement: boolean
}
export type MatchStatus = 'reference' | 'day' | 'missing' | 'review' | 'unmapped'
export type ComparisonRow = BankEntry & { status: MatchStatus; site: SiteEntry | null; explanation: string }
export type ParsedHala = {
  entries: BankEntry[]; duplicates: string[]; warnings: string[]
  coverage: { start: string; end: string; startTime: string; endTime: string } | null
}
export type HalaReport = {
  start: string; end: string; comparedAt: string; bankRows: ComparisonRow[]
  unmatchedSite: SiteEntry[]; settlements: SiteEntry[]; warnings: string[]
  summary: Array<{ branch: HalaBranch; bankCount: number; siteCount: number; bankAmount: number; siteAmount: number; difference: number; missingCount: number; reviewCount: number }>
}

export function halaCustomerName(value: string | null | undefined): string | null {
  const name=value?.trim()
  return name && name!=='-' && name!=='—' ? name : null
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export function dateRange(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('حدد بداية ونهاية فترة صحيحتين.')
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 365) throw new Error('فترة المقارنة يجب ألا تتجاوز سنة.')
  // Riyadh has no daylight-saving transition. End is inclusive, queries use < next midnight.
  const from = new Date(`${start}T00:00:00+03:00`).toISOString()
  const until = new Date(Date.parse(`${end}T00:00:00+03:00`) + 86400000).toISOString()
  return { from, until }
}

export function toHalalas(value: unknown): number {
  const text = String(value ?? '').trim().replace(/,/g, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('مبلغ غير صالح في السجلات.')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount > 100000000000) throw new Error('مبلغ خارج الحدود المسموحة.')
  return amount
}

function printedDate(day: string, time: string, period: string) {
  const [dd, mm, yyyy] = day.split('/')
  const date = `${yyyy}-${mm}-${dd}`
  const [hour, minute] = time.split(':').map(Number)
  if (!validDate(date) || hour < 1 || hour > 12 || minute > 59) throw new Error('تاريخ غير صالح في ملف هلا.')
  return { date, time: `${String((hour % 12) + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

export function parseHalaText(input: string): ParsedHala {
  if (input.length > 2000000) throw new Error('نص الملف أكبر من الحد المسموح.')
  const text = input.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\u00a0/g, ' ')
  if (!/Transactions Export/i.test(text) || !/MPOS to Merchant Topup/.test(text)) {
    throw new Error('الملف ليس تقرير عمليات هلا المدعوم. استخدم تصدير العمليات النصي مثل الملف السابق.')
  }
  // Split on numbered transaction headers rather than newlines: PDF text may wrap cells.
  const header = /(?:^|\s)(\d{1,5})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\s+([AP]M)\s+(\d{20})\b/g
  const hits = [...text.matchAll(header)]
  if (!hits.length || hits.length > 5000) throw new Error('تعذر قراءة عمليات الملف أو تجاوز عددها 5000 عملية.')
  const entries: BankEntry[] = [], duplicates: string[] = [], warnings: string[] = []
  const seen = new Map<string, BankEntry>()
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const chunk = text.slice(hit.index! + hit[0].length, hits[i + 1]?.index ?? text.length).replace(/\s+/g, ' ').trim()
    // Approved withdrawals are not sales and must not be compared with site income.
    if (/^Approved\s+Merchant Cashout\s+-?\d[\d,]*\.\d{2}(?:\s|$)/.test(chunk)) continue
    const sale = /^Approved\s+MPOS to Merchant Topup\s+(\w+)\s+(\d{16})\s+(\d[\d,]*\.\d{2})(?:\s|$)/.exec(chunk)
    if (!sale) {
      if (/^(Declined|Rejected|Failed|Cancelled|Pending)\b/.test(chunk)) { warnings.push(`استُبعدت العملية ${hit[5]} لأن حالتها ليست معتمدة.`); continue }
      throw new Error(`تعذر تفسير العملية رقم ${hit[1]}. أوقفنا المقارنة حتى لا تُسقط عملية من التقرير.`)
    }
    const [, method, terminal, amount] = sale
    const dt = printedDate(hit[2], hit[3], hit[4])
    const branch = (Object.keys(HALA_BRANCHES) as HalaBranch[]).find(b => HALA_BRANCHES[b].terminal === terminal) ?? null
    const entry: BankEntry = { number: Number(hit[1]), ...dt, reference: hit[5], method, terminal, amount: toHalalas(amount), branch }
    const old = seen.get(entry.reference)
    if (old) {
      if (JSON.stringify({ ...old, number: 0 }) !== JSON.stringify({ ...entry, number: 0 })) throw new Error(`مرجع ${entry.reference} مكرر ببيانات مختلفة.`)
      duplicates.push(entry.reference); continue
    }
    seen.set(entry.reference, entry); entries.push(entry)
  }
  if (!entries.length) throw new Error('لا توجد عمليات بيع معتمدة قابلة للمقارنة.')
  if (hits.length === 5000) warnings.push('الملف وصل إلى حد التصدير 5000 عملية؛ قد لا يشمل الفترة كاملة.')
  if (duplicates.length) warnings.push(`استُبعد ${duplicates.length} تكرار لمرجع عملية من الملف.`)
  const bounds = /From Date\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\s+([AP]M)[\s\S]*?To Date\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\s+([AP]M)/i.exec(text)
  const begin = bounds ? printedDate(bounds[1],bounds[2],bounds[3].toUpperCase()) : null
  const finish = bounds ? printedDate(bounds[4],bounds[5],bounds[6].toUpperCase()) : null
  const coverage = begin && finish ? { start:begin.date,end:finish.date,startTime:begin.time,endTime:finish.time } : null
  return { entries, duplicates, warnings, coverage }
}

export function reconcileHala(parsed: ParsedHala, site: SiteEntry[], start: string, end: string): HalaReport {
  dateRange(start, end)
  const bank = parsed.entries.filter(e => e.date >= start && e.date <= end)
  if (!bank.length) throw new Error('لا توجد عمليات بيع في الملف خلال الفترة المحددة.')
  if (parsed.coverage && (start < parsed.coverage.start || end > parsed.coverage.end)) throw new Error('الفترة المطلوبة تقع خارج فترة تصدير ملف هلا. ارفع ملفاً يغطي الفترة.')
  const warnings = [...parsed.warnings]
  if (!parsed.coverage) warnings.push('تعذر تحديد فترة التصدير من الملف؛ تحقق من أنه يغطي فترة المقارنة كاملة.')
  if (parsed.coverage && ((start === parsed.coverage.start && parsed.coverage.startTime !== '00:00') || (end === parsed.coverage.end && parsed.coverage.endTime !== '23:59'))) warnings.push('الملف يبدأ أو ينتهي أثناء أحد يومي المقارنة؛ قد تكون نتائج ذلك اليوم ناقصة. صدّر فترة تغطي اليوم كاملاً للحصول على مقارنة مكتملة.')
  warnings.push('المقارنة تستخدم تواريخ العمليات كما تظهر في ملف هلا، وتواريخ الموقع بتوقيت الرياض. اختلاف التوقيت بين المصدرين يحتاج مراجعة.')
  const current = site.filter(e => e.date >= start && e.date <= end)
  const settlements = current.filter(e => e.settlement)
  const ordinary = current.filter(e => !e.settlement)
  const used = new Set<string>()
  const rows: ComparisonRow[] = bank.map(e => ({ ...e, status: e.branch ? 'missing' : 'unmapped', site: null, explanation: e.branch ? 'لا يوجد مقابل بنفس التاريخ والمبلغ.' : 'نقطة البيع غير مرتبطة بفرع؛ تحتاج تحديد الفرع.' }))
  // A reference is confirmed only when branch, date and amount agree, and both sides are unique.
  const blocked = new Set<string>()
  const bankReferences = new Set(bank.map(b=>b.reference))
  const referencesBySite = new Map<string, Set<string>>()
  const sitesByReference = new Map<string, SiteEntry[]>()
  for (const s of ordinary) {
    const refs = new Set([...s.notes.matchAll(/(?:^|[^0-9])(\d{20})(?=$|[^0-9])/g)].map(m=>m[1]).filter(r=>bankReferences.has(r)))
    referencesBySite.set(s.id,refs)
    for (const ref of refs) sitesByReference.set(ref,[...(sitesByReference.get(ref)??[]),s])
  }
  for (const row of rows) {
    if (!row.branch) continue
    const candidates = sitesByReference.get(row.reference)??[]
    if (!candidates.length) continue
    if (candidates.length !== 1 || used.has(candidates[0].id)) {
      row.status = 'review'; row.explanation = 'مرجع الشبكة مرتبط بأكثر من سجل أو مستخدم في مطابقة أخرى.'
      candidates.forEach(s => blocked.add(s.id)); continue
    }
    const match = candidates[0]
    if (referencesBySite.get(match.id)?.size !== 1) {
      row.status = 'review'; row.explanation = 'السجل يذكر أكثر من مرجع شبكة؛ الربط يحتاج تأكيداً.'; blocked.add(match.id); continue
    }
    if (match.branch !== row.branch || match.date !== row.date || match.amount !== row.amount) {
      row.status = 'review'; row.explanation = 'مرجع العملية موجود لكن الفرع أو التاريخ أو المبلغ مختلف.'; blocked.add(match.id); continue
    }
    row.status = 'reference'; row.site = match; row.explanation = 'مطابقة بالمرجع والتاريخ والمبلغ والفرع.'; used.add(match.id)
  }
  const groups = new Map<string, ComparisonRow[]>()
  const siteGroups = new Map<string, SiteEntry[]>()
  for (const s of ordinary) {
    const key=`${s.branch}|${s.date}|${s.amount}`
    siteGroups.set(key,[...(siteGroups.get(key)??[]),s])
  }
  for (const row of rows.filter(r => r.branch && r.status === 'missing')) {
    const key = `${row.branch}|${row.date}|${row.amount}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const group of groups.values()) {
    const first = group[0]
    const candidates = (siteGroups.get(`${first.branch}|${first.date}|${first.amount}`)??[]).filter(s=>!used.has(s.id)&&!blocked.has(s.id))
    group.forEach((row, i) => {
      if (i < candidates.length) {
        row.status = 'day'; row.site = candidates[i]; used.add(candidates[i].id)
        row.explanation = 'دفعة صحيحة: نفس الفرع والمبلغ واليوم. اختلاف الساعة لا يؤثر على المطابقة.'
      } else if (candidates.length) {
        row.explanation = `يوجد نقص ${group.length - candidates.length} عملية بهذا المبلغ واليوم؛ كل سجل موقع استُخدم مرة واحدة.`
      }
    })
  }
  const unmatchedSite = ordinary.filter(s => !used.has(s.id))
  if (settlements.length) warnings.push('توجد تسويات صافية في الموقع. تدخل في إجمالي الفرع وتظهر منفصلة، ولا تثبت مطابقة عمليات الشبكة الفردية.')
  const summary = (Object.keys(HALA_BRANCHES) as HalaBranch[]).map(branch => {
    const b = rows.filter(r => r.branch === branch), s = current.filter(r => r.branch === branch)
    const bankAmount = b.reduce((n,r) => n+r.amount,0), siteAmount = s.reduce((n,r) => n+r.amount,0)
    return { branch, bankCount: b.length, siteCount: s.length, bankAmount, siteAmount, difference: bankAmount-siteAmount, missingCount: b.filter(r=>r.status==='missing').length, reviewCount: b.filter(r=>r.status==='review').length }
  })
  return { start, end, comparedAt: new Date().toISOString(), bankRows: rows, unmatchedSite, settlements, summary, warnings }
}
