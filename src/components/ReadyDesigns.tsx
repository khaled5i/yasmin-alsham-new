'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Star, Palette, ChevronLeft, ChevronRight, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { useShopStore } from '@/store/shopStore'
import useEmblaCarousel from 'embla-carousel-react'

// صورة احتياطية عند فشل تحميل الصورة
const FALLBACK_IMAGE = '/yasmin.jpg'

export default function ReadyDesigns() {
  const { products, loadProducts, isLoading, error, retryCount } = useShopStore()
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{ [key: string]: number }>({})
  const [imageLoadErrors, setImageLoadErrors] = useState<{ [key: string]: boolean }>({})
  const [isRetrying, setIsRetrying] = useState(false)

  // Embla Carousel للموبايل
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false, // إلغاء التقليب اللانهائي
    align: 'center',
    skipSnaps: false,
    dragFree: false,
    containScroll: false,
    direction: 'rtl'
  })
  const [selectedIndex, setSelectedIndex] = useState(0)

  // تحميل المنتجات عند تحميل المكون - بدون forceReload للاستفادة من الكاش
  useEffect(() => {
    loadProducts(false)
  }, [loadProducts])

  // دالة إعادة المحاولة
  const handleRetry = useCallback(async () => {
    setIsRetrying(true)
    await loadProducts(true)
    setIsRetrying(false)
  }, [loadProducts])

  // متابعة تغيير الـ slide الحالي
  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  // تحديث مؤشرات الصور عند تحميل المنتجات
  useEffect(() => {
    if (products.length > 0) {
      const initialIndexes: { [key: string]: number } = {}
      products.filter(p => p.is_available && p.is_featured).forEach(product => {
        initialIndexes[product.id] = 0
      })
      setCurrentImageIndexes(initialIndexes)
    }
  }, [products])

  // الفساتين المميزة فقط
  const readyDesigns = products
    .filter(p => p.is_available && p.is_featured)

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





  return (
    <section id="ready-designs" className="py-12 lg:py-20 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 max-lg:min-h-[100dvh] max-lg:h-[100dvh] max-lg:snap-start max-lg:snap-always max-lg:flex max-lg:flex-col max-lg:justify-between max-lg:overflow-hidden max-lg:overflow-x-hidden max-lg:pt-[2vh] max-lg:pb-[2vh]">
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 max-lg:flex max-lg:flex-col max-lg:h-full max-lg:justify-between">
        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center max-lg:mb-[1.5vh] lg:mb-16"
        >
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              الفساتين الجاهزة
            </span>
          </h2>
        </motion.div>

        {/* حالة التحميل */}
        {isLoading && (
          <div className="flex flex-col justify-center items-center max-lg:flex-1 lg:py-20">
            <Loader2 className="w-10 h-10 text-pink-600 animate-spin mb-3" />
            <span className="text-gray-600 text-sm lg:text-base">جاري تحميل التصاميم...</span>
          </div>
        )}

        {/* رسالة الخطأ مع زر إعادة المحاولة */}
        {!isLoading && error && (
          <div className="flex flex-col justify-center items-center max-lg:flex-1 lg:py-20 px-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="text-red-700 font-medium mb-2">حدث خطأ في تحميل التصاميم</p>
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="btn-primary inline-flex items-center space-x-2 space-x-reverse"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'جاري إعادة المحاولة...' : 'إعادة المحاولة'}</span>
              </button>
              {retryCount > 0 && (
                <p className="text-gray-500 text-xs mt-3">عدد المحاولات: {retryCount}</p>
              )}
            </div>
          </div>
        )}

        {/* رسالة عدم وجود منتجات */}
        {!isLoading && !error && readyDesigns.length === 0 && (
          <div className="flex flex-col justify-center items-center max-lg:flex-1 lg:py-20">
            <p className="text-gray-600 text-lg">لا توجد تصاميم متاحة حالياً</p>
          </div>
        )}

        {/* ========== عرض الموبايل: Carousel ========== */}
        {!isLoading && !error && readyDesigns.length > 0 && (
          <div className="lg:hidden max-lg:flex-1 max-lg:flex max-lg:flex-col max-lg:justify-center max-w-full overflow-visible">
            {/* Embla Carousel */}
            <div className="overflow-visible" ref={emblaRef}>
              <div className="flex" style={{ gap: '4px' }}>
                {readyDesigns.map((product, index) => {
                  const productImages = product.images || []
                  const currentIndex = currentImageIndexes[product.id] || 0
                  const isActive = selectedIndex === index

                  return (
                    <div
                      key={product.id}
                      className="flex-shrink-0 transition-all duration-500 ease-out"
                      style={{
                        width: '85%',
                        transform: isActive ? 'scale(1)' : 'scale(0.85)',
                        zIndex: isActive ? 10 : 1
                      }}
                    >
                      {/* Stacked cards container */}
                      <div className="relative">
                        {/* البطاقة الخلفية - تبرز من الجانبين */}
                        {isActive && (
                          <div className="absolute -inset-x-2 top-2 bottom-0 rounded-2xl bg-pink-50/40 backdrop-blur-sm border border-white/30 shadow-lg z-0 transition-all duration-500" />
                        )}
                        <Link href={`/designs/${product.id}`}>
                          <div
                            className={`relative z-10 overflow-hidden rounded-2xl transition-all duration-500 ${isActive
                              ? 'shadow-2xl'
                              : 'shadow-lg opacity-60'
                              }`}
                          >
                            {/* الصورة */}
                            <div className="aspect-[9/16] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer">
                              <img
                                src={imageLoadErrors[`${product.id}-${currentIndex}`]
                                  ? FALLBACK_IMAGE
                                  : (productImages[currentIndex] || product.image || FALLBACK_IMAGE)}
                                alt={`${product.name} - صورة ${currentIndex + 1}`}
                                className={`w-full h-full object-cover transition-all duration-500 ${isActive ? '' : 'blur-[2px] brightness-75'
                                  }`}
                                loading="lazy"
                                onError={() => {
                                  setImageLoadErrors(prev => ({
                                    ...prev,
                                    [`${product.id}-${currentIndex}`]: true
                                  }))
                                }}
                              />
                              {/* تأثير gradient على الصورة */}
                              <div className={`absolute inset-0 transition-opacity duration-500 ${isActive
                                ? 'bg-gradient-to-t from-black/40 via-transparent to-transparent'
                                : 'bg-gradient-to-t from-black/60 via-black/20 to-black/10'
                                }`} />
                            </div>

                            {/* المعلومات - تظهر فقط إذا كان هناك اسم حقيقي */}
                            {product.name && product.name !== 'منتج بدون اسم' && (
                              <div className={`p-4 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 cursor-pointer transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-50'
                                }`}>
                                <h3 className="font-bold text-gray-800 text-center text-lg line-clamp-1">
                                  {product.name}
                                </h3>
                              </div>
                            )}
                          </div>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>


          </div>
        )}

        {/* ========== عرض الديسكتوب: Grid ========== */}
        {!isLoading && !error && readyDesigns.length > 0 && (
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-8 lg:mb-12">
            {readyDesigns.map((product, index) => {
              const productImages = product.images || []
              const currentIndex = currentImageIndexes[product.id] || 0

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="group"
                >
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                    {/* الصورة */}
                    <Link href={`/designs/${product.id}`}>
                      <div
                        className="aspect-[9/16] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer"
                      >
                        {/* الصورة الحالية مع lazy loading */}
                        <img
                          src={imageLoadErrors[`${product.id}-${currentIndex}`]
                            ? FALLBACK_IMAGE
                            : (productImages[currentIndex] || product.image || FALLBACK_IMAGE)}
                          alt={`${product.name} - صورة ${currentIndex + 1}`}
                          className="w-full h-full object-cover transition-opacity duration-300"
                          loading="lazy"
                          onError={() => {
                            setImageLoadErrors(prev => ({
                              ...prev,
                              [`${product.id}-${currentIndex}`]: true
                            }))
                          }}
                        />

                        {/* أزرار التنقل - تظهر فقط إذا كان هناك أكثر من صورة */}
                        {productImages.length > 1 && (
                          <>
                            <button
                              onClick={(e) => prevCardImage(product.id, productImages.length, e)}
                              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                              aria-label="الصورة السابقة"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => nextCardImage(product.id, productImages.length, e)}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                              aria-label="الصورة التالية"
                            >
                              <ChevronLeft className="w-4 h-4" />
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
                      </div>
                    </Link>

                    {/* المعلومات - تظهر فقط إذا كان هناك اسم حقيقي */}
                    {product.name && product.name !== 'منتج بدون اسم' && (
                      <Link href={`/designs/${product.id}`}>
                        <div className="p-4 cursor-pointer hover:bg-pink-50/50 transition-colors duration-300">
                          <h3 className="font-bold text-gray-800 group-hover:text-pink-600 transition-colors duration-300 text-center text-base">
                            {product.name}
                          </h3>
                        </div>
                      </Link>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* زر عرض جميع التصاميم */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center max-lg:mt-[2vh] max-lg:pb-[1vh]"
        >
          <Link
            href="/designs"
            className="btn-primary inline-flex items-center space-x-3 space-x-reverse max-lg:text-base max-lg:py-3 max-lg:px-6 lg:text-lg font-bold"
          >
            <span>عرض جميع التصاميم</span>
          </Link>
        </motion.div>


      </div>
    </section >
  )
}
