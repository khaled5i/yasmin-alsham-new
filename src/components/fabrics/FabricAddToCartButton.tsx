'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, MessageCircle, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  IS_FABRIC_CART_ENABLED,
  getFabricLabel,
  getFabricPurchaseMode,
  getFabricQuantityBounds,
  getFabricUnitPrice,
  isFabricPubliclyVisible,
} from '@/lib/fabric-commerce'
import { useFabricCartStore } from '@/store/fabricCartStore'
import type { Fabric } from '@/store/fabricStore'
import FabricQuantitySelector from './FabricQuantitySelector'

interface FabricAddToCartButtonProps {
  fabric: Fabric
  /** رابط واتساب للاستفسار عن الأقمشة التي سعرها عند الطلب. */
  whatsappLink: string
  className?: string
}

/**
 * زر الإضافة للسلة.
 *
 * كل صف قماش هو لون واحد محدد، فلا يوجد اختيار لون. يبقى غموض واحد محتمل
 * هو الكمية: البيع بالقطعة الكاملة كميته محسومة (قطعة واحدة) فيُضاف مباشرة،
 * أما البيع بالمتر فيفتح منتقي الكمية أولاً.
 */
export default function FabricAddToCartButton({
  fabric,
  whatsappLink,
  className = '',
}: FabricAddToCartButtonProps) {
  const addLine = useFabricCartStore(state => state.addLine)
  const shouldReduceMotion = useReducedMotion()

  const bounds = getFabricQuantityBounds(fabric)
  const [quantity, setQuantity] = useState(bounds.min)
  const [isPicking, setIsPicking] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  // المعاينة السريعة تعيد استعمال نفس المكوّن لقماش آخر، فتُصفَّر الحالة معه.
  useEffect(() => {
    setQuantity(getFabricQuantityBounds(fabric).min)
    setIsPicking(false)
    setJustAdded(false)
  }, [fabric])

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

    setIsPicking(false)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 2000)

    toast.success(
      result.merged ? `حُدِّثت كمية «${label}» في السلة` : `أُضيف «${label}» إلى السلة`,
      { icon: '🛍️' }
    )

    if (useFabricCartStore.getState().isStorageBlocked) {
      toast('المتصفح يمنع الحفظ، لذلك لن تبقى السلة بعد إغلاق الصفحة', { icon: '⚠️' })
    }
  }

  const baseButtonClasses =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-[#6b1726] px-6 py-3 font-semibold text-[#f6f0e8] shadow-lg transition-all duration-300 hover:bg-[#2f0c14] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]'

  // القطعة الكاملة: الكمية محسومة ⇒ إضافة مباشرة بلا خطوة وسيطة.
  if (mode === 'piece') {
    return (
      <button type="button" onClick={() => commitAdd(1)} className={`${baseButtonClasses} ${className}`}>
        {justAdded ? (
          <Check className="h-5 w-5" aria-hidden="true" />
        ) : (
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        )}
        <span>{justAdded ? 'أُضيف إلى السلة' : 'إضافة القطعة إلى السلة'}</span>
      </button>
    )
  }

  return (
    <div className={className}>
      <AnimatePresence initial={false} mode="wait">
        {isPicking ? (
          <motion.div
            key="picker"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border-2 border-[#d8c5ae] bg-[#fbf8f3] p-3"
          >
            <p className="mb-2 text-sm font-semibold text-[#211b19]">كم متراً تحتاجين؟</p>
            <div className="flex flex-wrap items-end gap-3">
              <FabricQuantitySelector
                value={quantity}
                bounds={bounds}
                mode={mode}
                onChange={setQuantity}
                label={label}
              />
              <div className="flex flex-1 gap-2">
                <button
                  type="button"
                  onClick={() => commitAdd(quantity)}
                  className="flex-1 rounded-xl bg-[#6b1726] px-4 py-2.5 font-semibold text-[#f6f0e8] transition-colors duration-300 hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                >
                  إضافة للسلة
                </button>
                <button
                  type="button"
                  onClick={() => setIsPicking(false)}
                  className="rounded-xl border-2 border-[#d8c5ae] px-4 py-2.5 font-semibold text-[#211b19]/70 transition-colors duration-300 hover:border-[#6b1726] hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="trigger"
            type="button"
            initial={false}
            onClick={() => setIsPicking(true)}
            className={baseButtonClasses}
          >
            {justAdded ? (
              <Check className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            )}
            <span>{justAdded ? 'أُضيف إلى السلة' : 'إضافة إلى السلة'}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
