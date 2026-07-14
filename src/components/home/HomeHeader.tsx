'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  HelpCircle,
  Menu,
  MessageCircle,
  Palette,
  Scissors,
  Search,
  Share2,
  Sparkles,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import { tailoringWhatsAppUrl } from './home-data'
import { trackHomeEvent } from './home-analytics'
import styles from './home.module.css'

const navItems = [
  { label: 'التفصيل', href: '#tailoring' },
  { label: 'متجر الأقمشة', href: '#fabrics' },
]

const serviceItems = [
  { label: 'الفساتين الجاهزة', href: '/designs', icon: Palette },
  { label: 'احجزي دورك', href: '/queue', icon: Users },
  { label: 'تتبع الطلب', href: '/track-order', icon: Search },
  { label: 'الأقمشة', href: '/fabrics', icon: Scissors },
  {
    label: 'مصمم ياسمين الشام الذكي',
    href: 'https://yasmin-alsham-ai.com',
    icon: Wand2,
    external: true,
  },
  { label: 'خدماتنا', href: '/services', icon: Sparkles },
  { label: 'الأسئلة الشائعة', href: '/faq', icon: HelpCircle },
  { label: 'تواصل معنا', href: '/social', icon: Share2 },
]

export default function HomeHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const brandClickCountRef = useRef(0)
  const brandClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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
    const clickCount = brandClickCountRef.current + 1
    brandClickCountRef.current = clickCount

    if (brandClickTimeoutRef.current) {
      clearTimeout(brandClickTimeoutRef.current)
    }

    if (clickCount === 3) {
      event.preventDefault()
      brandClickCountRef.current = 0
      brandClickTimeoutRef.current = null
      router.push('/login')
      return
    }

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
      className={`${styles.homeHeader} ${isScrolled || isMenuOpen ? styles.headerSolid : ''}`}
      data-open={isMenuOpen}
    >
      <div className={styles.headerInner}>
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

          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
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
      </div>

      <nav id="home-navigation-menu" className={styles.menuPanel} aria-label="روابط وخدمات ياسمين الشام">
        <div className={styles.menuPanelInner}>
          <div className={styles.mobilePrimaryLinks}>
            {navItems.map((item, index) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                <span>0{index + 1}</span>
                {item.label}
              </a>
            ))}
          </div>

          <div className={styles.menuPanelHeading}>
            <p>روابط وخدمات</p>
            <span>كل ما تحتاجينه في مكان واحد</span>
          </div>

          <div className={styles.serviceMenuGrid}>
            {serviceItems.map(({ label, href, icon: Icon, external }) => (
              <a
                key={href}
                href={href}
                onClick={closeMenu}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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
