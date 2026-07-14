import type { Metadata } from 'next'
import { IBM_Plex_Sans_Arabic, Noto_Naskh_Arabic } from 'next/font/google'
import HomeAnalytics from '@/components/home/HomeAnalytics'
import HomeHeader from '@/components/home/HomeHeader'
import HomeFooter from '@/components/home/HomeFooter'
import FeaturedFabricStore from '@/components/home/FeaturedFabricStore'
import {
  BusinessGateway,
  CinematicHero,
  FabricTransition,
  TailoringStory,
  TrustStrip,
} from '@/components/home/HomeSections'
import styles from '@/components/home/home.module.css'

const homeSans = IBM_Plex_Sans_Arabic({
  variable: '--font-home-sans',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const homeDisplay = Noto_Naskh_Arabic({
  variable: '--font-home-display',
  subsets: ['arabic'],
  weight: ['500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ياسمين الشام | تفصيل فساتين ومتجر أقمشة في الخبر',
  description:
    'اكتشفي تفصيل ياسمين الشام وتصفحي تشكيلة الأقمشة المختارة لفساتين السهرة والمناسبات في الخبر.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'ياسمين الشام | من القماش… نصنع حكايتك',
    description: 'تفصيل يليق بك، وأقمشة اختيرت لتبدأ منها كل التفاصيل.',
    url: '/',
    images: [
      {
        url: '/media/home/hero-desktop.webp',
        width: 1600,
        height: 900,
        alt: 'فستان سهرة في مشغل ياسمين الشام',
      },
    ],
  },
}

export default function Home() {
  return (
    <div className={`${styles.homeShell} ${homeSans.variable} ${homeDisplay.variable}`}>
      <HomeAnalytics />
      <HomeHeader />
      <main>
        <CinematicHero />
        <BusinessGateway />
        <TailoringStory />
        <FabricTransition />
        <FeaturedFabricStore />
        <TrustStrip />
      </main>
      <HomeFooter />
    </div>
  )
}
