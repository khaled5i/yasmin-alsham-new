'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import { alterationService, type Alteration, type AlterationType } from '@/lib/services/alteration-service'
import AlterationStageModal from '@/components/AlterationStageModal'
import OrderSearchModal from '@/components/OrderSearchModal'
import type { Order } from '@/lib/services/order-service'
import { getAlterationText } from '@/lib/alteration-text'
import {
  ALTERATION_STATUS_KEYS,
  ALTERATION_TYPE_META,
  BottomSheet,
  ConfirmSheet,
  StatusBadge,
  formatAlterationTimestampDate,
  getAlterationReasonMeta,
  getAlterationStatusMeta,
  getAlterationTypeMeta,
  getDueInfo,
  type AlterationStatus,
} from '@/components/alterations/alteration-ui'
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  FolderOpen,
  Layers,
  Loader2,
  MessageCircle,
  Package,
  Plus,
  Printer,
  RadioTower,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { openAlterationWhatsApp } from '@/utils/whatsapp'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { printAlterationSlip } from '@/lib/services/alteration-slip-printer'

const PAGE_SIZE = 30

type QuickFilter = 'all' | 'today' | 'overdue'
type SortKey = 'newest' | 'due_soonest'

interface ListFilters {
  status: AlterationStatus | 'all'
  type: AlterationType | 'all'
  sort: SortKey
}

const DEFAULT_FILTERS: ListFilters = { status: 'all', type: 'all', sort: 'newest' }
const TYPE_KEYS: AlterationType[] = ['first_proof', 'second_proof', 'after_delivery']

