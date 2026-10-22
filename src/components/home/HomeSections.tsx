import Image from 'next/image'
import { ArrowLeft, ChevronDown, MessageCircle } from 'lucide-react'
import ResponsiveHeroMedia from './ResponsiveHeroMedia'
import TailoringShowcase from './TailoringShowcase'
import TrackedLink from './TrackedLink'
import TrackedRouteLink from './TrackedRouteLink'
import { homeMedia, tailoringShowcase, tailoringWhatsAppUrl } from './home-data'
import styles from './home.module.css'

export type HomeSectionKey = 'tailoring'

type SectionSelectionProps = {
  onSelectSection: (section: HomeSectionKey) => void
}

export function CinematicHero({ onSelectSection }: SectionSelectionProps) {
  return (
    <section id="top" className={styles.heroSection} aria-labelledby="home-hero-title">
      <ResponsiveHeroMedia {...homeMedia.hero} />
      <div className={styles.heroShade} />
      <div className={styles.heroGrain} />

      <div className={styles.heroContent}>
        {/* الشعار يظهر في نسخة الجوال فقط (يُخفى بالـ CSS على الشاشات الأكبر) */}
        <Image
          src="/media/home/hero-logo-v2.webp"
          alt="ياسمين الشام"
          width={900}
          height={379}
          priority
          sizes="80vw"
          className={styles.heroLogo}
        />
        <p className={styles.heroEyebrow}>ياسمين الشام <span aria-hidden="true" /> الخبر</p>
        <h1 id="home-hero-title">القماش والخياطة{' '}<br />في مكان واحد...</h1>
        <div className={styles.heroActions}>
          <TrackedRouteLink
            href="/fabrics"
            className={styles.primaryButton}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'fabrics' }}
          >
            متجر الأقمشة
          </TrackedRouteLink>
          <TrackedLink
            href="#tailoring"
            className={styles.secondaryButton}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'tailoring' }}
            onClick={(event) => {
              event.preventDefault()
              onSelectSection('tailoring')
            }}
          >
            قسم الخياطة
          </TrackedLink>
        </div>

        {/* تمرير مباشر بدل تغيير الـ hash: الانتقال إلى #new-arrivals يطلق popstate،
            ومستمع HomeExperience يعيد الصفحة حينها إلى الأعلى فيبدو السهم معطّلاً على الجوال */}
        <a
          className={styles.heroScrollCue}
          href="#new-arrivals"
          aria-label="الانتقال إلى أحدث الأقمشة"
          onClick={(event) => {
            const target = document.getElementById('new-arrivals')
            if (!target) return
            event.preventDefault()
            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <ChevronDown aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

export function TailoringStory() {
  return (
    <>
      <section className={styles.tailoringHero} aria-labelledby="tailoring-title">
        <ResponsiveHeroMedia {...homeMedia.tailoringHero} />
        <div className={styles.tailoringHeroShade} />
        <div className={styles.heroGrain} />

        <div className={styles.tailoringHeroContent}>
          <p className={styles.heroEyebrow}>مشغل ياسمين الشام <span aria-hidden="true" /> الخبر</p>
          <h1 id="tailoring-title">من فكرتكِ…<br />إلى فستانٍ يشبهكِ</h1>
          <p>نصمّم ونفصّل فساتين السهرة بعناية تُرى في كل غرزة.</p>
          <TrackedLink
            href="#tailoring-work"
            className={styles.tailoringHeroButton}
            eventName="tailoring_work_scroll"
          >
            شاهدي أعمالنا السابقة
          </TrackedLink>
        </div>
        <a className={styles.tailoringScrollMark} href="#tailoring-work" aria-label="الانتقال إلى أعمالنا السابقة">
          <span aria-hidden="true" />
        </a>
      </section>

      <section id="tailoring-work" className={styles.tailoringWorksSection} aria-labelledby="tailoring-work-title">
        <p className={styles.tailoringSectionNotice}>أنتِ الآن في قسم التفصيل التابع لياسمين الشام</p>
        <div className={styles.tailoringWorksInner}>
          <header className={styles.tailoringWorksHeader}>
            <h2 id="tailoring-work-title">من أعمال ياسمين الشام</h2>
          </header>

          <TailoringShowcase items={tailoringShowcase} />

          <div className={styles.tailoringContactCta}>
            <p>شاركينا فكرتك عبر واتساب، وسيساعدك فريق ياسمين الشام في الخطوة التالية.</p>
            <TrackedLink
              href={tailoringWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.tailoringWhatsAppButton}
              eventName="tailoring_whatsapp_click"
              eventProperties={{ placement: 'tailoring_cta' }}
            >
              <MessageCircle aria-hidden="true" />
              تواصلي مع قسم التفصيل
            </TrackedLink>
            <div className={styles.fabricStorePrompt}>
              <p>ليس لديكِ قماش بعد؟</p>
              <TrackedRouteLink
                href="/fabrics"
                className={styles.fabricStorePromptButton}
                eventName="hero_cta_click"
                eventProperties={{ destination: 'fabrics', placement: 'tailoring_footer' }}
              >
                زوري متجر الأقمشة
                <ArrowLeft aria-hidden="true" />
              </TrackedRouteLink>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
