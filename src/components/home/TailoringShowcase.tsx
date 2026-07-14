'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { TailoringShowcaseItem } from './home-data'
import { trackHomeEvent } from './home-analytics'
import styles from './home.module.css'

type TailoringShowcaseProps = {
  items: TailoringShowcaseItem[]
}

export default function TailoringShowcase({ items }: TailoringShowcaseProps) {
  const activeItems = items
    .filter((item) => item.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number | null>(null)
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

  useEffect(() => {
    if (selectedIndex === null) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedIndex(null)
      if (event.key === 'ArrowLeft') setSelectedIndex((index) => nextIndex(index, activeItems.length))
      if (event.key === 'ArrowRight') setSelectedIndex((index) => previousIndex(index, activeItems.length))
      if (event.key !== 'Tab') return

      const dialog = document.querySelector<HTMLElement>('[data-tailoring-lightbox]')
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

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

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [activeItems.length, selectedIndex])

  const openItem = (index: number) => {
    setSelectedIndex(index)
    trackHomeEvent('tailoring_work_open', {
      item_id: activeItems[index].id,
      position: index + 1,
    })
  }

  const selectedItem = selectedIndex === null ? null : activeItems[selectedIndex]

  return (
    <>
      <div ref={galleryRef} className={styles.showcaseGrid}>
        {activeItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.showcaseCard} ${item.isFeatured ? styles.showcaseFeatured : ''}`}
            onClick={() => openItem(index)}
            aria-label={`فتح صورة: ${item.title ?? item.alt}`}
          >
            <Image
              src={item.imageUrl}
              alt={item.alt}
              fill
              sizes={item.isFeatured ? '(max-width: 767px) 82vw, 52vw' : '(max-width: 767px) 76vw, 26vw'}
              className={styles.showcaseImage}
            />
            <span className={styles.showcaseVeil} />
            <span className={styles.showcaseCaption}>
              <small>0{index + 1}</small>
              <strong>{item.title}</strong>
            </span>
          </button>
        ))}
      </div>

      {selectedItem && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.lightboxBackdrop}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tailoring-lightbox-title"
              data-tailoring-lightbox
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setSelectedIndex(null)
              }}
            >
              <div
                className={styles.lightboxPanel}
                onTouchStart={(event) => {
                  touchStartX.current = event.changedTouches[0]?.clientX ?? null
                }}
                onTouchEnd={(event) => {
                  if (touchStartX.current === null || selectedIndex === null) return
                  const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
                  if (Math.abs(delta) > 50) {
                    setSelectedIndex(
                      delta > 0
                        ? nextIndex(selectedIndex, activeItems.length)
                        : previousIndex(selectedIndex, activeItems.length),
                    )
                  }
                  touchStartX.current = null
                }}
              >
                <button
                  ref={closeButtonRef}
                  type="button"
                  className={styles.lightboxClose}
                  onClick={() => setSelectedIndex(null)}
                  aria-label="إغلاق معرض الصور"
                >
                  <X aria-hidden="true" />
                </button>

                <div className={styles.lightboxImageWrap}>
                  <Image
                    src={selectedItem.imageUrl}
                    alt={selectedItem.alt}
                    fill
                    sizes="(max-width: 767px) 94vw, 72vw"
                    className={styles.lightboxImage}
                    priority
                  />
                </div>

                <div className={styles.lightboxMeta}>
                  <p dir="ltr">{String((selectedIndex ?? 0) + 1).padStart(2, '0')} / {String(activeItems.length).padStart(2, '0')}</p>
                  <div>
                    <h3 id="tailoring-lightbox-title">{selectedItem.title}</h3>
                    {selectedItem.description ? <p>{selectedItem.description}</p> : null}
                  </div>
                </div>

                <button
                  type="button"
                  className={`${styles.lightboxArrow} ${styles.lightboxPrevious}`}
                  onClick={() => setSelectedIndex((index) => previousIndex(index, activeItems.length))}
                  aria-label="الصورة السابقة"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`${styles.lightboxArrow} ${styles.lightboxNext}`}
                  onClick={() => setSelectedIndex((index) => nextIndex(index, activeItems.length))}
                  aria-label="الصورة التالية"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function nextIndex(index: number | null, length: number) {
  return index === null ? 0 : (index + 1) % length
}

function previousIndex(index: number | null, length: number) {
  return index === null ? 0 : (index - 1 + length) % length
}
