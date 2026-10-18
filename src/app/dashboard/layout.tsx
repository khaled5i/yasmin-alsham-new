import DashboardSessionBoundary from '@/components/DashboardSessionBoundary'
import NewStoreOrderPopup from '@/components/fabric-store/NewStoreOrderPopup'

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <DashboardSessionBoundary>
      {children}
      <NewStoreOrderPopup />
    </DashboardSessionBoundary>
  )
}
