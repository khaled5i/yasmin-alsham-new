'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ArrowUp } from 'lucide-react'

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false)
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null)

  // إظهار/إخفاء الزر بناءً على موضع التمرير والحركة
  useEffect(() => {
    const handleScroll = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true)
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
        scrollTimeout.current = setTimeout(() => {
          setIsVisible(false)
        }, 1000)
      } else {
        setIsVisible(false)
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
      }
    }

    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
    }
  }, [])

  // دالة التمرير لأعلى الصفحة
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50"
        >
          <motion.button
            onClick={scrollToTop}
            whileHover={{
              scale: 1.05,
              y: -2
            }}
            whileTap={{
              scale: 0.95
            }}
            className="group relative overflow-hidden"
            aria-label="العودة لأعلى الصفحة"
          >
            {/* الخلفية الزجاجية المموهة */}
            <div className="relative w-12 h-12 bg-white/20 backdrop-blur-md border border-white/30 rounded-full shadow-2xl hover:shadow-pink-500/25 transition-all duration-300">
              {/* تأثير التدرج الداخلي */}
              <div className="absolute inset-0 bg-gradient-to-br from-pink-400/30 via-rose-400/20 to-purple-400/30 rounded-full opacity-80 group-hover:opacity-100 transition-opacity duration-300"></div>

              {/* تأثير الإضاءة */}
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-white/20 rounded-full"></div>

              {/* الأيقونة */}
              <div className="relative w-full h-full flex items-center justify-center">
                <motion.div
                  animate={{
                    y: [0, -2, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="text-pink-600 group-hover:text-pink-700 transition-colors duration-300"
                >
                  <ArrowUp className="w-5 h-5 drop-shadow-sm" strokeWidth={2.5} />
                </motion.div>
              </div>

              {/* تأثير الهوفر المتوهج */}
              <motion.div
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full blur-sm"
              />

              {/* حدود متوهجة عند الهوفر */}
              <motion.div
                initial={{ opacity: 0, scale: 1 }}
                whileHover={{
                  opacity: 1,
                  scale: 1.1,
                  transition: { duration: 0.3 }
                }}
                className="absolute -inset-1 bg-gradient-to-r from-pink-400/40 to-purple-400/40 rounded-full blur-md -z-10"
              />
            </div>

            {/* نص مساعد */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileHover={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute -top-12 left-1/2 transform -translate-x-1/2 whitespace-nowrap"
            >
              <div className="bg-gray-800/90 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg shadow-lg border border-gray-700/50">
                العودة للأعلى
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800/90"></div>
              </div>
            </motion.div>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
