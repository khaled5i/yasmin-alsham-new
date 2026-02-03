'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useAppointmentStore } from '@/store/appointmentStore'
import { useTranslation } from '@/hooks/useTranslation'
import type { Appointment } from '@/lib/services/appointment-service'
import ConfirmationModal from '@/components/ConfirmationModal'
import {
  ArrowRight,
  Calendar,
  Search,
  Filter,
  Clock,
  Phone,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Edit2,
  Save,
  X,
  Loader2,
  Trash2
} from 'lucide-react'

export default function AppointmentsPage() {
  const { user } = useAuthStore()
  const { appointments, loadAppointments, updateAppointment, deleteAppointment, isLoading } = useAppointmentStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()

  // التحقق من الصلاحيات وتحميل المواعيد
  useEffect(() => {
    if (!user) {
      router.push('/login')
    } else if (user.role !== 'admin') {
      router.push('/dashboard')
    } else {
      // تحميل المواعيد من Supabase
      loadAppointments()
    }
  }, [user, router, loadAppointments])

  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Appointment>>({})
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // حالة Modal التأكيد
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    type: 'success' as 'success' | 'error',
    message: ''
  })



  // وظائف إدارة المواعيد
  const startEdit = (appointment: Appointment) => {
    setEditingId(appointment.id)
    setEditData({
      customer_name: appointment.customer_name,
      customer_phone: appointment.customer_phone,
      customer_email: appointment.customer_email || '',
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      service_type: appointment.service_type,
      notes: appointment.notes || ''
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const handleEditChange = (field: string, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!editingId) return

    const result = await updateAppointment(editingId, editData)
    if (result.success) {
      setEditingId(null)
      setEditData({})
      setConfirmationModal({
        isOpen: true,
        type: 'success',
        message: 'تم تحديث الموعد بنجاح!'
      })
    } else {
      setConfirmationModal({
        isOpen: true,
        type: 'error',
        message: result.error || 'فشل تحديث الموعد. يرجى المحاولة مرة أخرى.'
      })
    }
  }



  const handleDelete = async (appointmentId: string) => {
    const result = await deleteAppointment(appointmentId)
    if (result.success) {
      setDeleteConfirmId(null)
      setConfirmationModal({
        isOpen: true,
        type: 'success',
        message: 'تم حذف الموعد بنجاح!'
      })
    } else {
      setDeleteConfirmId(null)
      setConfirmationModal({
        isOpen: true,
        type: 'error',
        message: result.error || 'فشل حذف الموعد. يرجى المحاولة مرة أخرى.'
      })
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory', // استخدام التقويم الميلادي
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? t('pm') : t('am')
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    return `${displayHour}:${minutes} ${ampm}`
  }

  const isToday = (dateString: string) => {
    const today = new Date().toISOString().split('T')[0]
    return dateString === today
  }

  const isTomorrow = (dateString: string) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return dateString === tomorrow.toISOString().split('T')[0]
  }

  const filteredAppointments = appointments.filter(appointment => {
    // فلترة المواعيد المنتهية (إخفاء المواعيد التي مضى تاريخها)
    const appointmentDate = new Date(appointment.appointment_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0) // تعيين الوقت إلى منتصف الليل للمقارنة الصحيحة

    // إخفاء المواعيد التي تاريخها قبل اليوم الحالي
    const isNotExpired = appointmentDate >= today

    const matchesSearch = appointment.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.customer_phone.includes(searchTerm) ||
      appointment.id.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    if (dateFilter === 'today') {
      matchesDate = isToday(appointment.appointment_date)
    } else if (dateFilter === 'tomorrow') {
      matchesDate = isTomorrow(appointment.appointment_date)
    } else if (dateFilter === 'week') {
      const weekFromNow = new Date()
      weekFromNow.setDate(today.getDate() + 7)
      matchesDate = appointmentDate >= today && appointmentDate <= weekFromNow
    }

    return matchesSearch && matchesDate && isNotExpired
  })

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-16 sm:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-3"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard')}</span>
          </Link>
        </motion.div>

        {/* العنوان والأزرار */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                {t('appointments_management')}
              </span>
            </h1>
            <p className="text-lg text-gray-600">
              {t('view_manage_appointments')}
            </p>
          </div>

          {/* [HIDDEN TEMPORARILY] حجز موعد - مخفي مؤقتاً
          <Link
            href="/book-appointment"
            className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse px-6 py-3 group"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
            <span>{t('book_new_appointment')}</span>
          </Link>
          */}
        </motion.div>

        {/* البحث والفلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 mb-8"
        >
          <div className="grid md:grid-cols-2 gap-4">
            {/* البحث */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                placeholder={t('search_appointments_placeholder')}
              />
            </div>

            {/* فلتر التاريخ */}
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
              >
                <option value="all">{t('all_dates')}</option>
                <option value="today">{t('today')}</option>
                <option value="tomorrow">{t('tomorrow')}</option>
                <option value="week">{t('this_week')}</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* نموذج تعديل الموعد - Modal Overlay */}
        <AnimatePresence>
          {editingId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={cancelEdit}
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ duration: 0.3, type: 'spring', damping: 25 }}
                className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              >
                {/* Close Button */}
                <button
                  onClick={cancelEdit}
                  disabled={isLoading}
                  className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="إغلاق"
                >
                  <X className="w-6 h-6 text-gray-600" />
                </button>

                <div className="p-6 sm:p-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-purple-500 rounded-xl flex items-center justify-center">
                      <Edit2 className="w-6 h-6 text-white" />
                    </div>
                    <span>{t('edit_appointment') || 'تعديل الموعد'}</span>
                  </h2>
                  <div className="space-y-5">
                    {/* اسم العميل ورقم الهاتف */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-medium mb-2 text-gray-700">
                          {t('customer_name') || 'اسم العميل'} *
                        </label>
                        <input
                          type="text"
                          value={editData.customer_name || ''}
                          onChange={(e) => handleEditChange('customer_name', e.target.value)}
                          className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                          placeholder={t('customer_name_placeholder')}
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-2 text-gray-700">
                          {t('phone') || 'رقم الهاتف'} *
                        </label>
                        <input
                          type="tel"
                          value={editData.customer_phone || ''}
                          onChange={(e) => handleEditChange('customer_phone', e.target.value)}
                          className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                          placeholder={t('phone_placeholder')}
                        />
                      </div>
                    </div>

                    {/* البريد الإلكتروني */}
                    <div>
                      <label className="block font-medium mb-2 text-gray-700">
                        {t('email') || 'البريد الإلكتروني'}
                      </label>
                      <input
                        type="email"
                        value={editData.customer_email || ''}
                        onChange={(e) => handleEditChange('customer_email', e.target.value)}
                        className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                        placeholder={t('email_placeholder')}
                      />
                    </div>

                    {/* التاريخ والوقت */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-medium mb-2 text-gray-700">
                          {t('date') || 'التاريخ'} *
                        </label>
                        <input
                          type="date"
                          value={editData.appointment_date || ''}
                          onChange={(e) => handleEditChange('appointment_date', e.target.value)}
                          className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-2 text-gray-700">
                          {t('time') || 'الوقت'} *
                        </label>
                        <input
                          type="time"
                          value={editData.appointment_time || ''}
                          onChange={(e) => handleEditChange('appointment_time', e.target.value)}
                          className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* نوع الخدمة */}
                    <div>
                      <label className="block font-medium mb-2 text-gray-700">
                        {t('service_type') || 'نوع الخدمة'} *
                      </label>
                      <input
                        type="text"
                        value={editData.service_type || ''}
                        onChange={(e) => handleEditChange('service_type', e.target.value)}
                        className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                        placeholder={t('service_type_placeholder')}
                      />
                    </div>

                    {/* الملاحظات */}
                    <div>
                      <label className="block font-medium mb-2 text-gray-700">
                        {t('notes') || 'ملاحظات'}
                      </label>
                      <textarea
                        value={editData.notes || ''}
                        onChange={(e) => handleEditChange('notes', e.target.value)}
                        className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                        placeholder={t('notes_placeholder')}
                        rows={3}
                      />
                    </div>

                    {/* أزرار الحفظ والإلغاء */}
                    <div className="flex gap-3 pt-6 border-t border-gray-200">
                      <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-6 py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{t('saving') || 'جاري الحفظ...'}</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-5 h-5" />
                            <span>{t('save_changes') || 'حفظ التعديلات'}</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isLoading}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-5 h-5" />
                        <span>{t('cancel') || 'إلغاء'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* قائمة المواعيد */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="space-y-6"
        >
          {filteredAppointments.length === 0 ? (
            <div className="text-center py-12 bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100">
              <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-600 mb-2">{t('no_appointments')}</h3>
              <p className="text-gray-500">{t('no_appointments_found')}</p>
            </div>
          ) : (
            filteredAppointments.map((appointment, index) => (
              <motion.div
                key={appointment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`bg-white/80 backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 hover:shadow-lg ${isToday(appointment.appointment_date)
                  ? 'border-pink-300 bg-pink-50/50'
                  : 'border-pink-100'
                  }`}
              >
                <div className="grid lg:grid-cols-4 gap-6">
                  {/* معلومات العميل */}
                  <div className="lg:col-span-2">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">
                          {appointment.customer_name}
                        </h3>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center space-x-2 space-x-reverse">
                            <Phone className="w-4 h-4" />
                            <span>{appointment.customer_phone}</span>
                          </div>
                        </div>
                      </div>

                      {isToday(appointment.appointment_date) && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                          {t('today')}
                        </span>
                      )}
                    </div>

                    {appointment.notes && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <p className="text-sm text-gray-700">{appointment.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* تفاصيل الموعد */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">{t('date_time')}</p>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 space-x-reverse text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(appointment.appointment_date)}</span>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(appointment.appointment_time)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 space-x-reverse">
                      <div className="text-xs text-gray-500">
                        {t('created_on')} {new Date(appointment.created_at).toLocaleDateString('ar-SA', { calendar: 'gregory' })}
                      </div>
                    </div>
                  </div>

                  {/* الإجراءات */}
                  <div className="flex flex-col gap-2">
                    {/* زر التعديل */}
                    <button
                      onClick={() => startEdit(appointment)}
                      disabled={editingId !== null}
                      className="btn-secondary flex items-center justify-center gap-2 py-2 px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>{t('edit') || 'تعديل'}</span>
                    </button>



                    {/* زر الحذف */}
                    <button
                      onClick={() => setDeleteConfirmId(appointment.id)}
                      disabled={editingId !== null}
                      className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2 px-4 text-sm rounded-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{t('delete') || 'حذف'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* إحصائيات سريعة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-12 grid grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-pink-600 mb-1">
              {appointments.length}
            </div>
            <div className="text-sm text-gray-600">{t('total_appointments') || 'إجمالي المواعيد'}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-orange-600 mb-1">
              {appointments.filter(a => isToday(a.appointment_date)).length}
            </div>
            <div className="text-sm text-gray-600">{t('today')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-purple-600 mb-1">
              {appointments.filter(a => isTomorrow(a.appointment_date)).length}
            </div>
            <div className="text-sm text-gray-600">{t('tomorrow')}</div>
          </div>
        </motion.div>
      </div>

      {/* مودال تأكيد الحذف */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">{t('confirm_delete') || 'تأكيد الحذف'}</h3>
            </div>
            <p className="text-gray-600 mb-6">
              {t('confirm_delete_appointment_message') || 'هل أنت متأكد من حذف هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={isLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('deleting') || 'جاري الحذف...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    <span>{t('yes_delete') || 'نعم، احذف'}</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={isLoading}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('cancel') || 'إلغاء'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
        type={confirmationModal.type}
        message={confirmationModal.message}
        autoClose={true}
        autoCloseDelay={3000}
      />
    </div>
  )
}
