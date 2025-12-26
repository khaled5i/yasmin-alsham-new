/**
 * Fabric Service - خدمة متجر الأقمشة
 * يتعامل مع جميع عمليات الأقمشة باستخدام Supabase
 */

'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// ============================================================================
// أنواع البيانات (Types)
// ============================================================================

export interface Fabric {
  id: string
  name: string
  name_en?: string | null
  description: string
  description_en?: string | null
  category: string
  type?: string | null
  price_per_meter?: number | null // ✅ جعل السعر اختياري
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

export interface CreateFabricData {
  name: string
  name_en?: string
  description: string
  description_en?: string
  category: string
  type?: string
  price_per_meter?: number // ✅ جعل السعر اختياري
  original_price_per_meter?: number
  is_on_sale?: boolean
  discount_percentage?: number
  image_url: string
  thumbnail_image?: string
  images?: string[]
  available_colors?: string[]
  width_cm?: number
  is_available?: boolean
  is_active?: boolean
  is_featured?: boolean
  stock_quantity?: number
  min_order_meters?: number
  fabric_weight?: string
  fabric_texture?: string
  transparency_level?: string
  elasticity?: string
  care_instructions?: string[]
  washing_instructions?: string
  ironing_temperature?: string
  suitable_for?: string[]
  occasions?: string[]
  features?: string[]
  tags?: string[]
  country_of_origin?: string
}

export interface UpdateFabricData {
  name?: string
  name_en?: string
  description?: string
  description_en?: string
  category?: string
  type?: string
  price_per_meter?: number
  original_price_per_meter?: number
  is_on_sale?: boolean
  discount_percentage?: number
  image_url?: string
  thumbnail_image?: string
  images?: string[]
  available_colors?: string[]
  width_cm?: number
  is_available?: boolean
  is_active?: boolean
  is_featured?: boolean
  stock_quantity?: number
  min_order_meters?: number
  fabric_weight?: string
  fabric_texture?: string
  transparency_level?: string
  elasticity?: string
  care_instructions?: string[]
  washing_instructions?: string
  ironing_temperature?: string
  suitable_for?: string[]
  occasions?: string[]
  features?: string[]
  tags?: string[]
  country_of_origin?: string
}

// ============================================================================
// خدمة الأقمشة (Fabrics Service)
// ============================================================================

export const fabricService = {
  /**
   * جلب جميع الأقمشة مع فلاتر اختيارية
   */
  async getAll(filters?: {
    category?: string
    is_available?: boolean
    is_featured?: boolean
    is_on_sale?: boolean
    min_price?: number
    max_price?: number
  }): Promise<{ data: Fabric[] | null; error: string | null }> {
    try {
      console.log('🔍 جلب الأقمشة من Supabase...')
      console.log('📋 الفلاتر المطبقة:', filters)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      let query = supabase
        .from('fabrics')
        .select('*')
        .order('created_at', { ascending: false })

      // تطبيق الفلاتر
      if (filters?.category) {
        query = query.eq('category', filters.category)
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
        query = query.gte('price_per_meter', filters.min_price)
      }

      if (filters?.max_price !== undefined) {
        query = query.lte('price_per_meter', filters.max_price)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ خطأ في جلب الأقمشة:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log(`✅ تم جلب ${data?.length || 0} قماش من Supabase`)
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب الأقمشة:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب قماش واحد بواسطة ID
   */
  async getById(id: string): Promise<{ data: Fabric | null; error: string | null }> {
    try {
      console.log(`🔍 جلب القماش ${id} من Supabase...`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('fabrics')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('❌ خطأ في جلب القماش:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log('✅ تم جلب القماش بنجاح')

      // زيادة عدد المشاهدات
      if (data) {
        await this.incrementViews(id)
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب القماش:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * إنشاء قماش جديد (Admin فقط)
   */
  async create(fabricData: CreateFabricData): Promise<{ data: Fabric | null; error: string | null }> {
    try {
      console.log('➕ إنشاء قماش جديد في Supabase...')

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('fabrics')
        .insert([fabricData])
        .select()
        .single()

      if (error) {
        console.error('❌ خطأ في إنشاء القماش:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { data: null, error: error.message }
      }

      console.log('✅ تم إنشاء القماش بنجاح')
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في إنشاء القماش:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * تحديث قماش (Admin فقط)
   */
  async update(id: string, updates: UpdateFabricData): Promise<{ data: Fabric | null; error: string | null }> {
    try {
      console.log(`🔄 تحديث القماش ${id} في Supabase...`)
      console.log('📝 البيانات المرسلة:', updates)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      // تنظيف البيانات: إزالة القيم undefined
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      )

      console.log('🧹 البيانات بعد التنظيف:', cleanUpdates)

      // التحقق من وجود بيانات للتحديث
      if (Object.keys(cleanUpdates).length === 0) {
        console.warn('⚠️ لا توجد بيانات للتحديث')
        // جلب البيانات الحالية وإرجاعها
        const { data: currentData, error: fetchError } = await supabase
          .from('fabrics')
          .select('*')
          .eq('id', id)
          .single()

        if (fetchError || !currentData) {
          return { data: null, error: 'القماش غير موجود' }
        }

        return { data: currentData, error: null }
      }

      // تحديث القماش
      const { error: updateError } = await supabase
        .from('fabrics')
        .update(cleanUpdates)
        .eq('id', id)

      if (updateError) {
        console.error('❌ خطأ في تحديث القماش:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        })
        return { data: null, error: updateError.message }
      }

      console.log('✅ تم تحديث القماش، جاري جلب البيانات المحدثة...')

      // جلب البيانات المحدثة
      const { data, error: fetchError } = await supabase
        .from('fabrics')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        console.error('❌ خطأ في جلب البيانات المحدثة:', fetchError)
        return { data: null, error: fetchError.message }
      }

      if (!data) {
        console.error('❌ لم يتم العثور على القماش بعد التحديث')
        return { data: null, error: 'القماش غير موجود' }
      }

      console.log('✅ تم تحديث القماش بنجاح:', data)
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في تحديث القماش:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * حذف قماش (Admin فقط)
   */
  async delete(id: string): Promise<{ error: string | null }> {
    try {
      console.log(`🗑️ حذف القماش ${id} من Supabase...`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { error: 'Supabase not configured' }
      }

      const { error } = await supabase
        .from('fabrics')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('❌ خطأ في حذف القماش:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return { error: error.message }
      }

      console.log('✅ تم حذف القماش بنجاح')
      return { error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في حذف القماش:', error)
      return { error: error.message }
    }
  },

  /**
   * زيادة عدد المشاهدات
   */
  async incrementViews(id: string): Promise<void> {
    try {
      if (!isSupabaseConfigured()) return

      // استخدام الدالة المخصصة في قاعدة البيانات
      await supabase.rpc('increment_fabric_views', { fabric_id: id })
    } catch (error) {
      console.error('❌ خطأ في زيادة عدد المشاهدات:', error)
    }
  },

  /**
   * البحث في الأقمشة
   */
  async search(query: string): Promise<{ data: Fabric[] | null; error: string | null }> {
    try {
      console.log(`🔍 البحث عن: "${query}"`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('fabrics')
        .select('*')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`)
        .eq('is_available', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ خطأ في البحث:', error)
        return { data: null, error: error.message }
      }

      console.log(`✅ تم العثور على ${data?.length || 0} نتيجة`)
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في البحث:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب الأقمشة المميزة
   */
  async getFeatured(limit: number = 4): Promise<{ data: Fabric[] | null; error: string | null }> {
    try {
      console.log(`🔍 جلب ${limit} قماش مميز...`)

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('fabrics')
        .select('*')
        .eq('is_featured', true)
        .eq('is_available', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('❌ خطأ في جلب الأقمشة المميزة:', error)
        return { data: null, error: error.message }
      }

      console.log(`✅ تم جلب ${data?.length || 0} قماش مميز`)
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب الأقمشة المميزة:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب الفئات الفريدة
   */
  async getCategories(): Promise<{ data: string[] | null; error: string | null }> {
    try {
      console.log('🔍 جلب فئات الأقمشة...')

      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن')
        return { data: null, error: 'Supabase not configured' }
      }

      const { data, error } = await supabase
        .from('fabrics')
        .select('category')
        .eq('is_active', true)

      if (error) {
        console.error('❌ خطأ في جلب الفئات:', error)
        return { data: null, error: error.message }
      }

      // استخراج الفئات الفريدة
      const categories = [...new Set(data.map(item => item.category))]
      console.log(`✅ تم جلب ${categories.length} فئة`)
      return { data: categories, error: null }
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع في جلب الفئات:', error)
      return { data: null, error: error.message }
    }
  }
}

