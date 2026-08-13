'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HOME_TIKTOK_URL, type TailoringShowcaseItem } from './home-data'
import { trackHomeEvent } from './home-analytics'
import styles from './home.module.css'

type TailoringShowcaseProps = {
  items: TailoringShowcaseItem[]
}

type DeckEdge = -1 | 1 | null

export default function TailoringShowcase({ items }: TailoringShowcaseProps) {
  const activeItems = useMemo(
    () => items.filter((item) => item.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [items],
  )
  const [activeIndex, setActiveIndex] = useState(() => Math.floor((activeItems.length - 1) / 2))
  const [deckEdge, setDeckEdge] = useState<DeckEdge>(null)
  const galleryTracked = useRef(false)
  const galleryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const gallery = galleryRef.current
    if (!gallery) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || galleryTracked.current) return
        galleryTracked.current = true
        trackHomeEvent('tailoring_gallery_view', { item_count: activeItems.length })
      },
      { threshold: 0.3 },
    )

    observer.observe(gallery)
    return () => observer.disconnect()
  }, [activeItems.length])

  const moveDeck = useCallback((step: -1 | 1) => {
    if (activeItems.length === 0) return

    if (deckEdge !== null) {
      setDeckEdge(null)
      setActiveIndex(deckEdge === -1 ? 0 : activeItems.length - 1)
      return
    }

    if ((step === -1 && activeIndex === 0) || (step === 1 && activeIndex === activeItems.length - 1)) {
      setDeckEdge(step)
      trackHomeEvent('tailoring_tiktok_reveal', { edge: step === -1 ? 'right' : 'left' })
      return
    }

    setActiveIndex((index) => index + step)
  }, [activeIndex, activeItems.length, deckEdge])

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeIntent = Math.abs(info.offset.x) > 48 || Math.abs(info.velocity.x) > 420
    if (!swipeIntent) return
    moveDeck(info.offset.x < 0 ? 1 : -1)
  }, [moveDeck])

  if (activeItems.length === 0) return null

  const paddedPosition = String(activeIndex + 1).padStart(2, '0')
  const paddedTotal = String(activeItems.length).padStart(2, '0')
  const edgeShift = deckEdge === -1 ? 1 : deckEdge === 1 ? -1 : 0
  const tiktokBackdrop = deckEdge === -1 ? activeItems[0] : activeItems[activeItems.length - 1]

  return (
    <div ref={galleryRef} className={styles.atelierGallery}>
      <div className={styles.cardDeck} data-outro={deckEdge !== null}>
        {activeItems.map((item, index) => {
          const offset = index - activeIndex + edgeShift
          const distance = Math.abs(offset)
          const isCurrent = deckEdge === null && offset === 0

          return (
            <motion.button
              key={item.id}
              type="button"
              className={styles.deckCard}
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
              onDragEnd={isCurrent ? handleDragEnd : undefined}
              onClick={() => {
                if (isCurrent) return
                setDeckEdge(null)
                setActiveIndex(index)
              }}
              aria-label={isCurrent ? `${item.title}، البطاقة الحالية` : `عرض ${item.title}`}
              aria-current={isCurrent ? 'true' : undefined}
              tabIndex={distance <= 2 ? 0 : -1}
              style={{
                zIndex: activeItems.length - distance,
                pointerEvents: distance <= 2 ? 'auto' : 'none',
              }}
            >
              <Image
                src={item.imageUrl}
                alt={item.alt}
                fill
                sizes="(max-width: 767px) 72vw, 32vw"
                className={styles.deckCardImage}
                draggable={false}
              />
              <span className={styles.deckCardShade} />
              <span className={styles.deckCardTopline}>
                <small>YASMIN AL-SHAM</small>
                <small>{String(index + 1).padStart(2, '0')}</small>
              </span>
              <span className={styles.deckCardCaption}>
                <strong>{item.title}</strong>
                <small>{String(index + 1).padStart(2, '0')} / {paddedTotal}</small>
              </span>
            </motion.button>
          )
        })}

        {deckEdge !== null ? (
          <motion.div
            key={`tiktok-${deckEdge}`}
            className={`${styles.deckCard} ${styles.tiktokDeckCard}`}
            initial={{ opacity: 0, x: `${deckEdge * 23}%`, y: 18, rotate: deckEdge * -4.8, scale: 0.945 }}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.8 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.58}
            whileDrag={{ scale: 1.025, cursor: 'grabbing' }}
            onDragEnd={handleDragEnd}
            style={{ zIndex: activeItems.length + 2 }}
          >
            <Image
              src={tiktokBackdrop.imageUrl}
              alt=""
              fill
              sizes="(max-width: 767px) 72vw, 32vw"
              className={`${styles.deckCardImage} ${styles.tiktokDeckImage}`}
              draggable={false}
            />
            <span className={`${styles.deckCardShade} ${styles.tiktokCardShade}`} />
            <span className={styles.deckCardTopline}>
              <small>YASMIN AL-SHAM</small>
              <small>TIKTOK</small>
            </span>
            <div className={styles.tiktokCardContent}>
              <p>شاهدي المزيد من أعمالنا عبر</p>
              <a
                href={HOME_TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tiktokHalo}
                aria-label="مشاهدة المزيد من أعمال ياسمين الشام على تيك توك"
                onClick={() => trackHomeEvent('tailoring_tiktok_click', { placement: 'gallery_outro' })}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.22 8.22 0 0 0 4.79 1.53V4.56a4.85 4.85 0 0 1-1.02-.12z" />
                </svg>
              </a>
            </div>
          </motion.div>
        ) : null}
      </div>

      <div className={styles.deckControls}>
        <button type="button" onClick={() => moveDeck(-1)} aria-label="العمل السابق">
          <ChevronRight aria-hidden="true" />
        </button>
        <p aria-live="polite" dir="ltr">
          {deckEdge === null ? `${paddedPosition} / ${paddedTotal}` : 'TikTok'}
        </p>
        <button type="button" onClick={() => moveDeck(1)} aria-label="العمل التالي">
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>
      <p className={styles.deckHint}>اسحبي البطاقة للتنقّل بين الأعمال</p>
    </div>
  )
}
