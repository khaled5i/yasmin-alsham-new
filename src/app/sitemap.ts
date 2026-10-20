import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { SERVICE_PAGES } from './services/service-pages'
import { FABRIC_COLLECTIONS, fabricCollectionPath } from '@/lib/fabric-collections'

const SITE_URL = 'https://www.yasmin-alsham.fashion'

// تُعاد كل ساعة حتى يدخل القماش الجديد ويخرج المخفي دون نشر جديد
export const revalidate = 3600

const STATIC_PAGES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/fabrics', changeFrequency: 'daily', priority: 0.9 },
  { path: '/services', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/location', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/track-order', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/shipping-policy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/return-policy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/sales-terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.2 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    ...STATIC_PAGES.map(page => ({
      url: `${SITE_URL}${page.path}/`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...FABRIC_COLLECTIONS.map(collection => ({
      url: `${SITE_URL}${fabricCollectionPath(collection.slug)}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...SERVICE_PAGES.map(page => ({
      url: `${SITE_URL}/services/${page.slug}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]

  // نفس شرط الظهور في واجهة المتجر (isFabricPubliclyVisible): لا يدخل الخريطة قماش يعرض «غير موجود»
  const { data, error } = await supabase
    .from('fabrics')
    .select('id,updated_at')
    .eq('is_active', true)
    .eq('is_available', true)
    .is('deleted_at', null)
    .or('is_manually_hidden.is.null,is_manually_hidden.eq.false')

  if (error || !data) return staticEntries

  const fabricEntries: MetadataRoute.Sitemap = data.map(fabric => ({
    url: `${SITE_URL}/fabrics/${fabric.id}/`,
    lastModified: fabric.updated_at ? new Date(fabric.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticEntries, ...fabricEntries]
}
