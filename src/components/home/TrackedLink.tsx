'use client'

import type { AnchorHTMLAttributes, ReactNode } from 'react'
import type { HomeEventName } from './home-analytics'
import { trackHomeEvent } from './home-analytics'

type TrackedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode
  eventName: HomeEventName
  eventProperties?: Record<string, string | number | boolean>
}

export default function TrackedLink({
  children,
  eventName,
  eventProperties,
  onClick,
  ...props
}: TrackedLinkProps) {
  return (
    <a
      {...props}
      onClick={(event) => {
        trackHomeEvent(eventName, eventProperties)
        onClick?.(event)
      }}
    >
      {children}
    </a>
  )
}

