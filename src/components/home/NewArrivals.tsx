import { ArrowLeft } from 'lucide-react'
import { fabricCardImage, fabricCardPrice, fabricCardTitle } from '@/lib/fabric-card-display'
import ArrivalLink from './ArrivalLink'
import { fabricListingTime, type HomeFabricRow } from './home-store-data'
import styles from './home.module.css'

/**
 * أحدث الأقمشة في الصفحة الرئيسية: أقمشة حقيقية بأسعارها تُبنى على الخادم،
 * فيراها Google والزائرة في الشاشة الثانية مباشرة (كما يفعل House of CB وJoel & Son).
 */

const SHOWN = 10

export default function NewArrivals({ fabrics }: { fabrics: HomeFabricRow[] }) {
  const arrivals = [...fabrics].sort((a, b) => fabricListingTime(b) - fabricListingTime(a)).slice(0, SHOWN)
  if (arrivals.length === 0) return null

  return (
    <section id="new-arrivals" className={styles.arrivalsSection} aria-labelledby="new-arrivals-title">
      <div className={styles.arrivalsInner}>
        <header className={styles.arrivalsHeader}>
          <h2 id="new-arrivals-title" className={styles.arrivalsTitle}>أحدث أقمشة ياسمين الشام</h2>
        </header>

        <ul className={styles.arrivalsRail}>
          {arrivals.map((row, index) => {
            const image = fabricCardImage(row)
            const price = fabricCardPrice(row)
            const title = fabricCardTitle(row)
            return (
              <li key={row.id} className={styles.arrivalCard}>
                <ArrivalLink
                  href={`/fabrics/${row.id}`}
                  className={styles.arrivalLink}
                  eventName="home_new_arrival_click"
                  eventProperties={{ fabric_code: row.fabric_code ?? '', position: index + 1 }}
                >
                  <span className={styles.arrivalImage}>
                    {image && (
                      // eslint-disable-next-line @next/next/no-img-element -- صور Supabase المحوّلة كما في بطاقات المتجر
                      <img src={image} alt={title} width={480} height={640} loading="lazy" decoding="async" />
                    )}
                  </span>
                  <span className={styles.arrivalName}>{title}</span>
                  {price && <span className={styles.arrivalPrice}>{price}</span>}
                </ArrivalLink>
              </li>
            )
          })}
        </ul>

        {/* تحت البطاقات وفي جهة اليسار (نهاية السطر في RTL) */}
        <div className={styles.arrivalsFooter}>
          <ArrivalLink
            href="/fabrics"
            className={styles.arrivalsAll}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'fabrics', placement: 'new_arrivals' }}
          >
            كل الأقمشة
            <ArrowLeft aria-hidden="true" />
          </ArrivalLink>
        </div>
      </div>
    </section>
  )
}
