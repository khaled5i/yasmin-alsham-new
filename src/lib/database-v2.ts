// ياسمين الشام - خدمات قاعدة البيانات المحدثة v2.0
// Yasmin Alsham - Updated Database Services v2.0

import { supabase, isSupabaseConfigured } from './supabase'

// ========================================
// أنواع البيانات المحدثة
// ========================================

export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  avatar_url?: string
  role: 'admin' | 'worker' | 'client'
  is_active: boolean
  email_verified: boolean
  phone_verified: boolean
  preferences: Record<string, any>
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface Worker {
  id: string
  user_id: string
  specialty: string
  experience_years: number
  hourly_rate?: number
  performance_rating: number
  total_completed_orders: number
  skills: string[]
  availability: Record<string, any>
  bio?: string
  portfolio_images: string[]
  is_available: boolean
  created_at: string
  updated_at: string
  // علاقات
  user?: User
}

export interface Fabric {
  id: string
  name: string
  name_en?: string
  type: string
  color: string
  color_code?: string
  price_per_meter: number
  stock_quantity: number
  min_stock_level: number
  supplier?: string
  care_instructions?: string
  composition?: string
  width_cm?: number
  weight_gsm?: number
  image_url?: string
  images: string[]
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface Design {
  id: string
  name: string
  name_en?: string
  description?: string
  description_en?: string
  category: string
  subcategory?: string
  base_price: number
  estimated_hours?: number
  difficulty_level: 'easy' | 'medium' | 'hard' | 'expert'
  size_range: string
  main_image?: string
  images: string[]
  pattern_images: string[]
  measurements_required: string[]
  fabric_requirements: Record<string, any>
  customization_options: Record<string, any>
  tags: string[]
  is_featured: boolean
  is_active: boolean
  view_count: number
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  design_id?: string
  name: string
  name_en?: string
  description?: string
  description_en?: string
  sku?: string
  price: number
  sale_price?: number
  cost_price?: number
  category: string
  subcategory?: string
  size: string
  color: string
  fabric_id?: string
  stock_quantity: number
  min_stock_level: number
  main_image?: string
  images: string[]
  weight_grams?: number
  dimensions: Record<string, any>
  care_instructions?: string
  is_featured: boolean
  is_active: boolean
  view_count: number
  created_at: string
  updated_at: string
  // علاقات
  design?: Design
  fabric?: Fabric
}

export interface Appointment {
  id: string
  client_id: string
  worker_id?: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  type: 'consultation' | 'fitting' | 'delivery'
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  service_type?: string
  notes?: string
  client_notes?: string
  worker_notes?: string
  reminder_sent: boolean
  confirmation_sent: boolean
  cancellation_reason?: string
  rescheduled_from?: string
  created_at: string
  updated_at: string
  // علاقات
  client?: User
  worker?: Worker
}

export interface Order {
  id: string
  order_number: string
  client_id: string
  worker_id?: string
  status: 'pending' | 'confirmed' | 'in_progress' | 'fitting' | 'ready' | 'delivered' | 'cancelled'
  order_type: 'custom' | 'ready_made' | 'alteration'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  
  // معلومات التسعير
  subtotal: number
  fabric_cost: number
  labor_cost: number
  additional_costs: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  
  // معلومات الدفع
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded'
  payment_method?: string
  paid_amount: number
  
  // تواريخ مهمة
  estimated_completion_date?: string
  actual_completion_date?: string
  delivery_date?: string
  
  // ملاحظات
  client_notes?: string
  worker_notes?: string
  internal_notes?: string
  
  // معلومات إضافية
  measurements: Record<string, any>
  special_instructions?: string
  rush_order: boolean
  rush_fee: number
  
  created_at: string
  updated_at: string
  
