'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  CircleGauge,
  ExternalLink,
  Layers3,
  PackageCheck,
  PackageX,
  Palette,
  RefreshCw,
  Ruler,
  Tags,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getInventoryItemsWithColors } from '@/lib/services/fabric-inventory-service'
import { formatFabricCurrency, formatFabricNumber } from '@/lib/fabric-number-format'
import {
  calculateFabricInventoryStatistics,
  LOW_STOCK_THRESHOLD,
  type InventoryUnitTotals,
} from '@/lib/fabric-inventory-statistics'

const percentFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const COLOR_HEX_PATTERN = /^#[0-9a-f]{6}$/i

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${percentFormatter.format(value)}٪`
}

function formatDate(value: string | null): string {
  if (!value) return 'لا يوجد تحديث مسجل'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'لا يوجد تحديث مسجل' : dateFormatter.format(date)
}

function unitLabel(unit: 'meter' | 'piece'): string {
  return unit === 'meter' ? 'متر' : 'قطعة'
}

function quantityText(quantity: number, unit: 'meter' | 'piece'): string {
  return `${formatFabricNumber(quantity)} ${unitLabel(unit)}`
}

function QuantityPair({ totals, compact = false }: { totals: InventoryUnitTotals; compact?: boolean }) {
  const hasMeters = totals.meter !== 0
  const hasPieces = totals.piece !== 0

  if (!hasMeters && !hasPieces) return <span>0</span>

  return (
    <span className={compact ? 'inline-flex flex-wrap gap-x-2 gap-y-0.5' : 'flex flex-wrap gap-x-3 gap-y-1'}>
      {hasMeters ? <span dir="rtl">{quantityText(totals.meter, 'meter')}</span> : null}
      {hasPieces ? <span dir="rtl">{quantityText(totals.piece, 'piece')}</span> : null}
    </span>
  )
}

type MetricTone = 'forest' | 'gold' | 'ink' | 'brick'

const metricToneClasses: Record<MetricTone, { icon: string; accent: string }> = {
  forest: { icon: 'bg-emerald-50 text-emerald-700', accent: 'bg-emerald-500' },
  gold: { icon: 'bg-amber-50 text-amber-700', accent: 'bg-amber-500' },
  ink: { icon: 'bg-slate-100 text-slate-700', accent: 'bg-slate-500' },
  brick: { icon: 'bg-rose-50 text-rose-700', accent: 'bg-rose-500' },
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  note: string
  tone: MetricTone
}) {
  const classes = metricToneClasses[tone]

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-36px_rgba(15,59,49,0.7)]">
      <span className={`absolute inset-x-0 top-0 h-1 ${classes.accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-stone-500">{label}</p>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div>
          <p className="mt-2 text-xs leading-5 text-stone-500">{note}</p>
        </div>
        <div className={`rounded-2xl p-3 transition-transform duration-300 group-hover:-translate-y-1 ${classes.icon}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </article>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-black tracking-[0.16em] text-emerald-700">{eyebrow}</p>
      <h2 className="mt-1 font-arabic text-xl font-black text-slate-900 sm:text-2xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>
    </div>
  )
}

function InventoryStatisticsContent() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getInventoryItemsWithColors>>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatistics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      setItems(await getInventoryItemsWithColors())
    } catch (loadError) {
      console.error('Failed to load fabric inventory statistics', loadError)
      setError('تعذر تحميل بيانات المخزون. تحقق من الاتصال ثم أعد المحاولة.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadStatistics()
  }, [loadStatistics])

  const stats = useMemo(() => calculateFabricInventoryStatistics(items), [items])
  const pricingCoverage = stats.itemCount > 0
    ? (stats.fullyPricedItemCount / stats.itemCount) * 100
    : 0
  const costCoverage = stats.itemCount > 0 ? (stats.costedItemCount / stats.itemCount) * 100 : 0
  const saleCoverage = stats.itemCount > 0 ? (stats.salePricedItemCount / stats.itemCount) * 100 : 0
  const healthyItemCount = Math.max(0, stats.activeItemCount - stats.lowStockItemCount)
  const healthyPercent = stats.itemCount > 0 ? (healthyItemCount / stats.itemCount) * 100 : 0
  const lowPercent = stats.itemCount > 0 ? (stats.lowStockItemCount / stats.itemCount) * 100 : 0
  const outPercent = stats.itemCount > 0 ? (stats.outOfStockItemCount / stats.itemCount) * 100 : 0
  const maxTypeItemCount = Math.max(1, ...stats.types.map(type => type.itemCount))
  const maxColorItemCount = Math.max(1, ...stats.colors.map(color => color.itemCount))
  const maxValue = Math.max(1, ...stats.topValueItems.map(item => item.purchaseValue))
  const maxPriceBandCount = Math.max(1, ...stats.priceBands.map(band => band.count))
  const comparableShare = stats.purchaseValue > 0
    ? (stats.comparablePurchaseValue / stats.purchaseValue) * 100
    : 0

  const attentionItems = [
    stats.negativeStockItemCount > 0
      ? {
          title: 'أرصدة سالبة',
          value: `${stats.negativeStockItemCount} صنف`,
          note: 'تحتاج مراجعة فورية لحركات الإدخال والإخراج.',
          tone: 'border-rose-200 bg-rose-50 text-rose-900',
        }
      : null,
    stats.unpricedItemCount > 0
      ? {
          title: 'تسعير غير مكتمل',
          value: `${stats.unpricedItemCount} صنف`,
          note: 'ينقصها سعر شراء أو بيع، ولذلك لا تدخل بالكامل في تقدير الربح.',
          tone: 'border-amber-200 bg-amber-50 text-amber-900',
        }
      : null,
    stats.outOfStockItemCount > 0
      ? {
          title: 'أصناف نافدة',
          value: `${stats.outOfStockItemCount} صنف`,
          note: 'رصيدها الحالي صفر أو أقل.',
          tone: 'border-rose-200 bg-rose-50 text-rose-900',
        }
      : null,
    stats.lowStockItemCount > 0
      ? {
          title: 'مخزون منخفض',
          value: `${stats.lowStockItemCount} صنف`,
          note: `رصيدها بين 0 و${LOW_STOCK_THRESHOLD} حسب وحدة الصنف.`,
          tone: 'border-orange-200 bg-orange-50 text-orange-900',
        }
      : null,
    stats.quantityMismatchCount > 0
      ? {
          title: 'فرق بين الصنف والألوان',
          value: `${stats.quantityMismatchCount} صنف`,
          note: 'مجموع أرصدة الألوان لا يطابق الرصيد الكلي للصنف.',
          tone: 'border-sky-200 bg-sky-50 text-sky-900',
        }
      : null,
    stats.uncategorizedItemCount > 0
      ? {
          title: 'أصناف بلا تصنيف',
          value: `${stats.uncategorizedItemCount} صنف`,
          note: 'إضافة التصنيف تحسن دقة توزيع المخزون.',
          tone: 'border-stone-200 bg-stone-100 text-stone-800',
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-slate-900"
      dir="rtl"
      aria-busy={loading || refreshing}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-28 top-16 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute -left-28 top-[34rem] h-80 w-80 rounded-full bg-amber-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard/accounting/fabrics/inventory"
              aria-label="العودة إلى مخزون الأقمشة"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800"
            >
              <ArrowRight className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-arabic text-2xl font-black text-slate-950 sm:text-3xl">
                  إحصائيات المخزون
                </h1>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                  بيانات مباشرة
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500">قراءة مالية وتشغيلية شاملة لمخزون الأقمشة والألوان</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadStatistics(true)}
              disabled={loading || refreshing}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <Link
              href="/dashboard/accounting/fabrics/inventory"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#153c33] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f3129] sm:flex-none"
            >
              إدارة المخزون
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {error ? (
          <section className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
                <div>
                  <h2 className="font-bold">لم نتمكن من تجهيز التقرير</h2>
                  <p className="mt-1 text-sm text-rose-700">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadStatistics()}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-800"
              >
                إعادة المحاولة
              </button>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="space-y-5" aria-label="جاري تحميل إحصائيات المخزون">
            <div className="h-80 animate-pulse rounded-[2rem] bg-emerald-950/15" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map(item => (
                <div key={item} className="h-36 animate-pulse rounded-3xl bg-white/80" />
              ))}
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-6"
          >
            <section className="relative overflow-hidden rounded-[2rem] bg-[#153c33] p-6 text-white shadow-[0_30px_80px_-42px_rgba(7,47,39,0.95)] sm:p-8 lg:p-10">
              <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full border-[42px] border-white/5" aria-hidden="true" />
              <div className="absolute -bottom-28 right-1/3 h-64 w-64 rounded-full bg-amber-300/10 blur-2xl" aria-hidden="true" />
              <div className="relative">
                <div className="flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black tracking-[0.18em] text-[#dfbf7c]">القيمة المتاحة اليوم</p>
                    <h2 className="mt-2 font-arabic text-2xl font-black sm:text-3xl">صورة مالية فورية للمخزون</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/75">
                      القيم تحسب من الرصيد الحالي وسعر الوحدة المسجل لكل صنف، ولا تُقدّر أسعارًا غير موجودة.
                    </p>
                  </div>
                  <p className="text-xs text-emerald-100/65">آخر تحديث للبيانات: {formatDate(stats.latestUpdatedAt)}</p>
                </div>

                <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold text-emerald-100/65">قيمة الشراء الحالية</p>
                    <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                      {stats.costedItemCount > 0 ? formatFabricCurrency(stats.purchaseValue) : '—'}
                    </p>
                    <p className="mt-2 text-xs text-emerald-100/55">للأصناف التي لها سعر شراء</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-100/65">قيمة البيع المتوقعة</p>
                    <p className="mt-2 text-2xl font-black text-[#f3d89e] sm:text-3xl">
                      {stats.salePricedItemCount > 0 ? formatFabricCurrency(stats.retailValue) : '—'}
                    </p>
                    <p className="mt-2 text-xs text-emerald-100/55">وفق سعر البيع والرصيد الحالي</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-100/65">الربح الإجمالي المحتمل</p>
                    <p className={`mt-2 text-2xl font-black sm:text-3xl ${stats.potentialProfit < 0 ? 'text-rose-300' : 'text-emerald-200'}`}>
                      {stats.fullyPricedItemCount > 0 ? formatFabricCurrency(stats.potentialProfit) : '—'}
                    </p>
                    <p className="mt-2 text-xs text-emerald-100/55">
                      هامش {formatPercent(stats.potentialMarginPercent)} للأصناف مكتملة التسعير
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-100/65">اكتمال التسعير</p>
                    <div className="mt-2 flex items-end gap-2">
                      <p className="text-3xl font-black">{formatPercent(pricingCoverage)}</p>
                      <span className="pb-1 text-xs text-emerald-100/55">من الأصناف</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[#dfbf7c]" style={{ width: `${Math.min(100, pricingCoverage)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={Boxes}
                label="إجمالي الأصناف"
                value={formatFabricNumber(stats.itemCount)}
                note={`${stats.activeItemCount} صنف برصيد متاح`}
                tone="forest"
              />
              <MetricCard
                icon={Ruler}
                label="الكميات المتاحة"
                value={<QuantityPair totals={stats.quantities} />}
                note="مفصّلة حسب وحدة القياس لمنع خلط الأمتار بالقطع"
                tone="ink"
              />
              <MetricCard
                icon={Palette}
                label="الألوان المسجلة"
                value={formatFabricNumber(stats.uniqueColorCount)}
                note={`${stats.availableColorVariantCount} رصيد لون متاح من ${stats.totalColorVariantCount}`}
                tone="gold"
              />
              <MetricCard
                icon={PackageX}
                label="تحتاج متابعة"
                value={formatFabricNumber(stats.lowStockItemCount + stats.outOfStockItemCount)}
                note={`${stats.lowStockItemCount} منخفض · ${stats.outOfStockItemCount} نافد`}
                tone={stats.outOfStockItemCount > 0 ? 'brick' : 'forest'}
              />
            </section>

            {stats.itemCount === 0 && !error ? (
              <section className="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
                <Boxes className="mx-auto h-12 w-12 text-stone-300" />
                <h2 className="mt-4 font-arabic text-xl font-black text-slate-800">لا توجد أصناف في المخزون بعد</h2>
                <p className="mt-2 text-sm text-stone-500">أضف أول صنف لتبدأ الإحصائيات بالظهور تلقائيًا.</p>
                <Link href="/dashboard/accounting/fabrics/inventory" className="mt-5 inline-flex rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white">
                  فتح المخزون
                </Link>
              </section>
            ) : null}

            {stats.itemCount > 0 ? (
              <>
                <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <article className="rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(15,59,49,0.65)] sm:p-6">
                    <SectionHeading
                      eyebrow="سلامة الرصيد"
                      title="حالة الأصناف"
                      description={`يُعد الرصيد منخفضًا عندما يكون أكبر من صفر وحتى ${LOW_STOCK_THRESHOLD} حسب وحدة الصنف.`}
                    />
                    <div className="grid items-center gap-7 sm:grid-cols-[180px_1fr]">
                      <div
                        className="relative mx-auto grid aspect-square w-44 place-items-center rounded-full"
                        style={{
                          background: `conic-gradient(#26765f 0 ${healthyPercent}%, #d5a63d ${healthyPercent}% ${healthyPercent + lowPercent}%, #c85f55 ${healthyPercent + lowPercent}% 100%)`,
                        }}
                        role="img"
                        aria-label={`${healthyItemCount} رصيد جيد، ${stats.lowStockItemCount} منخفض، ${stats.outOfStockItemCount} نافد`}
                      >
                        <div className="grid aspect-square w-28 place-items-center rounded-full bg-white text-center shadow-inner">
                          <div>
                            <p className="text-3xl font-black text-slate-900">{stats.itemCount}</p>
                            <p className="text-[11px] font-bold text-stone-400">صنف</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {[
                          { label: 'رصيد جيد', count: healthyItemCount, percent: healthyPercent, color: 'bg-emerald-600' },
                          { label: 'رصيد منخفض', count: stats.lowStockItemCount, percent: lowPercent, color: 'bg-amber-500' },
                          { label: 'نافد أو صفر', count: stats.outOfStockItemCount, percent: outPercent, color: 'bg-rose-500' },
                        ].map(row => (
                          <div key={row.label} className="rounded-2xl bg-stone-50 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                                {row.label}
                              </span>
                              <span className="text-sm font-black text-slate-900">{row.count}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-stone-400">{formatPercent(row.percent)} من الأصناف</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(15,59,49,0.65)] sm:p-6">
                    <SectionHeading
                      eyebrow="جودة التسعير"
                      title="تغطية الأسعار والتقييم"
                      description="توضح مقدار البيانات المالية المكتملة وما يدخل فعليًا في حسابات القيمة والربح."
                    />
                    <div className="space-y-5">
                      {[
                        { label: 'سعر الشراء مسجل', value: costCoverage, count: stats.costedItemCount, color: 'bg-emerald-700' },
                        { label: 'سعر البيع مسجل', value: saleCoverage, count: stats.salePricedItemCount, color: 'bg-[#c89b3c]' },
                        { label: 'مكتمل الشراء والبيع', value: pricingCoverage, count: stats.fullyPricedItemCount, color: 'bg-slate-700' },
                      ].map(row => (
                        <div key={row.label}>
                          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <span className="font-bold text-slate-700">{row.label}</span>
                            <span className="text-xs font-black text-stone-500">{row.count} صنف · {formatPercent(row.value)}</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, row.value)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-[#f6f3eb] p-4">
                      <div>
                        <p className="text-[11px] font-bold text-stone-500">قيمة قابلة لمقارنة الربح</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatFabricCurrency(stats.comparablePurchaseValue)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-stone-500">من قيمة الشراء المسجلة</p>
                        <p className="mt-1 text-lg font-black text-emerald-800">{formatPercent(comparableShare)}</p>
                      </div>
                    </div>
                  </article>
                </section>

                <section className="rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(15,59,49,0.65)] sm:p-7">
                  <SectionHeading
                    eyebrow="هيكل المخزون"
                    title="التوزيع حسب التصنيف الأساسي"
                    description="كل صنف يظهر مرة واحدة تحت تصنيفه الأساسي، مع فصل الكميات حسب وحدة القياس."
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-right text-sm">
                      <thead>
                        <tr className="text-xs text-stone-400">
                          <th className="px-4 pb-2 font-semibold">التصنيف</th>
                          <th className="px-4 pb-2 font-semibold">الأصناف</th>
                          <th className="px-4 pb-2 font-semibold">الكميات</th>
                          <th className="px-4 pb-2 font-semibold">الألوان</th>
                          <th className="px-4 pb-2 font-semibold">قيمة الشراء</th>
                          <th className="px-4 pb-2 font-semibold">قيمة البيع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.types.map(type => (
                          <tr key={type.name} className="bg-stone-50/80 text-slate-700">
                            <td className="rounded-r-2xl px-4 py-3.5">
                              <div className="min-w-40">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-bold text-slate-900">{type.name}</span>
                                  <span className="text-[10px] text-stone-400">{type.activeItemCount} متاح</span>
                                </div>
                                <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200">
                                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(type.itemCount / maxTypeItemCount) * 100}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-black">{type.itemCount}</td>
                            <td className="px-4 py-3.5"><QuantityPair totals={type.quantities} compact /></td>
                            <td className="px-4 py-3.5">{type.colorVariantCount}</td>
                            <td className="px-4 py-3.5 font-bold">{formatFabricCurrency(type.purchaseValue)}</td>
                            <td className="rounded-l-2xl px-4 py-3.5 font-bold text-emerald-800">{formatFabricCurrency(type.retailValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <article className="rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(15,59,49,0.65)] sm:p-7">
                    <SectionHeading
                      eyebrow="لوحة الألوان"
                      title="الألوان الأكثر انتشارًا"
                      description="الترتيب بحسب عدد الأصناف المرتبطة بكل لون، مع إظهار رصيد الأمتار والقطع منفصلًا."
                    />
                    {stats.colors.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {stats.colors.slice(0, 10).map(color => {
                          const swatchColor = color.hex && COLOR_HEX_PATTERN.test(color.hex) ? color.hex : '#d6d3d1'
                          return (
                            <div key={color.name} className="rounded-2xl border border-stone-100 bg-stone-50/70 p-4">
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-10 w-10 shrink-0 rounded-xl border border-black/10 shadow-inner"
                                  style={{ backgroundColor: swatchColor }}
                                  aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <h3 className="truncate font-bold text-slate-900">{color.name}</h3>
                                    <span className="text-[11px] font-bold text-stone-400">{color.itemCount} صنف</span>
                                  </div>
                                  <div className="mt-1 text-xs text-stone-500"><QuantityPair totals={color.quantities} compact /></div>
                                </div>
                              </div>
                              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200">
                                <div className="h-full rounded-full bg-[#b68a35]" style={{ width: `${Math.max(5, (color.itemCount / maxColorItemCount) * 100)}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
                        لا توجد تفاصيل ألوان مسجلة بعد.
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-stone-500">
                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">{stats.availableColorVariantCount} رصيد لون متاح</span>
                      <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">{stats.outOfStockColorVariantCount} رصيد لون نافد</span>
                      <span className="rounded-full bg-stone-100 px-3 py-1.5">{stats.itemsWithoutColorDetailsCount} صنف بلا تفاصيل ألوان</span>
                    </div>
                  </article>

                  <article className="rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(15,59,49,0.65)] sm:p-7">
                    <SectionHeading
                      eyebrow="تحليل السعر"
                      title="نطاقات أسعار البيع"
                      description="التوزيع يحسب الأصناف التي لديها سعر بيع مسجل فقط."
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'الأدنى', value: stats.minimumSalePrice },
                        { label: 'المتوسط', value: stats.averageSalePrice },
                        { label: 'الأعلى', value: stats.maximumSalePrice },
                      ].map(price => (
                        <div key={price.label} className="rounded-2xl bg-[#f6f3eb] px-3 py-4 text-center">
                          <p className="text-[10px] font-bold text-stone-400">{price.label}</p>
                          <p className="mt-1 text-sm font-black text-slate-800 sm:text-base">
                            {price.value == null ? '—' : formatFabricCurrency(price.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                    {stats.priceBands.length > 0 ? (
                      <>
                        <div className="mt-7 flex h-52 items-end justify-between gap-3 border-b border-stone-200 pb-2">
                          {stats.priceBands.map(band => (
                            <div key={band.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                              <span className="text-xs font-black text-slate-700">{band.count}</span>
                              <div
                                className="w-full max-w-14 rounded-t-xl bg-gradient-to-t from-emerald-800 to-emerald-500 transition-[height] duration-500"
                                style={{ height: `${band.count === 0 ? 3 : Math.max(12, (band.count / maxPriceBandCount) * 100)}%` }}
                              />
                              <span className="min-h-8 text-center text-[9px] leading-4 text-stone-500">{band.label}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-center text-[10px] text-stone-400">القيم بالريال السعودي لكل وحدة</p>
                      </>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
                        لا توجد أسعار بيع مسجلة لتحليل النطاقات.
                      </div>
                    )}
                  </article>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                  <article className="rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(15,59,49,0.65)] sm:p-7">
                    <SectionHeading
                      eyebrow="تركيز رأس المال"
                      title="أعلى الأصناف قيمةً في المخزون"
                      description="الترتيب حسب الرصيد الحالي مضروبًا في سعر الشراء المسجل."
                    />
                    <div className="space-y-3">
                      {stats.topValueItems.map((item, index) => (
                        <div key={item.id} className="rounded-2xl border border-stone-100 bg-stone-50/70 p-4">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-xs font-black text-white">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <h3 className="truncate font-bold text-slate-900">{item.name}</h3>
                                  <p className="text-[11px] text-stone-400">
                                    {item.code || 'بلا رقم قماش'} · {quantityText(item.quantity, item.unit)}
                                  </p>
                                </div>
                                <p className="shrink-0 font-black text-emerald-800">{formatFabricCurrency(item.purchaseValue)}</p>
                              </div>
                              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200">
                                <div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(4, (item.purchaseValue / maxValue) * 100)}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {stats.topValueItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
                          لا توجد قيم شراء مسجلة لعرض الترتيب.
                        </div>
                      ) : null}
                    </div>
                  </article>

                  <aside className="rounded-[2rem] bg-[#232d2a] p-5 text-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.95)] sm:p-7">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-black tracking-[0.16em] text-[#dfbf7c]">مراجعة تشغيلية</p>
                        <h2 className="mt-1 font-arabic text-xl font-black">ملاحظات تحتاج انتباه</h2>
                      </div>
                      <CircleGauge className="h-7 w-7 text-[#dfbf7c]" />
                    </div>
                    <div className="mt-6 space-y-3">
                      {attentionItems.length > 0 ? attentionItems.map(item => (
                        <div key={item.title} className={`rounded-2xl border p-4 ${item.tone}`}>
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-black">{item.title}</h3>
                            <span className="text-xs font-black">{item.value}</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 opacity-75">{item.note}</p>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/40 p-5 text-emerald-100">
                          <CheckCircle2 className="h-6 w-6" />
                          <h3 className="mt-3 font-bold">البيانات بحالة جيدة</h3>
                          <p className="mt-1 text-xs leading-5 text-emerald-200/70">لا توجد ملاحظات أساسية ضمن مؤشرات المراجعة الحالية.</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-center">
                      <div className="rounded-2xl bg-white/5 p-3">
                        <Tags className="mx-auto h-5 w-5 text-[#dfbf7c]" />
                        <p className="mt-2 text-xl font-black">{stats.uncategorizedItemCount}</p>
                        <p className="text-[10px] text-white/50">بلا تصنيف</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <Layers3 className="mx-auto h-5 w-5 text-[#dfbf7c]" />
                        <p className="mt-2 text-xl font-black">{stats.supplierMissingItemCount}</p>
                        <p className="text-[10px] text-white/50">بلا مورد</p>
                      </div>
                    </div>
                    <Link
                      href="/dashboard/accounting/fabrics/inventory"
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#dfbf7c] px-4 py-3 text-sm font-black text-[#26322e] transition hover:bg-[#eed69f]"
                    >
                      مراجعة بطاقات المخزون
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </aside>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { icon: CircleDollarSign, label: 'متوسط سعر الشراء', value: stats.averagePurchasePrice == null ? '—' : formatFabricCurrency(stats.averagePurchasePrice) },
                    { icon: TrendingUp, label: 'متوسط سعر البيع', value: stats.averageSalePrice == null ? '—' : formatFabricCurrency(stats.averageSalePrice) },
                    { icon: PackageCheck, label: 'أرصدة ألوان متاحة', value: formatFabricNumber(stats.availableColorVariantCount) },
                    { icon: BarChart3, label: 'التصنيفات الأساسية', value: formatFabricNumber(stats.types.length) },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-4">
                      <item.icon className="h-5 w-5 shrink-0 text-emerald-700" />
                      <div>
                        <p className="text-[10px] font-bold text-stone-400">{item.label}</p>
                        <p className="mt-0.5 font-black text-slate-800">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </section>
              </>
            ) : null}
          </motion.div>
        )}
      </div>
    </main>
  )
}

export default function InventoryStatisticsPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <InventoryStatisticsContent />
    </ProtectedWorkerRoute>
  )
}
