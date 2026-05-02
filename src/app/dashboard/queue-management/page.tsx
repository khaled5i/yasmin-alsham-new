'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Users,
  Bell,
  CheckCircle,
  Trash2,
  Plus,
  ArrowRight,
  Clock,
  Package,
  Phone,
  RefreshCw,
  QrCode,
} from 'lucide-react'
import { queueService, type QueueEntry, type VisitReason } from '@/lib/services/queue-service'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'

function sendWhatsAppNotification(phone: string, name: string) {
  const msg = encodeURIComponent(`مرحباً ${name}، حان دورك في ياسمين الشام 🌸`)
  window.open(`https://wa.me/${phone.replace(/^0/, '966')}?text=${msg}`, '_blank')
}

// ============================================================================
// Helpers
// ============================================================================

const REASON_LABELS: Record<VisitReason, string> = {
  tailoring: 'تفصيل فستان',
  alteration_ours: 'تعديل (ياسمين الشام)',
  alteration_other: 'تعديل (مكان آخر)',
  pickup: 'استلام فستان',
  other: 'سبب آخر',
}

const REASON_COLORS: Record<VisitReason, string> = {
  tailoring: 'bg-pink-100 text-pink-700',
  alteration_ours: 'bg-purple-100 text-purple-700',
  alteration_other: 'bg-blue-100 text-blue-700',
  pickup: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700',
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return 'منذ لحظات'
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`
  return `منذ ${Math.floor(diff / 3600)} ساعة`
}

// ============================================================================
// Queue Card Component
// ============================================================================

interface QueueCardProps {
  entry: QueueEntry
  position: number
  onCall: (entry: QueueEntry) => void
  onDone: (id: string) => void
  onRemove: (id: string) => void
  isActioning: string | null
}

function QueueCard({ entry, position, onCall, onDone, onRemove, isActioning }: QueueCardProps) {
  const isBusy = isActioning === entry.id
  const isCalled = entry.status === 'called'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
      className={`rounded-2xl border p-4 transition-colors ${isCalled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
    >
      <div className="flex items-start gap-3">
        {/* Position badge */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${isCalled ? 'bg-green-500 text-white' : 'bg-pink-100 text-pink-700'}`}>
          {position}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-800 truncate">{entry.customer_name}</p>
            {isCalled && (
              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">تم الاستدعاء</span>
            )}
          </div>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${REASON_COLORS[entry.visit_reason]}`}>
            {REASON_LABELS[entry.visit_reason]}
          </span>
          {entry.phone && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1" dir="ltr">
              <Phone className="w-3 h-3" />
              {entry.phone}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(entry.created_at)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => onCall(entry)}
            disabled={isBusy}
            title="استدعاء العميل"
            className="w-8 h-8 rounded-lg bg-pink-100 hover:bg-pink-200 text-pink-700 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDone(entry.id)}
            disabled={isBusy}
            title="تم"
            className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(entry.id)}
            disabled={isBusy}
            title="حذف"
            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// Pickup Notification Card
// ============================================================================

interface PickupCardProps {
  entry: QueueEntry
  onDone: (id: string) => void
}

function PickupCard({ entry, onDone }: PickupCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <Package className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-emerald-800">{entry.customer_name}</p>
          {entry.phone && (
            <p className="text-sm text-emerald-700 mt-0.5" dir="ltr">{entry.phone}</p>
          )}
          <p className="text-xs text-emerald-600 mt-1">تريد استلام طلب — {timeAgo(entry.created_at)}</p>
        </div>
        <button
          onClick={() => onDone(entry.id)}
          className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
        >
          تم التسليم
        </button>
      </div>
    </motion.div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function QueueManagementPage() {
  const { user, isLoading: authLoading } = useAuthStore()
  const router = useRouter()

  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActioning, setIsActioning] = useState<string | null>(null)

  const activeQueue = queue.filter(e => e.visit_reason !== 'pickup')
  const pickupQueue = queue.filter(e => e.visit_reason === 'pickup')

  // ------------------------------------------------------------------
  // Auth guard
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  // ------------------------------------------------------------------
  // Load queue
  // ------------------------------------------------------------------
  const loadQueue = useCallback(async () => {
    const data = await queueService.getActiveQueue()
    setQueue(data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  // ------------------------------------------------------------------
  // Supabase Realtime: watch all queue changes today
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('admin_queue_all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'walk_in_queue' },
        () => { loadQueue() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadQueue])

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const handleCall = async (entry: QueueEntry) => {
    setIsActioning(entry.id)
    const { error } = await queueService.callCustomer(entry.id)
    if (error) {
      toast.error('حدث خطأ أثناء الاستدعاء')
    } else {
      toast.success(`تم استدعاء ${entry.customer_name}`)
      // Open WhatsApp if phone exists
      if (entry.phone) {
        sendWhatsAppNotification(entry.phone, entry.customer_name)
      }
      loadQueue()
    }
    setIsActioning(null)
  }

  const handleDone = async (id: string) => {
    setIsActioning(id)
    const { error } = await queueService.markDone(id)
    if (error) toast.error('حدث خطأ')
    else {
      toast.success('تم')
      loadQueue()
    }
    setIsActioning(null)
  }

  const handleRemove = async (id: string) => {
    if (!confirm('هل تريد حذف هذا الدور؟')) return
    setIsActioning(id)
    const { error } = await queueService.removeEntry(id)
    if (error) toast.error('حدث خطأ')
    else {
      toast.success('تم الحذف')
      loadQueue()
    }
    setIsActioning(null)
  }

  const handleAddAdmin = async () => {
    setIsActioning('__admin__')
    const { error } = await queueService.addAdminEntry()
    if (error) toast.error('حدث خطأ')
    else {
      toast.success('تم إضافة دور')
      loadQueue()
    }
    setIsActioning(null)
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (authLoading || (!user && !authLoading)) return null

  const queueUrl = typeof window !== 'undefined' ? `${window.location.origin}/queue` : '/queue'

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 pb-10" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-pink-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard/orders" className="p-2 rounded-lg hover:bg-pink-50 text-gray-500 hover:text-pink-600 transition-colors">
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">إدارة الدور</h1>
            <p className="text-xs text-gray-400">اليوم — تحديث تلقائي</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
              <Users className="w-4 h-4" />
              {activeQueue.length}
            </div>
            <button
              onClick={loadQueue}
              className="p-2 rounded-lg hover:bg-pink-50 text-gray-400 hover:text-pink-600 transition-colors"
              title="تحديث"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">

        {/* QR / Link section */}
        <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 bg-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <QrCode className="w-5 h-5 text-pink-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">رابط صفحة الدور للعملاء</p>
              <p className="text-xs text-gray-400 truncate" dir="ltr">{queueUrl}</p>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(queueUrl); toast.success('تم نسخ الرابط') }}
              className="text-xs bg-pink-100 hover:bg-pink-200 text-pink-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              نسخ
            </button>
          </div>
        </div>

        {/* Add admin entry */}
        <button
          onClick={handleAddAdmin}
          disabled={isActioning === '__admin__'}
          className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold py-3 rounded-2xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
        >
          <Plus className="w-5 h-5" />
          إضافة دور سريع
        </button>

        {/* Active queue */}
        <div>
          <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            قائمة الانتظار ({activeQueue.length})
          </h2>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">
              <div className="w-8 h-8 border-2 border-pink-300 border-t-pink-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">جاري التحميل...</p>
            </div>
          ) : activeQueue.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">لا يوجد أدوار حالياً</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {activeQueue.map((entry, idx) => (
                  <QueueCard
                    key={entry.id}
                    entry={entry}
                    position={idx + 1}
                    onCall={handleCall}
                    onDone={handleDone}
                    onRemove={handleRemove}
                    isActioning={isActioning}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Pickup section */}
        {pickupQueue.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              طلبات الاستلام الواردة ({pickupQueue.length})
            </h2>
            <div className="space-y-3">
              <AnimatePresence>
                {pickupQueue.map(entry => (
                  <PickupCard key={entry.id} entry={entry} onDone={handleDone} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
