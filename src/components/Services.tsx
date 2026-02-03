'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Search, Scissors, Palette, Heart, Sparkles, ChevronDown, Home } from 'lucide-react'
import Link from 'next/link'

export default function Services() {
  const [showAllServices, setShowAllServices] = useState(false)

  const services = [
    // [HIDDEN TEMPORARILY] حجز موعد - مخفي مؤقتاً
    // {
    //   icon: Calendar,
    //   title: 'حجز موعد',
    //   description: 'احجزي موعدك بسهولة عبر نظامنا الذكي. نظام تلقائي يوزع المواعيد على مدار أيام العمل.',
    //   link: '/book-appointment',
    //   color: 'from-pink-400 to-rose-400',
    //   bgColor: 'from-pink-50 to-rose-50'
    // },
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
      link: '/',
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
    <section id="services-section" className="py-20 bg-white max-lg:min-h-screen max-lg:h-screen max-lg:snap-start max-lg:snap-always max-lg:flex max-lg:flex-col max-lg:justify-between max-lg:overflow-hidden max-lg:py-[3vh]">
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 max-lg:flex max-lg:flex-col max-lg:h-full max-lg:justify-between">
        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center max-lg:mb-[1.5vh] lg:mb-16"
        >
          <h2 className="max-lg:text-[clamp(1.25rem,4vw,1.75rem)] lg:text-5xl font-bold max-lg:mb-[0.5vh] lg:mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              خدماتنا المميزة
            </span>
          </h2>
          <p className="max-lg:text-[clamp(0.7rem,2.5vw,0.85rem)] lg:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed max-lg:line-clamp-2">
            نقدم لك تجربة متكاملة من الاستشارة وحتى التسليم
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
          <div className="md:hidden col-span-full grid grid-cols-2 gap-[2vw] max-lg:flex-1">
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
                  <div className={`relative p-[2vw] rounded-xl bg-gradient-to-br ${service.bgColor} border border-gray-100 hover:shadow-lg transition-all duration-300 cursor-pointer h-full`}>
                    {/* الأيقونة */}
                    <div className={`w-[8vw] h-[8vw] max-w-10 max-h-10 rounded-lg bg-gradient-to-br ${service.color} flex items-center justify-center mb-[1vh] group-hover:scale-110 transition-transform duration-300`}>
                      <service.icon className="w-[4vw] h-[4vw] max-w-5 max-h-5 text-white" />
                    </div>

                    {/* المحتوى */}
                    <div className="space-y-[0.5vh]">
                      <h3 className="text-[clamp(0.7rem,2.5vw,0.875rem)] font-bold text-gray-800 group-hover:text-pink-600 transition-colors duration-300 leading-tight">
                        {service.title}
                      </h3>
                      <p className="text-gray-600 text-[clamp(0.6rem,2vw,0.75rem)] leading-relaxed line-clamp-2">
                        {service.description}
                      </p>
                    </div>
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
          className="text-center max-lg:mt-[2vh] lg:mt-16 max-lg:pb-[1vh]"
        >
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 max-lg:rounded-xl lg:rounded-3xl max-lg:p-[2vw] sm:p-8 lg:p-12">
            <h3 className="max-lg:text-[clamp(0.85rem,3vw,1rem)] lg:text-3xl font-bold text-gray-800 max-lg:mb-[0.5vh] lg:mb-4">
              جاهزة لتبدئي رحلتك معنا؟
            </h3>
            <p className="max-lg:text-[clamp(0.65rem,2vw,0.75rem)] lg:text-lg text-gray-600 max-lg:mb-[1vh] lg:mb-8 max-w-2xl mx-auto max-lg:line-clamp-1">
              تواصلي معنا واتركي لنا مهمة تحويل حلمك إلى فستان
            </p>
            {/* [HIDDEN TEMPORARILY] حجز موعد - مخفي مؤقتاً
            <Link
              href="/book-appointment"
              className="btn-primary inline-flex items-center space-x-2 space-x-reverse max-lg:text-sm max-lg:py-2 max-lg:px-4 lg:text-lg group"
            >
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform duration-300" />
              <span>احجزي موعدك الآن</span>
            </Link>
            */}
            <Link
              href="/"
              className="btn-primary inline-flex items-center space-x-2 space-x-reverse max-lg:text-sm max-lg:py-2 max-lg:px-4 lg:text-lg group"
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform duration-300" />
              <span>العودة للصفحة الرئيسية</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
