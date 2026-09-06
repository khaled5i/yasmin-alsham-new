'use client'

import OrderCutterInfo from '@/components/OrderCutterInfo'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import { orderService, type Order } from '@/lib/services/order-service'
import { shiftDate } from '@/lib/date-utils'
import { useAppResume } from '@/hooks/useAppResume'
import { sendDeliveredWhatsApp, sendSecondProofReadyWhatsApp, sendReadyForPickupWhatsApp } from '@/utils/whatsapp'
import OrderModal from '@/components/OrderModal'
import EditOrderModal from '@/components/EditOrderModal'
import MeasurementsModal from '@/components/MeasurementsModal'
import PrintOrderModal from '@/components/PrintOrderModal'
import {
  ArrowRight,
  Bell,
  BellRing,
  PackageCheck,
  MessageCircle,
  CheckCircle,
  Ruler,
  Printer,
  Edit,
  EyeOff,
  Loader,
  CalendarDays,
  Filter,
  ArrowDownUp,
  Zap,
  Inbox,
  Truck
} from 'lucide-react'

// أقسام الإشعارات — مصمَّمة لتقبل أنواعاً جديدة مستقبلاً (طلبات تحتاج مراجعة، إلخ)
type NotificationCategory = 'second_proof' | 'completion' | 'delivery'
const NOTIFICATION_CATEGORIES: { key: NotificationCategory; labelAr: string; labelEn: string; icon: typeof BellRing }[] = [
  { key: 'second_proof', labelAr: 'البروفا الثانية', labelEn: 'Second Proof', icon: BellRing },
  { key: 'completion', labelAr: 'اكتمال الطلب', labelEn: 'Order Completed', icon: PackageCheck },
  { key: 'delivery', labelAr: 'الطلبات المُسلَّمة', labelEn: 'Delivered Orders', icon: Truck },
]

type SortOption = 'newest' | 'oldest' | 'priority'

