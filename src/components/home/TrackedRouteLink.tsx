'use client'

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import type { HomeEventName } from './home-analytics'
import { trackHomeEvent } from './home-analytics'

type TrackedRouteLinkProps = ComponentProps<typeof Link> & {
  children: ReactNode
  eventName: HomeEventName
  eventProperties?: Record<string, string | number | boolean>
}

export default function TrackedRouteLink({
  children,
  eventName,
  eventProperties,
  onClick,
  ...props
}: TrackedRouteLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackHomeEvent(eventName, eventProperties)
        onClick?.(event)
      }}
    >
      {children}
    </Link>
  )
}
