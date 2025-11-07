'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Star, Palette, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useShopStore } from '@/store/shopStore'

export default function ReadyDesigns() {
  const { products, loadProducts, isLoading } = useShopStore()
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{[key: string]: number}>({})

  // تحميل المنتجات عند تحميل المكون
  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // تحديث مؤشرات الصور عند تحميل المنتجات
  useEffect(() => {
    if (products.length > 0) {
      const initialIndexes: {[key: string]: number} = {}
      products.slice(0, 4).forEach(product => {
        initialIndexes[product.id] = 0
      })
      setCurrentImageIndexes(initialIndexes)
    }
  }, [products])

  // أول 4 منتجات متاحة ومميزة
  const readyDesigns = products
    .filter(p => p.is_available)
    .slice(0, 4)

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
    <section id="ready-designs" className="py-20 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              تصاميمنا الجاهزة
            </span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed mb-6">
            مجموعة مختارة من أجمل تصاميمنا الجاهزة التي يمكنك طلبها مباشرة أو تخصيصها حسب ذوقك
          </p>

          {/* ملاحظة مهمة */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 max-w-2xl mx-auto">
            <p className="text-green-800 font-medium text-center">
              ✨ الفساتين الجاهزة متوفرة للشراء المباشر - لا يتطلب حجز موعد
            </p>
          </div>
        </motion.div>

        {/* حالة التحميل */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
            <span className="mr-3 text-gray-600">جاري تحميل التصاميم...</span>
          </div>
        )}

        {/* رسالة عدم وجود منتجات */}
        {!isLoading && readyDesigns.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-600 text-lg">لا توجد تصاميم متاحة حالياً</p>
          </div>
        )}

        {/* شبكة التصاميم */}
        {!isLoading && readyDesigns.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mb-12">
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
                        className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer"
                      >
                        {/* الصورة الحالية */}
                        <img
                          src={productImages[currentIndex] || '/wedding-dress-1.jpg.jpg'}
                          alt={`${product.name} - صورة ${currentIndex + 1}`}
                          className="w-full h-full object-cover transition-opacity duration-300"
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
                                  className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                                    currentIndex === imgIndex ? 'bg-white' : 'bg-white/50'
                                  }`}
                                  aria-label={`عرض الصورة ${imgIndex + 1}`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </Link>

                    {/* المعلومات */}
                    <Link href={`/designs/${product.id}`}>
                      <div className="p-4 cursor-pointer hover:bg-pink-50/50 transition-colors duration-300">
                        <h3 className="font-bold text-gray-800 mb-2 group-hover:text-pink-600 transition-colors duration-300 text-center">
                          {product.name}
                        </h3>

                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 text-center">
                          {product.description}
                        </p>
                      </div>
                    </Link>
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
          className="text-center"
        >
          <Link
            href="/designs"
            className="btn-primary inline-flex items-center space-x-3 space-x-reverse text-lg font-bold"
          >
            <span>عرض جميع التصاميم</span>
          </Link>
        </motion.div>


      </div>
    </section>
  )
}
