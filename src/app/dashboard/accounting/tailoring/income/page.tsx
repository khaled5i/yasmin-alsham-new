'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  PackageCheck,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import ReportPeriodPicker, {
  computePresetRange,
  type DateFilter,
  type DateRange,
} from '@/components/ReportPeriodPicker'
import {
  getDeliveredOrdersIncome,
  getIncome,
  getUnrecordedDeliveredOrders,
  type UnrecordedDeliveredOrder,
} from '@/lib/services/simple-accounting-service'
import type { Income, IncomeEntryKind, IncomePaymentMethod, PaymentMethod } from '@/types/simple-accounting'

// ============================================================================
// مظهر كل نوع حركة — نفس لغة صندوق النقد حتى تُقرأ الصفحتان بنفس الطريقة
// ============================================================================

const entryAppearance: Record<
  IncomeEntryKind,
  { icon: typeof Banknote; iconClass: string; containerClass: string; badge: string }
> = {
  order_deposit: {
    icon: ShoppingBag,
    iconClass: 'text-emerald-700',
    containerClass: 'bg-emerald-50 ring-emerald-100',
    badge: 'طلب حديث',
  },
  order_delivery: {
    icon: PackageCheck,
    iconClass: 'text-teal-700',
    containerClass: 'bg-teal-50 ring-teal-100',
    badge: 'عند التسليم',
  },
  manual_income: {
    icon: CircleDollarSign,
    iconClass: 'text-green-700',
    containerClass: 'bg-green-50 ring-green-100',
    badge: 'وارد يدوي',
  },
}

