'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, ChevronDown, Copy, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import {
  WHATSAPP_LINK_SOURCES,
  WHATSAPP_PLACEMENT_LABELS,
  WHATSAPP_SHOPS,
  WHATSAPP_SHOP_KEYS,
  WHATSAPP_SITE_SOURCE,
  WHATSAPP_SOURCE_LABELS,
  WHATSAPP_VISIT_SOURCE_LABELS,
  type WhatsAppShop,
} from '@/lib/whatsapp-tracking'

/**
 * ضغطات واتساب لكل محل ومصدر — للمدير فقط.
 * الأرقام من جدول whatsapp_clicks (روابط /wa/ الوسيطة + أزرار الموقع والمتجر)، عبر /api/whatsapp-stats/.
 */

interface StatRow {
  level: 'shop' | 'source' | 'placement' | 'visit_source'
  shop: WhatsAppShop
  source: string | null
  placement: string | null
  visit_source: string | null
  clicks: number
  people: number
}

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom'

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: '7d', label: 'آخر 7 أيام' },
  { id: '30d', label: 'آخر 30 يوماً' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'custom', label: 'فترة مخصصة' },
]

const SITE_ORIGIN = 'https://yasmin-alsham.fashion'
const SHOP_LINK_SOURCES = (Object.keys(WHATSAPP_LINK_SOURCES) as (keyof typeof WHATSAPP_LINK_SOURCES)[]).filter(s => s !== 'other')

const number = (value: number) => new Intl.NumberFormat('ar-SA').format(value)

function riyadhToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const p = (type: string) => parts.find(x => x.type === type)?.value ?? ''
  return `${p('year')}-${p('month')}-${p('day')}`
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function presetRange(preset: Preset): { from: string; to: string } {
  const today = riyadhToday()
  if (preset === '7d') return { from: shiftDate(today, -6), to: today }
  if (preset === '30d') return { from: shiftDate(today, -29), to: today }
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  return { from: today, to: today }
}

const sourceLabel = (source: string | null) => WHATSAPP_SOURCE_LABELS[source ?? ''] ?? source ?? '—'
const placementLabel = (placement: string | null) => WHATSAPP_PLACEMENT_LABELS[placement ?? ''] ?? placement ?? 'غير محدد'
const visitLabel = (visit: string | null) => WHATSAPP_VISIT_SOURCE_LABELS[visit ?? ''] ?? visit ?? 'غير معروف'

