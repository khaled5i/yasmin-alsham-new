'use client'

import { motion } from 'framer-motion'
import { Award, Users, Clock, Heart, Star, Scissors, Sparkles } from 'lucide-react'

export default function About() {
  const features = [
    {
      icon: Award,
      title: 'خبرة عريقة',
      description: 'أكثر من 25 سنة في عالم تفصيل الفساتين النسائية'
    },
    {
      icon: Users,
      title: 'فريق محترف',
      description: 'خياطون مهرة متخصصون في التفصيل الراقي'
    },
    {
      icon: Clock,
      title: 'التزام بالمواعيد',
      description: 'نضمن تسليم طلبك في الموعد المحدد'
    },
    {
      icon: Heart,
      title: 'صنع بحب',
      description: 'كل فستان يُصنع بعناية فائقة وحب للتفاصيل'
    }
  ]

  return (
    <section className="relative py-24 overflow-hidden">
      {/* خلفية متدرجة مع تأثيرات بصرية */}
      <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(236,72,153,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.1),transparent_50%)]"></div>
      </div>

      {/* عناصر زخرفية متحركة */}
      <motion.div
        animate={{
          rotate: [0, 360],
          scale: [1, 1.1, 1]
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute top-20 left-10 w-16 h-16 text-pink-200/30"
      >
        <Sparkles className="w-full h-full" />
      </motion.div>

      <motion.div
        animate={{
          rotate: [360, 0],
          y: [0, -20, 0]
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute bottom-20 right-10 w-12 h-12 text-purple-200/30"
      >
        <Star className="w-full h-full" />
      </motion.div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        {/* العنوان الرئيسي */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 px-3 py-2 sm:px-6 sm:py-3 bg-white/80 backdrop-blur-sm rounded-full border border-pink-200/50 shadow-lg"
          >
            <Scissors className="w-4 h-4 sm:w-6 sm:h-6 text-pink-500" />
            <span className="text-pink-600 font-semibold text-base sm:text-lg">حكايتنا</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
          >
            <span className="bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 bg-clip-text text-transparent">
              قصة ياسمين الشام
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            viewport={{ once: true }}
            className="text-sm sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed"
          >
            رحلة من الشغف والإبداع تمتد عبر عقود من الزمن
          </motion.p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* المحتوى النصي */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="space-y-10"
          >
            {/* النص الرئيسي */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-white/60 backdrop-blur-sm rounded-3xl p-8 border border-pink-100/50 shadow-xl"
            >
              <div className="space-y-6 text-base sm:text-lg text-gray-700 leading-relaxed">
                <p className="text-base sm:text-lg font-medium text-gray-800 mb-6">
                  في قلب دمشق العريقة، وُلدت فكرة "ياسمين الشام" من حب عميق للتراث والأناقة.
                </p>

                <p>
                  نحن لسنا مجرد محل خياطة، بل نحن حكواتيون نحيك قصص الجمال بخيوط الحرير والحب.
                  كل فستان نصنعه يحمل في طياته روح الحرفية الدمشقية الأصيلة، ممزوجة بلمسة عصرية
                  تواكب أحدث صيحات الموضة.
                </p>

                <p>
                  نؤمن أن كل امرأة تستحق أن تشعر بالجمال والثقة. فريقنا من الخياطين المهرة يعمل
                  بشغف وإتقان لتحويل رؤيتك إلى واقع ملموس، مستخدمين أجود الأقمشة ومطبقين أعلى
                  معايير الجودة في كل خطوة من خطوات التفصيل.
                </p>
              </div>
            </motion.div>

            {/* المميزات */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              viewport={{ once: true }}
              className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{
                    scale: 1.02,
                    transition: { duration: 0.2 }
                  }}
                  className="group relative overflow-hidden"
                >
                  <div className="relative flex items-start space-x-3 space-x-reverse p-4 sm:p-6 bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-pink-100/50 shadow-lg hover:shadow-xl transition-all duration-300">
                    <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-pink-400 to-rose-500 rounded-lg sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <feature.icon className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 mb-1 sm:mb-2 text-sm sm:text-lg leading-tight">{feature.title}</h3>
                      <p className="text-gray-600 leading-relaxed text-xs sm:text-sm">{feature.description}</p>
                    </div>

                    {/* تأثير الهوفر */}
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* الصورة والعناصر البصرية */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="relative"
          >
            {/* الصورة الرئيسية */}
            <div className="relative group">
              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.3 }}
                className="relative w-full h-96 lg:h-[500px] rounded-3xl overflow-hidden shadow-2xl"
              >
                <img
                  src="/workshop.jpg"
                  alt="ورشة ياسمين الشام"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />

                {/* تأثيرات التدرج */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-purple-500/10"></div>

              </motion.div>

              {/* عناصر زخرفية حول الصورة */}
              <motion.div
                animate={{
                  rotate: [0, 360],
                  scale: [1, 1.2, 1]
                }}
                transition={{
                  duration: 15,
                  repeat: Infinity,
                  ease: "linear"
                }}
                className="absolute -top-6 -right-6 w-12 h-12 text-pink-400"
              >
                <Star className="w-full h-full drop-shadow-lg" />
              </motion.div>

              <motion.div
                animate={{
                  rotate: [360, 0],
                  y: [0, -10, 0]
                }}
                transition={{
                  duration: 12,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute -bottom-4 -left-4 w-10 h-10 text-purple-400"
              >
                <Sparkles className="w-full h-full drop-shadow-lg" />
              </motion.div>

              {/* إطار زخرفي */}
              <div className="absolute -inset-4 bg-gradient-to-r from-pink-200/20 to-purple-200/20 rounded-3xl -z-10 blur-xl"></div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
