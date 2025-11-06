'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Menu, X, Calendar, Search, Scissors, Palette, Home } from 'lucide-react'

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [clickCount, setClickCount] = useState(0)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault()

    setClickCount(prev => prev + 1)

    // إذا كان هذا النقر الثالث، انتقل لصفحة تسجيل الدخول
    if (clickCount === 2) {
      router.push('/login')
      setClickCount(0)
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
      return
    }

    // إعادة تعيين العداد بعد ثانيتين
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
    }

    clickTimeoutRef.current = setTimeout(() => {
      setClickCount(0)
    }, 2000)
  }

  const menuItems = [
    { href: '/', label: 'الرئيسية', icon: Home },
    { href: '/designs', label: 'الفساتين الجاهزة', icon: Palette },
    { href: '/book-appointment', label: 'حجز موعد', icon: Calendar },
    { href: '/track-order', label: 'تتبع الطلب', icon: Search },
    { href: '/fabrics', label: 'الأقمشة', icon: Scissors },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20 relative">

          {/* أيقونة القائمة - الهاتف المحمول فقط */}
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            onClick={toggleMenu}
            className="lg:hidden p-2 rounded-lg text-pink-600 hover:bg-pink-50 transition-all duration-300"
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
              <h1 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
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
                key={item.href}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Link
                  href={item.href}
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
                key={item.href}
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: isMenuOpen ? 1 : 0,
                  x: isMenuOpen ? 0 : -20,
                }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Link
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center space-x-3 space-x-reverse px-4 py-3 text-gray-700 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-all duration-300 font-medium"
                >
                  {item.icon && <item.icon className="w-5 h-5 ml-3" />}
                  <span>{item.label}</span>
                </Link>
              </motion.div>
            ))}
          </nav>
        </motion.div>
      </div>
    </header>
  )
}