function BreakdownList({ title, rows, label }: { title: string; rows: StatRow[]; label: (row: StatRow) => string }) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-[#62786b]">{title}</p>
      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f5ef] px-3 py-2 text-sm">
            <span>{label(row)}</span>
            <span className="shrink-0 tabular-nums text-[#183d32]"><b>{number(row.clicks)}</b> ضغطة · {number(row.people)} شخص</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ShopCard({ shop, rows }: { shop: WhatsAppShop; rows: StatRow[] }) {
  const [openSource, setOpenSource] = useState<string | null>(null)
  const total = rows.find(r => r.level === 'shop')
  const sources = rows.filter(r => r.level === 'source').sort((a, b) => b.clicks - a.clicks)
  const byClicks = (a: StatRow, b: StatRow) => b.clicks - a.clicks

  return (
    <section className="overflow-hidden rounded-2xl border border-[#ced7c8] bg-white" aria-label={WHATSAPP_SHOPS[shop].label}>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e2e7dc] bg-[#edf1e7] p-5">
        <div>
          <h2 className="text-xl font-bold">{WHATSAPP_SHOPS[shop].label}</h2>
          <p className="mt-1 text-xs text-[#627367]" dir="ltr">+{WHATSAPP_SHOPS[shop].number}</p>
        </div>
        <div className="flex gap-6 text-center">
          <div><p className="text-3xl font-bold tabular-nums">{number(total?.clicks ?? 0)}</p><p className="text-xs text-[#627367]">ضغطة</p></div>
          <div><p className="text-3xl font-bold tabular-nums">{number(total?.people ?? 0)}</p><p className="text-xs text-[#627367]">شخص تقريباً</p></div>
        </div>
      </header>

      {sources.length === 0 ? (
        <p className="p-6 text-sm text-[#627367]">لا ضغطات في هذه الفترة.</p>
      ) : (
        <ul className="divide-y divide-[#e2e7dc]">
          {sources.map(row => {
            const details = rows.filter(r => r.source === row.source && (r.level === 'placement' || r.level === 'visit_source'))
            const placements = details.filter(r => r.level === 'placement').sort(byClicks)
            const visits = details.filter(r => r.level === 'visit_source' && r.visit_source).sort(byClicks)
            const expandable = row.source === WHATSAPP_SITE_SOURCE && details.length > 0
            const open = openSource === row.source
            const share = total?.clicks ? Math.round((row.clicks / total.clicks) * 100) : 0
            return (
              <li key={row.source ?? ''}>
                <button
                  type="button"
                  disabled={!expandable}
                  onClick={() => setOpenSource(open ? null : row.source)}
                  aria-expanded={expandable ? open : undefined}
                  className="flex w-full items-center gap-4 px-5 py-4 text-right enabled:hover:bg-[#fafbf8]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{sourceLabel(row.source)}</span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#e7ece2]">
                      <span className="block h-full rounded-full bg-[#2f7a55]" style={{ width: `${share}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-left tabular-nums">
                    <span className="block text-lg font-bold">{number(row.clicks)}</span>
                    <span className="block text-xs text-[#627367]">{number(row.people)} شخص · {share}%</span>
                  </span>
                  {expandable && <ChevronDown size={18} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
                </button>
                {expandable && open && (
                  <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
                    <BreakdownList title="حسب الزر" rows={placements} label={r => placementLabel(r.placement)} />
                    <BreakdownList title="من أين جاءت الزيارة إلى الموقع" rows={visits} label={r => visitLabel(r.visit_source)} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#ccd6c5] px-3 py-1.5 text-xs font-semibold hover:bg-[#edf1e7]"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'نُسخ' : 'نسخ'}
    </button>
  )
}

export default function WhatsAppStatsPage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const [preset, setPreset] = useState<Preset>('30d')
  const [range, setRange] = useState(() => presetRange('30d'))
  const [rows, setRows] = useState<StatRow[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    else if (!isLoading && user?.role !== 'admin') router.replace('/dashboard')
  }, [user, isLoading, router])

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('انتهت الجلسة؛ سجل الدخول من جديد.')
      const response = await fetch(`/api/whatsapp-stats/?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'تعذر تحميل الإحصائيات.')
      setRows(payload.rows as StatRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الإحصائيات.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin' && range.from && range.to && range.from <= range.to) void load(range.from, range.to)
  }, [user?.role, range, load])

  const byShop = useMemo(() => {
    const map: Record<WhatsAppShop, StatRow[]> = { fabrics: [], tailoring: [] }
    for (const row of rows ?? []) map[row.shop]?.push({ ...row, clicks: Number(row.clicks), people: Number(row.people) })
    return map
  }, [rows])

  const choosePreset = (id: Preset) => {
    setPreset(id)
    if (id !== 'custom') setRange(presetRange(id))
  }

  if (isLoading || user?.role !== 'admin') return <div className="p-12 text-center text-gray-500">جاري التحقق من الصلاحية…</div>

  return (
    <main dir="rtl" className="min-h-screen bg-[#f4f5ef] text-[#183d32]">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <Link href="/dashboard" className="mb-8 inline-flex items-center gap-2 text-sm text-[#527367] hover:text-[#183d32]"><ArrowRight size={18} />لوحة التحكم</Link>

        <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-[#cbd4c7] pb-7">
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-[#62786b]">التسويق / واتساب</p>
            <h1 className="flex items-center gap-3 text-3xl font-bold md:text-4xl"><MessageCircle size={32} aria-hidden="true" />ضغطات واتساب</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#627367]">كم شخص وصل إلى واتساب كل محل، ومن أي منصة أو زر. لا تُحسب أجهزة الموظفين ولا روبوتات المعاينة.</p>
          </div>
          <button type="button" onClick={() => void load(range.from, range.to)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[#cbd4c7] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[#edf1e7] disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}تحديث
          </button>
        </header>

        <section className="mb-7 rounded-2xl border border-[#ced7c8] bg-white p-5" aria-label="الفترة">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.id} type="button" onClick={() => choosePreset(p.id)} aria-pressed={preset === p.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${preset === p.id ? 'bg-[#183d32] text-white' : 'border border-[#ccd6c5] bg-[#fafbf8] hover:bg-[#edf1e7]'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">من تاريخ<input type="date" value={range.from} max={range.to} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="mt-2 block w-full rounded-lg border border-[#ccd6c5] bg-[#fafbf8] p-3 text-base" /></label>
              <label className="text-sm font-semibold">إلى تاريخ<input type="date" value={range.to} min={range.from} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="mt-2 block w-full rounded-lg border border-[#ccd6c5] bg-[#fafbf8] p-3 text-base" /></label>
            </div>
          )}
          <p className="mt-3 text-xs text-[#627367]">من {range.from} إلى {range.to} · بتوقيت الرياض</p>
        </section>

        {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

        {rows === null && loading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-[#527367]" size={28} /></div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {WHATSAPP_SHOP_KEYS.map(shop => <ShopCard key={shop} shop={shop} rows={byShop[shop]} />)}
          </div>
        )}

        <p className="mt-4 text-xs leading-6 text-[#627367]">
          «شخص تقريباً»: نفس الجهاز والشبكة يُعدّ شخصاً واحداً داخل الشهر؛ الجوال قد يغيّر شبكته فيُعدّ مرتين، ويُعدّ الشخص من جديد في كل شهر.
          بالضغط على «أزرار الموقع والمتجر» يظهر أي زر ضُغط ومن أين جاءت الزيارة (مثل إعلانات Google).
        </p>

        <section className="mt-10 rounded-2xl border border-[#ced7c8] bg-white p-5" aria-label="الروابط">
          <h2 className="mb-1 text-xl font-bold">الروابط الجاهزة</h2>
          <p className="mb-5 text-sm leading-7 text-[#627367]">يوضع كل رابط في مكانه بدل رابط wa.me العادي. الرابط يفتح واتساب المحل مباشرة ويُعدّ الضغطة.</p>
          <div className="grid gap-6 lg:grid-cols-2">
            {WHATSAPP_SHOP_KEYS.map(shop => (
              <div key={shop}>
                <p className="mb-2 font-semibold">{WHATSAPP_SHOPS[shop].label}</p>
                <ul className="space-y-2">
                  {SHOP_LINK_SOURCES.map(source => {
                    const url = `${SITE_ORIGIN}/wa/${shop}/${source}/`
                    return (
                      <li key={source} className="flex items-center gap-3 rounded-lg bg-[#f4f5ef] px-3 py-2">
                        <span className="w-24 shrink-0 text-sm">{WHATSAPP_LINK_SOURCES[source]}</span>
                        <code dir="ltr" className="min-w-0 flex-1 truncate text-left text-xs">{url}</code>
                        <CopyLink url={url} />
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
