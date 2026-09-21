import type { Metadata } from 'next'
import HomeAnalytics from '@/components/home/HomeAnalytics'
import HomeExperience from '@/components/home/HomeExperience'
import styles from '@/components/home/home.module.css'
import { homeDisplay, homeSans } from '@/components/home/home-fonts'

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
      <HomeExperience />
    </div>
  )
}
