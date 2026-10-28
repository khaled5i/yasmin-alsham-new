'use client'

import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import { FABRIC_STORE_WHATSAPP_NUMBER } from '@/lib/fabric-cart-whatsapp'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight, X, Maximize2, Palette, Shirt, Sparkles } from 'lucide-react'
import FabricStoreLoader from '@/components/fabrics/FabricStoreLoader'
import { useFabricStore, formatFabricPrice, Fabric, getFinalPrice } from '@/store/fabricStore'
import { getFabricStorefrontPricing } from '@/lib/fabric-display-pricing'
import { IS_FABRIC_CART_ENABLED } from '@/lib/fabric-commerce'
import { isVideoFile } from '@/lib/utils/media'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { requestFabricBrowseReturn } from '@/lib/fabric-browse-position'
import FabricAddToCartButton from '@/components/fabrics/FabricAddToCartButton'
import FabricFavoriteButton from '@/components/fabrics/FabricFavoriteButton'
import FabricStoreActionsBar from '@/components/fabrics/FabricStoreActionsBar'
import FabricTailoringCta from '@/components/fabrics/FabricTailoringCta'
import SimilarFabrics from '@/components/fabrics/SimilarFabrics'
import { StoreTrustStrip } from '@/components/fabrics/StoreTrust'
import { toAnalyticsItem, trackFabricView } from '@/lib/fabric-analytics'

const FALLBACK_IMAGE = '/wedding-dress-1.jpg.jpg'
const MIN_SWIPE_DISTANCE = 50

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]'

/**
 * يمرّر شريط الصور أفقياً إلى الشريحة المطلوبة. الفرق بين موضعي الشريحة والشريط
 * يصلح لـRTL وLTR معاً، بخلاف حساب scrollLeft من الرقم (قيمته سالبة في RTL).
 * scrollTo بموضع مطلق لا scrollBy: snap-always يوقف التمرير النسبي عند أول شريحة.
 */
function scrollTrackTo(track: HTMLElement | null, index: number, behavior: ScrollBehavior = 'smooth') {
  const slide = track?.children[index] as HTMLElement | undefined
  if (!track || !slide) return
  const offset = slide.getBoundingClientRect().left - track.getBoundingClientRect().left
  track.scrollTo({ left: track.scrollLeft + offset, behavior })
}

