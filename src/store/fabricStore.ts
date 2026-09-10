'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fabricService, Fabric as SupabaseFabric } from '@/lib/services/fabric-service'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { matchesFabricSearch } from '@/lib/fabric-search'
import {
  getFabricDisplayPricing,
  hasFabricDisplayPrice,
  type FabricPricingUnit,
} from '@/lib/fabric-display-pricing'

// ============================================
// تعريف الأنواع (Types)
// ============================================

// نوع القماش المستخدم في التطبيق
export interface Fabric {
  id: string
  name: string | null
  name_en?: string | null
  description: string | null
  description_en?: string | null
  category: string
  categories?: string[]
  type?: string | null
  price_per_meter: number | null
  original_price_per_meter?: number | null
  is_on_sale: boolean
  discount_percentage: number
  image_url: string
  thumbnail_image?: string | null
  images: string[]
  /** صور تصاميم الفساتين المنفَّذة من هذا القماش (منفصلة عن images) */
  design_images: string[]
  available_colors: string[]
  width_cm?: number | null
  is_available: boolean
  is_active: boolean
  is_featured: boolean
  stock_quantity: number
  min_order_meters: number
  fabric_weight?: string | null
  fabric_texture?: string | null
  transparency_level?: string | null
  elasticity?: string | null
  care_instructions: string[]
  washing_instructions?: string | null
  ironing_temperature?: string | null
  suitable_for: string[]
  occasions: string[]
  features: string[]
  tags: string[]
  views_count: number
  favorites_count: number
  orders_count: number
  rating: number
  reviews_count: number
  country_of_origin?: string | null
  fabric_code?: string | null
  inventory_item_id?: string | null
  inventory_color_id?: string | null
  is_manually_hidden?: boolean
  show_stock_quantity?: boolean
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

// تحويل من نوع Supabase إلى نوع التطبيق
const convertSupabaseFabric = (fabric: SupabaseFabric): Fabric => ({
  ...fabric,
  categories: fabric.categories?.length ? fabric.categories : [fabric.category],
  design_images: fabric.design_images ?? [],
  price_per_meter: fabric.price_per_meter ?? null
})

/** هل يملك القماش صور تصاميم فساتين جاهزة للعرض؟ */
export const hasFabricDesignImages = (fabric: Pick<Fabric, 'design_images'>): boolean =>
  Array.isArray(fabric.design_images) && fabric.design_images.length > 0

// تعريف حالة الفلاتر
export interface FilterState {
  category: string[]
  priceRange: { min: number; max: number } | null
  colors: string[]
  searchQuery: string
}

// تعريف نوع الترتيب
export type SortOption = 'newest' | 'price-high' | 'price-low' | 'popular' | 'name'

// تعريف حالة المتجر
interface FabricStoreState {
  // الأقمشة من Supabase
  fabrics: Fabric[]
  loadFabrics: (forceReload?: boolean) => Promise<void>
  getFabricById: (id: string) => Fabric | undefined

  // الفلاتر والبحث
  filters: FilterState
  setFilters: (filters: Partial<FilterState>) => void
  resetFilters: () => void

  // الترتيب
  sortBy: SortOption
  setSortBy: (sort: SortOption) => void

  // الأقمشة المفلترة والمرتبة
  getFilteredFabrics: () => Fabric[]