export default function NotificationsPage() {
  const { user, isLoading: authLoading } = useAuthStore()
  const { updateOrder } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()

  // قائمة منفصلة لكل نوع إشعار (لعرض عدّادات دقيقة على أزرار الفلترة)
  const [secondProofOrders, setSecondProofOrders] = useState<Order[]>([])
  const [completionOrders, setCompletionOrders] = useState<Order[]>([])
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [category, setCategory] = useState<NotificationCategory>('second_proof')
  const [sortBy, setSortBy] = useState<SortOption>('newest')

  // القائمة النشطة + مُحدّثها حسب القسم المختار
  const isCompletion = category === 'completion'
  const isDelivery = category === 'delivery'
  const isSecondProof = category === 'second_proof'
  const orders = isCompletion ? completionOrders : isDelivery ? deliveryOrders : secondProofOrders
  const updateActiveOrders = (updater: (prev: Order[]) => Order[]) => {
    if (isCompletion) setCompletionOrders(updater)
    else if (isDelivery) setDeliveryOrders(updater)
    else setSecondProofOrders(updater)
  }

  // تتبّع العمليات الجارية لكل طلب
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  // المودالات
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false)
  const [measurementsOrder, setMeasurementsOrder] = useState<any>(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printOrder, setPrintOrder] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // حماية الصفحة: للمدير فقط
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/login')
      return
    }
    if (user.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  // جلب كل أنواع الإشعارات معاً (مرتبة من الأحدث إلى الأقدم حسب تاريخ الإنجاز/الاكتمال)
  const loadNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const [secondProof, completion, delivery] = await Promise.all([
        orderService.getAll({
          secondProofCompleted: true,
          noPagination: true,
          orderBy: 'second_proof_completed_at',
          orderAscending: false,
        }),
        orderService.getAll({
          completionPending: true,
          noPagination: true,
          orderBy: 'completion_notified_at',
          orderAscending: false,
        }),
        orderService.getAll({
          deliveryPending: true,
          noPagination: true,
          orderBy: 'delivery_notified_at',
          orderAscending: false,
        }),
      ])
      setSecondProofOrders(secondProof.data || [])
      setCompletionOrders(completion.data || [])
      setDeliveryOrders(delivery.data || [])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    loadNotifications()
    loadWorkers()
  }, [user, loadNotifications, loadWorkers])

  useAppResume(() => {
    if (!user || user.role !== 'admin') return
    loadNotifications()
  })

  // ============ مساعدات العرض ============
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    const d = new Date(dateString)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return '—'
    const d = new Date(dateString)
    const time = d.toLocaleTimeString(isArabic ? 'ar-SA-u-nu-latn' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} - ${time}`
  }

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return null
    const worker = workers.find(w => w.id === workerId)
    return worker?.user?.full_name || null
  }

  const NON_MEASUREMENT_KEYS = new Set([
    'saved_design_comments', 'image_annotations', 'image_drawings', 'custom_design_image',
    'ai_generated_images', 'design_comments', 'design_summary_notes', 'is_printed',
    'has_measurements', 'whatsapp_sent', 'fabric_type',
  ])
  const hasMeaningfulValue = (value: unknown) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim() !== ''
    if (typeof value === 'number') return !Number.isNaN(value)
    if (typeof value === 'boolean') return value
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
    return false
  }
  const hasMeasurementsData = (measurements: Record<string, unknown> | null | undefined) => {
    if (!measurements || typeof measurements !== 'object') return false
    return Object.entries(measurements).some(([key, value]) => !NON_MEASUREMENT_KEYS.has(key) && hasMeaningfulValue(value))
  }
  const hasMeasurementsBadge = (order: any) => order?.has_measurements === true || hasMeasurementsData(order?.measurements)
  const isOrderPrinted = (order: any) => order?.is_printed === true

  // ============ ترتيب الطلبات ============
  // توقيت الإنجاز المعتمد للترتيب يختلف حسب نوع الإشعار
  const getSortTimestamp = (o: any) => isCompletion
    ? (o.completion_notified_at || o.worker_completed_at || o.created_at)
    : isDelivery
      ? (o.delivery_notified_at || o.delivery_date || o.created_at)
      : (o.second_proof_completed_at || o.created_at)

  const sortedOrders = [...orders].sort((a, b) => {
    if (sortBy === 'priority') {
      // الأولوية: المستعجل أولاً، ثم الأقرب موعد تسليم
      const aUrgent = (a as any).is_urgent === true ? 1 : 0
      const bUrgent = (b as any).is_urgent === true ? 1 : 0
      if (aUrgent !== bUrgent) return bUrgent - aUrgent
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    }
    const aTime = new Date(getSortTimestamp(a)).getTime()
    const bTime = new Date(getSortTimestamp(b)).getTime()
    return sortBy === 'oldest' ? aTime - bTime : bTime - aTime
  })

  // ============ إجراءات إشعارات البروفا الثانية ============
  // إرسال رسالة "البروفا الثانية جاهزة" + تمييز الطلب بأنه أُرسل (علامة الصح)
  const handleSendSecondProofWhatsApp = async (order: any) => {
    if (!order?.client_phone || order.client_phone.trim() === '') {
      toast.error(isArabic ? 'لا يوجد رقم هاتف للزبونة' : 'Client phone is missing', { icon: '⚠️' })
      return
    }
    setSendingWhatsAppId(order.id)
    try {
      sendSecondProofReadyWhatsApp(order.client_name, order.client_phone)
      if (order.second_proof_whatsapp_sent !== true) {
        await updateOrder(order.id, { second_proof_whatsapp_sent: true } as any)
        setSecondProofOrders(prev => prev.map(o => o.id === order.id ? { ...o, second_proof_whatsapp_sent: true } : o))
      }
      toast.success(isArabic ? 'تم فتح واتساب لإرسال رسالة البروفا الثانية' : 'WhatsApp opened (second proof message)', { icon: '📱', duration: 3000 })
    } catch {
      toast.error(isArabic ? 'حدث خطأ أثناء فتح واتساب' : 'Failed to open WhatsApp', { icon: '⚠️' })
    } finally {
      setSendingWhatsAppId(null)
    }
  }

  // إخفاء إشعار البروفا الثانية يدوياً بعد الانتهاء منه نهائياً
  const handleDismissSecondProof = async (order: any) => {
    setDismissingId(order.id)
    try {
      const result = await updateOrder(order.id, { second_proof_dismissed: true } as any)
      if (result.success) {
        setSecondProofOrders(prev => prev.filter(o => o.id !== order.id))
        toast.success(isArabic ? 'تم إخفاء الإشعار' : 'Notification hidden', { icon: '✓' })
      } else {
        toast.error(result.error || (isArabic ? 'حدث خطأ' : 'An error occurred'), { icon: '✗' })
      }
    } finally {
      setDismissingId(null)
    }
  }

  // ============ إجراءات إشعارات اكتمال الطلب ============
  // إرسال رسالة "الطلب جاهز للاستلام" + ضبط admin_confirmed=true → يُخفي الإشعار تلقائياً
  const handleSendCompletionWhatsApp = async (order: any) => {
    if (!order?.client_phone || order.client_phone.trim() === '') {
      toast.error(isArabic ? 'لا يوجد رقم هاتف للزبونة' : 'Client phone is missing', { icon: '⚠️' })
      return
    }
    setSendingWhatsAppId(order.id)
    try {
      sendReadyForPickupWhatsApp(order.client_name, order.client_phone)
      // إرسال رسالة الجاهزية يُعدّ تأكيداً للمراجعة (admin_confirmed) → يُخفي إشعار الاكتمال تلقائياً
      const result = await updateOrder(order.id, { admin_confirmed: true } as any)
      if (result.success) {
        setCompletionOrders(prev => prev.filter(o => o.id !== order.id))
        toast.success(isArabic ? 'تم فتح واتساب وإخفاء الإشعار تلقائياً' : 'WhatsApp opened, notification auto-hidden', { icon: '📱', duration: 3000 })
      } else {
        toast.error(result.error || (isArabic ? 'حدث خطأ' : 'An error occurred'), { icon: '✗' })
      }
    } catch {
      toast.error(isArabic ? 'حدث خطأ أثناء فتح واتساب' : 'Failed to open WhatsApp', { icon: '⚠️' })
    } finally {
      setSendingWhatsAppId(null)
    }
  }

  // إخفاء إشعار الاكتمال يدوياً
  const handleDismissCompletion = async (order: any) => {
    setDismissingId(order.id)
    try {
      const result = await updateOrder(order.id, { completion_dismissed: true } as any)
      if (result.success) {
        setCompletionOrders(prev => prev.filter(o => o.id !== order.id))
        toast.success(isArabic ? 'تم إخفاء الإشعار' : 'Notification hidden', { icon: '✓' })
      } else {
        toast.error(result.error || (isArabic ? 'حدث خطأ' : 'An error occurred'), { icon: '✗' })
      }
    } finally {
      setDismissingId(null)
    }
  }

  // ============ إجراءات إشعارات تسليم الطلب ============
  // فتح رسالة "تم التسليم" وتسجيل فتحها؛ يبقى الإشعار حتى يُخفيه المدير يدوياً.
  const handleSendDeliveryWhatsApp = async (order: any) => {
    if (!order?.client_phone || order.client_phone.trim() === '') {
      toast.error(isArabic ? 'لا يوجد رقم هاتف للزبونة' : 'Client phone is missing', { icon: '⚠️' })
      return
    }
    setSendingWhatsAppId(order.id)
    try {
      sendDeliveredWhatsApp(order.client_name, order.client_phone)
      if (order.delivery_whatsapp_sent !== true) {
        const result = await updateOrder(order.id, { delivery_whatsapp_sent: true })
        if (!result.success) {
          toast.error(result.error || (isArabic ? 'تعذّر تسجيل إرسال الرسالة' : 'Could not mark message as sent'), { icon: '✗' })
          return
        }
        setDeliveryOrders(prev => prev.map(o => o.id === order.id ? { ...o, delivery_whatsapp_sent: true } : o))
      }
      toast.success(isArabic ? 'تم فتح واتساب لإرسال رسالة التسليم والتقييم' : 'WhatsApp opened (delivery and review message)', { icon: '📱', duration: 3000 })
    } catch {
      toast.error(isArabic ? 'حدث خطأ أثناء فتح واتساب' : 'Failed to open WhatsApp', { icon: '⚠️' })
    } finally {
      setSendingWhatsAppId(null)
    }
  }

  // إخفاء إشعار التسليم يدوياً بعد الانتهاء منه.
  const handleDismissDelivery = async (order: any) => {
    setDismissingId(order.id)
    try {
      const result = await updateOrder(order.id, { delivery_dismissed: true })
      if (result.success) {
        setDeliveryOrders(prev => prev.filter(o => o.id !== order.id))
        toast.success(isArabic ? 'تم إخفاء الإشعار' : 'Notification hidden', { icon: '✓' })
      } else {
        toast.error(result.error || (isArabic ? 'حدث خطأ' : 'An error occurred'), { icon: '✗' })
      }
    } finally {
      setDismissingId(null)
    }
  }

  // اختيار المُعالِج المناسب حسب القسم النشط
  const handleSendWhatsApp = (order: any) => isCompletion
    ? handleSendCompletionWhatsApp(order)
    : isDelivery
      ? handleSendDeliveryWhatsApp(order)
      : handleSendSecondProofWhatsApp(order)
  const handleDismiss = (order: any) => isCompletion
    ? handleDismissCompletion(order)
    : isDelivery
      ? handleDismissDelivery(order)
      : handleDismissSecondProof(order)

  const handleViewOrder = (order: any) => { setSelectedOrder(order); setShowViewModal(true) }
  const handleEditOrder = (order: any) => { setSelectedOrder(order); setShowEditModal(true) }
  const handlePrintOrder = (order: any) => { setPrintOrder(order); setShowPrintModal(true) }

  const handleOpenMeasurements = async (order: any) => {
    setIsProcessing(true)
    try {
      const result = await orderService.getById(order.id)
      if (result.error || !result.data) {
        toast.error(isArabic ? 'خطأ في تحميل تفاصيل الطلب' : 'Error loading order')
        return
      }
      setMeasurementsOrder(result.data)
      setShowMeasurementsModal(true)
    } finally {
      setIsProcessing(false)
    }
  }

  const refreshOrderInList = (orderId: string, updated: Partial<Order>) => {
    updateActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } : o))
  }

  // حفظ المقاسات (منطق مطابق لصفحة الطلبات)
  const handleSaveMeasurements = async (measurements: any) => {
    if (!measurementsOrder) return
    try {
      const shouldMark = hasMeasurementsData(measurements) || measurementsOrder.has_measurements === true
      let currentDbMeasurements: Record<string, any> = measurementsOrder.measurements || {}
      try {
        const fresh = await orderService.getMeasurements(measurementsOrder.id)
        if (fresh.data && !fresh.error) currentDbMeasurements = fresh.data
      } catch {}
      const { saved_design_comments: _sdc, image_annotations: _ia, image_drawings: _id, ...cleanExisting } = currentDbMeasurements
      const result = await updateOrder(measurementsOrder.id, {
        measurements: { ...cleanExisting, ...measurements },
        has_measurements: shouldMark,
      })
      if (result.success) {
        refreshOrderInList(measurementsOrder.id, { has_measurements: shouldMark })
        toast.success(isArabic ? 'تم حفظ المقاسات' : 'Measurements saved', { icon: '✓' })
        setShowMeasurementsModal(false)
        setMeasurementsOrder(null)
      } else {
        toast.error(result.error || (isArabic ? 'حدث خطأ' : 'An error occurred'), { icon: '✗' })
      }
    } catch {
      toast.error(isArabic ? 'حدث خطأ أثناء حفظ المقاسات' : 'Error saving measurements', { icon: '✗' })
    }
  }

  // حفظ تعديلات الطلب (منطق مطابق لصفحة الطلبات — snake_case mapping)
  const handleSaveOrder = async (orderId: string, updates: any) => {
    const supabaseUpdates: any = {}
    if (updates.order_number !== undefined) supabaseUpdates.order_number = updates.order_number || null
    else if (updates.orderNumber !== undefined) supabaseUpdates.order_number = updates.orderNumber || null
    if (updates.client_name) supabaseUpdates.client_name = updates.client_name
    else if (updates.clientName) supabaseUpdates.client_name = updates.clientName
    if (updates.client_phone) supabaseUpdates.client_phone = updates.client_phone
    else if (updates.clientPhone) supabaseUpdates.client_phone = updates.clientPhone
    if (updates.description !== undefined) supabaseUpdates.description = updates.description
    if (updates.fabric !== undefined) supabaseUpdates.fabric = updates.fabric
    if (updates.price !== undefined) supabaseUpdates.price = updates.price
    if (updates.fabric_type !== undefined) supabaseUpdates.fabric_type = updates.fabric_type
    if (updates.needs_review !== undefined) supabaseUpdates.needs_review = updates.needs_review
    if (updates.is_pre_booking !== undefined) supabaseUpdates.is_pre_booking = updates.is_pre_booking
    if (updates.has_measurements !== undefined) supabaseUpdates.has_measurements = updates.has_measurements
    if (updates.is_printed !== undefined) supabaseUpdates.is_printed = updates.is_printed
    if (updates.whatsapp_sent !== undefined) supabaseUpdates.whatsapp_sent = updates.whatsapp_sent
    if (updates.paid_amount !== undefined) supabaseUpdates.paid_amount = updates.paid_amount
    if (updates.pre_delivery_cash_amount !== undefined) {
      supabaseUpdates.pre_delivery_cash_amount = updates.pre_delivery_cash_amount
    }
    if (updates.pre_delivery_network_amount !== undefined) {
      supabaseUpdates.pre_delivery_network_amount = updates.pre_delivery_network_amount
    }
    if (updates.payment_method !== undefined) supabaseUpdates.payment_method = updates.payment_method
    else if (updates.paymentMethod !== undefined) supabaseUpdates.payment_method = updates.paymentMethod
    if (updates.status) supabaseUpdates.status = updates.status
    if (updates.worker_id !== undefined) supabaseUpdates.worker_id = updates.worker_id === '' ? null : updates.worker_id
    else if (updates.assignedWorker !== undefined) supabaseUpdates.worker_id = updates.assignedWorker === '' ? null : updates.assignedWorker
    if (updates.order_received_date) supabaseUpdates.order_received_date = updates.order_received_date
    else if (updates.orderReceivedDate) supabaseUpdates.order_received_date = updates.orderReceivedDate
    if (updates.due_date) supabaseUpdates.due_date = updates.due_date
    else if (updates.dueDate) supabaseUpdates.due_date = updates.dueDate
    if (updates.proof_delivery_date !== undefined) supabaseUpdates.proof_delivery_date = updates.proof_delivery_date || null
    if (updates.second_proof_date !== undefined) supabaseUpdates.second_proof_date = updates.second_proof_date || null
    if (updates.has_second_proof !== undefined) supabaseUpdates.has_second_proof = updates.has_second_proof
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes

    if (updates.voice_notes !== undefined) supabaseUpdates.voice_notes = updates.voice_notes
    else if (updates.voiceNotes !== undefined) supabaseUpdates.voice_notes = updates.voiceNotes.map((vn: any) => typeof vn === 'string' ? vn : vn.data)
    if (updates.voice_transcriptions !== undefined) supabaseUpdates.voice_transcriptions = updates.voice_transcriptions
    if (updates.design_summary_notes !== undefined) supabaseUpdates.design_summary_notes = updates.design_summary_notes
    if (updates.images !== undefined) supabaseUpdates.images = updates.images

    const hasDesignDataUpdates =
      updates.saved_design_comments !== undefined || updates.image_annotations !== undefined || updates.image_drawings !== undefined
    const hasMeasurementsUpdates = (typeof updates.custom_design_image === 'string') || updates.measurements !== undefined

    if (hasDesignDataUpdates) {
      if (updates.saved_design_comments !== undefined) supabaseUpdates.design_comments = updates.saved_design_comments
      if (updates.image_annotations !== undefined) supabaseUpdates.image_annotations = updates.image_annotations
      if (updates.image_drawings !== undefined) supabaseUpdates.image_drawings = updates.image_drawings
    }

    if (hasMeasurementsUpdates) {
      let currentMeasurements: any = {}
      try {
        const fullOrderResult = await orderService.getById(orderId)
        if (fullOrderResult.data) {
          const raw = (fullOrderResult.data.measurements as any) || {}
          const { saved_design_comments: _sdc, image_annotations: _ia, image_drawings: _id, design_thumbnail: _dt, ...cleanMeasurements } = raw
          currentMeasurements = cleanMeasurements
        }
      } catch {}
      supabaseUpdates.measurements = {
        ...currentMeasurements,
        ...(updates.measurements || {}),
        ...(typeof updates.custom_design_image === 'string' && { custom_design_image: updates.custom_design_image }),
      }
    }

    const result = await updateOrder(orderId, supabaseUpdates)
    if (result.success) {
      if (result.data) refreshOrderInList(orderId, result.data)
      toast.success(isArabic ? 'تم تحديث الطلب بنجاح' : 'Order updated', { icon: '✓' })
      return true
    } else {
      toast.error(result.error || (isArabic ? 'حدث خطأ أثناء تحديث الطلب' : 'Error updating order'), { icon: '✗' })
      return false
    }
  }

  // عدد الإشعارات الجديدة (لم تُرسَل رسالتها بعد) عبر كل الأقسام
  const secondProofNewCount = secondProofOrders.filter(o => o.second_proof_whatsapp_sent !== true).length
  const completionNewCount = completionOrders.length  // كل إشعارات الاكتمال تُعدّ جديدة (إرسال الواتساب يُخفيها)
  const deliveryNewCount = deliveryOrders.filter(o => o.delivery_whatsapp_sent !== true).length
  const newCount = secondProofNewCount + completionNewCount + deliveryNewCount

  // عدّاد يظهر على زر فلترة كل قسم
  const categoryCount = (key: NotificationCategory) => key === 'completion'
    ? completionOrders.length
    : key === 'delivery'
      ? deliveryOrders.length
      : secondProofOrders.length

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard') || (isArabic ? 'العودة إلى لوحة التحكم' : 'Back to Dashboard')}</span>
          </button>
        </motion.div>

        {/* العنوان */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex items-center gap-3 mb-6">
          <div className="relative p-3 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl shadow-md">
            <Bell className="w-7 h-7 text-white" />
            {newCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">
                {newCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              {isArabic ? 'مركز الإشعارات' : 'Notification Center'}
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              {isArabic ? 'مراجعة الأمور المهمة التي يحددها العمال والنظام' : 'Review important items flagged by workers and the system'}
            </p>
          </div>
        </motion.div>

        {/* الفلاتر */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* فلتر القسم */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> {isArabic ? 'نوع الإشعار' : 'Notification Type'}
              </label>
              <div className="flex flex-wrap gap-2">
                {NOTIFICATION_CATEGORIES.map(cat => {
                  const Icon = cat.icon
                  const active = category === cat.key
                  const count = categoryCount(cat.key)
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setCategory(cat.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        active ? 'bg-pink-50 text-pink-700 border-pink-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {isArabic ? cat.labelAr : cat.labelEn}
                      {count > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-pink-200 text-pink-800' : 'bg-gray-100 text-gray-600'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* فلتر الترتيب */}
            <div className="sm:w-56">
              <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <ArrowDownUp className="w-3.5 h-3.5" /> {isArabic ? 'الترتيب' : 'Sort By'}
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 bg-white"
              >
                <option value="newest">{isArabic ? 'الأحدث أولاً (تاريخ الإشعار)' : 'Newest first (notification date)'}</option>
                <option value="oldest">{isArabic ? 'الأقدم أولاً' : 'Oldest first'}</option>
                <option value="priority">{isArabic ? 'حسب الأولوية' : 'By priority'}</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* القائمة */}
        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
            <Loader className="w-8 h-8 animate-spin text-pink-400" />
            <span>{isArabic ? 'جارٍ تحميل الإشعارات...' : 'Loading notifications...'}</span>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="text-center py-16 bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100">
            <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-600 mb-2">{isArabic ? 'لا توجد إشعارات' : 'No notifications'}</h3>
            <p className="text-gray-500">
              {isCompletion
                ? (isArabic ? 'ستظهر هنا الطلبات التي تُحدَّد كمكتملة' : 'Orders marked as completed will appear here')
                : isDelivery
                  ? (isArabic ? 'ستظهر هنا الطلبات فور تحويلها إلى تم التسليم' : 'Orders will appear here as soon as they are marked delivered')
                  : (isArabic ? 'ستظهر هنا الطلبات التي يبلّغ العمال بجهوزية بروفتها الثانية' : 'Orders flagged by workers as second-proof-ready will appear here')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedOrders.map((order, index) => {
              // إشعار الاكتمال يُخفى عند الإرسال، بينما البروفا والتسليم يبقيان مع علامة صح حتى الإخفاء اليدوي.
              const isSent = isDelivery
                ? order.delivery_whatsapp_sent === true
                : isSecondProof && order.second_proof_whatsapp_sent === true
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(index, 6) * 0.06 }}
                  className={`bg-white rounded-xl border p-5 shadow-sm hover:shadow-lg transition-all ${
                    isSent ? 'border-green-200' : (isCompletion ? 'border-emerald-200' : isDelivery ? 'border-sky-200' : 'border-amber-200')
                  }`}
                >
                  {/* شارة الإشعار + وقت الإنجاز */}
                  <div className="flex items-center justify-between mb-3">
                    {isCompletion ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        <PackageCheck className="w-3.5 h-3.5" />
                        {isArabic ? 'الطلب مكتمل — جاهز للتسليم' : 'Order Completed — Ready'}
                      </div>
                    ) : isDelivery ? (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isSent ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'
                      }`}>
                        <Truck className="w-3.5 h-3.5" />
                        {isArabic ? 'تم تسليم الطلب' : 'Order Delivered'}
                      </div>
                    ) : (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isSent ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <BellRing className="w-3.5 h-3.5" />
                        {isArabic ? 'البروفا الثانية جاهزة' : 'Second Proof Ready'}
                      </div>
                    )}
                    {(order as any).is_urgent === true && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold">
                        <Zap className="w-3 h-3" /> {isArabic ? 'مستعجل' : 'Urgent'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    {/* المعلومات */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleViewOrder(order)}>
                      <h3 className="font-semibold text-gray-900 mb-1 truncate">{order.client_name}</h3>
                      <p className="text-sm text-gray-500 mb-2">
                        <span className="font-medium">{isArabic ? 'رقم الطلب:' : 'Order #'}</span> {order.order_number || order.id}
                      </p>
                      {order.fabric && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 mb-2">{order.fabric}</span>
                      )}
                      <div className="space-y-1 mt-1">
                        <p className="text-sm text-gray-600"><span className="font-medium">{isArabic ? 'الهاتف:' : 'Phone:'}</span> <span dir="ltr">{order.client_phone}</span></p>
                        {isSecondProof && (
                          <p className="text-sm text-yellow-700">
                            <span className="font-semibold">{isArabic ? 'البروفا الثانية:' : 'Second Proof:'}</span>{' '}
                            {formatDate(order.second_proof_date || (order.due_date ? shiftDate(order.due_date, -1) : null))}
                          </p>
                        )}
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">
                            {isDelivery
                              ? (isArabic ? 'موعد التسليم الفعلي:' : 'Delivered on:')
                              : (isArabic ? 'التسليم:' : 'Delivery:')}
                          </span>{' '}
                          {formatDate(isDelivery ? order.delivery_date : order.due_date)}
                        </p>
                        <OrderCutterInfo order={order} />
                        {order.worker_id && getWorkerName(order.worker_id) && (
                          <p className="text-sm text-gray-600"><span className="font-medium">{isArabic ? 'العامل:' : 'Worker:'}</span> {getWorkerName(order.worker_id)}</p>
                        )}
                        <p className="text-xs text-gray-400 flex items-center gap-1 pt-1">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {isCompletion
                            ? `${isArabic ? 'اكتمل:' : 'Completed:'} ${formatDateTime(order.completion_notified_at || order.worker_completed_at)}`
                            : isDelivery
                              ? `${isArabic ? 'تم التسليم:' : 'Delivered:'} ${formatDateTime(order.delivery_notified_at || order.delivery_date)}`
                              : `${isArabic ? 'تم الإبلاغ:' : 'Notified:'} ${formatDateTime(order.second_proof_completed_at)}`}
                        </p>
                      </div>
                    </div>

                    {/* الأزرار — نفس مجموعة أزرار البطاقة العادية + زر الإخفاء */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenMeasurements(order) }}
                        disabled={isProcessing}
                        className="relative flex items-center justify-center p-2.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors border border-gray-200 hover:border-purple-200 disabled:opacity-50"
                        title={hasMeasurementsBadge(order) ? (isArabic ? 'تعديل المقاسات' : 'Edit measurements') : (isArabic ? 'إضافة مقاسات' : 'Add measurements')}
                      >
                        <Ruler className="w-5 h-5" />
                        {hasMeasurementsBadge(order) && <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full fill-white absolute -top-1.5 -right-1.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePrintOrder(order) }}
                        className="relative flex items-center justify-center p-2.5 text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition-colors border border-gray-200 hover:border-pink-200"
                        title={isArabic ? 'طباعة' : 'Print'}
                      >
                        <Printer className="w-5 h-5" />
                        {isOrderPrinted(order) && <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full fill-white absolute -top-1.5 -right-1.5" />}
                      </button>
                      {/* زر الواتساب — رسالة الجاهزية أو البروفا الثانية أو التسليم والتقييم */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSendWhatsApp(order) }}
                        disabled={sendingWhatsAppId === order.id}
                        className="relative flex items-center justify-center p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors border border-gray-200 hover:border-green-200 disabled:opacity-50"
                        title={isCompletion
                          ? (isArabic ? 'إرسال رسالة الجاهزية للاستلام (يُخفي الإشعار)' : 'Send ready-for-pickup message (auto-hides)')
                          : isDelivery
                            ? (isArabic ? 'إرسال رسالة تم التسليم وطلب التقييم' : 'Send delivered and review message')
                            : (isArabic ? 'إرسال رسالة جهوزية البروفا الثانية' : 'Send second-proof-ready message')}
                      >
                        {sendingWhatsAppId === order.id
                          ? <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                          : <MessageCircle className="w-5 h-5" />}
                        {isSent && <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full fill-white absolute -top-1.5 -right-1.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditOrder(order) }}
                        className="flex items-center justify-center p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-gray-200 hover:border-blue-200"
                        title={isArabic ? 'تعديل' : 'Edit'}
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      {/* زر إخفاء الإشعار يدوياً */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDismiss(order) }}
                        disabled={dismissingId === order.id}
                        className="flex items-center justify-center p-2.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 hover:border-gray-300 disabled:opacity-50"
                        title={isArabic ? 'إخفاء الإشعار (تم الانتهاء)' : 'Hide notification (done)'}
                      >
                        {dismissingId === order.id
                          ? <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                          : <EyeOff className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* المودالات */}
      <OrderModal
        onOrderUpdated={updated => {
          refreshOrderInList(updated.id, updated)
          setSelectedOrder(updated)
        }}
        order={selectedOrder}
        workers={workers}
        isOpen={showViewModal}
        onClose={() => { setShowViewModal(false); setSelectedOrder(null) }}
        isProcessing={isProcessing}
      />

      <EditOrderModal
        order={selectedOrder}
        workers={workers}
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedOrder(null) }}
        onSave={handleSaveOrder}
      />

      {measurementsOrder && (
        <MeasurementsModal
          isOpen={showMeasurementsModal}
          onClose={() => { setShowMeasurementsModal(false); setMeasurementsOrder(null) }}
          onSave={handleSaveMeasurements}
          initialMeasurements={measurementsOrder.measurements || {}}
          orderId={measurementsOrder.id}
        />
      )}

      {printOrder && (
        <PrintOrderModal
          isOpen={showPrintModal}
          onClose={() => { setShowPrintModal(false); setPrintOrder(null) }}
          order={printOrder}
          onPrint={async () => {
            try {
              if (printOrder.is_printed !== true) {
                await updateOrder(printOrder.id, { is_printed: true })
                refreshOrderInList(printOrder.id, { is_printed: true })
              }
            } catch (error) {
              console.error('Error marking order as printed:', error)
            }
          }}
        />
      )}
    </div>
  )
}
