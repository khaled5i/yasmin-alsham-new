'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import { shift } from '@floating-ui/dom'
import 'react-datepicker/dist/react-datepicker.css'
import moment from 'moment-hijri'
import { extractDateKey, parseDateKeyForPicker, toLocalDateKey } from '@/lib/date-utils'
import { useTranslation } from '@/hooks/useTranslation'
import { orderService } from '@/lib/services/order-service'

type DateFilterType = 'received' | 'delivery'

interface OrderDateFilterPickerProps {
  selectedDate: string
  onDateChange: (date: string) => void
  filterType: DateFilterType
  onFilterTypeChange: (type: DateFilterType) => void
  orders?: unknown[]
  className?: string
}

const hijriMonths = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
]

const arabicDayNames = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

const toHijri = (date: Date) => {
  const m = moment(date)
  return {
    day: m.iDate(),
    month: m.iMonth(),
    year: m.iYear(),
    monthName: hijriMonths[m.iMonth()]
  }
}

export default function OrderDateFilterPicker({
  selectedDate,
  onDateChange,
  filterType,
  onFilterTypeChange,
  className = ''
}: OrderDateFilterPickerProps) {
  const { t, isArabic } = useTranslation()
  const [stats, setStats] = useState<Record<string, number>>({})

  const dateValue = parseDateKeyForPicker(selectedDate)
  const selectedDateKey = selectedDate ? extractDateKey(selectedDate) : ''

  // Fetch stats from DB whenever filterType changes
  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date()
      const past = new Date(now)
      past.setFullYear(past.getFullYear() - 2)
      const future = new Date(now)
      future.setFullYear(future.getFullYear() + 1)

      const startDate = toLocalDateKey(past)
      const endDate = toLocalDateKey(future)

      let result
      if (filterType === 'received') {
        result = await orderService.getOrderReceivedStatsByDate(startDate, endDate)
      } else {
        result = await orderService.getOrderStatsByDate(startDate, endDate)
      }

      if (!result.error && result.data) {
        setStats(result.data)
      }
    }

    fetchStats()
  }, [filterType])

  useEffect(() => {
    if (typeof document === 'undefined') return

    let portal = document.getElementById('datepicker-portal-root')
    if (portal) return

    portal = document.createElement('div')
    portal.id = 'datepicker-portal-root'
    portal.style.position = 'fixed'
    portal.style.top = '0'
    portal.style.left = '0'
    portal.style.zIndex = '999999'
    document.body.appendChild(portal)
  }, [])

  const renderDayContents = (day: number, date: Date) => {
    const dateStr = toLocalDateKey(date)
    const count = stats[dateStr] || 0
    const isOverloaded = count > 5
    const hijri = toHijri(date)
    const isFriday = date.getDay() === 5

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center py-0.5">
        {isFriday && (
          <span className="text-[10px] text-black font-bold leading-none">✕</span>
        )}
        <span className={`text-base leading-none ${isOverloaded ? 'font-bold' : ''}`}>{day}</span>
        <span className="text-[12px] text-gray-500 leading-none mt-0.5">{hijri.day}</span>
        {count > 0 && (
          <span
            className={`text-[12px] font-semibold leading-none ${isOverloaded ? 'text-red-600' : 'text-pink-600'}`}
          >
            ({count})
          </span>
        )}
      </div>
    )
  }

  const getDayClassName = (date: Date) => {
    const dateStr = toLocalDateKey(date)
    const count = stats[dateStr] || 0
    const classes: string[] = []
    if (count > 5) classes.push('overloaded-date')
    if (date.getDay() === 5) classes.push('friday-day')
    return classes.join(' ')
  }

  const renderCustomHeader = ({
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
  }) => {
    const hijri = toHijri(date)
    const gregorianMonth = date.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })
    const receivedLabel = t('order_received_date') || (isArabic ? 'تاريخ الاستلام' : 'Received Date')
    const deliveryLabel = t('due_date') || (isArabic ? 'تاريخ التسليم' : 'Delivery Date')

    return (
      <div className="px-2 pt-2 pb-1">
        <div className="mb-2 rounded-full bg-pink-100 p-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFilterTypeChange('received')}
            className={`text-[11px] sm:text-xs font-semibold rounded-full px-2 py-1 transition-colors ${
              filterType === 'received' ? 'bg-pink-600 text-white' : 'text-pink-800 hover:bg-pink-200'
            }`}
          >
            {receivedLabel}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFilterTypeChange('delivery')}
            className={`text-[11px] sm:text-xs font-semibold rounded-full px-2 py-1 transition-colors ${
              filterType === 'delivery' ? 'bg-pink-600 text-white' : 'text-pink-800 hover:bg-pink-200'
            }`}
          >
            {deliveryLabel}
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <button
            onClick={decreaseMonth}
            disabled={prevMonthButtonDisabled}
            type="button"
            className="p-1 hover:bg-pink-200 rounded-full transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-pink-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-pink-900">
              {gregorianMonth}
            </div>
            <div className="text-xs text-pink-700">
              {hijri.monthName} {hijri.year}
            </div>
          </div>
          <button
            onClick={increaseMonth}
            disabled={nextMonthButtonDisabled}
            type="button"
            className="p-1 hover:bg-pink-200 rounded-full transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-pink-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`date-picker-wrapper relative ${className}`}>
      <DatePicker
        selected={dateValue}
        onChange={(date: Date | null) => {
          if (!date) {
            onDateChange('')
            return
          }

          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          onDateChange(`${year}-${month}-${day}`)
        }}
        isClearable
        dateFormat="yyyy-MM-dd"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
        calendarClassName="custom-calendar-hijri"
        renderDayContents={renderDayContents}
        dayClassName={getDayClassName}
        renderCustomHeader={renderCustomHeader}
        formatWeekDay={(nameOfDay) => {
          const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(nameOfDay)
          return dayIndex >= 0 ? arabicDayNames[dayIndex] : nameOfDay.slice(0, 3)
        }}
        placeholderText={filterType === 'received'
          ? (t('order_received_date') || (isArabic ? 'اختر تاريخ الاستلام' : 'Select received date'))
          : (t('due_date') || (isArabic ? 'اختر تاريخ التسليم' : 'Select delivery date'))
        }
        showPopperArrow={false}
        popperPlacement="bottom-start"
        popperModifiers={[shift({ padding: 8 })]}
        portalId="datepicker-portal-root"
        onFocus={(e) => e.target.blur()}
        onKeyDown={(e) => e.preventDefault()}
      />

      {dateValue && selectedDateKey && (stats[selectedDateKey] || 0) > 5 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span className="text-lg">!</span>
            <span>
              {t('busy_date_warning', { count: stats[selectedDateKey] })}
            </span>
          </p>
        </div>
      )}

      <style jsx global>{`
        #datepicker-portal-root {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 999999 !important;
          pointer-events: none;
        }

        #datepicker-portal-root > * {
          pointer-events: auto;
        }

        #datepicker-portal-root .react-datepicker-popper {
          z-index: 999999 !important;
        }

        .react-datepicker-popper {
          z-index: 999999 !important;
        }

        .custom-calendar-hijri {
          font-family: inherit;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
          direction: ltr;
          overflow: hidden;
        }

        .custom-calendar-hijri .react-datepicker__header {
          background-color: #fce7f3;
          border-bottom: 1px solid #f9a8d4;
          padding-top: 0;
        }

        .custom-calendar-hijri .react-datepicker__header--custom {
          padding-top: 0;
          padding-bottom: 0;
        }

        .custom-calendar-hijri .react-datepicker__day-names {
          background-color: #fdf2f8;
          padding: 0.25rem 0;
          margin-bottom: 0;
        }

        .custom-calendar-hijri .react-datepicker__day-name {
          color: #9f1239;
          font-weight: 600;
          font-size: 1.05rem;
          width: 4.125rem;
          margin: 0.15rem;
        }

        .custom-calendar-hijri .react-datepicker__month {
          margin: 0.25rem;
        }

        .custom-calendar-hijri .react-datepicker__day {
          width: 4.125rem;
          height: 4.5rem;
          line-height: 1;
          margin: 0.15rem;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .custom-calendar-hijri .react-datepicker__day:hover {
          background-color: #fce7f3;
          transform: scale(1.05);
        }

        .custom-calendar-hijri .react-datepicker__day.overloaded-date {
          background-color: #fee2e2;
          border: 1px solid #fca5a5;
        }

        .custom-calendar-hijri .react-datepicker__day.overloaded-date:hover {
          background-color: #fecaca;
        }

        .custom-calendar-hijri .react-datepicker__day.friday-day {
          background-color: #f3f3f3;
        }

        .custom-calendar-hijri .react-datepicker__day.friday-day:hover {
          background-color: #e5e5e5;
        }

        .custom-calendar-hijri .react-datepicker__day--selected {
          background-color: #ec4899 !important;
          color: white !important;
          font-weight: bold;
        }

        .custom-calendar-hijri .react-datepicker__day--selected span {
          color: white !important;
        }

        .custom-calendar-hijri .react-datepicker__day--keyboard-selected {
          background-color: #f9a8d4;
        }

        .custom-calendar-hijri .react-datepicker__day--today {
          font-weight: bold;
          border: 2px solid #ec4899;
        }

        .custom-calendar-hijri .react-datepicker__day--outside-month {
          opacity: 0.4;
        }

        @media (max-width: 640px) {
          .custom-calendar-hijri .react-datepicker__day {
            width: 3.375rem;
            height: 3.75rem;
            margin: 0.075rem;
          }

          .custom-calendar-hijri .react-datepicker__day-name {
            width: 3.375rem;
            font-size: 0.9rem;
          }
        }

        .date-picker-wrapper .react-datepicker__close-icon {
          right: auto !important;
          left: 0 !important;
          padding-right: 0 !important;
          padding-left: 10px !important;
        }

        .date-picker-wrapper .react-datepicker__close-icon::after {
          background-color: #ef4444 !important;
          color: white !important;
          font-size: 1.1rem !important;
          height: 20px !important;
          width: 20px !important;
          padding: 0 !important;
          line-height: 20px !important;
        }
      `}</style>
    </div>
  )
}
