'use client'

import { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import { Mic, MicOff, X, Trash2, Loader2, Play, Pause, FileText, Check, XCircle, Pencil, Eraser, RotateCcw, RotateCw, Palette, PenTool, Highlighter, Circle, ImageIcon, Camera, Upload, RefreshCw, Save, ChevronDown, ChevronUp, Languages, Eye, EyeOff, Type, ZoomIn, ZoomOut, MousePointer2, ScanText, Plus } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { toast } from 'react-hot-toast'
import Image from 'next/image'


// نوع نقطة الرسم
export interface DrawingPoint {
  x: number // نسبة مئوية من العرض (0-100)
  y: number // نسبة مئوية من الارتفاع (0-100)
  pressure?: number // ضغط القلم (0-1)
}

// أنواع الفرش المتاحة
export type BrushType = 'normal' | 'dashed' | 'dotted' | 'soft' | 'pencil' | 'highlighter'

// نوع مسار الرسم
export interface DrawingPath {
  id: string
  points: DrawingPoint[]
  color: string
  strokeWidth: number
  brushType: BrushType
  isEraser?: boolean
  timestamp: number
}

// نوع التعليق الصوتي على موقع معين
export interface ImageAnnotation {
  id: string
  x: number // نسبة مئوية من العرض (0-100)
  y: number // نسبة مئوية من الارتفاع (0-100)
  boxX?: number // موقع مربع النص المخصص (نسبة مئوية)
  boxY?: number // موقع مربع النص المخصص (نسبة مئوية)
  audioData?: string // base64 audio
  transcription?: string
  translatedText?: string // النص المترجم
  translationLanguage?: string // لغة الترجمة
  duration?: number
  timestamp: number
  isRecording?: boolean
  isHidden?: boolean // إخفاء النص من على الصورة
  textScale?: number // حجم النص (1 = الحجم الافتراضي)
}

// ثوابت الألوان المتاحة للرسم
const DRAWING_COLORS = [
  // ألوان أساسية
  { name: 'أسود', value: '#1f2937' },
  { name: 'أبيض', value: '#ffffff' },
  { name: 'رمادي', value: '#6b7280' },
  // ألوان دافئة
  { name: 'أحمر', value: '#ef4444' },
  { name: 'أحمر داكن', value: '#991b1b' },
  { name: 'برتقالي', value: '#f97316' },
  { name: 'أصفر', value: '#eab308' },
  { name: 'ذهبي', value: '#fbbf24' },
  // ألوان باردة
  { name: 'أزرق', value: '#3b82f6' },
  { name: 'أزرق داكن', value: '#1e40af' },
  { name: 'سماوي', value: '#06b6d4' },
  // ألوان طبيعية
  { name: 'أخضر', value: '#22c55e' },
  { name: 'أخضر فاتح', value: '#84cc16' },
  { name: 'بني', value: '#92400e' },
  // ألوان مميزة
  { name: 'وردي', value: '#ec4899' },
  { name: 'بنفسجي', value: '#a855f7' },
]

// ثوابت سمك الخط
const STROKE_WIDTHS = [
  { name: 'رفيع جداً', value: 1 },
  { name: 'رفيع', value: 2 },
  { name: 'متوسط', value: 4 },
  { name: 'سميك', value: 8 },
  { name: 'سميك جداً', value: 12 },
]

// ثوابت أحجام الممحاة (أكبر من أحجام القلم)
const ERASER_SIZES = [
  { name: 'صغير', value: 10 },
  { name: 'متوسط', value: 20 },
  { name: 'كبير', value: 35 },
  { name: 'كبير جداً', value: 50 },
]

// أنواع الفرش
const BRUSH_TYPES: { name: string; value: BrushType; icon: string }[] = [
  { name: 'عادي', value: 'normal', icon: '✏️' },
  { name: 'متقطع', value: 'dashed', icon: '➖' },
  { name: 'منقط', value: 'dotted', icon: '•••' },
  { name: 'ناعم', value: 'soft', icon: '🖌️' },
  { name: 'رصاص', value: 'pencil', icon: '✎' },
  { name: 'تحديد', value: 'highlighter', icon: '🖍️' },
]

// نوع موقع مربع النص
type BoxPosition = 'bottom' | 'top' | 'right' | 'left' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

// واجهة المستطيل للتصادم
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

// ثوابت أبعاد مربع النص (بالنسبة المئوية) - تستخدم للكشف عن التصادم
const BOX_WIDTH_PERCENT = 25 // عرض تقريبي للمربع
const BOX_HEIGHT_PERCENT = 12 // ارتفاع تقريبي للمربع
const SAFE_MARGIN = 2 // المسافة الآمنة بين المربعات
const MARKER_SIZE = 4 // حجم دائرة العلامة

const getViewLabel = (view: 'front' | 'back') => (view === 'front' ? 'أمام' : 'خلف')

const getViewFromTitle = (title?: string | null): 'front' | 'back' | null => {
  if (!title) return null
  const trimmed = title.trim()
  if (trimmed.startsWith('أمام')) return 'front'
  if (trimmed.startsWith('خلف')) return 'back'
  return null
}

// واجهة التعليق المحفوظ
export interface SavedDesignComment {
  id: string
  timestamp: number
  annotations: ImageAnnotation[]
  drawings: DrawingPath[]
  image: string | null
  title?: string
  view?: 'front' | 'back'
  compositeImage?: string | null // الصورة المركّبة (الصورة + الرسومات + التعليقات)
}

interface InteractiveImageAnnotationProps {
  imageSrc: string
  annotations: ImageAnnotation[]
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void
  drawings: DrawingPath[]
  onDrawingsChange: (drawings: DrawingPath[]) => void
  customImage?: File | null
  onImageChange?: (image: File | null) => void
  disabled?: boolean
  // Props جديدة للتعليقات المتعددة
  savedComments?: SavedDesignComment[]
  onSavedCommentsChange?: (comments: SavedDesignComment[]) => void
  showSaveButton?: boolean
  currentImageBase64?: string | null
}

// نوع الـ ref للوصول إلى دوال المكون من الخارج
export interface InteractiveImageAnnotationRef {
  generateCompositeImage: () => Promise<string | null>
  saveCurrentComment: () => Promise<SavedDesignComment | null>
  getCurrentView: () => 'front' | 'back'
}

// مكون النص القابل للسحب - يستخدم useMotionValue لإعادة تعيين الموقع بعد السحب
function DraggableText({
  annotation,
  annotationIndex,
  styles,
  containerRef,
  onDragEnd,
  onScaleChange,
  onTextChange
}: {
  annotation: ImageAnnotation
  annotationIndex: number
  styles: React.CSSProperties
  containerRef: React.RefObject<HTMLDivElement | null>
  onDragEnd: (annotationId: string, info: any, element: HTMLElement | null) => void
  onScaleChange: (annotationId: string, delta: number) => void
  onTextChange: (annotationId: string, newText: string) => void
}) {
  const elementRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // متغيرات لتتبع pinch gesture
  const initialPinchDistance = useRef<number | null>(null)
  const initialScale = useRef<number>(1)

  const handleDragEnd = useCallback((e: any, info: any) => {
    if (elementRef.current && containerRef.current) {
      onDragEnd(annotation.id, info, elementRef.current)
      // إعادة تعيين الـ transform بعد تحديث الموقع
      x.set(0)
      y.set(0)
    }
  }, [annotation.id, containerRef, onDragEnd, x, y])

  // معالجة بداية اللمس للكشف عن pinch gesture
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      e.stopPropagation()
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      initialPinchDistance.current = distance
      initialScale.current = annotation.textScale ?? 1
    }
  }, [annotation.textScale])

  // معالجة حركة اللمس للتكبير/التصغير
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance.current !== null) {
      e.preventDefault()
      e.stopPropagation()
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )

      const scaleFactor = currentDistance / initialPinchDistance.current
      const newScale = Math.max(0.5, Math.min(2, initialScale.current * scaleFactor))
      const delta = newScale - (annotation.textScale ?? 1)

      if (Math.abs(delta) > 0.05) {
        onScaleChange(annotation.id, delta)
      }
    }
  }, [annotation.id, annotation.textScale, onScaleChange])

  // معالجة نهاية اللمس
  const handleTouchEnd = useCallback(() => {
    initialPinchDistance.current = null
  }, [])

  // حالة التعديل المباشر
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(annotation.transcription || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commitEdit = useCallback(() => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== annotation.transcription) {
      onTextChange(annotation.id, trimmed)
    }
    setIsEditing(false)
  }, [annotation.id, annotation.transcription, editText, onTextChange])

  // معالجة الضغط المزدوج لبدء التعديل
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditText(annotation.transcription || '')
  }, [annotation.transcription])

  // حفظ التعديل عند الضغط خارج النص
  const handleBlur = useCallback(() => {
    commitEdit()
  }, [commitEdit])

  // التركيز على textarea عند بدء التعديل
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  // إبقاء مربع التعديل داخل شاشة الرسم
  useEffect(() => {
    if (!isEditing) return
    const frame = requestAnimationFrame(() => {
      if (!containerRef.current || !elementRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const elementRect = elementRef.current.getBoundingClientRect()
      const padding = 6
      let shiftX = 0
      let shiftY = 0

      if (elementRect.right > containerRect.right - padding) {
        shiftX -= elementRect.right - (containerRect.right - padding)
      }
      if (elementRect.left < containerRect.left + padding) {
        shiftX += (containerRect.left + padding) - elementRect.left
      }
      if (elementRect.bottom > containerRect.bottom - padding) {
        shiftY -= elementRect.bottom - (containerRect.bottom - padding)
      }
      if (elementRect.top < containerRect.top + padding) {
        shiftY += (containerRect.top + padding) - elementRect.top
      }

      if (shiftX !== 0) x.set(x.get() + shiftX)
      if (shiftY !== 0) y.set(y.get() + shiftY)
    })

    return () => cancelAnimationFrame(frame)
  }, [containerRef, isEditing, x, y])

  // حساب حجم الخط بناءً على scale
  const scale = annotation.textScale ?? 1
  const fontSize = `${0.875 * scale}rem` // text-sm = 0.875rem

  return (
    <motion.div
      ref={elementRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ ...styles, x, y, touchAction: isEditing ? 'manipulation' : 'none' }}
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={containerRef}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={(e) => e.stopPropagation()}
      data-annotation-interactive="true"
      className={`${isEditing ? 'cursor-text' : 'cursor-move touch-none'}`}
      drag={!isEditing} // تعطيل السحب عند التعديل
    >
      {/* نص بسيط بدون خلفية - رقم ونص فقط */}
      <div
        className="flex items-start gap-1 text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]"
        style={{ fontSize }}
        onDoubleClick={handleDoubleClick}
      >
        <span className="font-bold flex-shrink-0">
          {annotationIndex}.
        </span>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleBlur}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            data-annotation-edit="true"
            className="leading-snug break-words min-w-[200px] w-auto max-w-[320px] bg-white/90 border border-pink-300 rounded px-2 py-1 overflow-hidden"
            style={{ fontSize, minHeight: '1.5em', height: 'auto', userSelect: 'text', touchAction: 'manipulation' }}
            rows={Math.max(1, Math.ceil((editText.length) / 25))}
            dir="rtl"
          />
        ) : (
          <p className="leading-snug break-words max-w-[200px]" dir={annotation.translatedText ? "auto" : "rtl"}>
            {annotation.translatedText || annotation.transcription}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// مكون العلامة القابلة للسحب (الدائرة الوردية)
function DraggableMarker({
  annotation,
  annotationIndex,
  isActiveMarker,
  containerRef,
  onDragStart,
  onDrag,
  onDragEnd,
  onClick
}: {
  annotation: ImageAnnotation
  annotationIndex: number
  isActiveMarker: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  onDragStart: () => void
  onDrag: (info: any, element: HTMLElement | null) => void
  onDragEnd: (annotationId: string, info: any, element: HTMLElement | null) => void
  onClick: (e: React.MouseEvent, annotationId: string) => void
}) {
  const elementRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const handleDragEnd = useCallback((e: any, info: any) => {
    if (elementRef.current && containerRef.current) {
      onDragEnd(annotation.id, info, elementRef.current)
      // إعادة تعيين الـ transform بعد تحديث الموقع
      x.set(0)
      y.set(0)
    }
  }, [annotation.id, containerRef, onDragEnd, x, y])

  return (
    <motion.div
      ref={elementRef}
      onClick={(e) => onClick(e, annotation.id)}
      animate={{
        scale: isActiveMarker ? 1.2 : 1,
      }}
      transition={{ duration: 0.2 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={containerRef}
      onDragStart={() => onDragStart()}
      onDrag={(e, info) => {
        if (elementRef.current) onDrag(info, elementRef.current)
      }}
      onDragEnd={handleDragEnd}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ x, y }}
      data-annotation-interactive="true"
      className="cursor-move flex items-center justify-center"
    >
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center shadow-md ${isActiveMarker
          ? 'bg-pink-600 ring-2 ring-pink-300'
          : 'bg-pink-500'
          }`}
      >
        <span className="text-white text-[10px] font-bold">
          {annotationIndex}
        </span>
      </div>
    </motion.div>
  )
}


const InteractiveImageAnnotation = forwardRef<InteractiveImageAnnotationRef, InteractiveImageAnnotationProps>(({
  imageSrc,
  annotations,
  onAnnotationsChange,
  drawings,
  onDrawingsChange,
  customImage,
  onImageChange,
  disabled = false,
  savedComments = [],
  onSavedCommentsChange,
  showSaveButton = true,
  currentImageBase64 = null
}, ref) => {
  const { t } = useTranslation()

  // دالة الحفظ (تم تعريفها لاحقاً، لكن نحتاجها في handleViewSwitch)
  // تعريفها في البداية لتجنب ReferenceError
  const saveCurrentRef = useRef<() => Promise<any>>(async () => null)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // حالات التعليقات الصوتية
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [activeTranscriptionId, setActiveTranscriptionId] = useState<string | null>(null)
  const [editingTranscriptionId, setEditingTranscriptionId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState<string>('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [isRecordingActive, setIsRecordingActive] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [showLanguageDropdown, setShowLanguageDropdown] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const isTranslatingAll = translatingId === 'translating-all'
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const suppressTranslateClickRef = useRef(false)
  const translateAllClickTimerRef = useRef<NodeJS.Timeout | null>(null)
  const skipDrawingOnceRef = useRef(false)


  // حالات كتابة النص اليدوي
  const [manualTextInput, setManualTextInput] = useState<{
    isOpen: boolean
    annotationId: string | null
    text: string
  }>({ isOpen: false, annotationId: null, text: '' })

  // قائمة اللغات المتاحة للترجمة
  const availableLanguages = [
    { code: 'en', name: 'English', nameAr: 'الإنجليزية', nativeName: 'English', flag: '🇺🇸' },
    { code: 'ur', name: 'Urdu', nameAr: 'الأردية', nativeName: 'اردو', flag: '🇵🇰' },
    { code: 'bn', name: 'Bengali', nameAr: 'البنغالية', nativeName: 'বাংলা', flag: '🇧🇩' },
    { code: 'hi', name: 'Hindi', nameAr: 'الهندية', nativeName: 'हिन्दी', flag: '🇮🇳' }
  ]

  // حالات الرسم الحر
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingColor, setDrawingColor] = useState(DRAWING_COLORS[0].value)
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1].value) // رفيع (2) بدلاً من متوسط (4)
  const [brushType, setBrushType] = useState<BrushType>('normal')
  const [isEraserMode, setIsEraserMode] = useState(false)
  const [eraserWidth, setEraserWidth] = useState(ERASER_SIZES[1].value)
  const [currentPath, setCurrentPath] = useState<DrawingPoint[]>([])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showStrokePicker, setShowStrokePicker] = useState(false)
  const [showBrushPicker, setShowBrushPicker] = useState(false)
  const [showEraserSizePicker, setShowEraserSizePicker] = useState(false)

  const [showEraserMenu, setShowEraserMenu] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [isPenMode, setIsPenMode] = useState(false) // وضع القلم (رفض اللمس)
  const [isRecognizingText, setIsRecognizingText] = useState(false) // حالة التعرف على النص
  const [showAllTextsOnImage, setShowAllTextsOnImage] = useState(true) // حالة إظهار/إخفاء كل النصوص على الصورة
  const [isDraggingMarker, setIsDraggingMarker] = useState(false) // هل يتم سحب علامة حالياً؟
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false) // هل العلامة فوق منطقة الحذف؟
  const [redoStack, setRedoStack] = useState<DrawingPath[]>([])
  const skipRedoResetRef = useRef(false)

  // حالات تبديل الصورة
  const [showImageOptions, setShowImageOptions] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // حالة لتتبع الصورة المعروضة حالياً (لزر الأمام/الخلف)
  const [internalImageOverride, setInternalImageOverride] = useState<string | null>(null)

  // الصورة الفعلية المعروضة: 
  // 1. صورة المعاينة (رفع ملف) - لها الأولوية القصوى
  // 2. تراكب داخلي (زر الأمام/الخلف) - أولوية متوسطة
  // 3. الصورة الممررة عبر الـ Props - أولوية دنيا
  const effectiveImageSrc = useMemo(() => {
    if (imagePreview) return imagePreview
    if (internalImageOverride) return internalImageOverride
    return imageSrc
  }, [imageSrc, imagePreview, internalImageOverride])

  const isAnnotationInteractiveTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('[data-annotation-interactive="true"]'))
  }, [])

  // تحسين: إعادة تعيين التراكب الداخلي عند تغيير الصورة المخصصة
  useEffect(() => {
    if (imagePreview) {
      setInternalImageOverride(null)
    }
  }, [imagePreview])

  // ضبط الوضع الافتراضي لرفض اللمس بناءً على حجم الشاشة مرة واحدة عند التحميل
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsPenMode(window.innerWidth < 1024)
  }, [])

  // حالات التعليقات المحفوظة
  const [showSavedComments, setShowSavedComments] = useState(true)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentTitle, setEditingCommentTitle] = useState<string | null>(null)
  const [editedCommentTitle, setEditedCommentTitle] = useState<string>('')
  const [viewingCommentId, setViewingCommentId] = useState<string | null>(null) // التعليق المحفوظ الذي يتم عرضه حالياً
  // تتبع الحالة الأصلية للتعليق المعروض للكشف عن التغييرات
  const [originalViewingAnnotations, setOriginalViewingAnnotations] = useState<ImageAnnotation[]>([])
  const [originalViewingDrawings, setOriginalViewingDrawings] = useState<DrawingPath[]>([])

  // دالة للكشف عن وجود تغييرات في التعليق المعروض
  const hasViewingCommentChanges = useMemo(() => {
    if (!viewingCommentId) return false
    // مقارنة التعليقات والرسومات الحالية مع الأصلية
    const annotationsChanged = JSON.stringify(annotations) !== JSON.stringify(originalViewingAnnotations)
    const drawingsChanged = JSON.stringify(drawings) !== JSON.stringify(originalViewingDrawings)
    return annotationsChanged || drawingsChanged
  }, [viewingCommentId, annotations, drawings, originalViewingAnnotations, originalViewingDrawings])

  // دالة إنشاء صورة مركّبة يدوياً - تطابق العرض تماماً
  // تستخدم نفس المنطق المستخدم في العرض لضمان التطابق 100%
  const generateCompositeImage = useCallback(async (): Promise<string | null> => {
    try {
      const container = containerRef.current
      if (!container) {
        console.error('Container ref is not available')
        return null
      }

      // الحصول على أبعاد الـ container الفعلية
      const containerRect = container.getBoundingClientRect()
      const containerWidth = containerRect.width
      const containerHeight = containerRect.height

      // إنشاء canvas بنفس أبعاد الـ container (مع scale للجودة العالية)
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = containerWidth * scale
      canvas.height = containerHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      // تطبيق الـ scale
      ctx.scale(scale, scale)

      // رسم خلفية بيضاء
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, containerWidth, containerHeight)

      // تحميل الصورة الأساسية
      // تحميل الصورة الأساسية
      const baseImageSrc = effectiveImageSrc
      const baseImage = new window.Image()
      baseImage.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        baseImage.onload = () => resolve()
        baseImage.onerror = () => reject(new Error('Failed to load image'))
        baseImage.src = baseImageSrc
      })

      // حساب أبعاد الصورة مع الحفاظ على النسبة (object-contain)
      // الـ container له aspect-[3/4] والصورة تستخدم object-contain
      const imgAspect = baseImage.width / baseImage.height
      const containerAspect = containerWidth / containerHeight

      let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number

      if (imgAspect > containerAspect) {
        // الصورة أعرض - تملأ العرض
        drawWidth = containerWidth
        drawHeight = containerWidth / imgAspect
        offsetX = 0
        offsetY = (containerHeight - drawHeight) / 2
      } else {
        // الصورة أطول - تملأ الارتفاع
        drawHeight = containerHeight
        drawWidth = containerHeight * imgAspect
        offsetX = (containerWidth - drawWidth) / 2
        offsetY = 0
      }

      // رسم الصورة الأساسية
      ctx.drawImage(baseImage, offsetX, offsetY, drawWidth, drawHeight)

      // رسم المسارات (الرسومات) - نفس المنطق المستخدم في drawPaths
      // أولاً: رسم جميع المسارات غير الممحاة
      for (const path of drawings) {
        if (path.points.length < 2 || path.isEraser) continue

        ctx.save()
        ctx.beginPath()
        ctx.strokeStyle = path.color
        ctx.lineWidth = path.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // تطبيق نمط الفرشاة
        ctx.setLineDash([])
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1

        switch (path.brushType) {
          case 'dashed': ctx.setLineDash([12, 6]); break
          case 'dotted': ctx.setLineDash([3, 6]); break
          case 'soft': ctx.shadowBlur = 8; ctx.shadowColor = path.color; break
          case 'pencil': ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1, path.strokeWidth * 0.5); break
          case 'highlighter': ctx.globalAlpha = 0.4; ctx.lineWidth = path.strokeWidth * 2.5; ctx.lineCap = 'square'; break
        }

        const firstPoint = path.points[0]
        ctx.moveTo((firstPoint.x / 100) * containerWidth, (firstPoint.y / 100) * containerHeight)
        for (let i = 1; i < path.points.length; i++) {
          const point = path.points[i]
          ctx.lineTo((point.x / 100) * containerWidth, (point.y / 100) * containerHeight)
        }
        ctx.stroke()
        ctx.restore()
      }

      // ثانياً: تطبيق الممحاة - نرسم الصورة الأساسية فوق مسارات الممحاة
      for (const path of drawings) {
        if (path.points.length < 2 || !path.isEraser) continue

        ctx.save()
        ctx.beginPath()
        ctx.lineWidth = path.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        const firstPoint = path.points[0]
        ctx.moveTo((firstPoint.x / 100) * containerWidth, (firstPoint.y / 100) * containerHeight)
        for (let i = 1; i < path.points.length; i++) {
          const point = path.points[i]
          ctx.lineTo((point.x / 100) * containerWidth, (point.y / 100) * containerHeight)
        }

        // استخدام المسار كـ clip ورسم الصورة الأساسية داخله
        ctx.clip()
        ctx.drawImage(baseImage, offsetX, offsetY, drawWidth, drawHeight)
        ctx.restore()
      }

      // رسم علامات التعليقات (الدوائر المرقمة)
      const markerRadius = 10
      annotations.forEach((annotation, index) => {
        const markerX = (annotation.x / 100) * containerWidth
        const markerY = (annotation.y / 100) * containerHeight
        const hasTranscription = annotation.transcription && !annotation.isRecording

        ctx.save()
        ctx.beginPath()
        ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2)
        ctx.fillStyle = annotation.isHidden ? '#9ca3af' : '#ec4899'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()

        if (hasTranscription) {
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 10px Cairo, Arial, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText((index + 1).toString(), markerX, markerY)
        }
        ctx.restore()
      })

      // حساب مواقع النصوص - نفس المنطق المستخدم في annotationPositions
      const TEXT_OFFSET = 2
      const localGetBoxPosition = (markerX: number, markerY: number, position: string) => {
        switch (position) {
          case 'bottom': return { x: markerX, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'top': return { x: markerX, y: markerY - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'right': return { x: markerX + TEXT_OFFSET, y: markerY, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'left': return { x: markerX - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: markerY, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'bottom-right': return { x: markerX + TEXT_OFFSET, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'bottom-left': return { x: markerX - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'top-right': return { x: markerX + TEXT_OFFSET, y: markerY - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          case 'top-left': return { x: markerX - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: markerY - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
          default: return { x: markerX, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        }
      }

      const localBoxesOverlap = (box1: { x: number; y: number; width: number; height: number }, box2: { x: number; y: number; width: number; height: number }) => {
        return !(box1.x + box1.width + SAFE_MARGIN < box2.x ||
          box2.x + box2.width + SAFE_MARGIN < box1.x ||
          box1.y + box1.height + SAFE_MARGIN < box2.y ||
          box2.y + box2.height + SAFE_MARGIN < box1.y)
      }

      const localIsBoxInBounds = (box: { x: number; y: number; width: number; height: number }) => {
        return box.x >= 0 && box.y >= 0 && box.x + box.width <= 100 && box.y + box.height <= 100
      }

      // حساب مواقع النصوص
      const textPositions: Map<string, { x: number; y: number }> = new Map()
      const placedBoxes: { x: number; y: number; width: number; height: number }[] = []
      const positionOrder = ['bottom', 'top', 'right', 'left', 'bottom-right', 'bottom-left', 'top-right', 'top-left']

      const sortedAnnotations = [...annotations]
        .filter(a => a.transcription && !a.isRecording)
        .sort((a, b) => a.timestamp - b.timestamp)

      sortedAnnotations.forEach((annotation) => {
        // إذا كان هناك موقع مخصص، استخدمه
        if (annotation.boxX !== undefined && annotation.boxY !== undefined) {
          textPositions.set(annotation.id, { x: annotation.boxX, y: annotation.boxY })
          placedBoxes.push({ x: annotation.boxX, y: annotation.boxY, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT })
          return
        }

        let bestBox = localGetBoxPosition(annotation.x, annotation.y, 'bottom')
        for (const position of positionOrder) {
          const candidateBox = localGetBoxPosition(annotation.x, annotation.y, position)
          if (!localIsBoxInBounds(candidateBox)) continue
          const hasOverlap = placedBoxes.some(pb => localBoxesOverlap(candidateBox, pb))
          if (!hasOverlap) {
            bestBox = candidateBox
            break
          }
        }
        placedBoxes.push(bestBox)
        textPositions.set(annotation.id, { x: bestBox.x, y: bestBox.y })
      })

      // رسم النصوص
      annotations
        .filter(a => a.transcription && !a.isRecording && !a.isHidden)
        .forEach((annotation) => {
          const annotationIndex = annotations.findIndex(a => a.id === annotation.id) + 1
          const textPos = textPositions.get(annotation.id)
          if (!textPos) return

          const textScale = annotation.textScale ?? 1
          const fontSize = Math.round(14 * textScale)
          const textX = (textPos.x / 100) * containerWidth
          const textY = (textPos.y / 100) * containerHeight

          ctx.save()
          ctx.font = `bold ${fontSize}px Cairo, Arial, sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'

          const maxTextWidth = containerWidth * 0.5
          const lineHeight = fontSize * 1.3
          const textToDisplay = annotation.translatedText || annotation.transcription
          const fullText = `${annotationIndex}. ${textToDisplay}`

          // تقسيم النص إلى أسطر
          const words = fullText.split(' ')
          const lines: string[] = []
          let currentLine = ''
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            const metrics = ctx.measureText(testLine)
            if (metrics.width > maxTextWidth && currentLine) {
              lines.push(currentLine)
              currentLine = word
            } else {
              currentLine = testLine
            }
          }
          if (currentLine) lines.push(currentLine)

          // رسم النص مع ظل أبيض (drop-shadow)
          lines.forEach((line, lineIndex) => {
            const lineY = textY + (lineIndex * lineHeight)
            // ظل أبيض
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx !== 0 || dy !== 0) {
                  ctx.fillText(line, textX + dx, lineY + dy)
                }
              }
            }
            // النص الأسود
            ctx.fillStyle = '#000000'
            ctx.fillText(line, textX, lineY)
          })

          ctx.restore()
        })

      return canvas.toDataURL('image/png')
    } catch (error) {
      console.error('Error generating composite image:', error)
      return null
    }
  }, [effectiveImageSrc, drawings, annotations])

  const getCurrentView = useCallback((): 'front' | 'back' => {
    const currentPath = (internalImageOverride || imageSrc).toLowerCase()
    return currentPath.includes('back') ? 'back' : 'front'
  }, [internalImageOverride, imageSrc])

  // دالة حفظ التعليق الحالي
  const saveCurrentComment = useCallback(async () => {
    // التحقق من وجود محتوى للحفظ
    if (annotations.length === 0 && drawings.length === 0) {
      return null
    }

    // تحويل الصورة الحالية إلى base64 إذا وجدت
    let imageBase64 = currentImageBase64
    if (customImage && !imageBase64) {
      imageBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(customImage)
      })
    }

    // إنشاء الصورة المركّبة (تطابق ما يظهر على الشاشة)
    const compositeImage = await generateCompositeImage()

    const currentView = getCurrentView()
    const existingViewCount = savedComments.reduce((count, comment) => {
      const commentView = comment.view ?? getViewFromTitle(comment.title)
      return commentView === currentView ? count + 1 : count
    }, 0)
    const viewLabel = getViewLabel(currentView)
    const viewTitle = existingViewCount === 0 ? viewLabel : `${viewLabel} ${existingViewCount + 1}`

    const newComment: SavedDesignComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      annotations: [...annotations],
      drawings: [...drawings],
      image: imageBase64,
      title: viewTitle,
      view: currentView,
      compositeImage: compositeImage
    }

    const updatedComments = [...savedComments, newComment]
    onSavedCommentsChange?.(updatedComments)

    // مسح التعليق الحالي
    onAnnotationsChange([])
    onDrawingsChange([])
    onImageChange?.(null)

    return newComment
  }, [annotations, drawings, customImage, currentImageBase64, savedComments, onSavedCommentsChange, onAnnotationsChange, onDrawingsChange, onImageChange, generateCompositeImage, getCurrentView])

  // تحديث المرجع لاستخدامه في handleViewSwitch
  saveCurrentRef.current = saveCurrentComment

  // تعريض الدوال للمكون الأب عبر ref
  useImperativeHandle(ref, () => ({
    generateCompositeImage,
    saveCurrentComment,
    getCurrentView
  }), [generateCompositeImage, saveCurrentComment, getCurrentView])

  // دالة التبديل بين الأمام والخلف
  const handleViewSwitch = useCallback(async (targetView: 'front' | 'back') => {
    const targetPath = targetView === 'front' ? '/front2.png' : '/back2.png'

    // 1. التحقق مما إذا كنا بالفعل في العرض المطلوب
    // نعتبر أننا في العرض المطلوب إذا:
    // - لا توجد صورة مخصصة (imagePreview)
    // - المسار الحالي يطابق المسار المستهدف (سواء من الـ override أو الـ prop)
    const currentPath = internalImageOverride || imageSrc
    const isAlreadyInView = !imagePreview && currentPath.includes(targetView === 'front' ? 'front2.png' : 'back2.png')

    if (isAlreadyInView) return

    // 2. الحفظ التلقائي إذا كان هناك تعديلات
    if (annotations.length > 0 || drawings.length > 0) {
      await saveCurrentComment()
      toast.success('تم حفظ التعديلات السابقة تلقائياً', { icon: '💾' })
    } else {
      // إذا لم يكن هناك حفظ، يجب تنظيف اللوحة يدوياً
      onAnnotationsChange([])
      onDrawingsChange([])
    }

    // 3. إلغاء الصورة المخصصة إذا وجدت
    if (imagePreview) {
      onImageChange?.(null)
    }

    // 4. تعيين العرض الجديد
    setInternalImageOverride(targetPath)

  }, [imageSrc, imagePreview, internalImageOverride, annotations.length, drawings.length, saveCurrentComment, onImageChange, onAnnotationsChange, onDrawingsChange])

  // دالة حذف تعليق محفوظ
  const deleteSavedComment = useCallback((commentId: string) => {
    const updatedComments = savedComments.filter(c => c.id !== commentId)
    onSavedCommentsChange?.(updatedComments)
  }, [savedComments, onSavedCommentsChange])

  // دالة بدء تعديل اسم التعليق
  const startEditingCommentTitle = useCallback((commentId: string, currentTitle: string) => {
    setEditingCommentTitle(commentId)
    setEditedCommentTitle(currentTitle)
  }, [])

  // دالة حفظ اسم التعليق المعدل
  const saveCommentTitle = useCallback(() => {
    if (!editingCommentTitle) return

    const updatedComments = savedComments.map(c =>
      c.id === editingCommentTitle ? { ...c, title: editedCommentTitle } : c
    )
    onSavedCommentsChange?.(updatedComments)
    setEditingCommentTitle(null)
    setEditedCommentTitle('')
  }, [editingCommentTitle, editedCommentTitle, savedComments, onSavedCommentsChange])

  // دالة إلغاء تعديل اسم التعليق
  const cancelEditingCommentTitle = useCallback(() => {
    setEditingCommentTitle(null)
    setEditedCommentTitle('')
  }, [])

  // دالة تحميل تعليق محفوظ للعرض (view mode)
  const loadCommentForViewing = useCallback(async (comment: SavedDesignComment) => {
    // التحقق من وجود محتوى حالي غير محفوظ
    const hasUnsavedContent = (annotations.length > 0 || drawings.length > 0) && !viewingCommentId && !editingCommentId

    if (hasUnsavedContent) {
      // عرض تنبيه للمستخدم
      const shouldSave = window.confirm(
        'لديك تعليقات أو رسومات غير محفوظة. هل تريد حفظها قبل عرض التعليق المحفوظ؟'
      )

      if (shouldSave) {
        // حفظ التعليق الحالي تلقائياً
        await saveCurrentComment()
      }
    }

    // تحميل التعليقات والرسومات بدون تفعيل وضع التعديل
    onAnnotationsChange(comment.annotations)
    onDrawingsChange(comment.drawings)
    // حفظ الحالة الأصلية للكشف عن التغييرات
    setOriginalViewingAnnotations(JSON.parse(JSON.stringify(comment.annotations)))
    setOriginalViewingDrawings(JSON.parse(JSON.stringify(comment.drawings)))
    // تحديد التعليق الذي يتم عرضه
    setViewingCommentId(comment.id)
    // إلغاء أي وضع تعديل نشط
    setEditingCommentId(null)
    setIsDrawingMode(false)
    setIsRecordingActive(false)
    // تعيين الصورة المناسبة حسب نوع العرض (أمام/خلف)
    if (comment.view) {
      const targetPath = comment.view === 'front' ? '/front2.png' : '/back2.png'
      setInternalImageOverride(targetPath)

      if (imagePreview) {
        setImagePreview(null)
        onImageChange?.(null)
      }
    } else if (comment.image && comment.image.startsWith('data:')) {
      setImagePreview(comment.image)
      setInternalImageOverride(null)
    }
    // لا نحمل الصورة لأنها base64 وليست File
  }, [annotations, drawings, viewingCommentId, editingCommentId, saveCurrentComment, onAnnotationsChange, onDrawingsChange])

  // دالة تحديث التعليق المحفوظ الذي يتم عرضه
  const updateViewingComment = useCallback(async () => {
    if (!viewingCommentId) return

    let imageBase64 = currentImageBase64
    if (customImage && !imageBase64) {
      imageBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(customImage)
      })
    }

    // إنشاء الصورة المركّبة الجديدة
    const compositeImage = await generateCompositeImage()

    const updatedComments = savedComments.map(c => {
      if (c.id === viewingCommentId) {
        return {
          ...c,
          annotations: [...annotations],
          drawings: [...drawings],
          image: imageBase64 || c.image,
          compositeImage: compositeImage || c.compositeImage, // تحديث الصورة المركّبة
          timestamp: Date.now()
        }
      }
      return c
    })

    onSavedCommentsChange?.(updatedComments)
    // إلغاء وضع العرض بعد الحفظ ومسح البيانات
    setViewingCommentId(null)
    setOriginalViewingAnnotations([])
    setOriginalViewingDrawings([])
    // مسح التعليقات والرسومات الحالية لتجنب ظهور زر "حفظ التعليق"
    onAnnotationsChange([])
    onDrawingsChange([])
  }, [viewingCommentId, annotations, drawings, customImage, currentImageBase64, savedComments, onSavedCommentsChange, onAnnotationsChange, onDrawingsChange, generateCompositeImage])

  // دالة تحديث تعليق محفوظ
  const updateSavedComment = useCallback(async () => {
    if (!editingCommentId) return

    let imageBase64 = currentImageBase64
    if (customImage && !imageBase64) {
      imageBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(customImage)
      })
    }

    // إنشاء الصورة المركّبة الجديدة
    const compositeImage = await generateCompositeImage()

    const updatedComments = savedComments.map(c => {
      if (c.id === editingCommentId) {
        return {
          ...c,
          annotations: [...annotations],
          drawings: [...drawings],
          image: imageBase64 || c.image,
          compositeImage: compositeImage || c.compositeImage, // تحديث الصورة المركّبة
          timestamp: Date.now()
        }
      }
      return c
    })

    onSavedCommentsChange?.(updatedComments)
    setEditingCommentId(null)
    onAnnotationsChange([])
    onDrawingsChange([])
    onImageChange?.(null)
  }, [editingCommentId, annotations, drawings, customImage, currentImageBase64, savedComments, onSavedCommentsChange, onAnnotationsChange, onDrawingsChange, onImageChange, generateCompositeImage])

  // دالة إلغاء التعديل
  const cancelEditing = useCallback(() => {
    setEditingCommentId(null)
    onAnnotationsChange([])
    onDrawingsChange([])
    onImageChange?.(null)
  }, [onAnnotationsChange, onDrawingsChange, onImageChange])

  // إنشاء URL للصورة المختارة
  useEffect(() => {
    if (customImage) {
      const url = URL.createObjectURL(customImage)
      setImagePreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setImagePreview(null)
    }
  }, [customImage])

  // الصورة المعروضة (المخصصة أو الافتراضية)
  const displayedImageSrc = imagePreview || imageSrc

  // ===== منع تحريك الصفحة أثناء الرسم على الأجهزة المحمولة =====
  useEffect(() => {
    if (!isDrawingMode) return

    // منع التمرير على body
    const originalOverflow = document.body.style.overflow
    const originalTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    // منع أحداث اللمس الافتراضية على الحاوية
    const container = containerRef.current
    if (!container) return

    const preventTouchMove = (e: TouchEvent) => {
      // منع التمرير فقط إذا كان اللمس داخل الحاوية
      if (container.contains(e.target as Node)) {
        e.preventDefault()
      }
    }

    const preventTouchStart = (e: TouchEvent) => {
      // منع multi-touch zooming
      if (e.touches.length > 1 && container.contains(e.target as Node)) {
        e.preventDefault()
      }
    }

    // إضافة event listeners بـ passive: false لتمكين preventDefault
    document.addEventListener('touchmove', preventTouchMove, { passive: false })
    document.addEventListener('touchstart', preventTouchStart, { passive: false })

    return () => {
      // إعادة الحالة الأصلية
      document.body.style.overflow = originalOverflow
      document.body.style.touchAction = originalTouchAction
      document.removeEventListener('touchmove', preventTouchMove)
      document.removeEventListener('touchstart', preventTouchStart)
    }
  }, [isDrawingMode])

  // ===== إغلاق النوافذ المنبثقة عند الضغط خارجها =====
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // التحقق من أن الضغط ليس على أي من أزرار فتح النوافذ أو النوافذ نفسها
      const isClickOnPicker = target.closest('.color-picker-container') ||
        target.closest('.brush-picker-container') ||
        target.closest('.eraser-menu-container') ||
        target.closest('.plus-menu-container')

      if (!isClickOnPicker) {
        setShowColorPicker(false)
        setShowBrushPicker(false)
        setShowEraserMenu(false)
        setShowEraserSizePicker(false)
        setShowPlusMenu(false)
      }
    }

    // إضافة المستمع فقط إذا كانت أي نافذة مفتوحة
    if (showColorPicker || showBrushPicker || showEraserMenu || showEraserSizePicker || showPlusMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showColorPicker, showBrushPicker, showEraserMenu, showEraserSizePicker, showPlusMenu])

  // دالة حساب موقع المربع بناءً على الاتجاه
  // تم تعديلها لجعل النص يظهر مباشرة تحت/بجانب العلامة مع مسافة بسيطة
  const getBoxPosition = useCallback((markerX: number, markerY: number, position: BoxPosition): BoundingBox => {
    // مسافة صغيرة بين العلامة والنص (2% فقط)
    const TEXT_OFFSET = 2

    switch (position) {
      case 'bottom':
        // النص يبدأ من نفس موقع X للعلامة، وتحتها مباشرة
        return { x: markerX, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'top':
        return { x: markerX, y: markerY - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'right':
        return { x: markerX + TEXT_OFFSET, y: markerY, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'left':
        return { x: markerX - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: markerY, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'bottom-right':
        return { x: markerX + TEXT_OFFSET, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'bottom-left':
        return { x: markerX - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'top-right':
        return { x: markerX + TEXT_OFFSET, y: markerY - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'top-left':
        return { x: markerX - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: markerY - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      default:
        return { x: markerX, y: markerY + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
    }
  }, [])

  // دالة اكتشاف التصادم بين مربعين
  const boxesOverlap = useCallback((box1: BoundingBox, box2: BoundingBox): boolean => {
    return !(box1.x + box1.width + SAFE_MARGIN < box2.x ||
      box2.x + box2.width + SAFE_MARGIN < box1.x ||
      box1.y + box1.height + SAFE_MARGIN < box2.y ||
      box2.y + box2.height + SAFE_MARGIN < box1.y)
  }, [])

  // دالة التحقق من أن المربع داخل حدود الصورة
  const isBoxInBounds = useCallback((box: BoundingBox): boolean => {
    return box.x >= 0 && box.y >= 0 &&
      box.x + box.width <= 100 &&
      box.y + box.height <= 100
  }, [])

  // حساب أفضل موقع لكل مربع نص مع تجنب التصادمات
  const annotationPositions = useMemo(() => {
    const positions: Map<string, { position: BoxPosition; box: BoundingBox; zIndex: number; isCustom: boolean }> = new Map()
    const placedBoxes: BoundingBox[] = []
    const positionOrder: BoxPosition[] = ['bottom', 'top', 'right', 'left', 'bottom-right', 'bottom-left', 'top-right', 'top-left']

    // ترتيب التعليقات حسب الوقت (الأقدم أولاً)
    const sortedAnnotations = [...annotations]
      .filter(a => a.transcription && !a.isRecording)
      .sort((a, b) => a.timestamp - b.timestamp)

    sortedAnnotations.forEach((annotation, index) => {
      // إذا كان هناك موقع مخصص، استخدمه مباشرة
      if (annotation.boxX !== undefined && annotation.boxY !== undefined) {
        const customBox: BoundingBox = {
          x: annotation.boxX,
          y: annotation.boxY,
          width: BOX_WIDTH_PERCENT,
          height: BOX_HEIGHT_PERCENT
        }
        placedBoxes.push(customBox)
        positions.set(annotation.id, {
          position: 'bottom', // لا يهم للموقع المخصص
          box: customBox,
          zIndex: 60 + index, // z-index أعلى للمواقع المخصصة
          isCustom: true
        })
        return
      }

      let bestPosition: BoxPosition = 'bottom'
      let bestBox = getBoxPosition(annotation.x, annotation.y, 'bottom')
      let foundPosition = false

      // البحث عن موقع لا يتداخل مع المربعات الأخرى
      for (const position of positionOrder) {
        const candidateBox = getBoxPosition(annotation.x, annotation.y, position)

        // التحقق من أن المربع داخل الحدود
        if (!isBoxInBounds(candidateBox)) continue

        // التحقق من عدم وجود تداخل مع المربعات المحجوزة
        const hasOverlap = placedBoxes.some(placedBox => boxesOverlap(candidateBox, placedBox))

        if (!hasOverlap) {
          bestPosition = position
          bestBox = candidateBox
          foundPosition = true
          break
        }
      }

      // إذا لم يتم العثور على موقع فارغ، استخدم الموقع الافتراضي مع z-index أعلى
      if (!foundPosition) {
        bestBox = getBoxPosition(annotation.x, annotation.y, 'bottom')
        // تعديل المربع ليكون داخل الحدود
        if (bestBox.x < 0) bestBox.x = 0
        if (bestBox.y < 0) bestBox.y = 0
        if (bestBox.x + bestBox.width > 100) bestBox.x = 100 - bestBox.width
        if (bestBox.y + bestBox.height > 100) bestBox.y = 100 - bestBox.height
      }

      placedBoxes.push(bestBox)
      positions.set(annotation.id, {
        position: bestPosition,
        box: bestBox,
        zIndex: foundPosition ? 10 + index : 50 + index,
        isCustom: false
      })
    })

    return positions
  }, [annotations, getBoxPosition, boxesOverlap, isBoxInBounds])

  // دالة الحصول على أنماط CSS لموقع المربع
  const getBoxStyles = useCallback((annotationId: string) => {
    const positionData = annotationPositions.get(annotationId)
    const isActive = activeTranscriptionId === annotationId
    const isEditing = editingTranscriptionId === annotationId
    const isDragging = draggingId === annotationId

    if (!positionData) {
      return {
        transform: 'translateX(-50%)',
        top: '100%',
        left: '50%',
        marginTop: '0.5rem',
        zIndex: isActive || isEditing || isDragging ? 100 : 10
      }
    }

    const { box, zIndex } = positionData
    return {
      position: 'absolute' as const,
      left: `${box.x}%`,
      top: `${box.y}%`,
      zIndex: isActive || isEditing || isDragging ? 100 : zIndex,
      transform: 'none'
    }
  }, [annotationPositions, activeTranscriptionId, editingTranscriptionId, draggingId])

  // معالج نهاية السحب
  const handleDragEnd = useCallback((annotationId: string, info: { point: { x: number; y: number } }) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const boxX = ((info.point.x - rect.left) / rect.width) * 100
    const boxY = ((info.point.y - rect.top) / rect.height) * 100

    // التأكد من أن المربع داخل الحدود
    const clampedX = Math.max(0, Math.min(100 - BOX_WIDTH_PERCENT, boxX))
    const clampedY = Math.max(0, Math.min(100 - BOX_HEIGHT_PERCENT, boxY))

    const updatedAnnotations = annotations.map(a =>
      a.id === annotationId ? { ...a, boxX: clampedX, boxY: clampedY } : a
    )
    onAnnotationsChange(updatedAnnotations)
    setDraggingId(null)
  }, [annotations, onAnnotationsChange])

  // معالج نهاية سحب النص
  const handleTextDragEnd = useCallback((annotationId: string, info: any, element: HTMLElement | null) => {
    if (!containerRef.current || !element) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()

    // حساب الموقع الجديد بناءً على موقع العنصر الفعلي بعد السحب
    const newX = ((elementRect.left - containerRect.left) / containerRect.width) * 100
    const newY = ((elementRect.top - containerRect.top) / containerRect.height) * 100

    // التأكد من أن النص داخل الحدود
    const clampedX = Math.max(0, Math.min(95, newX))
    const clampedY = Math.max(0, Math.min(95, newY))

    const updatedAnnotations = annotations.map(a =>
      a.id === annotationId ? { ...a, boxX: clampedX, boxY: clampedY } : a
    )
    onAnnotationsChange(updatedAnnotations)
  }, [annotations, onAnnotationsChange])

  // حذف تعليق
  const deleteAnnotation = (id: string) => {
    const audioRefs = audioRefsRef.current
    const audio = audioRefs.get(id)
    if (audio) {
      audio.pause()
      audioRefs.delete(id)
    }
    if (playingId === id) setPlayingId(null)
    if (activeAnnotationId === id) setActiveAnnotationId(null)
    onAnnotationsChange(annotations.filter(a => a.id !== id))
  }

  // معالج بدء سحب العلامة
  const handleMarkerDragStart = useCallback(() => {
    setIsDraggingMarker(true)
    setIsOverDeleteZone(false)
  }, [])

  // معالج حركة سحب العلامة
  const handleMarkerDrag = useCallback((info: any, element: HTMLElement | null) => {
    if (!containerRef.current || !element) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()

    // حساب مركز العلامة
    const markerCenterX = elementRect.left + elementRect.width / 2
    const markerCenterY = elementRect.top + elementRect.height / 2

    // حساب مركز منطقة الحذف
    // منطقة الحذف: bottom-6 (24px) + h-14 (56px) -> center is 24 + 28 = 52px from bottom
    const deleteZoneCenterX = containerRect.left + containerRect.width / 2
    const deleteZoneCenterY = containerRect.bottom - 52

    // حساب المسافة بين المركزين
    const distance = Math.sqrt(
      Math.pow(markerCenterX - deleteZoneCenterX, 2) +
      Math.pow(markerCenterY - deleteZoneCenterY, 2)
    )

    // نصف قطر منطقة الحذف الفعال (نجعله أكبر قليلاً لسهولة الاستخدام - مثلا 40 بكسل)
    const hitRadius = 40

    setIsOverDeleteZone(distance < hitRadius)
  }, [])

  // معالج نهاية سحب العلامة (الدائرة الوردية)
  const handleMarkerDragEnd = useCallback((annotationId: string, info: any, element: HTMLElement | null) => {
    setIsDraggingMarker(false)

    if (isOverDeleteZone) {
      deleteAnnotation(annotationId)
      setIsOverDeleteZone(false)
      return
    }

    setIsOverDeleteZone(false)

    if (!containerRef.current || !element) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()

    // حساب الموقع الجديد للعلامة (مركز الدائرة)
    const centerX = elementRect.left + elementRect.width / 2
    const centerY = elementRect.top + elementRect.height / 2

    const newX = ((centerX - containerRect.left) / containerRect.width) * 100
    const newY = ((centerY - containerRect.top) / containerRect.height) * 100

    // التأكد من أن العلامة داخل الحدود
    const clampedX = Math.max(0, Math.min(100, newX))
    const clampedY = Math.max(0, Math.min(100, newY))

    const updatedAnnotations = annotations.map(a =>
      a.id === annotationId ? { ...a, x: clampedX, y: clampedY } : a
    )
    onAnnotationsChange(updatedAnnotations)
  }, [annotations, onAnnotationsChange, isOverDeleteZone])

  // معالج تغيير النص (للتعديل المباشر)
  const handleTextChange = useCallback((annotationId: string, newText: string) => {
    const positionData = annotationPositions.get(annotationId)
    const updatedAnnotations = annotations.map(a =>
      a.id === annotationId
        ? {
          ...a,
          transcription: newText,
          ...(a.boxX === undefined || a.boxY === undefined
            ? (positionData ? { boxX: positionData.box.x, boxY: positionData.box.y } : {})
            : {})
        }
        : a
    )
    onAnnotationsChange(updatedAnnotations)

    // إذا كان النص مترجماً سابقاً، قم بتحديث الترجمة تلقائياً
    const annotation = annotations.find(a => a.id === annotationId)
    if (annotation && annotation.translationLanguage) {
      // استخدام timeout صغير لتجنب التحديث المفرط أو التداخل
      setTimeout(() => {
        translateAnnotationText(annotationId, annotation.translationLanguage!)
      }, 500)
    }
  }, [annotations, onAnnotationsChange, annotationPositions])


  // دوال تعديل النص
  const handleSaveEdit = useCallback((e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation()
    const trimmed = editedText.trim()
    const currentAnnotation = annotations.find(a => a.id === annotationId)
    if (!trimmed || !currentAnnotation) {
      setEditingTranscriptionId(null)
      setEditedText('')
      return
    }
    if (trimmed === (currentAnnotation.transcription || '')) {
      setEditingTranscriptionId(null)
      setEditedText('')
      return
    }
    const positionData = annotationPositions.get(annotationId)
    const updatedAnnotations = annotations.map(a =>
      a.id === annotationId
        ? {
          ...a,
          transcription: trimmed,
          ...(a.boxX === undefined || a.boxY === undefined
            ? (positionData ? { boxX: positionData.box.x, boxY: positionData.box.y } : {})
            : {})
        }
        : a
    )
    onAnnotationsChange(updatedAnnotations)

    // إذا كان النص مترجماً سابقاً، قم بتحديث الترجمة تلقائياً
    if (currentAnnotation.translationLanguage) {
      setTimeout(() => {
        translateAnnotationText(annotationId, currentAnnotation.translationLanguage!)
      }, 500)
    }
    setEditingTranscriptionId(null)
    setEditedText('')
  }, [editedText, annotations, onAnnotationsChange, annotationPositions])

  const handleCancelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTranscriptionId(null)
    setEditedText('')
  }, [])

  // دالة تبديل إخفاء/إظهار النص على الصورة
  const toggleTextVisibility = useCallback((annotationId: string) => {
    const updatedAnnotations = annotations.map(a =>
      a.id === annotationId ? { ...a, isHidden: !a.isHidden } : a
    )
    onAnnotationsChange(updatedAnnotations)
  }, [annotations, onAnnotationsChange])

  // دالة تغيير حجم النص
  const changeTextScale = useCallback((annotationId: string, delta: number) => {
    const updatedAnnotations = annotations.map(a => {
      if (a.id === annotationId) {
        const currentScale = a.textScale ?? 1
        const newScale = Math.max(0.5, Math.min(2, currentScale + delta))
        return { ...a, textScale: newScale }
      }
      return a
    })
    onAnnotationsChange(updatedAnnotations)
  }, [annotations, onAnnotationsChange])

  // ===== دوال الرسم الحر =====

  // تحويل إحداثيات الحدث إلى نسب مئوية مع دعم الضغط
  const getDrawingCoordinates = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent): DrawingPoint | null => {
    if (!containerRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    let clientX: number, clientY: number
    let pressure = 0.5 // ضغط افتراضي

    if ('pointerType' in e) {
      // Pointer Event
      clientX = e.clientX
      clientY = e.clientY
      pressure = e.pressure

      // في حالة Pen Mode و الحدث ليس قلماً -> تجاهل
      if (isPenMode && e.pointerType !== 'pen') return null

      // تحسين الضغط للأجهزة التي لا تدعمه
      if (pressure === 0 && e.pointerType === 'touch') pressure = 0.5
      if (pressure === 0 && e.pointerType === 'mouse' && e.buttons === 1) pressure = 0.5

    } else if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
      if (isPenMode) return null // تجاهل اللمس القديم في وضع القلم
    } else {
      clientX = (e as React.MouseEvent).clientX
      clientY = (e as React.MouseEvent).clientY
      if (isPenMode) return null // الماوس يعتبر ليس قلماً
    }

    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100

    // التأكد من أن النقطة داخل الحدود
    if (x < 0 || x > 100 || y < 0 || y > 100) return null

    return { x, y, pressure }
  }, [isPenMode])

  // مرجع للمسار الحالي لتحسين الأداء
  const currentPathRef = useRef<DrawingPoint[]>([])
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<DrawingPoint | null>(null)

  // إغلاق جميع القوائم المنبثقة
  const closeAllPickers = useCallback(() => {
    setShowColorPicker(false)
    setShowStrokePicker(false)
    setShowBrushPicker(false)
    setShowEraserSizePicker(false)
    setShowEraserMenu(false)
    setShowPlusMenu(false)
  }, [])

  // بدء الرسم - محسّن للاستجابة الفورية
  const handleDrawingStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingMode || disabled) return
    if (isAnnotationInteractiveTarget(e.target)) return

    // إغلاق جميع القوائم المنبثقة عند بدء الرسم
    if (showColorPicker || showStrokePicker || showBrushPicker || showEraserSizePicker || showEraserMenu || showPlusMenu) {
      closeAllPickers()
      // لا نمنع الرسم - نسمح بالاستمرار بعد إغلاق القوائم
    }

    // منع اللمس العرضي (Palm Rejection)
    if (isPenMode && e.pointerType !== 'pen') return

    // إضافة تحقق للتأكد من وجود الدوال قبل استدعائها
    if (e.preventDefault) e.preventDefault()
    if (e.stopPropagation) e.stopPropagation()

    // التقاط المؤشر لضمان استمرار الرسم حتى لو خرج عن العنصر
    if (e.target && (e.target as HTMLElement).setPointerCapture && e.pointerId) {
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId)
      } catch (err) {
        // ignore error if capture fails
      }
    }

    const point = getDrawingCoordinates(e)
    if (point) {
      isDrawingRef.current = true
      currentPathRef.current = [point]
      lastPointRef.current = point
      setIsDrawing(true)
      setCurrentPath([point])

      // رسم نقطة فورية على Canvas
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const rect = canvas.getBoundingClientRect()
          const x = point.x * canvas.width / 100
          const y = point.y * canvas.height / 100

          // حساب الحجم بناءً على الضغط
          const width = isEraserMode ? eraserWidth : (strokeWidth * (0.5 + (point.pressure || 0.5)))

          ctx.beginPath()
          ctx.arc(x, y, width / 2, 0, Math.PI * 2)
          ctx.fillStyle = isEraserMode ? '#ffffff' : drawingColor
          ctx.fill()
        }
      }
    }
  }, [isDrawingMode, disabled, showColorPicker, showStrokePicker, showBrushPicker, showEraserSizePicker, showEraserMenu, showPlusMenu, closeAllPickers, getDrawingCoordinates, isEraserMode, eraserWidth, strokeWidth, drawingColor, isPenMode, isAnnotationInteractiveTarget])

  // الاستمرار في الرسم - محسّن للأداء
  const handleDrawingMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current || !isDrawingMode) return
    if (isPenMode && e.pointerType !== 'pen') return

    e.preventDefault()

    const point = getDrawingCoordinates(e)
    if (point) {
      // تحقق من المسافة لتجنب النقاط المتكررة جداً
      const lastPoint = lastPointRef.current
      if (lastPoint) {
        const distance = Math.sqrt(
          Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
        )
        // تجاهل النقاط القريبة جداً لتحسين الأداء
        if (distance < 0.3) return
      }

      lastPointRef.current = point
      currentPathRef.current = [...currentPathRef.current, point]

      // رسم مباشر على Canvas للاستجابة الفورية
      const canvas = canvasRef.current
      if (canvas && lastPoint) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const x1 = lastPoint.x * canvas.width / 100
          const y1 = lastPoint.y * canvas.height / 100
          const x2 = point.x * canvas.width / 100
          const y2 = point.y * canvas.height / 100

          // حساب الطول المتراكم للنقاط السابقة لضبط نمط التقطع
          let currentLength = 0
          if (brushType === 'dashed' || brushType === 'dotted') {
            for (let i = 1; i < currentPathRef.current.length - 1; i++) {
              const p1 = currentPathRef.current[i - 1]
              const p2 = currentPathRef.current[i]
              const px1 = p1.x * canvas.width / 100
              const py1 = p1.y * canvas.height / 100
              const px2 = p2.x * canvas.width / 100
              const py2 = p2.y * canvas.height / 100
              currentLength += Math.sqrt(Math.pow(px2 - px1, 2) + Math.pow(py2 - py1, 2))
            }
            // تطبيق الإزاحة
            ctx.lineDashOffset = -currentLength
          } else {
            ctx.lineDashOffset = 0
          }


          // استخدام الضغط لتحديد سماكة الخط
          const p1Pressure = lastPoint.pressure || 0.5
          const p2Pressure = point.pressure || 0.5
          const avgPressure = (p1Pressure + p2Pressure) / 2

          const currentWidth = isEraserMode
            ? eraserWidth
            : strokeWidth * (0.5 + avgPressure)

          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.strokeStyle = isEraserMode ? '#ffffff' : drawingColor
          ctx.lineWidth = currentWidth
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.stroke()

          // رسم دائرة في النهاية لتنعيم الخط عند تغير السمك
          if (!isEraserMode) {
            ctx.beginPath()
            ctx.arc(x2, y2, currentWidth / 2, 0, Math.PI * 2)
            ctx.fillStyle = drawingColor
            ctx.fill()
          }
        }
      }

      // تحديث الحالة بشكل أقل تكراراً
      setCurrentPath([...currentPathRef.current])
    }
  }, [isDrawingMode, getDrawingCoordinates, isEraserMode, eraserWidth, strokeWidth, drawingColor])

  // إنهاء الرسم - يدعم النقطة الواحدة
  const handleDrawingEnd = useCallback(() => {
    if (!isDrawingRef.current) {
      return
    }

    const pathPoints = currentPathRef.current

    // السماح بحفظ حتى نقطة واحدة
    if (pathPoints.length >= 1) {
      // إذا كانت نقطة واحدة، نضيف نقطة ثانية قريبة جداً لإنشاء نقطة مرئية
      const finalPoints = pathPoints.length === 1
        ? [pathPoints[0], { x: pathPoints[0].x + 0.1, y: pathPoints[0].y + 0.1 }]
        : pathPoints

      const newPath: DrawingPath = {
        id: Date.now().toString(),
        points: finalPoints,
        color: isEraserMode ? '#ffffff' : drawingColor,
        strokeWidth: isEraserMode ? eraserWidth : strokeWidth,
        brushType: isEraserMode ? 'normal' : brushType,
        isEraser: isEraserMode,
        timestamp: Date.now()
      }

      onDrawingsChange([...drawings, newPath])
      setRedoStack([])
    }

    isDrawingRef.current = false
    currentPathRef.current = []
    lastPointRef.current = null
    setIsDrawing(false)
    setCurrentPath([])
  }, [drawingColor, strokeWidth, brushType, isEraserMode, eraserWidth, drawings, onDrawingsChange])

  // التراجع عن آخر رسمة
  const handleUndoDrawing = useCallback(() => {
    if (drawings.length > 0) {
      const lastDrawing = drawings[drawings.length - 1]
      skipRedoResetRef.current = true
      setRedoStack(prev => [...prev, lastDrawing])
      onDrawingsChange(drawings.slice(0, -1))
    }
  }, [drawings, onDrawingsChange])

  const handleRedoDrawing = useCallback(() => {
    if (redoStack.length === 0) return
    const lastRedo = redoStack[redoStack.length - 1]
    skipRedoResetRef.current = true
    setRedoStack(prev => prev.slice(0, -1))
    onDrawingsChange([...drawings, lastRedo])
  }, [drawings, redoStack, onDrawingsChange])

  // مسح جميع الرسومات
  const handleClearAllDrawings = useCallback(() => {
    onDrawingsChange([])
    setRedoStack([])
  }, [onDrawingsChange])

  // تفعيل/إلغاء وضع الرسم
  const toggleDrawingMode = useCallback(() => {
    setIsDrawingMode(prev => {
      return !prev
    })
    setShowColorPicker(false)
    setShowStrokePicker(false)
    setShowBrushPicker(false)
    setShowEraserSizePicker(false)
    setShowEraserMenu(false)
    setShowPlusMenu(false)
    setIsEraserMode(false)
    // إعادة تعيين الحالة عند الخروج من وضع الرسم
    if (isDrawingMode) {
      setIsDrawing(false)
      setCurrentPath([])
    }
  }, [isDrawingMode])

  useEffect(() => {
    if (skipRedoResetRef.current) {
      skipRedoResetRef.current = false
      return
    }
    setRedoStack([])
  }, [drawings])

  // تفعيل/إلغاء وضع الممحاة
  const toggleEraserMode = useCallback(() => {
    setShowBrushPicker(false)
    setShowColorPicker(false)
    setShowStrokePicker(false)
    setShowEraserSizePicker(false)
    setShowPlusMenu(false)

    if (!isEraserMode) {
      setIsEraserMode(true)
      setShowEraserMenu(false)
      return
    }

    setShowEraserMenu(prev => !prev)
  }, [isEraserMode])

  // إغلاق وضع الرسم (للزر X)
  const exitFullScreen = useCallback(() => {
    setIsDrawingMode(false)
    setIsDrawing(false)
    setCurrentPath([])
    closeAllPickers()
    setIsEraserMode(false)
  }, [closeAllPickers])


  // ===== دوال تبديل الصورة =====

  // التحقق من صحة الملف
  const validateImageFile = useCallback((file: File): boolean => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    if (!validTypes.includes(file.type)) {
      setError('الملف يجب أن يكون صورة (JPG, PNG, GIF, WebP)')
      return false
    }
    // الحد الأقصى 10 ميجابايت
    if (file.size > 10 * 1024 * 1024) {
      setError('حجم الصورة يجب أن لا يتجاوز 10 ميجابايت')
      return false
    }
    return true
  }, [])

  // معالجة اختيار الصورة من المعرض
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && validateImageFile(file)) {
      setError(null)
      onImageChange?.(file)
      setShowImageOptions(false)
    }
    // إعادة تعيين قيمة الحقل للسماح باختيار نفس الملف مرة أخرى
    e.target.value = ''
  }, [onImageChange, validateImageFile])

  // معالجة التقاط صورة من الكاميرا
  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && validateImageFile(file)) {
      setError(null)
      onImageChange?.(file)
      setShowImageOptions(false)
    }
    e.target.value = ''
  }, [onImageChange, validateImageFile])

  // إعادة الصورة الافتراضية
  const handleResetImage = useCallback(() => {
    onImageChange?.(null)
    setShowImageOptions(false)
    setError(null)
  }, [onImageChange])

  // فتح اختيار الصورة من المعرض
  const openGallery = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // فتح الكاميرا
  const openCamera = useCallback(() => {
    cameraInputRef.current?.click()
  }, [])

  // ===== نهاية دوال تبديل الصورة =====

  // دالة مساعدة لتطبيق نمط الفرشاة
  const applyBrushStyle = useCallback((ctx: CanvasRenderingContext2D, pathBrushType: BrushType, pathIsEraser: boolean = false) => {
    // إعادة تعيين الإعدادات
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = pathIsEraser ? 'destination-out' : 'source-over'

    if (pathIsEraser) {
      ctx.setLineDash([]) // تأكد من أن الممحاة دائماً متصلة
      return
    }

    switch (pathBrushType) {
      case 'dashed':
        ctx.setLineDash([15, 15]) // زيادة طول الخط والفراغ للوضوح
        break
      case 'dotted':
        ctx.setLineDash([2, 10]) // نقاط صغيرة ومتباعدة
        break
      case 'soft':
        ctx.shadowBlur = 8
        ctx.shadowColor = ctx.strokeStyle as string
        break
      case 'pencil':
        ctx.globalAlpha = 0.85
        ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.5)
        break
      case 'highlighter':
        ctx.globalAlpha = 0.4
        ctx.lineWidth = ctx.lineWidth * 2.5
        ctx.lineCap = 'square'
        break
      case 'normal':
      default:
        break
    }
  }, [])

  // رسم المسارات على Canvas مع دعم تغير الضغط
  const drawPaths = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // تحديث أبعاد الـ Canvas
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    // مسح الـ Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // دالة مساعدة لرسم مسار
    const drawSinglePath = (path: DrawingPoint[], color: string, baseWidth: number, type: BrushType, isEraser: boolean) => {
      if (path.length < 2) return

      applyBrushStyle(ctx, type || 'normal', isEraser || false)
      ctx.strokeStyle = color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // رسم مقاطع منفصلة لدعم تغير العرض

      let accumulatedLength = 0

      for (let i = 1; i < path.length; i++) {
        const p1 = path[i - 1]
        const p2 = path[i]

        // حساب إحداثيات النقاط
        const px1 = (p1.x / 100) * canvas.width
        const py1 = (p1.y / 100) * canvas.height
        const px2 = (p2.x / 100) * canvas.width
        const py2 = (p2.y / 100) * canvas.height

        // حساب المسافة للإزاحة
        const dist = Math.sqrt(Math.pow(px2 - px1, 2) + Math.pow(py2 - py1, 2))

        const p1Pressure = p1.pressure || 0.5
        const p2Pressure = p2.pressure || 0.5
        const avgPressure = (p1Pressure + p2Pressure) / 2

        // حساب العرض لهذا المقطع
        const width = isEraser ? baseWidth : baseWidth * (0.5 + avgPressure)

        ctx.beginPath()

        // ضبط الإزاحة للخطوط المتقطعة لضمان الاستمرارية
        if (!isEraser && (type === 'dashed' || type === 'dotted')) {
          ctx.lineDashOffset = -accumulatedLength
        } else {
          ctx.lineDashOffset = 0
        }

        accumulatedLength += dist

        ctx.lineWidth = width
        ctx.moveTo(px1, py1)
        ctx.lineTo(px2, py2)
        ctx.stroke()

        // دوائر التنعيم
        if (!isEraser && width > 2) {
          ctx.beginPath()
          ctx.arc((p2.x / 100) * canvas.width, (p2.y / 100) * canvas.height, width / 2, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }
    }

    // رسم المسارات المحفوظة
    drawings.forEach(path => {
      ctx.save()
      drawSinglePath(path.points, path.color, path.strokeWidth, path.brushType, path.isEraser || false)
      ctx.restore()
    })

    // رسم المسار الحالي
    if (currentPath.length >= 2) {
      ctx.save()
      drawSinglePath(currentPath, isEraserMode ? '#cccccc' : drawingColor, isEraserMode ? eraserWidth : strokeWidth, isEraserMode ? 'normal' : brushType, isEraserMode)
      ctx.restore()
    }
  }, [drawings, currentPath, drawingColor, strokeWidth, brushType, isEraserMode, eraserWidth, applyBrushStyle])


  // إعادة رسم الـ Canvas عند تغيير المسارات
  useEffect(() => {
    drawPaths()
  }, [drawPaths])

  // إعادة رسم الـ Canvas عند تغيير حجم النافذة
  useEffect(() => {
    const handleResize = () => {
      drawPaths()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawPaths])

  // فرض إعادة الرسم عند دخول وضع الرسم (لحل مشكلة اختفاء الرسومات)
  useEffect(() => {
    if (isDrawingMode) {
      // تأخير بسيط لضمان جاهزية العناصر في الـ Portal
      const timer = setTimeout(() => {
        drawPaths()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isDrawingMode, drawPaths])

  // ===== نهاية دوال الرسم الحر =====

  // معالج النقر على العلامة لرفع مربع النص المرتبط
  const handleMarkerClick = useCallback((e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation()
    if (editingTranscriptionId) return // لا تغير أثناء التعديل
    setActiveTranscriptionId(prev => prev === annotationId ? null : annotationId)
  }, [editingTranscriptionId])

  // معالج النقر على مربع النص لرفعه للأعلى
  const handleTranscriptionBoxClick = useCallback((e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation()
    if (editingTranscriptionId) return // لا تغير أثناء التعديل
    setActiveTranscriptionId(prev => prev === annotationId ? null : annotationId)
  }, [editingTranscriptionId])

  // معالج النقر المزدوج على مربع النص للتعديل
  const handleTranscriptionBoxDoubleClick = useCallback((e: React.MouseEvent, annotationId: string, currentText: string) => {
    e.stopPropagation()
    setEditingTranscriptionId(annotationId)
    setEditedText(currentText)
    setActiveTranscriptionId(annotationId)
  }, [])

  // معالجة النقر المزدوج على الصورة لإضافة تعليق جديد
  const handleImageDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // منع إضافة تعليق جديد أثناء التسجيل أو التعطيل أو التعديل أو وضع الرسم
    if (disabled || isRecordingActive || editingTranscriptionId || isDrawingMode) return

    // إعادة تعيين المربع النشط عند النقر على مكان فارغ
    setActiveTranscriptionId(null)

    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    const newAnnotation: ImageAnnotation = {
      id: Date.now().toString(),
      x,
      y,
      timestamp: Date.now()
    }

    onAnnotationsChange([...annotations, newAnnotation])
    setActiveAnnotationId(newAnnotation.id)
    setShowInstructions(false)
  }, [disabled, isRecordingActive, editingTranscriptionId, isDrawingMode, annotations, onAnnotationsChange])

  // معالجة النقر المفرد على الصورة لإعادة تعيين المربع النشط
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (editingTranscriptionId) return
    setActiveTranscriptionId(null)
  }, [editingTranscriptionId])

  // فتح مربع كتابة النص اليدوي
  const openManualTextInput = useCallback((annotationId: string) => {
    setManualTextInput({
      isOpen: true,
      annotationId,
      text: ''
    })
  }, [])

  // حفظ النص اليدوي
  const saveManualText = useCallback(() => {
    if (!manualTextInput.annotationId || !manualTextInput.text.trim()) {
      setManualTextInput({ isOpen: false, annotationId: null, text: '' })
      return
    }

    const updatedAnnotations = annotations.map(a =>
      a.id === manualTextInput.annotationId
        ? { ...a, transcription: manualTextInput.text.trim() }
        : a
    )
    onAnnotationsChange(updatedAnnotations)
    setManualTextInput({ isOpen: false, annotationId: null, text: '' })
  }, [manualTextInput, annotations, onAnnotationsChange])

  // إلغاء كتابة النص اليدوي
  const cancelManualTextInput = useCallback(() => {
    setManualTextInput({ isOpen: false, annotationId: null, text: '' })
  }, [])

  // تحويل base64 إلى Blob
  const base64ToBlob = (base64: string): Blob => {
    const byteCharacters = atob(base64.split(',')[1])
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: 'audio/webm' })
  }

  // بدء التسجيل لتعليق معين
  const startRecording = async (annotationId: string) => {
    try {
      setError(null)

      // التحقق من دعم المتصفح
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // محاولة استخدام الـ fallback للمتصفحات القديمة
        const getUserMedia = (navigator as any).getUserMedia ||
          (navigator as any).webkitGetUserMedia ||
          (navigator as any).mozGetUserMedia ||
          (navigator as any).msGetUserMedia

        if (!getUserMedia) {
          setError('المتصفح لا يدعم تسجيل الصوت. يرجى استخدام متصفح حديث مثل Chrome أو Safari')
          return
        }
      }

      // التحقق من بروتوكول HTTPS (مطلوب للمايكروفون)
      const isSecureContext = window.isSecureContext ||
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'

      if (!isSecureContext) {
        setError('تسجيل الصوت يتطلب اتصالاً آمناً (HTTPS). يرجى استخدام موقع آمن')
        return
      }

      // طلب إذن المايكروفون
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100
          }
        })
      } catch (permissionError: any) {
        console.error('Permission error:', permissionError)

        // معالجة أنواع الأخطاء المختلفة
        if (permissionError.name === 'NotAllowedError' || permissionError.name === 'PermissionDeniedError') {
          setError('تم رفض إذن الوصول إلى المايكروفون. يرجى السماح بالوصول من إعدادات المتصفح')
        } else if (permissionError.name === 'NotFoundError' || permissionError.name === 'DevicesNotFoundError') {
          setError('لم يتم العثور على مايكروفون. يرجى التأكد من توصيل مايكروفون')
        } else if (permissionError.name === 'NotReadableError' || permissionError.name === 'TrackStartError') {
          setError('المايكروفون قيد الاستخدام من تطبيق آخر')
        } else if (permissionError.name === 'OverconstrainedError') {
          // محاولة مع إعدادات أبسط
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          } catch {
            setError('فشل في تهيئة المايكروفون. يرجى المحاولة مرة أخرى')
            return
          }
        } else {
          setError(`فشل الوصول إلى المايكروفون: ${permissionError.message || 'خطأ غير معروف'}`)
        }
        setIsRecordingActive(false)
        return
      }

      // التحقق من دعم MediaRecorder
      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/wav']
      let supportedMimeType = ''
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          supportedMimeType = mimeType
          break
        }
      }

      const mediaRecorderOptions: MediaRecorderOptions = {}
      if (supportedMimeType) {
        mediaRecorderOptions.mimeType = supportedMimeType
      }

      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: supportedMimeType || 'audio/webm' })
        const reader = new FileReader()

        reader.onloadend = async () => {
          const base64 = reader.result as string
          const updatedAnnotations = annotations.map(a =>
            a.id === annotationId
              ? { ...a, audioData: base64, duration: recordingTime, isRecording: false }
              : a
          )
          onAnnotationsChange(updatedAnnotations)

          // تحويل الصوت إلى نص تلقائياً
          await transcribeAudio(annotationId, blob, updatedAnnotations)
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.onerror = (event: Event) => {
        console.error('MediaRecorder error:', event)
        setError('حدث خطأ أثناء التسجيل')
        stream.getTracks().forEach(track => track.stop())
        setIsRecordingActive(false)
      }

      mediaRecorder.start(100) // جمع البيانات كل 100ms
      setRecordingTime(0)
      setIsRecordingActive(true)
      setActiveAnnotationId(annotationId)

      // تحديث حالة التسجيل
      const updated = annotations.map(a =>
        a.id === annotationId ? { ...a, isRecording: true } : a
      )
      onAnnotationsChange(updated)

      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000) as unknown as NodeJS.Timeout
    } catch (err: any) {
      console.error('Recording error:', err)
      setError(`فشل بدء التسجيل: ${err.message || 'خطأ غير متوقع'}`)
      setIsRecordingActive(false)
    }
  }

  // إيقاف التسجيل
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecordingActive(false)
      setActiveAnnotationId(null)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  // تحويل الصوت إلى نص
  const transcribeAudio = async (
    annotationId: string,
    audioBlob: Blob,
    currentAnnotations: ImageAnnotation[]
  ) => {
    try {
      setTranscribingId(annotationId)

      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setTranscribingId(null)
        return
      }

      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('language', 'ar')

      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        if (data.text) {
          const updatedAnnotations = currentAnnotations.map(a =>
            a.id === annotationId ? { ...a, transcription: data.text } : a
          )
          onAnnotationsChange(updatedAnnotations)
        }
      }
      setTranscribingId(null)
    } catch (err) {
      console.error('Transcription error:', err)
      setTranscribingId(null)
    }
  }

  // ترجمة النص المستخرج من التسجيل الصوتي
  const translateAnnotationText = async (annotationId: string, targetLang: string) => {
    try {
      setTranslatingId(annotationId)
      setError(null)

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة الترجمة غير متاحة في التطبيق المحمول حالياً')
        setTranslatingId(null)
        return
      }

      const annotation = annotations.find(a => a.id === annotationId)
      if (!annotation || !annotation.transcription) {
        setError('لا يوجد نص لترجمته')
        setTranslatingId(null)
        return
      }

      const response = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: annotation.transcription,
          targetLanguage: targetLang
        })
      })

      if (!response.ok) {
        throw new Error('Translation failed')
      }

      const data = await response.json()

      // تحديث التعليق بالنص المترجم
      const updatedAnnotations = annotations.map(a =>
        a.id === annotationId
          ? {
            ...a,
            translatedText: data.translatedText,
            translationLanguage: targetLang
          }
          : a
      )
      onAnnotationsChange(updatedAnnotations)
      setTranslatingId(null)

      // تمت الترجمة بنجاح - لا نفتح Modal (تم إزالة النافذة المنبثقة التلقائية)

    } catch (error) {
      console.error('Translation error:', error)
      setError('فشلت عملية الترجمة')
      setTranslatingId(null)
    }
  }

  // ترجمة جميع النصوص التي لم تُترجم بعد
  const translateAllAnnotations = async (targetLang: string) => {
    try {
      setError(null)
      setTranslatingId('translating-all')

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة الترجمة غير متاحة في التطبيق المحمول حالياً')
        setTranslatingId(null)
        return
      }

      // ترجمة كل التعليقات التي تحتوي على نص (حتى لو كانت مترجمة سابقاً)
      const annotationsToTranslate = annotations.filter(
        a => a.transcription && !a.isRecording
      )

      if (annotationsToTranslate.length === 0) {
        setError('لا يوجد نص للترجمة')
        setTranslatingId(null)
        return
      }

      // إنشاء نسخة من التعليقات للتحديث التدريجي
      let updatedAnnotations = [...annotations]

      // ترجمة كل نص على حدة وتحديث القائمة
      for (const annotation of annotationsToTranslate) {
        try {
          const response = await fetch('/api/translate-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: annotation.transcription,
              targetLanguage: targetLang
            })
          })

          if (!response.ok) {
            console.error(`Failed to translate annotation ${annotation.id}`)
            continue
          }

          const data = await response.json()

          // تحديث التعليق في القائمة المحلية
          updatedAnnotations = updatedAnnotations.map(a =>
            a.id === annotation.id
              ? {
                ...a,
                translatedText: data.translatedText,
                translationLanguage: targetLang
              }
              : a
          )

          // انتظار قصير بين الطلبات لتجنب تجاوز الحد الأقصى للطلبات
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (error) {
          console.error(`Error translating annotation ${annotation.id}:`, error)
        }
      }

      // تحديث جميع التعليقات دفعة واحدة
      onAnnotationsChange(updatedAnnotations)
      setTranslatingId(null)

    } catch (error) {
      console.error('Translate all error:', error)
      setError('فشلت عملية ترجمة بعض النصوص')
      setTranslatingId(null)
    }
  }

  const openLanguageDropdown = (anchor: HTMLElement, dropdownId: string) => {
    const rect = anchor.getBoundingClientRect()
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left
    })
    setShowLanguageDropdown(dropdownId)
  }

  const cancelTranslateAllClick = () => {
    if (translateAllClickTimerRef.current) {
      clearTimeout(translateAllClickTimerRef.current)
      translateAllClickTimerRef.current = null
    }
  }

  const scheduleTranslateAll = () => {
    cancelTranslateAllClick()
    translateAllClickTimerRef.current = setTimeout(() => {
      translateAllAnnotations('hi')
      translateAllClickTimerRef.current = null
    }, 220)
  }

  const handleTranslateButtonPointerDown = (e: React.PointerEvent, dropdownId: string) => {
    if (translatingId !== null) return
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    suppressTranslateClickRef.current = false
    const anchor = e.currentTarget as HTMLElement
    longPressTimerRef.current = setTimeout(() => {
      suppressTranslateClickRef.current = true
      cancelTranslateAllClick()
      openLanguageDropdown(anchor, dropdownId)
    }, 500)
  }

  const handleTranslateButtonPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  // الحصول على اسم اللغة
  const getLanguageName = (code: string): string => {
    const lang = availableLanguages.find(l => l.code === code)
    return lang ? lang.nameAr : code
  }

  // تشغيل/إيقاف الصوت
  const togglePlayback = (annotation: ImageAnnotation) => {
    if (!annotation.audioData) return

    const audioRefs = audioRefsRef.current

    if (playingId && playingId !== annotation.id) {
      const currentAudio = audioRefs.get(playingId)
      if (currentAudio) currentAudio.pause()
    }

    let audio = audioRefs.get(annotation.id)
    if (!audio) {
      const blob = base64ToBlob(annotation.audioData)
      audio = new Audio(URL.createObjectURL(blob))
      audio.onended = () => setPlayingId(null)
      audioRefs.set(annotation.id, audio)
    }

    if (playingId === annotation.id) {
      audio.pause()
      setPlayingId(null)
    } else {
      audio.play()
      setPlayingId(annotation.id)
    }
  }

  // حذف تعليق


  // تنسيق الوقت
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }



  // تنظيف الموارد
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (translateAllClickTimerRef.current) clearTimeout(translateAllClickTimerRef.current)
      audioRefsRef.current.forEach(audio => audio.pause())
      audioRefsRef.current.clear()
    }
  }, [])

  // إغلاق وضع التعديل عند الضغط خارج مربع النص
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const active = document.activeElement
      if (!(active instanceof HTMLTextAreaElement)) return
      if (active.dataset.annotationEdit !== 'true') return
      if (active.contains(event.target as Node)) return
      const targetNode = event.target as Node
      skipDrawingOnceRef.current = !!containerRef.current && containerRef.current.contains(targetNode)
      active.blur()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [])

  // منع انتشار الأحداث للنموذج الأب
  const preventFormValidation = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
  }, [])

  // التعرف على النص المكتوب بخط اليد - مع تحديد المواقع (Spatial OCR)
  const handleOCR = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setIsRecognizingText(true)
    setError(null)

    try {
      // تحويل الـ canvas إلى صورة base64
      const dataUrl = canvas.toDataURL('image/png')

      // استدعاء API للتعرف المكاني على النصوص
      const response = await fetch('/api/spatial-ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ imageData: dataUrl })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to process image')
      }

      const result = await response.json()

      if (!result.success || !result.texts || result.texts.length === 0) {
        setError('لم يتم العثور على نصوص مكتوبة بخط اليد. تأكد من الكتابة بوضوح.')
        return
      }

      // إنشاء تعليقات جديدة لكل نص مكتشف
      const newAnnotations: ImageAnnotation[] = result.texts.map((item: { text: string; x: number; y: number }) => ({
        id: `${Date.now()}-${Math.random()}`,
        x: item.x, // الإحداثيات بالفعل كنسبة مئوية (0-100)
        y: item.y,
        transcription: item.text,
        timestamp: Date.now()
      }))

      // إضافة جميع التعليقات الجديدة
      onAnnotationsChange([...annotations, ...newAnnotations])

      // تعيين أول تعليق كنشط
      if (newAnnotations.length > 0) {
        setActiveAnnotationId(newAnnotations[0].id)
      }

      // رسالة نجاح
      toast.success(`تم اكتشاف ${newAnnotations.length} نص بنجاح! 🎉`, {
        duration: 3000,
        icon: '✅'
      })

    } catch (err) {
      console.error('Spatial OCR error:', err)
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء التعرف على النص')
    } finally {
      setIsRecognizingText(false)
    }
  }

  return (
    <div
      className="space-y-4"
      onMouseDown={preventFormValidation}
      onTouchStart={preventFormValidation}
    >
      {error && (
        <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* شريط الخيارات العلوي */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        {/* حالة وضع الرسم */}
        {isDrawingMode && (
          <span className="text-xs text-pink-600 bg-pink-100 px-2 py-1 rounded-full flex items-center gap-1">
            <Pencil className="w-3 h-3" />
            وضع الرسم مفعل
          </span>
        )}

        {/* أزرار الأمام والخلف - على اليسار */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleViewSwitch('front')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!imagePreview && (internalImageOverride === '/front2.png' || (!internalImageOverride && imageSrc.includes('front')))
              ? 'bg-pink-100 text-pink-700 border border-pink-300'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
          >
            الأمام
          </button>
          <button
            type="button"
            onClick={() => handleViewSwitch('back')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!imagePreview && (internalImageOverride === '/back2.png' || (!internalImageOverride && imageSrc.includes('back')))
              ? 'bg-pink-100 text-pink-700 border border-pink-300'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
          >
            الخلف
          </button>
        </div>

        {/* فاصل مرن */}
        <div className="flex-1" />

        {/* زر تبديل الصورة */}
        {onImageChange && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowImageOptions(!showImageOptions)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${customImage
                ? 'bg-green-100 border border-green-400 text-green-700'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              disabled={disabled || isRecordingActive}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{customImage ? 'صورة مخصصة' : 'تبديل الصورة'}</span>
            </button>

            {/* قائمة خيارات الصورة */}
            <AnimatePresence>
              {showImageOptions && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full mt-1 left-0 sm:right-0 sm:left-auto bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 min-w-48"
                >
                  {/* اختيار من المعرض */}
                  <button
                    type="button"
                    onClick={openGallery}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-gray-100 text-gray-700"
                  >
                    <Upload className="w-4 h-4 text-blue-500" />
                    <span className="text-sm">اختيار من المعرض</span>
                  </button>

                  {/* التقاط من الكاميرا */}
                  <button
                    type="button"
                    onClick={openCamera}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-gray-100 text-gray-700"
                  >
                    <Camera className="w-4 h-4 text-green-500" />
                    <span className="text-sm">التقاط صورة</span>
                  </button>

                  {/* إعادة الصورة الافتراضية */}
                  {customImage && (
                    <>
                      <div className="h-px bg-gray-200 my-1" />
                      <button
                        type="button"
                        onClick={handleResetImage}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-red-50 text-red-600"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm">إعادة الصورة الافتراضية</span>
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* حقول اختيار الملفات المخفية */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* حاوية الصورة - مع دعم الوضع الكامل */}
      {isDrawingMode ? (
        // مساحة فارغة للحفاظ على تخطيط الصفحة عند تفعيل وضع ملء الشاشة
        <div className="w-full aspect-[3/4] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2">
          <span className="text-gray-400 font-medium">وضع الرسم ملء الشاشة مفعل</span>
          <button
            type="button"
            onClick={exitFullScreen}
            className="text-sm text-red-500 hover:text-red-700 underline font-medium"
          >
            إغلاق اضطراري
          </button>
        </div>
      ) : null}

      {(() => {
        const content = (
          <div
            ref={containerRef}
            className={`relative overflow-hidden bg-white 
              ${isDrawingMode
                ? 'w-full h-full' // الأبعاد ستحددها الحاوية الخارجية
                : 'rounded-xl border-2 border-pink-200 cursor-crosshair'
              }
            `}
            style={{
              touchAction: isDrawingMode ? 'none' : 'auto',
              userSelect: isDrawingMode ? 'none' : 'auto',
              WebkitUserSelect: isDrawingMode ? 'none' : 'auto',
              WebkitTouchCallout: isDrawingMode ? 'none' : 'default',
              // Force styles for Portal to ensure visibility and layering
              ...(isDrawingMode ? {
                // نلغي الأنماط السابقة التي كانت تجبره على ملء الشاشة
                // سيتم التحكم بالأبعاد عبر الحاوية الأب في الـ Portal
                display: 'flex',
                placeContent: 'center',
                backgroundColor: '#ffffff',
              } : {})
            }}
            onClick={handleImageClick}
            onDoubleClick={handleImageDoubleClick}
            onPointerDown={(e) => {
              if (skipDrawingOnceRef.current) {
                skipDrawingOnceRef.current = false
                if ((e.target as HTMLElement).closest('button, .ui-interactive')) return
                return
              }
              const active = document.activeElement
              if (active instanceof HTMLTextAreaElement && active.dataset.annotationEdit === 'true') {
                return
              }
              if (isAnnotationInteractiveTarget(e.target)) return
              // السماح بالتفاعل مع عناصر واجهة المستخدم (الأزرار)
              if ((e.target as HTMLElement).closest('button, .ui-interactive')) return
              if (isDrawingMode) handleDrawingStart(e)
            }}
            onPointerMove={handleDrawingMove}
            onPointerUp={handleDrawingEnd}
            onPointerLeave={handleDrawingEnd}

            onMouseDown={(e) => {
              if (skipDrawingOnceRef.current) {
                skipDrawingOnceRef.current = false
                if ((e.target as HTMLElement).closest('button, .ui-interactive')) return
                return
              }
              const active = document.activeElement
              if (active instanceof HTMLTextAreaElement && active.dataset.annotationEdit === 'true') {
                return
              }
              if (isAnnotationInteractiveTarget(e.target)) return
              if ((e.target as HTMLElement).closest('button, .ui-interactive')) return
              preventFormValidation(e)
            }}

            onTouchStart={(e) => {
              // السماح بلمس الأزرار في وضع الرسم
              if ((e.target as HTMLElement).closest('button, .ui-interactive')) return
              if (isAnnotationInteractiveTarget(e.target)) return

              if (skipDrawingOnceRef.current) {
                skipDrawingOnceRef.current = false
                return
              }
              const active = document.activeElement
              if (active instanceof HTMLTextAreaElement && active.dataset.annotationEdit === 'true') {
                return
              }

              preventFormValidation(e)
              if (isDrawingMode) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
            onTouchMove={(e) => {
              if (isAnnotationInteractiveTarget(e.target)) return
              if (isDrawingMode) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
            onTouchEnd={(e) => {
              if ((e.target as HTMLElement).closest('button, .ui-interactive')) return
              if (isAnnotationInteractiveTarget(e.target)) return
              if (isDrawingMode) {
                e.preventDefault()
              }
            }}
          >
            {/* زر الإغلاق X - يظهر فقط في وضع الرسم */}
            {isDrawingMode && (
              <button
                onClick={exitFullScreen}
                className="absolute top-5 right-5 z-[100000] p-2 text-gray-800 hover:text-red-600 transition-colors pointer-events-auto"
              >
                <X className="w-8 h-8 drop-shadow-md" />
              </button>
            )}

            {/* الصورة */}
            <div className={`relative w-full ${isDrawingMode ? 'h-full' : 'aspect-[3/4]'}`}>
              {imagePreview ? (
                // صورة مخصصة - نستخدم img عادي لأن Next.js Image لا يدعم blob URLs
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt="صورة التصميم المخصصة"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                // الصورة الافتراضية - نستخدم Next.js Image للتحسين
                <Image
                  src={effectiveImageSrc}
                  alt="صورة الفستان"
                  fill
                  className="object-contain"
                  priority
                />
              )}
            </div>

            {/* Canvas للرسم الحر */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full ${isDrawingMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
              style={{ zIndex: 5 }}
            />

            {/* شريط أدوات الرسم العمودي - أسفل يسار الصورة */}
            <div
              className={`absolute left-4 flex flex-col-reverse gap-2 ${isDrawingMode ? 'bottom-8' : 'bottom-4'}`}
              style={{
                zIndex: 100,
                pointerEvents: 'auto',
                touchAction: 'manipulation'
              }}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
              }}
              onTouchEnd={(e) => {
                e.stopPropagation()
              }}
            >
              {/* زر تفعيل وضع الرسم - يظهر دائماً */}
              <motion.button
                type="button"
                onClick={toggleDrawingMode}
                className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${isDrawingMode
                  ? 'bg-pink-500 text-white ring-2 ring-pink-300'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                  }`}
                disabled={disabled || isRecordingActive}
                title={isDrawingMode ? 'إنهاء الرسم' : 'بدء الرسم'}
                whileTap={{ scale: 0.95 }}
              >
                <Pencil className="w-5 h-5" />
              </motion.button>

              {/* زر القائمة الإضافية (Plus) - يظهر دائماً */}
              <div className="relative plus-menu-container">
                <motion.button
                  type="button"
                  onClick={() => {
                    setShowPlusMenu(prev => !prev)
                    setShowColorPicker(false)
                    setShowStrokePicker(false)
                    setShowBrushPicker(false)
                    setShowEraserSizePicker(false)
                    setShowEraserMenu(false)
                  }}
                  className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 transition-all"
                  title="المزيد من الأدوات"
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus className="w-5 h-5" />
                </motion.button>

                {/* قائمة الأدوات الإضافية - أفقية */}
                <AnimatePresence>
                  {showPlusMenu && (
                    <motion.div
                      initial={{ opacity: 0, x: -10, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 0.9 }}
                      className="absolute bottom-0 left-full ml-2 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-row gap-2 plus-menu-container"
                      style={{ zIndex: 200, pointerEvents: 'auto' }}
                    >
                      {/* زر التعرف على الكتابة (OCR) */}
                      <motion.button
                        type="button"
                        onClick={() => {
                          handleOCR()
                        }}
                        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecognizingText
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                          }`}
                        title="تحويل الرسم إلى نص"
                        disabled={isRecognizingText}
                        whileTap={{ scale: 0.95 }}
                      >
                        {isRecognizingText ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanText className="w-5 h-5" />}
                      </motion.button>

                      {/* زر إظهار/إخفاء النصوص */}
                      <motion.button
                        type="button"
                        onClick={() => setShowAllTextsOnImage(!showAllTextsOnImage)}
                        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${!showAllTextsOnImage
                          ? 'bg-gray-100 text-gray-400'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                          }`}
                        title={showAllTextsOnImage ? "إخفاء النصوص" : "إظهار النصوص"}
                        whileTap={{ scale: 0.95 }}
                      >
                        {showAllTextsOnImage ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      </motion.button>

                      {/* زر ترجمة كل النصوص */}
                      <motion.button
                        type="button"
                        onClick={() => {
                          if (suppressTranslateClickRef.current) {
                            suppressTranslateClickRef.current = false
                            return
                          }
                          scheduleTranslateAll()
                        }}
                        onDoubleClick={(e) => {
                          cancelTranslateAllClick()
                          suppressTranslateClickRef.current = true
                          openLanguageDropdown(e.currentTarget as HTMLElement, 'translate-all')
                        }}
                        onPointerDown={(e) => handleTranslateButtonPointerDown(e, 'translate-all')}
                        onPointerUp={handleTranslateButtonPointerUp}
                        onPointerLeave={handleTranslateButtonPointerUp}
                        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${isTranslatingAll
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                          }`}
                        title="ترجمة كل النصوص (افتراضيًا إلى الهندية)"
                        disabled={translatingId !== null}
                        whileTap={{ scale: 0.95 }}
                      >
                        {isTranslatingAll ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
                      </motion.button>

                      {/* زر وضع القلم (رفض اليد) */}
                      <motion.button
                        type="button"
                        onClick={() => setIsPenMode(!isPenMode)}
                        className={`relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${isPenMode
                          ? 'bg-purple-100 border-2 border-purple-400 text-purple-700'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                          }`}
                        title={isPenMode ? "وضع القلم فقط مفعل (تجاهل اليد)" : "تفعيل وضع القلم فقط"}
                        whileTap={{ scale: 0.95 }}
                      >
                        <MousePointer2 className="w-5 h-5" />
                        {isPenMode && <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-pulse" />}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* أدوات الرسم - تظهر فقط في وضع الرسم */}
              <AnimatePresence>
                {isDrawingMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-2"
                  >
                    {/* زر القلم مع قائمة أنواع الفرش */}
                    <div className="relative brush-picker-container">
                      <motion.div className="flex flex-col gap-2 relative">
                        <motion.button
                          type="button"
                          onClick={() => {
                            setIsEraserMode(false)
                            setShowEraserMenu(false)
                            setShowEraserSizePicker(false)
                            setShowColorPicker(false)
                            setShowStrokePicker(false)
                            setShowPlusMenu(false)
                            if (!isPenMode) {
                              setIsPenMode(true)
                              setShowBrushPicker(false)
                              return
                            }
                            setShowBrushPicker(prev => !prev)
                          }}
                          onDoubleClick={() => setShowBrushPicker(true)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setShowBrushPicker(true)
                          }}
                          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${!isEraserMode && brushType === 'normal'
                            ? 'bg-pink-100 border-2 border-pink-400 text-pink-700'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                            }`}
                          title="القلم (ضغطة واحدة عادي / ضغطتين للقائمة)"
                          whileTap={{ scale: 0.95 }}
                        >
                          <PenTool className="w-5 h-5" />
                        </motion.button>
                      </motion.div>

                      {/* قائمة أنواع الفرش وسماكة القلم - في نافذة واحدة */}
                      <AnimatePresence>
                        {showBrushPicker && (
                          <motion.div
                            initial={{ opacity: 0, x: -10, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.9 }}
                            className="absolute bottom-0 left-full ml-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 brush-picker-container"
                            style={{ zIndex: 200, pointerEvents: 'auto', minWidth: '280px' }}
                          >
                            {/* الصف الأول: أنواع القلم */}
                            <div className="flex flex-row gap-1 mb-3 pb-3 border-b border-gray-200">
                              {BRUSH_TYPES.map(brush => (
                                <button
                                  type="button"
                                  key={brush.value}
                                  onClick={() => {
                                    setBrushType(brush.value)
                                    setShowBrushPicker(false)
                                  }}
                                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg hover:bg-gray-100 transition-all flex-1 ${brushType === brush.value ? 'bg-pink-100 text-pink-700 ring-2 ring-pink-300' : ''
                                    }`}
                                  title={brush.name}
                                >
                                  <span className="text-lg">{brush.icon}</span>
                                  <span className="text-xs text-gray-600">{brush.name}</span>
                                </button>
                              ))}
                            </div>
                            {/* الصف الثاني: سماكة القلم */}
                            <div>
                              <p className="text-xs text-gray-500 mb-2 text-center">سماكة القلم</p>
                              <div className="flex flex-row gap-1 justify-center">
                                {STROKE_WIDTHS.map(sw => (
                                  <button
                                    type="button"
                                    key={sw.value}
                                    onClick={() => {
                                      setStrokeWidth(sw.value)
                                      setShowBrushPicker(false)
                                    }}
                                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-all ${strokeWidth === sw.value ? 'bg-pink-100 text-pink-700 ring-2 ring-pink-300' : ''
                                      }`}
                                    title={sw.name}
                                  >
                                    <div
                                      className="rounded-full bg-gray-700"
                                      style={{ width: Math.min(sw.value * 2, 20), height: Math.min(sw.value * 2, 20) }}
                                    />
                                    <span className="text-xs text-gray-600">{sw.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* زر الممحاة مع قائمة منبثقة */}
                    <div className="relative eraser-menu-container">
                      <motion.button
                        type="button"
                        onClick={() => {
                          // تفعيل الممحاة فقط (Toggle)
                          toggleEraserMode()
                        }}
                        onDoubleClick={() => {
                          setShowEraserMenu(true)
                          closeAllPickers() // Close others
                          setShowEraserMenu(true) // Re-open ours
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setShowEraserMenu(true)
                          closeAllPickers()
                          setShowEraserMenu(true)
                        }}
                        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${isEraserMode
                          ? 'bg-orange-100 border-2 border-orange-400 text-orange-700'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                          }`}
                        title="ممحاة (ضغطة واحدة تفعيل / ضغطتين للقائمة)"
                        whileTap={{ scale: 0.95 }}
                      >
                        <Eraser className="w-5 h-5" />
                      </motion.button>

                      {/* قائمة الممحاة المنبثقة */}
                      <AnimatePresence>
                        {showEraserMenu && (
                          <motion.div
                            initial={{ opacity: 0, x: -10, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.9 }}
                            className="absolute bottom-0 left-full ml-2 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[160px] eraser-menu-container"
                            style={{ zIndex: 200, pointerEvents: 'auto' }}
                          >
                            {/* تفعيل/إلغاء الممحاة */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsEraserMode(!isEraserMode)
                                setShowEraserMenu(false)
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-gray-100 transition-colors flex items-center gap-2"
                            >
                              <Eraser className="w-4 h-4 text-orange-600" />
                              <span className="text-sm text-gray-700">
                                {isEraserMode ? 'إلغاء الممحاة' : 'تفعيل الممحاة'}
                              </span>
                            </button>

                            {/* حجم الممحاة */}
                            {isEraserMode && (
                              <div className="px-3 py-2 border-t border-gray-100">
                                <p className="text-xs text-gray-500 mb-2">حجم الممحاة:</p>
                                <div className="flex gap-1">
                                  {ERASER_SIZES.map(es => (
                                    <button
                                      type="button"
                                      key={es.value}
                                      onClick={() => {
                                        setEraserWidth(es.value)
                                        setShowEraserMenu(false)
                                      }}
                                      className={`flex-1 flex flex-col items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-all ${eraserWidth === es.value ? 'bg-orange-100 ring-1 ring-orange-300' : ''
                                        }`}
                                      title={es.name}
                                    >
                                      <div
                                        className="rounded-full bg-orange-400"
                                        style={{ width: Math.min(es.value / 3, 20), height: Math.min(es.value / 3, 20) }}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* فاصل */}
                            <div className="h-px bg-gray-200 my-1" />

                            {/* زر التراجع - يبقي الممحاة مفعّلة والقائمة مفتوحة */}
                            <button
                              type="button"
                              onClick={() => {
                                handleUndoDrawing()
                                // لا نغلق القائمة ولا نلغي الممحاة للسماح بالتراجع المتتالي
                              }}
                              disabled={drawings.length === 0}
                              className="w-full px-3 py-2 text-right hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-4 h-4 text-blue-600" />
                              <span className="text-sm text-gray-700">تراجع</span>
                            </button>

                            {/* زر التقدم - يعيد آخر عملية تراجع */}
                            <button
                              type="button"
                              onClick={() => {
                                handleRedoDrawing()
                                // لا نغلق القائمة للسماح بإعادة التقدم المتتالي
                              }}
                              disabled={redoStack.length === 0}
                              className="w-full px-3 py-2 text-right hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCw className="w-4 h-4 text-emerald-600" />
                              <span className="text-sm text-gray-700">تقدم</span>
                            </button>

                            {/* زر مسح الكل */}
                            <button
                              type="button"
                              onClick={() => {
                                handleClearAllDrawings()
                                setShowEraserMenu(false)
                              }}
                              disabled={drawings.length === 0}
                              className="w-full px-3 py-2 text-right hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                              <span className="text-sm text-gray-700">مسح الكل</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* زر اللون - تم نقله هنا تحت الممحاة */}
                    <div className="relative color-picker-container">
                      <motion.button
                        type="button"
                        onClick={() => {
                          setShowColorPicker(!showColorPicker)
                          setShowStrokePicker(false)
                          setShowBrushPicker(false)
                          setShowEraserSizePicker(false)
                          setShowEraserMenu(false)
                        }}
                        className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg bg-white border border-gray-300 hover:bg-gray-100 transition-all"
                        title="اختيار اللون"
                        whileTap={{ scale: 0.95 }}
                      >
                        <div
                          className="w-6 h-6 rounded-full border-2 border-gray-400"
                          style={{ backgroundColor: drawingColor }}
                        />
                      </motion.button>
                      {/* قائمة الألوان - أفقية */}
                      <AnimatePresence>
                        {showColorPicker && (
                          <motion.div
                            initial={{ opacity: 0, x: -10, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.9 }}
                            className="absolute bottom-0 left-full ml-2 bg-white rounded-xl shadow-xl border border-gray-200 p-4 color-picker-container"
                            style={{ zIndex: 200, pointerEvents: 'auto', minWidth: '280px' }}
                          >
                            <p className="text-xs text-gray-500 mb-2 text-center">اختر اللون</p>
                            <div className="grid grid-cols-4 gap-2.5">
                              {DRAWING_COLORS.map(color => (
                                <button
                                  type="button"
                                  key={color.value}
                                  onClick={() => {
                                    setDrawingColor(color.value)
                                    setShowColorPicker(false)
                                  }}
                                  className={`w-10 h-10 rounded-full border-2 transition-all hover:scale-110 ${drawingColor === color.value
                                    ? 'border-gray-800 scale-110 ring-2 ring-pink-300'
                                    : 'border-gray-300'
                                    }`}
                                  style={{
                                    backgroundColor: color.value
                                  }}
                                  title={color.name}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* العلامات على الصورة */}
            <AnimatePresence>
              {annotations.map((annotation, index) => {
                const isActiveMarker = activeTranscriptionId === annotation.id
                const hasTranscription = annotation.transcription && !annotation.isRecording
                const annotationIndex = index + 1
                return (
                  <motion.div
                    key={annotation.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    style={{
                      position: 'absolute',
                      left: `${annotation.x}%`,
                      top: `${annotation.y}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: isActiveMarker ? 90 : 10
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* علامة الموقع */}
                    <div className="relative">
                      {/* إذا كان هناك نص محول، نعرض رقم تسلسلي */}
                      {hasTranscription ? (
                        <DraggableMarker
                          annotation={annotation}
                          annotationIndex={annotationIndex}
                          isActiveMarker={isActiveMarker}
                          containerRef={containerRef}
                          onDragStart={handleMarkerDragStart}
                          onDrag={handleMarkerDrag}
                          onDragEnd={handleMarkerDragEnd}
                          onClick={handleMarkerClick}
                        />
                      ) : (
                        /* إذا لم يكن هناك نص، نعرض الدائرة مع أزرار التسجيل */
                        <>
                          {/* حاوية الأزرار - ميكروفون ونص */}
                          <div className="flex items-center gap-1">
                            {/* زر الميكروفون */}
                            <motion.div
                              onClick={(e) => handleMarkerClick(e, annotation.id)}
                              animate={{
                                scale: isActiveMarker ? 1.1 : 1,
                                boxShadow: isActiveMarker
                                  ? '0 0 15px rgba(236, 72, 153, 0.6)'
                                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                              }}
                              transition={{ duration: 0.2 }}
                              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg ${isDrawingMode
                                ? 'cursor-not-allowed opacity-50 bg-gray-400 border-gray-300 border-2'
                                : annotation.isRecording
                                  ? 'bg-red-500 border-red-300 animate-pulse border-2 cursor-pointer'
                                  : isActiveMarker
                                    ? 'bg-pink-400 border-pink-200 border-2 ring-2 ring-pink-300 cursor-pointer'
                                    : 'bg-pink-500 border-pink-300 border-2 cursor-pointer'
                                }`}
                            >
                              {annotation.isRecording ? (
                                <button
                                  type="button"
                                  onClick={stopRecording}
                                  className="w-full h-full flex items-center justify-center"
                                  disabled={isDrawingMode}
                                >
                                  <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startRecording(annotation.id)}
                                  className="w-full h-full flex items-center justify-center"
                                  disabled={isDrawingMode}
                                  title={isDrawingMode ? 'التسجيل الصوتي معطل أثناء وضع الرسم' : 'بدء التسجيل الصوتي'}
                                >
                                  <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </button>
                              )}
                            </motion.div>

                            {/* زر كتابة النص اليدوي */}
                            {!annotation.isRecording && (
                              <motion.button
                                type="button"
                                onClick={() => openManualTextInput(annotation.id)}
                                whileTap={{ scale: 0.95 }}
                                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg border-2 transition-colors ${isDrawingMode
                                  ? 'bg-gray-400 border-gray-300 opacity-50 cursor-not-allowed'
                                  : 'bg-blue-500 border-blue-300 hover:bg-blue-600 cursor-pointer'
                                  }`}
                                title={isDrawingMode ? 'إضافة النص معطلة أثناء وضع الرسم' : 'كتابة نص يدوي'}
                                disabled={isDrawingMode}
                              >
                                <Type className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                              </motion.button>
                            )}
                          </div>

                          {/* زر الحذف للعلامات بدون نص */}
                          <button
                            type="button"
                            onClick={() => deleteAnnotation(annotation.id)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-700 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      )}

                      {/* وقت التسجيل */}
                      {annotation.isRecording && (
                        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                          {formatTime(recordingTime)}
                        </div>
                      )}

                      {/* مؤشر التحويل */}
                      {transcribingId === annotation.id && (
                        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>تحويل...</span>
                        </div>
                      )}

                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* النصوص على الصورة - قابلة للسحب والإفلات */}
            <AnimatePresence>
              {annotations
                .filter(a => a.transcription && !a.isRecording && transcribingId !== a.id && !a.isHidden && showAllTextsOnImage)
                .map((annotation) => {
                  const styles = getBoxStyles(annotation.id)
                  const annotationIndex = annotations.findIndex(a => a.id === annotation.id) + 1

                  return (
                    <DraggableText
                      key={`transcription-${annotation.id}`}
                      annotation={annotation}
                      annotationIndex={annotationIndex}
                      styles={styles}
                      containerRef={containerRef}
                      onDragEnd={handleTextDragEnd}
                      onScaleChange={changeTextScale}
                      onTextChange={handleTextChange}
                    />
                  )
                })}
            </AnimatePresence>

            {/* منطقة الحذف */}
            <AnimatePresence>
              {isDraggingMarker && (
                <motion.div
                  initial={{ y: 50, opacity: 0, scale: 0.8 }}
                  animate={{
                    y: 0,
                    opacity: 1,
                    scale: isOverDeleteZone ? 1.2 : 1,
                  }}
                  exit={{ y: 50, opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                  className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-[95] transition-colors duration-200 ${isOverDeleteZone
                    ? 'bg-red-500 text-white ring-4 ring-red-200 shadow-red-300'
                    : 'bg-white text-gray-400 border border-gray-200 opacity-60'
                    }`}
                >
                  <Trash2 className={`w-6 h-6 ${isOverDeleteZone ? 'text-white' : 'text-gray-400'}`} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )

        if (isDrawingMode) {
          if (typeof document !== 'undefined') {
            return createPortal(
              <div
                className="fixed inset-0 z-[9999] bg-gray-900/90 flex items-center justify-center p-4 tablet:p-8"
                style={{ touchAction: 'none' }} // لمنع التمرير في الخلفية
              >
                {/* حاوية تحدد النسبة وتوسط المحتوى */}
                <div className="relative w-full max-w-full max-h-full aspect-[3/4] flex items-center justify-center shadow-2xl rounded-lg overflow-hidden my-auto mx-auto">
                  {content}
                </div>
              </div>,
              document.body
            );
          }
        }
        return content
      })()}

      {/* قسم التعليقات الحالية - تفاعلي مع جميع الأزرار */}
      {
        annotations.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-pink-600" />
                التعليقات الحالية ({annotations.length})
              </h4>

              {/* زر ترجمة الكل - يظهر فقط عند وجود أكثر من نص واحد */}
              {annotations.filter(a => a.transcription && !a.isRecording).length > 1 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (showLanguageDropdown === 'translate-all') {
                        setShowLanguageDropdown(null)
                        setDropdownPosition(null)
                      } else {
                        openLanguageDropdown(e.currentTarget as HTMLElement, 'translate-all')
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={translatingId !== null}
                    aria-busy={isTranslatingAll}
                  >
                    {isTranslatingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Languages className="w-3.5 h-3.5" />
                    )}
                    <span>{isTranslatingAll ? 'جاري الترجمة...' : 'ترجمة الكل'}</span>
                  </button>

                  {/* قائمة اللغات لترجمة الكل */}
                  {showLanguageDropdown === 'translate-all' && dropdownPosition && typeof document !== 'undefined' && createPortal(
                    <>
                      <div
                        className="fixed inset-0"
                        style={{ zIndex: 99998 }}
                        onClick={() => {
                          setShowLanguageDropdown(null)
                          setDropdownPosition(null)
                        }}
                      />
                      <div
                        className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
                        style={{
                          zIndex: 99999,
                          top: dropdownPosition.top,
                          left: dropdownPosition.left
                        }}
                      >
                        {availableLanguages.map(lang => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => {
                              translateAllAnnotations(lang.code)
                              setShowLanguageDropdown(null)
                              setDropdownPosition(null)
                            }}
                            disabled={translatingId !== null}
                            className="w-full text-right px-3 py-2 text-sm hover:bg-purple-50 transition-colors flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{lang.flag}</span>
                              <span className="text-gray-700">{lang.nameAr}</span>
                            </div>
                            <span className="text-xs text-gray-500 font-medium">{lang.nativeName}</span>
                          </button>
                        ))}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto overflow-x-visible">
              {annotations.map((annotation, index) => {
                const isEditing = editingTranscriptionId === annotation.id
                const isTranslatingAnnotation = translatingId === annotation.id
                const isTranslateBusy = isTranslatingAnnotation || isTranslatingAll

                return (
                  <div
                    key={annotation.id}
                    className={`bg-white rounded-lg p-3 border transition-all overflow-visible ${isEditing ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                      }`}
                  >
                    {/* رأس التعليق - الرقم والنص على نفس السطر */}
                    <div className="flex items-start justify-between gap-2 mb-2 relative">
                      {/* الرقم والنص على نفس السطر */}
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        <span className="text-base text-pink-600 font-bold flex-shrink-0 mt-0.5">
                          {index + 1}.
                        </span>
                        {annotation.transcription && editingTranscriptionId !== annotation.id && (
                          <p className="text-sm text-gray-700 leading-relaxed break-words">
                            {annotation.transcription}
                          </p>
                        )}
                      </div>

                      {/* أزرار التحكم */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* زر تشغيل الصوت */}
                        {annotation.audioData && (
                          <button
                            type="button"
                            onClick={() => togglePlayback(annotation)}
                            className={`p-1.5 rounded transition-colors ${playingId === annotation.id
                              ? 'bg-green-500 text-white'
                              : 'text-green-600 hover:bg-green-50'
                              }`}
                            title={playingId === annotation.id ? 'إيقاف' : 'تشغيل الصوت'}
                          >
                            {playingId === annotation.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* زر إخفاء/إظهار النص على الصورة */}
                        {annotation.transcription && !isEditing && (
                          <button
                            type="button"
                            onClick={() => toggleTextVisibility(annotation.id)}
                            className={`p-1.5 rounded transition-colors ${annotation.isHidden
                              ? 'text-gray-400 hover:bg-gray-100'
                              : 'text-blue-600 hover:bg-blue-50'
                              }`}
                            title={annotation.isHidden ? 'إظهار النص على الصورة' : 'إخفاء النص من الصورة'}
                          >
                            {annotation.isHidden ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* أزرار تكبير/تصغير النص */}
                        {annotation.transcription && !isEditing && !annotation.isHidden && (
                          <>
                            <button
                              type="button"
                              onClick={() => changeTextScale(annotation.id, -0.1)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                              title="تصغير النص"
                              disabled={(annotation.textScale ?? 1) <= 0.5}
                            >
                              <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => changeTextScale(annotation.id, 0.1)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                              title="تكبير النص"
                              disabled={(annotation.textScale ?? 1) >= 2}
                            >
                              <ZoomIn className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {/* زر الترجمة مع قائمة منسدلة */}
                        {annotation.transcription && !isEditing && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                if (showLanguageDropdown === annotation.id) {
                                  setShowLanguageDropdown(null)
                                  setDropdownPosition(null)
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setDropdownPosition({
                                    top: rect.bottom + 4,
                                    left: rect.left
                                  })
                                  setShowLanguageDropdown(annotation.id)
                                }
                              }}
                              disabled={isTranslateBusy}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              title="ترجمة"
                            >
                              {isTranslatingAnnotation ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Languages className="w-4 h-4" />
                              )}
                            </button>

                            {/* قائمة اللغات المنسدلة - تُعرض باستخدام Portal */}
                            {showLanguageDropdown === annotation.id && dropdownPosition && typeof document !== 'undefined' && createPortal(
                              <>
                                {/* Backdrop لإغلاق القائمة عند النقر خارجها */}
                                <div
                                  className="fixed inset-0"
                                  style={{ zIndex: 99998 }}
                                  onClick={() => {
                                    setShowLanguageDropdown(null)
                                    setDropdownPosition(null)
                                  }}
                                />
                                {/* القائمة المنبثقة */}
                                <div
                                  className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[200px]"
                                  style={{
                                    zIndex: 99999,
                                    top: dropdownPosition.top,
                                    left: dropdownPosition.left
                                  }}
                                >
                                  {availableLanguages.map((lang) => (
                                    <button
                                      key={lang.code}
                                      type="button"
                                      onClick={() => {
                                        translateAnnotationText(annotation.id, lang.code)
                                        setShowLanguageDropdown(null)
                                        setDropdownPosition(null)
                                      }}
                                      disabled={translatingId === annotation.id}
                                      className="w-full px-4 py-2.5 text-right hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
                                    >
                                      <span className="text-sm text-gray-700">
                                        {lang.nameAr} ({lang.nativeName})
                                      </span>
                                      {translatingId === annotation.id && (
                                        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </>,
                              document.body
                            )}
                          </div>
                        )}

                        {/* زر التعديل */}
                        {annotation.transcription && !isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTranscriptionId(annotation.id)
                              setEditedText(annotation.transcription || '')
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="تعديل النص"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}

                        {/* زر الحذف */}
                        <button
                          type="button"
                          onClick={() => deleteAnnotation(annotation.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* محتوى التعليق */}
                    {annotation.transcription ? (
                      <div className="space-y-2">
                        {/* النص - قابل للتعديل */}
                        {isEditing && (
                          <div className="space-y-2">
                            <textarea
                              value={editedText}
                              onChange={(e) => setEditedText(e.target.value)}
                              className="w-full min-h-[80px] p-2 text-sm text-gray-700 border border-blue-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                              dir="rtl"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => handleSaveEdit(e, annotation.id)}
                                className="px-3 py-1.5 rounded bg-green-500 hover:bg-green-600 text-white text-sm transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>حفظ</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 rounded bg-gray-500 hover:bg-gray-600 text-white text-sm transition-colors flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>إلغاء</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* النص المترجم - عرض مباشر */}
                        {annotation.translatedText && !isEditing && (
                          <div className="mt-2 text-right bg-purple-50 border border-purple-200 rounded-lg p-2">
                            <p className="text-xs text-purple-600 font-medium mb-0.5 flex items-center gap-1">
                              <Languages className="w-3 h-3" />
                              الترجمة ({getLanguageName(annotation.translationLanguage || 'en')})
                            </p>
                            <p className="text-sm text-gray-700 leading-relaxed break-words" dir="auto">
                              {annotation.translatedText}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : annotation.audioData ? (
                      <p className="text-sm text-gray-500 mr-6">تسجيل صوتي - في انتظار التحويل إلى نص...</p>
                    ) : (
                      <p className="text-sm text-gray-400 mr-6">في انتظار التسجيل...</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      }

      {/* زر حفظ التعليق الحالي */}
      {
        showSaveButton && onSavedCommentsChange && (annotations.length > 0 || drawings.length > 0) && (
          <div className="flex flex-col sm:flex-row gap-2">
            {viewingCommentId ? (
              <>
                {/* زر حفظ التعديلات - يظهر فقط عند وجود تغييرات */}
                {hasViewingCommentChanges && (
                  <button
                    type="button"
                    onClick={updateViewingComment}
                    disabled={disabled}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    <span>حفظ التعديلات على التعليق المحفوظ</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setViewingCommentId(null)
                    setOriginalViewingAnnotations([])
                    setOriginalViewingDrawings([])
                    onAnnotationsChange([])
                    onDrawingsChange([])
                  }}
                  disabled={disabled}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  <span>{hasViewingCommentChanges ? 'إلغاء وحذف التعديلات' : 'إغلاق العرض'}</span>
                </button>
              </>
            ) : editingCommentId ? (
              <>
                <button
                  type="button"
                  onClick={updateSavedComment}
                  disabled={disabled}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <Check className="w-5 h-5" />
                  <span>حفظ التعديلات</span>
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={disabled}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  <span>إلغاء</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={saveCurrentComment}
                disabled={disabled}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:from-pink-700 hover:to-purple-700 transition-all disabled:opacity-50 shadow-md"
              >
                <Save className="w-5 h-5" />
                <span>حفظ التعليق وإضافة تعليق جديد</span>
              </button>
            )}
          </div>
        )
      }

      {/* قائمة التعليقات المحفوظة */}
      {
        savedComments.length > 0 && (
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl border border-pink-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSavedComments(!showSavedComments)}
              className="w-full flex items-center justify-between p-4 hover:bg-pink-100/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-pink-600" />
                <span className="font-medium text-gray-800">
                  التعليقات المحفوظة ({savedComments.length})
                </span>
              </div>
              {showSavedComments ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            <AnimatePresence>
              {showSavedComments && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-pink-200"
                >
                  <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                    {savedComments.map((comment, index) => {
                      const displayTitle = comment.title
                        || (comment.view ? getViewLabel(comment.view) : `التعليق ${index + 1}`)

                      return (
                        <div
                          key={comment.id}
                          className={`bg-white rounded-lg border p-4 transition-all ${editingCommentId === comment.id
                            ? 'border-pink-500 ring-2 ring-pink-200'
                            : 'border-gray-200 hover:border-pink-300'
                            }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              {editingCommentTitle === comment.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editedCommentTitle}
                                    onChange={(e) => setEditedCommentTitle(e.target.value)}
                                    className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveCommentTitle()
                                      if (e.key === 'Escape') cancelEditingCommentTitle()
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={saveCommentTitle}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                    title="حفظ"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingCommentTitle}
                                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="إلغاء"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <h5 className="font-medium text-gray-800">
                                    {displayTitle}
                                  </h5>
                                  {!disabled && onSavedCommentsChange && (
                                    <button
                                      type="button"
                                      onClick={() => startEditingCommentTitle(comment.id, displayTitle)}
                                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="تعديل الاسم"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!disabled && onSavedCommentsChange && editingCommentTitle !== comment.id && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => loadCommentForViewing(comment)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="عرض التعليق"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteSavedComment(comment.id)}
                                    disabled={editingCommentId !== null}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* عرض النصوص المكتوبة */}
                          {comment.annotations.some(a => a.transcription) && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <div className="space-y-1">
                                {comment.annotations.filter(a => a.transcription).map((a, i) => (
                                  <div key={a.id} className="mb-2">
                                    <p className="text-sm text-gray-700">
                                      <span className="text-pink-600 font-medium">{i + 1}.</span> {a.transcription}
                                    </p>
                                    {a.translatedText && (
                                      <p className="text-sm text-purple-600 mt-1 mr-4 bg-purple-50 p-1 rounded">
                                        <span className="text-xs font-bold ml-1">الترجمة:</span> {a.translatedText}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      }



      {/* Modal كتابة النص اليدوي */}
      <AnimatePresence>
        {manualTextInput.isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[10000]"
              onClick={cancelManualTextInput}
            />
            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-[10001] w-[90%] max-w-md p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Type className="w-5 h-5 text-blue-600" />
                  كتابة نص يدوي
                </h3>
                <button
                  type="button"
                  onClick={cancelManualTextInput}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Text Input */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 font-medium mb-2">اكتب النص الذي تريد إضافته:</p>
                <textarea
                  value={manualTextInput.text}
                  onChange={(e) => setManualTextInput({ ...manualTextInput, text: e.target.value })}
                  placeholder="اكتب هنا..."
                  className="w-full h-[150px] p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  dir="rtl"
                  autoFocus
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveManualText}
                  disabled={!manualTextInput.text.trim()}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  تأكيد
                </button>
                <button
                  type="button"
                  onClick={cancelManualTextInput}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  إلغاء
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div >
  )
})

InteractiveImageAnnotation.displayName = 'InteractiveImageAnnotation'

export default InteractiveImageAnnotation
