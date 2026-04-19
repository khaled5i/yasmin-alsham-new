'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import { alterationService, AlterationErrorType } from '@/lib/services/alteration-service'
import { orderService, Order } from '@/lib/services/order-service'
import ImageUpload from '@/components/ImageUpload'
import UnifiedNotesInput from '@/components/UnifiedNotesInput'
import InteractiveImageAnnotation, { ImageAnnotation, DrawingPath, SavedDesignComment, InteractiveImageAnnotationRef } from '@/components/InteractiveImageAnnotation'
import NumericInput from '@/components/NumericInput'
import DatePickerWithStats from '@/components/DatePickerWithStats'
import { imageService } from '@/lib/services/image-service'
import {
  ArrowRight,
  Upload,
  Save,
  User,
  MessageSquare,
  AlertCircle,
  Loader2,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Camera,
  Ruler,
  Image as ImageIcon,
  Play,
  Pause,
  Package,
  Phone,
  Clock,
  CheckCircle,
  Pencil
} from 'lucide-react'
import { openAlterationWhatsApp } from '@/utils/whatsapp'
import { renderDrawingsOnCanvas } from '@/lib/canvas-renderer'
import { MEASUREMENT_ORDER, getMeasurementLabelWithSymbol } from '@/types/measurements'

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
      const initialAnnotations = (alteration as any).image_annotations || []
      const initialDrawings = (alteration as any).image_drawings || []

      setFormData({
        alterationNumber: alteration.alteration_number,
        clientName: alteration.client_name,
        clientPhone: alteration.client_phone,
        price: alteration.price.toString(),
        paidAmount: alteration.paid_amount.toString(),
        paymentMethod: alteration.payment_method || 'cash',
        orderReceivedDate: alteration.order_received_date || new Date().toISOString().split('T')[0],
        alterationDueDate: alteration.alteration_due_date,
        errorType: (alteration.error_type as AlterationErrorType) || '',
        errorNotes: alteration.error_notes || '',
        notes: alteration.notes || '',
        voiceNotes: (alteration as any).voice_transcriptions || [],
        images: alteration.images || [],
        alterationPhotos: alteration.alteration_photos || [],
        imageAnnotations: initialAnnotations,
        imageDrawings: initialDrawings,
        customDesignImage: null,
        savedDesignComments: (alteration as any).saved_design_comments || []
      })

      initialDesignStateRef.current = {
        annotations: JSON.stringify(initialAnnotations),
        drawings: JSON.stringify(initialDrawings)
      }

      // إذا كان التعديل داخلياً، نحمّل الطلب الأصلي لعرض تفاصيل الفستان
      const origId = (alteration as any).original_order_id
      if (origId) {
        setEditModeOriginalOrderId(origId)
        orderService.getById(origId).then(({ data, error }) => {
          if (!error && data) setOriginalOrder(data)
        }).catch(console.error)
      }

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
    errorType: '' as AlterationErrorType | '',
    errorNotes: '',
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
    alterationPhotos: [] as string[],
    imageAnnotations: [] as ImageAnnotation[],
    imageDrawings: [] as DrawingPath[],
    customDesignImage: null as File | null,
    savedDesignComments: [] as SavedDesignComment[]
  })

  // معرف الطلب الأصلي المستخرج من بيانات التعديل عند التعديل على تعديل داخلي
  const [editModeOriginalOrderId, setEditModeOriginalOrderId] = useState<string | null>(null)
  // المعرف الفعلي للطلب الأصلي: من URL أو من بيانات التعديل المحملة
  const effectiveOrderId = orderId || editModeOriginalOrderId

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDressDetails, setShowDressDetails] = useState(false)
  const [isCameraUploading, setIsCameraUploading] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const initialDesignStateRef = useRef<{ annotations: string; drawings: string }>({
    annotations: '[]',
    drawings: '[]'
  })

  // حالات العرض للقراءة فقط (تفاصيل الفستان للتعديلات الداخلية)
  const [expandedROCommentId, setExpandedROCommentId] = useState<string | null>(null)
  const [playingROAudioId, setPlayingROAudioId] = useState<string | null>(null)
  const roAudioRef = useRef<HTMLAudioElement | null>(null)
  const roCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const roCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // تعبئة البيانات من الطلب الأصلي
  const prefillFormData = (order: Order) => {
    const initialAnnotations = (order.measurements as any)?.image_annotations || []
    const initialDrawings = (order.measurements as any)?.image_drawings || []

    setFormData(prev => ({
      ...prev,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      images: order.images || [],
      // استخراج التعليقات المحفوظة من measurements
      savedDesignComments: (order.measurements as any)?.saved_design_comments || [],
      imageAnnotations: initialAnnotations,
      imageDrawings: initialDrawings
    }))

    initialDesignStateRef.current = {
      annotations: JSON.stringify(initialAnnotations),
      drawings: JSON.stringify(initialDrawings)
    }
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

  // معالجة التقاط صورة من كاميرا الجوال وإضافتها لصور التعديل
  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // إعادة تعيين قيمة الإدخال لإتاحة التقاط صورة جديدة لاحقاً
    e.target.value = ''

    setIsCameraUploading(true)
    try {
      const result = await imageService.uploadImage(file)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data?.url) {
        setFormData(prev => ({
          ...prev,
          alterationPhotos: [...prev.alterationPhotos, result.data!.url]
        }))
        toast.success(isArabic ? 'تمت إضافة الصورة بنجاح' : 'Photo added successfully')
      }
    } catch (err: any) {
      toast.error(isArabic ? 'فشل في رفع الصورة' : 'Failed to upload photo')
    } finally {
      setIsCameraUploading(false)
    }
  }

  // بيانات الطلب الأصلي للعرض للقراءة فقط
  const roCustomDesignImage = originalOrder ? ((originalOrder as any).custom_design_image || null) : null
  const roSavedDesignComments: SavedDesignComment[] = originalOrder
    ? ((originalOrder as any).design_comments || (originalOrder.measurements as any)?.saved_design_comments || [])
    : []
  const roImageAnnotations: ImageAnnotation[] = originalOrder
    ? ((originalOrder as any).image_annotations || (originalOrder.measurements as any)?.image_annotations || [])
    : []
  const roImageDrawings: DrawingPath[] = originalOrder
    ? ((originalOrder as any).image_drawings || (originalOrder.measurements as any)?.image_drawings || [])
    : []

  const resolveROCommentImageSrc = (comment: SavedDesignComment): string => {
    if (comment.image && comment.image.startsWith('data:')) return comment.image
    if (comment.image && comment.image !== 'custom') return comment.image
    if (roCustomDesignImage) return roCustomDesignImage
    return '/front2.png'
  }

  const drawROPathsOnCanvas = async (
    canvas: HTMLCanvasElement,
    drawings: DrawingPath[],
    retryCount: number = 0
  ) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const displayWidth = Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 0)
    const displayHeight = Math.round(canvas.clientHeight || canvas.parentElement?.clientHeight || 0)
    if (displayWidth <= 0 || displayHeight <= 0) {
      if (retryCount < 12) {
        setTimeout(() => { void drawROPathsOnCanvas(canvas, drawings, retryCount + 1) }, 50)
      }
      return
    }
    canvas.width = displayWidth
    canvas.height = displayHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    renderDrawingsOnCanvas(ctx, drawings, canvas.width, canvas.height)
  }

  const toggleROAudio = (annotation: ImageAnnotation) => {
    if (!annotation.audioData) return
    if (playingROAudioId === annotation.id) {
      if (roAudioRef.current) { roAudioRef.current.pause(); roAudioRef.current = null }
      setPlayingROAudioId(null)
    } else {
      if (roAudioRef.current) { roAudioRef.current.pause() }
      const audio = new Audio(annotation.audioData)
      audio.onended = () => setPlayingROAudioId(null)
      audio.play()
      roAudioRef.current = audio
      setPlayingROAudioId(annotation.id)
    }
  }

  const formatOrderDate = (dateString: string) => {
    if (!dateString) return ''
    try {
      const d = new Date(dateString)
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    } catch { return dateString }
  }

  const statusLabels: Record<string, string> = {
    pending: 'في الانتظار', in_progress: 'قيد التنفيذ', completed: 'مكتمل',
    delivered: 'تم التسليم', cancelled: 'ملغى'
  }
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700', in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700', delivered: 'bg-purple-100 text-purple-700',
    cancelled: 'bg-red-100 text-red-700'
  }

  const buildSavedCommentsForSubmit = useCallback((customDesignImageBase64?: string) => {
    let allSavedComments = [...formData.savedDesignComments]
    const hasCurrentPayload = formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0

    if (!hasCurrentPayload) {
      return allSavedComments
    }

    const currentView = annotationRef.current?.getCurrentView() || 'front'
    const viewLabel = currentView === 'front' ? 'أمام' : 'خلف'

    // البحث عن slot العرض الحالي وتحديثه أو إنشاؤه
    const existingSlotIndex = allSavedComments.findIndex(c => {
      const v = c.view ?? (c.title?.trim().startsWith('أمام') ? 'front' : c.title?.trim().startsWith('خلف') ? 'back' : null)
      return v === currentView
    })

    if (existingSlotIndex >= 0) {
      allSavedComments = [...allSavedComments]
      allSavedComments[existingSlotIndex] = {
        ...allSavedComments[existingSlotIndex],
        annotations: formData.imageAnnotations,
        drawings: formData.imageDrawings,
        image: customDesignImageBase64 || (allSavedComments[existingSlotIndex].image || null),
        view: currentView,
        timestamp: Date.now()
      }
      return allSavedComments
    }

    return [...allSavedComments, {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      annotations: formData.imageAnnotations,
      drawings: formData.imageDrawings,
      image: customDesignImageBase64 || null,
      title: viewLabel,
      view: currentView
    }]
  }, [formData.imageAnnotations, formData.imageDrawings, formData.savedDesignComments])

  // إرسال النموذج
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الحقول المطلوبة
    // السعر مطلوب فقط للفساتين الخارجية (عدم وجود effectiveOrderId)
    if (!formData.clientName || !formData.clientPhone || !formData.alterationDueDate || (!effectiveOrderId && !formData.price)) {
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }

    if (!formData.errorType) {
      toast.error(isArabic ? 'يرجى تحديد سبب التعديل' : 'Please select the reason for alteration')
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
      // للفساتين الداخلية (effectiveOrderId موجود)، السعر يكون 0
      const price = effectiveOrderId ? 0 : Number(formData.price)
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

      const allSavedComments = buildSavedCommentsForSubmit(customDesignImageBase64)

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
          error_type: formData.errorType as AlterationErrorType || null,
          error_notes: formData.errorNotes || null,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
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

        // تحديث عداد التعديلات في الطلب الأصلي
        if (effectiveOrderId) {
          await alterationService.syncOrderAlterationCount(effectiveOrderId)
        }

        toast.success(isArabic ? 'تم تحديث طلب التعديل بنجاح!' : 'Alteration updated successfully!')
        router.push('/dashboard/alterations')
      } else {
        // وضع الإضافة
        const result = await alterationService.create({
          alteration_number: formData.alterationNumber && formData.alterationNumber.trim() !== '' ? formData.alterationNumber.trim() : undefined,
          original_order_id: effectiveOrderId || undefined,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          price: price,
          payment_method: formData.paymentMethod,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate,
          error_type: formData.errorType as AlterationErrorType || undefined,
          error_notes: formData.errorNotes || undefined,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
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

        // تحديث عداد التعديلات في الطلب الأصلي
        if (effectiveOrderId) {
          await alterationService.syncOrderAlterationCount(effectiveOrderId)
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
    if (!formData.clientName || !formData.clientPhone || !formData.alterationDueDate || (!effectiveOrderId && !formData.price)) {
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }

    if (!formData.errorType) {
      toast.error(isArabic ? 'يرجى تحديد سبب التعديل' : 'Please select the reason for alteration')
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
      const price = effectiveOrderId ? 0 : Number(formData.price)
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

      const allSavedComments = buildSavedCommentsForSubmit(customDesignImageBase64)

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
          error_type: formData.errorType as AlterationErrorType || null,
          error_notes: formData.errorNotes || null,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
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

        if (effectiveOrderId) await alterationService.syncOrderAlterationCount(effectiveOrderId)
        toast.success(isArabic ? 'تم تحديث طلب التعديل بنجاح!' : 'Alteration updated successfully!')
      } else {
        // وضع الإضافة
        result = await alterationService.create({
          alteration_number: formData.alterationNumber && formData.alterationNumber.trim() !== '' ? formData.alterationNumber.trim() : undefined,
          original_order_id: effectiveOrderId || undefined,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          price: price,
          payment_method: formData.paymentMethod,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate,
          error_type: formData.errorType as AlterationErrorType || undefined,
          error_notes: formData.errorNotes || undefined,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
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

        if (effectiveOrderId) await alterationService.syncOrderAlterationCount(effectiveOrderId)
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

  // رسم الخطوط على canvas عند توسيع تعليق في العرض للقراءة فقط
  useEffect(() => {
    if (!expandedROCommentId) return
    const comment = roSavedDesignComments.find(c => c.id === expandedROCommentId)
    if (!comment || !comment.drawings || comment.drawings.length === 0) return
    const timer = setTimeout(() => {
      const canvas = roCanvasRefs.current.get(expandedROCommentId)
      if (canvas) { void drawROPathsOnCanvas(canvas, comment.drawings || []) }
    }, 100)
    return () => clearTimeout(timer)
  }, [expandedROCommentId, roSavedDesignComments])

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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                  dir="ltr"
                />
              </div>

              {/* 1.4. موعد تسليم التعديل */}
              <div>
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

              {/* 1.5. السعر - يظهر فقط للتعديلات الخارجية */}
              {!effectiveOrderId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isArabic ? 'سعر التعديل (ر.س)' : 'Alteration Price (SAR)'} <span className="text-red-500">*</span>
                  </label>
                  <NumericInput
                    type="price"
                    value={formData.price}
                    onChange={(value) => handleInputChange('price', value)}
                    placeholder={isArabic ? 'أدخل السعر' : 'Enter price'}
                    required
                  />
                </div>
              )}

              {/* 1.6. المبلغ المدفوع - يظهر فقط للتعديلات الخارجية */}
              {!effectiveOrderId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isArabic ? 'المبلغ المدفوع (ر.س)' : 'Paid Amount (SAR)'}
                  </label>
                  <NumericInput
                    type="price"
                    value={formData.paidAmount}
                    onChange={(value) => handleInputChange('paidAmount', value)}
                    placeholder={isArabic ? 'أدخل المبلغ المدفوع' : 'Enter paid amount'}
                  />
                </div>
              )}
            </div>

            {/* 1.7. المبلغ المتبقي - يظهر فقط للتعديلات الخارجية */}
            {!effectiveOrderId && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isArabic ? 'المبلغ المتبقي (ر.س)' : 'Remaining Amount (SAR)'}
                </label>
                <div className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                  {remainingAmount.toFixed(2)}
                </div>
              </div>
            )}
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
              notes={formData.notes}
              voiceNotes={formData.voiceNotes}
              onNotesChange={(notes) => handleInputChange('notes', notes)}
              onVoiceNotesChange={handleVoiceNotesChange}
            />

            {/* زر الكاميرا - إضافة صورة التعديل */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isSubmitting || isCameraUploading}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-300 text-green-700 rounded-lg hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCameraUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">{isArabic ? 'جاري رفع الصورة...' : 'Uploading...'}</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span className="text-sm font-medium">{isArabic ? 'إضافة صورة من الكاميرا' : 'Add Photo from Camera'}</span>
                  </>
                )}
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />
            </div>

            {/* معرض صور التعديل */}
            {formData.alterationPhotos.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {isArabic ? 'صور التعديل' : 'Alteration Photos'} ({formData.alterationPhotos.length})
                </p>
                <div className="flex flex-wrap gap-3">
                  {formData.alterationPhotos.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        alt={`alteration-photo-${idx + 1}`}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          alterationPhotos: prev.alterationPhotos.filter((_, i) => i !== idx)
                        }))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* 3. سبب التعديل */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-pink-500" />
              {isArabic ? 'سبب التعديل' : 'Reason for Alteration'}
              <span className="text-red-500 text-sm font-normal mr-1">*</span>
            </h2>

            {/* خيارات سبب الخطأ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5" dir="rtl">
              {(
                [
                  { value: 'tailor_error',      label: 'خطأ الخياط',      color: 'red' },
                  { value: 'cutter_error',       label: 'خطأ القصاص',     color: 'orange' },
                  { value: 'measurement_error',  label: 'خطأ قياس',       color: 'yellow' },
                  { value: 'customer_error',     label: 'خطأ زبونة',      color: 'blue' },
                  { value: 'reception_error',    label: 'خطأ الاستقبال',  color: 'purple' },
                  { value: 'other_error',        label: 'خطأ آخر',        color: 'gray' },
                ] as const
              ).map(({ value, label, color }) => {
                const isSelected = formData.errorType === value
                const colorMap: Record<string, string> = {
                  red:    isSelected ? 'border-red-500 bg-red-50 text-red-700'       : 'border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-700',
                  orange: isSelected ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700',
                  yellow: isSelected ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 text-gray-700',
                  blue:   isSelected ? 'border-blue-500 bg-blue-50 text-blue-700'    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700',
                  purple: isSelected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50 text-gray-700',
                  gray:   isSelected ? 'border-gray-500 bg-gray-100 text-gray-700'   : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50 text-gray-700',
                }
                const dotMap: Record<string, string> = {
                  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
                  blue: 'bg-blue-500', purple: 'bg-purple-500', gray: 'bg-gray-500'
                }
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, errorType: value }))}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all ${colorMap[color]}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isSelected ? dotMap[color] : 'bg-gray-300'}`} />
                    {label}
                    {isSelected && (
                      <span className="mr-auto text-xs font-bold">✓</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ملاحظات عن الخطأ - اختيارية */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isArabic ? 'ملاحظات عن الخطأ' : 'Error Notes'}
                <span className="text-gray-400 font-normal mr-2 text-xs">({isArabic ? 'اختياري' : 'Optional'})</span>
              </label>
              <textarea
                value={formData.errorNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, errorNotes: e.target.value }))}
                placeholder={isArabic ? 'أضف ملاحظات إضافية حول سبب التعديل...' : 'Add additional notes about the error...'}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                dir="rtl"
              />
            </div>
          </motion.div>

          {/* زر عرض تفاصيل الفستان - للتعديلات الداخلية فقط */}
          {effectiveOrderId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <button
                type="button"
                onClick={() => setShowDressDetails(prev => !prev)}
                className="w-full flex items-center justify-between px-6 py-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-pink-300 hover:bg-pink-50 transition-all group"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-pink-500" />
                  <span className="font-semibold text-gray-800">
                    {isArabic ? 'عرض تفاصيل الفستان' : 'Show Dress Details'}
                  </span>
                  {(roSavedDesignComments.length > 0 || roImageAnnotations.length > 0 || (originalOrder?.images?.length ?? 0) > 0 || (originalOrder?.measurements && Object.values(originalOrder.measurements).some(v => v !== undefined && v !== null && v !== ''))) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-700">
                      {isArabic ? 'يحتوي بيانات' : 'Has data'}
                    </span>
                  )}
                </div>
                {showDressDetails
                  ? <ChevronUp className="w-5 h-5 text-gray-400 group-hover:text-pink-500 transition-colors" />
                  : <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-pink-500 transition-colors" />
                }
              </button>
            </motion.div>
          )}

          {/* 4 & 5. للتعديلات الخارجية: تعليقات التصميم وصور التصميم قابلة للتعديل */}
          {!effectiveOrderId && (
            <>
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
                  imageSrc="/front2.png"
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
            </>
          )}

          {/* للتعديلات الداخلية: عرض تفاصيل الفستان للقراءة فقط */}
          {effectiveOrderId && showDressDetails && originalOrder && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-6"
            >
              {/* أ. المعلومات الأساسية للطلب */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-pink-500" />
                  معلومات الطلب الأصلي
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {originalOrder.order_number && (
                    <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-100">
                      <p className="text-xs text-gray-500 mb-1">رقم الطلب</p>
                      <p className="font-semibold text-gray-800 text-sm">{originalOrder.order_number}</p>
                    </div>
                  )}
                  <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-100">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> اسم الزبونة</p>
                    <p className="font-semibold text-gray-800 text-sm">{originalOrder.client_name}</p>
                  </div>
                  {originalOrder.client_phone && (
                    <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-100">
                      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> رقم الهاتف</p>
                      <p className="font-semibold text-gray-800 text-sm" dir="ltr">{originalOrder.client_phone}</p>
                    </div>
                  )}
                  {originalOrder.due_date && (
                    <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-100">
                      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> موعد التسليم</p>
                      <p className="font-semibold text-gray-800 text-sm">{formatOrderDate(originalOrder.due_date)}</p>
                    </div>
                  )}
                  {originalOrder.fabric && (
                    <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-100">
                      <p className="text-xs text-gray-500 mb-1">القماش</p>
                      <p className="font-semibold text-gray-800 text-sm">{originalOrder.fabric}</p>
                    </div>
                  )}
                  <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-100">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> الحالة</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[originalOrder.status] || 'bg-gray-100 text-gray-700'}`}>
                      {statusLabels[originalOrder.status] || originalOrder.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* ب. تعليقات التصميم (قراءة فقط) */}
              {(roSavedDesignComments.length > 0 || roImageAnnotations.length > 0 || roImageDrawings.length > 0 || roCustomDesignImage) && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-pink-500" />
                    تعليقات التصميم
                    {roSavedDesignComments.length > 0 && (
                      <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full">
                        {roSavedDesignComments.length} تعليق
                      </span>
                    )}
                  </h2>

                  {/* التعليقات المتعددة */}
                  {roSavedDesignComments.length > 0 && (
                    <div className="space-y-4">
                      {roSavedDesignComments.map((comment, commentIndex) => (
                        <div key={comment.id} className="bg-white rounded-xl border-2 border-pink-100 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedROCommentId(expandedROCommentId === comment.id ? null : comment.id)}
                            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-pink-50 to-purple-50 hover:from-pink-100 hover:to-purple-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {commentIndex + 1}
                              </div>
                              <span className="font-medium text-gray-800">
                                {comment.title
                                  ? comment.title.replace(/^أمام/, 'الأمام').replace(/^خلف/, 'الخلف')
                                  : `تعليق ${commentIndex + 1}`}
                              </span>
                            </div>
                            <motion.div
                              animate={{ rotate: expandedROCommentId === comment.id ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown className="w-5 h-5 text-gray-500" />
                            </motion.div>
                          </button>

                          {expandedROCommentId === comment.id && (
                            <div className="p-4 space-y-4">
                              {/* صورة التعليق */}
                              <div className="relative rounded-xl overflow-hidden border border-pink-200">
                                {comment.compositeImage ? (
                                  <img
                                    src={comment.compositeImage}
                                    alt={`تصميم ${comment.title || commentIndex + 1}`}
                                    className="w-full h-auto"
                                  />
                                ) : (
                                  <>
                                    <img
                                      src={resolveROCommentImageSrc(comment)}
                                      alt={`تصميم ${comment.title || commentIndex + 1}`}
                                      className="w-full h-auto"
                                      onLoad={() => {
                                        const canvas = roCanvasRefs.current.get(comment.id)
                                        if (canvas && comment.drawings && comment.drawings.length > 0) {
                                          void drawROPathsOnCanvas(canvas, comment.drawings)
                                        }
                                      }}
                                    />
                                    {comment.drawings && comment.drawings.length > 0 && (
                                      <canvas
                                        ref={(el) => {
                                          if (el) {
                                            roCanvasRefs.current.set(comment.id, el)
                                            void drawROPathsOnCanvas(el, comment.drawings || [])
                                          }
                                        }}
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                      />
                                    )}
                                    {comment.annotations?.map((annotation, idx) => (
                                      <div
                                        key={annotation.id}
                                        className="absolute transform -translate-x-1/2 -translate-y-1/2"
                                        style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                                      >
                                        <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white">
                                          {idx + 1}
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>

                              {/* تعليقات الصوت */}
                              {comment.annotations && comment.annotations.length > 0 && (
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                                    {comment.annotations.length} تعليق صوتي
                                  </h4>
                                  <div className="space-y-2">
                                    {comment.annotations.map((annotation, idx) => (
                                      <div key={annotation.id} className="bg-white rounded-lg p-2 border border-gray-100">
                                        <div className="flex items-start gap-2">
                                          <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                            {idx + 1}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            {annotation.transcription && (
                                              <p className="text-sm text-gray-700">{annotation.transcription}</p>
                                            )}
                                            {annotation.translatedText && (
                                              <div className="mt-1.5 bg-purple-50 border border-purple-200 rounded-lg p-2">
                                                <p className="text-xs text-purple-600 font-medium mb-0.5">الترجمة</p>
                                                <p className="text-sm text-gray-600" dir="auto">{annotation.translatedText}</p>
                                              </div>
                                            )}
                                          </div>
                                          {annotation.audioData && (
                                            <button
                                              type="button"
                                              onClick={() => toggleROAudio(annotation)}
                                              className={`p-1.5 rounded transition-colors flex-shrink-0 ${playingROAudioId === annotation.id ? 'bg-green-500 text-white' : 'text-green-600 hover:bg-green-50'}`}
                                            >
                                              {playingROAudioId === annotation.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* التعليق القديم (توافق مع البيانات القديمة) */}
                  {roSavedDesignComments.length === 0 && (roImageAnnotations.length > 0 || roImageDrawings.length > 0 || roCustomDesignImage) && (
                    <div className="relative rounded-xl overflow-hidden border-2 border-pink-200 bg-white">
                      <div className="relative">
                        <img
                          src={roCustomDesignImage || '/front2.png'}
                          alt="تصميم الفستان"
                          className="w-full h-auto"
                          onLoad={() => {
                            if (roCanvasRef.current && roImageDrawings.length > 0) {
                              void drawROPathsOnCanvas(roCanvasRef.current, roImageDrawings)
                            }
                          }}
                        />
                        {roImageDrawings.length > 0 && (
                          <canvas ref={roCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                        )}
                        {roImageAnnotations.map((annotation, index) => (
                          <div
                            key={annotation.id}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                          >
                            <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ج. صور التصميم (قراءة فقط) */}
              {originalOrder.images && originalOrder.images.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-pink-500" />
                    صور التصميم
                    <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full">
                      {originalOrder.images.length}
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {originalOrder.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <div className="rounded-lg overflow-hidden border border-pink-200 aspect-square">
                          <img
                            src={image}
                            alt={`صورة التصميم ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute bottom-2 left-2 bg-pink-600/80 text-white text-xs px-2 py-1 rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* د. المقاسات (قراءة فقط) */}
              {originalOrder.measurements && Object.values(originalOrder.measurements).some(v => v !== undefined && v !== null && v !== '') && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-pink-500" />
                    المقاسات (سم)
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {MEASUREMENT_ORDER.filter(key => key !== 'additional_notes').map((key) => {
                      const value = (originalOrder.measurements as any)?.[key]
                      if (!value) return null
                      return (
                        <div key={key} className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                          <p className="text-xs text-gray-600 mb-1">{getMeasurementLabelWithSymbol(key as any)}</p>
                          <p className="text-lg font-bold text-gray-800">{value}</p>
                        </div>
                      )
                    })}
                  </div>
                  {(originalOrder.measurements as any)?.additional_notes && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b border-pink-200 pb-2">ملاحظات المقاسات</h4>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{(originalOrder.measurements as any)?.additional_notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

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
