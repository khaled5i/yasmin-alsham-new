'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useTranslation } from '@/hooks/useTranslation'
import ProtectedRoute from '@/components/ProtectedRoute'
import ImageUpload from '@/components/ImageUpload'
import VoiceNotes from '@/components/VoiceNotes'
import NumericInput from '@/components/NumericInput'
import { 
  ArrowRight, 
  Upload, 
  Save, 
  User, 
  FileText, 
  Calendar,
  Ruler,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react'

function AddOrderContent() {
  const { user } = useAuthStore()
  const { addOrder, workers } = useDataStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()

  // حالة النموذج
  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    description: '',
    fabric: '',
    measurements: {
      // المقاسات الأساسية
      shoulder: '',
      shoulderCircumference: '',
      chest: '',
      waist: '',
      hips: '',

      // مقاسات التفصيل المتقدمة
      dartLength: '',
      bodiceLength: '',
      neckline: '',
      armpit: '',

      // مقاسات الأكمام
      sleeveLength: '',
      forearm: '',
      cuff: '',

      // مقاسات الطول
      frontLength: '',
      backLength: ''
    },
    price: '',
    assignedWorker: '',
    dueDate: '',
    notes: '',
    voiceNotes: [] as Array<{
      id: string
      data: string
      timestamp: number
      duration?: number
    }>,
    images: [] as string[]
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // معالجة تغيير الحقول
  const handleInputChange = (field: string, value: string | string[] | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // معالجة تغيير الملاحظات الصوتية
  const handleVoiceNotesChange = (voiceNotes: Array<{
    id: string
    data: string
    timestamp: number
    duration?: number
  }>) => {
    setFormData(prev => ({
      ...prev,
      voiceNotes
    }))
  }

  // معالجة تغيير المقاسات
  const handleMeasurementChange = (measurement: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      measurements: {
        ...prev.measurements,
        [measurement]: value
      }
    }))
  }



  // إرسال النموذج
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الحقول المطلوبة
    if (!formData.clientName || !formData.clientPhone || !formData.description || !formData.dueDate || !formData.price) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      // محاكاة تأخير الشبكة
      await new Promise(resolve => setTimeout(resolve, 1500))

      // إضافة الطلب إلى المتجر
      addOrder({
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        description: formData.description,
        fabric: formData.fabric,
        measurements: {
          // المقاسات الأساسية
          shoulder: formData.measurements.shoulder ? Number(formData.measurements.shoulder) : undefined,
          shoulderCircumference: formData.measurements.shoulderCircumference ? Number(formData.measurements.shoulderCircumference) : undefined,
          chest: formData.measurements.chest ? Number(formData.measurements.chest) : undefined,
          waist: formData.measurements.waist ? Number(formData.measurements.waist) : undefined,
          hips: formData.measurements.hips ? Number(formData.measurements.hips) : undefined,

          // مقاسات التفصيل المتقدمة
          dartLength: formData.measurements.dartLength ? Number(formData.measurements.dartLength) : undefined,
          bodiceLength: formData.measurements.bodiceLength ? Number(formData.measurements.bodiceLength) : undefined,
          neckline: formData.measurements.neckline ? Number(formData.measurements.neckline) : undefined,
          armpit: formData.measurements.armpit ? Number(formData.measurements.armpit) : undefined,

          // مقاسات الأكمام
          sleeveLength: formData.measurements.sleeveLength ? Number(formData.measurements.sleeveLength) : undefined,
          forearm: formData.measurements.forearm ? Number(formData.measurements.forearm) : undefined,
          cuff: formData.measurements.cuff ? Number(formData.measurements.cuff) : undefined,

          // مقاسات الطول
          frontLength: formData.measurements.frontLength ? Number(formData.measurements.frontLength) : undefined,
          backLength: formData.measurements.backLength ? Number(formData.measurements.backLength) : undefined
        },
        price: Number(formData.price),
        assignedWorker: formData.assignedWorker || undefined,
        dueDate: formData.dueDate,
        notes: formData.notes || undefined,
        voiceNotes: formData.voiceNotes.length > 0 ? formData.voiceNotes : undefined,
        images: formData.images.length > 0 ? formData.images : undefined,
        status: 'pending'
      })

      setMessage({
        type: 'success',
        text: t('order_added_success')
      })

      // إعادة تعيين النموذج والتوجيه بعد 2 ثانية
      setTimeout(() => {
        router.push('/dashboard/orders')
      }, 2000)

    } catch (error) {
      console.error('Error adding order:', error)
      setMessage({ type: 'error', text: t('order_add_error') })
    } finally {
      setIsSubmitting(false)
    }
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard')}</span>
          </Link>
        </motion.div>

        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              {t('add_new_order')}
            </span>
          </h1>
          <p className="text-lg text-gray-600">
            {t('add_new_order_description')}
          </p>
        </motion.div>

        {/* رسالة النجاح/الخطأ */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-8 p-4 rounded-lg flex items-center space-x-3 space-x-reverse max-w-4xl mx-auto ${
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

        {/* النموذج */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* المعلومات الأساسية */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
                <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                  <User className="w-5 h-5 text-pink-600" />
                  <span>{t('basic_information')}</span>
                </h3>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* اسم الزبونة */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('client_name_required')}
                    </label>
                    <input
                      type="text"
                      value={formData.clientName}
                      onChange={(e) => handleInputChange('clientName', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      placeholder={t('enter_client_name')}
                      required
                    />
                  </div>

                  {/* رقم الهاتف */}
                  <div>
                    <NumericInput
                      value={formData.clientPhone}
                      onChange={(value) => handleInputChange('clientPhone', value)}
                      type="phone"
                      label={t('phone_required')}
                      placeholder={t('enter_phone')}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* وصف الطلب */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('order_description_required')}
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      placeholder={t('order_description_placeholder')}
                      required
                    />
                  </div>

                  {/* نوع القماش */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('fabric_type')}
                    </label>
                    <input
                      type="text"
                      value={formData.fabric}
                      onChange={(e) => handleInputChange('fabric', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      placeholder={t('fabric_type_placeholder')}
                    />
                  </div>

                  {/* السعر */}
                  <div>
                    <NumericInput
                      value={formData.price}
                      onChange={(value) => handleInputChange('price', value)}
                      type="price"
                      label={t('price_sar')}
                      placeholder="0"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* العامل المسؤول */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('responsible_worker')}
                    </label>
                    <select
                      value={formData.assignedWorker}
                      onChange={(e) => handleInputChange('assignedWorker', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                    >
                      <option value="">{t('choose_worker')}</option>
                      {workers.map(worker => (
                        <option key={worker.id} value={worker.id}>
                          {worker.full_name} - {worker.specialty}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* موعد التسليم */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('delivery_date_required')}
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => handleInputChange('dueDate', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                      required
                    />
                  </div>
                </div>
            </div>

            {/* صور التصميم */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <ImageIcon className="w-5 h-5 text-pink-600" />
                <span>{t('design_images')}</span>
              </h3>

              <ImageUpload
                images={formData.images}
                onImagesChange={(images) => handleInputChange('images', images)}
                maxImages={10}
              />
            </div>

            {/* المقاسات */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <Ruler className="w-5 h-5 text-pink-600" />
                <span>{t('measurements_cm')}</span>
              </h3>

              <div className="space-y-8">
                {/* المقاسات الأساسية */}
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-4 border-b border-pink-200 pb-2">
                    {t('basic_measurements')}
                  </h4>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <NumericInput
                        value={formData.measurements.shoulder}
                        onChange={(value) => handleMeasurementChange('shoulder', value)}
                        type="measurement"
                        label={t('shoulder')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.shoulderCircumference}
                        onChange={(value) => handleMeasurementChange('shoulderCircumference', value)}
                        type="measurement"
                        label={t('shoulder_circumference')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.chest}
                        onChange={(value) => handleMeasurementChange('chest', value)}
                        type="measurement"
                        label={t('chest')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.waist}
                        onChange={(value) => handleMeasurementChange('waist', value)}
                        type="measurement"
                        label={t('waist')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.hips}
                        onChange={(value) => handleMeasurementChange('hips', value)}
                        type="measurement"
                        label={t('hips')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                {/* مقاسات التفصيل المتقدمة */}
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-4 border-b border-pink-200 pb-2">
                    {t('advanced_measurements')}
                  </h4>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <NumericInput
                        value={formData.measurements.dartLength}
                        onChange={(value) => handleMeasurementChange('dartLength', value)}
                        type="measurement"
                        label={t('dart_length')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.bodiceLength}
                        onChange={(value) => handleMeasurementChange('bodiceLength', value)}
                        type="measurement"
                        label={t('bodice_length')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.neckline}
                        onChange={(value) => handleMeasurementChange('neckline', value)}
                        type="measurement"
                        label={t('neckline')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.armpit}
                        onChange={(value) => handleMeasurementChange('armpit', value)}
                        type="measurement"
                        label={t('armpit')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                {/* مقاسات الأكمام */}
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-4 border-b border-pink-200 pb-2">
                    {t('sleeve_measurements')}
                  </h4>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <NumericInput
                        value={formData.measurements.sleeveLength}
                        onChange={(value) => handleMeasurementChange('sleeveLength', value)}
                        type="measurement"
                        label={t('sleeve_length')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.forearm}
                        onChange={(value) => handleMeasurementChange('forearm', value)}
                        type="measurement"
                        label={t('forearm')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.cuff}
                        onChange={(value) => handleMeasurementChange('cuff', value)}
                        type="measurement"
                        label={t('cuff')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                {/* مقاسات الطول */}
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-4 border-b border-pink-200 pb-2">
                    {t('length_measurements')}
                  </h4>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <NumericInput
                        value={formData.measurements.frontLength}
                        onChange={(value) => handleMeasurementChange('frontLength', value)}
                        type="measurement"
                        label={t('front_length')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <NumericInput
                        value={formData.measurements.backLength}
                        onChange={(value) => handleMeasurementChange('backLength', value)}
                        type="measurement"
                        label={t('back_length')}
                        placeholder={t('cm_placeholder')}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* الملاحظات */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <MessageSquare className="w-5 h-5 text-pink-600" />
                <span>{t('additional_notes')}</span>
              </h3>

              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                placeholder={t('additional_notes_placeholder')}
              />

              {/* الملاحظات الصوتية */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {t('voice_notes_optional')}
                </label>
                <VoiceNotes
                  voiceNotes={formData.voiceNotes || []}
                  onVoiceNotesChange={handleVoiceNotesChange}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary py-4 px-8 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2 space-x-reverse">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('saving')}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2 space-x-reverse">
                    <Save className="w-5 h-5" />
                    <span>{t('save_order')}</span>
                  </div>
                )}
              </button>

              <Link
                href="/dashboard"
                className="btn-secondary py-4 px-8 text-lg inline-flex items-center justify-center"
              >
                {t('cancel')}
              </Link>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  )
}

export default function AddOrderPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AddOrderContent />
    </ProtectedRoute>
  )
}
