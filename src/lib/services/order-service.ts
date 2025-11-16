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
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  due_date: string
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
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  due_date: string
  delivery_date?: string
  notes?: string
  admin_notes?: string
  images?: string[]
  voice_notes?: string[]
}

export interface UpdateOrderData {
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
  status?: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  due_date?: string
  delivery_date?: string | null
  notes?: string | null
  admin_notes?: string | null
  images?: string[]
  voice_notes?: string[]
  completed_images?: string[]
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
      console.log('📦 Creating order:', orderData)

      const { data, error } = await supabase
        .from('orders')
        .insert({
          user_id: orderData.user_id || null,
          worker_id: orderData.worker_id || null,
          client_name: orderData.client_name,
          client_phone: orderData.client_phone,
          client_email: orderData.client_email || null,
          description: orderData.description,
          fabric: orderData.fabric || null,
          measurements: orderData.measurements || {},
          price: orderData.price,
          paid_amount: orderData.paid_amount || 0,
          payment_status: orderData.payment_status || 'unpaid',
          status: orderData.status || 'pending',
          due_date: orderData.due_date,
          delivery_date: orderData.delivery_date || null,
          notes: orderData.notes || null,
          admin_notes: orderData.admin_notes || null,
          images: orderData.images || [],
          voice_notes: orderData.voice_notes || []
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Supabase error creating order:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log('✅ Order created successfully:', data.id)
      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in create order:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })
      return { data: null, error: error.message || error.hint || 'خطأ في إنشاء الطلب' }
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
  }
}

