'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import { useFormPersistence } from '@/hooks/useFormPersistence'
import ProtectedRoute from '@/components/ProtectedRoute'
import ImageUpload from '@/components/ImageUpload'
import InteractiveImageAnnotation, { ImageAnnotation, DrawingPath, SavedDesignComment, InteractiveImageAnnotationRef } from '@/components/InteractiveImageAnnotation'
import NumericInput from '@/components/NumericInput'
import DatePickerWithStats from '@/components/DatePickerWithStats'
import DatePickerForProof from '@/components/DatePickerForProof'
import UnifiedNotesInput from '@/components/UnifiedNotesInput'
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
  Image as ImageIcon,
  MessageCircle,
  Users,
  RotateCcw,
  Info
} from 'lucide-react'
import { useAppResume } from '@/hooks/useAppResume'
import { openWhatsApp } from '@/utils/whatsapp'

// مفتاح localStorage للحفظ التلقائي
const FORM_STORAGE_KEY = 'add-order-form-draft'
const DESIGN_COMMENTS_STORAGE_KEY = 'add-order-design-comments-v1'
const DESIGN_ACTIVE_VIEW_STORAGE_KEY = 'add-order-design-active-view'

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

// نوع بيانات النموذج
interface FormDataType {
  orderNumber: string
  clientName: string
  clientPhone: string
  description: string
  fabric: string
  price: string
  paidAmount: string
  paymentMethod: 'cash' | 'card'
  orderReceivedDate: string
  assignedWorker: string
  dueDate: string
  proofDeliveryDate: string
  notes: string
  voiceNotes: Array<{
    id: string
    data: string
    timestamp: number
    duration?: number
    transcription?: string
    translatedText?: string
    translationLanguage?: string
  }>
  images: string[]
  imageAnnotations: ImageAnnotation[]
  imageDrawings: DrawingPath[]
  customDesignImage: string | null // legacy فقط؛ لا نخزن base64 جديداً في state
  savedDesignComments: SavedDesignComment[]
}

// القيم الأولية للنموذج
const getInitialFormData = (): FormDataType => ({
  orderNumber: '',
  clientName: '',
  clientPhone: '',
  description: '',
  fabric: '',
  price: '',
  paidAmount: '',
  paymentMethod: 'cash',
  orderReceivedDate: new Date().toISOString().split('T')[0],
  assignedWorker: '',
  dueDate: '',
  proofDeliveryDate: '',
  notes: '',
  voiceNotes: [],
  images: [],
  imageAnnotations: [],
  imageDrawings: [],
  customDesignImage: null,
  savedDesignComments: []
})

// دالة للتحقق من أن البيانات فارغة
const isFormDataEmpty = (data: FormDataType): boolean => {
  return (
    !data.clientName &&
    !data.clientPhone &&
    !data.description &&
    !data.fabric &&
    !data.price &&
    !data.paidAmount &&
    !data.dueDate &&
    !data.proofDeliveryDate &&
    !data.notes &&
    data.voiceNotes.length === 0 &&
    data.images.length === 0 &&
    data.imageAnnotations.length === 0 &&
    data.imageDrawings.length === 0 &&
    !data.customDesignImage &&
    data.savedDesignComments.length === 0
  )
}

async function compressFileForStorage(file: File, maxDim: number = 1920): Promise<Blob> {
  // على Android، ملفات الكاميرا مدعومة بـ content:// URI قد يصبح غير مستقر
  // بعد عودة WebView من camera intent. نقرأ الملف بالكامل إلى الذاكرة أولاً.
  let safeBlob: Blob = file
  const isAndroid = /android/i.test(navigator.userAgent)
  if (isAndroid) {
    try {
      const buffer = await file.arrayBuffer()
      safeBlob = new Blob([buffer], { type: file.type || 'image/jpeg' })
    } catch {
      // fallback: استخدام الملف الأصلي
      safeBlob = file
    }
  }

  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(safeBlob)
    const image = new window.Image()

    image.onload = () => {
      URL.revokeObjectURL(sourceUrl)

      let width = image.naturalWidth
      let height = image.naturalHeight

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas failed'))
        return
      }

      ctx.drawImage(image, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          canvas.width = 0
          canvas.height = 0
          if (!blob) {
            reject(new Error('Blob failed'))
            return
          }
          resolve(blob)
        },
        'image/jpeg',
        0.85
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('Image load failed'))
    }

    image.src = sourceUrl
  })
}

