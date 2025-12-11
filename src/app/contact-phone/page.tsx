'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Phone, ArrowRight, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function ContactPhonePage() {
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null)

  const phoneNumbers = [
    {
      department: 'قسم التفصيل',
      phone: '+966598862609',
      displayPhone: '+966 598 862 609',
      description: 'للاستفسار عن تفصيل الفساتين وحجز المواعيد'
    },
    {
      department: 'قسم الفساتين الجاهزة',
      phone: '+966501503639',
      displayPhone: '+966 501 503 639',
      description: 'للاستفسار عن الفساتين الجاهزة والأقمشة'
    }
  ]

  const copyToClipboard = (phone: string) => {
    navigator.clipboard.writeText(phone)
    setCopiedPhone(phone)
    setTimeout(() => setCopiedPhone(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        {/* زر العودة */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors duration-300 group"
          >
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            <span className="font-medium">العودة للصفحة الرئيسية</span>
          </Link>
        </motion.div>

        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full mb-6 shadow-lg">
            <Phone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              أرقام الهاتف
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            تواصلي معنا مباشرة عبر الهاتف للاستفسار عن خدماتنا
          </p>
        </motion.div>

        {/* بطاقات أرقام الهاتف */}
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6 mb-12">
          {phoneNumbers.map((item, index) => (
            <motion.div
              key={item.phone}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
              className="bg-white rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300 border border-pink-100"
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full mb-4">
                  <Phone className="w-8 h-8 text-pink-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  {item.department}
                </h2>
                <p className="text-sm text-gray-600">
                  {item.description}
                </p>
              </div>

              {/* رقم الهاتف */}
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-6 mb-4">
                <a
                  href={`tel:${item.phone}`}
                  className="block text-center text-2xl font-bold text-pink-600 hover:text-pink-700 transition-colors duration-300 mb-2"
                  dir="ltr"
                >
                  {item.displayPhone}
                </a>
              </div>

              {/* أزرار الإجراءات */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`tel:${item.phone}`}
                  className="btn-primary text-center py-3 text-sm"
                >
                  اتصال مباشر
                </a>
                <button
                  onClick={() => copyToClipboard(item.phone)}
                  className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 transition-all duration-300 text-sm font-medium"
                >
                  {copiedPhone === item.phone ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>نسخ الرقم</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* معلومات إضافية */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-2xl mx-auto bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-6 text-center"
        >
          <p className="text-blue-800 font-medium">
            ✨ ساعات العمل: السبت - الخميس (4:00 م - 10:00 م) | الجمعة: مغلق
          </p>
        </motion.div>
      </div>
    </div>
  )
}

