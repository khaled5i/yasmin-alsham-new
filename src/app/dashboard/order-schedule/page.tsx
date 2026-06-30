'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, CalendarDays, CalendarCheck, X, Phone, User, Eye, Loader } from 'lucide-react'
import Link from 'next/link'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moment = require('moment-hijri')
import { useAuthStore } from '@/store/authStore'
import { useWorkerStore } from '@/store/workerStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { orderService, type Order } from '@/lib/services/order-service'
import { toLocalDateKey, shiftDate } from '@/lib/date-utils'
import OrderModal from '@/components/OrderModal'

// ─── Hijri helpers ───────────────────────────────────────────────────────────
const hijriMonths = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
    'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
]
const arabicDayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function toHijri(date: Date) {
    const m = moment(date)
    return { day: m.iDate(), month: m.iMonth(), year: m.iYear(), monthName: hijriMonths[m.iMonth()] }
}

const HIJRI_MONTH_COLORS = {
    first: '#7c3aed',
    second: '#0d9488',
}

function getHijriMonthsInView(year: number, month: number) {
    const firstDay = new Date(year, month, 1, 12)
    const lastDay = new Date(year, month + 1, 0, 12)
    const firstHijri = toHijri(firstDay)
    const lastHijri = toHijri(lastDay)

    if (firstHijri.month === lastHijri.month && firstHijri.year === lastHijri.year) {
        return [{ month: firstHijri.month, year: firstHijri.year, name: firstHijri.monthName, colorKey: 'first' as const }]
    }
    return [
        { month: firstHijri.month, year: firstHijri.year, name: firstHijri.monthName, colorKey: 'first' as const },
        { month: lastHijri.month, year: lastHijri.year, name: lastHijri.monthName, colorKey: 'second' as const },
    ]
}

// ─── Types ────────────────────────────────────────────────────────────────────
type CalendarMode = 'delivery' | 'proof' | 'second_proof'

interface OrderOnDate {
    id: string
    client_name: string
    client_phone: string
    order_number: string
    status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
    worker_id?: string | null
}

const ORDER_STATUS_LABEL: Record<OrderOnDate['status'], string> = {
    pending: 'بانتظار البدء',
    in_progress: 'قيد التنفيذ',
    completed: 'مكتمل',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
}

const ORDER_STATUS_BADGE: Record<OrderOnDate['status'], string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    delivered: 'bg-gray-100 text-gray-700 border-gray-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
}

// ─── Per-mode color theme ─────────────────────────────────────────────────────
// كل وضع تقويم له لوحة ألوان كاملة: التسليم (وردي) | البروفا (أخضر) | البروفا الثانية (أزرق)
interface CalendarTheme {
    label: string            // عنوان نوع المواعيد داخل النافذة
    overloadThreshold: number
    overloadLegend: string   // النص في وسيلة الإيضاح "أكثر من N"
    // التقويم
    cardBorder: string
    headerBg: string
    headerText: string
    dayRowBg: string
    dayNameText: string
    todayRing: string
    dayHover: string
    todayDateText: string
    countBadge: string
    // النافذة المنبثقة
    modalHeader: string
    modalSubText: string
    infoBarBg: string
    infoIconText: string
    infoText: string
    infoStrong: string
    orderCardHover: string
    avatarBg: string
    avatarIcon: string
    eyeIcon: string
    viewMore: string
    // المفتاح + وسيلة الإيضاح
    toggleActive: string
    toggleHover: string
    legendDot: string
    legendRing: string
}

