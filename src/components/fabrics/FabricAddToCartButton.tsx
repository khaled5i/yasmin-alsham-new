'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, ShoppingBag, Trash2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  IS_FABRIC_CART_ENABLED,
  formatQuantityLabel,
  getCartLineKey,
  getFabricLabel,
  getFabricPrimaryImage,
  getFabricPurchaseMode,
  getFabricQuantityBounds,
  getFabricUnitPrice,
  isFabricPubliclyVisible,
  type FabricQuantityBounds,
} from '@/lib/fabric-commerce'
import { useFabricCartStore } from '@/store/fabricCartStore'
import { IS_FABRIC_STORE_CHECKOUT_ENABLED } from '@/lib/fabric-store/checkout-contract'
import { buildBuyNowHref } from '@/lib/fabric-store/buy-now'
import type { Fabric } from '@/store/fabricStore'
import FabricQuantitySelector from './FabricQuantitySelector'
import { showFabricCommerceToast } from './fabricCommerceToast'

/** الكمية المقترحة للبيع بالمتر: 3 أمتار (طول فستان شائع) متى توفّرت. */
const DEFAULT_METERS = 3

function getDefaultQuantity(bounds: FabricQuantityBounds): number {
  return bounds.max >= DEFAULT_METERS && bounds.min <= DEFAULT_METERS ? DEFAULT_METERS : bounds.min
}

interface FabricAddToCartButtonProps {
  fabric: Fabric
  /** رابط واتساب للاستفسار عن الأقمشة التي سعرها عند الطلب. */
  whatsappLink: string
  className?: string
}

/**
 * لوحة الشراء: «إضافة إلى السلة» و«شراء الآن».
 *
 * كل صف قماش هو لون واحد محدد، فلا يوجد اختيار لون. البيع بالقطعة الكاملة
 * كميته محسومة (قطعة واحدة)، أما البيع بالمتر فمنتقي الأمتار ظاهر دائماً
 * وقيمته المبدئية 3 أمتار متى توفّرت. «شراء الآن» يفتح إتمام الطلب لهذا
 * القماش وحده دون أن يلمس السلة. بعد الإضافة يصبح الزر «إزالة من السلة»،
 * وتغيير الأمتار حينها يعدّل السطر الموجود في السلة مباشرة.
 */
