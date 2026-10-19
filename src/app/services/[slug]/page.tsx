import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import { SERVICE_PAGES, getServicePage } from '../service-pages'

const SITE_URL = 'https://www.yasmin-alsham.fashion'
const WHATSAPP_URL = 'https://wa.me/966598862609'

interface Props {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return SERVICE_PAGES.map(page => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = getServicePage(slug)
  if (!page) return {}

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/services/${page.slug}/` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `/services/${page.slug}/`,
      images: [{ url: `${SITE_URL}/yasmin.jpg` }],
    },
  }
}

export default async function ServiceLandingPage({ params }: Props) {
  const { slug } = await params
  const page = getServicePage(slug)
  if (!page) notFound()

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: page.heading,
    description: page.description,
    url: `${SITE_URL}/services/${page.slug}/`,
    areaServed: ['الخبر', 'الدمام', 'الظهران', 'المنطقة الشرقية'],
    provider: { '@type': 'ClothingStore', name: 'ياسمين الشام', url: SITE_URL, telephone: '+966598862609' },
  }

  return (
    <div className="min-h-screen bg-[#fbf8f3]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <SiteHeader />
      <main className="pt-24 pb-16">
        <article className="container mx-auto max-w-3xl px-4 sm:px-6">
          <nav className="mb-6 text-sm text-[#211b19]/60">
            <Link href="/" className="hover:text-[#6b1726]">الرئيسية</Link>
            <span className="mx-2">/</span>
            <Link href="/services/" className="hover:text-[#6b1726]">الخدمات</Link>
          </nav>

          <h1 className="mb-4 text-3xl font-bold leading-tight text-[#211b19] sm:text-4xl">{page.heading}</h1>
          <p className="mb-8 text-lg leading-relaxed text-[#211b19]/80">{page.intro}</p>

          <ul className="mb-10 space-y-3">
            {page.points.map(point => (
              <li key={point} className="flex gap-3 rounded-2xl bg-white p-4 leading-relaxed text-[#211b19] shadow-sm">
                <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#6b1726]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mb-12 flex flex-col gap-3 sm:flex-row">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#6b1726] px-6 py-3 text-center font-bold text-white transition-colors hover:bg-[#2f0c14]">
              تواصلي معنا عبر واتساب
            </a>
            <Link href="/fabrics/" className="rounded-xl border border-[#6b1726]/30 px-6 py-3 text-center font-bold text-[#6b1726] transition-colors hover:bg-white">
              تصفحي متجر الأقمشة
            </Link>
            <Link href="/location/" className="rounded-xl border border-[#6b1726]/30 px-6 py-3 text-center font-bold text-[#6b1726] transition-colors hover:bg-white">
              موقع المحل
            </Link>
          </div>

          <section>
            <h2 className="mb-4 text-xl font-bold text-[#211b19]">خدمات أخرى</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {page.related.map(relatedSlug => {
                const related = getServicePage(relatedSlug)
                if (!related) return null
                return (
                  <Link key={related.slug} href={`/services/${related.slug}/`} className="rounded-2xl bg-white p-4 font-bold text-[#6b1726] shadow-sm transition-shadow hover:shadow-md">
                    {related.heading}
                  </Link>
                )
              })}
            </div>
          </section>
        </article>
      </main>
    </div>
  )
}
