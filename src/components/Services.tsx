'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Search, Scissors, Palette, Heart, Sparkles, ChevronDown } from 'lucide-react'
import Link from 'next/link'

export default function Services() {
  const [showAllServices, setShowAllServices] = useState(false)

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

  // عرض 4 خدمات محددة على الجوال: حجز موعد، استفسار طلب، الأقمشة، التصاميم الجاهزة
  const mobileServices = [
    services[0], // حجز موعد
    services[1], // استعلام عن الطلب
    services[3], // أقمشة متنوعة
    services[4]  // فساتين جاهزة
  ]
  const displayedServices = showAllServices ? services : mobileServices

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
              خدماتنا المميزة
            </span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            نقدم لك تجربة متكاملة من الاستشارة وحتى التسليم، مع ضمان أعلى مستويات الجودة والاحترافية
          </p>
        </motion.div>

        {/* شبكة الخدمات */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* عرض جميع الخدمات على الشاشات الكبيرة، وخدمتين فقط على الجوال */}
          <div className="hidden md:contents">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="group"
              >
                <Link href={service.link}>
                  <div className={`relative p-8 rounded-2xl bg-gradient-to-br ${service.bgColor} border border-gray-100 hover:shadow-xl transition-all duration-500 transform hover:scale-105 cursor-pointer h-full`}>
                    {/* الأيقونة */}
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      <service.icon className="w-8 h-8 text-white" />
                    </div>

                    {/* المحتوى */}
                    <div className="space-y-4">
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

                    {/* تأثير الإضاءة */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* عرض الخدمات على الجوال - شبكة 2x2 */}
          <div className="md:hidden col-span-full grid grid-cols-2 gap-4">
            {displayedServices.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="group"
              >
                <Link href={service.link}>
                  <div className={`relative p-4 rounded-xl bg-gradient-to-br ${service.bgColor} border border-gray-100 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer h-full`}>
                    {/* الأيقونة */}
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${service.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <service.icon className="w-5 h-5 text-white" />
                    </div>

                    {/* المحتوى */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-gray-800 group-hover:text-pink-600 transition-colors duration-300 leading-tight">
                        {service.title}
                      </h3>
                      <p className="text-gray-600 text-xs leading-relaxed line-clamp-2">
                        {service.description}
                      </p>
                    </div>

                    {/* سهم التنقل */}
                    <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                      <div className="w-6 h-6 rounded-full bg-white shadow-lg flex items-center justify-center">
                        <svg className="w-3 h-3 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* تأثير الإضاءة */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* دعوة للعمل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-3xl p-4 sm:p-8 lg:p-12">
            <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-2 sm:mb-4">
              جاهزة لتبدئي رحلتك معنا؟
            </h3>
            <p className="text-xs sm:text-lg text-gray-600 mb-4 sm:mb-8 max-w-2xl mx-auto">
              احجزي موعدك الآن واتركي لنا مهمة تحويل حلمك إلى فستان يعكس شخصيتك المميزة
            </p>
            <Link
              href="/book-appointment"
              className="btn-primary inline-flex items-center space-x-2 space-x-reverse text-sm sm:text-lg group"
            >
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform duration-300" />
              <span>احجزي موعدك الآن</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
