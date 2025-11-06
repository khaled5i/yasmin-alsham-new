'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fabricService, Fabric as SupabaseFabric } from '@/lib/services/fabric-service'
import { isSupabaseConfigured } from '@/lib/supabase'

// ============================================
// تعريف الأنواع (Types)
// ============================================

// نوع القماش المستخدم في التطبيق
export interface Fabric {
  id: string
  name: string
  name_en?: string | null
  description: string
  description_en?: string | null
  category: string
  type?: string | null
  price_per_meter: number
  original_price_per_meter?: number | null
  is_on_sale: boolean
  discount_percentage: number
  image_url: string
  thumbnail_image?: string | null
  images: string[]
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
  created_at: string
  updated_at: string
}

// تحويل من نوع Supabase إلى نوع التطبيق
const convertSupabaseFabric = (fabric: SupabaseFabric): Fabric => ({
  ...fabric
})

// تعريف حالة الفلاتر
export interface FilterState {
  category: string[]
  priceRange: { min: number; max: number } | null
  colors: string[]
  searchQuery: string
  availability: 'all' | 'available'
}

// تعريف نوع الترتيب
export type SortOption = 'newest' | 'price-high' | 'price-low' | 'popular' | 'name'

// تعريف حالة المتجر
interface FabricStoreState {
  // الأقمشة من Supabase
  fabrics: Fabric[]
  loadFabrics: () => Promise<void>
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
  searchQuery: '',
  availability: 'all'
}

// ============================================
// إنشاء المتجر
// ============================================

export const useFabricStore = create<FabricStoreState>()(
  persist(
    (set, get) => ({
      // الأقمشة من Supabase
      fabrics: [],

      loadFabrics: async () => {
        // تحسين: تجنب إعادة التحميل إذا كانت الأقمشة محملة بالفعل
        const { fabrics } = get()
        if (fabrics.length > 0) {
          console.log('✅ الأقمشة محملة بالفعل من cache - تخطي التحميل')
          return
        }

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
        let filtered = fabrics.filter((fabric) => {
          // فلتر الفئة
          if (Array.isArray(filters.category) && filters.category.length > 0) {
            if (!filters.category.includes(fabric.category)) return false
          }

          // فلتر السعر
          if (filters.priceRange) {
            const { min, max } = filters.priceRange
            if (fabric.price_per_meter < min || fabric.price_per_meter > max) return false
          }

          // فلتر التوفر
          if (filters.availability === 'available') {
            if (!fabric.is_available) return false
          }

          // فلتر الألوان
          if (filters.colors.length > 0) {
            const hasMatchingColor = filters.colors.some(color =>
              fabric.available_colors.includes(color)
            )
            if (!hasMatchingColor) return false
          }

          // فلتر البحث
          if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase()
            const matchesName = fabric.name.toLowerCase().includes(query)
            const matchesDescription = fabric.description?.toLowerCase().includes(query)
            const matchesCategory = fabric.category.toLowerCase().includes(query)
            if (!matchesName && !matchesDescription && !matchesCategory) return false
          }

          return true
        })

        // تطبيق الترتيب
        filtered.sort((a, b) => {
          switch (sortBy) {
            case 'newest':
              return b.created_at.localeCompare(a.created_at)
            case 'price-high':
              return b.price_per_meter - a.price_per_meter
            case 'price-low':
              return a.price_per_meter - b.price_per_meter
            case 'popular':
              return b.orders_count - a.orders_count
            case 'name':
              return a.name.localeCompare(b.name, 'ar')
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
export const formatFabricPrice = (pricePerMeter: number): string => {
  return `${pricePerMeter.toLocaleString('en')} ريال/متر`
}

// دالة مساعدة للحصول على السعر النهائي (بعد التخفيض)
export const getFinalPrice = (fabric: Fabric): number => {
  if (fabric.is_on_sale && fabric.discount_percentage > 0) {
    return fabric.price_per_meter * (1 - fabric.discount_percentage / 100)
  }
  return fabric.price_per_meter
}

// دالة مساعدة للحصول على جميع الفئات الفريدة
export const getUniqueCategories = (fabrics: Fabric[]): string[] => {
  return [...new Set(fabrics.map(f => f.category))]
}

// دالة مساعدة للحصول على جميع الألوان الفريدة
export const getUniqueColors = (fabrics: Fabric[]): string[] => {
  const allColors = fabrics.flatMap(f => f.available_colors)
  return [...new Set(allColors)]
}

