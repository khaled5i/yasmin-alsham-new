'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Heart, Star, Palette, ChevronLeft, ChevronRight } from 'lucide-react'
import { allDesigns } from '@/data/designs'

export default function ReadyDesigns() {
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{[key: number]: number}>({
    1: 0, 2: 0, 3: 0, 4: 0
  })
  // استخدم أول 4 تصاميم من allDesigns بدلاً من مصفوفة ثابتة
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setVersion(v => v + 1), 1000)
    return () => clearInterval(interval)
  }, [])
  const readyDesigns = allDesigns.slice(0, 4)

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
    <section className="py-20 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
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

        {/* شبكة التصاميم */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mb-12">
          {readyDesigns.map((design, index) => (
            <motion.div
              key={design.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
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
                      src={design.images[currentImageIndexes[design.id]]}
                      alt={`${design.title} - صورة ${currentImageIndexes[design.id] + 1}`}
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
                <Link href={`/designs/${design.id}`}>
                  <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-300">
                    <h3 className="font-bold text-gray-800 mb-2 group-hover:text-pink-600 transition-colors duration-300">
                      {design.title}
                    </h3>

                    <p className="text-sm text-gray-600 leading-relaxed">
                      {design.description}
                    </p>
                  </div>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

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
