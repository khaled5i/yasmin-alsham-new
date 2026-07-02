'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  Images,
  Layers,
  Calendar,
  Search,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getFabricSaleImages } from '@/lib/services/simple-accounting-service'
import type { Income } from '@/types/simple-accounting'

interface GalleryImage {
  url: string
  saleId: string
  label: string
  date: string
  amount: number
  source?: string | null
}

function ShekImagesContent() {
  const [sales, setSales] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await getFabricSaleImages('fabrics')
        setSales(data)
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('ar-SA-u-nu-latn').format(n) + ' ر.س'

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })

  // تصفية حسب البحث (اسم القماش / الوصف / المصدر)
  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sales
    return sales.filter((s) =>
      s.customer_name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.customer_source?.toLowerCase().includes(q)
    )
  }, [sales, searchQuery])

  // مصفوفة مسطّحة لكل الصور (للتنقل داخل العارض الكامل)
  const allImages = useMemo<GalleryImage[]>(() => {
    const list: GalleryImage[] = []
    for (const sale of filteredSales) {
      const label =
        sale.customer_name && sale.customer_name !== '-'
          ? sale.customer_name
          : sale.description || 'قماش شك'
      for (const url of sale.fabric_images ?? []) {
        list.push({
          url,
          saleId: sale.id,
          label,
          date: sale.date,
          amount: sale.amount,
          source: sale.customer_source
        })
      }
    }
    return list
  }, [filteredSales])

  const totalImages = allImages.length

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const showPrev = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i - 1 + allImages.length) % allImages.length))
  }, [allImages.length])
  const showNext = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i + 1) % allImages.length))
  }, [allImages.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') showNext()
      if (e.key === 'ArrowRight') showPrev()
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [lightboxIndex, closeLightbox, showNext, showPrev])

  const activeImage = lightboxIndex !== null ? allImages[lightboxIndex] : null

  // فهرس أول صورة لكل مبيعة داخل المصفوفة المسطّحة (لفتح العارض من الصورة الصحيحة)
  const flatIndexBySale = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const sale of filteredSales) {
      map.set(sale.id, idx)
      idx += (sale.fabric_images ?? []).length
    }
    return map
  }, [filteredSales])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/dashboard/accounting/fabrics/income"
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
                <Images className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">صور أقمشة الشك</h1>
                <p className="text-gray-500">جميع صور الأقمشة المرفوعة في فواتير المبيعات</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ملخص + بحث */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-bold text-purple-700">
              <Layers className="w-5 h-5" />
              <span>{totalImages} صورة</span>
              <span className="text-gray-300">•</span>
              <span className="text-gray-600">{filteredSales.length} مبيعة</span>
            </div>
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث باسم القماش أو المصدر..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
        </motion.div>

        {/* المحتوى */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
        ) : filteredSales.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Images className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">لا توجد صور أقمشة مرفوعة بعد</p>
            <p className="text-sm text-gray-400 mt-1">
              أضف صور القماش عند تسجيل مبيعة قماش "شك" من صفحة المبيعات
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredSales.map((sale, saleIdx) => {
              const label =
                sale.customer_name && sale.customer_name !== '-'
                  ? sale.customer_name
                  : sale.description || 'قماش شك'
              const baseIndex = flatIndexBySale.get(sale.id) ?? 0
              return (
                <motion.div
                  key={sale.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * saleIdx }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div>
                      <p className="font-bold text-gray-900">{label}</p>
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar className="w-3 h-3" />
                          {formatDate(sale.date)}
                        </span>
                        {sale.customer_source && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                            {sale.customer_source}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(sale.amount)}</p>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {(sale.fabric_images ?? []).map((url, imgIdx) => (
                      <button
                        key={`${sale.id}-${imgIdx}`}
                        type="button"
                        onClick={() => setLightboxIndex(baseIndex + imgIdx)}
                        className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 hover:opacity-90 transition-opacity"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`${label} - صورة ${imgIdx + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* العارض الكامل (Lightbox) */}
      <AnimatePresence>
        {activeImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm"
            onClick={closeLightbox}
          >
            <div className="relative h-full w-full flex items-center justify-center px-4 sm:px-8 py-16">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeLightbox() }}
                className="absolute top-4 right-4 w-11 h-11 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="absolute top-5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 text-white text-sm z-20">
                {(lightboxIndex ?? 0) + 1} / {totalImages}
              </div>

              {totalImages > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showNext() }}
                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showPrev() }}
                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img
                key={activeImage.url}
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                src={activeImage.url}
                alt={activeImage.label}
                className="max-w-full max-h-[calc(100vh-11rem)] object-contain rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />

              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/55 text-white text-center z-20 max-w-[90vw]">
                <p className="text-sm font-medium truncate">{activeImage.label}</p>
                <p className="text-xs text-white/70">
                  {formatDate(activeImage.date)} • {formatCurrency(activeImage.amount)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ShekImagesPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <ShekImagesContent />
    </ProtectedWorkerRoute>
  )
}
