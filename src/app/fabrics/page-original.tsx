'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Palette, Star, Heart, Sparkles, ArrowRight } from 'lucide-react'

export default function FabricsPageOriginal() {
  // بيانات الأقمشة المؤقتة - سيتم استبدالها بالبيانات من قاعدة البيانات
  const fabrics = [
    {
      id: 1,
      name_ar: 'حرير طبيعي',
      name_en: 'Natural Silk',
      description_ar: 'حرير طبيعي فاخر بملمس ناعم ولمعة طبيعية مميزة، مثالي للفساتين الراقية والمناسبات الخاصة.',
      category: 'فاخر',
      price_per_meter: 150,
      colors: ['أبيض', 'كريمي', 'وردي', 'أزرق فاتح', 'بنفسجي'],
      image_url: null,
      is_popular: true
    },
    {
      id: 2,
      name_ar: 'شيفون فرنسي',
      name_en: 'French Chiffon',
      description_ar: 'شيفون فرنسي خفيف وشفاف، يعطي إطلالة أنثوية رقيقة ومناسب للفساتين الطويلة والسهرات.',
      category: 'كلاسيكي',
      price_per_meter: 80,
      colors: ['أسود', 'أبيض', 'وردي', 'أحمر', 'ذهبي'],
      image_url: null,
      is_popular: true
    },
    {
      id: 3,
      name_ar: 'ساتان لامع',
      name_en: 'Glossy Satin',
      description_ar: 'ساتان بلمعة عالية وملمس حريري، مثالي للفساتين الرسمية وفساتين الزفاف.',
      category: 'فاخر',
      price_per_meter: 120,
      colors: ['أبيض', 'كريمي', 'فضي', 'ذهبي', 'وردي فاتح'],
      image_url: null,
      is_popular: false
    },
    {
      id: 4,
      name_ar: 'تول مطرز',
      name_en: 'Embroidered Tulle',
      description_ar: 'تول ناعم مطرز بخيوط ذهبية وفضية، يضفي لمسة من الفخامة والأناقة على أي فستان.',
      category: 'مطرز',
      price_per_meter: 200,
      colors: ['أبيض', 'كريمي', 'ذهبي', 'فضي'],
      image_url: null,
      is_popular: true
    },
    {
      id: 5,
      name_ar: 'قطن مصري',
      name_en: 'Egyptian Cotton',
      description_ar: 'قطن مصري عالي الجودة، مريح وقابل للتنفس، مناسب للفساتين اليومية والكاجوال.',
      category: 'طبيعي',
      price_per_meter: 60,
      colors: ['أبيض', 'بيج', 'أزرق فاتح', 'وردي فاتح', 'أخضر فاتح'],
      image_url: null,
      is_popular: false
    },
    {
      id: 6,
      name_ar: 'كريب جورجيت',
      name_en: 'Crepe Georgette',
      description_ar: 'كريب جورجيت خفيف ومتدفق، يعطي حركة جميلة للفستان ومناسب للمناسبات المختلفة.',
      category: 'كلاسيكي',
      price_per_meter: 90,
      colors: ['أسود', 'أبيض', 'كحلي', 'بورجندي', 'زمردي'],
      image_url: null,
      is_popular: true
    }
  ]

  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // فلترة الأقمشة حسب الفئة والبحث
  const filteredFabrics = fabrics.filter(fabric => {
    const matchesCategory = selectedCategory === 'all' || fabric.category === selectedCategory
    const matchesSearch = fabric.name_ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         fabric.name_en.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // الحصول على الفئات الفريدة
  const categories = ['all', ...Array.from(new Set(fabrics.map(fabric => fabric.category)))]

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

        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              مجموعة الأقمشة
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            اختاري من مجموعتنا المتنوعة من الأقمشة الفاخرة والعصرية لتفصيل فستان أحلامك
          </p>
        </motion.div>

        {/* أدوات البحث والفلترة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 mb-12"
        >
          <div className="grid md:grid-cols-2 gap-6">
            {/* البحث */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                البحث في الأقمشة
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحثي عن نوع القماش..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
              />
            </div>

            {/* فلتر الفئات */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                فلترة حسب الفئة
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
              >
                <option value="all">جميع الفئات</option>
                {categories.filter(cat => cat !== 'all').map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* شبكة الأقمشة */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {filteredFabrics.map((fabric, index) => (
            <motion.div
              key={fabric.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group"
            >
              <Link href={`/fabrics/${fabric.id}`}>
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden border border-pink-100 shadow-lg hover:shadow-2xl transition-all duration-500 group-hover:scale-105">
                  {/* صورة القماش */}
                  <div className="relative h-64 overflow-hidden">
                    {fabric.image_url ? (
                      <img
                        src={fabric.image_url}
                        alt={fabric.name_ar}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-pink-200 via-rose-200 to-purple-200 flex items-center justify-center group-hover:from-pink-300 group-hover:via-rose-300 group-hover:to-purple-300 transition-all duration-500">
                        <div className="text-center text-gray-600">
                          <Palette className="w-12 h-12 mx-auto mb-2 text-pink-400 group-hover:scale-110 transition-transform duration-300" />
                          <p className="text-sm font-medium">صورة {fabric.name_ar}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* شارة الشائع */}
                    {fabric.is_popular && (
                      <div className="absolute top-4 right-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1 space-x-reverse">
                        <Star className="w-3 h-3" />
                        <span>شائع</span>
                      </div>
                    )}
                  </div>

                  {/* المحتوى */}
                  <div className="p-6 space-y-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 group-hover:text-pink-600 transition-colors duration-300 mb-1">
                        {fabric.name_ar}
                      </h3>
                      <p className="text-sm text-gray-500 font-medium">{fabric.name_en}</p>
                    </div>

                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                      {fabric.description_ar}
                    </p>

                    {/* الفئة والسعر */}
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 rounded-full text-xs font-medium">
                        {fabric.category}
                      </span>
                      <span className="text-lg font-bold text-pink-600">
                        {fabric.price_per_meter} ر.س/م
                      </span>
                    </div>

                    {/* الألوان المتاحة */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2">الألوان المتاحة:</p>
                      <div className="flex flex-wrap gap-1">
                        {fabric.colors.slice(0, 4).map((color, colorIndex) => (
                          <span
                            key={colorIndex}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            {color}
                          </span>
                        ))}
                        {fabric.colors.length > 4 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                            +{fabric.colors.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* رسالة عدم وجود نتائج */}
        {filteredFabrics.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center py-16"
          >
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-pink-200 to-purple-200 rounded-full flex items-center justify-center">
              <Palette className="w-12 h-12 text-pink-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">لا توجد أقمشة مطابقة</h3>
            <p className="text-gray-600">جربي تغيير معايير البحث أو الفلترة</p>
          </motion.div>
        )}

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
            <Sparkles className="w-full h-full" />
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
      </div>
    </div>
  )
}
