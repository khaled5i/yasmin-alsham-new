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
  const [canUseVideo, setCanUseVideo] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!mobileVideo && !desktopVideo) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean }
    }).connection

    if (!reducedMotion && !connection?.saveData) setCanUseVideo(true)
  }, [desktopVideo, mobileVideo])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !canUseVideo) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => undefined)
        } else {
          video.pause()
        }
      },
      { threshold: 0.35 },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [canUseVideo])

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

      {canUseVideo && (mobileVideo || desktopVideo) ? (
        <video
          ref={videoRef}
          className={`${styles.heroVideo} ${isReady ? styles.heroVideoReady : ''}`}
          muted
          loop
          playsInline
          preload="metadata"
          onCanPlay={() => setIsReady(true)}
          onError={() => setCanUseVideo(false)}
          onPlay={() => {
            if (started.current) return
            started.current = true
            trackHomeEvent('hero_video_start', {
              variant: desktopVideo && windowWidthIsDesktop() ? 'desktop' : 'mobile',
            })
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget
            if (watchedHalf.current || !video.duration || video.currentTime < video.duration / 2) return
            watchedHalf.current = true
            trackHomeEvent('hero_video_50', {
              variant: desktopVideo && windowWidthIsDesktop() ? 'desktop' : 'mobile',
            })
          }}
        >
          {desktopVideo ? <source media="(min-width: 768px)" src={desktopVideo} type="video/mp4" /> : null}
          {mobileVideo ? <source src={mobileVideo} type="video/mp4" /> : null}
        </video>
      ) : null}
    </div>
  )
}

function windowWidthIsDesktop() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
}
