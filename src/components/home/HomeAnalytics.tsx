'use client'

import { useEffect, useRef } from 'react'
import { trackHomeEvent } from './home-analytics'

export default function HomeAnalytics() {
  const hasTracked = useRef(false)

  useEffect(() => {
    if (hasTracked.current) return
    hasTracked.current = true

    trackHomeEvent('home_view', {
      device_type: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
      // ليس `source`: GA4 يقرأ هذا الاسم كمصدر الزيارة فيظهر «referral /» و«direct /» في Unassigned
      entry_type: document.referrer ? 'referral' : 'direct',
    })
  }, [])

  return null
}

