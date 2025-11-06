/**
 * Store Service - خدمة المتجر (التصاميم الجاهزة)
 * يتعامل مع جميع عمليات المنتجات والفئات باستخدام Supabase
 */

'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

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
  price: number
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
  title: string
  title_en?: string
  description: string
  description_en?: string
  category_id?: string
  category_name?: string
  price: number
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
   */
  async getAll(filters?: {
    category_id?: string
    category_name?: string
    is_available?: boolean
    is_featured?: boolean
    is_on_sale?: boolean
    min_price?: number
    max_price?: number
  }): Promise<{ data: Product[] | null; error: string | null }> {
    try {
      console.log('🔍 جلب المنتجات من Supabase...')
      console.log('📋 الفلاتر المطبقة:', filters)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      let query = supabase
        .from('products')
        .select('*')
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

      console.log('🔄 تنفيذ الاستعلام...')
      const { data, error } = await query

      if (error) {
        console.error('❌ خطأ في جلب المنتجات:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })

        // رسائل خطأ واضحة بناءً على نوع الخطأ
        if (error.code === 'PGRST116') {
          console.error('💡 السبب المحتمل: سياسات RLS تمنع الوصول للمنتجات')
          console.error('💡 الحل: تحقق من سياسات RLS في Supabase Dashboard')
          return { data: null, error: 'لا يمكن الوصول للمنتجات. يرجى التحقق من إعدادات الأمان.' }
        }

        return { data: null, error: error.message }
      }

      console.log(`✅ تم جلب ${data?.length || 0} منتج بنجاح`)

      // عرض معلومات عن المنتجات المجلوبة
      if (data && data.length > 0) {
        console.log('📊 معلومات المنتجات:')
        console.log(`   - إجمالي المنتجات: ${data.length}`)
        console.log(`   - المنتجات المتاحة: ${data.filter((p: any) => p.is_available).length}`)
        console.log(`   - المنتجات المنشورة: ${data.filter((p: any) => p.published_at).length}`)
      } else {
        console.warn('⚠️ لم يتم العثور على أي منتجات')
        console.warn('💡 تحقق من:')
        console.warn('   1. وجود منتجات في قاعدة البيانات')
        console.warn('   2. is_available = true للمنتجات')
        console.warn('   3. سياسات RLS تسمح بالقراءة للمستخدمين غير المسجلين')
      }

      return { data: data as Product[], error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب المنتجات:', error)
      return { data: null, error: error.message || 'Unknown error' }
    }
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

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

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

