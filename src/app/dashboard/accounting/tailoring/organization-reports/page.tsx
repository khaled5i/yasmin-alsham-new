'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Boxes,
  Building2,
  CreditCard,
  Loader2,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Scissors,
  Search,
  Sparkles,
  UserRound,
  WalletCards,
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import ReportPeriodPicker, {
  computePresetRange,
  type DateFilter,
  type DateRange,
} from '@/components/ReportPeriodPicker'
import { toLocalDateKey } from '@/lib/date-utils'
import { getDeliveredOrdersIncome, getIncome } from '@/lib/services/simple-accounting-service'
import { getWomenWorkshopTransactions } from '@/lib/services/women-workshop-service'
import type { Income } from '@/types/simple-accounting'

// ============================================================================
// الأقسام وصفوف الواردات الموحّدة
// ============================================================================

type DepartmentId = 'tailoring' | 'fabrics' | 'women'
type Method = 'cash' | 'network'

interface ReportRow {
  /** مفتاح فريد للصف (المبيعة المختلطة تنقسم إلى صفين) */
  key: string
  /** معرّف العملية الأصلية — يُعدّ مرة واحدة في عدد عمليات القسم */
  operationId: string
  department: DepartmentId
  method: Method
  amount: number
  title: string
  customer: string | null
  invoiceCode: string | null
  moment: Date
  /** الأقمشة تُسجَّل بتاريخ يوم البيع فقط، فتُفلتر باليوم لا بالساعة (كما في صفحة المبيعات) */
  dateKey: string | null
  isRefund: boolean
  isMixedPart: boolean
}

const DEPARTMENTS: {
  id: DepartmentId
  name: string
  description: string
  icon: typeof Scissors
  gradient: string
  accent: string
  soft: string
}[] = [
  {
    id: 'tailoring',
    name: 'قسم التفصيل',
    description: 'دفعات الطلبات (عربون، تسليم، دفعات إضافية) والواردات اليدوية',
    icon: Scissors,
    gradient: 'from-pink-500 to-rose-600',
    accent: 'text-rose-700',
    soft: 'border-rose-100 bg-rose-50/60',
  },
  {
    id: 'fabrics',
    name: 'قسم الأقمشة',
    description: 'مبيعات المحل والمتجر الإلكتروني، مع خصم المرتجعات',
    icon: Boxes,
    gradient: 'from-teal-500 to-emerald-600',
    accent: 'text-teal-700',
    soft: 'border-teal-100 bg-teal-50/60',
  },
  {
    id: 'women',
    name: 'المشغل النسائي',
    description: 'فواتير المشغل وعمليات أخذ المقاس',
    icon: Sparkles,
    gradient: 'from-fuchsia-500 to-purple-600',
    accent: 'text-fuchsia-700',
    soft: 'border-fuchsia-100 bg-fuchsia-50/60',
  },
]

// ============================================================================
// Helpers
// ============================================================================

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatAmount(amount: number) {
  return `${moneyFormatter.format(Number(amount) || 0)} ر.س`
}

const dateTimeFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function formatRowDate(row: ReportRow) {
  if (Number.isNaN(row.moment.getTime())) return '—'
  return row.dateKey ? dateFormatter.format(row.moment) : dateTimeFormatter.format(row.moment)
}

