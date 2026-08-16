'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  HelpCircle,
  Menu,
  MessageCircle,
  Search,
  Share2,
  Sparkles,
  X,
} from 'lucide-react'
import { tailoringWhatsAppUrl } from './home-data'
import { trackHomeEvent } from './home-analytics'
import type { HomeSectionKey } from './HomeSections'
import styles from './home.module.css'

const navItems = [
  { label: 'التفصيل', href: '#tailoring', section: 'tailoring' },
  { label: 'متجر الأقمشة', href: '#fabrics', section: 'fabrics' },
] satisfies Array<{ label: string; href: string; section: HomeSectionKey }>

const serviceItems = [
  { label: 'تتبع الطلب', href: '/track-order', icon: Search },
  { label: 'خدماتنا', href: '/services', icon: Sparkles },
  { label: 'الأسئلة الشائعة', href: '/faq', icon: HelpCircle },
  { label: 'تواصل معنا', href: '/social', icon: Share2 },
]

type HomeHeaderProps = {
  activeSection?: HomeSectionKey | null
  forceSolid?: boolean
  onSelectHome: () => void
  onSelectSection: (section: HomeSectionKey) => void
}

export default function HomeHeader({
  activeSection = null,
  forceSolid = false,
  onSelectHome,
  onSelectSection,
}: HomeHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const brandClickCountRef = useRef(0)
  const brandClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const router = useRouter()
  const isSectionExperience = activeSection !== null
  const useSolidHeader = !isSectionExperience
    ? forceSolid || isScrolled || isMenuOpen
    : activeSection === 'fabrics' && (forceSolid || isScrolled || isMenuOpen)

  useEffect(() => {
    const updateHeader = () => {
      const scrollTop = window.scrollY
      setIsScrolled(scrollTop > 24)

      if (headerRef.current) {
        const progress = Math.min(1, scrollTop / Math.max(180, window.innerHeight * 0.32))
        headerRef.current.style.setProperty('--tailoring-header-progress', progress.toFixed(3))
      }

      scrollFrameRef.current = null
    }

    const handleScroll = () => {
      if (scrollFrameRef.current !== null) return
      scrollFrameRef.current = window.requestAnimationFrame(updateHeader)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [activeSection])

  useEffect(() => {
    if (!isMenuOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }

    const handleOutsideClick = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    document.addEventListener('pointerdown', handleOutsideClick)

    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.removeEventListener('pointerdown', handleOutsideClick)
    }
  }, [isMenuOpen])

  useEffect(() => {
    return () => {
      if (brandClickTimeoutRef.current) {
        clearTimeout(brandClickTimeoutRef.current)
      }
    }
  }, [])

  const handleBrandClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const clickCount = brandClickCountRef.current + 1
    brandClickCountRef.current = clickCount

    if (brandClickTimeoutRef.current) {
      clearTimeout(brandClickTimeoutRef.current)
    }

    if (clickCount === 3) {
      brandClickCountRef.current = 0
      brandClickTimeoutRef.current = null
      router.push('/login')
      return
    }

    closeMenu()
    onSelectHome()

    brandClickTimeoutRef.current = setTimeout(() => {
      brandClickCountRef.current = 0
      brandClickTimeoutRef.current = null
    }, 2000)
  }

  const closeMenu = () => setIsMenuOpen(false)

  const menuButtonContent = isMenuOpen ? (
    <X aria-hidden="true" />
  ) : (
    <Menu aria-hidden="true" />
  )

  return (
    <header
      ref={headerRef}
      className={`${styles.homeHeader} ${isSectionExperience ? styles.tailoringHomeHeader : ''} ${activeSection === 'fabrics' ? styles.fabricHomeHeader : ''} ${useSolidHeader ? styles.headerSolid : ''}`}
      data-open={isMenuOpen}
    >
      <div className={`${styles.headerInner} ${isSectionExperience ? styles.tailoringHeaderInner : ''}`}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={isMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={isMenuOpen}
          aria-controls="home-navigation-menu"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {menuButtonContent}
        </button>

        <nav className={styles.desktopNav} aria-label="التنقل الرئيسي">
          <button
            type="button"
            className={styles.desktopMenuButton}
            aria-label={isMenuOpen ? 'إغلاق قائمة الروابط والخدمات' : 'فتح قائمة الروابط والخدمات'}
            aria-expanded={isMenuOpen}
            aria-controls="home-navigation-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {menuButtonContent}
            <span>{isMenuOpen ? 'إغلاق' : 'القائمة'}</span>
          </button>

          {isSectionExperience
            ? null
            : navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) => {
                    event.preventDefault()
                    closeMenu()
                    onSelectSection(item.section)
                  }}
                >
                  {item.label}
                </a>
              ))}
        </nav>

        <a
          className={styles.headerBrand}
          href="#top"
          aria-label="ياسمين الشام — الرئيسية"
          onClick={handleBrandClick}
        >
          <span>ياسمين الشام</span>
          <small>YASMIN AL-SHAM</small>
        </a>

        {isSectionExperience ? (
          <button type="button" className={styles.tailoringBackButton} onClick={onSelectHome}>
            <ArrowRight aria-hidden="true" />
            <span>العودة إلى الرئيسية</span>
          </button>
        ) : (
          <a
            href={tailoringWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.headerContact}
            onClick={() => trackHomeEvent('tailoring_whatsapp_click', { placement: 'header' })}
          >
            <MessageCircle aria-hidden="true" />
            <span>تواصلي معنا</span>
          </a>
        )}
      </div>

      <nav id="home-navigation-menu" className={styles.menuPanel} aria-label="روابط وخدمات ياسمين الشام">
        <div className={styles.menuPanelInner}>
          <div className={styles.menuPanelHeading}>
            <p>روابط وخدمات</p>
            <span>كل ما تحتاجينه في مكان واحد</span>
          </div>

          <div className={styles.serviceMenuGrid}>
            {serviceItems.map(({ label, href, icon: Icon }) => (
              <a
                key={href}
                href={href}
                onClick={closeMenu}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
