import FabricStoreLoader from '@/components/fabrics/FabricStoreLoader'

/** يظهر أثناء التنقل بين صفحات المتجر (صفحة القماش، المجموعات...) حتى تجهز الصفحة. */
export default function FabricsLoading() {
  return <FabricStoreLoader fullScreen size="lg" />
}