const CALENDAR_THEME: Record<CalendarMode, CalendarTheme> = {
    delivery: {
        label: 'مواعيد التسليم',
        overloadThreshold: 6,
        overloadLegend: '5',
        cardBorder: 'border-pink-100',
        headerBg: 'bg-gradient-to-r from-pink-50 to-rose-50 border-pink-100',
        headerText: 'text-pink-900',
        dayRowBg: 'bg-pink-50 border-pink-100',
        dayNameText: 'text-rose-800',
        todayRing: 'ring-2 ring-pink-500',
        dayHover: 'hover:bg-pink-50',
        todayDateText: 'text-pink-600',
        countBadge: 'text-pink-700 bg-pink-100',
        modalHeader: 'bg-gradient-to-r from-pink-500 to-rose-600',
        modalSubText: 'text-pink-100',
        infoBarBg: 'bg-pink-50 border-pink-100',
        infoIconText: 'text-pink-600',
        infoText: 'text-pink-700',
        infoStrong: 'text-pink-900',
        orderCardHover: 'hover:border-pink-200 hover:bg-pink-50',
        avatarBg: 'bg-pink-100',
        avatarIcon: 'text-pink-600',
        eyeIcon: 'text-pink-500',
        viewMore: 'bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700',
        toggleActive: 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-md',
        toggleHover: 'text-gray-500 hover:text-pink-600',
        legendDot: 'bg-pink-500',
        legendRing: 'border-pink-500',
    },
    proof: {
        label: 'مواعيد البروفا',
        overloadThreshold: 4,
        overloadLegend: '3',
        cardBorder: 'border-green-100',
        headerBg: 'bg-[#d1fae5] border-[#6ee7b7]',
        headerText: 'text-green-900',
        dayRowBg: 'bg-[#ecfdf5] border-[#d1fae5]',
        dayNameText: 'text-[#047857]',
        todayRing: 'ring-2 ring-green-500',
        dayHover: 'hover:bg-green-50',
        todayDateText: 'text-[#10b981]',
        countBadge: 'text-green-900 bg-[#d1fae5]',
        modalHeader: 'bg-gradient-to-r from-[#10b981] to-[#059669]',
        modalSubText: 'text-green-100',
        infoBarBg: 'bg-[#ecfdf5] border-[#d1fae5]',
        infoIconText: 'text-[#047857]',
        infoText: 'text-[#047857]',
        infoStrong: 'text-green-900',
        orderCardHover: 'hover:border-[#6ee7b7] hover:bg-[#ecfdf5]',
        avatarBg: 'bg-[#d1fae5]',
        avatarIcon: 'text-[#047857]',
        eyeIcon: 'text-[#047857]',
        viewMore: 'bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857]',
        toggleActive: 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md',
        toggleHover: 'text-gray-500 hover:text-green-600',
        legendDot: 'bg-[#10b981]',
        legendRing: 'border-[#10b981]',
    },
    second_proof: {
        label: 'مواعيد البروفا الثانية',
        overloadThreshold: 4,
        overloadLegend: '3',
        cardBorder: 'border-blue-100',
        headerBg: 'bg-[#dbeafe] border-[#93c5fd]',
        headerText: 'text-blue-900',
        dayRowBg: 'bg-[#eff6ff] border-[#dbeafe]',
        dayNameText: 'text-[#1d4ed8]',
        todayRing: 'ring-2 ring-blue-500',
        dayHover: 'hover:bg-blue-50',
        todayDateText: 'text-[#3b82f6]',
        countBadge: 'text-blue-900 bg-[#dbeafe]',
        modalHeader: 'bg-gradient-to-r from-[#3b82f6] to-[#2563eb]',
        modalSubText: 'text-blue-100',
        infoBarBg: 'bg-[#eff6ff] border-[#dbeafe]',
        infoIconText: 'text-[#1d4ed8]',
        infoText: 'text-[#1d4ed8]',
        infoStrong: 'text-blue-900',
        orderCardHover: 'hover:border-[#93c5fd] hover:bg-[#eff6ff]',
        avatarBg: 'bg-[#dbeafe]',
        avatarIcon: 'text-[#1d4ed8]',
        eyeIcon: 'text-[#1d4ed8]',
        viewMore: 'bg-gradient-to-r from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8]',
        toggleActive: 'bg-gradient-to-r from-[#3b82f6] to-[#2563eb] text-white shadow-md',
        toggleHover: 'text-gray-500 hover:text-blue-600',
        legendDot: 'bg-[#3b82f6]',
        legendRing: 'border-[#3b82f6]',
    },
}

// ─── Calendar grid helper ─────────────────────────────────────────────────────
function buildMonthGrid(year: number, month: number): (Date | null)[][] {
    const firstDay = new Date(year, month, 1)
    const startDow = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d, 12))
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
}

// ─── Single Month Calendar ────────────────────────────────────────────────────
interface MonthCalendarProps {
    year: number
    month: number
    mode: CalendarMode
    stats: Record<string, number>
    onDateClick: (dateKey: string) => void
}

