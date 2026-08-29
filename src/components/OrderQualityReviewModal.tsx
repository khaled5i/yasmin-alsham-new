'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Images,
  Loader2,
  MessageCircle,
  Mic,
  RefreshCw,
  RotateCcw,
  Ruler,
  X,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DesignSummaryRecorder from '@/components/DesignSummaryRecorder'
import { cleanTranscriptText, recordingBlobToWav } from '@/lib/audio-utils'
import { orderQualityReviewService } from '@/lib/services/order-quality-review-service'
import { orderService } from '@/lib/services/order-service'
import { MEASUREMENT_LABELS, MEASUREMENT_ORDER } from '@/types/measurements'
import type { DesignSummaryNote } from '@/types/design-comments'
import type {
  OrderQualityMeasurementCheck,
  OrderQualityReview,
  OrderQualityReviewStage,
} from '@/types/order-quality-review'

interface ReviewOrderSummary {
  id: string
  order_number?: string | null
  client_name?: string | null
  client_phone?: string | null
}

interface Props {
  isOpen: boolean
  order: ReviewOrderSummary | null
  stage: OrderQualityReviewStage | null
  language: 'ar' | 'en'
  onClose: () => void
  onReviewSaved: (review: OrderQualityReview) => Promise<void> | void
}

type Screen = 'loading' | 'test' | 'summary' | 'success'
type TestStep = 'measurements' | 'design' | 'discrepancy'

const REVIEW_EXCLUDED_MEASUREMENT_KEYS = new Set([
  'image_annotations',
  'image_drawings',
  'custom_design_image',
  'saved_design_comments',
  'design_comments',
  'cartoon_image',
  'ai_generated_images',
  'design_thumbnail',
  'design_summary_notes',
  'is_printed',
  'has_measurements',
  'whatsapp_sent',
  'needs_review',
  'is_pre_booking',
  'fabric_type',
])

const LEGACY_MEASUREMENT_LABELS: Record<string, { ar: string; en: string }> = {
  shoulder: { ar: 'الكتف', en: 'Shoulder' },
  shoulderCircumference: { ar: 'دوران الكتف', en: 'Shoulder Circumference' },
  chest: { ar: 'الصدر', en: 'Chest' },
  waist: { ar: 'الخصر', en: 'Waist' },
  hips: { ar: 'الأرداف', en: 'Hips' },
  dartLength: { ar: 'طول البنس', en: 'Dart Length' },
  bodiceLength: { ar: 'طول الصدرية', en: 'Bodice Length' },
  neckline: { ar: 'فتحة الصدر', en: 'Neckline' },
  armpit: { ar: 'الإبط', en: 'Armpit' },
  sleeveLength: { ar: 'طول الكم', en: 'Sleeve Length' },
  forearm: { ar: 'الزند', en: 'Forearm' },
  cuff: { ar: 'الإسوارة', en: 'Cuff' },
  frontLength: { ar: 'طول الأمام', en: 'Front Length' },
  backLength: { ar: 'طول الخلف', en: 'Back Length' },
}

