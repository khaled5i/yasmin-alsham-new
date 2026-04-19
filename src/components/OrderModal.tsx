'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  X,
  User,
  Phone,
  Calendar,
  Package,
  Ruler,
  DollarSign,
  MessageSquare,
  UserCheck,
  Clock,
  CheckCircle,
  Image as ImageIcon,
  Mail,
  Printer,
  Pencil,
  Play,
  Pause,
  Languages,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Upload,
  AlertTriangle,
  PrinterIcon,
  Trash2,
  Download,
  Camera,
  Link2
} from 'lucide-react'
import { Order, orderService } from '@/lib/services/order-service'
import { Worker } from '@/lib/services/worker-service'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore' // إضافة
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions' // إضافة
import { useTranslation } from '@/hooks/useTranslation'
import { toast } from 'react-hot-toast' // إضافة
import VoiceNotes from './VoiceNotes'
import PrintOrderModal from './PrintOrderModal'
import { MEASUREMENT_ORDER, getMeasurementLabelWithSymbol } from '@/types/measurements'
import { ImageAnnotation, DrawingPath, SavedDesignComment } from './InteractiveImageAnnotation'
import { renderDrawingsOnCanvas } from '@/lib/canvas-renderer'
import { isVideoFile } from '@/lib/utils/media'
import { formatGregorianDate, parseDateForDisplay } from '@/lib/date-utils'
import { useAppResume } from '@/hooks/useAppResume'
import GenerateDesignButton from './GenerateDesignButton'

interface OrderModalProps {
  order: Order | null
  workers: any[] // Using any to handle WorkerWithUser and legacy Worker types
  isOpen: boolean
  onClose: () => void
  showCartoonButton?: boolean
  onStartWork?: (orderId: string) => void
  onCompleteWork?: (order: any) => void
  isProcessing?: boolean
  currentWorkerId?: string
}

