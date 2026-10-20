import { Star } from 'lucide-react'
import { loadGoogleReviews, pickShowcaseReviews } from '@/lib/server/google-reviews'

/**
 * «قالوا عنّا» من خرائط Google: التقييم العام والعدد كما هما، وأربع مراجعات بنصّها
 * الأصلي واسم صاحبتها وصورتها ورابط ملفها (شروط Google لعرض المراجعات). مكوّن خادم
 * لا يظهر إطلاقاً ما لم يُضبط GOOGLE_PLACES_API_KEY.
 */

function Stars({ rating, size = 'h-4 w-4' }: { rating: number; size?: string }) {
  const rounded = Math.round(rating)
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${rating.toLocaleString('ar-SA', { maximumFractionDigits: 1 })} من 5 نجوم`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={`${size} ${i < rounded ? 'fill-[#b99a68] text-[#b99a68]' : 'fill-transparent text-[#d8c5ae]'}`}
        />
      ))}
    </span>
  )
}

export default async function GoogleReviews({ className = '' }: { className?: string }) {
  const place = await loadGoogleReviews()
  if (!place) return null
  const reviews = pickShowcaseReviews(place)

  return (
    <section className={`bg-[#fbf8f3] text-[#211b19] ${className}`} aria-labelledby="google-reviews-title" dir="rtl">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#b99a68]">قالوا عنّا</p>
            <h2 id="google-reviews-title" className="mt-1 text-2xl font-bold text-[#6b1726] sm:text-3xl">
              تقييم عميلاتنا على Google
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-3xl font-bold tabular-nums text-[#211b19]">
                {place.rating.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}
              </span>
              <Stars rating={place.rating} size="h-5 w-5" />
              <span className="text-sm text-[#211b19]/65">
                من {place.totalReviews.toLocaleString('ar-SA')} تقييماً
              </span>
            </div>
          </div>
          {place.mapsUrl && (
            <a
              href={place.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[#6b1726] hover:underline"
            >
              اقرئي كل التقييمات على Google
            </a>
          )}
        </header>

        {reviews.length > 0 && (
          // شريط أفقي بالتمرير بدل بطاقات مكدّسة؛ جزء من البطاقة التالية يظهر ليدلّ على التمرير
          <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden">
            {reviews.map(review => (
              <li key={`${review.authorName}-${review.publishTime}`} className="flex w-[82%] shrink-0 snap-start flex-col rounded-2xl border border-[#d8c5ae]/70 bg-[#f6f0e8] p-4 sm:w-[45%] lg:w-[30%]">
                <div className="flex items-center gap-3">
                  {review.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- صورة صاحبة المراجعة من Google كما يشترط
                    <img src={review.authorPhotoUrl} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d8c5ae] font-bold text-[#6b1726]">
                      {review.authorName.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    {review.authorUrl ? (
                      <a href={review.authorUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold hover:underline">
                        {review.authorName}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-semibold">{review.authorName}</span>
                    )}
                    <span className="flex items-center gap-2 text-xs text-[#211b19]/55">
                      <Stars rating={review.rating} size="h-3.5 w-3.5" />
                      {review.relativeTime}
                    </span>
                  </div>
                </div>
                <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-[#211b19]/80">{review.text}</p>
                {review.url && (
                  <a href={review.url} target="_blank" rel="noopener noreferrer" className="mt-auto pt-3 text-xs font-semibold text-[#6b1726] hover:underline">
                    المراجعة على Google
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-[#211b19]/50">التقييمات والمراجعات من خرائط Google.</p>
      </div>
    </section>
  )
}