function parseMoment(...candidates: (string | null | undefined)[]): Date {
  for (const raw of candidates) {
    if (!raw) continue
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(NaN)
}

/** نفس قاعدة صفحة واردات التفصيل: occurred_at للحركات المشتقّة وإلا تاريخ السجل */
function tailoringMoment(entry: Income): Date {
  const parsed = parseMoment(entry.occurred_at, entry.created_at, entry.date)
  if (!Number.isNaN(parsed.getTime())) return parsed
  return new Date(`${entry.date}T00:00:00`)
}

const TAILORING_KIND_LABEL: Record<string, string> = {
  order_deposit: 'عربون طلب',
  order_delivery: 'دفعة عند التسليم',
  order_payment: 'دفعة إضافية',
  manual_income: 'وارد يدوي',
}

// ============================================================================
// تحميل الواردات من الأقسام الثلاثة
// ============================================================================

async function loadTailoringRows(): Promise<ReportRow[]> {
  const [orderEntries, manualEntries] = await Promise.all([
    getDeliveredOrdersIncome('tailoring'),
    getIncome('tailoring'),
  ])

  // واردات income المرتبطة بطلب محسوبة أصلاً ضمن حركات الطلب — نفس قاعدة صفحة الواردات
  const manual = manualEntries
    .filter((item) => !item.order_id)
    .map((item) => ({ ...item, entry_kind: 'manual_income' as const, occurred_at: item.created_at || item.date }))

  return [...orderEntries, ...manual].map((entry) => {
    const kind = entry.entry_kind || 'manual_income'
    const kindLabel = TAILORING_KIND_LABEL[kind] || 'وارد'
    return {
      key: `tailoring-${entry.id}`,
      operationId: `tailoring-${entry.id}`,
      department: 'tailoring' as const,
      method: entry.payment_method === 'network' ? 'network' : 'cash',
      amount: Number(entry.amount) || 0,
      title: entry.order_number ? `${kindLabel} — طلب ${entry.order_number}` : entry.description || kindLabel,
      customer: entry.customer_name?.trim() || null,
      invoiceCode: entry.alostaz_invoice_code || null,
      moment: tailoringMoment(entry),
      dateKey: null,
      isRefund: false,
      isMixedPart: false,
    }
  })
}

async function loadFabricRows(): Promise<ReportRow[]> {
  const entries = await getIncome('fabrics')
  const rows: ReportRow[] = []

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0
    const isRefund = amount < 0
    const fabricNames = (entry.fabric_items ?? []).map((item) => item.name).filter(Boolean)
    const title = isRefund
      ? entry.description || 'مرتجع المتجر الإلكتروني'
      : fabricNames.length > 0
        ? fabricNames.join('، ')
        : entry.customer_name && entry.customer_name !== '-'
          ? entry.customer_name
          : entry.description || 'مبيعة قماش'
    const dateKey = String(entry.date || '').slice(0, 10)
    const base = {
      operationId: `fabrics-${entry.id}`,
      department: 'fabrics' as const,
      title,
      customer: entry.buyer_name?.trim() || null,
      invoiceCode: entry.alostaz_invoice_code || (entry.invoice_number ? String(entry.invoice_number) : null),
      // الوقت الفعلي للعرض فقط؛ الفلترة باليوم المسجَّل للمبيعة
      moment: parseMoment(entry.created_at, `${dateKey}T00:00:00`),
      dateKey,
      isRefund,
    }

    if (entry.payment_method === 'mixed') {
      // المبيعة المختلطة تُحتسب في الجهتين بقيمة كل جزء — نفس قاعدة صفحة المبيعات
      const networkPortion = Math.max(0, Number(entry.network_amount) || 0)
      const cashPortion = Math.max(0, Number(entry.cash_amount) || 0)
      if (networkPortion > 0) {
        rows.push({ ...base, key: `fabrics-${entry.id}-network`, method: 'network', amount: networkPortion, isMixedPart: true })
      }
      if (cashPortion > 0) {
        rows.push({ ...base, key: `fabrics-${entry.id}-cash`, method: 'cash', amount: cashPortion, isMixedPart: true })
      }
      continue
    }

    rows.push({
      ...base,
      key: `fabrics-${entry.id}`,
      method: entry.payment_method === 'network' ? 'network' : 'cash',
      amount,
      isMixedPart: false,
    })
  }

  return rows
}

async function loadWomenRows(): Promise<ReportRow[]> {
  const result = await getWomenWorkshopTransactions()
  if (result.error) throw new Error(result.error)

  return result.data
    .filter((transaction) => transaction.transaction_kind !== 'expense' && transaction.source !== 'manual_expense')
    .map((transaction) => ({
      key: `women-${transaction.id}`,
      operationId: `women-${transaction.id}`,
      department: 'women' as const,
      method: transaction.payment_method === 'card' ? 'network' : 'cash',
      amount: Number(transaction.amount) || 0,
      title: transaction.operation_name,
      customer: transaction.customer_name?.trim() || null,
      invoiceCode: transaction.alostaz_invoice_code || null,
      moment: parseMoment(transaction.occurred_at),
      dateKey: null,
      isRefund: false,
      isMixedPart: false,
    }))
}

// ============================================================================
// الإحصائيات
// ============================================================================

interface MethodStats {
  total: number
  count: number
}

interface DepartmentStats {
  total: number
  count: number
  cash: MethodStats
  network: MethodStats
}

function computeStats(rows: ReportRow[]): DepartmentStats {
  const stats: DepartmentStats = {
    total: 0,
    count: 0,
    cash: { total: 0, count: 0 },
    network: { total: 0, count: 0 },
  }
  const operations = new Set<string>()

  for (const row of rows) {
    stats.total += row.amount
    stats[row.method].total += row.amount
    // المرتجع يُنقص المجاميع ولا يُعدّ عملية بيع
    if (row.isRefund) continue
    stats[row.method].count += 1
    operations.add(row.operationId)
  }

  stats.count = operations.size
  return stats
}

// ============================================================================
// المكوّنات
// ============================================================================

