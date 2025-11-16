'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  X,
  Save,
  User,
  Phone,
  Package,
  Ruler,
  DollarSign,
  MessageSquare,
  UserCheck,
  Calendar,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react'
import ImageUpload from './ImageUpload'
import VoiceNotes from './VoiceNotes'
import NumericInput from './NumericInput'
import RemainingPaymentWarningModal from './RemainingPaymentWarningModal'
import { Order } from '@/lib/services/order-service'
import { WorkerWithUser } from '@/lib/services/worker-service'
import { useTranslation } from '@/hooks/useTranslation'

interface EditOrderModalProps {
  order: Order | null
  workers: WorkerWithUser[]
  isOpen: boolean
  onClose: () => void
  onSave: (orderId: string, updates: any) => void
}

export default function EditOrderModal({ order, workers, isOpen, onClose, onSave }: EditOrderModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<Partial<Order>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [showPaymentWarning, setShowPaymentWarning] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)

  // تسجيل البيانات للتحقق من قائمة العمال
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 EditOrderModal opened')
      console.log('📋 Workers list:', workers)
      console.log('📊 Workers count:', workers?.length || 0)
      console.log('✅ Active workers:', workers?.filter(w => w.is_active).length || 0)
    }
  }, [isOpen, workers])

  useEffect(() => {
    if (order) {
      setFormData({
        clientName: order.client_name,
        clientPhone: order.client_phone,
        description: order.description,
        fabric: order.fabric || '',
        price: order.price,
        paidAmount: order.paid_amount || 0,
        status: order.status,
        assignedWorker: order.worker_id || '',
        dueDate: order.due_date,
        notes: order.notes || '',
        voiceNotes: order.voice_notes?.map((vn, idx) => ({
          id: `vn-${idx}`,
          data: vn,
          timestamp: Date.now()
        })) || [],
        images: order.images || [],
        measurements: { ...order.measurements }
      })
    }
  }, [order])

  // حساب المبلغ المتبقي
  const remainingAmount = useMemo(() => {
    const price = Number(formData.price) || 0
    const paidAmount = Number(formData.paidAmount) || 0
    return Math.max(0, price - paidAmount)
  }, [formData.price, formData.paidAmount])

  const handleInputChange = (field: string, value: any) => {
    // التحقق من تغيير الحالة إلى "delivered"
    if (field === 'status' && value === 'delivered') {
      const remaining = remainingAmount || 0
      if (remaining > 0) {
        // عرض نافذة التحذير
        setPendingStatus('delivered')
        setShowPaymentWarning(true)
        return
      }
    }

    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleMeasurementChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      measurements: {
        ...prev.measurements,
        [field]: value
      }
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!order) return

    // التحقق من الحقول المطلوبة
    if (!formData.clientName || !formData.clientPhone || !formData.description || !formData.price || !formData.dueDate) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      // تحويل المقاسات إلى أرقام
      const updatedMeasurements = Object.keys(formData.measurements || {}).reduce((acc, key) => {
        const value = (formData.measurements as any)?.[key]
        acc[key] = value && value !== '' ? Number(value) : undefined
        return acc
      }, {} as any)

      // تحويل السعر والدفعة المستلمة إلى أرقام
      const price = Number(formData.price)
      const paidAmount = Number(formData.paidAmount) || 0

      // تنظيف البيانات قبل الإرسال
      const cleanedData = { ...formData }

      // تحويل string فارغ إلى undefined لحقول UUID
      if (cleanedData.assignedWorker === '') {
        cleanedData.assignedWorker = undefined
      }

      // ملاحظة: payment_status و remaining_amount سيتم حسابهما تلقائياً بواسطة trigger في قاعدة البيانات
      onSave(order.id, {
        ...cleanedData,
        price: price,
        paid_amount: paidAmount,
        measurements: updatedMeasurements,
        updatedAt: new Date().toISOString()
      })
      
      setMessage({ type: 'success', text: t('order_updated_success') })
      
      setTimeout(() => {
        onClose()
        setMessage(null)
      }, 1500)
      
    } catch (error) {
      setMessage({ type: 'error', text: t('order_update_error') })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!order) return null

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* خلفية مظلمة */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* النافذة المنبثقة */}
            <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* رأس النافذة */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">{t('edit_order')}</h2>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* رسالة النجاح/الخطأ */}
            {message && (
              <div className={`mx-6 mt-4 p-4 rounded-lg flex items-center space-x-3 space-x-reverse ${
                message.type === 'success' 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* محتوى النموذج */}
            <form onSubmit={handleSubmit} className="p-6 space-y-8">
              {/* معلومات الزبون */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <User className="w-5 h-5 text-pink-600" />
                  <span>{t('customer_information')}</span>
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('client_name_required')}
                    </label>
                    <input
                      type="text"
                      value={formData.clientName || ''}
                      onChange={(e) => handleInputChange('clientName', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>
                  
                  <div>
                    <NumericInput
                      value={formData.clientPhone || ''}
                      onChange={(value) => handleInputChange('clientPhone', value)}
                      type="phone"
                      label={t('phone_required')}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              {/* تفاصيل الطلب */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <Package className="w-5 h-5 text-pink-600" />
                  <span>{t('order_details')}</span>
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('order_description_required')}
                    </label>
                    <input
                      type="text"
                      value={formData.description || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('fabric_type_optional')}
                    </label>
                    <input
                      type="text"
                      value={formData.fabric || ''}
                      onChange={(e) => handleInputChange('fabric', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <NumericInput
                      value={formData.price?.toString() || ''}
                      onChange={(value) => handleInputChange('price', value ? Number(value) : '')}
                      type="price"
                      label={t('price_sar_required')}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* الدفعة المستلمة */}
                  <div>
                    <NumericInput
                      value={formData.paidAmount?.toString() || ''}
                      onChange={(value) => {
                        const price = Number(formData.price) || 0
                        const paid = Number(value) || 0
                        // التحقق من أن الدفعة المستلمة لا تتجاوز السعر
                        if (paid > price) {
                          toast.error('الدفعة المستلمة لا يمكن أن تتجاوز السعر الكلي', {
                            icon: '⚠️',
                          })
                          return
                        }
                        handleInputChange('paidAmount', Number(value) || 0)
                      }}
                      type="price"
                      label={t('paid_amount')}
                      disabled={isSubmitting || !formData.price}
                    />
                  </div>

                  {/* الدفعة المتبقية (للعرض فقط) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('remaining_amount')}
                    </label>
                    <div className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                      {remainingAmount.toFixed(2)} {t('sar')}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('delivery_date_required')}
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate || ''}
                      onChange={(e) => handleInputChange('dueDate', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* الحالة والعامل */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <UserCheck className="w-5 h-5 text-pink-600" />
                  <span>{t('status_and_worker')}</span>
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('order_status')}
                    </label>
                    <select
                      value={formData.status || ''}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    >
                      <option value="pending">{t('status_pending')}</option>
                      <option value="in_progress">{t('status_in_progress')}</option>
                      <option value="completed">{t('status_completed')}</option>
                      <option value="delivered">{t('status_delivered')}</option>
                      <option value="cancelled">{t('status_cancelled')}</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('responsible_worker')}
                    </label>
                    <select
                      value={formData.assignedWorker || ''}
                      onChange={(e) => handleInputChange('assignedWorker', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    >
                      <option value="">{t('choose_worker')}</option>
                      {workers.filter(w => w.is_available && w.user?.is_active).map(worker => (
                        <option key={worker.id} value={worker.id}>
                          {worker.user?.full_name || worker.specialty} - {worker.specialty}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* صور التصميم */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <ImageIcon className="w-5 h-5 text-pink-600" />
                  <span>{t('design_images')}</span>
                </h3>

                <ImageUpload
                  images={formData.images || []}
                  onImagesChange={(images) => handleInputChange('images', images)}
                  maxImages={5}
                />
              </div>

              {/* المقاسات */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <Ruler className="w-5 h-5 text-pink-600" />
                  <span>{t('measurements_cm')}</span>
                </h3>
                
                <div className="space-y-8">
                  {/* المقاسات الأساسية */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-800 mb-4 border-b border-pink-200 pb-2">
                      {t('basic_measurements')}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <NumericInput
                          value={formData.measurements?.shoulder?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('shoulder', value)}
                          type="measurement"
                          label={t('shoulder')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.shoulderCircumference?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('shoulderCircumference', value)}
                          type="measurement"
                          label={t('shoulder_circumference')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.chest?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('chest', value)}
                          type="measurement"
                          label={t('chest')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.waist?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('waist', value)}
                          type="measurement"
                          label={t('waist')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.hips?.toString() || ''}
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
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <NumericInput
                          value={formData.measurements?.dartLength?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('dartLength', value)}
                          type="measurement"
                          label={t('dart_length')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.bodiceLength?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('bodiceLength', value)}
                          type="measurement"
                          label={t('bodice_length')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.neckline?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('neckline', value)}
                          type="measurement"
                          label={t('neckline')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.armpit?.toString() || ''}
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
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <NumericInput
                          value={formData.measurements?.sleeveLength?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('sleeveLength', value)}
                          type="measurement"
                          label={t('sleeve_length')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.forearm?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('forearm', value)}
                          type="measurement"
                          label={t('forearm')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.cuff?.toString() || ''}
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
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <NumericInput
                          value={formData.measurements?.frontLength?.toString() || ''}
                          onChange={(value) => handleMeasurementChange('frontLength', value)}
                          type="measurement"
                          label={t('front_length')}
                          placeholder={t('cm_placeholder')}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div>
                        <NumericInput
                          value={formData.measurements?.backLength?.toString() || ''}
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
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <MessageSquare className="w-5 h-5 text-pink-600" />
                  <span>{t('notes_section')}</span>
                </h3>
                
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder={t('additional_notes_placeholder')}
                />

                {/* الملاحظات الصوتية */}
                <div className="mt-6">
                  <VoiceNotes
                    voiceNotes={formData.voiceNotes || []}
                    onVoiceNotesChange={(voiceNotes) => handleInputChange('voiceNotes', voiceNotes)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </form>

            {/* تذييل النافذة */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
              <div className="flex gap-4 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary px-6 py-2"
                  disabled={isSubmitting}
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 space-x-reverse"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{t('saving')}</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{t('save_changes')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* نافذة التحذير عند وجود دفعة متبقية */}
      <RemainingPaymentWarningModal
        isOpen={showPaymentWarning}
        remainingAmount={remainingAmount}
        onMarkAsPaid={() => {
          // تحديث المبلغ المدفوع ليساوي السعر
          const price = Number(formData.price) || 0
          setFormData(prev => ({
            ...prev,
            paidAmount: price,
            status: pendingStatus || prev.status
          }))
          setShowPaymentWarning(false)
          setPendingStatus(null)
        }}
        onIgnore={() => {
          // تجاهل وتغيير الحالة فقط
          setFormData(prev => ({
            ...prev,
            status: pendingStatus || prev.status
          }))
          setShowPaymentWarning(false)
          setPendingStatus(null)
        }}
        onCancel={() => {
          // إلغاء العملية
          setShowPaymentWarning(false)
          setPendingStatus(null)
        }}
      />
    </>
  )
}
