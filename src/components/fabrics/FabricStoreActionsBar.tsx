'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Heart, ShoppingBag } from 'lucide-react'
import { IS_FABRIC_CART_ENABLED } from '@/lib/fabric-commerce'
import { useFabricCartCount, useFabricFavoritesCount } from '@/hooks/useFabricCommerce'
import FabricCartDrawer from './FabricCartDrawer'

interface FabricStoreActionsBarProps {
  className?: string
  /** في صفحة السلة نفسها لا داعي لزر يفتح درج السلة. */
  hideCart?: boolean
  hideFavorites?: boolean
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      className="absolute -top-1.5 -left-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b1726] px-1 text-[11px] font-bold leading-none text-[#f6f0e8] shadow"
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/**
 * أيقونتا المفضلة والسلة مع عدّاد — داخل سياق متجر الأقمشة فقط.
 * لا تظهر في لوحة الإدارة ولا في أقسام التفصيل والورش.
 */
export default function FabricStoreActionsBar({
  className = '',
  hideCart = false,
  hideFavorites = false,
}: FabricStoreActionsBarProps) {
  const cartCount = useFabricCartCount()
  const favoritesCount = useFabricFavoritesCount()
  const [isCartOpen, setIsCartOpen] = useState(false)
  const cartButtonRef = useRef<HTMLButtonElement>(null)

  if (!IS_FABRIC_CART_ENABLED) return null

  const buttonClasses =
    'relative inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#d8c5ae] bg-[#f6f0e8] text-[#6b1726] transition-all duration-300 hover:border-[#6b1726] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]'

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {!hideFavorites && (
          <Link
            href="/fabrics/favorites"
            className={buttonClasses}
            aria-label={
              favoritesCount > 0 ? `المفضلة، ${favoritesCount} قماش` : 'المفضلة، لا يوجد أقمشة'
            }
            title="المفضلة"
          >
            <Heart className="h-5 w-5" aria-hidden="true" />
            <CountBadge count={favoritesCount} />
          </Link>
        )}

        {!hideCart && (
          <button
            ref={cartButtonRef}
            type="button"
            onClick={() => setIsCartOpen(true)}
            className={buttonClasses}
            aria-label={cartCount > 0 ? `السلة، ${cartCount} عنصر` : 'السلة، فارغة'}
            aria-haspopup="dialog"
            aria-expanded={isCartOpen}
            title="السلة"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            <CountBadge count={cartCount} />
          </button>
        )}
      </div>

      {!hideCart && (
        <FabricCartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          returnFocusRef={cartButtonRef}
        />
      )}
    </>
  )
}
