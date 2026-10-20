/**
 * ما تعرضه بطاقة القماش خارج صفحة المتجر (الرئيسية، المجموعات، الأقمشة المشابهة):
 * العنوان والصورة والسعر من مصدر واحد. وحدة نقية تعمل على الخادم والمتصفح.
 */
import { getFabricNetPricePerMeter, getFabricStorefrontPricing, type FabricDiscountFields } from '@/lib/fabric-display-pricing'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { getSupabaseImageUrl, isVideoFile } from '@/lib/utils/media'

export interface FabricCardFields extends FabricDiscountFields {
  name: string | null
  fabric_code?: string | null
  category?: string | null
  available_colors?: string[] | null
  images?: string[] | null
  thumbnail_image?: string | null
  image_url?: string | null
  stock_quantity?: number | null
}

/** الاسم بلا اللون (اللون بعد « – » ويظهر في الصورة)، وإلا الفئة واللون. */
export function fabricCardTitle(fabric: FabricCardFields): string {
  const name = fabric.name?.trim()
  if (name) return name.split(' – ')[0]
  return [fabric.category || 'قماش', fabric.available_colors?.[0]].filter(Boolean).join(' · ')
}

/** أول صورة ليست فيديو، محوّلة لحجم البطاقة. */
export function fabricCardImage(fabric: FabricCardFields, width = 480, height = 640): string | null {
  const original = [...(fabric.images ?? []), fabric.thumbnail_image, fabric.image_url]
    .find((url): url is string => !!url && !isVideoFile(url))
  return original ? getSupabaseImageUrl(original, { width, height, quality: 78 }) : null
}

/** «172.5 ريال / متر» شاملاً الضريبة كما في المتجر، أو null للسعر عند الطلب. */
export function fabricCardPrice(fabric: FabricCardFields): string | null {
  const pricing = getFabricStorefrontPricing(getFabricNetPricePerMeter(fabric), fabric.stock_quantity ?? 0)
  if (pricing.amount == null || pricing.amount <= 0) return null
  return `${formatFabricNumber(pricing.amount)} ريال / ${pricing.unit === 'piece' ? 'القطعة' : 'متر'}`
}