const COPY = {
  ar: {
    loading: 'جارٍ تجهيز المراجعة...',
    loadError: 'تعذّر تحميل بيانات المراجعة',
    close: 'إغلاق',
    order: 'الطلب',
    firstProof: 'مراجعة البروفا الأولى',
    secondProof: 'مراجعة البروفا الثانية',
    finalDress: 'مراجعة الفستان النهائي',
    stepMeasurements: 'مطابقة المقاسات',
    stepDesign: 'مطابقة التصميم',
    measurementsIntro: 'راجعي كل مقاس حقيقي وحددي هل يطابق المقاس المسجل في الطلب.',
    noMeasurements: 'لا توجد مقاسات مسجلة لهذا الطلب. أضيفي المقاسات أولاً قبل بدء المراجعة.',
    matches: 'مطابق',
    doesNotMatch: 'غير مطابق',
    inches: 'إنش',
    next: 'التالي',
    previous: 'السابق',
    answerAll: 'يجب تحديد نتيجة كل المقاسات قبل المتابعة.',
    frontDesign: 'التصميم من الأمام',
    backDesign: 'التصميم من الخلف',
    designQuestion: 'هل {stage} مطابقة للصورتين الموجودتين في التصميم؟',
    yes: 'نعم، مطابقة',
    no: 'لا، يوجد اختلاف',
    discrepancyTitle: 'اذكري الاختلاف أو نوع الخطأ',
    discrepancyHelp: 'اكتبي الخطأ أو سجليه صوتياً. سيتم تحويل التسجيل إلى نص وحفظ الصوت والنص معاً.',
    discrepancyPlaceholder: 'مثال: فتحة الرقبة أوسع من التصميم، أو طول الكم يحتاج إلى تعديل...',
    voiceNote: 'الملاحظة الصوتية',
    transcribing: 'جارٍ تحويل الصوت إلى نص...',
    transcriptionFailed: 'تعذّر تحويل الصوت إلى نص. يمكنك إعادة المحاولة أو كتابة الخطأ يدوياً.',
    retryTranscription: 'إعادة تحويل الصوت',
    transcription: 'النص المحوّل',
    finish: 'إنهاء المراجعة',
    saving: 'جارٍ حفظ النتيجة...',
    detailsRequired: 'اكتبي الاختلاف أو سجلي ملاحظة صوتية واضحة.',
    passed: 'نجحت المراجعة',
    failed: 'فشلت المراجعة',
    passedHelp: 'جميع المقاسات والتصميم متطابقة. تم تحديث مرحلة الجاهزية في تتبع الطلب.',
    failedHelp: 'توجد نقاط غير مطابقة. يمكن إعادة هذا الاختبار بعد تصحيحها.',
    attempt: 'المحاولة',
    reviewSummary: 'ملخص المراجعة',
    measurementResults: 'نتائج المقاسات',
    designResult: 'مطابقة التصميم',
    discrepancy: 'الاختلاف المسجل',
    noDiscrepancy: 'لا توجد ملاحظة اختلاف',
    reviewedAt: 'وقت المراجعة',
    retest: 'إعادة الاختبار',
    whatsappTitle: 'إرسال تذكير للزبونة',
    whatsappHelp: 'يمكنك الآن فتح واتساب وإرسال تذكير بالحضور.',
    sendWhatsApp: 'فتح واتساب وإرسال التذكير',
    noPhone: 'لا يوجد رقم هاتف مسجل للزبونة.',
    reviewAnotherTime: 'إغلاق والعودة للطلبات',
    firstProofNoun: 'البروفا الأولى',
    secondProofNoun: 'البروفا الثانية',
    finalDressNoun: 'الفستان النهائي',
  },
  en: {
    loading: 'Preparing the review...',
    loadError: 'Could not load the review data',
    close: 'Close',
    order: 'Order',
    firstProof: 'First Proof Review',
    secondProof: 'Second Proof Review',
    finalDress: 'Final Dress Review',
    stepMeasurements: 'Measurement check',
    stepDesign: 'Design check',
    measurementsIntro: 'Check every actual measurement and mark whether it matches the order.',
    noMeasurements: 'This order has no saved measurements. Add measurements before starting the review.',
    matches: 'Matches',
    doesNotMatch: 'Does not match',
    inches: 'in',
    next: 'Next',
    previous: 'Previous',
    answerAll: 'Answer every measurement before continuing.',
    frontDesign: 'Front design',
    backDesign: 'Back design',
    designQuestion: 'Does the {stage} match both design images?',
    yes: 'Yes, it matches',
    no: 'No, there is a difference',
    discrepancyTitle: 'Describe the difference or error',
    discrepancyHelp: 'Type the issue or record it. The audio will be transcribed and both audio and text will be saved.',
    discrepancyPlaceholder: 'Example: the neckline is wider than the design, or the sleeve length needs adjustment...',
    voiceNote: 'Voice note',
    transcribing: 'Transcribing audio...',
    transcriptionFailed: 'Audio transcription failed. Retry or type the issue manually.',
    retryTranscription: 'Retry transcription',
    transcription: 'Transcription',
    finish: 'Finish review',
    saving: 'Saving the result...',
    detailsRequired: 'Type the difference or record a clear voice note.',
    passed: 'Review passed',
    failed: 'Review failed',
    passedHelp: 'All measurements and the design match. Customer tracking has been updated.',
    failedHelp: 'Some items do not match. This test can be repeated after they are corrected.',
    attempt: 'Attempt',
    reviewSummary: 'Review summary',
    measurementResults: 'Measurement results',
    designResult: 'Design match',
    discrepancy: 'Recorded difference',
    noDiscrepancy: 'No discrepancy note',
    reviewedAt: 'Reviewed at',
    retest: 'Repeat test',
    whatsappTitle: 'Send a customer reminder',
    whatsappHelp: 'You can now open WhatsApp and remind the customer to attend.',
    sendWhatsApp: 'Open WhatsApp and send reminder',
    noPhone: 'No customer phone number is saved.',
    reviewAnotherTime: 'Close and return to orders',
    firstProofNoun: 'first proof',
    secondProofNoun: 'second proof',
    finalDressNoun: 'final dress',
  },
} as const

function hasMeaningfulValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return Number.isFinite(value)
  return false
}

function getMeasurementRows(measurements: Record<string, unknown> | null) {
  if (!measurements) return []

  const knownKeys = MEASUREMENT_ORDER.filter(key => hasMeaningfulValue(measurements[key]))
  const knownKeySet = new Set<string>(knownKeys)
  const extraKeys = Object.keys(measurements).filter(
    key =>
      !knownKeySet.has(key) &&
      !REVIEW_EXCLUDED_MEASUREMENT_KEYS.has(key) &&
      hasMeaningfulValue(measurements[key])
  )

  return [...knownKeys, ...extraKeys].map(key => {
    const labels = MEASUREMENT_LABELS[key as keyof typeof MEASUREMENT_LABELS]
    const legacyLabels = LEGACY_MEASUREMENT_LABELS[key]
    return {
      key,
      labelAr: labels?.ar || legacyLabels?.ar || key,
      labelEn: labels?.en || legacyLabels?.en || key,
      value: String(measurements[key]),
      isNote: key === 'additional_notes',
    }
  })
}

function inferCommentView(comment: Record<string, unknown>, index: number): 'front' | 'back' {
  if (comment.view === 'front' || comment.view === 'back') return comment.view
  const title = String(comment.title || '').trim()
  if (/^(خلف|back)/i.test(title)) return 'back'
  if (/^(أمام|front)/i.test(title)) return 'front'
  return index === 1 ? 'back' : 'front'
}

function resolveDesignImages(data: Record<string, unknown> | null) {
  const comments = Array.isArray(data?.saved_design_comments)
    ? (data.saved_design_comments as Array<Record<string, unknown>>)
    : []
  const customImage = typeof data?.custom_design_image === 'string' ? data.custom_design_image : null

  const latestByView = new Map<'front' | 'back', Record<string, unknown>>()
  comments.forEach((comment, index) => latestByView.set(inferCommentView(comment, index), comment))

  const resolve = (view: 'front' | 'back') => {
    const comment = latestByView.get(view)
    const composite = typeof comment?.compositeImage === 'string' ? comment.compositeImage : null
    const image = typeof comment?.image === 'string' ? comment.image : null
    if (composite) return composite
    if (image && image !== 'custom') return image
    if (image === 'custom' && customImage) return customImage
    if (view === 'front' && customImage) return customImage
    return view === 'front' ? '/front2.png' : '/back2.png'
  }

  return { front: resolve('front'), back: resolve('back') }
}

function base64ToBlob(base64: string) {
  const [header, encodedData] = base64.includes(',') ? base64.split(',', 2) : ['', base64]
  const mimeType = header.match(/^data:([^;]+)/)?.[1] || 'audio/webm'
  const bytes = atob(encodedData)
  const array = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index)
  return new Blob([array], { type: mimeType })
}

function getStageNumber(stage: OrderQualityReviewStage) {
  if (stage === 'first_proof') return 1
  if (stage === 'second_proof') return 2
  return 3
}

