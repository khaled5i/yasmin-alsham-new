'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import {
  getWomenWorkshopTransactions,
  type WomenWorkshopTransaction,
} from '@/lib/services/women-workshop-service'

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatAmount(amount: number) {
  return `${moneyFormatter.format(Number(amount) || 0)} ر.س`
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function localDateKey(date: string) {
  const value = new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function SyncBadge({ transaction }: { transaction: WomenWorkshopTransaction }) {
  if (transaction.payment_method === 'cash') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
        <Banknote className="h-3.5 w-3.5" />
        محفوظ محلياً
      </span>
    )
  }

  if (transaction.alostaz_sync_status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        مرسلة للمحاسبة
      </span>
    )
  }

  if (transaction.alostaz_sync_status === 'sending' || transaction.alostaz_sync_status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        قيد الإرسال
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
      <AlertTriangle className="h-3.5 w-3.5" />
      {transaction.alostaz_sync_status === 'review_required' ? 'تحتاج مراجعة' : 'تعذّر الإرسال'}
    </span>
  )
}

function TransactionsTable({
  title,
  transactions,
  paymentMethod,
}: {
  title: string
  transactions: WomenWorkshopTransaction[]
  paymentMethod: 'cash' | 'card'
}) {
  const total = transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const isCard = paymentMethod === 'card'

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${
        isCard ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-2xl p-2.5 ${isCard ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
            {isCard ? <CreditCard className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
            <p className="text-xs font-semibold text-slate-500">{transactions.length} عملية مسجلة</p>
          </div>
        </div>
        <div className={`text-xl font-black ${isCard ? 'text-emerald-700' : 'text-amber-700'}`}>
          {formatAmount(total)}
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="px-6 py-14 text-center text-sm font-semibold text-slate-400">
          لا توجد عمليات مطابقة حالياً
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
              <tr>
                <th className="px-5 py-3">التاريخ</th>
                <th className="px-5 py-3">العملية</th>
                <th className="px-5 py-3">المصدر</th>
                <th className="px-5 py-3">المبلغ</th>
                <th className="px-5 py-3">الحالة</th>
                <th className="px-5 py-3">رقم الفاتورة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-600">
                    {formatDate(transaction.occurred_at)}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-900">{transaction.operation_name}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700">
                      {transaction.source === 'order_measurement' ? 'صفحة الطلبات الحديثة' : 'زر فاتورة المشغل'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-black text-slate-900">
                    {formatAmount(transaction.amount)}
                  </td>
                  <td className="px-5 py-4"><SyncBadge transaction={transaction} /></td>
                  <td className="px-5 py-4 font-mono text-xs font-bold text-slate-500">
                    {transaction.alostaz_invoice_code || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function WomenWorkshopAccountingPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()
  const [transactions, setTransactions] = useState<WomenWorkshopTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await getWomenWorkshopTransactions()
    setTransactions(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }

    if (!authLoading && !permissionsLoading && user) {
      const canAccess = user.role === 'admin' || (user.role === 'worker' && workerType === 'accountant')
      if (!canAccess) router.push('/dashboard')
    }
  }, [authLoading, permissionsLoading, router, user, workerType])

  useEffect(() => {
    if (authLoading || permissionsLoading || !user) return
    const canAccess = user.role === 'admin' || (user.role === 'worker' && workerType === 'accountant')
    if (canAccess) void loadTransactions()
  }, [authLoading, loadTransactions, permissionsLoading, user, workerType])

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return transactions.filter((transaction) => {
      const matchesSearch = !normalizedSearch
        || transaction.operation_name.toLowerCase().includes(normalizedSearch)
        || String(transaction.alostaz_invoice_code || '').toLowerCase().includes(normalizedSearch)
      const matchesDate = !dateFilter || localDateKey(transaction.occurred_at) === dateFilter
      return matchesSearch && matchesDate
    })
  }, [dateFilter, searchTerm, transactions])

  const cashTransactions = filteredTransactions.filter((transaction) => transaction.payment_method === 'cash')
  const cardTransactions = filteredTransactions.filter((transaction) => transaction.payment_method === 'card')
  const cashTotal = cashTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const cardTotal = cardTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const grandTotal = cashTotal + cardTotal

  if (authLoading || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-fuchsia-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#fdf2f8,_transparent_34%),linear-gradient(to_bottom,_#f8fafc,_#ffffff)]" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/accounting" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm transition hover:bg-slate-50">
                <ArrowLeft className="h-5 w-5 rotate-180" />
              </Link>
              <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 p-3 text-white shadow-lg shadow-pink-200">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">المشغل النسائي</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">تقرير موحد لفواتير المشغل وعمليات أخذ المقاس</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadTransactions()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 shadow-sm transition hover:border-fuchsia-200 hover:text-fuchsia-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث التقرير
            </button>
          </div>
        </motion.header>

        <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'المجموع الكامل', value: grandTotal, icon: WalletCards, classes: 'from-slate-900 to-slate-700 text-white' },
            { label: 'إجمالي الشبكة', value: cardTotal, icon: CreditCard, classes: 'from-emerald-600 to-teal-600 text-white' },
            { label: 'إجمالي الكاش', value: cashTotal, icon: Banknote, classes: 'from-amber-500 to-orange-500 text-white' },
            { label: 'عدد العمليات', value: filteredTransactions.length, icon: ReceiptText, classes: 'from-rose-500 to-fuchsia-600 text-white', isCount: true },
          ].map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className={`rounded-3xl bg-gradient-to-br p-5 shadow-lg ${card.classes}`}
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-bold opacity-80">{card.label}</span>
                <card.icon className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-2xl font-black">
                {card.isCount ? `${card.value} عملية` : formatAmount(Number(card.value))}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mb-7 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
          <label className="relative block">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ابحث باسم العملية أو رقم الفاتورة"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-4 pr-12 font-medium text-slate-800 outline-none transition focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
            />
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 font-bold text-slate-700 outline-none transition focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
          />
          <button
            type="button"
            onClick={() => {
              setSearchTerm('')
              setDateFilter('')
            }}
            className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600 transition hover:bg-slate-50"
          >
            مسح الفلاتر
          </button>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
            <div className="text-center">
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-fuchsia-600" />
              <p className="mt-3 text-sm font-bold text-slate-500">جاري تحميل عمليات المشغل...</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <TransactionsTable title="عمليات الشبكة" transactions={cardTransactions} paymentMethod="card" />
            <TransactionsTable title="عمليات الكاش" transactions={cashTransactions} paymentMethod="cash" />
          </div>
        )}
      </div>
    </div>
  )
}

