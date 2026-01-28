/**
 * خدمة طلبات التعديلات - Alteration Service
 * تتعامل مع جميع عمليات طلبات التعديلات في Supabase
 */

import { supabase, isSupabaseConfigured } from '../supabase'

// ============================================================================
// أنواع البيانات (Types)
// ============================================================================

export interface Alteration {
  id: string
  alteration_number: string
  original_order_id?: string | null
  worker_id?: string | null
  client_name: string
  client_phone: string
  client_email?: string | null
  description?: string | null
  price: number
  paid_amount: number
  remaining_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check' | null
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  alteration_due_date: string
  delivery_date?: string | null
  order_received_date?: string
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  completed_images?: string[]
  voice_notes?: string[]
  voice_transcriptions?: any[]
  saved_design_comments?: any[]
  image_annotations?: any[]
  image_drawings?: any[]
  custom_design_image?: string | null
  created_at: string
  updated_at: string
}

export interface CreateAlterationData {
  alteration_number?: string
  original_order_id?: string | null
  worker_id?: string
  client_name: string
  client_phone: string
  client_email?: string
  description?: string
  price: number
  paid_amount?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  alteration_due_date: string
  delivery_date?: string
  order_received_date?: string
  notes?: string
  admin_notes?: string
  images?: string[]
  voice_notes?: string[]
  voice_transcriptions?: Array<{
    id: string
    data: string
    timestamp: number
    duration?: number
    transcription?: string
    translatedText?: string
    translationLanguage?: string
  }>
  image_annotations?: Array<{
    id: string
    x: number
    y: number
    boxX?: number
    boxY?: number
    audioData?: string
    transcription?: string
    duration?: number
    timestamp: number
  }>
  image_drawings?: Array<{
    id: string
    points: Array<{ x: number; y: number }>
    color: string
    strokeWidth: number
    brushType?: string
    isEraser?: boolean
    timestamp: number
  }>
  custom_design_image?: string
  saved_design_comments?: Array<{
    id: string
    timestamp: number
    annotations: Array<{
      id: string
      x: number
      y: number
      boxX?: number
      boxY?: number
      audioData?: string
      transcription?: string
      duration?: number
      timestamp: number
    }>
    drawings: Array<{
      id: string
      points: Array<{ x: number; y: number }>
      color: string
      strokeWidth: number
      brushType?: string
      isEraser?: boolean
      timestamp: number
    }>
    image: string | null
    title?: string
  }>
}

export interface UpdateAlterationData {
  alteration_number?: string
  worker_id?: string | null
  client_name?: string
  client_phone?: string
  client_email?: string | null
  description?: string | null
  price?: number
  paid_amount?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  order_received_date?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  alteration_due_date?: string
  delivery_date?: string | null
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  voice_notes?: string[]
  completed_images?: string[]
}

// ============================================================================
// خدمة طلبات التعديلات
// ============================================================================

