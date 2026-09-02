'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, CalendarX2, Fingerprint, LogIn, RefreshCw } from 'lucide-react'
import {
  attendanceService,
  type WorkerAttendanceSummary as WorkerAttendanceSummaryData,
} from '@/lib/services/attendance-service'

interface WorkerAttendanceSummaryProps {
  userId: string
  language: 'ar' | 'en'
  t: (key: string) => string
}

function formatArrivalTime(value: string | null, language: 'ar' | 'en') {
  if (!value) return null
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

export default function WorkerAttendanceSummary({ userId, language, t }: WorkerAttendanceSummaryProps) {
  const [summary, setSummary] = useState<WorkerAttendanceSummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setSummary(await attendanceService.getMySummary(userId))
    } catch (loadError) {
      console.error('Failed to load worker attendance summary:', loadError)
      setError('worker_attendance_load_error')
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const arrivalTime = formatArrivalTime(summary?.firstEntryAt || null, language)

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative mb-6 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm sm:mb-8"
      aria-labelledby="worker-attendance-title"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-teal-500 via-cyan-400 to-emerald-400" />
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-950 text-white shadow-sm">
              <Fingerprint className="h-5 w-5" />
            </span>
            <div>
              <h2 id="worker-attendance-title" className="text-lg font-black text-slate-900 sm:text-xl">
                {t('worker_attendance_title')}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t('worker_attendance_source')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={isLoading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-teal-200 text-teal-700 transition hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
            title={t('refresh')}
            aria-label={t('refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t(error)}</span>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-live="polite">
            <div className="rounded-2xl border border-teal-100 bg-[linear-gradient(135deg,#f0fdfa_0%,#ffffff_100%)] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-700">
                <LogIn className="h-4 w-4" />
                {t('morning_arrival_time')}
              </div>
              <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
                {isLoading ? '...' : arrivalTime || t('not_checked_in_today')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('today_label')}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
                <CalendarX2 className="h-4 w-4" />
                {t('current_month_absence')}
              </div>
              <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
                {isLoading ? '...' : summary?.absentDays ?? 0}
                {!isLoading && (
                  <span className="ms-2 text-sm font-bold text-slate-500">
                    {t('days_unit')}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('friday_excluded_note')}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  )
}