// 'mixed' خاص بمبيعات الأقمشة ولا يظهر في التفصيل، لكنه مذكور ليبقى النوع مكتملاً
const paymentAppearance: Record<IncomePaymentMethod, { label: string; className: string }> = {
  cash: { label: 'كاش', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  network: { label: 'شبكة', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  mixed: { label: 'كاش + شبكة', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
}

// ============================================================================
// حالة فاتورة الأستاذ لحركات الشبكة
// ============================================================================

interface InvoiceState {
  label: string
  className: string
  icon: typeof FileText
}

/**
 * الحالة المعروضة لحركة شبكة واحدة.
 * وجود invoice_id هو الدليل القاطع على الإرسال؛ أما sync_status فيصف آخر محاولة.
 * الكاش لا يُرسل للمحاسبة أصلاً، لذلك لا حالة له.
 */
function getInvoiceState(entry: Income): InvoiceState | null {
  if (entry.payment_method !== 'network') return null
  if (entry.entry_kind !== 'order_deposit' && entry.entry_kind !== 'order_delivery') return null

  const sent = Boolean(entry.alostaz_invoice_id) || entry.alostaz_sync_status === 'sent'
  if (sent) {
    return {
      label: 'أُرسلت للمحاسبة',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      icon: CheckCircle2,
    }
  }

  switch (entry.alostaz_sync_status) {
    case 'sending':
      return {
        label: 'قيد الإرسال',
        className: 'bg-blue-50 text-blue-700 ring-blue-200',
        icon: Clock,
      }
    case 'failed':
      return {
        label: 'فشل الإرسال',
        className: 'bg-rose-50 text-rose-700 ring-rose-200',
        icon: XCircle,
      }
    case 'review_required':
      return {
        label: 'بحاجة مراجعة',
        className: 'bg-amber-50 text-amber-700 ring-amber-200',
        icon: AlertTriangle,
      }
    default:
      // طلب قديم لا يمرّ بالفوترة المرحلية — يُرسل يدوياً وقد لا يُرسل إطلاقاً
      if (Number(entry.alostaz_billing_version) < 2) {
        return {
          label: 'لم تُرسل — طلب قديم',
          className: 'bg-gray-100 text-gray-600 ring-gray-200',
          icon: AlertTriangle,
        }
      }
      return {
        label: 'لم تُرسل للمحاسبة',
        className: 'bg-amber-50 text-amber-700 ring-amber-200',
        icon: AlertTriangle,
      }
  }
}

function isSentToAccounting(entry: Income): boolean {
  return Boolean(entry.alostaz_invoice_id) || entry.alostaz_sync_status === 'sent'
}

type MethodFilter = 'all' | PaymentMethod

const METHOD_FILTERS: { key: MethodFilter; label: string }[] = [
  { key: 'all', label: 'كل الطرق' },
  { key: 'cash', label: 'كاش' },
  { key: 'network', label: 'شبكة' },
]

type KindFilter = 'all' | IncomeEntryKind

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'كل العمليات' },
  { key: 'order_deposit', label: 'عربون الطلبات' },
  { key: 'order_delivery', label: 'دفعات التسليم' },
  { key: 'manual_income', label: 'واردات يدوية' },
]

// ============================================================================
// Helpers
// ============================================================================

const currencyFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  style: 'currency',
  currency: 'SAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

/** لحظة الحركة: occurred_at للحركات المشتقّة، وإلا تاريخ السجل اليدوي */
function getEntryMoment(entry: Income): Date {
  const raw = entry.occurred_at || entry.created_at || entry.date
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed
  return new Date(`${entry.date}T00:00:00`)
}

function formatEntryMoment(entry: Income): string {
  const date = getEntryMoment(entry)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

// ============================================================================
// صف وارد واحد — نفس بطاقة العملية بلا أي تغيير في محتواها
// ============================================================================

function IncomeEntryRow({ item, index }: { item: Income; index: number }) {
  const appearance = entryAppearance[item.entry_kind || 'manual_income']
  const Icon = appearance?.icon || Banknote
  const method = paymentAppearance[item.payment_method || 'cash']
  const invoice = getInvoiceState(item)

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.25) }}
      className="grid gap-3 px-5 py-4 transition hover:bg-gray-50/70 sm:grid-cols-[auto_1fr_auto] sm:items-center"
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${
          appearance?.containerClass || 'bg-gray-100 ring-gray-200'
        }`}
      >
        <Icon className={`h-5 w-5 ${appearance?.iconClass || 'text-gray-600'}`} />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-black text-gray-900">{item.description}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">
            {appearance?.badge || 'حركة'}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${method.className}`}
          >
            {method.label}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-gray-600">{item.customer_name}</p>

        {/* رقم فاتورة الأستاذ وحالتها — لحركات الشبكة فقط */}
        {invoice && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {item.alostaz_invoice_code ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-700"
                dir="ltr"
              >
                <FileText className="h-3 w-3 text-gray-400" />
                {item.alostaz_invoice_code}
              </span>
            ) : null}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${invoice.className}`}
            >
              <invoice.icon className="h-3 w-3" />
              {invoice.label}
            </span>
            {item.alostaz_invoice_code && item.alostaz_invoice_scope === 'full' ? (
              <span className="text-[10px] font-bold text-gray-400">
                فاتورة تغطي كامل الطلب
              </span>
            ) : null}
          </div>
        )}

        <p className="mt-1.5 text-xs text-gray-400">{formatEntryMoment(item)}</p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:block sm:text-left">
        <span className="text-xs font-bold text-gray-400 sm:hidden">وارد</span>
        <p className="text-lg font-black text-emerald-700" dir="ltr">
          + {formatCurrency(item.amount)}
        </p>
      </div>
    </motion.article>
  )
}

// ============================================================================
// قسم مستقل لكل طريقة دفع — الشبكة والكاش كلٌّ في بطاقته
// ============================================================================

function IncomeMethodSection({
  title,
  method,
  entries,
  delay,
}: {
  title: string
  method: PaymentMethod
  entries: Income[]
  delay: number
}) {
  const isNetwork = method === 'network'
  const total = entries.reduce((sum, item) => sum + item.amount, 0)

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
    >
      <div
        className={`flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${
          isNetwork ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`rounded-2xl p-2.5 text-white ${isNetwork ? 'bg-emerald-600' : 'bg-amber-500'}`}>
            {isNetwork ? <CreditCard className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">{title}</h2>
            <p className="text-xs font-semibold text-gray-500">{entries.length} عملية مسجلة</p>
          </div>
        </div>
        <div
          className={`text-xl font-black ${isNetwork ? 'text-emerald-700' : 'text-amber-700'}`}
          dir="ltr"
        >
          {formatCurrency(total)}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm font-semibold text-gray-400">
          لا توجد عمليات مطابقة في هذه الفترة
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {entries.map((item, index) => (
            <IncomeEntryRow key={item.id} item={item} index={index} />
          ))}
        </div>
      )}
    </motion.section>
  )
}