function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('966')) return digits
  if (digits.startsWith('0')) return `966${digits.slice(1)}`
  return digits
}

export default function OrderQualityReviewModal({
  isOpen,
  order,
  stage,
  language,
  onClose,
  onReviewSaved,
}: Props) {
  const copy = COPY[language]
  const isArabic = language === 'ar'
  const [screen, setScreen] = useState<Screen>('loading')
  const [step, setStep] = useState<TestStep>('measurements')
  const [measurementsData, setMeasurementsData] = useState<Record<string, unknown> | null>(null)
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({})
  const [designMatches, setDesignMatches] = useState<boolean | null>(null)
  const [discrepancyText, setDiscrepancyText] = useState('')
  const [voiceNotes, setVoiceNotes] = useState<DesignSummaryNote[]>([])
  const [latestReview, setLatestReview] = useState<OrderQualityReview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const loadRequestRef = useRef(0)

  const measurementRows = useMemo(() => getMeasurementRows(measurementsData), [measurementsData])
  const designImages = useMemo(() => resolveDesignImages(measurementsData), [measurementsData])

  const stageTitle = stage === 'first_proof'
    ? copy.firstProof
    : stage === 'second_proof'
      ? copy.secondProof
      : copy.finalDress
  const stageNoun = stage === 'first_proof'
    ? copy.firstProofNoun
    : stage === 'second_proof'
      ? copy.secondProofNoun
      : copy.finalDressNoun

  const startTestWithRows = useCallback((rows: ReturnType<typeof getMeasurementRows>) => {
    setAnswers(Object.fromEntries(rows.map(row => [row.key, null])))
    setDesignMatches(null)
    setDiscrepancyText('')
    setVoiceNotes([])
    setTranscriptionError(null)
    setIsTranscribing(false)
    setStep('measurements')
    setScreen('test')
  }, [])

  const resetTest = useCallback(() => {
    startTestWithRows(measurementRows)
  }, [measurementRows, startTestWithRows])

  useEffect(() => {
    if (!isOpen || !order || !stage) return

    const requestId = ++loadRequestRef.current
    setScreen('loading')
    setLoadError(null)
    setLatestReview(null)

    void Promise.all([
      orderService.getMeasurements(order.id),
      orderQualityReviewService.getLatestReview(order.id, stage),
    ]).then(([measurementsResult, reviewResult]) => {
      if (loadRequestRef.current !== requestId) return
      if (measurementsResult.error || reviewResult.error) {
        setLoadError(measurementsResult.error || reviewResult.error || copy.loadError)
        return
      }

      const loadedMeasurements = (measurementsResult.data || {}) as Record<string, unknown>
      const rows = getMeasurementRows(loadedMeasurements)
      setMeasurementsData(loadedMeasurements)
      setLatestReview(reviewResult.data)
      if (reviewResult.data) {
        setScreen('summary')
      } else {
        startTestWithRows(rows)
      }
    }).catch(error => {
      if (loadRequestRef.current === requestId) {
        setLoadError(error instanceof Error ? error.message : copy.loadError)
      }
    })
  }, [copy.loadError, isOpen, order, stage, startTestWithRows])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isSaving, onClose])

  const transcribeNote = useCallback(async (note: DesignSummaryNote) => {
    setIsTranscribing(true)
    setTranscriptionError(null)
    try {
      const originalBlob = base64ToBlob(note.data)
      let uploadBlob = originalBlob
      let filename = 'review-recording.webm'
      try {
        uploadBlob = await recordingBlobToWav(originalBlob)
        filename = 'review-recording.wav'
      } catch (conversionError) {
        console.warn('Review audio WAV conversion failed:', conversionError)
      }

      const form = new FormData()
      form.append('audio', uploadBlob, filename)
      const response = await fetch('/api/soniox-async-transcribe/', { method: 'POST', body: form })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.message || body?.error || response.statusText)
      const transcription = cleanTranscriptText(String(body?.text || ''))
      if (!transcription) throw new Error('Empty transcription')
      setVoiceNotes(current => current.map(item => (
        item.id === note.id ? { ...item, transcription } : item
      )))
    } catch (error) {
      console.error('Review transcription failed:', error)
      setTranscriptionError(copy.transcriptionFailed)
    } finally {
      setIsTranscribing(false)
    }
  }, [copy.transcriptionFailed])

  const handleRecordingComplete = useCallback((note: DesignSummaryNote) => {
    setVoiceNotes([note])
    void transcribeNote(note)
  }, [transcribeNote])

  if (!isOpen || !order || !stage) return null

  const allMeasurementsAnswered = measurementRows.length > 0 && measurementRows.every(
    row => typeof answers[row.key] === 'boolean'
  )
  const hasDiscrepancyDetails = discrepancyText.trim().length > 0 || voiceNotes.some(
    note => Boolean(note.transcription?.trim())
  )

  const submitReview = async () => {
    if (!allMeasurementsAnswered || designMatches === null) return
    if (!designMatches && !hasDiscrepancyDetails) {
      toast.error(copy.detailsRequired)
      return
    }

    const measurementChecks: OrderQualityMeasurementCheck[] = measurementRows.map(row => ({
      key: row.key,
      label_ar: row.labelAr,
      label_en: row.labelEn,
      expected_value: row.value,
      matched: answers[row.key] === true,
    }))

    setIsSaving(true)
    const result = await orderQualityReviewService.submitReview({
      orderId: order.id,
      stage,
      measurementChecks,
      designMatches,
      discrepancyText,
      voiceNotes,
    })

    if (result.error || !result.data) {
      setIsSaving(false)
      toast.error(result.error || copy.loadError)
      return
    }

    setLatestReview(result.data)
    try {
      await onReviewSaved(result.data)
    } catch (refreshError) {
      console.error('Review saved but order list refresh failed:', refreshError)
    } finally {
      setIsSaving(false)
      setScreen(result.data.status === 'passed' ? 'success' : 'summary')
    }
  }

  const openWhatsAppReminder = () => {
    if (!order.client_phone) return
    const phone = normalizeWhatsAppPhone(order.client_phone)
    if (!phone) return

    const actionAr = stage === 'final_dress'
      ? 'لاستلام فستانك الجاهز'
      : `للحضور وقياس ${stage === 'first_proof' ? 'البروفا الأولى' : 'البروفا الثانية'}`
    const actionEn = stage === 'final_dress'
      ? 'to collect your finished dress'
      : `to attend your ${stage === 'first_proof' ? 'first' : 'second'} proof fitting`
    const message = isArabic
      ? `مرحباً ${order.client_name || ''}،\nنذكّرك ${actionAr} في ياسمين الشام.\nرقم الطلب: ${order.order_number || order.id}`
      : `Hello ${order.client_name || ''},\nThis is a reminder ${actionEn} at Yasmin Al Sham.\nOrder: ${order.order_number || order.id}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const directionIcon = isArabic ? ArrowLeft : ArrowRight
  const PreviousIcon = isArabic ? ArrowRight : ArrowLeft
  const NextIcon = directionIcon

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={event => {
          if (event.target === event.currentTarget && !isSaving) onClose()
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="quality-review-title"
          dir={isArabic ? 'rtl' : 'ltr'}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 260, damping: 25 }}
          className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#fbfaf7] shadow-2xl"
        >
          <header className="relative overflow-hidden border-b border-stone-200 bg-[#3b1721] px-5 py-5 text-white sm:px-7">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_15%_20%,rgba(255,255,255,.35),transparent_28%),linear-gradient(115deg,transparent_45%,rgba(219,187,133,.35))]" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-[#ddbf85]/50 bg-[#ddbf85]/15 text-xl font-black text-[#f3d9a5]">
                  {getStageNumber(stage)}
                </span>
                <div className="min-w-0">
                  <h2 id="quality-review-title" className="truncate text-xl font-black sm:text-2xl">
                    {stageTitle}
                  </h2>
                  <p className="mt-1 truncate text-xs text-rose-100/80 sm:text-sm">
                    {copy.order} {order.order_number || order.id} · {order.client_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/20 bg-white/10 transition hover:bg-white/20 disabled:opacity-40"
                aria-label={copy.close}
                title={copy.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {screen === 'loading' ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 py-16 text-slate-600">
                {!loadError ? <Loader2 className="h-10 w-10 animate-spin text-[#7f263b]" /> : <AlertTriangle className="h-10 w-10 text-red-600" />}
                <p className="font-semibold">{loadError ? copy.loadError : copy.loading}</p>
                {loadError ? (
                  <div className="max-w-xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm text-red-700">
                    {loadError}
                  </div>
                ) : null}
              </div>
            ) : null}

            {screen === 'test' ? (
              <div className="px-4 py-5 sm:px-7 sm:py-7">
                <div className="mb-7 grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1.5">
                  {[
                    { id: 'measurements', label: copy.stepMeasurements, icon: Ruler },
                    { id: 'design', label: copy.stepDesign, icon: Images },
                  ].map((item, index) => {
                    const active = item.id === step || (item.id === 'design' && step === 'discrepancy')
                    const complete = item.id === 'measurements' && step !== 'measurements'
                    const Icon = item.icon
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${
                          active ? 'bg-white text-[#6f2034] shadow-sm' : complete ? 'text-emerald-700' : 'text-stone-400'
                        }`}
                      >
                        {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        <span>{index + 1}. {item.label}</span>
                      </div>
                    )
                  })}
                </div>

                {step === 'measurements' ? (
                  <motion.div initial={{ opacity: 0, x: isArabic ? 16 : -16 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="mb-5">
                      <h3 className="text-xl font-black text-slate-900">{copy.stepMeasurements}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{copy.measurementsIntro}</p>
                    </div>

                    {measurementRows.length === 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
                        <AlertTriangle className="mb-2 h-6 w-6" />
                        {copy.noMeasurements}
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {measurementRows.map(row => (
                          <div key={row.key} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_30px_rgba(59,23,33,.04)]">
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-slate-800">{isArabic ? row.labelAr : row.labelEn}</p>
                                <p className={`mt-1 text-lg font-black text-[#6f2034] ${row.isNote ? 'text-sm leading-6' : ''}`}>
                                  {row.value} {!row.isNote ? <span className="text-xs font-medium text-stone-400">{copy.inches}</span> : null}
                                </p>
                              </div>
                              <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-[10px] text-stone-500">{row.key}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setAnswers(current => ({ ...current, [row.key]: true }))}
                                className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold transition ${
                                  answers[row.key] === true
                                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                                }`}
                              >
                                <Check className="h-4 w-4" /> {copy.matches}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnswers(current => ({ ...current, [row.key]: false }))}
                                className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold transition ${
                                  answers[row.key] === false
                                    ? 'border-red-600 bg-red-600 text-white shadow-sm'
                                    : 'border-red-200 bg-red-50 text-red-700 hover:border-red-400'
                                }`}
                              >
                                <X className="h-4 w-4" /> {copy.doesNotMatch}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                      {!allMeasurementsAnswered && measurementRows.length > 0 ? (
                        <p className="text-xs font-medium text-amber-700">{copy.answerAll}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setStep('design')}
                        disabled={!allMeasurementsAnswered}
                        className="flex items-center gap-2 rounded-xl bg-[#6f2034] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-950/10 transition hover:bg-[#541827] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
                      >
                        {copy.next} <NextIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                ) : null}

                {step === 'design' ? (
                  <motion.div initial={{ opacity: 0, x: isArabic ? 16 : -16 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { label: copy.frontDesign, src: designImages.front },
                        { label: copy.backDesign, src: designImages.back },
                      ].map(image => (
                        <figure key={image.label} className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                          <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-stone-100">
                            <Image src={image.src} alt={image.label} fill unoptimized sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" />
                          </div>
                          <figcaption className="pt-3 text-center text-sm font-bold text-slate-700">{image.label}</figcaption>
                        </figure>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#ddbf85]/60 bg-[#fffaf0] p-5">
                      <h3 className="text-center text-lg font-black leading-7 text-slate-900">
                        {copy.designQuestion.replace('{stage}', stageNoun)}
                      </h3>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setDesignMatches(true)}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 font-bold transition ${
                            designMatches === true
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <CheckCircle2 className="h-5 w-5" /> {copy.yes}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDesignMatches(false)
                            setStep('discrepancy')
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3.5 font-bold text-red-700 transition hover:bg-red-50"
                        >
                          <XCircle className="h-5 w-5" /> {copy.no}
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-3">
                      <button type="button" onClick={() => setStep('measurements')} className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-stone-100">
                        <PreviousIcon className="h-4 w-4" /> {copy.previous}
                      </button>
                      <button
                        type="button"
                        onClick={submitReview}
                        disabled={designMatches !== true || isSaving}
                        className="flex items-center gap-2 rounded-xl bg-[#6f2034] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#541827] disabled:cursor-not-allowed disabled:bg-stone-300"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                        {isSaving ? copy.saving : copy.finish}
                      </button>
                    </div>
                  </motion.div>
                ) : null}

                {step === 'discrepancy' ? (
                  <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-2xl">
                    <div className="rounded-3xl border border-red-200 bg-white p-5 shadow-xl shadow-red-950/5 sm:p-7">
                      <div className="mb-5 flex items-start gap-3">
                        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-red-100 text-red-700">
                          <AlertTriangle className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-xl font-black text-slate-900">{copy.discrepancyTitle}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{copy.discrepancyHelp}</p>
                        </div>
                      </div>

                      <textarea
                        value={discrepancyText}
                        onChange={event => setDiscrepancyText(event.target.value)}
                        rows={4}
                        placeholder={copy.discrepancyPlaceholder}
                        className="w-full resize-y rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#8c3048] focus:bg-white focus:ring-4 focus:ring-rose-100"
                      />

                      <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-black text-teal-900">
                          <Mic className="h-4 w-4" /> {copy.voiceNote}
                        </div>
                        <DesignSummaryRecorder
                          language={language}
                          mode={voiceNotes.length > 0 ? 'replace' : 'add'}
                          disabled={isTranscribing || isSaving}
                          onRecordingComplete={handleRecordingComplete}
                        />

                        {voiceNotes[0] ? (
                          <div className="mt-4 space-y-3 rounded-xl border border-teal-200 bg-white p-3">
                            <audio controls src={voiceNotes[0].data} className="h-10 w-full" aria-label={copy.voiceNote} />
                            {isTranscribing ? (
                              <p className="flex items-center gap-2 text-xs font-semibold text-teal-700">
                                <Loader2 className="h-4 w-4 animate-spin" /> {copy.transcribing}
                              </p>
                            ) : voiceNotes[0].transcription ? (
                              <div>
                                <p className="mb-1 text-xs font-bold text-teal-700">{copy.transcription}</p>
                                <p className="text-sm leading-6 text-slate-700">{voiceNotes[0].transcription}</p>
                              </div>
                            ) : null}
                            {transcriptionError && !isTranscribing ? (
                              <div className="space-y-2">
                                <p className="text-xs leading-5 text-red-700">{transcriptionError}</p>
                                <button type="button" onClick={() => void transcribeNote(voiceNotes[0])} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                                  <RefreshCw className="h-3.5 w-3.5" /> {copy.retryTranscription}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-6 flex items-center justify-between gap-3">
                        <button type="button" onClick={() => setStep('design')} className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-stone-100">
                          <PreviousIcon className="h-4 w-4" /> {copy.previous}
                        </button>
                        <button
                          type="button"
                          onClick={submitReview}
                          disabled={!hasDiscrepancyDetails || isTranscribing || isSaving}
                          className="flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                          {isSaving ? copy.saving : copy.finish}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </div>
            ) : null}

            {screen === 'summary' && latestReview ? (
              <div className="px-4 py-6 sm:px-7 sm:py-8">
                <div className={`mb-6 rounded-3xl border p-5 ${latestReview.status === 'passed' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-start gap-3">
                    {latestReview.status === 'passed'
                      ? <CheckCircle2 className="h-9 w-9 flex-none text-emerald-700" />
                      : <XCircle className="h-9 w-9 flex-none text-red-700" />}
                    <div>
                      <h3 className={`text-xl font-black ${latestReview.status === 'passed' ? 'text-emerald-900' : 'text-red-900'}`}>
                        {latestReview.status === 'passed' ? copy.passed : copy.failed}
                      </h3>
                      <p className={`mt-1 text-sm leading-6 ${latestReview.status === 'passed' ? 'text-emerald-800' : 'text-red-800'}`}>
                        {latestReview.status === 'passed' ? copy.passedHelp : copy.failedHelp}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
                  <section className="rounded-2xl border border-stone-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="font-black text-slate-900">{copy.measurementResults}</h4>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">{copy.attempt} {latestReview.attempt_number}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {latestReview.measurement_checks.map(check => (
                        <div key={check.key} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${check.matched ? 'border-emerald-100 bg-emerald-50/60' : 'border-red-100 bg-red-50/70'}`}>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">{isArabic ? check.label_ar : check.label_en}</p>
                            <p className="truncate text-xs text-slate-500">{check.expected_value}</p>
                          </div>
                          {check.matched ? <Check className="h-5 w-5 flex-none text-emerald-700" /> : <X className="h-5 w-5 flex-none text-red-700" />}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
                    <div>
                      <p className="text-xs font-bold text-stone-500">{copy.designResult}</p>
                      <p className={`mt-1 flex items-center gap-2 font-black ${latestReview.design_matches ? 'text-emerald-700' : 'text-red-700'}`}>
                        {latestReview.design_matches ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                        {latestReview.design_matches ? copy.yes : copy.no}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-500">{copy.discrepancy}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{latestReview.discrepancy_text || copy.noDiscrepancy}</p>
                    </div>
                    {latestReview.voice_notes.map(note => (
                      <div key={note.id} className="rounded-xl border border-teal-100 bg-teal-50 p-3">
                        <audio controls src={note.data} className="h-9 w-full" aria-label={copy.voiceNote} />
                        {note.transcription ? <p className="mt-2 text-xs leading-5 text-teal-900">{note.transcription}</p> : null}
                      </div>
                    ))}
                    <div>
                      <p className="text-xs font-bold text-stone-500">{copy.reviewedAt}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {new Date(latestReview.created_at).toLocaleString(isArabic ? 'ar-SA-u-nu-latn' : 'en-GB')}
                      </p>
                    </div>
                  </section>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  {latestReview.status === 'failed' ? (
                    <button type="button" onClick={resetTest} className="flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-800">
                      <RotateCcw className="h-4 w-4" /> {copy.retest}
                    </button>
                  ) : null}
                  <button type="button" onClick={onClose} className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-stone-50">
                    {copy.close}
                  </button>
                </div>
              </div>
            ) : null}

            {screen === 'success' && latestReview ? (
              <div className="flex min-h-[500px] flex-col items-center justify-center px-5 py-10 text-center">
                <motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-50">
                  <CheckCircle2 className="h-12 w-12" />
                </motion.div>
                <h3 className="mt-7 text-3xl font-black text-slate-900">{copy.passed}</h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">{copy.passedHelp}</p>

                <div className="mt-8 w-full max-w-xl rounded-3xl border border-[#ddbf85]/70 bg-[#fffaf0] p-6">
                  <MessageCircle className="mx-auto h-8 w-8 text-[#6f2034]" />
                  <h4 className="mt-3 text-lg font-black text-slate-900">{copy.whatsappTitle}</h4>
                  <p className="mt-1 text-sm text-slate-600">{copy.whatsappHelp}</p>
                  <button
                    type="button"
                    onClick={openWhatsAppReminder}
                    disabled={!order.client_phone}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#187b54] px-5 py-3.5 font-bold text-white transition hover:bg-[#126342] disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    <MessageCircle className="h-5 w-5" /> {copy.sendWhatsApp}
                  </button>
                  {!order.client_phone ? <p className="mt-2 text-xs font-medium text-red-700">{copy.noPhone}</p> : null}
                </div>

                <button type="button" onClick={onClose} className="mt-5 rounded-xl px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-stone-100">
                  {copy.reviewAnotherTime}
                </button>
              </div>
            ) : null}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  )
}
