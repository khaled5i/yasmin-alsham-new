'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { type Fabric, getFinalPrice } from '@/store/fabricStore'
import { fabricCardImage, fabricCardPrice, fabricCardTitle } from '@/lib/fabric-card-display'
import { toAnalyticsItem, trackFabricSelect } from '@/lib/fabric-analytics'

const SHOWN = 8
const LIST_NAME = 'أقمشة مشابهة'

/**
 * التشابه من وسوم الوصف (نوع القاعدة أولاً ثم الزخارف) ثم اللون. يعمل على قائمة
 * المتجر المحمّلة أصلاً في صفحة القماش، فلا يضيف طلباً إلى قاعدة البيانات.
 */
function similarityScore(base: Fabric, other: Fabric): number {
  const baseTags = base.tags ?? []
  const otherTags = new Set(other.tags ?? [])
  let score = 0
  if (baseTags[0] && otherTags.has(baseTags[0])) score += 3
  for (const tag of baseTags.slice(1)) if (otherTags.has(tag)) score += 1
  if (base.available_colors?.some(color => other.available_colors?.includes(color))) score += 1
  return score
}

export default function SimilarFabrics({ fabric, fabrics }: { fabric: Fabric; fabrics: Fabric[] }) {
  const similar = useMemo(() => fabrics
    .filter(other => other.id !== fabric.id && other.is_available && other.is_active && !other.is_manually_hidden)
    .map(other => ({ other, score: similarityScore(fabric, other) }))
    .filter(entry => entry.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, SHOWN)
    .map(entry => entry.other), [fabric, fabrics])

  if (similar.length === 0) return null

  return (
    <section className="mt-12" aria-labelledby="similar-fabrics-title">
      <h2 id="similar-fabrics-title" className="mb-4 text-xl font-bold text-[#211b19]">أقمشة مشابهة</h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-5 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {similar.map((other, index) => {
          const image = fabricCardImage(other, 400, 533)
          const price = fabricCardPrice(other)
          const title = fabricCardTitle(other)
          return (
            <li key={other.id} className="w-[42%] shrink-0 sm:w-auto">
              <Link
                href={`/fabrics/${other.id}`}
                onNavigate={() => trackFabricSelect(LIST_NAME, toAnalyticsItem(other, { price: getFinalPrice(other), index, listName: LIST_NAME }))}
                className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] rounded-xl"
              >
                <span className="block aspect-[3/4] max-w-full overflow-hidden rounded-xl border border-[#d8c5ae]/60 bg-[#f6f0e8]">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element -- صور Supabase المحوّلة كما في بطاقات المتجر
                    <img src={image} alt={title} width={400} height={533} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  )}
                </span>
                <span className="mt-2 block truncate text-sm font-semibold text-[#211b19]">{title}</span>
                {price && <span className="block text-sm font-semibold text-[#6b1726]">{price}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
