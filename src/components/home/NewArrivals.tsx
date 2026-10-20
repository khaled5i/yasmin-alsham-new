import { ArrowLeft } from 'lucide-react'
import { fabricCardImage, fabricCardPrice, fabricCardTitle } from '@/lib/fabric-card-display'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { StoreTrustStrip } from '@/components/fabrics/StoreTrust'
import ArrivalLink from './ArrivalLink'
import { fabricListingTime, type HomeFabricRow } from './home-store-data'
import styles from './home.module.css'

/**
 * «وصل حديثاً» في الصفحة الرئيسية: أقمشة حقيقية بأسعارها تُبنى على الخادم،
 * فيراها Google والزائرة في الشاشة الثانية مباشرة (كما يفعل House of CB وJoel & Son).
 */

const SHOWN = 10
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export default function NewArrivals({ fabrics }: { fabrics: HomeFabricRow[] }) {
  const arrivals = [...fabrics].sort((a, b) => fabricListingTime(b) - fabricListingTime(a)).slice(0, SHOWN)
  if (arrivals.length === 0) return null

  const weekAgo = Date.now() - WEEK_MS
  const thisWeek = arrivals.filter(row => Date.parse(row.created_at) >= weekAgo).length
  const heading = thisWeek >= 3 ? `وصل هذا الأسبوع: ${formatFabricNumber(thisWeek)} أقمشة` : 'أحدث الأقمشة في المتجر'

  return (
    <section id="new-arrivals" className={styles.arrivalsSection} aria-labelledby="new-arrivals-title">
      <div className={styles.arrivalsInner}>
        <header className={styles.arrivalsHeader}>
          <div>
            <p className={styles.sectionEyebrow}>وصل حديثاً</p>
            <h2 id="new-arrivals-title" className={styles.arrivalsTitle}>{heading}</h2>
          </div>
          <ArrivalLink
            href="/fabrics"
            className={styles.arrivalsAll}
            eventName="hero_cta_click"
            eventProperties={{ destination: 'fabrics', placement: 'new_arrivals' }}
          >
            كل الأقمشة
            <ArrowLeft aria-hidden="true" />
          </ArrivalLink>
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

        <StoreTrustStrip className={styles.arrivalsTrust} />
      </div>
    </section>
  )
}
