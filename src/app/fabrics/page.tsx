'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Sparkles, Star, Heart, Palette, Clock, Calendar } from 'lucide-react'

export default function FabricsPage() {
  // تعطيل مؤقت للقسم - عرض رسالة "قريباً"
  const isComingSoon = true // تغيير هذا إلى false لتفعيل القسم

  if (isComingSoon) {
    return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* زر العودة للصفحة الرئيسية */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300 group"
          >
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            <span className="font-medium">العودة للصفحة الرئيسية</span>
          </Link>
        </div>

        {/* محتوى "قريباً" */}
        <div className="flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-2xl mx-auto"
          >
            {/* أيقونة متحركة */}
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="mb-8"
            >
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center shadow-2xl">
                <Palette className="w-16 h-16 text-white" />
              </div>
            </motion.div>

            {/* العنوان الرئيسي */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl lg:text-5xl font-bold mb-6"
            >
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                قسم الأقمشة
              </span>
            </motion.h1>

            {/* الرسالة */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100 shadow-xl"
            >
              <div className="flex items-center justify-center mb-6">
                <Clock className="w-8 h-8 text-pink-600 ml-3" />
                <h2 className="text-2xl font-bold text-gray-800">هذا القسم سيتم افتتاحه قريباً</h2>
              </div>

              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                نحن نعمل بجد لتقديم مجموعة رائعة من الأقمشة الفاخرة والعصرية لك.
                سيتم افتتاح هذا القسم قريباً مع تشكيلة متنوعة من أجود أنواع الأقمشة.
              </p>

              <div className="flex items-center justify-center space-x-4 space-x-reverse text-pink-600">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">ترقبي الافتتاح قريباً</span>
              </div>
            </motion.div>

            {/* أزرار التنقل */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link
                href="/designs"
                className="bg-gradient-to-r from-pink-600 to-purple-600 text-white px-8 py-4 rounded-full font-bold inline-flex items-center justify-center space-x-3 space-x-reverse group transform hover:scale-105 transition-all duration-300 shadow-xl hover:shadow-pink-500/25"
              >
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>تصفحي الفساتين الجاهزة</span>
              </Link>

              <Link
                href="/book-appointment"
                className="border-2 border-pink-600 text-pink-600 px-8 py-4 rounded-full font-bold inline-flex items-center justify-center space-x-3 space-x-reverse group hover:bg-pink-600 hover:text-white transition-all duration-300"
              >
                <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>احجزي موعد</span>
              </Link>
            </motion.div>

            {/* عناصر زخرفية */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
                animate={{
                  y: [-20, 20, -20],
                  rotate: [0, 180, 360]
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute top-1/4 left-1/4 w-6 h-6 text-pink-300"
              >
                <Star className="w-full h-full" />
              </motion.div>

              <motion.div
                animate={{
                  y: [20, -20, 20],
                  rotate: [360, 180, 0]
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute top-1/3 right-1/4 w-8 h-8 text-rose-300"
              >
                <Heart className="w-full h-full" />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
    )
  }

  // الكود الأصلي لقسم الأقمشة (معطل حالياً - سيتم تفعيله لاحقاً)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [favorites, setFavorites] = useState<number[]>([])

  const categories = [
    { id: 'all', name: 'جميع الأقمشة', count: 24 },
    { id: 'silk', name: 'حرير', count: 8 },
    { id: 'cotton', name: 'قطن', count: 6 },
    { id: 'chiffon', name: 'شيفون', count: 5 },
    { id: 'satin', name: 'ساتان', count: 5 }
  ]

  const fabrics = [
    {
      id: 1,
      name: 'حرير وردي فاتح',
      category: 'silk',
      price: 150,
      image: '/fabrics/silk-pink.jpg',
      description: 'حرير طبيعي بلون وردي فاتح، مثالي للفساتين الناعمة',
      rating: 4.8,
      inStock: true
    },
    {
      id: 2,
      name: 'شيفون أزرق سماوي',
      category: 'chiffon',
      price: 120,
      image: '/fabrics/chiffon-blue.jpg',
      description: 'شيفون خفيف وأنيق بلون أزرق سماوي',
      rating: 4.6,
      inStock: true
    },
    {
      id: 3,
      name: 'ساتان ذهبي',
      category: 'satin',
      price: 180,
      image: '/fabrics/satin-gold.jpg',
      description: 'ساتان فاخر بلون ذهبي لامع',
      rating: 4.9,
      inStock: false
    }
    // المزيد من الأقمشة يمكن إضافتها هنا
  ]

  const toggleFavorite = (fabricId: number) => {
    setFavorites(prev =>
      prev.includes(fabricId)
        ? prev.filter(id => id !== fabricId)
        : [...prev, fabricId]
    )
  }

  const filteredFabrics = selectedCategory === 'all'
    ? fabrics
    : fabrics.filter(fabric => fabric.category === selectedCategory)

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      {/* الكود الكامل لقسم الأقمشة سيكون هنا عند التفعيل */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-center mb-8">قسم الأقمشة</h1>
        <p className="text-center text-gray-600">هذا القسم جاهز للتفعيل عند الحاجة</p>
      </div>
    </div>
  )
}

// الكود الأصلي محفوظ في ملف page-original.tsx للتفعيل لاحقاً





