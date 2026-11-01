import { ArrowLeft, Star } from 'lucide-react'
import { loadGoogleReviews, pickShowcaseReviews } from '@/lib/server/google-reviews'
import TrackedLink from './TrackedLink'
import styles from './home.module.css'

/**
 * «تقييم عميلاتنا على Google» أسفل قسم التفصيل، بهوية القسم (نبيذي داكن وعنوان الخطّين).
 * نفس بيانات GoogleReviews وشروط Google لعرضها: التقييم والعدد كما هما، والمراجعة
 * بنصّها الأصلي واسم صاحبتها وصورتها ورابط ملفها. لا يظهر ما لم يُضبط GOOGLE_PLACES_API_KEY.
 */

function ReviewStars({ rating, small = false }: { rating: number; small?: boolean }) {
  const rounded = Math.round(rating)
  return (
    <span
      className={`${styles.reviewStars} ${small ? styles.reviewStarsSmall : ''}`}
      role="img"
      aria-label={`${rating.toLocaleString('ar-SA', { maximumFractionDigits: 1 })} من 5 نجوم`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden="true" className={i < rounded ? styles.reviewStarFilled : styles.reviewStarEmpty} />
      ))}
    </span>
  )
}

export default async function TailoringReviews() {
  const place = await loadGoogleReviews()
  if (!place) return null
  const reviews = pickShowcaseReviews(place)

  return (
    <section className={styles.tailoringReviewsSection} aria-labelledby="tailoring-reviews-title">
      <div className={styles.tailoringReviewsInner}>
        <p className={styles.tailoringReviewsEyebrow}>قالوا عنّا</p>
        <header className={styles.tailoringWorksHeader}>
          <h2 id="tailoring-reviews-title">تقييم عميلاتنا على Google</h2>
        </header>

        <div className={styles.tailoringReviewsSummary}>
          <strong>{place.rating.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}</strong>
          <ReviewStars rating={place.rating} />
          <span>من {place.totalReviews.toLocaleString('ar-SA')} تقييماً</span>
        </div>

        {reviews.length > 0 && (
          // شريط بالتمرير على الجوال وجزء من البطاقة التالية ظاهر؛ صفّ واحد في المنتصف على الشاشات الكبيرة
          <ul className={styles.tailoringReviewsList}>
            {reviews.map(review => (
              <li key={`${review.authorName}-${review.publishTime}`} className={styles.tailoringReviewCard}>
                <div className={styles.tailoringReviewAuthor}>
                  {review.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- صورة صاحبة المراجعة من Google كما يشترط
                    <img
                      src={review.authorPhotoUrl}
                      alt=""
                      width={42}
                      height={42}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className={styles.tailoringReviewAvatar}
                    />
                  ) : (
                    <span aria-hidden="true" className={styles.tailoringReviewAvatar}>
                      {review.authorName.slice(0, 1)}
                    </span>
                  )}
                  <div className={styles.tailoringReviewAuthorText}>
                    {review.authorUrl ? (
                      <a href={review.authorUrl} target="_blank" rel="noopener noreferrer" className={styles.tailoringReviewName}>
                        {review.authorName}
                      </a>
                    ) : (
                      <span className={styles.tailoringReviewName}>{review.authorName}</span>
                    )}
                    <span className={styles.tailoringReviewMeta}>
                      <ReviewStars rating={review.rating} small />
                      {review.relativeTime}
                    </span>
                  </div>
                </div>
                {/* dir=auto: بعض المراجعات بالإنجليزية فتُقرأ من اليسار */}
                <p className={styles.tailoringReviewText} dir="auto">{review.text}</p>
                {review.url && (
                  <a href={review.url} target="_blank" rel="noopener noreferrer" className={styles.tailoringReviewLink}>
                    المراجعة على Google
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {place.mapsUrl && (
          <TrackedLink
            href={place.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.tailoringReviewsAllButton}
            eventName="tailoring_reviews_click"
            eventProperties={{ placement: 'tailoring_reviews' }}
          >
            اقرئي كل التقييمات على Google
            <ArrowLeft aria-hidden="true" />
          </TrackedLink>
        )}
        <p className={styles.tailoringReviewsSource}>التقييمات والمراجعات من خرائط Google.</p>
      </div>
    </section>
  )
}
