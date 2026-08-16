'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpDown, Check, Sparkles, TrendingUp, TrendingDown, Star, AlignLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useFabricStore, SortOption } from '@/store/fabricStore'

export default function FabricSortOptions() {
  const { sortBy, setSortBy } = useFabricStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // خيارات الترتيب مع أيقونات Lucide React
  const sortOptions: { value: SortOption; label: string; Icon: LucideIcon }[] = [
    { value: 'newest', label: 'الأحدث أولاً', Icon: Sparkles },
    { value: 'price-high', label: 'الأعلى سعراً', Icon: TrendingUp },
    { value: 'price-low', label: 'الأقل سعراً', Icon: TrendingDown },
    { value: 'popular', label: 'الأكثر مبيعاً', Icon: Star },
    { value: 'name', label: 'الاسم: أ-ي', Icon: AlignLeft }
  ]

  // الحصول على التسمية الحالية
  const currentLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'الأحدث أولاً'

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // تطبيق الترتيب
  const handleSortChange = (option: SortOption) => {
    setSortBy(option)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className="relative" dir="rtl">
      {/* Sort Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#f6f0e8] border-2 border-[#d8c5ae] rounded-xl hover:border-[#6b1726] hover:shadow-md transition-all duration-300 text-[#211b19] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
        aria-label="خيارات الترتيب"
        aria-expanded={isOpen}
      >
        <ArrowUpDown className="w-5 h-5 text-[#6b1726]" />
        <span className="text-sm">{currentLabel}</span>
        <svg
          className={`w-4 h-4 text-[#6b1726] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 right-0 w-56 bg-[#fbf8f3] border-2 border-[#d8c5ae] rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-2">
              <div className="text-xs text-[#211b19]/60 px-3 py-2 font-medium border-b border-[#d8c5ae]/60 mb-1">
                ترتيب حسب
              </div>
              
              {sortOptions.map((option) => {
                const IconComponent = option.Icon
                return (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      sortBy === option.value
                        ? 'bg-[#f6f0e8] text-[#6b1726] font-semibold'
                        : 'hover:bg-[#f6f0e8] text-[#211b19]/80'
                    }`}
                    aria-label={option.label}
                  >
                    <div className="flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${
                        sortBy === option.value ? 'text-[#6b1726]' : 'text-[#211b19]/55'
                      }`} />
                      <span className="text-sm">{option.label}</span>
                    </div>

                    {sortBy === option.value && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      >
                        <Check className="w-5 h-5 text-[#6b1726]" />
                      </motion.div>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
