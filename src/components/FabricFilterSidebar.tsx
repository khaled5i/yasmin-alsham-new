'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useFabricStore } from '@/store/fabricStore'
import { getFabricDisplayPricing } from '@/lib/fabric-display-pricing'

interface FabricFilterSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function FabricFilterSidebar({ isOpen, onClose }: FabricFilterSidebarProps) {
  const { fabrics, filters, setFilters, resetFilters } = useFabricStore()

  // حالة توسيع الأقسام
  const [expandedSections, setExpandedSections] = useState({
    category: true,
    colors: true,
    price: true
  })

  // نطاق السعر المتاح (min, max) المحسوب من الأقمشة
  const [priceBounds, setPriceBounds] = useState<[number, number]>([0, 1000])

  // قيم حقول السعر كنص (حتى يتمكن المستخدم من إفراغ الحقل)
  const [priceInputs, setPriceInputs] = useState({ min: '', max: '' })
  const priceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommittedPriceRef = useRef<string | null>(null)

  // استخراج القيم الفريدة من الأقمشة
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([])
  const [uniqueColors, setUniqueColors] = useState<string[]>([])

  // حساب نطاق السعر من الأقمشة
  useEffect(() => {
    if (fabrics.length > 0) {
      const prices = fabrics
        .map(f => getFabricDisplayPricing(f.price_per_meter, f.stock_quantity).amount)
        .filter((price): price is number => price != null)
      const minPrice = Math.min(...prices, 0)
      const maxPrice = Math.max(...prices, 1000)
      setPriceBounds([minPrice, maxPrice])
    }
  }, [fabrics])

  useEffect(() => {
    // استخراج الفئات الفريدة
    const categories = Array.from(new Set(fabrics.flatMap(fabric =>
      fabric.categories?.length ? fabric.categories : [fabric.category]
    ).filter(Boolean))) as string[]
    setUniqueCategories(categories)

    // استخراج الألوان الفريدة
    const colors = Array.from(new Set(fabrics.flatMap(f => f.available_colors || [])))
    setUniqueColors(colors)
  }, [fabrics])

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

  // دالة لتبديل توسيع القسم
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // إعادة تعيين الفلاتر
  const handleResetFilters = () => {
    if (priceTimerRef.current) clearTimeout(priceTimerRef.current)
    lastCommittedPriceRef.current = null
    setPriceInputs({ min: '', max: '' })
    resetFilters()
  }

  // معالج تغيير الفئة - يُطبَّق فوراً
  const handleCategoryChange = (category: string, checked: boolean) => {
    const newCategories = checked
      ? [...filters.category, category]
      : filters.category.filter(c => c !== category)
    setFilters({ category: newCategories })
  }

