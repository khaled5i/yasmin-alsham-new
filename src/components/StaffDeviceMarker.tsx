'use client'

import { useEffect } from 'react'
import { markStaffDevice } from '@/lib/analytics-privacy'
import { useAuthStore } from '@/store/authStore'

/** في لوحة التحكم: من دخل بحسابه يُعلَّم جهازه «جهاز موظف» فتُستبعد زياراته من الإحصاءات. */
export default function StaffDeviceMarker() {
  const user = useAuthStore(state => state.user)
  useEffect(() => {
    if (user) markStaffDevice()
  }, [user])
  return null
}
