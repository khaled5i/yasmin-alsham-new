'use client'

import { useEffect } from 'react'
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import ReadyDesigns from '@/components/ReadyDesigns'
import FeaturedFabrics from '@/components/FeaturedFabrics'
import Footer from '@/components/Footer'
import ScrollToTop from '@/components/ScrollToTop'

export default function Home() {
  // إضافة class "scrolling" عند التمرير على الموبايل
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout

    const handleScroll = () => {
      const container = document.getElementById('main-scroll-container')
      if (container && window.innerWidth < 1024) {
        container.classList.add('scrolling')
        document.documentElement.classList.add('scrolling')
        document.body.classList.add('scrolling')

        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          container.classList.remove('scrolling')
          document.documentElement.classList.remove('scrolling')
          document.body.classList.remove('scrolling')
        }, 1000)
      }
    }

    const container = document.getElementById('main-scroll-container')
    if (container) {
      container.addEventListener('scroll', handleScroll)
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll)
      }
      clearTimeout(scrollTimeout)
    }
  }, [])

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      {/* Snap Scroll Container للموبايل فقط */}
      <main
        id="main-scroll-container"
        className="
          lg:block
          max-lg:h-screen max-lg:overflow-y-auto max-lg:overflow-x-hidden max-lg:snap-y max-lg:snap-mandatory
          max-lg:scroll-smooth max-lg:overscroll-none
        "
        style={{
          // @ts-ignore - Custom CSS properties for smooth snap
          scrollBehavior: 'smooth',
          scrollSnapStop: 'always',
        }}
      >
        <Hero />
        <ReadyDesigns />
        <FeaturedFabrics />
        {/* Footer داخل الـ snap على الموبايل */}
        <div className="max-lg:snap-start lg:block">
          <Footer />
        </div>
      </main>
      <ScrollToTop />
    </div>
  )
}
