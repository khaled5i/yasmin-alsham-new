import Image from 'next/image'
import { ArrowDown, ArrowLeft, MessageCircle } from 'lucide-react'
import ResponsiveHeroMedia from './ResponsiveHeroMedia'
import TailoringShowcase from './TailoringShowcase'
import TrackedLink from './TrackedLink'
import { homeMedia, tailoringShowcase, tailoringWhatsAppUrl } from './home-data'
import styles from './home.module.css'

export function CinematicHero() {
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
          >
            اكتشفي التفصيل
            <ArrowDown aria-hidden="true" />
          </TrackedLink>
          <TrackedLink
            href="#fabrics"
            className={styles.secondaryButton}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'fabrics' }}
          >
            تسوّقي الأقمشة
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

export function BusinessGateway() {
  return (
    <section id="business-gateway" className={styles.gatewaySection} aria-labelledby="gateway-title">
      <div className={styles.gatewayIntro}>
        <p className={styles.sectionEyebrow}>مساران، حكاية واحدة</p>
        <h2 id="gateway-title" className={styles.visuallyHidden}>اختاري بين التفصيل ومتجر الأقمشة</h2>
        <p>ابدئي من الفكرة، أو من الخامة.</p>
      </div>

      <div className={styles.gatewayGrid}>
        <a href="#tailoring" className={`${styles.gatewayCard} ${styles.gatewayTailoring}`}>
          <Image
            src={homeMedia.craftPoster}
            alt="فستان سهرة منفذ بعناية داخل المشغل"
            fill
            sizes="(max-width: 767px) 92vw, 54vw"
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

        <a href="#fabrics" className={`${styles.gatewayCard} ${styles.gatewayFabrics}`}>
          <Image
            src={homeMedia.transitionPoster}
            alt="تفاصيل قماش فاخر وتطريز ناعم"
            fill
            sizes="(max-width: 767px) 92vw, 42vw"
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

export function TailoringStory() {
  return (
    <section id="tailoring" className={styles.tailoringSection} aria-labelledby="tailoring-title">
      <div className={styles.sectionContainer}>
        <header className={styles.tailoringHeader}>
          <div>
            <p className={styles.sectionEyebrow}>ATELIER · مشغل ياسمين الشام</p>
            <h2 id="tailoring-title" className={styles.sectionTitle}>نصنع فستانًا<br />يحمل تفاصيلك</h2>
          </div>
          <p>من اختيار القماش ورسم الفكرة إلى آخر غرزة، ننفذ كل فستان بعناية توازن بين أناقة التصميم ودقة المقاس وجودة التشطيب.</p>
        </header>

        <div className={styles.craftPanel}>
          <Image
            src={homeMedia.craftPoster}
            alt="فستان سهرة على مانيكان داخل مشغل ياسمين الشام"
            fill
            sizes="(max-width: 767px) 92vw, 76vw"
            className={styles.craftImage}
          />
          <span className={styles.craftShade} />
          <p>لا نتبع التفاصيل…<br /><strong>نصنعها.</strong></p>
          <small>الحرفة في كل مرحلة</small>
        </div>

        <div className={styles.showcaseHeader}>
          <div>
            <p className={styles.sectionEyebrow}>من أعمال ياسمين الشام</p>
            <h3>تفاصيل تروي<br />الحكاية.</h3>
          </div>
          <p>لمسات من القصّة والتطريز والتشطيب، مجمّعة في معرض مستقل للتفصيل.</p>
        </div>
        <TailoringShowcase items={tailoringShowcase} />

        <div className={styles.tailoringCta}>
          <p className={styles.sectionEyebrow}>الخطوة التالية</p>
          <h3>لديك فكرة لفستانك؟</h3>
          <p>شاركينا فكرتك عبر واتساب، وسيساعدك فريق ياسمين الشام في الخطوة التالية.</p>
          <TrackedLink
            href={tailoringWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.lightButton}
            eventName="tailoring_whatsapp_click"
            eventProperties={{ placement: 'tailoring_cta' }}
          >
            <MessageCircle aria-hidden="true" />
            تواصلي مع قسم التفصيل
          </TrackedLink>
        </div>
      </div>
    </section>
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
