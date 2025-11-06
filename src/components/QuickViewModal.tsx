'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Star, ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Product, formatPrice } from '@/store/shopStore'

interface QuickViewModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

export default function QuickViewModal({ product, isOpen, onClose }: QuickViewModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')

  // إعادة تعيين الحالة عند فتح modal جديد
  useEffect(() => {
    if (product && isOpen) {
      setCurrentImageIndex(0)
      setSelectedSize(product.sizes?.[0] || '')
      setSelectedColor(product.colors?.[0] || '')
    }
  }, [product, isOpen])

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

  if (!product) return null

  const productImages = product.images || []
  const currentImage = productImages[currentImageIndex] || '/wedding-dress-1.jpg.jpg'
  const isExternalImage = currentImage.startsWith('http')
  const isBase64 = currentImage.startsWith('data:')

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % productImages.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? productImages.length - 1 : prev - 1))
  }

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
                          alt={`${product.name} - صورة ${currentImageIndex + 1}`}
                          fill
                          className="object-contain"
                          quality={90}
                        />
                      ) : (
                        <img
                          src={currentImage}
                          alt={`${product.name} - صورة ${currentImageIndex + 1}`}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>

                    {/* أزرار التنقل */}
                    {productImages.length > 1 && (
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
                          {productImages.map((_, index) => (
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
                    {product.category}
                  </div>

                  {/* الاسم */}
                  <h2 id="quick-view-title" className="text-2xl md:text-3xl font-bold text-gray-800 mb-3">
                    {product.name}
                  </h2>

                  {/* التقييم */}
                  {product.rating && (
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < product.rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-gray-600">({product.rating}/5)</span>
                    </div>
                  )}

                  {/* السعر */}
                  <div className="text-3xl font-bold text-pink-600 mb-6">
                    {formatPrice(product.price)}
                  </div>

                  {/* الوصف */}
                  <p className="text-gray-600 leading-relaxed mb-6">
                    {product.description}
                  </p>

                  {/* الألوان */}
                  {product.colors && product.colors.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">الألوان المتاحة:</h3>
                      <div className="flex flex-wrap gap-2">
                        {product.colors.map((color) => (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all duration-300 ${
                              selectedColor === color
                                ? 'border-pink-600 bg-pink-50 text-pink-700 font-semibold'
                                : 'border-gray-200 hover:border-pink-300 text-gray-700'
                            }`}
                          >
                            {color}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* المقاسات */}
                  {product.sizes && product.sizes.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">المقاسات المتاحة:</h3>
                      <div className="flex flex-wrap gap-2">
                        {product.sizes.map((size) => (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all duration-300 ${
                              selectedSize === size
                                ? 'border-pink-600 bg-pink-50 text-pink-700 font-semibold'
                                : 'border-gray-200 hover:border-pink-300 text-gray-700'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* الأزرار */}
                  <div className="mt-8">
                    <Link
                      href={`/designs/${product.id}`}
                      className="block w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-pink-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl text-center"
                    >
                      عرض التفاصيل الكاملة
                    </Link>
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

