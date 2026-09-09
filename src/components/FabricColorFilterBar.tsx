'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useFabricStore } from '@/store/fabricStore'

// لوحة الألوان الظاهرة في الشريط العائم
// aliases = الكلمات التي نبحث عنها داخل ألوان القماش المخزّنة (بعد التطبيع)
const COLOR_SWATCHES: { key: string; label: string; hex: string; ring: string; aliases: string[] }[] = [
  { key: 'black', label: 'أسود', hex: '#1c1a19', ring: '#1c1a19', aliases: ['اسود', 'سوداء', 'black'] },
  { key: 'red', label: 'أحمر', hex: '#b3202e', ring: '#b3202e', aliases: ['احمر', 'حمراء', 'red'] },
  { key: 'yellow', label: 'أصفر', hex: '#e5c13f', ring: '#b99a68', aliases: ['اصفر', 'صفراء', 'yellow'] },
  { key: 'beige', label: 'بيج', hex: '#d8c5ae', ring: '#b99a68', aliases: ['بيج', 'بيچ', 'beige'] },
  { key: 'pink', label: 'وردي', hex: '#e6a2b6', ring: '#c97e96', aliases: ['وردي', 'ورديه', 'زهري', 'روز', 'بينك', 'pink'] },
]

// تطبيع اسم اللون: إزالة التشكيل وتوحيد الألف والهاء وحذف الفراغات
const normalizeColor = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s\-_/،,]/g, '')

export default function FabricColorFilterBar() {
  const { fabrics, filters, setFilters } = useFabricStore()

  // ربط كل لون في الشريط بأسماء الألوان الفعلية المخزّنة في الأقمشة
  const swatchMatches = useMemo(() => {
    const uniqueColors = Array.from(
      new Set(fabrics.flatMap(fabric => fabric.available_colors || []).filter(Boolean))
    )
    const normalized = uniqueColors.map(color => ({ color, normalized: normalizeColor(color) }))

    return COLOR_SWATCHES.reduce<Record<string, string[]>>((acc, swatch) => {
      acc[swatch.key] = normalized
        .filter(entry => swatch.aliases.some(alias => entry.normalized.includes(alias)))
        .map(entry => entry.color)
      return acc
    }, {})
  }, [fabrics])

  const isSwatchActive = (key: string) =>
    (swatchMatches[key] || []).some(color => filters.colors.includes(color))

  const hasActiveSwatch = COLOR_SWATCHES.some(swatch => isSwatchActive(swatch.key))

  const toggleSwatch = (key: string) => {
    const matches = swatchMatches[key] || []
    if (matches.length === 0) return

    const newColors = isSwatchActive(key)
      ? filters.colors.filter(color => !matches.includes(color))
      : Array.from(new Set([...filters.colors, ...matches]))

    setFilters({ colors: newColors })
  }

  // إزالة ألوان الشريط فقط دون المساس ببقية الفلاتر
  const clearSwatches = () => {
    const barColors = new Set(COLOR_SWATCHES.flatMap(swatch => swatchMatches[swatch.key] || []))
    setFilters({ colors: filters.colors.filter(color => !barColors.has(color)) })
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3 sm:bottom-5">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        dir="rtl"
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-[#d8c5ae] bg-[#fbf8f3]/95 px-3 py-2 shadow-[0_10px_30px_-10px_rgba(47,12,20,0.45)] backdrop-blur-md sm:gap-3 sm:px-5 sm:py-2.5"
        role="group"
        aria-label="تسوقي بحسب اللون"
      >
        <span className="shrink-0 whitespace-nowrap text-base font-semibold text-[#6b1726] sm:text-xl">
          تسوقي بحسب اللون :
        </span>

        <div
          className="flex items-center gap-1 overflow-x-auto py-0.5 sm:gap-1.5 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {COLOR_SWATCHES.map(swatch => {
            const matches = swatchMatches[swatch.key] || []
            const isAvailable = matches.length > 0
            const isActive = isSwatchActive(swatch.key)
            return (
              <button
                key={swatch.key}
                type="button"
                onClick={() => toggleSwatch(swatch.key)}
                disabled={!isAvailable}
                aria-pressed={isActive}
                aria-label={`تصفية حسب اللون ${swatch.label}`}
                title={isAvailable ? swatch.label : `${swatch.label} - غير متوفر حالياً`}
                className={`group relative flex shrink-0 items-center justify-center rounded-full p-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] sm:p-2 ${
                  isAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-35'
                }`}
              >
                <span
                  className={`block h-[18px] w-[18px] rounded-full border transition-all duration-300 sm:h-5 sm:w-5 ${
                    isActive
                      ? 'scale-110 ring-2 ring-[#6b1726] ring-offset-2 ring-offset-[#fbf8f3]'
                      : 'border-[#d8c5ae] group-hover:scale-110'
                  }`}
                  style={{ backgroundColor: swatch.hex, borderColor: isActive ? swatch.ring : undefined }}
                />
                <span className="sr-only">{swatch.label}</span>
              </button>
            )
          })}
        </div>

        {hasActiveSwatch && (
          <button
            type="button"
            onClick={clearSwatches}
            className="shrink-0 rounded-full p-1.5 text-[#6b1726] transition-colors duration-200 hover:bg-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
            aria-label="إلغاء تصفية الألوان"
            title="إلغاء تصفية الألوان"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    </div>
  )
}
