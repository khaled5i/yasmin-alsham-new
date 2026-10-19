import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { isFabricPubliclyVisible } from '@/lib/fabric-store/pricing'
import { getFabricNetPricePerMeter, getFabricStorefrontPricing } from '@/lib/fabric-display-pricing'
import FabricDetailClient from './FabricDetailClient'

const SITE_URL = 'https://www.yasmin-alsham.fashion'

interface Props {
  params: Promise<{ id: string }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FabricLookup =
  | { status: 'found'; fabric: FabricSeoRow }
  | { status: 'missing' }
  | { status: 'unknown' }

interface FabricSeoRow {
  id: string
  name: string | null
  description: string | null
  fabric_code: string | null
  image_url: string | null
  images: string[] | null
  stock_quantity: number | null
  price_per_meter: number | null
  is_on_sale: boolean | null
  discount_percentage: number | null
  discounted_price_per_meter: number | null
  deleted_at: string | null
  is_active: boolean | null
  is_available: boolean | null
  is_manually_hidden: boolean | null
}

// يُستدعى من generateMetadata ومن الصفحة؛ cache يجعله استعلاماً واحداً لكل طلب
const lookupFabric = cache(async (id: string): Promise<FabricLookup> => {
  if (!UUID_PATTERN.test(id)) return { status: 'missing' }

  const { data, error } = await supabase
    .from('fabrics')
    .select('id,name,description,fabric_code,image_url,images,stock_quantity,price_per_meter,is_on_sale,discount_percentage,discounted_price_per_meter,deleted_at,is_active,is_available,is_manually_hidden')
    .eq('id', id)
    .maybeSingle()

  // خطأ شبكة/قاعدة بيانات ليس «غير موجود»: لا نُرجع 404 فيحذف جوجل صفحة سليمة بسبب عطل مؤقت
  if (error) return { status: 'unknown' }
  if (!data || !isFabricPubliclyVisible(data)) return { status: 'missing' }
  return { status: 'found', fabric: data as FabricSeoRow }
})

function fabricTitle(fabric: FabricSeoRow): string {
  return fabric.name?.trim() || (fabric.fabric_code ? `قماش ${fabric.fabric_code}` : 'قماش نسائي')
}

function fabricDescription(fabric: FabricSeoRow): string {
  const description = fabric.description?.trim()
  if (description) return description.slice(0, 160)
  return `${fabricTitle(fabric)} من متجر أقمشة ياسمين الشام في الخبر — أقمشة نسائية مختارة للتفصيل والخياطة مع توصيل داخل المملكة.`
}

function fabricImages(fabric: FabricSeoRow): string[] {
  const images = [...(fabric.images ?? []), fabric.image_url].filter((url): url is string => !!url)
  return [...new Set(images)].filter(url => !/\.(mp4|webm|mov)(\?|$)/i.test(url))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const lookup = await lookupFabric(id)

  if (lookup.status !== 'found') {
    return {
      title: 'القماش غير موجود - ياسمين الشام',
      robots: { index: false, follow: true },
    }
  }

  const { fabric } = lookup
  const title = `${fabricTitle(fabric)} | متجر أقمشة ياسمين الشام الخبر`
  const description = fabricDescription(fabric)
  const images = fabricImages(fabric)

  return {
    title,
    description,
    alternates: { canonical: `/fabrics/${fabric.id}/` },
    openGraph: {
      title,
      description,
      url: `/fabrics/${fabric.id}/`,
      images: images.length > 0 ? [{ url: images[0] }] : [{ url: `${SITE_URL}/yasmin.jpg` }],
    },
  }
}

export default async function FabricDetailPage({ params }: Props) {
  const { id } = await params
  const lookup = await lookupFabric(id)

  // استجابة 404 حقيقية بدل صفحة «القماش غير موجود» بحالة 200 التي كان جوجل يفهرسها
  if (lookup.status === 'missing') notFound()

  if (lookup.status === 'unknown') return <FabricDetailClient />

  const { fabric } = lookup
  const price = getFabricStorefrontPricing(getFabricNetPricePerMeter(fabric), fabric.stock_quantity).amount
  const images = fabricImages(fabric)
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: fabricTitle(fabric),
    description: fabricDescription(fabric),
    ...(images.length > 0 && { image: images.slice(0, 5) }),
    ...(fabric.fabric_code && { sku: fabric.fabric_code }),
    brand: { '@type': 'Brand', name: 'ياسمين الشام' },
    ...(price != null && {
      offers: {
        '@type': 'Offer',
        url: `${SITE_URL}/fabrics/${fabric.id}/`,
        priceCurrency: 'SAR',
        price,
        availability: (fabric.stock_quantity ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'ياسمين الشام' },
      },
    }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd).replace(/</g, '\\u003c') }}
      />
      <FabricDetailClient />
    </>
  )
}
