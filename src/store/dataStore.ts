import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// تعريف أنواع البيانات
export interface Appointment {
  id: string
  clientName: string
  clientPhone: string
  appointmentDate: string
  appointmentTime: string
  notes?: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  clientName: string
  clientPhone: string
  description: string
  fabric: string
  measurements: {
    // المقاسات الأساسية
    shoulder?: number // الكتف
    shoulderCircumference?: number // دوران الكتف
    chest?: number // الصدر
    waist?: number // الخصر
    hips?: number // الأرداف

    // مقاسات التفصيل المتقدمة
    dartLength?: number // طول البنس
    bodiceLength?: number // طول الصدرية
    neckline?: number // فتحة الصدر
    armpit?: number // الإبط

    // مقاسات الأكمام
    sleeveLength?: number // طول الكم
    forearm?: number // الزند
    cuff?: number // الأسوارة

    // مقاسات الطول
    frontLength?: number // طول الأمام
    backLength?: number // طول الخلف

    // للتوافق مع النظام القديم (سيتم إزالتها لاحقاً)
    length?: number // طول الفستان (قديم)
    shoulders?: number // عرض الكتف (قديم)
    sleeves?: number // طول الأكمام (قديم)
  }
  price: number
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  assignedWorker?: string
  dueDate: string
  notes?: string
  voiceNotes?: Array<{
    id: string
    data: string
    timestamp: number
    duration?: number
  }> // ملاحظات صوتية متعددة
  images?: string[] // مصفوفة من base64 strings للصور
  completedImages?: string[] // صور العمل المكتمل (للعمال فقط)
  createdAt: string
  updatedAt: string
}

export interface Worker {
  id: string
  email: string
  password: string
  full_name: string
  phone: string
  specialty: string
  role: 'worker'
  is_active: boolean
  createdAt: string
  updatedAt: string
}

interface DataState {
  // البيانات
  appointments: Appointment[]
  orders: Order[]
  workers: Worker[]
  
  // حالة التحميل
  isLoading: boolean
  error: string | null

  // إدارة المواعيد
  addAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateAppointment: (id: string, updates: Partial<Appointment>) => void
  deleteAppointment: (id: string) => void
  getAppointment: (id: string) => Appointment | undefined

  // إدارة الطلبات
  addOrder: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateOrder: (id: string, updates: Partial<Order>) => void
  deleteOrder: (id: string) => void
  getOrder: (id: string) => Order | undefined

  // دوال خاصة للعمال
  startOrderWork: (orderId: string, workerId: string) => void
  completeOrder: (orderId: string, workerId: string, completedImages?: string[]) => void

  // إدارة العمال
  addWorker: (worker: Omit<Worker, 'id' | 'createdAt' | 'updatedAt' | 'role'>) => void
  updateWorker: (id: string, updates: Partial<Worker>) => void
  deleteWorker: (id: string) => void
  getWorker: (id: string) => Worker | undefined

  // وظائف مساعدة
  clearError: () => void
  loadData: () => void
  
  // إحصائيات
  getStats: () => {
    totalAppointments: number
    totalOrders: number
    totalWorkers: number
    pendingAppointments: number
    activeOrders: number
    completedOrders: number
    totalRevenue: number
  }
}

