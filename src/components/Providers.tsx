'use client'

import { useEffect } from 'react'
import AuthProvider from './AuthProvider'

/**
 * Providers - مجمع المزودات
 * يجمع جميع مزودات السياق في مكان واحد
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  // Prevent number input change on scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.type === 'number'
      ) {
        (document.activeElement as HTMLInputElement).blur()
      }
    }

    document.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      document.removeEventListener('wheel', handleWheel)
    }
  }, [])

  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}

