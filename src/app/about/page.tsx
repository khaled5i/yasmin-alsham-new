'use client'

import { motion } from 'framer-motion'
import { Award, Users, Clock, Heart, Star, Scissors, Calendar, Phone } from 'lucide-react'
import Link from 'next/link'

export default function AboutPage() {
  const features = [
    {
      icon: Award,
      title: 'خبرة عريقة',
      description: 'أكثر من 25 سنة في عالم تفصيل الفساتين النسائية بأعلى معايير الجودة والإتقان'
    },
    {
      icon: Users,
      title: 'فريق محترف',
      description: 'خياطون مهرة متخصصون في التفصيل الراقي مع خبرة واسعة في التصاميم المختلفة'
    },
    {
      icon: Clock,
      title: 'التزام بالمواعيد',
      description: 'نضمن تسليم طلبك في الموعد المحدد مع الحفاظ على أعلى مستويات الجودة'
    },
    {
      icon: Heart,
      title: 'صنع بحب',
      description: 'كل فستان يُصنع بعناية فائقة وحب للتفاصيل ليعكس شخصيتك المميزة'
    }
  ]



  const team = [
    {
      name: 'أستاذة فاطمة',
      role: 'مديرة المحل',
      experience: 'أكثر من 25 سنة خبرة',
      specialty: 'تصميم وإدارة المشاريع'
    },
    {
      name: 'أستاذة سارة',
      role: 'خياطة رئيسية',
      experience: 'أكثر من 20 سنة خبرة',
      specialty: 'فساتين الزفاف والسهرة'
    },
    {
      name: 'أستاذة مريم',
      role: 'خياطة متخصصة',
      experience: '8 سنوات خبرة',
      specialty: 'التطريز والتفاصيل الدقيقة'
    },
    {
      name: 'أستاذة نور',
      role: 'خياطة',
      experience: '6 سنوات خبرة',
      specialty: 'الفساتين اليومية والكاجوال'
    }
  ]

  const values = [
    {
      title: 'الجودة',
      description: 'نستخدم أجود الأقمشة ونطبق أعلى معايير الجودة في كل خطوة'
    },
    {
      title: 'الإبداع',
      description: 'نحول أفكارك وأحلامك إلى تصاميم مبتكرة وفريدة'
    },
    {
      title: 'الثقة',
      description: 'نبني علاقات طويلة الأمد مع عميلاتنا القائمة على الثقة والشفافية'
    },
    {
      title: 'الاحترافية',
      description: 'فريق محترف يعمل بدقة والتزام لضمان رضاك التام'
    }
  ]

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
              عن ياسمين الشام
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            قصة حب للتراث والأناقة، حيث نجمع بين الحرفية الدمشقية الأصيلة والتصاميم العصرية
          </p>
        </motion.div>

        {/* قصتنا */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 lg:p-12 border border-pink-100 mb-16"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-6">قصتنا</h2>
              <div className="space-y-6 text-gray-700 leading-relaxed">
                <p>
                  في قلب دمشق العريقة، وُلدت فكرة "ياسمين الشام" من حب عميق للتراث والأناقة. 
                  نحن لسنا مجرد محل خياطة، بل نحن حكواتيون نحيك قصص الجمال بخيوط الحرير والحب.
                </p>
                
                <p>
                  كل فستان نصنعه يحمل في طياته روح الحرفية الدمشقية الأصيلة، ممزوجة بلمسة عصرية 
                  تواكب أحدث صيحات الموضة. نؤمن أن كل امرأة تستحق أن تشعر بالجمال والثقة.
                </p>
                
                <p>
                  فريقنا من الخياطين المهرة يعمل بشغف وإتقان لتحويل رؤيتك إلى واقع ملموس. 
                  نستخدم أجود الأقمشة ونطبق أعلى معايير الجودة في كل خطوة من خطوات التفصيل.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden shadow-xl">
                <img
                  src="/workshop.jpg"
                  alt="ورشة ياسمين الشام - حيث تولد الأحلام"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </motion.div>



        {/* المميزات */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mb-16"
        >
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-gray-800 mb-12">
            ما يميزنا
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                className="flex items-start space-x-4 space-x-reverse p-6 bg-white/70 backdrop-blur-sm rounded-xl border border-pink-100 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-xl flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* فريق العمل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mb-16"
        >
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-gray-800 mb-12">
            فريق العمل
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((member, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1 + index * 0.1 }}
                className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-bold text-gray-800 mb-1">{member.name}</h3>
                <p className="text-pink-600 font-medium mb-2">{member.role}</p>
                <p className="text-sm text-gray-600 mb-2">{member.experience}</p>
                <p className="text-xs text-gray-500">{member.specialty}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* قيمنا */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="mb-16"
        >
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-gray-800 mb-12">
            قيمنا
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.2 + index * 0.1 }}
                className="text-center p-6 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-200"
              >
                <h3 className="font-bold text-gray-800 mb-3 text-lg">{value.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* دعوة للعمل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          className="text-center"
        >
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-3xl p-8 lg:p-12 border border-pink-100">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-white" />
            </div>
            
            <h3 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-4">
              جاهزة لتبدئي رحلتك معنا؟
            </h3>
            
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              نحن هنا لنساعدك في تحويل حلمك إلى فستان يعكس شخصيتك المميزة ويجعلك تشعرين بالثقة والجمال
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/book-appointment"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>احجزي موعدك الآن</span>
              </Link>
              
              <a
                href="tel:+966598862609"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse text-lg group"
              >
                <Phone className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>اتصلي بنا</span>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
