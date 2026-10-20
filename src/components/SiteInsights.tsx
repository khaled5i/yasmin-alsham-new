'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isAnalyticsExcludedPath, isStaffDevice } from '@/lib/analytics-privacy'
import { trackWhatsAppClick } from '@/lib/fabric-analytics'

/**
 * أداتا فهم سلوك الزائرات:
 * 1. عدّاد ضغطات واتساب في كل الموقع (generate_lead في GA) بمستمع واحد، بدل ربط كل زر.
 * 2. Microsoft Clarity (تسجيل الجلسات والخرائط الحرارية) — يُحمَّل فقط إن ضُبط
 *    NEXT_PUBLIC_CLARITY_PROJECT_ID. لا يُحمَّل في صفحات الدفع وتتبّع الطلب نفسها (نفس
 *    استثناء GA)، ويتوقف إن انتقلت الزائرة إليها. في لوحة Clarity يجب ضبط الإخفاء على
 *    «صارم» (Strict) حتى لا يُسجَّل أي نص يظهر أو يُكتب. لا يُحمَّل على أجهزة الموظفين.
 */

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ?? ''

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] }

/** أُوقف التسجيل عند دخول صفحة مستثناة ⇒ يُستأنف عند الخروج منها فقط. */
let clarityStopped = false

function loadClarity(id: string) {
  const win = window as unknown as { clarity?: ClarityFn }
  if (win.clarity || document.getElementById('clarity-tag')) return
  const queue: ClarityFn = Object.assign((...args: unknown[]) => { (queue.q = queue.q || []).push(args) }, {})
  win.clarity = queue
  const script = document.createElement('script')
  script.id = 'clarity-tag'
  script.async = true
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

function placementFor(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'home'
  if (pathname.startsWith('/fabrics/cart')) return 'cart'
  if (pathname.startsWith('/fabrics/favorites')) return 'favorites'
  if (/^\/fabrics\/[^/]+\/?$/.test(pathname)) return 'fabric_page'
  if (pathname.startsWith('/fabrics')) return 'store'
  return pathname.split('/').filter(Boolean)[0] ?? 'other'
}

export default function SiteInsights() {
  const pathname = usePathname() ?? '/'

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link) return
      const href = link.href
      if (!/(^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/)|^whatsapp:/i.test(href)) return
      trackWhatsAppClick(placementFor(window.location.pathname))
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])

  useEffect(() => {
    // أجهزة الموظفين لا تُسجَّل جلساتها: لا تخلط تصرّف الموظفين بتصرّف الزبونات
    if (!CLARITY_ID || isStaffDevice()) return
    const excluded = isAnalyticsExcludedPath(pathname)
    const clarity = (window as unknown as { clarity?: ClarityFn }).clarity
    if (excluded) {
      if (clarity && !clarityStopped) {
        clarity('stop')
        clarityStopped = true
      }
      return
    }
    if (!clarity) loadClarity(CLARITY_ID)
    else if (clarityStopped) {
      clarity('start')
      clarityStopped = false
    }
  }, [pathname])

  return null
}
