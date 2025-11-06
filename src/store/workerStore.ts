/**
 * Worker Store - مخزن العمال
 * 
 * هذا المخزن يدير حالة العمال مع دعم Supabase
 * مع fallback للبيانات المحلية
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workerService, type WorkerWithUser, type CreateWorkerData, type UpdateWorkerData } from '@/lib/services/worker-service'

// ============================================================================
// Types
// ============================================================================

interface WorkerState {
  // البيانات
  workers: WorkerWithUser[]
  isLoading: boolean
  error: string | null

  // الإجراءات
  loadWorkers: () => Promise<void>
  loadAvailableWorkers: () => Promise<void>
  getWorker: (workerId: string) => WorkerWithUser | undefined
  createWorker: (workerData: CreateWorkerData) => Promise<{ success: boolean; error: string | null }>
  updateWorker: (workerId: string, updates: UpdateWorkerData) => Promise<{ success: boolean; error: string | null }>
  deleteWorker: (workerId: string) => Promise<{ success: boolean; error: string | null }>
  clearError: () => void
  
  // إحصائيات
  getStats: () => {
    totalWorkers: number
    availableWorkers: number
    totalCompletedOrders: number
    averageRating: number
  }
}

// ============================================================================
// Worker Store
// ============================================================================

export const useWorkerStore = create<WorkerState>()(
  persist(
    (set, get) => ({
      // البيانات الأولية
      workers: [],
      isLoading: false,
      error: null,

      /**
       * تحميل جميع العمال من Supabase
       */
      loadWorkers: async () => {
        set({ isLoading: true, error: null })

        try {
          const { data, error } = await workerService.getAll()

          if (error) {
            set({ error, isLoading: false })
            return
          }

          set({ workers: data || [], isLoading: false })
          console.log('✅ تم تحميل العمال من Supabase:', data?.length || 0)
        } catch (error: any) {
          console.error('❌ خطأ في تحميل العمال:', error)
          set({ error: error.message, isLoading: false })
        }
      },

      /**
       * تحميل العمال المتاحين فقط
       */
      loadAvailableWorkers: async () => {
        set({ isLoading: true, error: null })

        try {
          const { data, error } = await workerService.getAvailable()

          if (error) {
            set({ error, isLoading: false })
            return
          }

          set({ workers: data || [], isLoading: false })
          console.log('✅ تم تحميل العمال المتاحين:', data?.length || 0)
        } catch (error: any) {
          console.error('❌ خطأ في تحميل العمال المتاحين:', error)
          set({ error: error.message, isLoading: false })
        }
      },

      /**
       * الحصول على عامل واحد
       */
      getWorker: (workerId: string) => {
        const state = get()
        return state.workers.find(w => w.id === workerId)
      },

      /**
       * إنشاء عامل جديد
       */
      createWorker: async (workerData: CreateWorkerData) => {
        set({ isLoading: true, error: null })

        try {
          const { data, error } = await workerService.create(workerData)

          if (error) {
            set({ error, isLoading: false })
            return { success: false, error }
          }

          // إضافة العامل الجديد إلى القائمة
          if (data) {
            set((state) => ({
              workers: [...state.workers, data],
              isLoading: false
            }))
          }

          console.log('✅ تم إنشاء عامل جديد:', data)
          return { success: true, error: null }
        } catch (error: any) {
          console.error('❌ خطأ في إنشاء عامل:', error)
          set({ error: error.message, isLoading: false })
          return { success: false, error: error.message }
        }
      },

      /**
       * تحديث بيانات عامل
       */
      updateWorker: async (workerId: string, updates: UpdateWorkerData) => {
        set({ isLoading: true, error: null })

        try {
          const { data, error } = await workerService.update(workerId, updates)

          if (error) {
            set({ error, isLoading: false })
            return { success: false, error }
          }

          // تحديث العامل في القائمة
          if (data) {
            set((state) => ({
              workers: state.workers.map(w => w.id === workerId ? data : w),
              isLoading: false
            }))
          }

          console.log('✅ تم تحديث العامل:', workerId)
          return { success: true, error: null }
        } catch (error: any) {
          console.error('❌ خطأ في تحديث العامل:', error)
          set({ error: error.message, isLoading: false })
          return { success: false, error: error.message }
        }
      },

      /**
       * حذف عامل
       */
      deleteWorker: async (workerId: string) => {
        set({ isLoading: true, error: null })

        try {
          const { success, error } = await workerService.delete(workerId)

          if (error) {
            set({ error, isLoading: false })
            return { success: false, error }
          }

          // إزالة العامل من القائمة
          set((state) => ({
            workers: state.workers.filter(w => w.id !== workerId),
            isLoading: false
          }))

          console.log('✅ تم حذف العامل:', workerId)
          return { success: true, error: null }
        } catch (error: any) {
          console.error('❌ خطأ في حذف العامل:', error)
          set({ error: error.message, isLoading: false })
          return { success: false, error: error.message }
        }
      },

      /**
       * مسح الأخطاء
       */
      clearError: () => {
        set({ error: null })
      },

      /**
       * الحصول على إحصائيات العمال
       */
      getStats: () => {
        const state = get()
        const totalWorkers = state.workers.length
        const availableWorkers = state.workers.filter(w => w.is_available).length
        const totalCompletedOrders = state.workers.reduce((sum, w) => sum + w.total_completed_orders, 0)
        const averageRating = totalWorkers > 0
          ? state.workers.reduce((sum, w) => sum + w.performance_rating, 0) / totalWorkers
          : 0

        return {
          totalWorkers,
          availableWorkers,
          totalCompletedOrders,
          averageRating: Math.round(averageRating * 10) / 10
        }
      }
    }),
    {
      name: 'yasmin-workers-storage',
      // حفظ البيانات في localStorage كـ cache
      partialize: (state) => ({
        workers: state.workers
      })
    }
  )
)

