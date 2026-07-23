'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabaseImageSrcSet, getSupabaseImageUrl, isVideoFile } from '@/lib/utils/media'
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
    const originalImage = failed ? FALLBACK_IMAGE : isVideo ? poster || FALLBACK_IMAGE : src || FALLBACK_IMAGE
    const imageSrc = getSupabaseImageUrl(originalImage, {
      width: 960,
      height: 1200,
      quality: 82,
    })
    const imageSrcSet = getSupabaseImageSrcSet(originalImage, [
      { width: 480, height: 600 },
      { width: 720, height: 900 },
      { width: 960, height: 1200 },
    ])

    return (
      <img
        src={imageSrc}
        srcSet={imageSrcSet}
        alt={alt}
        sizes="(max-width: 767px) 80vw, (max-width: 1199px) 44vw, 25vw"
        width={960}
        height={1200}
        className={styles.fabricMedia}
        onError={() => setFailed(true)}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
      />
    )
  }

  const videoPoster = getSupabaseImageUrl(poster || FALLBACK_IMAGE, {
    width: 960,
    height: 1200,
    quality: 82,
  })

  return (
    <video
      ref={videoRef}
      src={src}
      poster={videoPoster}
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
