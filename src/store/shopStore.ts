'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { productService, Product as SupabaseProduct } from '@/lib/services/store-service'
import { isSupabaseConfigured } from '@/lib/supabase'

// تعريف نوع المنتج (متوافق مع Supabase)
export interface Product {
  id: string
  name: string // سيتم تعيينه من title
  price: number
  image: string // سيتم تعيينه من thumbnail_image أو أول صورة
  description?: string
  category?: string // سيتم تعيينه من category_name
  sizes?: string[]
  colors?: string[]
  // حقول إضافية من Supabase
  images?: string[]
  fabric?: string
  features?: string[]
  occasions?: string[]
  care_instructions?: string[]
  rating?: number
  reviews_count?: number
  is_available?: boolean
  is_featured?: boolean
  is_on_sale?: boolean
  sale_price?: number
  stock_quantity?: number
}



// تعريف نوع الفلاتر
export interface FilterState {
  category: string[]
  priceRange: [number, number] | null
  colors: string[]
  sizes: string[]
  searchQuery: string
}

// تعريف نوع الترتيب
export type SortOption = 'newest' | 'price-high' | 'price-low'

// تعريف حالة المتجر
interface ShopState {
  // المنتجات من Supabase
  products: Product[]
  loadProducts: () => Promise<void>
  getProductById: (id: string) => Product | undefined

  // الفلاتر والبحث
  filters: FilterState
  setFilters: (filters: Partial<FilterState>) => void
  resetFilters: () => void

  // الترتيب
  sortBy: SortOption
  setSortBy: (sort: SortOption) => void

  // المنتجات المفلترة والمرتبة
  getFilteredProducts: () => Product[]

  // حالة التحميل
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
}

// دالة مساعدة لتحويل منتج Supabase إلى Product
const convertSupabaseProduct = (sp: SupabaseProduct): Product => ({
  id: sp.id,
  name: sp.title,
  price: sp.is_on_sale && sp.sale_price ? sp.sale_price : sp.price,
  image: sp.thumbnail_image || sp.images[0] || '',
  description: sp.description,
  category: sp.category_name || undefined,
  sizes: sp.sizes,
  colors: sp.colors,
  images: sp.images,
  fabric: sp.fabric || undefined,
  features: sp.features,
  occasions: sp.occasions,
  care_instructions: sp.care_instructions,
  rating: sp.rating,
  reviews_count: sp.reviews_count,
  is_available: sp.is_available,
  is_featured: sp.is_featured,
  is_on_sale: sp.is_on_sale,
  sale_price: sp.sale_price || undefined
})

// إنشاء المتجر
export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      // المنتجات من Supabase
      products: [],

      loadProducts: async () => {
        // تحسين: تجنب إعادة التحميل إذا كانت المنتجات محملة بالفعل
        const { products } = get()
        if (products.length > 0) {
          console.log('✅ المنتجات محملة بالفعل من cache - تخطي التحميل')
          return
        }

        set({ isLoading: true, error: null })
        try {
          const { data, error } = await productService.getAll({
            is_available: true
          })

          if (error) {
            console.error('❌ خطأ في تحميل المنتجات:', error)
            set({ error, isLoading: false })
            return
          }

          if (data) {
            const products = data.map(convertSupabaseProduct)
            console.log(`✅ تم تحميل ${products.length} منتج من Supabase`)
            set({ products, isLoading: false })
          }
        } catch (error: any) {
          console.error('❌ خطأ غير متوقع في تحميل المنتجات:', error)
          set({ error: error.message, isLoading: false })
        }
      },

      getProductById: (id: string) => {
        const { products } = get()
        return products.find(p => p.id === id)
      },

      // ============================================
      // الفلاتر والبحث
      // ============================================

      filters: {
        category: [],
        priceRange: null,
        colors: [],
        sizes: [],
        searchQuery: ''
      },

      setFilters: (newFilters: Partial<FilterState>) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters }
        }))
      },

      resetFilters: () => {
        set({
          filters: {
            category: [],
            priceRange: null,
            colors: [],
            sizes: [],
            searchQuery: ''
          }
        })
      },

      // ============================================
      // الترتيب
      // ============================================

      sortBy: 'newest',

      setSortBy: (sort: SortOption) => {
        set({ sortBy: sort })
      },

      // ============================================
      // المنتجات المفلترة والمرتبة
      // ============================================

      getFilteredProducts: () => {
        const { products, filters, sortBy } = get()

        // تطبيق الفلاتر
        let filtered = products.filter(product => {
          // فلتر الفئة (دعم فئات متعددة) - مع فحص أمان
          const categories = Array.isArray(filters.category) ? filters.category : []
          if (categories.length > 0 && !categories.includes(product.category || '')) {
            return false
          }

          // فلتر السعر
          if (filters.priceRange) {
            const [min, max] = filters.priceRange
            if (product.price < min || product.price > max) {
              return false
            }
          }

          // فلتر الألوان
          if (filters.colors.length > 0) {
            const hasMatchingColor = product.colors?.some(color =>
              filters.colors.includes(color)
            )
            if (!hasMatchingColor) return false
          }

          // فلتر المقاسات
          if (filters.sizes.length > 0) {
            const hasMatchingSize = product.sizes?.some(size =>
              filters.sizes.includes(size)
            )
            if (!hasMatchingSize) return false
          }

          // فلتر البحث
          if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase()
            const matchesName = product.name.toLowerCase().includes(query)
            const matchesDescription = product.description?.toLowerCase().includes(query)
            if (!matchesName && !matchesDescription) return false
          }

          return true
        })

        // تطبيق الترتيب
        filtered.sort((a, b) => {
          switch (sortBy) {
            case 'newest':
              // افتراض أن المنتجات الأحدث لها id أكبر
              return b.id.localeCompare(a.id)
            case 'price-high':
              return b.price - a.price
            case 'price-low':
              return a.price - b.price
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
      name: 'yasmin-alsham-shop',
      partialize: (state) => ({
        // حفظ الفلاتر والترتيب في localStorage
        filters: state.filters,
        sortBy: state.sortBy
      })
    }
  )
)

// دالة مساعدة لتنسيق السعر
export const formatPrice = (price: number): string => {
  return `${price.toLocaleString('en')} ريال`
}
