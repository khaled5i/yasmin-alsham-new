import { BadgeCheck, Star } from 'lucide-react'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import type { FabricReviewSummary, PublicFabricReview } from '@/lib/fabric-store/reviews'

/**
 * تقييمات القماش على صفحته (مكوّن خادم). كلها من مشتريات مؤكدة، وهي نفسها ما يقرؤه
 * JSON-LD — جوجل يشترط أن تكون التقييمات المعلنة ظاهرة على الصفحة.
 * بلا تقييمات لا يُعرض القسم.
 */

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${formatFabricNumber(value)} من 5`} dir="ltr">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={`${size} ${star <= Math.round(value) ? 'fill-[#b99a68] text-[#b99a68]' : 'text-[#211b19]/25'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

const reviewDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-SA', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' })

export default function FabricReviews({ summary, reviews }: { summary: FabricReviewSummary; reviews: PublicFabricReview[] }) {
  if (summary.count === 0 || summary.average == null) return null

  return (
    <section className="bg-[#fbf8f3] px-4 pb-16 text-[#211b19]" dir="rtl" aria-labelledby="fabric-reviews-title">
      <div className="mx-auto max-w-3xl rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fabric-reviews-title" className="text-xl font-bold text-[#6b1726]">تقييمات المشتريات</h2>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{formatFabricNumber(summary.average)}</span>
            <Stars value={summary.average} size="h-5 w-5" />
            <span className="text-sm text-[#211b19]/65">({formatFabricNumber(summary.count)} تقييم)</span>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-[#d8c5ae]">
          {reviews.map(review => (
            <li key={review.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={review.rating} />
                <span className="font-semibold">{review.reviewer_name}</span>
                <span className="inline-flex items-center gap-1 text-xs text-[#6b1726]">
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" /> شراء مؤكد
                </span>
                <time dateTime={review.created_at} className="text-xs text-[#211b19]/55">{reviewDate(review.created_at)}</time>
              </div>
              {review.comment && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">{review.comment}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
