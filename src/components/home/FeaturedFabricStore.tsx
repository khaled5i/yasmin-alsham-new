'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, RefreshCw } from 'lucide-react'
import useEmblaCarousel from 'embla-carousel-react'
import { formatFabricPrice, getFinalPrice, type Fabric, useFabricStore } from '@/store/fabricStore'
import { isVideoFile } from '@/lib/utils/media'
import FabricMedia from './FabricMedia'
import { homeMedia } from './home-data'
import { trackHomeEvent } from './home-analytics'
import styles from './home.module.css'

const FALLBACK_IMAGE = '/yasmin.jpg'

export default function FeaturedFabricStore() {
  const { fabrics, loadFabrics, isLoading, error } = useFabricStore()
  const [hasRequested, setHasRequested] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('الكل')
  const [selectedSnap, setSelectedSnap] = useState(0)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    direction: 'rtl',
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: true,
    breakpoints: {
      '(min-width: 768px)': { active: false },
    },
  })

  useEffect(() => {
    setHasRequested(true)
    loadFabrics(false)
  }, [loadFabrics])

  const featuredFabrics = useMemo(
    () => fabrics.filter((fabric) => fabric.is_featured && fabric.is_available && fabric.is_active).slice(0, 8),
    [fabrics],
  )

  const categories = useMemo(
    () => [
      'الكل',
      ...Array.from(new Set(featuredFabrics.map((fabric) => fabric.category).filter(Boolean))),
    ],
    [featuredFabrics],
  )

  const visibleFabrics = useMemo(
    () =>
      selectedCategory === 'الكل'
        ? featuredFabrics
        : featuredFabrics.filter((fabric) => fabric.category === selectedCategory),
    [featuredFabrics, selectedCategory],
  )

  const onSelect = useCallback(() => {
    if (emblaApi) setSelectedSnap(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  useEffect(() => {
    emblaApi?.reInit()
    emblaApi?.scrollTo(0)
    setSelectedSnap(0)
  }, [emblaApi, selectedCategory])

  const showLoading = !hasRequested || isLoading

  return (
    <section id="fabrics" className={styles.fabricStoreSection} aria-labelledby="fabrics-title">
      <div className={styles.sectionContainer}>
        <div className={styles.fabricStoreHeader}>
          <div>
            <p className={styles.sectionEyebrow}>الخامة الأولى</p>
            <h2 id="fabrics-title" className={styles.sectionTitle}>متجر الأقمشة</h2>
          </div>
          <p>خامات مختارة بعناية لتناسب فساتين السهرة والمناسبات والتصاميم الخاصة.</p>
        </div>

        {!showLoading && !error && categories.length > 1 ? (
          <div className={styles.categoryChips} aria-label="تصفية الأقمشة حسب الفئة">
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                aria-pressed={selectedCategory === category}
                onClick={() => {
                  setSelectedCategory(category)
                  trackHomeEvent('fabric_category_click', { category })
                }}
              >
                {category}
              </button>
            ))}
          </div>
        ) : null}

        {showLoading ? <FabricSkeletons /> : null}

        {!showLoading && error ? (
          <div className={styles.fabricStatus} role="status">
            <p>لم نتمكن من عرض التشكيلة المميزة الآن.</p>
            <div>
              <button type="button" onClick={() => loadFabrics(true)}>
                <RefreshCw aria-hidden="true" />
                إعادة المحاولة
              </button>
              <Link href="/fabrics">فتح متجر الأقمشة</Link>
            </div>
          </div>
        ) : null}

        {!showLoading && !error && visibleFabrics.length === 0 ? (
          <div className={styles.fabricStatus} role="status">
            <p>تصفّحي أحدث الأقمشة المتوفرة في المتجر.</p>
            <Link href="/fabrics">عرض جميع الأقمشة</Link>
          </div>
        ) : null}

        {!showLoading && !error && visibleFabrics.length > 0 ? (
          <div className={styles.fabricCarousel} ref={emblaRef}>
            <div className={styles.fabricTrack}>
              {visibleFabrics.map((fabric, index) => (
                <FabricCard key={fabric.id} fabric={fabric} index={index} />
              ))}
            </div>
          </div>
        ) : null}

        {!showLoading && !error && visibleFabrics.length > 1 ? (
          <div className={styles.fabricDots} aria-hidden="true">
            {visibleFabrics.map((fabric, index) => (
              <span key={fabric.id} data-active={selectedSnap === index} />
            ))}
          </div>
        ) : null}

        <div className={styles.campaignBanner}>
          <img src={homeMedia.campaignPoster} alt="" width={1600} height={900} loading="lazy" />
          <div className={styles.campaignOverlay} />
          <div className={styles.campaignContent}>
            <p>اختيارات ياسمين الشام</p>
            <h3>تشكيلة المناسبات</h3>
            <span>خامات تمنح الفكرة بدايتها الأجمل.</span>
            <Link href="/fabrics">
              اكتشفي التشكيلة
              <ArrowLeft aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className={styles.fabricsAllLink}>
          <Link
            href="/fabrics"
            onClick={() => trackHomeEvent('fabrics_all_click', { placement: 'section_end' })}
          >
            عرض جميع الأقمشة
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function FabricCard({ fabric, index }: { fabric: Fabric; index: number }) {
  const media = getFabricMedia(fabric)
  const finalPrice = getFinalPrice(fabric)
  const hasDiscount = fabric.is_on_sale && fabric.discount_percentage > 0

  return (
    <article className={styles.fabricSlide}>
      <Link
        href={`/fabrics/${fabric.id}`}
        className={styles.fabricCard}
        onClick={() =>
          trackHomeEvent('fabric_card_click', {
            fabric_id: fabric.id,
            position: index + 1,
          })
        }
      >
        <div className={styles.fabricImageWrap}>
          <FabricMedia
            src={media.src}
            poster={media.poster}
            alt={`${fabric.name} من تشكيلة أقمشة ياسمين الشام`}
            priority={index === 0}
          />
          {hasDiscount ? <span className={styles.discountBadge}>خصم {fabric.discount_percentage}%</span> : null}
          <span className={styles.availabilityBadge}>
            <Check aria-hidden="true" />
            متوفر
          </span>
        </div>
        <div className={styles.fabricCardBody}>
          <p>{fabric.category}</p>
          <h3>{fabric.name}</h3>
          <div className={styles.fabricPrice}>
            {fabric.price_per_meter > 0 ? (
              <>
                <strong>{formatFabricPrice(finalPrice)}</strong>
                {hasDiscount ? <del>{formatFabricPrice(fabric.price_per_meter)}</del> : null}
              </>
            ) : (
              <strong>السعر عند الطلب</strong>
            )}
          </div>
          <span className={styles.fabricCardAction}>
            عرض التفاصيل
            <ArrowLeft aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  )
}

function getFabricMedia(fabric: Fabric) {
  const mediaItems = [...(fabric.images || []), fabric.image_url].filter(Boolean)
  const primary = mediaItems[0] || FALLBACK_IMAGE
  const imagePoster =
    fabric.thumbnail_image || mediaItems.find((item) => !isVideoFile(item)) || FALLBACK_IMAGE

  return { src: primary, poster: imagePoster }
}

function FabricSkeletons() {
  return (
    <div className={styles.fabricSkeletonGrid} aria-label="جاري تحميل الأقمشة">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={styles.fabricSkeleton}>
          <span />
          <i />
          <b />
        </div>
      ))}
    </div>
  )
}

