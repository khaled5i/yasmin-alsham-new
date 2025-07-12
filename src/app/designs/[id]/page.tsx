'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Heart, ShoppingBag, Star, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { allDesigns } from '@/data/designs'
import { useShopStore, formatPrice } from '@/store/shopStore'

export default function DesignDetailPage() {
  const params = useParams()
  const designId = parseInt(params.id as string)
  const design = allDesigns.find(d => d.id === designId)

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')

  // متجر التسوق
  const { addToFavorites, removeFromFavorites, isFavorite, addToCart, removeFromCart, isInCart } = useShopStore()
  const [addedToCart, setAddedToCart] = useState(false)
  const [isClient, setIsClient] = useState(false)

  // التأكد من أن الكود يعمل على العميل فقط
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (design?.sizes && design.sizes.length > 0) {
      setSelectedSize(design.sizes[0])
    }
    if (design?.colors && design.colors.length > 0) {
      setSelectedColor(design.colors[0])
    }
  }, [design])

  if (!design) {
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

  const handleToggleFavorite = () => {
    const product = {
      id: design.id.toString(),
      name: design.title,
      price: design.price,
      image: design.images[0],
      description: design.description,
      category: design.category
    }

    if (isFavorite(product.id)) {
      removeFromFavorites(product.id)
    } else {
      addToFavorites(product)
    }
  }

  const handleAddToCart = () => {
    const product = {
      id: design.id.toString(),
      name: design.title,
      price: design.price,
      image: design.images[0],
      description: design.description,
      category: design.category
    }

    if (isInCart(product.id)) {
      // إذا كان المنتج في السلة، قم بإزالته
      removeFromCart(product.id)
      setAddedToCart(false)
      localStorage.removeItem(`addedToCart_${design.id}`)
    } else {
      // إذا لم يكن المنتج في السلة، قم بإضافته
      addToCart(product, 1, selectedSize, selectedColor)
      setAddedToCart(true)
      localStorage.setItem(`addedToCart_${design.id}`, 'true')
    }
  }

  // تحميل الحالة المحفوظة عند تحميل الصفحة
  useEffect(() => {
    const savedState = localStorage.getItem(`addedToCart_${design.id}`)
    if (savedState === 'true') {
      setAddedToCart(true)
    }
  }, [design.id])

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % design.images.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => prev === 0 ? design.images.length - 1 : prev - 1)
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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-16 lg:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 lg:mb-8"
        >
          <Link
            href="/designs"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300 fixed top-20 right-4 z-50 lg:static lg:top-auto lg:right-auto lg:z-auto"
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
            <div className="relative aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 rounded-2xl overflow-hidden mb-4">
              <img
                src={design.images[currentImageIndex]}
                alt={`${design.title} - صورة ${currentImageIndex + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                onClick={openGallery}
              />
              
              {/* أزرار التنقل */}
              {design.images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-300"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-300"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* صور مصغرة */}
            {design.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {design.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-20 h-24 rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                      currentImageIndex === index ? 'border-pink-500' : 'border-gray-200'
                    }`}
                  >
                    <img
                      src={image}
                      alt={`${design.title} - صورة ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
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
                {design.category}
              </span>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-800 mt-4 mb-4">
                {design.title}
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed">
                {design.description}
              </p>
            </div>

            {/* السعر */}
            <div className="text-3xl font-bold text-pink-600">
              السعر : {formatPrice(design.price)}
            </div>

            {/* خيارات المقاس */}
            {design.sizes && design.sizes.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">المقاس</h3>
                <div className="flex flex-wrap gap-2">
                  {design.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-4 py-2 border rounded-lg transition-all duration-300 ${
                        selectedSize === size
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
            {design.colors && design.colors.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">اللون</h3>
                <div className="flex flex-wrap gap-2">
                  {design.colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-4 py-2 border rounded-lg transition-all duration-300 ${
                        selectedColor === color
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

            {/* أزرار الإجراءات */}
            <div className="flex gap-4">
              <button
                onClick={handleAddToCart}
                className={`flex-1 flex items-center justify-center space-x-2 space-x-reverse py-3 px-6 rounded-full text-lg font-medium transition-all duration-300 ${
                  isClient && isInCart(design.id.toString())
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-lg'
                }`}
              >
                <ShoppingBag className="w-5 h-5" />
                <span>{isClient && isInCart(design.id.toString()) ? 'أزل من السلة' : 'أضف للسلة'}</span>
              </button>

              <button
                onClick={handleToggleFavorite}
                className={`p-3 rounded-full border-2 transition-all duration-300 ${
                  isClient && isFavorite(design.id.toString())
                    ? 'border-red-500 bg-red-500 text-white'
                    : 'border-pink-300 text-pink-600 hover:bg-pink-50'
                }`}
              >
                <Heart className={`w-6 h-6 ${isClient && isFavorite(design.id.toString()) ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* زر الاستفسار */}
            <a
              href={`https://wa.me/+966598862609?text=أريد استفسار عن ${design.title}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 px-6 border border-green-500 text-green-600 rounded-full hover:bg-green-50 transition-colors duration-300 font-medium"
            >
              استفسار عبر واتساب
            </a>
          </motion.div>
        </div>

        {/* معرض الصور المنبثق */}
        {isGalleryOpen && (
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

              <img
                src={design.images[currentImageIndex]}
                alt={`${design.title} - صورة ${currentImageIndex + 1}`}
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              />

              {design.images.length > 1 && (
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
    </div>
  )
}
