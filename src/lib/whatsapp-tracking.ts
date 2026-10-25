/**
 * عدّاد الوصول إلى واتساب لكل محل ومصدر (25 أكتوبر 2026).
 *
 * طريقان يكتبان في جدول واحد (whatsapp_clicks):
 * 1. روابط وسيطة خارج الموقع: /wa/<المحل>/<المصدر>/ (بايو إنستغرام وتيك توك، خرائط Google...)
 *    — السيرفر يحوّل فوراً إلى wa.me ويسجّل الضغطة بعد إرسال التحويل. بلا صفحة ولا GA ⇒ لا page_view.
 * 2. أزرار واتساب داخل الموقع والمتجر: مستمع SiteInsights يرسل beacon إلى /api/wa-click/
 *    مع موضع الزر ومصدر الزيارة (إعلان Google، إنستغرام...) — بلا تعديل الأزرار نفسها.
 *
 * وحدة نقية بلا 'use client': يستعملها السيرفر والمتصفح.
 */

import { STORE_SUPPORT_PHONE } from './store-legal'

/** الرقمان بصيغة wa.me (بلا +). الخياطة هو نفسه HOME_WHATSAPP_NUMBER في الصفحة الرئيسية. */
export const WHATSAPP_SHOPS = {
  fabrics: { number: STORE_SUPPORT_PHONE.e164.slice(1), label: 'محل الأقمشة' },
  tailoring: { number: '966598862609', label: 'محل الخياطة' },
} as const

export type WhatsAppShop = keyof typeof WHATSAPP_SHOPS

export const WHATSAPP_SHOP_KEYS = Object.keys(WHATSAPP_SHOPS) as WhatsAppShop[]

export function isWhatsAppShop(value: unknown): value is WhatsAppShop {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WHATSAPP_SHOPS, value)
}

/** مصادر الروابط الوسيطة. أي مصدر آخر في الرابط يُسجَّل «other» ولا يكسر التحويل. */
export const WHATSAPP_LINK_SOURCES = {
  instagram: 'إنستغرام',
  tiktok: 'تيك توك',
  maps: 'خرائط Google',
  'google-ads': 'إعلانات Google',
  snapchat: 'سناب شات',
  other: 'رابط آخر',
} as const

/** مصدر ضغطات أزرار الموقع والمتجر (طريق الـ beacon). */
export const WHATSAPP_SITE_SOURCE = 'website'

export const WHATSAPP_SOURCE_LABELS: Record<string, string> = {
  ...WHATSAPP_LINK_SOURCES,
  [WHATSAPP_SITE_SOURCE]: 'أزرار الموقع والمتجر',
}

export function normalizeLinkSource(raw: string): keyof typeof WHATSAPP_LINK_SOURCES {
  const value = raw.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(WHATSAPP_LINK_SOURCES, value)
    ? (value as keyof typeof WHATSAPP_LINK_SOURCES)
    : 'other'
}

/** أي المحلين يخص رابط واتساب داخل الموقع؟ null لأي رقم آخر (مثل أرقام الزبونات في لوحة التحكم). */
export function shopFromWhatsAppHref(href: string): WhatsAppShop | null {
  const digits = (href.match(/(?:wa\.me\/|phone=)\+?(\d{8,15})/i)?.[1]) ?? ''
  if (!digits) return null
  return WHATSAPP_SHOP_KEYS.find(shop => WHATSAPP_SHOPS[shop].number === digits) ?? null
}

/** مواضع الأزرار المعروفة (data-wa-placement أو المستنتجة من المسار في SiteInsights). */
export const WHATSAPP_PLACEMENT_LABELS: Record<string, string> = {
  home: 'الصفحة الرئيسية',
  store: 'المتجر',
  fabric_page: 'صفحة قماش',
  cart: 'السلة',
  favorites: 'المفضلة',
  store_floating_button: 'الزر العائم في المتجر',
  fabric_tailoring_cta: 'زر «فصّليه عندنا» في صفحة قماش',
  collection_tailoring_cta: 'زر «فصّليه عندنا» في المتجر',
  social: 'صفحة الروابط',
  services: 'صفحات الخدمات',
  faq: 'الأسئلة الشائعة',
}

export const WHATSAPP_VISIT_SOURCE_LABELS: Record<string, string> = {
  google_ads: 'إعلانات Google',
  google: 'بحث Google',
  instagram: 'إنستغرام',
  tiktok: 'تيك توك',
  facebook: 'فيسبوك',
  snapchat: 'سناب شات',
  direct: 'مباشر / غير معروف',
}

/**
 * روبوتات معاينة الروابط والزواحف: إنستغرام وتيك توك وواتساب يفتحون الرابط بأنفسهم لعرض معاينة.
 * متصفح إنستغرام الداخلي («Instagram ...») ومتصفح تيك توك («BytedanceWebview»/«musical_ly») لا يطابقان.
 */
const BOT_USER_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|^whatsapp\/|bytespider|headless|lighthouse|curl\/|wget\/|python-|go-http-client|okhttp|axios\/|node-fetch/i

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim()
  return !ua || BOT_USER_AGENT.test(ua)
}

/** تقصير وتنظيف قيمة نصية قبل الحفظ: أحرف لاتينية وأرقام و_- فقط. */
export function cleanTrackingToken(value: unknown, max = 60): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max)
  return cleaned || null
}

const VISIT_SOURCE_KEY = 'ys-visit-source'

/**
 * مصدر الزيارة الأول في الجلسة: إعلان Google (gclid وأخواته) ثم utm_source ثم موقع المُحيل.
 * يُحفظ مرة واحدة لكل جلسة، فالزبونة التي دخلت من إعلان وتنقّلت بين الصفحات تبقى «google_ads».
 */
export function rememberVisitSource(): void {
  try {
    if (window.sessionStorage.getItem(VISIT_SOURCE_KEY)) return
    const params = new URLSearchParams(window.location.search)
    let source: string | null = null
    if (params.get('gclid') || params.get('gbraid') || params.get('wbraid') || params.get('gad_source')) source = 'google_ads'
    else if (params.get('utm_source')) source = cleanTrackingToken(params.get('utm_source'), 40)
    else {
      let host = ''
      try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '' } catch { host = '' }
      if (host && host !== window.location.hostname.toLowerCase()) {
        if (/(^|\.)instagram\.com$/.test(host)) source = 'instagram'
        else if (/(^|\.)tiktok\.com$/.test(host)) source = 'tiktok'
        else if (/(^|\.)(facebook\.com|fb\.com)$/.test(host)) source = 'facebook'
        else if (/(^|\.)snapchat\.com$/.test(host)) source = 'snapchat'
        else if (/(^|\.)google\.[a-z.]+$/.test(host)) source = 'google'
        else source = cleanTrackingToken(host.replace(/^www\./, ''), 40)
      }
    }
    window.sessionStorage.setItem(VISIT_SOURCE_KEY, source ?? 'direct')
  } catch {
    // التخزين مرفوض: تُسجَّل الضغطة بلا مصدر زيارة
  }
}

export function readVisitSource(): string | null {
  try { return window.sessionStorage.getItem(VISIT_SOURCE_KEY) } catch { return null }
}
