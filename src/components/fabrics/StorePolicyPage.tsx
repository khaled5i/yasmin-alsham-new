import Link from 'next/link'
import type { ReactNode } from 'react'
import { STORE_POLICIES_UPDATED_AT } from '@/lib/store-legal'
import StoreLegalFooter from './StoreLegalFooter'

/** هيكل مشترك لصفحات سياسات متجر الأقمشة (شروط البيع، الاسترجاع، الشحن). */
export default function StorePolicyPage({ title, intro, children }: {
  title: string
  intro: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <main className="min-h-screen bg-[#fbf8f3] px-4 pb-12 pt-20 text-[#211b19] lg:pt-24">
        <article className="mx-auto max-w-3xl rounded-2xl border-2 border-[#d8c5ae] bg-white p-5 sm:p-8">
          <nav className="mb-4 text-sm">
            <Link href="/fabrics" className="font-semibold text-[#6b1726] hover:underline">← العودة لمتجر الأقمشة</Link>
          </nav>
          <h1 className="text-3xl font-bold text-[#6b1726]">{title}</h1>
          <p className="mt-1 text-sm text-[#211b19]/60">آخر تحديث: {STORE_POLICIES_UPDATED_AT}</p>
          <div className="mt-4 leading-relaxed text-[#211b19]/85">{intro}</div>
          <div className="mt-6 space-y-7 leading-relaxed text-[#211b19]/85">{children}</div>
        </article>
      </main>
      <StoreLegalFooter />
    </>
  )
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-bold text-[#211b19]">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export function PolicyList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pr-5 marker:text-[#6b1726]">
      {items.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
  )
}
