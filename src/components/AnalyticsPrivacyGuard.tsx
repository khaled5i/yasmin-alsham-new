'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { applyAnalyticsRoute } from '@/lib/analytics-privacy'

/**
 * الدفعة D (AUD-07، AUD-10) + R-CD-07: بعد كل تنقّل داخلي يضبط علم التعطيل ويرسل page_view
 * للمسارات المسموحة فقط (المنطق في analytics-privacy.ts، مختبَر). العلم نفسه يُضبط قبل التنقّل
 * في سكربت الصفحة الأولى؛ هنا تأكيد له وإرسال الصفحة.
 */
export default function AnalyticsPrivacyGuard() {
  const pathname = usePathname()
  const first = useRef(true)
  useEffect(() => {
    if (!pathname) return
    applyAnalyticsRoute(window as unknown as Parameters<typeof applyAnalyticsRoute>[0], pathname, first.current)
    first.current = false
  }, [pathname])
  return null
}
