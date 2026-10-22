import GoogleReviews from '@/components/GoogleReviews'
import { StoreTrustStrip } from '@/components/fabrics/StoreTrust'
import FabricToDress from './FabricToDress'
import NewArrivals from './NewArrivals'
import ShopByFabric from './ShopByFabric'
import { loadHomeFabrics } from './home-store-data'
import styles from './home.module.css'

/** أقسام المتجر في الرئيسية بعد الواجهة، من استعلام واحد على الخادم. */
export default async function HomeStoreSections() {
  const fabrics = await loadHomeFabrics()
  if (fabrics.length === 0) return null
  return (
    <>
      <NewArrivals fabrics={fabrics} />
      <FabricToDress fabrics={fabrics} />
      <ShopByFabric fabrics={fabrics} />
      <GoogleReviews />
      {/* الشحن والاستلام والإرجاع والدفع: آخر الصفحة تحت التعليقات */}
      <section className={styles.homeTrustSection} aria-label="الشحن والإرجاع والدفع">
        <div className={styles.arrivalsInner}>
          <StoreTrustStrip />
        </div>
      </section>
    </>
  )
}
