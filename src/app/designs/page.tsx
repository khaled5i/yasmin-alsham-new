'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Heart, ChevronLeft, ChevronRight, Grid3X3, Grid2X2, ShoppingBag } from 'lucide-react'
import { allDesigns } from '@/data/designs'
import { useShopStore, formatPrice } from '@/store/shopStore'

export default function DesignsPage() {
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{[key: number]: number}>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0
  })

  // حالة عرض البطاقات للهواتف المحمولة
  const [isSingleColumn, setIsSingleColumn] = useState(false)

  // متجر التسوق
  const { addToFavorites, removeFromFavorites, isFavorite, addToCart, removeFromCart, isInCart } = useShopStore()
  const [addedToCart, setAddedToCart] = useState<number[]>([])
  const [isClient, setIsClient] = useState(false)

  // التأكد من أن الكود يعمل على العميل فقط
  useEffect(() => {
    setIsClient(true)
  }, [])

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

  // دوال التعامل مع المفضلة والسلة
  const handleToggleFavorite = (design: any, e: React.MouseEvent) => {
    e.stopPropagation()
    const product = {
      id: design.id.toString(),
      name: design.title,
      price: design.price || 299, // سعر افتراضي
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

  const handleAddToCart = (design: any, e: React.MouseEvent) => {
    e.stopPropagation()
    const product = {
      id: design.id.toString(),
      name: design.title,
      price: design.price || 299, // سعر افتراضي
      image: design.images[0],
      description: design.description,
      category: design.category
    }

    if (isInCart(product.id)) {
      // إذا كان المنتج في السلة، قم بإزالته
      removeFromCart(product.id)
      setAddedToCart(prev => prev.filter(id => id !== design.id))
      
      // إزالة من localStorage
      const savedAddedToCart = JSON.parse(localStorage.getItem('addedToCart') || '[]')
      const updatedAddedToCart = savedAddedToCart.filter((id: number) => id !== design.id)
      localStorage.setItem('addedToCart', JSON.stringify(updatedAddedToCart))
    } else {
      // إذا لم يكن المنتج في السلة، قم بإضافته
      addToCart(product)
      setAddedToCart(prev => [...prev, design.id])
      
      // حفظ الحالة في localStorage بشكل دائم
      const savedAddedToCart = JSON.parse(localStorage.getItem('addedToCart') || '[]')
      const updatedAddedToCart = [...savedAddedToCart, design.id]
      localStorage.setItem('addedToCart', JSON.stringify(updatedAddedToCart))
    }
  }

  // تحميل الحالة المحفوظة عند تحميل الصفحة
  useEffect(() => {
    const savedAddedToCart = JSON.parse(localStorage.getItem('addedToCart') || '[]')
    setAddedToCart(savedAddedToCart)
  }, [])

  // تحديث currentImageIndexes ليشمل كل الفساتين
  useEffect(() => {
    const indexes: {[key: number]: number} = {}
    allDesigns.forEach(d => {
      indexes[d.id] = 0
    })
    setCurrentImageIndexes(indexes)
  }, [allDesigns.length])

  // لإجبار إعادة التصيير عند التعديل على allDesigns (حل مؤقت)
  const [, setDesignsVersion] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setDesignsVersion(v => v + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])





  // دوال التنقل بين صور البطاقة
  const nextCardImage = (designId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [designId]: (prev[designId] + 1) % 3
    }))
  }

  const prevCardImage = (designId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [designId]: prev[designId] === 0 ? 2 : prev[designId] - 1
    }))
  }

  const setCardImage = (designId: number, imageIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentImageIndexes(prev => ({
      ...prev,
      [designId]: imageIndex
    }))
  }





  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-4 lg:pt-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-12">
        {/* التنقل */}
        <div className="flex justify-start items-start mt-0 mb-2" dir="rtl">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
            style={{marginTop: 0}}
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">العودة إلى الرئيسية</span>
          </Link>
        </div>

        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              تصاميمنا الجاهزة
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed mb-6">
            استكشفي مجموعتنا الكاملة من التصاميم الجاهزة واختاري ما يناسب ذوقك ومناسبتك
          </p>

          {/* ملاحظة مهمة */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 max-w-2xl mx-auto">
            <p className="text-green-800 font-medium text-center">
              ✨ الفساتين الجاهزة متوفرة للشراء المباشر - لا يتطلب حجز موعد
            </p>
          </div>
        </motion.div>

        {/* زر تبديل العرض للهواتف المحمولة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="sm:hidden mb-6 flex justify-center"
        >
          <button
            onClick={toggleViewMode}
            className="bg-white/80 backdrop-blur-sm border border-pink-200 rounded-xl p-3 flex items-center space-x-2 space-x-reverse hover:bg-white hover:shadow-lg transition-all duration-300"
            aria-label={isSingleColumn ? 'تبديل إلى العرض الثنائي' : 'تبديل إلى العرض الفردي'}
          >
            {isSingleColumn ? (
              <>
                <Grid2X2 className="w-5 h-5 text-pink-600" />
                <span className="text-sm font-medium text-gray-700">عرض ثنائي</span>
              </>
            ) : (
              <>
                <Grid3X3 className="w-5 h-5 text-pink-600" />
                <span className="text-sm font-medium text-gray-700">عرض فردي</span>
              </>
            )}
          </button>
        </motion.div>



        {/* شبكة التصاميم */}
        <div className={`grid gap-8 mb-12 ${
          isSingleColumn
            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        }`}>
          {allDesigns.map((design, index) => (
            <motion.div
              key={design.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group"
            >
              <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                {/* الصورة */}
                <Link href={`/designs/${design.id}`}>
                  <div
                    className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer"
                  >
                    {/* الصورة الحالية */}
                    <img
                      src={
                        design.images && design.images.length > 0
                          ? design.images[currentImageIndexes[design.id]]
                          : '/wedding-dress-1.jpg.jpg'
                      }
                      alt={`${design.title} - صورة ${currentImageIndexes[design.id] ? currentImageIndexes[design.id] + 1 : 1}`}
                      className="w-full h-full object-cover transition-opacity duration-300"
                    />

                    {/* أزرار التنقل */}
                    <button
                      onClick={(e) => prevCardImage(design.id, e)}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                      aria-label="الصورة السابقة"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <button
                      onClick={(e) => nextCardImage(design.id, e)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                      aria-label="الصورة التالية"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* مؤشرات الصور */}
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1 space-x-reverse opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {design.images.map((_, imgIndex) => (
                        <button
                          key={imgIndex}
                          onClick={(e) => setCardImage(design.id, imgIndex, e)}
                          className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                            currentImageIndexes[design.id] === imgIndex ? 'bg-white' : 'bg-white/50'
                          }`}
                          aria-label={`عرض الصورة ${imgIndex + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </Link>
                {/* المعلومات */}
                <div className="p-4">
                  <Link href={`/designs/${design.id}`}>
                    <div className="cursor-pointer hover:bg-gray-50 transition-colors duration-300 p-2 -m-2 rounded-lg mb-4">
                      <h3 className="font-bold text-gray-800 mb-2 group-hover:text-pink-600 transition-colors duration-300">
                        {design.title}
                      </h3>

                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        {design.description}
                      </p>

                      {/* السعر */}
                      <div className="text-lg font-bold text-pink-600 mb-3">
                        السعر : {formatPrice(design.price)}
                      </div>
                    </div>
                  </Link>

                  {/* أزرار الإجراءات */}
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleAddToCart(design, e)}
                      className={`btn-primary flex-1 flex items-center justify-center space-x-1 space-x-reverse py-2 px-3 text-xs sm:text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                        isClient && isInCart(design.id.toString()) ? 'bg-red-500 hover:bg-red-600 text-white' : ''
                      }`}
                    >
                      <span className="hidden sm:inline-block">
                        <ShoppingBag className="w-4 h-4" />
                      </span>
                      <span className="whitespace-nowrap">{isClient && isInCart(design.id.toString()) ? 'أزل من السلة' : 'أضف للسلة'}</span>
                    </button>
                    
                    <button
                      onClick={(e) => handleToggleFavorite(design, e)}
                      className={`p-2 rounded-full border-2 transition-all duration-300 hover:scale-110 ${
                        isClient && isFavorite(design.id.toString())
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-pink-300 text-pink-600 hover:bg-pink-50'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isClient && isFavorite(design.id.toString()) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>




      </div>
    </div>
  )
}



