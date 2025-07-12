'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react'

export default function FAQ() {
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
    <section className="py-20 bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
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
              الأسئلة الشائعة
            </span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            إجابات على أكثر الأسئلة شيوعاً حول خدماتنا وطريقة العمل
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          <div className="grid gap-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100 overflow-hidden hover:shadow-lg transition-all duration-300"
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full px-3 py-4 sm:px-6 sm:py-6 text-right flex items-center justify-between hover:bg-pink-50/50 transition-colors duration-300"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center flex-shrink-0">
                      <HelpCircle className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-lg font-bold text-gray-800 text-right">
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
                  <div className="px-3 pb-4 sm:px-6 sm:pb-6">
                    <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl p-3 sm:p-6 border-r-4 border-pink-400">
                      <p className="text-gray-700 leading-relaxed text-right text-xs sm:text-base">
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
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
            className="text-center mt-10 p-4 sm:p-8 bg-white/80 backdrop-blur-sm rounded-3xl border border-pink-100"
          >
            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <HelpCircle className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
            </div>
            
            <h3 className="text-lg sm:text-2xl font-bold text-gray-800 mb-2 sm:mb-4">
              لديك سؤال آخر؟
            </h3>
            
            <p className="text-gray-600 mb-4 sm:mb-6 max-w-2xl mx-auto text-xs sm:text-base">
              لا تترددي في التواصل معنا. فريقنا جاهز للإجابة على جميع استفساراتك ومساعدتك في اختيار الأنسب لك.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="tel:+966598862609"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>اتصلي بنا</span>
              </a>
              
              <a
                href="https://wa.me/+966598862609"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
                <span>واتساب</span>
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