  // علاقات
  client?: User
  worker?: Worker
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  design_id?: string
  product_id?: string
  fabric_id?: string
  item_type: 'design' | 'product' | 'fabric' | 'service'
  name: string
  description?: string
  quantity: number
  unit_price: number
  total_price: number
  customizations: Record<string, any>
  measurements: Record<string, any>
  special_notes?: string
  created_at: string
  updated_at: string
  // علاقات
  design?: Design
  product?: Product
  fabric?: Fabric
}

export interface Favorite {
  id: string
  user_id: string
  design_id: string
  created_at: string
  // علاقات
  design?: Design
}

export interface CartItem {
  id: string
  user_id: string
  design_id?: string
  product_id?: string
  fabric_id?: string
  item_type: 'design' | 'product'
  quantity: number
  customizations: Record<string, any>
  measurements: Record<string, any>
  notes?: string
  created_at: string
  updated_at: string
  // علاقات
  design?: Design
  product?: Product
  fabric?: Fabric
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  data: Record<string, any>
  is_read: boolean
  priority: 'low' | 'normal' | 'high' | 'urgent'
  expires_at?: string
  created_at: string
}

export interface SystemSetting {
  id: string
  key: string
  value: any
  description?: string
  category: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface WorkerReview {
  id: string
  worker_id: string
  client_id: string
  order_id?: string
  rating: number
  review_text?: string
  is_anonymous: boolean
  is_approved: boolean
  created_at: string
  // علاقات
  worker?: Worker
  client?: User
  order?: Order
}

// ========================================
// خدمات قاعدة البيانات المحدثة
// ========================================

// خدمة المستخدمين
export const userService = {
  // تسجيل الدخول
  async signIn(email: string, password: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: { message: 'Supabase not configured' } }
    }
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      return { user: data.user, error }
    } catch (err) {
      console.error('Sign in error:', err)
      return { user: null, error: { message: 'Authentication service unavailable' } }
    }
  },

  // تسجيل الخروج
  async signOut() {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: { message: 'Supabase not configured' } }
    }
    
    try {
      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (err) {
      console.error('Sign out error:', err)
      return { error: { message: 'Authentication service unavailable' } }
    }
  },

  // الحصول على المستخدم الحالي
  async getCurrentUser() {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: { message: 'Supabase not configured' } }
    }
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      return { user, error }
    } catch (err) {
      console.error('Get current user error:', err)
      return { user: null, error: { message: 'Authentication service unavailable' } }
    }
  },

  // الحصول على ملف المستخدم
  async getUserProfile(userId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: { message: 'Supabase not configured' } }
    }
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      
      return { user: data, error }
    } catch (err) {
      console.error('Get user profile error:', err)
      return { user: null, error: { message: 'Failed to get user profile' } }
    }
  },

  // تحديث ملف المستخدم
  async updateUserProfile(userId: string, updates: Partial<User>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single()

      return { user: data, error }
    } catch (err) {
      console.error('Update user profile error:', err)
      return { user: null, error: { message: 'Failed to update user profile' } }
    }
  }
}

// خدمة العمال
export const workerService = {
  // الحصول على جميع العمال
  async getAllWorkers() {
    if (!isSupabaseConfigured() || !supabase) {
      return { workers: [], error: { message: 'Supabase not configured' } }
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

      return { workers: data || [], error }
    } catch (err) {
      console.error('Get workers error:', err)
      return { workers: [], error: { message: 'Failed to get workers' } }
    }
  },

  // الحصول على عامل واحد
  async getWorker(workerId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { worker: null, error: { message: 'Supabase not configured' } }
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

      return { worker: data, error }
    } catch (err) {
      console.error('Get worker error:', err)
      return { worker: null, error: { message: 'Failed to get worker' } }
    }
  },

  // تحديث ملف العامل
  async updateWorker(workerId: string, updates: Partial<Worker>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { worker: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('workers')
        .update(updates)
        .eq('id', workerId)
        .select()
        .single()

      return { worker: data, error }
    } catch (err) {
      console.error('Update worker error:', err)
      return { worker: null, error: { message: 'Failed to update worker' } }
    }
  }
}

