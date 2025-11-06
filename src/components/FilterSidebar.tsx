'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useShopStore } from '@/store/shopStore'

interface FilterSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function FilterSidebar({ isOpen, onClose }: FilterSidebarProps) {
  const { products, filters, setFilters, resetFilters } = useShopStore()

  // حالة توسيع الأقسام
  const [expandedSections, setExpandedSections] = useState({
    category: true,
    price: true,
    colors: true,
    sizes: true
  })

  // فلاتر محلية مؤقتة (قبل التطبيق)
  const [tempFilters, setTempFilters] = useState(filters)

  // استخراج القيم الفريدة من المنتجات
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([])
  const [uniqueColors, setUniqueColors] = useState<string[]>([])
  const [uniqueSizes, setUniqueSizes] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000])

  // تحديث الفلاتر المؤقتة عند تغيير الفلاتر الفعلية
  useEffect(() => {
    setTempFilters(filters)
  }, [filters])

  useEffect(() => {
    // استخراج الفئات الفريدة
    const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[]
    setUniqueCategories(categories)

    // استخراج الألوان الفريدة
    const colors = Array.from(new Set(products.flatMap(p => p.colors || [])))
    setUniqueColors(colors)

    // استخراج المقاسات الفريدة
    const sizes = Array.from(new Set(products.flatMap(p => p.sizes || [])))
    setUniqueSizes(sizes)

    // حساب نطاق السعر
    const prices = products.map(p => p.price)
    const minPrice = Math.min(...prices, 0)
    const maxPrice = Math.max(...prices, 10000)
    setPriceRange([minPrice, maxPrice])
  }, [products])

  // دالة لتبديل توسيع القسم
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // دالة لحساب عدد المنتجات لكل فلتر (تفاعلية - تأخذ بعين الاعتبار الفلاتر المؤقتة الأخرى)
  const getProductCount = (filterType: string, value: string) => {
    return products.filter(product => {
      // تطبيق الفلاتر المؤقتة الأخرى (ما عدا الفلتر الحالي)

      // فلتر الفئة (دعم فئات متعددة) - مع فحص أمان
      const categories = Array.isArray(tempFilters.category) ? tempFilters.category : []
      if (filterType !== 'category' && categories.length > 0 && !categories.includes(product.category || '')) {
        return false
      }

      // فلتر السعر
      if (filterType !== 'price' && tempFilters.priceRange) {
        const [min, max] = tempFilters.priceRange
        if (product.price < min || product.price > max) {
          return false
        }
      }

      // فلتر الألوان
      if (filterType !== 'color' && tempFilters.colors.length > 0) {
        const hasMatchingColor = product.colors?.some(color =>
          tempFilters.colors.includes(color)
        )
        if (!hasMatchingColor) return false
      }

      // فلتر المقاسات
      if (filterType !== 'size' && tempFilters.sizes.length > 0) {
        const hasMatchingSize = product.sizes?.some(size =>
          tempFilters.sizes.includes(size)
        )
        if (!hasMatchingSize) return false
      }

      // التحقق من الفلتر الحالي
      if (filterType === 'category') {
        return product.category === value
      } else if (filterType === 'color') {
        return product.colors?.includes(value)
      } else if (filterType === 'size') {
        return product.sizes?.includes(value)
      }

      return false
    }).length
  }

  // دالة لتطبيق فلتر الفئة (محلياً) - دعم فئات متعددة
  const handleCategoryToggle = (category: string) => {
    setTempFilters(prev => {
      const currentCategories = Array.isArray(prev.category) ? prev.category : []
      const newCategories = currentCategories.includes(category)
        ? currentCategories.filter(c => c !== category)
        : [...currentCategories, category]
      return { ...prev, category: newCategories }
    })
  }

  // دعم لوحة المفاتيح للفئات
  const handleCategoryKeyDown = (e: React.KeyboardEvent, category: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCategoryToggle(category)
    }
  }

  // دعم لوحة المفاتيح للألوان
  const handleColorKeyDown = (e: React.KeyboardEvent, color: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleColorToggle(color)
    }
  }

  // دعم لوحة المفاتيح للمقاسات
  const handleSizeKeyDown = (e: React.KeyboardEvent, size: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSizeToggle(size)
    }
  }

  // دالة لتطبيق فلتر اللون (محلياً)
  const handleColorToggle = (color: string) => {
    setTempFilters(prev => {
      const newColors = prev.colors.includes(color)
        ? prev.colors.filter(c => c !== color)
        : [...prev.colors, color]
      return { ...prev, colors: newColors }
    })
  }

  // دالة لتطبيق فلتر المقاس (محلياً)
  const handleSizeToggle = (size: string) => {
    setTempFilters(prev => {
      const newSizes = prev.sizes.includes(size)
        ? prev.sizes.filter(s => s !== size)
        : [...prev.sizes, size]
      return { ...prev, sizes: newSizes }
    })
  }

  // دالة لتطبيق فلتر السعر (محلياً)
  const handlePriceChange = (min: number, max: number) => {
    setTempFilters(prev => ({ ...prev, priceRange: [min, max] }))
  }

  // دالة لتطبيق الفلاتر فعلياً
  const applyFilters = () => {
    setFilters(tempFilters)
    onClose() // إغلاق الـ sidebar على الهواتف
  }

  // دالة لإعادة تعيين الفلاتر
  const handleResetFilters = () => {
    resetFilters()
    setTempFilters({
      category: null,
      priceRange: null,
      colors: [],
      sizes: [],
      searchQuery: ''
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay للهواتف */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />

          {/* Sidebar */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 overflow-y-auto lg:static lg:w-64 lg:shadow-none lg:border-l lg:border-pink-100"
            dir="rtl"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-pink-100 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-800">الفلاتر</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetFilters}
                  className="p-2 hover:bg-pink-50 rounded-lg transition-colors duration-200"
                  aria-label="إعادة تعيين الفلاتر"
                >
                  <RotateCcw className="w-5 h-5 text-pink-600" />
                </button>
                <button
                  onClick={onClose}
                  className="lg:hidden p-2 hover:bg-pink-50 rounded-lg transition-colors duration-200"
                  aria-label="إغلاق الفلاتر"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Filters Content */}
            <div className="p-4 space-y-6">
              
              {/* فلتر الفئة */}
              <div className="border-b border-gray-200 pb-4">
                <button
                  onClick={() => toggleSection('category')}
                  className="w-full flex items-center justify-between mb-3"
                  aria-label="توسيع/طي قسم الفئات"
                >
                  <h3 className="text-base font-semibold text-gray-800">الفئة</h3>
                  {expandedSections.category ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </button>
                
                <AnimatePresence>
                  {expandedSections.category && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2"
                    >
                      {uniqueCategories.map(category => {
                        const categories = Array.isArray(tempFilters.category) ? tempFilters.category : []
                        return (
                          <label
                            key={category}
                            className="flex items-center justify-between cursor-pointer hover:bg-pink-50 p-2 rounded-lg transition-colors duration-200 focus-within:ring-2 focus-within:ring-pink-500"
                            onKeyDown={(e) => handleCategoryKeyDown(e, category)}
                            tabIndex={0}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={categories.includes(category)}
                                onChange={() => handleCategoryToggle(category)}
                                className="w-4 h-4 text-pink-600 focus:ring-pink-500 cursor-pointer rounded"
                                tabIndex={-1}
                              />
                              <span className="text-sm text-gray-700">{category}</span>
                            </div>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                              {getProductCount('category', category)}
                            </span>
                          </label>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* فلتر السعر */}
              <div className="border-b border-gray-200 pb-4">
                <button
                  onClick={() => toggleSection('price')}
                  className="w-full flex items-center justify-between mb-3"
                  aria-label="توسيع/طي قسم السعر"
                >
                  <h3 className="text-base font-semibold text-gray-800">السعر</h3>
                  {expandedSections.price ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </button>
                
                <AnimatePresence>
                  {expandedSections.price && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="من"
                          step="100"
                          min="0"
                          value={tempFilters.priceRange?.[0] || priceRange[0]}
                          onChange={(e) => handlePriceChange(
                            Number(e.target.value),
                            tempFilters.priceRange?.[1] || priceRange[1]
                          )}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                          aria-label="السعر الأدنى"
                        />
                        <span className="text-gray-500">-</span>
                        <input
                          type="number"
                          placeholder="إلى"
                          step="100"
                          min="0"
                          value={tempFilters.priceRange?.[1] || priceRange[1]}
                          onChange={(e) => handlePriceChange(
                            tempFilters.priceRange?.[0] || priceRange[0],
                            Number(e.target.value)
                          )}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                          aria-label="السعر الأعلى"
                        />
                      </div>
                      <div className="text-xs text-gray-500 text-center">
                        {priceRange[0]} - {priceRange[1]} ريال
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* فلتر الألوان */}
              <div className="border-b border-gray-200 pb-4">
                <button
                  onClick={() => toggleSection('colors')}
                  className="w-full flex items-center justify-between mb-3"
                  aria-label="توسيع/طي قسم الألوان"
                >
                  <h3 className="text-base font-semibold text-gray-800">الألوان</h3>
                  {expandedSections.colors ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </button>
                
                <AnimatePresence>
                  {expandedSections.colors && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2"
                    >
                      {uniqueColors.map(color => (
                        <label
                          key={color}
                          className="flex items-center justify-between cursor-pointer hover:bg-pink-50 p-2 rounded-lg transition-colors duration-200 focus-within:ring-2 focus-within:ring-pink-500"
                          onKeyDown={(e) => handleColorKeyDown(e, color)}
                          tabIndex={0}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={tempFilters.colors.includes(color)}
                              onChange={() => handleColorToggle(color)}
                              tabIndex={-1}
                              className="w-4 h-4 text-pink-600 focus:ring-pink-500 rounded"
                            />
                            <span className="text-sm text-gray-700">{color}</span>
                          </div>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {getProductCount('color', color)}
                          </span>
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* فلتر المقاسات */}
              <div className="pb-4">
                <button
                  onClick={() => toggleSection('sizes')}
                  className="w-full flex items-center justify-between mb-3"
                  aria-label="توسيع/طي قسم المقاسات"
                >
                  <h3 className="text-base font-semibold text-gray-800">المقاسات</h3>
                  {expandedSections.sizes ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </button>
                
                <AnimatePresence>
                  {expandedSections.sizes && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2"
                    >
                      {uniqueSizes.map(size => (
                        <label
                          key={size}
                          className="flex items-center justify-between cursor-pointer hover:bg-pink-50 p-2 rounded-lg transition-colors duration-200 focus-within:ring-2 focus-within:ring-pink-500"
                          onKeyDown={(e) => handleSizeKeyDown(e, size)}
                          tabIndex={0}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={tempFilters.sizes.includes(size)}
                              onChange={() => handleSizeToggle(size)}
                              tabIndex={-1}
                              className="w-4 h-4 text-pink-600 focus:ring-pink-500 rounded"
                            />
                            <span className="text-sm text-gray-700">{size}</span>
                          </div>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {getProductCount('size', size)}
                          </span>
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {/* زر تطبيق الفلاتر */}
            <div className="sticky bottom-0 bg-white border-t border-pink-100 p-4">
              <button
                onClick={applyFilters}
                className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-pink-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                تطبيق الفلاتر
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

