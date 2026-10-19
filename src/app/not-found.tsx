import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'الصفحة غير موجودة - ياسمين الشام',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#fbf8f3] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#211b19] mb-3">الصفحة غير موجودة</h1>
        <p className="text-[#211b19]/70 mb-6">ربما نُقلت هذه الصفحة أو لم يعد المنتج متوفراً.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/fabrics" className="rounded-xl bg-[#6b1726] px-5 py-2.5 font-bold text-white transition-colors hover:bg-[#2f0c14]">
            تصفحي متجر الأقمشة
          </Link>
          <Link href="/" className="rounded-xl border border-[#6b1726]/30 px-5 py-2.5 font-bold text-[#6b1726] transition-colors hover:bg-white">
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  )
}
