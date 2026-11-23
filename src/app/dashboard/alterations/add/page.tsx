'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import { alterationService, AlterationErrorType, isAlterationType, type AlterationType } from '@/lib/services/alteration-service'
import { orderService, Order } from '@/lib/services/order-service'
import AlterationStageModal, { getAvailableAlterationTypes } from '@/components/AlterationStageModal'
import UnifiedNotesInput from '@/components/UnifiedNotesInput'
import type { ImageAnnotation, DrawingPath, SavedDesignComment } from '@/components/InteractiveImageAnnotation'
import DatePickerWithStats from '@/components/DatePickerWithStats'
import { imageService } from '@/lib/services/image-service'
import { printAlterationSlip } from '@/lib/services/alteration-slip-printer'
import {
  ALTERATION_REASON_META,
  ALTERATION_TYPE_META,
  BottomSheet,
  ImageViewer,
  formatAlterationDate,
  getOrderStatusMeta,
  getSecondProofDate,
} from '@/components/alterations/alteration-ui'
import {
  ArrowRight,
  MessageSquare,
  AlertCircle,
  Loader2,
  MessageCircle,
  ChevronDown,
  Camera,
  CalendarDays,
  Ruler,
  Image as ImageIcon,
  Play,
  Pause,
  Package,
  Phone,
  CheckCircle,
  Pencil,
  Printer,
  Shirt,
  UserCheck,
  Wrench,
  X
} from 'lucide-react'
import { RECEPTION_STAFF } from '@/lib/reception-staff'
import { openAlterationWhatsApp } from '@/utils/whatsapp'
import {
  ALTERATION_ACCESSORY_KEYS,
  buildAccessoriesLines,
  getAccessoryLabel,
  normalizeAlterationAccessories,
  toggleAlterationAccessory,
  type AlterationAccessory,
} from '@/lib/alteration-accessories'
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
  const voiceBusyRef = useRef(false)
  const errorVoiceBusyRef = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const editId = searchParams.get('editId')
  const requestedAlterationType = searchParams.get('alterationType')

  // تحميل بيانات الطلب الأصلي إذا كان موجوداً
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null)
  const [isLoadingOrder, setIsLoadingOrder] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [showAlterationStageModal, setShowAlterationStageModal] = useState(false)
  // نافذة الأسئلة الإجبارية قبل الحفظ: null = مغلقة
  const [questionsAction, setQuestionsAction] = useState<'print' | 'whatsapp' | null>(null)
  const [questionsStep, setQuestionsStep] = useState<'accessories' | 'reason' | 'taker'>('accessories')
  const questionStepNumber = questionsStep === 'accessories' ? 1 : questionsStep === 'reason' ? 2 : 3
  // «لم تُحضر شيئاً» جواب صريح، حتى لا تُتجاوز خطوة المستلزمات بدون قصد
  const [accessoriesNoneChosen, setAccessoriesNoneChosen] = useState(false)

  useEffect(() => {
    if (orderId) {
      loadOriginalOrder(orderId)
    } else if (!editId) {
      // لا توجد تعديلات خارجية: إضافة تعديل تبدأ دائماً من طلب موجود
      router.replace('/dashboard/alterations')
    }
  }, [orderId, editId])

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
        alterationType: alteration.alteration_type || 'after_delivery',
        clientName: alteration.client_name,
        clientPhone: alteration.client_phone,
        orderReceivedDate: alteration.order_received_date || new Date().toISOString().split('T')[0],
        alterationDueDate: alteration.alteration_due_date || '',
        errorType: (alteration.error_type as AlterationErrorType) || '',
        errorNotes: alteration.error_notes || '',
        errorVoiceNotes: (alteration as any).error_voice_transcriptions || [],
        broughtAccessories: normalizeAlterationAccessories((alteration as any).brought_accessories),
        takenBy: alteration.taken_by || '',
        notes: alteration.notes || '',
        voiceNotes: (alteration as any).voice_transcriptions || [],
        images: alteration.images || [],
        alterationPhotos: alteration.alteration_photos || [],
        imageAnnotations: initialAnnotations,
        imageDrawings: initialDrawings,
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
        if (isAlterationType(requestedAlterationType) && getAvailableAlterationTypes(data).includes(requestedAlterationType)) {
          setFormData(prev => ({ ...prev, alterationType: requestedAlterationType }))
        } else {
          setFormData(prev => ({ ...prev, alterationType: 'after_delivery' }))
          setShowAlterationStageModal(true)
        }
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
    alterationType: 'after_delivery' as AlterationType,
    clientName: '',
    clientPhone: '',
    orderReceivedDate: new Date().toISOString().split('T')[0],
    alterationDueDate: '',
    errorType: '' as AlterationErrorType | '',
    errorNotes: '',
    errorVoiceNotes: [] as Array<{
      id: string
      data: string
      timestamp: number
      duration?: number
      transcription?: string
      translatedText?: string
      translationLanguage?: string
    }>,
    // المستلزمات التي أحضرتها العميلة؛ الغائب عن القائمة يُطبع كغير مُحضَر.
    broughtAccessories: [] as AlterationAccessory[],
    // من أخذ التعديل (هبة / منال / ندى) — السؤال الإجباري الثالث قبل الحفظ
    takenBy: '',
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
    savedDesignComments: [] as SavedDesignComment[]
  })

  // معرف الطلب الأصلي المستخرج من بيانات التعديل عند التعديل على تعديل داخلي
  const [editModeOriginalOrderId, setEditModeOriginalOrderId] = useState<string | null>(null)
  // المعرف الفعلي للطلب الأصلي: من URL أو من بيانات التعديل المحملة
  const effectiveOrderId = orderId || editModeOriginalOrderId
  const availableAlterationTypes = originalOrder
    ? getAvailableAlterationTypes(originalOrder)
    : (['after_delivery'] as AlterationType[])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDressDetails, setShowDressDetails] = useState(false)
  // الاسم والهاتف يأتيان من الطلب الأصلي؛ حقلا التصحيح يظهران عند الطلب فقط
  const [showClientEdit, setShowClientEdit] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [viewerImage, setViewerImage] = useState<string | null>(null)
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

  // معالجة تغيير الحقول
  const handleInputChange = (field: string, value: string | string[] | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // معالجة تغيير التسجيلات الصوتية لملاحظات الخطأ
  const handleErrorVoiceNotesChange = (errorVoiceNotes: Array<{
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
      errorVoiceNotes
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

  const tr = (ar: string, en: string) => (isArabic ? ar : en)

  // تعديل خارجي قديم: بلا طلب أصلي، فالاسم والهاتف يُعدّلان مباشرة ولا توجد مواعيد طلب
  const isLegacyExternal = isEditMode && !effectiveOrderId
  const clientFieldsOpen = showClientEdit || isLegacyExternal

  // مواعيد الطلب الأصلي (للعرض فقط): الثلاثة تظهر دائماً، والموعد غير الموجود يُكتب «—»
  const orderDates = originalOrder
    ? [
        { key: 'first', label: tr('البروفة الأولى', 'First proof'), value: originalOrder.proof_delivery_date || '', tone: 'text-amber-700' },
        { key: 'second', label: tr('البروفة الثانية', 'Second proof'), value: getSecondProofDate(originalOrder), tone: 'text-emerald-700' },
        { key: 'final', label: tr('التسليم النهائي', 'Final delivery'), value: originalOrder.due_date || '', tone: 'text-pink-700' },
      ]
    : []

  // الأنواع المتاحة للطلب، مع إبقاء النوع المحفوظ ظاهراً عند فتح تعديل قديم
  const canChangeAlterationType = Boolean(effectiveOrderId && originalOrder)
  const alterationTypeOptions = (['first_proof', 'second_proof', 'after_delivery'] as AlterationType[])
    .filter(type => availableAlterationTypes.includes(type) || type === formData.alterationType)

  // ملخص تفاصيل الفستان على زر الطيّ
  const measurementEntries = originalOrder?.measurements
    ? MEASUREMENT_ORDER
        .filter(key => key !== 'additional_notes')
        .map(key => ({ key, value: (originalOrder.measurements as any)?.[key] }))
        .filter(entry => entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== '')
    : []
  const measurementNotes = String((originalOrder?.measurements as any)?.additional_notes || '').trim()
  const hasLegacyDesign = roSavedDesignComments.length === 0
    && (roImageAnnotations.length > 0 || roImageDrawings.length > 0 || Boolean(roCustomDesignImage))
  const designCommentsCount = roSavedDesignComments.length || (hasLegacyDesign ? 1 : 0)
  const designImages = originalOrder?.images || []
  const dressSummary = [
    designCommentsCount > 0 ? `${tr('تعليقات', 'Comments')} ${designCommentsCount}` : '',
    designImages.length > 0 ? `${tr('صور', 'Photos')} ${designImages.length}` : '',
    measurementEntries.length > 0 ? `${tr('مقاسات', 'Measurements')} ${measurementEntries.length}` : '',
  ].filter(Boolean).join(' · ')

  // تعليقات التصميم تُنسخ من الطلب الأصلي (للقراءة فقط)، فالعرض الحالي دائماً «أمام»
  const buildSavedCommentsForSubmit = useCallback(() => {
    let allSavedComments = [...formData.savedDesignComments]
    const hasCurrentPayload = formData.imageAnnotations.length > 0 || formData.imageDrawings.length > 0

    if (!hasCurrentPayload) {
      return allSavedComments
    }

    const currentView = 'front' as const
    const viewLabel = 'أمام'

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
        image: allSavedComments[existingSlotIndex].image || null,
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
      image: null,
      title: viewLabel,
      view: currentView
    }]
  }, [formData.imageAnnotations, formData.imageDrawings, formData.savedDesignComments])

  const queueSavedAlterationPrint = async (alterationId: string, updatedAt: string) => {
    try {
      const { hindiMissing } = await printAlterationSlip(alterationId, {
        idempotencyKey: `alterations:save-print:${alterationId}:${updatedAt}`,
      })

      if (hindiMissing) {
        toast(
          isArabic
            ? 'تم الحفظ وإرسال الورقة العربية للطباعة. تعذّرت الترجمة الهندية فلن تُطبع نسختها.'
            : 'Saved and queued the Arabic slip. Hindi translation failed, so its copy will not print.',
          { icon: '⚠️' }
        )
      } else {
        toast.success(
          isArabic
            ? 'تم الحفظ وإرسال ورقتي التعديل (عربي + هندي) إلى طابعة الورشة'
            : 'Saved and sent both alteration slips (Arabic + Hindi) to the workshop printer'
        )
      }
    } catch (error: unknown) {
      console.error('Failed to queue saved alteration for printing:', error)
      toast.success(isArabic ? 'تم حفظ طلب التعديل بنجاح' : 'Alteration saved successfully')
      toast.error(
        error instanceof Error
          ? error.message
          : (isArabic
              ? 'تم الحفظ، لكن تعذّر إرسال ورقة التعديل للطباعة'
              : 'Saved, but failed to queue the alteration slip')
      )
    }
  }

  // زرّا الحفظ لا يحفظان مباشرة: يتحققان من الحقول الأساسية ثم يفتحان الأسئلة الإجبارية
  // (المستلزمات المُحضَرة ثم سبب التعديل)، والحفظ الفعلي يتم من آخر خطوة في النافذة.
  const openRequiredQuestions = (action: 'print' | 'whatsapp') => {
    if (action === 'whatsapp' && (!formData.clientPhone || formData.clientPhone.trim() === '')) {
      toast.error('يجب إدخال رقم هاتف العميل لإرسال رسالة واتساب', { icon: '⚠️' })
      return
    }
    if (!formData.clientName || !formData.clientPhone) {
      setShowClientEdit(true)
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }
    if (voiceBusyRef.current) {
      toast.error('جارٍ تحويل التسجيل الصوتي إلى نص. يرجى الانتظار قبل حفظ الطلب.')
      return
    }
    setAccessoriesNoneChosen(false)
    setQuestionsStep('accessories')
    setQuestionsAction(action)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    openRequiredQuestions('print')
  }

  const handleSubmitAndSendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault()
    openRequiredQuestions('whatsapp')
  }

  // حفظ النموذج وإرسال ورقة التعديل تلقائياً إلى طابور طابعة الورشة
  const performSubmit = async () => {
    // التحقق من الحقول المطلوبة
    if (!formData.clientName || !formData.clientPhone) {
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }

    if (!formData.errorType) {
      toast.error(isArabic ? 'يرجى تحديد سبب التعديل' : 'Please select the reason for alteration')
      return
    }

    if (!formData.takenBy) {
      toast.error(isArabic ? 'يرجى اختيار من أخذ التعديل' : 'Please select who took the alteration')
      return
    }

    if (voiceBusyRef.current || errorVoiceBusyRef.current) {
      toast.error('جارٍ تحويل التسجيل الصوتي إلى نص. يرجى الانتظار قبل حفظ الطلب.')
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

      // حفظ تسجيلات ملاحظات الخطأ الصوتية
      const errorVoiceTranscriptions = formData.errorVoiceNotes.map(vn => ({
        id: vn.id,
        data: vn.data,
        timestamp: vn.timestamp,
        duration: vn.duration,
        transcription: vn.transcription,
        translatedText: vn.translatedText,
        translationLanguage: vn.translationLanguage
      }))

      const allSavedComments = buildSavedCommentsForSubmit()

      // إنشاء أو تحديث طلب التعديل
      if (isEditMode && editId) {
        // وضع التعديل
        const result = await alterationService.update(editId, {
          alteration_type: formData.alterationType,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate || null,
          error_type: formData.errorType as AlterationErrorType || null,
          error_notes: formData.errorNotes || null,
          brought_accessories: formData.broughtAccessories,
          taken_by: formData.takenBy || undefined,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          error_voice_transcriptions: errorVoiceTranscriptions.length > 0 ? errorVoiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined
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

        if (result.data) {
          await queueSavedAlterationPrint(result.data.id, result.data.updated_at)
        } else {
          toast.success(isArabic ? 'تم تحديث طلب التعديل بنجاح!' : 'Alteration updated successfully!')
          toast.error(isArabic ? 'تعذّر إرسال طلب التعديل للطباعة' : 'Failed to queue the alteration slip')
        }
        router.push('/dashboard/alterations')
      } else {
        // وضع الإضافة
        const result = await alterationService.create({
          alteration_number: formData.alterationNumber && formData.alterationNumber.trim() !== '' ? formData.alterationNumber.trim() : undefined,
          alteration_type: formData.alterationType,
          original_order_id: effectiveOrderId ?? '',
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate || null,
          error_type: formData.errorType as AlterationErrorType || undefined,
          error_notes: formData.errorNotes || undefined,
          brought_accessories: formData.broughtAccessories,
          taken_by: formData.takenBy || undefined,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          error_voice_transcriptions: errorVoiceTranscriptions.length > 0 ? errorVoiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined,
          status: 'pending'
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

        if (result.data) {
          await queueSavedAlterationPrint(result.data.id, result.data.updated_at)
        } else {
          toast.success(isArabic ? 'تم إضافة طلب التعديل بنجاح!' : 'Alteration added successfully!')
          toast.error(isArabic ? 'تعذّر إرسال طلب التعديل للطباعة' : 'Failed to queue the alteration slip')
        }
        router.push('/dashboard/alterations')
      }
    } catch (error: any) {
      console.error('❌ Error creating alteration:', error)
      toast.error(error.message)
      setIsSubmitting(false)
    }
  }

  // حفظ طلب التعديل وإرسال رسالة واتساب
  const performSubmitAndSendWhatsApp = async () => {
    // التحقق من وجود رقم الهاتف
    if (!formData.clientPhone || formData.clientPhone.trim() === '') {
      toast.error('يجب إدخال رقم هاتف العميل لإرسال رسالة واتساب', {
        icon: '⚠️',
      })
      return
    }

    // التحقق من الحقول المطلوبة
    if (!formData.clientName || !formData.clientPhone) {
      toast.error(isArabic ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      return
    }

    if (!formData.errorType) {
      toast.error(isArabic ? 'يرجى تحديد سبب التعديل' : 'Please select the reason for alteration')
      return
    }

    if (!formData.takenBy) {
      toast.error(isArabic ? 'يرجى اختيار من أخذ التعديل' : 'Please select who took the alteration')
      return
    }

    if (voiceBusyRef.current || errorVoiceBusyRef.current) {
      toast.error('جارٍ تحويل التسجيل الصوتي إلى نص. يرجى الانتظار قبل حفظ الطلب.')
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

      // حفظ تسجيلات ملاحظات الخطأ الصوتية
      const errorVoiceTranscriptions = formData.errorVoiceNotes.map(vn => ({
        id: vn.id,
        data: vn.data,
        timestamp: vn.timestamp,
        duration: vn.duration,
        transcription: vn.transcription,
        translatedText: vn.translatedText,
        translationLanguage: vn.translationLanguage
      }))


      const allSavedComments = buildSavedCommentsForSubmit()

      let result
      let alterationNumber = formData.alterationNumber

      // إنشاء أو تحديث طلب التعديل
      if (isEditMode && editId) {
        // وضع التعديل
        result = await alterationService.update(editId, {
          alteration_type: formData.alterationType,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate || null,
          error_type: formData.errorType as AlterationErrorType || null,
          error_notes: formData.errorNotes || null,
          brought_accessories: formData.broughtAccessories,
          taken_by: formData.takenBy || undefined,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          error_voice_transcriptions: errorVoiceTranscriptions.length > 0 ? errorVoiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined
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
          alteration_type: formData.alterationType,
          original_order_id: effectiveOrderId ?? '',
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          order_received_date: formData.orderReceivedDate,
          alteration_due_date: formData.alterationDueDate || null,
          error_type: formData.errorType as AlterationErrorType || undefined,
          error_notes: formData.errorNotes || undefined,
          brought_accessories: formData.broughtAccessories,
          taken_by: formData.takenBy || undefined,
          notes: formData.notes || undefined,
          voice_notes: voiceNotesData.length > 0 ? voiceNotesData : undefined,
          voice_transcriptions: voiceTranscriptions.length > 0 ? voiceTranscriptions : undefined,
          error_voice_transcriptions: errorVoiceTranscriptions.length > 0 ? errorVoiceTranscriptions : undefined,
          images: formData.images.length > 0 ? formData.images : undefined,
          alteration_photos: formData.alterationPhotos.length > 0 ? formData.alterationPhotos : undefined,
          saved_design_comments: allSavedComments.length > 0 ? allSavedComments : undefined,
          image_annotations: formData.imageAnnotations.length > 0 ? formData.imageAnnotations : undefined,
          image_drawings: formData.imageDrawings.length > 0 ? formData.imageDrawings : undefined
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
    <div dir={isArabic ? 'rtl' : 'ltr'} className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-30 border-b border-pink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="-ms-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-pink-50 hover:text-pink-700"
            aria-label={tr('رجوع', 'Back')}
          >
            <ArrowRight className={`h-5 w-5 ${isArabic ? '' : 'rotate-180'}`} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold text-slate-900 sm:text-xl">
              {isEditMode ? tr('تعديل طلب التعديل', 'Edit alteration') : tr('طلب تعديل جديد', 'New alteration')}
            </h1>
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              {isEditMode ? (
                <span dir="ltr">{formData.alterationNumber || '—'}</span>
              ) : originalOrder ? (
                <>
                  {tr('مرتبط بالطلب', 'Linked to order')} <span dir="ltr">{originalOrder.order_number || '—'}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-3xl space-y-4 px-4 pt-4 sm:px-6">
        {/* 1. الطلب الأصلي والزبونة ومواعيد الطلب */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm"
        >
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-lg font-extrabold text-white">
              {(formData.clientName || '؟').trim().charAt(0) || '؟'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-pink-600">
                {isLegacyExternal ? tr('تعديل خارجي (قديم)', 'Legacy external alteration') : tr('الطلب الأصلي', 'Original order')}
              </p>
              <h2 className="truncate text-lg font-extrabold leading-7 text-slate-900">
                {formData.clientName || tr('بدون اسم', 'No name')}
              </h2>
              {formData.clientPhone ? (
                <a
                  href={`tel:${formData.clientPhone}`}
                  className="inline-flex min-h-9 items-center gap-1.5 text-[15px] font-semibold text-slate-600 hover:text-pink-700"
                >
                  <Phone className="h-4 w-4" />
                  <span dir="ltr">{formData.clientPhone}</span>
                </a>
              ) : (
                <p className="mt-1 text-sm font-semibold text-red-600">{tr('لا يوجد رقم هاتف', 'No phone number')}</p>
              )}
            </div>
            {!isLegacyExternal ? (
              <button
                type="button"
                onClick={() => setShowClientEdit(previous => !previous)}
                aria-expanded={showClientEdit}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition ${showClientEdit ? 'border-pink-300 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-500 hover:border-pink-300 hover:text-pink-700'}`}
                aria-label={tr('تصحيح الاسم والهاتف', 'Edit name and phone')}
              >
                {showClientEdit ? <X className="h-5 w-5" /> : <Pencil className="h-4 w-4" />}
              </button>
            ) : null}
          </div>

          {originalOrder ? (
            <div className="flex flex-wrap gap-1.5 px-4 pb-4 sm:px-5">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                {tr('طلب', 'Order')} <span dir="ltr">{originalOrder.order_number || '—'}</span>
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getOrderStatusMeta(originalOrder.status).badge}`}>
                {isArabic ? getOrderStatusMeta(originalOrder.status).label.ar : getOrderStatusMeta(originalOrder.status).label.en}
              </span>
              {originalOrder.fabric ? (
                <span className="max-w-full truncate rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                  {tr('القماش', 'Fabric')}: {originalOrder.fabric}
                </span>
              ) : null}
            </div>
          ) : null}

          {clientFieldsOpen ? (
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  {tr('اسم الزبونة', 'Client Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => handleInputChange('clientName', e.target.value)}
                  placeholder={tr('أدخل اسم الزبونة', 'Enter client name')}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                  required
                  dir={isArabic ? 'rtl' : 'ltr'}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  {tr('رقم الهاتف', 'Phone Number')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.clientPhone}
                  onChange={(e) => handleInputChange('clientPhone', e.target.value)}
                  placeholder={tr('أدخل رقم الهاتف', 'Enter phone number')}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                  required
                  dir="ltr"
                />
              </div>
            </div>
          ) : null}

          {originalOrder ? (
            <div className="border-t border-slate-100 p-4 sm:p-5">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-slate-700">
                <CalendarDays className="h-4 w-4 text-pink-500" />
                {tr('مواعيد الطلب', 'Order Dates')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {orderDates.map(item => (
                  <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-1 py-2.5 text-center">
                    <p className="text-xs font-semibold leading-5 text-slate-500">{item.label}</p>
                    <p dir="ltr" className={`mt-0.5 text-sm font-extrabold tabular-nums ${item.value ? item.tone : 'text-slate-400'}`}>
                      {formatAlterationDate(item.value) || '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : effectiveOrderId ? (
            <div className="border-t border-slate-100 p-4 sm:p-5">
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map(index => (
                  <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            </div>
          ) : null}
        </motion.section>

        {/* 2. نوع التعديل وموعده */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          {/* نوع التعديل نادراً ما يتغيّر: سطر واحد، والخيارات تظهر فقط عند «تغيير» */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Wrench className="h-4 w-4 shrink-0 text-pink-500" />
              <span className="text-sm font-bold text-slate-700">{tr('نوع التعديل', 'Alteration Type')}</span>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${ALTERATION_TYPE_META[formData.alterationType]?.badge || ''}`}>
                {isArabic ? ALTERATION_TYPE_META[formData.alterationType]?.short.ar : ALTERATION_TYPE_META[formData.alterationType]?.short.en}
              </span>
            </div>
            {canChangeAlterationType && alterationTypeOptions.length > 1 ? (
              <button
                type="button"
                onClick={() => setShowTypePicker(previous => !previous)}
                aria-expanded={showTypePicker}
                className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-pink-600 transition hover:bg-pink-50"
              >
                {showTypePicker ? tr('إغلاق', 'Close') : tr('تغيير', 'Change')}
              </button>
            ) : null}
          </div>

          {showTypePicker && canChangeAlterationType ? (
            <div
              role="radiogroup"
              aria-label={tr('نوع التعديل', 'Alteration Type')}
              className={`mt-2 grid gap-2 ${alterationTypeOptions.length >= 3 ? 'grid-cols-3' : alterationTypeOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
            >
              {alterationTypeOptions.map(type => {
                const meta = ALTERATION_TYPE_META[type]
                const isSelected = formData.alterationType === type
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      handleInputChange('alterationType', type)
                      setShowTypePicker(false)
                    }}
                    className={`min-h-11 rounded-xl border px-2 py-1.5 text-sm font-bold leading-5 transition ${isSelected ? meta.selected : 'border-slate-200 bg-white text-slate-600 hover:border-pink-200'}`}
                  >
                    {isArabic ? meta.short.ar : meta.short.en}
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="mt-3 border-t border-slate-100 pt-3">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              {tr('موعد تسليم التعديل', 'Alteration Due Date')}
            </label>
            <DatePickerWithStats
              selectedDate={formData.alterationDueDate}
              onChange={(date) => handleInputChange('alterationDueDate', date)}
              minDate={new Date()}
              required={false}
              statsType="alterations"
            />
          </div>
        </motion.section>

        {/* 3. وصف التعديل المطلوب: نص + صوت + صور */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <MessageSquare className="h-5 w-5 text-pink-500" />
            {tr('وصف التعديل المطلوب', 'Alteration Description')}
          </h2>
          <p className="mb-3 mt-0.5 text-sm text-slate-500">
            {tr('اكتبي أو سجّلي بالصوت، وأضيفي صوراً للتوضيح.', 'Type or record, and add photos to explain.')}
          </p>

          <UnifiedNotesInput
            notes={formData.notes}
            voiceNotes={formData.voiceNotes}
            onNotesChange={(notes) => handleInputChange('notes', notes)}
            onVoiceNotesChange={handleVoiceNotesChange}
            onBusyChange={busy => { voiceBusyRef.current = busy }}
            appendTranscriptionToNotes={false}
            allowTranscriptionEditing
            extraActions={(
              // زر الكاميرا تحت زر الترجمة مباشرة، بنفس شكل زرّي المايكروفون والترجمة
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isSubmitting || isCameraUploading}
                className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                title={tr('إضافة صورة من الكاميرا', 'Add photo from camera')}
                aria-label={tr('إضافة صورة من الكاميرا', 'Add photo from camera')}
              >
                {isCameraUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </button>
            )}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraCapture}
          />

          {/* صور التعديل: مصغّرات صغيرة تظهر فقط عند وجود صور */}
          {formData.alterationPhotos.length > 0 || isCameraUploading ? (
            <div className="mt-3 flex flex-wrap gap-2.5">
              {formData.alterationPhotos.map((url, idx) => (
                <div key={`${url}-${idx}`} className="relative h-16 w-16">
                  <button
                    type="button"
                    onClick={() => setViewerImage(url)}
                    className="h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    aria-label={tr(`عرض الصورة ${idx + 1}`, `View photo ${idx + 1}`)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photos are Storage URLs */}
                    <img src={url} alt={`alteration-photo-${idx + 1}`} className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      alterationPhotos: prev.alterationPhotos.filter((_, i) => i !== idx)
                    }))}
                    className="absolute -end-2 -top-2 grid h-8 w-8 place-items-center"
                    aria-label={tr('حذف الصورة', 'Remove photo')}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-red-500 text-white shadow ring-2 ring-white">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>
              ))}
              {isCameraUploading ? (
                <div className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-green-300 bg-green-50 text-green-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : null}
            </div>
          ) : null}
        </motion.section>

        {/* المستلزمات المُحضَرة وسبب التعديل صارا أسئلة إجبارية في نافذة تظهر عند الحفظ */}

        {/* 4. تفاصيل الفستان للقراءة فقط (للتعديلات المرتبطة بطلب) */}
        {effectiveOrderId ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => setShowDressDetails(prev => !prev)}
              aria-expanded={showDressDetails}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-pink-50/40 sm:px-5"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-purple-50 text-purple-600">
                <Shirt className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-extrabold text-slate-900">{tr('تفاصيل الفستان', 'Dress details')}</span>
                <span className="block truncate text-sm text-slate-500">
                  {originalOrder ? (dressSummary || tr('لا توجد تفاصيل محفوظة', 'No saved details')) : tr('جارٍ التحميل…', 'Loading…')}
                  <span className="text-slate-400"> · {tr('للقراءة فقط', 'read only')}</span>
                </span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${showDressDetails ? 'rotate-180' : ''}`} />
            </button>

            {showDressDetails && originalOrder ? (
              <div className="space-y-6 border-t border-slate-100 p-4 sm:p-5">
                {/* أ. تعليقات التصميم */}
                {(roSavedDesignComments.length > 0 || hasLegacyDesign) ? (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                      <Pencil className="h-4 w-4 text-pink-500" />
                      {tr('تعليقات التصميم', 'Design comments')}
                      {roSavedDesignComments.length > 0 ? (
                        <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-700">{roSavedDesignComments.length}</span>
                      ) : null}
                    </h3>

                    {roSavedDesignComments.length > 0 ? (
                      <div className="space-y-3">
                        {roSavedDesignComments.map((comment, commentIndex) => (
                          <div key={comment.id} className="overflow-hidden rounded-2xl border border-pink-100">
                            <button
                              type="button"
                              onClick={() => setExpandedROCommentId(expandedROCommentId === comment.id ? null : comment.id)}
                              aria-expanded={expandedROCommentId === comment.id}
                              className="flex min-h-12 w-full items-center justify-between gap-3 bg-gradient-to-l from-pink-50 to-purple-50 px-4 py-2.5 text-start"
                            >
                              <span className="flex items-center gap-3">
                                <span className="grid h-8 w-8 place-items-center rounded-full bg-pink-500 text-sm font-bold text-white">
                                  {commentIndex + 1}
                                </span>
                                <span className="text-[15px] font-bold text-slate-800">
                                  {comment.title
                                    ? comment.title.replace(/^أمام/, 'الأمام').replace(/^خلف/, 'الخلف')
                                    : `${tr('تعليق', 'Comment')} ${commentIndex + 1}`}
                                </span>
                              </span>
                              <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform duration-200 ${expandedROCommentId === comment.id ? 'rotate-180' : ''}`} />
                            </button>

                            {expandedROCommentId === comment.id ? (
                              <div className="space-y-3 p-3">
                                <div className="relative overflow-hidden rounded-xl border border-pink-200 bg-white">
                                  {comment.compositeImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- composite images are data/Storage URLs
                                    <img
                                      src={comment.compositeImage}
                                      alt={`تصميم ${comment.title || commentIndex + 1}`}
                                      className="h-auto w-full"
                                    />
                                  ) : (
                                    <>
                                      {/* eslint-disable-next-line @next/next/no-img-element -- design base images can be data URLs */}
                                      <img
                                        src={resolveROCommentImageSrc(comment)}
                                        alt={`تصميم ${comment.title || commentIndex + 1}`}
                                        className="h-auto w-full"
                                        onLoad={() => {
                                          const canvas = roCanvasRefs.current.get(comment.id)
                                          if (canvas && comment.drawings && comment.drawings.length > 0) {
                                            void drawROPathsOnCanvas(canvas, comment.drawings)
                                          }
                                        }}
                                      />
                                      {comment.drawings && comment.drawings.length > 0 ? (
                                        <canvas
                                          ref={(el) => {
                                            if (el) {
                                              roCanvasRefs.current.set(comment.id, el)
                                              void drawROPathsOnCanvas(el, comment.drawings || [])
                                            }
                                          }}
                                          className="pointer-events-none absolute inset-0 h-full w-full"
                                        />
                                      ) : null}
                                      {comment.annotations?.map((annotation, idx) => (
                                        <div
                                          key={annotation.id}
                                          className="absolute -translate-x-1/2 -translate-y-1/2 transform"
                                          style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                                        >
                                          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-pink-500 text-xs font-bold text-white shadow-lg">
                                            {idx + 1}
                                          </div>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                </div>

                                {comment.annotations && comment.annotations.length > 0 ? (
                                  <div className="space-y-2">
                                    {comment.annotations.map((annotation, idx) => (
                                      <div key={annotation.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pink-500 text-xs font-bold text-white">
                                          {idx + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          {annotation.transcription ? (
                                            <p className="text-sm leading-6 text-slate-700">{annotation.transcription.split(/<end>|\n/gi).filter(s => s.trim()).map((line, i) => (<span key={i}>{i > 0 && <br />}{line.trim()}</span>))}</p>
                                          ) : (
                                            <p className="text-sm text-slate-400">{tr('تعليق صوتي', 'Voice note')}</p>
                                          )}
                                          {annotation.translatedText ? (
                                            <div className="mt-1.5 rounded-lg border border-purple-200 bg-purple-50 p-2">
                                              <p className="mb-0.5 text-xs font-bold text-purple-600">{tr('الترجمة', 'Translation')}</p>
                                              <p className="text-sm text-slate-600" dir="auto">{annotation.translatedText.split(/<end>|\n/gi).filter(s => s.trim()).map((line, i) => (<span key={i}>{i > 0 && <br />}{line.trim()}</span>))}</p>
                                            </div>
                                          ) : null}
                                        </div>
                                        {annotation.audioData ? (
                                          <button
                                            type="button"
                                            onClick={() => toggleROAudio(annotation)}
                                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors ${playingROAudioId === annotation.id ? 'bg-green-500 text-white' : 'border border-green-200 bg-white text-green-600 hover:bg-green-50'}`}
                                            aria-label={playingROAudioId === annotation.id ? tr('إيقاف', 'Pause') : tr('تشغيل', 'Play')}
                                          >
                                            {playingROAudioId === annotation.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                          </button>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* التعليق القديم (توافق مع البيانات القديمة) */}
                    {hasLegacyDesign ? (
                      <div className="relative overflow-hidden rounded-2xl border border-pink-200 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element -- legacy design image can be a data URL */}
                        <img
                          src={roCustomDesignImage || '/front2.png'}
                          alt="تصميم الفستان"
                          className="h-auto w-full"
                          onLoad={() => {
                            if (roCanvasRef.current && roImageDrawings.length > 0) {
                              void drawROPathsOnCanvas(roCanvasRef.current, roImageDrawings)
                            }
                          }}
                        />
                        {roImageDrawings.length > 0 ? (
                          <canvas ref={roCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                        ) : null}
                        {roImageAnnotations.map((annotation, index) => (
                          <div
                            key={annotation.id}
                            className="absolute -translate-x-1/2 -translate-y-1/2 transform"
                            style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-pink-500 text-xs font-bold text-white shadow-lg">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* ب. صور التصميم */}
                {designImages.length > 0 ? (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                      <ImageIcon className="h-4 w-4 text-pink-500" />
                      {tr('صور التصميم', 'Design photos')}
                      <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-700">{designImages.length}</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {designImages.map((image, index) => (
                        <button
                          key={`${image}-${index}`}
                          type="button"
                          onClick={() => setViewerImage(image)}
                          className="relative aspect-square overflow-hidden rounded-2xl border border-pink-100 bg-slate-50"
                          aria-label={tr(`عرض صورة التصميم ${index + 1}`, `View design photo ${index + 1}`)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- order images can be data URLs */}
                          <img src={image} alt={`صورة التصميم ${index + 1}`} className="h-full w-full object-cover" />
                          <span className="absolute bottom-1.5 start-1.5 rounded-md bg-slate-900/65 px-1.5 py-0.5 text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* ج. المقاسات */}
                {measurementEntries.length > 0 || measurementNotes ? (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                      <Ruler className="h-4 w-4 text-pink-500" />
                      {tr('المقاسات (سم)', 'Measurements (cm)')}
                    </h3>
                    {measurementEntries.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {measurementEntries.map(({ key, value }) => (
                          <div key={key} className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50/70 to-purple-50/70 px-2 py-2.5 text-center">
                            <p className="text-xs font-semibold leading-5 text-slate-600">{getMeasurementLabelWithSymbol(key as any)}</p>
                            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900" dir="ltr">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {measurementNotes ? (
                      <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                        <p className="mb-1 text-xs font-bold text-blue-700">{tr('ملاحظات المقاسات', 'Measurement notes')}</p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{measurementNotes}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!dressSummary && !measurementNotes ? (
                  <p className="py-4 text-center text-[15px] text-slate-500">
                    {tr('لا توجد تفاصيل محفوظة لهذا الطلب.', 'No saved details for this order.')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {showDressDetails && !originalOrder ? (
              <div className="flex items-center justify-center border-t border-slate-100 py-8">
                <Loader2 className="h-6 w-6 animate-spin text-pink-500" />
              </div>
            ) : null}
          </motion.section>
        ) : null}

        {/* 5. أزرار الحفظ: ثابتة أسفل الشاشة */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-pink-100 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:grid-cols-[1fr_1fr_auto] sm:gap-3 sm:px-6">
            {/* زر حفظ طلب التعديل وإرساله تلقائياً إلى طابور الطباعة */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 px-3 text-[15px] font-bold text-white shadow-md transition hover:from-pink-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
              {isSubmitting
                ? tr('جارٍ الحفظ…', 'Saving…')
                : isEditMode ? tr('تحديث وطباعة', 'Update & Print') : tr('حفظ وطباعة', 'Save & Print')}
            </button>

            {/* زر حفظ طلب التعديل وإرسال واتساب */}
            <button
              type="button"
              onClick={handleSubmitAndSendWhatsApp}
              disabled={isSubmitting || !formData.clientPhone}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-green-600 px-3 text-[15px] font-bold text-white shadow-md transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={!formData.clientPhone ? 'يجب إدخال رقم هاتف العميل أولاً' : ''}
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
              {isSubmitting ? tr('جارٍ الحفظ…', 'Saving…') : tr('حفظ وإرسال رسالة', 'Save & Send Message')}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              disabled={isSubmitting}
              className="hidden h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-[15px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:inline-flex"
            >
              {tr('إلغاء', 'Cancel')}
            </button>
          </div>
        </div>
      </form>

      {/* الأسئلة الإجبارية قبل الحفظ: 1) المستلزمات المُحضَرة 2) سبب التعديل */}
      <BottomSheet
        open={questionsAction !== null}
        onClose={() => { if (!isSubmitting) setQuestionsAction(null) }}
        dir={isArabic ? 'rtl' : 'ltr'}
        zIndex="z-50"
        eyebrow={tr(
          `السؤال ${questionStepNumber} من 3`,
          `Question ${questionStepNumber} of 3`
        )}
        title={(
          <span className="flex items-center gap-2">
            {questionsStep === 'accessories'
              ? <Package className="h-5 w-5 shrink-0 text-pink-500" />
              : questionsStep === 'reason'
                ? <AlertCircle className="h-5 w-5 shrink-0 text-pink-500" />
                : <UserCheck className="h-5 w-5 shrink-0 text-pink-500" />}
            {questionsStep === 'accessories'
              ? tr('ما المستلزمات التي أحضرتها العميلة؟', 'What did the client bring?')
              : questionsStep === 'reason'
                ? tr('ما سبب التعديل؟', 'Reason for alteration?')
                : tr('مين أخذ التعديل؟', 'Who took the alteration?')}
            <span className="text-sm text-red-500">*</span>
          </span>
        )}
        footer={questionsStep === 'accessories' ? (
          <button
            type="button"
            disabled={formData.broughtAccessories.length === 0 && !accessoriesNoneChosen}
            onClick={() => setQuestionsStep('reason')}
            className="h-12 w-full rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 text-[15px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tr('التالي', 'Next')}
          </button>
        ) : questionsStep === 'reason' ? (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setQuestionsStep('accessories')}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {tr('رجوع', 'Back')}
            </button>
            <button
              type="button"
              disabled={isSubmitting || !formData.errorType}
              onClick={() => setQuestionsStep('taker')}
              className="h-12 flex-1 rounded-2xl bg-gradient-to-l from-pink-500 to-purple-500 text-[15px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tr('التالي', 'Next')}
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setQuestionsStep('reason')}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {tr('رجوع', 'Back')}
            </button>
            <button
              type="button"
              disabled={isSubmitting || !formData.errorType || !formData.takenBy}
              onClick={() => {
                if (questionsAction === 'whatsapp') void performSubmitAndSendWhatsApp()
                else void performSubmit()
              }}
              className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                questionsAction === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : 'bg-gradient-to-l from-pink-500 to-purple-500'
              }`}
            >
              {isSubmitting ? (
                <><Loader2 className="h-5 w-5 animate-spin" />{tr('جارٍ الحفظ…', 'Saving…')}</>
              ) : questionsAction === 'whatsapp' ? (
                <><MessageCircle className="h-5 w-5" />{tr('حفظ وإرسال رسالة', 'Save & Send Message')}</>
              ) : (
                <><Printer className="h-5 w-5" />{isEditMode ? tr('تحديث وطباعة', 'Update & Print') : tr('حفظ وطباعة', 'Save & Print')}</>
              )}
            </button>
          </div>
        )}
      >
        {/* شريط التقدّم */}
        <div className="mb-4 grid grid-cols-3 gap-1.5" aria-hidden>
          <span className="h-1.5 rounded-full bg-pink-500" />
          <span className={`h-1.5 rounded-full ${questionStepNumber >= 2 ? 'bg-pink-500' : 'bg-slate-200'}`} />
          <span className={`h-1.5 rounded-full ${questionStepNumber >= 3 ? 'bg-pink-500' : 'bg-slate-200'}`} />
        </div>

        {questionsStep === 'accessories' ? (
          <>
            <p className="mb-4 text-sm leading-6 text-slate-500">
              {tr(
                'اختاري ما أحضرته، أو «لم تُحضر أي شيء». ما لا تختارينه يُطبع على ورقة الورشة كغير مُحضَر.',
                'Pick what was brought, or "Nothing brought". Anything unselected prints as not brought.'
              )}
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALTERATION_ACCESSORY_KEYS.map((accessory) => {
                const isSelected = formData.broughtAccessories.includes(accessory)
                return (
                  <button
                    key={accessory}
                    type="button"
                    role="switch"
                    aria-checked={isSelected}
                    disabled={isSubmitting}
                    onClick={() => {
                      setAccessoriesNoneChosen(false)
                      setFormData(prev => ({
                        ...prev,
                        broughtAccessories: toggleAlterationAccessory(prev.broughtAccessories, accessory)
                      }))
                    }}
                    className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-[15px] font-bold transition-all disabled:opacity-50 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isSelected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {getAccessoryLabel(accessory, isArabic ? 'ar' : 'en')}
                    {isSelected && <CheckCircle className="ms-auto h-5 w-5 shrink-0" />}
                  </button>
                )
              })}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setAccessoriesNoneChosen(true)
                  setFormData(prev => ({ ...prev, broughtAccessories: [] }))
                }}
                className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-[15px] font-bold transition-all disabled:opacity-50 ${
                  accessoriesNoneChosen
                    ? 'border-slate-600 bg-slate-100 text-slate-800'
                    : 'border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accessoriesNoneChosen ? 'bg-slate-600' : 'bg-slate-300'}`} />
                {tr('لم تُحضر أي شيء', 'Nothing brought')}
                {accessoriesNoneChosen && <CheckCircle className="ms-auto h-5 w-5 shrink-0" />}
              </button>
            </div>

            {/* معاينة ما سيُطبع، حتى لا يُكتشف الخطأ بعد خروج الورقة */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-bold text-slate-500">
                {tr('سيظهر على ورقة الورشة:', 'Will appear on the workshop slip:')}
              </p>
              <pre className="m-0 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-800">
                {buildAccessoriesLines(formData.broughtAccessories, 'ar')}
              </pre>
            </div>
          </>
        ) : questionsStep === 'reason' ? (
          <>
            <div role="radiogroup" className="mb-5 grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'tailor_error',      color: 'red' },
                  { value: 'cutter_error',       color: 'orange' },
                  { value: 'measurement_error',  color: 'yellow' },
                  { value: 'customer_error',     color: 'blue' },
                  { value: 'reception_error',    color: 'purple' },
                ] as const
              ).map(({ value, color }) => {
                const isSelected = formData.errorType === value
                const label = isArabic ? ALTERATION_REASON_META[value].label.ar : ALTERATION_REASON_META[value].label.en
                const colorMap: Record<string, string> = {
                  red:    isSelected ? 'border-red-500 bg-red-50 text-red-700'       : 'border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-700',
                  orange: isSelected ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-700',
                  yellow: isSelected ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-slate-200 hover:border-yellow-300 hover:bg-yellow-50 text-slate-700',
                  blue:   isSelected ? 'border-blue-500 bg-blue-50 text-blue-700'    : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700',
                  purple: isSelected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-slate-700',
                }
                const dotMap: Record<string, string> = {
                  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
                  blue: 'bg-blue-500', purple: 'bg-purple-500'
                }
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isSubmitting}
                    onClick={() => setFormData(prev => ({ ...prev, errorType: value }))}
                    className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-3 text-[15px] font-bold transition-all disabled:opacity-50 ${colorMap[color]}`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isSelected ? dotMap[color] : 'bg-slate-300'}`} />
                    {label}
                    {isSelected && <CheckCircle className="ms-auto h-4 w-4 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* ملاحظات عن الخطأ - اختيارية */}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                {tr('ملاحظات عن الخطأ', 'Error Notes')}
                <span className="ms-2 text-xs font-normal text-slate-400">({tr('اختياري', 'Optional')})</span>
              </label>
              <UnifiedNotesInput
                notes={formData.errorNotes}
                voiceNotes={formData.errorVoiceNotes}
                onNotesChange={(notes) => setFormData(prev => ({ ...prev, errorNotes: notes }))}
                onVoiceNotesChange={handleErrorVoiceNotesChange}
                onBusyChange={busy => { errorVoiceBusyRef.current = busy }}
                disabled={isSubmitting}
                placeholder={tr('أضيفي ملاحظات إضافية حول سبب التعديل أو اضغطي على المايكروفون...', 'Add additional notes about the error or press the mic...')}
                appendTranscriptionToNotes={false}
                allowTranscriptionEditing
              />
            </div>
          </>
        ) : (
          <div role="radiogroup" aria-label={tr('مين أخذ التعديل؟', 'Who took the alteration?')} className="grid grid-cols-1 gap-2">
            {RECEPTION_STAFF.map((name) => {
              const isSelected = formData.takenBy === name
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isSubmitting}
                  onClick={() => setFormData(prev => ({ ...prev, takenBy: name }))}
                  className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-[15px] font-bold transition-all disabled:opacity-50 ${
                    isSelected
                      ? 'border-pink-500 bg-pink-50 text-pink-700'
                      : 'border-slate-200 text-slate-700 hover:border-pink-300 hover:bg-pink-50'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isSelected ? 'bg-pink-500' : 'bg-slate-300'}`} />
                  {name}
                  {isSelected && <CheckCircle className="ms-auto h-5 w-5 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </BottomSheet>

      <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />

      {originalOrder && !isEditMode ? (
        <AlterationStageModal
          isOpen={showAlterationStageModal}
          order={originalOrder}
          onClose={() => setShowAlterationStageModal(false)}
          onSelect={(alterationType) => {
            setFormData(prev => ({ ...prev, alterationType }))
            setShowAlterationStageModal(false)
          }}
        />
      ) : null}
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
