/**
 * Appointment Service - خدمة المواعيد
 * 
 * هذه الخدمة تتعامل مع جدول appointments في Supabase
 * تدعم حجز المواعيد للزبائن غير المسجلين (Anonymous/Guest)
 */

import { supabase, isSupabaseConfigured } from '../supabase'

// ============================================================================
// Types - الأنواع
// ============================================================================

export interface Appointment {
  id: string
  user_id?: string | null
  worker_id?: string | null
  customer_name: string
  customer_phone: string
  customer_email?: string | null
  appointment_date: string // YYYY-MM-DD
  appointment_time: string // HH:MM
  service_type: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes?: string | null
  admin_notes?: string | null
  created_at: string
  updated_at: string
}

export interface CreateAppointmentData {
  customer_name: string
  customer_phone: string
  customer_email?: string
  appointment_date: string
  appointment_time: string
  service_type?: string
  notes?: string
  worker_id?: string
  user_id?: string
}

export interface UpdateAppointmentData {
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  appointment_date?: string
  appointment_time?: string
  service_type?: string
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes?: string
  admin_notes?: string
  worker_id?: string
}

export interface AppointmentSlot {
  date: string
  time: string
  isAvailable: boolean
}

// ============================================================================
// Appointment Service
// ============================================================================

export const appointmentService = {
  /**
   * إنشاء موعد جديد (للزبائن غير المسجلين والمسجلين)
   */
  async create(appointmentData: CreateAppointmentData): Promise<{ data: Appointment | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('📅 Creating appointment:', appointmentData)

      // التحقق من توفر الموعد
      const isAvailable = await this.checkSlotAvailability(
        appointmentData.appointment_date,
        appointmentData.appointment_time
      )

      if (!isAvailable) {
        console.warn('⚠️ Appointment slot is not available')
        return { data: null, error: 'هذا الموعد محجوز بالفعل. يرجى اختيار موعد آخر.' }
      }

      // إنشاء الموعد
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          customer_name: appointmentData.customer_name,
          customer_phone: appointmentData.customer_phone,
          customer_email: appointmentData.customer_email || null,
          appointment_date: appointmentData.appointment_date,
          appointment_time: appointmentData.appointment_time,
          service_type: appointmentData.service_type || 'consultation',
          status: 'pending',
          notes: appointmentData.notes || null,
          worker_id: appointmentData.worker_id || null,
          user_id: appointmentData.user_id || null
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating appointment:', error)
        throw error
      }

      console.log('✅ Appointment created successfully:', data.id)

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in create appointment:', error)
      return { data: null, error: error.message || 'خطأ في إنشاء الموعد' }
    }
  },

  /**
   * الحصول على جميع المواعيد (مع فلاتر اختيارية)
   */
  async getAll(filters?: {
    status?: string
    date?: string
    worker_id?: string
    customer_phone?: string
  }): Promise<{ data: Appointment[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase is not configured.' }
    }

    try {
      console.log('📋 Fetching appointments with filters:', filters)

      let query = supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })

      // تطبيق الفلاتر
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.date) {
        query = query.eq('appointment_date', filters.date)
      }
      if (filters?.worker_id) {
        query = query.eq('worker_id', filters.worker_id)
      }
      if (filters?.customer_phone) {
        query = query.eq('customer_phone', filters.customer_phone)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ Supabase error fetching appointments:', error)
        console.error('❌ Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      console.log(`✅ Fetched ${data?.length || 0} appointments`)
      if (data && data.length > 0) {
        console.log('📋 Sample appointment:', data[0])
      }

      return { data: data || [], error: null }
    } catch (error: any) {
      console.error('❌ Error in getAll appointments:', error)
      return { data: [], error: error.message || 'خطأ في جلب المواعيد' }
    }
  },

  /**
   * الحصول على موعد بواسطة ID
   */
  async getById(id: string): Promise<{ data: Appointment | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('🔍 Fetching appointment:', id)

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('❌ Error fetching appointment:', error)
        throw error
      }

      console.log('✅ Appointment fetched successfully')

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in getById appointment:', error)
      return { data: null, error: error.message || 'خطأ في جلب الموعد' }
    }
  },

  /**
   * الحصول على مواعيد زبون برقم الهاتف (للزبائن غير المسجلين)
   */
  async getByPhone(phoneNumber: string): Promise<{ data: Appointment[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase is not configured')
      return { data: [], error: 'Supabase is not configured.' }
    }

    try {
      console.log('📞 Fetching appointments for phone:', phoneNumber)
      console.log('🔍 Using Supabase client:', supabase ? 'OK' : 'NULL')

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('customer_phone', phoneNumber)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })

      if (error) {
        console.error('❌ Supabase error fetching appointments by phone:', error)
        console.error('❌ Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      console.log(`✅ Found ${data?.length || 0} appointments for phone: ${phoneNumber}`)
      console.log('📋 Appointments data:', data)

      return { data: data || [], error: null }
    } catch (error: any) {
      console.error('❌ Exception in getByPhone:', error)
      return { data: [], error: error.message || 'خطأ في جلب المواعيد' }
    }
  },

  /**
   * تحديث موعد
   */
  async update(id: string, updates: UpdateAppointmentData): Promise<{ data: Appointment | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      console.log('🔄 Updating appointment:', id, 'with updates:', updates)

      // إذا تم تحديث التاريخ أو الوقت، تحقق من التوفر
      if (updates.appointment_date || updates.appointment_time) {
        const currentAppointment = await this.getById(id)
        if (currentAppointment.error || !currentAppointment.data) {
          return { data: null, error: 'الموعد غير موجود' }
        }

        const newDate = updates.appointment_date || currentAppointment.data.appointment_date
        const newTime = updates.appointment_time || currentAppointment.data.appointment_time

        const isAvailable = await this.checkSlotAvailability(newDate, newTime, id)
        if (!isAvailable) {
          return { data: null, error: 'الموعد الجديد محجوز بالفعل' }
        }
      }

      // تحديث الموعد
      const updateData: any = {}
      if (updates.customer_name !== undefined) updateData.customer_name = updates.customer_name
      if (updates.customer_phone !== undefined) updateData.customer_phone = updates.customer_phone
      if (updates.customer_email !== undefined) updateData.customer_email = updates.customer_email
      if (updates.appointment_date !== undefined) updateData.appointment_date = updates.appointment_date
      if (updates.appointment_time !== undefined) updateData.appointment_time = updates.appointment_time
      if (updates.service_type !== undefined) updateData.service_type = updates.service_type
      if (updates.status !== undefined) updateData.status = updates.status
      if (updates.notes !== undefined) updateData.notes = updates.notes
      if (updates.admin_notes !== undefined) updateData.admin_notes = updates.admin_notes
      if (updates.worker_id !== undefined) updateData.worker_id = updates.worker_id

      console.log('📝 Update data:', updateData)

      const { data, error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('❌ Error updating appointment:', error)
        throw error
      }

      console.log('✅ Appointment updated successfully')

      return { data, error: null }
    } catch (error: any) {
      console.error('❌ Error in update appointment:', error)
      return { data: null, error: error.message || 'خطأ في تحديث الموعد' }
    }
  },

  /**
   * حذف موعد
   */
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase is not configured.' }
    }

    try {
      console.log('🗑️ Deleting appointment:', id)

      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('❌ Error deleting appointment:', error)
        throw error
      }

      console.log('✅ Appointment deleted successfully')

      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error in delete appointment:', error)
      return { success: false, error: error.message || 'خطأ في حذف الموعد' }
    }
  },

  /**
   * التحقق من توفر موعد في تاريخ ووقت محدد
   */
  async checkSlotAvailability(
    date: string,
    time: string,
    excludeAppointmentId?: string
  ): Promise<boolean> {
    try {
      let query = supabase
        .from('appointments')
        .select('id')
        .eq('appointment_date', date)
        .eq('appointment_time', time)
        .neq('status', 'cancelled')

      if (excludeAppointmentId) {
        query = query.neq('id', excludeAppointmentId)
      }

      const { data, error } = await query

      if (error) throw error

      // إذا لم توجد مواعيد، الموعد متاح
      return data.length === 0
    } catch (error) {
      console.error('❌ Error checking slot availability:', error)
      return false
    }
  }
}

