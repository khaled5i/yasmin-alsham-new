'use client'

import { useState, useEffect } from 'react'
import { Search, Calendar, Clock, Phone, User, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppointmentStore } from '@/store/appointmentStore'
import { Appointment } from '@/lib/services/appointment-service'

export default function GuestAppointmentLookup() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const { getAppointmentsByPhone } = useAppointmentStore()

  // مسح localStorage القديم عند التحميل
  useEffect(() => {
    try {
      // مسح بيانات المواعيد القديمة من localStorage
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
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!phoneNumber.trim()) {
      setError('يرجى إدخال رقم الهاتف')
      return
    }

    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      console.log('🔍 Searching appointments for phone:', phoneNumber)

      const result = await getAppointmentsByPhone(phoneNumber.trim())

      if (result.error) {
        setError(result.error)
        setAppointments([])
      } else {
        setAppointments(result.data)
        console.log(`✅ Found ${result.data.length} appointments`)
      }
    } catch (err) {
      console.error('❌ Error searching appointments:', err)
      setError('خطأ في البحث عن المواعيد')
      setAppointments([])
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ar-SA-u-nu-latn', {
      calendar: 'gregory', // استخدام التقويم الميلادي
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'مساءً' : 'صباحاً'
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    return `${displayHour}:${minutes} ${ampm}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'confirmed': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-gray-100 text-gray-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return 'مجدول'
      case 'confirmed': return 'مؤكد'
      case 'completed': return 'مكتمل'
      case 'cancelled': return 'ملغي'
      default: return status
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            البحث عن مواعيدك
          </h2>
          <p className="text-gray-600">
            أدخلي رقم هاتفك للاطلاع على مواعيدك المحجوزة
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="أدخلي رقم هاتفك"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg"
          >
            <p className="text-red-700 text-center">{error}</p>
          </motion.div>
        )}

        <AnimatePresence>
          {hasSearched && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {appointments.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    لا توجد مواعيد
                  </h3>
                  <p className="text-gray-600">
                    لم نجد أي مواعيد مرتبطة بهذا الرقم
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    مواعيدك ({appointments.length})
                  </h3>
                  {appointments.map((appointment) => (
                    <motion.div
                      key={appointment.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow duration-300"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3 space-x-reverse">
                          <User className="w-5 h-5 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {appointment.customer_name}
                          </span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(appointment.status)}`}>
                          {getStatusText(appointment.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center space-x-3 space-x-reverse">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">
                            {formatDate(appointment.appointment_date)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 space-x-reverse">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">
                            {formatTime(appointment.appointment_time)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 space-x-reverse mb-4">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-700">
                          {appointment.customer_phone}
                        </span>
                      </div>

                      {appointment.notes && (
                        <div className="flex items-start space-x-3 space-x-reverse">
                          <FileText className="w-4 h-4 text-gray-400 mt-1" />
                          <div className="flex-1">
                            <p className="text-gray-700 text-sm">
                              {appointment.notes}
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
