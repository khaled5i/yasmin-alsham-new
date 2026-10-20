import DashboardSessionBoundary from '@/components/DashboardSessionBoundary'
import NewStoreOrderPopup from '@/components/fabric-store/NewStoreOrderPopup'
import StaffDeviceMarker from '@/components/StaffDeviceMarker'

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <DashboardSessionBoundary>
      {children}
      <NewStoreOrderPopup />
      <StaffDeviceMarker />
    </DashboardSessionBoundary>
  )
}
