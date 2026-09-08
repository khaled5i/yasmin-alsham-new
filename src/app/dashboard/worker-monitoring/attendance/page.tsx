'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AttendanceMonitoringDashboard from '@/components/AttendanceMonitoringDashboard'

function AttendanceContent() {
  const params = useSearchParams()
  const month = params.get('month') || ''
  return (
    <AttendanceMonitoringDashboard
      initialWorkerId={params.get('workerId') || undefined}
      initialMonth={/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined}
    />
  )
}

export default function AttendanceMonitoringPage() {
  return (
    <Suspense>
      <AttendanceContent />
    </Suspense>
  )
}
