'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

const socialLinks = [
  {
    name: 'الموقع الرسمي',
    handle: 'yasmin-alsham.fashion',
    href: 'https://www.yasmin-alsham.fashion/',
    external: true,
    iconColor: '#db2777',
    iconBg: '#fce7f3',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.038 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.038-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    name: 'إنستغرام',
    handle: 'yasminalsham.fashion',
    href: 'https://www.instagram.com/yasminalsham.fashion/',
    external: true,
    iconColor: '#be185d',
    iconBg: '#fdf2f8',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    name: 'تيك توك',
    handle: '@_yasmin._.alsham',
    href: 'https://www.tiktok.com/@_yasmin._.alsham?is_from_webapp=1&sender_device=pc',
    external: true,
    iconColor: '#9d174d',
    iconBg: '#fce7f3',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.22 8.22 0 0 0 4.79 1.53V4.56a4.85 4.85 0 0 1-1.02-.12z" />
      </svg>
    ),
  },
  {
    name: 'واتساب',
    handle: '‎+966 598 862 609',
    href: 'https://wa.me/+966598862609',
    external: true,
    iconColor: '#15803d',
    iconBg: '#dcfce7',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
      </svg>
    ),
  },
  {
    name: 'اتصل بنا',
    handle: '+966 598 862 609',
    href: 'tel:+966598862609',
    external: false,
    iconColor: '#7c3aed',
    iconBg: '#f5f3ff',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
      </svg>
    ),
  },
  {
    name: 'خرائط جوجل',
    handle: 'موقعنا على الخريطة',
    href: 'https://www.google.com/maps/place/%D9%8A%D8%A7%D8%B3%D9%85%D9%8A%D9%86+%D8%A7%D9%84%D8%B4%D8%A7%D9%85+%D9%84%D9%84%D8%AE%D9%8A%D8%A7%D8%B7%D8%A9%E2%80%AD/@26.2868966,50.2104386,17z/data=!3m1!4b1!4m6!3m5!1s0x3e49e97c0f6dcf65:0x4665c7cacc482501!8m2!3d26.2868966!4d50.2104386!16s%2Fg%2F11fmrdwsw3?entry=ttu&g_ep=EgoyMDI2MDMxOC4xIKXMDSoASAFQAw%3D%3D',
    external: true,
    iconColor: '#dc2626',
    iconBg: '#fee2e2',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
      </svg>
    ),
  },
]

export default function SocialPage() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center px-4 py-14 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #fff0f6 0%, #fdf2f8 50%, #f5f3ff 100%)' }}
      dir="rtl"
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none select-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-40 blur-[80px]"
          style={{ background: 'radial-gradient(circle, #fbcfe8, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full opacity-30 blur-[70px]"
          style={{ background: 'radial-gradient(circle, #e9d5ff, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full opacity-20 blur-[60px]"
          style={{ background: 'radial-gradient(circle, #fda4af, transparent 70%)' }}
        />
      </div>

      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #f9a8d4 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* ===== Profile ===== */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center text-center mb-10"
      >
        {/* Avatar */}
        <div className="relative mb-5">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="absolute -inset-[3px] rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, #ec4899, #f9a8d4, #a855f7, #f9a8d4, #ec4899)',
              borderRadius: '9999px',
            }}
          />
          <div
            className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl z-10"
            style={{ background: 'linear-gradient(135deg, #fce7f3, #f3e8ff)' }}
          >
            🌸
          </div>
        </div>

        {/* Name */}
        <h1
          className="text-3xl font-bold mb-1"
          style={{
            background: 'linear-gradient(90deg, #be185d, #ec4899, #9333ea)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          ياسمين الشام
        </h1>

        <p className="text-sm font-medium text-pink-400 mt-1">
          تفصيل فساتين حسب الطلب · المملكة العربية السعودية
        </p>

        {/* Divider */}
        <div className="flex items-center gap-2 mt-5">
          <div className="w-14 h-px bg-gradient-to-l from-pink-300 to-transparent" />
          <div className="w-2 h-2 rounded-full bg-pink-300" />
          <div className="w-14 h-px bg-gradient-to-r from-pink-300 to-transparent" />
        </div>
      </motion.div>

      {/* ===== Links ===== */}
      <div className="relative z-10 w-full max-w-[400px] flex flex-col gap-3">
        {socialLinks.map((link, i) => (
          <motion.div
            key={link.name}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 + i * 0.08, ease: 'easeOut' }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <Link
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl transition-all duration-300 group"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(251,207,232,0.6)',
                boxShadow: '0 2px 16px rgba(236,72,153,0.08), 0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              {/* Icon */}
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                style={{ background: link.iconBg, color: link.iconColor }}
              >
                {link.icon}
              </div>

              {/* Text */}
              <div className="flex-1 text-right">
                <div className="font-bold text-base text-gray-800 leading-tight">
                  {link.name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 font-medium" dir="ltr" style={{ textAlign: 'right' }}>
                  {link.handle}
                </div>
              </div>

              {/* Arrow */}
              <div
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:translate-x-[-2px]"
                style={{ background: link.iconBg, color: link.iconColor }}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ===== Footer ===== */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.1 }}
        className="relative z-10 mt-12 text-xs text-pink-300 text-center"
      >
        © 2026 ياسمين الشام · جميع الحقوق محفوظة
      </motion.p>
    </div>
  )
}
