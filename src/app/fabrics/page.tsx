'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, Search, X, Eye, Grid3X3, Grid2X2 } from 'lucide-react'
import { useFabricStore, Fabric, getFinalPrice } from '@/store/fabricStore'
import FabricSortOptions from '@/components/FabricSortOptions'

import dynamic from 'next/dynamic'
import { getSupabaseImageSrcSet, getSupabaseImageUrl, isVideoFile } from '@/lib/utils/media'
import { formatFabricNumber } from '@/lib/fabric-number-format'

// تحميل المكونات بشكل ديناميكي (Code Splitting)
const FabricFilterSidebar = dynamic(() => import('@/components/FabricFilterSidebar'), {
  ssr: false,
  loading: () => <div className="hidden lg:block w-80 h-screen animate-pulse bg-[#f6f0e8] rounded-2xl" />
})

const FabricQuickViewModal = dynamic(() => import('@/components/FabricQuickViewModal'), { ssr: false })

const FABRICS_PER_PAGE = 12

function FabricSkeleton() {
  return (
    <div className="group">
      <div className="relative overflow-hidden rounded-2xl border border-[#d8c5ae]/60 bg-[#f6f0e8] shadow-lg">
        <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-br from-[#d8c5ae]/55 via-[#f6f0e8] to-[#d8c5ae]/55 animate-pulse">
          <div className="absolute inset-x-0 bottom-0 flex h-[20%] items-end justify-center bg-gradient-to-b from-transparent via-[#f6f0e8]/75 to-[#f6f0e8] px-3 pb-3 sm:px-5 sm:pb-4">
            <div className="flex w-full items-center justify-center gap-2 sm:gap-3">
              <span className="h-px min-w-2 max-w-6 flex-1 bg-[#6b1726]/35 sm:max-w-10" />
              <span className="h-4 w-20 rounded bg-[#d8c5ae]/70 sm:w-28" />
              <span className="h-px min-w-2 max-w-6 flex-1 bg-[#6b1726]/35 sm:max-w-10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FabricsPage() {
  const { fabrics, loadFabrics, isLoading, error, getFilteredFabrics, filters, sortBy, setFilters, resetFilters } = useFabricStore()
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{ [key: string]: number }>({})
  const [isSingleColumn, setIsSingleColumn] = useState(false)
  const [displayedFabrics, setDisplayedFabrics] = useState<Fabric[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [quickViewFabric, setQuickViewFabric] = useState<Fabric | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log('🔄 تحميل الأقمشة من Supabase...')
    loadFabrics(true) // forceReload = true للحصول على أحدث الأقمشة
  }, [loadFabrics])

  useEffect(() => {
    if (fabrics.length === 0) return
    const filteredFabrics = getFilteredFabrics()
    const totalFabrics = filteredFabrics.length
    const fabricsToShow = page * FABRICS_PER_PAGE
    const newDisplayedFabrics = filteredFabrics.slice(0, Math.min(fabricsToShow, totalFabrics))
    setDisplayedFabrics(newDisplayedFabrics)
    setHasMore(fabricsToShow < totalFabrics)
  }, [fabrics, page, filters, sortBy, getFilteredFabrics])

  useEffect(() => { setPage(1) }, [filters, sortBy])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          setPage(prev => prev + 1)
        }
      },
      { threshold: 0.1 }
    )
    const observerNode = observerTarget.current
    if (observerNode) observer.observe(observerNode)
    return () => { if (observerNode) observer.unobserve(observerNode) }
  }, [hasMore, isLoading])

  useEffect(() => {
    if (fabrics.length > 0) {
      const initialIndexes: { [key: string]: number } = {}
      fabrics.forEach(fabric => { initialIndexes[fabric.id] = 0 })
      setCurrentImageIndexes(initialIndexes)
    }
  }, [fabrics])

  const nextImage = useCallback((fabricId: string, totalImages: number) => {
    setCurrentImageIndexes(prev => ({ ...prev, [fabricId]: ((prev[fabricId] || 0) + 1) % totalImages }))
  }, [])

  const prevImage = useCallback((fabricId: string, totalImages: number) => {
    setCurrentImageIndexes(prev => ({ ...prev, [fabricId]: ((prev[fabricId] || 0) - 1 + totalImages) % totalImages }))
  }, [])

  // تحميل حالة العرض من localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('yasmin-fabrics-view-mode')
    if (savedViewMode === 'single') {
      setIsSingleColumn(true)
    }
  }, [])

  // حفظ حالة العرض في localStorage
  const toggleViewMode = () => {
    const newMode = !isSingleColumn
    setIsSingleColumn(newMode)
    localStorage.setItem('yasmin-fabrics-view-mode', newMode ? 'single' : 'double')
  }

  // فتح QuickView
  const openQuickView = (fabric: Fabric, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setQuickViewFabric(fabric)
    setIsQuickViewOpen(true)
  }

  // إغلاق QuickView
  const closeQuickView = () => {
    setIsQuickViewOpen(false)
    setTimeout(() => setQuickViewFabric(null), 300)
  }

  return (
    <>
      <main className="min-h-screen bg-[#fbf8f3] text-[#211b19] pt-4 lg:pt-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-12">

          {/* العنوان مع زر العودة */}
          <motion.header
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-12"
          >
            <div className="relative flex items-center justify-center">
              <Link
                href="/#fabrics"
                className="absolute right-0 inline-flex items-center gap-1.5 text-[#6b1726] hover:text-[#2f0c14] bg-[#f6f0e8]/90 backdrop-blur-sm hover:bg-[#f6f0e8] border border-[#d8c5ae] rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]"
              >
                <ArrowRight className="w-5 h-5" />
                <span className="text-sm font-medium">رجوع</span>
              </Link>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#6b1726]">
                متجر الأقمشة
              </h1>
            </div>
          </motion.header>

          {/* شريط البحث والفلاتر */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            {/* شريط البحث */}
            <div className="mb-4">
              <div className="relative w-full" dir="rtl">
                <input
                  type="text"
                  placeholder="ابحث عن نوع القماش..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters({ searchQuery: e.target.value })}
                  className="w-full px-6 py-3 pr-12 pl-12 border-2 border-[#d8c5ae] rounded-xl bg-[#f6f0e8]/80 text-[#211b19] placeholder:text-[#211b19]/45 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#b99a68] focus:border-[#6b1726] transition-all duration-300 shadow-sm hover:shadow-md"
                  aria-label="البحث عن الأقمشة"
                />

                {/* Search Icon */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b1726] pointer-events-none">
                  <Search className="w-5 h-5" />
                </div>

                {/* Clear Button */}
                {filters.searchQuery && (
                  <button
                    onClick={() => setFilters({ searchQuery: '' })}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#211b19]/45 hover:text-[#6b1726] transition-colors duration-200"
                    aria-label="مسح البحث"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* شريط الأدوات: الفلاتر، الترتيب، تبديل العرض */}
            <div className="flex flex-wrap items-center justify-between gap-4" dir="rtl">
              {/* زر فتح الفلاتر (لجميع الأحجام) */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsFilterOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#f6f0e8] border-2 border-[#d8c5ae] rounded-xl hover:border-[#6b1726] hover:shadow-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                  aria-label="فتح الفلاتر"
                >
                  <SlidersHorizontal className="w-5 h-5 text-[#6b1726]" />
                  <span className="text-sm font-medium text-[#211b19]">الفلاتر</span>
                </button>
              </div>

              {/* الترتيب + تبديل العرض */}
              <div className="flex items-center gap-3">
                <FabricSortOptions />

                {/* زر تبديل العرض */}
                <button
                  onClick={toggleViewMode}
                  className="sm:hidden bg-[#f6f0e8] border-2 border-[#d8c5ae] rounded-xl p-2.5 hover:border-[#6b1726] hover:shadow-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                  aria-label={isSingleColumn ? 'تبديل إلى العرض الثنائي' : 'تبديل إلى العرض الفردي'}
                >
                  {isSingleColumn ? (
                    <Grid2X2 className="w-5 h-5 text-[#6b1726]" />
                  ) : (
                    <Grid3X3 className="w-5 h-5 text-[#6b1726]" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Filter Sidebar - Modal لجميع الأحجام */}
          <FabricFilterSidebar isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} />

          {/* Content Area */}
          <div className="w-full">
            {/* رسالة خطأ */}
            {error && (
              <div className="bg-[#f6f0e8] border-2 border-[#6b1726]/25 text-[#6b1726] px-6 py-4 rounded-xl mb-6 shadow-sm">
                <p className="font-medium">{error}</p>
              </div>
            )}

            {/* حالة التحميل */}
            {isLoading && fabrics.length === 0 && (
              <div className={`grid gap-8 ${isSingleColumn
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`}>
                {Array.from({ length: 12 }).map((_, index) => (
                  <FabricSkeleton key={index} />
                ))}
              </div>
            )}

            {/* لا توجد نتائج */}
            {!isLoading && displayedFabrics.length === 0 && fabrics.length > 0 && (
              <div className="text-center py-20">
                <p className="text-[#211b19]/70 text-lg mb-4">لا توجد أقمشة تطابق معايير البحث</p>
                <button
                  onClick={resetFilters}
                  className="px-6 py-3 bg-[#6b1726] hover:bg-[#2f0c14] text-[#f6f0e8] rounded-xl hover:shadow-lg transition-all duration-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]"
                >
                  إعادة تعيين الفلاتر
                </button>
              </div>
            )}

            {/* لا توجد أقمشة في قاعدة البيانات */}
            {!isLoading && fabrics.length === 0 && (
              <div className="text-center py-20">
                <Loader2 className="w-12 h-12 text-[#6b1726] animate-spin mx-auto mb-4" />
                <p className="text-[#211b19]/70 text-lg">لا توجد أقمشة متاحة حالياً</p>
              </div>
            )}

            {displayedFabrics.length > 0 && (
              <section className={`grid gap-8 mb-12 ${isSingleColumn
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`} aria-label="قائمة الأقمشة">
                {displayedFabrics.map((fabric, index) => {
                  const fabricImages = fabric.images || []
                  const currentIndex = currentImageIndexes[fabric.id] || 0
                  const originalImage = fabricImages[currentIndex]
                    || fabric.image_url
                    || fabric.thumbnail_image
                    || '/wedding-dress-1.jpg.jpg'
                  const currentImageIsVideo = isVideoFile(originalImage)
                  const currentImage = currentImageIsVideo
                    ? originalImage
                    : getSupabaseImageUrl(originalImage, {
                      width: 720,
                      height: 1280,
                      quality: 82,
                    })
                  const currentImageSrcSet = currentImageIsVideo
                    ? undefined
                    : getSupabaseImageSrcSet(originalImage, [
                      { width: 360, height: 640 },
                      { width: 540, height: 960 },
                      { width: 720, height: 1280 },
                    ])
                  const fallbackImage = fabric.thumbnail_image || originalImage
                  const finalPrice = getFinalPrice(fabric)
                  const priceLabel = finalPrice != null && finalPrice > 0
                    ? `السعر : ${formatFabricNumber(finalPrice)} ريال / متر`
                    : 'السعر عند الطلب'
                  return (
                    <motion.div
                      key={fabric.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.05 }}
                      className="group"
                    >
                      <div className="relative overflow-hidden rounded-2xl border border-[#d8c5ae]/60 bg-[#f6f0e8] shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                        <Link href={`/fabrics/${fabric.id}`}>
                          <div className="aspect-[9/16] bg-gradient-to-br from-[#d8c5ae]/55 via-[#f6f0e8] to-[#d8c5ae]/35 relative overflow-hidden cursor-pointer">
                            {currentImageIsVideo ? (
                              <video
                                src={currentImage}
                                muted
                                preload="metadata"
                                className="w-full h-full object-cover transition-opacity duration-300"
                              />
                            ) : (
                              <img
                                src={currentImage}
                                srcSet={currentImageSrcSet}
                                sizes={isSingleColumn
                                  ? '(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), (max-width: 1279px) calc(33vw - 2rem), 300px'
                                  : '(max-width: 639px) calc(50vw - 1.5rem), (max-width: 1023px) calc(50vw - 2rem), (max-width: 1279px) calc(33vw - 2rem), 300px'}
                                alt={`${fabric.name || fabric.category || 'قماش'} - صورة ${currentIndex + 1}`}
                                width={720}
                                height={1280}
                                loading={index < 4 ? 'eager' : 'lazy'}
                                fetchPriority={index === 0 ? 'high' : 'auto'}
                                decoding="async"
                                className="w-full h-full object-cover transition-opacity duration-300"
                                onError={(event) => {
                                  if (event.currentTarget.dataset.fallbackApplied) return
                                  event.currentTarget.dataset.fallbackApplied = 'true'
                                  event.currentTarget.removeAttribute('srcset')
                                  event.currentTarget.src = fallbackImage
                                }}
                              />
                            )}

                            {fabricImages.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    prevImage(fabric.id, fabricImages.length)
                                  }}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-[#f6f0e8]/90 hover:bg-[#f6f0e8] text-[#6b1726] rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg z-10"
                                  aria-label="الصورة السابقة"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    nextImage(fabric.id, fabricImages.length)
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#f6f0e8]/90 hover:bg-[#f6f0e8] text-[#6b1726] rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg z-10"
                                  aria-label="الصورة التالية"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {fabric.is_on_sale && (
                              <div className="absolute top-4 right-4 bg-[#6b1726] text-[#f6f0e8] px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                                خصم {fabric.discount_percentage}%
                              </div>
                            )}

                            {!fabric.is_available && (
                              <div className="absolute inset-0 bg-[#2f0c14]/55 flex items-center justify-center">
                                <span className="bg-[#f6f0e8] text-[#6b1726] px-4 py-2 rounded-lg font-bold">غير متوفر</span>
                              </div>
                            )}

                            {/* زر نظرة سريعة - مخفي على الجوال */}
                            <button
                              onClick={(e) => openQuickView(fabric, e)}
                              className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#f6f0e8] text-[#6b1726] px-3 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-semibold opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg hover:bg-[#6b1726] hover:text-[#f6f0e8] hover:shadow-xl hover:scale-105 items-center gap-1 sm:gap-2 z-20"
                              aria-label="نظرة سريعة"
                            >
                              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                              <span>نظرة سريعة</span>
                            </button>

                            <div
                              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-[20%] items-end justify-center bg-gradient-to-b from-transparent via-[#f6f0e8]/75 to-[#f6f0e8] px-3 pb-3 sm:px-5 sm:pb-4"
                              dir="rtl"
                            >
                              <div className="flex w-full items-center justify-center gap-2 text-[#6b1726] sm:gap-3">
                                <span className="h-px min-w-2 max-w-6 flex-1 bg-[#6b1726]/60 sm:max-w-10" aria-hidden="true" />
                                <p className="whitespace-nowrap text-xs font-semibold leading-none sm:text-base lg:text-lg">
                                  {priceLabel}
                                </p>
                                <span className="h-px min-w-2 max-w-6 flex-1 bg-[#6b1726]/60 sm:max-w-10" aria-hidden="true" />
                              </div>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </motion.div>
                  )
                })}
              </section>
            )}

            {/* Infinite Scroll Trigger */}
            {hasMore && displayedFabrics.length > 0 && (
              <>
                <div ref={observerTarget} className="h-4" aria-hidden="true" />
                <div className={`grid gap-8 mb-8 ${isSingleColumn
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  }`}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <FabricSkeleton key={`loading-${index}`} />
                  ))}
                </div>
              </>
            )}

            {/* رسالة نهاية القائمة */}
            {!hasMore && displayedFabrics.length > 0 && (
              <div className="text-center py-8" role="status" aria-live="polite">
                <p className="text-[#211b19]/70 font-medium">تم عرض جميع الأقمشة</p>
              </div>
            )}
          </div>
        </div>

        {/* QuickView Modal */}
        <FabricQuickViewModal
          fabric={quickViewFabric}
          isOpen={isQuickViewOpen}
          onClose={closeQuickView}
        />
      </main>
    </>
  )
}





