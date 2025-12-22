'use client'

import { motion } from 'framer-motion'
import { Shield, Lock, Eye, UserCheck, FileText, Mail, Home } from 'lucide-react'
import Link from 'next/link'

export default function PrivacyPolicyPage() {
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
              <Shield className="w-16 h-16 text-pink-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2">سياسة الخصوصية</h1>
            <p className="text-gray-600">آخر تحديث: ديسمبر 2024</p>
          </div>

          {/* المقدمة */}
          <section className="mb-8">
            <p className="text-gray-700 leading-relaxed">
              نحن في <strong>ياسمين الشام</strong> نلتزم بحماية خصوصيتك وبياناتك الشخصية. توضح هذه السياسة كيفية جمع واستخدام وحماية المعلومات التي تقدمها لنا عند استخدام موقعنا الإلكتروني.
            </p>
          </section>

          {/* جمع المعلومات */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">المعلومات التي نجمعها</h2>
            </div>
            <div className="bg-pink-50 rounded-lg p-6 space-y-3">
              <p className="text-gray-700"><strong>• المعلومات الشخصية:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، العنوان عند إجراء طلب.</p>
              <p className="text-gray-700"><strong>• معلومات الطلب:</strong> تفاصيل المنتجات المطلوبة، تفضيلات التصميم، المقاسات.</p>
            </div>
          </section>

          {/* استخدام المعلومات */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <UserCheck className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">كيفية استخدام المعلومات</h2>
            </div>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>معالجة وتنفيذ طلباتك وتوصيل المنتجات</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>التواصل معك بخصوص طلباتك والرد على استفساراتك</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>تحسين خدماتنا وتجربة المستخدم على الموقع</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>إرسال عروض وتحديثات تسويقية (يمكنك إلغاء الاشتراك في أي وقت)</span>
              </li>
            </ul>
          </section>

          {/* حماية البيانات */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">حماية بياناتك</h2>
            </div>
            <p className="text-gray-700 leading-relaxed mb-3">
              نستخدم إجراءات أمنية متقدمة لحماية معلوماتك الشخصية من الوصول غير المصرح به أو التعديل أو الإفصاح أو الإتلاف:
            </p>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>تشفير البيانات باستخدام بروتوكول SSL</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>تخزين آمن للبيانات في خوادم محمية</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>الوصول المحدود للبيانات للموظفين المصرح لهم فقط</span>
              </li>
            </ul>
          </section>

          {/* مشاركة المعلومات */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Eye className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">مشاركة المعلومات</h2>
            </div>
            <p className="text-gray-700 leading-relaxed">
              نحن <strong>لا نبيع أو نؤجر</strong> معلوماتك الشخصية لأطراف ثالثة. قد نشارك معلوماتك فقط مع:
            </p>
            <ul className="space-y-2 text-gray-700 mt-3">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>الجهات القانونية عند الضرورة القانونية</span>
              </li>
            </ul>
          </section>

          {/* حقوقك */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">حقوقك</h2>
            <div className="bg-purple-50 rounded-lg p-6 space-y-2">
              <p className="text-gray-700">• الحق في الوصول إلى بياناتك الشخصية</p>
              <p className="text-gray-700">• الحق في تصحيح أو تحديث بياناتك</p>
              <p className="text-gray-700">• الحق في حذف بياناتك</p>
              <p className="text-gray-700">• الحق في الاعتراض على معالجة بياناتك</p>
            </div>
          </section>

          {/* ملفات تعريف الارتباط */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">ملفات تعريف الارتباط (Cookies)</h2>
            <p className="text-gray-700 leading-relaxed">
              نستخدم ملفات تعريف الارتباط لتحسين تجربتك على الموقع، وتذكر تفضيلاتك، وتحليل حركة المرور. يمكنك تعطيل ملفات تعريف الارتباط من إعدادات المتصفح.
            </p>
          </section>

          {/* التواصل */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-6 h-6 text-pink-600" />
              <h2 className="text-2xl font-bold text-gray-800">تواصل معنا</h2>
            </div>
            <p className="text-gray-700 leading-relaxed">
              إذا كان لديك أي أسئلة أو استفسارات حول سياسة الخصوصية، يرجى التواصل معنا عبر:
            </p>
            <div className="mt-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
              <p className="text-gray-700"><strong>الهاتف / واتساب:</strong> +966598862609</p>
            </div>
          </section>

          {/* التحديثات */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">تحديثات السياسة</h2>
            <p className="text-gray-700 leading-relaxed">
              قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. سيتم نشر أي تغييرات على هذه الصفحة مع تحديث تاريخ "آخر تحديث" في الأعلى.
            </p>
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

