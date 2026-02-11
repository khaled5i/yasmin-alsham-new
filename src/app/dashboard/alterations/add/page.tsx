'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import { alterationService } from '@/lib/services/alteration-service'
import { orderService, Order } from '@/lib/services/order-service'
import ImageUpload from '@/components/ImageUpload'
import UnifiedNotesInput from '@/components/UnifiedNotesInput'
import InteractiveImageAnnotation, { ImageAnnotation, DrawingPath, SavedDesignComment, InteractiveImageAnnotationRef } from '@/components/InteractiveImageAnnotation'
import NumericInput from '@/components/NumericInput'
import DatePickerWithStats from '@/components/DatePickerWithStats'
import {
  ArrowRight,
  Upload,
  Save,
  User,
  FileText,
  Calendar,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Loader2,
  MessageCircle
} from 'lucide-react'
import { openAlterationWhatsApp } from '@/utils/whatsapp'

const getDesignViewLabel = (view: 'front' | 'back') => (view === 'front' ? 'أمام' : 'خلف')

const getDesignViewFromTitle = (title?: string | null): 'front' | 'back' | null => {
  if (!title) return null
  const trimmed = title.trim()
  if (trimmed.startsWith('أمام')) return 'front'
  if (trimmed.startsWith('خلف')) return 'back'
  return null
}

const getNextDesignViewTitle = (view: 'front' | 'back', comments: SavedDesignComment[]) => {
  const existingCount = comments.reduce((count, comment) => {
    const commentView = comment.view ?? getDesignViewFromTitle(comment.title)
    return commentView === view ? count + 1 : count
  }, 0)
  const label = getDesignViewLabel(view)
  return existingCount === 0 ? label : `${label} ${existingCount + 1}`
}

