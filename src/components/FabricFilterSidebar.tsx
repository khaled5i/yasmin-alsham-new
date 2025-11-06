'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useFabricStore } from '@/store/fabricStore'

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
    availability: true,
    priceRange: true
  })

  // فلاتر محلية مؤقتة (قبل التطبيق)
  const [tempFilters, setTempFilters] = useState(filters)

  // استخراج القيم الفريدة من الأقمشة
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([])
  const [uniqueColors, setUniqueColors] = useState<string[]>([])

  // تحديث الفلاتر المؤقتة عند تغيير الفلاتر الفعلية
  useEffect(() => {
    setTempFilters(filters)
  }, [filters])

  useEffect(() => {
    // استخراج الفئات الفريدة
    const categories = Array.from(new Set(fabrics.map(f => f.category).filter(Boolean))) as string[]
    setUniqueCategories(categories)

    // استخراج الألوان الفريدة
    const colors = Array.from(new Set(fabrics.flatMap(f => f.available_colors || [])))
    setUniqueColors(colors)
  }, [fabrics])

  // دالة لتبديل توسيع القسم
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // تطبيق الفلاتر
  const applyFilters = () => {
    setFilters(tempFilters)
    onClose()
  }

  // إعادة تعيين الفلاتر
  const handleResetFilters = () => {
    resetFilters()
    setTempFilters({
      category: [],
      priceRange: null,
      colors: [],
      searchQuery: '',
      availability: 'all'
    })
  }

  // معالج تغيير الفئة
  const handleCategoryChange = (category: string, checked: boolean) => {
    const newCategories = checked
      ? [...tempFilters.category, category]
      : tempFilters.category.filter(c => c !== category)
    setTempFilters({ ...tempFilters, category: newCategories })
  }

  // معالج تغيير اللون
  const handleColorChange = (color: string, checked: boolean) => {
    const newColors = checked
      ? [...tempFilters.colors, color]
      : tempFilters.colors.filter(c => c !== color)
    setTempFilters({ ...tempFilters, colors: newColors })
  }

  // معالج تغيير التوفر
  const handleAvailabilityChange = (checked: boolean) => {
    setTempFilters({ ...tempFilters, availability: checked ? 'available' : 'all' })
  }

  // معالج تغيير نطاق السعر
  const handlePriceRangeChange = (maxPrice: number) => {
    setTempFilters({ ...tempFilters, priceRange: { min: 0, max: maxPrice } })
  }

  // حساب أعلى سعر من الأقمشة
  const maxFabricPrice = Math.max(...fabrics.map(f => f.price_per_meter || 0), 1000)

  // محتوى أقسام الفلاتر (بدون Header)
  const renderFilterSections = () => (
    <>
      {/* فلتر الفئة */}
      <div>
        <button
          onClick={() => toggleSection('category')}
          className="flex items-center justify-between w-full py-2 text-right"
        >
          <h4 className="font-semibold text-gray-700">الفئة</h4>
          {expandedSections.category ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        {expandedSections.category && (
          <div className="mt-3">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uniqueCategories.map(category => (
                <label
                  key={category}
                  className="flex items-center gap-2 cursor-pointer hover:bg-pink-50 p-2 rounded-lg transition-colors duration-200"
                >
                  <input
                    type="checkbox"
                    checked={tempFilters.category.includes(category)}
                    onChange={(e) => handleCategoryChange(category, e.target.checked)}
                    className="w-4 h-4 text-pink-600 focus:ring-pink-500 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{category}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* فلتر الألوان */}
      <div>
        <button
          onClick={() => toggleSection('colors')}
          className="flex items-center justify-between w-full py-2 text-right"
        >
          <h4 className="font-semibold text-gray-700">الألوان المتاحة</h4>
          {expandedSections.colors ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        {expandedSections.colors && (
          <div className="mt-3">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uniqueColors.map(color => (
                <label
                  key={color}
                  className="flex items-center gap-2 cursor-pointer hover:bg-pink-50 p-2 rounded-lg transition-colors duration-200"
                >
                  <input
                    type="checkbox"
                    checked={tempFilters.colors.includes(color)}
                    onChange={(e) => handleColorChange(color, e.target.checked)}
                    className="w-4 h-4 text-pink-600 focus:ring-pink-500 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{color}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* فلتر التوفر */}
      <div>
        <button
          onClick={() => toggleSection('availability')}
          className="flex items-center justify-between w-full py-2 text-right"
        >
          <h4 className="font-semibold text-gray-700">التوفر</h4>
          {expandedSections.availability ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        {expandedSections.availability && (
          <div className="mt-3">
            <label className="flex items-center gap-2 cursor-pointer hover:bg-pink-50 p-2 rounded-lg transition-colors duration-200">
              <input
                type="checkbox"
                checked={tempFilters.availability === 'available'}
                onChange={(e) => handleAvailabilityChange(e.target.checked)}
                className="w-4 h-4 text-pink-600 focus:ring-pink-500 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">المتوفر فقط</span>
            </label>
          </div>
        )}
      </div>

      {/* فلتر السعر */}
      <div>
        <button
          onClick={() => toggleSection('priceRange' as any)}
          className="flex items-center justify-between w-full text-right font-semibold text-gray-800 hover:text-pink-600 transition-colors duration-200"
        >
          <span>السعر</span>
          {(expandedSections as any).priceRange ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        {(expandedSections as any).priceRange && (
          <div className="mt-3 space-y-3">
            <input
              type="range"
              min="0"
              max={maxFabricPrice}
              step="10"
              value={tempFilters.priceRange?.max || maxFabricPrice}
              onChange={(e) => handlePriceRangeChange(Number(e.target.value))}
              className="w-full h-2 bg-pink-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
            />
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">من 0 ريال</span>
              <span className="font-semibold text-pink-600">
                إلى {tempFilters.priceRange?.max || maxFabricPrice} ريال
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  )

  // عرض الفلاتر على الشاشات الكبيرة (Sidebar)
  if (isOpen === true && onClose.toString() === '() => {}') {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-pink-100 shadow-lg">
        {/* Header للـ Sidebar */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-pink-100 mb-6">
          <h3 className="text-xl font-bold text-gray-800">الفلاتر</h3>
          <button
            onClick={handleResetFilters}
            className="text-pink-600 hover:text-pink-700 transition-colors duration-200 p-2 hover:bg-pink-50 rounded-lg"
            aria-label="إعادة تعيين الفلاتر"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        {/* محتوى الفلاتر */}
        <div className="space-y-6">{renderFilterSections()}</div>
      </div>
    )
  }

  // عرض الفلاتر على الهواتف (Modal)
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
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />

          {/* Sidebar Modal */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 lg:hidden overflow-y-auto"
            dir="rtl"
          >
            <div className="p-6">
              {/* Header للنافذة المنبثقة */}
              <div className="flex items-center justify-between pb-4 border-b-2 border-pink-100 mb-6">
                <h3 className="text-xl font-bold text-gray-800">الفلاتر</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetFilters}
                    className="text-pink-600 hover:text-pink-700 transition-colors duration-200 p-2 hover:bg-pink-50 rounded-lg"
                    aria-label="إعادة تعيين الفلاتر"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-pink-600 transition-colors duration-200 p-2 hover:bg-pink-50 rounded-lg"
                    aria-label="إغلاق"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* محتوى الفلاتر بدون Header */}
              <div className="space-y-6">{renderFilterSections()}</div>

              {/* Apply Button */}
              <div className="mt-6 pt-6 border-t-2 border-pink-100">
                <button
                  onClick={applyFilters}
                  className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all duration-300"
                >
                  تطبيق الفلاتر
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

