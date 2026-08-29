'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight, X, Loader2, Palette, MessageCircle } from 'lucide-react'
import { useFabricStore, formatFabricPrice, Fabric, getFinalPrice } from '@/store/fabricStore'
import { getFabricDisplayPricing } from '@/lib/fabric-display-pricing'
import { isVideoFile } from '@/lib/utils/media'
import { formatFabricNumber } from '@/lib/fabric-number-format'

export default function FabricDetailPage() {
  const params = useParams()
  const fabricId = params.id as string
  const { fabrics, loadFabrics, isLoading, getFabricById } = useFabricStore()

  const [fabric, setFabric] = useState<Fabric | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState('')
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const MIN_SWIPE_DISTANCE = 50

  useEffect(() => {
    if (fabrics.length === 0) loadFabrics()
  }, [fabrics.length, loadFabrics])

  useEffect(() => {
    if (fabrics.length > 0 && fabricId) {
      const foundFabric = getFabricById(fabricId)
      setFabric(foundFabric || null)
    }
  }, [fabrics, fabricId, getFabricById])

  useEffect(() => {
    if (fabric?.available_colors && fabric.available_colors.length > 0) {
      setSelectedColor(fabric.available_colors[0])
    }
  }, [fabric])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fbf8f3] pt-20 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-[#6b1726] animate-spin mb-4" />
          <p className="text-[#211b19]/70">جاري تحميل القماش...</p>
        </div>
      </div>
    )
  }

  if (!fabric && !isLoading) {
    return (
      <div className="min-h-screen bg-[#fbf8f3] pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#211b19] mb-4">القماش غير موجود</h1>
          <Link href="/fabrics" className="inline-flex items-center space-x-2 space-x-reverse text-[#6b1726] hover:text-[#2f0c14] transition-colors duration-300">
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى متجر الأقمشة</span>
          </Link>
        </div>
      </div>
    )
  }

  if (!fabric) return null

  const nextImage = () => {
    if (!fabric) return
    setCurrentImageIndex((prev) => (prev + 1) % (fabric.images?.length || 1))
  }

  const prevImage = () => {
    if (!fabric) return
    setCurrentImageIndex((prev) => prev === 0 ? (fabric.images?.length || 1) - 1 : prev - 1)
  }

  const openGallery = () => {
    setIsGalleryOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeGallery = () => {
    setIsGalleryOpen(false)
    document.body.style.overflow = 'unset'
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX
    const distance = touchStartX.current - touchEndX.current
    if (Math.abs(distance) >= MIN_SWIPE_DISTANCE) {
      if (distance > 0) nextImage()
      else prevImage()
    }
  }

  const finalPrice = getFinalPrice(fabric)
  const displayedFinalPrice = getFabricDisplayPricing(finalPrice, fabric.stock_quantity)
  const displayedOriginalPrice = getFabricDisplayPricing(
    fabric.price_per_meter,
    fabric.stock_quantity
  )

  // رابط واتساب للاستفسار
  const fabricLabel = fabric.name || fabric.fabric_code || 'قماش'
  const whatsappMessage = `مرحباً، أود الاستفسار عن القماش: ${fabricLabel}`
  const whatsappLink = `https://wa.me/966502901534?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <div className="min-h-screen bg-[#fbf8f3] text-[#211b19] pt-16 lg:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link
            href="/fabrics"
            className="inline-flex items-center space-x-2 space-x-reverse text-[#6b1726] hover:text-[#2f0c14] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى متجر الأقمشة</span>
          </Link>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
            <div
              className={`relative ${isVideoFile(fabric.images?.[currentImageIndex] || '') ? 'bg-[#2f0c14]/5' : 'aspect-[4/5] bg-gradient-to-br from-[#d8c5ae]/55 via-[#f6f0e8] to-[#d8c5ae]/35'} rounded-2xl overflow-hidden mb-4 group cursor-pointer border border-[#d8c5ae]/60`}
              onClick={openGallery}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {isVideoFile(fabric.images?.[currentImageIndex] || '') ? (
                <video
                  src={fabric.images?.[currentImageIndex]}
                  controls
                  preload="metadata"
                  className="w-full object-contain rounded-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <Image
                  src={fabric.images?.[currentImageIndex] || fabric.image_url || '/wedding-dress-1.jpg.jpg'}
                  alt={`${fabricLabel} - صورة ${currentImageIndex + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain transition-transform duration-300"
                  priority={currentImageIndex === 0}
                  quality={85}
                />
              )}

              {(fabric.images?.length || 0) > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); nextImage() }} className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-[#2f0c14]/65 hover:bg-[#2f0c14]/85 text-[#f6f0e8] rounded-full p-2 transition-all duration-300 z-10" aria-label="الصورة التالية">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); prevImage() }} className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-[#2f0c14]/65 hover:bg-[#2f0c14]/85 text-[#f6f0e8] rounded-full p-2 transition-all duration-300 z-10" aria-label="الصورة السابقة">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* صور مصغرة محسّنة */}
            {(fabric.images?.length || 0) > 1 && (
              <div className="relative">
                {/* عرض في صف واحد إذا كانت الصور 5 أو أقل، وصفين إذا كانت أكثر من 5 */}
                <div className={`gap-3 pb-2 ${(fabric.images?.length || 0) > 5
                  ? 'grid grid-cols-5'
                  : 'flex overflow-x-auto scrollbar-thin scrollbar-thumb-[#6b1726] scrollbar-track-[#f6f0e8]'
                  }`}>
                  {fabric.images?.map((image, index) => (
                    <motion.button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`relative flex-shrink-0 w-20 h-24 md:w-24 md:h-28 rounded-xl overflow-hidden border-3 transition-all duration-300 ${currentImageIndex === index
                        ? 'border-[#6b1726] shadow-lg ring-2 ring-[#d8c5ae]'
                        : 'border-[#d8c5ae] hover:border-[#6b1726]'
                        }`}
                    >
                      {isVideoFile(image) ? (
                        <video
                          src={image}
                          muted
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <Image
                          src={image}
                          alt={`${fabricLabel} - صورة ${index + 1}`}
                          fill
                          sizes="(max-width: 768px) 80px, 96px"
                          className="object-cover"
                          loading="lazy"
                          quality={60}
                        />
                      )}
                      {currentImageIndex === index && (
                        <div className="absolute inset-0 bg-[#6b1726]/20 pointer-events-none" />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="space-y-6">
            <div>
              <div className="flex flex-wrap gap-2">
                {(fabric.categories?.length ? fabric.categories : [fabric.category]).map(category => (
                  <span
                    key={category}
                    className="bg-[#f6f0e8] text-[#6b1726] border border-[#d8c5ae]/70 px-3 py-1 rounded-full text-sm font-medium"
                  >
                    {category}
                  </span>
                ))}
              </div>
              {fabric.name && (
                <h1 className="text-3xl lg:text-4xl font-bold text-[#211b19] mt-4 mb-4">{fabric.name}</h1>
              )}
              {fabric.fabric_code && (
                <p dir="ltr" className="mt-4 text-right font-mono text-lg font-bold tracking-wider text-[#6b1726]">
                  {fabric.fabric_code}
                </p>
              )}
              {fabric.description && (
                <p className="mt-3 text-lg text-[#211b19]/70 leading-relaxed whitespace-pre-wrap">{fabric.description}</p>
              )}
              {fabric.show_stock_quantity && (
                <p className="mt-3 inline-flex rounded-full bg-[#f6f0e8] border border-[#d8c5ae]/70 px-4 py-2 text-sm font-bold text-[#6b1726]">
                  الكمية المتوفرة: {formatFabricNumber(fabric.stock_quantity)} متر
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {fabric.price_per_meter && fabric.price_per_meter > 0 && (
                <div className="text-3xl font-bold text-[#6b1726]">
                  {fabric.is_on_sale ? (
                    <div className="flex items-center gap-3">
                      <span>{formatFabricPrice(displayedFinalPrice.amount, displayedFinalPrice.unit)}</span>
                      <span className="text-xl text-[#211b19]/40 line-through">{formatFabricPrice(displayedOriginalPrice.amount, displayedOriginalPrice.unit)}</span>
                      <span className="bg-[#6b1726] text-[#f6f0e8] text-sm px-2 py-1 rounded-full">خصم {fabric.discount_percentage}%</span>
                    </div>
                  ) : (
                    <span>{formatFabricPrice(displayedOriginalPrice.amount, displayedOriginalPrice.unit)}</span>
                  )}
                </div>
              )}
            </div>

            {fabric.available_colors && fabric.available_colors.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-[#211b19] mb-3 flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  الألوان المتاحة
                </h3>
                <div className="flex flex-wrap gap-2">
                  {fabric.available_colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-4 py-2 rounded-lg border-2 transition-all duration-300 ${selectedColor === color ? 'border-[#6b1726] bg-[#f6f0e8] text-[#6b1726] font-bold' : 'border-[#d8c5ae] hover:border-[#6b1726] text-[#211b19]/80'
                        }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}


            {/* زر الاستفسار عبر الواتساب */}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full border-2 border-[#6b1726] text-[#6b1726] bg-transparent text-center px-8 py-4 rounded-full font-bold hover:bg-[#f6f0e8] hover:shadow-xl transition-all duration-300 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
            >
              <MessageCircle className="w-6 h-6" />
              <span>استفسار عبر الواتساب</span>
            </a>
          </motion.div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      {isGalleryOpen && (
        <div className="fixed inset-0 bg-[#2f0c14]/95 z-50 flex items-center justify-center p-4" onClick={closeGallery}>
          <button onClick={closeGallery} className="absolute top-4 right-4 text-[#f6f0e8] hover:text-[#d8c5ae] transition-colors duration-300 z-10" aria-label="إغلاق">
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative max-w-5xl w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {isVideoFile(fabric.images?.[currentImageIndex] || '') ? (
              <video
                src={fabric.images?.[currentImageIndex]}
                controls
                preload="metadata"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <Image
                src={fabric.images?.[currentImageIndex] || fabric.image_url || '/wedding-dress-1.jpg.jpg'}
                alt={`${fabricLabel} - صورة ${currentImageIndex + 1}`}
                fill
                sizes="100vw"
                className="object-contain"
                quality={95}
              />
            )}
            {(fabric.images?.length || 0) > 1 && (
              <>
                <button onClick={nextImage} className="absolute left-4 bg-[#f6f0e8]/20 hover:bg-[#f6f0e8]/30 text-[#f6f0e8] rounded-full p-3 transition-all duration-300" aria-label="الصورة التالية">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={prevImage} className="absolute right-4 bg-[#f6f0e8]/20 hover:bg-[#f6f0e8]/30 text-[#f6f0e8] rounded-full p-3 transition-all duration-300" aria-label="الصورة السابقة">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

