'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { orderService } from '@/lib/services/order-service'
import { alterationService } from '@/lib/services/alteration-service'
import { useTranslation } from '@/hooks/useTranslation'

interface DatePickerWithStatsProps {
  selectedDate: string
  onChange: (date: string) => void
  minDate?: Date
  required?: boolean
  className?: string
  statsType?: 'orders' | 'alterations' // نوع الإحصائيات المراد عرضها
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
  const dateValue = selectedDate ? new Date(selectedDate) : null

  // جلب الإحصائيات عند تحميل المكون أو تغيير النوع
  useEffect(() => {
    fetchStats()
  }, [statsType])

  const fetchStats = async () => {
    try {
      setLoading(true)

      // جلب إحصائيات لمدة 3 أشهر قادمة
      const today = new Date()
      const threeMonthsLater = new Date()
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3)

      const startDate = today.toISOString().split('T')[0]
      const endDate = threeMonthsLater.toISOString().split('T')[0]

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

  // دالة لتخصيص عرض كل يوم في التقويم
  const renderDayContents = (day: number, date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const count = stats[dateStr] || 0
    const isOverloaded = count > 5

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <span className={`${isOverloaded ? 'font-bold' : ''}`}>{day}</span>
        {count > 0 && (
          <span
            className={`text-[10px] font-semibold mt-0.5 ${isOverloaded
              ? 'text-red-600'
              : 'text-pink-600'
              }`}
          >
            {count}
          </span>
        )}
      </div>
    )
  }

  // دالة لتخصيص CSS لكل يوم
  const getDayClassName = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const count = stats[dateStr] || 0
    const isOverloaded = count > 5

    if (isOverloaded) {
      return 'overloaded-date'
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
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
        calendarClassName="custom-calendar"
        renderDayContents={renderDayContents}
        dayClassName={getDayClassName}
        placeholderText={t('select_delivery_date')}
        required={required}
        showPopperArrow={false}
        popperPlacement="bottom-start"
      />

      {/* رسالة تحذيرية إذا كان التاريخ المختار مزدحم */}
      {dateValue && stats[selectedDate] > 5 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>{t('busy_date_warning', { count: stats[selectedDate] })}</span>
          </p>
        </div>
      )}

      <style jsx global>{`
        .custom-calendar {
          font-family: inherit;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          direction: ltr;
        }

        .custom-calendar .react-datepicker__header {
          background-color: #fce7f3;
          border-bottom: 1px solid #f9a8d4;
          border-radius: 0.75rem 0.75rem 0 0;
          padding-top: 0.75rem;
        }

        .custom-calendar .react-datepicker__current-month {
          color: #831843;
          font-weight: 600;
          font-size: 1rem;
        }

        .custom-calendar .react-datepicker__day-name {
          color: #9f1239;
          font-weight: 500;
          width: 2.5rem;
          margin: 0.2rem;
        }

        .custom-calendar .react-datepicker__day {
          width: 2.5rem;
          height: 2.5rem;
          line-height: 1.2;
          margin: 0.2rem;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
        }

        .custom-calendar .react-datepicker__day:hover {
          background-color: #fce7f3;
          transform: scale(1.05);
        }

        .custom-calendar .react-datepicker__day.overloaded-date {
          background-color: #fee2e2;
          border: 1px solid #fca5a5;
        }

        .custom-calendar .react-datepicker__day.overloaded-date:hover {
          background-color: #fecaca;
        }

        .custom-calendar .react-datepicker__day--selected {
          background-color: #ec4899 !important;
          color: white !important;
          font-weight: bold;
        }

        .custom-calendar .react-datepicker__day--keyboard-selected {
          background-color: #f9a8d4;
        }

        .custom-calendar .react-datepicker__day--today {
          font-weight: bold;
          border: 2px solid #ec4899;
        }

        .custom-calendar .react-datepicker__navigation {
          top: 0.75rem;
        }

        .custom-calendar .react-datepicker__navigation-icon::before {
          border-color: #831843;
        }

        @media (max-width: 640px) {
          .custom-calendar .react-datepicker__day,
          .custom-calendar .react-datepicker__day-name {
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

