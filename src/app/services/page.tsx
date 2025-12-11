'use client'

import { motion } from 'framer-motion'
import { Calendar, Search, Scissors, Palette, Heart, Sparkles, Home } from 'lucide-react'
import Link from 'next/link'
import Header from '@/components/Header'

export default function ServicesPage() {
  const services = [
    {
      icon: Calendar,
      title: 'حجز موعد',
      description: 'احجزي موعدك بسهولة عبر نظامنا الذكي. نظام تلقائي يوزع المواعيد على مدار أيام العمل.',
      link: '/book-appointment',
      color: 'from-pink-400 to-rose-400',
      bgColor: 'from-pink-50 to-rose-50'
    },
    {
      icon: Search,
      title: 'استعلام عن الطلب',
      description: 'تابعي حالة طلبك في أي وقت. اعرفي مرحلة التفصيل والموعد المتوقع للتسليم.',
      link: '/track-order',
      color: 'from-purple-400 to-pink-400',
      bgColor: 'from-purple-50 to-pink-50'
    },
    {
      icon: Scissors,
      title: 'تفصيل احترافي',
      description: 'فريق من أمهر الخياطين المتخصصين في تفصيل الفساتين النسائية بأعلى معايير الجودة.',
      link: '/about',
      color: 'from-rose-400 to-purple-400',
      bgColor: 'from-rose-50 to-purple-50'
    },
    {
      icon: Sparkles,
      title: 'أقمشة متنوعة',
      description: 'مجموعة واسعة من أجود أنواع الأقمشة والألوان لتناسب جميع الأذواق والمناسبات.',
      link: '/fabrics',
      color: 'from-indigo-400 to-purple-400',
      bgColor: 'from-indigo-50 to-purple-50'
    },
    {
      icon: Palette,
      title: 'فساتين جاهزة',
      description: 'مجموعة متنوعة من الفساتين الجاهزة للشراء المباشر بتصاميم عصرية وأنيقة.',
      link: '/designs',
      color: 'from-emerald-400 to-teal-400',
      bgColor: 'from-emerald-50 to-teal-50'
    },
    {
      icon: Heart,
      title: 'رضا العملاء',
      description: 'نضمن رضاك التام عن النتيجة النهائية. فريقنا يعمل بحب وشغف لإسعادك.',
      link: '/testimonials',
      color: 'from-red-400 to-pink-400',
      bgColor: 'from-red-50 to-pink-50'
    }
  ]

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-20">
        <section className="py-12 lg:py-20 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            {/* العنوان */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-12 lg:mb-16"
            >
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 lg:mb-6">
                <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                  خدماتنا المميزة
                </span>
              </h1>
              <p className="text-base lg:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                نقدم لك تجربة متكاملة من الاستشارة وحتى التسليم، مع ضمان أعلى مستويات الجودة والاحترافية
              </p>
            </motion.div>

            {/* شبكة الخدمات */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {services.map((service, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="group"
                >
                  <Link href={service.link}>
                    <div className={`relative p-6 lg:p-8 rounded-2xl bg-gradient-to-br ${service.bgColor} border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer h-full`}>
                      {/* الأيقونة */}
                      <div className={`w-14 h-14 lg:w-16 lg:h-16 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-4 lg:mb-6 group-hover:scale-110 transition-transform duration-300`}>
                        <service.icon className="w-7 h-7 lg:w-8 lg:h-8 text-white" />
                      </div>

                      {/* المحتوى */}
                      <div className="space-y-3">
                        <h3 className="text-xl font-bold text-gray-800 group-hover:text-pink-600 transition-colors duration-300">
                          {service.title}
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                          {service.description}
                        </p>
                      </div>

                      {/* سهم التنقل */}
                      <div className="absolute bottom-6 left-6 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                        <div className="w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* دعوة للعمل */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-center mt-12 lg:mt-16"
            >
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-3xl p-6 sm:p-8 lg:p-12">
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-3 sm:mb-4">
                  جاهزة لتبدئي رحلتك معنا؟
                </h3>
                <p className="text-sm sm:text-base lg:text-lg text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto">
                  احجزي موعدك الآن واتركي لنا مهمة تحويل حلمك إلى فستان يعكس شخصيتك المميزة
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href="/book-appointment"
                    className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse text-base sm:text-lg group"
                  >
                    <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                    <span>احجزي موعدك الآن</span>
                  </Link>
                  <Link
                    href="/"
                    className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-base sm:text-lg group"
                  >
                    <Home className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                    <span>العودة للصفحة الرئيسية</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  )
}

