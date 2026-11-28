'use client'

import { useCallback, useEffect, useState } from 'react'
import { Crown, Plus, Trash2, Mail, Phone, Eye, EyeOff, XCircle, CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NumericInput from '@/components/NumericInput'
import { validatePhoneLength, getValidationErrorMessage } from '@/utils/inputValidation'
import { OWNER_ROLE_LABEL } from '@/lib/staff-permissions'

/**
 * حسابات «المدير الأكبر» داخل إدارة العمال: إضافة حساب جديد وحذف القديم.
 * الحذف = إيقاف دائم (لا دخول، يختفي من القائمة) مع بقاء اسمه على السجلات القديمة.
 * كل العمليات عبر /api/admins (المدير الأكبر فقط).
 */

interface OwnerAccount {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  created_at: string
  last_sign_in_at: string | null
  is_self: boolean
}

const EMPTY_FORM = { full_name: '', email: '', password: '', phone: '' }

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'لم يدخل بعد'
  return new Date(value).toLocaleDateString('ar-SA-u-nu-latn', {
    calendar: 'gregory',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function OwnerAccountsPanel() {
  const [accounts, setAccounts] = useState<OwnerAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admins/', { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'تعذّر تحميل الحسابات')
      setAccounts(json.data || [])
    } catch (error) {
      setMessage({ type: 'error', text: (error instanceof Error && error.message) || 'تعذّر تحميل الحسابات' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim() || !form.password || !form.phone) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع الحقول' })
      return
    }
    if (form.password.length < 6) {
      setMessage({ type: 'error', text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
      return
    }
    if (!validatePhoneLength(form.phone)) {
      setMessage({ type: 'error', text: getValidationErrorMessage('phoneLength') })
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admins/', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل إنشاء الحساب')
      setAccounts(prev => [...prev, json.data])
      setForm(EMPTY_FORM)
      setShowForm(false)
      setMessage({
        type: 'success',
        text: `تم إنشاء حساب ${OWNER_ROLE_LABEL} الجديد. ادخل به وتأكد أنه يعمل، ثم احذف الحساب القديم من هنا.`,
      })
    } catch (error) {
      setMessage({ type: 'error', text: (error instanceof Error && error.message) || 'فشل إنشاء الحساب' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (account: OwnerAccount) => {
    const name = account.full_name || account.email
    const ok = confirm(
      `حذف حساب «${name}» (${account.email})؟\n\n` +
      '• لن يستطيع هذا الحساب الدخول مرة أخرى، ولا رجعة في ذلك من الواجهة.\n' +
      '• تبقى كل السجلات القديمة التي أنشأها كما هي وباسمه.\n\n' +
      'تأكد أنك جرّبت الدخول بالحساب الجديد قبل المتابعة.'
    )
    if (!ok) return

    setBusyId(account.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admins/?id=${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل حذف الحساب')
      setAccounts(prev => prev.filter(a => a.id !== account.id))
      setMessage({ type: 'success', text: `تم حذف حساب «${name}»` })
    } catch (error) {
      setMessage({ type: 'error', text: (error instanceof Error && error.message) || 'فشل حذف الحساب' })
    } finally {
      setBusyId(null)
    }
  }

  const onlyOne = accounts.length <= 1

  return (
    <section className="mb-8 rounded-2xl border border-amber-200 bg-white/80 p-4 sm:p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 text-amber-600" />
          <h2 className="text-lg font-bold text-gray-800">حسابات {OWNER_ROLE_LABEL}</h2>
          {!loading && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {accounts.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(v => !v); setMessage(null) }}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-amber-500 to-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:from-amber-600 hover:to-amber-700"
        >
          <Plus className="h-4 w-4" />
          <span>إضافة {OWNER_ROLE_LABEL}</span>
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success'
            ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
          <span>{message.text}</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="mb-5 grid gap-4 rounded-xl border border-amber-100 bg-amber-50/50 p-4 md:grid-cols-2">
          <p className="md:col-span-2 text-xs leading-5 text-amber-900">
            الحساب الجديد يملك كل الصلاحيات مثل حسابك تماماً، ويستطيع إدارة العمال وحذف حسابات {OWNER_ROLE_LABEL} الأخرى.
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">الاسم الكامل *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">البريد الإلكتروني *</label>
            <input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-left focus:border-transparent focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">كلمة المرور * (6 أحرف على الأقل)</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 py-3 pl-12 pr-4 text-left focus:border-transparent focus:ring-2 focus:ring-amber-500"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <div>
            <NumericInput
              value={form.phone}
              onChange={value => setForm(prev => ({ ...prev, phone: value }))}
              type="phone"
              label="رقم الجوال *"
              required
              disabled={submitting}
            />
          </div>
          <div className="md:col-span-2 flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-secondary px-5 py-2.5 text-sm"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>جاري التحميل...</span>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {accounts.map(account => {
            const deleteBlocked = account.is_self || onlyOne
            return (
              <div
                key={account.id}
                className={`rounded-xl border p-4 ${account.is_self ? 'border-amber-300 bg-amber-50/70' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600">
                      <Crown className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-bold text-gray-800">{account.full_name || OWNER_ROLE_LABEL}</h3>
                        {account.is_self && (
                          <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white">أنت</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-amber-700">{OWNER_ROLE_LABEL}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(account)}
                    disabled={deleteBlocked || busyId === account.id}
                    title={account.is_self
                      ? 'لا يمكنك حذف الحساب الذي تستخدمه الآن'
                      : onlyOne ? 'لا يمكن حذف آخر حساب' : 'حذف الحساب'}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
                  >
                    {busyId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span dir="ltr" className="truncate">{account.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span dir="ltr">{account.phone || 'غير محدد'}</span>
                  </div>
                  <p className="text-xs text-gray-500">آخر دخول: {formatDate(account.last_sign_in_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && accounts.some(a => a.is_self) && accounts.length > 1 && (
        <p className="mt-3 text-xs leading-5 text-gray-500">
          لحذف الحساب الذي تستخدمه الآن: سجّل الخروج، ادخل بالحساب الآخر، ثم احذفه من هنا.
        </p>
      )}
    </section>
  )
}
