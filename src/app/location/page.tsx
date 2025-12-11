'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { MapPin, ArrowRight, Navigation, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function LocationPage() {
  const [copied, setCopied] = useState(false)

  const locationInfo = {
    address: 'الخبر الشمالية، التقاطع 6، شارع الأمير مشعل',
    city: 'الخبر',
    country: 'المملكة العربية السعودية',
    // إحداثيات تقريبية للخبر الشمالية - يمكن تحديثها بالإحداثيات الدقيقة
    coordinates: {
      lat: 26.2885,
      lng: 50.2085
    }
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(locationInfo.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openInMaps = () => {
    // فتح في خرائط جوجل
    const url = 'https://maps.app.goo.gl/86Jz8hzDm42EjuAG9'
    window.open(url, '_blank')
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
            <MapPin className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              موقعنا
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            زورينا في محلنا للحصول على أفضل خدمة تفصيل فساتين
          </p>
        </motion.div>

        {/* بطاقة العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl p-8 lg:p-12 mb-8"
        >
          {/* أيقونة الموقع */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full mb-4">
              <MapPin className="w-8 h-8 text-pink-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              عنوان المحل
            </h2>
          </div>

          {/* العنوان */}
          <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-6 mb-6">
            <p className="text-xl font-bold text-gray-800 text-center mb-2">
              {locationInfo.address}
            </p>
            <p className="text-gray-600 text-center">
              {locationInfo.city}، {locationInfo.country}
            </p>
          </div>

          {/* أزرار الإجراءات */}
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={openInMaps}
              className="btn-primary flex items-center justify-center gap-2 py-4"
            >
              <Navigation className="w-5 h-5" />
              <span>فتح في خرائط جوجل</span>
            </button>
            <button
              onClick={copyAddress}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-4 transition-all duration-300 font-medium"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>تم نسخ العنوان</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  <span>نسخ العنوان</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* معلومات إضافية */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-2xl mx-auto"
        >
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-6 text-center">
            <p className="text-blue-800 font-medium">
              ✨ ساعات العمل: السبت - الخميس (4:00 م - 10:00 م) | الجمعة: مغلق
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

