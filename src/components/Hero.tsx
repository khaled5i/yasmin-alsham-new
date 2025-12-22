'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Sparkles, Heart, Star, Shirt } from 'lucide-react'

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden lg:pt-28 max-lg:h-screen max-lg:snap-start max-lg:snap-always max-lg:overflow-x-hidden">
      {/* خلفية للموبايل - صورة كاملة الشاشة */}
      <div className="lg:hidden absolute inset-0">
        <Image
          src="/Gemini_Generated_Image_h581xsh581xsh581.png"
          alt="ياسمين الشام - تفصيل فساتين حسب الطلب"
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority
        />
        {/* تدرج داكن للنص */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
      </div>

      {/* خلفية متدرجة للديسكتوب فقط */}
      <div className="hidden lg:block absolute inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50"></div>

      {/* عناصر زخرفية متحركة - للديسكتوب فقط */}
      <div className="hidden lg:block absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            rotate: 360,
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-20 right-20 w-32 h-32 bg-gradient-to-br from-pink-200/30 to-rose-200/30 rounded-full blur-xl"
        />
        <motion.div
          animate={{
            rotate: -360,
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-20 left-20 w-40 h-40 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-xl"
        />
        <motion.div
          animate={{
            y: [-20, 20, -20],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-1/2 left-1/4 w-6 h-6 text-pink-300"
        >
          <Sparkles className="w-full h-full" />
        </motion.div>
        <motion.div
          animate={{
            y: [20, -20, 20],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-1/3 right-1/4 w-8 h-8 text-rose-300"
        >
          <Heart className="w-full h-full" />
        </motion.div>
      </div>

      {/* ===== تصميم الموبايل الجديد - Hero كامل الشاشة ===== */}
      <div className="lg:hidden relative z-10 min-h-screen flex flex-col justify-end pb-8 px-4">
        {/* المحتوى في الأسفل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-center space-y-6"
        >
          {/* نص ترحيبي */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg"
          >
            ابدئي رحلتك معنا
          </motion.h2>

          {/* الأزرار الثلاثة */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-col gap-3"
          >
            <Link
              href="/book-appointment"
              className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              <span>حجز موعد</span>
            </Link>

            <button
              onClick={() => {
                const section = document.getElementById('ready-designs')
                if (section) {
                  section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
              className="w-full bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border border-white/40 py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              <span>الفساتين الجاهزة</span>
            </button>

            <button
              onClick={() => {
                const section = document.getElementById('featured-fabrics')
                if (section) {
                  section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
              className="w-full bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border border-white/40 py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Shirt className="w-5 h-5" />
              <span>متجر الأقمشة</span>
            </button>
          </motion.div>
        </motion.div>
      </div>

      {/* تخطيط للشاشات الكبيرة */}
      <div className="hidden lg:block container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-8 sm:pt-12 lg:pt-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* المحتوى النصي */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-right space-y-8"
          >


            {/* العنوان الرئيسي */}
            <div className="space-y-4">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight"
              >
                <span className="bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 bg-clip-text text-transparent">
                  ياسمين الشام
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-xl sm:text-2xl lg:text-3xl text-gray-700 font-medium"
              >
                تفصيل فساتين حسب الطلب
                <br />
                <span className="text-lg sm:text-xl text-pink-600">بأناقة دمشقية أصيلة</span>
              </motion.p>
            </div>

            {/* الوصف */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto lg:mx-0"
            >
              نحن نجمع بين التراث الدمشقي العريق والتصاميم العصرية لنقدم لك فساتين تعكس شخصيتك وتبرز جمالك الطبيعي.
              كل فستان قصة، وكل قصة تحكي عن الأناقة والجمال.
            </motion.p>

            {/* الأزرار */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link
                href="/book-appointment"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>حجز موعد</span>
              </Link>

              <button
                onClick={() => {
                  const section = document.getElementById('ready-designs')
                  if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }}
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>الفساتين الجاهزة</span>
              </button>

              <button
                onClick={() => {
                  const section = document.getElementById('featured-fabrics')
                  if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }}
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>متجر الأقمشة</span>
              </button>
            </motion.div>
          </motion.div>

          {/* الصورة */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative order-first lg:order-last"
          >
            <div className="relative w-full h-80 sm:h-96 md:h-[450px] lg:h-[500px] xl:h-[600px] rounded-2xl overflow-hidden shadow-2xl mx-auto max-w-md md:max-w-lg lg:max-w-none">
              <Image
                src="/yasmin.jpg?v=2024"
                alt="ياسمين الشام - تفصيل فساتين حسب الطلب"
                fill
                className="object-cover object-center"
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 90vw, (max-width: 1024px) 60vw, 50vw"
                priority
              />

              {/* تأثير الإطار */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
            </div>

            {/* عناصر زخرفية حول الصورة */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute -top-4 -right-4 w-8 h-8 text-pink-400"
            >
              <Star className="w-full h-full" />
            </motion.div>
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-4 -left-4 w-6 h-6 text-rose-400"
            >
              <Heart className="w-full h-full" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section >
  )
}