function MethodTable({ method, rows }: { method: Method; rows: ReportRow[] }) {
  const isNetwork = method === 'network'
  const stats = computeStats(rows)

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 ${
        isNetwork ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2 text-white ${isNetwork ? 'bg-emerald-600' : 'bg-amber-500'}`}>
            {isNetwork ? <CreditCard className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
          </div>
          <div>
            <h3 className="font-black text-slate-900">{isNetwork ? 'عمليات الشبكة' : 'عمليات الكاش'}</h3>
            <p className="text-xs font-semibold text-slate-500">{stats[method].count} عملية</p>
          </div>
        </div>
        <div className={`text-lg font-black ${isNetwork ? 'text-emerald-700' : 'text-amber-700'}`}>
          {formatAmount(stats[method].total)}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
          لا توجد عمليات مطابقة في هذه الفترة
        </div>
      ) : (
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">العملية</th>
                <th className="px-4 py-3">اسم العميل</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">رقم الفاتورة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key} className={`transition ${row.isRefund ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50/80'}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-600">{formatRowDate(row)}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{row.title}</p>
                    {(row.isRefund || row.isMixedPart) && (
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${
                        row.isRefund ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'
                      }`}>
                        {row.isRefund ? 'مرتجع' : 'جزء من دفع مختلط كاش + شبكة'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.customer ? (
                      <span className="inline-flex items-center gap-2 font-bold text-slate-800">
                        <span className="rounded-full bg-slate-100 p-1.5 text-slate-500">
                          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        {row.customer}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 font-black ${row.isRefund ? 'text-red-700' : 'text-slate-900'}`}>
                    {formatAmount(row.amount)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">{row.invoiceCode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DepartmentSection({
  department,
  rows,
  error,
  index,
}: {
  department: (typeof DEPARTMENTS)[number]
  rows: ReportRow[]
  error: string | null
  index: number
}) {
  const stats = useMemo(() => computeStats(rows), [rows])
  const networkRows = useMemo(() => rows.filter((row) => row.method === 'network'), [rows])
  const cashRows = useMemo(() => rows.filter((row) => row.method === 'cash'), [rows])

  return (
    <motion.section
      id={`department-${department.id}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08 }}
      className="scroll-mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      {/* رأس القسم مع إحصائيته */}
      <div className={`border-b px-5 py-5 ${department.soft}`}>
        <div className="mb-4 flex items-center gap-3">
          <div className={`rounded-2xl bg-gradient-to-br p-2.5 text-white shadow ${department.gradient}`}>
            <department.icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">{department.name}</h2>
            <p className="text-xs font-semibold text-slate-500">{department.description}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500">إجمالي الواردات</p>
            <p className={`mt-1 text-xl font-black ${department.accent}`}>{formatAmount(stats.total)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500">عدد العمليات</p>
            <p className="mt-1 text-xl font-black text-slate-900">{stats.count} عملية</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <CreditCard className="h-3.5 w-3.5" /> الشبكة
            </p>
            <p className="mt-1 text-xl font-black text-emerald-700">{formatAmount(stats.network.total)}</p>
            <p className="text-xs font-semibold text-slate-500">{stats.network.count} عملية</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <Banknote className="h-3.5 w-3.5" /> الكاش
            </p>
            <p className="mt-1 text-xl font-black text-amber-700">{formatAmount(stats.cash.total)}</p>
            <p className="text-xs font-semibold text-slate-500">{stats.cash.count} عملية</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="m-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>تعذّر تحميل واردات هذا القسم: {error}</span>
        </div>
      ) : (
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <MethodTable method="network" rows={networkRows} />
          <MethodTable method="cash" rows={cashRows} />
        </div>
      )}
    </motion.section>
  )
}

// ============================================================================
// الصفحة
// ============================================================================

function OrganizationReportsContent() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [errors, setErrors] = useState<Partial<Record<DepartmentId, string>>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<DateRange>('month')
  const [periodRange, setPeriodRange] = useState<DateFilter>(() => computePresetRange('month'))

  const loadReport = useCallback(async () => {
    setLoading(true)
    const loaders: [DepartmentId, () => Promise<ReportRow[]>][] = [
      ['tailoring', loadTailoringRows],
      ['fabrics', loadFabricRows],
      ['women', loadWomenRows],
    ]
    const results = await Promise.allSettled(loaders.map(([, load]) => load()))

    const nextRows: ReportRow[] = []
    const nextErrors: Partial<Record<DepartmentId, string>> = {}
    results.forEach((result, i) => {
      const id = loaders[i][0]
      if (result.status === 'fulfilled') nextRows.push(...result.value)
      else nextErrors[id] = result.reason instanceof Error ? result.reason.message : 'خطأ غير معروف'
    })

    setRows(nextRows)
    setErrors(nextErrors)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const handleApplyPeriod = (period: DateRange, range: DateFilter) => {
    setSelectedPeriod(period)
    setPeriodRange(range)
  }

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const from = periodRange.startDate.getTime()
    const to = periodRange.endDate.getTime()
    const fromKey = toLocalDateKey(periodRange.startDate)
    const toKey = toLocalDateKey(periodRange.endDate)

    return rows
      .filter((row) => {
        if (row.dateKey) {
          if (row.dateKey < fromKey || row.dateKey > toKey) return false
        } else {
          const moment = row.moment.getTime()
          if (Number.isNaN(moment) || moment < from || moment > to) return false
        }

        if (!term) return true
        return (
          row.title.toLowerCase().includes(term) ||
          String(row.customer || '').toLowerCase().includes(term) ||
          String(row.invoiceCode || '').toLowerCase().includes(term)
        )
      })
      .sort((a, b) => b.moment.getTime() - a.moment.getTime())
  }, [periodRange, rows, searchTerm])

  const rowsByDepartment = useMemo(() => {
    const grouped: Record<DepartmentId, ReportRow[]> = { tailoring: [], fabrics: [], women: [] }
    for (const row of filteredRows) grouped[row.department].push(row)
    return grouped
  }, [filteredRows])

  const overall = useMemo(() => computeStats(filteredRows), [filteredRows])

  const departmentTotals = useMemo(
    () =>
      DEPARTMENTS.map((department) => ({
        department,
        stats: computeStats(rowsByDepartment[department.id]),
      })),
    [rowsByDepartment]
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#eef2ff,_transparent_34%),linear-gradient(to_bottom,_#f8fafc,_#ffffff)]" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.header initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/accounting/tailoring"
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-5 w-5 rotate-180" />
              </Link>
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-800 p-3 text-white shadow-lg shadow-indigo-200">
                <Building2 className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">تقارير كامل المؤسسة</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  واردات التفصيل والأقمشة والمشغل النسائي — شبكة وكاش
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/accounting/hala-reconciliation"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
              >
                <ScanLine className="h-5 w-5" aria-hidden="true" />
                مطابقة دفعات هلا
              </Link>
              <button
                type="button"
                onClick={() => void loadReport()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                تحديث التقرير
              </button>
            </div>
          </div>
        </motion.header>

        {/* شاشة الإحصائيات العامة */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 p-6 text-white shadow-lg"
        >
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold opacity-80">
                <WalletCards className="h-4 w-4" /> مجموع الواردات كاملاً
              </p>
              <p className="mt-2 text-3xl font-black">{formatAmount(overall.total)}</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-bold opacity-80">
                <ReceiptText className="h-4 w-4" /> عدد العمليات
              </p>
              <p className="mt-2 text-3xl font-black">{overall.count} عملية</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <CreditCard className="h-4 w-4" /> إجمالي الشبكة
              </p>
              <p className="mt-2 text-2xl font-black">{formatAmount(overall.network.total)}</p>
              <p className="text-xs font-semibold opacity-70">{overall.network.count} عملية</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-amber-300">
                <Banknote className="h-4 w-4" /> إجمالي الكاش
              </p>
              <p className="mt-2 text-2xl font-black">{formatAmount(overall.cash.total)}</p>
              <p className="text-xs font-semibold opacity-70">{overall.cash.count} عملية</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 border-t border-white/15 pt-5 md:grid-cols-3">
            {departmentTotals.map(({ department, stats }) => (
              <a
                key={department.id}
                href={`#department-${department.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 transition hover:bg-white/15"
              >
                <div className={`rounded-xl bg-gradient-to-br p-2 ${department.gradient}`}>
                  <department.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{department.name}</p>
                  <p className="text-xs opacity-70">{stats.count} عملية</p>
                </div>
                <p className="whitespace-nowrap font-black">{formatAmount(stats.total)}</p>
              </a>
            ))}
          </div>
        </motion.div>

        {/* الفلتر — بنفس أسلوب صفحة المشغل النسائي */}
        <div className="mb-7 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]">
          <label className="relative block">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ابحث باسم العميل أو العملية أو رقم الفاتورة"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-4 pr-12 font-medium text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
          </label>
          <ReportPeriodPicker
            period={selectedPeriod}
            range={periodRange}
            onApply={handleApplyPeriod}
            className="w-full justify-center md:w-auto"
          />
          <button
            type="button"
            onClick={() => {
              setSearchTerm('')
              setSelectedPeriod('month')
              setPeriodRange(computePresetRange('month'))
            }}
            className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600 transition hover:bg-slate-50"
          >
            مسح الفلاتر
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
            <div className="text-center">
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-indigo-600" />
              <p className="mt-3 text-sm font-bold text-slate-500">جاري تحميل واردات الأقسام...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-7">
            {DEPARTMENTS.map((department, index) => (
              <DepartmentSection
                key={department.id}
                department={department}
                rows={rowsByDepartment[department.id]}
                error={errors[department.id] ?? null}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function OrganizationReportsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <OrganizationReportsContent />
    </ProtectedRoute>
  )
}
