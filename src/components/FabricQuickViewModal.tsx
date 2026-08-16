'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Fabric, formatFabricPrice, getFinalPrice } from '@/store/fabricStore'
import { isVideoFile } from '@/lib/utils/media'
import { formatFabricNumber } from '@/lib/fabric-number-format'

interface FabricQuickViewModalProps {
  fabric: Fabric | null
  isOpen: boolean
  onClose: () => void
}

export default function FabricQuickViewModal({ fabric, isOpen, onClose }: FabricQuickViewModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const MIN_SWIPE_DISTANCE = 50

  // إعادة تعيين الحالة عند فتح modal جديد
  useEffect(() => {
    if (fabric && isOpen) {
      setCurrentImageIndex(0)
    }
  }, [fabric, isOpen])

  // منع التمرير عند فتح Modal
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // إغلاق عند الضغط على Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
    }
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!fabric) return null

  const fabricImages = fabric.images || []
  const currentImage = fabricImages[currentImageIndex] || '/fabric-placeholder.jpg'
  const isExternalImage = currentImage.startsWith('http')
  const isBase64 = currentImage.startsWith('data:')

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % fabricImages.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? fabricImages.length - 1 : prev - 1))
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
  const fabricLabel = fabric.name || fabric.fabric_code || 'قماش'
  const whatsappMessage = `مرحباً، أود الاستفسار عن القماش: ${fabricLabel}`
  const whatsappLink = `https://wa.me/966502901534?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#2f0c14]/65 backdrop-blur-sm z-50"
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#fbf8f3] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-view-title"
            >
              <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
                {/* قسم الصور - يسار */}
                <div className="md:w-1/2 bg-[#f6f0e8] relative">
                  {/* زر الإغلاق */}
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 bg-[#f6f0e8]/90 hover:bg-[#6b1726] text-[#6b1726] hover:text-[#f6f0e8] rounded-full p-2 shadow-lg transition-all duration-300"
                    aria-label="إغلاق"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* الصورة مع خلفية ضبابية */}
                  <div
                    className="relative h-80 md:h-full overflow-hidden bg-gradient-to-br from-[#f6f0e8] via-[#fbf8f3] to-[#d8c5ae]/45"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    {/* خلفية ضبابية */}
                    {!isVideoFile(currentImage) && (
                      <div className="absolute inset-0">
                        {isExternalImage || isBase64 ? (
                          <Image
                            src={currentImage}
                            alt=""
                            fill
                            className="object-cover blur-2xl scale-110 opacity-40"
                            quality={50}
                            aria-hidden="true"
                          />
                        ) : (
                          <img
                            src={currentImage}
                            alt=""
                            className="w-full h-full object-cover blur-2xl scale-110 opacity-40"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    )}

                    {/* الصورة/الفيديو الأصلي */}
                    <div className="relative h-full">
                      {isVideoFile(currentImage) ? (
                        <video
                          src={currentImage}
                          controls
                          preload="metadata"
                          className="w-full h-full object-contain"
                        />
                      ) : (isExternalImage || isBase64) ? (
                        <Image
                          src={currentImage}
                          alt={`${fabricLabel} - صورة ${currentImageIndex + 1}`}
                          fill
                          className="object-contain"
                          quality={90}
                        />
                      ) : (
                        <img
                          src={currentImage}
                          alt={`${fabricLabel} - صورة ${currentImageIndex + 1}`}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>

                    {/* أزرار التنقل */}
                    {fabricImages.length > 1 && (
                      <>
                        <button
                          onClick={nextImage}
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-[#f6f0e8]/90 hover:bg-[#6b1726] text-[#6b1726] hover:text-[#f6f0e8] rounded-full p-2 shadow-lg transition-all duration-300"
                          aria-label="الصورة التالية"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={prevImage}
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#f6f0e8]/90 hover:bg-[#6b1726] text-[#6b1726] hover:text-[#f6f0e8] rounded-full p-2 shadow-lg transition-all duration-300"
                          aria-label="الصورة السابقة"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>

                        {/* مؤشرات الصور */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                          {fabricImages.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setCurrentImageIndex(index)}
                              className={`w-2 h-2 rounded-full transition-all duration-300 ${currentImageIndex === index ? 'bg-[#f6f0e8] w-6' : 'bg-[#f6f0e8]/50'
                                }`}
                              aria-label={`عرض الصورة ${index + 1}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* قسم المعلومات - يمين */}
                <div className="md:w-1/2 bg-[#fbf8f3] p-6 md:p-8 overflow-y-auto">
                  {/* الفئة */}
                  <div className="inline-block bg-[#f6f0e8] text-[#6b1726] border border-[#d8c5ae]/70 px-3 py-1 rounded-full text-xs font-semibold mb-4">
                    {fabric.category}
                  </div>

                  {fabric.name && (
                    <h2 id="quick-view-title" className="text-2xl md:text-3xl font-bold text-[#211b19] mb-3">
                      {fabric.name}
                    </h2>
                  )}
                  {fabric.fabric_code && (
                    <p dir="ltr" className="mb-2 text-right font-mono text-sm font-bold tracking-wide text-[#6b1726]">
                      {fabric.fabric_code}
                    </p>
                  )}
                  {fabric.show_stock_quantity && (
                    <p className="mb-3 text-sm font-bold text-[#6b1726]">المتوفر: {formatFabricNumber(fabric.stock_quantity)} متر</p>
                  )}

                  {/* السعر وحالة التوفر */}
                  <div className="mb-6">
                    {/* نسخة سطح المكتب - السعر فقط */}
                    <div className="hidden md:block">
                      {fabric.discount_percentage && fabric.discount_percentage > 0 ? (
                        <div className="flex items-center gap-3">
                          <span className="text-3xl font-bold text-[#6b1726]">
                            {formatFabricPrice(finalPrice)}
                          </span>
                          <span className="text-xl text-[#211b19]/40 line-through">
                            {formatFabricPrice(fabric.price_per_meter)}
                          </span>
                          <span className="bg-[#6b1726] text-[#f6f0e8] px-2 py-1 rounded-full text-sm font-bold">
                            -{fabric.discount_percentage}%
                          </span>
                        </div>
                      ) : (
                        <div className="text-3xl font-bold text-[#6b1726]">
                          {formatFabricPrice(fabric.price_per_meter)}
                        </div>
                      )}
                      <p className="text-sm text-[#211b19]/55 mt-1">السعر للمتر الواحد</p>
                    </div>

                    {/* نسخة الجوال - السعر وحالة التوفر في نفس السطر */}
                    <div className="md:hidden">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        {fabric.discount_percentage && fabric.discount_percentage > 0 ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-2xl font-bold text-[#6b1726]">
                              {formatFabricPrice(finalPrice)}
                            </span>
                            <span className="text-lg text-[#211b19]/40 line-through">
                              {formatFabricPrice(fabric.price_per_meter)}
                            </span>
                            <span className="bg-[#6b1726] text-[#f6f0e8] px-2 py-1 rounded-full text-xs font-bold">
                              -{fabric.discount_percentage}%
                            </span>
                          </div>
                        ) : (
                          <div className="text-2xl font-bold text-[#6b1726]">
                            {formatFabricPrice(fabric.price_per_meter)}
                          </div>
                        )}

                        {/* حالة التوفر */}
                        <div className={`px-3 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap ${fabric.is_available ? 'bg-[#f6f0e8] text-[#6b1726] border-[#d8c5ae]' : 'bg-[#6b1726] text-[#f6f0e8] border-[#6b1726]'
                          }`}>
                          {fabric.is_available ? 'متوفر' : 'غير متوفر'}
                        </div>
                      </div>
                      <p className="text-xs text-[#211b19]/55">السعر للمتر الواحد</p>
                    </div>

                    {/* حالة التوفر لسطح المكتب */}
                    <div className="hidden md:block mt-3">
                      <div className={`inline-block px-4 py-2 rounded-full border text-sm font-bold ${fabric.is_available ? 'bg-[#f6f0e8] text-[#6b1726] border-[#d8c5ae]' : 'bg-[#6b1726] text-[#f6f0e8] border-[#6b1726]'
                        }`}>
                        {fabric.is_available ? 'متوفر' : 'غير متوفر'}
                      </div>
                    </div>
                  </div>

                  {/* الوصف */}
                  {fabric.description && (
                    <p className="text-[#211b19]/70 leading-relaxed mb-6">
                      {fabric.description}
                    </p>
                  )}

                  {/* الألوان المتاحة */}
                  {fabric.available_colors && fabric.available_colors.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-[#211b19] mb-3">الألوان المتاحة:</h3>
                      <div className="flex flex-wrap gap-2">
                        {fabric.available_colors.map((color) => (
                          <span
                            key={color}
                            className="px-4 py-2 rounded-lg border-2 border-[#d8c5ae] bg-[#f6f0e8] text-[#211b19]/80 text-sm"
                          >
                            {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* تفاصيل إضافية */}
                  <div className="border-t border-[#d8c5ae]/70 pt-6 space-y-4">
                    <h3 className="text-lg font-bold text-[#211b19] mb-4">تفاصيل إضافية</h3>

                    {/* نوع القماش */}
                    {fabric.type && (
                      <div className="bg-[#f6f0e8] border border-[#d8c5ae]/60 rounded-lg p-4">
                        <h4 className="font-semibold text-[#211b19] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#6b1726] rounded-full"></span>
                          نوع القماش
                        </h4>
                        <p className="text-[#211b19]/80">{fabric.type}</p>
                      </div>
                    )}

                    {/* المميزات */}
                    {fabric.features && fabric.features.length > 0 && (
                      <div className="bg-[#f6f0e8] border border-[#d8c5ae]/60 rounded-lg p-4">
                        <h4 className="font-semibold text-[#211b19] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#6b1726] rounded-full"></span>
                          المميزات
                        </h4>
                        <ul className="space-y-1">
                          {fabric.features.map((feature, index) => (
                            <li key={index} className="text-[#211b19]/80 flex items-start gap-2">
                              <span className="text-[#6b1726] mt-1">•</span>
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* مناسب لـ */}
                    {fabric.suitable_for && fabric.suitable_for.length > 0 && (
                      <div className="bg-[#f6f0e8] border border-[#d8c5ae]/60 rounded-lg p-4">
                        <h4 className="font-semibold text-[#211b19] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#6b1726] rounded-full"></span>
                          مناسب لـ
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {fabric.suitable_for.map((item, index) => (
                            <span
                              key={index}
                              className="bg-[#fbf8f3] px-3 py-1 rounded-full text-sm text-[#211b19]/80 border border-[#d8c5ae]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* المناسبات */}
                    {fabric.occasions && fabric.occasions.length > 0 && (
                      <div className="bg-[#f6f0e8] border border-[#d8c5ae]/60 rounded-lg p-4">
                        <h4 className="font-semibold text-[#211b19] mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#6b1726] rounded-full"></span>
                          المناسبات المناسبة
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {fabric.occasions.map((occasion, index) => (
                            <span
                              key={index}
                              className="bg-[#fbf8f3] px-3 py-1 rounded-full text-sm text-[#211b19]/80 border border-[#d8c5ae]"
                            >
                              {occasion}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* الأزرار */}
                  <div className="mt-8 space-y-3">
                    <Link
                      href={`/fabrics/${fabric.id}`}
                      className="block w-full bg-[#6b1726] hover:bg-[#2f0c14] text-[#f6f0e8] py-3 px-6 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                    >
                      عرض التفاصيل الكاملة
                    </Link>

                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full border-2 border-[#6b1726] text-[#6b1726] bg-transparent py-3 px-6 rounded-xl font-semibold hover:bg-[#f6f0e8] transition-all duration-300 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>استفسار عبر الواتساب</span>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

