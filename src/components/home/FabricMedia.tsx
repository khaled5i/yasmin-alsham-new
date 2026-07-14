'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { isVideoFile } from '@/lib/utils/media'
import styles from './home.module.css'

type FabricMediaProps = {
  src: string
  poster?: string | null
  alt: string
  priority?: boolean
}

const FALLBACK_IMAGE = '/yasmin.jpg'

export default function FabricMedia({ src, poster, alt, priority = false }: FabricMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(true)
  const isVideo = isVideoFile(src)

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || reduceMotion) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => undefined)
        else video.pause()
      },
      { rootMargin: '120px', threshold: 0.55 },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [reduceMotion])

  if (!isVideo || reduceMotion || failed) {
    return (
      <Image
        src={failed ? FALLBACK_IMAGE : isVideo ? poster || FALLBACK_IMAGE : src || FALLBACK_IMAGE}
        alt={alt}
        fill
        sizes="(max-width: 767px) 80vw, (max-width: 1199px) 44vw, 25vw"
        className={styles.fabricMedia}
        onError={() => setFailed(true)}
        priority={priority}
      />
    )
  }

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster || FALLBACK_IMAGE}
      className={styles.fabricMedia}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={alt}
      onError={() => setFailed(true)}
    />
  )
}

