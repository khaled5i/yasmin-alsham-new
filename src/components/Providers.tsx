'use client'

import AuthProvider from './AuthProvider'

/**
 * Providers - مجمع المزودات
 * يجمع جميع مزودات السياق في مكان واحد
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}

