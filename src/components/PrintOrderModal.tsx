'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Printer, Check, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Order, orderService } from '@/lib/services/order-service'
import { formatGregorianDate } from '@/lib/date-utils'
import OrderPrintLayout from './OrderPrintLayout'
import type { ImageAnnotation, DrawingPath, SavedDesignComment } from './InteractiveImageAnnotation'
import { renderDrawingsOnCanvas, calculateObjectContainDimensions } from '@/lib/canvas-renderer'

// نوع snapshot التعليق للطباعة
interface DesignCommentSnapshot {
  id: string
  title: string
  imageDataUrl: string
  transcriptions: string[] // النصوص المرئية على الصورة
  hiddenTranscriptions: Array<{ number: number; text: string; translation?: string }> // النصوص المخفية مع ترجماتها ورقم العلامة
  translatedTexts: Array<{ number: number; text: string; translation: string }> // النصوص المترجمة (المرئية) مع رقم العلامة
}

interface PrintOrderModalProps {
  isOpen: boolean
  onClose: () => void
  order: Order
  onPrint?: () => void
}

export default function PrintOrderModal({ isOpen, onClose, order: initialOrder, onPrint }: PrintOrderModalProps) {
  // Full order data (fetched when lightweight order is missing measurements)
  const [fullOrder, setFullOrder] = useState<Order | null>(null)
  const order = fullOrder || initialOrder

  const [printableImages, setPrintableImages] = useState<string[]>([])
  const [designComments, setDesignComments] = useState<string>(order.notes || '')
  const [designCommentsSnapshots, setDesignCommentsSnapshots] = useState<DesignCommentSnapshot[]>([])
  const [selectedCommentsIds, setSelectedCommentsIds] = useState<string[]>([]) // التعليقات المحددة للطباعة
  const [hindiDesignCommentsSnapshots, setHindiDesignCommentsSnapshots] = useState<DesignCommentSnapshot[]>([])
  const [includeHindiPrint, setIncludeHindiPrint] = useState(false)
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  // Fetch full order data when opened with lightweight-loaded order
  // (list views exclude measurements which contains design comments)
  useEffect(() => {
    if (!isOpen || !initialOrder) {
      setFullOrder(null)
      return
    }

    // If measurements is already present, no need to fetch
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

  // الحصول على التعليقات المحددة فقط
  const selectedCommentsSnapshots = designCommentsSnapshots.filter(
    snapshot => selectedCommentsIds.includes(snapshot.id)
  )

  // دالة مساعدة لإنشاء snapshot لتعليق واحد
  const generateSingleSnapshot = async (
    annotations: ImageAnnotation[],
    drawings: DrawingPath[],
    customImage: string | null,
    title: string,
    id: string,
    compositeImage?: string | null // الصورة المركّبة المحفوظة (إذا وجدت)
  ): Promise<DesignCommentSnapshot | null> => {
    try {
      // إذا وجدت صورة مركّبة محفوظة، استخدمها مباشرة بدلاً من إعادة الإنشاء
      if (compositeImage) {
        // فصل التعليقات المرئية والمخفية
        const visibleAnnotations = annotations.filter(a => !a.isHidden && a.transcription)
        const hiddenAnnotations = annotations.filter(a => a.isHidden && a.transcription)

        // النصوص المرئية
        const transcriptions = visibleAnnotations
          .map((a, idx) => `${idx + 1}. ${a.transcription}`)

        // النصوص المخفية مع ترجماتها ورقم العلامة الأصلي
        const hiddenTranscriptions = hiddenAnnotations
          .map(a => {
            const originalIndex = annotations.findIndex(ann => ann.id === a.id) + 1
            return {
              number: originalIndex,
              text: a.transcription || '',
              translation: a.translatedText
            }
          })

        // النصوص المترجمة (المرئية فقط)
        const translatedTexts = visibleAnnotations
          .filter(a => a.translatedText)
          .map(a => {
            const originalIndex = annotations.findIndex(ann => ann.id === a.id) + 1
            return {
              number: originalIndex,
              text: a.transcription || '',
              translation: a.translatedText || ''
            }
          })

        return { id, title, imageDataUrl: compositeImage, transcriptions, hiddenTranscriptions, translatedTexts }
      }

      // إذا لم توجد صورة مركّبة، أنشئها من البيانات الخام (للتوافق مع البيانات القديمة)
      // نستخدم نفس المنطق المستخدم في InteractiveImageAnnotation.generateCompositeImage
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const baseImage = new Image()
      baseImage.crossOrigin = 'anonymous'
      const baseImageSrc = customImage && customImage !== 'custom' ? customImage : '/front2.png'

      await new Promise<void>((resolve, reject) => {
        baseImage.onload = () => resolve()
        baseImage.onerror = () => reject(new Error('Failed to load image'))
        baseImage.src = baseImageSrc
      })

      // استخدام نفس منطق aspect-[3/4] و object-contain المستخدم في العرض
      // نحاكي container بعرض 400px ونسبة 3:4
      const containerWidth = 400
      const containerHeight = containerWidth * (4 / 3) // aspect-[3/4]
      const qualityScale = 2 // للجودة العالية

      canvas.width = containerWidth * qualityScale
      canvas.height = containerHeight * qualityScale
      ctx.scale(qualityScale, qualityScale)

      // رسم خلفية بيضاء
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, containerWidth, containerHeight)

      // حساب أبعاد الصورة مع الحفاظ على النسبة (object-contain)
      const { offsetX, offsetY, drawWidth, drawHeight } = calculateObjectContainDimensions(
        baseImage.width,
        baseImage.height,
        containerWidth,
        containerHeight
      )

      // رسم الصورة الأساسية
      ctx.drawImage(baseImage, offsetX, offsetY, drawWidth, drawHeight)

      renderDrawingsOnCanvas(
        ctx,
        drawings,
        containerWidth,
        containerHeight,
        baseImage,
        { offsetX, offsetY, drawWidth, drawHeight }
      )

      // فصل التعليقات المرئية والمخفية
      const visibleAnnotations = annotations.filter(a => !a.isHidden && a.transcription)
      const hiddenAnnotations = annotations.filter(a => a.isHidden && a.transcription)

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

      // حساب مواقع النصوص - نفس المنطق المستخدم في InteractiveImageAnnotation
      const TEXT_OFFSET = 2
      const BOX_WIDTH_PERCENT = 25
      const BOX_HEIGHT_PERCENT = 12
      const SAFE_MARGIN = 2

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
          // تقسيم بحسب <end> أو \n مطابقاً لعرض HTML، مع لف الكلمات داخل كل مقطع
          const rawText = annotation.translatedText || annotation.transcription || ''
          const segments = rawText.split(/<end>|\n/gi).map(s => s.trim()).filter(Boolean)
          if (segments.length === 0) segments.push('')
          segments[0] = `${annotationIndex}. ${segments[0]}`.trim()

          const lines: string[] = []
          for (const segment of segments) {
            const words = segment.split(/\s+/).filter(Boolean)
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
          }

          lines.forEach((line, lineIndex) => {
            const lineY = textY + (lineIndex * lineHeight)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx !== 0 || dy !== 0) {
                  ctx.fillText(line, textX + dx, lineY + dy)
                }
              }
            }
            ctx.fillStyle = '#000000'
            ctx.fillText(line, textX, lineY)
          })

          ctx.restore()
        })

      const imageDataUrl = canvas.toDataURL('image/png')

      // النصوص المرئية (للعرض أسفل الصورة كمرجع)
      const transcriptions = visibleAnnotations
        .map((a, idx) => `${idx + 1}. ${a.transcription}`)

      // النصوص المخفية مع ترجماتها ورقم العلامة الأصلي
      const hiddenTranscriptions = hiddenAnnotations
        .map(a => {
          // إيجاد رقم العلامة الأصلي في قائمة جميع التعليقات
          const originalIndex = annotations.findIndex(ann => ann.id === a.id) + 1
          return {
            number: originalIndex,
            text: a.transcription || '',
            translation: a.translatedText
          }
        })

      // النصوص المترجمة (المرئية التي لها ترجمة) مع رقم العلامة الأصلي
      const translatedTexts = visibleAnnotations
        .filter(a => a.translatedText)
        .map(a => {
          // إيجاد رقم العلامة الأصلي في قائمة جميع التعليقات
          const originalIndex = annotations.findIndex(ann => ann.id === a.id) + 1
          return {
            number: originalIndex,
            text: a.transcription || '',
            translation: a.translatedText || ''
          }
        })

      return { id, title, imageDataUrl, transcriptions, hiddenTranscriptions, translatedTexts }
    } catch (error) {
      console.error('Error generating snapshot:', error)
      return null
    }
  }

  // إنشاء snapshots لجميع التعليقات
  const generateAllSnapshots = useCallback(async () => {
    const measurements = order.measurements || {}
    const orderAny = order as any
    // migration 30: الأعمدة المستقلة تتفوق على البيانات القديمة داخل measurements
    const savedComments: SavedDesignComment[] =
      (orderAny.design_comments?.length ? orderAny.design_comments : null) ||
      measurements.saved_design_comments ||
      []
    const legacyAnnotations: ImageAnnotation[] =
      (orderAny.image_annotations?.length ? orderAny.image_annotations : null) ||
      measurements.image_annotations ||
      []
    const legacyDrawings: DrawingPath[] =
      (orderAny.image_drawings?.length ? orderAny.image_drawings : null) ||
      measurements.image_drawings ||
      []
    const legacyImage: string | null = measurements.custom_design_image || null

    setIsGeneratingSnapshot(true)
    const snapshots: DesignCommentSnapshot[] = []

    try {
      // إنشاء snapshots للتعليقات المحفوظة
      for (let i = 0; i < savedComments.length; i++) {
        const comment = savedComments[i]
        const commentImage =
          comment.image && comment.image !== 'custom'
            ? comment.image
            : legacyImage
        const snapshot = await generateSingleSnapshot(
          comment.annotations || [],
          comment.drawings || [],
          commentImage,
          comment.title || `التعليق ${i + 1}`,
          comment.id,
          comment.compositeImage // تمرير الصورة المركّبة المحفوظة
        )
        if (snapshot) snapshots.push(snapshot)
      }

      // إذا لم تكن هناك تعليقات محفوظة، استخدم التعليقات القديمة
      if (savedComments.length === 0 && (legacyAnnotations.length > 0 || legacyDrawings.length > 0 || legacyImage)) {
        const snapshot = await generateSingleSnapshot(
          legacyAnnotations,
          legacyDrawings,
          legacyImage,
          'تعليقات التصميم',
          'legacy',
          null // لا توجد صورة مركّبة للبيانات القديمة
        )
        if (snapshot) snapshots.push(snapshot)
      }

      setDesignCommentsSnapshots(snapshots)
      // تحديد اول صورة امام و اول ظهر خلف بشكل افتراضي والباقي غير محدد بشكل افتراضي
      const firstFront = snapshots.find(s => s.title.includes('أمام') || s.title.toLowerCase().includes('front'))
      const firstBack = snapshots.find(s => s.title.includes('خلف') || s.title.toLowerCase().includes('back'))

      const defaultSelectedIds: string[] = []
      if (firstFront) defaultSelectedIds.push(firstFront.id)
      if (firstBack) defaultSelectedIds.push(firstBack.id)

      setSelectedCommentsIds(defaultSelectedIds)

      // بناء snapshots الهندية من compositeImageHi المحفوظ في كل تعليق
      const hindiSnapshots: DesignCommentSnapshot[] = []
      for (let i = 0; i < savedComments.length; i++) {
        const comment = savedComments[i] as any
        if (!comment.compositeImageHi) continue
        const title = comment.title || `التعليق ${i + 1}`
        hindiSnapshots.push({
          id: comment.id + '_hi',
          title: title + ' (हिंदी)',
          imageDataUrl: comment.compositeImageHi,
          transcriptions: [],
          hiddenTranscriptions: [],
          translatedTexts: []
        })
      }
      setHindiDesignCommentsSnapshots(hindiSnapshots)
      if (hindiSnapshots.length > 0) setIncludeHindiPrint(true)
    } catch (error) {
      console.error('Error generating snapshots:', error)
    } finally {
      setIsGeneratingSnapshot(false)
    }
  }, [order.measurements])

  // تهيئة الصور المحددة للطباعة من الطلب
  useEffect(() => {
    if (isOpen && order) {
      // تحديد أول صورتين تلقائياً
      const images = order.images || []
      const imageOnlyList = images.filter(img =>
        !img.includes('.mp4') && !img.includes('.mov') && !img.includes('.avi') && !img.includes('.webm') && !img.includes('video')
      )
      setPrintableImages([])
      setDesignComments(order.notes || '')

      // إعادة توليد التعليقات عند تحديث البيانات
      // يحدث هذا عندما يتم جلب fullOrder (مع measurements)
      generateAllSnapshots()
    }
  }, [isOpen, order, generateAllSnapshots])

  // تبديل حالة الطباعة للصورة
  const togglePrintable = (imageUrl: string) => {
    if (printableImages.includes(imageUrl)) {
      setPrintableImages(printableImages.filter(img => img !== imageUrl))
    } else {
      setPrintableImages([...printableImages, imageUrl])
    }
  }

  // تحديد جميع الصور
  const selectAllImages = () => {
    const allImages = (order.images || []).filter(img =>
      !img.includes('.mp4') && !img.includes('.mov') && !img.includes('.avi') && !img.includes('.webm') && !img.includes('video')
    )
    setPrintableImages(allImages)
  }

  // إلغاء تحديد جميع الصور
  const deselectAllImages = () => {
    setPrintableImages([])
  }

  // تبديل حالة تحديد تعليق للطباعة
  const toggleCommentSelection = (commentId: string) => {
    if (selectedCommentsIds.includes(commentId)) {
      setSelectedCommentsIds(selectedCommentsIds.filter(id => id !== commentId))
    } else {
      setSelectedCommentsIds([...selectedCommentsIds, commentId])
    }
  }

  // تحديد جميع تعليقات التصميم
  const selectAllComments = () => {
    setSelectedCommentsIds(designCommentsSnapshots.map(s => s.id))
  }

  // إلغاء تحديد جميع التعليقات
  const deselectAllComments = () => {
    setSelectedCommentsIds([])
  }

  // التحقق من نوع الجهاز
  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2)
  }

  // أنماط CSS للطباعة
  const getPrintStyles = () => `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body { font-family: 'Cairo', sans-serif; direction: rtl; }
    .print-layout { display: block !important; }
    .print-page {
      width: 100%;
      min-height: 100vh;
      page-break-after: always;
      padding: 20px;
      position: relative;
      box-sizing: border-box;
    }
    .print-page:last-child { page-break-after: auto; }
    /* منع انقلاب الصفحات في الطباعة على الوجهين */
    .page-front-image, .design-comment-page, .page-back {
      transform: rotate(0deg) !important;
      -webkit-transform: rotate(0deg) !important;
    }
    .page-front { display: flex; flex-direction: column; }
    .print-header { text-align: center; margin-bottom: 6px; padding-bottom: 0; border-bottom: none; }
    .print-header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; font-size: 12px; font-weight: 500; color: #333; }
    .header-item { display: flex; gap: 4px; align-items: center; }
    .header-right { text-align: right; }
    .header-center { text-align: center; }
    .header-left { text-align: left; }
    .print-logo { text-align: center; margin-bottom: 15px; }
    .print-brand { font-size: 28px; font-weight: bold; color: #ec4899; margin: 0; }
    .print-subtitle { font-size: 14px; color: #666; margin: 5px 0 0 0; }
    .print-order-info { margin-top: 10px; --order-info-scale: 1.25; }
    .info-grid-single-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; }
    .info-item-inline { display: flex; gap: 4px; align-items: center; font-size: 11px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; text-align: right; }
    .info-item { display: flex; gap: 4px; padding: 4px 8px; background: #f9fafb; border-radius: 4px; border: 1px solid #e5e7eb; font-size: 11px; }
    .info-label { font-weight: bold; color: #374151; white-space: nowrap; font-size: 11px; }
    .info-value { color: #111827; font-size: 11px; }
    .print-order-info .info-item-inline { font-size: calc(11px * var(--order-info-scale)); }
    .print-order-info .info-item { font-size: calc(11px * var(--order-info-scale)); }
    .print-order-info .info-label { font-size: calc(11px * var(--order-info-scale)); }
    .print-order-info .info-value { font-size: calc(11px * var(--order-info-scale)); }
    .print-content { display: flex; flex: 1; gap: 20px; }
    .print-measurements-section { width: 30%; display: flex; flex-direction: column; gap: 10px; }
    .print-measurements { border: 1px solid #d1d5db; border-radius: 8px; padding: 15px; }
    .print-measurements-compact { padding: 8px 12px; }
    .section-title { font-size: 16px; font-weight: bold; color: #ec4899; margin: 0 0 15px 0; padding-bottom: 8px; border-bottom: 1px solid #fce7f3; }
    .section-title-compact { font-size: 14px; margin: 0 0 8px 0; padding-bottom: 4px; }
    .measurements-list { display: flex; flex-direction: column; gap: 8px; }
    .measurements-list-compact { gap: 6px; }
    .measurement-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #fdf2f8; border-radius: 4px; font-size: 13px; }
    .measurement-item-compact { padding: 5px 7px; font-size: 11px; }
    .measurement-label { color: #000000; font-weight: bold; }
    .measurement-value { color: #111827; font-weight: bold; min-width: 50px; text-align: center; }
    .print-additional-notes { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px; background: #f0fdf4; }
    .additional-notes-list { display: flex; flex-direction: column; gap: 4px; }
    .additional-note-item { display: flex; gap: 6px; font-size: 10px; line-height: 1.4; padding: 3px 0; border-bottom: 1px dashed #d1fae5; }
    .additional-note-item:last-child { border-bottom: none; }
    .additional-note-empty { color: #9ca3af; font-style: italic; justify-content: center; }
    .note-number { color: #059669; font-weight: bold; flex-shrink: 0; }
    .note-text { color: #374151; }
    .print-comments { width: 70%; border: 1px solid #d1d5db; border-radius: 8px; padding: 15px; display: flex; flex-direction: column; }
    .comments-box { flex: 1; min-height: 300px; padding: 10px; background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 4px; white-space: pre-wrap; font-size: 13px; line-height: 1.6; display: flex; flex-direction: column; gap: 10px; }
    .empty-comments { height: 100%; min-height: 280px; }
    .first-images-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; flex: 1; }
    .first-images-single { display: flex; justify-content: center; align-items: center; flex: 1; width: 100%; height: 100%; }
    .first-image-container { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; aspect-ratio: 1; }
    .first-image-single { width: 100%; height: 100%; max-height: 100%; aspect-ratio: auto; display: flex; justify-content: center; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .first-image-single .first-design-image { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; }
    .first-design-image { width: 100%; height: 100%; object-fit: cover; }
    .text-comments-section { border-top: 1px dashed #d1d5db; padding-top: 8px; margin-top: auto; }
    .notes-label { font-weight: bold; color: #ec4899; font-size: 12px; margin-bottom: 4px; }
    .text-comments { padding: 4px; font-size: 12px; line-height: 1.5; color: #333; }
    .page-back { display: flex; flex-direction: column; align-items: center; }
    .images-title { font-size: 20px; font-weight: bold; color: #ec4899; margin: 0 0 20px 0; text-align: center; }
    .images-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; width: 100%; }
    .image-container { border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; aspect-ratio: 1; }
    .design-image { width: 100%; height: 100%; object-fit: cover; }
    .design-comment-page { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px; }
    .page-front-image { padding: 5px; display: flex; flex-direction: column; height: 100vh; }
    .page-front-image .section-title { margin-bottom: 2px !important; padding-bottom: 2px !important; }
    .design-comment-full { width: 100%; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .design-comment-image-wrapper { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; }
    .design-comment-full-image { max-width: 100%; max-height: 95vh; width: auto; height: auto; object-fit: contain; }
    .design-comment-transcriptions { margin-top: 15px; padding: 10px; background: #fdf2f8; border-radius: 8px; }
    .transcription-item { font-size: 14px; color: #333; padding: 6px 0; border-bottom: 1px dashed #fce7f3; }
    .transcription-item:last-child { border-bottom: none; }
    .design-comment-hidden-texts { margin-top: 10px; padding: 10px; background: #f3f4f6; border-radius: 8px; border: 1px dashed #9ca3af; }
    .hidden-texts-title { font-size: 12px; font-weight: bold; color: #6b7280; margin-bottom: 6px; }
    .hidden-text-item { font-size: 13px; color: #374151; padding: 4px 0; display: flex; gap: 6px; align-items: flex-start; }
    .hidden-text-number { font-weight: bold; color: #ec4899; flex-shrink: 0; }
    .hidden-text { color: #1f2937; flex: 1; }
    .hidden-text-translation { color: #059669; font-style: italic; }
    .design-comment-translations { margin-top: 10px; padding: 10px; background: #ecfdf5; border-radius: 8px; border: 1px solid #a7f3d0; }
    .translations-title { font-size: 12px; font-weight: bold; color: #059669; margin-bottom: 6px; }
    .translation-item { font-size: 13px; color: #374151; padding: 4px 0; display: flex; gap: 6px; align-items: flex-start; }
    .translation-number { font-weight: bold; color: #ec4899; flex-shrink: 0; }
    .original-text { color: #1f2937; }
    .arrow-icon { color: #9ca3af; flex-shrink: 0; }
    .translated-text { color: #059669; font-weight: 500; }
    .header-dates { display: flex; flex-direction: column; gap: 2px; }
    .date-row { display: flex; gap: 4px; align-items: center; }
    .measurement-additional { background: #fef3c7; border: 1px dashed #f59e0b; }
    .measurement-additional-text { font-size: 9px; text-align: right; white-space: pre-wrap; min-width: auto; }
    .note-content { display: flex; flex-direction: column; gap: 2px; }
    .note-translation { color: #059669; font-size: 9px; font-style: italic; }
    /* زر الطباعة للموبايل */
    .mobile-print-btn { display: none; position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 15px 40px; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; border: none; border-radius: 30px; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(236, 72, 153, 0.4); z-index: 1000; font-family: 'Cairo', sans-serif; }
    .mobile-print-btn:active { transform: translateX(-50%) scale(0.95); }
    @media print {
      @page {
        size: A4 portrait;
        margin: 1cm;
      }
      @page :left {
        margin-left: 1.5cm;
        margin-right: 1cm;
      }
      @page :right {
        margin-left: 1cm;
        margin-right: 1.5cm;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        direction: rtl;
      }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }
      .print-layout, .print-container {
        transform: none !important;
        -webkit-transform: none !important;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      html::after { content: none !important; }
      .mobile-print-btn { display: none !important; }
      /* منع انقلاب الصفحات الزوجية في الطباعة على الوجهين */
      .print-page {
        page-break-inside: avoid;
        transform: none !important;
      }
    }
    @media screen {
      .mobile-print-btn { display: block; }
    }
  `

  // طباعة الطلب
  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML || ''
    const isMobile = isMobileDevice()

    if (onPrint) {
      onPrint()
    }

    if (isMobile) {
      // على الهاتف/التابلت: استخدام iframe مرئي مع زر طباعة
      // إنشاء iframe بحجم كامل
      let printFrame = document.getElementById('mobile-print-frame') as HTMLIFrameElement
      if (printFrame) {
        printFrame.remove()
      }

      printFrame = document.createElement('iframe')
      printFrame.id = 'mobile-print-frame'
      printFrame.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        z-index: 99999;
        background: white;
      `
      document.body.appendChild(printFrame)

      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document
      if (!frameDoc) {
        alert('حدث خطأ أثناء تجهيز الطباعة')
        return
      }

      frameDoc.open()
      frameDoc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>طباعة الطلب - ${order.client_name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            ${getPrintStyles()}
            /* أزرار التحكم للموبايل */
            .mobile-controls {
              position: fixed;
              top: 10px;
              left: 50%;
              transform: translateX(-50%);
              z-index: 1000;
              display: flex;
              gap: 10px;
              background: white;
              padding: 10px;
              border-radius: 10px;
              box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .mobile-controls button {
              padding: 12px 24px;
              border: none;
              border-radius: 8px;
              font-family: 'Cairo', sans-serif;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              transition: all 0.3s;
            }
            .print-btn {
              background: linear-gradient(135deg, #ec4899, #f43f5e);
              color: white;
            }
            .print-btn:active {
              transform: scale(0.95);
            }
            .close-btn {
              background: #6b7280;
              color: white;
            }
            .close-btn:active {
              transform: scale(0.95);
            }
            @media print {
              .mobile-controls { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="mobile-controls">
            <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
            <button class="close-btn" onclick="parent.document.getElementById('mobile-print-frame').remove()">✖ إغلاق</button>
          </div>
          <div class="print-container">${printContent}</div>
          <script>
            // إغلاق iframe بعد الطباعة (اختياري)
            window.onafterprint = function() {
              // يمكن إلغاء التعليق لإغلاق تلقائي بعد الطباعة
              // setTimeout(() => parent.document.getElementById('mobile-print-frame').remove(), 500);
            };
          </script>
        </body>
        </html>
      `)
      frameDoc.close()
    } else {
      // على الكمبيوتر: استخدام نافذة منبثقة (كما هو)
      const printWindow = window.open('', '_blank', 'width=800,height=600')

      if (!printWindow) {
        alert('يرجى السماح بالنوافذ المنبثقة للطباعة')
        return
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>طباعة الطلب - ${order.client_name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
          <style>${getPrintStyles()}</style>
        </head>
        <body>
          <div class="print-container">${printContent}</div>
          <script>
            document.title = 'طباعة الطلب - ${order.client_name}';
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 1000);
            }
          </script>
        </body>
        </html>
      `)
      printWindow.document.close()
    }
  }

  if (!isOpen) return null

  const images = order.images || []
  const imageOnlyList = images.filter(img =>
    !img.includes('.mp4') && !img.includes('.mov') && !img.includes('.avi') && !img.includes('.webm') && !img.includes('video')
  )

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* رأس المودال */}
          <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Printer className="w-6 h-6" />
              <h2 className="text-xl font-bold">طباعة الطلب</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* محتوى المودال */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* معلومات الطلب */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-800 mb-2">معلومات الطلب:</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><span className="text-gray-600">الزبونة:</span> {order.client_name}</p>
                <p><span className="text-gray-600">الهاتف:</span> {order.client_phone}</p>
                <p><span className="text-gray-600">رقم الطلب:</span> #{order.order_number || order.id.slice(0, 8)}</p>
                <p><span className="text-gray-600">موعد التسليم:</span> {formatGregorianDate(order.due_date, 'ar-SA')}</p>
              </div>
            </div>

            {/* تعليقات التصميم المتعددة - مع إمكانية الاختيار */}
            {(isGeneratingSnapshot || designCommentsSnapshots.length > 0) && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-bold text-gray-800">
                    اختر تعليقات التصميم للطباعة ({selectedCommentsIds.length} من {designCommentsSnapshots.length}):
                  </label>
                  {designCommentsSnapshots.length > 0 && !isGeneratingSnapshot && (
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllComments}
                        className="text-xs px-3 py-1 bg-pink-100 text-pink-700 rounded-full hover:bg-pink-200 transition-colors"
                      >
                        تحديد الكل
                      </button>
                      <button
                        onClick={deselectAllComments}
                        className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        إلغاء الكل
                      </button>
                    </div>
                  )}
                </div>
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  {isGeneratingSnapshot ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-pink-500 animate-spin" />
                      <span className="mr-2 text-gray-600">جاري إنشاء صور التعليقات...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {designCommentsSnapshots.map((snapshot) => {
                        const isSelected = selectedCommentsIds.includes(snapshot.id)
                        const selectedIndex = selectedCommentsIds.indexOf(snapshot.id)
                        return (
                          <div
                            key={snapshot.id}
                            onClick={() => toggleCommentSelection(snapshot.id)}
                            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-pink-500 ring-2 ring-pink-300' : 'border-gray-200 hover:border-pink-300'
                              }`}
                          >
                            <img
                              src={snapshot.imageDataUrl}
                              alt={snapshot.title}
                              className="w-full h-auto"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                                <div className="bg-pink-500 text-white rounded-full p-2">
                                  <Check className="w-5 h-5" />
                                </div>
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-pink-500 text-white text-xs px-2 py-1 rounded-full">
                                صفحة {selectedIndex + 2}
                              </div>
                            )}
                            <p className="text-xs text-gray-600 mt-1 text-center p-1">{snapshot.title}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {selectedCommentsIds.length > 0 && (
                  <p className="mt-2 text-sm text-pink-600">
                    سيتم طباعة {selectedCommentsIds.length} تعليق تصميم
                  </p>
                )}
              </div>
            )}

            {/* اختيار الصور للطباعة */}
            {imageOnlyList.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-pink-500" />
                    اختر الصور للطباعة:
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllImages}
                      className="text-xs px-3 py-1 bg-pink-100 text-pink-700 rounded-full hover:bg-pink-200 transition-colors"
                    >
                      تحديد الكل
                    </button>
                    <button
                      onClick={deselectAllImages}
                      className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                    >
                      إلغاء الكل
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {imageOnlyList.map((image, index) => {
                    const isSelected = printableImages.includes(image)
                    return (
                      <div
                        key={index}
                        onClick={() => togglePrintable(image)}
                        className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-pink-500 ring-2 ring-pink-300' : 'border-gray-200 hover:border-pink-300'
                          }`}
                      >
                        <img src={image} alt={`صورة ${index + 1}`} className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-pink-500/30 flex items-center justify-center">
                            <div className="bg-pink-500 text-white rounded-full p-2">
                              <Check className="w-5 h-5" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                          {index + 1}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {printableImages.length > 0 && (
                  <p className="mt-2 text-sm text-pink-600">
                    تم تحديد {printableImages.length} صورة للطباعة
                  </p>
                )}
              </div>
            )}
          </div>

          {/* خيار الطباعة بالهندية */}
          {hindiDesignCommentsSnapshots.length > 0 && (
            <div className="px-6 pb-4">
              <label className="flex items-center gap-3 cursor-pointer bg-orange-50 border border-orange-200 rounded-lg p-3 hover:bg-orange-100 transition-colors">
                <input
                  type="checkbox"
                  checked={includeHindiPrint}
                  onChange={(e) => setIncludeHindiPrint(e.target.checked)}
                  className="w-4 h-4 accent-orange-500"
                />
                <div>
                  <span className="font-medium text-orange-800">طباعة نسخة هندية (हिंदी)</span>
                  <p className="text-xs text-orange-600 mt-0.5">سيتم طباعة الطلب مرتين: الأولى بالعربية والثانية بالهندية</p>
                </div>
              </label>
            </div>
          )}

          {/* أزرار الإجراءات */}
          <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={handlePrint}
              className="px-6 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 transition-colors flex items-center gap-2"
            >
              <Printer className="w-5 h-5" />
              طباعة الطلب
            </button>
          </div>
        </motion.div>

        {/* مكون الطباعة المخفي */}
        <div className="hidden">
          <div ref={printRef}>
            <OrderPrintLayout
              order={order}
              printableImages={printableImages}
              designComments={designComments}
              designCommentsSnapshots={selectedCommentsSnapshots}
              hindiDesignCommentsSnapshots={includeHindiPrint ? hindiDesignCommentsSnapshots : undefined}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

