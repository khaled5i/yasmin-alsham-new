/**
 * Store Service - خدمة المتجر (التصاميم الجاهزة)
 * يتعامل مع جميع عمليات المنتجات والفئات باستخدام Supabase
 * مع تحسينات للأداء والاستقرار
 */

'use client'

import { supabase, isSupabaseConfigured, ensureValidSession } from '@/lib/supabase'

// ============================================================================
// ثوابت التكوين
// ============================================================================

const CONFIG = {
  // عدد المنتجات في كل صفحة
  PAGE_SIZE: 20,
  // الحد الأقصى لعدد المحاولات عند الفشل
  MAX_RETRIES: 3,
  // التأخير بين المحاولات (بالمللي ثانية)
  RETRY_DELAY: 1000,
  // الحقول المطلوبة للقائمة (بدون البيانات الضخمة)
  LIST_FIELDS: `
    id,
    title,
    title_en,
    description,
    category_id,
    category_name,
    price,
    is_available,
    stock_quantity,
    thumbnail_image,
    images,
    colors,
    sizes,
    fabric,
    features,
    occasions,
    care_instructions,
    rating,
    reviews_count,
    is_featured,
    is_new,
    is_on_sale,
    sale_price,
    created_at
  `.replace(/\s+/g, ''),
  // الحقول الكاملة للتفاصيل
  FULL_FIELDS: '*'
}

// ============================================================================
// دوال مساعدة
// ============================================================================

