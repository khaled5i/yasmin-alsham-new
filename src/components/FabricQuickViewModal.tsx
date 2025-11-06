'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Fabric, formatFabricPrice, getFinalPrice } from '@/store/fabricStore'

interface FabricQuickViewModalProps {
  fabric: Fabric | null
  isOpen: boolean
  onClose: () => void
}

export default function FabricQuickViewModal({ fabric, isOpen, onClose }: FabricQuickViewModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

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

  const finalPrice = getFinalPrice(fabric)
  const whatsappMessage = `مرحباً، أود الاستفسار عن القماش: ${fabric.name}`
  const whatsappLink = `https://wa.me/966500000000?text=${encodeURIComponent(whatsappMessage)}`

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
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
              className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-view-title"
            >
              <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
                {/* قسم الصور - يسار */}
                <div className="md:w-1/2 bg-gradient-to-br from-pink-50 to-purple-50 relative">
                  {/* زر الإغلاق */}
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all duration-300"
                    aria-label="إغلاق"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* الصورة مع خلفية ضبابية */}
                  <div className="relative h-80 md:h-full overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50 to-rose-50">
                    {/* خلفية ضبابية */}
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

                    {/* الصورة الأصلية */}
                    <div className="relative h-full">
                      {isExternalImage || isBase64 ? (
                        <Image
                          src={currentImage}
                          alt={`${fabric.name} - صورة ${currentImageIndex + 1}`}
                          fill
                          className="object-contain"
                          quality={90}
                        />
                      ) : (
                        <img
                          src={currentImage}
                          alt={`${fabric.name} - صورة ${currentImageIndex + 1}`}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>

                    {/* أزرار التنقل */}
                    {fabricImages.length > 1 && (
                      <>
                        <button
                          onClick={prevImage}
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all duration-300"
                          aria-label="الصورة السابقة"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                        <button
                          onClick={nextImage}
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all duration-300"
                          aria-label="الصورة التالية"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>

                        {/* مؤشرات الصور */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                          {fabricImages.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setCurrentImageIndex(index)}
                              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                currentImageIndex === index ? 'bg-white w-6' : 'bg-white/50'
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
                <div className="md:w-1/2 p-6 md:p-8 overflow-y-auto">
                  {/* الفئة */}
                  <div className="inline-block bg-gradient-to-r from-pink-100 to-purple-100 text-pink-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
                    {fabric.category}
                  </div>

                  {/* الاسم */}
                  <h2 id="quick-view-title" className="text-2xl md:text-3xl font-bold text-gray-800 mb-3">
                    {fabric.name}
                  </h2>

                  {/* السعر */}
                  <div className="mb-6">
                    {fabric.discount_percentage && fabric.discount_percentage > 0 ? (
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-bold text-pink-600">
                          {formatFabricPrice(finalPrice)}
                        </span>
                        <span className="text-xl text-gray-400 line-through">
                          {formatFabricPrice(fabric.price_per_meter)}
                        </span>
                        <span className="bg-red-500 text-white px-2 py-1 rounded-full text-sm font-bold">
                          -{fabric.discount_percentage}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-3xl font-bold text-pink-600">
                        {formatFabricPrice(fabric.price_per_meter)}
                      </div>
                    )}
                    <p className="text-sm text-gray-500 mt-1">السعر للمتر الواحد</p>
                  </div>

                  {/* الوصف */}
                  {fabric.description && (
                    <p className="text-gray-600 leading-relaxed mb-6">
                      {fabric.description}
                    </p>
                  )}

                  {/* الألوان المتاحة */}
                  {fabric.available_colors && fabric.available_colors.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">الألوان المتاحة:</h3>
                      <div className="flex flex-wrap gap-2">
                        {fabric.available_colors.map((color) => (
                          <span
                            key={color}
                            className="px-4 py-2 rounded-lg border-2 border-gray-200 text-gray-700 text-sm"
                          >
                            {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* المواصفات السريعة */}
                  <div className="mb-6 space-y-2">
                    {fabric.width && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">العرض:</span>
                        <span className="font-semibold text-gray-800">{fabric.width} سم</span>
                      </div>
                    )}
                    {fabric.composition && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">التركيب:</span>
                        <span className="font-semibold text-gray-800">{fabric.composition}</span>
                      </div>
                    )}
                    {fabric.weight && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">الوزن:</span>
                        <span className="font-semibold text-gray-800">{fabric.weight} جم/م²</span>
                      </div>
                    )}
                  </div>

                  {/* الأزرار */}
                  <div className="mt-8 space-y-3">
                    <Link
                      href={`/fabrics/${fabric.id}`}
                      className="block w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-pink-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl text-center"
                    >
                      عرض التفاصيل الكاملة
                    </Link>
                    
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full border-2 border-green-500 text-green-600 bg-transparent py-3 px-6 rounded-xl font-semibold hover:bg-green-50 transition-all duration-300 text-center"
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

