'use client'

import { motion } from 'framer-motion'
import { FileText, ShoppingBag, AlertCircle, Home } from 'lucide-react'
import Link from 'next/link'

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20 lg:pt-24">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl"
        >
          {/* العنوان الرئيسي */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <FileText className="w-16 h-16 text-pink-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2">شروط الخدمة</h1>
            <p className="text-gray-600">آخر تحديث: ديسمبر 2024</p>
          </div>

          {/* المقدمة */}
          <section className="mb-8">
            <p className="text-gray-700 leading-relaxed">
              مرحباً بك في <strong>ياسمين الشام</strong>. باستخدامك لموقعنا الإلكتروني وخدماتنا، فإنك توافق على الالتزام بشروط الخدمة التالية. يرجى قراءة هذه الشروط بعناية قبل استخدام الموقع.
            </p>
          </section>

          {/* قبول الشروط */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">1. قبول الشروط</h2>
            <p className="text-gray-700 leading-relaxed">
              باستخدامك لموقع ياسمين الشام، فإنك توافق على الالتزام بهذه الشروط وجميع القوانين واللوائح المعمول بها. إذا كنت لا توافق على أي من هذه الشروط، يُرجى عدم استخدام الموقع.
            </p>
          </section>

          {/* استخدام الموقع */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">2. استخدام الموقع</h2>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>يجب أن تكون بعمر 18 عاماً أو أكثر لاستخدام هذا الموقع</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>يجب تقديم معلومات دقيقة وصحيحة عند إنشاء حساب أو إجراء طلب</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>أنت مسؤول عن الحفاظ على سرية معلومات حسابك</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>يُحظر استخدام الموقع لأي أغراض غير قانونية أو غير مصرح بها</span>
              </li>
            </ul>
          </section>

          {/* المنتجات والطلبات */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingBag className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">3. المنتجات والطلبات</h2>
            </div>
            <div className="bg-pink-50 rounded-lg p-6 space-y-3">
              <p className="text-gray-700"><strong>• الأسعار:</strong> جميع الأسعار معروضة بالريال السعودي وقابلة للتغيير دون إشعار مسبق.</p>
              <p className="text-gray-700"><strong>• التوفر:</strong> نبذل قصارى جهدنا لضمان دقة معلومات المنتجات، لكن التوفر قد يتغير.</p>
              <p className="text-gray-700"><strong>• التصاميم المخصصة:</strong> الطلبات المخصصة غير قابلة للإلغاء بعد بدء التنفيذ.</p>
              <p className="text-gray-700"><strong>• تأكيد الطلب:</strong> نحتفظ بالحق في رفض أو إلغاء أي طلب لأي سبب.</p>
            </div>
          </section>

          {/* الملكية الفكرية */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">4. الملكية الفكرية</h2>
            <p className="text-gray-700 leading-relaxed">
              جميع المحتويات على هذا الموقع، بما في ذلك النصوص والصور والتصاميم والشعارات، هي ملكية حصرية لـ <strong>ياسمين الشام</strong> ومحمية بموجب قوانين حقوق النشر. يُحظر نسخ أو توزيع أو استخدام أي محتوى دون إذن كتابي مسبق.
            </p>
          </section>

          {/* إخلاء المسؤولية */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">5. إخلاء المسؤولية</h2>
            </div>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>نبذل قصارى جهدنا لضمان دقة المعلومات، لكننا لا نضمن خلو الموقع من الأخطاء</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>الألوان المعروضة قد تختلف قليلاً عن الألوان الفعلية بسبب إعدادات الشاشة</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>نحن غير مسؤولين عن أي أضرار ناتجة عن استخدام الموقع</span>
              </li>
            </ul>
          </section>

          {/* تعديل الشروط */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">6. تعديل الشروط</h2>
            <p className="text-gray-700 leading-relaxed">
              نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم نشر أي تغييرات على هذه الصفحة، واستمرارك في استخدام الموقع بعد التعديلات يعني موافقتك على الشروط الجديدة.
            </p>
          </section>

          {/* القانون الحاكم */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">7. القانون الحاكم</h2>
            <p className="text-gray-700 leading-relaxed">
              تخضع هذه الشروط وتُفسر وفقاً لقوانين المملكة العربية السعودية. أي نزاع ينشأ عن هذه الشروط يخضع للاختصاص القضائي الحصري للمحاكم السعودية.
            </p>
          </section>

          {/* التواصل */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">8. التواصل معنا</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              إذا كان لديك أي أسئلة حول شروط الخدمة، يرجى التواصل معنا:
            </p>
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
              <p className="text-gray-700"><strong>الهاتف / واتساب:</strong> +966598862609</p>
            </div>
          </section>

          {/* زر العودة للصفحة الرئيسية */}
          <div className="text-center">
            <Link href="/">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <Home className="w-5 h-5" />
                العودة للصفحة الرئيسية
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

