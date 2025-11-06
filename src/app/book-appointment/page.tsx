'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, MessageSquare, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useAppointmentStore } from '@/store/appointmentStore'
import NumericInput from '@/components/NumericInput'

export default function BookAppointmentPage() {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [serviceType, setServiceType] = useState('consultation')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Hydration-safe state for date formatting
  const [isMounted, setIsMounted] = useState(false)
  const [formattedDates, setFormattedDates] = useState<{[key: string]: string}>({})

  const { createAppointment, appointments, loadAppointments } = useAppointmentStore()

  // إعادة تحميل المواعيد عند تغيير التاريخ المختار
  useEffect(() => {
    if (selectedDate) {
      console.log('🔄 Reloading appointments for date:', selectedDate)
      loadAppointments()
    }
  }, [selectedDate, loadAppointments])

  // Client-side date formatting to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true)

    // مسح بيانات المواعيد القديمة من localStorage
    try {
      const oldDataStoreKey = 'data-store'
      const storedData = localStorage.getItem(oldDataStoreKey)

      if (storedData) {
        const parsed = JSON.parse(storedData)
        if (parsed.state?.appointments) {
          console.log('🧹 Clearing old appointments from localStorage')
          delete parsed.state.appointments
          localStorage.setItem(oldDataStoreKey, JSON.stringify(parsed))
        }
      }
    } catch (err) {
      console.error('Error clearing old localStorage:', err)
    }

    // تحميل المواعيد من Supabase
    console.log('📥 Loading appointments from Supabase...')
    loadAppointments()

    // Format dates client-side only
    const dates = getAvailableDates()
    const formatted: {[key: string]: string} = {}

    dates.forEach(dateString => {
      const date = new Date(dateString)

      // التاريخ الميلادي فقط
      const gregorianOptions: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }
      const gregorianDate = date.toLocaleDateString('ar-US', gregorianOptions)

      formatted[dateString] = gregorianDate
    })

    setFormattedDates(formatted)
  }, [loadAppointments])

  // توليد التواريخ المتاحة (اليوم الحالي + 30 يوم قادم، عدا الجمعة)
  const getAvailableDates = () => {
    const dates = []
    const today = new Date()

    for (let i = 0; i <= 30; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)

      // تجاهل يوم الجمعة (5)
      if (date.getDay() === 5) continue

      dates.push(date.toISOString().split('T')[0])
    }

    return dates
  }

  // توليد جميع الأوقات مع حالة الحجز
  const getAllTimesForDate = (date: string) => {
    const allTimes = [
      { time: '16:00', display: '4:00' },
      { time: '16:45', display: '4:45' },
      { time: '17:30', display: '5:30' },
      { time: '18:15', display: '6:15' },
      { time: '19:00', display: '7:00' },
      { time: '20:00', display: '8:00' },
      { time: '21:00', display: '9:00' }
    ]

    // التحقق من كون التاريخ هو اليوم الحالي
    const today = new Date().toISOString().split('T')[0]
    const isToday = date === today

    // إذا كان اليوم الحالي، فلتر الأوقات المتبقية فقط
    let availableTimes = allTimes
    if (isToday) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      availableTimes = allTimes.filter(timeSlot => {
        const [hours, minutes] = timeSlot.time.split(':').map(Number)
        const slotTimeInMinutes = hours * 60 + minutes
        // إضافة 30 دقيقة كحد أدنى للحجز المسبق
        return slotTimeInMinutes > currentTimeInMinutes + 30
      })
    }

    // الحصول على الأوقات المحجوزة من Supabase
    console.log(`🔍 Total appointments in store: ${appointments.length}`)
    console.log(`🔍 Checking date: ${date}`)

    const bookedTimes = appointments
      .filter(appointment => {
        const matches = appointment.appointment_date === date && appointment.status !== 'cancelled'
        if (matches) {
          console.log(`  ✓ Found booked appointment:`, appointment.appointment_time, appointment.customer_name)
        }
        return matches
      })
      .map(appointment => appointment.appointment_time)

    console.log(`📅 Date: ${date}, Booked times:`, bookedTimes)

    return availableTimes.map(timeSlot => ({
      ...timeSlot,
      isBooked: bookedTimes.includes(timeSlot.time)
    }))
  }

  // Hydration-safe date display function
  const getDateDisplayText = (dateString: string) => {
    if (!isMounted) {
      return 'جاري تحميل التاريخ...'
    }
    return formattedDates[dateString] || 'تاريخ غير متاح'
  }

  // تنسيق الوقت للعرض
  const formatTimeForDisplay = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'م' : 'ص'
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    return `${displayHour}:${minutes} ${ampm}`
  }

  // إرسال طلب الحجز
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedDate || !selectedTime || !clientName || !clientPhone) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع الحقول المطلوبة' })
      return
    }

    // التحقق من أن الوقت غير محجوز
    const isTimeBooked = appointments.some(
      apt => apt.appointment_date === selectedDate &&
             apt.appointment_time === selectedTime &&
             apt.status !== 'cancelled'
    )

    if (isTimeBooked) {
      setMessage({ type: 'error', text: 'عذراً، هذا الوقت محجوز مسبقاً. يرجى اختيار وقت آخر.' })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      console.log('📅 Booking appointment for guest:', clientName)

      // استخدام Supabase Store الجديد
      const result = await createAppointment({
        customer_name: clientName,
        customer_phone: clientPhone,
        customer_email: clientEmail || undefined,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        service_type: serviceType,
        notes: notes || undefined
      })

      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'خطأ في حجز الموعد' })
        return
      }

      console.log('✅ Appointment booked successfully:', result.data?.id)

      // إعادة تحميل المواعيد لتحديث الأوقات المحجوزة
      await loadAppointments()

      setMessage({
        type: 'success',
        text: 'تم حجز موعدك بنجاح! سنرسل لك تذكيراً قبل الموعد بساعتين.'
      })

      // إعادة تعيين النموذج
      setSelectedDate('')
      setSelectedTime('')
      setClientName('')
      setClientPhone('')
      setClientEmail('')
      setServiceType('consultation')
      setNotes('')

    } catch (error) {
      console.error('❌ Error booking appointment:', error)
      setMessage({ type: 'error', text: 'حدث خطأ أثناء حجز الموعد. يرجى المحاولة مرة أخرى.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-4 lg:pt-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-12">
        {/* زر العودة للصفحة الرئيسية */}
        <div className="flex justify-start items-start mt-0 mb-2" dir="rtl">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300 group"
            style={{marginTop: 0}}
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5 group-hover:translate-x-1 transition-transform duration-300" />
            <span className="font-medium text-sm lg:text-base">العودة للصفحة الرئيسية</span>
          </Link>
        </div>

        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              حجز موعد
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            احجزي موعدك بسهولة عبر نظامنا الذكي. سنقوم بتوزيع المواعيد تلقائياً على مدار أيام العمل
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            {/* معلومات المواعيد */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="space-y-8"
            >
              <div className="bg-white/80 backdrop-blur-sm rounded-xl lg:rounded-2xl p-4 lg:p-8 border border-pink-100">
                <h3 className="text-lg lg:text-2xl font-bold text-gray-800 mb-4 lg:mb-6 flex items-center space-x-2 lg:space-x-3 space-x-reverse">
                  <Calendar className="w-5 h-5 lg:w-6 lg:h-6 text-pink-600" />
                  <span>معلومات المواعيد</span>
                </h3>

                <div className="space-y-4 lg:space-y-6">
                  <div className="flex items-start space-x-3 lg:space-x-4 space-x-reverse">
                    <div className="w-8 h-8 lg:w-12 lg:h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-lg lg:rounded-xl flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 lg:w-6 lg:h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 mb-1 lg:mb-2 text-sm lg:text-base">أوقات العمل</h4>
                      <p className="text-gray-600 text-xs lg:text-sm leading-relaxed">
                        نعمل 6 أيام في الأسبوع (عدا الجمعة)
                      </p>
                    </div>
                  </div>
                  

                  
                  <div className="flex items-start space-x-3 lg:space-x-4 space-x-reverse">
                    <div className="w-8 h-8 lg:w-12 lg:h-12 bg-gradient-to-br from-rose-400 to-purple-400 rounded-lg lg:rounded-xl flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 lg:w-6 lg:h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 mb-1 lg:mb-2 text-sm lg:text-base">التذكيرات</h4>
                      <p className="text-gray-600 text-xs lg:text-sm leading-relaxed">
                        سنرسل لك تذكيراً تلقائياً<br className="hidden lg:block" />
                        <span className="lg:hidden"> </span>قبل موعدك بساعتين عبر الرسائل النصية
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* معلومات زمن التفصيل */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl lg:rounded-2xl p-4 lg:p-8 border border-pink-100">
                <h3 className="text-lg lg:text-2xl font-bold text-gray-800 mb-4 lg:mb-6 flex items-center space-x-2 lg:space-x-3 space-x-reverse">
                  <Clock className="w-5 h-5 lg:w-6 lg:h-6 text-pink-600" />
                  <span>معلومات زمن التفصيل</span>
                </h3>

                <div className="space-y-4 lg:space-y-6">
                  <div className="flex items-start space-x-3 lg:space-x-4 space-x-reverse">
                    <div className="w-8 h-8 lg:w-12 lg:h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg lg:rounded-xl flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-4 h-4 lg:w-6 lg:h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 mb-1 lg:mb-2 text-sm lg:text-base">مدة التفصيل</h4>
                      <p className="text-gray-600 text-xs lg:text-sm leading-relaxed">
                        يستغرق تفصيل الفستان من <span className="font-semibold text-pink-600">7 إلى 14 يوم عمل</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 lg:space-x-4 space-x-reverse">
                    <div className="w-8 h-8 lg:w-12 lg:h-12 bg-gradient-to-br from-orange-400 to-red-400 rounded-lg lg:rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 lg:w-6 lg:h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 mb-1 lg:mb-2 text-sm lg:text-base">ملاحظة مهمة</h4>
                      <p className="text-gray-600 text-xs lg:text-sm leading-relaxed">
                        قد تختلف مدة التفصيل في المواسم بسبب الضغط، يرجى التواصل عبر الواتساب لمزيد من المعلومات
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* نموذج الحجز */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">احجزي موعدك الآن</h3>
                
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-6 p-4 rounded-lg flex items-center space-x-3 space-x-reverse ${
                      message.type === 'success' 
                        ? 'bg-green-50 text-green-800 border border-green-200' 
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {message.type === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span>{message.text}</span>
                  </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* اختيار التاريخ */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      اختاري التاريخ *
                    </label>
                    <select
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value)
                        setSelectedTime('') // إعادة تعيين الوقت عند تغيير التاريخ
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      required
                      disabled={!isMounted}
                    >
                      <option value="">
                        {isMounted ? 'اختاري التاريخ' : 'جاري تحميل التواريخ...'}
                      </option>
                      {getAvailableDates().map(date => (
                        <option key={date} value={date}>
                          {getDateDisplayText(date)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* اختيار الوقت */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      اختاري الوقت *
                    </label>
                    {selectedDate ? (
                      <div className="grid grid-cols-2 gap-3">
                        {getAllTimesForDate(selectedDate).map(timeSlot => (
                          <button
                            key={timeSlot.time}
                            type="button"
                            onClick={() => !timeSlot.isBooked && setSelectedTime(timeSlot.time)}
                            disabled={timeSlot.isBooked}
                            className={`p-3 rounded-lg border-2 transition-all duration-300 text-sm font-medium ${
                              selectedTime === timeSlot.time
                                ? 'border-pink-500 bg-pink-50 text-pink-700'
                                : timeSlot.isBooked
                                ? 'border-red-300 bg-red-100 text-red-600 cursor-not-allowed'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-pink-300 hover:bg-pink-50'
                            }`}
                          >
                            <div className="text-center">
                              <div className="font-bold">{timeSlot.display}</div>
                              {timeSlot.isBooked && (
                                <div className="text-xs mt-1">محجوز</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                        يرجى اختيار التاريخ أولاً
                      </div>
                    )}
                  </div>

                  {/* الاسم */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      الاسم الكامل *
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      placeholder="أدخلي اسمك الكامل"
                      required
                    />
                  </div>

                  {/* رقم الهاتف */}
                  <div>
                    <NumericInput
                      value={clientPhone}
                      onChange={setClientPhone}
                      type="phone"
                      label="رقم الهاتف *"
                      placeholder="أدخلي رقم هاتفك"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* البريد الإلكتروني */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      البريد الإلكتروني (اختياري)
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      placeholder="أدخلي بريدك الإلكتروني"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* نوع الخدمة */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      نوع الخدمة *
                    </label>
                    <select
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      required
                      disabled={isSubmitting}
                    >
                      <option value="consultation">استشارة تصميم</option>
                      <option value="fitting">قياس وتجربة</option>
                      <option value="delivery">استلام الطلب</option>
                    </select>
                  </div>

                  {/* ملاحظات */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ملاحظات إضافية (اختياري)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      placeholder="أي ملاحظات أو طلبات خاصة..."
                    />
                  </div>

                  {/* زر الإرسال */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-primary py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center space-x-2 space-x-reverse">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>جاري الحجز...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-2 space-x-reverse">
                        <Calendar className="w-5 h-5" />
                        <span>احجزي الموعد</span>
                      </div>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