// خدمة التصاميم
export const designService = {
  // الحصول على جميع التصاميم
  async getAllDesigns(filters?: { category?: string; featured?: boolean }) {
    if (!isSupabaseConfigured() || !supabase) {
      return { designs: [], error: { message: 'Supabase not configured' } }
    }

    try {
      let query = supabase
        .from('designs')
        .select('*')
        .eq('is_active', true)

      if (filters?.category) {
        query = query.eq('category', filters.category)
      }

      if (filters?.featured) {
        query = query.eq('is_featured', true)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      return { designs: data || [], error }
    } catch (err) {
      console.error('Get designs error:', err)
      return { designs: [], error: { message: 'Failed to get designs' } }
    }
  },

  // الحصول على تصميم واحد
  async getDesign(designId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { design: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('id', designId)
        .eq('is_active', true)
        .single()

      // زيادة عداد المشاهدات
      if (data) {
        await supabase
          .from('designs')
          .update({ view_count: (data.view_count || 0) + 1 })
          .eq('id', designId)
      }

      return { design: data, error }
    } catch (err) {
      console.error('Get design error:', err)
      return { design: null, error: { message: 'Failed to get design' } }
    }
  },

  // إنشاء تصميم جديد
  async createDesign(designData: Omit<Design, 'id' | 'created_at' | 'updated_at' | 'view_count'>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { design: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('designs')
        .insert([designData])
        .select()
        .single()

      return { design: data, error }
    } catch (err) {
      console.error('Create design error:', err)
      return { design: null, error: { message: 'Failed to create design' } }
    }
  }
}

// خدمة المواعيد
export const appointmentService = {
  // الحصول على جميع المواعيد
  async getAllAppointments(filters?: { clientId?: string; workerId?: string; status?: string }) {
    if (!isSupabaseConfigured() || !supabase) {
      return { appointments: [], error: { message: 'Supabase not configured' } }
    }

    try {
      let query = supabase
        .from('appointments')
        .select(`
          *,
          client:users!appointments_client_id_fkey(*),
          worker:workers(*, user:users(*))
        `)

      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId)
      }

      if (filters?.workerId) {
        query = query.eq('worker_id', filters.workerId)
      }

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      const { data, error } = await query.order('appointment_date', { ascending: true })

      return { appointments: data || [], error }
    } catch (err) {
      console.error('Get appointments error:', err)
      return { appointments: [], error: { message: 'Failed to get appointments' } }
    }
  },

  // إنشاء موعد جديد
  async createAppointment(appointmentData: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'reminder_sent' | 'confirmation_sent'>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { appointment: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('appointments')
        .insert([appointmentData])
        .select()
        .single()

      return { appointment: data, error }
    } catch (err) {
      console.error('Create appointment error:', err)
      return { appointment: null, error: { message: 'Failed to create appointment' } }
    }
  },

  // تحديث موعد
  async updateAppointment(appointmentId: string, updates: Partial<Appointment>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { appointment: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', appointmentId)
        .select()
        .single()

      return { appointment: data, error }
    } catch (err) {
      console.error('Update appointment error:', err)
      return { appointment: null, error: { message: 'Failed to update appointment' } }
    }
  }
}

// خدمة الطلبات
export const orderService = {
  // الحصول على جميع الطلبات
  async getAllOrders(filters?: { clientId?: string; workerId?: string; status?: string }) {
    if (!isSupabaseConfigured() || !supabase) {
      return { orders: [], error: { message: 'Supabase not configured' } }
    }

    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          client:users!orders_client_id_fkey(*),
          worker:workers(*, user:users(*)),
          order_items(*, design:designs(*), product:products(*), fabric:fabrics(*))
        `)

      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId)
      }

      if (filters?.workerId) {
        query = query.eq('worker_id', filters.workerId)
      }

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      return { orders: data || [], error }
    } catch (err) {
      console.error('Get orders error:', err)
      return { orders: [], error: { message: 'Failed to get orders' } }
    }
  },

  // الحصول على طلب واحد
  async getOrder(orderId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { order: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          client:users!orders_client_id_fkey(*),
          worker:workers(*, user:users(*)),
          order_items(*, design:designs(*), product:products(*), fabric:fabrics(*))
        `)
        .eq('id', orderId)
        .single()

      return { order: data, error }
    } catch (err) {
      console.error('Get order error:', err)
      return { order: null, error: { message: 'Failed to get order' } }
    }
  },

  // إنشاء طلب جديد
  async createOrder(orderData: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at'>, orderItems: Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'updated_at'>[]) {
    if (!isSupabaseConfigured() || !supabase) {
      return { order: null, error: { message: 'Supabase not configured' } }
    }

    try {
      // إنشاء الطلب
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([orderData])
        .select()
        .single()

      if (orderError || !order) {
        return { order: null, error: orderError }
      }

      // إضافة عناصر الطلب
      const itemsWithOrderId = orderItems.map(item => ({
        ...item,
        order_id: order.id
      }))

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsWithOrderId)
        .select()

      if (itemsError) {
        return { order: null, error: itemsError }
      }

      return { order: { ...order, order_items: items }, error: null }
    } catch (err) {
      console.error('Create order error:', err)
      return { order: null, error: { message: 'Failed to create order' } }
    }
  },

  // تحديث طلب
  async updateOrder(orderId: string, updates: Partial<Order>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { order: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select()
        .single()

      return { order: data, error }
    } catch (err) {
      console.error('Update order error:', err)
      return { order: null, error: { message: 'Failed to update order' } }
    }
  }
}

