'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, X } from 'lucide-react'
import { homeDisplay, homeSans } from '@/components/home/home-fonts'

type ContactMode = 'whatsapp' | 'call'

// ألوان الهوية نفسها المستخدمة في الصفحة الرئيسية (home.module.css)
const brand = {
  wine: '#6b1726',
  deepWine: '#2f0c14',
  ivory: '#f6f0e8',
  ivorySoft: '#fbf8f3',
  sand: '#d8c5ae',
  charcoal: '#211b19',
  gold: '#b99a68',
}

// أرقام الأقسام: زرّا «واتساب» و«اتصل بنا» يفتحان نافذة يختار منها العميل القسم
const departments = [
  { name: 'قسم الأقمشة', e164: '966539686805', display: '+966 53 968 6805' },
  { name: 'قسم الخياطة', e164: '966598862609', display: '+966 59 886 2609' },
  { name: 'المشغل النسائي للمقاسات', e164: '966544233281', display: '+966 54 423 3281' },
]

type SocialLink = {
  name: string
  handle: string
  href: string
  external: boolean
  contact?: ContactMode
  icon: React.ReactNode
}

const followLinks: SocialLink[] = [
  {
    name: 'تيك توك',
    handle: '@yasminalshamtextile',
    href: 'https://www.tiktok.com/@yasminalshamtextile',
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.22 8.22 0 0 0 4.79 1.53V4.56a4.85 4.85 0 0 1-1.02-.12z" />
      </svg>
    ),
  },
  {
    name: 'إنستغرام',
    handle: '@yasminalshamtextile',
    href: 'https://www.instagram.com/yasminalshamtextile',
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    name: 'الموقع الرسمي',
    handle: 'yasmin-alsham.fashion',
    href: 'https://www.yasmin-alsham.fashion/',
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.038 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.038-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
]

const contactLinks: SocialLink[] = [
  {
    name: 'واتساب',
    handle: 'الأقمشة · الخياطة · المشغل النسائي',
    href: '#whatsapp',
    external: false,
    contact: 'whatsapp',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
      </svg>
    ),
  },
  {
    name: 'اتصل بنا',
    handle: 'الأقمشة · الخياطة · المشغل النسائي',
    href: '#call',
    external: false,
    contact: 'call',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
      </svg>
    ),
  },
  {
    name: 'موقعنا على الخريطة',
    handle: 'الخبر · خرائط جوجل',
    href: 'https://www.google.com/maps/place/%D9%8A%D8%A7%D8%B3%D9%85%D9%8A%D9%86+%D8%A7%D9%84%D8%B4%D8%A7%D9%85+%D9%84%D9%84%D8%AE%D9%8A%D8%A7%D8%B7%D8%A9%E2%80%AD/@26.2868966,50.2104386,17z/data=!3m1!4b1!4m6!3m5!1s0x3e49e97c0f6dcf65:0x4665c7cacc482501!8m2!3d26.2868966!4d50.2104386!16s%2Fg%2F11fmrdwsw3?entry=ttu&g_ep=EgoyMDI2MDMxOC4xIKXMDSoASAFQAw%3D%3D',
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
      </svg>
    ),
  },
]

function GoldDivider({ light = false }: { light?: boolean }) {
  const line = light ? 'rgba(185,154,104,0.7)' : 'rgba(185,154,104,0.55)'
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden="true">
      <span className="h-px w-12" style={{ background: `linear-gradient(to left, ${line}, transparent)` }} />
      <span className="h-1.5 w-1.5 rotate-45" style={{ background: brand.gold }} />
      <span className="h-px w-12" style={{ background: `linear-gradient(to right, ${line}, transparent)` }} />
    </div>
  )
}