function MonthCalendar({ year, month, mode, stats, onDateClick }: MonthCalendarProps) {
    const todayKey = toLocalDateKey(new Date())
    const gregorianMonth = arabicMonths[month]
    const rows = buildMonthGrid(year, month)
    const hijriMonthsInView = getHijriMonthsInView(year, month)

    const theme = CALENDAR_THEME[mode]

    return (
        <div className={`bg-white rounded-2xl shadow-md border overflow-hidden ${theme.cardBorder}`}>
            {/* Month Header */}
            <div className={`px-4 py-3 border-b text-center ${theme.headerBg}`}>
                <div className={`text-lg font-bold ${theme.headerText}`}>{gregorianMonth} {year}</div>
                <div className="text-sm font-semibold leading-relaxed">
                    {hijriMonthsInView.length === 1 ? (
                        <span style={{ color: HIJRI_MONTH_COLORS.first }}>
                            {hijriMonthsInView[0].name} {hijriMonthsInView[0].year}
                        </span>
                    ) : (
                        <>
                            <span style={{ color: HIJRI_MONTH_COLORS.second }}>
                                {hijriMonthsInView[1].name} {hijriMonthsInView[1].year}
                            </span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span style={{ color: HIJRI_MONTH_COLORS.first }}>
                                {hijriMonthsInView[0].name}
                                {hijriMonthsInView[0].year !== hijriMonthsInView[1].year ? ` ${hijriMonthsInView[0].year}` : ''}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Day names row - full names, LTR order */}
            <div dir="ltr" className={`grid grid-cols-7 border-b ${theme.dayRowBg}`}>
                {arabicDayNames.map((d, i) => (
                    <div key={d} className={`py-2 text-center text-[11px] sm:text-xs font-bold truncate px-0.5 ${i === 5 ? 'text-black bg-gray-100' : theme.dayNameText}`}>
                        {i === 5 ? '✕' : d}
                    </div>
                ))}
            </div>

            {/* Days grid - LTR so columns flow Sun→Sat left to right */}
            <div className="p-1">
                {rows.map((row, ri) => (
                    <div dir="ltr" key={ri} className="grid grid-cols-7">
                        {row.map((date, ci) => {
                            if (!date) return <div key={ci} className="aspect-square" />
                            const dateKey = toLocalDateKey(date)
                            const total = stats[dateKey] || 0
                            const isToday = dateKey === todayKey
                            const isOverloaded = total >= theme.overloadThreshold
                            const hijri = toHijri(date)
                            const isFriday = date.getDay() === 5

                            return (
                                <button
                                    key={ci}
                                    onClick={() => onDateClick(dateKey)}
                                    className={`
                    aspect-square flex flex-col items-center justify-center rounded-lg m-0.5 transition-all duration-200 gap-0.5
                    ${isToday ? theme.todayRing : ''}
                    ${isOverloaded ? 'bg-red-50 border border-red-200 hover:bg-red-100' : isFriday ? 'bg-gray-100 hover:bg-gray-200' : theme.dayHover}
                    cursor-pointer
                  `}
                                >
                                    {isFriday && (
                                        <span className="text-[10px] text-black font-bold leading-none">✕</span>
                                    )}
                                    <span className={`text-xl font-bold leading-none ${isOverloaded ? 'text-red-700' : isFriday ? 'text-black' : isToday ? theme.todayDateText : 'text-gray-800'}`}>
                                        {date.getDate()}
                                    </span>
                                    <span className="text-xs leading-none font-medium" style={{
                                        color: hijriMonthsInView.length > 1
                                            ? HIJRI_MONTH_COLORS[
                                                (hijriMonthsInView.find(m => m.month === hijri.month && m.year === hijri.year) || hijriMonthsInView[0]).colorKey
                                              ]
                                            : '#9ca3af'
                                    }}>{hijri.day}</span>
                                    {total > 0 && (
                                        <span className={`text-sm font-extrabold leading-none px-1.5 py-0.5 rounded-full ${isOverloaded ? 'text-red-700 bg-red-100' : theme.countBadge}`}>
                                            {total}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Orders-on-date Modal ─────────────────────────────────────────────────────
interface DateModalProps {
    dateKey: string
    orders: OrderOnDate[]
    mode: CalendarMode
    workerNameMap: Record<string, string>
    loadingOrderId: string | null
    onClose: () => void
    onViewMore: () => void
    onOrderClick: (order: OrderOnDate) => void
}

function DateOrdersModal({ dateKey, orders, mode, workerNameMap, loadingOrderId, onClose, onViewMore, onOrderClick }: DateModalProps) {
    const [year, monthIndex, day] = dateKey.split('-').map(Number)
    const displayDate = new Date(year, monthIndex - 1, day, 12)
    const hijri = toHijri(displayDate)
    const theme = CALENDAR_THEME[mode]
    const gregorianLabel = displayDate.toLocaleDateString('ar-SA-u-nu-latn', {
        calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric'
    })

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 20 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={`px-6 py-4 flex items-center justify-between ${theme.modalHeader}`}>
                        <div>
                            <p className="text-white font-bold text-lg">{gregorianLabel}</p>
                            <p className={`text-sm ${theme.modalSubText}`}>{hijri.monthName} {hijri.day}، {hijri.year}</p>
                        </div>
                        <button onClick={onClose} className={`text-white hover:text-opacity-80`}><X className="w-6 h-6" /></button>
                    </div>

                    <div className={`px-6 py-2 border-b flex items-center gap-2 ${theme.infoBarBg}`}>
                        <CalendarDays className={`w-4 h-4 ${theme.infoIconText}`} />
                        <span className={`text-sm font-medium ${theme.infoText}`}>
                            {theme.label}:
                            <span className={`font-bold mr-1 ${theme.infoStrong}`}>{orders.length}</span> طلب
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {orders.length === 0 && (
                            <div className="text-center py-6 text-gray-400 text-sm">
                                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p>لا توجد طلبات في هذا التاريخ</p>
                            </div>
                        )}
                        {orders.map((order) => (
                            <button
                                type="button"
                                key={order.id}
                                onClick={() => onOrderClick(order)}
                                disabled={loadingOrderId !== null}
                                className={`w-full text-right bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3 transition-all duration-200 hover:shadow-md ${theme.orderCardHover} disabled:opacity-60 disabled:cursor-wait`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${theme.avatarBg}`}>
                                    {loadingOrderId === order.id ? (
                                        <Loader className={`w-5 h-5 animate-spin ${theme.avatarIcon}`} />
                                    ) : (
                                        <User className={`w-5 h-5 ${theme.avatarIcon}`} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-gray-900 truncate">{order.client_name}</p>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-md border shrink-0 whitespace-nowrap ${ORDER_STATUS_BADGE[order.status]}`}>
                                            {ORDER_STATUS_LABEL[order.status]}
                                        </span>
                                    </div>
                                    {order.worker_id && workerNameMap[order.worker_id] && (
                                        <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                                            <User className="w-3 h-3" />
                                            <span className="truncate">{workerNameMap[order.worker_id]}</span>
                                        </p>
                                    )}
                                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                                        <Phone className="w-3 h-3" />
                                        <span dir="ltr">{order.client_phone}</span>
                                    </p>
                                    {order.order_number && <p className="text-xs text-gray-400 mt-0.5">#{order.order_number}</p>}
                                </div>
                                <Eye className={`w-4 h-4 flex-shrink-0 ${theme.eyeIcon}`} />
                            </button>
                        ))}
                    </div>

                    {/* "عرض المزيد" ينقل لصفحة الطلبات المفلترة حسب التاريخ — متاح فقط للتسليم والبروفا الأولى */}
                    {/* لأن البروفا الثانية تاريخ محسوب (second_proof_date أو due_date − 1) ولا يدعمه فلتر الصفحة */}
                    {orders.length > 0 && mode !== 'second_proof' && (
                        <div className="border-t border-gray-100 p-4">
                            <button
                                onClick={onViewMore}
                                className={`w-full flex items-center justify-center gap-2 py-3 px-4 text-white rounded-xl font-semibold transition-all duration-300 shadow-md hover:shadow-lg ${theme.viewMore}`}
                            >
                                <Eye className="w-5 h-5" />
                                عرض تفاصيل أكثر في صفحة الطلبات
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrderSchedulePage() {
    const router = useRouter()
    const { user, isLoading: authLoading } = useAuthStore()
    const { workerType, isLoading: workerLoading } = useWorkerPermissions()
    const { workers, loadWorkers } = useWorkerStore()

    const now = new Date()
    const [anchorYear, setAnchorYear] = useState(now.getFullYear())
    const [anchorMonth, setAnchorMonth] = useState(now.getMonth())

    const [mode, setMode] = useState<CalendarMode>('delivery')
    // عند true: يعرض تقويم التسليم التواريخ الحقيقية للزبون (customer_due_date)
    // بدلاً من due_date الداخلي المُزاح يومين للخلف
    const [useRealDates, setUseRealDates] = useState(false)
    const [stats, setStats] = useState<Record<string, number>>({})
    const [ordersMap, setOrdersMap] = useState<Record<string, OrderOnDate[]>>({})
    const [isLoadingData, setIsLoadingData] = useState(false)

    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
    const [viewingOrder, setViewingOrder] = useState<Order | null>(null)
    const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null)

    const secondYear = anchorMonth === 11 ? anchorYear + 1 : anchorYear
    const secondMonth = anchorMonth === 11 ? 0 : anchorMonth + 1

    useEffect(() => {
        if (!authLoading && !workerLoading && user && user.role !== 'admin' && workerType !== 'workshop_manager') router.push('/dashboard')
        if (!authLoading && !user) router.push('/login')
    }, [user, authLoading, workerLoading, workerType, router])

    const fetchData = useCallback(async () => {
        setIsLoadingData(true)
        try {
            const result = await orderService.getAll({ pageSize: 500 })
            if (result.data) {
                const newStats: Record<string, number> = {}
                const newOrdersMap: Record<string, OrderOnDate[]> = {}
                result.data.forEach((order) => {
                    if (order.status === 'cancelled') return
                    const deliveryDate = useRealDates
                        ? (order.customer_due_date || order.due_date)
                        : order.due_date
                    // البروفا الثانية تاريخ مُخزَّن قابل للتعديل، وإلا يُحسب كـ due_date − 1 (migration 51)
                    const secondProofDate = order.second_proof_date || shiftDate(order.due_date, -1)
                    const key = mode === 'delivery'
                        ? (deliveryDate || '').slice(0, 10)
                        : mode === 'proof'
                            ? (order.proof_delivery_date || '').slice(0, 10)
                            : (secondProofDate || '').slice(0, 10)
                    if (!key) return
                    if (mode === 'delivery' && (order.status === 'delivered' || order.status === 'completed')) return
                    if (mode === 'proof' && (order.status === 'delivered')) return
                    if (mode === 'second_proof' && (order.status === 'delivered')) return
                    newStats[key] = (newStats[key] || 0) + 1
                    if (!newOrdersMap[key]) newOrdersMap[key] = []
                    newOrdersMap[key].push({
                        id: order.id,
                        client_name: order.client_name,
                        client_phone: order.client_phone,
                        order_number: order.order_number,
                        status: order.status,
                        worker_id: order.worker_id || null,
                    })
                })
                setStats(newStats)
                setOrdersMap(newOrdersMap)
            }
        } finally {
            setIsLoadingData(false)
        }
    }, [mode, useRealDates])

    useEffect(() => { if (user) fetchData() }, [fetchData, user])
    useEffect(() => { if (user) loadWorkers() }, [user, loadWorkers])

    const workerNameMap = workers.reduce<Record<string, string>>((acc, w) => {
        if (w.user?.full_name) acc[w.id] = w.user.full_name
        return acc
    }, {})

    // Navigation: RIGHT = next months, LEFT = prev months (RTL convention)
    const goToNextMonths = () => {
        if (anchorMonth >= 11) { setAnchorYear(y => y + 1); setAnchorMonth(0) }
        else setAnchorMonth(m => Math.min(m + 2, 11))
    }
    const goToPrevMonths = () => {
        if (anchorMonth === 0) { setAnchorYear(y => y - 1); setAnchorMonth(11) }
        else setAnchorMonth(m => Math.max(m - 2, 0))
    }

    // فتح بطاقة تفاصيل الطلب بنفس طريقة بطاقات صفحة الطلبات
    const handleOrderClick = async (order: OrderOnDate) => {
        setLoadingOrderId(order.id)
        try {
            const result = await orderService.getById(order.id)
            if (result.data) {
                setViewingOrder(result.data)
            }
        } finally {
            setLoadingOrderId(null)
        }
    }

    if (authLoading || !user) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    const selectedOrders = selectedDateKey ? (ordersMap[selectedDateKey] || []) : []

    return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors font-medium">
                        <ArrowRight className="w-4 h-4" />
                        <span>العودة للوحة التحكم</span>
                    </Link>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                            مواعيد الطلبات
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">عرض جميع مواعيد التسليم والبروفا الأولى والثانية</p>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                    {/* Switch */}
                    <div className="bg-white rounded-full p-1 shadow-sm border border-gray-200 flex flex-wrap gap-1 justify-center">
                        <button onClick={() => setMode('delivery')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${mode === 'delivery' ? CALENDAR_THEME.delivery.toggleActive : CALENDAR_THEME.delivery.toggleHover}`}>
                            موعد التسليم
                        </button>
                        <button onClick={() => setMode('proof')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${mode === 'proof' ? CALENDAR_THEME.proof.toggleActive : CALENDAR_THEME.proof.toggleHover}`}>
                            موعد تسليم البروفا
                        </button>
                        <button onClick={() => setMode('second_proof')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${mode === 'second_proof' ? CALENDAR_THEME.second_proof.toggleActive : CALENDAR_THEME.second_proof.toggleHover}`}>
                            موعد البروفا الثانية
                        </button>
                    </div>

                    {/* زر عرض المواعيد الحقيقية — يبدّل تقويم التسليم بين التاريخ الداخلي والتاريخ الحقيقي للزبون */}
                    {mode === 'delivery' && (
                        <button onClick={() => setUseRealDates(v => !v)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all duration-300 ${useRealDates
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500 shadow-md'
                                : 'bg-white text-amber-600 border-amber-300 hover:bg-amber-50'}`}>
                            <CalendarCheck className="w-4 h-4" />
                            {useRealDates ? 'عرض المواعيد المُعدّلة' : 'عرض المواعيد الحقيقية'}
                        </button>
                    )}

                    {isLoadingData && (
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Loader className="w-4 h-4 animate-spin" />
                            <span>جاري تحميل البيانات...</span>
                        </div>
                    )}

                    {/* Nav: RIGHT = next months, LEFT = prev months */}
                    <div className="flex items-center gap-2 sm:mr-auto">
                        <button onClick={goToNextMonths}
                            className="p-2 bg-white rounded-full shadow-sm border border-gray-200 hover:bg-pink-50 hover:border-pink-200 transition-all">
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                        <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
                            {arabicMonths[anchorMonth]} – {arabicMonths[secondMonth]} {secondYear !== anchorYear ? `(${anchorYear}/${secondYear})` : anchorYear}
                        </span>
                        <button onClick={goToPrevMonths}
                            className="p-2 bg-white rounded-full shadow-sm border border-gray-200 hover:bg-pink-50 hover:border-pink-200 transition-all">
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="grid grid-cols-1 gap-6">
                    <MonthCalendar year={anchorYear} month={anchorMonth} mode={mode} stats={stats} onDateClick={setSelectedDateKey} />
                    <MonthCalendar year={secondYear} month={secondMonth} mode={mode} stats={stats} onDateClick={setSelectedDateKey} />
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="mt-4 flex flex-wrap gap-4 justify-center text-xs text-gray-500">
                    <div className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded ${CALENDAR_THEME[mode].legendDot}`} /><span>به طلبات</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300" /><span>أكثر من {CALENDAR_THEME[mode].overloadLegend} طلبات</span></div>
                    <div className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded border-2 ${CALENDAR_THEME[mode].legendRing}`} /><span>اليوم</span></div>
                </motion.div>
            </div>

            {selectedDateKey && (
                <DateOrdersModal
                    dateKey={selectedDateKey}
                    orders={selectedOrders}
                    mode={mode}
                    workerNameMap={workerNameMap}
                    loadingOrderId={loadingOrderId}
                    onClose={() => setSelectedDateKey(null)}
                    onOrderClick={handleOrderClick}
                    onViewMore={() => {
                        const typeParam = mode === 'delivery' ? 'delivery' : 'proof'
                        router.push(`/dashboard/orders?date=${selectedDateKey}&type=${typeParam}`)
                    }}
                />
            )}

            <OrderModal
                order={viewingOrder}
                workers={workers}
                isOpen={!!viewingOrder}
                onClose={() => setViewingOrder(null)}
            />
        </div>
    )
}
