/**
 * خدمة الطلبات - Order Service
 * تتعامل مع جميع عمليات الطلبات في Supabase
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Light column projection for list queries (no heavy JSONB/base64)
 * - Server-side pagination with .range()
 * - Server-side status filtering (no client-side filtering)
 * - No redundant read-before-write on updates
 * - Production console.log guarded behind isDev
 */

import { extractDateKey } from '../date-utils'
import { supabase, isSupabaseConfigured, ensureValidSession } from '../supabase'
import { uploadOrderImages } from './storage-service'

const isDev = process.env.NODE_ENV === 'development'

// ============================================================================
// Column Projection Constants
// ============================================================================

/**
 * Lightweight columns for list/table views.
 * Excludes: measurements (contains base64 images, annotations, drawings),
 *           voice_notes, voice_transcriptions, completed_images
 * This reduces per-row payload from 5-30MB to ~200 bytes.
 */
const ORDER_LIST_COLUMNS = [
  'id',
  'order_number',
  'user_id',
  'worker_id',
  'client_name',
  'client_phone',
  'client_email',
  'description',
  'fabric',
  'price',
  'paid_amount',
  'remaining_amount',
  'payment_status',
  'payment_method',
  'order_received_date',
  'status',
  'due_date',
  'proof_delivery_date',
  'delivery_date',
  // أعمدة مستقلة (migration 29) - لا تحتاج JSONB extraction بعد الآن
  'has_measurements',
  'is_printed',
  'whatsapp_sent',
  'needs_review',
  'is_pre_booking',
  'fabric_type',
  'has_alterations',   // migration 34
  'alteration_count',  // migration 34
  'design_thumbnail',           // عمود مستقل (migration 32)
  'design_links',               // عمود مستقل (migration 36)
  'notes',
  'admin_notes',
  'images',
  'branch',
  'cost_center',
  'discount_amount',
  'tax_amount',
  'created_at',
  'updated_at',
  'admin_confirmed',
  'worker_completed_at'
].join(',')

/**
 * Default page size for paginated queries
 */
const DEFAULT_PAGE_SIZE = 50

// ============================================================================
// أنواع البيانات (Types)
// ============================================================================

export interface Order {
  id: string
  order_number: string
  user_id?: string | null
  worker_id?: string | null
  client_name: string
  client_phone: string
  client_email?: string | null
  description: string
  fabric?: string | null
  measurements: Record<string, any>
  // أعمدة مستقلة (migration 29) - قيم boolean حقيقية من DB
  fabric_type?: string | null
  has_measurements: boolean
  is_printed: boolean
  whatsapp_sent: boolean
  needs_review: boolean
  is_pre_booking: boolean
  // تتبع التعديلات (migration 34)
  has_alterations: boolean
  alteration_count: number
  last_alteration_at?: string | null
  // أعمدة JSONB مستقلة (migration 30) - بيانات التصميم
  image_annotations?: any[]
  image_drawings?: any[]
  design_comments?: any[]
  // عمود مستقل (migration 32)
  design_thumbnail?: string | null
  // أعمدة مستقلة (migration 33) - صور التصميم
  custom_design_image?: string | null
  ai_generated_images?: string[]
  // عمود مستقل (migration 36) - روابط التصميم
  design_links?: string | null
  price: number
  paid_amount: number
  remaining_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  order_received_date?: string
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  due_date: string
  proof_delivery_date?: string | null
  delivery_date?: string | null
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  voice_notes?: string[]
  completed_images?: string[]
  created_at: string
  updated_at: string
  admin_confirmed?: boolean
  worker_completed_at?: string | null
}

