import DashboardSessionBoundary from '@/components/DashboardSessionBoundary'

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <DashboardSessionBoundary>{children}</DashboardSessionBoundary>
}
