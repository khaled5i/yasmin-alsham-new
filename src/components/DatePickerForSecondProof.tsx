'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import DatePicker from 'react-datepicker'
import { shift } from '@floating-ui/dom'
import 'react-datepicker/dist/react-datepicker.css'
import { parseDateKeyForPicker, toLocalDateKey } from '@/lib/date-utils'
import { useTranslation } from '@/hooks/useTranslation'
import moment from 'moment-hijri'

interface DatePickerForSecondProofProps {
  selectedDate: string
  onChange: (date: string) => void
  minDate?: Date
  // يفتح التقويم تلقائياً عند التحميل (عند الضغط على زر "تعديل التاريخ")
  autoOpen?: boolean
  // يُستدعى عند إغلاق التقويم (لإخفاء المكوّن في الواجهة)
  onClose?: () => void
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
  first: { text: '#b45309' },   // كهرماني داكن للشهر الأول
  second: { text: '#0d9488' },  // زمردي للشهر الثاني
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

export default function DatePickerForSecondProof({
  selectedDate,
  onChange,
  minDate,
  autoOpen = false,
  onClose,
  className = ''
}: DatePickerForSecondProofProps) {
  const { isArabic } = useTranslation()
  const [isOpen, setIsOpen] = useState(autoOpen)
  const viewedDateRef = useRef(new Date())
  const decreaseMonthRef = useRef<(() => void) | null>(null)
  const increaseMonthRef = useRef<(() => void) | null>(null)
  const touchStartXRef = useRef<number | null>(null)

  // تحويل التاريخ من string إلى Date
  const dateValue = parseDateKeyForPicker(selectedDate)

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

  // دعم السحب يمين/يسار على الجوال للتنقل بين الشهور
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartXRef.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
    touchStartXRef.current = null
    if (Math.abs(deltaX) < 50) return
    if (deltaX > 0) {
      decreaseMonthRef.current?.()
    } else {
      increaseMonthRef.current?.()
    }
  }, [])

  const handleCalendarOpen = useCallback(() => {
    setTimeout(() => {
      const calendar = document.querySelector('.custom-calendar-second-proof-hijri')
      if (calendar) {
        calendar.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true })
        calendar.addEventListener('touchend', handleTouchEnd as EventListener)
      }
    }, 60)
  }, [handleTouchStart, handleTouchEnd])

  const handleCalendarClose = useCallback(() => {
    const calendar = document.querySelector('.custom-calendar-second-proof-hijri')
    if (calendar) {
      calendar.removeEventListener('touchstart', handleTouchStart as EventListener)
      calendar.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
    setIsOpen(false)
    onClose?.()
  }, [handleTouchStart, handleTouchEnd, onClose])

  // دالة لتخصيص عرض كل يوم في التقويم مع التاريخ الهجري
  const renderDayContents = (day: number, date: Date) => {
    const hijri = toHijri(date)
    const isFriday = date.getDay() === 5
    const isSaturday = date.getDay() === 6

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
          <span className="cal-weekend-mark text-[10px] text-gray-500 font-bold leading-none">✕</span>
        )}
        <span className="cal-day-num text-base leading-none">{day}</span>
        <span className="cal-hijri-num text-[12px] leading-none mt-0.5 font-medium" style={{ color: hijriDayColor }}>{hijri.day}</span>
      </div>
    )
  }

  // دالة لتخصيص CSS لكل يوم
  const getDayClassName = (date: Date) => {
    const classes: string[] = []
    if (date.getDay() === 5) classes.push('friday-day-second-proof')
    if (date.getDay() === 6) classes.push('saturday-day-second-proof')
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
    decreaseMonthRef.current = decreaseMonth
    increaseMonthRef.current = increaseMonth
    const gregorianMonth = date.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })
    const monthNumber = date.getMonth() + 1
    const hijriMonthsInView = getHijriMonthsInView(date)

    return (
      <div className="flex items-center justify-between px-2 py-2">
        <button
          onClick={decreaseMonth}
          disabled={prevMonthButtonDisabled}
          type="button"
          className="p-1 hover:bg-amber-200 rounded-full transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-amber-900">
            {gregorianMonth} <span className="font-normal text-amber-600">({monthNumber})</span>
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
          className="p-1 hover:bg-amber-200 rounded-full transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        open={isOpen}
        onInputClick={() => setIsOpen(true)}
        onChange={(date: Date | null) => {
          if (date) {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            onChange(`${year}-${month}-${day}`)
          } else {
            onChange('')
          }
          setIsOpen(false)
          onClose?.()
        }}
        onClickOutside={() => {
          setIsOpen(false)
          onClose?.()
        }}
        minDate={minDate}
        dateFormat="yyyy-MM-dd"
        className="w-full px-4 py-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all duration-300 bg-amber-50"
        calendarClassName="custom-calendar-second-proof-hijri"
        renderDayContents={renderDayContents}
        dayClassName={getDayClassName}
        renderCustomHeader={renderCustomHeader}
        formatWeekDay={(nameOfDay) => arabicDayNames[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(nameOfDay)]}
        placeholderText={isArabic ? 'اختر موعد البروفا الثانية' : 'Select Second Proof Date'}
        showPopperArrow={false}
        popperPlacement="bottom-start"
        popperModifiers={[shift({ padding: 8 })]}
        portalId="datepicker-portal-root"
        onFocus={(e) => e.target.blur()}
        onKeyDown={(e) => {
          e.preventDefault()
        }}
        onCalendarOpen={handleCalendarOpen}
        onCalendarClose={handleCalendarClose}
      />

      <style jsx global>{`
        .custom-calendar-second-proof-hijri {
          font-family: inherit;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
          direction: ltr;
          overflow: hidden;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__header {
          background-color: #fef3c7;
          border-bottom: 1px solid #fcd34d;
          padding-top: 0;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__header--custom {
          padding-top: 0;
          padding-bottom: 0;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day-names {
          background-color: #fffbeb;
          padding: 0.25rem 0;
          margin-bottom: 0;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day-name {
          color: #b45309;
          font-weight: 600;
          font-size: 1.05rem;
          width: 4.125rem;
          margin: 0.15rem;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__month {
          margin: 0.25rem;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day {
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

        .custom-calendar-second-proof-hijri .react-datepicker__day:hover {
          background-color: #fef3c7;
          transform: scale(1.05);
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day.friday-day-second-proof,
        .custom-calendar-second-proof-hijri .react-datepicker__day.saturday-day-second-proof {
          background-color: #aaaaaa;
          color: white;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day.friday-day-second-proof:hover,
        .custom-calendar-second-proof-hijri .react-datepicker__day.saturday-day-second-proof:hover {
          background-color: #888888;
          color: white;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day--selected {
          background-color: #f59e0b !important;
          color: white !important;
          font-weight: bold;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day--selected span {
          color: white !important;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day--keyboard-selected {
          background-color: #fcd34d;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day--today {
          font-weight: bold;
          border: 2px solid #f59e0b;
        }

        .custom-calendar-second-proof-hijri .react-datepicker__day--outside-month {
          opacity: 0.4;
        }

        @media (max-width: 640px) {
          .custom-calendar-second-proof-hijri {
            max-width: calc(100vw - 16px);
          }

          .custom-calendar-second-proof-hijri .react-datepicker__month {
            margin: 0.15rem;
          }

          .custom-calendar-second-proof-hijri .react-datepicker__day {
            width: 2.5rem;
            height: 2.8rem;
            margin: 0.05rem;
          }

          .custom-calendar-second-proof-hijri .react-datepicker__day-name {
            width: 2.5rem;
            font-size: 0.75rem;
            margin: 0.05rem;
          }

          .custom-calendar-second-proof-hijri .react-datepicker__day .cal-day-num {
            font-size: 0.78rem !important;
          }

          .custom-calendar-second-proof-hijri .react-datepicker__day .cal-hijri-num,
          .custom-calendar-second-proof-hijri .react-datepicker__day .cal-weekend-mark {
            font-size: 0.6rem !important;
          }
        }
      `}</style>
    </div>
  )
}
