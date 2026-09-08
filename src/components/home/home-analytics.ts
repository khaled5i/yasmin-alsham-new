'use client'

export type HomeEventName =
  | 'home_view'
  | 'hero_video_start'
  | 'hero_video_50'
  | 'hero_cta_click'
  | 'tailoring_gallery_view'
  | 'tailoring_work_open'
  | 'tailoring_work_scroll'
  | 'tailoring_tiktok_reveal'
  | 'tailoring_tiktok_click'
  | 'tailoring_whatsapp_click'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function trackHomeEvent(
  eventName: HomeEventName,
  properties: Record<string, string | number | boolean> = {},
) {
  if (typeof window === 'undefined') return
  window.gtag?.('event', eventName, properties)
}
