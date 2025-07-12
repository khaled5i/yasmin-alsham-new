'use client'

import { motion } from 'framer-motion'
import { FileText, CheckCircle, AlertTriangle, Clock, CreditCard, Phone, Mail } from 'lucide-react'

export default function TermsPage() {
  const sections = [
    {
      icon: CheckCircle,
      title: 'قبول الشروط',
      content: [
        'باستخدام خدماتنا، فإنك توافقين على هذه الشروط والأحكام',
        'يجب قراءة هذه الشروط بعناية قبل حجز أي موعد أو طلب خدمة',
        'نحتفظ بالحق في تعديل هذه الشروط في أي وقت مع إشعار مسبق',
        'استمرار استخدام خدماتنا يعني موافقتك على أي تحديثات'
      ]
    },
    {
      icon: Clock,
      title: 'المواعيد والحجوزات',
      content: [
        'يجب تأكيد الموعد قبل 24 ساعة من الوقت المحدد',
        'في حالة التأخير أكثر من 15 دقيقة، قد يتم إلغاء الموعد',
        'يمكن إعادة جدولة الموعد مرة واحدة مجاناً قبل 48 ساعة',
        'الإلغاء في اللحظة الأخيرة قد يؤدي إلى رسوم إضافية'
      ]
    },
    {
      icon: CreditCard,
      title: 'الدفع والأسعار',
      content: [
        'يُطلب دفع مقدم 50% عند أخذ المقاسات وتأكيد الطلب',
        'الباقي يُدفع عند استلام الفستان المكتمل',
        'الأسعار المعلنة لا تشمل التعديلات الإضافية غير المتفق عليها',
        'نقبل الدفع نقداً أو عبر التحويل البنكي'
      ]
    },
    {
      icon: AlertTriangle,
      title: 'المسؤوليات والضمانات',
      content: [
        'نضمن جودة التفصيل والخامات المستخدمة',
        'العميلة مسؤولة عن دقة المقاسات المقدمة',
        'نقدم تعديلات مجانية لمدة أسبوعين من التسليم للأخطاء من جانبنا',
        'لا نتحمل مسؤولية التلف الناتج عن سوء الاستخدام'
      ]
    }
  ]

  const policies = [
    {
      title: 'سياسة الإرجاع والاستبدال',
      items: [
        'لا يمكن إرجاع الفساتين المفصلة حسب الطلب إلا في حالات خاصة',
        'يحق للعميلة طلب تعديلات مجانية خلال أسبوعين من التسليم',
        'في حالة وجود عيب في التصنيع، نتكفل بالإصلاح مجاناً',
        'التعديلات الإضافية بناءً على طلب العميلة تخضع لرسوم إضافية'
      ]
    },
    {
      title: 'سياسة الخصوصية والبيانات',
      items: [
        'نحافظ على سرية جميع المعلومات الشخصية للعميلات',
        'لا نشارك بياناتك مع أي طرف ثالث دون موافقتك',
        'نستخدم معلوماتك فقط لتقديم الخدمة والتواصل معك',
        'يمكنك طلب حذف بياناتك في أي وقت'
      ]
    },
    {
      title: 'سياسة التأخير',
      items: [
        'نلتزم بمواعيد التسليم المتفق عليها',
        'في حالة التأخير لأسباب خارجة عن إرادتنا، سنقوم بإشعارك فوراً',
        'قد نقدم تعويضاً مناسباً في حالة التأخير الكبير',
        'الظروف القاهرة (مثل الأعياد أو الطوارئ) قد تؤثر على المواعيد'
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
            <FileText className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              الشروط والأحكام
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            يرجى قراءة هذه الشروط والأحكام بعناية قبل استخدام خدمات ياسمين الشام
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

        {/* الشروط الأساسية */}
        <div className="max-w-4xl mx-auto space-y-8 mb-16">
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

        {/* السياسات التفصيلية */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-gray-800 mb-12">
            السياسات التفصيلية
          </h2>
          
          <div className="space-y-8">
            {policies.map((policy, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1 + index * 0.1 }}
                className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-100"
              >
                <h3 className="text-xl font-bold text-gray-800 mb-6">{policy.title}</h3>
                
                <ul className="space-y-3">
                  {policy.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-start space-x-3 space-x-reverse text-gray-700">
                      <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* تنبيه مهم */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          className="max-w-4xl mx-auto mb-12"
        >
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-6 border border-yellow-200">
            <h4 className="font-bold text-gray-800 mb-3 flex items-center space-x-2 space-x-reverse">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <span>تنبيه مهم</span>
            </h4>
            <p className="text-gray-700 text-sm leading-relaxed">
              هذه الشروط والأحكام تشكل اتفاقية قانونية بينك وبين ياسمين الشام. 
              إذا كنت لا توافقين على أي من هذه الشروط، يرجى عدم استخدام خدماتنا. 
              للاستفسارات أو التوضيحات، لا تترددي في التواصل معنا.
            </p>
          </div>
        </motion.div>

        {/* التواصل */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
              لديك أسئلة حول الشروط والأحكام؟
            </h3>
            
            <p className="text-gray-600 text-center mb-6">
              فريقنا جاهز للإجابة على جميع استفساراتك وتوضيح أي نقطة غير واضحة
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
                href="mailto:legal@yasminalsham.com"
                className="btn-secondary inline-flex items-center justify-center space-x-2 space-x-reverse"
              >
                <Mail className="w-5 h-5" />
                <span>راسلينا</span>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
