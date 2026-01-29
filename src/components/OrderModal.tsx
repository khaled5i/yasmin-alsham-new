'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Pause
} from 'lucide-react'
import { Order } from '@/lib/services/order-service'
import { Worker } from '@/lib/services/worker-service'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import VoiceNotes from './VoiceNotes'
import PrintOrderModal from './PrintOrderModal'
import { MEASUREMENT_ORDER, getMeasurementLabelWithSymbol } from '@/types/measurements'
import { ImageAnnotation, DrawingPath, SavedDesignComment } from './InteractiveImageAnnotation'

interface OrderModalProps {
  order: Order | null
  workers: Worker[]
  isOpen: boolean
  onClose: () => void
}

export default function OrderModal({ order, workers, isOpen, onClose }: OrderModalProps) {
  const { user } = useAuthStore()
  const { t, isArabic } = useTranslation()
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [voiceNotes, setVoiceNotes] = useState<any[]>([])
  const [showPrintModal, setShowPrintModal] = useState(false)

  // حالات تعليقات التصميم
  const [imageAnnotations, setImageAnnotations] = useState<ImageAnnotation[]>([])
  const [imageDrawings, setImageDrawings] = useState<DrawingPath[]>([])
  const [customDesignImage, setCustomDesignImage] = useState<string | null>(null)
  const [savedDesignComments, setSavedDesignComments] = useState<SavedDesignComment[]>([])
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map())

  // تحديث الملاحظات الصوتية وتعليقات التصميم عند تغيير الطلب
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

      // استرجاع تعليقات التصميم من measurements
      const measurements = order.measurements as any
      if (measurements) {
        // استرجاع التعليقات المتعددة (البنية الجديدة)
        setSavedDesignComments(measurements.saved_design_comments || [])
        // للتوافق مع الكود القديم
        setImageAnnotations(measurements.image_annotations || [])
        setImageDrawings(measurements.image_drawings || [])
        setCustomDesignImage(measurements.custom_design_image || null)
      } else {
        setSavedDesignComments([])
        setImageAnnotations([])
        setImageDrawings([])
        setCustomDesignImage(null)
      }
    }
  }, [order])

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

  // دالة لرسم الخطوط على canvas
  const drawPathsOnCanvas = (canvas: HTMLCanvasElement, drawings: DrawingPath[]) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // مسح canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // رسم كل مسار
    drawings.forEach(path => {
      if (path.points.length < 2) return

      ctx.beginPath()
      ctx.strokeStyle = path.isEraser ? 'white' : path.color
      ctx.lineWidth = path.strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const firstPoint = path.points[0]
      ctx.moveTo((firstPoint.x / 100) * canvas.width, (firstPoint.y / 100) * canvas.height)

      for (let i = 1; i < path.points.length; i++) {
        const point = path.points[i]
        ctx.lineTo((point.x / 100) * canvas.width, (point.y / 100) * canvas.height)
      }

      ctx.stroke()
    })
  }

  // رسم الخطوط على canvas للتعليقات القديمة
  useEffect(() => {
    if (!canvasRef.current || imageDrawings.length === 0) return
    drawPathsOnCanvas(canvasRef.current, imageDrawings)
  }, [imageDrawings])

  // رسم الخطوط على canvas للتعليقات المتعددة عند التوسيع
  useEffect(() => {
    if (!expandedCommentId) return

    const comment = savedDesignComments.find(c => c.id === expandedCommentId)
    if (!comment || !comment.drawings || comment.drawings.length === 0) return

    // انتظار قليلاً حتى يتم رسم Canvas في DOM
    const timer = setTimeout(() => {
      const canvas = canvasRefs.current.get(expandedCommentId)
      if (canvas) {
        drawPathsOnCanvas(canvas, comment.drawings || [])
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [expandedCommentId, savedDesignComments])

  if (!order) return null

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return t('not_specified')
    const worker = workers.find(w => w.id === workerId)
    return worker ? (worker.user?.full_name || worker.id) : t('not_specified')
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

  // حساب موعد التسليم المعروض (قبل يومين من الموعد الحقيقي)
  const getDisplayDeliveryDate = (actualDate: string) => {
    const date = new Date(actualDate)
    date.setDate(date.getDate() - 2)
    return date.toISOString()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory', // استخدام التقويم الميلادي
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
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

                  {/* موعد التسليم */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('delivery_date')}:</span>
                    </div>
                    <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">{formatDate(getDisplayDeliveryDate(order.due_date))}</p>
                  </div>

                  {/* موعد تسليم البروفا */}
                  {order.proof_delivery_date && (
                    <div className="bg-white p-2 sm:p-3 rounded-lg">
                      <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium truncate">{isArabic ? 'موعد تسليم البروفا' : 'Proof Delivery Date'}:</span>
                      </div>
                      <p className="text-xs sm:text-base font-semibold text-green-600 truncate">{formatDate(getDisplayDeliveryDate(order.proof_delivery_date))}</p>
                    </div>
                  )}

                  {/* العامل المسؤول */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('assigned_worker')}:</span>
                    </div>
                    <p className="text-xs sm:text-base font-semibold text-gray-800 truncate">{getWorkerName(order.worker_id)}</p>
                  </div>

                  {/* الحالة */}
                  <div className="bg-white p-2 sm:p-3 rounded-lg">
                    <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{t('status')}:</span>
                    </div>
                    <span className={`inline-block px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color} truncate max-w-full`}>
                      {getStatusInfo(order.status).label}
                    </span>
                  </div>

                  {/* معلومات إضافية للمدراء فقط */}
                  {user?.role === 'admin' && (
                    <>
                      {/* رقم الهاتف */}
                      {order.client_phone && (
                        <div className="bg-white p-2 sm:p-3 rounded-lg">
                          <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                            <Phone className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="text-xs sm:text-sm font-medium truncate">{t('phone')}:</span>
                          </div>
                          <p className="text-xs sm:text-base font-semibold text-gray-800 truncate" dir="ltr">{order.client_phone}</p>
                        </div>
                      )}

                      {/* السعر */}
                      <div className="bg-white p-2 sm:p-3 rounded-lg">
                        <div className="flex items-center space-x-1 sm:space-x-2 space-x-reverse text-gray-600 mb-0.5 sm:mb-1">
                          <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium truncate">{t('price')}:</span>
                        </div>
                        <p className="text-xs sm:text-base font-semibold text-green-600 truncate">{order.price} {t('sar')}</p>
                      </div>
                    </>
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
                        workerId={user?.worker_id}
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
                    <span>تعليقات على التصميم</span>
                    {savedDesignComments.length > 0 && (
                      <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full">
                        {savedDesignComments.length} تعليق
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
                                {comment.title || `التعليق ${commentIndex + 1}`}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({comment.annotations?.length || 0} علامة، {comment.drawings?.length || 0} رسم)
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
                                    <img
                                      src={comment.image || "/WhatsApp Image 2026-01-11 at 3.33.05 PM.jpeg"}
                                      alt={`صورة ${comment.title || `التعليق ${commentIndex + 1}`}`}
                                      className="w-full h-auto cursor-pointer"
                                      onClick={() => setLightboxImage(comment.image || "/WhatsApp Image 2026-01-11 at 3.33.05 PM.jpeg")}
                                    />
                                    {/* طبقة الرسومات */}
                                    {comment.drawings && comment.drawings.length > 0 && (
                                      <canvas
                                        ref={(el) => {
                                          if (el) {
                                            canvasRefs.current.set(comment.id, el)
                                            // رسم الخطوط مباشرة عند تعيين الـ ref
                                            drawPathsOnCanvas(el, comment.drawings || [])
                                          }
                                        }}
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                        width={800}
                                        height={800}
                                      />
                                    )}
                                    {/* علامات التعليقات */}
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
                                  </div>

                                  {/* قائمة التعليقات الصوتية */}
                                  {comment.annotations && comment.annotations.length > 0 && (
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                                        التعليقات ({comment.annotations.length})
                                      </h4>
                                      <div className="space-y-2">
                                        {comment.annotations.map((annotation, idx) => (
                                          <div
                                            key={annotation.id}
                                            className="flex items-start gap-2 bg-white rounded-lg p-2 border border-gray-100"
                                          >
                                            <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                              {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              {annotation.transcription && (
                                                <p className="text-sm text-gray-700 mb-1">{annotation.transcription}</p>
                                              )}
                                              {annotation.audioData && (
                                                <button
                                                  onClick={() => toggleAnnotationAudio(annotation)}
                                                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${playingAudioId === annotation.id
                                                    ? 'bg-pink-500 text-white'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    }`}
                                                >
                                                  {playingAudioId === annotation.id ? (
                                                    <><Pause className="w-3 h-3" /><span>إيقاف</span></>
                                                  ) : (
                                                    <><Play className="w-3 h-3" /><span>تشغيل</span></>
                                                  )}
                                                </button>
                                              )}
                                            </div>
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
                            src={customDesignImage || "/WhatsApp Image 2026-01-11 at 3.33.05 PM.jpeg"}
                            alt="صورة التصميم"
                            className="w-full h-auto"
                            onClick={() => setLightboxImage(customDesignImage || "/WhatsApp Image 2026-01-11 at 3.33.05 PM.jpeg")}
                            style={{ cursor: 'pointer' }}
                          />
                          {imageDrawings.length > 0 && (
                            <canvas
                              ref={canvasRef}
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              width={800}
                              height={800}
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
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">
                            التعليقات ({imageAnnotations.length})
                          </h4>
                          <div className="space-y-3">
                            {imageAnnotations.map((annotation, index) => (
                              <div
                                key={annotation.id}
                                className="flex items-start gap-3 bg-white rounded-lg p-3 border border-gray-100"
                              >
                                <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {annotation.transcription && (
                                    <p className="text-sm text-gray-700 mb-2">{annotation.transcription}</p>
                                  )}
                                  {annotation.audioData && (
                                    <button
                                      onClick={() => toggleAnnotationAudio(annotation)}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${playingAudioId === annotation.id
                                        ? 'bg-pink-500 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                    >
                                      {playingAudioId === annotation.id ? (
                                        <><Pause className="w-4 h-4" /><span>إيقاف</span></>
                                      ) : (
                                        <><Play className="w-4 h-4" /><span>تشغيل الصوت</span>
                                          {annotation.duration && <span className="text-xs opacity-75">({Math.round(annotation.duration)}ث)</span>}
                                        </>
                                      )}
                                    </button>
                                  )}
                                  {!annotation.transcription && !annotation.audioData && (
                                    <p className="text-sm text-gray-400 italic">علامة بدون تعليق</p>
                                  )}
                                </div>
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
              {Object.values(order.measurements).some(val => val !== undefined && val !== '') && (
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
                      const value = (order.measurements as any)?.[key]
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
                  {(order.measurements as any)?.additional_notes && (
                    <div className="space-y-2">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-700 border-b border-pink-200 pb-2">
                        {t('measurement_additional_notes')}
                      </h4>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                        <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                          {(order.measurements as any).additional_notes}
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
                        <div className="aspect-square rounded-lg overflow-hidden border border-pink-200">
                          <img
                            src={image}
                            alt={`${t('design_image')} ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                            onClick={() => setLightboxImage(image)}
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

              {/* صور العمل المكتمل - للمدراء فقط */}
              {user?.role === 'admin' && order.completed_images && order.completed_images.length > 0 && (
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
                          <div className="aspect-square rounded-lg overflow-hidden border border-green-300">
                            <img
                              src={image}
                              alt={`${t('completed_work_image_alt')} ${index + 1}`}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                              onClick={() => setLightboxImage(image)}
                            />
                          </div>
                          <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-xs px-2 py-1 rounded">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* تذييل النافذة */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="btn-secondary px-6 py-2"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lightbox لعرض الصور بالحجم الكامل */}
      {lightboxImage && (
        <div
          key="order-lightbox"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxImage}
            alt="عرض كامل"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </AnimatePresence>
  )
}
