'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, Search, X, Eye } from 'lucide-react'
import { useFabricStore, formatFabricPrice, Fabric, getFinalPrice } from '@/store/fabricStore'
import dynamic from 'next/dynamic'

// تحميل المكونات بشكل ديناميكي (Code Splitting)
const FabricFilterSidebar = dynamic(() => import('@/components/FabricFilterSidebar'), {
  ssr: false,
  loading: () => <div className="hidden lg:block w-80 h-screen animate-pulse bg-gray-100 rounded-2xl" />
})

const FabricQuickViewModal = dynamic(() => import('@/components/FabricQuickViewModal'), { ssr: false })

const FABRICS_PER_PAGE = 12

function FabricSkeleton() {
  return (
    <div className="group">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 shadow-lg">
        <div className="aspect-[4/5] bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 animate-pulse" />
        <div className="p-3 space-y-2">
          <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4 mx-auto" />
          <div className="space-y-1">
            <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
            <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FabricsPage() {
  const { fabrics, loadFabrics, isLoading, error, getFilteredFabrics, filters, sortBy, setFilters, setSortBy, resetFilters } = useFabricStore()
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{[key: string]: number}>({})
  const [displayedFabrics, setDisplayedFabrics] = useState<Fabric[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [quickViewFabric, setQuickViewFabric] = useState<Fabric | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (fabrics.length === 0) {
      console.log('🔄 تحميل الأقمشة من Supabase...')
      loadFabrics()
    } else {
      console.log(`✅ الأقمشة محملة بالفعل (${fabrics.length} قماش)`)
    }
  }, [loadFabrics, fabrics.length])

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
    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current) }
  }, [hasMore, isLoading])

  useEffect(() => {
    if (fabrics.length > 0) {
      const initialIndexes: {[key: string]: number} = {}
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
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-4 lg:pt-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-12">
        {/* التنقل */}
        <nav className="flex justify-start items-start mt-0 mb-2" dir="rtl" aria-label="التنقل الرئيسي">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
            style={{marginTop: 0}}
            aria-label="العودة إلى الصفحة الرئيسية"
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" aria-hidden="true" />
            <span className="text-sm lg:text-base">العودة إلى الرئيسية</span>
          </Link>
        </nav>

        {/* العنوان */}
        <motion.header
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              متجر الأقمشة
            </span>
          </h1>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed mb-6">
            اكتشفي مجموعتنا الفاخرة من الأقمشة عالية الجودة لتصميم فستان أحلامك
          </p>

          {/* ملاحظة مهمة */}
          <aside className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl p-4 max-w-2xl mx-auto" role="note" aria-label="معلومة مهمة">
            <p className="text-blue-900 font-semibold text-center">
              ✨ اختاري القماش المناسب واحجزي موعداً لتصميم فستانك الخاص
            </p>
          </aside>
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
                className="w-full px-6 py-3 pr-12 pl-12 border-2 border-pink-200 rounded-xl bg-white/60 backdrop-blur-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all duration-300 shadow-sm hover:shadow-md"
                aria-label="البحث عن الأقمشة"
              />

              {/* Search Icon */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-pink-600 pointer-events-none">
                <Search className="w-5 h-5" />
              </div>

              {/* Clear Button */}
              {filters.searchQuery && (
                <button
                  onClick={() => setFilters({ searchQuery: '' })}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-600 transition-colors duration-200"
                  aria-label="مسح البحث"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* شريط الأدوات: الفلاتر والترتيب */}
          <div className="flex flex-wrap items-center justify-between gap-4" dir="rtl">
            {/* زر فتح الفلاتر (للهواتف) */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsFilterOpen(true)}
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-pink-200 rounded-xl hover:border-pink-400 hover:shadow-md transition-all duration-300"
                aria-label="فتح الفلاتر"
              >
                <SlidersHorizontal className="w-5 h-5 text-pink-600" />
                <span className="text-sm font-medium text-gray-800">الفلاتر</span>
              </button>
            </div>

            {/* الترتيب */}
            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2.5 bg-white border-2 border-pink-200 rounded-xl hover:border-pink-400 hover:shadow-md focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all duration-300 text-sm font-medium text-gray-800 cursor-pointer"
                dir="rtl"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="price-low">السعر: من الأقل إلى الأعلى</option>
                <option value="price-high">السعر: من الأعلى إلى الأقل</option>
                <option value="popular">الأكثر مبيعاً</option>
                <option value="name">الاسم: أ-ي</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Layout: Sidebar + Content */}
        <div className="flex gap-8">
          {/* Filter Sidebar - مخفي على الهواتف */}
          <div className="hidden lg:block lg:w-64 flex-shrink-0">
            <div className="sticky top-24">
              <FabricFilterSidebar isOpen={true} onClose={() => {}} />
            </div>
          </div>

          {/* Filter Sidebar - للهواتف (Modal) */}
          <FabricFilterSidebar isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} />

          {/* Content Area */}
          <div className="flex-1">
            {/* رسالة خطأ */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-6 py-4 rounded-xl mb-6 shadow-sm">
                <p className="font-medium">{error}</p>
              </div>
            )}

            {/* حالة التحميل */}
            {isLoading && fabrics.length === 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                {Array.from({ length: 12 }).map((_, index) => (
                  <FabricSkeleton key={index} />
                ))}
              </div>
            )}

            {/* لا توجد نتائج */}
            {!isLoading && displayedFabrics.length === 0 && fabrics.length > 0 && (
              <div className="text-center py-20">
                <p className="text-gray-600 text-lg mb-4">لا توجد أقمشة تطابق معايير البحث</p>
                <button
                  onClick={resetFilters}
                  className="px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  إعادة تعيين الفلاتر
                </button>
              </div>
            )}

            {/* لا توجد أقمشة في قاعدة البيانات */}
            {!isLoading && fabrics.length === 0 && (
              <div className="text-center py-20">
                <Loader2 className="w-12 h-12 text-pink-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600 text-lg">لا توجد أقمشة متاحة حالياً</p>
              </div>
            )}

            {displayedFabrics.length > 0 && (
              <section className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-12">
                {displayedFabrics.map((fabric, index) => {
                  const fabricImages = fabric.images || []
                  const currentIndex = currentImageIndexes[fabric.id] || 0
                  const currentImage = fabricImages[currentIndex] || fabric.image_url || '/wedding-dress-1.jpg.jpg'
                  const finalPrice = getFinalPrice(fabric)

                  return (
                    <motion.div
                      key={fabric.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.05 }}
                      className="group"
                    >
                      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                        <Link href={`/fabrics/${fabric.id}`}>
                          <div className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer">
                            <img
                              src={currentImage}
                              alt={`${fabric.name} - صورة ${currentIndex + 1}`}
                              className="w-full h-full object-cover transition-opacity duration-300"
                            />

                            {fabricImages.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    prevImage(fabric.id, fabricImages.length)
                                  }}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg z-10"
                                  aria-label="الصورة السابقة"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    nextImage(fabric.id, fabricImages.length)
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg z-10"
                                  aria-label="الصورة التالية"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {fabric.is_on_sale && (
                              <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                                خصم {fabric.discount_percentage}%
                              </div>
                            )}

                            {!fabric.is_available && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <span className="bg-white text-gray-800 px-4 py-2 rounded-lg font-bold">غير متوفر</span>
                              </div>
                            )}

                            {/* زر نظرة سريعة */}
                            <button
                              onClick={(e) => openQuickView(fabric, e)}
                              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-pink-600 px-3 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-semibold opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-1 sm:gap-2 z-20"
                              aria-label="نظرة سريعة"
                            >
                              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                              <span>نظرة سريعة</span>
                            </button>
                          </div>
                        </Link>

                        <div className="p-3">
                          <Link href={`/fabrics/${fabric.id}`}>
                            <div className="cursor-pointer hover:bg-pink-50/50 transition-colors duration-300 p-1 -m-1 rounded-lg">
                              <h3 className="font-bold text-gray-800 mb-1 group-hover:text-pink-600 transition-colors duration-300 text-center">
                                {fabric.name}
                              </h3>
                              <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 text-center">
                                {fabric.description}
                              </p>
                            </div>
                          </Link>
                        </div>
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
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 mb-8">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <FabricSkeleton key={`loading-${index}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* QuickView Modal */}
      <FabricQuickViewModal
        fabric={quickViewFabric}
        isOpen={isQuickViewOpen}
        onClose={closeQuickView}
      />
    </main>
  )
}





