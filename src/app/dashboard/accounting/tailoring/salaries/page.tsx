'use client'

import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import TailoringPayrollDashboard from '@/components/TailoringPayrollDashboard'

export default function TailoringSalariesPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <TailoringPayrollDashboard />
    </ProtectedWorkerRoute>
  )
}

