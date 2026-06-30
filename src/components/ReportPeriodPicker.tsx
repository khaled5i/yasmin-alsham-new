'use client'

import { useEffect, useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Filter, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export type DateRange =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'week'
  | 'month'
  | 'lastMonth'
  | 'quarter'
  | 'year'
  | 'custom'

export interface DateFilter {
  startDate: Date
  endDate: Date
}

// ============================================================================
// Constants
// ============================================================================

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const arabicDayNames = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

// الاختصارات الجانبية للفترات
export const PERIOD_PRESETS: { key: Exclude<DateRange, 'custom'>; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'last7days', label: 'آخر ٧ أيام' },
  { key: 'last30days', label: 'آخر ٣٠ يوم' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: 'quarter', label: 'هذا الربع' },
  { key: 'year', label: 'هذا العام' },
]

// ============================================================================
// Date Helpers
// ============================================================================

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

const formatArabic = (d: Date) => `${d.getDate()} ${arabicMonths[d.getMonth()]} ${d.getFullYear()}`

// حساب نطاق التاريخ لاختصار معيّن
export function computePresetRange(key: Exclude<DateRange, 'custom'>): DateFilter {
  const now = new Date()
  const today = startOfDay(now)
  const dayMs = 24 * 60 * 60 * 1000

  switch (key) {
    case 'today':
      return { startDate: today, endDate: endOfDay(today) }
    case 'yesterday': {
      const y = new Date(today.getTime() - dayMs)
      return { startDate: y, endDate: endOfDay(y) }
    }
    case 'last7days':
      return { startDate: new Date(today.getTime() - 6 * dayMs), endDate: endOfDay(today) }
    case 'last30days':
      return { startDate: new Date(today.getTime() - 29 * dayMs), endDate: endOfDay(today) }
    case 'week': {
      const ws = new Date(today)
      ws.setDate(today.getDate() - today.getDay())
      return { startDate: ws, endDate: endOfDay(new Date(ws.getTime() + 6 * dayMs)) }
    }
    case 'month':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      }
    case 'lastMonth':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        endDate: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      }
    case 'quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3
      return {
        startDate: new Date(now.getFullYear(), qm, 1),
        endDate: new Date(now.getFullYear(), qm + 3, 0, 23, 59, 59, 999),
      }
    }
    case 'year':
      return {
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      }
  }
}

// النص المعروض للفترة الحالية
export function getPeriodLabel(period: DateRange, range: DateFilter): string {
  if (period === 'custom') {
    if (startOfDay(range.startDate).getTime() === startOfDay(range.endDate).getTime()) {
      return formatArabic(range.startDate)
    }
    return `${formatArabic(range.startDate)} — ${formatArabic(range.endDate)}`
  }
  return PERIOD_PRESETS.find(p => p.key === period)?.label ?? 'مخصص'
}

// ============================================================================
// Component
// ============================================================================

interface ReportPeriodPickerProps {
  period: DateRange
  range: DateFilter
  onApply: (period: DateRange, range: DateFilter) => void
  className?: string
}

