'use client'

import { Heart } from 'lucide-react'
import toast from 'react-hot-toast'
import { IS_FABRIC_CART_ENABLED, getFabricLabel } from '@/lib/fabric-commerce'
import { useFabricFavoritesStore } from '@/store/fabricFavoritesStore'
import type { Fabric } from '@/store/fabricStore'

type FavoriteButtonSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<FavoriteButtonSize, { button: string; icon: string }> = {
  sm: { button: 'h-9 w-9', icon: 'h-4 w-4' },
  md: { button: 'h-11 w-11', icon: 'h-5 w-5' },
  lg: { button: 'h-12 w-12', icon: 'h-6 w-6' },
}

interface FabricFavoriteButtonProps {
  fabric: Fabric
  size?: FavoriteButtonSize
  /** على بطاقة المتجر يطفو الزر فوق الصورة ويحتاج خلفية معتمة. */
  variant?: 'floating' | 'inline'
  className?: string
}

/**
 * زر القلب. النقر عليه لا يفتح صفحة القماش ولا يحرّك معرض الصور —
 * لذلك يوقف انتشار الحدث وسلوكه الافتراضي قبل أي شيء.
 */
export default function FabricFavoriteButton({
  fabric,
  size = 'md',
  variant = 'inline',
  className = '',
}: FabricFavoriteButtonProps) {
  const hasHydrated = useFabricFavoritesStore(state => state.hasHydrated)
  const items = useFabricFavoritesStore(state => state.items)
  const toggle = useFabricFavoritesStore(state => state.toggle)

  if (!IS_FABRIC_CART_ENABLED) return null

  // قبل الـhydration نعرض الحالة غير المفضّلة حتى لا يختلف عن HTML الخادم.
  const isFavorite = hasHydrated && items.some(item => item.fabricId === fabric.id)
  const label = getFabricLabel(fabric)

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const nowFavorite = toggle(fabric)
    const blocked = useFabricFavoritesStore.getState().isStorageBlocked

    // النجاح لا يعتمد على اللون وحده: نص صريح مع أيقونة.
    toast.success(nowFavorite ? `أُضيف «${label}» إلى المفضلة` : `أُزيل «${label}» من المفضلة`, {
      icon: nowFavorite ? '❤️' : '🤍',
    })

    if (blocked) {
      toast('المتصفح يمنع الحفظ، لذلك لن تبقى المفضلة بعد إغلاق الصفحة', { icon: '⚠️' })
    }
  }

  const sizeClasses = SIZE_CLASSES[size]
  const variantClasses =
    variant === 'floating'
      ? 'bg-[#f6f0e8]/95 shadow-lg backdrop-blur-sm hover:bg-[#f6f0e8]'
      : 'border-2 border-[#d8c5ae] bg-[#f6f0e8] hover:border-[#6b1726]'

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `إزالة ${label} من المفضلة` : `إضافة ${label} إلى المفضلة`}
      title={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3] ${sizeClasses.button} ${variantClasses} ${className}`}
    >
      <Heart
        className={`${sizeClasses.icon} transition-colors duration-300 ${
          isFavorite ? 'fill-[#6b1726] text-[#6b1726]' : 'text-[#6b1726]'
        }`}
        aria-hidden="true"
      />
    </button>
  )
}
