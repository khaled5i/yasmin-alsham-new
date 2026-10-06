'use client'

import { motion } from 'framer-motion'
import { Shield, Lock, Eye, UserCheck, FileText, Mail, Home } from 'lucide-react'
import Link from 'next/link'
import { STORE_ENTITY, STORE_POLICIES_UPDATED_AT, STORE_SUPPORT_PHONE } from '@/lib/store-legal'

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
            <p className="text-gray-600">آخر تحديث: {STORE_POLICIES_UPDATED_AT}</p>
          </div>

          {/* المقدمة */}
          <section className="mb-8">
            <p className="text-gray-700 leading-relaxed">
              نحن في <strong>ياسمين الشام</strong> ({STORE_ENTITY.legalName}، سجل تجاري <bdi dir="ltr">{STORE_ENTITY.commercialRegistration}</bdi>) نلتزم بحماية خصوصيتك وبياناتك الشخصية. توضح هذه السياسة كيفية جمع واستخدام وحماية المعلومات التي تقدمها لنا عند استخدام موقعنا الإلكتروني.
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
              <p className="text-gray-700"><strong>• معلومات الدفع:</strong> حالة الدفع ورقم العملية وآخر أرقام البطاقة كما تعيدها بوابة الدفع. <strong>لا نستلم رقم بطاقتك كاملاً ولا رمز التحقق ولا نخزنهما</strong>؛ تُدخَل بيانات البطاقة مباشرة في صفحة الدفع الآمنة لدى ميسر.</p>
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
                <span>بوابة الدفع ميسر (Moyasar) المرخّصة من البنك المركزي السعودي، لمعالجة المدفوعات والاسترداد</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>شركة الشحن، بالقدر اللازم لتوصيل طلبك (الاسم ورقم الجوال والعنوان)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>مزود نظام الفوترة والمحاسبة، لإصدار الفواتير الضريبية</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>مزودي الاستضافة الذين يعمل عليهم الموقع: <strong>Vercel</strong> (خوادم في الولايات المتحدة) و<strong>Supabase</strong> (قاعدة البيانات في سنغافورة). تُعالَج بياناتك لديهم لتشغيل الموقع فقط، أي خارج المملكة العربية السعودية</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span><strong>Google Analytics</strong> لإحصاءات زيارات مجمّعة (الصفحات المزارة، نوع الجهاز، الدولة). <strong>لا يعمل في صفحات إتمام الطلب والدفع وتتبّع الطلب</strong>، ولا نرسل إليه اسمك أو جوالك أو عنوانك</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-1">•</span>
                <span>الجهات القانونية عند الضرورة القانونية</span>
              </li>
            </ul>
          </section>

          {/* مدة الاحتفاظ */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">مدة الاحتفاظ بالبيانات</h2>
            <div className="bg-pink-50 rounded-lg p-6 space-y-2">
              <p className="text-gray-700">• <strong>عنوان الشحن</strong> (اسم المستلم وجواله والحي والشارع وبقية العنوان): يُمحى تلقائياً بعد <strong>90 يوماً</strong> من تسليم الطلب أو إلغائه، أو من انتهاء مهلة دفع طلب لم يُدفع. تبقى المدينة وحدها لأغراض الإحصاء.</p>
              <p className="text-gray-700">• <strong>بيانات الطلب والفاتورة</strong> (الأصناف والمبالغ والاسم والجوال في الفاتورة): تُحفظ المدة التي يفرضها النظام للسجلات المحاسبية والضريبية.</p>
            </div>
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
              نستخدم ملفات تعريف الارتباط لتحسين تجربتك على الموقع، وتذكر تفضيلاتك، وتحليل حركة المرور (Google Analytics). ويستخدم متجر الأقمشة ملف ارتباط ضرورياً لربط متصفحك بطلبك مدة 90 يوماً. يمكنك تعطيل ملفات تعريف الارتباط من إعدادات المتصفح.
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
              <p className="text-gray-700"><strong>التفصيل — الهاتف / واتساب:</strong> <bdi dir="ltr">+966598862609</bdi></p>
              <p className="text-gray-700"><strong>متجر الأقمشة — الهاتف / واتساب:</strong> <bdi dir="ltr">{STORE_SUPPORT_PHONE.e164}</bdi></p>
              <p className="text-gray-700"><strong>العنوان:</strong> {STORE_ENTITY.address}</p>
            </div>
          </section>

          {/* التحديثات */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">تحديثات السياسة</h2>
            <p className="text-gray-700 leading-relaxed">
              قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. سيتم نشر أي تغييرات على هذه الصفحة مع تحديث تاريخ «آخر تحديث» في الأعلى.
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

