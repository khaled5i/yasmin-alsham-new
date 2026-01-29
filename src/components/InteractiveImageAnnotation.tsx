'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, X, Trash2, Loader2, Play, Pause, FileText, Check, XCircle, Pencil, Eraser, RotateCcw, Palette, PenTool, Highlighter, Circle, ImageIcon, Camera, Upload, RefreshCw, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import Image from 'next/image'

// نوع نقطة الرسم
export interface DrawingPoint {
  x: number // نسبة مئوية من العرض (0-100)
  y: number // نسبة مئوية من الارتفاع (0-100)
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
  duration?: number
  timestamp: number
  isRecording?: boolean
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

// واجهة التعليق المحفوظ
export interface SavedDesignComment {
  id: string
  timestamp: number
  annotations: ImageAnnotation[]
  drawings: DrawingPath[]
  image: string | null
  title?: string
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

export default function InteractiveImageAnnotation({
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
}: InteractiveImageAnnotationProps) {
  const { t } = useTranslation()
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

  // حالات الرسم الحر
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingColor, setDrawingColor] = useState(DRAWING_COLORS[0].value)
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[2].value)
  const [brushType, setBrushType] = useState<BrushType>('normal')
  const [isEraserMode, setIsEraserMode] = useState(false)
  const [eraserWidth, setEraserWidth] = useState(STROKE_WIDTHS[3].value)
  const [currentPath, setCurrentPath] = useState<DrawingPoint[]>([])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showStrokePicker, setShowStrokePicker] = useState(false)
  const [showBrushPicker, setShowBrushPicker] = useState(false)

  // حالات تبديل الصورة
  const [showImageOptions, setShowImageOptions] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // حالات التعليقات المحفوظة
  const [showSavedComments, setShowSavedComments] = useState(true)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)

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

    const newComment: SavedDesignComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      annotations: [...annotations],
      drawings: [...drawings],
      image: imageBase64,
      title: `التعليق ${savedComments.length + 1}`
    }

    const updatedComments = [...savedComments, newComment]
    onSavedCommentsChange?.(updatedComments)

    // مسح التعليق الحالي
    onAnnotationsChange([])
    onDrawingsChange([])
    onImageChange?.(null)

    return newComment
  }, [annotations, drawings, customImage, currentImageBase64, savedComments, onSavedCommentsChange, onAnnotationsChange, onDrawingsChange, onImageChange])

  // دالة حذف تعليق محفوظ
  const deleteSavedComment = useCallback((commentId: string) => {
    const updatedComments = savedComments.filter(c => c.id !== commentId)
    onSavedCommentsChange?.(updatedComments)
  }, [savedComments, onSavedCommentsChange])

  // دالة تحميل تعليق محفوظ للتعديل
  const loadCommentForEditing = useCallback((comment: SavedDesignComment) => {
    setEditingCommentId(comment.id)
    onAnnotationsChange(comment.annotations)
    onDrawingsChange(comment.drawings)
    // لا نحمل الصورة لأنها base64 وليست File
  }, [onAnnotationsChange, onDrawingsChange])

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

    const updatedComments = savedComments.map(c => {
      if (c.id === editingCommentId) {
        return {
          ...c,
          annotations: [...annotations],
          drawings: [...drawings],
          image: imageBase64 || c.image,
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
  }, [editingCommentId, annotations, drawings, customImage, currentImageBase64, savedComments, onSavedCommentsChange, onAnnotationsChange, onDrawingsChange, onImageChange])

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

  // دالة حساب موقع المربع بناءً على الاتجاه
  const getBoxPosition = useCallback((markerX: number, markerY: number, position: BoxPosition): BoundingBox => {
    const halfBoxWidth = BOX_WIDTH_PERCENT / 2
    const halfBoxHeight = BOX_HEIGHT_PERCENT / 2

    switch (position) {
      case 'bottom':
        return { x: markerX - halfBoxWidth, y: markerY + MARKER_SIZE + SAFE_MARGIN, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'top':
        return { x: markerX - halfBoxWidth, y: markerY - MARKER_SIZE - BOX_HEIGHT_PERCENT - SAFE_MARGIN, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'right':
        return { x: markerX + MARKER_SIZE + SAFE_MARGIN, y: markerY - halfBoxHeight, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'left':
        return { x: markerX - MARKER_SIZE - BOX_WIDTH_PERCENT - SAFE_MARGIN, y: markerY - halfBoxHeight, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'bottom-right':
        return { x: markerX + MARKER_SIZE, y: markerY + MARKER_SIZE, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'bottom-left':
        return { x: markerX - BOX_WIDTH_PERCENT - MARKER_SIZE, y: markerY + MARKER_SIZE, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'top-right':
        return { x: markerX + MARKER_SIZE, y: markerY - BOX_HEIGHT_PERCENT - MARKER_SIZE, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      case 'top-left':
        return { x: markerX - BOX_WIDTH_PERCENT - MARKER_SIZE, y: markerY - BOX_HEIGHT_PERCENT - MARKER_SIZE, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      default:
        return { x: markerX - halfBoxWidth, y: markerY + MARKER_SIZE + SAFE_MARGIN, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
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

  // دوال تعديل النص
  const handleSaveEdit = useCallback((e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation()
    if (editedText.trim()) {
      const updatedAnnotations = annotations.map(a =>
        a.id === annotationId ? { ...a, transcription: editedText.trim() } : a
      )
      onAnnotationsChange(updatedAnnotations)
    }
    setEditingTranscriptionId(null)
    setEditedText('')
  }, [editedText, annotations, onAnnotationsChange])

  const handleCancelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTranscriptionId(null)
    setEditedText('')
  }, [])

  // ===== دوال الرسم الحر =====

  // تحويل إحداثيات الحدث إلى نسب مئوية
  const getDrawingCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent): DrawingPoint | null => {
    if (!containerRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    let clientX: number, clientY: number

    if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100

    // التأكد من أن النقطة داخل الحدود
    if (x < 0 || x > 100 || y < 0 || y > 100) return null

    return { x, y }
  }, [])

  // بدء الرسم
  const handleDrawingStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingMode || disabled) return

    e.preventDefault()
    e.stopPropagation()

    const point = getDrawingCoordinates(e)
    if (point) {
      setIsDrawing(true)
      setCurrentPath([point])
    }
  }, [isDrawingMode, disabled, getDrawingCoordinates])

  // الاستمرار في الرسم
  const handleDrawingMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawingMode) return

    e.preventDefault()

    const point = getDrawingCoordinates(e)
    if (point) {
      setCurrentPath(prev => [...prev, point])
    }
  }, [isDrawing, isDrawingMode, getDrawingCoordinates])

  // إنهاء الرسم
  const handleDrawingEnd = useCallback(() => {
    if (!isDrawing || currentPath.length < 2) {
      setIsDrawing(false)
      setCurrentPath([])
      return
    }

    const newPath: DrawingPath = {
      id: Date.now().toString(),
      points: currentPath,
      color: isEraserMode ? '#ffffff' : drawingColor,
      strokeWidth: isEraserMode ? eraserWidth : strokeWidth,
      brushType: isEraserMode ? 'normal' : brushType,
      isEraser: isEraserMode,
      timestamp: Date.now()
    }

    onDrawingsChange([...drawings, newPath])
    setIsDrawing(false)
    setCurrentPath([])
  }, [isDrawing, currentPath, drawingColor, strokeWidth, brushType, isEraserMode, eraserWidth, drawings, onDrawingsChange])

  // التراجع عن آخر رسمة
  const handleUndoDrawing = useCallback(() => {
    if (drawings.length > 0) {
      onDrawingsChange(drawings.slice(0, -1))
    }
  }, [drawings, onDrawingsChange])

  // مسح جميع الرسومات
  const handleClearAllDrawings = useCallback(() => {
    onDrawingsChange([])
  }, [onDrawingsChange])

  // تفعيل/إلغاء وضع الرسم
  const toggleDrawingMode = useCallback(() => {
    setIsDrawingMode(prev => !prev)
    setShowColorPicker(false)
    setShowStrokePicker(false)
    setShowBrushPicker(false)
    setIsEraserMode(false)
    // إعادة تعيين الحالة عند الخروج من وضع الرسم
    if (isDrawingMode) {
      setIsDrawing(false)
      setCurrentPath([])
    }
  }, [isDrawingMode])

  // تفعيل/إلغاء وضع الممحاة
  const toggleEraserMode = useCallback(() => {
    setIsEraserMode(prev => !prev)
    setShowColorPicker(false)
    setShowStrokePicker(false)
    setShowBrushPicker(false)
  }, [])

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

    if (pathIsEraser) return // الممحاة لا تحتاج أنماط إضافية

    switch (pathBrushType) {
      case 'dashed':
        ctx.setLineDash([12, 6])
        break
      case 'dotted':
        ctx.setLineDash([3, 6])
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

  // رسم المسارات على Canvas
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

    // رسم المسارات المحفوظة
    drawings.forEach(path => {
      if (path.points.length < 2) return

      ctx.save()
      ctx.beginPath()
      ctx.strokeStyle = path.color
      ctx.lineWidth = path.strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // تطبيق نمط الفرشاة
      applyBrushStyle(ctx, path.brushType || 'normal', path.isEraser || false)

      const firstPoint = path.points[0]
      ctx.moveTo((firstPoint.x / 100) * canvas.width, (firstPoint.y / 100) * canvas.height)

      for (let i = 1; i < path.points.length; i++) {
        const point = path.points[i]
        ctx.lineTo((point.x / 100) * canvas.width, (point.y / 100) * canvas.height)
      }

      ctx.stroke()
      ctx.restore()
    })

    // رسم المسار الحالي
    if (currentPath.length >= 2) {
      ctx.save()
      ctx.beginPath()
      ctx.strokeStyle = isEraserMode ? '#cccccc' : drawingColor
      ctx.lineWidth = isEraserMode ? eraserWidth : strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // تطبيق نمط الفرشاة للمسار الحالي
      applyBrushStyle(ctx, isEraserMode ? 'normal' : brushType, isEraserMode)

      const firstPoint = currentPath[0]
      ctx.moveTo((firstPoint.x / 100) * canvas.width, (firstPoint.y / 100) * canvas.height)

      for (let i = 1; i < currentPath.length; i++) {
        const point = currentPath[i]
        ctx.lineTo((point.x / 100) * canvas.width, (point.y / 100) * canvas.height)
      }

      ctx.stroke()
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
    // منع إضافة تعليق جديد أثناء وضع الرسم أو التسجيل أو التعطيل أو التعديل
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

      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000)
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
      audioRefsRef.current.forEach(audio => audio.pause())
      audioRefsRef.current.clear()
    }
  }, [])

  // منع انتشار الأحداث للنموذج الأب
  const preventFormValidation = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
  }, [])

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

      {/* شريط أدوات الرسم */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        {/* زر تفعيل وضع الرسم */}
        <button
          type="button"
          onClick={toggleDrawingMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isDrawingMode
            ? 'bg-pink-500 text-white shadow-md'
            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          disabled={disabled || isRecordingActive}
        >
          <Pencil className="w-4 h-4" />
          {isDrawingMode ? 'وضع الرسم' : 'رسم'}
        </button>

        {/* أدوات الرسم - تظهر فقط في وضع الرسم */}
        {isDrawingMode && (
          <>
            {/* زر القلم */}
            <button
              type="button"
              onClick={() => setIsEraserMode(false)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-all ${!isEraserMode
                ? 'bg-pink-100 border-2 border-pink-400 text-pink-700'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              title="قلم"
            >
              <PenTool className="w-4 h-4" />
            </button>

            {/* زر الممحاة */}
            <button
              type="button"
              onClick={toggleEraserMode}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-all ${isEraserMode
                ? 'bg-orange-100 border-2 border-orange-400 text-orange-700'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              title="ممحاة"
            >
              <Eraser className="w-4 h-4" />
            </button>

            {/* فاصل */}
            <div className="w-px h-6 bg-gray-300" />

            {/* أدوات القلم - تظهر فقط عندما لا تكون الممحاة مفعلة */}
            {!isEraserMode && (
              <>
                {/* اختيار اللون */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowColorPicker(!showColorPicker)
                      setShowStrokePicker(false)
                      setShowBrushPicker(false)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-300 hover:bg-gray-100"
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 border-gray-400"
                      style={{ backgroundColor: drawingColor }}
                    />
                  </button>

                  {showColorPicker && (
                    <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
                      <div className="grid grid-cols-5 gap-1.5 w-40">
                        {DRAWING_COLORS.map(color => (
                          <button
                            type="button"
                            key={color.value}
                            onClick={() => {
                              setDrawingColor(color.value)
                              setShowColorPicker(false)
                            }}
                            className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${drawingColor === color.value
                              ? 'border-gray-800 scale-110 ring-2 ring-pink-300'
                              : 'border-gray-300'
                              }`}
                            style={{ backgroundColor: color.value }}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* اختيار نوع الفرشاة */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBrushPicker(!showBrushPicker)
                      setShowColorPicker(false)
                      setShowStrokePicker(false)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-300 hover:bg-gray-100"
                  >
                    <span className="text-base">{BRUSH_TYPES.find(b => b.value === brushType)?.icon || '✏️'}</span>
                    <span className="text-gray-600 text-xs hidden sm:inline">فرشاة</span>
                  </button>

                  {showBrushPicker && (
                    <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 min-w-32">
                      {BRUSH_TYPES.map(brush => (
                        <button
                          type="button"
                          key={brush.value}
                          onClick={() => {
                            setBrushType(brush.value)
                            setShowBrushPicker(false)
                          }}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-gray-100 ${brushType === brush.value ? 'bg-pink-50 text-pink-700' : ''
                            }`}
                        >
                          <span className="text-base">{brush.icon}</span>
                          <span className="text-sm text-gray-700">{brush.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* اختيار سمك الخط */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStrokePicker(!showStrokePicker)
                      setShowColorPicker(false)
                      setShowBrushPicker(false)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-300 hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-0.5">
                      <div
                        className="rounded-full bg-gray-700"
                        style={{ width: Math.min(strokeWidth * 1.5, 16), height: Math.min(strokeWidth * 1.5, 16) }}
                      />
                    </div>
                    <span className="text-gray-600 text-xs hidden sm:inline">سمك</span>
                  </button>

                  {showStrokePicker && (
                    <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 min-w-28">
                      {STROKE_WIDTHS.map(sw => (
                        <button
                          type="button"
                          key={sw.value}
                          onClick={() => {
                            setStrokeWidth(sw.value)
                            setShowStrokePicker(false)
                          }}
                          className={`flex items-center gap-2 w-full px-3 py-1.5 rounded hover:bg-gray-100 ${strokeWidth === sw.value ? 'bg-pink-50' : ''
                            }`}
                        >
                          <div
                            className="rounded-full bg-gray-700"
                            style={{ width: Math.min(sw.value * 1.5, 16), height: Math.min(sw.value * 1.5, 16) }}
                          />
                          <span className="text-sm text-gray-700">{sw.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* سمك الممحاة - يظهر فقط عند تفعيل الممحاة */}
            {isEraserMode && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowStrokePicker(!showStrokePicker)
                    setShowColorPicker(false)
                    setShowBrushPicker(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-300 hover:bg-gray-100"
                >
                  <div className="flex items-center gap-0.5">
                    <div
                      className="rounded-full bg-orange-400"
                      style={{ width: Math.min(eraserWidth * 1.5, 16), height: Math.min(eraserWidth * 1.5, 16) }}
                    />
                  </div>
                  <span className="text-gray-600 text-xs">حجم الممحاة</span>
                </button>

                {showStrokePicker && (
                  <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 min-w-28">
                    {STROKE_WIDTHS.map(sw => (
                      <button
                        type="button"
                        key={sw.value}
                        onClick={() => {
                          setEraserWidth(sw.value)
                          setShowStrokePicker(false)
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 rounded hover:bg-gray-100 ${eraserWidth === sw.value ? 'bg-orange-50' : ''
                          }`}
                      >
                        <div
                          className="rounded-full bg-orange-400"
                          style={{ width: Math.min(sw.value * 1.5, 16), height: Math.min(sw.value * 1.5, 16) }}
                        />
                        <span className="text-sm text-gray-700">{sw.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* فاصل */}
            <div className="w-px h-6 bg-gray-300" />

            {/* زر التراجع */}
            <button
              type="button"
              onClick={handleUndoDrawing}
              disabled={drawings.length === 0}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title="تراجع"
            >
              <RotateCcw className="w-4 h-4 text-gray-600" />
            </button>

            {/* زر مسح الكل */}
            <button
              type="button"
              onClick={handleClearAllDrawings}
              disabled={drawings.length === 0}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm bg-white border border-gray-300 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              title="مسح الكل"
            >
              <Trash2 className="w-4 h-4 text-gray-600" />
            </button>
          </>
        )}

        {/* عداد الرسومات */}
        {drawings.length > 0 && (
          <span className="text-xs text-gray-500">
            {drawings.length} رسمة
          </span>
        )}

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

      {/* تعليمات الاستخدام */}
      {showInstructions && annotations.length === 0 && !isDrawingMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-blue-800 text-sm">
            👆 انقر مرتين على أي منطقة في الصورة لإضافة ملاحظة صوتية، أو فعّل وضع الرسم للرسم على الصورة
          </p>
        </div>
      )}

      {/* تعليمات وضع الرسم */}
      {isDrawingMode && (
        <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-center">
          <p className="text-pink-800 text-sm">
            ✏️ ارسم على الصورة بالسحب بالماوس أو بالإصبع
          </p>
        </div>
      )}

      {/* حاوية الصورة */}
      <div
        ref={containerRef}
        className={`relative rounded-xl overflow-hidden border-2 bg-white ${isDrawingMode ? 'border-pink-400 cursor-crosshair' : 'border-pink-200 cursor-crosshair'
          }`}
        style={{
          touchAction: isDrawingMode ? 'none' : 'auto',
          userSelect: isDrawingMode ? 'none' : 'auto',
          WebkitUserSelect: isDrawingMode ? 'none' : 'auto',
          WebkitTouchCallout: isDrawingMode ? 'none' : 'default'
        } as React.CSSProperties}
        onClick={handleImageClick}
        onDoubleClick={handleImageDoubleClick}
        onMouseDown={(e) => {
          preventFormValidation(e)
          if (isDrawingMode) handleDrawingStart(e)
        }}
        onMouseMove={handleDrawingMove}
        onMouseUp={handleDrawingEnd}
        onMouseLeave={handleDrawingEnd}
        onTouchStart={(e) => {
          preventFormValidation(e)
          if (isDrawingMode) {
            e.preventDefault()
            e.stopPropagation()
            handleDrawingStart(e)
          }
        }}
        onTouchMove={(e) => {
          if (isDrawingMode) {
            e.preventDefault()
            e.stopPropagation()
          }
          handleDrawingMove(e)
        }}
        onTouchEnd={(e) => {
          if (isDrawingMode) {
            e.preventDefault()
          }
          handleDrawingEnd()
        }}
      >
        {/* الصورة */}
        <div className="relative w-full aspect-[3/4]">
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
              src={imageSrc}
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
          className={`absolute inset-0 w-full h-full ${isDrawingMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{ zIndex: 5 }}
        />

        {/* العلامات على الصورة */}
        <AnimatePresence>
          {annotations.map((annotation) => {
            const isActiveMarker = activeTranscriptionId === annotation.id
            const hasTranscription = annotation.transcription && !annotation.isRecording
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
                  {/* إذا كان هناك نص محول، نعرض علامة X فقط */}
                  {hasTranscription ? (
                    <motion.div
                      onClick={(e) => handleMarkerClick(e, annotation.id)}
                      animate={{
                        scale: isActiveMarker ? 1.2 : 1,
                      }}
                      transition={{ duration: 0.2 }}
                      className="cursor-pointer flex items-center justify-center"
                    >
                      <X
                        className={`w-4 h-4 drop-shadow-md ${isActiveMarker
                          ? 'text-pink-600'
                          : 'text-pink-500'
                          }`}
                        strokeWidth={3}
                      />
                    </motion.div>
                  ) : (
                    /* إذا لم يكن هناك نص، نعرض الدائرة مع أزرار التسجيل */
                    <>
                      <motion.div
                        onClick={(e) => handleMarkerClick(e, annotation.id)}
                        animate={{
                          scale: isActiveMarker ? 1.15 : 1,
                          boxShadow: isActiveMarker
                            ? '0 0 20px rgba(236, 72, 153, 0.6)'
                            : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        transition={{ duration: 0.2 }}
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-lg cursor-pointer ${annotation.isRecording
                          ? 'bg-red-500 border-red-300 animate-pulse border-2'
                          : isActiveMarker
                            ? 'bg-pink-400 border-pink-200 border-4 ring-2 ring-pink-300'
                            : 'bg-pink-500 border-pink-300 border-2'
                          }`}
                      >
                        {annotation.isRecording ? (
                          <button
                            type="button"
                            onClick={stopRecording}
                            className="w-full h-full flex items-center justify-center"
                          >
                            <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRecording(annotation.id)}
                            className="w-full h-full flex items-center justify-center"
                          >
                            <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          </button>
                        )}
                      </motion.div>

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

        {/* مربعات الملاحظات (النصوص المحولة) - منفصلة لتجنب التداخل */}
        <AnimatePresence>
          {annotations
            .filter(a => a.transcription && !a.isRecording && transcribingId !== a.id)
            .map((annotation) => {
              const styles = getBoxStyles(annotation.id)
              const positionData = annotationPositions.get(annotation.id)
              const isOverlapping = positionData && positionData.zIndex >= 50
              const isActive = activeTranscriptionId === annotation.id
              const isEditing = editingTranscriptionId === annotation.id
              const isDragging = draggingId === annotation.id
              const annotationIndex = annotations.findIndex(a => a.id === annotation.id) + 1

              return (
                <motion.div
                  key={`transcription-${annotation.id}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: isDragging ? 1.1 : (isActive || isEditing ? 1.02 : 1),
                  }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  style={styles}
                  drag={!isEditing}
                  dragMomentum={false}
                  dragElastic={0}
                  onDragStart={() => setDraggingId(annotation.id)}
                  onDragEnd={(_, info) => handleDragEnd(annotation.id, info)}
                  onClick={(e) => handleTranscriptionBoxClick(e, annotation.id)}
                  onDoubleClick={(e) => handleTranscriptionBoxDoubleClick(e, annotation.id, annotation.transcription || '')}
                  className={`pointer-events-auto w-auto ${isEditing ? 'cursor-text' : 'cursor-move'}`}
                >
                  <div
                    className={`rounded-lg shadow-md p-1.5 text-xs text-gray-800 transition-all duration-200 min-w-[100px] max-w-[160px] ${isDragging
                      ? 'bg-pink-100 border-2 border-pink-500 shadow-xl ring-2 ring-pink-400'
                      : isEditing
                        ? 'bg-blue-50 border-2 border-blue-500 shadow-lg ring-1 ring-blue-300'
                        : isActive
                          ? 'bg-pink-50 border-2 border-pink-500 shadow-lg ring-1 ring-pink-300'
                          : isOverlapping
                            ? 'bg-orange-50/95 border border-orange-400 backdrop-blur-sm'
                            : 'bg-white/95 border border-pink-300'
                      }`}
                  >
                    {/* محتوى النص - عرض أو تعديل */}
                    {isEditing ? (
                      <div className="space-y-1">
                        <textarea
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full min-h-[50px] p-1 text-xs text-gray-700 border border-blue-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                          autoFocus
                          dir="rtl"
                        />
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleSaveEdit(e, annotation.id)}
                            className="p-1 rounded bg-green-500 hover:bg-green-600 text-white transition-colors"
                            title="حفظ"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-1 rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                            title="إلغاء"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1">
                        {/* أيقونة تشغيل الصوت */}
                        {annotation.audioData && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePlayback(annotation)
                            }}
                            className={`p-0.5 rounded flex-shrink-0 transition-colors ${playingId === annotation.id
                              ? 'bg-green-500 text-white'
                              : 'hover:bg-green-100 text-green-600'
                              }`}
                            title={playingId === annotation.id ? 'إيقاف' : 'تشغيل الصوت'}
                          >
                            {playingId === annotation.id ? (
                              <Pause className="w-3 h-3" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                          </button>
                        )}
                        <span className={`text-[10px] font-bold flex-shrink-0 ${isActive ? 'text-pink-600' : 'text-pink-500'}`}>
                          {annotationIndex}.
                        </span>
                        <p className="text-gray-700 leading-snug break-words line-clamp-3 flex-1">
                          {annotation.transcription}
                        </p>
                        {/* زر الحذف */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteAnnotation(annotation.id)
                          }}
                          className="p-0.5 rounded hover:bg-red-100 text-red-500 transition-colors flex-shrink-0"
                          title="حذف"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
        </AnimatePresence>
      </div>

      {/* ملخص التعليقات الحالية */}
      {annotations.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-pink-600" />
            التعليقات الحالية ({annotations.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {annotations.map((annotation, index) => (
              <div
                key={annotation.id}
                className="flex items-start justify-between bg-white rounded-lg p-2 border border-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-pink-600 font-medium">
                    تعليق #{index + 1}
                  </span>
                  {annotation.transcription ? (
                    <p className="text-sm text-gray-700 truncate">
                      {annotation.transcription}
                    </p>
                  ) : annotation.audioData ? (
                    <p className="text-xs text-gray-500">تسجيل صوتي</p>
                  ) : (
                    <p className="text-xs text-gray-400">في انتظار التسجيل...</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteAnnotation(annotation.id)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* زر حفظ التعليق الحالي */}
      {showSaveButton && onSavedCommentsChange && (annotations.length > 0 || drawings.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {editingCommentId ? (
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
      )}

      {/* قائمة التعليقات المحفوظة */}
      {savedComments.length > 0 && (
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
                  {savedComments.map((comment, index) => (
                    <div
                      key={comment.id}
                      className={`bg-white rounded-lg border p-4 transition-all ${editingCommentId === comment.id
                        ? 'border-pink-500 ring-2 ring-pink-200'
                        : 'border-gray-200 hover:border-pink-300'
                        }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h5 className="font-medium text-gray-800">
                            {comment.title || `التعليق ${index + 1}`}
                          </h5>
                          <p className="text-xs text-gray-500">
                            {new Date(comment.timestamp).toLocaleDateString('ar-SA', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!disabled && onSavedCommentsChange && (
                            <>
                              <button
                                type="button"
                                onClick={() => loadCommentForEditing(comment)}
                                disabled={editingCommentId !== null}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                title="تعديل"
                              >
                                <Pencil className="w-4 h-4" />
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

                      {/* معاينة محتوى التعليق */}
                      <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                        {comment.annotations.length > 0 && (
                          <span className="flex items-center gap-1 bg-pink-100 text-pink-700 px-2 py-1 rounded-full">
                            <Mic className="w-3 h-3" />
                            {comment.annotations.length} تعليق صوتي
                          </span>
                        )}
                        {comment.drawings.length > 0 && (
                          <span className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                            <Pencil className="w-3 h-3" />
                            {comment.drawings.length} رسمة
                          </span>
                        )}
                        {comment.image && (
                          <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                            <ImageIcon className="w-3 h-3" />
                            صورة مخصصة
                          </span>
                        )}
                      </div>

                      {/* عرض النصوص المكتوبة */}
                      {comment.annotations.some(a => a.transcription) && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="space-y-1">
                            {comment.annotations.filter(a => a.transcription).map((a, i) => (
                              <p key={a.id} className="text-sm text-gray-700">
                                <span className="text-pink-600 font-medium">{i + 1}.</span> {a.transcription}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
