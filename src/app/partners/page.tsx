'use client'

/**
 * بوابة «شركاء النجاح» — يدخلها المشهور باسم المستخدم وكلمة المرور التي
 * أعطاه إياها المدير، ويتابع استخدامات كوده وأرباحه والمدفوع والمستحق.
 * لا تظهر هنا أي بيانات عن العملاء.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Handshake,
  Loader,
  LogOut,
  Lock,
  User,
  TicketPercent,
  TrendingUp,
  Wallet,
  CheckCircle2,
  ShoppingBag,
  AlertTriangle,
} from 'lucide-react'
import SiteHeader from '@/components/SiteHeader'

type PortalCode = {
  code: string
  discount_percent: number
  commission_percent: number
  valid_from: string
  valid_until: string
  status: 'active' | 'scheduled' | 'expired' | 'inactive'
  uses_count: number
  sales_total: number
  commission_total: number
}

type PortalData = {
  partner: { full_name: string; username: string; social_handle: string | null }
  codes: PortalCode[]
  totals: {
    uses_count: number
    sales_total: number
    commission_total: number
    paid_total: number
    balance_due: number
  }
  sales: {
    code: string
    sale_date: string
    sale_amount: number
    commission_percent: number
    commission_amount: number
  }[]
  payouts: { amount: number; paid_on: string; note: string | null }[]
}

const STATUS_LABELS: Record<PortalCode['status'], { label: string; className: string }> = {
  active: { label: 'فعّال', className: 'bg-emerald-100 text-emerald-700' },
  scheduled: { label: 'لم يبدأ بعد', className: 'bg-blue-100 text-blue-700' },
  expired: { label: 'منتهي', className: 'bg-gray-100 text-gray-600' },
  inactive: { label: 'موقوف', className: 'bg-red-100 text-red-600' },
}

const money = (value: number) =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ر.س`

const formatDate = (value: string) => {
  const [y, m, d] = String(value || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export default function PartnersPortalPage() {
  const [data, setData] = useState<PortalData | null>(null)
  const [checking, setChecking] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/partners/me', { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
        return true
      }
      setData(null)
      return false
    } catch {
      setData(null)
      return false
    }
  }, [])

  useEffect(() => {
    void loadDashboard().finally(() => setChecking(false))
  }, [loadDashboard])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error || 'تعذّر تسجيل الدخول')
        return
      }
      setPassword('')
      if (!(await loadDashboard())) setError('تعذّر تحميل البيانات، حاول مجدداً')
    } catch {
      setError('تعذّر الاتصال، تحقق من الإنترنت')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/partners/logout', { method: 'POST' }).catch(() => undefined)
    setData(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50" dir="rtl">
      <SiteHeader />
      <main className="container mx-auto max-w-4xl px-4 pb-16 pt-28">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg">
            <Handshake className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">شركاء النجاح</h1>
          <p className="mt-1 text-gray-500">تابع كود الخصم الخاص بك وأرباحك مع ياسمين الشام</p>
        </motion.div>

        {checking ? (
          <div className="flex justify-center py-16">
            <Loader className="h-8 w-8 animate-spin text-pink-500" />
          </div>
        ) : !data ? (
          <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleLogin}
            className="mx-auto max-w-sm space-y-4 rounded-2xl border border-pink-100 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">اسم المستخدم</label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  dir="ltr"
                  autoComplete="username"
                  autoCapitalize="none"
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-3 pr-10 text-left focus:ring-2 focus:ring-pink-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">كلمة المرور</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-3 pr-10 text-left focus:ring-2 focus:ring-pink-500"
                  required
                />
              </div>
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 py-2.5 font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting && <Loader className="h-4 w-4 animate-spin" />}
              دخول
            </button>
          </motion.form>
        ) : (
          <PartnerDashboard data={data} onLogout={handleLogout} />
        )}
      </main>
    </div>
  )
}

function PartnerDashboard({ data, onLogout }: { data: PortalData; onLogout: () => void }) {
  const { totals } = data
  const stats = [
    { label: 'مرات استخدام الكود', value: String(totals.uses_count), icon: ShoppingBag, color: 'text-pink-600 bg-pink-50' },
    { label: 'إجمالي المبيعات', value: money(totals.sales_total), icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
    { label: 'أرباحك', value: money(totals.commission_total), icon: Wallet, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'المبلغ المستحق', value: money(totals.balance_due), icon: CheckCircle2, color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">أهلاً بك</p>
          <p className="truncate text-lg font-bold text-gray-900">{data.partner.full_name}</p>
          {data.partner.social_handle && (
            <p className="truncate text-xs text-gray-500" dir="ltr">{data.partner.social_handle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4" />
          خروج
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className={`mb-2 inline-flex rounded-xl p-2 ${s.color}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-center text-xs text-gray-500">
        المدفوع لك حتى الآن: {money(totals.paid_total)}
      </p>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900">
          <TicketPercent className="h-5 w-5 text-pink-600" />
          أكوادي
        </h2>
        {data.codes.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">لا توجد أكواد بعد</p>
        ) : (
          <div className="space-y-3">
            {data.codes.map((c) => (
              <div key={c.code} className="rounded-xl border border-pink-100 bg-pink-50/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-lg font-bold tracking-widest text-pink-700" dir="ltr">
                    {c.code}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_LABELS[c.status].className}`}>
                    {STATUS_LABELS[c.status].label}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 sm:grid-cols-3">
                  <span>خصم للعميلة: <b>{c.discount_percent}%</b></span>
                  <span>نسبة أرباحك: <b>{c.commission_percent}%</b></span>
                  <span>الاستخدامات: <b>{c.uses_count}</b></span>
                  <span className="col-span-2 sm:col-span-3 text-xs text-gray-500">
                    صالح من {formatDate(c.valid_from)} إلى {formatDate(c.valid_until)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">عمليات البيع بكودك</h2>
        {data.sales.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">لم يُستخدم الكود بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="py-2 text-right font-medium">التاريخ</th>
                  <th className="py-2 text-right font-medium">الكود</th>
                  <th className="py-2 text-right font-medium">قيمة البيع</th>
                  <th className="py-2 text-right font-medium">ربحك</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((s, i) => (
                  <tr key={`${s.sale_date}-${i}`} className="border-b border-gray-50">
                    <td className="py-2 whitespace-nowrap">{formatDate(s.sale_date)}</td>
                    <td className="py-2 font-mono" dir="ltr">{s.code}</td>
                    <td className="py-2 whitespace-nowrap">{money(s.sale_amount)}</td>
                    <td className="py-2 whitespace-nowrap font-medium text-emerald-700">
                      {money(s.commission_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-gray-900">الدفعات المستلمة</h2>
        {data.payouts.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">لا توجد دفعات بعد</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {data.payouts.map((p, i) => (
              <li key={`${p.paid_on}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p>{formatDate(p.paid_on)}</p>
                  {p.note && <p className="truncate text-xs text-gray-500">{p.note}</p>}
                </div>
                <span className="shrink-0 font-medium text-gray-900">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </motion.div>
  )
}
