'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, CalendarDays, Plus, X, Phone, User, Eye, Loader, Settings, Trash2, Edit3, Check } from 'lucide-react'
import Link from 'next/link'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moment = require('moment-hijri')
import { useAuthStore } from '@/store/authStore'
import { orderService } from '@/lib/services/order-service'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { toLocalDateKey } from '@/lib/date-utils'

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

// ─── Types ────────────────────────────────────────────────────────────────────
type CalendarMode = 'delivery' | 'proof'

interface ExtraSlot {
    id: string
    date_key: string
    count: number
    slot_type: 'delivery' | 'proof'
    label?: string
}

interface OrderOnDate {
    id: string
    client_name: string
    client_phone: string
    order_number: string
}

// ─── Supabase extra-slots service ─────────────────────────────────────────────
// SQL to create/update:
//   CREATE TABLE IF NOT EXISTS schedule_extra_slots (
//     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//     date_key text NOT NULL,
//     count integer NOT NULL DEFAULT 1,
//     slot_type text NOT NULL DEFAULT 'delivery',
//     label text,
//     created_at timestamptz DEFAULT now()
//   );
//   ALTER TABLE schedule_extra_slots ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Allow all for authenticated" ON schedule_extra_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
//   -- If table already exists, add column:
//   ALTER TABLE schedule_extra_slots ADD COLUMN IF NOT EXISTS slot_type text NOT NULL DEFAULT 'delivery';

