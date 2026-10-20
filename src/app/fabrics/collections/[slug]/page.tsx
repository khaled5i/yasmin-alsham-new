import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  FABRIC_COLLECTIONS,
  fabricCollectionPath,
  getFabricCollection,
  type FabricCollection,
} from '@/lib/fabric-collections'
import { fabricCardImage, fabricCardPrice, fabricCardTitle, type FabricCardFields } from '@/lib/fabric-card-display'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import CollectionTailoringCta from '@/components/fabrics/CollectionTailoringCta'

/**
 * صفحة مجموعة: قائمة أقمشة حقيقية تُبنى على الخادم (المتجر نفسه يُبنى في المتصفح
 * فلا يراه جوجل). رابط ثابت لكل نوع قماش يصلح للإعلانات وللبحث.
 */

const SITE_URL = 'https://www.yasmin-alsham.fashion'

export const revalidate = 600

export function generateStaticParams() {
  return FABRIC_COLLECTIONS.map(collection => ({ slug: collection.slug }))
}

interface Props {
  params: Promise<{ slug: string }>
}

interface CollectionRow extends FabricCardFields {
  id: string
}

const COLUMNS =
  'id,name,fabric_code,category,available_colors,images,thumbnail_image,image_url,price_per_meter,is_on_sale,discount_percentage,stock_quantity'

async function loadCollection(collection: FabricCollection): Promise<CollectionRow[] | null> {
  // نفس شرط الظهور في المتجر وخريطة الموقع
  let query = supabase
    .from('fabrics')
    .select(COLUMNS)
    .eq('is_active', true)
    .eq('is_available', true)
    .is('deleted_at', null)
    .or('is_manually_hidden.is.null,is_manually_hidden.eq.false')
  if (collection.anyTags) query = query.overlaps('tags', collection.anyTags)
  if (collection.allTags) query = query.contains('tags', collection.allTags)
  if (collection.occasions) query = query.contains('occasions', collection.occasions)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    console.error('fabric collection failed:', collection.slug, error.message)
    return null
  }
  return (data ?? []) as CollectionRow[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = getFabricCollection(slug)
  if (!collection) return { title: 'المجموعة غير موجودة - ياسمين الشام', robots: { index: false, follow: true } }

  const title = `${collection.title} | متجر أقمشة ياسمين الشام الخبر`
  return {
    title,
    description: collection.intro,
    alternates: { canonical: fabricCollectionPath(collection.slug) },
    openGraph: { title, description: collection.intro, url: fabricCollectionPath(collection.slug) },
  }
}

export default async function FabricCollectionPage({ params }: Props) {
  const { slug } = await params
  const collection = getFabricCollection(slug)
  if (!collection) notFound()

  const fabrics = await loadCollection(collection)

  const jsonLd = fabrics && fabrics.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.title,
    description: collection.intro,
    url: `${SITE_URL}${fabricCollectionPath(collection.slug)}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: fabrics.length,
      itemListElement: fabrics.slice(0, 30).map((fabric, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/fabrics/${fabric.id}/`,
        name: fabricCardTitle(fabric),
      })),
    },
  } : null

  return (
    <main className="min-h-screen bg-[#fbf8f3] text-[#211b19]">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <div className="container mx-auto px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
        <nav aria-label="مسار التصفح" className="mb-6 text-sm">
          <Link href="/fabrics/" className="inline-flex items-center gap-1 font-medium text-[#6b1726] hover:underline">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            متجر الأقمشة
          </Link>
        </nav>

        <header className="max-w-2xl">
          <h1 className="text-3xl font-bold text-[#6b1726] sm:text-4xl">{collection.title}</h1>
          <p className="mt-3 leading-relaxed text-[#211b19]/75">{collection.intro}</p>
          {fabrics && (
            <p className="mt-2 text-sm text-[#211b19]/55">{formatFabricNumber(fabrics.length)} قماشاً متوفراً الآن</p>
          )}
        </header>

        {/* بقية المجموعات: تنقّل بين الأنواع دون الرجوع للمتجر */}
        <ul
          className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
          aria-label="مجموعات أخرى"
        >
          {FABRIC_COLLECTIONS.map(other => (
            <li key={other.slug} className="shrink-0">
              <Link
                href={fabricCollectionPath(other.slug)}
                aria-current={other.slug === collection.slug ? 'page' : undefined}
                className={`block rounded-full border px-3.5 py-1 text-[13px] font-medium leading-6 transition-colors ${other.slug === collection.slug
                  ? 'border-[#6b1726] bg-[#6b1726] text-[#f6f0e8]'
                  : 'border-[#d8c5ae] bg-[#f6f0e8] text-[#211b19] hover:border-[#6b1726]'
                  }`}
              >
                {other.title}
              </Link>
            </li>
          ))}
        </ul>

        {fabrics === null && (
          <p className="mt-10 rounded-xl bg-[#f6f0e8] px-4 py-6 text-center">
            تعذّر تحميل الأقمشة الآن. <Link href="/fabrics/" className="font-semibold text-[#6b1726]">تصفّحي المتجر</Link>
          </p>
        )}

        {fabrics && fabrics.length === 0 && (
          <p className="mt-10 rounded-xl bg-[#f6f0e8] px-4 py-6 text-center">
            لا توجد أقمشة متوفرة في هذه المجموعة حالياً. <Link href="/fabrics/" className="font-semibold text-[#6b1726]">تصفّحي كل الأقمشة</Link>
          </p>
        )}

        {fabrics && fabrics.length > 0 && (
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {fabrics.map((fabric, index) => {
              const image = fabricCardImage(fabric)
              const price = fabricCardPrice(fabric)
              const title = fabricCardTitle(fabric)
              return (
                <li key={fabric.id} className="min-w-0">
                  <Link href={`/fabrics/${fabric.id}/`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]">
                    <span className="block aspect-[3/4] max-w-full overflow-hidden rounded-xl border border-[#d8c5ae]/60 bg-[#f6f0e8]">
                      {image && (
                        // eslint-disable-next-line @next/next/no-img-element -- صور Supabase المحوّلة كما في بطاقات المتجر
                        <img
                          src={image}
                          alt={title}
                          width={480}
                          height={640}
                          loading={index < 4 ? 'eager' : 'lazy'}
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      )}
                    </span>
                    <span className="mt-2 block truncate text-sm font-semibold">{title}</span>
                    {fabric.available_colors?.[0] && (
                      <span className="block truncate text-xs text-[#211b19]/60">{fabric.available_colors.join(' · ')}</span>
                    )}
                    <span className="block text-sm font-semibold text-[#6b1726]">{price ?? 'السعر عند الطلب'}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-14 max-w-xl">
          <CollectionTailoringCta />
        </div>
      </div>
    </main>
  )
}