export interface CreateOrderData {
  order_number?: string
  user_id?: string
  worker_id?: string
  client_name: string
  client_phone: string
  client_email?: string
  description: string
  fabric?: string
  measurements?: Record<string, any>
  // أعمدة مستقلة (migration 29)
  fabric_type?: string | null
  needs_review?: boolean
  is_pre_booking?: boolean
  price: number
  paid_amount?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  order_received_date?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  due_date: string
  proof_delivery_date?: string
  delivery_date?: string
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
  custom_design_image?: string // base64 أو URL صورة التصميم المخصصة (عمود مستقل - migration 33)
  ai_generated_images?: string[] // مصفوفة URLs لصور AI (عمود مستقل - migration 33)
  design_thumbnail?: string    // صورة مصغرة للعمود المستقل (migration 32)
  design_links?: string        // روابط التصاميم المرجعية (عمود مستقل - migration 36)
  // التعليقات المتعددة على التصميم (البنية الجديدة)
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
  // حقول محاسبية
  branch?: Branch
  cost_center?: CostCenter
  discount_amount?: number
  tax_amount?: number
  createAccountingEntry?: boolean // إنشاء قيد محاسبي تلقائياً
}

export interface UpdateOrderData {
  order_number?: string
  worker_id?: string | null
  client_name?: string
  client_phone?: string
  client_email?: string | null
  description?: string
  fabric?: string | null
  measurements?: Record<string, any>
  // أعمدة مستقلة (migration 29)
  has_measurements?: boolean
  is_printed?: boolean
  // تتبع التعديلات (migration 34)
  alteration_count?: number
  has_alterations?: boolean
  last_alteration_at?: string | null
  design_thumbnail?: string | null  // عمود مستقل (migration 32)
  custom_design_image?: string | null  // عمود مستقل (migration 33)
  ai_generated_images?: string[]       // عمود مستقل (migration 33)
  design_links?: string | null         // عمود مستقل (migration 36)
  whatsapp_sent?: boolean
  needs_review?: boolean
  is_pre_booking?: boolean
  fabric_type?: string | null
  price?: number
  paid_amount?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  payment_method?: 'cash' | 'card' | 'bank_transfer' | 'check'
  order_received_date?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  due_date?: string
  proof_delivery_date?: string | null
  delivery_date?: string | null
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  voice_notes?: string[]
  completed_images?: string[]
  worker_completed_at?: string | null
  // التسجيلات الصوتية مع البيانات الكاملة (النصوص المحولة والترجمات)
  voice_transcriptions?: Array<{
    id: string
    data: string
    timestamp: number
    duration?: number
    transcription?: string
    translatedText?: string
    translationLanguage?: string
  }>
  // التعليقات على الصور
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
  // الرسومات على الصور
  image_drawings?: Array<{
    id: string
    points: Array<{ x: number; y: number }>
    color: string
    strokeWidth: number
    brushType?: string
    isEraser?: boolean
    timestamp: number
  }>
  // صورة التصميم المخصصة (base64)
  custom_design_image?: string
  // التعليقات المتعددة المحفوظة على التصميم
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

// ============================================================================
// خدمة الطلبات
// ============================================================================

export const orderService = {
  /**
   * إنشاء طلب جديد (Admin فقط)
   */
  async create(orderData: CreateOrderData): Promise<{ data: Order | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      // التحقق من صلاحية الجلسة قبل الإنشاء
      await ensureValidSession()

      if (isDev) console.log('📦 Creating order with', {
        image_annotations: orderData.image_annotations?.length || 0,
        image_drawings: orderData.image_drawings?.length || 0,
        voice_notes: orderData.voice_notes?.length || 0,
      })

      // التحقق من حجم صورة التصميم المخصصة (الحد الأقصى 10MB - متوافق مع واجهة المستخدم)
      if (orderData.custom_design_image) {
        const imageSizeKB = orderData.custom_design_image.length / 1024
        if (imageSizeKB > 10 * 1024) {
          return {
            data: null,
            error: `حجم صورة التصميم كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى المسموح به هو 10MB`
          }
        }
      }

      // تحضير البيانات للإدخال
      // measurements تحتوي فقط على: المقاسات الفعلية الرقمية + additional_notes
      // design_thumbnail نُقل لعمود مستقل (migration 32)
      // custom_design_image و ai_generated_images نُقلا لأعمدة مستقلة (migration 33)
      // بيانات التصميم (annotations/drawings/comments) تُكتب لأعمدة مستقلة (migration 30)
      const measurementsOnly = { ...(orderData.measurements || {}) }
      // إزالة الحقول المنقولة لأعمدة مستقلة (بيانات قديمة قد تكون داخل measurements)
      delete (measurementsOnly as any).design_thumbnail
      delete (measurementsOnly as any).custom_design_image
      delete (measurementsOnly as any).ai_generated_images

      const insertData: any = {
        user_id: orderData.user_id || null,
        worker_id: orderData.worker_id || null,
        client_name: orderData.client_name,
        client_phone: orderData.client_phone,
        client_email: orderData.client_email || null,
        description: orderData.description,
        fabric: orderData.fabric || null,
        measurements: measurementsOnly,
        // أعمدة JSONB مستقلة (migration 30)
        image_annotations: orderData.image_annotations || [],
        image_drawings: orderData.image_drawings || [],
        design_comments: orderData.saved_design_comments || [],
        // عمود مستقل (migration 32)
        design_thumbnail: orderData.design_thumbnail || null,
        // أعمدة مستقلة (migration 33) - صور التصميم
        custom_design_image: orderData.custom_design_image || null,
        ai_generated_images: orderData.ai_generated_images || [],
        // عمود مستقل (migration 36) - روابط التصميم
        design_links: orderData.design_links || null,
        // أعمدة مستقلة (migration 29)
        fabric_type: orderData.fabric_type || orderData.measurements?.fabric_type || null,
        needs_review: orderData.needs_review ?? orderData.measurements?.needs_review ?? false,
        is_pre_booking: orderData.is_pre_booking ?? orderData.measurements?.is_pre_booking ?? false,
        price: orderData.price,
        paid_amount: orderData.paid_amount || 0,
        payment_status: orderData.payment_status || 'unpaid',
        payment_method: orderData.payment_method || 'cash',
        order_received_date: orderData.order_received_date || new Date().toISOString().split('T')[0],
        status: orderData.status || 'pending',
        due_date: orderData.due_date,
        proof_delivery_date: orderData.proof_delivery_date || null,
        delivery_date: orderData.delivery_date || null,
        notes: orderData.notes || null,
        admin_notes: orderData.admin_notes || null,
        images: orderData.images || [],
        voice_notes: orderData.voice_notes || [],
        voice_transcriptions: orderData.voice_transcriptions || [],
        branch: orderData.branch || 'tailoring',
        cost_center: orderData.cost_center || 'CC-001',
        discount_amount: orderData.discount_amount || 0,
        tax_amount: orderData.tax_amount || 0
      }

      // إضافة order_number فقط إذا تم توفيره (وإلا سيتم توليده تلقائياً بواسطة trigger)
      if (orderData.order_number && orderData.order_number.trim() !== '') {
        insertData.order_number = orderData.order_number.trim()
      }

      const { data, error } = await supabase
        .from('orders')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        if (isDev) console.error('❌ Supabase error creating order:', error)

        // معالجة خطأ رقم الطلب المكرر
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('order_number') || error.message?.includes('unique')) {
          return { data: null, error: 'رقم الطلب موجود بالفعل. يرجى استخدام رقم آخر' }
        }

        // معالجة خطأ الحجم الكبير للبيانات
        if (error.message?.includes('too large') || error.message?.includes('size') || error.code === '54000') {
          return { data: null, error: 'حجم البيانات كبير جداً. يرجى تقليل حجم الصورة أو الرسومات' }
        }

        // معالجة خطأ الحقول المفقودة أو القيود
        if (error.code === '23502') {
          return { data: null, error: `حقل مطلوب مفقود: ${error.message}` }
        }

        // معالجة خطأ نوع البيانات
        if (error.code === '22P02') {
          return { data: null, error: `خطأ في نوع البيانات: ${error.message}` }
        }

        const errorMsg = error.message || error.details || error.hint || 'خطأ غير معروف'
        return { data: null, error: `حدث خطأ أثناء إنشاء الطلب: ${errorMsg}` }
      }

