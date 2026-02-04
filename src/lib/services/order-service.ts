/**
 * خدمة الطلبات - Order Service
 * تتعامل مع جميع عمليات الطلبات في Supabase
 */

import { supabase, isSupabaseConfigured } from '../supabase'

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
  custom_design_image?: string // base64 صورة التصميم المخصصة
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
      console.log('📦 Creating order:', {
        ...orderData,
        custom_design_image: orderData.custom_design_image
          ? `[base64 image: ${Math.round(orderData.custom_design_image.length / 1024)}KB]`
          : null,
        voice_notes: orderData.voice_notes?.length || 0,
        voice_transcriptions: orderData.voice_transcriptions?.length || 0,
        image_annotations: orderData.image_annotations?.length || 0,
        image_drawings: orderData.image_drawings?.length || 0
      })

      // التحقق من حجم صورة التصميم المخصصة (الحد الأقصى 5MB)
      if (orderData.custom_design_image) {
        const imageSizeKB = orderData.custom_design_image.length / 1024
        console.log(`📸 Custom design image size: ${Math.round(imageSizeKB)}KB`)
        if (imageSizeKB > 5 * 1024) { // أكثر من 5MB
          return {
            data: null,
            error: `حجم صورة التصميم كبير جداً (${Math.round(imageSizeKB / 1024)}MB). الحد الأقصى المسموح به هو 5MB`
          }
        }
      }

      // تحضير البيانات للإدخال
      // دمج التعليقات على الصورة والرسومات مع المقاسات
      const measurementsWithAnnotations = {
        ...(orderData.measurements || {}),
        // التعليقات المتعددة (البنية الجديدة)
        saved_design_comments: orderData.saved_design_comments || [],
        // للتوافق مع الكود القديم
        image_annotations: orderData.image_annotations || [],
        image_drawings: orderData.image_drawings || [],
        custom_design_image: orderData.custom_design_image || null
      }

      const insertData: any = {
        user_id: orderData.user_id || null,
        worker_id: orderData.worker_id || null,
        client_name: orderData.client_name,
        client_phone: orderData.client_phone,
        client_email: orderData.client_email || null,
        description: orderData.description,
        fabric: orderData.fabric || null,
        measurements: measurementsWithAnnotations,
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
        // حقول محاسبية
        branch: orderData.branch || 'tailoring',
        cost_center: orderData.cost_center || 'CC-001',
        discount_amount: orderData.discount_amount || 0,
        tax_amount: orderData.tax_amount || 0
      }

      // إضافة order_number فقط إذا تم توفيره (وإلا سيتم توليده تلقائياً بواسطة trigger)
      if (orderData.order_number && orderData.order_number.trim() !== '') {
        insertData.order_number = orderData.order_number.trim()
      }

      // طباعة البيانات المرسلة للتصحيح (بدون البيانات الكبيرة)
      console.log('📤 Sending to Supabase:', {
        ...insertData,
        measurements: {
          ...insertData.measurements,
          custom_design_image: insertData.measurements?.custom_design_image
            ? `[base64: ${Math.round(insertData.measurements.custom_design_image.length / 1024)}KB]`
            : null
        },
        voice_notes: `[${insertData.voice_notes?.length || 0} notes]`,
        voice_transcriptions: `[${insertData.voice_transcriptions?.length || 0} transcriptions]`
      })

      const { data, error } = await supabase
        .from('orders')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        // طباعة الخطأ بالكامل للتصحيح
        console.error('❌ Supabase error creating order:', JSON.stringify(error, null, 2))
        console.error('❌ Full error object:', error)
        console.error('❌ Error message:', error.message || 'No message')
        console.error('❌ Error details:', error.details || 'No details')
        console.error('❌ Error hint:', error.hint || 'No hint')
        console.error('❌ Error code:', error.code || 'No code')

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

        // إرجاع رسالة خطأ مع التفاصيل للتصحيح
        const errorMsg = error.message || error.details || error.hint || 'خطأ غير معروف'
        return { data: null, error: `حدث خطأ أثناء إنشاء الطلب: ${errorMsg}` }
      }

      console.log('✅ Order created successfully:', data.id)

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Exception in create order:', error)
      console.error('❌ Exception message:', error?.message || 'No message')
      console.error('❌ Exception stack:', error?.stack || 'No stack')

      // معالجة خطأ رقم الطلب المكرر
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('order_number') || error.message?.includes('unique')) {
        return { data: null, error: 'رقم الطلب موجود بالفعل. يرجى استخدام رقم آخر' }
      }

      // إرجاع رسالة خطأ مع التفاصيل
      const errorMessage = error?.message || error?.toString() || 'خطأ غير معروف'
      return { data: null, error: `حدث خطأ أثناء إنشاء الطلب: ${errorMessage}` }
    }
  },

  /**
   * الحصول على جميع الطلبات (مع فلاتر اختيارية)
   */
  async getAll(filters?: {
    status?: string
    worker_id?: string
    user_id?: string
    payment_status?: string
  }): Promise<{ data: Order[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase is not configured.' }
    }

    try {
      console.log('📋 Fetching orders with filters:', filters)

      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })

      // تطبيق الفلاتر
      if (filters?.status) {
        query = query.eq('status', filters.status)
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

      const { data, error } = await query

      if (error) {
        console.error('❌ Supabase error fetching orders:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log(`✅ Fetched ${data?.length || 0} orders`)
      return { data: data || [], error: null }
    } catch (error: any) {
      console.error('❌ Error in getAll orders:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })
      return { data: [], error: error.message || error.hint || 'خطأ في جلب الطلبات' }
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
      console.log('🔍 Fetching order by ID:', id)

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('❌ Supabase error fetching order:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log('✅ Order fetched successfully')
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in getById order:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })
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
      console.log('🔍 Fetching order by number:', orderNumber)

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .single()

      if (error) {
        console.error('❌ Supabase error fetching order:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log('✅ Order fetched successfully')
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in getByOrderNumber:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })
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
      console.log('📞 Fetching orders for phone:', phoneNumber)

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_phone', phoneNumber)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Supabase error fetching orders by phone:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log(`✅ Fetched ${data?.length || 0} orders for phone`)
      return { data: data || [], error: null }
    } catch (error: any) {
      console.error('❌ Error in getByPhone:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })
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
      console.log('🔄 Updating order:', id, 'with updates:', updates)

      // جلب الطلب الحالي لمعرفة الحالة القديمة
      const { data: oldOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('❌ Supabase error updating order:')
        console.error('Error object:', error)
        console.error('Error message:', error.message)
        console.error('Error details:', error.details)
        console.error('Error hint:', error.hint)
        console.error('Error code:', error.code)
        console.error('Full error JSON:', JSON.stringify(error, null, 2))
        throw error
      }

      console.log('✅ Order updated successfully:', data)

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in update order:')
      console.error('Error object:', error)
      console.error('Error message:', error?.message)
      console.error('Error details:', error?.details)
      console.error('Error hint:', error?.hint)
      console.error('Error code:', error?.code)
      console.error('Error name:', error?.name)
      console.error('Error stack:', error?.stack)
      console.error('Full error JSON:', JSON.stringify(error, null, 2))

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
      console.log('🗑️ Deleting order:', id)

      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('❌ Supabase error deleting order:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log('✅ Order deleted successfully')
      return { error: null }
    } catch (error: any) {
      console.error('❌ Error in delete order:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })
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
      console.log('📊 Fetching order stats by date:', { startDate, endDate })

      // جلب جميع الطلبات في النطاق الزمني المحدد
      const { data, error } = await supabase
        .from('orders')
        .select('due_date')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .not('status', 'eq', 'cancelled') // استبعاد الطلبات الملغاة

      if (error) {
        console.error('❌ Supabase error fetching order stats:', error)
        return { data: null, error: error.message }
      }

      // حساب عدد الطلبات لكل تاريخ
      const stats: Record<string, number> = {}
      data?.forEach((order) => {
        const date = order.due_date
        stats[date] = (stats[date] || 0) + 1
      })

      console.log('✅ Order stats fetched successfully:', stats)
      return { data: stats, error: null }
    } catch (error: any) {
      console.error('❌ Error in getOrderStatsByDate:', error)
      return { data: null, error: error.message || 'خطأ في جلب إحصائيات الطلبات' }
    }
  },

  /**
   * جلب إحصائيات مواعيد البروفا حسب التاريخ
   * يُستخدم لعرض عدد مواعيد البروفا في التقويم
   */
  async getProofStatsByDate(startDate: string, endDate: string): Promise<{ data: Record<string, number> | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('📊 Fetching proof stats by date:', { startDate, endDate })

      // جلب جميع الطلبات التي لها proof_delivery_date في النطاق الزمني المحدد
      const { data, error } = await supabase
        .from('orders')
        .select('proof_delivery_date')
        .gte('proof_delivery_date', startDate)
        .lte('proof_delivery_date', endDate)
        .not('status', 'eq', 'cancelled') // استبعاد الطلبات الملغاة
        .not('status', 'eq', 'delivered') // استبعاد الطلبات المسلمة
        .not('proof_delivery_date', 'is', null) // استبعاد الطلبات بدون موعد بروفا

      if (error) {
        console.error('❌ Supabase error fetching proof stats:', error)
        return { data: null, error: error.message }
      }

      // حساب عدد مواعيد البروفا لكل تاريخ
      const stats: Record<string, number> = {}
      data?.forEach((order) => {
        const date = order.proof_delivery_date
        if (date) {
          stats[date] = (stats[date] || 0) + 1
        }
      })

      console.log('✅ Proof stats fetched successfully:', stats)
      return { data: stats, error: null }
    } catch (error: any) {
      console.error('❌ Error in getProofStatsByDate:', error)
      return { data: null, error: error.message || 'خطأ في جلب إحصائيات مواعيد البروفا' }
    }
  },

}

