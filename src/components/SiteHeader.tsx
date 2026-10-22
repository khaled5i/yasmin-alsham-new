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

// tone="wine" للصفحات التي انتقلت لألوان الواجهة الجديدة؛ الافتراضي يبقى وردياً لباقي الصفحات
export default function SiteHeader({ tone = 'rose' }: { tone?: 'rose' | 'wine' }) {
  const router = useRouter()
  const scope = tone === 'wine' ? styles.siteHeaderWine : styles.siteHeaderScope

  return (
    <div className={`${scope} ${homeSans.variable} ${homeDisplay.variable}`}>
      <HomeHeader
        forceSolid
        onSelectHome={() => router.push('/')}
        onSelectSection={(section) => router.push(`/#${section}`)}
      />
    </div>
  )
}