  // حالة التحميل
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
}

// القيم الافتراضية للفلاتر
const defaultFilters: FilterState = {
  category: [],
  priceRange: null,
  colors: [],
  searchQuery: ''
}

// ============================================
// إنشاء المتجر
// ============================================

export const useFabricStore = create<FabricStoreState>()(
  persist(
    (set, get) => ({
      // الأقمشة من Supabase
      fabrics: [],

      loadFabrics: async (forceReload = false) => {
        // تحسين: تجنب إعادة التحميل إذا كانت الأقمشة محملة بالفعل
        const { fabrics } = get()
        if (fabrics.length > 0 && !forceReload) {
          console.log('✅ الأقمشة محملة بالفعل من cache - تخطي التحميل')
          return
        }

        console.log('🔄 تحميل الأقمشة من Supabase...')
        set({ isLoading: true, error: null })
        try {
          const { data, error } = await fabricService.getAll({
            is_available: true
          })

          if (error) {
            console.error('❌ خطأ في تحميل الأقمشة:', error)
            set({ error, isLoading: false })
            return
          }

          if (data) {
            const fabrics = data.map(convertSupabaseFabric)
            console.log(`✅ تم تحميل ${fabrics.length} قماش من Supabase`)
            set({ fabrics, isLoading: false })
          }
        } catch (error: any) {
          console.error('❌ خطأ غير متوقع في تحميل الأقمشة:', error)
          set({ error: error.message, isLoading: false })
        }
      },

      getFabricById: (id: string) => {
        const { fabrics } = get()
        return fabrics.find(f => f.id === id)
      },

      // ============================================
      // الفلاتر والبحث
      // ============================================

      filters: defaultFilters,

      setFilters: (newFilters: Partial<FilterState>) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters }
        }))
      },

      resetFilters: () => {
        set({ filters: defaultFilters })
      },

      // ============================================
      // الترتيب
      // ============================================

      sortBy: 'newest',

      setSortBy: (sort: SortOption) => {
        set({ sortBy: sort })
      },

      // ============================================
      // الأقمشة المفلترة والمرتبة
      // ============================================

      getFilteredFabrics: () => {
        const { fabrics, filters, sortBy } = get()

        // تطبيق الفلاتر
        const filtered = fabrics.filter((fabric) => {
          // فلتر الفئة
          if (Array.isArray(filters.category) && filters.category.length > 0) {
            const fabricCategories = fabric.categories?.length ? fabric.categories : [fabric.category]
            if (!filters.category.some(category => fabricCategories.includes(category))) return false
          }

          // فلتر السعر
          if (filters.priceRange) {
            const { min, max } = filters.priceRange
            const displayedPrice = getFabricDisplayPricing(
              fabric.price_per_meter,
              fabric.stock_quantity
            ).amount
            if (displayedPrice == null || displayedPrice < min || displayedPrice > max) return false
          }

          // فلتر الألوان
          if (filters.colors.length > 0) {
            const hasMatchingColor = filters.colors.some(color =>
              fabric.available_colors.includes(color)
            )
            if (!hasMatchingColor) return false
          }

          // فلتر البحث: الاسم، الرقم، النوع/الفئة، اللون، والوصف — مع تطبيع الحروف العربية
          if (filters.searchQuery) {
            const searchable = {
              ...fabric,
              categories: fabric.categories?.length ? fabric.categories : [fabric.category]
            }
            if (!matchesFabricSearch(searchable, filters.searchQuery, { includeDescription: true })) return false
          }

          return true
        })

        // تطبيق الترتيب
        filtered.sort((a, b) => {
          // الأولوية دائماً للأقمشة التي لها سعر، والأقمشة بدون سعر في نهاية المتجر
          const aHasPrice = hasFabricDisplayPrice(a.price_per_meter, a.stock_quantity)
          const bHasPrice = hasFabricDisplayPrice(b.price_per_meter, b.stock_quantity)
          if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1

          switch (sortBy) {
            case 'newest':
              return b.created_at.localeCompare(a.created_at)
            case 'price-high':
              return (
                getFabricDisplayPricing(b.price_per_meter, b.stock_quantity).amount ?? 0
              ) - (
                getFabricDisplayPricing(a.price_per_meter, a.stock_quantity).amount ?? 0
              )
            case 'price-low':
              return (
                getFabricDisplayPricing(a.price_per_meter, a.stock_quantity).amount ?? 0
              ) - (
                getFabricDisplayPricing(b.price_per_meter, b.stock_quantity).amount ?? 0
              )
            case 'popular':
              return b.orders_count - a.orders_count
            case 'name':
              return (a.name || a.fabric_code || '').localeCompare(b.name || b.fabric_code || '', 'ar')
            default:
              return 0
          }
        })

        return filtered
      },

      // حالة التحميل
      isLoading: false,
      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      error: null,
      setError: (error: string | null) => {
        set({ error })
      }
    }),
    {
      name: 'yasmin-alsham-fabric-shop',
      partialize: (state) => ({
        // حفظ الفلاتر والترتيب في localStorage فقط
        filters: state.filters,
        sortBy: state.sortBy
        // لا نحفظ الأقمشة - يتم تحميلها من Supabase دائماً
      })
    }
  )
)

// دالة مساعدة لتنسيق السعر
export const formatFabricPrice = (
  price: number | null | undefined,
  unit: FabricPricingUnit = 'meter'
): string => {
  if (price == null) return 'السعر عند الطلب'
  return `${formatFabricNumber(price)} ريال/${unit === 'piece' ? 'القطعة' : 'متر'}`
}

// دالة مساعدة للحصول على السعر النهائي (بعد التخفيض)
export const getFinalPrice = (fabric: Fabric): number | null => {
  if (fabric.price_per_meter == null) return null
  if (fabric.is_on_sale && fabric.discount_percentage > 0) {
    return fabric.price_per_meter * (1 - fabric.discount_percentage / 100)
  }
  return fabric.price_per_meter
}

// دالة مساعدة للحصول على جميع الفئات الفريدة
export const getUniqueCategories = (fabrics: Fabric[]): string[] => {
  return [...new Set(fabrics.flatMap(fabric =>
    fabric.categories?.length ? fabric.categories : [fabric.category]
  ))]
}

// دالة مساعدة للحصول على جميع الألوان الفريدة
export const getUniqueColors = (fabrics: Fabric[]): string[] => {
  const allColors = fabrics.flatMap(f => f.available_colors)
  return [...new Set(allColors)]
}