export default function OrderModal({ order: initialOrder, workers, isOpen, onClose, showCartoonButton = false, onStartWork, onCompleteWork, isProcessing, currentWorkerId }: OrderModalProps) {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [lightboxImages, setLightboxImages] = useState<string[]>([])
  const [isClientMounted, setIsClientMounted] = useState(false)

  useEffect(() => {
    setIsClientMounted(true)
  }, [])

  const canNavigateLightbox = lightboxImages.length > 1

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null)
    setLightboxImages([])
  }, [])

  const openLightbox = useCallback((index: number, images: string[]) => {
    setLightboxImages(images)
    setLightboxIndex(index)
  }, [])

  // Navigation handlers (swapped logic as requested: Right=Prev, Left=Next)
  const showPreviousImage = useCallback(() => {
    if (!canNavigateLightbox || lightboxIndex === null) return
    const previousPosition = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length
    setLightboxIndex(previousPosition)
  }, [canNavigateLightbox, lightboxIndex, lightboxImages.length])

  const showNextImage = useCallback(() => {
    if (!canNavigateLightbox || lightboxIndex === null) return
    const nextPosition = (lightboxIndex + 1) % lightboxImages.length
    setLightboxIndex(nextPosition)
  }, [canNavigateLightbox, lightboxIndex, lightboxImages.length])

  // Swipe handling
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null
    touchStartX.current = e.targetTouches[0].clientX
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      showNextImage()
    }
    if (isRightSwipe) {
      showPreviousImage()
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox()
      if (event.key === 'ArrowLeft') showNextImage() // Left arrow -> Next (to match button swap)
      if (event.key === 'ArrowRight') showPreviousImage() // Right arrow -> Prev
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, closeLightbox, showNextImage, showPreviousImage])

  // Reset lightbox when modal closes
  useEffect(() => {
    if (!isOpen) closeLightbox()
  }, [isOpen, closeLightbox])

  const [voiceNotes, setVoiceNotes] = useState<any[]>([])
  const [showPrintModal, setShowPrintModal] = useState(false)
  // Full order data (fetched when lightweight order is missing measurements)
  const [fullOrder, setFullOrder] = useState<Order | null>(null)
  // AI generated images (local state, auto-saved to order on generation)
  // يُعاد تهيئته عند تغيير الطلب لمنع التسريب بين الطلبات
  const [localAiImages, setLocalAiImages] = useState<string[]>([])
  const prevOrderIdRef = useRef<string | null>(null)
  const [measurementsData, setMeasurementsData] = useState<Record<string, any> | null>(null)
  const [isMeasurementsLoading, setIsMeasurementsLoading] = useState(false)
  const order = fullOrder || initialOrder

  const { updateOrder } = useOrderStore()
  const { workerType } = useWorkerPermissions() // للتحقق من صلاجيات مدير الورشة

  // حالات تعليقات التصميم
  const [imageAnnotations, setImageAnnotations] = useState<ImageAnnotation[]>([])
  const [imageDrawings, setImageDrawings] = useState<DrawingPath[]>([])
  const [customDesignImage, setCustomDesignImage] = useState<string | null>(null)
  const [savedDesignComments, setSavedDesignComments] = useState<SavedDesignComment[]>([])
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null)
  const [translatingAnnotationId, setTranslatingAnnotationId] = useState<string | null>(null)
  const [showAnnotationLanguageDropdown, setShowAnnotationLanguageDropdown] = useState<string | null>(null)
  const resolveCommentImageSrc = useCallback((comment: SavedDesignComment): string => {
    if (comment.image && comment.image.startsWith('data:')) return comment.image
    if (comment.image && comment.image !== 'custom') return comment.image
    if (customDesignImage) return customDesignImage
    return '/front2.png'
  }, [customDesignImage])

  // حالات تحويل الصورة إلى كرتون
  const [isConvertingToCartoon, setIsConvertingToCartoon] = useState(false)
  const [cartoonImage, setCartoonImage] = useState<string | null>(null)
  const [showCartoonUploadModal, setShowCartoonUploadModal] = useState(false)
  const [cartoonUploadImage, setCartoonUploadImage] = useState<string | null>(null)
  const cartoonImageRef = useRef<HTMLDivElement | null>(null)

  // حالات تعديل العامل
  const [isEditingWorker, setIsEditingWorker] = useState(false)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  // حالات تعديل الحالة (للمدير فقط)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  const handleStatusChange = async (updates: { status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'; is_pre_booking?: boolean; needs_review?: boolean; has_alterations?: boolean }) => {
    if (!order) return
    setIsUpdatingStatus(true)
    try {
      await orderService.update(order.id, updates)
      await updateOrder(order.id, updates)
      // تحديث الـ local state مباشرة لتعكس التغيير في الواجهة فوراً
      const base = fullOrder || initialOrder
      if (base) {
        setFullOrder({ ...base, ...updates } as Order)
      }
      toast.success('تم تحديث الحالة')
      setShowStatusDropdown(false)
    } catch {
      toast.error('فشل تحديث الحالة')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // إغلاق dropdown عند النقر خارجه
  useEffect(() => {
    if (!showStatusDropdown) return
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showStatusDropdown])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map())

  // قائمة اللغات المتاحة للترجمة
  const availableLanguages = [
    { code: 'en', name: 'English', nameAr: 'الإنجليزية' },
    { code: 'hi', name: 'Hindi', nameAr: 'الهندية' },
    { code: 'bn', name: 'Bengali', nameAr: 'البنغالية' },
    { code: 'ur', name: 'Urdu', nameAr: 'الأوردو' },
    { code: 'ar', name: 'Arabic', nameAr: 'العربية' }
  ]

  // الحصول على اسم اللغة
  const getLanguageName = (code: string) => {
    const lang = availableLanguages.find(l => l.code === code)
    return lang ? lang.nameAr : code
  }

  // دالة تحويل الصورة إلى كرتون - تفتح modal الاختيار دائماً
  const handleConvertToCartoon = useCallback(async (imageToConvert?: string) => {
    if (imageToConvert) {
      // استدعاء مباشر من modal الاختيار بعد تحديد الصورة
      setIsConvertingToCartoon(true)
      try {
        const response = await fetch('/api/convert-to-cartoon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completedImage: imageToConvert })
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'فشل تحويل الصورة')
        }

        const generatedUrl: string = data.imageUrl
        setCartoonImage(generatedUrl)

        // حفظ الصورة في قاعدة البيانات
        if (order) {
          try {
            await orderService.update(order.id, {
              measurements: {
                ...(order.measurements || {}),
                cartoon_image: generatedUrl
              }
            })
            toast.success('تم تحويل الصورة وحفظها بنجاح')
          } catch {
            toast.success('تم تحويل الصورة بنجاح')
          }
        }
      } catch (err) {
        console.error('Cartoon conversion error:', err)
        toast.error(err instanceof Error ? err.message : 'فشل تحويل الصورة إلى كرتون')
      } finally {
        setIsConvertingToCartoon(false)
      }
    } else {
      // فتح modal الاختيار دائماً
      setCartoonUploadImage(null)
      setShowCartoonUploadModal(true)
    }
  }, [order])

  // طباعة صورة الكرتون
  const handlePrintCartoonImage = useCallback((imageUrl: string) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('تعذر فتح نافذة الطباعة')
      return
    }
    const secondPageUrl = `${window.location.origin}/image.png`
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <title>طباعة التصميم الكرتوني</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: white; }
            .page { display: flex; justify-content: center; align-items: center; width: 100%; height: 100vh; page-break-after: always; }
            .page:last-child { page-break-after: avoid; }
            img { max-width: 100%; max-height: 100vh; object-fit: contain; }
            @media print {
              body { margin: 0; }
              .page { height: 100vh; page-break-after: always; }
              .page:last-child { page-break-after: avoid; }
              img { width: 100%; height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="page"><img id="img1" src="${imageUrl}" /></div>
          <div class="page"><img id="img2" src="${secondPageUrl}" /></div>
          <script>
            var loaded = 0;
            function onImgLoad() { loaded++; if (loaded >= 2) { window.print(); window.close(); } }
            document.getElementById('img1').onload = onImgLoad;
            document.getElementById('img2').onload = onImgLoad;
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }, [])

  // دالة حذف الصورة الكرتونية نهائياً
  const handleDeleteCartoonImage = useCallback(async () => {
    if (!order) return
    setCartoonImage(null)
    try {
      await orderService.update(order.id, {
        measurements: {
          ...(order.measurements || {}),
          cartoon_image: null
        }
      })
      toast.success('تم حذف الصورة الكرتونية')
    } catch {
      toast.error('فشل حذف الصورة')
    }
  }, [order])

  // Fetch full order data when opened with lightweight-loaded order
  // إعادة تهيئة localAiImages عند تغيير الطلب لمنع التسريب بين الطلبات
  useEffect(() => {
    if (initialOrder?.id && initialOrder.id !== prevOrderIdRef.current) {
      prevOrderIdRef.current = initialOrder.id
      setLocalAiImages([])
      setCartoonImage(null)
      setCartoonUploadImage(null)
    }
  }, [initialOrder?.id])

  // (needed for voice_transcriptions, completed_images which aren't in list columns)
  useEffect(() => {
    if (!isOpen || !initialOrder) {
      setFullOrder(null)
      return
    }

    // If measurements is already present, the order is fully loaded
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

  // Fetch measurements separately (lighter than getById - only measurements column)
  // Design comments load from here faster than waiting for the full getById call
  useEffect(() => {
    if (!isOpen || !initialOrder) {
      setMeasurementsData(null)
      setIsMeasurementsLoading(false)
      return
    }

    // If measurements is already present in the order, use it directly
    // but merge in design_comments/image_annotations/image_drawings from their
    // independent columns (migration 30) — raw measurements column lacks them.
    if (initialOrder.measurements !== undefined) {
      const rawMeasurements = (initialOrder.measurements as any) || {}
      const orderAny = initialOrder as any
      const designComments = orderAny.design_comments
      setMeasurementsData({
        ...rawMeasurements,
        saved_design_comments: designComments?.length
          ? designComments
          : (rawMeasurements.saved_design_comments || []),
        image_annotations: orderAny.image_annotations?.length
          ? orderAny.image_annotations
          : (rawMeasurements.image_annotations || []),
        image_drawings: orderAny.image_drawings?.length
          ? orderAny.image_drawings
          : (rawMeasurements.image_drawings || []),
      })
      setIsMeasurementsLoading(false)
      return
    }

    let cancelled = false
    setIsMeasurementsLoading(true)

    orderService.getMeasurements(initialOrder.id)
      .then((result) => {
        if (cancelled || result.error) return
        setMeasurementsData(result.data || {})
      })
      .finally(() => {
        if (!cancelled) setIsMeasurementsLoading(false)
      })

    return () => { cancelled = true }
  }, [isOpen, initialOrder?.id, initialOrder?.measurements])

  // تحديث الملاحظات الصوتية عند وصول بيانات الطلب الكاملة (voice_transcriptions)
  useEffect(() => {
    if (order) {
      const initialVoiceNotes = (order as any).voice_transcriptions && Array.isArray((order as any).voice_transcriptions)
        ? (order as any).voice_transcriptions
        : order.voice_notes?.map((vn, idx) => ({
          id: `vn-${idx}`,
          data: vn,
          timestamp: Date.now()
        })) || []
      setVoiceNotes(initialVoiceNotes)
    }
  }, [order])

  // استخراج تعليقات التصميم من measurementsData (أسرع - يصل قبل fullOrder)
  useEffect(() => {
    if (measurementsData) {
      setSavedDesignComments(measurementsData.saved_design_comments || [])
      setImageAnnotations(measurementsData.image_annotations || [])
      setImageDrawings(measurementsData.image_drawings || [])
      setCustomDesignImage(measurementsData.custom_design_image || null)
      if (measurementsData.cartoon_image) {
        setCartoonImage(measurementsData.cartoon_image)
      }
    } else {
      setSavedDesignComments([])
      setImageAnnotations([])
      setImageDrawings([])
      setCustomDesignImage(null)
    }
  }, [measurementsData])

  // فتح تعليق الأمام تلقائياً للعامل + حفظ design_thumbnail تلقائياً إذا لم يكن موجوداً
  useEffect(() => {
    if (savedDesignComments.length === 0) return

    // فتح تعليق الأمام للعامل
    if (user?.role === 'worker') {
      const frontComment = savedDesignComments.find(
        c => c.view === 'front' || c.title?.startsWith('أمام')
      )
      setExpandedCommentId(frontComment ? frontComment.id : savedDesignComments[0].id)
    }

    // حفظ design_thumbnail إذا لم يكن موجوداً — عمود مستقل (migration 32)
    if (initialOrder && !initialOrder.design_thumbnail) {
      const frontComment = savedDesignComments.find(
        c => c.view === 'front' || c.title?.startsWith('أمام')
      ) || savedDesignComments[0]
      if (frontComment?.compositeImage) {
        const img = new window.Image()
        img.onload = () => {
          const TARGET_HEIGHT = 320
          const ratio = TARGET_HEIGHT / img.height
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * ratio)
          canvas.height = TARGET_HEIGHT
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const thumbnail = canvas.toDataURL('image/jpeg', 0.55)
          // حفظ الـ thumbnail في عموده المستقل — لا يمس measurements
          if (order) {
            updateOrder(order.id, {
              design_thumbnail: thumbnail
            }).catch(() => {/* تجاهل أخطاء الحفظ الصامت */})
          }
        }
        img.src = frontComment.compositeImage
      }
    }
  }, [savedDesignComments, user?.role])

  // Re-fetch data when the app resumes from background (mobile).
  // On mobile, going to home screen and back can leave the component with
  // stale/empty data if the Supabase token was expired when the original fetch ran.
  useAppResume(() => {
    if (!isOpen || !initialOrder) return
    // Skip if measurements were already present in the initial order
    if (initialOrder.measurements !== undefined) return

    console.log('🔄 OrderModal: re-fetching data after app resume')

    // Re-fetch measurements (lightweight — only the measurements column)
    orderService.getMeasurements(initialOrder.id).then((result) => {
      if (result.data && Object.keys(result.data).length > 0) {
        setMeasurementsData(result.data)
      }
    })

    // Re-fetch full order
    orderService.getById(initialOrder.id).then((result) => {
      if (result.data) {
        setFullOrder(result.data)
      }
    })
  })

  // تحديث حالة العامل المحدد عند فتح المودال
  useEffect(() => {
    if (order) {
      setSelectedWorkerId(order.worker_id || '')
    }
  }, [order])

  // حفظ تغيير العامل
  const handleSaveWorker = async (workerId?: string) => {
    if (!order) return

    const idToSave = workerId !== undefined ? workerId : selectedWorkerId
    setIsLoading(true)
    try {
      const result = await updateOrder(order.id, { worker_id: idToSave || null })

      if (result.success) {
        setIsEditingWorker(false)
        toast.success(t('worker_updated_successfully') || 'تم تحديث العامل بنجاح')
      } else {
        toast.error(result.error || 'فشل تحديث العامل')
      }
    } catch (error) {
      console.error('Error updating worker:', error)
      toast.error('حدث خطأ غير متوقع')
    } finally {
      setIsLoading(false)
    }
  }

  // تشغيل/إيقاف الصوت للتعليق
  const toggleAnnotationAudio = (annotation: ImageAnnotation) => {
    if (!annotation.audioData) return

    if (playingAudioId === annotation.id) {
      // إيقاف الصوت
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingAudioId(null)
    } else {
      // إيقاف أي صوت يعمل حالياً
      if (audioRef.current) {
        audioRef.current.pause()
      }

      // تشغيل الصوت الجديد
      const audio = new Audio(annotation.audioData)
      audio.onended = () => setPlayingAudioId(null)
      audio.play()
      audioRef.current = audio
      setPlayingAudioId(annotation.id)
    }
  }

  // ترجمة تعليق التصميم
  const translateAnnotation = async (commentId: string, annotationId: string, targetLang: string) => {
    const comment = savedDesignComments.find(c => c.id === commentId)
    if (!comment) return

    const annotation = comment.annotations.find(a => a.id === annotationId)
    if (!annotation || !annotation.transcription) return

    setTranslatingAnnotationId(annotationId)

    try {
      const response = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: annotation.transcription,
          targetLanguage: targetLang
        })
      })

      if (!response.ok) throw new Error('Translation failed')

      const data = await response.json()

      // Update the comment with the translated text
      const updatedComments = savedDesignComments.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            annotations: c.annotations.map(a =>
              a.id === annotationId
                ? { ...a, translatedText: data.translatedText, translationLanguage: targetLang }
                : a
            )
          }
        }
        return c
      })
      setSavedDesignComments(updatedComments)

      // Save to localStorage
      if (user?.id) {
        try {
          const storageKey = `yasmin_annotation_trans_${user.id}_${commentId}_${annotationId}`
          localStorage.setItem(storageKey, JSON.stringify({
            translatedText: data.translatedText,
            translationLanguage: targetLang
          }))
        } catch (e) {
          console.error('Error saving translation:', e)
        }
      }

    } catch (error) {
      console.error('Translation error:', error)
    } finally {
      setTranslatingAnnotationId(null)
    }
  }

  // Load saved design comment translations
  useEffect(() => {
    if (!user?.id || savedDesignComments.length === 0) return

    let hasChanges = false
    const updatedComments = savedDesignComments.map(c => ({
      ...c,
      annotations: c.annotations.map(a => {
        const storageKey = `yasmin_annotation_trans_${user.id}_${c.id}_${a.id}`
        const saved = localStorage.getItem(storageKey)
        if (saved && !a.translatedText) {
          try {
            const parsed = JSON.parse(saved)
            hasChanges = true
            return { ...a, translatedText: parsed.translatedText, translationLanguage: parsed.translationLanguage }
          } catch { return a }
        }
        return a
      })
    }))

    if (hasChanges) {
      setSavedDesignComments(updatedComments)
    }
  }, [user?.id, savedDesignComments.length]) // Use length to avoid loop, assumes comments don't change content deeply without length change often inside modal


  // إغلاق قائمة اللغات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAnnotationLanguageDropdown) {
        const target = event.target as HTMLElement
        if (!target.closest('.annotation-language-dropdown-container')) {
          setShowAnnotationLanguageDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAnnotationLanguageDropdown])

  // دالة لرسم الخطوط على canvas (overlay فوق <img>)
  // ملاحظة: لا نمرر baseImage لأن هذا canvas شفاف فوق عنصر <img>.
  // الممحاة تستخدم destination-out لجعل البكسلات شفافة → الصورة أسفل الـ <img> تظهر بشكل طبيعي.
  // تمرير baseImage كان يسبب ظهور خطوط بيضاء بحدود واضحة لأن eraseWithBaseImage
  // يضيف بكسلات مرئية على الطبقة الشفافة.
  const drawPathsOnCanvas = async (
    canvas: HTMLCanvasElement,
    drawings: DrawingPath[],
    imageSrc: string,
    retryCount: number = 0
  ) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // تحديث أبعاد canvas لتتوافق مع حجم العرض الفعلي بعد اكتمال التحميل.
    const displayWidth = Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 0)
    const displayHeight = Math.round(canvas.clientHeight || canvas.parentElement?.clientHeight || 0)
    if (displayWidth <= 0 || displayHeight <= 0) {
      if (retryCount < 12) {
        setTimeout(() => {
          void drawPathsOnCanvas(canvas, drawings, imageSrc, retryCount + 1)
        }, 50)
      }
      return
    }
    canvas.width = displayWidth
    canvas.height = displayHeight

    // مسح canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // رسم بدون baseImage: الممحاة تستخدم destination-out (شفافية) بدلاً من clip+redraw
    renderDrawingsOnCanvas(ctx, drawings, canvas.width, canvas.height)
  }

  // رسم الخطوط على canvas للتعليقات القديمة
  useEffect(() => {
    if (!canvasRef.current || imageDrawings.length === 0) return
    const imageSrc = customDesignImage || "/front2.png"
    drawPathsOnCanvas(canvasRef.current, imageDrawings, imageSrc)
  }, [imageDrawings, customDesignImage])

  // رسم الخطوط على canvas للتعليقات المتعددة عند التوسيع
  useEffect(() => {
    if (!expandedCommentId) return

    const comment = savedDesignComments.find(c => c.id === expandedCommentId)
    if (!comment || !comment.drawings || comment.drawings.length === 0) return

    // انتظار قليلاً حتى يتم رسم Canvas في DOM
    const timer = setTimeout(() => {
      const canvas = canvasRefs.current.get(expandedCommentId)
      if (canvas) {
        const imageSrc = resolveCommentImageSrc(comment)
        drawPathsOnCanvas(canvas, comment.drawings || [], imageSrc)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [expandedCommentId, savedDesignComments, resolveCommentImageSrc])

  if (!order) return null

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return t('not_specified')
    const worker = workers.find(w => w.id === workerId)
    return worker ? (worker.user?.full_name || worker.full_name || worker.id) : t('not_specified')
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: {
        label: t('pending'),
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100'
      },
      in_progress: {
        label: t('in_progress'),
        color: 'text-blue-600',
        bgColor: 'bg-blue-100'
      },
      completed: {
        label: t('completed'),
        color: 'text-green-600',
        bgColor: 'bg-green-100'
      },
      delivered: {
        label: t('delivered'),
        color: 'text-purple-600',
        bgColor: 'bg-purple-100'
      },
      cancelled: {
        label: t('cancelled'),
        color: 'text-red-600',
        bgColor: 'bg-red-100'
      }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const parsed = parseDateForDisplay(dateString)
    if (!parsed) return dateString
    const day = String(parsed.getDate()).padStart(2, '0')
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const year = parsed.getFullYear()
    return `${day}/${month}/${year}`
  }

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <div key="order-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
                  {t('order_details')}
                </h2>
                <div className="flex items-center space-x-3 space-x-reverse">
                  {/* زر الطباعة - للمدراء فقط */}
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => setShowPrintModal(true)}
                      className="p-2 text-pink-500 hover:text-pink-700 hover:bg-pink-50 rounded-full transition-colors duration-300"
                      title={t('print_order')}
                    >
                      <Printer className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-300"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* محتوى النافذة */}
            <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
              {/* 1️⃣ القسم العلوي - معلومات الطلب الأساسية */}
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-3 sm:p-6 rounded-xl border border-pink-200">
                <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 flex items-center space-x-2 space-x-reverse">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600" />
                  <span>{t('order_info')}</span>
                </h3>

                <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                  {/* اسم العميل */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <User className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('name')}:</span>
                    </div>
                    <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">{order.client_name}</p>
                  </div>

                  {/* رقم الطلب */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <Package className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('order_number')}:</span>
                    </div>
                    <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">{order.order_number || order.id}</p>
                  </div>

                  {/* نوع القماش */}
                  {order.fabric && (
                    <div className="bg-white p-2 sm:p-3 rounded-lg">
                      <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                        <Package className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium truncate">{t('fabric_type')}:</span>
                      </div>
                      <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">{order.fabric}</p>
                    </div>
                  )}

                  {/* موعد التسليم */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('due_date')}:</span>
                    </div>
                    <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">{formatDate(order.due_date)}</p>
                  </div>

                  {/* موعد تسليم البروفا */}
                  {order.proof_delivery_date && (
                    <div className="bg-white p-2 sm:p-3 rounded-lg">
                      <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium truncate">{t('proof_delivery_date')}:</span>
                      </div>
                      <p className="text-xs sm:text-base font-semibold text-green-600 truncate">{formatDate(order.proof_delivery_date)}</p>
                    </div>
                  )}

                  {/* العامل المسؤول - مع إمكانية التعديل للمشرفين */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                      <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600">
                        <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium truncate">{t('assigned_worker')}:</span>
                      </div>

                      {/* زر التعديل للمشرفين */}
                      {!isEditingWorker && (user?.role === 'admin' || (workerType === 'workshop_manager' && order.status !== 'completed')) && (
                        <button
                          onClick={() => setIsEditingWorker(true)}
                          className="text-pink-600 hover:text-pink-800 p-0.5 rounded transition-colors"
                          title={t('edit') || 'تعديل'}
                        >
                          <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      )}
                    </div>

                    {isEditingWorker ? (
                      <div className="flex items-center gap-1 mt-1">
                        <select
                          className="flex-1 text-xs border border-gray-300 rounded px-1 py-1 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none"
                          value={selectedWorkerId || ''}
                          onChange={(e) => {
                            const newId = e.target.value
                            setSelectedWorkerId(newId)
                            handleSaveWorker(newId)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isLoading}
                        >
                          <option value="">{t('select_worker')}</option>
                          {workers
                            .filter(worker => worker.worker_type === 'tailor' && worker.is_available)
                            .map(worker => (
                              <option key={worker.id} value={worker.id}>
                                {getWorkerName(worker.id)}
                              </option>
                            ))}
                        </select>
                        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-pink-500 flex-shrink-0" />}
                        <button
                          onClick={() => {
                            setIsEditingWorker(false)
                            setSelectedWorkerId(order.worker_id || '')
                          }}
                          className="bg-gray-200 text-gray-600 p-1 rounded hover:bg-gray-300 transition-colors flex-shrink-0"
                          title={t('cancel') || 'إلغاء'}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">
                        {getWorkerName(selectedWorkerId || order.worker_id)}
                      </p>
                    )}
                  </div>

                  {/* الحالة */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('status')}:</span>
                    </div>

                    {user?.role === 'admin' ? (
                      <div className="relative" ref={statusDropdownRef}>
                        {/* Badge قابل للنقر */}
                        <button
                          onClick={() => setShowStatusDropdown(v => !v)}
                          disabled={isUpdatingStatus}
                          className={`inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium transition-all ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color} hover:opacity-80 cursor-pointer`}
                        >
                          {isUpdatingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          {getStatusInfo(order.status).label}
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </button>

                        {/* Dropdown */}
                        {showStatusDropdown && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[180px] overflow-hidden">
                            {/* الحالات الأساسية */}
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                              الحالة الأساسية
                            </div>
                            {([
                              { value: 'pending'     as const, label: 'في الانتظار', color: 'text-yellow-700', bg: 'hover:bg-yellow-50' },
                              { value: 'in_progress' as const, label: 'قيد التنفيذ', color: 'text-blue-700',   bg: 'hover:bg-blue-50'   },
                              { value: 'completed'   as const, label: 'مكتمل',        color: 'text-green-700',  bg: 'hover:bg-green-50'  },
                              { value: 'delivered'   as const, label: 'تم التسليم',   color: 'text-purple-700', bg: 'hover:bg-purple-50' },
                            ] as const).map(s => (
                              <button
                                key={s.value}
                                onClick={() => handleStatusChange({ status: s.value })}
                                className={`w-full text-right px-3 py-2 text-sm ${s.color} ${s.bg} flex items-center gap-2 transition-colors`}
                              >
                                {order.status === s.value && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                                <span className={order.status === s.value ? 'font-bold' : ''}>{s.label}</span>
                              </button>
                            ))}

                            {/* الحالات الإضافية */}
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-t border-b border-gray-100 mt-1">
                              حالات إضافية
                            </div>
                            <button
                              onClick={() => handleStatusChange({ is_pre_booking: !(order as any).is_pre_booking })}
                              className="w-full text-right px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-2 transition-colors"
                            >
                              {(order as any).is_pre_booking && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                              <span className={(order as any).is_pre_booking ? 'font-bold' : ''}>
                                حجز مسبق {(order as any).is_pre_booking ? '✓' : ''}
                              </span>
                            </button>
                            <button
                              onClick={() => handleStatusChange({ needs_review: !(order as any).needs_review })}
                              className="w-full text-right px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-2 transition-colors"
                            >
                              {(order as any).needs_review && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                              <span className={(order as any).needs_review ? 'font-bold' : ''}>
                                يحتاج مراجعة {(order as any).needs_review ? '✓' : ''}
                              </span>
                            </button>
                            <button
                              onClick={() => handleStatusChange({ has_alterations: !(order as any).has_alterations })}
                              className="w-full text-right px-3 py-2 text-sm text-purple-700 hover:bg-purple-50 flex items-center gap-2 transition-colors"
                            >
                              {(order as any).has_alterations && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                              <span className={(order as any).has_alterations ? 'font-bold' : ''}>
                                تعديل {(order as any).has_alterations ? '✓' : ''}
                              </span>
                            </button>
                          </div>
                        )}

                        {/* badges الحالات الإضافية الفعّالة */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(order as any).is_pre_booking && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700">حجز مسبق</span>
                          )}
                          {(order as any).needs_review && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">يحتاج مراجعة</span>
                          )}
                          {(order as any).has_alterations && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                              تعديل{(order as any).alteration_count > 1 ? ` (${(order as any).alteration_count})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* عرض فقط للغير مدراء */
                      <div>
                        <span className={`inline-block px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color} truncate max-w-full`}>
                          {getStatusInfo(order.status).label}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(order as any).is_pre_booking && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700">حجز مسبق</span>
                          )}
                          {(order as any).needs_review && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">يحتاج مراجعة</span>
                          )}
                          {(order as any).has_alterations && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                              تعديل{(order as any).alteration_count > 1 ? ` (${(order as any).alteration_count})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* رقم الهاتف - للجميع */}
                  {order.client_phone && (
                    <div className="bg-white p-2 sm:p-3 rounded-lg">
                      <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                        <Phone className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium truncate">{t('phone')}:</span>
                      </div>
                      <p className="text-xs sm:text-base font-semibold text-gray-800 truncate" dir="ltr">{order.client_phone}</p>
                    </div>
                  )}

                  {/* السعر - للمدراء فقط */}
                  {user?.role === 'admin' && (
                    <div className="bg-white p-2 sm:p-3 rounded-lg">
                      <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                        <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium truncate">{t('price')}:</span>
                      </div>
                      <p className="text-xs sm:text-base font-semibold text-green-600 truncate">{order.price} {t('sar')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 2️⃣ قسم الملاحظات - تصميم مدمج واحترافي */}
              {(order.notes || voiceNotes.length > 0) && (
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl border border-pink-200 overflow-hidden">
                  {/* شريط العنوان المدمج */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-pink-100/50 to-purple-100/50 border-b border-pink-200/50">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-pink-600" />
                      <span className="font-semibold text-gray-800 text-sm">{t('notes')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {order.notes && (
                        <span className="inline-flex items-center gap-1 bg-white/80 text-pink-700 text-xs px-2 py-0.5 rounded-full border border-pink-200">
                          <MessageSquare className="w-3 h-3" />
                          <span>1</span>
                        </span>
                      )}
                      {voiceNotes.length > 0 && (
                        <span className="inline-flex items-center gap-1 bg-white/80 text-purple-700 text-xs px-2 py-0.5 rounded-full border border-purple-200">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          <span>{voiceNotes.length}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* المحتوى */}
                  <div className="p-3 sm:p-4 space-y-3">
                    {/* الملاحظة النصية - تصميم مضغوط */}
                    {order.notes && (
                      <div className="bg-white rounded-lg p-3 border border-pink-100/80 shadow-sm">
                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{order.notes}</p>
                      </div>
                    )}

                    {/* الملاحظات الصوتية - مدمجة مباشرة */}
                    {voiceNotes.length > 0 && (
                      <VoiceNotes
                        voiceNotes={voiceNotes}
                        onVoiceNotesChange={setVoiceNotes}
                        readOnly={true}
                        orderId={order.id}
                      // workerId prop removed as we use user.id from auth store for local storage
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 3️⃣ قسم تعليقات التصميم */}
              {(savedDesignComments.length > 0 || imageAnnotations.length > 0 || imageDrawings.length > 0 || customDesignImage) && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Pencil className="w-5 h-5 text-pink-600" />
                    <span>{t('design_comments')}</span>
                    {savedDesignComments.length > 0 && (
                      <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full">
                        {t('comment_badge', { count: savedDesignComments.length })}
                      </span>
                    )}
                  </h3>

                  {/* عرض التعليقات المتعددة المحفوظة */}
                  {savedDesignComments.length > 0 && (
                    <div className="space-y-4">
                      {savedDesignComments.map((comment, commentIndex) => (
                        <div
                          key={comment.id}
                          className="bg-white rounded-xl border-2 border-pink-100 overflow-hidden"
                        >
                          {/* رأس التعليق */}
                          <button
                            onClick={() => setExpandedCommentId(expandedCommentId === comment.id ? null : comment.id)}
                            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-pink-50 to-purple-50 hover:from-pink-100 hover:to-purple-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                                {commentIndex + 1}
                              </div>
                              <span className="font-medium text-gray-800">
                                {comment.title
                                  ? comment.title.replace(/^أمام/, t('view_front')).replace(/^خلف/, t('view_back'))
                                  : `${t('comment_default_title')} ${commentIndex + 1}`}
                              </span>
                            </div>
                            <motion.div
                              animate={{ rotate: expandedCommentId === comment.id ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </motion.div>
                          </button>

                          {/* محتوى التعليق */}
                          <AnimatePresence>
                            {expandedCommentId === comment.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 space-y-4">
                                  {/* الصورة مع العلامات والرسومات */}
                                  <div className="relative rounded-xl overflow-hidden border border-pink-200">
                                    {/* إذا وجدت صورة مركّبة محفوظة، نعرضها مباشرة */}
                                    {comment.compositeImage ? (
                                      <img
                                        src={comment.compositeImage}
                                        alt={`${t('design_image_alt')} ${comment.title ? comment.title.replace(/^أمام/, t('view_front')).replace(/^خلف/, t('view_back')) : `${t('comment_default_title')} ${commentIndex + 1}`}`}
                                        className="w-full h-auto cursor-pointer"
                                        onClick={() => openLightbox(0, [comment.compositeImage!])}
                                      />
                                    ) : (
                                      <>
                                        <img
                                          src={resolveCommentImageSrc(comment)}
                                          alt={`${t('design_image_alt')} ${comment.title ? comment.title.replace(/^أمام/, t('view_front')).replace(/^خلف/, t('view_back')) : `${t('comment_default_title')} ${commentIndex + 1}`}`}
                                          className="w-full h-auto cursor-pointer"
                                          onClick={() => openLightbox(0, [resolveCommentImageSrc(comment)])}
                                          onLoad={() => {
                                            const canvas = canvasRefs.current.get(comment.id)
                                            if (canvas && comment.drawings && comment.drawings.length > 0) {
                                              const imageSrc = resolveCommentImageSrc(comment)
                                              void drawPathsOnCanvas(canvas, comment.drawings, imageSrc)
                                            }
                                          }}
                                        />
                                        {/* طبقة الرسومات - فقط إذا لم توجد صورة مركّبة */}
                                        {comment.drawings && comment.drawings.length > 0 && (
                                          <canvas
                                            ref={(el) => {
                                              if (el) {
                                                canvasRefs.current.set(comment.id, el)
                                                // رسم الخطوط مباشرة عند تعيين الـ ref
                                                const imageSrc = resolveCommentImageSrc(comment)
                                                drawPathsOnCanvas(el, comment.drawings || [], imageSrc)
                                              }
                                            }}
                                            className="absolute inset-0 w-full h-full pointer-events-none"
                                          />
                                        )}
                                        {/* علامات التعليقات - فقط إذا لم توجد صورة مركّبة */}
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

                                  {/* قائمة التعليقات الصوتية */}
                                  {comment.annotations && comment.annotations.length > 0 && (
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200" style={{ overflow: 'visible' }}>
                                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                                        {t('annotations_count', { count: comment.annotations.length })}
                                      </h4>
                                      <div className="space-y-2" style={{ overflow: 'visible' }}>
                                        {comment.annotations.map((annotation, idx) => (
                                          <div
                                            key={annotation.id}
                                            className="bg-white rounded-lg p-2 border border-gray-100 relative"
                                            style={{ overflow: 'visible' }}
                                          >
                                            <div className="flex items-start gap-2">
                                              <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {idx + 1}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                {annotation.transcription && (
                                                  <p className="text-sm text-gray-700 mb-1">{annotation.transcription}</p>
                                                )}
                                              </div>
                                              {/* أزرار التحكم */}
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                {/* زر تشغيل الصوت */}
                                                {annotation.audioData && (
                                                  <button
                                                    onClick={() => toggleAnnotationAudio(annotation)}
                                                    className={`p-1.5 rounded transition-colors ${playingAudioId === annotation.id
                                                      ? 'bg-green-500 text-white'
                                                      : 'text-green-600 hover:bg-green-50'
                                                      }`}
                                                    title={playingAudioId === annotation.id ? t('stop_audio') : t('play_audio')}
                                                  >
                                                    {playingAudioId === annotation.id ? (
                                                      <Pause className="w-4 h-4" />
                                                    ) : (
                                                      <Play className="w-4 h-4" />
                                                    )}
                                                  </button>
                                                )}
                                                {/* زر الترجمة مع dropdown */}
                                                {annotation.transcription && (
                                                  <div className="relative annotation-language-dropdown-container">
                                                    <button
                                                      type="button"
                                                      onClick={() => setShowAnnotationLanguageDropdown(
                                                        showAnnotationLanguageDropdown === annotation.id ? null : annotation.id
                                                      )}
                                                      disabled={translatingAnnotationId === annotation.id}
                                                      className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50 flex items-center gap-0.5"
                                                      title={t('translate')}
                                                    >
                                                      {translatingAnnotationId === annotation.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                      ) : (
                                                        <>
                                                          <Languages className="w-4 h-4" />
                                                          <ChevronDown className="w-3 h-3" />
                                                        </>
                                                      )}
                                                    </button>
                                                    <AnimatePresence>
                                                      {showAnnotationLanguageDropdown === annotation.id && (
                                                        <motion.div
                                                          initial={{ opacity: 0, y: -5, scale: 0.95 }}
                                                          animate={{ opacity: 1, y: 0, scale: 1 }}
                                                          exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                                          transition={{ duration: 0.15 }}
                                                          className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] min-w-[140px] overflow-hidden"
                                                        >
                                                          {availableLanguages.map((lang) => (
                                                            <button
                                                              key={lang.code}
                                                              type="button"
                                                              onClick={() => {
                                                                translateAnnotation(comment.id, annotation.id, lang.code)
                                                                setShowAnnotationLanguageDropdown(null)
                                                              }}
                                                              className={`w-full px-3 py-2 text-right text-sm hover:bg-purple-50 transition-colors ${annotation.translationLanguage === lang.code
                                                                ? 'bg-purple-100 text-purple-700 font-semibold'
                                                                : 'text-gray-700'
                                                                }`}
                                                            >
                                                              <div className="flex items-center justify-between gap-2">
                                                                <span className="text-xs text-gray-500">{lang.name}</span>
                                                                <span>{lang.nameAr}</span>
                                                              </div>
                                                            </button>
                                                          ))}
                                                        </motion.div>
                                                      )}
                                                    </AnimatePresence>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                            {/* عرض الترجمة في صندوق بنفسجي */}
                                            {annotation.translatedText && (
                                              <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-2 mr-7">
                                                <p className="text-xs text-purple-600 font-medium mb-0.5 flex items-center gap-1">
                                                  <Languages className="w-3 h-3" />
                                                  {t('translation_label')} ({getLanguageName(annotation.translationLanguage || 'en')})
                                                </p>
                                                <p className="text-sm text-gray-600" dir="auto">
                                                  {annotation.translatedText}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* عرض التعليق الحالي (للتوافق مع البيانات القديمة) */}
                  {savedDesignComments.length === 0 && (imageAnnotations.length > 0 || imageDrawings.length > 0 || customDesignImage) && (
                    <>
                      <div className="relative rounded-xl overflow-hidden border-2 border-pink-200 bg-white">
                        <div className="relative">
                          <img
                            src={customDesignImage || "/front2.png"}
                            alt={t('design_image_alt')}
                            className="w-full h-auto"
                            onClick={() => openLightbox(0, [customDesignImage || "/front2.png"])}
                            onLoad={() => {
                              if (canvasRef.current && imageDrawings.length > 0) {
                                const imageSrc = customDesignImage || "/front2.png"
                                void drawPathsOnCanvas(canvasRef.current, imageDrawings, imageSrc)
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          {imageDrawings.length > 0 && (
                            <canvas
                              ref={canvasRef}
                              className="absolute inset-0 w-full h-full pointer-events-none"
                            />
                          )}
                          {imageAnnotations.map((annotation, index) => (
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

                      {imageAnnotations.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200" style={{ overflow: 'visible' }}>
                          <h4 className="text-sm font-medium text-gray-700 mb-3">
                            {t('annotations_count', { count: imageAnnotations.length })}
                          </h4>
                          <div className="space-y-3" style={{ overflow: 'visible' }}>
                            {imageAnnotations.map((annotation, index) => (
                              <div
                                key={annotation.id}
                                className="bg-white rounded-lg p-3 border border-gray-100 relative"
                                style={{ overflow: 'visible' }}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {annotation.transcription && (
                                      <p className="text-sm text-gray-700 mb-2">{annotation.transcription}</p>
                                    )}
                                    {!annotation.transcription && !annotation.audioData && (
                                      <p className="text-sm text-gray-400 italic">{t('marker_without_comment')}</p>
                                    )}
                                  </div>
                                  {/* أزرار التحكم */}
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {/* زر تشغيل الصوت */}
                                    {annotation.audioData && (
                                      <button
                                        onClick={() => toggleAnnotationAudio(annotation)}
                                        className={`p-1.5 rounded transition-colors ${playingAudioId === annotation.id
                                          ? 'bg-green-500 text-white'
                                          : 'text-green-600 hover:bg-green-50'
                                          }`}
                                        title={playingAudioId === annotation.id ? t('stop_audio') : t('play_audio')}
                                      >
                                        {playingAudioId === annotation.id ? (
                                          <Pause className="w-4 h-4" />
                                        ) : (
                                          <Play className="w-4 h-4" />
                                        )}
                                      </button>
                                    )}
                                    {/* زر الترجمة مع dropdown */}
                                    {annotation.transcription && (
                                      <div className="relative annotation-language-dropdown-container">
                                        <button
                                          type="button"
                                          onClick={() => setShowAnnotationLanguageDropdown(
                                            showAnnotationLanguageDropdown === annotation.id ? null : annotation.id
                                          )}
                                          disabled={translatingAnnotationId === annotation.id}
                                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50 flex items-center gap-0.5"
                                          title={t('translate')}
                                        >
                                          {translatingAnnotationId === annotation.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            <>
                                              <Languages className="w-4 h-4" />
                                              <ChevronDown className="w-3 h-3" />
                                            </>
                                          )}
                                        </button>
                                        <AnimatePresence>
                                          {showAnnotationLanguageDropdown === annotation.id && (
                                            <motion.div
                                              initial={{ opacity: 0, y: -5, scale: 0.95 }}
                                              animate={{ opacity: 1, y: 0, scale: 1 }}
                                              exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                              transition={{ duration: 0.15 }}
                                              className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] min-w-[140px] overflow-hidden"
                                            >
                                              {availableLanguages.map((lang) => (
                                                <button
                                                  key={lang.code}
                                                  type="button"
                                                  onClick={async () => {
                                                    setShowAnnotationLanguageDropdown(null)
                                                    setTranslatingAnnotationId(annotation.id)
                                                    try {
                                                      const response = await fetch('/api/translate', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                          text: annotation.transcription,
                                                          targetLanguage: lang.code
                                                        })
                                                      })
                                                      if (response.ok) {
                                                        const data = await response.json()
                                                        setImageAnnotations(prev => prev.map(a =>
                                                          a.id === annotation.id
                                                            ? { ...a, translatedText: data.translatedText, translationLanguage: lang.code }
                                                            : a
                                                        ))
                                                      }
                                                    } catch (error) {
                                                      console.error('Translation error:', error)
                                                    } finally {
                                                      setTranslatingAnnotationId(null)
                                                    }
                                                  }}
                                                  className={`w-full px-3 py-2 text-right text-sm hover:bg-purple-50 transition-colors ${annotation.translationLanguage === lang.code
                                                    ? 'bg-purple-100 text-purple-700 font-semibold'
                                                    : 'text-gray-700'
                                                    }`}
                                                >
                                                  <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs text-gray-500">{lang.name}</span>
                                                    <span>{lang.nameAr}</span>
                                                  </div>
                                                </button>
                                              ))}
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {/* عرض الترجمة في صندوق بنفسجي */}
                                {annotation.translatedText && (
                                  <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-2 mr-9">
                                    <p className="text-xs text-purple-600 font-medium mb-0.5 flex items-center gap-1">
                                      <Languages className="w-3 h-3" />
                                      {t('translation_label')} ({getLanguageName(annotation.translationLanguage || 'en')})
                                    </p>
                                    <p className="text-sm text-gray-600" dir="auto">
                                      {annotation.translatedText}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 4️⃣ قسم المقاسات */}
              {(measurementsData || order.measurements) && Object.values(measurementsData || order.measurements || {}).some(val => val !== undefined && val !== '') && (
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Ruler className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600 flex-shrink-0" />
                    <span>
                      {t('measurements_cm')}
                    </span>
                  </h3>

                  {/* المقاسات الرقمية */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {MEASUREMENT_ORDER.filter(key => key !== 'additional_notes').map((key) => {
                      const value = (measurementsData || order.measurements as any)?.[key]
                      if (!value) return null

                      return (
                        <div key={key} className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                          <p className="text-xs sm:text-sm text-gray-600 mb-1">
                            {getMeasurementLabelWithSymbol(key as any)}
                          </p>
                          <p className="text-base sm:text-lg font-bold text-gray-800">{value}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* مقاسات إضافية */}
                  {(measurementsData || order.measurements as any)?.additional_notes && (
                    <div className="space-y-2">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-700 border-b border-pink-200 pb-2">
                        {t('measurement_additional_notes')}
                      </h4>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                        <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                          {(measurementsData || order.measurements as any)?.additional_notes}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5️⃣ قسم صور التصميم */}
              {order.images && order.images.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <ImageIcon className="w-5 h-5 text-pink-600" />
                    <span>{t('design_images')}</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {order.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <div className={`rounded-lg overflow-hidden border border-pink-200 ${isVideoFile(image) ? 'bg-black' : 'aspect-square'}`}>
                          {isVideoFile(image) ? (
                            <video
                              src={image}
                              controls
                              preload="metadata"
                              className="w-full object-contain cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <img
                              src={image}
                              alt={`${t('design_image')} ${index + 1}`}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                              onClick={() => openLightbox(index, order.images || [])}
                            />
                          )}
                        </div>
                        <div className="absolute bottom-2 left-2 bg-pink-600/80 text-white text-xs px-2 py-1 rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* أزرار الذكاء الاصطناعي */}
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex flex-wrap gap-3 items-start">
                      {workerType !== 'tailor' && <GenerateDesignButton
                        images={order.images || []}
                        designComments={savedDesignComments}
                        fabric={order.fabric}
                        fabricType={(order as any).fabric_type || (order.measurements as any)?.fabric_type || null}
                        generatedImages={[
                          // عمود مستقل (migration 33) مع fallback للبيانات القديمة
                          ...((order as any).ai_generated_images || (order.measurements as any)?.ai_generated_images || []),
                          ...localAiImages
                        ]}
                        onGenerated={async (imageDataUrl) => {
                          const dbImages = (order as any).ai_generated_images || (order.measurements as any)?.ai_generated_images || []
                          const newImages = [...dbImages, ...localAiImages, imageDataUrl]
                          setLocalAiImages(prev => [...prev, imageDataUrl])
                          try {
                            await orderService.update(order.id, {
                              ai_generated_images: newImages  // عمود مستقل (migration 33)
                            })
                            toast.success('تم حفظ التصميم المولد في الطلب')
                          } catch (err) {
                            console.error('Failed to save AI image:', err)
                            toast.error('تم توليد التصميم لكن فشل الحفظ التلقائي')
                          }
                        }}
                        onDeleteGeneratedImage={async (index) => {
                          const dbImages = Array.isArray((order as any).ai_generated_images) ? (order as any).ai_generated_images : ((order.measurements as any)?.ai_generated_images || [])
                          const allImages = [...dbImages, ...localAiImages]
                          const newImages = allImages.filter((_, i) => i !== index)
                          try {
                            await updateOrder(order.id, {
                              ai_generated_images: newImages  // عمود مستقل (migration 33)
                            })
                            setLocalAiImages([])
                            toast.success('تم حذف التصميم')
                          } catch (err) {
                            console.error('Failed to delete AI image:', err)
                            toast.error('فشل حذف التصميم')
                          }
                        }}
                      />}
                      {/* زر تحويل الصورة إلى كرتون */}
                      {showCartoonButton && (
                        <button
                          onClick={() => handleConvertToCartoon()}
                          disabled={isConvertingToCartoon}
                          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-l from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isConvertingToCartoon ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>{t('converting_to_cartoon')}</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-5 h-5" />
                              <span>{t('convert_to_cartoon')}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* قسم التصاميم المولدة - يظهر حتى لو لا توجد صور (بدون صور) */}
              {(!order.images || order.images.length === 0) && (
                <div className="flex flex-wrap gap-3 items-start">
                  {workerType !== 'tailor' && <GenerateDesignButton
                    images={order.images || []}
                    designComments={savedDesignComments}
                    fabric={order.fabric}
                    fabricType={(order as any).fabric_type || (order.measurements as any)?.fabric_type || null}
                    generatedImages={[
                      // عمود مستقل (migration 33) مع fallback للبيانات القديمة
                      ...((order as any).ai_generated_images || (order.measurements as any)?.ai_generated_images || []),
                      ...localAiImages
                    ]}
                    onGenerated={async (imageDataUrl) => {
                      const dbImages = (order as any).ai_generated_images || (order.measurements as any)?.ai_generated_images || []
                      const newImages = [...dbImages, ...localAiImages, imageDataUrl]
                      setLocalAiImages(prev => [...prev, imageDataUrl])
                      try {
                        await orderService.update(order.id, {
                          ai_generated_images: newImages  // عمود مستقل (migration 33)
                        })
                        toast.success('تم حفظ التصميم المولد في الطلب')
                      } catch {
                        toast.error('تم توليد التصميم لكن فشل الحفظ التلقائي')
                      }
                    }}
                    onDeleteGeneratedImage={async (index) => {
                      const dbImages = Array.isArray((order as any).ai_generated_images) ? (order as any).ai_generated_images : ((order.measurements as any)?.ai_generated_images || [])
                      const allImages = [...dbImages, ...localAiImages]
                      const newImages = allImages.filter((_, i) => i !== index)
                      try {
                        await updateOrder(order.id, {
                          ai_generated_images: newImages  // عمود مستقل (migration 33)
                        })
                        setLocalAiImages([])
                        toast.success('تم حذف التصميم')
                      } catch (err) {
                        console.error('Failed to delete AI image:', err)
                        toast.error('فشل حذف التصميم')
                      }
                    }}
                  />}
                  {/* زر تحويل الصورة إلى كرتون */}
                  {showCartoonButton && (
                    <button
                      onClick={() => handleConvertToCartoon()}
                      disabled={isConvertingToCartoon}
                      className="flex items-center gap-2 px-5 py-3 bg-gradient-to-l from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConvertingToCartoon ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>جاري التحويل...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5" />
                          <span>تحويل الصورة الى كرتون</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* روابط التصميم */}
              {(order as any).design_links && (order as any).design_links.trim() && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Link2 className="w-5 h-5 text-pink-600" />
                    <span>{t('design_links')}</span>
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
                    {(order as any).design_links.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => {
                      const trimmed = line.trim()
                      const isUrl = /^https?:\/\//i.test(trimmed)
                      return isUrl ? (
                        <a
                          key={i}
                          href={trimmed}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-pink-600 hover:text-pink-700 hover:underline break-all"
                        >
                          <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
                          {trimmed}
                        </a>
                      ) : (
                        <p key={i} className="text-sm text-gray-700 break-all">{trimmed}</p>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* صور العمل المكتمل */}
              {order.completed_images && order.completed_images.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span>{t('completed_work_images')}</span>
                  </h3>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center space-x-2 space-x-reverse mb-3">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
                        {t('completed_work_description')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {order.completed_images.map((image, index) => (
                        <div key={index} className="relative group">
                          <div className={`rounded-lg overflow-hidden border border-green-300 ${isVideoFile(image) ? 'bg-black' : 'aspect-square'}`}>
                            {isVideoFile(image) ? (
                              <video
                                src={image}
                                controls
                                preload="metadata"
                                className="w-full object-contain cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <img
                                src={image}
                                alt={`${t('completed_work_image_alt')} ${index + 1}`}
                                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                onClick={() => openLightbox(index, order.completed_images || [])}
                              />
                            )}
                          </div>
                          <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-xs px-2 py-1 rounded">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {order.worker_completed_at && (
                    <div className="flex items-center gap-2 mt-3 text-sm text-green-700">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <span>
                        {t('worker_completed_at_label')}:{' '}
                        <span className="font-semibold">
                          {(() => {
                            const d = new Date(order.worker_completed_at!)
                            const day = String(d.getDate()).padStart(2, '0')
                            const month = String(d.getMonth() + 1).padStart(2, '0')
                            const year = d.getFullYear()
                            const hours = String(d.getHours()).padStart(2, '0')
                            const minutes = String(d.getMinutes()).padStart(2, '0')
                            return `${day}/${month}/${year} ${hours}:${minutes}`
                          })()}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* قسم الصورة الكرتونية المولدة */}
              {cartoonImage && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Wand2 className="w-5 h-5 text-purple-600" />
                    <span>{t('cartoon_design')}</span>
                  </h3>
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-3">
                    <div ref={cartoonImageRef} className="relative rounded-lg overflow-hidden border border-purple-300">
                      <img
                        src={cartoonImage}
                        alt={t('cartoon_design')}
                        className="w-full object-contain max-h-[500px] cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => openLightbox(0, [cartoonImage])}
                      />
                      {/* زر الطباعة فوق الصورة */}
                      <button
                        onClick={() => handlePrintCartoonImage(cartoonImage)}
                        className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 hover:bg-white text-purple-700 rounded-lg text-sm font-medium shadow-md border border-purple-200 transition-all duration-200"
                        title={t('print_image')}
                      >
                        <PrinterIcon className="w-4 h-4" />
                        <span>{t('print')}</span>
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleConvertToCartoon()}
                        disabled={isConvertingToCartoon}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {isConvertingToCartoon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        <span>{t('regenerate')}</span>
                      </button>
                      <button
                        onClick={() => {
                          const a = document.createElement('a')
                          a.href = cartoonImage
                          a.download = `cartoon-${order?.client_name || 'design'}-${Date.now()}.png`
                          a.click()
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium border border-green-200 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>تحميل</span>
                      </button>
                      <button
                        onClick={() => handlePrintCartoonImage(cartoonImage)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium border border-gray-200 transition-colors"
                      >
                        <Printer className="w-4 h-4" />
                        <span>{t('print')}</span>
                      </button>
                      <button
                        onClick={handleDeleteCartoonImage}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium border border-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{t('delete')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* تذييل النافذة */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
              <div className="flex justify-end items-center gap-3">
                {/* أزرار العامل - بدء العمل وإنهاء الطلب */}
                {user?.role === 'worker' && currentWorkerId && order.worker_id === currentWorkerId && (
                  <>
                    {order.status === 'pending' && onStartWork && (
                      <button
                        onClick={() => { onStartWork(order.id); onClose() }}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Package className="w-4 h-4" />
                        )}
                        <span>{t('start_work') || 'بدء العمل'}</span>
                      </button>
                    )}
                    {order.status === 'in_progress' && onCompleteWork && (
                      <button
                        onClick={() => { onClose(); onCompleteWork(order) }}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        <span>{t('complete_order') || 'إنهاء الطلب'}</span>
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={onClose}
                  className="btn-secondary px-6 py-2"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </motion.div>

          {/* مودال اختيار صورة للتحويل إلى كرتون */}
          {showCartoonUploadModal && (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => { setShowCartoonUploadModal(false); setCartoonUploadImage(null) }}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
              >
                {/* العنوان */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-purple-600" />
                    <span>اختر صورة للتحويل</span>
                  </h3>
                  <button
                    onClick={() => { setShowCartoonUploadModal(false); setCartoonUploadImage(null) }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                {/* معاينة الصورة المختارة */}
                {cartoonUploadImage && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">الصورة المختارة:</p>
                    <div className="relative rounded-xl overflow-hidden border-2 border-purple-400 max-h-56">
                      <img src={cartoonUploadImage} alt="الصورة المختارة" className="w-full object-contain max-h-56" />
                      <button
                        onClick={() => setCartoonUploadImage(null)}
                        className="absolute top-2 left-2 w-7 h-7 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow-md transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                    </div>
                  </div>
                )}

                {/* صور العمل المكتمل الموجودة */}
                {(() => {
                  const completedImgs = (order?.completed_images || []).filter((img: string) => img && !isVideoFile(img))
                  if (completedImgs.length === 0) return null
                  return (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-700">صور العمل المكتمل:</p>
                      <div className="grid grid-cols-3 gap-2">
                        {completedImgs.map((img: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setCartoonUploadImage(img)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square ${cartoonUploadImage === img ? 'border-purple-500 ring-2 ring-purple-300' : 'border-gray-200 hover:border-purple-300'}`}
                          >
                            <img src={img} alt={`صورة ${idx + 1}`} className="w-full h-full object-cover" />
                            {cartoonUploadImage === img && (
                              <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-purple-600" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* رفع صورة مختلفة */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">أو ارفع صورة مختلفة:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {/* من المعرض */}
                    <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors">
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-sm font-medium text-gray-600">من المعرض</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = (ev) => setCartoonUploadImage(ev.target?.result as string)
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {/* من الكاميرا */}
                    <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
                      <Camera className="w-6 h-6 text-gray-400" />
                      <span className="text-sm font-medium text-gray-600">الكاميرا</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = (ev) => setCartoonUploadImage(ev.target?.result as string)
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* أزرار التأكيد */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => {
                      if (!cartoonUploadImage) return
                      const img = cartoonUploadImage
                      setShowCartoonUploadModal(false)
                      setCartoonUploadImage(null)
                      handleConvertToCartoon(img)
                    }}
                    disabled={!cartoonUploadImage}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-l from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>تحويل إلى كرتون</span>
                  </button>
                  <button
                    onClick={() => { setShowCartoonUploadModal(false); setCartoonUploadImage(null) }}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* مودال الطباعة */}
      {showPrintModal && order && (
        <PrintOrderModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          order={order}
          onPrint={async () => {
            try {
              // is_printed عمود مستقل (migration 29)
              if (order.is_printed !== true) {
                await updateOrder(order.id, { is_printed: true })
              }
            } catch (error) {
              console.error('Error marking order as printed:', error)
            }
          }}
        />
      )}
    </AnimatePresence>

    {/* Lightbox لعرض الصور بالحجم الكامل - خارج AnimatePresence لتجنب تداخل framer-motion */}
    {isClientMounted && lightboxIndex !== null && lightboxImages[lightboxIndex] && createPortal(
      <div
        className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm"
        onClick={closeLightbox}
      >
        <div
          className="relative h-full w-full flex items-center justify-center px-4 sm:px-8 py-16"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeLightbox()
            }}
            className="absolute top-4 right-4 w-11 h-11 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="absolute top-5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 text-white text-sm z-20">
            {lightboxIndex + 1} / {lightboxImages.length}
          </div>

          {canNavigateLightbox && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                showNextImage()
              }}
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {canNavigateLightbox && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                showPreviousImage()
              }}
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {isVideoFile(lightboxImages[lightboxIndex]) ? (
            <video
              key={lightboxImages[lightboxIndex]}
              src={lightboxImages[lightboxIndex]}
              controls
              preload="metadata"
              className="max-w-full max-h-[calc(100vh-11rem)] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              key={lightboxImages[lightboxIndex]}
              src={lightboxImages[lightboxIndex]}
              alt="عرض كامل"
              className="max-w-full max-h-[calc(100vh-11rem)] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {canNavigateLightbox && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,760px)] z-20">
              <div className="bg-black/45 backdrop-blur-md rounded-xl p-2 flex items-center gap-2 overflow-x-auto">
                {lightboxImages.map((img, thumbIndex) => (
                  <button
                    key={thumbIndex}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightboxIndex(thumbIndex)
                    }}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${thumbIndex === lightboxIndex
                      ? 'border-pink-400 opacity-100'
                      : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`Thumbnail ${thumbIndex + 1}`}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body
    )}
  </>
  )
}