/** رأس ثابت كرأس المتجر: رجوع، الشعار، السلة والمفضلة. بلا transform حتى لا يُحبس درج السلة داخله. */
function DetailHeader({ fabricId }: { fabricId: string }) {
  const returnToStore = () => requestFabricBrowseReturn(fabricId)
  return (
    <header className="sticky top-0 z-40 border-b border-[#d8c5ae]/60 bg-[#fbf8f3]" dir="rtl">
      <div className="container mx-auto grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:h-[72px] sm:px-6 lg:h-20 lg:px-8">
        <Link
          href="/fabrics"
          onNavigate={returnToStore}
          aria-label="العودة إلى متجر الأقمشة"
          className={`group inline-flex h-10 w-10 items-center justify-center justify-self-start rounded-full text-[#6b1726] transition-colors hover:bg-[#f6f0e8] sm:w-auto sm:gap-1.5 sm:px-3 ${focusRing}`}
        >
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          <span className="hidden text-sm font-medium sm:inline">متجر الأقمشة</span>
        </Link>
        <Link href="/fabrics" onNavigate={returnToStore} aria-label="متجر الأقمشة — ياسمين الشام" className={`rounded-lg ${focusRing}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- الشعار نفسه في رأس المتجر */}
          <img src="/fabric-store-logo.png" alt="" width={480} height={272} className="h-12 w-auto sm:h-14 lg:h-16" />
        </Link>
        <FabricStoreActionsBar className="justify-self-end" />
      </div>
    </header>
  )
}

export default function FabricDetailClient() {
  const params = useParams()
  const fabricId = params.id as string
  const { fabrics, loadFabrics, isLoading, getFabricById } = useFabricStore()

  // قبل أول تحميل تكون القائمة فارغة وisLoading=false، فبدون هذا تومض «القماش غير موجود»
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number>(0)

  useEffect(() => {
    if (fabrics.length === 0) loadFabrics().finally(() => setHasAttemptedLoad(true))
  }, [fabrics.length, loadFabrics])

  // مشتق مباشرة لا عبر effect، فلا يمر إطار «غير موجود» بين وصول القائمة وإيجاد القماش
  const fabric: Fabric | null = useMemo(
    () => (fabrics.length > 0 && fabricId ? getFabricById(fabricId) ?? null : null),
    [fabrics, fabricId, getFabricById]
  )

  // view_item مرة لكل قماش يُفتح
  const viewedId = useRef<string | null>(null)
  useEffect(() => {
    if (!fabric || viewedId.current === fabric.id) return
    viewedId.current = fabric.id
    trackFabricView(toAnalyticsItem(fabric, { price: getFinalPrice(fabric) }))
  }, [fabric])

  // كل قماش يبدأ معرضه من أول صورة؛ والقدوم من وضع «التصاميم النهائية» يبدأ من أول تصميم.
  // المفتاح هو المعرّف لا الكائن، فتحديث قائمة الأقمشة لا يعيد الزائرة إلى الصورة الأولى.
  const fabricKey = fabric?.id
  const fabricImageCount = fabric?.images?.length ?? 0
  const designImageCount = fabric?.design_images?.length ?? 0
  useEffect(() => {
    if (!fabricKey) return
    const wantsDesigns = designImageCount > 0 && new URLSearchParams(window.location.search).get('view') === 'designs'
    const index = wantsDesigns ? fabricImageCount : 0
    setCurrentImageIndex(index)
    scrollTrackTo(trackRef.current, index, 'auto')
  }, [fabricKey, fabricImageCount, designImageCount])

  // الصورة المصغّرة النشطة تبقى ظاهرة داخل شريطها، دون تحريك الصفحة نفسها كما يفعل scrollIntoView
  useEffect(() => {
    const strip = thumbsRef.current
    const thumb = strip?.querySelector<HTMLElement>(`[data-thumb="${currentImageIndex}"]`)
    if (!strip || !thumb) return
    const stripBox = strip.getBoundingClientRect()
    const thumbBox = thumb.getBoundingClientRect()
    if (thumbBox.left < stripBox.left) strip.scrollBy({ left: thumbBox.left - stripBox.left - 16, behavior: 'smooth' })
    else if (thumbBox.right > stripBox.right) strip.scrollBy({ left: thumbBox.right - stripBox.right + 16, behavior: 'smooth' })
  }, [currentImageIndex])

  useEffect(() => {
    if (!isGalleryOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [isGalleryOpen])

  if (isLoading || (fabrics.length === 0 && !hasAttemptedLoad)) {
    return (
      <FabricStoreLoader fullScreen size="lg" />
    )
  }

  if (!fabric && !isLoading) {
    return (
      <div className="min-h-screen bg-[#fbf8f3]">
        <DetailHeader fabricId={fabricId} />
        <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
          <div>
            <h1 className="mb-4 text-2xl font-bold text-[#211b19]">القماش غير موجود</h1>
            <Link href="/fabrics" onNavigate={() => requestFabricBrowseReturn(fabricId)} className="inline-flex items-center gap-2 rounded-xl border-2 border-[#6b1726] px-5 py-2.5 font-semibold text-[#6b1726] transition-colors hover:bg-[#6b1726] hover:text-[#f6f0e8]">
              <ArrowRight className="h-4 w-4" />
              <span>العودة إلى متجر الأقمشة</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!fabric) return null

  // صور القماش أولاً ثم صور التصاميم النهائية، ضمن معرض واحد مع تمييز التصاميم
  const fabricImages = fabric.images || []
  const designImages = fabric.design_images || []
  const galleryImages = [...fabricImages, ...designImages]
  const slides = galleryImages.length > 0 ? galleryImages : [fabric.image_url || FALLBACK_IMAGE]
  const hasMultipleSlides = slides.length > 1
  const isDesignIndex = (index: number) => index >= fabricImages.length && index < galleryImages.length
  const currentIsDesign = isDesignIndex(currentImageIndex)
  const currentSlide = slides[currentImageIndex] || slides[0]
  const slideLabel = (index: number) =>
    isDesignIndex(index) ? `تصميم ${index - fabricImages.length + 1}` : `صورة ${index + 1}`

  const goTo = (index: number) => {
    const next = (index + slides.length) % slides.length
    setCurrentImageIndex(next)
    scrollTrackTo(trackRef.current, next)
  }
  const nextImage = () => goTo(currentImageIndex + 1)
  const prevImage = () => goTo(currentImageIndex - 1)

  // السحب بالإصبع تمرير أصلي؛ نقرأ منه الشريحة الظاهرة فقط
  const handleTrackScroll = () => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const index = Math.round(Math.abs(track.scrollLeft) / track.clientWidth)
    setCurrentImageIndex(Math.min(slides.length - 1, index))
  }

  const openGallery = () => setIsGalleryOpen(true)
  const closeGallery = () => setIsGalleryOpen(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  // في RTL الصورة التالية على اليسار، فسحب الإصبع يميناً يجلبها — كشريط الصفحة نفسه
  const handleTouchEnd = (e: React.TouchEvent) => {
    const distance = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(distance) < MIN_SWIPE_DISTANCE) return
    if (distance > 0) nextImage()
    else prevImage()
  }

  const handleGalleryKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeGallery()
    else if (e.key === 'ArrowLeft') nextImage()
    else if (e.key === 'ArrowRight') prevImage()
  }

  const finalPrice = getFinalPrice(fabric)
  const displayedFinalPrice = getFabricStorefrontPricing(finalPrice, fabric.stock_quantity)
  const displayedOriginalPrice = getFabricStorefrontPricing(
    fabric.price_per_meter,
    fabric.stock_quantity
  )
  const hasPrice = !!fabric.price_per_meter && fabric.price_per_meter > 0 && displayedFinalPrice.amount != null
  const stock = Number(fabric.stock_quantity) || 0
  const categories = (fabric.categories?.length ? fabric.categories : [fabric.category]).filter(Boolean)
  const colors = (fabric.available_colors || []).filter(Boolean)
  const occasions = (fabric.occasions || []).filter(Boolean)

  // رابط واتساب: يبقى فقط للأقمشة التي سعرها «عند الطلب» (لا تُشترى إلكترونياً)
  const fabricLabel = fabric.name || fabric.fabric_code || 'قماش'
  const fabricTitle = fabric.name?.trim() || (fabric.fabric_code ? `قماش ${fabric.fabric_code}` : 'قماش')
  const whatsappMessage = `مرحباً، أود الاستفسار عن القماش: ${fabricLabel}`
  const whatsappLink = `https://wa.me/${FABRIC_STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`

  // بلا display هنا: الأسهم تُخفى على الجوال (hidden md:inline-flex) والسحب يغني عنها
  const overlayButton = `items-center justify-center rounded-full bg-[#fbf8f3]/90 text-[#6b1726] shadow-md transition-colors hover:bg-[#fbf8f3] ${focusRing}`

  return (
    <div className="min-h-screen bg-[#fbf8f3] text-[#211b19]">
      <DetailHeader fabricId={fabricId} />

      <div className="container mx-auto px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8 lg:pb-16 lg:pt-10">
        <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-12 xl:gap-16">
          {/* المعرض: الصورة بعرض الشاشة على الجوال، وثابتة بجانب التفاصيل على الكمبيوتر */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="-mx-4 sm:mx-0 lg:sticky lg:top-28"
            aria-label="صور القماش"
          >
            <div className="relative aspect-[4/5] max-h-[72svh] w-full overflow-hidden bg-gradient-to-br from-[#d8c5ae]/55 via-[#f6f0e8] to-[#d8c5ae]/35 sm:rounded-3xl sm:border sm:border-[#d8c5ae]/60 lg:max-h-[calc(100svh-16rem)]">
              <div
                ref={trackRef}
                onScroll={handleTrackScroll}
                dir="rtl"
                className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {slides.map((src, index) => (
                  <div key={`${index}-${src}`} className="relative h-full w-full shrink-0 snap-center snap-always">
                    {isVideoFile(src) ? (
                      <video
                        src={src}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full bg-[#2f0c14]/5 object-contain"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={openGallery}
                        className="relative block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b99a68]"
                        aria-label={`تكبير ${slideLabel(index)}`}
                      >
                        <Image
                          src={src}
                          alt={`${fabricLabel} - ${slideLabel(index)}`}
                          fill
                          sizes="(max-width: 1024px) 100vw, 50vw"
                          className="object-contain"
                          priority={index === 0}
                          quality={85}
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {currentIsDesign && (
                <span className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#fbf8f3]/95 px-3 py-1.5 text-xs font-bold text-[#6b1726] shadow-md">
                  <Shirt className="h-3.5 w-3.5" aria-hidden="true" />
                  تصميم فستان من هذا القماش
                </span>
              )}

              <FabricFavoriteButton fabric={fabric} variant="floating" size="md" className="absolute left-3 top-3 z-10" />

              {hasMultipleSlides && (
                <>
                  <button type="button" onClick={nextImage} className={`${overlayButton} absolute left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 md:inline-flex`} aria-label="الصورة التالية">
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={prevImage} className={`${overlayButton} absolute right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 md:inline-flex`} aria-label="الصورة السابقة">
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span dir="ltr" className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full bg-[#211b19]/60 px-2.5 py-1 text-xs font-semibold tabular-nums text-[#fbf8f3]" aria-live="polite">
                    {currentImageIndex + 1} / {slides.length}
                  </span>
                </>
              )}

              {!isVideoFile(currentSlide) && (
                <button type="button" onClick={openGallery} className={`${overlayButton} absolute bottom-3 left-3 z-10 inline-flex h-9 w-9`} aria-label="عرض الصورة بملء الشاشة">
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* صور مصغّرة بحجم ثابت في صف واحد يُمرَّر أفقياً، فلا تتراكب مهما كثرت أو ضاقت الشاشة */}
            {hasMultipleSlides && (
              <div
                ref={thumbsRef}
                dir="rtl"
                className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden"
              >
                {slides.map((src, index) => (
                  <Fragment key={`${index}-${src}`}>
                    {index > 0 && index === fabricImages.length && (
                      <span aria-hidden="true" className="mx-0.5 w-px shrink-0 self-stretch bg-[#d8c5ae]" />
                    )}
                    <button
                      type="button"
                      data-thumb={index}
                      onClick={() => goTo(index)}
                      aria-label={slideLabel(index)}
                      aria-current={currentImageIndex === index ? 'true' : undefined}
                      className={`relative h-[76px] w-[60px] shrink-0 overflow-hidden rounded-xl border-2 bg-[#f6f0e8] transition-all duration-200 focus-visible:border-[#b99a68] focus-visible:outline-none sm:h-24 sm:w-[76px] ${currentImageIndex === index
                        ? 'border-[#6b1726] opacity-100'
                        : 'border-[#d8c5ae]/60 opacity-75 hover:opacity-100'
                        }`}
                    >
                      {isVideoFile(src) ? (
                        <video src={src} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <Image
                          src={src}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                          loading="lazy"
                          quality={60}
                        />
                      )}
                      {isDesignIndex(index) && (
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#6b1726]/85 py-0.5 text-center text-[10px] font-bold text-[#f6f0e8]">
                          تصميم
                        </span>
                      )}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="mt-5 space-y-5 lg:mt-0"
          >
            {/* الهوية والسعر: أول ما تراه الزائرة تحت الصور */}
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map(category => (
                  <span
                    key={category}
                    className="rounded-full bg-[#f6f0e8] px-2.5 py-1 text-xs font-semibold text-[#6b1726] ring-1 ring-inset ring-[#d8c5ae]/70"
                  >
                    {category}
                  </span>
                ))}
                {fabric.fabric_code && (
                  <span dir="ltr" className="ms-auto font-mono text-sm font-bold tracking-wider text-[#211b19]/45">
                    {fabric.fabric_code}
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-[1.65rem] font-bold leading-snug text-[#211b19] sm:text-3xl lg:text-4xl">{fabricTitle}</h1>

              {/* شارة التوفر في جهة البداية: جهة النهاية يغطيها زر واتساب العائم على الجوال */}
              <div className="mt-3">
                {hasPrice ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-3xl font-extrabold tracking-tight text-[#6b1726]">{formatFabricNumber(displayedFinalPrice.amount)}</span>
                    <span className="text-base font-semibold text-[#6b1726]">ريال / {displayedFinalPrice.unit === 'piece' ? 'القطعة' : 'متر'}</span>
                    {fabric.is_on_sale && (
                      <>
                        <span className="text-base text-[#211b19]/40 line-through">{formatFabricPrice(displayedOriginalPrice.amount, displayedOriginalPrice.unit)}</span>
                        <span className="self-center rounded-full bg-[#6b1726] px-2 py-0.5 text-xs font-bold text-[#f6f0e8]">خصم {fabric.discount_percentage}%</span>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-xl font-bold text-[#6b1726]">السعر عند الطلب</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {fabric.show_stock_quantity && stock > 0 && (
                    <p className="inline-flex items-center gap-2 rounded-full bg-[#e9f3ec] px-3 py-1 text-xs font-semibold text-[#1f5f3a]">
                      <span className="h-2 w-2 rounded-full bg-[#2f9e5b]" aria-hidden="true" />
                      متوفر: {formatFabricNumber(stock)} متر
                    </p>
                  )}
                  {hasPrice && <p className="text-xs text-[#211b19]/55">شامل ضريبة القيمة المضافة 15%</p>}
                </div>
              </div>
            </div>

            {IS_FABRIC_CART_ENABLED && (
              <div className="rounded-2xl border border-[#d8c5ae]/70 bg-white p-3 shadow-[0_1px_3px_rgba(47,12,20,0.06)] sm:p-5">
                <FabricAddToCartButton fabric={fabric} whatsappLink={whatsappLink} />
              </div>
            )}

            {(fabric.description || colors.length > 0 || occasions.length > 0) && (
              <section className="rounded-2xl border border-[#d8c5ae]/70 bg-[#f6f0e8]/60 p-4 sm:p-5" aria-labelledby="fabric-about-title">
                <h2 id="fabric-about-title" className="text-base font-bold text-[#211b19]">عن القماش</h2>
                {fabric.description && (
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-[#211b19]/75">{fabric.description}</p>
                )}
                {(colors.length > 0 || occasions.length > 0) && (
                  <dl className={`space-y-3 text-sm ${fabric.description ? 'mt-4 border-t border-[#d8c5ae]/70 pt-4' : 'mt-3'}`}>
                    {colors.length > 0 && (
                      <div className="flex items-center gap-3">
                        <dt className="flex w-24 shrink-0 items-center gap-2 text-[#211b19]/60">
                          <Palette className="h-4 w-4 text-[#6b1726]" aria-hidden="true" />
                          اللون
                        </dt>
                        <dd className="font-semibold text-[#211b19]">{colors.join('، ')}</dd>
                      </div>
                    )}
                    {occasions.length > 0 && (
                      <div className="flex items-start gap-3">
                        <dt className="flex w-24 shrink-0 items-center gap-2 pt-0.5 text-[#211b19]/60">
                          <Sparkles className="h-4 w-4 text-[#6b1726]" aria-hidden="true" />
                          المناسبات
                        </dt>
                        <dd className="flex flex-wrap gap-1.5">
                          {occasions.map(occasion => (
                            <span key={occasion} className="rounded-full bg-[#fbf8f3] px-2.5 py-0.5 text-xs font-semibold text-[#6b1726] ring-1 ring-inset ring-[#d8c5ae]/70">
                              {occasion}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </section>
            )}

            <StoreTrustStrip compact />
            <FabricTailoringCta fabric={fabric} />
          </motion.div>
        </div>

        <SimilarFabrics fabric={fabric} fabrics={fabrics} />
      </div>

      {/* المعرض بملء الشاشة */}
      {isGalleryOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#1a0b0f]"
          role="dialog"
          aria-modal="true"
          aria-label={`صور ${fabricLabel}`}
          onKeyDown={handleGalleryKey}
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeGallery}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f0e8]/10 text-[#f6f0e8] transition-colors hover:bg-[#f6f0e8]/20 ${focusRing}`}
              aria-label="إغلاق"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
            {hasMultipleSlides && (
              <span dir="ltr" className="text-sm font-semibold tabular-nums text-[#f6f0e8]/80">
                {currentImageIndex + 1} / {slides.length}
              </span>
            )}
          </div>

          <div className="relative min-h-0 flex-1" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {isVideoFile(currentSlide) ? (
              <video
                key={currentSlide}
                src={currentSlide}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <Image
                src={currentSlide}
                alt={`${fabricLabel} - ${slideLabel(currentImageIndex)}`}
                fill
                sizes="100vw"
                className="object-contain"
                quality={95}
              />
            )}
            {hasMultipleSlides && (
              <>
                <button type="button" onClick={nextImage} className={`absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#f6f0e8]/15 text-[#f6f0e8] transition-colors hover:bg-[#f6f0e8]/25 ${focusRing}`} aria-label="الصورة التالية">
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button type="button" onClick={prevImage} className={`absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#f6f0e8]/15 text-[#f6f0e8] transition-colors hover:bg-[#f6f0e8]/25 ${focusRing}`} aria-label="الصورة السابقة">
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {hasMultipleSlides && (
            <div className="flex justify-center gap-1.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4" aria-hidden="true">
              {slides.map((src, index) => (
                <span
                  key={`${index}-${src}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${currentImageIndex === index ? 'w-5 bg-[#f6f0e8]' : 'w-1.5 bg-[#f6f0e8]/35'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