// خدمة المفضلة
export const favoriteService = {
  // الحصول على مفضلات المستخدم
  async getUserFavorites(userId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { favorites: [], error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('favorites')
        .select(`
          *,
          design:designs(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      return { favorites: data || [], error }
    } catch (err) {
      console.error('Get favorites error:', err)
      return { favorites: [], error: { message: 'Failed to get favorites' } }
    }
  },

  // إضافة إلى المفضلة
  async addToFavorites(userId: string, designId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { favorite: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('favorites')
        .insert([{ user_id: userId, design_id: designId }])
        .select()
        .single()

      return { favorite: data, error }
    } catch (err) {
      console.error('Add to favorites error:', err)
      return { favorite: null, error: { message: 'Failed to add to favorites' } }
    }
  },

  // إزالة من المفضلة
  async removeFromFavorites(userId: string, designId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: { message: 'Supabase not configured' } }
    }

    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('design_id', designId)

      return { error }
    } catch (err) {
      console.error('Remove from favorites error:', err)
      return { error: { message: 'Failed to remove from favorites' } }
    }
  }
}

// خدمة عربة التسوق
export const cartService = {
  // الحصول على عربة التسوق
  async getCartItems(userId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { cartItems: [], error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          *,
          design:designs(*),
          product:products(*),
          fabric:fabrics(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      return { cartItems: data || [], error }
    } catch (err) {
      console.error('Get cart items error:', err)
      return { cartItems: [], error: { message: 'Failed to get cart items' } }
    }
  },

  // إضافة إلى عربة التسوق
  async addToCart(cartItemData: Omit<CartItem, 'id' | 'created_at' | 'updated_at'>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { cartItem: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .insert([cartItemData])
        .select()
        .single()

      return { cartItem: data, error }
    } catch (err) {
      console.error('Add to cart error:', err)
      return { cartItem: null, error: { message: 'Failed to add to cart' } }
    }
  },

  // تحديث عنصر في عربة التسوق
  async updateCartItem(cartItemId: string, updates: Partial<CartItem>) {
    if (!isSupabaseConfigured() || !supabase) {
      return { cartItem: null, error: { message: 'Supabase not configured' } }
    }

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .update(updates)
        .eq('id', cartItemId)
        .select()
        .single()

      return { cartItem: data, error }
    } catch (err) {
      console.error('Update cart item error:', err)
      return { cartItem: null, error: { message: 'Failed to update cart item' } }
    }
  },

  // إزالة من عربة التسوق
  async removeFromCart(cartItemId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: { message: 'Supabase not configured' } }
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', cartItemId)

      return { error }
    } catch (err) {
      console.error('Remove from cart error:', err)
      return { error: { message: 'Failed to remove from cart' } }
    }
  },

  // مسح عربة التسوق
  async clearCart(userId: string) {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: { message: 'Supabase not configured' } }
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId)

      return { error }
    } catch (err) {
      console.error('Clear cart error:', err)
      return { error: { message: 'Failed to clear cart' } }
    }
  }
}
