'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowRight, Palette, Star, Heart, Calendar, MessageSquare, Eye, X } from 'lucide-react'

export default function FabricDetailPage() {
  const params = useParams()
  const fabricId = params.id

  // حالة المعرض
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)

  // بيانات تجريبية للقماش - في التطبيق الحقيقي ستأتي من قاعدة البيانات
  const fabricData = {
    id: fabricId,
    name_ar: 'حرير طبيعي',
    name_en: 'Natural Silk',
    description_ar: 'حرير طبيعي فاخر بملمس ناعم ولمعة طبيعية مميزة، مثالي للفساتين الراقية والمناسبات الخاصة. يتميز هذا القماش بجودته العالية ونعومته الاستثنائية التي تجعله الخيار الأمثل للعرائس والسيدات اللواتي يبحثن عن الأناقة والفخامة.',
    description_en: 'Luxurious natural silk with a soft texture and distinctive natural shine, perfect for elegant dresses and special occasions.',
    category: 'فاخر',
    price_per_meter: 150,
    colors: ['أبيض', 'كريمي', 'وردي فاتح', 'أزرق فاتح', 'بنفسجي', 'ذهبي فاتح', 'فضي', 'أسود'],
    features: [
      'ملمس ناعم وحريري',
      'لمعة طبيعية مميزة',
      'مقاوم للتجاعيد',
      'يتنفس مع الجلد',
      'مناسب لجميع الفصول',
      'سهل العناية والتنظيف'
    ],
    suitable_for: [
      'فساتين الزفاف',
      'فساتين السهرة',
      'فساتين الخطوبة',
      'المناسبات الرسمية',
      'الحفلات الخاصة'
    ],
    care_instructions: [
      'غسيل جاف فقط',
      'كي على درجة حرارة منخفضة',
      'تجنب التعرض المباشر لأشعة الشمس',
      'تخزين في مكان جاف ومظلم'
    ],
    is_popular: true,
    rating: 4.9,
    reviews_count: 127
  }

  // أمثلة على التصاميم المنجزة
  const designExamples = [
    {
      id: 1,
      title: 'فستان زفاف كلاسيكي',
      description: 'فستان زفاف أنيق بتصميم كلاسيكي مع تطريز يدوي',
      image: '/api/placeholder/400/500',
      category: 'فساتين زفاف'
    },
    {
      id: 2,
      title: 'فستان سهرة راقي',
      description: 'فستان سهرة طويل بقصة عصرية ولمسات ذهبية',
      image: '/api/placeholder/400/500',
      category: 'فساتين سهرة'
    },
    {
      id: 3,
      title: 'فستان كوكتيل أنيق',
      description: 'فستان كوكتيل قصير بتصميم عصري ومميز',
      image: '/api/placeholder/400/500',
      category: 'فساتين كوكتيل'
    },
    {
      id: 4,
      title: 'فستان خطوبة مميز',
      description: 'فستان خطوبة بتصميم رومانسي وتفاصيل دقيقة',
      image: '/api/placeholder/400/500',
      category: 'فساتين خطوبة'
    }
  ]

  const [selectedColor, setSelectedColor] = useState(fabricData.colors[0])

  // دوال المعرض
  const openGallery = (index: number) => {
    setSelectedImageIndex(index)
    setIsGalleryOpen(true)
  }

  const closeGallery = () => {
    setIsGalleryOpen(false)
    setSelectedImageIndex(null)
  }

  const nextImage = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex + 1) % designExamples.length)
    }
  }

  const prevImage = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex(selectedImageIndex === 0 ? designExamples.length - 1 : selectedImageIndex - 1)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link
            href="/fabrics"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى الأقمشة</span>
          </Link>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* الصورة */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <div className="relative">
              <div className="aspect-square bg-gradient-to-br from-pink-200 via-rose-200 to-purple-200 rounded-2xl flex items-center justify-center shadow-xl">
                {fabricData.is_popular && (
                  <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center space-x-1 space-x-reverse">
                    <Star className="w-4 h-4" />
                    <span>مميز</span>
                  </div>
                )}
                
                {/* صورة مؤقتة */}
                <div className="text-center text-gray-600">
                  <Palette className="w-20 h-20 mx-auto mb-4 text-pink-400" />
                  <p className="text-xl font-medium">{fabricData.name_ar}</p>
                  <p className="text-sm text-gray-500">{fabricData.name_en}</p>
                </div>
              </div>

              {/* التقييم */}
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center space-x-1 space-x-reverse">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="font-bold text-gray-800">{fabricData.rating}</span>
                <span className="text-sm text-gray-600">({fabricData.reviews_count})</span>
              </div>
            </div>

            {/* الألوان المتاحة */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100">
              <h3 className="font-bold text-gray-800 mb-4">الألوان المتاحة</h3>
              <div className="grid grid-cols-4 gap-3">
                {fabricData.colors.map((color, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedColor(color)}
                    className={`p-3 rounded-lg border-2 transition-all duration-300 text-sm font-medium ${
                      selectedColor === color
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-pink-300'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* المعلومات */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-8"
          >
            {/* العنوان والسعر */}
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-800 mb-2">
                {fabricData.name_ar}
              </h1>
              <p className="text-lg text-gray-600 mb-4">{fabricData.name_en}</p>
              
              <div className="flex items-center justify-between">
                <span className="px-4 py-2 bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 rounded-full font-medium">
                  {fabricData.category}
                </span>
                <span className="text-3xl font-bold text-pink-600">
                  {fabricData.price_per_meter} ر.س/م
                </span>
              </div>
            </div>

            {/* الوصف */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100">
              <h3 className="font-bold text-gray-800 mb-4">وصف القماش</h3>
              <p className="text-gray-700 leading-relaxed">
                {fabricData.description_ar}
              </p>
            </div>

            {/* المميزات */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100">
              <h3 className="font-bold text-gray-800 mb-4">المميزات</h3>
              <ul className="space-y-2">
                {fabricData.features.map((feature, index) => (
                  <li key={index} className="flex items-center space-x-3 space-x-reverse text-gray-700">
                    <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* مناسب لـ */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100">
              <h3 className="font-bold text-gray-800 mb-4">مناسب لـ</h3>
              <div className="flex flex-wrap gap-2">
                {fabricData.suitable_for.map((item, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-sm font-medium"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* تعليمات العناية */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100">
              <h3 className="font-bold text-gray-800 mb-4">تعليمات العناية</h3>
              <ul className="space-y-2">
                {fabricData.care_instructions.map((instruction, index) => (
                  <li key={index} className="flex items-center space-x-3 space-x-reverse text-gray-700">
                    <div className="w-2 h-2 bg-rose-400 rounded-full"></div>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* زر الاستفسار */}
            <div>
              <a
                href={`https://wa.me/+966598862609?text=أريد استفسار عن ${fabricData.name_ar} - ${fabricData.name_en}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-4 text-lg inline-flex items-center justify-center space-x-2 space-x-reverse group hover:shadow-lg transform hover:scale-105 transition-all duration-300 rounded-lg font-bold"
              >
                <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>استفسار عبر الواتساب</span>
              </a>
            </div>
          </motion.div>
        </div>

        {/* معرض التصاميم المنجزة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-800 mb-4">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                أمثلة على تصاميمنا
              </span>
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              شاهدي أمثلة ملهمة لتصاميم يمكن تنفيذها باستخدام هذا النوع من القماش
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {designExamples.map((design, index) => (
              <motion.div
                key={design.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="group"
              >
                <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105">
                  {/* الصورة */}
                  <div
                    className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      openGallery(index)
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-gray-600">
                        <Palette className="w-12 h-12 mx-auto mb-2 text-pink-400" />
                        <p className="text-sm font-medium">{design.title}</p>
                      </div>
                    </div>

                    {/* تأثير التمرير */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 rounded-full p-3">
                        <Eye className="w-6 h-6 text-pink-600" />
                      </div>
                    </div>

                    {/* شارة الفئة */}
                    <div className="absolute top-3 right-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                      {design.category}
                    </div>
                  </div>

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
        </motion.div>

        {/* أقمشة مشابهة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-16"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-4">
              أقمشة مشابهة قد تعجبك
            </h2>
            <Link
              href="/fabrics"
              className="text-pink-600 hover:text-pink-700 transition-colors duration-300 font-medium"
            >
              عرض جميع الأقمشة ←
            </Link>
          </div>
        </motion.div>

        {/* نافذة المعرض المنبثقة */}
        {isGalleryOpen && selectedImageIndex !== null && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="relative max-w-4xl w-full">
              {/* زر الإغلاق */}
              <button
                onClick={closeGallery}
                className="absolute top-4 right-4 z-10 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors duration-300"
              >
                <X className="w-6 h-6" />
              </button>

              {/* أزرار التنقل */}
              <button
                onClick={prevImage}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors duration-300"
              >
                <ArrowRight className="w-6 h-6" />
              </button>

              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors duration-300"
              >
                <ArrowRight className="w-6 h-6 transform rotate-180" />
              </button>

              {/* الصورة */}
              <motion.div
                key={selectedImageIndex}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl overflow-hidden shadow-2xl"
              >
                <div className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 flex items-center justify-center">
                  <div className="text-center text-gray-600">
                    <Palette className="w-20 h-20 mx-auto mb-4 text-pink-400" />
                    <p className="text-xl font-medium">{designExamples[selectedImageIndex].title}</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