function AddOrderContent() {
  const { user } = useAuthStore()
  const { createOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()

  // استخدام hook الحفظ التلقائي
  const {
    data: formData,
    setData: setFormData,
    clearSavedData,
    hasRestoredData,
    resetToInitial
  } = useFormPersistence<FormDataType>({
    key: FORM_STORAGE_KEY,
    initialData: getInitialFormData(),
    debounceMs: 1000,
    isDataEmpty: isFormDataEmpty,
    // استبعاد الحقول الكبيرة (الصور والملاحظات الصوتية) من الحفظ التلقائي
    // لتجنب تجاوز حد localStorage
    excludeFields: ['images', 'customDesignImage', 'voiceNotes', 'savedDesignComments']
  })

  // حالة لتتبع ملف الصورة المخصصة (File object لا يمكن حفظه في localStorage)
  const [customDesignImageFile, setCustomDesignImageFile] = useState<File | null>(null)

  // ref للوصول إلى دوال InteractiveImageAnnotation
  const annotationRef = useRef<InteractiveImageAnnotationRef>(null)

  // تحميل العمال عند تحميل الصفحة
  useEffect(() => {
    loadWorkers()
  }, [loadWorkers])

  // Re-fetch workers when the app resumes from background (mobile)
  useAppResume(() => {
    loadWorkers()
  })

  // إظهار رسالة عند استرجاع البيانات المحفوظة
  useEffect(() => {
    if (hasRestoredData) {
      toast.success(
        isArabic
          ? 'تم استرجاع البيانات المحفوظة من الجلسة السابقة'
          : 'Restored saved data from previous session',
        {
          icon: '📂',
          duration: 4000,
        }
      )
    }
  }, [hasRestoredData, isArabic])

  // حفظ واسترجاع تعليقات التصميم في localStorage منفصل (بدون compositeImage لتوفير المساحة)
  const [hasLoadedComments, setHasLoadedComments] = useState(false)

  // حالة العرض النشط (أمام/خلف) - لاستعادتها عند العودة للصفحة
  const [restoredActiveView, setRestoredActiveView] = useState<'front' | 'back' | undefined>(undefined)

  useEffect(() => {
    // الانتظار حتى يتم تهيئة formData من useFormPersistence
    // ثم استرجاع التعليقات المحفوظة والعرض النشط
    if (hasLoadedComments) return

    // تأخير بسيط للسماح لـ useFormPersistence بالتنفيذ أولاً
    const timer = setTimeout(() => {
      try {
        const savedCommentsJson = localStorage.getItem(DESIGN_COMMENTS_STORAGE_KEY)
        if (savedCommentsJson) {
          const savedComments = JSON.parse(savedCommentsJson) as SavedDesignComment[]
          if (savedComments.length > 0) {
            setFormData(prev => ({
              ...prev,
              savedDesignComments: savedComments
            }))
            console.log(`📂 Restored ${savedComments.length} design comments from localStorage`)
          }
        }
      } catch (error) {
        console.error('Error restoring design comments:', error)
        localStorage.removeItem(DESIGN_COMMENTS_STORAGE_KEY)
      }

      // استرجاع العرض النشط الأخير (أمام/خلف)
      try {
        const savedView = localStorage.getItem(DESIGN_ACTIVE_VIEW_STORAGE_KEY) as 'front' | 'back' | null
        if (savedView === 'front' || savedView === 'back') {
          setRestoredActiveView(savedView)
          console.log(`📂 Restored active design view: ${savedView}`)
        }
      } catch (error) {
        console.error('Error restoring active view:', error)
      }

      setHasLoadedComments(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [hasLoadedComments, setFormData])

  // حفظ التعليقات عند تغييرها (بدون compositeImage)
  useEffect(() => {
    // لا تحفظ/تحذف قبل تحميل التعليقات المحفوظة من localStorage
    // لتجنب حالة السباق حيث يتم حذف التعليقات قبل استرجاعها
    if (!hasLoadedComments) return

    if (formData.savedDesignComments.length > 0) {
      try {
        // إزالة compositeImage من التعليقات قبل الحفظ لتوفير المساحة
        const commentsWithoutComposite = formData.savedDesignComments.map(comment => {
          const { compositeImage, ...rest } = comment as any
          return rest
        })
        localStorage.setItem(DESIGN_COMMENTS_STORAGE_KEY, JSON.stringify(commentsWithoutComposite))
        console.log(`💾 Saved ${formData.savedDesignComments.length} design comments to localStorage`)
      } catch (error) {
        console.error('Error saving design comments:', error)
      }
    } else {
      // حذف التعليقات من localStorage إذا كانت فارغة
      localStorage.removeItem(DESIGN_COMMENTS_STORAGE_KEY)
    }
  }, [formData.savedDesignComments, hasLoadedComments])

  // رسالة تحذيرية عند محاولة إغلاق الصفحة مع بيانات غير محفوظة
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // التحقق من وجود بيانات غير محفوظة
      const hasUnsavedData = !isFormDataEmpty(formData)

      if (hasUnsavedData) {
        // رسالة التحذير
        const message = isArabic
          ? 'لديك بيانات غير محفوظة. هل أنت متأكد من الخروج?'
          : 'You have unsaved data. Are you sure you want to leave?'

        e.preventDefault()
        e.returnValue = message // للمتصفحات القديمة
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [formData, isArabic])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

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
  }, [setFormData])

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
  }, [setFormData])

  // معالجة تغيير التعليقات على الصورة
  const handleImageAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    setFormData(prev => ({
      ...prev,
      imageAnnotations: annotations
    }))
  }, [setFormData])

  // معالجة تغيير الرسومات على الصورة
  const handleImageDrawingsChange = useCallback((drawings: DrawingPath[]) => {
    setFormData(prev => ({
      ...prev,
      imageDrawings: drawings
    }))
  }, [setFormData])

  // معالجة تغيير صورة التصميم المخصصة
  const handleDesignImageChange = useCallback((image: File | null) => {
    // حفظ ملف الصورة للاستخدام في الإرسال
    setCustomDesignImageFile(image)

    // لا نخزن base64 ضخم في React state لتجنب الضغط على الذاكرة وإعادة الرسم
    setFormData(prev => ({
      ...prev,
      customDesignImage: null
    }))
  }, [setFormData])

  // معالجة تغيير التعليقات المحفوظة
  const handleSavedCommentsChange = useCallback((comments: SavedDesignComment[]) => {
    setFormData(prev => ({
      ...prev,
      savedDesignComments: comments
    }))
  }, [setFormData])

  // معالجة تغيير العرض النشط (أمام/خلف) - لحفظه في localStorage
  const handleViewChange = useCallback((view: 'front' | 'back') => {
    try {
      localStorage.setItem(DESIGN_ACTIVE_VIEW_STORAGE_KEY, view)
    } catch (error) {
      console.error('Error saving active view:', error)
    }
  }, [])

  // مسح جميع الحقول
  const handleClearAllFields = useCallback(() => {
    resetToInitial()
    setCustomDesignImageFile(null)
    // حذف تعليقات التصميم والعرض النشط من localStorage
    localStorage.removeItem(DESIGN_COMMENTS_STORAGE_KEY)
    localStorage.removeItem(DESIGN_ACTIVE_VIEW_STORAGE_KEY)
    setHasLoadedComments(false)
    setRestoredActiveView(undefined)
    toast.success(
      isArabic ? 'تم مسح جميع الحقول' : 'All fields cleared',
      { icon: '🗑️', duration: 2000 }
    )
  }, [resetToInitial, isArabic])

  // إرسال النموذج
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الحقول المطلوبة (رقم الطلب اختياري - سيتم توليده تلقائياً)
    if (!formData.clientName || !formData.clientPhone || !formData.dueDate || !formData.price) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      console.log('📦 Submitting order...')

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

      // استخدام الصورة المحفوظة في localStorage (base64) أو تحويل ملف الصورة
      let customDesignImageBase64: string | undefined = undefined

      // إذا كانت الصورة محفوظة كـ base64 في formData
      if (formData.customDesignImage) {
        customDesignImageBase64 = formData.customDesignImage
        const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
        console.log(`📸 Using saved custom design image: ${imageSizeKB}KB`)

        // التحقق من الحجم (الحد الأقصى 10MB)
        if (imageSizeKB > 10 * 1024) {
          toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 10MB`)
          return
        }
      } else if (customDesignImageFile) {
        // ضغط ملف الصورة ثم تحويله إلى base64
        try {
          const compressedBlob = await compressFileForStorage(customDesignImageFile, 1920)
          const reader = new FileReader()
          customDesignImageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
            reader.readAsDataURL(compressedBlob)
          })
          const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
          console.log(`📸 Custom design image compressed and converted to base64: ${imageSizeKB}KB`)

          // التحقق من الحجم (الحد الأقصى 10MB)
          if (imageSizeKB > 10 * 1024) {
            toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 10MB`)
            return
          }
        } catch (imageError) {
          console.error('❌ Error converting image to base64:', imageError)
          toast.error('خطأ في تحويل الصورة')
          return
        }
      }

      // ملاحظة: payment_status و remaining_amount سيتم حسابهما تلقائياً بواسطة trigger في قاعدة البيانات

      // تجميع جميع التعليقات المحفوظة
      const allSavedComments = formData.savedDesignComments.map(comment => ({
        ...comment,
        image: comment.image?.startsWith('data:') ? 'custom' : (comment.image || null)
      }))

      // إذا كان هناك تعليق حالي غير محفوظ، نحفظه تلقائياً مع الصورة المركّبة
      if (formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0) {
        // إنشاء الصورة المركّبة باستخدام ref
        let compositeImage: string | null = null
        if (annotationRef.current) {
          compositeImage = await annotationRef.current.generateCompositeImage()
        }

        const currentView = annotationRef.current?.getCurrentView() || 'front'
        const viewTitle = getNextDesignViewTitle(currentView, allSavedComments)

        const currentComment: SavedDesignComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          annotations: formData.imageAnnotations,
          drawings: formData.imageDrawings,
          image: customDesignImageBase64 ? 'custom' : null,
          title: viewTitle,
          view: currentView,
          compositeImage: compositeImage // إضافة الصورة المركّبة
        }
        allSavedComments.push(currentComment)
      }

      // إنشاء الطلب باستخدام Supabase
      // رقم الطلب: إذا تم إدخاله يدوياً سيتم استخدامه، وإلا سيتم توليده تلقائياً من قاعدة البيانات
      const result = await createOrder({
        order_number: formData.orderNumber && formData.orderNumber.trim() !== '' ? formData.orderNumber.trim() : undefined,
        client_name: formData.clientName,
        client_phone: formData.clientPhone,
        description: formData.description,
        fabric: formData.fabric || undefined,
        measurements: {}, // المقاسات فارغة - سيتم إضافتها لاحقاً من صفحة الطلبات
        price: price,
        payment_method: formData.paymentMethod as 'cash' | 'card',
        order_received_date: formData.orderReceivedDate,
        worker_id: formData.assignedWorker && formData.assignedWorker !== '' ? formData.assignedWorker : undefined,
        due_date: formData.dueDate,
        proof_delivery_date: formData.proofDeliveryDate && formData.proofDeliveryDate !== '' ? formData.proofDeliveryDate : undefined,
        notes: formData.notes || undefined,
        voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
        voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
        images: formData.images.length > 0 ? formData.images : undefined,
        // استخدام البنية الجديدة للتعليقات المتعددة
        saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
        // للتوافق مع الكود القديم - سنحتفظ بهذه الحقول أيضاً
        image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
        image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined,
        custom_design_image: customDesignImageBase64,
        status: 'pending',
        paid_amount: paidAmount
        // payment_status سيتم حسابه تلقائياً بواسطة trigger
      })

      if (!result.success) {
        toast.error(result.error || t('order_add_error') || 'حدث خطأ أثناء إضافة الطلب', {
          icon: '✗',
        })
        return
      }

      console.log('✅ Order created successfully:', result.data?.id)

      // مسح البيانات المحفوظة من localStorage بعد النجاح
      clearSavedData()
      localStorage.removeItem(DESIGN_COMMENTS_STORAGE_KEY)
      localStorage.removeItem(DESIGN_ACTIVE_VIEW_STORAGE_KEY)

      // إظهار رسالة النجاح
      toast.success(t('order_added_success') || 'تم إضافة الطلب بنجاح', {
        icon: '✓',
        duration: 2000,
      })

      // التوجيه بعد 2 ثانية
      setTimeout(() => {
        router.push('/dashboard/orders')
      }, 2000)

    } catch (error) {
      console.error('❌ Error adding order:', error)
      toast.error(t('order_add_error') || 'حدث خطأ أثناء إضافة الطلب', {
        icon: '✗',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // حفظ الطلب وإرسال رسالة واتساب
  const handleSubmitAndSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault()

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
      console.log('📦 Submitting order and sending WhatsApp...')

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

      // استخدام الصورة المحفوظة في localStorage (base64) أو تحويل ملف الصورة
      let customDesignImageBase64: string | undefined = undefined

      // إذا كانت الصورة محفوظة كـ base64 في formData
      if (formData.customDesignImage) {
        customDesignImageBase64 = formData.customDesignImage
        const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
        console.log(`📸 Using saved custom design image: ${imageSizeKB}KB`)

        // التحقق من الحجم (الحد الأقصى 10MB)
        if (imageSizeKB > 10 * 1024) {
          toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 10MB`)
          return
        }
      } else if (customDesignImageFile) {
        // ضغط ملف الصورة ثم تحويله إلى base64
        try {
          const compressedBlob = await compressFileForStorage(customDesignImageFile, 1920)
          const reader = new FileReader()
          customDesignImageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (e) => reject(new Error(`Failed to read image: ${e}`))
            reader.readAsDataURL(compressedBlob)
          })
          const imageSizeKB = Math.round(customDesignImageBase64.length / 1024)
          console.log(`📸 Custom design image compressed and converted to base64: ${imageSizeKB}KB`)

          // التحقق من الحجم (الحد الأقصى 10MB)
          if (imageSizeKB > 10 * 1024) {
            toast.error(`حجم الصورة كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى هو 10MB`)
            return
          }
        } catch (imageError) {
          console.error('❌ Error converting image to base64:', imageError)
          toast.error('خطأ في تحويل الصورة')
          return
        }
      }

      // تجميع جميع التعليقات المحفوظة
      const allSavedComments = formData.savedDesignComments.map(comment => ({
        ...comment,
        image: comment.image?.startsWith('data:') ? 'custom' : (comment.image || null)
      }))

      // إذا كان هناك تعليق حالي غير محفوظ، نحفظه تلقائياً مع الصورة المركّبة
      if (formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0) {
        // إنشاء الصورة المركّبة باستخدام ref
        let compositeImage: string | null = null
        if (annotationRef.current) {
          compositeImage = await annotationRef.current.generateCompositeImage()
        }

        const currentView = annotationRef.current?.getCurrentView() || 'front'
        const viewTitle = getNextDesignViewTitle(currentView, allSavedComments)

        const currentComment: SavedDesignComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          annotations: formData.imageAnnotations,
          drawings: formData.imageDrawings,
          image: customDesignImageBase64 ? 'custom' : null,
          title: viewTitle,
          view: currentView,
          compositeImage: compositeImage // إضافة الصورة المركّبة
        }
        allSavedComments.push(currentComment)
      }

      // إنشاء الطلب باستخدام Supabase
      const result = await createOrder({
        order_number: formData.orderNumber && formData.orderNumber.trim() !== '' ? formData.orderNumber.trim() : undefined,
        client_name: formData.clientName,
        client_phone: formData.clientPhone,
        description: formData.description,
        fabric: formData.fabric || undefined,
        measurements: {},
        price: price,
        payment_method: formData.paymentMethod as 'cash' | 'card',
        order_received_date: formData.orderReceivedDate,
        worker_id: formData.assignedWorker && formData.assignedWorker !== '' ? formData.assignedWorker : undefined,
        due_date: formData.dueDate,
        proof_delivery_date: formData.proofDeliveryDate && formData.proofDeliveryDate !== '' ? formData.proofDeliveryDate : undefined,
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

      if (!result.success) {
        toast.error(result.error || t('order_add_error') || 'حدث خطأ أثناء إضافة الطلب', {
          icon: '✗',
        })
        return
      }

      console.log('✅ Order created successfully:', result.data?.id)

      // مسح البيانات المحفوظة من localStorage بعد النجاح
      clearSavedData()
      localStorage.removeItem(DESIGN_COMMENTS_STORAGE_KEY)
      localStorage.removeItem(DESIGN_ACTIVE_VIEW_STORAGE_KEY)

      // إظهار رسالة النجاح
      toast.success(t('order_added_success') || 'تم إضافة الطلب بنجاح', {
        icon: '✓',
        duration: 2000,
      })

      // فتح واتساب مع الرسالة المجهزة
      try {
        openWhatsApp({
          clientName: formData.clientName,
          clientPhone: formData.clientPhone,
          orderNumber: formData.orderNumber || result.data?.order_number || undefined,
          proofDeliveryDate: formData.proofDeliveryDate || undefined,
          dueDate: formData.dueDate
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
        router.push('/dashboard/orders')
      }, 3000)

    } catch (error) {
      console.error('❌ Error adding order:', error)
      toast.error(t('order_add_error') || 'حدث خطأ أثناء إضافة الطلب', {
        icon: '✗',
      })
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
            className={`mb-8 p-4 rounded-lg flex items-center space-x-3 space-x-reverse max-w-4xl mx-auto ${message.type === 'success'
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
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <User className="w-5 h-5 text-pink-600" />
                  <span>{t('basic_information')}</span>
                </h3>

                {/* زر مسح جميع الحقول - يظهر فقط عند استرجاع بيانات محفوظة */}
                {hasRestoredData && (
                  <button
                    type="button"
                    onClick={handleClearAllFields}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all duration-200"
                    title={isArabic ? 'مسح جميع الحقول والبدء من جديد' : 'Clear all fields and start fresh'}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{isArabic ? 'مسح جميع الحقول' : 'Clear All Fields'}</span>
                  </button>
                )}
              </div>

              {/* رسالة تنبيه عند استرجاع البيانات */}
              {hasRestoredData && (
                <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    {isArabic
                      ? 'تم استرجاع بياناتك النصية من الجلسة السابقة (معلومات العميل، التواريخ، الملاحظات). الصور والملاحظات الصوتية لا تُحفظ تلقائياً.'
                      : 'Restored your text data from previous session (client info, dates, notes). Images and voice notes are not auto-saved.'}
                  </p>
                </div>
              )}

              {/* رسالة تنبيه عامة عن الحفظ التلقائي */}


              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {/* الصف الأول: اسم العميل | رقم الهاتف | رقم الطلب */}

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

                {/* 3. رقم الطلب */}
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

                {/* الصف الثاني: موعد التسليم | موعد تسليم البروفا | تاريخ استلام الطلب */}

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

                {/* 5. موعد تسليم البروفا - تقويم أخضر */}
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
                imageSrc="/front2.png"
                annotations={formData.imageAnnotations}
                onAnnotationsChange={handleImageAnnotationsChange}
                drawings={formData.imageDrawings}
                onDrawingsChange={handleImageDrawingsChange}
                customImage={customDesignImageFile}
                onImageChange={handleDesignImageChange}
                disabled={isSubmitting}
                savedComments={formData.savedDesignComments}
                onSavedCommentsChange={handleSavedCommentsChange}
                showSaveButton={true}
                currentImageBase64={formData.customDesignImage}
                initialView={restoredActiveView}
                onViewChange={handleViewChange}
              />
            </div>

            {/* صور التصميم */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100 relative z-20">
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
                <ImageIcon className="w-5 h-5 text-pink-600" />
                <span>{t('design_images')}</span>
              </h3>

              <ImageUpload
                images={formData.images}
                onImagesChange={(images) => handleInputChange('images', images)}
                maxImages={999}
                acceptVideo={true}
                alwaysShowDeleteOnMobileAndTablet={true}
              />
            </div>

            {/* ملاحظات إضافية */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-pink-100">
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center space-x-2 space-x-reverse">
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
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/* زر حفظ الطلب العادي */}
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

              {/* زر حفظ الطلب وإرسال واتساب */}
              <button
                type="button"
                onClick={handleSubmitAndSendWhatsApp}
                disabled={isSubmitting || !formData.clientPhone}
                className="bg-green-600 hover:bg-green-700 text-white py-4 px-8 text-lg rounded-lg font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 space-x-reverse"
                title={!formData.clientPhone ? 'يجب إدخال رقم هاتف العميل أولاً' : ''}
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2 space-x-reverse">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('saving')}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2 space-x-reverse">
                    <MessageCircle className="w-5 h-5" />
                    <span>{isArabic ? 'حفظ وإرسال رسالة تأكيد' : 'Save & Send Confirmation'}</span>
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
          </form >
        </motion.div >
      </div >
    </div >
  )
}

export default function AddOrderPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AddOrderContent />
    </ProtectedRoute>
  )
}
