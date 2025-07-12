'use client'

import { motion } from 'framer-motion'
import { Shield, Lock, Eye, UserCheck, Phone, Mail } from 'lucide-react'

export default function PrivacyPage() {
  const sections = [
    {
      icon: UserCheck,
      title: 'جمع المعلومات',
      content: [
        'نجمع المعلومات التي تقدمينها لنا مباشرة عند حجز موعد أو طلب خدمة',
        'المعلومات الأساسية مثل الاسم ورقم الهاتف ضرورية لتقديم خدماتنا',
        'لا نجمع أي معلومات شخصية إضافية دون موافقتك الصريحة',
        'جميع المعلومات المجمعة تُستخدم فقط لأغراض تقديم الخدمة'
      ]
    },
    {
      icon: Lock,
      title: 'حماية البيانات',
      content: [
        'نستخدم أحدث تقنيات الحماية لضمان أمان معلوماتك الشخصية',
        'جميع البيانات محمية بتشفير عالي المستوى',
        'لا نشارك معلوماتك مع أي طرف ثالث دون موافقتك',
        'فريقنا مدرب على أعلى معايير الخصوصية والأمان'
      ]
    },
    {
      icon: Eye,
      title: 'استخدام المعلومات',
      content: [
        'نستخدم معلوماتك لتقديم خدمات التفصيل والخياطة',
        'إرسال تذكيرات المواعيد والتحديثات المهمة',
        'تحسين جودة خدماتنا وتجربة العملاء',
        'التواصل معك بخصوص طلباتك واستفساراتك'
      ]
    },
    {
      icon: Shield,
      title: 'حقوقك',
      content: [
        'يحق لك طلب نسخة من المعلومات التي نحتفظ بها عنك',
        'يمكنك طلب تعديل أو حذف معلوماتك في أي وقت',
        'يحق لك إلغاء الاشتراك في التذكيرات والإشعارات',
        'نلتزم بالرد على طلباتك خلال 48 ساعة'
      ]
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
          <div className="w-20 h-20 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              سياسة الخصوصية
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            نحن في ياسمين الشام نقدر خصوصيتك ونلتزم بحماية معلوماتك الشخصية وفقاً لأعلى المعايير
          </p>
        </motion.div>

        {/* تاريخ آخر تحديث */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center mb-12"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-pink-100 inline-block">
            <p className="text-gray-600">
              <strong>آخر تحديث:</strong> يناير 2024
            </p>
          </div>
        </motion.div>

        {/* الأقسام */}
        <div className="max-w-4xl mx-auto space-y-8">
          {sections.map((section, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100"
            >
              <div className="flex items-start space-x-4 space-x-reverse mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-xl flex items-center justify-center flex-shrink-0">
                  <section.icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">{section.title}</h2>
              </div>
              
              <ul className="space-y-4">
                {section.content.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start space-x-3 space-x-reverse text-gray-700">
                    <div className="w-2 h-2 bg-pink-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* معلومات إضافية */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="max-w-4xl mx-auto mt-12"
        >
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-100">
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
              ملفات تعريف الارتباط (Cookies)
            </h3>
            
            <div className="space-y-4 text-gray-700">
              <p>
                نستخدم ملفات تعريف الارتباط لتحسين تجربتك على موقعنا الإلكتروني. هذه الملفات تساعدنا في:
              </p>
              
              <ul className="space-y-2 mr-6">
                <li className="flex items-start space-x-3 space-x-reverse">
                  <div className="w-2 h-2 bg-pink-400 rounded-full mt-2"></div>
                  <span>تذكر تفضيلاتك وإعداداتك</span>
                </li>
                <li className="flex items-start space-x-3 space-x-reverse">
                  <div className="w-2 h-2 bg-pink-400 rounded-full mt-2"></div>
                  <span>تحليل استخدام الموقع لتحسين الخدمات</span>
                </li>
                <li className="flex items-start space-x-3 space-x-reverse">
                  <div className="w-2 h-2 bg-pink-400 rounded-full mt-2"></div>
                  <span>ضمان الأمان والحماية</span>
                </li>
              </ul>
              
              <p>
                يمكنك إدارة إعدادات ملفات تعريف الارتباط من خلال متصفحك في أي وقت.
              </p>
            </div>
          </div>
        </motion.div>

        {/* التواصل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="max-w-4xl mx-auto mt-12"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
              لديك أسئلة حول سياسة الخصوصية؟
            </h3>
            
            <p className="text-gray-600 text-center mb-6">
              لا تترددي في التواصل معنا إذا كان لديك أي استفسارات حول كيفية التعامل مع معلوماتك الشخصية
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="tel:+966598862609"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse"
              >
                <Phone className="w-5 h-5" />
                <span>اتصلي بنا</span>
              </a>
              
              <a
                href="mailto:privacy@yasminalsham.com"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse"
              >
                <Mail className="w-5 h-5" />
                <span>راسلينا</span>
              </a>
            </div>
          </div>
        </motion.div>

        {/* تحديثات السياسة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="max-w-4xl mx-auto mt-12"
        >
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-6 border border-yellow-200">
            <h4 className="font-bold text-gray-800 mb-3 flex items-center space-x-2 space-x-reverse">
              <Shield className="w-5 h-5 text-yellow-600" />
              <span>تحديثات السياسة</span>
            </h4>
            <p className="text-gray-700 text-sm leading-relaxed">
              قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. سنقوم بإشعارك بأي تغييرات مهمة عبر الموقع الإلكتروني 
              أو وسائل التواصل المعتادة. ننصحك بمراجعة هذه الصفحة بشكل دوري للاطلاع على أي تحديثات.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
