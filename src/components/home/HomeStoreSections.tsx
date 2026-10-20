import GoogleReviews from '@/components/GoogleReviews'
import FabricToDress from './FabricToDress'
import NewArrivals from './NewArrivals'
import ShopByFabric from './ShopByFabric'
import { loadHomeFabrics } from './home-store-data'

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
    </>
  )
}
