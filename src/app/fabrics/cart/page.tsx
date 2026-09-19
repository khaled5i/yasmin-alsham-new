'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Loader2, ShoppingBag } from 'lucide-react'
import FabricCartLineRow from '@/components/fabrics/FabricCartLineRow'
import FabricCartSummary from '@/components/fabrics/FabricCartSummary'
import FabricStoreActionsBar from '@/components/fabrics/FabricStoreActionsBar'
import { useResolvedCart } from '@/hooks/useFabricCommerce'
import { IS_FABRIC_CART_ENABLED } from '@/lib/fabric-commerce'
import { useFabricCartStore } from '@/store/fabricCartStore'

export default function FabricCartPage() {
  const { lines, totals, isLoading, isPending, error, isStorageBlocked, reload } = useResolvedCart()
  const clear = useFabricCartStore(state => state.clear)

  if (!IS_FABRIC_CART_ENABLED) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf8f3] px-4 text-center">
        <div>
          <h1 className="mb-3 text-2xl font-bold text-[#211b19]">السلة غير متاحة حالياً</h1>
          <Link
            href="/fabrics"
            className="inline-flex items-center gap-2 text-[#6b1726] transition-colors duration-300 hover:text-[#2f0c14]"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <span>العودة إلى متجر الأقمشة</span>
          </Link>
        </div>
      </main>
    )
  }

  const isEmpty = !isPending && lines.length === 0

  return (
    <main className="min-h-screen bg-[#fbf8f3] pt-4 text-[#211b19] lg:pt-8">
      <div className="container mx-auto px-4 py-4 pb-16 sm:px-6 lg:px-8 lg:py-12">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/fabrics"
              className="group inline-flex items-center gap-1 text-[#6b1726] transition-colors duration-200 hover:text-[#2f0c14] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
            >
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              <span className="text-sm font-medium">متابعة التسوّق</span>
            </Link>

            <FabricStoreActionsBar hideCart />
          </div>

          <h1 className="mt-5 flex items-center gap-2 text-2xl font-bold text-[#6b1726] sm:text-3xl">
            <ShoppingBag className="h-7 w-7" aria-hidden="true" />
            <span>سلة الأقمشة</span>
          </h1>
          <p className="mt-2 text-sm text-[#211b19]/65">
            محفوظة في هذا المتصفح فقط — لا تنتقل بين الأجهزة.
          </p>
        </motion.header>

        {isStorageBlocked && (
          <p
            role="status"
            className="mb-4 flex items-start gap-2 rounded-xl bg-[#b99a68]/20 px-4 py-3 text-sm font-semibold text-[#2f0c14]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>متصفحك يمنع الحفظ المحلي، لذلك لن تبقى السلة بعد إغلاق الصفحة.</span>
          </p>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-[#6b1726]/10 px-4 py-3 text-sm font-semibold text-[#6b1726]">
            <p>{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-2 rounded-lg border-2 border-[#6b1726] px-4 py-1.5 transition-colors duration-200 hover:bg-[#6b1726] hover:text-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {(isPending || (isLoading && lines.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-24 text-[#211b19]/60">
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-[#6b1726]" aria-hidden="true" />
            <p>جاري تحميل السلة...</p>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ShoppingBag className="mb-4 h-16 w-16 text-[#d8c5ae]" aria-hidden="true" />
            <h2 className="mb-2 text-xl font-bold text-[#211b19]">سلتك فارغة</h2>
            <p className="mb-6 max-w-sm text-sm text-[#211b19]/60">
              تصفّحي الأقمشة وأضيفي ما يعجبك، وستجدينه هنا في أي وقت.
            </p>
            <Link
              href="/fabrics"
              className="rounded-xl bg-[#6b1726] px-8 py-3 font-semibold text-[#f6f0e8] shadow-lg transition-all duration-300 hover:bg-[#2f0c14] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]"
            >
              تصفّح الأقمشة
            </Link>
          </div>
        )}

        {lines.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
            <section aria-label="عناصر السلة" className="space-y-3">
              {lines.map(line => (
                <FabricCartLineRow key={line.key} line={line} />
              ))}

              <button
                type="button"
                onClick={clear}
                className="mt-2 text-sm font-semibold text-[#211b19]/55 transition-colors duration-200 hover:text-[#6b1726] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
              >
                تفريغ السلة
              </button>
            </section>

            <aside className="lg:sticky lg:top-8">
              <FabricCartSummary lines={lines} totals={totals} />
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
