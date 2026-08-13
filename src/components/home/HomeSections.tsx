import Image from 'next/image'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import ResponsiveHeroMedia from './ResponsiveHeroMedia'
import TailoringShowcase from './TailoringShowcase'
import TrackedLink from './TrackedLink'
import { homeMedia, tailoringShowcase, tailoringWhatsAppUrl } from './home-data'
import styles from './home.module.css'

export type HomeSectionKey = 'tailoring' | 'fabrics'

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
        <p className={styles.heroEyebrow}>دار تفصيل وأقمشة <span aria-hidden="true" /> الخبر</p>
        <h1 id="home-hero-title">من القماش…<br />نصنع حكايتك</h1>
        <p className={styles.heroLead}>تفصيل يليق بك، وأقمشة اختيرت لتبدأ منها كل التفاصيل.</p>
        <div className={styles.heroActions}>
          <TrackedLink
            href="#tailoring"
            className={styles.primaryButton}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'tailoring' }}
            onClick={(event) => {
              event.preventDefault()
              onSelectSection('tailoring')
            }}
          >
            تفصيل فستان سهرة
          </TrackedLink>
          <TrackedLink
            href="#fabrics"
            className={styles.secondaryButton}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'fabrics' }}
            onClick={(event) => {
              event.preventDefault()
              onSelectSection('fabrics')
            }}
          >
            متجر الأقمشة
          </TrackedLink>
        </div>
      </div>

      <a className={styles.heroScrollCue} href="#business-gateway" aria-label="الانتقال إلى مسارات الموقع">
        <span>اكتشفي</span>
        <i aria-hidden="true" />
      </a>
    </section>
  )
}

export function BusinessGateway({ onSelectSection }: SectionSelectionProps) {
  return (
    <section id="business-gateway" className={styles.gatewaySection} aria-labelledby="gateway-title">
      <div className={styles.gatewayIntro}>
        <p className={styles.sectionEyebrow}>مساران، حكاية واحدة</p>
        <h2 id="gateway-title" className={styles.visuallyHidden}>اختاري بين التفصيل ومتجر الأقمشة</h2>
        <p>ابدئي من الفكرة، أو من الخامة.</p>
      </div>

      <div className={styles.gatewayGrid}>
        <a
          href="#tailoring"
          className={`${styles.gatewayCard} ${styles.gatewayTailoring}`}
          onClick={(event) => {
            event.preventDefault()
            onSelectSection('tailoring')
          }}
        >
          <Image
            src={homeMedia.craftPoster}
            alt="فستان سهرة منفذ بعناية داخل المشغل"
            fill
            sizes="(max-width: 767px) 54vw, 54vw"
            className={styles.gatewayImage}
          />
          <span className={styles.gatewayOverlay} />
          <span className={styles.gatewayNumber}>01</span>
          <span className={styles.gatewayContent}>
            <small>حرفة تصنع لك</small>
            <strong>تفصيل ياسمين الشام</strong>
            <span>فستان يبدأ من تفاصيلك وينفذ بعناية في مشغلنا.</span>
            <em>اكتشفي الحرفة <ArrowLeft aria-hidden="true" /></em>
          </span>
        </a>

        <a
          href="#fabrics"
          className={`${styles.gatewayCard} ${styles.gatewayFabrics}`}
          onClick={(event) => {
            event.preventDefault()
            onSelectSection('fabrics')
          }}
        >
          <Image
            src={homeMedia.transitionPoster}
            alt="تفاصيل قماش فاخر وتطريز ناعم"
            fill
            sizes="(max-width: 767px) 46vw, 42vw"
            className={styles.gatewayImage}
          />
          <span className={styles.gatewayOverlay} />
          <span className={styles.gatewayNumber}>02</span>
          <span className={styles.gatewayContent}>
            <small>البداية من القماش</small>
            <strong>متجر الأقمشة</strong>
            <span>تشكيلة مختارة للمناسبات والتصاميم المميزة.</span>
            <em>تصفحي المتجر <ArrowLeft aria-hidden="true" /></em>
          </span>
        </a>
      </div>
    </section>
  )
}

export function TailoringStory({ onSelectSection }: SectionSelectionProps) {
  return (
    <>
      <section className={styles.tailoringHero} aria-labelledby="tailoring-title">
        <ResponsiveHeroMedia {...homeMedia.hero} />
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
              <TrackedLink
                href="#fabrics"
                className={styles.fabricStorePromptButton}
                eventName="hero_cta_click"
                eventProperties={{ destination: 'fabrics', placement: 'tailoring_footer' }}
                onClick={(event) => {
                  event.preventDefault()
                  onSelectSection('fabrics')
                }}
              >
                زوري متجر الأقمشة
                <ArrowLeft aria-hidden="true" />
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function FabricTransition() {
  return (
    <section className={styles.fabricTransition} aria-label="الانتقال من التفصيل إلى الأقمشة">
      <Image
        src={homeMedia.transitionPoster}
        alt=""
        fill
        sizes="100vw"
        className={styles.transitionImage}
      />
      <span className={styles.transitionShade} />
      <div>
        <p>كل فستان استثنائي</p>
        <h2>يبدأ بقماش استثنائي</h2>
      </div>
    </section>
  )
}
