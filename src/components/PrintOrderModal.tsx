'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Printer, Check, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Order } from '@/lib/services/order-service'
import OrderPrintLayout from './OrderPrintLayout'

// نوع التعليق على الصورة (من InteractiveImageAnnotation)
interface ImageAnnotation {
  id: string
  x: number
  y: number
  boxX?: number
  boxY?: number
  transcription?: string
  timestamp: number
}

// نوع مسار الرسم (من InteractiveImageAnnotation)
interface DrawingPath {
  id: string
  points: Array<{ x: number; y: number }>
  color: string
  strokeWidth: number
  brushType?: string
  isEraser?: boolean
  timestamp: number
}

// نوع التعليق المحفوظ على التصميم
interface SavedDesignComment {
  id: string
  timestamp: number
  annotations: ImageAnnotation[]
  drawings: DrawingPath[]
  image: string | null
  title?: string
}

// نوع snapshot التعليق للطباعة
interface DesignCommentSnapshot {
  id: string
  title: string
  imageDataUrl: string
  transcriptions: string[]
}

interface PrintOrderModalProps {
  isOpen: boolean
  onClose: () => void
  order: Order
}

export default function PrintOrderModal({ isOpen, onClose, order }: PrintOrderModalProps) {
  const [printableImages, setPrintableImages] = useState<string[]>([])
  const [designComments, setDesignComments] = useState<string>(order.notes || '')
  const [designCommentsSnapshots, setDesignCommentsSnapshots] = useState<DesignCommentSnapshot[]>([])
  const [selectedCommentsIds, setSelectedCommentsIds] = useState<string[]>([]) // التعليقات المحددة للطباعة
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

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
    id: string
  ): Promise<DesignCommentSnapshot | null> => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const baseImage = new Image()
      baseImage.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        baseImage.onload = () => resolve()
        baseImage.onerror = () => reject(new Error('Failed to load image'))
        baseImage.src = customImage || '/WhatsApp Image 2026-01-11 at 3.33.05 PM.jpeg'
      })

      // تعيين أبعاد الـ canvas بناءً على الصورة - حجم كبير للطباعة
      const targetWidth = 800
      const scale = targetWidth / baseImage.width
      const targetHeight = baseImage.height * scale

      canvas.width = targetWidth
      canvas.height = targetHeight

      // رسم الصورة الأساسية
      ctx.drawImage(baseImage, 0, 0, targetWidth, targetHeight)

      // رسم المسارات (الرسومات)
      for (const path of drawings) {
        if (path.points.length < 2) continue
        ctx.save()
        ctx.beginPath()
        ctx.strokeStyle = path.isEraser ? '#ffffff' : path.color
        ctx.lineWidth = path.strokeWidth * scale
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (path.brushType === 'dashed') ctx.setLineDash([12, 6])
        else if (path.brushType === 'dotted') ctx.setLineDash([3, 6])
        else if (path.brushType === 'soft') { ctx.shadowBlur = 8; ctx.shadowColor = path.color }
        else if (path.brushType === 'highlighter') { ctx.globalAlpha = 0.4; ctx.lineWidth = path.strokeWidth * scale * 2.5 }

        const firstPoint = path.points[0]
        ctx.moveTo((firstPoint.x / 100) * targetWidth, (firstPoint.y / 100) * targetHeight)
        for (let i = 1; i < path.points.length; i++) {
          const point = path.points[i]
          ctx.lineTo((point.x / 100) * targetWidth, (point.y / 100) * targetHeight)
        }
        ctx.stroke()
        ctx.restore()
      }

      // رسم علامات التعليقات على الصورة
      for (let i = 0; i < annotations.length; i++) {
        const annotation = annotations[i]
        const markerX = (annotation.x / 100) * targetWidth
        const markerY = (annotation.y / 100) * targetHeight

        // رسم دائرة العلامة
        ctx.save()
        ctx.beginPath()
        ctx.arc(markerX, markerY, 15, 0, Math.PI * 2)
        ctx.fillStyle = '#ec4899'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()

        // رسم الرقم داخل الدائرة
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 14px Cairo, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((i + 1).toString(), markerX, markerY)
        ctx.restore()
      }

      const imageDataUrl = canvas.toDataURL('image/png')
      const transcriptions = annotations
        .filter(a => a.transcription)
        .map((a, idx) => `${idx + 1}. ${a.transcription}`)

      return { id, title, imageDataUrl, transcriptions }
    } catch (error) {
      console.error('Error generating snapshot:', error)
      return null
    }
  }

  // إنشاء snapshots لجميع التعليقات
  const generateAllSnapshots = useCallback(async () => {
    const measurements = order.measurements || {}
    const savedComments: SavedDesignComment[] = measurements.saved_design_comments || []
    const legacyAnnotations: ImageAnnotation[] = measurements.image_annotations || []
    const legacyDrawings: DrawingPath[] = measurements.image_drawings || []
    const legacyImage: string | null = measurements.custom_design_image || null

    setIsGeneratingSnapshot(true)
    const snapshots: DesignCommentSnapshot[] = []

    try {
      // إنشاء snapshots للتعليقات المحفوظة
      for (let i = 0; i < savedComments.length; i++) {
        const comment = savedComments[i]
        const snapshot = await generateSingleSnapshot(
          comment.annotations || [],
          comment.drawings || [],
          comment.image,
          comment.title || `التعليق ${i + 1}`,
          comment.id
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
          'legacy'
        )
        if (snapshot) snapshots.push(snapshot)
      }

      setDesignCommentsSnapshots(snapshots)
      // تحديد جميع التعليقات تلقائياً بعد إنشائها
      setSelectedCommentsIds(snapshots.map(s => s.id))
    } catch (error) {
      console.error('Error generating snapshots:', error)
    } finally {
      setIsGeneratingSnapshot(false)
    }
  }, [order.measurements])

  // تهيئة الصور المحددة للطباعة من الطلب
  useEffect(() => {
    if (isOpen) {
      // تحديد أول صورتين تلقائياً
      const images = order.images || []
      const imageOnlyList = images.filter(img =>
        !img.includes('.mp4') && !img.includes('.mov') && !img.includes('.avi') && !img.includes('.webm') && !img.includes('video')
      )
      setPrintableImages(imageOnlyList.slice(0, 2))
      setDesignComments(order.notes || '')
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

  // طباعة الطلب
  const handlePrint = () => {
    // إنشاء نافذة طباعة جديدة
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة')
      return
    }

    // الحصول على محتوى الطباعة
    const printContent = printRef.current?.innerHTML || ''

    // إنشاء صفحة HTML للطباعة
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>طباعة الطلب - ${order.client_name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { height: 100%; }
          body { font-family: 'Cairo', sans-serif; direction: rtl; }
          .print-layout { display: block !important; }
          .print-page { width: 100%; min-height: 100vh; page-break-after: always; padding: 20px; }
          .print-page:last-child { page-break-after: auto; }
          .page-front { display: flex; flex-direction: column; }
          .print-header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #ec4899; }
          /* السطر الأول: رقم الهاتف - الموقع - تاريخ الاستلام */
          .print-header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; font-size: 12px; font-weight: 500; color: #333; }
          .header-item { display: flex; gap: 4px; align-items: center; }
          .header-right { text-align: right; }
          .header-center { text-align: center; }
          .header-left { text-align: left; }
          .print-logo { text-align: center; margin-bottom: 15px; }
          .print-brand { font-size: 28px; font-weight: bold; color: #ec4899; margin: 0; }
          .print-subtitle { font-size: 14px; color: #666; margin: 5px 0 0 0; }
          .print-order-info { margin-top: 10px; }
          /* صف أفقي واحد لمعلومات العميل */
          .info-grid-single-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; }
          .info-item-inline { display: flex; gap: 4px; align-items: center; font-size: 11px; }
          .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; text-align: right; }
          .info-item { display: flex; gap: 4px; padding: 4px 8px; background: #f9fafb; border-radius: 4px; border: 1px solid #e5e7eb; font-size: 11px; }
          .info-label { font-weight: bold; color: #374151; white-space: nowrap; font-size: 11px; }
          .info-value { color: #111827; font-size: 11px; }
          .print-content { display: flex; flex: 1; gap: 20px; }
          /* قسم المقاسات والملاحظات الإضافية */
          .print-measurements-section { width: 30%; display: flex; flex-direction: column; gap: 10px; }
          .print-measurements { border: 1px solid #d1d5db; border-radius: 8px; padding: 15px; min-height: 360px; }
          .print-measurements-compact { padding: 8px 12px; }
          .section-title { font-size: 16px; font-weight: bold; color: #ec4899; margin: 0 0 15px 0; padding-bottom: 8px; border-bottom: 1px solid #fce7f3; }
          .section-title-compact { font-size: 13px; margin: 0 0 8px 0; padding-bottom: 4px; }
          .measurements-list { display: flex; flex-direction: column; gap: 8px; }
          .measurements-list-compact { gap: 4px; }
          .measurement-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #fdf2f8; border-radius: 4px; font-size: 12px; }
          .measurement-item-compact { padding: 3px 7px; font-size: 10px; }
          .measurement-label { color: #374151; font-weight: 500; }
          .measurement-value { color: #111827; font-weight: bold; min-width: 50px; text-align: center; }
          /* قسم ملاحظات إضافية */
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
          /* صفحات تعليقات التصميم */
          .design-comment-page { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px; }
          .design-comment-full { width: 100%; height: 100%; display: flex; flex-direction: column; }
          .design-comment-image-wrapper { flex: 1; display: flex; justify-content: center; align-items: center; }
          .design-comment-full-image { max-width: 100%; max-height: 85vh; object-fit: contain; }
          .design-comment-transcriptions { margin-top: 15px; padding: 10px; background: #fdf2f8; border-radius: 8px; }
          .transcription-item { font-size: 14px; color: #333; padding: 6px 0; border-bottom: 1px dashed #fce7f3; }
          .transcription-item:last-child { border-bottom: none; }
          @media print {
            @page {
              size: A4;
              margin: 1cm;
              /* إخفاء رأس وتذييل الصفحة (URL, التاريخ، الخ) */
            }
            /* إخفاء عناوين المتصفح */
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            /* إزالة about:blank من التذييل */
            html::after { content: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${printContent}
        </div>
        <script>
          // تغيير عنوان الصفحة لإزالة about:blank
          document.title = 'طباعة الطلب - ${order.client_name}';

          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
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
                <p><span className="text-gray-600">موعد التسليم:</span> {new Date(order.due_date).toLocaleDateString('ar-SA')}</p>
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
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

