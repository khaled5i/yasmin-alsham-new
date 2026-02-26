'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  X,
  Save,
  User,
  Users,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  Ruler,
  MessageCircle
} from 'lucide-react'
import { openWhatsApp } from '@/utils/whatsapp'
import ImageUpload from './ImageUpload'
import UnifiedNotesInput from './UnifiedNotesInput'
import NumericInput from './NumericInput'
import DatePickerWithStats from './DatePickerWithStats'
import DatePickerForProof from './DatePickerForProof'
import InteractiveImageAnnotation, { ImageAnnotation, DrawingPath, SavedDesignComment, InteractiveImageAnnotationRef } from './InteractiveImageAnnotation'
import { Order, orderService } from '@/lib/services/order-service'
import { WorkerWithUser } from '@/lib/services/worker-service'
import { useTranslation } from '@/hooks/useTranslation'

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

interface EditOrderModalProps {
  order: Order | null
  workers: WorkerWithUser[]
  isOpen: boolean
  onClose: () => void
  onSave: (orderId: string, updates: any) => void
}

export default function EditOrderModal({ order: initialOrder, workers, isOpen, onClose, onSave }: EditOrderModalProps) {
  const { t, isArabic } = useTranslation()
  const annotationRef = useRef<InteractiveImageAnnotationRef>(null)
  const initialDesignStateRef = useRef<{ annotations: string; drawings: string }>({
    annotations: '[]',
    drawings: '[]'
  })
  const latestSavedCommentIdRef = useRef<string | null>(null)
  // Full order data (fetched when lightweight order is missing measurements)
  const [fullOrder, setFullOrder] = useState<Order | null>(null)
  const order = fullOrder || initialOrder
  const [annotationImageSrc, setAnnotationImageSrc] = useState('/front2.png')
  // base64 image loaded from existing order for InteractiveImageAnnotation
  const [currentImageBase64, setCurrentImageBase64] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    orderNumber: '',
    clientName: '',
    clientPhone: '',
    description: '',
    fabric: '',
    price: '',
    paidAmount: '',
    paymentMethod: 'cash' as 'cash' | 'card',
    orderStatus: 'pending' as 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled',
    orderReceivedDate: '',
    assignedWorker: '',
    dueDate: '',
    proofDeliveryDate: '',
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
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Fetch full order data when opened with lightweight-loaded order
  useEffect(() => {
    if (!isOpen || !initialOrder) {
      setFullOrder(null)
      return
    }

    if (initialOrder.measurements !== undefined) {
      setFullOrder(null)
      return
    }

    let cancelled = false
    orderService.getById(initialOrder.id).then(result => {
      if (!cancelled && result.data) {
        setFullOrder(result.data)
      }
    })

    return () => { cancelled = true }
  }, [isOpen, initialOrder?.id])

  // تحميل بيانات الطلب عند فتح النافذة
  useEffect(() => {
    if (order) {
      // استرجاع البيانات الكاملة من voice_transcriptions إذا كانت موجودة
      let voiceNotesData: any[] = []

      if ((order as any).voice_transcriptions && Array.isArray((order as any).voice_transcriptions)) {
        voiceNotesData = (order as any).voice_transcriptions
      } else if (order.voice_notes && Array.isArray(order.voice_notes)) {
        voiceNotesData = order.voice_notes.map((vn, idx) => ({
          id: `vn-${idx}`,
          data: vn,
          timestamp: Date.now()
        }))
      }

      // استرجاع تعليقات التصميم من measurements
      const measurements = order.measurements as any
      const savedComments = measurements?.saved_design_comments || []
      const customImage = measurements?.custom_design_image || null

      // تحميل slot الأمام بشكل افتراضي، أو أول slot موجود
      const frontSlot = savedComments.find((c: SavedDesignComment) => {
        const view = c.view ?? (c.title?.trim().startsWith('أمام') ? 'front' : c.title?.trim().startsWith('خلف') ? 'back' : null)
        return view === 'front'
      })
      const initialSlot = frontSlot || (savedComments.length > 0 ? savedComments[0] : null)
      const annotations = initialSlot?.annotations || measurements?.image_annotations || []
      const drawings = initialSlot?.drawings || measurements?.image_drawings || []

      latestSavedCommentIdRef.current = initialSlot?.id || null
      if (initialSlot?.view) {
        setAnnotationImageSrc(initialSlot.view === 'back' ? '/back2.png' : '/front2.png')
      } else {
        setAnnotationImageSrc('/front2.png')
      }

      setFormData({
        orderNumber: order.order_number || '',
        clientName: order.client_name,
        clientPhone: order.client_phone,
        description: order.description || '',
        fabric: order.fabric || '',
        price: order.price.toString(),
        paidAmount: (order.paid_amount || 0).toString(),
        paymentMethod: (order.payment_method || 'cash') as 'cash' | 'card',
        orderStatus: (order.status || 'pending') as 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled',
        orderReceivedDate: order.order_received_date || new Date().toISOString().split('T')[0],
        assignedWorker: order.worker_id || '',
        dueDate: order.due_date,
        proofDeliveryDate: order.proof_delivery_date || '',
        notes: order.notes || '',
        voiceNotes: voiceNotesData,
        images: order.images || [],
        imageAnnotations: annotations,
        imageDrawings: drawings,
        customDesignImage: null as File | null, // File objects are set via handleDesignImageChange
        savedDesignComments: savedComments
      })

      initialDesignStateRef.current = {
        annotations: JSON.stringify(annotations),
        drawings: JSON.stringify(drawings)
      }

      // تحميل صورة التصميم المخصصة الموجودة كـ base64 لتمريرها إلى InteractiveImageAnnotation
      setCurrentImageBase64(customImage || null)
    }
  }, [order])

  // حساب المبلغ المتبقي
  const remainingAmount = useMemo(() => {
    const price = Number(formData.price) || 0
    const paidAmount = Number(formData.paidAmount) || 0
    return Math.max(0, price - paidAmount)
  }, [formData.price, formData.paidAmount])

  // معالجة تغيير الحقول
  const handleInputChange = useCallback((field: string, value: string | string[] | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }, [])

  // معالجة تغيير الملاحظات الصوتية
  const handleVoiceNotesChange = useCallback((voiceNotes: Array<{
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
  }, [])

  // معالجة تغيير التعليقات على الصورة
  const handleImageAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    setFormData(prev => ({
      ...prev,
      imageAnnotations: annotations
    }))
  }, [])

  // معالجة تغيير الرسومات على الصورة
  const handleImageDrawingsChange = useCallback((drawings: DrawingPath[]) => {
    setFormData(prev => ({
      ...prev,
      imageDrawings: drawings
    }))
  }, [])

  // معالجة تغيير صورة التصميم المخصصة
  const handleDesignImageChange = useCallback(async (image: File | null) => {
    setFormData(prev => ({
      ...prev,
      customDesignImage: image
    }))

    if (image) {
      try {
        // على Android، ملفات الكاميرا مدعومة بـ content:// URI قد يصبح غير مستقر
        let safeBlob: Blob = image
        const isAndroid = /android/i.test(navigator.userAgent)
        if (isAndroid) {
          try {
            const buffer = await image.arrayBuffer()
            safeBlob = new Blob([buffer], { type: image.type || 'image/jpeg' })
          } catch { safeBlob = image }
        }
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
          reader.readAsDataURL(safeBlob)
        })
        setCurrentImageBase64(base64)
      } catch (error) {
        console.error('Error converting design image to base64:', error)
      }
    } else {
      setCurrentImageBase64(null)
    }
  }, [])

  // معالجة تغيير التعليقات المحفوظة
  const handleSavedCommentsChange = useCallback((comments: SavedDesignComment[]) => {
    const latestSavedComment =
      comments.length > 0
        ? [...comments].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))[comments.length - 1]
        : null
    latestSavedCommentIdRef.current = latestSavedComment?.id || null

    setFormData(prev => ({
      ...prev,
      savedDesignComments: comments
    }))
  }, [])

  const buildSavedCommentsForSubmit = useCallback((customDesignImageBase64?: string, compositeImage?: string | null) => {
    const allSavedComments = formData.savedDesignComments.map(comment => ({
      ...comment,
      image: comment.image?.startsWith('data:') ? 'custom' : (comment.image || null)
    }))
    const hasCurrentPayload = formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0

    if (!hasCurrentPayload) {
      return allSavedComments
    }

    const currentView = annotationRef.current?.getCurrentView() || 'front'
    const viewLabel = currentView === 'front' ? 'أمام' : 'خلف'

    // البحث عن slot العرض الحالي وتحديثه أو إنشاؤه
    const existingSlotIndex = allSavedComments.findIndex(c => {
      const commentView = c.view ?? (c.title?.trim().startsWith('أمام') ? 'front' : c.title?.trim().startsWith('خلف') ? 'back' : null)
      return commentView === currentView
    })

    if (existingSlotIndex >= 0) {
      const updatedComments = [...allSavedComments]
      updatedComments[existingSlotIndex] = {
        ...updatedComments[existingSlotIndex],
        annotations: formData.imageAnnotations,
        drawings: formData.imageDrawings,
        image: customDesignImageBase64 ? 'custom' : (updatedComments[existingSlotIndex].image || null),
        compositeImage: compositeImage || updatedComments[existingSlotIndex].compositeImage || null,
        view: currentView,
        timestamp: Date.now()
      }
      return updatedComments
    }

    const currentComment: SavedDesignComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      annotations: formData.imageAnnotations,
      drawings: formData.imageDrawings,
      image: customDesignImageBase64 ? 'custom' : null,
      title: viewLabel,
      view: currentView,
      compositeImage: compositeImage || null
    }

    return [...allSavedComments, currentComment]
  }, [formData.imageAnnotations, formData.imageDrawings, formData.savedDesignComments])

  // إرسال النموذج
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!order) return

    // التحقق من الحقول المطلوبة (رقم الطلب اختياري - سيتم توليده تلقائياً)
    if (!formData.clientName || !formData.clientPhone || !formData.dueDate || !formData.price) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      console.log('📦 Updating order...')

      // تحويل الملاحظات الصوتية إلى مصفوفة من strings (للتوافق مع voice_notes القديم)
      const voiceNotesData = formData.voiceNotes.map(vn => vn.data)

      // حفظ البيانات الكاملة للملاحظات الصوتية (مع النصوص المحولة) في voice_transcriptions
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
      const price = Number(formData.price)
      const paidAmount = Number(formData.paidAmount) || 0

      // تحويل صورة التصميم المخصصة إلى base64 إذا كانت موجودة
      let customDesignImageBase64: string | undefined = undefined
      if (formData.customDesignImage) {
        try {
          // على Android، ملفات الكاميرا مدعومة بـ content:// URI قد يصبح غير مستقر
          let safeBlob: Blob = formData.customDesignImage
          const isAndroid = /android/i.test(navigator.userAgent)
          if (isAndroid) {
            try {
              const buffer = await formData.customDesignImage.arrayBuffer()
              safeBlob = new Blob([buffer], { type: formData.customDesignImage.type || 'image/jpeg' })
            } catch { safeBlob = formData.customDesignImage }
          }
          const reader = new FileReader()
          customDesignImageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
            reader.readAsDataURL(safeBlob)
          })
          const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
          console.log(`📸 Custom design image converted to base64: ${imageSizeKB}KB`)

          // التحقق من الحجم (الحد الأقصى 10MB)
          if (imageSizeKB > 10 * 1024) {
            toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 10MB`)
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

      // توليد صورة مركّبة (compositeImage) لضمان العرض الصحيح في صفحة العرض والطباعة
      let compositeImage: string | null = null
      if (formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0) {
        try {
          compositeImage = await annotationRef.current?.generateCompositeImage() || null
        } catch (err) {
          console.error('⚠️ Failed to generate composite image:', err)
        }
      }

      const allSavedComments = buildSavedCommentsForSubmit(customDesignImageBase64, compositeImage)

      // تحديث الطلب
      onSave(order.id, {
        order_number: formData.orderNumber && formData.orderNumber.trim() !== '' ? formData.orderNumber.trim() : undefined,
        client_name: formData.clientName,
        client_phone: formData.clientPhone,
        description: formData.description,
        // إرسال null بدلاً من undefined للحقول النصية القابلة للحذف (للتأكد من حفظ الحذف في قاعدة البيانات)
        fabric: formData.fabric || null,
        price: price,
        payment_method: formData.paymentMethod,
        status: formData.orderStatus,
        order_received_date: formData.orderReceivedDate,
        worker_id: formData.assignedWorker && formData.assignedWorker !== '' ? formData.assignedWorker : null,
        due_date: formData.dueDate,
        proof_delivery_date: formData.proofDeliveryDate && formData.proofDeliveryDate !== '' ? formData.proofDeliveryDate : null,
        notes: formData.notes || null,
        // إرسال مصفوفة فارغة إذا تم حذف جميع العناصر (للتأكد من حفظ الحذف في قاعدة البيانات)
        voice_notes: voiceNotesData,
        voice_transcriptions: voiceTranscriptions,
        images: formData.images,
        saved_design_comments: allSavedComments,
        image_annotations: formData.imageAnnotations,
        image_drawings: formData.imageDrawings,
        custom_design_image: customDesignImageBase64,
        paid_amount: paidAmount,
        updated_at: new Date().toISOString()
      })

      setMessage({ type: 'success', text: t('order_updated_success') })

      setTimeout(() => {
        onClose()
        setMessage(null)
      }, 1500)

    } catch (error) {
      console.error('❌ Error updating order:', error)
      setMessage({ type: 'error', text: t('order_update_error') })
    } finally {
      setIsSubmitting(false)
    }
  }

  // حفظ التعديلات وإرسال رسالة واتساب
  const handleSubmitAndSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!order) return

    // التحقق من وجود رقم الهاتف
    if (!formData.clientPhone || formData.clientPhone.trim() === '') {
      toast.error('يجب إدخال رقم هاتف العميل لإرسال رسالة واتساب', {
        icon: '⚠️',
      })
      return
    }

    // التحقق من الحقول المطلوبة (رقم الطلب اختياري - سيتم توليده تلقائياً)
    if (!formData.clientName || !formData.clientPhone || !formData.dueDate || !formData.price) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      console.log('📦 Updating order and sending WhatsApp...')

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
      const price = Number(formData.price)
      const paidAmount = Number(formData.paidAmount) || 0

      // تحويل صورة التصميم المخصصة إلى base64 إذا كانت موجودة
      let customDesignImageBase64: string | undefined = undefined
      if (formData.customDesignImage) {
        try {
          // على Android، ملفات الكاميرا مدعومة بـ content:// URI قد يصبح غير مستقر
          let safeBlob: Blob = formData.customDesignImage
          const isAndroid = /android/i.test(navigator.userAgent)
          if (isAndroid) {
            try {
              const buffer = await formData.customDesignImage.arrayBuffer()
              safeBlob = new Blob([buffer], { type: formData.customDesignImage.type || 'image/jpeg' })
            } catch { safeBlob = formData.customDesignImage }
          }
          const reader = new FileReader()
          customDesignImageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
            reader.readAsDataURL(safeBlob)
          })
          const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
          console.log(`📸 Custom design image converted to base64: ${imageSizeKB}KB`)

          if (imageSizeKB > 10 * 1024) {
            toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 10MB`)
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

      // توليد صورة مركّبة (compositeImage) لضمان العرض الصحيح في صفحة العرض والطباعة
      let compositeImage: string | null = null
      if (formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0) {
        try {
          compositeImage = await annotationRef.current?.generateCompositeImage() || null
        } catch (err) {
          console.error('⚠️ Failed to generate composite image:', err)
        }
      }

      const allSavedComments = buildSavedCommentsForSubmit(customDesignImageBase64, compositeImage)

      // تحديث الطلب
      onSave(order.id, {
        order_number: formData.orderNumber && formData.orderNumber.trim() !== '' ? formData.orderNumber.trim() : undefined,
        client_name: formData.clientName,
        client_phone: formData.clientPhone,
        description: formData.description,
        // إرسال null بدلاً من undefined للحقول النصية القابلة للحذف (للتأكد من حفظ الحذف في قاعدة البيانات)
        fabric: formData.fabric || null,
        price: price,
        payment_method: formData.paymentMethod,
        status: formData.orderStatus,
        order_received_date: formData.orderReceivedDate,
        worker_id: formData.assignedWorker && formData.assignedWorker !== '' ? formData.assignedWorker : null,
        due_date: formData.dueDate,
        proof_delivery_date: formData.proofDeliveryDate && formData.proofDeliveryDate !== '' ? formData.proofDeliveryDate : null,
        notes: formData.notes || null,
        // إرسال مصفوفة فارغة إذا تم حذف جميع العناصر (للتأكد من حفظ الحذف في قاعدة البيانات)
        voice_notes: voiceNotesData,
        voice_transcriptions: voiceTranscriptions,
        images: formData.images,
        saved_design_comments: allSavedComments,
        image_annotations: formData.imageAnnotations,
        image_drawings: formData.imageDrawings,
        custom_design_image: customDesignImageBase64,
        paid_amount: paidAmount,
        updated_at: new Date().toISOString()
      })

      setMessage({ type: 'success', text: t('order_updated_success') })

      // فتح واتساب مع الرسالة المجهزة
      try {
        openWhatsApp({
          clientName: formData.clientName,
          clientPhone: formData.clientPhone,
          orderNumber: formData.orderNumber || undefined,
          proofDeliveryDate: formData.proofDeliveryDate || undefined,
          dueDate: formData.dueDate,
          totalPrice: price,
          remainingAmount: Math.max(0, price - paidAmount)
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

      setTimeout(() => {
        onClose()
        setMessage(null)
      }, 2000)

    } catch (error) {
      console.error('❌ Error updating order:', error)
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
              className="relative bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* رأس النافذة */}
              <div className="sticky top-0 bg-gradient-to-r from-pink-500 to-purple-600 border-b border-pink-200 p-6 rounded-t-2xl z-30 shadow-lg">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white">{t('edit_order')}</h2>
                  <button
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white transition-colors duration-300 hover:bg-white/10 rounded-lg"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* محتوى النموذج */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* المعلومات الأساسية */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
                  <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                    <User className="w-5 h-5 text-pink-600" />
                    <span>{t('basic_information')}</span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    {/* الصف الأول: اسم العميل | رقم الهاتف | موعد تسليم البروفا */}

                    {/* 1. اسم العميل */}
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
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* 2. رقم الهاتف */}
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

                    {/* 3. موعد تسليم البروفا - تقويم أخضر */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {isArabic ? 'موعد تسليم البروفا' : 'Proof Delivery Date'}
                      </label>
                      <DatePickerForProof
                        selectedDate={formData.proofDeliveryDate}
                        onChange={(date) => handleInputChange('proofDeliveryDate', date)}
                        minDate={new Date()}
                        required={false}
                      />
                    </div>

                    {/* الصف الثاني: موعد التسليم | رقم الطلب | تاريخ استلام الطلب */}

                    {/* 4. موعد التسليم - تقويم ذكي */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('delivery_date_required')}
                      </label>
                      <DatePickerWithStats
                        selectedDate={formData.dueDate}
                        onChange={(date) => handleInputChange('dueDate', date)}
                        minDate={new Date()}
                        required={true}
                      />
                    </div>

                    {/* 5. رقم الطلب */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('order_number')} ({isArabic ? 'تلقائي' : 'Auto'})
                      </label>
                      <input
                        type="text"
                        value={formData.orderNumber}
                        onChange={(e) => handleInputChange('orderNumber', e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                        placeholder={isArabic ? 'سيتم التوليد تلقائياً (1، 2، 3...)' : 'Auto-generated (1, 2, 3...)'}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* 6. تاريخ استلام الطلب (تلقائي) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('order_received_date')}
                      </label>
                      <input
                        type="date"
                        value={formData.orderReceivedDate}
                        onChange={(e) => handleInputChange('orderReceivedDate', e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-700"
                        disabled
                      />
                    </div>

                    {/* الصف الثالث: السعر | الدفعة المستلمة | الدفعة المتبقية */}

                    {/* 7. السعر */}
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

                    {/* 8. الدفعة المستلمة */}
                    <div>
                      <NumericInput
                        value={formData.paidAmount}
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
                          handleInputChange('paidAmount', value)
                        }}
                        type="price"
                        label={t('paid_amount')}
                        placeholder="0"
                        disabled={isSubmitting || !formData.price}
                      />
                    </div>

                    {/* 9. الدفعة المتبقية (للعرض فقط) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('remaining_amount')}
                      </label>
                      <div className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                        {remainingAmount.toFixed(2)} {t('sar')}
                      </div>
                    </div>

                    {/* 10. نوع القماش */}
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        نوع القماش
                      </label>
                      <input
                        type="text"
                        value={formData.fabric || ''}
                        onChange={(e) => handleInputChange('fabric', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                        placeholder="أدخل نوع القماش..."
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                {/* التعليقات الصوتية على صورة الفستان */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-pink-100">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center space-x-2 space-x-reverse">
                    <Ruler className="w-5 h-5 text-pink-600" />
                    <span>تعليقات على التصميم</span>
                  </h3>

                  <InteractiveImageAnnotation
                    ref={annotationRef}
                    imageSrc={annotationImageSrc}
                    annotations={formData.imageAnnotations}
                    onAnnotationsChange={handleImageAnnotationsChange}
                    drawings={formData.imageDrawings}
                    onDrawingsChange={handleImageDrawingsChange}
                    customImage={formData.customDesignImage}
                    onImageChange={handleDesignImageChange}
                    disabled={isSubmitting}
                    savedComments={formData.savedDesignComments}
                    onSavedCommentsChange={handleSavedCommentsChange}
                    showSaveButton={true}
                    currentImageBase64={currentImageBase64}
                  />
                </div>

                {/* صور التصميم */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-pink-100 relative z-20">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center space-x-2 space-x-reverse">
                    <ImageIcon className="w-5 h-5 text-pink-600" />
                    <span>صور التصميم</span>
                  </h3>

                  <ImageUpload
                    images={formData.images}
                    onImagesChange={(images) => handleInputChange('images', images)}
                    alwaysShowDeleteOnMobileAndTablet={true}
                  />
                </div>

                {/* ملاحظات إضافية */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-pink-100">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center space-x-2 space-x-reverse">
                    <MessageSquare className="w-5 h-5 text-pink-600" />
                    <span>ملاحظات إضافية</span>
                  </h3>

                  <UnifiedNotesInput
                    notes={formData.notes}
                    voiceNotes={formData.voiceNotes}
                    onNotesChange={(notes) => handleInputChange('notes', notes)}
                    onVoiceNotesChange={handleVoiceNotesChange}
                    disabled={isSubmitting}
                  />
                </div>

                {/* اختيار العامل المسؤول */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
                  <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                    <Users className="w-5 h-5 text-pink-600" />
                    <span>{t('responsible_worker')}</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('choose_worker')} ({t('optional')})
                      </label>
                      <select
                        value={formData.assignedWorker}
                        onChange={(e) => handleInputChange('assignedWorker', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                        disabled={isSubmitting}
                      >
                        <option value="">{t('choose_worker')}</option>
                        {workers.filter(w => w.is_available && w.user?.is_active && (w.specialty === 'خياطة' || w.specialty === 'Tailor' || w.specialty.toLowerCase().includes('tailor') || w.specialty.toLowerCase().includes('خياط'))).map(worker => (
                          <option key={worker.id} value={worker.id}>
                            {worker.user?.full_name || worker.specialty} - {worker.specialty}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {isArabic ? 'حالة الطلب' : 'Order Status'}
                      </label>
                      <select
                        value={formData.orderStatus}
                        onChange={(e) => handleInputChange('orderStatus', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                        disabled={isSubmitting}
                      >
                        <option value="pending">{isArabic ? 'في الانتظار' : 'Pending'}</option>
                        <option value="in_progress">{isArabic ? 'قيد العمل' : 'In Progress'}</option>
                        <option value="completed">{isArabic ? 'مكتمل' : 'Completed'}</option>
                        <option value="delivered">{isArabic ? 'تم التسليم' : 'Delivered'}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </form>

              {/* تذييل النافذة */}
              <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-pink-100 p-6 rounded-b-2xl z-30 shadow-lg">
                {/* رسالة النجاح/الخطأ */}
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-4 p-4 rounded-lg flex items-center space-x-2 space-x-reverse ${message.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                  >
                    {message.type === 'success' ? (
                      <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    )}
                    <span>{message.text}</span>
                  </motion.div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-300 font-medium"
                    disabled={isSubmitting}
                  >
                    {t('cancel')}
                  </button>

                  {/* زر تحديث الطلب العادي */}
                  <button
                    type="submit"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:from-pink-600 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 space-x-reverse font-medium shadow-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('saving')}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>{isArabic ? 'تحديث الطلب' : 'Update Order'}</span>
                      </>
                    )}
                  </button>

                  {/* زر تحديث الطلب وإرسال واتساب */}
                  <button
                    type="button"
                    onClick={handleSubmitAndSendWhatsApp}
                    disabled={isSubmitting || !formData.clientPhone}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 space-x-reverse font-medium shadow-lg"
                    title={!formData.clientPhone ? 'يجب إدخال رقم هاتف العميل أولاً' : ''}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('saving')}</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-5 h-5" />
                        <span>{isArabic ? 'حفظ وإرسال رسالة' : 'Save & Send Message'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  )
}
