'use client'

import { useEffect } from 'react'
import { reloadOnceForStaleBuild } from '@/lib/stale-build-recovery'

/**
 * آخر خط دفاع: خطأ في التخطيط الجذري نفسه (layout.tsx) يتجاوز error.tsx، فيستبدل هذا الملف
 * الصفحة كاملة — لذلك يحمل <html> و<body> وأنماطه بنفسه (globals.css قد لا تكون محمّلة).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (reloadOnceForStaleBuild(error)) return
    console.error('Global error boundary:', error)
  }, [error])

  const button = { borderRadius: 12, padding: '10px 20px', fontWeight: 700, fontSize: 15, cursor: 'pointer', textDecoration: 'none' } as const

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fbf8f3', fontFamily: 'system-ui, sans-serif', color: '#211b19', padding: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>حدث خطأ غير متوقع</h1>
          <p style={{ opacity: 0.7, marginBottom: 24 }}>نعتذر، تعذّر تحميل الموقع. جرّبي مرة أخرى.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={reset} style={{ ...button, border: 'none', background: '#6b1726', color: '#fff' }}>
              إعادة المحاولة
            </button>
            {/* <a> لا <Link>: الموجّه نفسه قد يكون معطوباً هنا */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ ...button, border: '1px solid rgba(107,23,38,.3)', color: '#6b1726' }}>
              الصفحة الرئيسية
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
