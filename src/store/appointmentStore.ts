/**
 * Appointment Store - متجر المواعيد
 * 
 * إدارة حالة المواعيد باستخدام Zustand و Supabase
 */

import { create } from 'zustand'
import { 
  appointmentService, 
  Appointment, 
  CreateAppointmentData, 
  UpdateAppointmentData 
} from '@/lib/services/appointment-service'

// ============================================================================
// Types
// ============================================================================

interface AppointmentState {
  // البيانات
  appointments: Appointment[]
  isLoading: boolean
  error: string | null

  // الإجراءات
  loadAppointments: (filters?: {
    status?: string
    date?: string
    worker_id?: string
    customer_phone?: string
  }) => Promise<void>
  
  createAppointment: (data: CreateAppointmentData) => Promise<{ success: boolean; error: string | null; data?: Appointment }>
  
  updateAppointment: (id: string, updates: UpdateAppointmentData) => Promise<{ success: boolean; error: string | null }>
  
  deleteAppointment: (id: string) => Promise<{ success: boolean; error: string | null }>
  
  getAppointmentsByPhone: (phoneNumber: string) => Promise<{ success: boolean; data: Appointment[]; error: string | null }>
  
  clearError: () => void
  
  reset: () => void
}

// ============================================================================
// Store
// ============================================================================

export const useAppointmentStore = create<AppointmentState>((set, get) => ({
  // الحالة الأولية
  appointments: [],
  isLoading: false,
  error: null,

  // ============================================================================
  // تحميل المواعيد
  // ============================================================================
  loadAppointments: async (filters) => {
    set({ isLoading: true, error: null })

    try {
      console.log('📋 Loading appointments...', filters)

      const result = await appointmentService.getAll(filters)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return
      }

      set({ 
        appointments: result.data, 
        isLoading: false,
        error: null 
      })

      console.log(`✅ Loaded ${result.data.length} appointments`)
    } catch (error: any) {
      console.error('❌ Error loading appointments:', error)
      set({ 
        error: error.message || 'خطأ في تحميل المواعيد', 
        isLoading: false 
      })
    }
  },

  // ============================================================================
  // إنشاء موعد جديد
  // ============================================================================
  createAppointment: async (data) => {
    set({ isLoading: true, error: null })

    try {
      console.log('📅 Creating new appointment...', data)

      const result = await appointmentService.create(data)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error }
      }

      // إضافة الموعد الجديد إلى القائمة
      set(state => ({
        appointments: [result.data!, ...state.appointments],
        isLoading: false,
        error: null
      }))

      console.log('✅ Appointment created successfully:', result.data!.id)

      return { success: true, error: null, data: result.data! }
    } catch (error: any) {
      console.error('❌ Error creating appointment:', error)
      const errorMessage = error.message || 'خطأ في إنشاء الموعد'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // تحديث موعد
  // ============================================================================
  updateAppointment: async (id, updates) => {
    set({ isLoading: true, error: null })

    try {
      console.log('🔄 Updating appointment:', id, updates)

      const result = await appointmentService.update(id, updates)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error }
      }

      // تحديث الموعد في القائمة
      set(state => ({
        appointments: state.appointments.map(apt =>
          apt.id === id ? result.data! : apt
        ),
        isLoading: false,
        error: null
      }))

      console.log('✅ Appointment updated successfully')

      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error updating appointment:', error)
      const errorMessage = error.message || 'خطأ في تحديث الموعد'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // حذف موعد
  // ============================================================================
  deleteAppointment: async (id) => {
    set({ isLoading: true, error: null })

    try {
      console.log('🗑️ Deleting appointment:', id)

      const result = await appointmentService.delete(id)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error }
      }

      // إزالة الموعد من القائمة
      set(state => ({
        appointments: state.appointments.filter(apt => apt.id !== id),
        isLoading: false,
        error: null
      }))

      console.log('✅ Appointment deleted successfully')

      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error deleting appointment:', error)
      const errorMessage = error.message || 'خطأ في حذف الموعد'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // الحصول على مواعيد زبون برقم الهاتف
  // ============================================================================
  getAppointmentsByPhone: async (phoneNumber) => {
    set({ isLoading: true, error: null })

    try {
      console.log('📞 Fetching appointments for phone:', phoneNumber)

      const result = await appointmentService.getByPhone(phoneNumber)

      set({ isLoading: false })

      if (result.error) {
        return { success: false, data: [], error: result.error }
      }

      console.log(`✅ Found ${result.data.length} appointments`)

      return { success: true, data: result.data, error: null }
    } catch (error: any) {
      console.error('❌ Error fetching appointments by phone:', error)
      const errorMessage = error.message || 'خطأ في جلب المواعيد'
      set({ error: errorMessage, isLoading: false })
      return { success: false, data: [], error: errorMessage }
    }
  },

  // ============================================================================
  // مسح الخطأ
  // ============================================================================
  clearError: () => {
    set({ error: null })
  },

  // ============================================================================
  // إعادة تعيين الحالة
  // ============================================================================
  reset: () => {
    set({
      appointments: [],
      isLoading: false,
      error: null
    })
  }
}))

