'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { productService, Product as SupabaseProduct } from '@/lib/services/store-service'
import { isSupabaseConfigured } from '@/lib/supabase'

// ============================================
// ثوابت التكوين
// ============================================

const CACHE_CONFIG = {
  // مدة صلاحية الكاش (5 دقائق)
  TTL: 5 * 60 * 1000,
  // الحد الأقصى للمحاولات
  MAX_RETRIES: 2,
  // عدد المنتجات للصفحة الرئيسية
  HOME_PAGE_LIMIT: 8,
  // عدد المنتجات لصفحة المتجر
  STORE_PAGE_LIMIT: 50
}

// ============================================
// تعريف الأنواع
// ============================================

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
  lastFetchTime: number | null
  loadProducts: (forceReload?: boolean) => Promise<void>
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
  retryCount: number
}

// دالة مساعدة لتحويل منتج Supabase إلى Product
const convertSupabaseProduct = (sp: SupabaseProduct): Product => {
  // التعامل بأمان مع الصور
  const images = Array.isArray(sp.images) ? sp.images : []
  const thumbnailImage = sp.thumbnail_image || images[0] || ''

  return {
    id: sp.id,
    name: sp.title || 'منتج بدون اسم',
    price: sp.is_on_sale && sp.sale_price ? sp.sale_price : sp.price,
    image: thumbnailImage,
    description: sp.description || '',
    category: sp.category_name || undefined,
    sizes: Array.isArray(sp.sizes) ? sp.sizes : [],
    colors: Array.isArray(sp.colors) ? sp.colors : [],
    images: images,
    fabric: sp.fabric || undefined,
    features: Array.isArray(sp.features) ? sp.features : [],
    occasions: Array.isArray(sp.occasions) ? sp.occasions : [],
    care_instructions: Array.isArray(sp.care_instructions) ? sp.care_instructions : [],
    rating: sp.rating || 0,
    reviews_count: sp.reviews_count || 0,
    is_available: sp.is_available ?? true,
    is_featured: sp.is_featured ?? false,
    is_on_sale: sp.is_on_sale ?? false,
    sale_price: sp.sale_price || undefined
  }
}

// إنشاء المتجر
export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      // المنتجات من Supabase
      products: [],
      lastFetchTime: null,
      retryCount: 0,

      loadProducts: async (forceReload = false) => {
        const { products, lastFetchTime, isLoading } = get()

        // منع الطلبات المتزامنة
        if (isLoading) {
          console.log('⏳ التحميل جاري بالفعل - تخطي')
          return
        }

        // التحقق من صلاحية الكاش
        const now = Date.now()
        const cacheValid = lastFetchTime && (now - lastFetchTime) < CACHE_CONFIG.TTL

        if (products.length > 0 && cacheValid && !forceReload) {
          console.log('✅ المنتجات محملة من cache صالح - تخطي التحميل')
          return
        }

        set({ isLoading: true, error: null })

        try {
          console.log('🔄 تحميل المنتجات من Supabase...')

          const { data, error } = await productService.getAll({
            is_available: true,
            limit: CACHE_CONFIG.STORE_PAGE_LIMIT
          })

          if (error) {
            console.error('❌ خطأ في تحميل المنتجات:', error)
            set({
              error,
              isLoading: false,
              retryCount: get().retryCount + 1
            })
            return
          }

          if (data) {
            const products = data.map(convertSupabaseProduct)
            console.log(`✅ تم تحميل ${products.length} منتج من Supabase`)
            set({
              products,
              isLoading: false,
              lastFetchTime: now,
              retryCount: 0,
              error: null
            })
          } else {
            set({
              products: [],
              isLoading: false,
              lastFetchTime: now,
              error: null
            })
          }
        } catch (error: any) {
          console.error('❌ خطأ غير متوقع في تحميل المنتجات:', error)
          set({
            error: error.message || 'حدث خطأ في تحميل المنتجات',
            isLoading: false,
            retryCount: get().retryCount + 1
          })
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
      },

      retryCount: 0
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
