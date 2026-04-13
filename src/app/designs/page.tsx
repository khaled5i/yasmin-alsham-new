'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight, Grid3X3, Grid2X2, Loader2, SlidersHorizontal, Eye } from 'lucide-react'
import { useShopStore, formatPrice, Product } from '@/store/shopStore'
import SearchBar from '@/components/SearchBar'
import SortOptions from '@/components/SortOptions'

import dynamic from 'next/dynamic'
import { isVideoFile } from '@/lib/utils/media'

// تحميل المكونات الثقيلة بشكل ديناميكي (Code Splitting)
const FilterSidebar = dynamic(() => import('@/components/FilterSidebar'), {
  ssr: false,
  loading: () => <div className="hidden lg:block w-80 h-screen animate-pulse bg-gray-100 rounded-2xl" />
})

const QuickViewModal = dynamic(() => import('@/components/QuickViewModal'), { ssr: false })

// عدد المنتجات في كل صفحة
const PRODUCTS_PER_PAGE = 12

// Skeleton Loading Component
function ProductSkeleton() {
  return (
    <div className="group">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 shadow-lg">
        {/* Skeleton للصورة */}
        <div className="aspect-[4/5] bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 animate-pulse" />

        {/* Skeleton للمعلومات */}
        <div className="p-3 space-y-2">
          {/* العنوان */}
          <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4 mx-auto" />

          {/* الوصف */}
          <div className="space-y-1">
            <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
            <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DesignsPage() {
  const { products, loadProducts, isLoading, error, getFilteredProducts, filters, sortBy } = useShopStore()

  const [currentImageIndexes, setCurrentImageIndexes] = useState<{ [key: string]: number }>({})
  const [isSingleColumn, setIsSingleColumn] = useState(false)
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)

  // تحميل المنتجات عند تحميل الصفحة (مع إعادة التحميل دائماً للحصول على أحدث البيانات)
  useEffect(() => {
    console.log('🔄 تحميل المنتجات من Supabase...')
    loadProducts(true) // forceReload = true للحصول على أحدث المنتجات
  }, [loadProducts])

  // Infinite Scroll: تحميل المزيد من المنتجات عند التمرير (مع الفلاتر)
  useEffect(() => {
    if (products.length === 0) return

    // استخدام المنتجات المفلترة بدلاً من جميع المنتجات
    const filteredProducts = getFilteredProducts()
    const totalProducts = filteredProducts.length
    const productsToShow = page * PRODUCTS_PER_PAGE
    const newDisplayedProducts = filteredProducts.slice(0, Math.min(productsToShow, totalProducts))

    setDisplayedProducts(newDisplayedProducts)
    setHasMore(productsToShow < totalProducts)
  }, [products, page, filters, sortBy, getFilteredProducts])

  // إعادة تعيين الصفحة عند تغيير الفلاتر أو الترتيب
  useEffect(() => {
    setPage(1)
  }, [filters, sortBy])

  // Intersection Observer للتحميل التلقائي عند الوصول لنهاية الصفحة
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          setPage(prev => prev + 1)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, isLoading])

  // تحديث مؤشرات الصور عند تحميل المنتجات
  useEffect(() => {
    if (displayedProducts.length > 0) {
      const initialIndexes: { [key: string]: number } = {}
      displayedProducts.forEach(product => {
        initialIndexes[product.id] = 0
      })
      setCurrentImageIndexes(initialIndexes)
    }
  }, [displayedProducts])



  // تحميل حالة العرض من localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('yasmin-designs-view-mode')
    if (savedViewMode === 'single') {
      setIsSingleColumn(true)
    }
  }, [])

  // حفظ حالة العرض في localStorage
  const toggleViewMode = () => {
    const newMode = !isSingleColumn
    setIsSingleColumn(newMode)
    localStorage.setItem('yasmin-designs-view-mode', newMode ? 'single' : 'double')
  }



  // دوال التنقل بين صور البطاقة
  const nextCardImage = (productId: string, totalImages: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [productId]: ((prev[productId] || 0) + 1) % totalImages
    }))
  }

  const prevCardImage = (productId: string, totalImages: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) === 0 ? totalImages - 1 : (prev[productId] || 0) - 1
    }))
  }

  const setCardImage = (productId: string, imageIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [productId]: imageIndex
    }))
  }

  // فتح QuickView
  const openQuickView = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setQuickViewProduct(product)
    setIsQuickViewOpen(true)
  }

  // إغلاق QuickView
  const closeQuickView = () => {
    setIsQuickViewOpen(false)
    setTimeout(() => setQuickViewProduct(null), 300)
  }





  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-4 lg:pt-8">
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
                href="/#ready-designs"
                className="absolute right-0 inline-flex items-center gap-1.5 text-pink-600 hover:text-pink-700 bg-white/80 backdrop-blur-sm hover:bg-white border border-pink-200 rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-all duration-300"
              >
                <ArrowRight className="w-5 h-5" />
                <span className="text-sm font-medium">رجوع</span>
              </Link>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
                <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                  الفساتين الجاهزة
                </span>
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
              <SearchBar />
            </div>

            {/* شريط الأدوات: الفلاتر، الترتيب، تبديل العرض */}
            <div className="flex flex-wrap items-center justify-between gap-4" dir="rtl">
              {/* زر فتح الفلاتر (لجميع الأحجام) */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsFilterOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-pink-200 rounded-xl hover:border-pink-400 hover:shadow-md transition-all duration-300"
                  aria-label="فتح الفلاتر"
                >
                  <SlidersHorizontal className="w-5 h-5 text-pink-600" />
                  <span className="text-sm font-medium text-gray-800">الفلاتر</span>
                </button>
              </div>

              {/* الترتيب + تبديل العرض */}
              <div className="flex items-center gap-3">
                <SortOptions />

                {/* زر تبديل العرض */}
                <button
                  onClick={toggleViewMode}
                  className="sm:hidden bg-white border-2 border-pink-200 rounded-xl p-2.5 hover:border-pink-400 hover:shadow-md transition-all duration-300"
                  aria-label={isSingleColumn ? 'تبديل إلى العرض الثنائي' : 'تبديل إلى العرض الفردي'}
                >
                  {isSingleColumn ? (
                    <Grid2X2 className="w-5 h-5 text-pink-600" />
                  ) : (
                    <Grid3X3 className="w-5 h-5 text-pink-600" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Filter Sidebar - Modal لجميع الأحجام */}
          <FilterSidebar isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} />

          {/* Main Content */}
          <div className="w-full">

            {/* حالة التحميل الأولي مع Skeleton */}
            {isLoading && products.length === 0 && (
              <div className={`grid gap-8 mb-12 ${isSingleColumn
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <ProductSkeleton key={index} />
                ))}
              </div>
            )}

            {/* رسالة عدم وجود منتجات أو خطأ */}
            {!isLoading && products.length === 0 && (
              <div className="text-center py-20">
                {error ? (
                  <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
                    <div className="flex items-center justify-center mb-4">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-red-900 mb-2">حدث خطأ في تحميل المنتجات</h3>
                    <p className="text-red-700 text-sm mb-4">{error}</p>
                    <button
                      onClick={() => {
                        console.log('🔄 إعادة محاولة تحميل المنتجات...')
                        loadProducts()
                      }}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors duration-300"
                    >
                      إعادة المحاولة
                    </button>
                    <div className="mt-4 text-xs text-red-600">
                      <p>💡 نصيحة: افتح Console (F12) لمزيد من التفاصيل</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto bg-gray-50 border border-gray-200 rounded-xl p-6">
                    <div className="flex items-center justify-center mb-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">لا توجد تصاميم متاحة حالياً</h3>
                    <p className="text-gray-600 text-sm">يرجى المحاولة لاحقاً أو التواصل مع الإدارة</p>
                  </div>
                )}
              </div>
            )}

            {/* رسالة عدم وجود نتائج بعد الفلترة */}
            {!isLoading && products.length > 0 && displayedProducts.length === 0 && (
              <div className="text-center py-20" role="status" aria-live="polite">
                <div className="max-w-md mx-auto bg-orange-50 border-2 border-orange-300 rounded-xl p-6">
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <SlidersHorizontal className="w-6 h-6 text-orange-600" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-orange-900 mb-2">لا توجد نتائج مطابقة</h3>
                  <p className="text-orange-800 text-sm mb-4">لم نجد أي منتجات تطابق الفلاتر المحددة</p>
                  <button
                    onClick={() => {
                      const { resetFilters } = useShopStore.getState()
                      resetFilters()
                    }}
                    className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 transition-colors duration-300 font-semibold"
                    aria-label="إعادة تعيين جميع الفلاتر"
                  >
                    إعادة تعيين الفلاتر
                  </button>
                </div>
              </div>
            )}

            {/* شبكة التصاميم */}
            {displayedProducts.length > 0 && (
              <section
                className={`grid gap-8 mb-12 ${isSingleColumn
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  }`}
                aria-label="قائمة المنتجات"
              >
                {displayedProducts.map((product, index) => {
                  const productImages = product.images || []
                  const currentIndex = currentImageIndexes[product.id] || 0
                  // استخدام الصورة الحالية أو الصورة الافتراضية
                  const currentImage = productImages[currentIndex] || '/wedding-dress-1.jpg.jpg'

                  // التحقق من نوع الصورة (URL أو base64)
                  const isExternalImage = currentImage.startsWith('http')
                  const isBase64 = currentImage.startsWith('data:')

                  return (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: Math.min(index * 0.05, 0.5) }}
                      className="group"
                    >
                      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                        {/* الصورة */}
                        <Link href={`/designs/${product.id}`}>
                          <div
                            className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer"
                          >
                            {/* الصورة/الفيديو الحالي */}
                            {isVideoFile(currentImage) ? (
                              <video
                                src={currentImage}
                                muted
                                preload="metadata"
                                className="w-full h-full object-cover transition-opacity duration-300"
                              />
                            ) : (
                              <img
                                src={currentImage}
                                alt={`${product.name} - صورة ${currentIndex + 1}`}
                                className="w-full h-full object-cover transition-opacity duration-300"
                                loading="lazy"
                              />
                            )}

                            {/* أزرار التنقل - تظهر فقط إذا كان هناك أكثر من صورة */}
                            {productImages.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => nextCardImage(product.id, productImages.length, e)}
                                  className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                                  aria-label="الصورة التالية"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={(e) => prevCardImage(product.id, productImages.length, e)}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                                  aria-label="الصورة السابقة"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>

                                {/* مؤشرات الصور */}
                                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1 space-x-reverse opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                  {productImages.map((_, imgIndex) => (
                                    <button
                                      key={imgIndex}
                                      onClick={(e) => setCardImage(product.id, imgIndex, e)}
                                      className={`w-2 h-2 rounded-full transition-colors duration-300 ${currentIndex === imgIndex ? 'bg-white' : 'bg-white/50'
                                        }`}
                                      aria-label={`عرض الصورة ${imgIndex + 1}`}
                                    />
                                  ))}
                                </div>
                              </>
                            )}

                            {/* زر نظرة سريعة - مخفي على الجوال */}
                            <button
                              onClick={(e) => openQuickView(product, e)}
                              className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-pink-600 px-3 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-semibold opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 items-center gap-1 sm:gap-2 z-20"
                              aria-label="نظرة سريعة"
                            >
                              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                              <span>نظرة سريعة</span>
                            </button>
                          </div>
                        </Link>

                        {/* المعلومات - تظهر فقط إذا كان هناك اسم */}
                        {product.name && (
                          <div className="p-3">
                            <Link href={`/designs/${product.id}`}>
                              <div className="cursor-pointer hover:bg-pink-50/50 transition-colors duration-300 p-1 -m-1 rounded-lg">
                                <h3 className="font-bold text-gray-800 mb-1 group-hover:text-pink-600 transition-colors duration-300 text-center">
                                  {product.name}
                                </h3>
                              </div>
                            </Link>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </section>
            )}

            {/* Infinite Scroll Observer - مع Skeleton عند التحميل */}
            {hasMore && displayedProducts.length > 0 && (
              <>
                <div ref={observerTarget} className="h-4" aria-hidden="true" />
                {/* عرض Skeleton أثناء تحميل المزيد */}
                <div className={`grid gap-8 mb-8 ${isSingleColumn
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  }`}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <ProductSkeleton key={`loading-${index}`} />
                  ))}
                </div>
              </>
            )}

            {/* رسالة نهاية القائمة */}
            {!hasMore && displayedProducts.length > 0 && (
              <div className="text-center py-8" role="status" aria-live="polite">
                <p className="text-gray-700 font-medium">تم عرض جميع التصاميم</p>
              </div>
            )}

          </div>
        </div>

        {/* QuickView Modal */}
        <QuickViewModal
          product={quickViewProduct}
          isOpen={isQuickViewOpen}
          onClose={closeQuickView}
        />
      </main>
    </>
  )
}



