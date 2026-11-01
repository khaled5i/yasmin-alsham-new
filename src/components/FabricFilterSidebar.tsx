'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useFabricStore, fabricMatchesFilters, getFabricCategories, type FilterState } from '@/store/fabricStore'
import { getFabricStorefrontPricing } from '@/lib/fabric-display-pricing'
import { getFabricColorSwatch } from '@/lib/fabric-color-swatches'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// على الجوال تُعرض الألوان الأكثر انتشاراً أولاً، والبقية خلف «عرض كل الألوان»
const COLLAPSED_COLORS_COUNT = 15

interface FabricFilterSidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface PricePreset {
  label: string
  min: number
  max: number
}

/**
 * نطاقات سعر جاهزة من أرباع أسعار المتجر الفعلية (مقرّبة لأرقام سهلة)،
 * فتبقى متوازنة مهما تغيّرت الأسعار بدل أرقام ثابتة قد تفرغ.
 */
function buildPricePresets(prices: number[], bounds: [number, number]): PricePreset[] {
  if (prices.length < 6) return []
  const sorted = [...prices].sort((a, b) => a - b)
  const step = bounds[1] - bounds[0] > 300 ? 50 : 10
  const quantile = (q: number) => Math.round(sorted[Math.floor(q * (sorted.length - 1))] / step) * step
  const cuts = Array.from(new Set([quantile(0.25), quantile(0.5), quantile(0.75)]))
    .filter(cut => cut > bounds[0] && cut < bounds[1])
  if (cuts.length === 0) return []

  return [
    { label: `أقل من ${cuts[0]}`, min: 0, max: cuts[0] },
    ...cuts.slice(1).map((cut, i) => ({ label: `${cuts[i]} – ${cut}`, min: cuts[i], max: cut })),
    { label: `${cuts[cuts.length - 1]} فأكثر`, min: cuts[cuts.length - 1], max: bounds[1] },
  ]
}

