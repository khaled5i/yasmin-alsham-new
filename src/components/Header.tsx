'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Menu, X, Calendar, Search, Scissors, Palette, Home, Sparkles, HelpCircle, Wand2 } from 'lucide-react'

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [clickCount, setClickCount] = useState(0)
  const [isScrolled, setIsScrolled] = useState(false)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  // التحقق من أننا في الصفحة الرئيسية
  const isHomePage = pathname === '/'

  // تتبع السكرول للتحكم في شفافية الهيدر
  useEffect(() => {
    if (!isHomePage) {
      setIsScrolled(true)
      return
    }

    const handleScroll = () => {
      // الحصول على عنصر الـ scroll container على الموبايل
      const mainContainer = document.getElementById('main-scroll-container')

      // التحقق من حجم الشاشة (موبايل أو ديسكتوب)
      const isMobile = window.innerWidth < 1024

      if (isMobile && mainContainer) {
        // على الموبايل: استخدم scrollTop من الـ main container
        const scrollPosition = mainContainer.scrollTop
        // إذا تجاوز السكرول نصف ارتفاع الشاشة، غير للأبيض
        setIsScrolled(scrollPosition > window.innerHeight * 0.5)
      } else {
        // على الديسكتوب: استخدم window scroll
        const readyDesignsSection = document.getElementById('ready-designs')
        if (readyDesignsSection) {
          const sectionTop = readyDesignsSection.getBoundingClientRect().top
          setIsScrolled(sectionTop <= 80)
        } else {
          setIsScrolled(window.scrollY > window.innerHeight - 100)
        }
      }
    }

    // الاستماع للـ scroll على كل من الـ main container و window
    const mainContainer = document.getElementById('main-scroll-container')

    if (mainContainer) {
      mainContainer.addEventListener('scroll', handleScroll, { passive: true })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    handleScroll() // فحص أولي

    return () => {
      if (mainContainer) {
        mainContainer.removeEventListener('scroll', handleScroll)
      }
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [isHomePage])

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault()

    // زيادة العداد والحصول على القيمة الجديدة
    const newClickCount = clickCount + 1
    setClickCount(newClickCount)

    // مسح أي timeout سابق
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
    }

    // النقرة الأولى: الذهاب للصفحة الرئيسية
    if (newClickCount === 1) {
      router.push('/')
      // إعادة تعيين العداد بعد ثانيتين
      clickTimeoutRef.current = setTimeout(() => {
        setClickCount(0)
      }, 2000)
      return
    }

    // النقرة الثالثة: الانتقال لصفحة تسجيل الدخول
    if (newClickCount === 3) {
      router.push('/login')
      setClickCount(0)
      return
    }

    // النقرة الثانية أو أي نقرة أخرى: إعادة تعيين العداد بعد ثانيتين
    clickTimeoutRef.current = setTimeout(() => {
      setClickCount(0)
    }, 2000)
  }

  // دالة للتمرير إلى قسم معين في الصفحة الرئيسية
  const scrollToSection = (sectionId: string) => {
    // إغلاق القائمة
    setIsMenuOpen(false)

    // إذا لم نكن في الصفحة الرئيسية، انتقل إليها أولاً
    if (!isHomePage) {
      router.push('/')
      // انتظر قليلاً حتى يتم تحميل الصفحة ثم scroll
      setTimeout(() => {
        const section = document.getElementById(sectionId)
        const container = document.getElementById('main-scroll-container')
        if (section && container) {
          const isMobile = window.innerWidth < 1024
          if (isMobile) {
            // على الموبايل: استخدم scrollIntoView على الـ container
            section.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else {
            // على الديسكتوب: استخدم window scroll
            const offsetTop = section.offsetTop - 80
            window.scrollTo({ top: offsetTop, behavior: 'smooth' })
          }
        }
      }, 500)
    } else {
      // نحن بالفعل في الصفحة الرئيسية، scroll مباشرة
      const section = document.getElementById(sectionId)
      const container = document.getElementById('main-scroll-container')
      if (section && container) {
        const isMobile = window.innerWidth < 1024
        if (isMobile) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          const offsetTop = section.offsetTop - 80
          window.scrollTo({ top: offsetTop, behavior: 'smooth' })
        }
      }
    }
  }

  const menuItems = [
    { href: '/', label: 'الرئيسية', icon: Home, onClick: null, external: false },
    { href: '#', label: 'الفساتين الجاهزة', icon: Palette, onClick: () => scrollToSection('ready-designs'), external: false },
    // [HIDDEN TEMPORARILY] حجز موعد - مخفي مؤقتاً
    // { href: '/book-appointment', label: 'حجز موعد', icon: Calendar, onClick: null, external: false },
    { href: '/track-order', label: 'تتبع الطلب', icon: Search, onClick: null, external: false },
    { href: '#', label: 'الأقمشة', icon: Scissors, onClick: () => scrollToSection('featured-fabrics'), external: false },
    { href: 'https://yasmin-alsham-ai.com', label: 'مصمم ياسمين الشام الذكي', icon: Wand2, onClick: null, external: true },
    { href: '/services', label: 'خدماتنا', icon: Sparkles, onClick: null, external: false },
    { href: '/faq', label: 'الأسئلة الشائعة', icon: HelpCircle, onClick: null, external: false },
  ]

  // تحديد الكلاسات الديناميكية للهيدر
  const getHeaderClasses = () => {
    // على Capacitor (تطبيق موبايل): دائماً خلفية بيضاء
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return 'bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-sm'
    }

    if (!isHomePage) {
      // صفحات أخرى: دائماً أبيض
      return 'bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-sm'
    }
    if (isMenuOpen) {
      // القائمة مفتوحة: خلفية بيضاء كاملة لتوحيد اللون مع القائمة المنسدلة
      return 'bg-white border-b border-pink-100 shadow-sm'
    }
    if (isScrolled) {
      // بعد السكرول: خلفية بيضاء
      return 'bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-sm'
    }
    // في Hero على الويب فقط: شفاف
    return 'bg-transparent lg:bg-white/95 lg:backdrop-blur-md lg:border-b lg:border-pink-100 lg:shadow-sm'
  }

  return (
    <header
      ref={menuRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${getHeaderClasses()}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20 relative">

          {/* أيقونة القائمة - الهاتف المحمول فقط */}
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            onClick={toggleMenu}
            className={`lg:hidden p-2 rounded-lg transition-all duration-300 ${isHomePage && !isScrolled && !isMenuOpen && !(typeof window !== 'undefined' && (window as any).Capacitor)
              ? 'text-white hover:bg-white/20'
              : 'text-pink-600 hover:bg-pink-50'
              }`}
          >
            {isMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </motion.button>

          {/* الشعار - في المنتصف تماماً على الجوال */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0 cursor-pointer hover:opacity-80 transition-opacity duration-300 lg:flex lg:items-center lg:space-x-2 lg:space-x-reverse"
            onClick={handleLogoClick}
          >
            <div className="text-center lg:text-right">
              <h1 className={`text-xl lg:text-2xl font-bold transition-colors duration-300 ${isHomePage && !isScrolled && !isMenuOpen && !(typeof window !== 'undefined' && (window as any).Capacitor)
                ? 'text-white drop-shadow-lg lg:bg-gradient-to-r lg:from-pink-600 lg:to-rose-600 lg:bg-clip-text lg:text-transparent'
                : 'bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent'
                }`}>
                ياسمين الشام
              </h1>

              {/* إخفاء العنوان الفرعي في الهاتف المحمول */}
              <p className="hidden lg:block text-xs lg:text-sm text-gray-600 font-medium">
                تفصيل فساتين حسب الطلب
              </p>
            </div>
          </motion.div>



          {/* القائمة الرئيسية - الشاشات الكبيرة */}
          <nav className="hidden lg:flex flex-1 items-center justify-end gap-x-8 gap-x-reverse lg:order-1">
            {menuItems.filter(item => item.label !== 'الرئيسية').map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                {item.onClick ? (
                  <button
                    onClick={item.onClick}
                    className="icon-text-spacing text-gray-700 hover:text-pink-600 transition-colors duration-300 font-medium group"
                  >
                    {item.icon && (
                      <item.icon className="w-4 h-4 menu-item-icon group-hover:scale-110 transition-transform duration-300" />
                    )}
                    <span className="relative">
                      {item.label}
                      <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-pink-400 to-rose-400 group-hover:w-full transition-all duration-300"></span>
                    </span>
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    className="icon-text-spacing text-gray-700 hover:text-pink-600 transition-colors duration-300 font-medium group"
                  >
                    {item.icon && (
                      <item.icon className="w-4 h-4 menu-item-icon group-hover:scale-110 transition-transform duration-300" />
                    )}
                    <span className="relative">
                      {item.label}
                      <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-pink-400 to-rose-400 group-hover:w-full transition-all duration-300"></span>
                    </span>
                  </Link>
                )}
              </motion.div>
            ))}
          </nav>
        </div>

        {/* القائمة المنسدلة - الشاشات الصغيرة */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{
            opacity: isMenuOpen ? 1 : 0,
            height: isMenuOpen ? 'auto' : 0,
          }}
          transition={{ duration: 0.3 }}
          className="lg:hidden overflow-hidden bg-white border-t border-pink-100"
        >
          <nav className="py-4 space-y-2">
            {menuItems.filter(item => item.label !== 'الرئيسية').map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: isMenuOpen ? 1 : 0,
                  x: isMenuOpen ? 0 : -20,
                }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                {item.onClick ? (
                  <button
                    onClick={item.onClick}
                    className="flex items-center space-x-3 space-x-reverse px-4 py-3 text-gray-700 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-all duration-300 font-medium w-full text-right"
                  >
                    {item.icon && <item.icon className="w-5 h-5 ml-3" />}
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center space-x-3 space-x-reverse px-4 py-3 text-gray-700 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-all duration-300 font-medium"
                  >
                    {item.icon && <item.icon className="w-5 h-5 ml-3" />}
                    <span>{item.label}</span>
                  </Link>
                )}
              </motion.div>
            ))}
          </nav>
        </motion.div>
      </div>
    </header>
  )
}
