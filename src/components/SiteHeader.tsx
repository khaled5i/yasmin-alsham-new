'use client'

/**
 * الشريط العلوي للصفحات الخارجية الداخلية (تتبع الطلب، خدماتنا، الأسئلة الشائعة،
 * حجز موعد، شركاء النجاح). هو نفس شريط الصفحة الرئيسية (HomeHeader) بخلفية ثابتة،
 * فتبقى القائمة وروابطها في مكان واحد للموقع كله.
 */

import { useRouter } from 'next/navigation'
import HomeHeader from '@/components/home/HomeHeader'
import { homeDisplay, homeSans } from '@/components/home/home-fonts'
import styles from '@/components/home/home.module.css'

export default function SiteHeader() {
  const router = useRouter()

  return (
    <div className={`${styles.siteHeaderScope} ${homeSans.variable} ${homeDisplay.variable}`}>
      <HomeHeader
        forceSolid
        onSelectHome={() => router.push('/')}
        onSelectSection={(section) => router.push(`/#${section}`)}
      />
    </div>
  )
}