function IncomePageContent() {
  const [entries, setEntries] = useState<Income[]>([])
  const [unrecorded, setUnrecorded] = useState<UnrecordedDeliveredOrder[]>([])
  const [showUnrecorded, setShowUnrecorded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [unsentOnly, setUnsentOnly] = useState(false)

  // نفس فلتر الفترة المستخدم في صفحة التقارير — يبدأ على اليوم الحالي
  const [selectedPeriod, setSelectedPeriod] = useState<DateRange>('today')
  const [periodRange, setPeriodRange] = useState<DateFilter>(() => computePresetRange('today'))

  const loadIncome = useCallback(async () => {
    try {
      const [orderEntries, manualEntries, unrecordedOrders] = await Promise.all([
        getDeliveredOrdersIncome('tailoring'),
        getIncome('tailoring'),
        getUnrecordedDeliveredOrders('tailoring'),
      ])

      // واردات جدول income المرتبطة بطلب تُحتسب أصلاً ضمن حركات الطلب،
      // لذلك نستبعدها هنا تفادياً للازدواج (نفس قاعدة سجل الصندوق).
      const manual: Income[] = manualEntries
        .filter(item => !item.order_id)
        .map(item => ({
          ...item,
          entry_kind: 'manual_income' as IncomeEntryKind,
          occurred_at: item.created_at || item.date,
        }))

      setEntries([...orderEntries, ...manual])
      setUnrecorded(unrecordedOrders)
    } catch (error) {
      console.error('Error loading income:', error)
    }
  }, [])

  useEffect(() => {
    loadIncome().finally(() => setLoading(false))
  }, [loadIncome])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadIncome()
    setRefreshing(false)
  }

  const handleApplyPeriod = (period: DateRange, range: DateFilter) => {
    setSelectedPeriod(period)
    setPeriodRange(range)
  }

  const filteredIncome = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const from = periodRange.startDate.getTime()
    const to = periodRange.endDate.getTime()

    return entries
      .filter(item => {
        const moment = getEntryMoment(item).getTime()
        if (Number.isNaN(moment) || moment < from || moment > to) return false

        if (methodFilter !== 'all' && item.payment_method !== methodFilter) return false
        if (kindFilter !== 'all' && item.entry_kind !== kindFilter) return false

        // فواتير الشبكة التي لم تصل تطبيق المحاسبة بعد
        if (unsentOnly && (item.payment_method !== 'network' || isSentToAccounting(item))) {
          return false
        }

        if (!term) return true
        return (
          item.customer_name?.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term) ||
          String(item.order_number || '').toLowerCase().includes(term)
        )
      })
      .sort((a, b) => getEntryMoment(b).getTime() - getEntryMoment(a).getTime())
  }, [entries, searchTerm, methodFilter, kindFilter, unsentOnly, periodRange])

  // طلبات مسلَّمة برصيد غير مُسجَّل، ضمن الفترة المعروضة نفسها
  const unrecordedInPeriod = useMemo(() => {
    const from = periodRange.startDate.getTime()
    const to = periodRange.endDate.getTime()
    return unrecorded.filter(order => {
      const moment = new Date(`${order.date}T00:00:00`).getTime()
      return !Number.isNaN(moment) && moment >= from && moment <= to
    })
  }, [unrecorded, periodRange])

  const unrecordedTotal = useMemo(
    () => unrecordedInPeriod.reduce((sum, order) => sum + order.outstanding, 0),
    [unrecordedInPeriod]
  )

  // فصل الحركات حسب طريقة الدفع — كل طريقة في بطاقتها الخاصة
  const networkEntries = useMemo(
    () => filteredIncome.filter(item => item.payment_method === 'network'),
    [filteredIncome]
  )

  const cashEntries = useMemo(
    () => filteredIncome.filter(item => item.payment_method !== 'network'),
    [filteredIncome]
  )

  const totals = useMemo(() => {
    let total = 0
    let cash = 0
    let network = 0
    for (const item of filteredIncome) {
      total += item.amount
      if (item.payment_method === 'network') network += item.amount
      else cash += item.amount
    }
    return { total, cash, network }
  }, [filteredIncome])

  // حركات الشبكة غير المرسلة للمحاسبة ضمن الفترة المعروضة
  const unsentNetwork = useMemo(() => {
    const pending = entries.filter(item => {
      const moment = getEntryMoment(item).getTime()
      if (Number.isNaN(moment)) return false
      if (moment < periodRange.startDate.getTime() || moment > periodRange.endDate.getTime()) return false
      return item.payment_method === 'network' && !isSentToAccounting(item)
    })
    return {
      count: pending.length,
      amount: pending.reduce((sum, item) => sum + item.amount, 0),
    }
  }, [entries, periodRange])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="mb-6 flex items-center gap-4">
            <Link
              href="/dashboard/accounting/tailoring"
              className="rounded-xl p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-6 w-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 shadow-lg">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">الواردات</h1>
                <p className="text-gray-500">كل دفعة محصّلة من الطلبات مفصولة بطريقة الدفع</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ملخص */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-emerald-100">
              <Wallet className="h-4 w-4" />
              <p className="text-sm">إجمالي الواردات</p>
            </div>
            <p className="text-2xl font-bold" dir="ltr">{formatCurrency(totals.total)}</p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-amber-600">
              <Banknote className="h-4 w-4" />
              <p className="text-sm font-semibold">المحصّل كاش</p>
            </div>
            <p className="text-2xl font-bold text-amber-700" dir="ltr">{formatCurrency(totals.cash)}</p>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sky-600">
              <CreditCard className="h-4 w-4" />
              <p className="text-sm font-semibold">المحصّل شبكة</p>
            </div>
            <p className="text-2xl font-bold text-sky-700" dir="ltr">{formatCurrency(totals.network)}</p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-gray-500">
              <Package className="h-4 w-4" />
              <p className="text-sm font-semibold">عدد العمليات</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">{filteredIncome.length}</p>
          </div>
        </motion.div>

        {/* فلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="بحث باسم العميلة أو رقم الطلب..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-200 py-3 pr-10 pl-4 focus:border-transparent focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <ReportPeriodPicker
                period={selectedPeriod}
                range={periodRange}
                onApply={handleApplyPeriod}
                className="py-3"
              />
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="تحديث الواردات"
                className="rounded-xl border-2 border-gray-200 bg-white p-3 text-gray-500 transition hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-400">نوع العملية</span>
              {KIND_FILTERS.map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setKindFilter(filter.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    kindFilter === filter.key
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-400">طريقة الدفع</span>
              {METHOD_FILTERS.map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setMethodFilter(filter.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    methodFilter === filter.key
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setUnsentOnly(prev => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                unsentOnly
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              شبكة لم تُرسل للمحاسبة
              {unsentNetwork.count > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-black ${
                    unsentOnly ? 'bg-white/25' : 'bg-amber-200 text-amber-800'
                  }`}
                >
                  {unsentNetwork.count}
                </span>
              )}
            </button>
          </div>
        </motion.div>

        {/* تنبيه: طلبات مسلَّمة برصيد لم يُسجَّل تحصيله */}
        {unrecordedInPeriod.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50"
          >
            <button
              type="button"
              onClick={() => setShowUnrecorded(prev => !prev)}
              className="flex w-full items-center gap-3 px-5 py-4 text-right transition hover:bg-amber-100/60"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-900">
                  {unrecordedInPeriod.length} طلب مسلَّم برصيد لم يُسجَّل تحصيله
                </p>
                <p className="mt-0.5 text-xs leading-5 text-amber-700">
                  مجموعها <span dir="ltr">{formatCurrency(unrecordedTotal)}</span> — غير محتسبة ضمن
                  الواردات لأن النظام لا يملك سجل دفع لها. راجع الطلب وسجّل الدفعة إن كانت قد قُبضت.
                </p>
              </div>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-amber-600 transition-transform ${
                  showUnrecorded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showUnrecorded && (
              <div className="max-h-72 overflow-y-auto border-t border-amber-200 bg-white/60 divide-y divide-amber-100">
                {unrecordedInPeriod.map(order => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800">طلب {order.order_number}</p>
                      <p className="truncate text-xs text-gray-500">{order.customer_name}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-amber-700" dir="ltr">
                        {formatCurrency(order.outstanding)}
                      </p>
                      <p className="text-[11px] text-gray-400" dir="ltr">
                        {formatCurrency(order.paid_amount)} / {formatCurrency(order.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* قائمة الواردات — مفصولة: عمليات الشبكة ثم عمليات الكاش */}
        {loading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="py-12 text-center text-gray-400">جاري التحميل...</div>
          </motion.div>
        ) : filteredIncome.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="py-12 text-center">
              <Package className="mx-auto mb-4 h-16 w-16 text-gray-300" />
              <p className="text-gray-500">لا توجد واردات في هذه الفترة</p>
              <p className="text-sm text-gray-400">
                جرّب توسيع الفترة الزمنية أو إزالة فلاتر نوع العملية وطريقة الدفع
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {methodFilter !== 'cash' && (
              <IncomeMethodSection
                title="عمليات الشبكة"
                method="network"
                entries={networkEntries}
                delay={0.2}
              />
            )}
            {methodFilter !== 'network' && (
              <IncomeMethodSection
                title="عمليات الكاش"
                method="cash"
                entries={cashEntries}
                delay={0.25}
              />
            )}
          </div>
        )}

        {/* ملاحظة */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-center"
        >
          <p className="text-sm text-blue-700">
            💡 تُسجَّل كل دفعة في لحظة تحصيلها: العربون بتاريخ استلام الطلب، والمتبقي بتاريخ
            التسليم — ولا يُحتسب أي مبلغ لم يُقبض فعلياً.
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default function IncomePage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <IncomePageContent />
    </ProtectedRoute>
  )
}
