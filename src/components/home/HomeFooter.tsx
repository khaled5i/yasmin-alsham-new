import Link from 'next/link'
import { Instagram, MapPin, MessageCircle, Phone } from 'lucide-react'
import { tailoringWhatsAppUrl } from './home-data'
import type { HomeSectionKey } from './HomeSections'
import styles from './home.module.css'

type HomeFooterProps = {
  onSelectSection: (section: HomeSectionKey) => void
}

export default function HomeFooter({ onSelectSection }: HomeFooterProps) {
  return (
    <footer className={styles.homeFooter}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}>
          <p>ياسمين الشام</p>
          <small>YASMIN AL-SHAM</small>
          <span>من القماش… نصنع حكايتك.</span>
        </div>

        <nav className={styles.footerNav} aria-label="روابط الموقع">
          <p>استكشفي</p>
          <a
            href="#tailoring"
            onClick={(event) => {
              event.preventDefault()
              onSelectSection('tailoring')
            }}
          >
            التفصيل
          </a>
          <Link href="/fabrics">متجر الأقمشة</Link>
          <Link href="/location">الموقع والخريطة</Link>
        </nav>

        <div className={styles.footerContact}>
          <p>تواصلي معنا</p>
          <a href={tailoringWhatsAppUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" /> واتساب
          </a>
          <a href="tel:+966598862609"><Phone aria-hidden="true" /> <bdi dir="ltr">+966 59 886 2609</bdi></a>
          <Link href="/location"><MapPin aria-hidden="true" /> الخبر، المنطقة الشرقية</Link>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <div className={styles.socialLinks}>
          <a href="https://www.instagram.com/yasmin_alsham_fashion" target="_blank" rel="noopener noreferrer" aria-label="إنستغرام">
            <Instagram aria-hidden="true" />
          </a>
          <a href="https://www.tiktok.com/@yasminalsham.fashion" target="_blank" rel="noopener noreferrer" aria-label="تيك توك">
            TK
          </a>
        </div>
        <div>
          <Link href="/privacy-policy">سياسة الخصوصية</Link>
          <Link href="/terms-of-service">شروط الخدمة</Link>
        </div>
        <p>© 2026 ياسمين الشام.</p>
      </div>
    </footer>
  )
}
