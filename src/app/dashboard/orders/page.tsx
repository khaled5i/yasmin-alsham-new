'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import { useWorkerStore } from '@/store/workerStore'
import { useTranslation } from '@/hooks/useTranslation'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { orderService } from '@/lib/services/order-service'
import { formatGregorianDate } from '@/lib/date-utils'
import { useAppResume } from '@/hooks/useAppResume'
import { openWhatsApp, sendReadyForPickupWhatsApp, sendDeliveredWhatsApp } from '@/utils/whatsapp'
import OrderModal from '@/components/OrderModal'
import EditOrderModal from '@/components/EditOrderModal'
import CompletedWorkUpload from '@/components/CompletedWorkUpload'
import DeleteOrderModal from '@/components/DeleteOrderModal'
import MeasurementsModal from '@/components/MeasurementsModal'
import NumericInput from '@/components/NumericInput'
import OrderDateFilterPicker from '@/components/OrderDateFilterPicker'
import {
  ArrowRight,
  Package,
  Search,
  Filter,
  Eye,
  Edit,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  User,
  X,
  Languages,
  Trash2,
  TrendingUp,
  Loader,
  PackageCheck,
  Truck,
  Camera,
  Ruler,
  Printer,
  MessageCircle,
  CalendarDays,
  Wrench,
  RotateCcw
} from 'lucide-react'
import PrintOrderModal from '@/components/PrintOrderModal'
import RemainingPaymentWarningModal from '@/components/RemainingPaymentWarningModal'

const PAGE_SIZE = 50

