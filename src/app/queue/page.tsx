'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors,
  ChevronDown,
  Phone,
  Clock,
  Users,
  CheckCircle,
  ArrowRight,
  Bell,
  MapPin,
  Sparkles,
  Zap,
} from 'lucide-react'
import { queueService, type VisitReason, type QueueEntry } from '@/lib/services/queue-service'
import { supabase } from '@/lib/supabase'

// ============================================================================
// Types & helpers
// ============================================================================

type Step =
  | 'welcome'
  | 'reason'
  | 'tailoring_modal'
  | 'workshop_check'
  | 'redirect_other'
  | 'pickup_phone'
  | 'pickup_done'
  | 'alteration_ours_yes'
  | 'alteration_ours_no'
  | 'ticket'
  | 'notified'

const VISIT_REASONS: { value: VisitReason; label: string }[] = [
  { value: 'tailoring', label: 'تفصيل فستان' },
  { value: 'alteration_ours', label: 'تعديل فستان من تصنيع ياسمين الشام' },
  { value: 'alteration_other', label: 'تعديل فستان من تصنيع مكان آخر' },
  { value: 'pickup', label: 'استلام فستان' },
  { value: 'other', label: 'سبب آخر' },
]

function formatDate(d: Date): string {
  return d.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getOrCreateSessionToken(): string {
  const KEY = 'queue_session_token'
  let token = sessionStorage.getItem(KEY)
  if (!token) {
    token = crypto.randomUUID()
    sessionStorage.setItem(KEY, token)
  }
  return token
}

// ============================================================================
// Main Component
// ============================================================================

export default function QueuePage() {
  const [step, setStep] = useState<Step>('welcome')
  const [customerName, setCustomerName] = useState('')
  const [visitReason, setVisitReason] = useState<VisitReason | ''>('')
  const [phone, setPhone] = useState('')
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null)
  const [peopleAhead, setPeopleAhead] = useState(0)
  const [availableDates, setAvailableDates] = useState<{ normalDate: Date | null; urgentDate: Date | null }>({ normalDate: null, urgentDate: null })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isNotified, setIsNotified] = useState(false)
  const sessionToken = useRef(getOrCreateSessionToken())

  // ------------------------------------------------------------------
  // Supabase Realtime: watch for admin calling this customer
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!queueEntry) return

    const channel = supabase
      .channel(`queue_entry_${queueEntry.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'walk_in_queue',
          filter: `id=eq.${queueEntry.id}`,
        },
        (payload) => {
          const updated = payload.new as QueueEntry
          if (updated.notified_at && updated.notified_at !== queueEntry.notified_at) {
            triggerNotification()
          }
          setQueueEntry(updated)
          if (updated.status === 'done' || updated.status === 'removed') {
            setPeopleAhead(0)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueEntry?.id])

  // Poll people-ahead count every 30 seconds while on ticket step
  useEffect(() => {
    if (!queueEntry || step !== 'ticket') return
    const refresh = () => {
      queueService.getPeopleAheadCount(queueEntry.id, queueEntry.created_at).then(setPeopleAhead)
    }
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [queueEntry, step])

  const triggerNotification = useCallback(() => {
    setIsNotified(true)
    setStep('notified')
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500])
    }
    // Play a short beep using AudioContext
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.5, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.5)
    } catch {
      // audio not supported — silently skip
    }
  }, [])

  // ------------------------------------------------------------------
  // Step handlers
  // ------------------------------------------------------------------

  const handleNameSubmit = () => {
    if (!customerName.trim()) {
      setErrorMsg('يرجى إدخال اسمك')
      return
    }
    setErrorMsg('')
    setStep('reason')
  }

  const handleReasonSubmit = async () => {
    if (!visitReason) {
      setErrorMsg('يرجى اختيار سبب الزيارة')
      return
    }
    setErrorMsg('')

    if (visitReason === 'tailoring') {
      setIsLoading(true)
      const dates = await queueService.getNextAvailableDates()
      setAvailableDates(dates)
      setIsLoading(false)
      setStep('tailoring_modal')
    } else if (visitReason === 'alteration_ours') {
      setStep('workshop_check')
    } else if (visitReason === 'alteration_other') {
      setStep('redirect_other')
    } else if (visitReason === 'pickup') {
      setStep('pickup_phone')
    } else if (visitReason === 'other') {
      await joinQueue('other')
    }
  }

  const joinQueue = async (reason: VisitReason, phoneVal?: string) => {
    setIsLoading(true)
    const { data, error } = await queueService.joinQueue({
      customerName: customerName.trim(),
      visitReason: reason,
      phone: phoneVal,
      sessionToken: sessionToken.current,
    })
    setIsLoading(false)
    if (error || !data) {
      setErrorMsg(error || 'حدث خطأ، يرجى المحاولة مرة أخرى')
      return
    }
    setQueueEntry(data)
    const ahead = await queueService.getPeopleAheadCount(data.id, data.created_at)
    setPeopleAhead(ahead)
    setStep('ticket')
  }

  const handlePickupSubmit = async () => {
    if (!phone.trim() || phone.trim().length < 9) {
      setErrorMsg('يرجى إدخال رقم هاتف صحيح')
      return
    }
    setErrorMsg('')
    setIsLoading(true)
    // Add to queue so admin is notified via Realtime
    await queueService.joinQueue({
      customerName: customerName.trim(),
      visitReason: 'pickup',
      phone: phone.trim(),
      sessionToken: sessionToken.current,
    })
    setIsLoading(false)
    setStep('pickup_done')
  }

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  const pageVariants = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
    exit: { opacity: 0, y: -24, transition: { duration: 0.25 } },
  }

  const waitMinutes = peopleAhead * 10

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Header logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl shadow-lg mb-3">
            <Scissors className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
            ياسمين الشام
          </h1>
          <p className="text-gray-500 text-sm mt-1">للخياطة والتصميم</p>
        </div>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Welcome ── */}
          {step === 'welcome' && (
            <motion.div key="welcome" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <div className="text-center mb-6">
                  <Sparkles className="w-10 h-10 text-pink-400 mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-gray-800 mb-1">مرحبا بكم في ياسمين الشام ✨</h2>
                  <p className="text-gray-500 text-sm">يرجى إدخال اسمك لحجز دورك</p>
                </div>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
                  placeholder="اسم العميلة..."
                  className="w-full border border-pink-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 text-right mb-4"
                  autoFocus
                />
                {errorMsg && <p className="text-red-500 text-sm mb-3 text-center">{errorMsg}</p>}
                <button
                  onClick={handleNameSubmit}
                  className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  متابعة
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Reason ── */}
          {step === 'reason' && (
            <motion.div key="reason" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-1">أهلاً {customerName} 👋</h2>
                  <p className="text-gray-500 text-sm">ما سبب زيارتك اليوم؟</p>
                </div>
                <div className="relative mb-4">
                  <select
                    value={visitReason}
                    onChange={e => setVisitReason(e.target.value as VisitReason)}
                    className="w-full border border-pink-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 appearance-none text-right bg-white"
                  >
                    <option value="">اختاري سبب الزيارة</option>
                    {VISIT_REASONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
                {errorMsg && <p className="text-red-500 text-sm mb-3 text-center">{errorMsg}</p>}
                <button
                  onClick={handleReasonSubmit}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? 'جاري التحقق...' : 'متابعة'}
                  {!isLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Tailoring modal: show available dates ── */}
          {step === 'tailoring_modal' && (
            <motion.div key="tailoring_modal" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                    <Scissors className="w-5 h-5 text-pink-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">مواعيد استلام التفصيل</h2>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-green-700 mb-1">أقرب موعد عادي</p>
                    <p className="text-green-800 font-bold text-sm">
                      {availableDates.normalDate ? formatDate(availableDates.normalDate) : 'جاري الحساب...'}
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      أقرب موعد مستعجل
                    </p>
                    <p className="text-amber-800 font-bold text-sm">
                      {availableDates.urgentDate ? formatDate(availableDates.urgentDate) : 'جاري الحساب...'}
                    </p>
                    <p className="text-amber-600 text-xs mt-2">
                      ⚠️ المواعيد المستعجلة تطبّق رسوم إضافية بنسبة 30٪
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => joinQueue('tailoring')}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? 'جاري الحجز...' : 'متابعة حجز الدور'}
                  {!isLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Workshop check (alteration_ours) ── */}
          {step === 'workshop_check' && (
            <motion.div key="workshop_check" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-7 h-7 text-purple-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">هل قمتِ بمراجعة المشغل النسائي؟</h2>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setStep('alteration_ours_yes')}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    نعم ✓
                  </button>
                  <button
                    onClick={() => setStep('alteration_ours_no')}
                    className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    لا
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Alteration ours — reviewed workshop ── */}
          {step === 'alteration_ours_yes' && (
            <motion.div key="alteration_ours_yes" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-3">شكراً لك!</h2>
                <p className="text-gray-600 leading-relaxed">
                  سيتم أخذ التعديل منك في أقرب وقت ممكن يرجى الانتظار 🌸
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Alteration ours — didn't visit workshop ── */}
          {step === 'alteration_ours_no' && (
            <motion.div key="alteration_ours_no" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-amber-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-3">يرجى التوجه أولاً</h2>
                <p className="text-gray-600 leading-relaxed">
                  يرجى التوجه إلى المشغل النسائي ياسمين الشام 2 في الطرف المقابل من الطريق في الزاوية اليمنى لتحديد التعديلات المطلوبة.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Redirect other alteration ── */}
          {step === 'redirect_other' && (
            <motion.div key="redirect_other" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-3">التوجيه</h2>
                <p className="text-gray-600 leading-relaxed">
                  يرجى التوجه إلى ياسمين الشام 2 في الجهة المقابلة من الطريق في الزاوية اليمنى.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Pickup: phone input ── */}
          {step === 'pickup_phone' && (
            <motion.div key="pickup_phone" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Phone className="w-7 h-7 text-pink-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">استلام فستان</h2>
                  <p className="text-gray-500 text-sm mt-1">يرجى إدخال رقم الهاتف الذي تم استخدامه عند استقبال الطلب</p>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePickupSubmit()}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                  className="w-full border border-pink-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 text-center mb-4"
                  autoFocus
                />
                {errorMsg && <p className="text-red-500 text-sm mb-3 text-center">{errorMsg}</p>}
                <button
                  onClick={handlePickupSubmit}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {isLoading ? 'جاري الإرسال...' : 'إرسال'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Pickup done message ── */}
          {step === 'pickup_done' && (
            <motion.div key="pickup_done" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-3">تم الاستلام 🌸</h2>
                <p className="text-gray-600 leading-relaxed">
                  سيتم تسليم طلبكم في غضون دقائق يرجى الانتظار
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Queue Ticket ── */}
          {step === 'ticket' && queueEntry && (
            <motion.div key="ticket" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
                {/* Ticket header */}
                <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-6 text-white text-center">
                  <p className="text-sm opacity-80 mb-1">ياسمين الشام للخياطة</p>
                  <h2 className="text-2xl font-bold">تذكرة الدور</h2>
                </div>

                {/* Dashed separator */}
                <div className="border-t-2 border-dashed border-pink-200 mx-6" />

                {/* Ticket body */}
                <div className="p-6 space-y-5">
                  <div className="text-center">
                    <p className="text-gray-500 text-sm mb-1">الاسم</p>
                    <p className="text-gray-800 font-bold text-lg">{customerName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-pink-50 rounded-xl p-4 text-center">
                      <Users className="w-5 h-5 text-pink-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-pink-600">{peopleAhead}</p>
                      <p className="text-xs text-gray-500">أشخاص قبلك</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <Clock className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-purple-600">
                        {waitMinutes === 0 ? 'الآن' : `~${waitMinutes}`}
                      </p>
                      <p className="text-xs text-gray-500">{waitMinutes > 0 ? 'دقيقة متوقعة' : 'حان دورك'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-blue-50 rounded-xl p-3">
                    <Bell className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <p className="text-blue-700 text-xs">يرجى إبقاء هذه الصفحة مفتوحة — سنُشعرك فور حلول دورك</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Notified: Your turn! ── */}
          {step === 'notified' && (
            <motion.div
              key="notified"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 200 } }}
              exit={{ opacity: 0 }}
            >
              <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-3xl shadow-2xl p-10 text-white text-center">
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-5"
                >
                  <Bell className="w-10 h-10 text-white" />
                </motion.div>
                <h2 className="text-3xl font-bold mb-3">حان دورك! 🌸</h2>
                <p className="opacity-90 text-lg">يرجى التوجه إلى المحل الآن</p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

