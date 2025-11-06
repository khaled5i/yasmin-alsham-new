'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Sparkles, Heart, Star } from 'lucide-react'

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-2 sm:pt-4 lg:pt-6">
      {/* خلفية متدرجة */}
      <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50"></div>
      
      {/* عناصر زخرفية متحركة */}
      <div className="absolute inset-0 overflow-hidden">
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

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 -mt-16 sm:-mt-24 lg:-mt-32">
        {/* تخطيط للشاشات الصغيرة والمتوسطة */}
        <div className="lg:hidden">
          <div className="text-center space-y-8">
            {/* العنوان الرئيسي والفرعي */}
            <motion.div
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-6"
            >
              {/* العنوان الرئيسي */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-3xl sm:text-4xl font-bold leading-tight"
              >
                <span className="bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 bg-clip-text text-transparent">
                  ياسمين الشام
                </span>
              </motion.h1>

              {/* العنوان الفرعي */}
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-lg sm:text-xl text-gray-700 font-medium"
              >
                تفصيل فساتين حسب الطلب بأناقة دمشقية
              </motion.p>
            </motion.div>

            {/* الصورة */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative w-full h-80 sm:h-96 md:h-[400px] rounded-2xl overflow-hidden shadow-2xl mx-auto max-w-sm sm:max-w-md">
                <Image
                  src="/yasmin.jpg?v=2024"
                  alt="ياسمين الشام - تفصيل فساتين حسب الطلب"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 90vw, (max-width: 768px) 80vw, 60vw"
                  priority
                />
                {/* تأثير الإطار */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
              </div>

              {/* عناصر زخرفية حول الصورة */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute -top-4 -right-4 w-6 h-6 text-pink-400"
              >
                <Star className="w-full h-full" />
              </motion.div>
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute -bottom-4 -left-4 w-6 h-6 text-purple-400"
              >
                <Sparkles className="w-full h-full" />
              </motion.div>
            </motion.div>

            {/* الوصف والأزرار */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="space-y-6"
            >
              {/* الوصف */}
              <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
                نحن متخصصون في تفصيل الفساتين الراقية بلمسة دمشقية أصيلة.
                من فساتين الزفاف الفاخرة إلى فساتين السهرة الأنيقة،
                نحول أحلامك إلى واقع بأيدي خبيرة وتصاميم مبتكرة.
              </p>

              {/* الأزرار */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/book-appointment"
                  className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
                >
                  <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                  <span>حجز موعد</span>
                </Link>

                <Link
                  href="/designs"
                  className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
                >
                  <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                  <span>الفساتين الجاهزة</span>
                </Link>

                <Link
                  href="/fabrics"
                  className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
                >
                  <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                  <span>متجر الأقمشة</span>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* تخطيط للشاشات الكبيرة */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-12 items-center">
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

              <Link
                href="/designs"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>الفساتين الجاهزة</span>
              </Link>

              <Link
                href="/fabrics"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>متجر الأقمشة</span>
              </Link>
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
    </section>
  )
}
