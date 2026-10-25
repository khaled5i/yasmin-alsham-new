/**
 * تقييمات الأقمشة — مشتركة بين صفحة المنتج (الخادم) ونموذج التقييم ومسار الكتابة.
 *
 * لا تقييم إلا من طلب إلكتروني مدفوع ومستلَم (يتحقق منه /api/fabric-store/reviews).
 * JSON-LD يُبنى من التقييمات المنشورة المعروضة على الصفحة نفسها فقط، كما يشترط جوجل.
 */

import { z } from 'zod'

export const FABRIC_REVIEW_COMMENT_MAX = 1000
export const FABRIC_REVIEW_NAME_MAX = 40
/** عدد التقييمات المعروضة على صفحة القماش (الأحدث أولاً). */
export const FABRIC_REVIEWS_SHOWN = 20
/** التقييمات المضمّنة في JSON-LD — من المعروضة نفسها. */
const FABRIC_REVIEWS_IN_JSON_LD = 5

export interface PublicFabricReview {
  id: string
  rating: number
  comment: string | null
  reviewer_name: string
  created_at: string
}

export interface FabricReviewSummary {
  count: number
  /** المتوسط مقرّباً لمنزلة عشرية واحدة؛ null بلا تقييمات. */
  average: number | null
}

export function summarizeFabricRatings(ratings: number[]): FabricReviewSummary {
  if (ratings.length === 0) return { count: 0, average: null }
  const sum = ratings.reduce((total, rating) => total + rating, 0)
  return { count: ratings.length, average: Math.round((sum / ratings.length) * 10) / 10 }
}

const singleLine = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()

export const fabricReviewRequestSchema = z.object({
  fabricId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().transform(singleLine).pipe(z.string().min(2).max(FABRIC_REVIEW_NAME_MAX)),
  comment: z
    .string()
    .optional()
    // يُبقي فواصل الأسطر في التعليق ويمحو بقية محارف التحكم
    .transform(value => (value ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().max(FABRIC_REVIEW_COMMENT_MAX))
    .transform(value => value || null),
})

export type FabricReviewRequest = z.infer<typeof fabricReviewRequestSchema>

/** حقول Product في JSON-LD — فارغة تماماً حين لا توجد تقييمات (لا تقييم وهمي ولا صفري). */
export function buildFabricReviewJsonLd(summary: FabricReviewSummary, shown: PublicFabricReview[]) {
  if (summary.count === 0 || summary.average == null) return {}
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: summary.average,
      reviewCount: summary.count,
      bestRating: 5,
      worstRating: 1,
    },
    review: shown.slice(0, FABRIC_REVIEWS_IN_JSON_LD).map(review => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.reviewer_name },
      datePublished: review.created_at.slice(0, 10),
      ...(review.comment && { reviewBody: review.comment }),
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
    })),
  }
}