const extraSlotsService = {
    async getAll(): Promise<ExtraSlot[]> {
        if (!isSupabaseConfigured()) return []
        const { data } = await supabase.from('schedule_extra_slots').select('*').order('date_key')
        return (data as ExtraSlot[]) || []
    },
    async add(date_key: string, count: number, slot_type: 'delivery' | 'proof', label?: string): Promise<ExtraSlot | null> {
        if (!isSupabaseConfigured()) return null
        const { data } = await supabase
            .from('schedule_extra_slots')
            .insert({ date_key, count, slot_type, label: label || null })
            .select()
            .single()
        return data as ExtraSlot | null
    },
    async update(id: string, count: number, label?: string): Promise<boolean> {
        if (!isSupabaseConfigured()) return false
        const { error } = await supabase
            .from('schedule_extra_slots')
            .update({ count, label: label || null })
            .eq('id', id)
        return !error
    },
    async delete(id: string): Promise<boolean> {
        if (!isSupabaseConfigured()) return false
        const { error } = await supabase.from('schedule_extra_slots').delete().eq('id', id)
        return !error
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
    extraSlots: ExtraSlot[]
    onDateClick: (dateKey: string) => void
}

function MonthCalendar({ year, month, mode, stats, extraSlots, onDateClick }: MonthCalendarProps) {
    const todayKey = toLocalDateKey(new Date())
    const hijriFirstDay = toHijri(new Date(year, month, 1, 12))
    const gregorianMonth = arabicMonths[month]
    const rows = buildMonthGrid(year, month)

    // Build extra count map — filtered by current mode
    const extraMap: Record<string, number> = {}
    for (const slot of extraSlots) {
        if (slot.slot_type === mode) {
            extraMap[slot.date_key] = (extraMap[slot.date_key] || 0) + slot.count
        }
    }

    const isProof = mode === 'proof'

    return (
        <div className={`bg-white rounded-2xl shadow-md border overflow-hidden ${isProof ? 'border-green-100' : 'border-pink-100'}`}>
            {/* Month Header */}
            <div className={`px-4 py-3 border-b text-center ${isProof ? 'bg-[#d1fae5] border-[#6ee7b7]' : 'bg-gradient-to-r from-pink-50 to-rose-50 border-pink-100'}`}>
                <div className={`text-lg font-bold ${isProof ? 'text-green-900' : 'text-pink-900'}`}>{gregorianMonth} {year}</div>
                <div className={`text-sm font-medium ${isProof ? 'text-green-700' : 'text-pink-700'}`}>{hijriFirstDay.monthName} {hijriFirstDay.year}</div>
            </div>

            {/* Day names row - full names, LTR order */}
            <div dir="ltr" className={`grid grid-cols-7 border-b ${isProof ? 'bg-[#ecfdf5] border-[#d1fae5]' : 'bg-pink-50 border-pink-100'}`}>
                {arabicDayNames.map((d, i) => (
                    <div key={d} className={`py-2 text-center text-[11px] sm:text-xs font-bold truncate px-0.5 ${i === 5 ? 'text-black bg-gray-100' : (isProof ? 'text-[#047857]' : 'text-rose-800')}`}>
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
                            const realCount = stats[dateKey] || 0
                            const extra = extraMap[dateKey] || 0
                            const total = realCount + extra
                            const isToday = dateKey === todayKey
                            const isOverloaded = isProof ? total >= 4 : total >= 6
                            const hijri = toHijri(date)
                            const isFriday = date.getDay() === 5

                            return (
                                <button
                                    key={ci}
                                    onClick={() => onDateClick(dateKey)}
                                    className={`
                    aspect-square flex flex-col items-center justify-center rounded-lg m-0.5 transition-all duration-200 gap-0.5
                    ${isToday ? (isProof ? 'ring-2 ring-green-500' : 'ring-2 ring-pink-500') : ''}
                    ${isOverloaded ? 'bg-red-50 border border-red-200 hover:bg-red-100' : isFriday ? 'bg-gray-100 hover:bg-gray-200' : (isProof ? 'hover:bg-green-50' : 'hover:bg-pink-50')}
                    cursor-pointer
                  `}
                                >
                                    {isFriday && (
                                        <span className="text-[10px] text-black font-bold leading-none">✕</span>
                                    )}
                                    <span className={`text-xl font-bold leading-none ${isOverloaded ? 'text-red-700' : isFriday ? 'text-black' : isToday ? (isProof ? 'text-[#10b981]' : 'text-pink-600') : 'text-gray-800'}`}>
                                        {date.getDate()}
                                    </span>
                                    <span className="text-xs text-gray-400 leading-none">{hijri.day}</span>
                                    {total > 0 && (
                                        <span className={`text-sm font-extrabold leading-none px-1.5 py-0.5 rounded-full ${isOverloaded ? 'text-red-700 bg-red-100' : (isProof ? 'text-green-900 bg-[#d1fae5]' : 'text-pink-700 bg-pink-100')}`}>
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
    extraSlots: ExtraSlot[]
    mode: CalendarMode
    onClose: () => void
    onViewMore: () => void
}

function DateOrdersModal({ dateKey, orders, extraSlots, mode, onClose, onViewMore }: DateModalProps) {
    const [year, monthIndex, day] = dateKey.split('-').map(Number)
    const displayDate = new Date(year, monthIndex - 1, day, 12)
    const hijri = toHijri(displayDate)
    const gregorianLabel = displayDate.toLocaleDateString('ar-SA', {
        calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric'
    })
    const extraCount = extraSlots.reduce((s, sl) => s + sl.count, 0)

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
                    <div className={`px-6 py-4 flex items-center justify-between ${mode === 'proof' ? 'bg-gradient-to-r from-[#10b981] to-[#059669]' : 'bg-gradient-to-r from-pink-500 to-rose-600'}`}>
                        <div>
                            <p className="text-white font-bold text-lg">{gregorianLabel}</p>
                            <p className={`text-sm ${mode === 'proof' ? 'text-green-100' : 'text-pink-100'}`}>{hijri.monthName} {hijri.day}، {hijri.year}</p>
                        </div>
                        <button onClick={onClose} className={`text-white hover:text-opacity-80`}><X className="w-6 h-6" /></button>
                    </div>

                    <div className={`px-6 py-2 border-b flex items-center gap-2 ${mode === 'proof' ? 'bg-[#ecfdf5] border-[#d1fae5]' : 'bg-pink-50 border-pink-100'}`}>
                        <CalendarDays className={`w-4 h-4 ${mode === 'proof' ? 'text-[#047857]' : 'text-pink-600'}`} />
                        <span className={`text-sm font-medium ${mode === 'proof' ? 'text-[#047857]' : 'text-pink-700'}`}>
                            {mode === 'delivery' ? 'مواعيد التسليم' : 'مواعيد البروفا'}:
                            <span className={`font-bold mr-1 ${mode === 'proof' ? 'text-green-900' : 'text-pink-900'}`}>{orders.length + extraCount}</span> طلب
                        </span>
                        {extraCount > 0 && (
                            <span className="text-xs text-gray-400 mr-auto">({extraCount} مضاف يدوياً)</span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {orders.length === 0 && extraCount > 0 && extraSlots.filter(s => s.label).length === 0 && (
                            <div className="text-center py-6 text-gray-400 text-sm">
                                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p>لا توجد طلبات فعلية في هذا التاريخ</p>
                            </div>
                        )}
                        {orders.map((order) => (
                            <div key={order.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${mode === 'proof' ? 'bg-[#d1fae5]' : 'bg-pink-100'}`}>
                                    <User className={`w-5 h-5 ${mode === 'proof' ? 'text-[#047857]' : 'text-pink-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{order.client_name}</p>
                                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                                        <Phone className="w-3 h-3" />
                                        <span dir="ltr">{order.client_phone}</span>
                                    </p>
                                    {order.order_number && <p className="text-xs text-gray-400 mt-0.5">#{order.order_number}</p>}
                                </div>
                            </div>
                        ))}
                        {extraSlots.filter(slot => slot.label).map((slot) => (
                            <div key={slot.id} className="bg-white border border-dashed border-gray-300 rounded-xl p-4 shadow-sm flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${mode === 'proof' ? 'bg-[#d1fae5]' : 'bg-pink-100'}`}>
                                    <User className={`w-5 h-5 ${mode === 'proof' ? 'text-[#047857]' : 'text-pink-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className="font-semibold text-gray-900 truncate max-w-[70%]">{slot.label}</p>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-md border ${mode === 'proof' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-pink-50 text-pink-700 border-pink-200'} shrink-0 whitespace-nowrap`}>
                                            مضاف بشكل يدوي
                                        </span>
                                    </div>
                                    {slot.count > 1 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            العدد: <span className="font-bold">{slot.count}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {orders.length > 0 && (
                        <div className="border-t border-gray-100 p-4">
                            <button
                                onClick={onViewMore}
                                className={`w-full flex items-center justify-center gap-2 py-3 px-4 text-white rounded-xl font-semibold transition-all duration-300 shadow-md hover:shadow-lg ${mode === 'proof' ? 'bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857]' : 'bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700'}`}
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

// ─── Add Slot Modal ───────────────────────────────────────────────────────────
interface AddSlotModalProps {
    defaultMode: CalendarMode
    onClose: () => void
    onAdd: (dateKey: string, count: number, slotType: CalendarMode, label: string) => Promise<void>
}

function AddSlotModal({ defaultMode, onClose, onAdd }: AddSlotModalProps) {
    const today = toLocalDateKey(new Date())
    const [dateKey, setDateKey] = useState(today)
    const [count, setCount] = useState(1)
    const [label, setLabel] = useState('')
    const [slotType, setSlotType] = useState<CalendarMode>(defaultMode)
    const [saving, setSaving] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!dateKey || count < 1) return
        setSaving(true)
        await onAdd(dateKey, count, slotType, label)
        setSaving(false)
        onClose()
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-6 py-4 flex items-center justify-between">
                        <h2 className="text-white font-bold text-lg">إضافة موعد جديد</h2>
                        <button onClick={onClose} className="text-white hover:text-teal-200"><X className="w-6 h-6" /></button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {/* Slot Type Toggle */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">نوع الموعد</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setSlotType('delivery')}
                                    className={`py-2 px-3 rounded-lg text-sm font-semibold border-2 transition-all ${slotType === 'delivery'
                                        ? 'bg-pink-500 text-white border-pink-500'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-pink-300'
                                        }`}>
                                    🗓️ موعد تسليم
                                </button>
                                <button type="button" onClick={() => setSlotType('proof')}
                                    className={`py-2 px-3 rounded-lg text-sm font-semibold border-2 transition-all ${slotType === 'proof'
                                        ? 'bg-[#10b981] text-white border-[#10b981]'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-[#10b981]'
                                        }`}>
                                    📋 موعد بروفا
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                            <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-400 focus:border-teal-400 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">عدد المواعيد المضافة</label>
                            <input type="number" min={1} max={99} value={count}
                                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-400 focus:border-teal-400 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (اختياري)</label>
                            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: أحمد عبد الله"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-400 focus:border-teal-400 text-sm" />
                        </div>
                        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                            ⚠️ هذا الموعد يُخزّن في قاعدة البيانات ويظهر على جميع الأجهزة، لكنه لا يؤثر على صفحة الطلبات.
                        </p>
                        <button type="submit" disabled={saving}
                            className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold hover:from-teal-600 hover:to-cyan-700 transition-all duration-300 shadow-md disabled:opacity-60 flex items-center justify-center gap-2">
                            {saving && <Loader className="w-4 h-4 animate-spin" />}
                            {saving ? 'جاري الحفظ...' : 'إضافة'}
                        </button>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// ─── Manage Extra Slots Modal ──────────────────────────────────────────────────
interface ManageExtraSlotsProps {
    slots: ExtraSlot[]
    onDelete: (id: string) => Promise<void>
    onUpdate: (id: string, count: number, label: string) => Promise<void>
    onClose: () => void
}

function ManageExtraSlotsModal({ slots, onDelete, onUpdate, onClose }: ManageExtraSlotsProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editCount, setEditCount] = useState(1)
    const [editLabel, setEditLabel] = useState('')
    const [saving, setSaving] = useState<string | null>(null)

    const startEdit = (slot: ExtraSlot) => {
        setEditingId(slot.id)
        setEditCount(slot.count)
        setEditLabel(slot.label || '')
    }

    const saveEdit = async (id: string) => {
        setSaving(id)
        await onUpdate(id, editCount, editLabel)
        setSaving(null)
        setEditingId(null)
    }

    const handleDelete = async (id: string) => {
        setSaving(id)
        await onDelete(id)
        setSaving(null)
    }

    const formatDate = (dateKey: string) => {
        const [y, m, d] = dateKey.split('-').map(Number)
        return new Date(y, m - 1, d, 12).toLocaleDateString('ar-SA', {
            calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric'
        })
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-6 py-4 flex items-center justify-between">
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <Settings className="w-5 h-5" /> إدارة المواعيد المضافة يدوياً
                        </h2>
                        <button onClick={onClose} className="text-white hover:text-gray-300"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {slots.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>لا توجد مواعيد مضافة يدوياً</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {slots.map((slot) => (
                                    <div key={slot.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                        {editingId === slot.id ? (
                                            <div className="space-y-2">
                                                <p className="text-xs text-gray-500 font-medium">{formatDate(slot.date_key)}</p>
                                                <div className="flex gap-2">
                                                    <input type="number" min={1} max={99} value={editCount}
                                                        onChange={(e) => setEditCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-400" />
                                                    <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                                                        placeholder="ملاحظة..."
                                                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-400" />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => saveEdit(slot.id)} disabled={saving === slot.id}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-medium hover:bg-teal-600 disabled:opacity-60">
                                                        {saving === slot.id ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                        حفظ
                                                    </button>
                                                    <button onClick={() => setEditingId(null)}
                                                        className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-300">
                                                        إلغاء
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1">
                                                    <p className="font-medium text-gray-900 text-sm">{formatDate(slot.date_key)}</p>
                                                    {slot.label && <p className="text-xs text-gray-500 mt-0.5">{slot.label}</p>}
                                                    <span className="inline-block mt-1 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs font-bold">
                                                        +{slot.count} موعد
                                                    </span>
                                                </div>
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => startEdit(slot)}
                                                        className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(slot.id)} disabled={saving === slot.id}
                                                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60">
                                                        {saving === slot.id ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-gray-100 p-4">
                        <button onClick={onClose}
                            className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">
                            إغلاق
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrderSchedulePage() {
    const router = useRouter()
    const { user, isLoading: authLoading } = useAuthStore()

    const now = new Date()
    const [anchorYear, setAnchorYear] = useState(now.getFullYear())
    const [anchorMonth, setAnchorMonth] = useState(now.getMonth())

    const [mode, setMode] = useState<CalendarMode>('delivery')
    const [stats, setStats] = useState<Record<string, number>>({})
    const [ordersMap, setOrdersMap] = useState<Record<string, OrderOnDate[]>>({})
    const [isLoadingData, setIsLoadingData] = useState(false)
    const [extraSlots, setExtraSlots] = useState<ExtraSlot[]>([])
    const [isLoadingExtras, setIsLoadingExtras] = useState(false)

    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
    const [showAddSlot, setShowAddSlot] = useState(false)
    const [showManage, setShowManage] = useState(false)

    const secondYear = anchorMonth === 11 ? anchorYear + 1 : anchorYear
    const secondMonth = anchorMonth === 11 ? 0 : anchorMonth + 1

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') router.push('/dashboard')
        if (!authLoading && !user) router.push('/login')
    }, [user, authLoading, router])

    const fetchExtras = useCallback(async () => {
        setIsLoadingExtras(true)
        const data = await extraSlotsService.getAll()
        setExtraSlots(data)
        setIsLoadingExtras(false)
    }, [])

    const fetchData = useCallback(async () => {
        setIsLoadingData(true)
        try {
            const result = await orderService.getAll({ pageSize: 500 })
            if (result.data) {
                const newStats: Record<string, number> = {}
                const newOrdersMap: Record<string, OrderOnDate[]> = {}
                result.data.forEach((order) => {
                    if (order.status === 'cancelled') return
                    const key = mode === 'delivery'
                        ? (order.due_date || '').slice(0, 10)
                        : (order.proof_delivery_date || '').slice(0, 10)
                    if (!key) return
                    if (mode === 'proof' && (order.status === 'delivered')) return
                    newStats[key] = (newStats[key] || 0) + 1
                    if (!newOrdersMap[key]) newOrdersMap[key] = []
                    newOrdersMap[key].push({ id: order.id, client_name: order.client_name, client_phone: order.client_phone, order_number: order.order_number })
                })
                setStats(newStats)
                setOrdersMap(newOrdersMap)
            }
        } finally {
            setIsLoadingData(false)
        }
    }, [mode])

    useEffect(() => { if (user) { fetchData(); fetchExtras() } }, [fetchData, fetchExtras, user])

    // Navigation: RIGHT = next months, LEFT = prev months (RTL convention)
    const goToNextMonths = () => {
        if (anchorMonth >= 11) { setAnchorYear(y => y + 1); setAnchorMonth(0) }
        else setAnchorMonth(m => Math.min(m + 2, 11))
    }
    const goToPrevMonths = () => {
        if (anchorMonth === 0) { setAnchorYear(y => y - 1); setAnchorMonth(11) }
        else setAnchorMonth(m => Math.max(m - 2, 0))
    }

    const handleAddExtraSlot = async (dateKey: string, count: number, slotType: CalendarMode, label: string) => {
        const newSlot = await extraSlotsService.add(dateKey, count, slotType, label)
        if (newSlot) setExtraSlots(prev => [...prev, newSlot])
    }

    const handleDeleteExtra = async (id: string) => {
        const ok = await extraSlotsService.delete(id)
        if (ok) setExtraSlots(prev => prev.filter(s => s.id !== id))
    }

    const handleUpdateExtra = async (id: string, count: number, label: string) => {
        const ok = await extraSlotsService.update(id, count, label)
        if (ok) setExtraSlots(prev => prev.map(s => s.id === id ? { ...s, count, label } : s))
    }

    if (authLoading || !user) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    const selectedOrders = selectedDateKey ? (ordersMap[selectedDateKey] || []) : []
    const selectedExtras = extraSlots.filter(s => s.date_key === selectedDateKey && s.slot_type === mode)

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
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                            مواعيد الطلبات
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">عرض جميع مواعيد التسليم والبروفا</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowManage(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm shadow-sm">
                            <Settings className="w-4 h-4" />
                            إدارة المضافة
                            {extraSlots.length > 0 && (
                                <span className="bg-pink-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{extraSlots.length}</span>
                            )}
                        </button>
                        <button onClick={() => setShowAddSlot(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold hover:from-teal-600 hover:to-cyan-700 transition-all duration-300 shadow-md text-sm">
                            <Plus className="w-4 h-4" />
                            إضافة موعد جديد
                        </button>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                    {/* Switch */}
                    <div className="bg-white rounded-full p-1 shadow-sm border border-gray-200 flex gap-1">
                        <button onClick={() => setMode('delivery')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${mode === 'delivery' ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-md' : 'text-gray-500 hover:text-pink-600'}`}>
                            موعد التسليم
                        </button>
                        <button onClick={() => setMode('proof')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${mode === 'proof' ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md' : 'text-gray-500 hover:text-green-600'}`}>
                            موعد تسليم البروفا
                        </button>
                    </div>

                    {(isLoadingData || isLoadingExtras) && (
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
                    <MonthCalendar year={anchorYear} month={anchorMonth} mode={mode} stats={stats} extraSlots={extraSlots} onDateClick={setSelectedDateKey} />
                    <MonthCalendar year={secondYear} month={secondMonth} mode={mode} stats={stats} extraSlots={extraSlots} onDateClick={setSelectedDateKey} />
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="mt-4 flex flex-wrap gap-4 justify-center text-xs text-gray-500">
                    <div className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded ${mode === 'proof' ? 'bg-[#10b981]' : 'bg-pink-500'}`} /><span>به طلبات</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300" /><span>أكثر من {mode === 'proof' ? '3' : '5'} طلبات</span></div>
                    <div className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded border-2 ${mode === 'proof' ? 'border-[#10b981]' : 'border-pink-500'}`} /><span>اليوم</span></div>
                </motion.div>
            </div>

            {selectedDateKey && (
                <DateOrdersModal
                    dateKey={selectedDateKey}
                    orders={selectedOrders}
                    extraSlots={selectedExtras}
                    mode={mode}
                    onClose={() => setSelectedDateKey(null)}
                    onViewMore={() => {
                        const typeParam = mode === 'delivery' ? 'delivery' : 'proof'
                        router.push(`/dashboard/orders?date=${selectedDateKey}&type=${typeParam}`)
                    }}
                />
            )}

            {showAddSlot && (
                <AddSlotModal
                    defaultMode={mode}
                    onClose={() => setShowAddSlot(false)}
                    onAdd={handleAddExtraSlot}
                />
            )}

            {showManage && (
                <ManageExtraSlotsModal
                    slots={extraSlots}
                    onDelete={handleDeleteExtra}
                    onUpdate={handleUpdateExtra}
                    onClose={() => setShowManage(false)}
                />
            )}
        </div>
    )
}