function AddAlterationContent() {
  const { user } = useAuthStore()
  const { t, isArabic } = useTranslation()
  const annotationRef = useRef<InteractiveImageAnnotationRef>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const editId = searchParams.get('editId')

  // تحميل بيانات الطلب الأصلي إذا كان موجوداً
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null)
  const [isLoadingOrder, setIsLoadingOrder] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)

  useEffect(() => {
    if (orderId) {
      loadOriginalOrder(orderId)
    }
  }, [orderId])

  // تحميل بيانات طلب التعديل للتعديل
  useEffect(() => {
    if (editId) {
      loadAlterationForEdit(editId)
    }
  }, [editId])

  const loadAlterationForEdit = async (id: string) => {
    setIsLoadingOrder(true)
    setIsEditMode(true)
    try {
      const { data: alteration, error } = await alterationService.getById(id)

      if (error || !alteration) {
        toast.error(error || (isArabic ? 'فشل تحميل بيانات طلب التعديل' : 'Failed to load alteration data'))
        router.push('/dashboard/alterations')
        return
      }

      // تعبئة البيانات من طلب التعديل
      setFormData({
        alterationNumber: alteration.alteration_number,
        clientName: alteration.client_name,
        clientPhone: alteration.client_phone,
        price: alteration.price.toString(),
        paidAmount: alteration.paid_amount.toString(),
        paymentMethod: alteration.payment_method || 'cash',
        orderReceivedDate: alteration.order_received_date || new Date().toISOString().split('T')[0],
        alterationDueDate: alteration.alteration_due_date,
        notes: alteration.notes || '',
        voiceNotes: (alteration as any).voice_transcriptions || [],
        images: alteration.images || [],
        imageAnnotations: (alteration as any).image_annotations || [],
        imageDrawings: (alteration as any).image_drawings || [],
        customDesignImage: null,
        savedDesignComments: (alteration as any).saved_design_comments || []
      })

      toast.success(isArabic ? 'تم تحميل بيانات طلب التعديل' : 'Alteration data loaded')
    } catch (error: any) {
      console.error('Error loading alteration:', error)
      toast.error(isArabic ? 'فشل تحميل بيانات طلب التعديل' : 'Failed to load alteration data')
      router.push('/dashboard/alterations')
    } finally {
      setIsLoadingOrder(false)
    }
  }

  const loadOriginalOrder = async (id: string) => {
    setIsLoadingOrder(true)
    try {
      const { data, error } = await orderService.getById(id)
      if (error) {
        toast.error(error)
        return
      }
      if (data) {
        setOriginalOrder(data)
        // تعبئة البيانات تلقائياً
        prefillFormData(data)
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsLoadingOrder(false)
    }
  }

  // حالة النموذج
  const [formData, setFormData] = useState({
    alterationNumber: '',
    clientName: '',
    clientPhone: '',
    price: '',
    paidAmount: '',
    paymentMethod: 'cash' as 'cash' | 'card' | 'bank_transfer' | 'check',
    orderReceivedDate: new Date().toISOString().split('T')[0],
    alterationDueDate: '',
    notes: '',
    voiceNotes: [] as Array<{
      id: string
      data: string
      timestamp: number
      duration?: number
      transcription?: string
      translatedText?: string
      translationLanguage?: string
    }>,
    images: [] as string[],
    imageAnnotations: [] as ImageAnnotation[],
    imageDrawings: [] as DrawingPath[],
    customDesignImage: null as File | null,
    savedDesignComments: [] as SavedDesignComment[]
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  // تعبئة البيانات من الطلب الأصلي
  const prefillFormData = (order: Order) => {
    setFormData(prev => ({
      ...prev,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      images: order.images || [],
      // استخراج التعليقات المحفوظة من measurements
      savedDesignComments: (order.measurements as any)?.saved_design_comments || [],
      imageAnnotations: (order.measurements as any)?.image_annotations || [],
      imageDrawings: (order.measurements as any)?.image_drawings || []
    }))
  }

  // حساب المبلغ المتبقي
  const remainingAmount = useMemo(() => {
    const price = Number(formData.price) || 0
    const paidAmount = Number(formData.paidAmount) || 0
    return Math.max(0, price - paidAmount)
  }, [formData.price, formData.paidAmount])

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
    transcription?: string
    translatedText?: string
    translationLanguage?: string
  }>) => {
    setFormData(prev => ({
      ...prev,
      voiceNotes
    }))
  }

  // معالجة تغيير التعليقات على الصورة
  const handleImageAnnotationsChange = (annotations: ImageAnnotation[]) => {
    setFormData(prev => ({
      ...prev,
      imageAnnotations: annotations
    }))
  }

  // معالجة تغيير الرسومات على الصورة
  const handleImageDrawingsChange = (drawings: DrawingPath[]) => {
    setFormData(prev => ({
      ...prev,
      imageDrawings: drawings
    }))
  }

  // معالجة تغيير صورة التصميم المخصصة
  const handleDesignImageChange = (image: File | null) => {
    setFormData(prev => ({
      ...prev,
      customDesignImage: image
    }))
  }

  // معالجة تغيير التعليقات المحفوظة
  const handleSavedCommentsChange = (comments: SavedDesignComment[]) => {
    setFormData(prev => ({
      ...prev,
      savedDesignComments: comments
    }))
  }

  // إرسال النموذج
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الحقول المطلوبة
    // السعر مطلوب فقط للفساتين الخارجية (عدم وجود orderId)
    if (!formData.clientName || !formData.clientPhone || !formData.alterationDueDate || (!orderId && !formData.price)) {
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }

    setIsSubmitting(true)

    try {
      console.log('🔧 Submitting alteration...')

      // تحويل الملاحظات الصوتية إلى مصفوفة من strings
      const voiceNotesData = formData.voiceNotes.map(vn => vn.data)

      // حفظ البيانات الكاملة للملاحظات الصوتية
      const voiceTranscriptions = formData.voiceNotes.map(vn => ({
        id: vn.id,
        data: vn.data,
        timestamp: vn.timestamp,
        duration: vn.duration,
        transcription: vn.transcription,
        translatedText: vn.translatedText,
        translationLanguage: vn.translationLanguage
      }))

      // تحويل السعر والدفعة المستلمة إلى أرقام
      // للفساتين الداخلية (orderId موجود)، السعر يكون 0
      const price = orderId ? 0 : Number(formData.price)
      const paidAmount = Number(formData.paidAmount) || 0

      // تحويل صورة التصميم المخصصة إلى base64 إذا كانت موجودة
      let customDesignImageBase64: string | undefined = undefined
      if (formData.customDesignImage) {
        try {
          const reader = new FileReader()
          customDesignImageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
            reader.readAsDataURL(formData.customDesignImage!)
          })
          const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
          console.log(`📸 Custom design image converted to base64: ${imageSizeKB}KB`)

          if (imageSizeKB > 5 * 1024) {
            toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 5MB`)
            setIsSubmitting(false)
            return
          }
        } catch (imageError) {
          console.error('❌ Error converting image to base64:', imageError)
          toast.error('خطأ في تحويل الصورة')
          setIsSubmitting(false)
          return
        }
      }

      // تجميع جميع التعليقات المحفوظة
      let allSavedComments = [...formData.savedDesignComments]

      // إذا كان هناك تعليق حالي غير محفوظ، نحفظه تلقائياً
      if (formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0) {
        const currentView = annotationRef.current?.getCurrentView() || 'front'
        const viewTitle = getNextDesignViewTitle(currentView, allSavedComments)

        const currentComment: SavedDesignComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          annotations: formData.imageAnnotations,
          drawings: formData.imageDrawings,
          image: customDesignImageBase64 || null,
          title: viewTitle,
          view: currentView
        }
        allSavedComments.push(currentComment)
      }

      // إنشاء أو تحديث طلب التعديل
      if (isEditMode && editId) {
        // وضع التعديل
        const result = await alterationService.update(editId, {
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          price: price,
          payment_method: formData.paymentMethod,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined,
          custom_design_image: customDesignImageBase64,
          paid_amount: paidAmount
        })

        if (result.error) {
          toast.error(result.error)
          setIsSubmitting(false)
          return
        }

        toast.success(isArabic ? 'تم تحديث طلب التعديل بنجاح!' : 'Alteration updated successfully!')
        router.push('/dashboard/alterations')
      } else {
        // وضع الإضافة
        const result = await alterationService.create({
          alteration_number: formData.alterationNumber && formData.alterationNumber.trim() !== '' ? formData.alterationNumber.trim() : undefined,
          original_order_id: orderId || undefined,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          price: price,
          payment_method: formData.paymentMethod,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined,
          custom_design_image: customDesignImageBase64,
          status: 'pending',
          paid_amount: paidAmount
        })

        if (result.error) {
          toast.error(result.error)
          setIsSubmitting(false)
          return
        }

        toast.success(isArabic ? 'تم إضافة طلب التعديل بنجاح!' : 'Alteration added successfully!')
        router.push('/dashboard/alterations')
      }
    } catch (error: any) {
      console.error('❌ Error creating alteration:', error)
      toast.error(error.message)
      setIsSubmitting(false)
    }
  }

  // حفظ طلب التعديل وإرسال رسالة واتساب
  const handleSubmitAndSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من وجود رقم الهاتف
    if (!formData.clientPhone || formData.clientPhone.trim() === '') {
      toast.error('يجب إدخال رقم هاتف العميل لإرسال رسالة واتساب', {
        icon: '⚠️',
      })
      return
    }

    // التحقق من الحقول المطلوبة
    if (!formData.clientName || !formData.clientPhone || !formData.alterationDueDate || (!orderId && !formData.price)) {
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }

    setIsSubmitting(true)

    try {
      console.log('🔧 Submitting alteration and sending WhatsApp...')

      // تحويل الملاحظات الصوتية إلى مصفوفة من strings
      const voiceNotesData = formData.voiceNotes.map(vn => vn.data)

      // حفظ البيانات الكاملة للملاحظات الصوتية
      const voiceTranscriptions = formData.voiceNotes.map(vn => ({
        id: vn.id,
        data: vn.data,
        timestamp: vn.timestamp,
        duration: vn.duration,
        transcription: vn.transcription,
        translatedText: vn.translatedText,
        translationLanguage: vn.translationLanguage
      }))

      // تحويل السعر والدفعة المستلمة إلى أرقام
      const price = orderId ? 0 : Number(formData.price)
      const paidAmount = Number(formData.paidAmount) || 0

      // تحويل صورة التصميم المخصصة إلى base64 إذا كانت موجودة
      let customDesignImageBase64: string | undefined = undefined
      if (formData.customDesignImage) {
        try {
          const reader = new FileReader()
          customDesignImageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
            reader.readAsDataURL(formData.customDesignImage!)
          })
          const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
          console.log(`📸 Custom design image converted to base64: ${imageSizeKB}KB`)

          if (imageSizeKB > 5 * 1024) {
            toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 5MB`)
            setIsSubmitting(false)
            return
          }
        } catch (imageError) {
          console.error('❌ Error converting image to base64:', imageError)
          toast.error('خطأ في تحويل الصورة')
          setIsSubmitting(false)
          return
        }
      }

      // تجميع جميع التعليقات المحفوظة
      let allSavedComments = [...formData.savedDesignComments]

      if (formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0) {
        const currentView = annotationRef.current?.getCurrentView() || 'front'
        const viewTitle = getNextDesignViewTitle(currentView, allSavedComments)

        const currentComment: SavedDesignComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          annotations: formData.imageAnnotations,
          drawings: formData.imageDrawings,
          image: customDesignImageBase64 || null,
          title: viewTitle,
          view: currentView
        }
        allSavedComments.push(currentComment)
      }

      let result
      let alterationNumber = formData.alterationNumber

      // إنشاء أو تحديث طلب التعديل
      if (isEditMode && editId) {
        // وضع التعديل
        result = await alterationService.update(editId, {
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          price: price,
          payment_method: formData.paymentMethod,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined,
          custom_design_image: customDesignImageBase64,
          paid_amount: paidAmount
        })

        if (result.error) {
          toast.error(result.error)
          setIsSubmitting(false)
          return
        }

        toast.success(isArabic ? 'تم تحديث طلب التعديل بنجاح!' : 'Alteration updated successfully!')
      } else {
        // وضع الإضافة
        result = await alterationService.create({
          alteration_number: formData.alterationNumber && formData.alterationNumber.trim() !== '' ? formData.alterationNumber.trim() : undefined,
          original_order_id: orderId || undefined,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          price: price,
          payment_method: formData.paymentMethod,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined,
          custom_design_image: customDesignImageBase64,
          paid_amount: paidAmount
        })

        if (result.error) {
          toast.error(result.error)
          setIsSubmitting(false)
          return
        }

        // الحصول على رقم التعديل من النتيجة إذا تم توليده تلقائياً
        if (result.data?.alteration_number) {
          alterationNumber = result.data.alteration_number
        }

        toast.success(isArabic ? 'تم إضافة طلب التعديل بنجاح!' : 'Alteration added successfully!')
      }

      // فتح واتساب مع الرسالة المجهزة
      try {
        openAlterationWhatsApp({
          clientName: formData.clientName,
          clientPhone: formData.clientPhone,
          alterationNumber: alterationNumber || undefined,
          dueDate: formData.alterationDueDate
        })

        toast.success('تم فتح واتساب لإرسال رسالة التأكيد للعميل', {
          icon: '📱',
          duration: 3000,
        })
      } catch (whatsappError) {
        console.error('❌ Error opening WhatsApp:', whatsappError)
        toast.error('حدث خطأ أثناء فتح واتساب', {
          icon: '⚠️',
        })
      }

      // التوجيه بعد 3 ثوانٍ
      setTimeout(() => {
        router.push('/dashboard/alterations')
      }, 3000)

    } catch (error: any) {
      console.error('❌ Error creating alteration:', error)
      toast.error(error.message)
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return null
  }

  if (isLoadingOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-pink-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white rounded-lg transition-colors"
            >
              <ArrowRight className={`w-6 h-6 text-gray-600 ${isArabic ? '' : 'rotate-180'}`} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {isEditMode
                  ? (isArabic ? 'تعديل طلب التعديل' : 'Edit Alteration')
                  : (isArabic ? 'إضافة طلب تعديل جديد' : 'Add New Alteration')
                }
              </h1>
              {originalOrder && !isEditMode && (
                <p className="text-sm text-gray-600 mt-1">
                  {isArabic ? 'مرتبط بالطلب:' : 'Linked to order:'} {originalOrder.order_number}
                </p>
              )}
              {isEditMode && (
                <p className="text-sm text-gray-600 mt-1">
                  {formData.alterationNumber}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 1. المعلومات الأساسية */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-pink-500" />
              {isArabic ? 'المعلومات الأساسية' : 'Basic Information'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1.1. رقم طلب التعديل (اختياري) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isArabic ? 'رقم طلب التعديل' : 'Alteration Number'} {!isEditMode && `(${isArabic ? 'اختياري' : 'Optional'})`}
                </label>
                <input
                  type="text"
                  value={formData.alterationNumber}
                  onChange={(e) => handleInputChange('alterationNumber', e.target.value)}
                  placeholder={isArabic ? 'سيتم توليده تلقائياً إذا ترك فارغاً' : 'Auto-generated if left empty'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  dir={isArabic ? 'rtl' : 'ltr'}
                  disabled={isEditMode}
                />
              </div>

              {/* 1.2. اسم الزبونة */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isArabic ? 'اسم الزبونة' : 'Client Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => handleInputChange('clientName', e.target.value)}
                  placeholder={isArabic ? 'أدخل اسم الزبونة' : 'Enter client name'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                  dir={isArabic ? 'rtl' : 'ltr'}
                />
              </div>

              {/* 1.3. رقم الهاتف */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isArabic ? 'رقم الهاتف' : 'Phone Number'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.clientPhone}
                  onChange={(e) => handleInputChange('clientPhone', e.target.value)}
                  placeholder={isArabic ? 'أدخل رقم الهاتف' : 'Enter phone number'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                  dir="ltr"
                />
              </div>

              {/* 1.4. موعد تسليم التعديل */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isArabic ? 'موعد تسليم التعديل' : 'Alteration Due Date'} <span className="text-red-500">*</span>
                </label>
                <DatePickerWithStats
                  selectedDate={formData.alterationDueDate}
                  onChange={(date) => handleInputChange('alterationDueDate', date)}
                  minDate={new Date()}
                  required={true}
                  statsType="alterations"
                />
              </div>
            </div>
          </motion.div>

          {/* 2. وصف التعديل المطلوب */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-pink-500" />
              {isArabic ? 'وصف التعديل المطلوب' : 'Alteration Description'}
            </h2>

            <UnifiedNotesInput
              textNotes={formData.notes}
              voiceNotes={formData.voiceNotes}
              onTextNotesChange={(notes) => handleInputChange('notes', notes)}
              onVoiceNotesChange={handleVoiceNotesChange}
            />
          </motion.div>

          {/* 3. السعر والدفع - يظهر فقط للفساتين الخارجية */}
          {!orderId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-pink-500" />
                {isArabic ? 'السعر والدفع' : 'Price & Payment'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 3.1. السعر */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isArabic ? 'سعر التعديل (ر.س)' : 'Alteration Price (SAR)'} <span className="text-red-500">*</span>
                  </label>
                  <NumericInput
                    value={formData.price}
                    onChange={(value) => handleInputChange('price', value)}
                    placeholder={isArabic ? 'أدخل السعر' : 'Enter price'}
                    required
                  />
                </div>

                {/* 3.2. المبلغ المدفوع */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isArabic ? 'المبلغ المدفوع (ر.س)' : 'Paid Amount (SAR)'}
                  </label>
                  <NumericInput
                    value={formData.paidAmount}
                    onChange={(value) => handleInputChange('paidAmount', value)}
                    placeholder={isArabic ? 'أدخل المبلغ المدفوع' : 'Enter paid amount'}
                  />
                </div>

                {/* 3.3. طريقة الدفع */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isArabic ? 'طريقة الدفع' : 'Payment Method'}
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    dir={isArabic ? 'rtl' : 'ltr'}
                  >
                    <option value="cash">{isArabic ? 'نقدي' : 'Cash'}</option>
                    <option value="card">{isArabic ? 'بطاقة' : 'Card'}</option>
                    <option value="bank_transfer">{isArabic ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                    <option value="check">{isArabic ? 'شيك' : 'Check'}</option>
                  </select>
                </div>

                {/* 3.4. المبلغ المتبقي */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isArabic ? 'المبلغ المتبقي (ر.س)' : 'Remaining Amount (SAR)'}
                  </label>
                  <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                    {remainingAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 4. تعليقات التصميم */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-pink-500" />
              {isArabic ? 'تعليقات التصميم' : 'Design Comments'}
            </h2>

            <InteractiveImageAnnotation
              ref={annotationRef}
              imageSrc="/WhatsApp Image 2026-01-11 at 3.33.05 PM.jpeg"
              annotations={formData.imageAnnotations}
              onAnnotationsChange={handleImageAnnotationsChange}
              drawings={formData.imageDrawings}
              onDrawingsChange={handleImageDrawingsChange}
              customImage={formData.customDesignImage}
              onImageChange={handleDesignImageChange}
              disabled={isSubmitting}
              savedComments={formData.savedDesignComments}
              onSavedCommentsChange={handleSavedCommentsChange}
            />
          </motion.div>

          {/* 5. صور التصميم */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Upload className="w-5 h-5 text-pink-500" />
              {isArabic ? 'صور التصميم' : 'Design Images'}
            </h2>

            <ImageUpload
              images={formData.images}
              onImagesChange={(images) => handleInputChange('images', images)}
              maxImages={10}
            />
          </motion.div>

          {/* 6. أزرار الإجراءات */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            {/* زر حفظ طلب التعديل العادي */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isArabic ? 'جاري الحفظ...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {isEditMode
                    ? (isArabic ? 'تحديث طلب التعديل' : 'Update Alteration')
                    : (isArabic ? 'حفظ طلب التعديل' : 'Save Alteration')
                  }
                </>
              )}
            </button>

            {/* زر حفظ طلب التعديل وإرسال واتساب */}
            <button
              type="button"
              onClick={handleSubmitAndSendWhatsApp}
              disabled={isSubmitting || !formData.clientPhone}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title={!formData.clientPhone ? 'يجب إدخال رقم هاتف العميل أولاً' : ''}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isArabic ? 'جاري الحفظ...' : 'Saving...'}
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5" />
                  {isArabic ? 'حفظ وإرسال رسالة' : 'Save & Send Message'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AlertCircle className="w-5 h-5" />
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
          </motion.div>
        </form>
      </div>
    </div>
  )
}

export default function AddAlterationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-pink-500 animate-spin" />
      </div>
    }>
      <AddAlterationContent />
    </Suspense>
  )
}
