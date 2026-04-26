'use client'

import { useState, useEffect, useRef } from 'react'
import DatePicker from 'react-datepicker'
import { shift } from '@floating-ui/dom'
import 'react-datepicker/dist/react-datepicker.css'
import { orderService } from '@/lib/services/order-service'
import { extractDateKey, parseDateKeyForPicker, toLocalDateKey } from '@/lib/date-utils'
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

// ألوان الشهرين الهجريين عند التداخل
const HIJRI_MONTH_COLORS = {
  first: { text: '#7c3aed' },  // بنفسجي للشهر الأول
  second: { text: '#0d9488' }, // زمردي للشهر الثاني
}

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

// دالة لحساب الأشهر الهجرية الموجودة في شهر ميلادي معين
const getHijriMonthsInView = (date: Date) => {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0)
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
  const viewedDateRef = useRef(new Date())

  // تحويل التاريخ من string إلى Date
  const dateValue = parseDateKeyForPicker(selectedDate)
  const selectedDateKey = selectedDate ? extractDateKey(selectedDate) : ''

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

      const startDate = toLocalDateKey(today)
      const endDate = toLocalDateKey(threeMonthsLater)

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
    const dateStr = toLocalDateKey(date)
    const proofCount = proofStats[dateStr] || 0
    const isOverloaded = proofCount >= 4
    const hijri = toHijri(date)

    const isFriday = date.getDay() === 5
    const isSaturday = date.getDay() === 6

    // تحديد لون الرقم الهجري بناءً على الشهر الهجري
    const hijriMonthsInView = getHijriMonthsInView(viewedDateRef.current)
    let hijriDayColor = '#6b7280'
    if (hijriMonthsInView.length > 1) {
      const matchedMonth = hijriMonthsInView.find(m => m.month === hijri.month && m.year === hijri.year)
      const colorKey = matchedMonth ? matchedMonth.colorKey : hijriMonthsInView[0].colorKey
      hijriDayColor = HIJRI_MONTH_COLORS[colorKey].text
    }

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center py-0.5">
        {(isFriday || isSaturday) && (
          <span className="text-[10px] text-black font-bold leading-none">✕</span>
        )}
        <span className={`text-base leading-none ${isOverloaded ? 'font-bold' : ''}`}>{day}</span>
        <span className="text-[12px] leading-none mt-0.5 font-medium" style={{ color: hijriDayColor }}>{hijri.day}</span>
        {proofCount > 0 && (
          <span
            className={`text-[12px] font-semibold leading-none ${isOverloaded
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
    const dateStr = toLocalDateKey(date)
    const proofCount = proofStats[dateStr] || 0
    const classes: string[] = []
    if (proofCount >= 4) classes.push('overloaded-proof-date')
    if (date.getDay() === 5) classes.push('friday-day-proof')
    if (date.getDay() === 6) classes.push('saturday-day-proof')
    return classes.join(' ')
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
    viewedDateRef.current = date
    const gregorianMonth = date.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })
    const hijriMonthsInView = getHijriMonthsInView(date)

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
            {gregorianMonth}
          </div>
          <div className="text-xs font-semibold leading-relaxed">
            {hijriMonthsInView.length === 1 ? (
              <span style={{ color: HIJRI_MONTH_COLORS.first.text }}>
                {hijriMonthsInView[0].name} {hijriMonthsInView[0].year}
              </span>
            ) : (
              <>
                <span style={{ color: HIJRI_MONTH_COLORS.second.text }}>
                  {hijriMonthsInView[1].name} {hijriMonthsInView[1].year}
                </span>
                <span className="text-gray-400 mx-1">/</span>
                <span style={{ color: HIJRI_MONTH_COLORS.first.text }}>
                  {hijriMonthsInView[0].name}
                  {hijriMonthsInView[0].year !== hijriMonthsInView[1].year ? ` ${hijriMonthsInView[0].year}` : ''}
                </span>
              </>
            )}
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
            // استخدام التوقيت المحلي لتجنب مشكلة تغيير اليوم بسبب الفارق الزمني (UTC)
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            const dateStr = `${year}-${month}-${day}`
            onChange(dateStr)
          } else {
            onChange('')
          }
        }}
        isClearable={!required}
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
        popperModifiers={[shift({ padding: 8 })]}
        portalId="datepicker-portal-root"
        onFocus={(e) => e.target.blur()}
        onKeyDown={(e) => {
          // منع الكتابة اليدوية مع السماح بفتح التقويم
          e.preventDefault()
        }}
      />

      {/* رسالة تحذيرية إذا كان التاريخ المختار مزدحم */}
      {dateValue && selectedDateKey && proofStats[selectedDateKey] >= 4 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>
              {isArabic
                ? `تحذير: يوجد ${proofStats[selectedDateKey]} مواعيد بروفا أو أكثر في هذا اليوم`
                : `Warning: There are ${proofStats[selectedDateKey]} or more proof appointments on this day`
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
          font-size: 1.05rem;
          width: 4.125rem;
          margin: 0.15rem;
        }

        .custom-calendar-proof-hijri .react-datepicker__month {
          margin: 0.25rem;
        }

        .custom-calendar-proof-hijri .react-datepicker__day {
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

        .custom-calendar-proof-hijri .react-datepicker__day.friday-day-proof {
          background-color: #888888;
          color: white;
        }

        .custom-calendar-proof-hijri .react-datepicker__day.friday-day-proof:hover {
          background-color: #666666;
          color: white;
        }

        .custom-calendar-proof-hijri .react-datepicker__day.saturday-day-proof {
          background-color: #888888;
          color: white;
        }

        .custom-calendar-proof-hijri .react-datepicker__day.saturday-day-proof:hover {
          background-color: #666666;
          color: white;
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
            width: 3.375rem;
            height: 3.75rem;
            margin: 0.075rem;
          }

          .custom-calendar-proof-hijri .react-datepicker__day-name {
            width: 3.375rem;
            font-size: 0.9rem;
          }
        }

        /* تعديل موقع زر الحذف (X) ليكون في اليسار بدلاً من اليمين لتجنب تداخله مع النص في الواجهة العربية */
        .date-picker-wrapper .react-datepicker__close-icon {
          right: auto !important;
          left: 0 !important;
          padding-right: 0 !important;
          padding-left: 10px !important;
        }
        .date-picker-wrapper .react-datepicker__close-icon::after {
          background-color: #ef4444 !important; /* لون أحمر للزر */
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
