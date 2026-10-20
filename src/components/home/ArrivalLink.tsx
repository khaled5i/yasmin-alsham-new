'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackHomeEvent, type HomeEventName } from './home-analytics'

/**
 * رابط «وصل حديثاً». ملف مستقل عن TrackedRouteLink لأن NewArrivals مكوّن خادم:
 * Turbopack يفشل («Could not find the module … in the React Client Manifest») حين
 * يستورد مكوّن خادم وحدةَ عميل مستوردة أيضاً داخل شجرة عميل أخرى.
 */
export default function ArrivalLink({ href, className, eventName, eventProperties, children }: {
  href: string
  className?: string
  eventName: HomeEventName
  eventProperties?: Record<string, string | number | boolean>
  children: ReactNode
}) {
  return (
    <Link href={href} className={className} onClick={() => trackHomeEvent(eventName, eventProperties)}>
      {children}
    </Link>
  )
}