export default function FabricAddToCartButton({
  fabric,
  whatsappLink,
  className = '',
}: FabricAddToCartButtonProps) {
  const addLine = useFabricCartStore(state => state.addLine)
  const removeLine = useFabricCartStore(state => state.removeLine)
  const setCartQuantity = useFabricCartStore(state => state.setQuantity)
  // قبل الـhydration نعامله كأنه خارج السلة حتى لا يختلف عن HTML الخادم.
  const cartLine = useFabricCartStore(state =>
    state.hasHydrated ? state.lines.find(line => line.fabricId === fabric.id) : undefined
  )
  const router = useRouter()

  const bounds = getFabricQuantityBounds(fabric)
  const [draftQuantity, setDraftQuantity] = useState(() => getDefaultQuantity(bounds))
  const quantity = cartLine ? cartLine.quantity : draftQuantity

  // المعاينة السريعة تعيد استعمال نفس المكوّن لقماش آخر، فتُصفَّر الحالة معه.
  useEffect(() => {
    setDraftQuantity(getDefaultQuantity(getFabricQuantityBounds(fabric)))
  }, [fabric])

  const changeQuantity = (next: number) => {
    if (cartLine) setCartQuantity(getCartLineKey(cartLine.fabricId, cartLine.purchaseMode), next, fabric)
    else setDraftQuantity(next)
  }

  if (!IS_FABRIC_CART_ENABLED) return null

  const label = getFabricLabel(fabric)
  const mode = getFabricPurchaseMode(fabric)
  const unitPrice = getFabricUnitPrice(fabric)
  const isVisible = isFabricPubliclyVisible(fabric)
  const stock = Number(fabric.stock_quantity) || 0

  // السعر عند الطلب: لا يمكن شراؤه تلقائياً، والبديل الصريح هو الاستفسار.
  if (unitPrice == null) {
    return (
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-[#6b1726] bg-transparent px-6 py-3 font-semibold text-[#6b1726] transition-all duration-300 hover:bg-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] ${className}`}
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        <span>السعر عند الطلب — استفسري عبر واتساب</span>
      </a>
    )
  }

  if (!isVisible || stock <= 0) {
    return (
      <p
        className={`rounded-xl border-2 border-[#d8c5ae] bg-[#f6f0e8] px-6 py-3 text-center font-semibold text-[#211b19]/60 ${className}`}
        role="status"
      >
        {stock <= 0 ? 'نفدت الكمية حالياً' : 'غير متاح للبيع حالياً'}
      </p>
    )
  }

  const commitAdd = (amount: number) => {
    const result = addLine(fabric, amount)

    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        'not-purchasable': 'هذا القماش غير متاح للشراء حالياً',
        'cart-full': 'السلة ممتلئة — احذفي عنصراً قبل إضافة غيره',
        'invalid-quantity': 'الكمية المطلوبة غير متاحة',
      }
      toast.error(messages[result.reason])
      return
    }

    showFabricCommerceToast({
      kind: 'cart',
      title: result.merged ? 'حُدِّثت الكمية في السلة' : 'أُضيف إلى السلة',
      label,
      detail: mode === 'meter' ? formatQuantityLabel(amount, mode) : 'قطعة كاملة',
      image: getFabricPrimaryImage(fabric),
    })

    if (useFabricCartStore.getState().isStorageBlocked) {
      toast('المتصفح يمنع الحفظ، لذلك لن تبقى السلة بعد إغلاق الصفحة', { icon: '⚠️' })
    }
  }

  const removeFromCart = () => {
    if (!cartLine) return
    removeLine(getCartLineKey(cartLine.fabricId, cartLine.purchaseMode))
    setDraftQuantity(cartLine.quantity)
    showFabricCommerceToast({ kind: 'cart', title: 'أُزيل من السلة', label, image: getFabricPrimaryImage(fabric), removed: true })
  }

  const buyNow = () => {
    const amount = mode === 'piece' ? 1 : quantity
    router.push(buildBuyNowHref({ fabricId: fabric.id, purchaseMode: mode, quantity: amount }))
  }

  const buttonBase =
    'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]'

  return (
    <div className={`space-y-3 ${className}`}>
      {mode === 'meter' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8c5ae]/70 bg-[#fbf8f3] px-3 py-2.5">
          <span className="text-sm font-semibold text-[#211b19]">الكمية بالمتر</span>
          <FabricQuantitySelector
            value={quantity}
            bounds={bounds}
            mode={mode}
            onChange={changeQuantity}
            label={label}
            size="sm"
          />
        </div>
      ) : (
        <p className="rounded-xl border border-[#d8c5ae]/70 bg-[#fbf8f3] px-3 py-2.5 text-sm font-semibold text-[#211b19]/75">
          تُباع قطعة كاملة ({formatQuantityLabel(stock, 'meter')})
        </p>
      )}

      <div className={`grid gap-2 ${IS_FABRIC_STORE_CHECKOUT_ENABLED ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {cartLine ? (
          <button
            type="button"
            onClick={removeFromCart}
            className={`${buttonBase} border-2 border-[#d8c5ae] bg-[#fbf8f3] text-[#211b19]/75 hover:border-[#6b1726] hover:text-[#6b1726]`}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            <span>إزالة من السلة</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => commitAdd(mode === 'piece' ? 1 : quantity)}
            className={`${buttonBase} border-2 border-[#6b1726] bg-[#f6f0e8] text-[#6b1726] hover:bg-[#6b1726] hover:text-[#f6f0e8]`}
          >
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            <span>إضافة للسلة</span>
          </button>
        )}

        {IS_FABRIC_STORE_CHECKOUT_ENABLED && (
          <button
            type="button"
            onClick={buyNow}
            className={`${buttonBase} border-2 border-[#6b1726] bg-[#6b1726] text-[#f6f0e8] shadow-lg hover:bg-[#2f0c14] hover:shadow-xl`}
          >
            <Zap className="h-5 w-5" aria-hidden="true" />
            <span>شراء الآن</span>
          </button>
        )}
      </div>
    </div>
  )
}