// توليد ID فريد
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      // البيانات الأولية
      appointments: [],
      orders: [],
      workers: [],
      isLoading: false,
      error: null,

      // إدارة المواعيد
      addAppointment: (appointmentData) => {
        const appointment: Appointment = {
          ...appointmentData,
          id: generateId(),
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        set((state) => ({
          appointments: [...state.appointments, appointment],
          error: null
        }))

        console.log('✅ تم إضافة موعد جديد:', appointment)
      },

      updateAppointment: (id, updates) => {
        set((state) => ({
          appointments: state.appointments.map(appointment =>
            appointment.id === id
              ? { ...appointment, ...updates, updatedAt: new Date().toISOString() }
              : appointment
          ),
          error: null
        }))

        console.log('✅ تم تحديث الموعد:', id)
      },

      deleteAppointment: (id) => {
        set((state) => ({
          appointments: state.appointments.filter(appointment => appointment.id !== id),
          error: null
        }))

        console.log('✅ تم حذف الموعد:', id)
      },

      getAppointment: (id) => {
        const state = get()
        return state.appointments.find(appointment => appointment.id === id)
      },

      // إدارة الطلبات
      addOrder: (orderData) => {
        const order: Order = {
          ...orderData,
          id: generateId(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        set((state) => ({
          orders: [...state.orders, order],
          error: null
        }))

        console.log('✅ تم إضافة طلب جديد:', order)
      },

      updateOrder: (id, updates) => {
        set((state) => ({
          orders: state.orders.map(order =>
            order.id === id
              ? { ...order, ...updates, updatedAt: new Date().toISOString() }
              : order
          ),
          error: null
        }))

        console.log('✅ تم تحديث الطلب:', id)
      },

      deleteOrder: (id) => {
        set((state) => ({
          orders: state.orders.filter(order => order.id !== id),
          error: null
        }))

        console.log('✅ تم حذف الطلب:', id)
      },

      getOrder: (id) => {
        const state = get()
        return state.orders.find(order => order.id === id)
      },

      // إدارة العمال
      addWorker: (workerData) => {
        const worker: Worker = {
          ...workerData,
          id: generateId(),
          role: 'worker',
          is_active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        set((state) => ({
          workers: [...state.workers, worker],
          error: null
        }))

        // إضافة العامل إلى نظام المصادقة
        if (typeof window !== 'undefined') {
          const users = JSON.parse(localStorage.getItem('yasmin-users') || '[]')
          users.push({
            id: worker.id,
            email: worker.email,
            password: worker.password,
            full_name: worker.full_name,
            role: 'worker',
            is_active: true
          })
          localStorage.setItem('yasmin-users', JSON.stringify(users))
        }

        console.log('✅ تم إضافة عامل جديد:', worker)
      },

      updateWorker: (id, updates) => {
        set((state) => ({
          workers: state.workers.map(worker =>
            worker.id === id
              ? { ...worker, ...updates, updatedAt: new Date().toISOString() }
              : worker
          ),
          error: null
        }))

        // تحديث بيانات المصادقة إذا تم تغيير البريد أو كلمة المرور
        if (updates.email || updates.password || updates.full_name) {
          if (typeof window !== 'undefined') {
            const users = JSON.parse(localStorage.getItem('yasmin-users') || '[]')
            const userIndex = users.findIndex((user: any) => user.id === id)
            if (userIndex !== -1) {
              if (updates.email) users[userIndex].email = updates.email
              if (updates.password) users[userIndex].password = updates.password
              if (updates.full_name) users[userIndex].full_name = updates.full_name
              localStorage.setItem('yasmin-users', JSON.stringify(users))
            }
          }
        }

        console.log('✅ تم تحديث العامل:', id)
      },

      deleteWorker: (id) => {
        set((state) => ({
          workers: state.workers.filter(worker => worker.id !== id),
          error: null
        }))

        // حذف من نظام المصادقة
        if (typeof window !== 'undefined') {
          const users = JSON.parse(localStorage.getItem('yasmin-users') || '[]')
          const filteredUsers = users.filter((user: any) => user.id !== id)
          localStorage.setItem('yasmin-users', JSON.stringify(filteredUsers))
        }

        console.log('✅ تم حذف العامل:', id)
      },

      getWorker: (id) => {
        const state = get()
        return state.workers.find(worker => worker.id === id)
      },

      // دوال خاصة للعمال
      startOrderWork: (orderId, workerId) => {
        set((state) => ({
          orders: state.orders.map(order =>
            order.id === orderId && order.assignedWorker === workerId
              ? { ...order, status: 'in_progress', updatedAt: new Date().toISOString() }
              : order
          ),
          error: null
        }))

        console.log('✅ تم بدء العمل في الطلب:', orderId)
      },

      completeOrder: (orderId, workerId, completedImages = []) => {
        set((state) => ({
          orders: state.orders.map(order =>
            order.id === orderId && order.assignedWorker === workerId
              ? {
                  ...order,
                  status: 'completed',
                  completedImages: completedImages.length > 0 ? completedImages : undefined,
                  updatedAt: new Date().toISOString()
                }
              : order
          ),
          error: null
        }))

        console.log('✅ تم إنهاء الطلب:', orderId)
      },

      // وظائف مساعدة
      clearError: () => {
        set({ error: null })
      },

      loadData: () => {
        set({ isLoading: true })
        // البيانات محفوظة تلقائياً بواسطة persist middleware
        set({ isLoading: false })
      },

      // إحصائيات
      getStats: () => {
        const state = get()
        return {
          totalAppointments: state.appointments.length,
          totalOrders: state.orders.length,
          totalWorkers: state.workers.length,
          pendingAppointments: state.appointments.filter(a => a.status === 'pending').length,
          activeOrders: state.orders.filter(o => ['pending', 'in_progress'].includes(o.status)).length,
          completedOrders: state.orders.filter(o => o.status === 'completed').length,
          totalRevenue: state.orders
            .filter(o => o.status === 'completed')
            .reduce((sum, order) => sum + order.price, 0)
        }
      }
    }),
    {
      name: 'yasmin-data-storage',
      partialize: (state) => ({
        appointments: state.appointments,
        orders: state.orders,
        workers: state.workers
      })
    }
  )
)
