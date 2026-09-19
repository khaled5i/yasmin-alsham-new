'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Loader2, ShoppingBag, X } from 'lucide-react'
import { useResolvedCart } from '@/hooks/useFabricCommerce'
import { useFabricCartStore } from '@/store/fabricCartStore'
import FabricCartLineRow from './FabricCartLineRow'
import FabricCartSummary from './FabricCartSummary'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface FabricCartDrawerProps {
  isOpen: boolean
  onClose: () => void
  /** يُعاد إليه التركيز عند الإغلاق. */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

/**
 * درج السلة: ملخّص جانبي على الشاشة الكبيرة وورقة كاملة الارتفاع على الجوال.
 * يحبس التركيز داخله، ويغلق بـEscape، ويعيد التركيز لزر الفتح.
 */
export default function FabricCartDrawer({ isOpen, onClose, returnFocusRef }: FabricCartDrawerProps) {
  const { lines, totals, isLoading, isPending, error, isStorageBlocked, reload } = useResolvedCart()
  const clear = useFabricCartStore(state => state.clear)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const shouldReduceMotion = useReducedMotion()

  // منع تمرير الخلفية أثناء فتح الدرج
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  // حبس التركيز + Escape + إعادة التركيز لزر الفتح
  useEffect(() => {
    if (!isOpen) return

    // يُلتقط هدف العودة الآن: زر الفتح مركَّب بالفعل وقت فتح الدرج،
    // وقراءة الـref وقت التنظيف تخالف قواعد الخطافات.
    const focusTarget = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(element => element.offsetParent !== null)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      focusTarget?.focus?.()
    }
  }, [isOpen, onClose, returnFocusRef])

  const isEmpty = !isPending && lines.length === 0

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-[#2f0c14]/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="سلة الأقمشة"
            initial={shouldReduceMotion ? { opacity: 0 } : { x: '-100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: '-100%' }}
            transition={{ type: 'tween', duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeOut' }}
            className="fixed inset-y-0 left-0 z-[61] flex w-full max-w-md flex-col bg-[#fbf8f3] shadow-2xl"
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
            dir="rtl"
          >
            <header className="flex items-center justify-between gap-3 border-b-2 border-[#d8c5ae] px-4 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#6b1726]">
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                <span>سلة الأقمشة</span>
                {lines.length > 0 && (
                  <span className="rounded-full bg-[#6b1726] px-2 py-0.5 text-xs font-bold text-[#f6f0e8]">
                    {lines.length}
                  </span>
                )}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="إغلاق السلة"
                className="rounded-lg p-2 text-[#6b1726] transition-colors duration-200 hover:bg-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {isStorageBlocked && (
                <p
                  role="status"
                  className="mb-3 flex items-start gap-1.5 rounded-lg bg-[#b99a68]/20 px-3 py-2 text-xs font-semibold text-[#2f0c14]"
                >
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>متصفحك يمنع الحفظ المحلي، لذلك لن تبقى السلة بعد إغلاق الصفحة.</span>
                </p>
              )}

              {error && (
                <div className="mb-3 rounded-lg bg-[#6b1726]/10 px-3 py-2.5 text-xs font-semibold text-[#6b1726]">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={reload}
                    className="mt-2 rounded-lg border border-[#6b1726] px-3 py-1 transition-colors duration-200 hover:bg-[#6b1726] hover:text-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              )}

              {(isPending || (isLoading && lines.length === 0)) && (
                <div className="flex flex-col items-center justify-center py-16 text-[#211b19]/60">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#6b1726]" aria-hidden="true" />
                  <p className="text-sm">جاري تحميل السلة...</p>
                </div>
              )}

              {isEmpty && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingBag className="mb-4 h-12 w-12 text-[#d8c5ae]" aria-hidden="true" />
                  <p className="mb-2 text-base font-bold text-[#211b19]">سلتك فارغة</p>
                  <p className="mb-5 text-sm text-[#211b19]/60">
                    تصفّحي الأقمشة وأضيفي ما يعجبك لتجمعيه هنا.
                  </p>
                  <Link
                    href="/fabrics"
                    onNavigate={onClose}
                    className="rounded-xl bg-[#6b1726] px-6 py-2.5 font-semibold text-[#f6f0e8] transition-colors duration-300 hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                  >
                    تصفّح الأقمشة
                  </Link>
                </div>
              )}

              {lines.length > 0 && (
                <div className="space-y-3">
                  {lines.map(line => (
                    <FabricCartLineRow key={line.key} line={line} compact onNavigate={onClose} />
                  ))}
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <div className="border-t-2 border-[#d8c5ae] bg-[#fbf8f3] px-4 py-4">
                <FabricCartSummary lines={lines} totals={totals} />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Link
                    href="/fabrics/cart"
                    onNavigate={onClose}
                    className="text-sm font-semibold text-[#6b1726] underline-offset-4 transition-colors duration-200 hover:text-[#2f0c14] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:rounded"
                  >
                    فتح صفحة السلة كاملة
                  </Link>
                  <button
                    type="button"
                    onClick={clear}
                    className="text-sm font-semibold text-[#211b19]/55 transition-colors duration-200 hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:rounded"
                  >
                    تفريغ السلة
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
