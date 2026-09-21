'use client'

/**
 * أكواد المشاهير — لوحة المدير داخل قسم محاسبة الأقمشة.
 * إضافة المشاهير وأكوادهم (خصم + عمولة + صلاحية)، متابعة الاستخدامات والأرباح،
 * وتسجيل الدفعات. المشهور يتابع نفس الأرقام من صفحة /partners.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Megaphone,
  Plus,
  Pencil,
  Wallet,
  TicketPercent,
  X,
  Loader,
  Phone,
  User,
  KeyRound,
  Copy,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { useAuthStore } from '@/store/authStore'
import { formatFabricCurrency as formatCurrency } from '@/lib/fabric-number-format'
import { formatPhoneNumber } from '@/utils/whatsapp'
import {
  deleteInfluencerPayout,
  getInfluencerPartnerActivity,
  getInfluencerPartners,
  recordInfluencerPayout,
  saveInfluencerCode,
  saveInfluencerPartner,
  type InfluencerCodeRow,
  type InfluencerPartner,
  type InfluencerPayoutRow,
  type InfluencerSaleRow,
} from '@/lib/services/influencer-code-service'

const CODE_STATUS: Record<InfluencerCodeRow['status'], { label: string; className: string }> = {
  active: { label: 'فعّال', className: 'bg-emerald-100 text-emerald-700' },
  scheduled: { label: 'لم يبدأ', className: 'bg-blue-100 text-blue-700' },
  expired: { label: 'منتهي', className: 'bg-gray-100 text-gray-600' },
  inactive: { label: 'موقوف', className: 'bg-red-100 text-red-600' },
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date())

const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const formatDate = (value: string) => {
  const [y, m, d] = String(value || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

const generatePassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(8)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

const inputClass =
  'w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-pink-500'

// ============================================================================

type PartnerForm = {
  id: string | null
  full_name: string
  phone: string
  social_handle: string
  notes: string
  username: string
  password: string
  is_active: boolean
}

type CodeForm = {
  id: string | null
  partner_id: string
  code: string
  discount_percent: string
  commission_percent: string
  valid_from: string
  valid_until: string
  is_active: boolean
  has_uses: boolean
}

type SharedCredentials = { name: string; phone: string | null; username: string; password: string }

function InfluencersContent() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [partners, setPartners] = useState<InfluencerPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [partnerForm, setPartnerForm] = useState<PartnerForm | null>(null)
  const [codeForm, setCodeForm] = useState<CodeForm | null>(null)
  const [payoutFor, setPayoutFor] = useState<InfluencerPartner | null>(null)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutDate, setPayoutDate] = useState(todayIso())
  const [payoutNote, setPayoutNote] = useState('')
  const [credentials, setCredentials] = useState<SharedCredentials | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activity, setActivity] = useState<
    Record<string, { sales: InfluencerSaleRow[]; payouts: InfluencerPayoutRow[] } | 'loading'>
  >({})

  const loadPartners = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setPartners(await getInfluencerPartners())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'تعذّر تحميل المشاهير')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadActivity = useCallback(async (partnerId: string) => {
    setActivity((prev) => ({ ...prev, [partnerId]: 'loading' }))
    try {
      const data = await getInfluencerPartnerActivity(partnerId)
      setActivity((prev) => ({ ...prev, [partnerId]: data }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تحميل العمليات')
      setActivity((prev) => {
        const next = { ...prev }
        delete next[partnerId]
        return next
      })
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void loadPartners()
  }, [isAdmin, loadPartners])

  const refreshAll = async (partnerId?: string) => {
    await loadPartners()
    if (partnerId && expandedId === partnerId) await loadActivity(partnerId)
  }

  const summary = useMemo(
    () =>
      partners.reduce(
        (acc, p) => ({
          uses: acc.uses + p.totals.uses_count,
          sales: acc.sales + p.totals.sales_total,
          commission: acc.commission + p.totals.commission_total,
          due: acc.due + p.totals.balance_due,
        }),
        { uses: 0, sales: 0, commission: 0, due: 0 }
      ),
    [partners]
  )

  // ── المشهور ────────────────────────────────────────────────────
  const openNewPartner = () =>
    setPartnerForm({
      id: null,
      full_name: '',
      phone: '',
      social_handle: '',
      notes: '',
      username: '',
      password: generatePassword(),
      is_active: true,
    })

  const openEditPartner = (p: InfluencerPartner) =>
    setPartnerForm({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone || '',
      social_handle: p.social_handle || '',
      notes: p.notes || '',
      username: p.username,
      password: '',
      is_active: p.is_active,
    })

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partnerForm) return
    setSaving(true)
    try {
      await saveInfluencerPartner({
        id: partnerForm.id,
        full_name: partnerForm.full_name,
        phone: partnerForm.phone,
        social_handle: partnerForm.social_handle,
        notes: partnerForm.notes,
        username: partnerForm.username,
        password: partnerForm.password,
        is_active: partnerForm.is_active,
      })
      toast.success(partnerForm.id ? 'تم حفظ التعديلات' : 'تمت إضافة المشهور')
      // كلمة المرور لا تُخزَّن إلا مشفّرة: هذه آخر فرصة لنسخها وإرسالها
      if (partnerForm.password) {
        setCredentials({
          name: partnerForm.full_name.trim(),
          phone: partnerForm.phone.trim() || null,
          username: partnerForm.username.trim().toLowerCase(),
          password: partnerForm.password,
        })
      }
      setPartnerForm(null)
      await refreshAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // ── الكود ──────────────────────────────────────────────────────
  const openNewCode = (partnerId: string) => {
    const today = todayIso()
    setCodeForm({
      id: null,
      partner_id: partnerId,
      code: '',
      discount_percent: '15',
      commission_percent: '10',
      valid_from: today,
      valid_until: addDaysIso(today, 30),
      is_active: true,
      has_uses: false,
    })
  }

  const openEditCode = (partnerId: string, c: InfluencerCodeRow) =>
    setCodeForm({
      id: c.id,
      partner_id: partnerId,
      code: c.code,
      discount_percent: String(c.discount_percent),
      commission_percent: String(c.commission_percent),
      valid_from: c.valid_from,
      valid_until: c.valid_until,
      is_active: c.is_active,
      has_uses: c.uses_count > 0,
    })

  const handleSaveCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codeForm) return
    setSaving(true)
    try {
      await saveInfluencerCode({
        id: codeForm.id,
        partner_id: codeForm.partner_id,
        code: codeForm.code,
        discount_percent: Number(codeForm.discount_percent),
        commission_percent: Number(codeForm.commission_percent),
        valid_from: codeForm.valid_from,
        valid_until: codeForm.valid_until,
        is_active: codeForm.is_active,
      })
      toast.success(codeForm.id ? 'تم حفظ الكود' : 'تمت إضافة الكود')
      const partnerId = codeForm.partner_id
      setCodeForm(null)
      await refreshAll(partnerId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر حفظ الكود')
    } finally {
      setSaving(false)
    }
  }

  // ── الدفعات ────────────────────────────────────────────────────
  const openPayout = (p: InfluencerPartner) => {
    setPayoutFor(p)
    setPayoutAmount(p.totals.balance_due > 0 ? String(p.totals.balance_due) : '')
    setPayoutDate(todayIso())
    setPayoutNote('')
  }

  const handleSavePayout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payoutFor) return
    const amount = Number(payoutAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغاً أكبر من صفر')
      return
    }
    setSaving(true)
    try {
      await recordInfluencerPayout({
        partner_id: payoutFor.id,
        amount,
        paid_on: payoutDate,
        note: payoutNote,
      })
      toast.success('تم تسجيل الدفعة')
      const partnerId = payoutFor.id
      setPayoutFor(null)
      await refreshAll(partnerId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تسجيل الدفعة')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePayout = async (partnerId: string, payout: InfluencerPayoutRow) => {
    if (!confirm(`حذف دفعة ${formatCurrency(payout.amount)} بتاريخ ${formatDate(payout.paid_on)}؟`)) return
    try {
      await deleteInfluencerPayout(payout.id)
      toast.success('تم حذف الدفعة')
      await refreshAll(partnerId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر حذف الدفعة')
    }
  }

  const toggleExpanded = (partnerId: string) => {
    if (expandedId === partnerId) {
      setExpandedId(null)
      return
    }
    setExpandedId(partnerId)
    if (!activity[partnerId]) void loadActivity(partnerId)
  }

  // ── مشاركة بيانات الدخول ────────────────────────────────────────
  const credentialsMessage = (c: SharedCredentials) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return [
      `أهلاً ${c.name} 🌸`,
      'بيانات دخولك إلى صفحة «شركاء النجاح» في ياسمين الشام لمتابعة كودك وأرباحك:',
      `الرابط: ${origin}/partners`,
      `اسم المستخدم: ${c.username}`,
      `كلمة المرور: ${c.password}`,
    ].join('\n')
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-gray-600" dir="rtl">
        هذا القسم متاح لمدير النظام فقط
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/accounting/fabrics" className="rounded-xl p-2 transition-colors hover:bg-gray-100">
                <ArrowLeft className="h-6 w-6 rotate-180" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 p-3 shadow-lg">
                  <Megaphone className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">أكواد المشاهير</h1>
                  <p className="text-sm text-gray-500">شركاء النجاح وأكواد الخصم وأرباحهم</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={openNewPartner}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 px-4 py-2.5 font-medium text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-5 w-5" />
              إضافة مشهور
            </button>
          </div>
        </motion.div>

        {/* الملخص */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile label="عدد الاستخدامات" value={String(summary.uses)} className="bg-pink-50 text-pink-700" />
          <SummaryTile label="مبيعات بالأكواد" value={formatCurrency(summary.sales)} className="bg-blue-50 text-blue-700" />
          <SummaryTile label="أرباح المشاهير" value={formatCurrency(summary.commission)} className="bg-emerald-50 text-emerald-700" />
          <SummaryTile label="المستحق لهم" value={formatCurrency(summary.due)} className="bg-amber-50 text-amber-700" />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader className="h-8 w-8 animate-spin text-pink-500" />
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-red-700">
            <p>{loadError}</p>
            <button type="button" onClick={() => void loadPartners()} className="mt-3 inline-flex items-center gap-1.5 text-sm underline">
              <RefreshCw className="h-4 w-4" /> إعادة المحاولة
            </button>
          </div>
        ) : partners.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500">
            لا يوجد مشاهير بعد — ابدأ بإضافة أول شريك نجاح
          </div>
        ) : (
          <div className="space-y-4">
            {partners.map((p) => {
              const act = activity[p.id]
              const expanded = expandedId === p.id
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${p.is_active ? 'border-gray-100' : 'border-red-100 opacity-75'}`}
                >
                  {/* رأس البطاقة */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">{p.full_name}</h2>
                        {!p.is_active && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">موقوف</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                        {p.phone && (
                          <span className="flex items-center gap-1" dir="ltr"><Phone className="h-3.5 w-3.5" />{p.phone}</span>
                        )}
                        <span className="flex items-center gap-1" dir="ltr"><User className="h-3.5 w-3.5" />{p.username}</span>
                        {p.social_handle && <span dir="ltr">{p.social_handle}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openPayout(p)} className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                        <Wallet className="h-4 w-4" /> تسجيل دفعة
                      </button>
                      <button type="button" onClick={() => openNewCode(p.id)} className="flex items-center gap-1.5 rounded-xl bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100">
                        <TicketPercent className="h-4 w-4" /> كود جديد
                      </button>
                      <button type="button" onClick={() => openEditPartner(p)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100" title="تعديل بيانات المشهور">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* الإحصائيات */}
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Stat label="الاستخدامات" value={String(p.totals.uses_count)} />
                    <Stat label="المبيعات" value={formatCurrency(p.totals.sales_total)} />
                    <Stat label="الأرباح" value={formatCurrency(p.totals.commission_total)} tone="text-emerald-700" />
                    <Stat label="المدفوع" value={formatCurrency(p.totals.paid_total)} />
                    <Stat
                      label="المستحق"
                      value={formatCurrency(p.totals.balance_due)}
                      tone={p.totals.balance_due > 0 ? 'text-amber-700' : 'text-gray-900'}
                    />
                  </div>

                  {/* الأكواد */}
                  <div className="mt-4 space-y-2">
                    {p.codes.length === 0 ? (
                      <p className="rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-500">لا يوجد كود لهذا المشهور بعد</p>
                    ) : (
                      p.codes.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-pink-100 bg-pink-50/40 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className="font-mono text-base font-bold tracking-widest text-pink-700" dir="ltr">{c.code}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CODE_STATUS[c.status].className}`}>{CODE_STATUS[c.status].label}</span>
                            <span className="text-gray-600">خصم {c.discount_percent}%</span>
                            <span className="text-gray-600">عمولة {c.commission_percent}%</span>
                            <span className="text-xs text-gray-500">{formatDate(c.valid_from)} ← {formatDate(c.valid_until)}</span>
                            <span className="text-xs text-gray-500">{c.uses_count} استخدام</span>
                          </div>
                          <button type="button" onClick={() => openEditCode(p.id, c)} className="rounded-lg p-1.5 text-gray-500 hover:bg-white" title="تعديل الكود">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* التفاصيل */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(p.id)}
                    className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {expanded ? 'إخفاء العمليات والدفعات' : 'عرض العمليات والدفعات'}
                  </button>

                  {expanded && (
                    <div className="mt-2 border-t border-gray-100 pt-3">
                      {act === 'loading' || !act ? (
                        <div className="flex justify-center py-6"><Loader className="h-6 w-6 animate-spin text-pink-500" /></div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h3 className="mb-2 text-sm font-bold text-gray-800">عمليات البيع ({act.sales.length})</h3>
                            {act.sales.length === 0 ? (
                              <p className="text-sm text-gray-500">لا توجد عمليات بعد</p>
                            ) : (
                              <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto text-sm">
                                {act.sales.map((s) => (
                                  <li key={s.income_id} className="py-2">
                                    <div className="flex justify-between gap-2">
                                      <span>{formatDate(s.sale_date)} · <span className="font-mono" dir="ltr">{s.code}</span></span>
                                      <span className="font-medium">{formatCurrency(s.sale_amount)}</span>
                                    </div>
                                    <div className="flex justify-between gap-2 text-xs text-gray-500">
                                      <span>{s.buyer_name || '—'} {s.buyer_phone ? <span dir="ltr">({s.buyer_phone})</span> : null}</span>
                                      <span className="text-emerald-700">ربح {formatCurrency(s.commission_amount)} ({s.commission_percent}%)</span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h3 className="mb-2 text-sm font-bold text-gray-800">الدفعات ({act.payouts.length})</h3>
                            {act.payouts.length === 0 ? (
                              <p className="text-sm text-gray-500">لا توجد دفعات بعد</p>
                            ) : (
                              <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto text-sm">
                                {act.payouts.map((po) => (
                                  <li key={po.id} className="flex items-center justify-between gap-2 py-2">
                                    <div className="min-w-0">
                                      <p>{formatDate(po.paid_on)} — <b>{formatCurrency(po.amount)}</b></p>
                                      {po.note && <p className="truncate text-xs text-gray-500">{po.note}</p>}
                                    </div>
                                    <button type="button" onClick={() => void handleDeletePayout(p.id, po)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="حذف الدفعة">
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* نافذة المشهور */}
      {partnerForm && (
        <Modal title={partnerForm.id ? 'تعديل بيانات المشهور' : 'إضافة مشهور'} onClose={() => setPartnerForm(null)}>
          <form onSubmit={handleSavePartner} className="space-y-3">
            <Field label="اسم المشهور *">
              <input className={inputClass} value={partnerForm.full_name} onChange={(e) => setPartnerForm({ ...partnerForm, full_name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="رقم الهاتف">
                <input className={inputClass} dir="ltr" inputMode="tel" value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} />
              </Field>
              <Field label="حساب التواصل">
                <input className={inputClass} dir="ltr" placeholder="@username" value={partnerForm.social_handle} onChange={(e) => setPartnerForm({ ...partnerForm, social_handle: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="اسم المستخدم *">
                <input
                  className={inputClass}
                  dir="ltr"
                  autoCapitalize="none"
                  value={partnerForm.username}
                  onChange={(e) => setPartnerForm({ ...partnerForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
                  required
                  minLength={3}
                />
              </Field>
              <Field label={partnerForm.id ? 'كلمة مرور جديدة' : 'كلمة المرور *'}>
                <div className="flex gap-1">
                  <input
                    className={inputClass}
                    dir="ltr"
                    value={partnerForm.password}
                    placeholder={partnerForm.id ? 'اتركها فارغة' : ''}
                    onChange={(e) => setPartnerForm({ ...partnerForm, password: e.target.value })}
                    required={!partnerForm.id}
                    minLength={6}
                  />
                  <button type="button" onClick={() => setPartnerForm({ ...partnerForm, password: generatePassword() })} className="shrink-0 rounded-xl border border-gray-200 px-2 text-gray-500 hover:bg-gray-50" title="توليد كلمة مرور">
                    <KeyRound className="h-4 w-4" />
                  </button>
                </div>
              </Field>
            </div>
            <Field label="ملاحظات">
              <textarea className={inputClass} rows={2} value={partnerForm.notes} onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })} />
            </Field>
            {partnerForm.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={partnerForm.is_active} onChange={(e) => setPartnerForm({ ...partnerForm, is_active: e.target.checked })} />
                الحساب فعّال (الإيقاف يوقف أكواده ويمنع دخوله)
              </label>
            )}
            <ModalActions saving={saving} onCancel={() => setPartnerForm(null)} />
          </form>
        </Modal>
      )}

      {/* نافذة الكود */}
      {codeForm && (
        <Modal title={codeForm.id ? 'تعديل الكود' : 'كود خصم جديد'} onClose={() => setCodeForm(null)}>
          <form onSubmit={handleSaveCode} className="space-y-3">
            <Field label="الكود * (أحرف لاتينية وأرقام، مثل NOOR15)">
              <input
                className={`${inputClass} text-center font-mono tracking-widest`}
                dir="ltr"
                value={codeForm.code}
                disabled={codeForm.has_uses}
                onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
                required
                minLength={3}
                maxLength={30}
              />
              {codeForm.has_uses && <p className="mt-1 text-xs text-gray-500">لا يمكن تغيير نص كود استُخدم في مبيعات</p>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="خصم العميلة % *">
                <input className={inputClass} type="number" min="1" max="100" step="0.01" value={codeForm.discount_percent} onChange={(e) => setCodeForm({ ...codeForm, discount_percent: e.target.value })} required />
              </Field>
              <Field label="أرباح المشهور % *">
                <input className={inputClass} type="number" min="0" max="100" step="0.01" value={codeForm.commission_percent} onChange={(e) => setCodeForm({ ...codeForm, commission_percent: e.target.value })} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="يبدأ من *">
                <input className={inputClass} type="date" value={codeForm.valid_from} onChange={(e) => setCodeForm({ ...codeForm, valid_from: e.target.value })} required />
              </Field>
              <Field label="ينتهي في (شامل) *">
                <input className={inputClass} type="date" min={codeForm.valid_from} value={codeForm.valid_until} onChange={(e) => setCodeForm({ ...codeForm, valid_until: e.target.value })} required />
              </Field>
            </div>
            <p className="rounded-xl bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
              الأرباح تُحسب من المبلغ الذي دفعته العميلة بعد الخصم. الكود يُستخدم مرة واحدة لكل رقم هاتف.
              تغيير نسبة الأرباح لاحقاً لا يغيّر العمليات السابقة.
            </p>
            {codeForm.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={codeForm.is_active} onChange={(e) => setCodeForm({ ...codeForm, is_active: e.target.checked })} />
                الكود فعّال
              </label>
            )}
            <ModalActions saving={saving} onCancel={() => setCodeForm(null)} />
          </form>
        </Modal>
      )}

      {/* نافذة الدفعة */}
      {payoutFor && (
        <Modal title={`تسجيل دفعة — ${payoutFor.full_name}`} onClose={() => setPayoutFor(null)}>
          <form onSubmit={handleSavePayout} className="space-y-3">
            <p className="rounded-xl bg-gray-50 p-2.5 text-sm text-gray-700">
              المستحق حالياً: <b>{formatCurrency(payoutFor.totals.balance_due)}</b>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المبلغ (ر.س) *">
                <input className={inputClass} type="number" min="0.01" step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} required />
              </Field>
              <Field label="التاريخ *">
                <input className={inputClass} type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} required />
              </Field>
            </div>
            <Field label="ملاحظة (تظهر للمشهور)">
              <input className={inputClass} value={payoutNote} placeholder="مثال: تحويل بنكي" onChange={(e) => setPayoutNote(e.target.value)} />
            </Field>
            <p className="text-xs text-gray-500">تسجيل الدفعة لا يسحب من صندوق الأقمشة.</p>
            <ModalActions saving={saving} onCancel={() => setPayoutFor(null)} />
          </form>
        </Modal>
      )}

      {/* بيانات الدخول بعد الحفظ */}
      {credentials && (
        <Modal title="بيانات دخول المشهور" onClose={() => setCredentials(null)}>
          <div className="space-y-3">
            <p className="text-sm text-amber-700">
              انسخ كلمة المرور الآن — لا تُحفظ إلا مشفّرة ولا يمكن عرضها لاحقاً (يمكن تعيين كلمة جديدة في أي وقت).
            </p>
            <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-relaxed" dir="rtl">
              {credentialsMessage(credentials)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(credentialsMessage(credentials)).then(
                    () => toast.success('تم النسخ'),
                    () => toast.error('تعذّر النسخ')
                  )
                }}
                className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
              >
                <Copy className="h-4 w-4" /> نسخ
              </button>
              {credentials.phone && (
                <a
                  href={`https://wa.me/${formatPhoneNumber(credentials.phone)}?text=${encodeURIComponent(credentialsMessage(credentials))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm text-white hover:bg-emerald-600"
                >
                  <MessageCircle className="h-4 w-4" /> إرسال واتساب
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============================================================================
// مكونات صغيرة
// ============================================================================

function SummaryTile({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-2.5 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60">
        {saving && <Loader className="h-4 w-4 animate-spin" />}
        حفظ
      </button>
      <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-600 hover:bg-gray-50">
        إلغاء
      </button>
    </div>
  )
}

export default function FabricsInfluencersPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <InfluencersContent />
    </ProtectedWorkerRoute>
  )
}
