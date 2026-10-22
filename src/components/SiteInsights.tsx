'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { isClarityExcludedPath, isClarityProductionHost, isStaffDevice, markStaffDevice } from '@/lib/analytics-privacy'
import { trackWhatsAppClick } from '@/lib/fabric-analytics'
import { supabase } from '@/lib/supabase'

/**
 * أداتا فهم سلوك الزائرات:
 * 1. عدّاد ضغطات واتساب في كل الموقع (generate_lead في GA) بمستمع واحد، بدل ربط كل زر.
 *    الزر يحدد موضعه بـ data-wa-placement (ورمز القماش بـ data-wa-item) وإلا يُستنتج من المسار.
 * 2. Microsoft Clarity (تسجيل الجلسات والخرائط الحرارية) — يُحمَّل فقط إن ضُبط
 *    NEXT_PUBLIC_CLARITY_PROJECT_ID. لا يُحمَّل في صفحات الدفع وتتبّع الطلب نفسها (نفس
 *    استثناء GA)، ويتوقف إن انتقلت الزائرة إليها. في لوحة Clarity يجب ضبط الإخفاء على
 *    «صارم» (Strict) حتى لا يُسجَّل أي نص يظهر أو يُكتب.
 *    لا يُحمَّل إلا على النطاق الرسمي (لا localhost ولا الشبكة المحلية ولا روابط Vercel التجريبية)،
 *    ولا في /dashboard و/login، ولا لأجهزة الموظفين، ولا لمن له جلسة Supabase بدور غير «client».
 *    الجلسة تُفحص أولاً ولا يُحمَّل السكربت قبل انتهاء الفحص.
 */

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ?? ''

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] }

/** أُوقف التسجيل عند دخول صفحة مستثناة ⇒ يُستأنف عند الخروج منها فقط. */
let clarityStopped = false

function clarityBootstrap(id: string): string {
  return `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.id='clarity-tag';t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,'clarity','script',${JSON.stringify(encodeURIComponent(id))});`
}

/**
 * هل صاحب الجلسة موظف/مدير/عامل؟ أي جلسة Supabase دورها غير «client» تُعدّ موظفاً، وكذلك جلسة
 * تعذّر جلب دورها (الفشل مغلق: الزبونات لا يدخلن بحسابات Supabase أصلاً).
 */
async function sessionIsStaff(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('users').select('role').eq('id', userId).maybeSingle()
    if (error || !data) return true
    return data.role !== 'client'
  } catch {
    return true
  }
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
      const itemId = link.dataset.waItem
      trackWhatsAppClick(
        link.dataset.waPlacement || placementFor(window.location.pathname),
        itemId ? { id: itemId } : undefined
      )
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])

  // null = الفحص لم ينتهِ بعد ⇒ لا تحميل حتى يتضح
  const [visitorAllowed, setVisitorAllowed] = useState<boolean | null>(null)
  const [clarityRequested, setClarityRequested] = useState(false)

  useEffect(() => {
    if (!CLARITY_ID || !isClarityProductionHost(window.location.hostname) || isStaffDevice()) {
      setVisitorAllowed(false)
      return
    }
    let cancelled = false
    const markStaff = () => {
      markStaffDevice()
      if (cancelled) return
      setVisitorAllowed(false)
      const clarity = (window as unknown as { clarity?: ClarityFn }).clarity
      if (clarity && !clarityStopped) {
        clarity('stop')
        clarityStopped = true
      }
    }
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && await sessionIsStaff(session.user.id)) markStaff()
        else if (!cancelled) setVisitorAllowed(true)
      } catch {
        if (!cancelled) setVisitorAllowed(false)
      }
    })()
    // من سجّل دخوله أثناء الزيارة يُوقف تسجيله فوراً
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // خارج المستدعي: استعلام Supabase داخل onAuthStateChange نفسه قد يعلق على قفل الجلسة
        const userId = session.user.id
        setTimeout(() => { void sessionIsStaff(userId).then(staff => { if (staff) markStaff() }) }, 0)
      }
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!visitorAllowed) return
    const excluded = isClarityExcludedPath(pathname)
    const clarity = (window as unknown as { clarity?: ClarityFn }).clarity
    if (excluded) {
      if (clarity && !clarityStopped) {
        clarity('stop')
        clarityStopped = true
      }
      return
    }
    if (!clarity) setClarityRequested(true)
    else if (clarityStopped) {
      clarity('start')
      clarityStopped = false
    }
  }, [pathname, visitorAllowed])

  if (!clarityRequested || !visitorAllowed) return null
  return (
    <Script id="clarity-bootstrap" strategy="lazyOnload">
      {clarityBootstrap(CLARITY_ID)}
    </Script>
  )
}
