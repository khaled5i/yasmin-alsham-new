'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { reloadOnceForStaleBuild } from '@/lib/stale-build-recovery'

/** حدّ الأخطاء للصفحات: بدل صفحة بيضاء ترى الزائرة رسالة وزر إعادة المحاولة. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (reloadOnceForStaleBuild(error)) return
    console.error('Page error boundary:', error)
  }, [error])

  return (
    <div dir="rtl" className="min-h-screen bg-[#fbf8f3] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#211b19] mb-3">حدث خطأ غير متوقع</h1>
        <p className="text-[#211b19]/70 mb-6">نعتذر، تعذّر عرض هذه الصفحة. جرّبي مرة أخرى أو عودي للمتجر.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-[#6b1726] px-5 py-2.5 font-bold text-white transition-colors hover:bg-[#2f0c14]"
          >
            إعادة المحاولة
          </button>
          <Link href="/fabrics" className="rounded-xl border border-[#6b1726]/30 px-5 py-2.5 font-bold text-[#6b1726] transition-colors hover:bg-white">
            متجر الأقمشة
          </Link>
          <Link href="/" className="rounded-xl border border-[#6b1726]/30 px-5 py-2.5 font-bold text-[#6b1726] transition-colors hover:bg-white">
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  )
}
