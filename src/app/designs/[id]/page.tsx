'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { ArrowRight, Star, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'
import { useShopStore, formatPrice, Product } from '@/store/shopStore'

// تحميل StockIndicator بشكل ديناميكي (Code Splitting)
const StockIndicator = dynamic(() => import('@/components/StockIndicator'), {
  ssr: false,
  loading: () => <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
})

export default function DesignDetailPage() {
  const params = useParams()
  const productId = params.id as string
  const { products, loadProducts, isLoading, getProductById } = useShopStore()

  const [product, setProduct] = useState<Product | null>(null)

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')

  // تحميل المنتجات عند تحميل الصفحة
  useEffect(() => {
    if (products.length === 0) {
      loadProducts()
    }
  }, [products.length, loadProducts])

  // البحث عن المنتج بعد تحميل المنتجات
  useEffect(() => {
    if (products.length > 0 && productId) {
      const foundProduct = getProductById(productId)
      setProduct(foundProduct || null)
    }
  }, [products, productId, getProductById])



  // تحديث المقاسات والألوان المختارة
  useEffect(() => {
    if (product?.sizes && product.sizes.length > 0) {
      setSelectedSize(product.sizes[0])
    }
    if (product?.colors && product.colors.length > 0) {
      setSelectedColor(product.colors[0])
    }
  }, [product])

  // حالة التحميل
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-pink-600 animate-spin mb-4" />
          <p className="text-gray-600">جاري تحميل التصميم...</p>
        </div>
      </div>
    )
  }

  // المنتج غير موجود
  if (!product && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">التصميم غير موجود</h1>
          <Link
            href="/designs"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى التصاميم</span>
          </Link>
        </div>
      </div>
    )
  }

  if (!product) return null



  const nextImage = () => {
    if (!product) return
    setCurrentImageIndex((prev) => (prev + 1) % (product.images?.length || 1))
  }

  const prevImage = () => {
    if (!product) return
    setCurrentImageIndex((prev) => prev === 0 ? (product.images?.length || 1) - 1 : prev - 1)
  }

  const openGallery = () => {
    setIsGalleryOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeGallery = () => {
    setIsGalleryOpen(false)
    document.body.style.overflow = 'unset'
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-12 lg:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-1 lg:py-4">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-2 lg:mb-6"
        >
          <Link
            href="/designs"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">العودة إلى التصاميم</span>
          </Link>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* معرض الصور */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="mt-12 lg:mt-0"
          >
            <div
              className="relative aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 rounded-2xl overflow-hidden mb-4 group cursor-pointer"
              onClick={openGallery}
            >
              <Image
                src={product.images?.[currentImageIndex] || '/wedding-dress-1.jpg.jpg'}
                alt={`${product.name} - صورة ${currentImageIndex + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-300"
                priority={currentImageIndex === 0}
                quality={85}
              />

              {/* أزرار التنقل */}
              {(product.images?.length || 0) > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-300 z-10"
                    aria-label="الصورة السابقة"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-300 z-10"
                    aria-label="الصورة التالية"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* صور مصغرة محسّنة */}
            {(product.images?.length || 0) > 1 && (
              <div className="relative">
                {/* عرض في صف واحد إذا كانت الصور 5 أو أقل، وصفين إذا كانت أكثر من 5 */}
                <div className={`gap-3 pb-2 ${(product.images?.length || 0) > 5
                  ? 'grid grid-cols-5'
                  : 'flex overflow-x-auto scrollbar-thin scrollbar-thumb-pink-300 scrollbar-track-pink-50'
                  }`}>
                  {product.images?.map((image, index) => (
                    <motion.button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`relative flex-shrink-0 w-20 h-24 md:w-24 md:h-28 rounded-xl overflow-hidden border-3 transition-all duration-300 ${currentImageIndex === index
                        ? 'border-pink-500 shadow-lg ring-2 ring-pink-300'
                        : 'border-gray-200 hover:border-pink-300'
                        }`}
                    >
                      <Image
                        src={image}
                        alt={`${product.name} - صورة ${index + 1}`}
                        fill
                        sizes="(max-width: 768px) 80px, 96px"
                        className="object-cover"
                        loading="lazy"
                        quality={60}
                      />
                      {currentImageIndex === index && (
                        <div className="absolute inset-0 bg-pink-500/20 pointer-events-none" />
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full">
                        {index + 1}
                      </div>
                    </motion.button>
                  ))}
                </div>
                {/* مؤشر عدد الصور */}
                {(product.images?.length || 0) > 5 && (
                  <div className="absolute -top-2 left-0 bg-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-md z-10">
                    {product.images?.length} صور
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* تفاصيل المنتج */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            {/* العنوان والفئة */}
            <div>
              <span className="bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 px-3 py-1 rounded-full text-sm font-medium">
                {product.category_name || 'فساتين'}
              </span>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-800 mt-4 mb-4">
                {product.name}
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* السعر ومؤشر التوفر */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {product.price && product.price > 0 && (
                <div className="text-3xl font-bold text-pink-600">
                  السعر : {formatPrice(product.price)}
                </div>
              )}
              <StockIndicator
                stockQuantity={product.stock_quantity}
                isAvailable={product.is_available}
                size="lg"
              />
            </div>

            {/* خيارات المقاس */}
            {product.sizes && product.sizes.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">المقاس</h3>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-4 py-2 border rounded-lg transition-all duration-300 ${selectedSize === size
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-gray-300 hover:border-pink-300'
                        }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* خيارات اللون */}
            {product.colors && product.colors.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">اللون</h3>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-4 py-2 border rounded-lg transition-all duration-300 ${selectedColor === color
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-gray-300 hover:border-pink-300'
                        }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* معلومات إضافية - يظهر فقط إذا كان هناك بيانات */}
            {(product.fabric ||
              (product.features && product.features.length > 0) ||
              (product.occasions && product.occasions.length > 0) ||
              (product.care_instructions && product.care_instructions.length > 0)) && (
                <div className="border-t border-gray-200 pt-6 space-y-4">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">تفاصيل إضافية</h3>

                  {/* نوع القماش */}
                  {product.fabric && (
                    <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2">نوع القماش</h4>
                      <p className="text-gray-700 flex items-start gap-2">
                        <span className="text-pink-500 mt-1">•</span>
                        <span>{product.fabric}</span>
                      </p>
                    </div>
                  )}

                  {/* المميزات */}
                  {product.features && product.features.length > 0 && (
                    <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                        المميزات
                      </h4>
                      <ul className="space-y-1">
                        {product.features.map((feature, index) => (
                          <li key={index} className="text-gray-700 flex items-start gap-2">
                            <span className="text-pink-500 mt-1">•</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* المناسبات */}
                  {product.occasions && product.occasions.length > 0 && (
                    <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                        المناسبات المناسبة
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {product.occasions.map((occasion, index) => (
                          <span
                            key={index}
                            className="bg-white px-3 py-1 rounded-full text-sm text-gray-700 border border-pink-200"
                          >
                            {occasion}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* تعليمات العناية */}
                  {product.care_instructions && product.care_instructions.length > 0 && (
                    <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                        تعليمات العناية
                      </h4>
                      <ul className="space-y-1">
                        {product.care_instructions.map((instruction, index) => (
                          <li key={index} className="text-gray-700 flex items-start gap-2">
                            <span className="text-pink-500 mt-1">•</span>
                            <span>{instruction}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

            {/* زر الاستفسار - يظهر دائماً أسفل التفاصيل الإضافية */}
            <a
              href={`https://wa.me/+966598862609?text=أريد استفسار عن ${product.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 px-6 border border-green-500 text-green-600 rounded-full hover:bg-green-50 transition-colors duration-300 font-medium"
            >
              استفسار عبر واتساب
            </a>
          </motion.div>
        </div>
      </div>

      {/* معرض الصور المنبثق */}
      {isGalleryOpen && product && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeGallery}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeGallery}
              className="absolute top-4 right-4 z-10 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors duration-300"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="relative w-full max-h-[80vh] aspect-[4/5]">
              <Image
                src={product.images?.[currentImageIndex] || '/wedding-dress-1.jpg.jpg'}
                alt={`${product.name} - صورة ${currentImageIndex + 1}`}
                fill
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-contain rounded-lg"
                quality={95}
                priority
              />
            </div>

            {(product.images?.length || 0) > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors duration-300"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors duration-300"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
