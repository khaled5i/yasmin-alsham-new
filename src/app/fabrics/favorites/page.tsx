'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Heart, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import FabricAddToCartButton from '@/components/fabrics/FabricAddToCartButton'
import FabricStoreActionsBar from '@/components/fabrics/FabricStoreActionsBar'
import { useResolvedFavorites } from '@/hooks/useFabricCommerce'
import {
  IS_FABRIC_CART_ENABLED,
  formatPurchaseModeLabel,
  formatUnitPriceLabel,
  getFabricPurchaseMode,
  getFabricUnitPrice,
  isFabricPubliclyVisible,
} from '@/lib/fabric-commerce'
import { FABRIC_STORE_WHATSAPP_NUMBER } from '@/lib/fabric-cart-whatsapp'
import { useFabricFavoritesStore } from '@/store/fabricFavoritesStore'

export default function FabricFavoritesPage() {
  const { entries, isLoading, isPending, error, isStorageBlocked, reload } = useResolvedFavorites()
  const remove = useFabricFavoritesStore(state => state.remove)

  if (!IS_FABRIC_CART_ENABLED) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf8f3] px-4 text-center">
        <div>
          <h1 className="mb-3 text-2xl font-bold text-[#211b19]">المفضلة غير متاحة حالياً</h1>
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

  const isEmpty = !isPending && entries.length === 0

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

            <FabricStoreActionsBar hideFavorites />
          </div>

          <h1 className="mt-5 flex items-center gap-2 text-2xl font-bold text-[#6b1726] sm:text-3xl">
            <Heart className="h-7 w-7" aria-hidden="true" />
            <span>المفضلة</span>
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
            <span>متصفحك يمنع الحفظ المحلي، لذلك لن تبقى المفضلة بعد إغلاق الصفحة.</span>
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

        {(isPending || (isLoading && entries.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-24 text-[#211b19]/60">
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-[#6b1726]" aria-hidden="true" />
            <p>جاري تحميل المفضلة...</p>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Heart className="mb-4 h-16 w-16 text-[#d8c5ae]" aria-hidden="true" />
            <h2 className="mb-2 text-xl font-bold text-[#211b19]">لا توجد أقمشة في المفضلة</h2>
            <p className="mb-6 max-w-sm text-sm text-[#211b19]/60">
              اضغطي على القلب في أي قماش يعجبك ليظهر هنا.
            </p>
            <Link
              href="/fabrics"
              className="rounded-xl bg-[#6b1726] px-8 py-3 font-semibold text-[#f6f0e8] shadow-lg transition-all duration-300 hover:bg-[#2f0c14] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f3]"
            >
              تصفّح الأقمشة
            </Link>
          </div>
        )}

        {entries.length > 0 && (
          <section
            aria-label="الأقمشة المفضلة"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {entries.map(entry => {
              const { fabric } = entry
              const label = fabric
                ? fabric.name || fabric.fabric_code || entry.fallbackLabel
                : entry.fallbackLabel
              const image =
                fabric?.images?.[0] || fabric?.thumbnail_image || fabric?.image_url || entry.fallbackImage
              const isSellable = fabric ? isFabricPubliclyVisible(fabric) : false
              const unitPrice = fabric ? getFabricUnitPrice(fabric) : null
              const mode = fabric ? getFabricPurchaseMode(fabric) : 'meter'
              const whatsappLink = `https://wa.me/${FABRIC_STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `مرحباً، أود الاستفسار عن القماش: ${label}`
              )}`

              return (
                <article
                  key={entry.fabricId}
                  className="flex flex-col overflow-hidden rounded-2xl border-2 border-[#d8c5ae]/70 bg-[#f6f0e8] shadow-lg transition-shadow duration-300 hover:shadow-xl"
                >
                  <div className="relative">
                    <Link
                      href={`/fabrics/${entry.fabricId}`}
                      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                      aria-label={`فتح صفحة ${label}`}
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-[#d8c5ae]/55 via-[#f6f0e8] to-[#d8c5ae]/35">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image}
                            alt={label}
                            loading="lazy"
                            decoding="async"
                            className={`h-full w-full object-cover ${isSellable || entry.isPending ? '' : 'opacity-60 grayscale'}`}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-[#211b19]/40">
                            لا توجد صورة
                          </div>
                        )}
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        remove(entry.fabricId)
                        toast.success(`أُزيل «${label}» من المفضلة`, { icon: '🤍' })
                      }}
                      aria-label={`إزالة ${label} من المفضلة`}
                      title="إزالة من المفضلة"
                      className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f0e8]/95 text-[#6b1726] shadow-lg backdrop-blur-sm transition-colors duration-200 hover:bg-[#6b1726] hover:text-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <Link
                      href={`/fabrics/${entry.fabricId}`}
                      className="font-bold text-[#211b19] transition-colors duration-200 hover:text-[#6b1726] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                    >
                      {label}
                    </Link>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#211b19]/70">
                      {fabric?.fabric_code && (
                        <span dir="ltr" className="font-mono font-bold text-[#6b1726]">
                          {fabric.fabric_code}
                        </span>
                      )}
                      {fabric?.available_colors?.[0] && (
                        <span className="rounded-full border border-[#d8c5ae]/70 bg-[#fbf8f3] px-2 py-0.5">
                          {fabric.available_colors[0]}
                        </span>
                      )}
                      {fabric && (
                        <span className="rounded-full border border-[#d8c5ae]/70 bg-[#fbf8f3] px-2 py-0.5">
                          {formatPurchaseModeLabel(mode)}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-bold text-[#6b1726]">
                      {formatUnitPriceLabel(unitPrice, mode)}
                    </p>

                    <div className="mt-auto pt-4">
                      {!fabric ? (
                        <p
                          role="status"
                          className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                            entry.isPending
                              ? 'bg-[#d8c5ae]/30 text-[#211b19]/70'
                              : 'bg-[#6b1726]/10 text-[#6b1726]'
                          }`}
                        >
                          {entry.isPending ? (
                            <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            {entry.isPending
                              ? 'جاري التحقق من توفّر هذا القماش...'
                              : 'هذا القماش لم يعد معروضاً في المتجر'}
                          </span>
                        </p>
                      ) : (
                        <FabricAddToCartButton fabric={fabric} whatsappLink={whatsappLink} />
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
