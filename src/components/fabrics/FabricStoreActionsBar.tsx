'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
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
      className="absolute -top-1 -left-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#fbf8f3] bg-[#6b1726] px-1 text-[10px] font-bold leading-none text-[#f6f0e8]"
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

const buttonClasses =
  'group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6b1726] transition-colors duration-200 hover:text-[#2f0c14] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3] sm:h-11 sm:w-11'

const menuItemClasses =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#211b19]/85 transition-colors hover:bg-[#f6f0e8] hover:text-[#6b1726] focus-visible:bg-[#f6f0e8] focus-visible:outline-none'

function HeartIcon({ filled, className = 'h-[19px] w-[19px]' }: { filled: boolean; className?: string }) {
  // القلب يمتلئ بلون العلامة متى كان في المفضلة شيء
  return (
    <Heart
      className={`${className} transition-colors ${filled ? 'fill-[#6b1726]' : 'group-hover:fill-[#6b1726]/10'}`}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}

/**
 * زر واحد للسلة والمفضلة — داخل سياق متجر الأقمشة فقط.
 * الواجهة تُظهر السلة، إلا إن كانت فارغة والمفضلة فيها قطع فتظهر المفضلة؛
 * والضغط يُسدل قائمة تختار منها الزائرة السلة أو المفضلة.
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMenuOpen) return
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isMenuOpen])

  if (!IS_FABRIC_CART_ENABLED) return null

  const cartLabel = cartCount > 0 ? `السلة، ${cartCount} عنصر` : 'السلة، فارغة'
  const favoritesLabel = favoritesCount > 0 ? `المفضلة، ${favoritesCount} قماش` : 'المفضلة، لا يوجد أقمشة'

  const cartDrawer = !hideCart && (
    <FabricCartDrawer
      isOpen={isCartOpen}
      onClose={() => setIsCartOpen(false)}
      returnFocusRef={triggerRef}
    />
  )

  // صفحتا السلة والمفضلة تخفيان أحدهما، فلا حاجة لقائمة: زر مباشر للآخر
  if (hideCart || hideFavorites) {
    return (
      <>
        <div className={`flex items-center ${className}`}>
          {!hideFavorites && (
            <Link href="/fabrics/favorites" className={buttonClasses} aria-label={favoritesLabel} title="المفضلة">
              <HeartIcon filled={favoritesCount > 0} />
              <CountBadge count={favoritesCount} />
            </Link>
          )}
          {!hideCart && (
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setIsCartOpen(true)}
              className={buttonClasses}
              aria-label={cartLabel}
              aria-haspopup="dialog"
              aria-expanded={isCartOpen}
              title="السلة"
            >
              <ShoppingBag className="h-[19px] w-[19px]" strokeWidth={1.75} aria-hidden="true" />
              <CountBadge count={cartCount} />
            </button>
          )}
        </div>
        {cartDrawer}
      </>
    )
  }

  const showFavoritesInFront = cartCount === 0 && favoritesCount > 0

  return (
    <>
      <div ref={menuRef} className={`relative ${className}`} dir="rtl">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsMenuOpen(open => !open)}
          className={buttonClasses}
          aria-label={`${showFavoritesInFront ? favoritesLabel : cartLabel} — فتح قائمة السلة والمفضلة`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          title={showFavoritesInFront ? 'المفضلة' : 'السلة'}
        >
          {showFavoritesInFront
            ? <HeartIcon filled />
            : <ShoppingBag className="h-[19px] w-[19px]" strokeWidth={1.75} aria-hidden="true" />}
          <CountBadge count={showFavoritesInFront ? favoritesCount : cartCount} />
        </button>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="absolute left-0 top-full z-50 mt-2 w-48 origin-top-left overflow-hidden rounded-xl border border-[#d8c5ae]/80 bg-[#fbf8f3] p-1.5 shadow-[0_12px_32px_rgba(47,12,20,0.14)]"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setIsMenuOpen(false); setIsCartOpen(true) }}
                className={`group ${menuItemClasses}`}
              >
                <ShoppingBag className="h-[18px] w-[18px] text-[#6b1726]" strokeWidth={1.75} aria-hidden="true" />
                <span className="flex-1 text-right">السلة</span>
                {cartCount > 0 && (
                  <span className="rounded-full bg-[#6b1726] px-2 text-[11px] font-bold leading-5 text-[#f6f0e8]">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>
              <Link
                href="/fabrics/favorites"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className={`group ${menuItemClasses}`}
              >
                <HeartIcon filled={favoritesCount > 0} className="h-[18px] w-[18px] text-[#6b1726]" />
                <span className="flex-1 text-right">المفضلة</span>
                {favoritesCount > 0 && (
                  <span className="rounded-full bg-[#6b1726] px-2 text-[11px] font-bold leading-5 text-[#f6f0e8]">
                    {favoritesCount > 99 ? '99+' : favoritesCount}
                  </span>
                )}
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {cartDrawer}
    </>
  )
}
