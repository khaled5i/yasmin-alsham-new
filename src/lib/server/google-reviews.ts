/**
 * تقييمات محل ياسمين الشام على خرائط Google عبر Places API (New) — الطريقة الرسمية
 * لعرض المراجعات: النص كما كتبته صاحبته، باسمها وصورتها ورابط ملفها، مع نسبتها
 * لـ Google. لا نخزّن شيئاً في قاعدتنا؛ Next يحفظ الاستجابة يوماً كاملاً (سياسة Google
 * تمنع تخزين المحتوى أكثر من 30 يوماً)، فتبقى الطلبات بضع عشرات شهرياً.
 *
 * البيئة (خادم فقط، ليست NEXT_PUBLIC):
 *   GOOGLE_PLACES_API_KEY — مفتاح مقيّد بـ «Places API (New)» من Google Cloud.
 *   GOOGLE_PLACE_ID       — اختياري؛ إن غاب يُبحث عن المحل مرة يومياً بالاسم والموقع.
 * بلا مفتاح تُرجع الدالة null ولا يظهر القسم في الموقع.
 */

const PLACES_URL = 'https://places.googleapis.com/v1'
const ONE_DAY = 60 * 60 * 24

/** موقع المحل كما في رابط الخرائط (الخبر). */
const SHOP_LOCATION = { latitude: 26.2870601, longitude: 50.2104277 }
const SHOP_QUERY = 'ياسمين الشام للخياطة النسائية الخبر'

export interface GoogleReview {
  authorName: string
  authorUrl: string | null
  authorPhotoUrl: string | null
  rating: number
  text: string
  relativeTime: string
  publishTime: string | null
  url: string | null
}

export interface GooglePlaceReviews {
  rating: number
  totalReviews: number
  mapsUrl: string | null
  reviews: GoogleReview[]
}

interface PlacesReview {
  rating?: number
  text?: { text?: string }
  originalText?: { text?: string }
  relativePublishTimeDescription?: string
  publishTime?: string
  googleMapsUri?: string
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
}

interface PlacesDetails {
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  reviews?: PlacesReview[]
}

async function resolvePlaceId(apiKey: string): Promise<string | null> {
  const configured = process.env.GOOGLE_PLACE_ID?.trim()
  if (configured) return configured

  const response = await fetch(`${PLACES_URL}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName',
    },
    body: JSON.stringify({
      textQuery: SHOP_QUERY,
      languageCode: 'ar',
      locationBias: { circle: { center: SHOP_LOCATION, radius: 300 } },
      maxResultCount: 1,
    }),
    next: { revalidate: ONE_DAY },
  })
  if (!response.ok) {
    console.error('google places search failed:', response.status)
    return null
  }
  const data = (await response.json()) as { places?: { id?: string }[] }
  return data.places?.[0]?.id ?? null
}

/** التقييم والعدد وأحدث مراجعات Google (حتى 5 يختارها Google)، أو null. */
export async function loadGoogleReviews(): Promise<GooglePlaceReviews | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!apiKey) return null

  try {
    const placeId = await resolvePlaceId(apiKey)
    if (!placeId) return null

    const response = await fetch(`${PLACES_URL}/places/${encodeURIComponent(placeId)}?languageCode=ar`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews',
      },
      next: { revalidate: ONE_DAY },
    })
    if (!response.ok) {
      console.error('google place details failed:', response.status)
      return null
    }
    const place = (await response.json()) as PlacesDetails
    if (!place.rating || !place.userRatingCount) return null

    return {
      rating: place.rating,
      totalReviews: place.userRatingCount,
      mapsUrl: place.googleMapsUri ?? null,
      reviews: (place.reviews ?? []).map(review => ({
        authorName: review.authorAttribution?.displayName?.trim() || 'عميلة',
        authorUrl: review.authorAttribution?.uri ?? null,
        authorPhotoUrl: review.authorAttribution?.photoUri ?? null,
        rating: review.rating ?? 0,
        // النص الأصلي بلغة كاتبته؛ المترجم آلياً فقط إن غاب الأصل
        text: (review.originalText?.text || review.text?.text || '').trim(),
        relativeTime: review.relativePublishTimeDescription ?? '',
        publishTime: review.publishTime ?? null,
        url: review.googleMapsUri ?? null,
      })),
    }
  } catch (error) {
    console.error('google reviews failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * ما نعرضه: 4 نجوم فأكثر وبنص له مضمون (40 حرفاً فأكثر). التقييم العام والعدد
 * يبقيان كما هما من Google، فلا يُخفى شيء عن الزائرة، ورابط «كل التقييمات» يفتح الخرائط.
 */
export function pickShowcaseReviews(place: GooglePlaceReviews, limit = 4): GoogleReview[] {
  return place.reviews
    .filter(review => review.rating >= 4 && review.text.length >= 40)
    .slice(0, limit)
}