      if (isDev) console.log('✅ Order created successfully:', data.id)

      // رفع الصور إلى Storage وتحديث السجل بالـ URLs (بدلاً من base64)
      try {
        const imageUpdates = await uploadOrderImages(data.id, {
          measurements: insertData.measurements,
          design_thumbnail: insertData.design_thumbnail,
          custom_design_image: insertData.custom_design_image,
          ai_generated_images: insertData.ai_generated_images,
          images: insertData.images,
        })
        if (imageUpdates) {
          const { error: updateError } = await supabase
            .from('orders')
            .update(imageUpdates)
            .eq('id', data.id)
          if (updateError) {
            console.error('⚠️ فشل تحديث URLs الصور بعد الإنشاء:', updateError.message)
          } else {
            if (isDev) console.log('✅ Images uploaded to Storage for order:', data.id)
            return { data: { ...data, ...imageUpdates }, error: null }
          }
        }
      } catch (uploadErr: any) {
        console.error('⚠️ uploadOrderImages exception (create):', uploadErr.message)
      }

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in create order:', error?.message)

      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('order_number') || error.message?.includes('unique')) {
        return { data: null, error: 'رقم الطلب موجود بالفعل. يرجى استخدام رقم آخر' }
      }

      const errorMessage = error?.message || error?.toString() || 'خطأ غير معروف'
      return { data: null, error: `حدث خطأ أثناء إنشاء الطلب: ${errorMessage}` }
    }
  },

  /**
   * الحصول على جميع الطلبات (مع فلاتر اختيارية وترقيم الصفحات)
   * 
   * PERFORMANCE: Uses light column projection (ORDER_LIST_COLUMNS) to avoid
   * fetching heavy JSONB columns (measurements with base64 images).
   * Supports server-side pagination and status array filtering.
   */
  async getAll(filters?: {
    status?: string | string[]  // single status or array of statuses
    worker_id?: string
    user_id?: string
    payment_status?: string
    page?: number       // 0-indexed page number
    pageSize?: number   // items per page (default: DEFAULT_PAGE_SIZE)
    lightweight?: boolean // if false, fetch all columns (default: true)
    search?: string     // server-side search: client_name, client_phone, order_number
    noPagination?: boolean // if true, fetch all records without page limit
    dateFilter?: string  // 'YYYY-MM-DD' — filter by exact date
    dateFilterType?: 'received' | 'delivery' | 'proof'  // which date field to filter on
  }): Promise<{ data: Order[]; error: string | null; total?: number }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('📋 Fetching orders with filters:', filters)

      const useLightColumns = filters?.lightweight !== false
      const selectColumns = useLightColumns ? ORDER_LIST_COLUMNS : '*'

      // Use head:true count for total, combined with data query
      let query = supabase
        .from('orders')
        .select(selectColumns, { count: 'exact' })
        .order('created_at', { ascending: false })

      // تطبيق الفلاتر
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          // Server-side status array filter — replaces client-side filtering
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }
      if (filters?.worker_id) {
        query = query.eq('worker_id', filters.worker_id)
      }
      if (filters?.user_id) {
        query = query.eq('user_id', filters.user_id)
      }
      if (filters?.payment_status) {
        query = query.eq('payment_status', filters.payment_status)
      }

      // Server-side search: client_name, client_phone, order_number, fabric
      if (filters?.search?.trim()) {
        const safeTerm = filters.search.trim()
        query = query.or(
          `client_name.ilike.%${safeTerm}%,client_phone.ilike.%${safeTerm}%,order_number.ilike.%${safeTerm}%,fabric.ilike.%${safeTerm}%`
        )
      }

      // Server-side date filter
      if (filters?.dateFilter) {
        const dateStart = filters.dateFilter  // 'YYYY-MM-DD'
        const nextDay = new Date(dateStart)
        nextDay.setDate(nextDay.getDate() + 1)
        const dateEnd = nextDay.toISOString().split('T')[0]
        const dateField =
          filters.dateFilterType === 'received' ? 'order_received_date'
          : filters.dateFilterType === 'proof' ? 'proof_delivery_date'
          : 'due_date'
        query = query.gte(dateField, dateStart).lt(dateField, dateEnd)
      }

      // Pagination (skip if noPagination is true)
      if (!filters?.noPagination) {
        const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
        const page = filters?.page || 0
        const from = page * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)
      }

      const { data, error, count } = await query

      if (error) {
        console.error('❌ Supabase error fetching orders:', error.message)
        throw error
      }

      if (isDev) console.log(`✅ Fetched ${data?.length || 0} orders (total: ${count})`)
      return { data: (data || []) as unknown as Order[], error: null, total: count ?? undefined }
    } catch (error: any) {
      console.error('❌ Error in getAll orders:', error.message)
      return { data: [], error: error.message || error.hint || 'خطأ في جلب الطلبات' }
    }
  },

  /**
   * تحويل الطلبات المكتملة المتأخرة إلى "تم التسليم"
   * يشمل كل طلب مكتمل تجاوز موعد تسليمه بأكثر من يومين
   */
  async bulkDeliverOverdue(daysOverdue: number = 2): Promise<{ count: number; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { count: 0, error: 'Supabase is not configured.' }
    }

    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - daysOverdue)
      const cutoffDate = cutoff.toISOString().split('T')[0] // YYYY-MM-DD

      const deliveryDate = new Date().toISOString()

      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'delivered', delivery_date: deliveryDate })
        .eq('status', 'completed')
        .lt('due_date', cutoffDate)
        .select('id')

      if (error) throw error

      return { count: data?.length ?? 0, error: null }
    } catch (error: any) {
      console.error('❌ Error in bulkDeliverOverdue:', error.message)
      return { count: 0, error: error.message || 'خطأ في تحويل الطلبات' }
    }
  },

  /**
   * الحصول على طلب واحد بواسطة ID
   */
  async getById(id: string): Promise<{ data: Order | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('🔍 Fetching order by ID:', id)

      // Detail view: use select('*') to get full order including measurements/annotations
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (isDev) console.error('❌ Supabase error fetching order:', error.message)
        throw error
      }

      if (isDev) console.log('✅ Order fetched successfully')
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in getById order:', error.message)
      return { data: null, error: error.message || error.hint || 'خطأ في جلب الطلب' }
    }
  },

  /**
   * الحصول على طلب بواسطة رقم الطلب
   */
  async getByOrderNumber(orderNumber: string): Promise<{ data: Order | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('🔍 Fetching order by number:', orderNumber)

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .maybeSingle()

      if (error) {
        if (isDev) console.error('❌ Supabase error fetching order:', error.message)
        throw error
      }

      if (isDev) console.log('✅ Order fetched successfully')
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in getByOrderNumber:', error.message)
      return { data: null, error: error.message || error.hint || 'خطأ في جلب الطلب' }
    }
  },

  /**
   * الحصول على طلبات العميل بواسطة رقم الهاتف
   */
  async getByPhone(phoneNumber: string): Promise<{ data: Order[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('📞 Fetching orders for phone:', phoneNumber)

      // Phone lookup uses lightweight columns since it's typically for listing
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_LIST_COLUMNS)
        .eq('client_phone', phoneNumber)
        .order('created_at', { ascending: false })

      if (error) {
        if (isDev) console.error('❌ Supabase error fetching orders by phone:', error.message)
        throw error
      }

      if (isDev) console.log(`✅ Fetched ${data?.length || 0} orders for phone`)
      return { data: (data || []) as unknown as Order[], error: null }
    } catch (error: any) {
      console.error('❌ Error in getByPhone:', error.message)
      return { data: [], error: error.message || error.hint || 'خطأ في جلب الطلبات' }
    }
  },

  /**
   * تحديث طلب
   */
  async update(id: string, updates: UpdateOrderData): Promise<{ data: Order | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      // التحقق من صلاحية الجلسة قبل التحديث
      await ensureValidSession()

      if (isDev) console.log('🔄 Updating order:', id)

      // رفع أي صور base64 في التحديث إلى Storage قبل الحفظ
      try {
        const imageUpdates = await uploadOrderImages(id, {
          measurements: (updates as any).measurements,
          design_thumbnail: (updates as any).design_thumbnail,
          custom_design_image: (updates as any).custom_design_image,
          ai_generated_images: (updates as any).ai_generated_images,
          images: (updates as any).images,
          completed_images: (updates as any).completed_images,
        })
        if (imageUpdates) {
          if (imageUpdates.measurements) (updates as any).measurements = imageUpdates.measurements
          if (imageUpdates.design_thumbnail) (updates as any).design_thumbnail = imageUpdates.design_thumbnail
          if (imageUpdates.custom_design_image !== undefined) (updates as any).custom_design_image = imageUpdates.custom_design_image
          if (imageUpdates.ai_generated_images) (updates as any).ai_generated_images = imageUpdates.ai_generated_images
          if (imageUpdates.images) (updates as any).images = imageUpdates.images
          if (imageUpdates.completed_images) (updates as any).completed_images = imageUpdates.completed_images
          if (isDev) console.log('✅ Images uploaded to Storage before update:', id)
        }
      } catch (uploadErr: any) {
        console.error('⚠️ uploadOrderImages exception (update):', uploadErr.message)
      }

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (isDev) console.error('❌ Supabase error updating order:', error)
        if (error.message?.includes('too large') || error.message?.includes('size') || error.code === '54000') {
          return { data: null, error: 'حجم البيانات كبير جداً. يرجى تقليل حجم الصورة أو الرسومات' }
        }
        throw error
      }

      if (isDev) console.log('✅ Order updated successfully')

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in update order:', error?.message)
      if (error?.message?.includes('too large') || error?.message?.includes('size') || error?.code === '54000') {
        return { data: null, error: 'حجم البيانات كبير جداً. يرجى تقليل حجم الصورة أو الرسومات' }
      }
      const errorMessage = error?.message || error?.hint || error?.details || 'خطأ في تحديث الطلب'
      return { data: null, error: errorMessage }
    }
  },

  /**
   * حذف طلب (Admin فقط)
   */
  async delete(id: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { error: 'Supabase is not configured.' }
    }

    try {
      // التحقق من صلاحية الجلسة قبل الحذف
      await ensureValidSession()

      if (isDev) console.log('🗑️ Deleting order:', id)

      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id)

      if (error) {
        if (isDev) console.error('❌ Supabase error deleting order:', error.message)
        throw error
      }

      if (isDev) console.log('✅ Order deleted successfully')
      return { error: null }
    } catch (error: any) {
      console.error('❌ Error in delete order:', error.message)
      return { error: error.message || error.hint || 'خطأ في حذف الطلب' }
    }
  },

  /**
   * جلب إحصائيات الطلبات حسب التاريخ
   * يُستخدم لعرض عدد الطلبات في التقويم
   */
  async getOrderStatsByDate(startDate: string, endDate: string): Promise<{ data: Record<string, number> | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('📊 Fetching order stats by date:', { startDate, endDate })

      const { data, error } = await supabase
        .from('orders')
        .select('due_date')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'delivered')

      if (error) {
        console.error('❌ Supabase error fetching order stats:', error.message)
        return { data: null, error: error.message }
      }

      const stats: Record<string, number> = {}
      data?.forEach((order) => {
        const dateKey = extractDateKey(order.due_date)
        if (!dateKey) return
        stats[dateKey] = (stats[dateKey] || 0) + 1
      })

      return { data: stats, error: null }
    } catch (error: any) {
      console.error('❌ Error in getOrderStatsByDate:', error.message)
      return { data: null, error: error.message || 'خطأ في جلب إحصائيات الطلبات' }
    }
  },

  /**
   * جلب إحصائيات الطلبات حسب تاريخ الاستلام
   */
  async getOrderReceivedStatsByDate(startDate: string, endDate: string): Promise<{ data: Record<string, number> | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_received_date, created_at')
        .gte('order_received_date', startDate)
        .lte('order_received_date', endDate)
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'delivered')

      if (error) {
        return { data: null, error: error.message }
      }

      const stats: Record<string, number> = {}
      data?.forEach((order) => {
        const dateKey = extractDateKey(order.order_received_date || order.created_at)
        if (!dateKey) return
        stats[dateKey] = (stats[dateKey] || 0) + 1
      })

      return { data: stats, error: null }
    } catch (error: any) {
      return { data: null, error: error.message || 'خطأ في جلب إحصائيات الاستلام' }
    }
  },

  /**
   * جلب إحصائيات مواعيد البروفا حسب التاريخ
   */
  async getProofStatsByDate(startDate: string, endDate: string): Promise<{ data: Record<string, number> | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('📊 Fetching proof stats by date:', { startDate, endDate })

      const { data, error } = await supabase
        .from('orders')
        .select('proof_delivery_date')
        .gte('proof_delivery_date', startDate)
        .lte('proof_delivery_date', endDate)
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'delivered')
        .not('proof_delivery_date', 'is', null)

      if (error) {
        console.error('❌ Supabase error fetching proof stats:', error.message)
        return { data: null, error: error.message }
      }

      const stats: Record<string, number> = {}
      data?.forEach((order) => {
        const dateKey = order.proof_delivery_date ? extractDateKey(order.proof_delivery_date) : ''
        if (dateKey) {
          stats[dateKey] = (stats[dateKey] || 0) + 1
        }
      })

      return { data: stats, error: null }
    } catch (error: any) {
      console.error('❌ Error in getProofStatsByDate:', error.message)
      return { data: null, error: error.message || 'خطأ في جلب إحصائيات مواعيد البروفا' }
    }
  },

  /**
   * جلب المقاسات فقط لطلب معين (أخف بكثير من getById)
   * يُستخدم لتحميل تعليقات التصميم والمقاسات عند الحاجة فقط
   */
  async getMeasurements(id: string): Promise<{ data: Record<string, any> | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      if (isDev) console.log('📐 Fetching measurements for order:', id)

      // نجلب measurements + الأعمدة المستقلة (migrations 30, 33) معاً لتوحيد نقطة الوصول
      const { data, error } = await supabase
        .from('orders')
        .select('measurements, image_annotations, image_drawings, design_comments, custom_design_image, ai_generated_images')
        .eq('id', id)
        .single()

      if (error) {
        if (isDev) console.error('❌ Supabase error fetching measurements:', error.message)
        return { data: null, error: error.message }
      }

      const row = data as any
      // ندمج الأعمدة الجديدة في كائن واحد مع الحفاظ على التوافق مع الكود الموجود
      // الكود الموجود يقرأ: measurementsData.saved_design_comments / image_annotations / image_drawings / custom_design_image / ai_generated_images
      const merged: Record<string, any> = {
        ...(row?.measurements || {}),
        // الأعمدة الجديدة تتفوق على البيانات القديمة داخل measurements (إن وُجدت)
        image_annotations: row?.image_annotations?.length
          ? row.image_annotations
          : (row?.measurements?.image_annotations || []),
        image_drawings: row?.image_drawings?.length
          ? row.image_drawings
          : (row?.measurements?.image_drawings || []),
        // design_comments → saved_design_comments للتوافق مع الكود الموجود
        saved_design_comments: row?.design_comments?.length
          ? row.design_comments
          : (row?.measurements?.saved_design_comments || []),
        // أعمدة migration 33 - تتفوق على ما قد يكون داخل measurements (بيانات قديمة)
        custom_design_image: row?.custom_design_image ?? row?.measurements?.custom_design_image ?? null,
        ai_generated_images: row?.ai_generated_images?.length
          ? row.ai_generated_images
          : (row?.measurements?.ai_generated_images || []),
      }

      if (isDev) console.log('✅ Measurements fetched successfully')
      return { data: merged, error: null }
    } catch (error: any) {
      console.error('❌ Error in getMeasurements:', error.message)
      return { data: null, error: error.message || 'خطأ في جلب المقاسات' }
    }
  },

}
