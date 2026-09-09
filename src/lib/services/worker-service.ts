/**
 * Worker Service - خدمة العمال
 * 
 * هذه الخدمة تتعامل مع جدول workers في Supabase
 * مع fallback للبيانات المحلية في حالة فشل الاتصال
 */

import { supabase, isSupabaseConfigured } from '../supabase'

// ============================================================================
// Types - الأنواع
// ============================================================================

// أنواع العمال المتاحة
export type WorkerType = 'tailor' | 'fabric_store_manager' | 'accountant' | 'general_manager' | 'workshop_manager' | 'shak_worker'

export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  role: 'admin' | 'worker' | 'client'
  is_active: boolean
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Worker {
  id: string
  user_id: string
  specialty: string
  worker_type: WorkerType // نوع العامل
  experience_years: number
  hourly_rate: number
  performance_rating: number
  total_completed_orders: number
  skills: string[]
  availability: Record<string, string>
  bio: string
  portfolio_images: string[]
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface WorkerWithUser extends Worker {
  user: User
}

export interface CreateWorkerData {
  email: string
  password: string
  full_name: string
  phone?: string
  specialty: string
  worker_type: WorkerType // نوع العامل (إجباري عند الإنشاء)
  experience_years?: number
  hourly_rate?: number
  skills?: string[]
  bio?: string
  is_available?: boolean
}

export interface UpdateWorkerData {
  full_name?: string
  email?: string
  phone?: string
  specialty?: string
  worker_type?: WorkerType // نوع العامل (اختياري عند التحديث)
  experience_years?: number
  hourly_rate?: number
  skills?: string[]
  availability?: Record<string, string>
  bio?: string
  portfolio_images?: string[]
  is_available?: boolean
}

// ============================================================================
// Mock Data - بيانات تجريبية (Fallback)
// ============================================================================

const mockWorkers: WorkerWithUser[] = [
  {
    id: 'worker-1',
    user_id: 'user-worker-1',
    specialty: 'فساتين زفاف',
    worker_type: 'tailor',
    experience_years: 8,
    hourly_rate: 50.00,
    performance_rating: 4.8,
    total_completed_orders: 156,
    skills: ['خياطة يدوية', 'تطريز', 'تصميم'],
    availability: {
      sunday: '16:00-22:00',
      monday: '16:00-22:00',
      tuesday: '16:00-22:00',
      wednesday: '16:00-22:00',
      thursday: '16:00-22:00',
      saturday: '16:00-22:00'
    },
    bio: 'خياطة متخصصة في فساتين الزفاف مع خبرة 8 سنوات',
    portfolio_images: [],
    is_available: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user: {
      id: 'user-worker-1',
      email: 'fatima@yasminalsh.com',
      full_name: 'فاطمة أحمد',
      phone: '+966501234567',
      role: 'worker',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  },
  {
    id: 'worker-2',
    user_id: 'user-worker-2',
    specialty: 'فساتين سهرة',
    worker_type: 'tailor',
    experience_years: 5,
    hourly_rate: 40.00,
    performance_rating: 4.6,
    total_completed_orders: 89,
    skills: ['خياطة', 'تفصيل', 'تعديلات'],
    availability: {
      sunday: '14:00-20:00',
      monday: '14:00-20:00',
      wednesday: '14:00-20:00',
      thursday: '14:00-20:00',
      saturday: '14:00-20:00'
    },
    bio: 'خياطة متخصصة في فساتين السهرة والمناسبات',
    portfolio_images: [],
    is_available: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user: {
      id: 'user-worker-2',
      email: 'aisha@yasminalsh.com',
      full_name: 'عائشة محمد',
      phone: '+966502345678',
      role: 'worker',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }
]

// ============================================================================
// Worker Service - خدمة العمال
// ============================================================================

export const workerService = {
  /**
   * جلب جميع العمال مع بيانات المستخدمين
   */
  async getAll(): Promise<{ data: WorkerWithUser[] | null; error: string | null }> {
    // التحقق من تكوين Supabase
    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase not configured, using mock data')
      return { data: mockWorkers, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('workers')
        .select(`
          *,
          user:users(*)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // تحويل البيانات إلى الشكل المطلوب
      const workers = data?.map((worker: any) => ({
        ...worker,
        user: Array.isArray(worker.user) ? worker.user[0] : worker.user
      })) || []

      return { data: workers, error: null }
    } catch (error: any) {
      console.error('❌ Error fetching workers:', error)
      // Fallback to mock data
      return { data: mockWorkers, error: null }
    }
  },

  /**
   * جلب عامل واحد بواسطة ID
   */
  async getById(workerId: string): Promise<{ data: WorkerWithUser | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      const worker = mockWorkers.find(w => w.id === workerId)
      return { data: worker || null, error: worker ? null : 'Worker not found' }
    }

    try {
      const { data, error } = await supabase
        .from('workers')
        .select(`
          *,
          user:users(*)
        `)
        .eq('id', workerId)
        .single()

      if (error) throw error

      const worker = {
        ...data,
        user: Array.isArray(data.user) ? data.user[0] : data.user
      }

      return { data: worker, error: null }
    } catch (error: any) {
      console.error('❌ Error fetching worker:', error)
      const worker = mockWorkers.find(w => w.id === workerId)
      return { data: worker || null, error: worker ? null : 'Worker not found' }
    }
  },

  /**
   * جلب العمال المتاحين فقط
   */
  async getAvailable(): Promise<{ data: WorkerWithUser[] | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      const available = mockWorkers.filter(w => w.is_available)
      return { data: available, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('workers')
        .select(`
          *,
          user:users(*)
        `)
        .eq('is_available', true)
        .order('performance_rating', { ascending: false })

      if (error) throw error

      const workers = data?.map((worker: any) => ({
        ...worker,
        user: Array.isArray(worker.user) ? worker.user[0] : worker.user
      })) || []

      return { data: workers, error: null }
    } catch (error: any) {
      console.error('❌ Error fetching available workers:', error)
      const available = mockWorkers.filter(w => w.is_available)
      return { data: available, error: null }
    }
  },

  /**
   * إنشاء عامل جديد
   * ملاحظة: يجب أن يكون المستخدم الحالي Admin
   * يستخدم API Route لتجنب تغيير جلسة Admin
   */
  async create(workerData: CreateWorkerData): Promise<{ data: WorkerWithUser | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured. Cannot create worker in mock mode.' }
    }

    try {
      console.log('🔧 Creating worker via API:', workerData.email)

      // الحصول على access token من الجلسة الحالية
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No active session - please login again')
      }

      // استدعاء API Route لإنشاء العامل
      const response = await fetch('/api/workers/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(workerData)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'فشل إنشاء العامل')
      }

      console.log('✅ Worker created successfully via API')

      return { data: result.data, error: null }
    } catch (error: any) {
      console.error('❌ Error creating worker:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * تحديث بيانات عامل
   */
  async update(workerId: string, updates: UpdateWorkerData): Promise<{ data: WorkerWithUser | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured. Cannot update worker in mock mode.' }
    }

    try {
      console.log('🔄 Updating worker:', workerId, 'with updates:', updates)

      // 1. الحصول على worker لمعرفة user_id
      const { data: currentWorker, error: fetchError } = await supabase
        .from('workers')
        .select('user_id')
        .eq('id', workerId)
        .single()

      if (fetchError) {
        console.error('❌ Error fetching worker:', fetchError)
        throw fetchError
      }

      if (!currentWorker) {
        throw new Error('Worker not found')
      }

      // 2. تحديث بيانات المستخدم في جدول users (إذا كانت موجودة)
      if (updates.full_name || updates.email || updates.phone) {
        const userUpdates: any = {}
        if (updates.full_name) userUpdates.full_name = updates.full_name
        if (updates.email) userUpdates.email = updates.email
        if (updates.phone) userUpdates.phone = updates.phone

        console.log('👤 Updating user table:', userUpdates)

        const { error: userError } = await supabase
          .from('users')
          .update(userUpdates)
          .eq('id', currentWorker.user_id)

        if (userError) {
          console.error('❌ Error updating users table:', userError)
          throw userError
        }

        console.log('✅ User table updated')
      }

      // 3. تحديث بيانات العامل في جدول workers
      const workerUpdates: any = {}
      if (updates.specialty !== undefined) workerUpdates.specialty = updates.specialty
      if (updates.experience_years !== undefined) workerUpdates.experience_years = updates.experience_years
      if (updates.hourly_rate !== undefined) workerUpdates.hourly_rate = updates.hourly_rate
      if (updates.skills !== undefined) workerUpdates.skills = updates.skills
      if (updates.availability !== undefined) workerUpdates.availability = updates.availability
      if (updates.bio !== undefined) workerUpdates.bio = updates.bio
      if (updates.portfolio_images !== undefined) workerUpdates.portfolio_images = updates.portfolio_images
      if (updates.is_available !== undefined) workerUpdates.is_available = updates.is_available

      console.log('👷 Updating workers table:', workerUpdates)

      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .update(workerUpdates)
        .eq('id', workerId)
        .select(`
          *,
          user:users(*)
        `)
        .single()

      if (workerError) {
        console.error('❌ Error updating workers table:', workerError)
        throw workerError
      }

      console.log('✅ Workers table updated')

      const worker = {
        ...workerData,
        user: Array.isArray(workerData.user) ? workerData.user[0] : workerData.user
      }

      console.log('✅ Worker updated successfully:', worker)

      return { data: worker, error: null }
    } catch (error: any) {
      console.error('❌ Error updating worker:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * حذف عامل
   * يستخدم API Route لحذف المستخدم من Auth أيضاً
   */
  async delete(workerId: string): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase is not configured. Cannot delete worker in mock mode.' }
    }

    try {
      console.log('🗑️ Deleting worker via API:', workerId)

      // الحصول على access token من الجلسة الحالية
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No active session - please login again')
      }

      // استدعاء API Route لحذف العامل
      const response = await fetch(`/api/workers/delete?id=${workerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'فشل حذف العامل')
      }

      console.log('✅ Worker deleted successfully via API')

      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error deleting worker:', error)
      return { success: false, error: error.message }
    }
  }
}