/**
 * دالة للتأخير
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * دالة لإعادة المحاولة عند الفشل
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = CONFIG.MAX_RETRIES,
  delayMs: number = CONFIG.RETRY_DELAY
): Promise<T> {
  let lastError: any
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      console.warn(`⚠️ المحاولة ${attempt}/${retries} فشلت:`, error.message)
      if (attempt < retries) {
        console.log(`⏳ إعادة المحاولة بعد ${delayMs}ms...`)
        await delay(delayMs)
        // زيادة التأخير مع كل محاولة (exponential backoff)
        delayMs *= 1.5
      }
    }
  }
  throw lastError
}

// ============================================================================
// أنواع البيانات (Types)
// ============================================================================

export interface Category {
  id: string
  name: string
  name_en?: string | null
  description?: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  title: string
  title_en?: string | null
  description: string
  description_en?: string | null
  category_id?: string | null
  category_name?: string | null
  price?: number | null // ✅ جعل السعر اختياري
  is_available: boolean
  stock_quantity: number
  images: string[]
  thumbnail_image?: string | null
  fabric?: string | null
  colors: string[]
  sizes: string[]
  features: string[]
  occasions: string[]
  care_instructions: string[]
  rating: number
  reviews_count: number
  slug?: string | null
  tags: string[]
  is_featured: boolean
  is_new: boolean
  is_on_sale: boolean
  sale_price?: number | null
  created_at: string
  updated_at: string
  published_at?: string | null
  metadata: Record<string, any>
}

export interface CreateProductData {
  title?: string
  title_en?: string
  description?: string
  description_en?: string
  category_id?: string
  category_name?: string
  price?: number // ✅ جعل السعر اختياري
  is_available?: boolean
  stock_quantity?: number
  images?: string[]
  thumbnail_image?: string
  fabric?: string
  colors?: string[]
  sizes?: string[]
  features?: string[]
  occasions?: string[]
  care_instructions?: string[]
  rating?: number
  reviews_count?: number
  slug?: string
  tags?: string[]
  is_featured?: boolean
  is_new?: boolean
  is_on_sale?: boolean
  sale_price?: number
  published_at?: string
  metadata?: Record<string, any>
}

export interface UpdateProductData {
  title?: string
  title_en?: string
  description?: string
  description_en?: string
  category_id?: string
  category_name?: string
  price?: number
  is_available?: boolean
  stock_quantity?: number
  images?: string[]
  thumbnail_image?: string
  fabric?: string
  colors?: string[]
  sizes?: string[]
  features?: string[]
  occasions?: string[]
  care_instructions?: string[]
  rating?: number
  reviews_count?: number
  slug?: string
  tags?: string[]
  is_featured?: boolean
  is_new?: boolean
  is_on_sale?: boolean
  sale_price?: number
  published_at?: string
  metadata?: Record<string, any>
}

// ============================================================================
// خدمة المنتجات (Products Service)
// ============================================================================

export const productService = {
  /**
   * جلب جميع المنتجات مع فلاتر اختيارية
   * محسّن للأداء مع retry logic وselect محدد
   */
  async getAll(filters?: {
    category_id?: string
    category_name?: string
    is_available?: boolean
    is_featured?: boolean
    is_on_sale?: boolean
    min_price?: number
    max_price?: number
    limit?: number
  }): Promise<{ data: Product[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase غير مُكوّن')
      return { data: null, error: 'Supabase not configured' }
    }

    console.log('🔍 جلب المنتجات من Supabase...')
    console.log('📋 الفلاتر المطبقة:', filters)

    try {
      const result = await withRetry(async () => {
        let query = supabase
          .from('products')
          .select(CONFIG.LIST_FIELDS)
          .order('created_at', { ascending: false })

        // تطبيق الفلاتر
        if (filters?.category_id) {
          query = query.eq('category_id', filters.category_id)
        }
        if (filters?.category_name) {
          query = query.eq('category_name', filters.category_name)
        }
        if (filters?.is_available !== undefined) {
          query = query.eq('is_available', filters.is_available)
        }
        if (filters?.is_featured !== undefined) {
          query = query.eq('is_featured', filters.is_featured)
        }
        if (filters?.is_on_sale !== undefined) {
          query = query.eq('is_on_sale', filters.is_on_sale)
        }
        if (filters?.min_price !== undefined) {
          query = query.gte('price', filters.min_price)
        }
        if (filters?.max_price !== undefined) {
          query = query.lte('price', filters.max_price)
        }

        // تحديد عدد النتائج (افتراضياً 50)
        const limit = filters?.limit || 50
        query = query.limit(limit)

        console.log('🔄 تنفيذ الاستعلام...')
        const { data, error } = await query

        if (error) {
          throw error
        }

        return data
      })

      console.log(`✅ تم جلب ${result?.length || 0} منتج بنجاح`)

      // عرض عينة من البيانات الخام من Supabase
      if (result && result.length > 0) {
        console.log('📦 عينة من البيانات الخام من Supabase:', {
          id: result[0].id,
          title: result[0].title,
          features: result[0].features,
          occasions: result[0].occasions,
          care_instructions: result[0].care_instructions
        })
      }

      // ملء الحقول الناقصة بقيم افتراضية
      const products = (result || []).map((p: any) => ({
        ...p,
        features: p.features || [],
        occasions: p.occasions || [],
        care_instructions: p.care_instructions || [],
        tags: p.tags || [],
        metadata: p.metadata || {},
        fabric: p.fabric || null,
        slug: p.slug || null,
        published_at: p.published_at || null
      })) as Product[]

      return { data: products, error: null }
    } catch (error: any) {
      console.error('❌ خطأ في جلب المنتجات:', error)

      // رسائل خطأ واضحة بناءً على نوع الخطأ
      if (error.code === 'PGRST116') {
        return { data: null, error: 'لا يمكن الوصول للمنتجات. يرجى التحقق من إعدادات الأمان.' }
      }

      if (error.message?.includes('JSON') || error.message?.includes('Unterminated')) {
        return { data: null, error: 'فشل تحميل البيانات. يرجى التحقق من اتصالك بالإنترنت.' }
      }

      return { data: null, error: error.message || 'حدث خطأ غير متوقع' }
    }
  },

  /**
   * جلب المنتجات المميزة (للصفحة الرئيسية)
   * يجلب فقط 4 منتجات مع الحقول الأساسية
   */
  async getFeatured(limit: number = 4): Promise<{ data: Product[] | null; error: string | null }> {
    return this.getAll({
      is_available: true,
      limit
    })
  },

  /**
   * جلب منتج واحد بواسطة ID
   */
  async getById(id: string): Promise<{ data: Product | null; error: string | null }> {
    try {
      console.log(`🔍 جلب المنتج ${id} من Supabase...`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('❌ خطأ في جلب المنتج:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log('✅ تم جلب المنتج بنجاح')
      return { data: data as Product, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب المنتج:', error)
      return { data: null, error: error.message || 'Unknown error' }
    }
  },

  /**
   * جلب منتج بواسطة Slug
   */
  async getBySlug(slug: string): Promise<{ data: Product | null; error: string | null }> {
    try {
      console.log(`🔍 جلب المنتج بواسطة slug: ${slug}`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('slug', slug)
        .single()

      if (error) {
        console.error('❌ خطأ في جلب المنتج:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log('✅ تم جلب المنتج بنجاح')
      return { data: data as Product, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب المنتج:', error)
      return { data: null, error: error.message || 'Unknown error' }
    }
  },

  /**
   * إنشاء منتج جديد (Admin فقط)
   */
  async create(productData: CreateProductData): Promise<{ data: Product | null; error: string | null }> {
    try {
      console.log('➕ إنشاء منتج جديد في Supabase...')
      console.log('📦 البيانات المرسلة للإنشاء:', JSON.stringify({
        features: productData.features,
        occasions: productData.occasions,
        care_instructions: productData.care_instructions
      }, null, 2))

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      await ensureValidSession()

      const { data, error } = await supabase
        .from('products')
        .insert([productData])
        .select()
        .single()

      if (error) {
        console.error('❌ خطأ في إنشاء المنتج:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log('✅ تم إنشاء المنتج بنجاح:', data.id)
      console.log('📦 البيانات المستلمة من Supabase:', JSON.stringify({
        features: data.features,
        occasions: data.occasions,
        care_instructions: data.care_instructions
      }, null, 2))
      return { data: data as Product, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في إنشاء المنتج:', error)
      return { data: null, error: error.message || 'Unknown error' }
    }
  },

  /**
   * تحديث منتج (Admin فقط)
   */
  async update(id: string, updates: UpdateProductData): Promise<{ data: Product | null; error: string | null }> {
    try {
      console.log(`🔄 تحديث المنتج ${id} في Supabase...`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      await ensureValidSession()

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('❌ خطأ في تحديث المنتج:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log('✅ تم تحديث المنتج بنجاح')
      console.log('📦 البيانات المستلمة من Supabase:', JSON.stringify({
        features: data.features,
        occasions: data.occasions,
        care_instructions: data.care_instructions
      }, null, 2))
      return { data: data as Product, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في تحديث المنتج:', error)
      return { data: null, error: error.message || 'Unknown error' }
    }
  },

  /**
   * حذف منتج (Admin فقط)
   */
  async delete(id: string): Promise<{ error: string | null }> {
    try {
      console.log(`🗑️ حذف المنتج ${id} من Supabase...`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { error: 'Supabase not configured' }
      }

      await ensureValidSession()

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('❌ خطأ في حذف المنتج:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { error: error.message }
      }

      console.log('✅ تم حذف المنتج بنجاح')
      return { error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في حذف المنتج:', error)
      return { error: error.message || 'Unknown error' }
    }
  }
}

// ============================================================================
// خدمة الفئات (Categories Service)
// ============================================================================

export const categoryService = {
  /**
   * جلب جميع الفئات
   */
  async getAll(activeOnly: boolean = true): Promise<{ data: Category[] | null; error: string | null }> {
    try {
      console.log('🔍 جلب الفئات من Supabase...')

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      let query = supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true })

      if (activeOnly) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ خطأ في جلب الفئات:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log(`✅ تم جلب ${data?.length || 0} فئة`)
      return { data: data as Category[], error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب الفئات:', error)
      return { data: null, error: error.message || 'Unknown error' }
    }
  }
}

