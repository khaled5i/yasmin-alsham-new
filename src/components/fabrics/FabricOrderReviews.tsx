'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Star } from 'lucide-react'
import { FABRIC_REVIEW_COMMENT_MAX, FABRIC_REVIEW_NAME_MAX } from '@/lib/fabric-store/reviews'

/**
 * تقييم أقمشة طلب مستلَم — في صفحة التتبّع، للطلب المفتوح بإثبات (كوكي أو رابط التتبّع) فقط.
 * نفس الترويسات تُرسل مع التقييم، والخادم يعيد التحقق من الطلب كاملاً.
 */

interface ReviewableItem {
  fabricId: string
  name: string
  color: string | null
  review: { rating: number; comment: string | null; reviewerName: string } | null
}

export default function FabricOrderReviews({ headers }: { headers?: Record<string, string> }) {
  const [items, setItems] = useState<ReviewableItem[] | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/fabric-store/reviews/', { credentials: 'same-origin', cache: 'no-store', headers })
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (!active) return
        // غير مستلَم بعد أو غير مؤهل: لا نعرض القسم أصلاً
        setItems(response.ok && data?.ok && data.canReview ? data.items : [])
      })
      .catch(() => { if (active) setItems([]) })
    return () => { active = false }
  }, [headers])

  if (!items || items.length === 0) return null

  return (
    <section className="space-y-3 rounded-xl bg-white/70 p-4" aria-labelledby="order-reviews-title">
      <div>
        <h3 id="order-reviews-title" className="font-bold text-[#6b1726]">قيّمي مشترياتك</h3>
        <p className="text-xs text-[#211b19]/60">يظهر تقييمك في صفحة القماش مع الاسم الذي تكتبينه، ولا يظهر رقم طلبك ولا جوالك.</p>
      </div>
      {items.map(item => (
        <ReviewItem
          key={item.fabricId}
          item={item}
          headers={headers}
          onSaved={review => setItems(current => current?.map(i => i.fabricId === item.fabricId ? { ...i, review } : i) ?? null)}
        />
      ))}
    </section>
  )
}

function Stars({ value, onChange }: { value: number; onChange?: (rating: number) => void }) {
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? 'التقييم بالنجوم' : `${value} من 5`} dir="ltr">
      {[1, 2, 3, 4, 5].map(star => {
        const icon = <Star className={`h-6 w-6 ${star <= value ? 'fill-[#b99a68] text-[#b99a68]' : 'text-[#211b19]/25'}`} aria-hidden="true" />
        return onChange ? (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} من 5`}
            onClick={() => onChange(star)}
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
          >
            {icon}
          </button>
        ) : <span key={star}>{icon}</span>
      })}
    </div>
  )
}

function ReviewItem({ item, headers, onSaved }: {
  item: ReviewableItem
  headers?: Record<string, string>
  onSaved: (review: NonNullable<ReviewableItem['review']>) => void
}) {
  const [rating, setRating] = useState(0)
  const [reviewerName, setReviewerName] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const title = (
    <Link href={`/fabrics/${item.fabricId}/`} className="font-semibold hover:text-[#6b1726] hover:underline">
      {item.name}{item.color ? ` · ${item.color}` : ''}
    </Link>
  )

  if (item.review) {
    return (
      <div className="border-t border-[#d8c5ae] pt-3 text-sm">
        {title}
        <div className="mt-1 flex items-center gap-2">
          <Stars value={item.review.rating} />
          <span className="flex items-center gap-1 text-xs text-[#211b19]/60">
            <CheckCircle2 className="h-4 w-4 text-[#6b1726]" aria-hidden="true" /> تم التقييم — شكراً لكِ
          </span>
        </div>
      </div>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSaving) return
    if (rating < 1) { setError('اختاري عدد النجوم'); return }
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/fabric-store/reviews/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fabricId: item.fabricId, rating, reviewerName, comment }),
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) {
        onSaved({ rating, comment: comment.trim() || null, reviewerName: reviewerName.trim() })
      } else if (data?.code === 'already-reviewed') {
        onSaved({ rating, comment: null, reviewerName })
      } else {
        setError(data?.error || 'تعذّر حفظ التقييم')
      }
    } catch {
      setError('انقطع الاتصال — أعيدي المحاولة')
    }
    setIsSaving(false)
  }

  const field = 'w-full rounded-xl border-2 border-[#d8c5ae] bg-white px-3 py-2 text-sm focus:border-[#6b1726] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]'

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-[#d8c5ae] pt-3 text-sm">
      {title}
      <Stars value={rating} onChange={setRating} />
      <input
        value={reviewerName}
        onChange={event => setReviewerName(event.target.value)}
        maxLength={FABRIC_REVIEW_NAME_MAX}
        required
        placeholder="الاسم الظاهر مع التقييم (مثل: أم محمد)"
        aria-label="الاسم الظاهر مع التقييم"
        className={field}
      />
      <textarea
        value={comment}
        onChange={event => setComment(event.target.value)}
        maxLength={FABRIC_REVIEW_COMMENT_MAX}
        rows={3}
        placeholder="تعليقك على القماش (اختياري)"
        aria-label="تعليقك على القماش"
        className={field}
      />
      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-[#6b1726]/10 px-3 py-2 font-semibold text-[#6b1726]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded-xl bg-[#6b1726] px-4 py-2 font-bold text-[#f6f0e8] transition-colors hover:bg-[#2f0c14] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
      >
        {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        <span>إرسال التقييم</span>
      </button>
    </form>
  )
}