function FilterSection({ title, hint, selectedCount, onClear, children }: {
  title: string
  hint?: string
  selectedCount: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <section className="border-b border-[#d8c5ae]/60 py-5 last:border-b-0">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#211b19]">
            {title}
            {selectedCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b1726] px-1.5 text-[11px] font-bold text-[#f6f0e8]">
                {selectedCount}
              </span>
            )}
          </h3>
          {hint && <p className="mt-0.5 text-xs text-[#211b19]/50">{hint}</p>}
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-[#6b1726] transition-colors hover:bg-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
          >
            مسح
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function OptionChip({ label, count, active, onClick }: {
  label: ReactNode
  count?: number
  active: boolean
  onClick: () => void
}) {
  // الخيار الذي لن يُظهر شيئاً مع بقية الفلاتر يُعطَّل، إلا إن كان مختاراً حتى يمكن إلغاؤه
  const isEmpty = count === 0 && !active
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isEmpty}
      aria-pressed={active}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] disabled:cursor-not-allowed disabled:opacity-40 ${active
        ? 'border-[#6b1726] bg-[#6b1726] text-[#f6f0e8] shadow-sm'
        : 'border-[#d8c5ae] bg-white text-[#211b19]/85 hover:border-[#6b1726] hover:text-[#6b1726]'
        }`}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{label}</span>
      {count != null && (
        <span className={`text-[11px] tabular-nums ${active ? 'text-[#f6f0e8]/70' : 'text-[#211b19]/40'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export default function FabricFilterSidebar({ isOpen, onClose }: FabricFilterSidebarProps) {
  const { fabrics, filters, setFilters, resetFilters } = useFabricStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dragControls = useDragControls()
  const shouldReduceMotion = useReducedMotion()

  // الصفحة تمرّر دالة إغلاق جديدة في كل رسم؛ الـref يمنع إعادة تشغيل التركيز مع كل حرف يُكتب
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // ورقة من الأسفل على الجوال، ودرج جانبي من sm فأكبر
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)')
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const [showAllColors, setShowAllColors] = useState(false)

  // قيم حقول السعر كنص (حتى يتمكن المستخدم من إفراغ الحقل)
  const [priceInputs, setPriceInputs] = useState({ min: '', max: '' })
  const priceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommittedPriceRef = useRef<string | null>(null)

  // الخيارات مرتبة بالأكثر انتشاراً في المتجر كله، فلا يتبدّل ترتيبها مع كل اختيار
  const { categoryOptions, colorOptions, priceBounds, pricePresets } = useMemo(() => {
    const categoryTotals = new Map<string, number>()
    const colorTotals = new Map<string, number>()
    const prices: number[] = []
    for (const fabric of fabrics) {
      for (const category of new Set(getFabricCategories(fabric).filter(Boolean))) {
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + 1)
      }
      for (const color of new Set((fabric.available_colors || []).filter(Boolean))) {
        colorTotals.set(color, (colorTotals.get(color) ?? 0) + 1)
      }
      const price = getFabricStorefrontPricing(fabric.price_per_meter, fabric.stock_quantity).amount
      if (price != null && price > 0) prices.push(price)
    }
    const byTotal = (totals: Map<string, number>) =>
      Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([value]) => value)
    const bounds: [number, number] = prices.length > 0
      ? [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))]
      : [0, 1000]
    return {
      categoryOptions: byTotal(categoryTotals),
      colorOptions: byTotal(colorTotals),
      priceBounds: bounds,
      pricePresets: buildPricePresets(prices, bounds),
    }
  }, [fabrics])

  // كم قماشاً سيظهر لكل خيار مع بقية الفلاتر الحالية — تُحسب فقط واللوحة مفتوحة
  const facets = useMemo(() => {
    const category = new Map<string, number>()
    const color = new Map<string, number>()
    const preset = new Map<string, number>()
    let results = 0
    if (!isOpen) return { category, color, preset, results }

    const withoutCategory: FilterState = { ...filters, category: [] }
    const withoutColors: FilterState = { ...filters, colors: [] }
    const withoutPrice: FilterState = { ...filters, priceRange: null }
    for (const fabric of fabrics) {
      if (fabricMatchesFilters(fabric, filters)) results++
      if (fabricMatchesFilters(fabric, withoutCategory)) {
        for (const value of new Set(getFabricCategories(fabric))) category.set(value, (category.get(value) ?? 0) + 1)
      }
      if (fabricMatchesFilters(fabric, withoutColors)) {
        for (const value of new Set(fabric.available_colors || [])) color.set(value, (color.get(value) ?? 0) + 1)
      }
      if (pricePresets.length > 0 && fabricMatchesFilters(fabric, withoutPrice)) {
        const price = getFabricStorefrontPricing(fabric.price_per_meter, fabric.stock_quantity).amount
        if (price == null) continue
        for (const { label, min, max } of pricePresets) {
          if (price >= min && price <= max) preset.set(label, (preset.get(label) ?? 0) + 1)
        }
      }
    }
    return { category, color, preset, results }
  }, [isOpen, fabrics, filters, pricePresets])

  // مزامنة حقول السعر مع الفلاتر عند تغييرها من الخارج (إعادة التعيين مثلاً)
  useEffect(() => {
    const min = filters.priceRange?.min
    const max = filters.priceRange?.max
    const key = `${min ?? ''}|${max ?? ''}`
    // تجاهل المزامنة الناتجة عن كتابة المستخدم نفسه حتى لا يُمسح ما يكتبه
    if (lastCommittedPriceRef.current === key) return
    setPriceInputs({
      min: min != null ? String(min) : '',
      max: max != null ? String(max) : ''
    })
  }, [filters.priceRange])

  // تنظيف مؤقّت السعر عند إزالة المكوّن
  useEffect(() => () => {
    if (priceTimerRef.current) clearTimeout(priceTimerRef.current)
  }, [])

  // منع تمرير الخلفية أثناء فتح اللوحة
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  // حبس التركيز + Escape + إعادة التركيز لزر الفتح
  useEffect(() => {
    if (!isOpen) return

    const focusTarget = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(element => element.offsetParent !== null)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      focusTarget?.focus?.()
    }
  }, [isOpen])

  // إعادة تعيين الفلاتر
  const handleResetFilters = () => {
    if (priceTimerRef.current) clearTimeout(priceTimerRef.current)
    lastCommittedPriceRef.current = null
    setPriceInputs({ min: '', max: '' })
    resetFilters()
  }

  const toggleValue = (list: string[], value: string) =>
    list.includes(value) ? list.filter(item => item !== value) : [...list, value]

  const setPriceRange = (range: FilterState['priceRange']) => {
    if (priceTimerRef.current) clearTimeout(priceTimerRef.current)
    lastCommittedPriceRef.current = null
    setFilters({ priceRange: range })
  }

  // معالج تغيير نطاق السعر - يُطبَّق تلقائياً بعد توقّف الكتابة
  const handlePriceChange = (field: 'min' | 'max', value: string) => {
    const next = { ...priceInputs, [field]: value }
    setPriceInputs(next)

    if (priceTimerRef.current) clearTimeout(priceTimerRef.current)
    priceTimerRef.current = setTimeout(() => {
      const hasMin = next.min.trim() !== ''
      const hasMax = next.max.trim() !== ''

      if (!hasMin && !hasMax) {
        lastCommittedPriceRef.current = '|'
        setFilters({ priceRange: null })
        return
      }

      const min = hasMin ? Number(next.min) : 0
      const max = hasMax ? Number(next.max) : priceBounds[1]
      if (Number.isNaN(min) || Number.isNaN(max)) return

      lastCommittedPriceRef.current = `${min}|${max}`
      setFilters({ priceRange: { min, max } })
    }, 450)
  }

  // سحب الورقة للأسفل يغلقها (الجوال فقط، ومن المقبض أو الترويسة)
  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose()
  }

  const activePreset = filters.priceRange
    ? pricePresets.find(({ min, max }) => min === filters.priceRange?.min && max === filters.priceRange?.max)
    : undefined
  const priceLabel = filters.priceRange
    ? `السعر: ${activePreset?.label ?? `${filters.priceRange.min} – ${filters.priceRange.max}`}`
    : ''
  const searchQuery = filters.searchQuery.trim()

  // عدد الفلاتر المفعّلة (للعرض في الترويسة)
  const activeFiltersCount =
    filters.category.length +
    filters.colors.length +
    (filters.priceRange ? 1 : 0)
  const hasAnyFilter = activeFiltersCount > 0 || searchQuery !== ''

  const visibleColors = showAllColors || colorOptions.length <= COLLAPSED_COLORS_COUNT + 3
    ? colorOptions
    : Array.from(new Set([...colorOptions.slice(0, COLLAPSED_COLORS_COUNT), ...filters.colors.filter(c => colorOptions.includes(c))]))

  const panelMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : isDesktop
      ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-[60] bg-[#2f0c14]/55 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ورقة الفلاتر: من الأسفل على الجوال، ومن اليمين على الشاشات الأكبر */}
          <motion.div
            ref={panelRef}
            {...panelMotion}
            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', damping: 32, stiffness: 320 }}
            drag={!isDesktop && !shouldReduceMotion ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] flex-col rounded-t-[28px] bg-[#fbf8f3] shadow-[0_-12px_40px_-12px_rgba(47,12,20,0.45)] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-[28px] sm:shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fabric-filters-title"
          >
            {/* المقبض + الترويسة: منطقة السحب على الجوال */}
            <div
              className="shrink-0 touch-none select-none sm:touch-auto"
              onPointerDown={(event) => {
                if (isDesktop || (event.target as HTMLElement).closest('button')) return
                dragControls.start(event)
              }}
            >
              <div className="flex justify-center pb-1 pt-3 sm:hidden" aria-hidden="true">
                <span className="h-1.5 w-11 rounded-full bg-[#d8c5ae]" />
              </div>
              <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1 sm:pt-6">
                <h2 id="fabric-filters-title" className="flex items-center gap-2.5 text-lg font-bold text-[#211b19]">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#6b1726]/10 text-[#6b1726]">
                    <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  تصفية الأقمشة
                </h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f0e8] text-[#211b19]/70 transition-colors hover:bg-[#efe5d8] hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                  aria-label="إغلاق الفلاتر"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* ما هو مفعّل الآن — كل شريحة تُزال بلمسة */}
            {hasAnyFilter && (
              <div className="shrink-0 border-b border-[#d8c5ae]/60 pb-3">
                <div className="flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="list" aria-label="الفلاتر المفعّلة">
                  {searchQuery && (
                    <ActiveChip label={searchQuery} icon={<Search className="h-3 w-3" aria-hidden="true" />} onRemove={() => setFilters({ searchQuery: '' })} />
                  )}
                  {filters.category.map(category => (
                    <ActiveChip key={`c-${category}`} label={category} onRemove={() => setFilters({ category: toggleValue(filters.category, category) })} />
                  ))}
                  {filters.colors.map(color => (
                    <ActiveChip
                      key={`k-${color}`}
                      label={color}
                      icon={<span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: getFabricColorSwatch(color).background }} aria-hidden="true" />}
                      onRemove={() => setFilters({ colors: toggleValue(filters.colors, color) })}
                    />
                  ))}
                  {filters.priceRange && (
                    <ActiveChip label={priceLabel} onRemove={() => setPriceRange(null)} />
                  )}
                </div>
              </div>
            )}

            {/* محتوى الفلاتر - تُطبَّق تلقائياً، وزر الأسفل يعرض النتيجة */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
              {categoryOptions.length > 0 && (
                <FilterSection
                  title="الفئة"
                  selectedCount={filters.category.length}
                  onClear={() => setFilters({ category: [] })}
                >
                  <div className="flex flex-wrap gap-2">
                    {categoryOptions.map(category => (
                      <OptionChip
                        key={category}
                        label={category}
                        count={facets.category.get(category) ?? 0}
                        active={filters.category.includes(category)}
                        onClick={() => setFilters({ category: toggleValue(filters.category, category) })}
                      />
                    ))}
                  </div>
                </FilterSection>
              )}

              {colorOptions.length > 0 && (
                <FilterSection
                  title="اللون"
                  selectedCount={filters.colors.length}
                  onClear={() => setFilters({ colors: [] })}
                >
                  <div className="grid grid-cols-5 gap-x-1 gap-y-3">
                    {visibleColors.map(color => {
                      const swatch = getFabricColorSwatch(color)
                      const active = filters.colors.includes(color)
                      const count = facets.color.get(color) ?? 0
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFilters({ colors: toggleValue(filters.colors, color) })}
                          disabled={count === 0 && !active}
                          aria-pressed={active}
                          aria-label={`${color}، ${count} قماش`}
                          className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <span
                            className={`relative flex h-10 w-10 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(33,27,25,0.12)] transition-transform duration-200 ${active
                              ? 'scale-105 ring-2 ring-[#6b1726] ring-offset-2 ring-offset-[#fbf8f3]'
                              : 'group-enabled:group-hover:scale-105'
                              }`}
                            style={{ background: swatch.background }}
                          >
                            {active && (
                              <Check className={`h-4 w-4 ${swatch.isLight ? 'text-[#211b19]' : 'text-white'}`} strokeWidth={3} aria-hidden="true" />
                            )}
                          </span>
                          <span className={`w-full truncate text-center text-[12px] leading-tight ${active ? 'font-bold text-[#6b1726]' : 'text-[#211b19]/75'}`}>
                            {color}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {visibleColors.length < colorOptions.length || showAllColors ? (
                    <button
                      type="button"
                      onClick={() => setShowAllColors(prev => !prev)}
                      className="mx-auto mt-4 flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#6b1726] transition-colors hover:bg-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                      aria-expanded={showAllColors}
                    >
                      {showAllColors ? 'عرض ألوان أقل' : `عرض كل الألوان (${colorOptions.length})`}
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAllColors ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  ) : null}
                </FilterSection>
              )}

              <FilterSection
                title="السعر"
                hint="سعر المتر بالريال، شامل الضريبة"
                selectedCount={filters.priceRange ? 1 : 0}
                onClear={() => setPriceRange(null)}
              >
                {pricePresets.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {pricePresets.map(preset => (
                      <OptionChip
                        key={preset.label}
                        label={preset.label}
                        count={facets.preset.get(preset.label) ?? 0}
                        active={activePreset?.label === preset.label}
                        onClick={() => setPriceRange(activePreset?.label === preset.label ? null : { min: preset.min, max: preset.max })}
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <PriceInput
                    label="من"
                    placeholder={String(priceBounds[0])}
                    value={priceInputs.min}
                    onChange={(value) => handlePriceChange('min', value)}
                    ariaLabel="السعر الأدنى"
                  />
                  <span className="h-px w-3 shrink-0 bg-[#211b19]/30" aria-hidden="true" />
                  <PriceInput
                    label="إلى"
                    placeholder={String(priceBounds[1])}
                    value={priceInputs.max}
                    onChange={(value) => handlePriceChange('max', value)}
                    ariaLabel="السعر الأعلى"
                  />
                </div>
              </FilterSection>
            </div>

            {/* الأسفل: مسح الكل + عرض النتائج */}
            <div className="shrink-0 border-t border-[#d8c5ae]/70 bg-[#fbf8f3] px-5 py-3.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  disabled={!hasAnyFilter}
                  className="h-12 shrink-0 rounded-2xl border border-[#d8c5ae] bg-white px-5 text-sm font-semibold text-[#211b19]/80 transition-colors hover:border-[#6b1726] hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#d8c5ae] disabled:hover:text-[#211b19]/80"
                >
                  مسح الكل
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-12 flex-1 rounded-2xl bg-[#6b1726] px-4 text-[15px] font-bold text-[#f6f0e8] shadow-[0_8px_20px_-8px_rgba(107,23,38,0.7)] transition-colors hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b99a68]/40"
                  aria-live="polite"
                >
                  {facets.results > 0 ? `عرض النتائج (${facets.results})` : 'لا توجد نتائج'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function ActiveChip({ label, icon, onRemove }: { label: string; icon?: ReactNode; onRemove: () => void }) {
  return (
    <span role="listitem" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#6b1726]/[0.08] pl-1 pr-3 text-[12.5px] font-medium text-[#6b1726]">
      {icon}
      <span className="max-w-[10rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-[#6b1726]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
        aria-label={`إزالة ${label}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}

function PriceInput({ label, placeholder, value, onChange, ariaLabel }: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[#d8c5ae] bg-white px-3.5 transition-colors focus-within:border-[#6b1726] focus-within:ring-4 focus-within:ring-[#b99a68]/20">
      <span className="shrink-0 text-xs font-medium text-[#211b19]/50">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        step="10"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-[15px] font-semibold text-[#211b19] tabular-nums placeholder:font-normal placeholder:text-[#211b19]/30 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={ariaLabel}
      />
      <span className="shrink-0 text-xs text-[#211b19]/45">ر.س</span>
    </label>
  )
}