export default function SocialPage() {
  const [contactMode, setContactMode] = useState<ContactMode | null>(null)

  useEffect(() => {
    if (!contactMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContactMode(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contactMode])

  const isWhatsApp = contactMode === 'whatsapp'

  const renderLink = (link: SocialLink, index: number) => (
    <motion.li
      key={link.name}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.25 + index * 0.07, ease: 'easeOut' }}
    >
      <Link
        href={link.href}
        onClick={link.contact ? (event) => {
          event.preventDefault()
          setContactMode(link.contact!)
        } : undefined}
        target={link.external ? '_blank' : undefined}
        rel={link.external ? 'noopener noreferrer' : undefined}
        className="group flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{
          background: brand.ivorySoft,
          borderColor: 'rgba(216,197,174,0.7)',
          boxShadow: '0 1px 2px rgba(47,12,20,0.04), 0 8px 24px -16px rgba(47,12,20,0.18)',
          outlineColor: brand.gold,
        }}
      >
        <span
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-300 group-hover:!bg-[#6b1726] group-hover:!text-white"
          style={{ background: brand.ivory, borderColor: 'rgba(185,154,104,0.35)', color: brand.wine }}
        >
          {link.icon}
        </span>

        <span className="min-w-0 flex-1 text-right">
          <span className="block text-[15px] font-semibold leading-tight" style={{ color: brand.charcoal }}>
            {link.name}
          </span>
          <span
            className="mt-1 block truncate text-xs"
            style={{ color: 'rgba(33,27,25,0.55)', textAlign: 'right' }}
            dir={link.handle.startsWith('@') || link.handle.includes('.fashion') ? 'ltr' : undefined}
          >
            {link.handle}
          </span>
        </span>

        <ChevronLeft
          className="h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:-translate-x-1"
          style={{ color: brand.gold }}
          aria-hidden="true"
        />
      </Link>
    </motion.li>
  )

  return (
    <div
      className={`${homeSans.variable} ${homeDisplay.variable} relative min-h-screen`}
      style={{ background: brand.ivory, color: brand.charcoal, fontFamily: 'var(--font-home-sans), sans-serif' }}
      dir="rtl"
    >
      {/* ===== الترويسة: الشعار والشعار اللفظي ===== */}
      <header
        className="relative overflow-hidden px-4 pb-16 pt-5 text-center"
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, #84202f 0%, ${brand.wine} 45%, ${brand.deepWine} 100%)`,
          borderBottomLeftRadius: '36px',
          borderBottomRightRadius: '36px',
        }}
      >
        {/* زخرفة خفيفة: إطار ذهبي رفيع ونقش منقّط */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 top-3 border"
          style={{ borderColor: 'rgba(185,154,104,0.28)', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px', borderTop: 'none' }}
          aria-hidden="true"
        />

        <div className="relative mx-auto flex w-full max-w-[440px] justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            style={{ borderColor: 'rgba(255,255,255,0.22)' }}
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            الصفحة الرئيسية
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="relative mx-auto mt-8 flex max-w-[440px] flex-col items-center"
        >
          <h1 className="sr-only">ياسمين الشام</h1>
          <Image
            src="/media/home/hero-logo-v2.webp"
            alt="ياسمين الشام"
            width={900}
            height={379}
            priority
            sizes="(max-width: 480px) 72vw, 300px"
            className="h-auto w-[72vw] max-w-[300px] drop-shadow-[0_6px_24px_rgba(0,0,0,0.25)]"
          />

          <div className="mt-6">
            <GoldDivider light />
          </div>

          <p
            className="mt-4 text-[1.55rem] font-semibold leading-snug text-white sm:text-[1.75rem]"
            style={{ fontFamily: 'var(--font-home-display), serif' }}
          >
            القماش والخياطة في مكان واحد
          </p>
          <p className="mt-2 text-xs font-medium tracking-[0.18em]" style={{ color: '#e3cfa8' }}>
            الخبر · المملكة العربية السعودية
          </p>
        </motion.div>
      </header>

      {/* ===== الروابط ===== */}
      <main className="relative z-10 mx-auto -mt-8 w-full max-w-[440px] px-4 pb-10">
        <section aria-labelledby="follow-title" className="rounded-[28px] border p-4 sm:p-5" style={{ background: '#fff', borderColor: 'rgba(216,197,174,0.6)', boxShadow: '0 18px 50px -24px rgba(47,12,20,0.35)' }}>
          <h2 id="follow-title" className="mb-3 px-1 text-right text-[13px] font-semibold" style={{ color: brand.wine }}>
            تابعينا
          </h2>
          <ul className="flex flex-col gap-2.5">
            {followLinks.map((link, i) => renderLink(link, i))}
          </ul>

          <div className="my-5">
            <GoldDivider />
          </div>

          <h2 className="mb-3 px-1 text-right text-[13px] font-semibold" style={{ color: brand.wine }}>
            تواصلي معنا
          </h2>
          <ul className="flex flex-col gap-2.5">
            {contactLinks.map((link, i) => renderLink(link, followLinks.length + i))}
          </ul>
        </section>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="mt-8 text-center text-[11px]"
          style={{ color: 'rgba(33,27,25,0.45)' }}
        >
          © {new Date().getFullYear()} ياسمين الشام · جميع الحقوق محفوظة
        </motion.p>
      </main>

      {/* ===== نافذة اختيار القسم (واتساب / اتصال) ===== */}
      <AnimatePresence>
        {contactMode && (
          <motion.div
            key="contact-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
            style={{ background: 'rgba(47,12,20,0.45)' }}
            onClick={() => setContactMode(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="contact-sheet-title"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full max-w-[440px] rounded-t-[28px] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-[28px] sm:pb-6"
              style={{ background: brand.ivorySoft }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-1 flex items-center justify-between">
                <h2
                  id="contact-sheet-title"
                  className="text-xl font-semibold"
                  style={{ color: brand.wine, fontFamily: 'var(--font-home-display), serif' }}
                >
                  {isWhatsApp ? 'راسلينا على واتساب' : 'اتصلي بنا'}
                </h2>
                <button
                  type="button"
                  onClick={() => setContactMode(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-[#f6f0e8]"
                  style={{ borderColor: 'rgba(216,197,174,0.8)', color: brand.wine }}
                  aria-label="إغلاق"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className="mb-4 text-sm" style={{ color: 'rgba(33,27,25,0.6)' }}>
                اختاري القسم الذي تريدين التواصل معه
              </p>

              <div className="flex flex-col gap-2.5">
                {departments.map((department) => (
                  <a
                    key={department.e164}
                    href={isWhatsApp ? `https://wa.me/${department.e164}` : `tel:+${department.e164}`}
                    target={isWhatsApp ? '_blank' : undefined}
                    rel={isWhatsApp ? 'noopener noreferrer' : undefined}
                    className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition-transform active:scale-[0.98]"
                    style={{ borderColor: 'rgba(216,197,174,0.7)' }}
                  >
                    <div className="flex-1 text-right">
                      <div className="font-semibold" style={{ color: brand.charcoal }}>{department.name}</div>
                      <div className="mt-0.5 text-sm" dir="ltr" style={{ textAlign: 'right', color: 'rgba(33,27,25,0.55)' }}>
                        {department.display}
                      </div>
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
                      style={{ background: brand.wine }}
                    >
                      {isWhatsApp ? 'واتساب' : 'اتصال'}
                    </span>
                  </a>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
