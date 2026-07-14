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
      source: document.referrer ? 'referral' : 'direct',
    })
  }, [])

  return null
}

