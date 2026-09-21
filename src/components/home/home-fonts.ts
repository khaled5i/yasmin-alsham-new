import { IBM_Plex_Sans_Arabic, Noto_Naskh_Arabic } from 'next/font/google'

// خطوط الواجهة الجديدة — مشتركة بين الصفحة الرئيسية وشريط الصفحات الداخلية
export const homeSans = IBM_Plex_Sans_Arabic({
  variable: '--font-home-sans',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const homeDisplay = Noto_Naskh_Arabic({
  variable: '--font-home-display',
  subsets: ['arabic'],
  weight: ['500', '600', '700'],
  display: 'swap',
})
