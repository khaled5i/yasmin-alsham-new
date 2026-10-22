import { ArrowLeft } from 'lucide-react'
import { fabricCardImage, fabricCardTitle } from '@/lib/fabric-card-display'
import { getSupabaseImageUrl, isVideoFile } from '@/lib/utils/media'
import ArrivalLink from './ArrivalLink'
import type { HomeFabricRow } from './home-store-data'
import styles from './home.module.css'

/**
 * «شاهدي التصميم قبل شراء القماش»: صورة الفستان المنفَّذ في المشغل وبجانبها القماش نفسه.
 * لا يبيع أي منافس حلّلناه القماش ويفصّله في مكان واحد؛ هذا القسم يقول ذلك بالصور.
 * المصدر design_images التي ترفعها المالكة لكل قماش.
 */

const SHOWN = 8

export default function FabricToDress({ fabrics }: { fabrics: HomeFabricRow[] }) {
  const pairs = fabrics
    .map(fabric => {
      const design = (fabric.design_images ?? []).find(url => url && !isVideoFile(url))
      return design ? { fabric, design: getSupabaseImageUrl(design, { width: 520, height: 700, quality: 78 }) } : null
    })
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .sort((a, b) => (b.fabric.design_images?.length ?? 0) - (a.fabric.design_images?.length ?? 0))
    .slice(0, SHOWN)

  if (pairs.length === 0) return null

  return (
    <section className={styles.fabricDressSection} aria-labelledby="fabric-to-dress-title">
      <div className={styles.arrivalsInner}>
        <header className={styles.arrivalsHeader}>
          <div>
            <p className={styles.sectionEyebrow}>لأنك في ياسمين الشام</p>
            <h2 id="fabric-to-dress-title" className={styles.arrivalsTitle}>شاهدي التصميم قبل شراء القماش</h2>
          </div>
        </header>

        <ul className={styles.arrivalsRail}>
          {pairs.map(({ fabric, design }, index) => {
            const title = fabricCardTitle(fabric)
            const swatch = fabricCardImage(fabric, 240, 240)
            return (
              <li key={fabric.id} className={styles.arrivalCard}>
                <ArrivalLink
                  href={`/fabrics/${fabric.id}?view=designs`}
                  className={styles.arrivalLink}
                  eventName="home_design_click"
                  eventProperties={{ fabric_code: fabric.fabric_code ?? '', position: index + 1 }}
                >
                  <span className={styles.fabricDressImage}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- صور Supabase المحوّلة */}
                    <img src={design} alt={`فستان من ${title}`} width={520} height={700} loading="lazy" decoding="async" />
                    {swatch && (
                      <span className={styles.fabricDressSwatch}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- صور Supabase المحوّلة */}
                        <img src={swatch} alt={`القماش: ${title}`} width={240} height={240} loading="lazy" decoding="async" />
                      </span>
                    )}
                  </span>
                  <span className={styles.arrivalName}>{title}</span>
                  <span className={styles.fabricDressMore}>
                    شاهدي التصميم
                    <ArrowLeft aria-hidden="true" />
                  </span>
                </ArrivalLink>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
