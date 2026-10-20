import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import type { FabricCardFields } from '@/lib/fabric-card-display'

/**
 * أقمشة الصفحة الرئيسية: استعلام واحد لكل بناء للصفحة تتقاسمه أقسام المتجر الثلاثة
 * («وصل حديثاً»، «تسوقي حسب الخامة»، «من القماش إلى الفستان»). الكتالوج كله
 * بضع مئات من الصفوف بأعمدة قليلة، والصفحة تُعاد بناؤها كل 10 دقائق.
 */

export interface HomeFabricRow extends FabricCardFields {
  id: string
  tags: string[] | null
  occasions: string[] | null
  design_images: string[] | null
  created_at: string
  boosted_at: string | null
}

const COLUMNS =
  'id,name,fabric_code,category,available_colors,images,thumbnail_image,image_url,price_per_meter,is_on_sale,discount_percentage,stock_quantity,tags,occasions,design_images,created_at,boosted_at'

export const loadHomeFabrics = cache(async (): Promise<HomeFabricRow[]> => {
  // نفس شرط الظهور في المتجر وخريطة الموقع
  const { data, error } = await supabase
    .from('fabrics')
    .select(COLUMNS)
    .eq('is_active', true)
    .eq('is_available', true)
    .is('deleted_at', null)
    .or('is_manually_hidden.is.null,is_manually_hidden.eq.false')
  if (error) {
    console.error('home fabrics failed:', error.message)
    return []
  }
  return (data ?? []) as HomeFabricRow[]
})

/** ترتيب «الأحدث أولاً» في المتجر: زر «رفع» يقدّم القماش كأنه وصل الآن. */
export const fabricListingTime = (row: Pick<HomeFabricRow, 'created_at' | 'boosted_at'>) =>
  Math.max(Date.parse(row.created_at) || 0, row.boosted_at ? Date.parse(row.boosted_at) || 0 : 0)
