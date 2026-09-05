/**
 * خدمة طلبات التعديلات - Alteration Service
 * تتعامل مع جميع عمليات طلبات التعديلات في Supabase
 */

import { extractDateKey } from '../date-utils'
import { supabase, isSupabaseConfigured, ensureValidSession } from '../supabase'

const ALTERATION_LIST_COLUMNS = [
  'id',
  'alteration_number',
  'alteration_type',
  'original_order_id',
  'worker_id',
  'client_name',
  'client_phone',
  'description',
  'price',
  'paid_amount',
  'remaining_amount',
  'payment_status',
  'payment_method',
  'status',
  'alteration_due_date',
  'delivery_date',
  'order_received_date',
  'notes',
  'admin_notes',
  'created_at',
  'updated_at'
].join(',')

const DEFAULT_PAGE_SIZE = 30

// ============================================================================
// أنواع البيانات (Types)
// ============================================================================

export type AlterationErrorType =
  | 'tailor_error'
  | 'cutter_error'
  | 'measurement_error'
  | 'customer_error'
  | 'reception_error'
  | 'other_error'

export type AlterationType = 'first_proof' | 'second_proof' | 'after_delivery'

export const isAlterationType = (value: string | null | undefined): value is AlterationType => (
  value === 'first_proof' || value === 'second_proof' || value === 'after_delivery'
)

export interface AlterationStoredTranslation {
  target_language: 'hi'
  source_text: string
  translated_text: string
  updated_at: string
}

export interface OrderAlterationSummary {
  id: string
  alteration_number: string
  alteration_type: AlterationType
  error_type?: AlterationErrorType | null
  description?: string | null
  notes?: string | null
  alteration_photos?: string[] | null
  voice_transcriptions?: Array<{
    transcription?: string | null
  }> | null
  alteration_translations?: AlterationStoredTranslation[] | null
  status: Alteration['status']
  created_at: string
}

export interface Alteration {
  id: string
  alteration_number: string
  alteration_type: AlterationType
  original_order_id?: string | null
  worker_id?: string | null
  client_name: string
  client_phone: string
  client_email?: string | null
  description?: string | null
  error_type?: AlterationErrorType | null
  error_notes?: string | null
  price: number
  paid_amount: number
  remaining_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check' | null
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  alteration_due_date?: string | null
  delivery_date?: string | null
  order_received_date?: string
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  alteration_photos?: string[]
  completed_images?: string[]
  voice_notes?: string[]
  voice_transcriptions?: any[]
  error_voice_transcriptions?: any[]
  saved_design_comments?: any[]
  image_annotations?: any[]
  image_drawings?: any[]
  custom_design_image?: string | null
  created_at: string
  updated_at: string
}

export interface CreateAlterationData {
  alteration_number?: string
  alteration_type?: AlterationType
  original_order_id?: string | null
  worker_id?: string
  client_name: string
  client_phone: string
  client_email?: string
  description?: string
  error_type?: AlterationErrorType
  error_notes?: string
  price: number
  paid_amount?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  alteration_due_date?: string | null
  delivery_date?: string
  order_received_date?: string
  notes?: string
  admin_notes?: string
  images?: string[]
  alteration_photos?: string[]
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
  error_voice_transcriptions?: Array<{
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
    view?: 'front' | 'back'
  }>
}