export const alterationService = {
  /**
   * إنشاء طلب تعديل جديد (Admin فقط)
   */
  async create(alterationData: CreateAlterationData): Promise<{ data: Alteration | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('🔧 Creating alteration:', {
        ...alterationData,
        custom_design_image: alterationData.custom_design_image
          ? `[base64 image: ${Math.round(alterationData.custom_design_image.length / 1024)}KB]`
          : null,
        voice_notes: alterationData.voice_notes?.length || 0,
        voice_transcriptions: alterationData.voice_transcriptions?.length || 0,
        image_annotations: alterationData.image_annotations?.length || 0,
        image_drawings: alterationData.image_drawings?.length || 0
      })

      // التحقق من حجم صورة التصميم المخصصة (الحد الأقصى 5MB)
      if (alterationData.custom_design_image) {
        const imageSizeKB = alterationData.custom_design_image.length / 1024
        console.log(`📸 Custom design image size: ${Math.round(imageSizeKB)}KB`)
        if (imageSizeKB > 5 * 1024) {
          return {
            data: null,
            error: `حجم صورة التصميم كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى المسموح به هو 5MB`
          }
        }
      }

      // تحضير البيانات للإدخال
      const insertData: any = {
        original_order_id: alterationData.original_order_id || null,
        worker_id: alterationData.worker_id || null,
        client_name: alterationData.client_name,
        client_phone: alterationData.client_phone,
        client_email: alterationData.client_email || null,
        description: alterationData.description || null,
        price: alterationData.price,
        paid_amount: alterationData.paid_amount || 0,
        payment_status: alterationData.payment_status || 'unpaid',
        payment_method: alterationData.payment_method || 'cash',
        order_received_date: alterationData.order_received_date || new Date().toISOString().split('T')[0],
        status: alterationData.status || 'pending',
        alteration_due_date: alterationData.alteration_due_date,
        delivery_date: alterationData.delivery_date || null,
        notes: alterationData.notes || null,
        admin_notes: alterationData.admin_notes || null,
        images: alterationData.images || [],
        voice_notes: alterationData.voice_notes || [],
        voice_transcriptions: alterationData.voice_transcriptions || [],
        saved_design_comments: alterationData.saved_design_comments || [],
        image_annotations: alterationData.image_annotations || [],
        image_drawings: alterationData.image_drawings || [],
        custom_design_image: alterationData.custom_design_image || null
      }

      // إضافة alteration_number فقط إذا تم توفيره (وإلا سيتم توليده تلقائياً بواسطة trigger)
      if (alterationData.alteration_number && alterationData.alteration_number.trim() !== '') {
        insertData.alteration_number = alterationData.alteration_number.trim()
      }

      console.log('📤 Sending to Supabase:', {
        ...insertData,
        custom_design_image: insertData.custom_design_image
          ? `[base64: ${Math.round(insertData.custom_design_image.length / 1024)}KB]`
          : null,
        voice_notes: `[${insertData.voice_notes?.length || 0} notes]`,
        voice_transcriptions: `[${insertData.voice_transcriptions?.length || 0} transcriptions]`
      })

      const { data, error } = await supabase
        .from('alterations')
        .insert([insertData])
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating alteration:', error)
        return { data: null, error: error.message }
      }

      console.log('✅ Alteration created successfully:', data.alteration_number)
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in create alteration:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * الحصول على جميع طلبات التعديلات
   */
  async getAll(): Promise<{ data: Alteration[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alterations')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching alterations:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in getAll alterations:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * الحصول على طلب تعديل واحد بواسطة ID
   */
  async getById(id: string): Promise<{ data: Alteration | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alterations')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('❌ Error fetching alteration:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in getById alteration:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * تحديث طلب تعديل
   */
  async update(id: string, updateData: UpdateAlterationData): Promise<{ data: Alteration | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('🔧 Updating alteration:', id, updateData)

      const { data, error } = await supabase
        .from('alterations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('❌ Error updating alteration:', error)
        return { data: null, error: error.message }
      }

      console.log('✅ Alteration updated successfully')
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in update alteration:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * حذف طلب تعديل (Admin فقط)
   */
  async delete(id: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { error: 'Supabase is not configured.' }
    }

    try {
      console.log('🗑️ Deleting alteration:', id)

      const { error } = await supabase
        .from('alterations')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('❌ Error deleting alteration:', error)
        return { error: error.message }
      }

      console.log('✅ Alteration deleted successfully')
      return { error: null }
    } catch (error: any) {
      console.error('❌ Exception in delete alteration:', error)
      return { error: error.message }
    }
  },

  /**
   * البحث عن طلبات التعديلات (بالاسم، الهاتف، أو رقم الطلب)
   */
  async search(searchTerm: string): Promise<{ data: Alteration[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alterations')
        .select('*')
        .or(`client_name.ilike.%${searchTerm}%,client_phone.ilike.%${searchTerm}%,alteration_number.ilike.%${searchTerm}%`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error searching alterations:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in search alterations:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * الحصول على طلبات التعديلات حسب الحالة
   */
  async getByStatus(status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'): Promise<{ data: Alteration[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alterations')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching alterations by status:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in getByStatus alterations:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * الحصول على طلبات التعديلات المرتبطة بطلب أصلي
   */
  async getByOriginalOrderId(orderId: string): Promise<{ data: Alteration[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alterations')
        .select('*')
        .eq('original_order_id', orderId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching alterations by original order:', error)
        return { data: null, error: error.message }
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in getByOriginalOrderId alterations:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب إحصائيات التعديلات حسب التاريخ
   * يُستخدم لعرض عدد التعديلات في التقويم
   */
  async getAlterationStatsByDate(startDate: string, endDate: string): Promise<{ data: Record<string, number> | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('📊 Fetching alteration stats by date:', { startDate, endDate })

      // جلب جميع التعديلات في النطاق الزمني المحدد
      const { data, error } = await supabase
        .from('alterations')
        .select('alteration_due_date')
        .gte('alteration_due_date', startDate)
        .lte('alteration_due_date', endDate)
        .not('status', 'eq', 'cancelled') // استبعاد التعديلات الملغاة

      if (error) {
        console.error('❌ Supabase error fetching alteration stats:', error)
        return { data: null, error: error.message }
      }

      // حساب عدد التعديلات لكل تاريخ
      const stats: Record<string, number> = {}
      data?.forEach((alteration) => {
        const date = alteration.alteration_due_date
        stats[date] = (stats[date] || 0) + 1
      })

      console.log('✅ Alteration stats fetched successfully:', stats)
      return { data: stats, error: null }
    } catch (error: any) {
      console.error('❌ Error in getAlterationStatsByDate:', error)
      return { data: null, error: error.message || 'خطأ في جلب إحصائيات التعديلات' }
    }
  }
}

export default alterationService

