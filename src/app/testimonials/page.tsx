'use client'

import { motion } from 'framer-motion'
import { Star, Quote, Heart, Calendar } from 'lucide-react'
import Link from 'next/link'

export default function TestimonialsPage() {
  const testimonials = [
    {
      id: 1,
      name: 'فاطمة أحمد',
      rating: 5,
      comment: 'تجربة رائعة من البداية للنهاية! الفستان كان أجمل من توقعاتي والخدمة احترافية جداً. أنصح كل عروس بزيارة ياسمين الشام.',
      occasion: 'فستان زفاف',
      date: '2024-01-15',
      image: null
    },
    {
      id: 2,
      name: 'مريم خالد',
      rating: 5,
      comment: 'دقة في المواعيد وجودة عالية في التفصيل. الفريق محترف ومتفهم لكل التفاصيل. سأعود بالتأكيد لطلبات أخرى.',
      occasion: 'فستان سهرة',
      date: '2024-01-10',
      image: null
    },
    {
      id: 3,
      name: 'نور السيد',
      rating: 5,
      comment: 'أحببت كيف استمعوا لأفكاري وحولوها إلى واقع. الفستان مريح وأنيق في نفس الوقت. شكراً لفريق ياسمين الشام.',
      occasion: 'فستان يومي',
      date: '2024-01-08',
      image: null
    },
    {
      id: 4,
      name: 'سارة محمد',
      rating: 5,
      comment: 'خدمة عملاء ممتازة وصبر في التعامل مع كل استفساراتي. النتيجة النهائية فاقت كل توقعاتي. محل يستحق الثقة.',
      occasion: 'فستان خطوبة',
      date: '2024-01-05',
      image: null
    },
    {
      id: 5,
      name: 'ليلى عبدالله',
      rating: 5,
      comment: 'تفصيل دقيق وأقمشة عالية الجودة. أعجبني اهتمامهم بأدق التفاصيل. سأنصح جميع صديقاتي بهذا المحل الرائع.',
      occasion: 'فستان مناسبة',
      date: '2024-01-03',
      image: null
    },
    {
      id: 6,
      name: 'رنا حسن',
      rating: 5,
      comment: 'من أفضل التجارب في حياتي! الفستان كان مثالياً والسعر معقول جداً مقارنة بالجودة. شكراً ياسمين الشام.',
      occasion: 'فستان تخرج',
      date: '2024-01-01',
      image: null
    },
    {
      id: 7,
      name: 'هدى علي',
      rating: 5,
      comment: 'الاهتمام بالتفاصيل والجودة العالية جعلاني أشعر بالثقة والجمال. فريق العمل رائع ومتعاون جداً.',
      occasion: 'فستان حفلة',
      date: '2023-12-28',
      image: null
    },
    {
      id: 8,
      name: 'أمل كريم',
      rating: 5,
      comment: 'تجربة لا تُنسى! من اللحظة الأولى شعرت بالراحة والثقة. الفستان كان حلماً تحقق على أرض الواقع.',
      occasion: 'فستان زفاف',
      date: '2023-12-25',
      image: null
    }
  ]

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-5 h-5 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
          }`}
      />
    ))
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory', // استخدام التقويم الميلادي
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              آراء عميلاتنا
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            نفتخر بثقة عميلاتنا ورضاهن عن خدماتنا. اقرئي تجاربهن الحقيقية معنا وكيف ساعدناهن في تحقيق أحلامهن
          </p>
        </motion.div>

        {/* الإحصائيات */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16"
        >
          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-3xl lg:text-4xl font-bold text-pink-600 mb-2">98%</div>
            <div className="text-gray-600">نسبة رضا العملاء</div>
          </div>
          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-3xl lg:text-4xl font-bold text-rose-600 mb-2">300+</div>
            <div className="text-gray-600">عميلة سعيدة</div>
          </div>
          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-3xl lg:text-4xl font-bold text-purple-600 mb-2 flex items-center justify-center space-x-1">
              <span>5.0</span>
              <Star className="w-6 h-6 text-yellow-400 fill-current" />
            </div>
            <div className="text-gray-600">متوسط التقييم</div>
          </div>
        </motion.div>

        {/* شبكة الشهادات */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100 hover:shadow-xl transition-all duration-300 relative"
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
                    <p className="text-sm text-pink-600 font-medium mb-1">{testimonial.occasion}</p>
                    <p className="text-xs text-gray-500">{formatDate(testimonial.date)}</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center">
                    <Heart className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* دعوة للعمل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center"
        >
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-3xl p-8 lg:p-12 border border-pink-100">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-white" />
            </div>

            <h3 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-4">
              جاهزة لتكوني جزءاً من قصص النجاح؟
            </h3>

            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              انضمي إلى مئات العميلات السعيدات واتركي لنا مهمة تحويل حلمك إلى فستان يعكس شخصيتك المميزة
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/* [HIDDEN TEMPORARILY] حجز موعد - مخفي مؤقتاً
              <Link
                href="/book-appointment"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>احجزي موعدك الآن</span>
              </Link>
              */}

              <a
                href="https://wa.me/+966598862609"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                </svg>
                <span>تواصلي معنا</span>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