export interface UpdateAlterationData {
  alteration_number?: string
  alteration_type?: AlterationType
  worker_id?: string | null
  client_name?: string
  client_phone?: string
  client_email?: string | null
  description?: string | null
  error_type?: AlterationErrorType | null
  error_notes?: string | null
  price?: number
  paid_amount?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  order_received_date?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  alteration_due_date?: string | null
  delivery_date?: string | null
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  alteration_photos?: string[]
  voice_notes?: string[]
  voice_transcriptions?: any[]
  error_voice_transcriptions?: any[]
  completed_images?: string[]
  saved_design_comments?: any[]
  image_annotations?: any[]
  image_drawings?: any[]
  custom_design_image?: string
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
      await ensureValidSession()

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
        alteration_type: alterationData.alteration_type || 'after_delivery',
        worker_id: alterationData.worker_id || null,
        client_name: alterationData.client_name,
        client_phone: alterationData.client_phone,
        client_email: alterationData.client_email || null,
        description: alterationData.description || null,
        error_type: alterationData.error_type || null,
        error_notes: alterationData.error_notes || null,
        price: alterationData.price,
        paid_amount: alterationData.paid_amount || 0,
        payment_status: alterationData.payment_status || 'unpaid',
        payment_method: alterationData.payment_method || 'cash',
        order_received_date: alterationData.order_received_date || new Date().toISOString().split('T')[0],
        status: alterationData.status || 'pending',
        alteration_due_date: alterationData.alteration_due_date || null,
        delivery_date: alterationData.delivery_date || null,
        notes: alterationData.notes || null,
        admin_notes: alterationData.admin_notes || null,
        images: alterationData.images || [],
        alteration_photos: alterationData.alteration_photos || [],
        voice_notes: alterationData.voice_notes || [],
        voice_transcriptions: alterationData.voice_transcriptions || [],
        error_voice_transcriptions: alterationData.error_voice_transcriptions || [],
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
  async getAll(filters?: {
    status?: string | string[]
    worker_id?: string
    original_order_id?: string
    payment_status?: string
    search?: string
    page?: number
    pageSize?: number
    lightweight?: boolean
  }): Promise<{ data: Alteration[] | null; error: string | null; total?: number }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const useLightColumns = filters?.lightweight !== false
      const selectColumns = useLightColumns ? ALTERATION_LIST_COLUMNS : '*'

