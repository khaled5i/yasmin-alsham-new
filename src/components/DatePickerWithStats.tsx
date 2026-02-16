'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { orderService } from '@/lib/services/order-service'
import { alterationService } from '@/lib/services/alteration-service'
import { extractDateKey, parseDateKeyForPicker, toLocalDateKey } from '@/lib/date-utils'
import { useTranslation } from '@/hooks/useTranslation'
import moment from 'moment-hijri'

interface DatePickerWithStatsProps {
  selectedDate: string
  onChange: (date: string) => void
  minDate?: Date
  required?: boolean
  className?: string
  statsType?: 'orders' | 'alterations' // نوع الإحصائيات المراد عرضها
}

// أسماء الأشهر الهجرية
const hijriMonths = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
]

// أسماء الأيام بالعربية
const arabicDayNames = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

// دالة تحويل التاريخ الميلادي إلى هجري
const toHijri = (date: Date) => {
  const m = moment(date)
  return {
    day: m.iDate(),
    month: m.iMonth(),
    year: m.iYear(),
    monthName: hijriMonths[m.iMonth()]
  }
}

export default function DatePickerWithStats({
  selectedDate,
  onChange,
  minDate,
  required = false,
  className = '',
  statsType = 'orders' // القيمة الافتراضية هي الطلبات
}: DatePickerWithStatsProps) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // تحويل التاريخ من string إلى Date
  const dateValue = parseDateKeyForPicker(selectedDate)
  const selectedDateKey = selectedDate ? extractDateKey(selectedDate) : ''

  // جلب الإحصائيات عند تحميل المكون أو تغيير النوع
  useEffect(() => {
    fetchStats()
  }, [statsType])

  // إنشاء portal container في body عند تحميل المكون
  useEffect(() => {
    if (typeof document !== 'undefined') {
      let portal = document.getElementById('datepicker-portal-root')
      if (!portal) {
        portal = document.createElement('div')
        portal.id = 'datepicker-portal-root'
        portal.style.position = 'fixed'
        portal.style.top = '0'
        portal.style.left = '0'
        portal.style.zIndex = '999999'
        document.body.appendChild(portal)
      }
    }
  }, [])

  const fetchStats = async () => {
    try {
      setLoading(true)

      // جلب إحصائيات لمدة 3 أشهر قادمة
      const today = new Date()
      const threeMonthsLater = new Date()
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3)

      const startDate = toLocalDateKey(today)
      const endDate = toLocalDateKey(threeMonthsLater)

      let data = null
      let error = null

      if (statsType === 'alterations') {
        const result = await alterationService.getAlterationStatsByDate(startDate, endDate)
        data = result.data
        error = result.error
      } else {
        const result = await orderService.getOrderStatsByDate(startDate, endDate)
        data = result.data
        error = result.error
      }

      if (!error && data) {
        setStats(data)
      }
    } catch (error) {
      console.error(`Error fetching ${statsType} stats:`, error)
    } finally {
      setLoading(false)
    }
  }

  // دالة لتخصيص عرض كل يوم في التقويم مع التاريخ الهجري
  const renderDayContents = (day: number, date: Date) => {
    const dateStr = toLocalDateKey(date)
    const count = stats[dateStr] || 0
    const isOverloaded = count > 5
    const hijri = toHijri(date)

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center py-0.5">
        <span className={`text-sm leading-none ${isOverloaded ? 'font-bold' : ''}`}>{day}</span>
        <span className="text-[8px] text-gray-500 leading-none mt-0.5">{hijri.day}</span>
        {count > 0 && (
          <span
            className={`text-[8px] font-semibold leading-none ${isOverloaded
              ? 'text-red-600'
              : 'text-pink-600'
              }`}
          >
            ({count})
          </span>
        )}
      </div>
    )
  }

  // دالة لتخصيص CSS لكل يوم
  const getDayClassName = (date: Date) => {
    const dateStr = toLocalDateKey(date)
    const count = stats[dateStr] || 0
    const isOverloaded = count > 5

    if (isOverloaded) {
      return 'overloaded-date'
    }
    return ''
  }

  // دالة لتخصيص رأس التقويم مع التاريخ الهجري
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

    return (
      <div className="flex items-center justify-between px-2 py-2">
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
            {hijri.monthName} {hijri.year}
          </div>
          <div className="text-xs text-pink-700">
            {gregorianMonth}
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
    )
  }

  return (
    <div className={`date-picker-wrapper relative ${className}`}>
      <DatePicker
        selected={dateValue}
        onChange={(date: Date | null) => {
          if (date) {
            // استخدام التوقيت المحلي لتجنب مشكلة تغيير اليوم بسبب الفارق الزمني (UTC)
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            const dateStr = `${year}-${month}-${day}`
            onChange(dateStr)
          }
        }}
        minDate={minDate}
        dateFormat="yyyy-MM-dd"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
        calendarClassName="custom-calendar-hijri"
        renderDayContents={renderDayContents}
        dayClassName={getDayClassName}
        renderCustomHeader={renderCustomHeader}
        formatWeekDay={(nameOfDay) => arabicDayNames[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(nameOfDay)]}
        placeholderText={t('select_delivery_date')}
        required={required}
        showPopperArrow={false}
        popperPlacement="bottom-start"
        portalId="datepicker-portal-root"
        onKeyDown={(e) => {
          // منع الكتابة اليدوية مع السماح بفتح التقويم
          e.preventDefault()
        }}
      />

      {/* رسالة تحذيرية إذا كان التاريخ المختار مزدحم */}
      {dateValue && selectedDateKey && stats[selectedDateKey] > 5 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>{t('busy_date_warning', { count: stats[selectedDateKey] })}</span>
          </p>
        </div>
      )}

      <style jsx global>{`
        /* التأكد من ظهور التقويم فوق جميع العناصر */
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
          font-size: 0.7rem;
          width: 2.75rem;
          margin: 0.1rem;
        }

        .custom-calendar-hijri .react-datepicker__month {
          margin: 0.25rem;
        }

        .custom-calendar-hijri .react-datepicker__day {
          width: 2.75rem;
          height: 3rem;
          line-height: 1;
          margin: 0.1rem;
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
            width: 2.25rem;
            height: 2.5rem;
            margin: 0.05rem;
          }

          .custom-calendar-hijri .react-datepicker__day-name {
            width: 2.25rem;
            font-size: 0.6rem;
          }
        }
      `}</style>
    </div>
  )
}
