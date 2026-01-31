'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { orderService } from '@/lib/services/order-service'
import { useTranslation } from '@/hooks/useTranslation'
import moment from 'moment-hijri'

interface DatePickerForProofProps {
  selectedDate: string
  onChange: (date: string) => void
  minDate?: Date
  required?: boolean
  className?: string
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

export default function DatePickerForProof({
  selectedDate,
  onChange,
  minDate,
  required = false,
  className = ''
}: DatePickerForProofProps) {
  const { t, isArabic } = useTranslation()
  const [proofStats, setProofStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // تحويل التاريخ من string إلى Date
  const dateValue = selectedDate ? new Date(selectedDate) : null

  // جلب إحصائيات مواعيد البروفا عند تحميل المكون
  useEffect(() => {
    fetchProofStats()
  }, [])

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

  const fetchProofStats = async () => {
    try {
      setLoading(true)

      // جلب إحصائيات لمدة 3 أشهر قادمة
      const today = new Date()
      const threeMonthsLater = new Date()
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3)

      const startDate = today.toISOString().split('T')[0]
      const endDate = threeMonthsLater.toISOString().split('T')[0]

      const { data, error } = await orderService.getProofStatsByDate(startDate, endDate)

      if (!error && data) {
        setProofStats(data)
      }
    } catch (error) {
      console.error('Error fetching proof stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // دالة لتخصيص عرض كل يوم في التقويم مع التاريخ الهجري
  const renderDayContents = (day: number, date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const proofCount = proofStats[dateStr] || 0
    const isOverloaded = proofCount >= 4
    const hijri = toHijri(date)

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center py-0.5">
        <span className={`text-sm leading-none ${isOverloaded ? 'font-bold' : ''}`}>{day}</span>
        <span className="text-[8px] text-gray-500 leading-none mt-0.5">{hijri.day}</span>
        {proofCount > 0 && (
          <span
            className={`text-[8px] font-semibold leading-none ${isOverloaded
              ? 'text-red-600'
              : 'text-green-600'
              }`}
          >
            ({proofCount})
          </span>
        )}
      </div>
    )
  }

  // دالة لتخصيص CSS لكل يوم
  const getDayClassName = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const proofCount = proofStats[dateStr] || 0
    const isOverloaded = proofCount >= 4

    if (isOverloaded) {
      return 'overloaded-proof-date'
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
          className="p-1 hover:bg-green-200 rounded-full transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5 text-green-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-green-900">
            {hijri.monthName} {hijri.year}
          </div>
          <div className="text-xs text-green-700">
            {gregorianMonth}
          </div>
        </div>
        <button
          onClick={increaseMonth}
          disabled={nextMonthButtonDisabled}
          type="button"
          className="p-1 hover:bg-green-200 rounded-full transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5 text-green-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            const dateStr = date.toISOString().split('T')[0]
            onChange(dateStr)
          }
        }}
        minDate={minDate}
        dateFormat="yyyy-MM-dd"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-300"
        calendarClassName="custom-calendar-proof-hijri"
        renderDayContents={renderDayContents}
        dayClassName={getDayClassName}
        renderCustomHeader={renderCustomHeader}
        formatWeekDay={(nameOfDay) => arabicDayNames[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(nameOfDay)]}
        placeholderText={isArabic ? 'اختر موعد تسليم البروفا' : 'Select Proof Delivery Date'}
        required={required}
        showPopperArrow={false}
        popperPlacement="bottom-start"
        portalId="datepicker-portal-root"
      />

      {/* رسالة تحذيرية إذا كان التاريخ المختار مزدحم */}
      {dateValue && proofStats[selectedDate] >= 4 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>
              {isArabic
                ? `تحذير: يوجد ${proofStats[selectedDate]} مواعيد بروفا أو أكثر في هذا اليوم`
                : `Warning: There are ${proofStats[selectedDate]} or more proof appointments on this day`
              }
            </span>
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

        .custom-calendar-proof-hijri {
          font-family: inherit;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
          direction: ltr;
          overflow: hidden;
        }

        .custom-calendar-proof-hijri .react-datepicker__header {
          background-color: #d1fae5;
          border-bottom: 1px solid #6ee7b7;
          padding-top: 0;
        }

        .custom-calendar-proof-hijri .react-datepicker__header--custom {
          padding-top: 0;
          padding-bottom: 0;
        }

        .custom-calendar-proof-hijri .react-datepicker__day-names {
          background-color: #ecfdf5;
          padding: 0.25rem 0;
          margin-bottom: 0;
        }

        .custom-calendar-proof-hijri .react-datepicker__day-name {
          color: #047857;
          font-weight: 600;
          font-size: 0.7rem;
          width: 2.75rem;
          margin: 0.1rem;
        }

        .custom-calendar-proof-hijri .react-datepicker__month {
          margin: 0.25rem;
        }

        .custom-calendar-proof-hijri .react-datepicker__day {
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

        .custom-calendar-proof-hijri .react-datepicker__day:hover {
          background-color: #d1fae5;
          transform: scale(1.05);
        }

        .custom-calendar-proof-hijri .react-datepicker__day.overloaded-proof-date {
          background-color: #fee2e2;
          border: 1px solid #fca5a5;
        }

        .custom-calendar-proof-hijri .react-datepicker__day.overloaded-proof-date:hover {
          background-color: #fecaca;
        }

        .custom-calendar-proof-hijri .react-datepicker__day--selected {
          background-color: #10b981 !important;
          color: white !important;
          font-weight: bold;
        }

        .custom-calendar-proof-hijri .react-datepicker__day--selected span {
          color: white !important;
        }

        .custom-calendar-proof-hijri .react-datepicker__day--keyboard-selected {
          background-color: #6ee7b7;
        }

        .custom-calendar-proof-hijri .react-datepicker__day--today {
          font-weight: bold;
          border: 2px solid #10b981;
        }

        .custom-calendar-proof-hijri .react-datepicker__day--outside-month {
          opacity: 0.4;
        }

        @media (max-width: 640px) {
          .custom-calendar-proof-hijri .react-datepicker__day {
            width: 2.25rem;
            height: 2.5rem;
            margin: 0.05rem;
          }

          .custom-calendar-proof-hijri .react-datepicker__day-name {
            width: 2.25rem;
            font-size: 0.6rem;
          }
        }
      `}</style>
    </div>
  )
}