      let query = supabase
        .from('alterations')
        .select(selectColumns, { count: 'exact' })
        .order('created_at', { ascending: false })

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }

      if (filters?.worker_id) {
        query = query.eq('worker_id', filters.worker_id)
      }

      if (filters?.original_order_id) {
        query = query.eq('original_order_id', filters.original_order_id)
      }

      if (filters?.payment_status) {
        query = query.eq('payment_status', filters.payment_status)
      }

      if (filters?.search?.trim()) {
        const safeTerm = filters.search.trim()
        query = query.or(
          `client_name.ilike.%${safeTerm}%,client_phone.ilike.%${safeTerm}%,alteration_number.ilike.%${safeTerm}%`
        )
      }

      const pageSize = Math.max(1, filters?.pageSize || DEFAULT_PAGE_SIZE)
      const page = Math.max(0, filters?.page || 0)
      const from = page * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('❌ Error fetching alterations:', error)
        return { data: null, error: error.message }
      }

      return { data: (data || []) as unknown as Alteration[], error: null, total: count ?? undefined }
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
      await ensureValidSession()

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
      await ensureValidSession()

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
   * تحديث عداد التعديلات في الطلب الأصلي
   * يُستدعى بعد إنشاء أو حذف أي طلب تعديل مرتبط بطلب أصلي
   */
  async syncOrderAlterationCount(originalOrderId: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { error: 'Supabase is not configured.' }
    }

    try {
      // البطاقات تحسب تعديلات ما بعد التسليم فقط، مع عداد مستقل للبروفة الثانية.
      const [allAlterationsResult, afterDeliveryResult, secondProofResult] = await Promise.all([
        supabase
          .from('alterations')
          .select('id', { count: 'exact', head: true })
          .eq('original_order_id', originalOrderId)
          .neq('status', 'cancelled'),
        supabase
          .from('alterations')
          .select('id', { count: 'exact', head: true })
          .eq('original_order_id', originalOrderId)
          .eq('alteration_type', 'after_delivery')
          .neq('status', 'cancelled'),
        supabase
          .from('alterations')
          .select('id', { count: 'exact', head: true })
          .eq('original_order_id', originalOrderId)
          .eq('alteration_type', 'second_proof')
          .neq('status', 'cancelled')
      ])

      const countError = allAlterationsResult.error || afterDeliveryResult.error || secondProofResult.error
      if (countError) {
        console.error('❌ Error counting alterations:', countError)
        return { error: countError.message }
      }

      const alterationCount = afterDeliveryResult.count ?? 0
      const secondProofAlterationCount = secondProofResult.count ?? 0
      const hasAnyAlterations = (allAlterationsResult.count ?? 0) > 0

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          alteration_count: alterationCount,
          second_proof_alteration_count: secondProofAlterationCount,
          has_alterations: hasAnyAlterations,
          last_alteration_at: hasAnyAlterations ? new Date().toISOString() : null
        })
        .eq('id', originalOrderId)

      if (updateError) {
        console.error('❌ Error updating order alteration count:', updateError)
        return { error: updateError.message }
      }

      console.log(`✅ Order ${originalOrderId} alteration count updated: ${alterationCount}`)
      return { error: null }
    } catch (error: any) {
      console.error('❌ Exception in syncOrderAlterationCount:', error)
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
        .select(ALTERATION_LIST_COLUMNS)
        .or(`client_name.ilike.%${searchTerm}%,client_phone.ilike.%${searchTerm}%,alteration_number.ilike.%${searchTerm}%`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error searching alterations:', error)
        return { data: null, error: error.message }
      }

      return { data: (data || []) as unknown as Alteration[], error: null }
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
        .select(ALTERATION_LIST_COLUMNS)
        .eq('status', status)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching alterations by status:', error)
        return { data: null, error: error.message }
      }

      return { data: (data || []) as unknown as Alteration[], error: null }
    } catch (error: any) {
      console.error('❌ Exception in getByStatus alterations:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * الحصول على طلبات التعديلات المرتبطة بطلب أصلي
   * سبب الخطأ لا يُطلب إلا عند تفعيل includeErrorType (لوحة المدير)،
   * حتى لا يصل إلى متصفّح العامل أصلاً.
   */
  async getByOriginalOrderId(
    orderId: string,
    options: { includeErrorType?: boolean } = {}
  ): Promise<{ data: OrderAlterationSummary[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alterations')
        .select(`id,alteration_number,alteration_type,description,notes,alteration_photos,voice_transcriptions,status,created_at${options.includeErrorType ? ',error_type' : ''},alteration_translations(target_language,source_text,translated_text,updated_at)`)
        .eq('original_order_id', orderId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('❌ Error fetching alterations by original order:', error)
        return { data: null, error: error.message }
      }

      return { data: (data || []) as unknown as OrderAlterationSummary[], error: null }
    } catch (error: any) {
      console.error('❌ Exception in getByOriginalOrderId alterations:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب النسخة الهندية المخزّنة لتعديل واحد.
   * يعيد null إذا لم تُترجم بعد؛ ويبقى فحص تطابق source_text على المستدعي
   * لأن تغيّر وصف التعديل يُبطل الترجمة المحفوظة.
   */
  async getHindiTranslation(
    alterationId: string
  ): Promise<{ data: AlterationStoredTranslation | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('alteration_translations')
        .select('target_language,source_text,translated_text,updated_at')
        .eq('alteration_id', alterationId)
        .eq('target_language', 'hi')
        .maybeSingle()

      if (error) {
        console.error('❌ Error fetching alteration translation:', error)
        return { data: null, error: error.message }
      }

      return { data: (data as AlterationStoredTranslation) ?? null, error: null }
    } catch (error: any) {
      console.error('❌ Exception in getHindiTranslation:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * حفظ النسخة الهندية المشتركة مع النص المصدر الذي بُنيت منه.
   * تخزين المصدر يمنع عرض ترجمة قديمة إذا تغير وصف التعديل لاحقاً.
   */
  async saveHindiTranslation(
    alterationId: string,
    sourceText: string,
    translatedText: string
  ): Promise<{ data: AlterationStoredTranslation | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    const cleanSourceText = sourceText.trim()
    const cleanTranslatedText = translatedText.trim()
    if (!cleanSourceText || !cleanTranslatedText) {
      return { data: null, error: 'Source and translated text are required.' }
    }

    try {
      await ensureValidSession()

      const { data, error } = await supabase
        .from('alteration_translations')
        .upsert({
          alteration_id: alterationId,
          target_language: 'hi',
          source_text: cleanSourceText,
          translated_text: cleanTranslatedText,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'alteration_id,target_language'
        })
        .select('target_language,source_text,translated_text,updated_at')
        .single()

      if (error) {
        console.error('Error saving alteration translation:', error)
        return { data: null, error: error.message }
      }

      return { data: data as AlterationStoredTranslation, error: null }
    } catch (error) {
      console.error('Exception saving alteration translation:', error)
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to save alteration translation.'
      }
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
        const dateKey = extractDateKey(alteration.alteration_due_date)
        if (!dateKey) return
        stats[dateKey] = (stats[dateKey] || 0) + 1
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
