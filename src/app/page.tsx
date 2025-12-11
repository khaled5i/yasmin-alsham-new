'use client'

import Header from '@/components/Header'
import Hero from '@/components/Hero'
import ReadyDesigns from '@/components/ReadyDesigns'
import FeaturedFabrics from '@/components/FeaturedFabrics'
import Footer from '@/components/Footer'
import ScrollToTop from '@/components/ScrollToTop'

export default function Home() {

  return (
    <div className="min-h-screen">
      <Header />
      {/* Snap Scroll Container للموبايل فقط */}
      <main
        id="main-scroll-container"
        className="
          lg:block
          max-lg:h-screen max-lg:overflow-y-auto max-lg:snap-y max-lg:snap-mandatory
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
