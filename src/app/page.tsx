'use client'

import Header from '@/components/Header'
import Hero from '@/components/Hero'
import ReadyDesigns from '@/components/ReadyDesigns'
import FeaturedFabrics from '@/components/FeaturedFabrics'
import Services from '@/components/Services'
import FAQ from '@/components/FAQ'
import Footer from '@/components/Footer'
import ScrollToTop from '@/components/ScrollToTop'

export default function Home() {

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <ReadyDesigns />
        <FeaturedFabrics />
        <Services />
        <FAQ />
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  )
}
