import Image from 'next/image'
import Link from 'next/link'
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
  const valuePoints = [
    {
      title: 'تصميم يراعي شخصيتك',
      text: 'نتعامل مع كل فستان كعمل مستقل، يبدأ من ذوقك والمناسبة.',
    },
    {
      title: 'تنفيذ دقيق',
      text: 'اهتمام بالقصّة والبطانة والقص والتشطيب في كل مرحلة.',
    },
    {
      title: 'اختيار متكامل',
      text: 'يمكن أن تبدأ الفكرة من تشكيلة الأقمشة المتوفرة لدينا.',
    },
  ]

  const processSteps = [
    ['الفكرة', 'نفهم الشكل المطلوب والمناسبة وتفضيلاتك.'],
    ['القماش والتفاصيل', 'نختار الخامة واللون والتطريز المناسب.'],
    ['التنفيذ', 'يبدأ القص والخياطة وضبط كل تفصيل.'],
    ['اللمسة الأخيرة', 'نراجع التشطيب ونظهر الفستان بصورته النهائية.'],
  ]

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

        <ol className={styles.valuePoints}>
          {valuePoints.map((point, index) => (
            <li key={point.title}>
              <span>0{index + 1}</span>
              <div>
                <h3>{point.title}</h3>
                <p>{point.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className={styles.processBlock}>
          <div className={styles.processIntro}>
            <p className={styles.sectionEyebrow}>من الفكرة إلى الفستان</p>
            <h3>أربع مراحل،<br />واهتمام واحد.</h3>
          </div>
          <ol className={styles.processList}>
            {processSteps.map(([title, description], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{title}</h4>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
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

export function TrustStrip() {
  return (
    <section className={styles.trustStrip} aria-label="ما نعتني به">
      <div>
        <p><span>01</span>تفصيل بعناية في كل مرحلة.</p>
        <p><span>02</span>أقمشة مختارة للمناسبات.</p>
        <p><span>03</span>تواصل مباشر عبر واتساب.</p>
      </div>
    </section>
  )
}