  // معالج تغيير اللون - يُطبَّق فوراً
  const handleColorChange = (color: string, checked: boolean) => {
    const newColors = checked
      ? [...filters.colors, color]
      : filters.colors.filter(c => c !== color)
    setFilters({ colors: newColors })
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

      const min = hasMin ? Number(next.min) : priceBounds[0]
      const max = hasMax ? Number(next.max) : priceBounds[1]
      if (Number.isNaN(min) || Number.isNaN(max)) return

      lastCommittedPriceRef.current = `${min}|${max}`
      setFilters({ priceRange: { min, max } })
    }, 450)
  }

  // عدد الفلاتر المفعّلة (للعرض في الترويسة)
  const activeFiltersCount =
    filters.category.length +
    filters.colors.length +
    (filters.priceRange ? 1 : 0)

  // محتوى أقسام الفلاتر
  const renderFilterSections = () => (
    <>
      {/* فلتر الفئة */}
      <div className="border-b border-[#d8c5ae]/70 pb-4">
        <button
          onClick={() => toggleSection('category')}
          className="flex items-center justify-between w-full py-2 text-right"
          aria-expanded={expandedSections.category}
        >
          <h4 className="font-semibold text-[#211b19]/80">الفئة</h4>
          {expandedSections.category ? (
            <ChevronUp className="w-5 h-5 text-[#211b19]/55" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#211b19]/55" />
          )}
        </button>
        {expandedSections.category && (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 max-h-64 overflow-y-auto">
              {uniqueCategories.map(category => (
                <label
                  key={category}
                  title={category}
                  className="flex items-center gap-2 cursor-pointer hover:bg-[#f6f0e8] px-2 py-2 rounded-lg transition-colors duration-200 min-w-0"
                >
                  <input
                    type="checkbox"
                    checked={filters.category.includes(category)}
                    onChange={(e) => handleCategoryChange(category, e.target.checked)}
                    className="w-4 h-4 shrink-0 text-[#6b1726] focus:ring-[#b99a68] rounded border-[#d8c5ae]"
                  />
                  <span className="text-sm text-[#211b19]/80 truncate">{category}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* فلتر الألوان */}
      <div className="border-b border-[#d8c5ae]/70 pb-4">
        <button
          onClick={() => toggleSection('colors')}
          className="flex items-center justify-between w-full py-2 text-right"
          aria-expanded={expandedSections.colors}
        >
          <h4 className="font-semibold text-[#211b19]/80">الألوان المتاحة</h4>
          {expandedSections.colors ? (
            <ChevronUp className="w-5 h-5 text-[#211b19]/55" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#211b19]/55" />
          )}
        </button>
        {expandedSections.colors && (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 max-h-64 overflow-y-auto">
              {uniqueColors.map(color => (
                <label
                  key={color}
                  title={color}
                  className="flex items-center gap-2 cursor-pointer hover:bg-[#f6f0e8] px-2 py-2 rounded-lg transition-colors duration-200 min-w-0"
                >
                  <input
                    type="checkbox"
                    checked={filters.colors.includes(color)}
                    onChange={(e) => handleColorChange(color, e.target.checked)}
                    className="w-4 h-4 shrink-0 text-[#6b1726] focus:ring-[#b99a68] rounded border-[#d8c5ae]"
                  />
                  <span className="text-sm text-[#211b19]/80 truncate">{color}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* فلتر السعر */}
      <div className="pb-2">
        <button
          onClick={() => toggleSection('price')}
          className="w-full flex items-center justify-between py-2 text-right"
          aria-label="توسيع/طي قسم السعر"
          aria-expanded={expandedSections.price}
        >
          <h4 className="font-semibold text-[#211b19]/80">السعر</h4>
          {expandedSections.price ? (
            <ChevronUp className="w-5 h-5 text-[#211b19]/55" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#211b19]/55" />
          )}
        </button>

        {expandedSections.price && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="من"
                step="10"
                min="0"
                value={priceInputs.min}
                onChange={(e) => handlePriceChange('min', e.target.value)}
                className="w-full px-3 py-2 border border-[#d8c5ae] rounded-lg bg-[#fbf8f3] focus:ring-2 focus:ring-[#b99a68] focus:border-[#6b1726] text-sm"
                aria-label="السعر الأدنى"
              />
              <span className="text-[#211b19]/55">-</span>
              <input
                type="number"
                placeholder="إلى"
                step="10"
                min="0"
                value={priceInputs.max}
                onChange={(e) => handlePriceChange('max', e.target.value)}
                className="w-full px-3 py-2 border border-[#d8c5ae] rounded-lg bg-[#fbf8f3] focus:ring-2 focus:ring-[#b99a68] focus:border-[#6b1726] text-sm"
                aria-label="السعر الأعلى"
              />
            </div>
            <div className="text-xs text-[#211b19]/55 text-center">
              {priceBounds[0]} - {priceBounds[1]} ريال حسب السعر المعروض
            </div>
          </div>
        )}
      </div>
    </>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[#2f0c14]/55 z-40"
            onClick={onClose}
          />

          {/* لوحة الفلاتر - تعمل على الجوال وسطح المكتب */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-80 sm:w-96 max-w-[90vw] bg-[#fbf8f3] shadow-2xl z-50 overflow-y-auto"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-label="الفلاتر"
          >
            <div className="p-6">
              {/* الترويسة */}
              <div className="flex items-center justify-between pb-4 border-b-2 border-[#d8c5ae]/60 mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-[#211b19]">الفلاتر</h3>
                  {activeFiltersCount > 0 && (
                    <span className="bg-[#6b1726] text-[#f6f0e8] text-xs font-bold rounded-full px-2 py-0.5">
                      {activeFiltersCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetFilters}
                    className="text-[#6b1726] hover:text-[#2f0c14] transition-colors duration-200 p-2 hover:bg-[#f6f0e8] rounded-lg"
                    aria-label="إعادة تعيين الفلاتر"
                    title="إعادة تعيين الفلاتر"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="text-[#211b19]/55 hover:text-[#6b1726] transition-colors duration-200 p-2 hover:bg-[#f6f0e8] rounded-lg"
                    aria-label="إغلاق"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* محتوى الفلاتر - تُطبَّق تلقائياً بدون زر */}
              <div className="space-y-4">{renderFilterSections()}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
