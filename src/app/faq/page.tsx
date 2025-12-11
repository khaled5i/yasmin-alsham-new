'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { ChevronDown, ChevronUp, HelpCircle, Home } from 'lucide-react'
import Link from 'next/link'
import Header from '@/components/Header'

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const faqs = [
    {
      question: 'كم يستغرق تفصيل الفستان؟',
      answer: 'عادة ما يستغرق تفصيل الفستان من 7 إلى 14 يوم عمل، حسب تعقيد التصميم والتفاصيل المطلوبة. نحرص على إعطائك موعد دقيق عند أخذ المقاسات.'
    },
    {
      question: 'هل يمكنني إحضار تصميم خاص بي؟',
      answer: 'بالطبع! نرحب بأفكارك وتصاميمك الخاصة. فريقنا سيعمل معك لتحويل رؤيتك إلى واقع، مع تقديم النصائح المهنية لضمان أفضل النتائج.'
    },
    {
      question: 'ما هي أوقات العمل؟',
      answer: 'نعمل 6 أيام في الأسبوع (عدا يوم الجمعة) من الساعة 4:00 مساءً حتى 10:00 مساءً. يمكنك حجز موعدك عبر موقعنا الإلكتروني.'
    },
    {
      question: 'هل تقدمون خدمة التعديلات؟',
      answer: 'نعم، يوجد لدينا فريق نسائي متخصص بإجراء التعديلات.'
    },
    {
      question: 'ما أنواع الأقمشة المتوفرة؟',
      answer: 'لدينا مجموعة واسعة من الأقمشة التي تخص فساتين السهرة والزفاف. يمكنك أيضاً إحضار القماش الخاص بك.'
    },
    {
      question: 'كيف يمكنني تتبع حالة طلبي؟',
      answer: 'يمكنك تتبع حالة طلبك عبر صفحة "استعلام عن الطلب" في موقعنا بطريقتين: إما باستخدام رقم الطلب (Order ID) الذي تحصلين عليه عند تأكيد الطلب، أو باستخدام رقم الهاتف المستخدم عند إجراء الطلب. ستحصلين على تحديثات منتظمة عبر الرسائل النصية.'
    },
    {
      question: 'هل تقدمون خدمة التوصيل؟',
      answer: 'نعم، يوجد لدينا خدمة توصيل لجميع مناطق المملكة العربية السعودية.'
    }
  ]

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-20">
        <section className="py-12 lg:py-20 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
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
                  الأسئلة الشائعة
                </span>
              </h1>
              <p className="text-base lg:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                إجابات على أكثر الأسئلة شيوعاً حول خدماتنا وطريقة العمل
              </p>
            </motion.div>

            <div className="max-w-4xl mx-auto">
              <div className="grid gap-4">
                {faqs.map((faq, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100 overflow-hidden hover:shadow-lg transition-all duration-300"
                  >
                    <button
                      onClick={() => toggleFAQ(index)}
                      className="w-full px-4 py-5 sm:px-6 sm:py-6 text-right flex items-center justify-between hover:bg-pink-50/50 transition-colors duration-300"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center flex-shrink-0">
                          <HelpCircle className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-800 text-right">
                          {faq.question}
                        </h3>
                      </div>

                      <div className="flex-shrink-0 mr-4">
                        {openIndex === index ? (
                          <ChevronUp className="w-6 h-6 text-pink-600" />
                        ) : (
                          <ChevronDown className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                    </button>

                    <motion.div
                      initial={false}
                      animate={{
                        height: openIndex === index ? 'auto' : 0,
                        opacity: openIndex === index ? 1 : 0
                      }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-5 sm:px-6 sm:pb-6">
                        <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl p-4 sm:p-6 border-r-4 border-pink-400">
                          <p className="text-gray-700 leading-relaxed text-right text-sm sm:text-base">
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </div>

              {/* دعوة للتواصل */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-center mt-12 p-6 sm:p-8 bg-white/80 backdrop-blur-sm rounded-3xl border border-pink-100"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <HelpCircle className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 sm:mb-4">
                  لديك سؤال آخر؟
                </h3>

                <p className="text-gray-600 mb-5 sm:mb-6 max-w-2xl mx-auto text-sm sm:text-base">
                  لا تترددي في التواصل معنا. فريقنا جاهز للإجابة على جميع استفساراتك.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <a
                    href="tel:+966598862609"
                    className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse"
                  >
                    <span>اتصلي بنا</span>
                  </a>
                  <a
                    href="https://wa.me/+966598862609"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse"
                  >
                    <span>واتساب</span>
                  </a>
                </div>

                {/* زر العودة للصفحة الرئيسية */}
                <div className="mt-6 pt-6 border-t border-pink-100">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 font-medium transition-colors duration-300 group"
                  >
                    <Home className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                    <span>العودة للصفحة الرئيسية</span>
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

