import { FABRIC_COLLECTIONS, fabricStoreQueryPath } from '@/lib/fabric-collections'
import { fabricCardImage } from '@/lib/fabric-card-display'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { matchesFabricSearch } from '@/lib/fabric-search'
import ArrivalLink from './ArrivalLink'
import ShopByFabricExpander from './ShopByFabricExpander'
import { fabricListingTime, type HomeFabricRow } from './home-store-data'
import styles from './home.module.css'

/**
 * «تسوقي حسب الخامة»: بلاطة لكل مجموعة بصورة أحدث قماش فيها وعدد الأقمشة.
 * كل متاجر الأقمشة الثمانية التي حلّلناها تبدأ التصفح من نوع القماش.
 * تظهر أول أربع بلاطات فقط، والباقي خلف «عرض المزيد».
 * البلاطة تفتح المتجر الأساسي مفلتراً بالخامة (?q=)، فالعدّ بنفس بحث المتجر حتى يطابق ما تراه الزائرة.
 */
const VISIBLE_TILES = 4

export default function ShopByFabric({ fabrics }: { fabrics: HomeFabricRow[] }) {
  const newest = [...fabrics].sort((a, b) => fabricListingTime(b) - fabricListingTime(a))
  const used = new Set<string>()
  const tiles = FABRIC_COLLECTIONS.map(collection => {
    const members = newest.filter(fabric => matchesFabricSearch(
      { ...fabric, categories: fabric.categories?.length ? fabric.categories : [fabric.category ?? ''] },
      collection.storeQuery,
      { includeDescription: true }
    ))
    // صورة مختلفة لكل بلاطة حيث أمكن، فلا يتكرر القماش نفسه في مجموعتين
    const cover = members.find(fabric => !used.has(fabric.id)) ?? members[0]
    if (cover) used.add(cover.id)
    return { collection, count: members.length, image: cover ? fabricCardImage(cover, 420, 560) : null }
  }).filter(tile => tile.count > 0)

  if (tiles.length === 0) return null

  return (
    <section className={styles.shopFabricSection} aria-labelledby="shop-by-fabric-title">
      <div className={styles.arrivalsInner}>
        <header className={styles.arrivalsHeader}>
          <div>
            <p className={styles.sectionEyebrow}>المجموعات</p>
            <h2 id="shop-by-fabric-title" className={styles.arrivalsTitle}>تسوقي حسب الخامة</h2>
          </div>
        </header>

        <ShopByFabricExpander hiddenCount={Math.max(0, tiles.length - VISIBLE_TILES)}>
        <ul className={styles.shopFabricGrid}>
          {tiles.map(({ collection, count, image }, index) => (
            <li key={collection.slug} className={index >= VISIBLE_TILES ? `min-w-0 ${styles.shopFabricExtra}` : 'min-w-0'}>
              <ArrivalLink
                href={fabricStoreQueryPath(collection.storeQuery)}
                className={styles.shopFabricTile}
                eventName="home_collection_click"
                eventProperties={{ collection: collection.slug }}
              >
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element -- صور Supabase المحوّلة كما في بطاقات المتجر
                  <img src={image} alt="" width={420} height={560} loading="lazy" decoding="async" />
                )}
                <span className={styles.shopFabricShade} aria-hidden="true" />
                <span className={styles.shopFabricText}>
                  <strong>{collection.title}</strong>
                  <small>{formatFabricNumber(count)} قماشاً</small>
                </span>
              </ArrivalLink>
            </li>
          ))}
        </ul>
        </ShopByFabricExpander>
      </div>
    </section>
  )
}
