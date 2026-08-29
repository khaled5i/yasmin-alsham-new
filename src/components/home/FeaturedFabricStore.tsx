'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, type PanInfo } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { formatFabricPrice, getFinalPrice, type Fabric, useFabricStore } from '@/store/fabricStore'
import { getFabricDisplayPricing } from '@/lib/fabric-display-pricing'
import { isVideoFile } from '@/lib/utils/media'
import FabricMedia from './FabricMedia'
import { trackHomeEvent } from './home-analytics'
import styles from './home.module.css'

const FALLBACK_IMAGE = '/yasmin.jpg'

export default function FeaturedFabricStore() {
  const { fabrics, loadFabrics, isLoading, error } = useFabricStore()
  const [hasRequested, setHasRequested] = useState(false)

  useEffect(() => {
    setHasRequested(true)
    loadFabrics(false)
  }, [loadFabrics])

  const featuredFabrics = useMemo(
    () => fabrics.filter((fabric) => fabric.is_featured && fabric.is_available && fabric.is_active).slice(0, 8),
    [fabrics],
  )

  const showLoading = !hasRequested || isLoading

  return (
    <section className={styles.fabricStoreSection} aria-labelledby="fabrics-title">
      <div className={styles.sectionContainer}>
        <header className={`${styles.tailoringWorksHeader} ${styles.fabricStoreHeader}`}>
          <h2 id="fabrics-title">متجر الأقمشة</h2>
        </header>

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

        {!showLoading && !error && featuredFabrics.length === 0 ? (
          <div className={styles.fabricStatus} role="status">
            <p>تصفّحي أحدث الأقمشة المتوفرة في المتجر.</p>
            <Link href="/fabrics">عرض جميع الأقمشة</Link>
          </div>
        ) : null}

        {!showLoading && !error && featuredFabrics.length > 0 ? (
          <FabricDeck fabrics={featuredFabrics} />
        ) : null}

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

function FabricDeck({ fabrics }: { fabrics: Fabric[] }) {
  const [activeIndex, setActiveIndex] = useState(() => Math.floor((fabrics.length - 1) / 2))
  const dragInProgress = useRef(false)

  const moveDeck = useCallback((step: -1 | 1) => {
    setActiveIndex((index) => {
      if (fabrics.length <= 1) return 0
      return (index + step + fabrics.length) % fabrics.length
    })
  }, [fabrics.length])

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeIntent = Math.abs(info.offset.x) > 48 || Math.abs(info.velocity.x) > 420
    if (swipeIntent) moveDeck(info.offset.x < 0 ? 1 : -1)

    window.requestAnimationFrame(() => {
      dragInProgress.current = false
    })
  }, [moveDeck])

  const paddedPosition = String(activeIndex + 1).padStart(2, '0')
  const paddedTotal = String(fabrics.length).padStart(2, '0')

  return (
    <div className={`${styles.atelierGallery} ${styles.fabricDeckGallery}`}>
      <div className={styles.cardDeck}>
        {fabrics.map((fabric, index) => {
          const offset = index - activeIndex
          const distance = Math.abs(offset)
          const isCurrent = offset === 0
          const media = getFabricMedia(fabric)
          const finalPrice = getFinalPrice(fabric)
          const displayedFinalPrice = getFabricDisplayPricing(finalPrice, fabric.stock_quantity)
          const displayedOriginalPrice = getFabricDisplayPricing(
            fabric.price_per_meter,
            fabric.stock_quantity
          )
          const hasDiscount = fabric.is_on_sale && fabric.discount_percentage > 0

          return (
            <motion.article
              key={fabric.id}
              className={`${styles.deckCard} ${styles.fabricDeckCard}`}
              initial={false}
              animate={{
                x: `${offset * 23}%`,
                y: distance * 18,
                rotate: offset * -4.8,
                scale: 1 - Math.min(distance, 3) * 0.055,
                opacity: distance > 2 ? 0 : 1 - distance * 0.14,
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.8 }}
              drag={isCurrent ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.58}
              whileDrag={isCurrent ? { scale: 1.025, cursor: 'grabbing' } : undefined}
              onDragStart={() => {
                dragInProgress.current = true
              }}
              onDragEnd={isCurrent ? handleDragEnd : undefined}
              onClickCapture={(event) => {
                if (isCurrent) return
                event.preventDefault()
                setActiveIndex(index)
              }}
              aria-current={isCurrent ? 'true' : undefined}
              style={{
                zIndex: fabrics.length - distance,
                pointerEvents: distance <= 2 ? 'auto' : 'none',
              }}
            >
              <Link
                href={`/fabrics/${fabric.id}`}
                className={styles.fabricDeckLink}
                draggable={false}
                tabIndex={distance <= 2 ? 0 : -1}
                aria-label={isCurrent ? `عرض تفاصيل ${fabric.name || 'القماش'}` : `إظهار ${fabric.name || 'القماش'}`}
                onClick={(event) => {
                  if (dragInProgress.current) {
                    event.preventDefault()
                    return
                  }

                  if (isCurrent) {
                    trackHomeEvent('fabric_card_click', {
                      fabric_id: fabric.id,
                      position: index + 1,
                    })
                  }
                }}
              >
                <FabricMedia
                  src={media.src}
                  poster={media.poster}
                  alt={`${fabric.name || fabric.category || 'قماش'} من تشكيلة أقمشة ياسمين الشام`}
                  priority={isCurrent}
                />
                <span className={styles.deckCardShade} />
                <span className={styles.deckCardTopline}>
                  <small>YASMIN AL-SHAM</small>
                  <small>{String(index + 1).padStart(2, '0')}</small>
                </span>
                {hasDiscount ? (
                  <span className={styles.fabricDeckDiscount}>خصم {fabric.discount_percentage}%</span>
                ) : null}
                <span className={`${styles.deckCardCaption} ${styles.fabricDeckCaption}`}>
                  <span className={styles.fabricDeckDetails}>
                    <strong>{fabric.name || 'قماش'}</strong>
                    <small className={styles.fabricDeckPrice}>
                      {(fabric.price_per_meter ?? 0) > 0 ? (
                        <>
                          <b>{formatFabricPrice(displayedFinalPrice.amount, displayedFinalPrice.unit)}</b>
                          {hasDiscount ? <del>{formatFabricPrice(displayedOriginalPrice.amount, displayedOriginalPrice.unit)}</del> : null}
                        </>
                      ) : (
                        <b>السعر عند الطلب</b>
                      )}
                    </small>
                  </span>
                  <span className={styles.fabricDeckAction}>
                    التفاصيل
                    <ArrowLeft aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </motion.article>
          )
        })}
      </div>

      {fabrics.length > 1 ? (
        <>
          <div className={styles.deckControls}>
            <button type="button" onClick={() => moveDeck(-1)} aria-label="القماش السابق">
              <ChevronRight aria-hidden="true" />
            </button>
            <p aria-live="polite" dir="ltr">{paddedPosition} / {paddedTotal}</p>
            <button type="button" onClick={() => moveDeck(1)} aria-label="القماش التالي">
              <ChevronLeft aria-hidden="true" />
            </button>
          </div>
          <p className={styles.deckHint}>اسحبي البطاقة للتنقّل بين الأقمشة</p>
        </>
      ) : null}
    </div>
  )
}

function getFabricMedia(fabric: Fabric) {
  const mediaItems = [...(fabric.images || []), fabric.image_url].filter(Boolean)
  const originalPrimary = mediaItems[0] || FALLBACK_IMAGE
  const imagePoster =
    mediaItems.find((item) => !isVideoFile(item)) || fabric.thumbnail_image || FALLBACK_IMAGE
  const primary = originalPrimary

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