function OrdersPageInner() {
  const { user, isLoading: authLoading } = useAuthStore()
  const {
    orders,
    loadOrders,
    loadMoreOrders,
    updateOrder,
    deleteOrder,
    startOrderWork,
    completeOrder,
    isLoading: ordersLoading,
    isLoadingMore,
    hasMore,
    totalOrders
  } = useOrderStore()
  const { workers, loadWorkers } = useWorkerStore()
  const { t, language, changeLanguage, isArabic } = useTranslation()
  const { getDashboardRoute, workerType } = useWorkerPermissions()
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // التحقق من الصلاحيات وتحميل البيانات
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push('/login')
      return
    }

    // دائماً نبدأ من الصفحة الأولى عند التحميل الأولي
    setCurrentPage(0)
    loadOrders({
      status: ['pending', 'in_progress', 'cancelled'],
      page: 0,
      pageSize: PAGE_SIZE
    })
    loadWorkers()
  }, [user, authLoading, router, loadOrders, loadWorkers])

  // تحميل المزيد عند تغيير currentPage (يُفعَّل من IntersectionObserver)
  useEffect(() => {
    if (currentPage === 0) return
    loadMoreOrders({
      status: ['pending', 'in_progress', 'cancelled'],
      page: currentPage,
      pageSize: PAGE_SIZE
    })
  }, [currentPage, loadMoreOrders])

  // IntersectionObserver: عند الوصول لآخر العناصر يتم تحميل الدفعة التالية
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !ordersLoading) {
          setCurrentPage(prev => prev + 1)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, ordersLoading])

  // Re-fetch data when the app resumes from background (mobile).
  useAppResume(() => {
    if (!user) return
    console.log('🔄 OrdersPage: re-fetching data after app resume')
    setCurrentPage(0)
    loadOrders({
      status: ['pending', 'in_progress', 'cancelled'],
      page: 0,
      pageSize: PAGE_SIZE
    })
    loadWorkers()
  })

  const searchParams = useSearchParams()

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null) // null = not searching
  const [isSearching, setIsSearching] = useState(false)
  const [dateFilterResults, setDateFilterResults] = useState<any[] | null>(null) // null = no date filter active
  const [isDateFiltering, setIsDateFiltering] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilterType, setDateFilterType] = useState<'received' | 'delivery' | 'proof'>('received')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  // Read URL query params on first render (set from schedule calendar page)
  useEffect(() => {
    const dateParam = searchParams?.get('date')
    const typeParam = searchParams?.get('type')
    if (dateParam) setDateFilter(dateParam)
    if (typeParam === 'delivery') {
      setDateFilterType('delivery')
    } else if (typeParam === 'proof') {
      setDateFilterType('proof')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Server-side search: when debouncedSearch changes, fetch from server
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults(null)
      return
    }
    let cancelled = false
    setIsSearching(true)
    orderService.getAll({ search: debouncedSearch, noPagination: true }).then(({ data }) => {
      if (!cancelled) {
        setSearchResults(data || [])
        setIsSearching(false)
      }
    }).catch(() => {
      if (!cancelled) setIsSearching(false)
    })
    return () => { cancelled = true }
  }, [debouncedSearch])

  // Server-side date filter: when dateFilter or dateFilterType changes, fetch all matching orders
  useEffect(() => {
    if (!dateFilter) {
      setDateFilterResults(null)
      return
    }
    let cancelled = false
    setIsDateFiltering(true)
    orderService.getAll({
      dateFilter,
      dateFilterType,
      status: ['pending', 'in_progress', 'cancelled'],
      noPagination: true,
    }).then(({ data }) => {
      if (!cancelled) {
        setDateFilterResults(data || [])
        setIsDateFiltering(false)
      }
    }).catch(() => {
      if (!cancelled) setIsDateFiltering(false)
    })
    return () => { cancelled = true }
  }, [dateFilter, dateFilterType])

  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completedImages, setCompletedImages] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // حالات modal حذف الطلب
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)

  // حالات modal المقاسات
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false)
  const [measurementsOrder, setMeasurementsOrder] = useState<any>(null)


  // حالات modal الطباعة
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printOrder, setPrintOrder] = useState<any>(null)
  const [measurementsSaveSuccess, setMeasurementsSaveSuccess] = useState(false)
  const [measurementsSaveError, setMeasurementsSaveError] = useState<string | null>(null)

  // حالات خاصة بالطلبات المكتملة (عند ظهورها في نتائج البحث)
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null)
  const [statusChangeOrderId, setStatusChangeOrderId] = useState<string | null>(null)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [showPaymentWarning, setShowPaymentWarning] = useState(false)
  const [orderToDeliver, setOrderToDeliver] = useState<any>(null)

  // إغلاق قائمة تغيير الحالة عند النقر خارجها
  useEffect(() => {
    if (!statusChangeOrderId) return
    const handleClickOutside = () => setStatusChangeOrderId(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [statusChangeOrderId])

  // تتبع إرسال واتساب لكل طلب (محفوظ في localStorage)
  const [whatsappSentOrders, setWhatsappSentOrders] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('whatsapp-sent-orders-v1')
      return stored ? new Set(JSON.parse(stored)) : new Set<string>()
    } catch { return new Set<string>() }
  })

  const NON_MEASUREMENT_KEYS = new Set([
    // بيانات التصميم التي لا تُحسب كمقاسات
    // migration 30: image_annotations/image_drawings/saved_design_comments نُقلت لأعمدة مستقلة
    // لكن نُبقيها هنا للتوافق مع البيانات القديمة التي ربما لم تُنظَّف بعد
    'saved_design_comments',
    'image_annotations',
    'image_drawings',
    'custom_design_image',
    'ai_generated_images',
    // أعلام نُقلت لأعمدة مستقلة (migration 29)
    'is_printed',
    'has_measurements',
    'whatsapp_sent',
    'fabric_type'
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
    return Object.entries(measurements).some(([key, value]) => (
      !NON_MEASUREMENT_KEYS.has(key) && hasMeaningfulValue(value)
    ))
  }

  // الأعلام الآن أعمدة boolean حقيقية في DB (migration 29)
  const hasMeasurementsBadge = (order: any) => {
    if (order?.has_measurements === true) return true
    return hasMeasurementsData(order?.measurements)
  }

  const isOrderPrinted = (order: any) => order?.is_printed === true

  const isWhatsAppSent = (order: any) => {
    if (order?.whatsapp_sent === true) return true
    return whatsappSentOrders.has(order?.id)
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: { label: t('pending') || (isArabic ? 'قيد الانتظار' : 'Pending'), color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
      in_progress: { label: t('in_progress') || (isArabic ? 'جاري التنفيذ' : 'In Progress'), color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Package },
      completed: { label: t('completed') || (isArabic ? 'مكتمل' : 'Completed'), color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
      delivered: { label: t('delivered') || (isArabic ? 'تم التسليم' : 'Delivered'), color: 'text-purple-600', bgColor: 'bg-purple-100', icon: CheckCircle },
      cancelled: { label: t('cancelled') || (isArabic ? 'ملغي' : 'Cancelled'), color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  // الحصول على اسم العامل
  const getWorkerName = (workerId?: string) => {
    if (!workerId) return null
    const worker = workers.find(w => w.id === workerId)
    return worker?.user?.full_name || null
  }

  // فتح نافذة العرض
  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowViewModal(true)
  }

  // فتح نافذة التعديل
  const handleEditOrder = (order: any) => {
    setSelectedOrder(order)
    setShowEditModal(true)
  }

  // حفظ التعديلات
  const handleSaveOrder = async (orderId: string, updates: any) => {
    console.log('💾 Saving order updates:', orderId, updates)

    // تحويل البيانات إلى صيغة Supabase
    // ملاحظة: EditOrderModal يُرسل البيانات بصيغة snake_case مباشرة
    const supabaseUpdates: any = {}

    // المعلومات الأساسية - دعم كلا الصيغتين (snake_case و camelCase)
    if (updates.order_number !== undefined) supabaseUpdates.order_number = updates.order_number || null
    else if (updates.orderNumber !== undefined) supabaseUpdates.order_number = updates.orderNumber || null

    if (updates.client_name) supabaseUpdates.client_name = updates.client_name
    else if (updates.clientName) supabaseUpdates.client_name = updates.clientName

    if (updates.client_phone) supabaseUpdates.client_phone = updates.client_phone
    else if (updates.clientPhone) supabaseUpdates.client_phone = updates.clientPhone

    if (updates.description !== undefined) supabaseUpdates.description = updates.description
    if (updates.fabric !== undefined) supabaseUpdates.fabric = updates.fabric
    if (updates.price !== undefined) supabaseUpdates.price = updates.price

    // أعمدة مستقلة (migration 29)
    if (updates.fabric_type !== undefined) supabaseUpdates.fabric_type = updates.fabric_type
    if (updates.needs_review !== undefined) supabaseUpdates.needs_review = updates.needs_review
    if (updates.is_pre_booking !== undefined) supabaseUpdates.is_pre_booking = updates.is_pre_booking
    if (updates.has_measurements !== undefined) supabaseUpdates.has_measurements = updates.has_measurements
    if (updates.is_printed !== undefined) supabaseUpdates.is_printed = updates.is_printed
    if (updates.whatsapp_sent !== undefined) supabaseUpdates.whatsapp_sent = updates.whatsapp_sent
    if (updates.paid_amount !== undefined) supabaseUpdates.paid_amount = updates.paid_amount

    if (updates.payment_method !== undefined) supabaseUpdates.payment_method = updates.payment_method
    else if (updates.paymentMethod !== undefined) supabaseUpdates.payment_method = updates.paymentMethod

    // ملاحظة: payment_status سيتم حسابه تلقائياً بواسطة trigger في قاعدة البيانات
    if (updates.status) supabaseUpdates.status = updates.status

    // تحويل string فارغ إلى null لحقول UUID
    if (updates.worker_id !== undefined) {
      supabaseUpdates.worker_id = updates.worker_id === '' ? null : updates.worker_id
    } else if (updates.assignedWorker !== undefined) {
      supabaseUpdates.worker_id = updates.assignedWorker === '' ? null : updates.assignedWorker
    }

    if (updates.order_received_date) supabaseUpdates.order_received_date = updates.order_received_date
    else if (updates.orderReceivedDate) supabaseUpdates.order_received_date = updates.orderReceivedDate

    if (updates.due_date) supabaseUpdates.due_date = updates.due_date
    else if (updates.dueDate) supabaseUpdates.due_date = updates.dueDate

    if (updates.proof_delivery_date !== undefined) {
      supabaseUpdates.proof_delivery_date = updates.proof_delivery_date || null
    }

    // الملاحظات الإضافية
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes

    // الملاحظات الصوتية
    if (updates.voice_notes !== undefined) {
      supabaseUpdates.voice_notes = updates.voice_notes
    } else if (updates.voiceNotes !== undefined) {
      supabaseUpdates.voice_notes = updates.voiceNotes.map((vn: any) => typeof vn === 'string' ? vn : vn.data)
    }

    if (updates.voice_transcriptions !== undefined) {
      supabaseUpdates.voice_transcriptions = updates.voice_transcriptions
    }

    // الصور
    if (updates.images !== undefined) supabaseUpdates.images = updates.images

    // تعليقات التصميم - migration 30: تُكتب لأعمدة JSONB مستقلة (ليس داخل measurements)
    const hasDesignDataUpdates =
      updates.saved_design_comments !== undefined ||
      updates.image_annotations !== undefined ||
      updates.image_drawings !== undefined

    // custom_design_image: null يعني "لم يُرفع صورة جديدة" وليس "احذف الصورة"
    // لذلك نعتبرها تحديثاً للـ measurements فقط إذا كانت قيمة حقيقية (string)
    const hasMeasurementsUpdates =
      (typeof updates.custom_design_image === 'string') ||
      updates.measurements !== undefined

    // كتابة بيانات التصميم كأعمدة مستقلة مباشرة (migration 30)
    if (hasDesignDataUpdates) {
      if (updates.saved_design_comments !== undefined) {
        supabaseUpdates.design_comments = updates.saved_design_comments.map((comment: any) => ({
          ...comment,
          image: typeof comment.image === 'string' && comment.image.startsWith('data:')
            ? 'custom'
            : (comment.image || null)
        }))
      }
      if (updates.image_annotations !== undefined) {
        supabaseUpdates.image_annotations = updates.image_annotations
      }
      if (updates.image_drawings !== undefined) {
        supabaseUpdates.image_drawings = updates.image_drawings
      }
    }

    // تحديث measurements فقط إذا تغيرت custom_design_image أو المقاسات الفعلية
    // استخراج design_thumbnail من أول تعليق تصميم — يُحفظ في عموده المستقل (migration 32)
    if (updates.saved_design_comments !== undefined && updates.saved_design_comments.length > 0) {
      const frontComment = updates.saved_design_comments.find(
        (c: any) => c.view === 'front' || c.title?.startsWith('أمام')
      ) || updates.saved_design_comments[0]
      if (frontComment?.compositeImage) {
        try {
          supabaseUpdates.design_thumbnail = await new Promise<string>((resolve) => {
            const img = new Image()
            img.onload = () => {
              const TARGET_HEIGHT = 320
              const ratio = TARGET_HEIGHT / img.height
              const canvas = document.createElement('canvas')
              canvas.width = Math.round(img.width * ratio)
              canvas.height = TARGET_HEIGHT
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL('image/jpeg', 0.55))
              } else {
                resolve(frontComment.compositeImage)
              }
            }
            img.onerror = () => resolve(frontComment.compositeImage)
            img.src = frontComment.compositeImage
          })
        } catch {
          supabaseUpdates.design_thumbnail = frontComment.compositeImage
        }
      }
    }

    // تحديث measurements فقط إذا كان هناك تغيير في custom_design_image أو المقاسات
    if (hasMeasurementsUpdates) {
      // جلب measurements الحالية من DB (القائمة تستخدم التحميل الخفيف بدون measurements)
      let currentMeasurements: any = {}
      try {
        const fullOrderResult = await orderService.getById(orderId)
        if (fullOrderResult.data) {
          const raw = (fullOrderResult.data.measurements as any) || {}
          // نحذف الحقول المنقولة (migration 30/32) لمنع إعادتها لـ measurements
          const { saved_design_comments: _sdc, image_annotations: _ia, image_drawings: _id, design_thumbnail: _dt, ...cleanMeasurements } = raw
          currentMeasurements = cleanMeasurements
        }
      } catch (err) {
        console.error('⚠️ Failed to fetch full order for measurements merge:', err)
      }

      supabaseUpdates.measurements = {
        ...currentMeasurements,
        ...(updates.measurements || {}),
        // لا نُدرج custom_design_image إذا كانت null (لا نمحو الصورة الموجودة)
        ...(typeof updates.custom_design_image === 'string' && { custom_design_image: updates.custom_design_image }),
      }
    }

    console.log('📤 Sending to Supabase:', JSON.stringify(supabaseUpdates, null, 2))

    const result = await updateOrder(orderId, supabaseUpdates)

    console.log('📥 Result from updateOrder:', result)

    if (result.success) {
      toast.success(t('order_updated_success') || 'تم تحديث الطلب بنجاح', {
        icon: '✓',
      })
    } else {
      toast.error(result.error || t('order_update_error') || 'حدث خطأ أثناء تحديث الطلب', {
        icon: '✗',
      })
    }

    setShowEditModal(false)
    setSelectedOrder(null)
  }

  // إغلاق النوافذ
  const handleCloseModals = () => {
    setShowViewModal(false)
    setShowEditModal(false)
    setShowCompleteModal(false)
    setSelectedOrder(null)
    setCompletedImages([])
  }

  // فتح modal حذف الطلب
  const handleDeleteOrder = (order: any) => {
    setOrderToDelete(order)
    setDeleteModalOpen(true)
  }

  // تأكيد حذف الطلب
  const confirmDeleteOrder = async () => {
    if (orderToDelete) {
      console.log('🗑️ Deleting order:', orderToDelete.id)
      const result = await deleteOrder(orderToDelete.id)

      if (result.success) {
        toast.success(t('order_deleted_success') || 'تم حذف الطلب بنجاح', {
          icon: '✓',
        })
      } else {
        toast.error(result.error || t('order_delete_error') || 'حدث خطأ أثناء حذف الطلب', {
          icon: '✗',
        })
      }

      setDeleteModalOpen(false)
      setOrderToDelete(null)
    }
  }

  // إغلاق modal حذف الطلب
  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setOrderToDelete(null)
  }

  // فتح modal المقاسات
  const handleOpenMeasurements = async (order: any) => {
    // يجب تحميل تفاصيل الطلب الكاملة أولاً لأن القائمة تحمل بيانات "خفيفة" فقط
    // وهذا ضروري لضمان وجود حقل measurements بكامل محتوياته (بما في ذلك التعليقات)
    setIsProcessing(true)
    try {
      // استخدام loadOrderById من المتجر للحصول على أحدث البيانات الكاملة
      // ولكننا نحتاج إلى التعامل مع النتيجة مباشرة هنا
      // لذلك سنستخدم orderService مباشرة أو نعتمد على أن loadOrderById يضع النتيجة في currentOrder
      // الأفضل هنا هو طلب البيانات مباشرة لضمان عدم التداخل مع currentOrder المستخدم في مكان آخر

      /* 
         ملاحظة: يمكننا استخدام loadOrderById من الـ store، لكنها ستغير state.currentOrder
         وهذا قد يؤثر على أشياء أخرى إذا كانت مفتوحة.
         لذلك سنستخدم orderService مباشرة هنا للحصول على البيانات وتمريرها للمودال.
      */
      const { orderService } = await import('@/lib/services/order-service')
      const result = await orderService.getById(order.id)

      if (result.error || !result.data) {
        toast.error(t('error_loading_order') || 'خطأ في تحميل تفاصيل الطلب')
        return
      }

      setMeasurementsOrder(result.data)
      setShowMeasurementsModal(true)
    } catch (error) {
      console.error('Error fetching full order details:', error)
      toast.error(t('error_loading_order') || 'خطأ في تحميل تفاصيل الطلب')
    } finally {
      setIsProcessing(false)
    }
  }

  // فتح modal الطباعة
  const handlePrintOrder = (order: any) => {
    setPrintOrder(order)
    setShowPrintModal(true)
  }

  // حفظ المقاسات
  const handleSaveMeasurements = async (measurements: any) => {
    if (!measurementsOrder) return

    try {
      const shouldMarkHasMeasurements = hasMeasurementsData(measurements) || measurementsOrder.has_measurements === true

      // جلب أحدث نسخة من measurements من DB لضمان عدم فقدان أي بيانات
      // (custom_design_image, design_thumbnail, ai_generated_images, إلخ)
      let currentDbMeasurements: Record<string, any> = measurementsOrder.measurements || {}
      try {
        const { orderService: svc } = await import('@/lib/services/order-service')
        const freshResult = await svc.getMeasurements(measurementsOrder.id)
        if (freshResult.data && !freshResult.error) {
          currentDbMeasurements = freshResult.data
        }
      } catch {
        // fallback إلى بيانات measurementsOrder المحفوظة
      }

      // إزالة الحقول المنقولة لـ migration 30 لمنع إعادتها لعمود measurements
      const { saved_design_comments: _sdc, image_annotations: _ia, image_drawings: _id, ...cleanExisting } = currentDbMeasurements

      // دمج المقاسات الجديدة مع الحقول المحفوظة — المقاسات الجديدة تتفوق على القديمة
      const updatedMeasurements = {
        ...cleanExisting,
        ...measurements,
      }

      const result = await updateOrder(measurementsOrder.id, {
        measurements: updatedMeasurements,
        has_measurements: shouldMarkHasMeasurements
      })

      if (result.success) {
        setMeasurementsSaveSuccess(true)
        setTimeout(() => setMeasurementsSaveSuccess(false), 1200)
        setShowMeasurementsModal(false)
        setMeasurementsOrder(null)
      } else {
        setMeasurementsSaveError(result.error || t('measurements_save_error') || 'حدث خطأ أثناء حفظ المقاسات')
      }
    } catch (error) {
      console.error('Error saving measurements:', error)
      setMeasurementsSaveError(t('measurements_save_error') || 'حدث خطأ أثناء حفظ المقاسات')
    }
  }

  // بدء العمل في الطلب (للعمال)
  const handleStartWork = async (orderId: string) => {
    if (!user || user.role !== 'worker') return

    setIsProcessing(true)
    try {
      console.log('▶️ Starting work on order:', orderId)
      const result = await startOrderWork(orderId)

      if (result.success) {
        toast.success(t('work_started_success') || 'تم بدء العمل على الطلب', {
          icon: '✓',
        })
      } else {
        toast.error(result.error || t('work_start_error') || 'حدث خطأ أثناء بدء العمل', {
          icon: '✗',
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeliverOrder = async (orderId: string) => {
    setIsProcessing(true)
    try {
      const today = new Date()
      const deliveryDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const result = await updateOrder(orderId, { status: 'delivered', delivery_date: deliveryDate })
      if (result.success) {
        toast.success(isArabic ? 'تم تسليم الطلب' : 'Order delivered', { icon: '✓' })
      } else {
        toast.error(result.error || (isArabic ? 'حدث خطأ' : 'An error occurred'), { icon: '✗' })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // تسليم الطلب مع التحقق من الدفعة المتبقية (للطلبات المكتملة في نتائج البحث)
  const handleMarkAsDeliveredWithCheck = async (order: any) => {
    const remainingAmount = order.remaining_amount || 0
    if (remainingAmount > 0) {
      setOrderToDeliver(order)
      setShowPaymentWarning(true)
      return
    }
    await handleDeliverOrder(order.id)
  }

  const deliverOrderWithPaidStatus = async (orderId: string, markAsPaid: boolean) => {
    setIsProcessing(true)
    try {
      const order = orderToDeliver
      const updates: any = { status: 'delivered', delivery_date: new Date().toISOString() }
      if (markAsPaid && order) {
        updates.paid_amount = order.price
        updates.payment_status = 'paid'
      }
      const result = await updateOrder(orderId, updates)
      if (result.success) {
        setShowPaymentWarning(false)
        setOrderToDeliver(null)
        if (order && order.client_phone) {
          sendDeliveredWhatsApp(order.client_name, order.client_phone)
        }
      } else {
        toast.error(result.error || 'حدث خطأ', { icon: '✗' })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // تأكيد مراجعة الطلب المكتمل وإرسال رسالة "جاهز للاستلام" (للطلبات المكتملة في نتائج البحث)
  const handleSendReadyForPickup = async (order: any) => {
    if (!order.client_phone || order.client_phone.trim() === '') {
      toast.error('لا يوجد رقم هاتف للعميل', { icon: '⚠️' })
      return
    }
    setConfirmingOrderId(order.id)
    try {
      const result = await updateOrder(order.id, { admin_confirmed: true } as any)
      if (!result.success) {
        toast.error('حدث خطأ أثناء تأكيد المراجعة', { icon: '⚠️' })
        return
      }
      sendReadyForPickupWhatsApp(order.client_name, order.client_phone)
      toast.success('تم تأكيد المراجعة وفتح واتساب لإرسال رسالة الاستلام', { icon: '✅', duration: 3000 })
    } catch {
      toast.error('حدث خطأ أثناء تأكيد المراجعة', { icon: '⚠️' })
    } finally {
      setConfirmingOrderId(null)
    }
  }

  // إرسال رسالة شكر للعميل بعد التسليم (للطلبات المستلمة في نتائج البحث)
  const handleSendThankYouMessage = (order: any) => {
    if (!order.client_phone) {
      toast.error('لا يوجد رقم هاتف للعميل', { icon: '⚠️' })
      return
    }
    const message = `مرحباً ${order.client_name}\n\nلقد تم تسليم فستانك بنجاح!\n\nنأمل أن ينال إعجابك.\n\nيمكنك ترك تعليق لطيف لنا عبر الرابط التالي:\nhttps://maps.app.goo.gl/oor8FHoTwaGS8GMb9\n\nننتظر زيارتكم مرة أخرى\n\nياسمين الشام للأزياء`
    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/${order.client_phone}?text=${encodedMessage}`, '_blank')
  }

  // إعادة الطلب المكتمل لحالة سابقة (للطلبات المكتملة في نتائج البحث)
  const handleRevertStatusInSearch = async (orderId: string, newStatus: 'pending' | 'in_progress') => {
    setIsChangingStatus(true)
    try {
      const result = await updateOrder(orderId, { status: newStatus })
      if (result.success) {
        const statusLabel = newStatus === 'pending' ? 'في الانتظار' : 'قيد التنفيذ'
        toast.success(`تم تغيير حالة الطلب إلى "${statusLabel}" بنجاح`, { icon: '✓' })
        setStatusChangeOrderId(null)
      } else {
        toast.error('حدث خطأ أثناء تغيير حالة الطلب', { icon: '✗' })
      }
    } finally {
      setIsChangingStatus(false)
    }
  }

  // إرسال رسالة واتساب من بطاقة الطلب بدون حفظ
  const handleSendWhatsAppOnly = (order: any) => {
    if (!order?.client_phone || order.client_phone.trim() === '') {
      toast.error(isArabic ? 'لا يوجد رقم هاتف للزبونة' : 'Client phone number is missing', {
        icon: '⚠️',
      })
      return
    }

    if (!order?.due_date) {
      toast.error(isArabic ? 'لا يوجد موعد تسليم لهذا الطلب' : 'Due date is missing for this order', {
        icon: '⚠️',
      })
      return
    }

    try {
      const totalPrice = Number(order.price) || 0
      const paidAmount = Number(order.paid_amount) || 0

      openWhatsApp({
        clientName: order.client_name || '',
        clientPhone: order.client_phone,
        orderNumber: order.order_number || undefined,
        proofDeliveryDate: order.proof_delivery_date || undefined,
        dueDate: order.due_date,
        totalPrice,
        paidAmount,
        remainingAmount: Math.max(0, totalPrice - paidAmount)
      })

      // حفظ حالة الإرسال في localStorage وقاعدة البيانات
      setWhatsappSentOrders(prev => {
        const updated = new Set(prev)
        updated.add(order.id)
        try { localStorage.setItem('whatsapp-sent-orders-v1', JSON.stringify([...updated])) } catch {}
        return updated
      })
      // حفظ في قاعدة البيانات للتزامن بين الأجهزة (عمود مستقل - migration 29)
      if (order.whatsapp_sent !== true) {
        updateOrder(order.id, { whatsapp_sent: true }).catch(() => {})
      }

      toast.success(isArabic ? 'تم فتح واتساب لإرسال رسالة التأكيد' : 'WhatsApp opened with confirmation message', {
        icon: '📱',
        duration: 3000
      })
    } catch (error) {
      console.error('❌ Error opening WhatsApp:', error)
      toast.error(isArabic ? 'حدث خطأ أثناء فتح واتساب' : 'Failed to open WhatsApp', {
        icon: '⚠️',
      })
    }
  }

  // فتح نافذة إنهاء الطلب
  const handleOpenCompleteModal = (order: any) => {
    setSelectedOrder(order)
    setShowCompleteModal(true)
  }

  // إنهاء الطلب (للعمال)
  const handleCompleteWork = async () => {
    if (!selectedOrder || !user || user.role !== 'worker') return

    setIsProcessing(true)
    try {
      console.log('✅ Completing order:', selectedOrder.id)
      const result = await completeOrder(selectedOrder.id, completedImages)

      if (result.success) {
        toast.success(t('order_completed_success') || 'تم إنهاء العمل على الطلب بنجاح', {
          icon: '✓',
        })
        setShowCompleteModal(false)
        setSelectedOrder(null)
        setCompletedImages([])
      } else {
        toast.error(result.error || t('order_complete_error') || 'حدث خطأ أثناء إنهاء العمل', {
          icon: '✗',
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    const day = d.getDate()
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

  // الحصول على معرف العامل الحالي
  const getCurrentWorkerId = () => {
    if (user?.role !== 'worker') return null
    const currentWorker = workers.find(w => w.user_id === user.id)
    return currentWorker?.id || null
  }

  const currentWorkerId = getCurrentWorkerId()

  // Priority: text search > date filter > paginated store orders
  const baseOrders = searchResults !== null
    ? searchResults
    : dateFilterResults !== null
      ? dateFilterResults
      : orders

  const isNeedsReview = (order: any) => order?.needs_review === true

  const isPreBooking = (order: any) => order?.is_pre_booking === true

  const filteredOrders = baseOrders.filter(order => {
    // فلترة حسب الدور
    let matchesRole = user?.role === 'admin' || workerType === 'workshop_manager'

    if (!matchesRole && user?.role === 'worker') {
      const currentWorker = workers.find(w => w.user_id === user.id)
      if (currentWorker) {
        matchesRole = order.worker_id === currentWorker.id
      }
    }

    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'needs_review'
        ? isNeedsReview(order)
        : statusFilter === 'pre_booking'
          ? isPreBooking(order)
          : order.status === statusFilter

    // Date filter is server-side when dateFilterResults is active; apply client-side only for text search results
    const matchesDate = !dateFilter || searchResults === null || (() => {
      const selectedOrderDate = dateFilterType === 'received'
        ? (order.order_received_date || order.created_at)
        : dateFilterType === 'proof'
          ? order.proof_delivery_date
          : order.due_date
      return Boolean(selectedOrderDate?.startsWith(dateFilter))
    })()

    return matchesRole && matchesStatus && matchesDate
  })

  // عرض شاشة التحميل أثناء التحقق من المصادقة
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{authLoading ? 'جاري التحقق من الجلسة...' : t('loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <button
            onClick={() => router.push(getDashboardRoute())}
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard')}</span>
          </button>
        </motion.div>

        {/* العنوان والأزرار */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                {t('orders')}
              </span>
            </h1>
            <p className="text-lg text-gray-600">
              {t('view_manage_orders')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user.role === 'admin' && (
              <Link
                href="/dashboard/add-order"
                className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse px-6 py-3 group"
              >
                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span>{t('add_new_order')}</span>
              </Link>
            )}
          </div>
        </motion.div>

        {/* البحث والفلاتر - تصميم محسّن */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6"
        >
          {/* صف واحد: حقل البحث والفلاتر - عرض أفقي حتى في الجوال */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 overflow-x-auto">
            {/* حقل البحث الشامل */}
            <div className="relative min-w-0">
              {isSearching
                ? <Loader className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-pink-400 animate-spin" />
                : <Search className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
              }
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-7 sm:pr-10 pl-2 sm:pl-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all"
                placeholder={isArabic ? 'بحث...' : 'Search...'}
              />
            </div>

            {/* فلتر الحالة */}
            <div className="relative min-w-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all appearance-none bg-white"
              >
                <option value="all">{t('all_orders')}</option>
                <option value="pending">{t('pending')}</option>
                <option value="in_progress">{t('in_progress')}</option>
                <option value="needs_review">{isArabic ? 'يحتاج مراجعة' : 'Needs Review'}</option>
                <option value="pre_booking">{isArabic ? 'حجز مسبق' : 'Pre-booking'}</option>
              </select>
              <Filter className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* فلتر التاريخ */}
            <div className="min-w-0 relative">
              {isDateFiltering && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <Loader className="w-3 h-3 sm:w-4 sm:h-4 text-pink-400 animate-spin" />
                </div>
              )}
              <OrderDateFilterPicker
                selectedDate={dateFilter}
                onDateChange={setDateFilter}
                filterType={dateFilterType}
                onFilterTypeChange={setDateFilterType}
                orders={orders}
              />
            </div>
          </div>
        </motion.div>

        {/* قائمة الطلبات */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className={filteredOrders.length === 0 ? "space-y-6" : user.role === 'worker' ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}
        >
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-600 mb-2">
                {user.role === 'worker' ? t('no_orders_assigned') : t('no_orders_found')}
              </h3>
              <p className="text-gray-500">
                {user.role === 'worker'
                  ? t('no_orders_assigned_desc')
                  : t('no_orders_found_desc')
                }
              </p>
            </div>
          ) : (
            filteredOrders.map((order, index) => {
              const statusInfo = getStatusInfo(order.status)
              const StatusIcon = statusInfo.icon

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: Math.min(index, 5) * 0.1 }}
                  className={`bg-white rounded-2xl border border-gray-200 hover:shadow-lg transition-all ${user.role === 'worker' ? 'p-5 shadow-md' : 'p-6 shadow-sm rounded-xl'}`}
                >
                  {user.role === 'worker' ? (
                    /* ========= بطاقة العامل ========= */
                    <>
                      {/* صورة الأمام + المعلومات جنباً لجنب */}
                      <div className="flex gap-5 mb-4 cursor-pointer" onClick={() => handleViewOrder(order)}>
                        {/* صورة الأمام من تعليقات التصميم */}
                        <div className="flex-shrink-0 w-40">
                          <img
                            src={(order as any).design_thumbnail || '/front2.png'}
                            alt="صورة التصميم"
                            className="w-full rounded-xl border border-pink-100 object-contain shadow-sm"
                          />
                        </div>

                        {/* المعلومات */}
                        <div className="flex-1 min-w-0">
                          {/* الحالة والشارات */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${statusInfo.bgColor}`}>
                              <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                              <span className={`text-sm font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                            </div>
                            {isNeedsReview(order) && (
                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100">
                                <AlertCircle className="w-4 h-4 text-orange-600" />
                                <span className="text-sm font-semibold text-orange-600">{isArabic ? 'مراجعة' : 'Review'}</span>
                              </div>
                            )}
                            {isPreBooking(order) && (
                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100">
                                <PackageCheck className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-semibold text-blue-600">{isArabic ? 'حجز مسبق' : 'Pre-booking'}</span>
                              </div>
                            )}
                          </div>

                          <h3 className="font-bold text-gray-900 text-lg mb-1 truncate">{order.client_name}</h3>
                          <p className="text-sm text-gray-500 mb-2">
                            <span className="font-medium">{t('order_number') || 'رقم الطلب:'}</span> {order.order_number || order.id}
                          </p>
                          {order.fabric && (
                            <span className="inline-block px-3 py-1 rounded-lg text-sm bg-gray-100 text-gray-700 mb-2 font-medium">{order.fabric}</span>
                          )}
                          {order.description && (
                            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{order.description}</p>
                          )}
                          <div className="space-y-1 text-sm text-gray-700">
                            {order.client_phone && (
                              <p><span className="font-semibold">{isArabic ? 'الهاتف:' : 'Phone:'}</span> <span dir="ltr">{order.client_phone}</span></p>
                            )}
                            <p><span className="font-semibold">{isArabic ? 'التسليم:' : 'Delivery:'}</span> {formatDate(order.due_date)}</p>
                          </div>
                        </div>
                      </div>

                      {/* أزرار العمل في الأسفل */}
                      {currentWorkerId && order.worker_id === currentWorkerId && (
                        <div className="pt-4 border-t border-gray-100">
                          {order.status === 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStartWork(order.id) }}
                              disabled={isProcessing}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                              {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Package className="w-5 h-5" />}
                              <span>{t('start_work') || 'بدء العمل'}</span>
                            </button>
                          )}
                          {order.status === 'in_progress' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenCompleteModal(order) }}
                              disabled={isProcessing}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-green-600 hover:bg-green-700 text-white text-base font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                              {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckCircle className="w-5 h-5" />}
                              <span>{t('complete_order') || 'إنهاء الطلب'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* ========= بطاقة المدير / مدير الورشة ========= */
                    <div className="flex items-start justify-between mb-2">
                      {/* Left Side: Info & Details */}
                      <div className="flex-1 cursor-pointer" onClick={() => handleViewOrder(order)}>
                        {/* Basic Info */}
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {order.client_name}
                        </h3>
                        <p className="text-sm text-gray-500 mb-2">
                          <span className="font-medium">{t('order_number') || (isArabic ? 'رقم الطلب:' : 'Order #')}</span> {order.order_number || order.id}
                        </p>

                        {/* شارة موعد البروفا - لمدير الورشة فقط */}
                        {workerType === 'workshop_manager' && order.proof_delivery_date && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-lg bg-violet-50 border border-violet-200 w-fit">
                            <CalendarDays className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
                            <span className="text-xs font-semibold text-violet-700">
                              {isArabic ? 'البروفا:' : 'Proof:'}{' '}{formatDate(order.proof_delivery_date)}
                            </span>
                          </div>
                        )}

                        {/* Fabric Label */}
                        {order.fabric && (
                          <div className="mb-3">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                              {order.fabric}
                            </span>
                          </div>
                        )}

                        {/* Details */}
                        <div className="space-y-2">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">{t('phone') || (isArabic ? 'الهاتف:' : 'Phone:')}</span> <span dir="ltr">{order.client_phone}</span>
                          </p>
                          {order.description && (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              <span className="font-medium">{t('description') || (isArabic ? 'الوصف:' : 'Description:')}</span> {order.description}
                            </p>
                          )}
                          <div className="flex flex-col gap-1">
                            {order.proof_delivery_date && (
                              <p className="text-sm text-gray-700">
                                <span className="font-semibold">{isArabic ? 'البروفا:' : 'Proof:'}</span>{' '}
                                {formatDate(order.proof_delivery_date)}
                              </p>
                            )}
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold">{isArabic ? 'التسليم:' : 'Delivery:'}</span>{' '}
                              {formatDate(order.due_date)}
                            </p>
                          </div>
                          {order.worker_id && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">{t('worker') || (isArabic ? 'العامل:' : 'Worker:')}</span>{' '}
                              {getWorkerName(order.worker_id)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Status & Buttons */}
                      <div className="flex flex-col items-end gap-3 ml-4">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusInfo.bgColor}`}>
                          <StatusIcon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                          <span className={`text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        {isNeedsReview(order) && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100">
                            <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                            <span className="text-xs font-medium text-orange-600">
                              {isArabic ? 'يحتاج مراجعة' : 'Needs Review'}
                            </span>
                          </div>
                        )}
                        {isPreBooking(order) && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100">
                            <PackageCheck className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-600">
                              {isArabic ? 'حجز مسبق' : 'Pre-booking'}
                            </span>
                          </div>
                        )}

                        {/* Admin Action Buttons */}
                        {user.role === 'admin' && (
                          <>
                            {order.status === 'completed' ? (
                              /* أزرار الطلبات المكتملة - مطابقة لصفحة الطلبات المكتملة */
                              <div className="flex flex-col gap-2 mt-1">
                                <Link
                                  href={`/dashboard/alterations/add?orderId=${order.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-100"
                                  title="طلب تعديل"
                                >
                                  <Wrench className="w-4 h-4" />
                                </Link>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSendReadyForPickup(order) }}
                                  disabled={!order.client_phone || order.client_phone.trim() === '' || confirmingOrderId === order.id}
                                  className={`p-2 rounded-lg transition-colors border ${
                                    order.admin_confirmed
                                      ? 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100'
                                      : 'text-gray-500 hover:text-green-600 hover:bg-green-50 border-transparent hover:border-green-100'
                                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  title={
                                    !order.client_phone
                                      ? 'لا يوجد رقم هاتف للعميل'
                                      : order.admin_confirmed
                                        ? 'تمت المراجعة - إعادة إرسال رسالة الاستلام'
                                        : 'تأكيد المراجعة وإرسال رسالة الاستلام'
                                  }
                                >
                                  {confirmingOrderId === order.id ? (
                                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                                  ) : order.admin_confirmed ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <MessageCircle className="w-4 h-4" />
                                  )}
                                </button>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMarkAsDeliveredWithCheck(order) }}
                                  disabled={isProcessing}
                                  className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-purple-100"
                                  title="تم التسليم"
                                >
                                  {isProcessing ? (
                                    <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <Truck className="w-4 h-4" />
                                  )}
                                </button>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order) }}
                                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                  title="حذف الطلب"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>

                                {/* زر إعادة الحالة */}
                                <div className="relative">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setStatusChangeOrderId(statusChangeOrderId === order.id ? null : order.id) }}
                                    className={`p-2 rounded-lg transition-colors border ${
                                      statusChangeOrderId === order.id
                                        ? 'text-amber-600 bg-amber-50 border-amber-200'
                                        : 'text-gray-500 hover:text-amber-600 hover:bg-amber-50 border-transparent hover:border-amber-100'
                                    }`}
                                    title="إعادة الطلب لحالة سابقة"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                  {statusChangeOrderId === order.id && (
                                    <div
                                      className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-2 min-w-[160px]"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <p className="text-xs text-gray-500 mb-2 px-1 font-medium">إعادة الطلب إلى:</p>
                                      <button
                                        onClick={() => handleRevertStatusInSearch(order.id, 'in_progress')}
                                        disabled={isChangingStatus}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                      >
                                        <Package className="w-3.5 h-3.5" />
                                        قيد التنفيذ
                                      </button>
                                      <button
                                        onClick={() => handleRevertStatusInSearch(order.id, 'pending')}
                                        disabled={isChangingStatus}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-700 hover:bg-yellow-50 rounded-lg transition-colors disabled:opacity-50"
                                      >
                                        <Clock className="w-3.5 h-3.5" />
                                        في الانتظار
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : order.status === 'delivered' ? (
                              /* أزرار الطلبات المستلمة - مطابقة لصفحة الطلبات المستلمة */
                              <div className="flex flex-col gap-2 mt-1">
                                <Link
                                  href={`/dashboard/alterations/add?orderId=${order.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-100"
                                  title="طلب تعديل"
                                >
                                  <Wrench className="w-4 h-4" />
                                </Link>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSendThankYouMessage(order) }}
                                  disabled={!order.client_phone}
                                  className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-green-100"
                                  title="إرسال رسالة شكر"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order) }}
                                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                  title="حذف الطلب"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              /* أزرار الطلبات العادية (قيد الانتظار / قيد التنفيذ / ملغي) */
                              <div className="flex gap-1.5">
                                <div className="flex flex-col gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenMeasurements(order) }}
                                    className="relative flex items-center justify-center p-2.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors border border-gray-200 hover:border-purple-200"
                                    title={hasMeasurementsBadge(order) ? (t('edit_measurements') || 'تعديل المقاسات') : (t('add_measurements') || 'إضافة مقاسات')}
                                  >
                                    <Ruler className="w-5 h-5" />
                                    {hasMeasurementsBadge(order) && <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full fill-white absolute -top-1.5 -right-1.5" />}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handlePrintOrder(order) }}
                                    className="relative flex items-center justify-center p-2.5 text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition-colors border border-gray-200 hover:border-pink-200"
                                    title={t('print_order') || 'طباعة'}
                                  >
                                    <Printer className="w-5 h-5" />
                                    {isOrderPrinted(order) && <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full fill-white absolute -top-1.5 -right-1.5" />}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSendWhatsAppOnly(order) }}
                                    className="relative flex items-center justify-center p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors border border-gray-200 hover:border-green-200"
                                    title={isArabic ? 'إرسال واتساب' : 'Send WhatsApp'}
                                  >
                                    <MessageCircle className="w-5 h-5" />
                                    {isWhatsAppSent(order) && <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full fill-white absolute -top-1.5 -right-1.5" />}
                                  </button>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleEditOrder(order) }}
                                    className="flex items-center justify-center p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-gray-200 hover:border-blue-200"
                                    title={t('edit') || 'تعديل'}
                                  >
                                    <Edit className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (order.status === 'pending') handleDeliverOrder(order.id) }}
                                    disabled={isProcessing || order.status !== 'pending'}
                                    className="flex items-center justify-center p-2.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors border border-gray-200 hover:border-purple-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={isArabic ? 'تم التسليم' : 'Mark as Delivered'}
                                  >
                                    <Truck className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order) }}
                                    className="flex items-center justify-center p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-gray-200 hover:border-red-200"
                                    title={t('delete') || 'حذف'}
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Progress Bar - Print / Measurements / WhatsApp (للطلبات العادية فقط) */}
                  {user.role === 'admin' && order.status !== 'completed' && order.status !== 'delivered' && (() => {
                    const done = [isOrderPrinted(order), hasMeasurementsBadge(order), isWhatsAppSent(order)].filter(Boolean).length
                    const pct = done === 0 ? 0 : done === 1 ? 33 : done === 2 ? 66 : 100
                    const barColor = done === 1 ? 'bg-red-400' : done === 2 ? 'bg-orange-400' : done === 3 ? 'bg-green-400' : 'bg-gray-200'
                    return (
                      <div className="mt-3 mb-1 px-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`absolute inset-y-0 right-0 rounded-full transition-all duration-500 ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold w-8 text-left transition-colors duration-500 ${done === 1 ? 'text-red-400' : done === 2 ? 'text-orange-400' : done === 3 ? 'text-green-500' : 'text-gray-300'}`}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Footer - Price (Full Width) */}
                  {workerType !== 'workshop_manager' && workerType !== 'tailor' && (
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4 cursor-pointer" onClick={() => handleViewOrder(order)}>
                      <div>
                        <p className="text-xs text-gray-500">{t('price_label') || (isArabic ? 'السعر' : 'Price')}</p>
                        <p className="text-lg font-bold text-gray-900">
                          {order.price?.toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{t('paid') || (isArabic ? 'المدفوع' : 'Paid')}</p>
                        <p className="text-sm font-semibold text-green-600">
                          {(order.paid_amount || 0).toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })
          )}</motion.div >

        {/* النوافذ المنبثقة */}
        < OrderModal
          order={selectedOrder}
          workers={workers}
          isOpen={showViewModal}
          onClose={handleCloseModals}
          onStartWork={user.role === 'worker' ? handleStartWork : undefined}
          onCompleteWork={user.role === 'worker' ? handleOpenCompleteModal : undefined}
          isProcessing={isProcessing}
          currentWorkerId={currentWorkerId || undefined}
        />

        <EditOrderModal
          order={selectedOrder}
          workers={workers}
          isOpen={showEditModal}
          onClose={handleCloseModals}
          onSave={handleSaveOrder}
        />

        {/* نافذة إنهاء الطلب */}
        {
          showCompleteModal && selectedOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModals} />

              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-800">{t('complete_order_modal_title')}</h3>
                    <button
                      onClick={handleCloseModals}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg font-medium text-gray-800 mb-2">
                      {t('order_label')} {selectedOrder.description}
                    </h4>
                    <p className="text-gray-600">
                      {t('for_client')} {selectedOrder.client_name}
                    </p>
                  </div>

                  <CompletedWorkUpload
                    onImagesChange={setCompletedImages}
                    maxImages={3}
                    disabled={isProcessing}
                  />

                  {/* رسالة التحذير - رفع الصور إلزامي */}
                  <div className={`p-4 rounded-lg border ${completedImages.length === 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                    }`}>
                    <div className="flex items-start space-x-3 space-x-reverse">
                      <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${completedImages.length === 0
                        ? 'text-red-600'
                        : 'text-yellow-600'
                        }`} />
                      <div>
                        <p className={`font-medium mb-1 ${completedImages.length === 0
                          ? 'text-red-800'
                          : 'text-yellow-800'
                          }`}>
                          {completedImages.length === 0
                            ? t('important_warning_upload_required')
                            : t('important_warning')}
                        </p>
                        <p className={`text-sm ${completedImages.length === 0
                          ? 'text-red-700'
                          : 'text-yellow-700'
                          }`}>
                          {completedImages.length === 0
                            ? t('must_upload_before_completing')
                            : t('complete_order_warning')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* رسالة التحقق عند عدم رفع صور */}
                  {completedImages.length === 0 && (
                    <div className="bg-red-100 border-l-4 border-red-500 p-4 rounded">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Camera className="w-5 h-5 text-red-600 flex-shrink-0" />
                        <p className="text-sm font-medium text-red-800">
                          {t('cannot_complete_without_images')}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4 justify-end">
                    <button
                      onClick={handleCloseModals}
                      disabled={isProcessing}
                      className="btn-secondary px-6 py-2"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleCompleteWork}
                      disabled={isProcessing || completedImages.length === 0}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 space-x-reverse"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>{t('completing')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>{t('complete_order')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )
        }

        {/* عنصر نهاية القائمة - يُراقبه IntersectionObserver لتحميل المزيد */}
        {searchResults === null && dateFilterResults === null && (
          <div ref={sentinelRef} className="py-4 flex justify-center">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader className="w-4 h-4 animate-spin" />
                <span>{isArabic ? 'جارٍ تحميل المزيد...' : 'Loading more...'}</span>
              </div>
            )}
            {!hasMore && orders.length > 0 && !ordersLoading && (
              <p className="text-gray-400 text-sm">
                {isArabic ? `تم عرض جميع الطلبات (${orders.length})` : `All orders shown (${orders.length})`}
              </p>
            )}
          </div>
        )}

        <DeleteOrderModal
          isOpen={deleteModalOpen}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteOrder}
          orderInfo={orderToDelete}
        />

        {/* تحذير الدفعة المتبقية عند تسليم الطلبات المكتملة من نتائج البحث */}
        <RemainingPaymentWarningModal
          isOpen={showPaymentWarning}
          remainingAmount={orderToDeliver?.remaining_amount || 0}
          onCancel={() => { setShowPaymentWarning(false); setOrderToDeliver(null) }}
          onMarkAsPaid={() => { if (orderToDeliver) deliverOrderWithPaidStatus(orderToDeliver.id, true) }}
          onIgnore={() => { if (orderToDeliver) deliverOrderWithPaidStatus(orderToDeliver.id, false) }}
        />

        {/* نافذة المقاسات */}
        {
          measurementsOrder && (
            <MeasurementsModal
              isOpen={showMeasurementsModal}
              onClose={() => {
                setShowMeasurementsModal(false)
                setMeasurementsOrder(null)
              }}
              onSave={handleSaveMeasurements}
              initialMeasurements={measurementsOrder.measurements || {}}
              orderId={measurementsOrder.id}
            />
          )
        }

        {/* مودال الطباعة */}
        {
          printOrder && (
            <PrintOrderModal
              isOpen={showPrintModal}
              onClose={() => {
                setShowPrintModal(false)
                setPrintOrder(null)
              }}
              order={printOrder}
              onPrint={async () => {
                try {
                  // is_printed عمود مستقل الآن (migration 29)
                  if (printOrder.is_printed !== true) {
                    const updates: any = { is_printed: true }
                    // has_measurements: إذا لم يكن محدداً بعد، تحقق من وجود مقاسات
                    if (printOrder.has_measurements !== true) {
                      const measurementsResult = await orderService.getMeasurements(printOrder.id)
                      const currentMeasurements = measurementsResult.data || {}
                      if (hasMeasurementsData(currentMeasurements)) {
                        updates.has_measurements = true
                      }
                    }
                    await updateOrder(printOrder.id, updates)
                  }
                } catch (error) {
                  console.error('Error marking order as printed:', error)
                }
              }}
            />
          )
        }
        {/* مودال رسالة نجاح حفظ المقاسات - تصميم مطابق لصفحة الأقمشة */}
        {measurementsSaveSuccess && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">تم إتمام الإجراء بنجاح</h3>
            </motion.div>
          </div>
        )}

        {/* مودال رسالة خطأ حفظ المقاسات - تصميم مطابق لصفحة الأقمشة */}
        {measurementsSaveError && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setMeasurementsSaveError(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">{measurementsSaveError}</h3>
              <button
                onClick={() => setMeasurementsSaveError(null)}
                className="mt-4 px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                حسناً
              </button>
            </motion.div>
          </div>
        )}
      </div >
    </div >
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OrdersPageInner />
    </Suspense>
  )
}
