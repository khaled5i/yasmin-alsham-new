'use client'

import { useState, useEffect } from 'react'
import { useShopStore } from '@/store/shopStore'

/**
 * Test component to verify hydration fix
 * This component can be temporarily added to any page to test the hydration behavior
 */
export default function HydrationTest() {
  const [isHydrated, setIsHydrated] = useState(false)
  const [testResults, setTestResults] = useState<string[]>([])
  const { cart, favorites, getCartItemsCount } = useShopStore()

  useEffect(() => {
    const results: string[] = []
    
    // Test 1: Check if component hydrates properly
    results.push('✅ Component hydrated successfully')
    
    // Test 2: Check if store is accessible
    try {
      const cartCount = getCartItemsCount()
      const favCount = favorites.length
      results.push(`✅ Store accessible - Cart: ${cartCount}, Favorites: ${favCount}`)
    } catch (error) {
      results.push('❌ Store access failed')
    }
    
    // Test 3: Check if localStorage is available
    try {
      const stored = localStorage.getItem('yasmin-alsham-shop')
      results.push(stored ? '✅ localStorage data found' : '✅ localStorage accessible (no data)')
    } catch (error) {
      results.push('❌ localStorage not accessible')
    }
    
    setTestResults(results)
    setIsHydrated(true)
  }, [getCartItemsCount, favorites.length])

  if (!isHydrated) {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded">
        🔄 Hydrating...
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded max-w-sm">
      <h4 className="font-bold mb-2">🧪 Hydration Test Results</h4>
      <ul className="text-sm space-y-1">
        {testResults.map((result, index) => (
          <li key={index}>{result}</li>
        ))}
      </ul>
      <div className="mt-2 text-xs">
        Cart: {cart.length} | Favorites: {favorites.length}
      </div>
    </div>
  )
}

// Usage instructions:
// 1. Import this component in any page: import HydrationTest from '@/components/HydrationTest'
// 2. Add it to the JSX: <HydrationTest />
// 3. Check the bottom-right corner for test results
// 4. Remove after testing is complete
