'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { ArrowRight, Phone, Plus } from 'lucide-react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { homeDisplay, homeSans } from '@/components/home/home-fonts'
import { FAQS } from './faq-data'

// ألوان الهوية الجديدة (نفس متغيرات home.module.css)
const display = 'font-[family-name:var(--font-home-display)]'

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const faqs = FAQS

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className={`${homeSans.variable} ${homeDisplay.variable} min-h-screen bg-[#fbf8f3] font-[family-name:var(--font-home-sans)] text-[#211b19]`}>
      <SiteHeader tone="wine" />
      <main className="pb-20 pt-28 sm:pt-32">
        <div className="mx-auto w-[min(100%-32px,760px)]">
          {/* العنوان */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-10 text-center"
          >
            <p className="text-xs font-semibold tracking-[0.14em] text-[#b99a68]">ياسمين الشام</p>
            <h1 className={`${display} mt-2 text-4xl font-semibold leading-tight text-[#6b1726] sm:text-5xl`}>
              الأسئلة الشائعة
            </h1>
            <div className="mx-auto mt-4 h-px w-16 bg-[#b99a68]" aria-hidden="true" />
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-[#211b19]/70">
              إجابات على أكثر الأسئلة شيوعاً حول خدماتنا وطريقة العمل
            </p>
          </motion.div>

          {/* الأسئلة */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="overflow-hidden rounded-3xl border border-[#d8c5ae] bg-white shadow-[0_18px_50px_-30px_rgba(47,12,20,0.35)]"
          >
            <ul className="divide-y divide-[#d8c5ae]/70">
              {faqs.map((faq, index) => {
                const isOpen = openIndex === index
                return (
                  <li key={index}>
                    <h2>
                      <button
                        type="button"
                        id={`faq-q-${index}`}
                        aria-expanded={isOpen}
                        aria-controls={`faq-a-${index}`}
                        onClick={() => toggleFAQ(index)}
                        className="flex w-full items-center gap-4 px-5 py-5 text-right transition-colors duration-200 hover:bg-[#fbf8f3] focus-visible:bg-[#fbf8f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b99a68] sm:px-7"
                      >
                        <span className={`${display} w-7 flex-shrink-0 text-lg font-semibold text-[#b99a68]`} aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className={`flex-1 text-base font-semibold sm:text-lg ${isOpen ? 'text-[#6b1726]' : 'text-[#211b19]'}`}>
                          {faq.question}
                        </span>
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                            isOpen
                              ? 'rotate-45 border-[#6b1726] bg-[#6b1726] text-[#f6f0e8]'
                              : 'border-[#d8c5ae] text-[#6b1726]'
                          }`}
                          aria-hidden="true"
                        >
                          <Plus className="h-4 w-4" />
                        </span>
                      </button>
                    </h2>

                    <motion.div
                      id={`faq-a-${index}`}
                      role="region"
                      aria-labelledby={`faq-q-${index}`}
                      initial={false}
                      animate={{
                        height: isOpen ? 'auto' : 0,
                        opacity: isOpen ? 1 : 0
                      }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pe-5 ps-16 text-sm leading-loose text-[#211b19]/75 sm:pe-7 sm:ps-[4.5rem] sm:text-base">
                        {faq.answer}
                      </p>
                    </motion.div>
                  </li>
                )
              })}
            </ul>
          </motion.div>

          {/* دعوة للتواصل */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-10 rounded-3xl bg-[#2f0c14] px-6 py-9 text-center text-[#f6f0e8]"
          >
            <p className="text-[0.7rem] font-medium tracking-[0.12em] text-[#b99a68]">نسعد بخدمتك</p>
            <h2 className={`${display} mt-1 text-2xl font-semibold sm:text-3xl`}>
              لديك سؤال آخر؟
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#f6f0e8]/75 sm:text-base">
              لا تترددي في التواصل معنا. فريقنا جاهز للإجابة على جميع استفساراتك.
            </p>

            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="https://wa.me/+966598862609"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f6f0e8] px-7 py-3 font-semibold text-[#2f0c14] transition-colors duration-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2f0c14]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.44 9.43zm8.03-17.46A11.27 11.27 0 0 0 12.05.72C5.8.72.7 5.8.7 12.06c0 2 .52 3.95 1.52 5.67L.6 23.6l6.02-1.58a11.33 11.33 0 0 0 5.42 1.38h.01c6.25 0 11.35-5.09 11.35-11.34 0-3.03-1.18-5.88-3.32-8.02z" />
                </svg>
                <span>واتساب</span>
              </a>
              <a
                href="tel:+966598862609"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f6f0e8]/35 px-7 py-3 font-semibold text-[#f6f0e8] transition-colors duration-300 hover:bg-[#f6f0e8]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2f0c14]"
              >
                <Phone className="h-5 w-5" aria-hidden="true" />
                <span>اتصلي بنا</span>
              </a>
            </div>
          </motion.section>

          {/* زر العودة للصفحة الرئيسية */}
          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6b1726] transition-colors duration-200 hover:text-[#2f0c14] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              <span>العودة للصفحة الرئيسية</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
