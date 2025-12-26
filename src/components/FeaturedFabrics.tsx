'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Palette, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useFabricStore } from '@/store/fabricStore'
import useEmblaCarousel from 'embla-carousel-react'

// صورة احتياطية عند فشل تحميل الصورة
const FALLBACK_IMAGE = '/yasmin.jpg'

export default function FeaturedFabrics() {
  const { fabrics, loadFabrics, isLoading } = useFabricStore()
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{ [key: string]: number }>({})
  const [imageLoadErrors, setImageLoadErrors] = useState<{ [key: string]: boolean }>({})

  // Embla Carousel للموبايل
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'center',
    skipSnaps: false,
    dragFree: false,
    containScroll: false,
    direction: 'rtl'
  })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  // تحميل الأقمشة عند تحميل المكون
  useEffect(() => {
    loadFabrics(false)
  }, [loadFabrics])

  // متابعة تغيير الـ slide الحالي وحالة التنقل
  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
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

  // التنقل في الـ Carousel
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  const scrollTo = useCallback((index: number) => {
    if (emblaApi) emblaApi.scrollTo(index)
  }, [emblaApi])

  // تحديث مؤشرات الصور عند تحميل الأقمشة
  useEffect(() => {
    if (fabrics.length > 0) {
      const initialIndexes: { [key: string]: number } = {}
      fabrics.filter(f => f.is_featured && f.is_available).slice(0, 4).forEach(fabric => {
        initialIndexes[fabric.id] = 0
      })
      setCurrentImageIndexes(initialIndexes)
    }
  }, [fabrics])

  // أول 4 أقمشة متاحة ومميزة
  const featuredFabrics = fabrics
    .filter(f => f.is_featured && f.is_available)
    .slice(0, 4)

  // دوال التنقل بين صور البطاقة
  const nextCardImage = (fabricId: string, totalImages: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [fabricId]: ((prev[fabricId] || 0) + 1) % totalImages
    }))
  }

  const prevCardImage = (fabricId: string, totalImages: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [fabricId]: (prev[fabricId] || 0) === 0 ? totalImages - 1 : (prev[fabricId] || 0) - 1
    }))
  }

  const setCardImage = (fabricId: string, imageIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [fabricId]: imageIndex
    }))
  }

  return (
    <section id="featured-fabrics" className="py-12 lg:py-20 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 max-lg:min-h-screen max-lg:h-screen max-lg:snap-start max-lg:snap-always max-lg:flex max-lg:flex-col max-lg:justify-between max-lg:overflow-hidden max-lg:overflow-x-hidden max-lg:pt-[10vh] max-lg:pb-[2vh]">
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 max-lg:flex max-lg:flex-col max-lg:h-full max-lg:justify-between">
        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center max-lg:mb-[1.5vh] lg:mb-16"
        >
          <h2 className="max-lg:text-[clamp(1.75rem,5.5vw,2.25rem)] lg:text-5xl font-bold">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              متجر الأقمشة
            </span>
          </h2>
        </motion.div>

        {/* حالة التحميل */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
            <span className="mr-3 text-gray-600">جاري تحميل الأقمشة...</span>
          </div>
        )}

        {/* رسالة عدم وجود أقمشة */}
        {!isLoading && featuredFabrics.length === 0 && (
          <div className="flex flex-col justify-center items-center max-lg:flex-1 lg:py-20">
            <p className="text-gray-600 text-lg">لا توجد أقمشة مميزة متاحة حالياً</p>
          </div>
        )}

        {/* ========== عرض الموبايل: Carousel ========== */}
        {!isLoading && featuredFabrics.length > 0 && (
          <div className="lg:hidden max-lg:flex-1 max-lg:flex max-lg:flex-col max-lg:justify-center max-w-full overflow-x-hidden">
            {/* Embla Carousel */}
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex" style={{ gap: '4px' }}>
                {featuredFabrics.map((fabric, index) => {
                  const fabricImages = fabric.images || []
                  const currentIndex = currentImageIndexes[fabric.id] || 0
                  const isActive = selectedIndex === index

                  return (
                    <div
                      key={fabric.id}
                      className="flex-shrink-0 transition-all duration-500 ease-out"
                      style={{
                        width: '85%',
                        transform: isActive ? 'scale(1)' : 'scale(0.85)',
                        zIndex: isActive ? 10 : 1
                      }}
                    >
                      <div
                        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 transition-all duration-500 ${isActive
                          ? 'shadow-2xl'
                          : 'shadow-lg opacity-60'
                          }`}
                      >
                        {/* الصورة */}
                        <Link href={`/fabrics/${fabric.id}`}>
                          <div className="aspect-[3/4] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer">
                            <img
                              src={imageLoadErrors[`${fabric.id}-${currentIndex}`]
                                ? FALLBACK_IMAGE
                                : (fabricImages[currentIndex] || fabric.image_url || FALLBACK_IMAGE)}
                              alt={`${fabric.name} - صورة ${currentIndex + 1}`}
                              className={`w-full h-full object-cover transition-all duration-500 ${isActive ? '' : 'blur-[2px] brightness-75'
                                }`}
                              loading="lazy"
                              onError={() => {
                                setImageLoadErrors(prev => ({
                                  ...prev,
                                  [`${fabric.id}-${currentIndex}`]: true
                                }))
                              }}
                            />
                            {/* تأثير gradient على الصورة */}
                            <div className={`absolute inset-0 transition-opacity duration-500 ${isActive
                              ? 'bg-gradient-to-t from-black/40 via-transparent to-transparent'
                              : 'bg-gradient-to-t from-black/60 via-black/20 to-black/10'
                              }`} />

                            {/* شارة الفئة */}
                            <div className="absolute top-2 right-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                              {fabric.category}
                            </div>
                          </div>
                        </Link>

                        {/* المعلومات */}
                        <Link href={`/fabrics/${fabric.id}`}>
                          <div className={`p-4 cursor-pointer transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-50'
                            }`}>
                            <h3 className="font-bold text-gray-800 text-center text-lg line-clamp-1">
                              {fabric.name}
                            </h3>
                            <p className="text-sm text-gray-600 text-center mt-1 line-clamp-2">
                              {fabric.description}
                            </p>
                          </div>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* أزرار التنقل */}
            <div className="flex justify-center items-center gap-4 mt-4">
              {/* زر السابق (يمين) - يختفي عند الوصول للبداية */}
              <button
                onClick={scrollPrev}
                disabled={!canScrollPrev}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${canScrollPrev
                  ? 'bg-pink-100 hover:bg-pink-200 text-pink-600'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-0 pointer-events-none'
                  }`}
                aria-label="السابق"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* مؤشرات النقاط */}
              <div className="flex gap-2">
                {featuredFabrics.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollTo(index)}
                    className={`h-2.5 rounded-full transition-all duration-300 ${selectedIndex === index
                      ? 'bg-pink-600 w-6'
                      : 'bg-pink-300 hover:bg-pink-400 w-2.5'
                      }`}
                    aria-label={`الانتقال للقماش ${index + 1}`}
                  />
                ))}
              </div>

              {/* زر التالي (يسار) - يختفي عند الوصول للنهاية */}
              <button
                onClick={scrollNext}
                disabled={!canScrollNext}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${canScrollNext
                  ? 'bg-pink-100 hover:bg-pink-200 text-pink-600'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-0 pointer-events-none'
                  }`}
                aria-label="التالي"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ========== عرض الديسكتوب: Grid ========== */}
        {!isLoading && featuredFabrics.length > 0 && (
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-8 lg:mb-12">
            {featuredFabrics.map((fabric, index) => {
              const fabricImages = fabric.images || []
              const currentIndex = currentImageIndexes[fabric.id] || 0

              return (
                <motion.div
                  key={fabric.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="group"
                >
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                    {/* الصورة */}
                    <Link href={`/fabrics/${fabric.id}`}>
                      <div
                        className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer"
                      >
                        {/* الصورة الحالية */}
                        <img
                          src={fabricImages[currentIndex] || fabric.image_url || FALLBACK_IMAGE}
                          alt={`${fabric.name} - صورة ${currentIndex + 1}`}
                          className="w-full h-full object-cover transition-opacity duration-300"
                          loading="lazy"
                        />

                        {/* أزرار التنقل - تظهر فقط إذا كان هناك أكثر من صورة */}
                        {fabricImages.length > 1 && (
                          <>
                            <button
                              onClick={(e) => prevCardImage(fabric.id, fabricImages.length, e)}
                              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                              aria-label="الصورة السابقة"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => nextCardImage(fabric.id, fabricImages.length, e)}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                              aria-label="الصورة التالية"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>

                            {/* مؤشرات الصور */}
                            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1 space-x-reverse opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              {fabricImages.map((_, imgIndex) => (
                                <button
                                  key={imgIndex}
                                  onClick={(e) => setCardImage(fabric.id, imgIndex, e)}
                                  className={`w-2 h-2 rounded-full transition-colors duration-300 ${currentIndex === imgIndex ? 'bg-white' : 'bg-white/50'
                                    }`}
                                  aria-label={`عرض الصورة ${imgIndex + 1}`}
                                />
                              ))}
                            </div>
                          </>
                        )}

                        {/* شارة الفئة */}
                        <div className="absolute top-2 right-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                          {fabric.category}
                        </div>
                      </div>
                    </Link>

                    {/* المعلومات - بدون السعر */}
                    <Link href={`/fabrics/${fabric.id}`}>
                      <div className="p-4 cursor-pointer hover:bg-pink-50/50 transition-colors duration-300">
                        <h3 className="font-bold text-gray-800 group-hover:text-pink-600 transition-colors duration-300 text-center text-base">
                          {fabric.name}
                        </h3>

                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 text-center mt-1">
                          {fabric.description}
                        </p>
                      </div>
                    </Link>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* زر عرض جميع الأقمشة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center max-lg:mt-[2vh] max-lg:pb-[1vh]"
        >
          <Link
            href="/fabrics"
            className="btn-primary inline-flex items-center space-x-3 space-x-reverse max-lg:text-base max-lg:py-3 max-lg:px-6 lg:text-lg font-bold"
          >
            <span>عرض جميع الأقمشة</span>
          </Link>
        </motion.div>

      </div>
    </section>
  )
}

