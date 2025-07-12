'use client'

import { motion } from 'framer-motion'
import { Star, Quote, Heart } from 'lucide-react'
import { useState } from 'react'

export default function Testimonials() {
  const testimonials = [
    {
      id: 1,
      name: 'فاطمة أحمد',
      rating: 5,
      comment: 'تجربة رائعة من البداية للنهاية! الفستان كان أجمل من توقعاتي والخدمة احترافية جداً. أنصح كل عروس بزيارة ياسمين الشام.',
      occasion: 'فستان زفاف',
      image: null
    },
    {
      id: 2,
      name: 'مريم خالد',
      rating: 5,
      comment: 'دقة في المواعيد وجودة عالية في التفصيل. الفريق محترف ومتفهم لكل التفاصيل. سأعود بالتأكيد لطلبات أخرى.',
      occasion: 'فستان سهرة',
      image: null
    },
    {
      id: 3,
      name: 'نور السيد',
      rating: 5,
      comment: 'أحببت كيف استمعوا لأفكاري وحولوها إلى واقع. الفستان مريح وأنيق في نفس الوقت. شكراً لفريق ياسمين الشام.',
      occasion: 'فستان يومي',
      image: null
    },
    {
      id: 4,
      name: 'سارة محمد',
      rating: 5,
      comment: 'خدمة عملاء ممتازة وصبر في التعامل مع كل استفساراتي. النتيجة النهائية فاقت كل توقعاتي. محل يستحق الثقة.',
      occasion: 'فستان خطوبة',
      image: null
    },
    {
      id: 5,
      name: 'ليلى عبدالله',
      rating: 5,
      comment: 'تفصيل دقيق وأقمشة عالية الجودة. أعجبني اهتمامهم بأدق التفاصيل. سأنصح جميع صديقاتي بهذا المحل الرائع.',
      occasion: 'فستان مناسبة',
      image: null
    },
    {
      id: 6,
      name: 'رنا حسن',
      rating: 5,
      comment: 'من أفضل التجارب في حياتي! الفستان كان مثالياً والسعر معقول جداً مقارنة بالجودة. شكراً ياسمين الشام.',
      occasion: 'فستان تخرج',
      image: null
    }
  ]

  const [currentIndex, setCurrentIndex] = useState(0)

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length)
  }

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-5 h-5 ${
          i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
        }`}
      />
    ))
  }

  return (
    <section className="py-20 bg-white">
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
              آراء عميلاتنا
            </span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            نفتخر بثقة عميلاتنا ورضاهن عن خدماتنا. اقرئي تجاربهن الحقيقية معنا
          </p>
        </motion.div>

        {/* عرض الشهادات */}
        <div className="relative max-w-6xl mx-auto">
          {/* الشهادات الرئيسية */}
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="grid lg:grid-cols-3 gap-8 mb-12"
          >
            {testimonials.slice(currentIndex, currentIndex + 3).map((testimonial, index) => (
              <motion.div
                key={testimonial.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-8 border border-pink-100 hover:shadow-xl transition-all duration-300 relative"
              >
                {/* أيقونة الاقتباس */}
                <div className="absolute top-6 right-6 w-8 h-8 text-pink-300">
                  <Quote className="w-full h-full" />
                </div>

                {/* التقييم */}
                <div className="flex items-center space-x-1 space-x-reverse mb-4">
                  {renderStars(testimonial.rating)}
                </div>

                {/* التعليق */}
                <p className="text-gray-700 leading-relaxed mb-6 text-right">
                  "{testimonial.comment}"
                </p>

                {/* معلومات العميلة */}
                <div className="border-t border-pink-200 pt-6">
                  <div className="flex items-center justify-between">
                    <div className="text-right">
                      <h4 className="font-bold text-gray-800">{testimonial.name}</h4>
                      <p className="text-sm text-pink-600 font-medium">{testimonial.occasion}</p>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center">
                      <Heart className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* أزرار التنقل */}
          <div className="flex items-center justify-center space-x-4 space-x-reverse">
            <button
              onClick={prevTestimonial}
              className="w-12 h-12 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-full flex items-center justify-center hover:from-pink-500 hover:to-rose-500 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* مؤشرات النقاط */}
            <div className="flex space-x-2 space-x-reverse">
              {Array.from({ length: Math.ceil(testimonials.length / 3) }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i * 3)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    Math.floor(currentIndex / 3) === i
                      ? 'bg-pink-400 w-8'
                      : 'bg-gray-300 hover:bg-pink-300'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextTestimonial}
              className="w-12 h-12 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-full flex items-center justify-center hover:from-pink-500 hover:to-rose-500 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* إحصائية سريعة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center mt-16 p-8 bg-gradient-to-r from-pink-50 to-purple-50 rounded-3xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <div className="text-3xl lg:text-4xl font-bold text-pink-600 mb-2">98%</div>
              <div className="text-gray-600">نسبة رضا العملاء</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-bold text-rose-600 mb-2">300+</div>
              <div className="text-gray-600">عميلة سعيدة</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-bold text-purple-600 mb-2">5.0</div>
              <div className="text-gray-600 flex items-center justify-center space-x-1">
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <span>متوسط التقييم</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
