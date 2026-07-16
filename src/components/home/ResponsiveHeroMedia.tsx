'use client'

import { useEffect, useRef, useState } from 'react'
import { trackHomeEvent } from './home-analytics'
import styles from './home.module.css'

type ResponsiveHeroMediaProps = {
  mobilePoster: string
  desktopPoster: string
  mobileVideo?: string
  desktopVideo?: string
}

export default function ResponsiveHeroMedia({
  mobilePoster,
  desktopPoster,
  mobileVideo,
  desktopVideo,
}: ResponsiveHeroMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const watchedHalf = useRef(false)
  const started = useRef(false)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!mobileVideo && !desktopVideo) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean }
    }).connection

    if (reducedMotion || connection?.saveData) return

    const desktopMedia = window.matchMedia('(min-width: 768px)')
    const selectVideo = () => {
      const nextVideo = desktopMedia.matches
        ? (desktopVideo ?? mobileVideo)
        : (mobileVideo ?? desktopVideo)

      setVideoSrc(nextVideo ?? null)
    }

    selectVideo()
    desktopMedia.addEventListener('change', selectVideo)

    return () => desktopMedia.removeEventListener('change', selectVideo)
  }, [desktopVideo, mobileVideo])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc) return

    setIsReady(false)
    started.current = false
    watchedHalf.current = false

    const playVideo = () => {
      video.play().catch(() => undefined)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          playVideo()
        } else {
          video.pause()
        }
      },
      { threshold: 0.35 },
    )

    observer.observe(video)
    window.addEventListener('pointerdown', playVideo, { once: true, passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('pointerdown', playVideo)
    }
  }, [videoSrc])

  const videoVariant = videoSrc === desktopVideo ? 'desktop' : 'mobile'

  return (
    <div className={styles.heroMedia} aria-hidden="true">
      <picture>
        <source media="(min-width: 768px)" srcSet={desktopPoster} />
        <img
          src={mobilePoster}
          alt=""
          className={styles.heroPoster}
          width={900}
          height={1600}
          fetchPriority="high"
        />
      </picture>

      {videoSrc ? (
        <video
          key={videoSrc}
          ref={videoRef}
          src={videoSrc}
          className={`${styles.heroVideo} ${isReady ? styles.heroVideoReady : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onPlaying={() => setIsReady(true)}
          onError={() => setVideoSrc(null)}
          onPlay={() => {
            if (started.current) return
            started.current = true
            trackHomeEvent('hero_video_start', {
              variant: videoVariant,
            })
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget
            if (watchedHalf.current || !video.duration || video.currentTime < video.duration / 2) return
            watchedHalf.current = true
            trackHomeEvent('hero_video_50', {
              variant: videoVariant,
            })
          }}
        />
      ) : null}
    </div>
  )
}
