'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { orderService } from '@/lib/services/order-service'
import { useTranslation } from '@/hooks/useTranslation'

interface DatePickerForProofProps {
  selectedDate: string
  onChange: (date: string) => void
  minDate?: Date
  required?: boolean
  className?: string
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

  // دالة لتخصيص عرض كل يوم في التقويم
  const renderDayContents = (day: number, date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const proofCount = proofStats[dateStr] || 0
    const isOverloaded = proofCount >= 4

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <span className={`${isOverloaded ? 'font-bold' : ''}`}>{day}</span>
        {proofCount > 0 && (
          <span
            className={`text-[10px] font-semibold mt-0.5 ${isOverloaded
              ? 'text-red-600'
              : 'text-green-600'
              }`}
          >
            {proofCount}
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

  return (
    <div className={`date-picker-wrapper ${className}`}>
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
        calendarClassName="custom-calendar-proof"
        renderDayContents={renderDayContents}
        dayClassName={getDayClassName}
        placeholderText={isArabic ? 'اختر موعد تسليم البروفا' : 'Select Proof Delivery Date'}
        required={required}
        showPopperArrow={false}
        popperPlacement="bottom-start"
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
        .custom-calendar-proof {
          font-family: inherit;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          direction: ltr;
        }

        .custom-calendar-proof .react-datepicker__header {
          background-color: #d1fae5;
          border-bottom: 1px solid #6ee7b7;
          border-radius: 0.75rem 0.75rem 0 0;
          padding-top: 0.75rem;
        }

        .custom-calendar-proof .react-datepicker__current-month {
          color: #065f46;
          font-weight: 600;
          font-size: 1rem;
        }

        .custom-calendar-proof .react-datepicker__day-name {
          color: #047857;
          font-weight: 500;
          width: 2.5rem;
          margin: 0.2rem;
        }

        .custom-calendar-proof .react-datepicker__day {
          width: 2.5rem;
          height: 2.5rem;
          line-height: 1.2;
          margin: 0.2rem;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
        }

        .custom-calendar-proof .react-datepicker__day:hover {
          background-color: #d1fae5;
          transform: scale(1.05);
        }

        .custom-calendar-proof .react-datepicker__day.overloaded-proof-date {
          background-color: #fee2e2;
          border: 1px solid #fca5a5;
        }

        .custom-calendar-proof .react-datepicker__day.overloaded-proof-date:hover {
          background-color: #fecaca;
        }

        .custom-calendar-proof .react-datepicker__day--selected {
          background-color: #10b981 !important;
          color: white !important;
          font-weight: bold;
        }

        .custom-calendar-proof .react-datepicker__day--keyboard-selected {
          background-color: #6ee7b7;
        }

        .custom-calendar-proof .react-datepicker__day--today {
          font-weight: bold;
          border: 2px solid #10b981;
        }

        .custom-calendar-proof .react-datepicker__navigation {
          top: 0.75rem;
        }

        .custom-calendar-proof .react-datepicker__navigation-icon::before {
          border-color: #065f46;
        }

        @media (max-width: 640px) {
          .custom-calendar-proof .react-datepicker__day,
          .custom-calendar-proof .react-datepicker__day-name {
            width: 2rem;
            height: 2rem;
            margin: 0.15rem;
            font-size: 0.875rem;
          }
        }
      `}</style>
    </div>
  )
}