export default function ReportPeriodPicker({ period, range, onApply, className = '' }: ReportPeriodPickerProps) {
  const [open, setOpen] = useState(false)
  const [tempStart, setTempStart] = useState<Date | null>(range.startDate)
  const [tempEnd, setTempEnd] = useState<Date | null>(range.endDate)

  const today = endOfDay(new Date())

  // مزامنة الحالة المؤقتة مع النطاق الحالي عند فتح النافذة
  useEffect(() => {
    if (open) {
      setTempStart(range.startDate)
      setTempEnd(range.endDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // قفل تمرير الصفحة أثناء فتح النافذة
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  const applyPreset = (key: Exclude<DateRange, 'custom'>) => {
    onApply(key, computePresetRange(key))
    setOpen(false)
  }

  const applyCustom = () => {
    if (!tempStart) return
    const start = startOfDay(tempStart)
    const end = endOfDay(tempEnd ?? tempStart) // النقر على نفس اليوم = يوم واحد
    onApply('custom', { startDate: start, endDate: end })
    setOpen(false)
  }

  // النقرة الأولى تحدد البداية، والثانية تحدد النهاية (selectsRange)
  const onRangeChange = (dates: [Date | null, Date | null] | null) => {
    const [start, end] = dates ?? [null, null]
    setTempStart(start)
    setTempEnd(end)
  }

  const renderHeader = ({
    date,
    decreaseMonth,
    increaseMonth,
    prevMonthButtonDisabled,
    nextMonthButtonDisabled,
  }: {
    date: Date
    decreaseMonth: () => void
    increaseMonth: () => void
    prevMonthButtonDisabled: boolean
    nextMonthButtonDisabled: boolean
  }) => (
    <div className="flex items-center justify-between px-2 py-1">
      <button
        type="button"
        onClick={decreaseMonth}
        disabled={prevMonthButtonDisabled}
        className="p-1 rounded-full hover:bg-pink-100 disabled:opacity-40 transition-colors"
      >
        <ChevronRight className="w-5 h-5 text-pink-700" />
      </button>
      <span className="text-sm font-bold text-pink-900">
        {arabicMonths[date.getMonth()]} {date.getFullYear()}
      </span>
      <button
        type="button"
        onClick={increaseMonth}
        disabled={nextMonthButtonDisabled}
        className="p-1 rounded-full hover:bg-pink-100 disabled:opacity-40 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-pink-700" />
      </button>
    </div>
  )

  const weekDayFormatter = (nameOfDay: string) => {
    const i = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(nameOfDay)
    return i >= 0 ? arabicDayNames[i] : nameOfDay.slice(0, 3)
  }

  return (
    <>
      {/* زر الفلتر */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 pr-3 pl-3 sm:pr-4 sm:pl-4 py-2 sm:py-2.5 border-2 border-gray-200 rounded-lg sm:rounded-xl bg-white hover:border-pink-300 hover:shadow-sm transition-all duration-300 cursor-pointer text-xs sm:text-sm font-medium text-gray-700 ${className}`}
      >
        <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-500 flex-shrink-0" />
        <span className="font-semibold text-gray-800 truncate max-w-[200px]">{getPeriodLabel(period, range)}</span>
        <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            >
              {/* الترويسة */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
                <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-pink-600" />
                  تحديد الفترة الزمنية
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* المحتوى */}
              <div className="flex flex-col md:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
                {/* الاختصارات الجانبية */}
                <div className="flex flex-row flex-wrap md:flex-col gap-2 md:w-44 md:flex-shrink-0">
                  {PERIOD_PRESETS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p.key)}
                      className={`text-xs sm:text-sm font-semibold rounded-lg px-3 py-2 text-right transition-all duration-200 flex-1 md:flex-initial ${
                        period === p.key
                          ? 'bg-pink-600 text-white shadow-md'
                          : 'bg-gray-50 text-gray-700 hover:bg-pink-50 hover:text-pink-700 border border-gray-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* التقويم الواحد - نقرة للبداية ونقرة للنهاية */}
                <div className="flex-1 report-range-cal flex flex-col items-center">
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                    <span className="text-xs font-bold text-pink-700 bg-pink-50 px-3 py-1 rounded-full">
                      من: {tempStart ? formatArabic(tempStart) : '—'}
                    </span>
                    <span className="text-gray-300">←</span>
                    <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
                      إلى: {tempEnd ? formatArabic(tempEnd) : (tempStart ? formatArabic(tempStart) : '—')}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2 text-center">
                    اضغط لتحديد البداية ثم اضغط مرة أخرى لتحديد النهاية — ونفس اليوم مرتين = يوم واحد
                  </p>
                  <DatePicker
                    inline
                    selectsRange
                    startDate={tempStart}
                    endDate={tempEnd}
                    onChange={onRangeChange}
                    maxDate={today}
                    renderCustomHeader={renderHeader}
                    formatWeekDay={weekDayFormatter}
                  />
                </div>
              </div>

              {/* التذييل */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                <span className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                  {tempStart ? formatArabic(tempStart) : '—'} — {tempEnd ? formatArabic(tempEnd) : (tempStart ? formatArabic(tempStart) : '—')}
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={applyCustom}
                    disabled={!tempStart}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    تطبيق
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .report-range-cal .react-datepicker {
          border: 1px solid #f3e8ff;
          border-radius: 0.75rem;
          font-family: inherit;
          box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08);
          direction: ltr;
        }
        .report-range-cal .react-datepicker__header {
          background-color: #fdf2f8;
          border-bottom: 1px solid #fbcfe8;
          padding-top: 0.5rem;
        }
        .report-range-cal .react-datepicker__day-name {
          color: #9d174d;
          font-weight: 600;
        }
        .report-range-cal .react-datepicker__day {
          border-radius: 9999px;
          transition: all 0.15s ease;
        }
        .report-range-cal .react-datepicker__day:hover {
          background-color: #fce7f3;
          border-radius: 9999px;
        }
        .report-range-cal .react-datepicker__day--in-range,
        .report-range-cal .react-datepicker__day--in-selecting-range {
          background-color: #fbcfe8;
          color: #831843;
          border-radius: 0;
        }
        .report-range-cal .react-datepicker__day--selected,
        .report-range-cal .react-datepicker__day--range-start,
        .report-range-cal .react-datepicker__day--range-end,
        .report-range-cal .react-datepicker__day--selecting-range-start,
        .report-range-cal .react-datepicker__day--selecting-range-end {
          background-color: #ec4899 !important;
          color: #ffffff !important;
          font-weight: 700;
          border-radius: 9999px;
        }
        .report-range-cal .react-datepicker__day--keyboard-selected {
          background-color: #f9a8d4;
          color: #831843;
        }
        .report-range-cal .react-datepicker__day--today {
          font-weight: 700;
          border: 2px solid #f9a8d4;
        }
        .report-range-cal .react-datepicker__day--disabled {
          opacity: 0.35;
        }
        .report-range-cal .react-datepicker__day--outside-month {
          opacity: 0.4;
        }
      `}</style>
    </>
  )
}