export default function AlterationsPage() {
  const { user } = useAuthStore()
  const { isArabic } = useTranslation()
  const router = useRouter()
  const { can } = useWorkerPermissions()
  // سبب الخطأ يُجلب ويُعرض لمن يملك صلاحيته فقط
  const isAdmin = can('alterations.error_reason')
  const canCreate = can('alterations.create')
  const canDelete = can('alterations.delete')
  const tr = (ar: string, en: string) => (isArabic ? ar : en)

  const [alterations, setAlterations] = useState<Alteration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [totalAlterations, setTotalAlterations] = useState(0)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS)
  const [draftFilters, setDraftFilters] = useState<ListFilters>(DEFAULT_FILTERS)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [counts, setCounts] = useState<{ total: number; today: number; overdue: number } | null>(null)
  const [showOrderSearchModal, setShowOrderSearchModal] = useState(false)
  const [selectedOrderForAlteration, setSelectedOrderForAlteration] = useState<Order | null>(null)
  const [printingAlterationId, setPrintingAlterationId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Alteration | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const fetchPage = useCallback((page: number) => alterationService.getAll({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearchTerm || undefined,
    status: filters.status === 'all' ? undefined : filters.status,
    alteration_type: filters.type === 'all' ? undefined : filters.type,
    due: quickFilter === 'all' ? undefined : quickFilter,
    sort: filters.sort,
    includeErrorType: isAdmin,
    withOrder: true,
  }), [debouncedSearchTerm, filters, quickFilter, isAdmin])

  // التحقق من الصلاحيات وتحميل أول صفحة عند تغيّر البحث أو الفلاتر
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    const requestId = ++requestIdRef.current
    setIsLoading(true)
    fetchPage(0)
      .then(({ data, error, total }) => {
        if (requestId !== requestIdRef.current) return
        if (error) {
          toast.error(error)
          setAlterations([])
          setTotalAlterations(0)
          return
        }
        setAlterations(data || [])
        setTotalAlterations(total ?? 0)
        setCurrentPage(0)
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) return
        toast.error(error instanceof Error ? error.message : 'Failed to load alterations')
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false)
      })
  }, [user, router, fetchPage])

  const loadCounts = useCallback(async () => {
    const { data } = await alterationService.getListCounts()
    if (data) setCounts(data)
  }, [])

  useEffect(() => {
    if (user) void loadCounts()
  }, [user, loadCounts])

  const handleLoadMore = async () => {
    if (isLoadingMore) return
    const requestId = requestIdRef.current
    const nextPage = currentPage + 1
    setIsLoadingMore(true)
    try {
      const { data, error, total } = await fetchPage(nextPage)
      if (requestId !== requestIdRef.current) return
      if (error) {
        toast.error(error)
        return
      }
      setAlterations(previous => {
        const seen = new Set(previous.map(item => item.id))
        return [...previous, ...(data || []).filter(item => !seen.has(item.id))]
      })
      if (typeof total === 'number') setTotalAlterations(total)
      setCurrentPage(nextPage)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load alterations')
    } finally {
      setIsLoadingMore(false)
    }
  }

  // كل تعديل مرتبط بطلب موجود: البحث عن الطلب مباشرة
  const handleAddNewAlteration = () => {
    if (!canCreate) return
    setShowOrderSearchModal(true)
  }

  const handleSelectOrder = (order: Order) => {
    setSelectedOrderForAlteration(order)
  }

  const handleSelectAlterationStage = (alterationType: AlterationType) => {
    if (!selectedOrderForAlteration) return
    router.push(`/dashboard/alterations/add?orderId=${selectedOrderForAlteration.id}&alterationType=${alterationType}`)
    setSelectedOrderForAlteration(null)
  }

  const openAlteration = (id: string) => {
    router.push(`/dashboard/alterations/add?editId=${id}`)
  }

  const handleConfirmDelete = async () => {
    const target = deleteTarget
    if (!target) return
    setIsDeleting(true)
    try {
      const { error } = await alterationService.delete(target.id)
      if (error) {
        toast.error(error)
        return
      }
      // تحديث عداد التعديلات في الطلب الأصلي بعد الحذف
      if (target.original_order_id) {
        await alterationService.syncOrderAlterationCount(target.original_order_id)
      }
      toast.success(tr('تم حذف طلب التعديل بنجاح', 'Alteration deleted successfully'))
      setAlterations(previous => previous.filter(item => item.id !== target.id))
      setTotalAlterations(previous => Math.max(0, previous - 1))
      setDeleteTarget(null)
      void loadCounts()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete alteration')
    } finally {
      setIsDeleting(false)
    }
  }

  /**
   * الطباعة تمر عبر طابور محطة الورشة، فلا يتصل هذا الجهاز بالطابعة إطلاقًا.
   * كل ضغطة تُخرج ورقتين: العربية ثم الهندية على ورقة منفصلة.
   */
  const handlePrintAlteration = async (alterationId: string) => {
    if (printingAlterationId) return
    setPrintingAlterationId(alterationId)

    try {
      const { hindiMissing } = await printAlterationSlip(alterationId)
      if (hindiMissing) {
        toast(
          isArabic
            ? 'أُرسلت الورقة العربية. تعذّرت الترجمة الهندية فلن تُطبع نسختها.'
            : 'Arabic slip queued. Hindi translation failed, so its copy will not print.',
          { icon: '⚠️' }
        )
      } else {
        toast.success(
          isArabic
            ? 'أُرسلت ورقتا التعديل (عربي + هندي) إلى طابعة الورشة'
            : 'Both slips (Arabic + Hindi) were sent to the workshop printer'
        )
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : (isArabic ? 'تعذّر إرسال ورقة التعديل للطباعة' : 'Failed to queue the alteration slip')
      )
    } finally {
      setPrintingAlterationId(null)
    }
  }

  const handleWhatsApp = (alteration: Alteration) => {
    if (!alteration.client_phone) {
      toast.error(tr('لا يوجد رقم هاتف لهذا العميل', 'No phone number for this client'))
      return
    }
    openAlterationWhatsApp({
      clientName: alteration.client_name,
      clientPhone: alteration.client_phone,
      alterationNumber: alteration.alteration_number || undefined,
      dueDate: alteration.alteration_due_date
    })
  }

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = []
    if (filters.status !== 'all') {
      const label = getAlterationStatusMeta(filters.status).label
      chips.push({
        key: 'status',
        label: `${tr('الحالة', 'Status')}: ${isArabic ? label.ar : label.en}`,
        clear: () => setFilters(previous => ({ ...previous, status: 'all' })),
      })
    }
    if (filters.type !== 'all') {
      const label = ALTERATION_TYPE_META[filters.type].short
      chips.push({
        key: 'type',
        label: `${tr('النوع', 'Type')}: ${isArabic ? label.ar : label.en}`,
        clear: () => setFilters(previous => ({ ...previous, type: 'all' })),
      })
    }
    if (filters.sort !== 'newest') {
      chips.push({
        key: 'sort',
        label: tr('الترتيب: الأقرب موعداً', 'Sort: soonest due'),
        clear: () => setFilters(previous => ({ ...previous, sort: 'newest' })),
      })
    }
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, isArabic])

  const hasAnyFilter = activeFilterChips.length > 0 || quickFilter !== 'all' || debouncedSearchTerm !== ''

  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setQuickFilter('all')
    setSearchTerm('')
    setDebouncedSearchTerm('')
  }

  const openFilterSheet = () => {
    setDraftFilters(filters)
    setShowFilterSheet(true)
  }

  const quickTiles: Array<{
    key: QuickFilter
    label: string
    count: number | undefined
    icon: typeof CalendarCheck2
    active: string
    idle: string
  }> = [
    {
      key: 'today',
      label: tr('موعدها اليوم', 'Due today'),
      count: counts?.today,
      icon: CalendarCheck2,
      active: 'border-pink-400 bg-pink-50 text-pink-800 ring-2 ring-pink-200',
      idle: 'border-pink-100 bg-white text-pink-700',
    },
    {
      key: 'overdue',
      label: tr('متأخرة', 'Overdue'),
      count: counts?.overdue,
      icon: AlertTriangle,
      active: 'border-red-400 bg-red-50 text-red-800 ring-2 ring-red-200',
      idle: 'border-red-100 bg-white text-red-700',
    },
    {
      key: 'all',
      label: tr('الكل', 'All'),
      count: counts?.total,
      icon: Layers,
      active: 'border-purple-400 bg-purple-50 text-purple-800 ring-2 ring-purple-200',
      idle: 'border-slate-200 bg-white text-slate-700',
    },
  ]

  const hasMore = alterations.length < totalAlterations

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 pb-28 sm:pb-12">
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-30 border-b border-pink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="-ms-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-pink-50 hover:text-pink-700"
            aria-label={tr('العودة إلى لوحة التحكم', 'Back to Dashboard')}
          >
            <ArrowRight className={`h-5 w-5 ${isArabic ? '' : 'rotate-180'}`} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold text-slate-900 sm:text-xl">
              {tr('قسم التعديلات', 'Alterations')}
            </h1>
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              {tr('إدارة طلبات تعديل الفساتين', 'Manage dress alteration requests')}
            </p>
          </div>
          {can('settings.print_stations') ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/alterations/print-station')}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-pink-300 hover:text-pink-700"
              aria-label={tr('محطة الطباعة', 'Print Station')}
            >
              <RadioTower className="h-5 w-5" />
              <span className="hidden sm:inline">{tr('محطة الطباعة', 'Print Station')}</span>
            </button>
          ) : null}
          {canCreate && <button
            type="button"
            onClick={handleAddNewAlteration}
            className="hidden h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-l from-pink-500 to-purple-500 px-4 text-sm font-bold text-white shadow-sm transition hover:from-pink-600 hover:to-purple-600 sm:inline-flex"
          >
            <Plus className="h-5 w-5" />
            {tr('تعديل جديد', 'New alteration')}
          </button>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 sm:px-6">
        {/* أرقام سريعة تعمل كفلاتر */}
        <div className="grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
          {quickTiles.map(tile => {
            const Icon = tile.icon
            const isActive = quickFilter === tile.key
            return (
              <button
                key={tile.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setQuickFilter(tile.key)}
                className={`min-h-[80px] rounded-2xl border p-3 text-start shadow-sm transition ${isActive ? tile.active : tile.idle}`}
              >
                <Icon className="h-4 w-4" />
                <p className="mt-1 text-2xl font-extrabold leading-8 tabular-nums">
                  {typeof tile.count === 'number' ? tile.count : '—'}
                </p>
                <p className="text-[13px] font-bold leading-5">{tile.label}</p>
              </button>
            )
          })}
        </div>

        {/* البحث والفلترة */}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={tr('اسم، هاتف، رقم تعديل أو طلب', 'Name, phone, alteration or order no.')}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pe-11 ps-10 text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute end-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:text-slate-700"
                aria-label={tr('مسح البحث', 'Clear search')}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openFilterSheet}
            className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-sm transition ${activeFilterChips.length > 0 ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-600 hover:border-pink-300'}`}
            aria-label={tr('فلترة', 'Filters')}
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeFilterChips.length > 0 ? (
              <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink-600 px-1 text-[11px] font-bold text-white">
                {activeFilterChips.length}
              </span>
            ) : null}
          </button>
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-pink-200 bg-white px-3 text-sm font-bold text-pink-700"
              >
                {chip.label}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {isLoading
              ? tr('جارٍ التحميل…', 'Loading…')
              : tr(`عرض ${alterations.length} من ${totalAlterations}`, `Showing ${alterations.length} of ${totalAlterations}`)}
          </span>
          {hasAnyFilter ? (
            <button type="button" onClick={clearAllFilters} className="min-h-9 px-1 font-bold text-pink-600">
              {tr('مسح الفلاتر', 'Clear filters')}
            </button>
          ) : null}
        </div>

        {/* القائمة */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(index => (
              <div key={index} className="h-56 animate-pulse rounded-2xl border border-slate-100 bg-white/80" />
            ))}
          </div>
        ) : alterations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm"
          >
            <Package className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <h3 className="text-lg font-extrabold text-slate-900">
              {hasAnyFilter ? tr('لا توجد تعديلات مطابقة', 'No matching alterations') : tr('لا توجد طلبات تعديل', 'No alterations found')}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-[15px] text-slate-500">
              {hasAnyFilter
                ? tr('جرّبي كلمة بحث أخرى أو امسحي الفلاتر.', 'Try another search or clear the filters.')
                : tr('ابدئي بإضافة طلب تعديل جديد من طلب موجود.', 'Start by adding an alteration from an existing order.')}
            </p>
            <button
              type="button"
              onClick={hasAnyFilter ? clearAllFilters : handleAddNewAlteration}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 px-6 text-[15px] font-bold text-white shadow-md"
            >
              {hasAnyFilter ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {hasAnyFilter ? tr('مسح البحث والفلاتر', 'Clear search & filters') : tr('إضافة طلب تعديل', 'Add alteration')}
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alterations.map((alteration, index) => {
              const typeMeta = getAlterationTypeMeta(alteration.alteration_type)
              const reason = isAdmin ? getAlterationReasonMeta(alteration.error_type) : null
              const due = getDueInfo(alteration.alteration_due_date, alteration.status, isArabic)
              // تاريخ أخذ التعديل = وقت إنشائه بالتوقيت المحلي (يطابق order_received_date في كل السجلات)
              const takenDate = formatAlterationTimestampDate(alteration.created_at)
              const text = getAlterationText({ description: alteration.description, notes: alteration.notes })
              const orderNumber = alteration.original_order?.order_number
              const isPrinting = printingAlterationId === alteration.id

              return (
                <motion.article
                  key={alteration.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 8) * 0.03 }}
                  className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <span className={`absolute inset-y-0 start-0 w-1.5 ${typeMeta.bar}`} aria-hidden />

                  <button
                    type="button"
                    onClick={() => openAlteration(alteration.id)}
                    className="block flex-1 pb-3 pe-4 ps-5 pt-4 text-start transition hover:bg-pink-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-extrabold text-slate-900">
                          {alteration.client_name || tr('بدون اسم', 'No name')}
                        </h3>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                          <span dir="ltr" className="font-semibold text-slate-600">{alteration.alteration_number || '—'}</span>
                          <span aria-hidden>·</span>
                          {alteration.original_order_id ? (
                            <span>
                              {tr('طلب', 'Order')}{' '}
                              <span dir="ltr" className="font-semibold text-slate-600">{orderNumber || '—'}</span>
                            </span>
                          ) : (
                            <span className="font-semibold text-slate-400">{tr('بدون طلب (قديم)', 'No order (legacy)')}</span>
                          )}
                        </p>
                      </div>
                      <StatusBadge status={alteration.status} isArabic={isArabic} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${typeMeta.badge}`}>
                        {isArabic ? typeMeta.label.ar : typeMeta.label.en}
                      </span>
                      {reason ? (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${reason.badge}`}>
                          {isArabic ? reason.label.ar : reason.label.en}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <CalendarPlus className="h-4 w-4 shrink-0" />
                        {tr('تاريخ أخذ التعديل', 'Taken on')}
                      </span>
                      <span className="text-sm font-bold">
                        {takenDate ? <span dir="ltr">{takenDate}</span> : '—'}
                      </span>
                    </div>

                    <div className={`mt-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${due.tone}`}>
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <CalendarClock className="h-4 w-4 shrink-0" />
                        {tr('موعد التعديل', 'Due')}
                      </span>
                      <span className="text-sm font-bold">
                        {due.date ? <span dir="ltr">{due.date}</span> : tr('بدون موعد', 'No date')}
                        {due.relative ? <span> · {due.relative}</span> : null}
                      </span>
                    </div>

                    {text ? (
                      <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm leading-6 text-slate-600">{text}</p>
                    ) : null}
                  </button>

                  <div className={`grid gap-2 border-t border-slate-100 px-3 py-3 ${canDelete ? 'grid-cols-[1fr_1fr_1fr_auto]' : 'grid-cols-3'}`}>
                    <button
                      type="button"
                      onClick={() => openAlteration(alteration.id)}
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 text-sm font-bold text-purple-700 transition hover:bg-purple-100"
                    >
                      <FolderOpen className="h-4 w-4" />
                      {tr('فتح', 'Open')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePrintAlteration(alteration.id)}
                      disabled={printingAlterationId !== null}
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 text-sm font-bold text-pink-700 transition hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title={tr('طباعة على طابعة الورشة (عربي + هندي)', 'Print on the workshop printer (Arabic + Hindi)')}
                    >
                      {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                      {tr('طباعة', 'Print')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWhatsApp(alteration)}
                      disabled={!alteration.client_phone}
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 text-sm font-bold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title={alteration.client_phone ? tr('إرسال رسالة واتساب', 'Send WhatsApp message') : tr('لا يوجد رقم هاتف', 'No phone number')}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {tr('واتساب', 'WhatsApp')}
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(alteration)}
                        className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        aria-label={tr('حذف', 'Delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </motion.article>
              )
            })}
          </div>
        )}

        {!isLoading && hasMore ? (
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={isLoadingMore}
            className="mx-auto flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white text-[15px] font-bold text-pink-700 shadow-sm transition hover:bg-pink-50 disabled:opacity-60"
          >
            {isLoadingMore ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {tr(`عرض المزيد (${totalAlterations - alterations.length})`, `Show more (${totalAlterations - alterations.length})`)}
          </button>
        ) : null}
      </main>

      {/* زر الإضافة العائم على الهاتف */}
      {canCreate && <button
        type="button"
        onClick={handleAddNewAlteration}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-l from-pink-500 to-purple-500 px-5 text-[15px] font-bold text-white shadow-lg shadow-pink-500/30 sm:hidden"
      >
        <Plus className="h-5 w-5" />
        {tr('تعديل جديد', 'New alteration')}
      </button>}

      {/* الفلترة */}
      <BottomSheet
        open={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        title={tr('فلترة التعديلات', 'Filter alterations')}
        dir={isArabic ? 'rtl' : 'ltr'}
        footer={(
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <button
              type="button"
              onClick={() => setDraftFilters(DEFAULT_FILTERS)}
              className="h-12 rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-600"
            >
              {tr('إعادة ضبط', 'Reset')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(draftFilters)
                setShowFilterSheet(false)
              }}
              className="h-12 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 text-[15px] font-bold text-white shadow-sm"
            >
              {tr('عرض النتائج', 'Show results')}
            </button>
          </div>
        )}
      >
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-extrabold text-slate-700">{tr('الحالة', 'Status')}</h3>
            <div className="flex flex-wrap gap-2">
              {(['all', ...ALTERATION_STATUS_KEYS] as const).map(status => {
                const isSelected = draftFilters.status === status
                const label = status === 'all'
                  ? tr('الكل', 'All')
                  : (isArabic ? getAlterationStatusMeta(status).label.ar : getAlterationStatusMeta(status).label.en)
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setDraftFilters(previous => ({ ...previous, status }))}
                    className={`min-h-11 rounded-full border px-4 text-sm font-bold transition ${isSelected ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-extrabold text-slate-700">{tr('نوع التعديل', 'Alteration type')}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={draftFilters.type === 'all'}
                onClick={() => setDraftFilters(previous => ({ ...previous, type: 'all' }))}
                className={`min-h-11 rounded-full border px-4 text-sm font-bold transition ${draftFilters.type === 'all' ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {tr('الكل', 'All')}
              </button>
              {TYPE_KEYS.map(type => {
                const meta = ALTERATION_TYPE_META[type]
                const isSelected = draftFilters.type === type
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setDraftFilters(previous => ({ ...previous, type }))}
                    className={`min-h-11 rounded-full border px-4 text-sm font-bold transition ${isSelected ? meta.selected : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {isArabic ? meta.short.ar : meta.short.en}
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-extrabold text-slate-700">{tr('الترتيب', 'Sort')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'newest', label: tr('الأحدث أولاً', 'Newest first') },
                { key: 'due_soonest', label: tr('الأقرب موعداً', 'Soonest due') },
              ] as const).map(option => {
                const isSelected = draftFilters.sort === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setDraftFilters(previous => ({ ...previous, sort: option.key }))}
                    className={`min-h-12 rounded-2xl border px-3 text-sm font-bold transition ${isSelected ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={Boolean(deleteTarget)}
        title={tr(`حذف التعديل ${deleteTarget?.alteration_number || ''}؟`, `Delete alteration ${deleteTarget?.alteration_number || ''}?`)}
        message={tr(
          `سيُحذف طلب التعديل الخاص بـ ${deleteTarget?.client_name || 'الزبونة'} نهائياً ولا يمكن التراجع.`,
          'This alteration will be deleted permanently. This cannot be undone.'
        )}
        confirmLabel={tr('حذف نهائياً', 'Delete')}
        cancelLabel={tr('تراجع', 'Cancel')}
        busy={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Modals */}
      <OrderSearchModal
        isOpen={showOrderSearchModal}
        onClose={() => setShowOrderSearchModal(false)}
        onSelectOrder={handleSelectOrder}
      />

      {selectedOrderForAlteration ? (
        <AlterationStageModal
          isOpen
          order={selectedOrderForAlteration}
          onClose={() => setSelectedOrderForAlteration(null)}
          onSelect={handleSelectAlterationStage}
        />
      ) : null}
    </div>
  )
}
