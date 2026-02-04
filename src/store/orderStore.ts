/**
 * Order Store - مخزن الطلبات مع Supabase
 * يتعامل مع جميع عمليات الطلبات باستخدام Supabase
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Optimistic loading: Show cached data immediately while fetching
 * - Smart caching: Skip redundant fetches within 30 seconds
 * - isRefreshing vs isLoading: Only show loading UI when no cached data
 */

'use client'

import { create } from 'zustand'
import { orderService, Order, CreateOrderData, UpdateOrderData } from '@/lib/services/order-service'

// Smart fetch TTL: 30 seconds - skip redundant fetches within this window
const FETCH_TTL_MS = 30 * 1000

// ============================================================================
// أنواع البيانات
// ============================================================================

interface OrderState {
  // البيانات
  orders: Order[]
  currentOrder: Order | null

  // حالة التحميل
  isLoading: boolean       // True only if we have NO cached orders AND are fetching
  isRefreshing: boolean    // True when fetching in background (already have cached orders)
  lastFetchedAt: number | null  // Timestamp of last successful fetch
  error: string | null

  // العمليات الأساسية
  loadOrders: (filters?: {
    status?: string
    worker_id?: string
    user_id?: string
    payment_status?: string
  }) => Promise<void>

  loadOrderById: (id: string) => Promise<void>
  loadOrderByNumber: (orderNumber: string) => Promise<void>
  loadOrdersByPhone: (phoneNumber: string) => Promise<void>

  createOrder: (orderData: CreateOrderData) => Promise<{ success: boolean; data?: Order; error?: string }>
  updateOrder: (id: string, updates: UpdateOrderData) => Promise<{ success: boolean; data?: Order; error?: string }>
  deleteOrder: (id: string) => Promise<{ success: boolean; error?: string }>

  // عمليات خاصة بالعمال
  startOrderWork: (orderId: string) => Promise<{ success: boolean; error?: string }>
  completeOrder: (orderId: string, completedImages?: string[]) => Promise<{ success: boolean; error?: string }>

  // وظائف مساعدة
  clearError: () => void
  clearCurrentOrder: () => void
  forceRefresh: () => Promise<void>  // Force a fresh fetch, bypassing cache

  // إحصائيات
  getStats: () => {
    totalOrders: number
    pendingOrders: number
    inProgressOrders: number
    completedOrders: number
    deliveredOrders: number
    cancelledOrders: number
    activeOrders: number
    totalRevenue: number
    paidAmount: number
    unpaidAmount: number
  }
}

// ============================================================================
// إنشاء المخزن
// ============================================================================

export const useOrderStore = create<OrderState>((set, get) => ({
  // البيانات الأولية
  orders: [],
  currentOrder: null,
  isLoading: false,
  isRefreshing: false,
  lastFetchedAt: null,
  error: null,

  // ============================================================================
  // تحميل الطلبات
  // ============================================================================
  loadOrders: async (filters) => {
    const state = get()
    const now = Date.now()

    // OPTIMIZATION: Skip redundant fetches if data is fresh
    if (state.lastFetchedAt && (now - state.lastFetchedAt) < FETCH_TTL_MS) {
      console.log('⚡ Orders data is fresh, skipping fetch')
      return
    }

    // OPTIMISTIC LOADING: If we have cached orders, don't show loading spinner
    // Instead, show "refreshing" which doesn't block the UI
    const hasCachedOrders = state.orders.length > 0

    if (hasCachedOrders) {
      // We have cached data - refresh in background
      set({ isRefreshing: true, error: null })
    } else {
      // No cached data - show loading spinner
      set({ isLoading: true, error: null })
    }

    try {
      console.log('📋 Loading orders...', filters)

      const result = await orderService.getAll(filters)

      if (result.error) {
        set({ error: result.error, isLoading: false, isRefreshing: false })
        return
      }

      set({
        orders: result.data,
        isLoading: false,
        isRefreshing: false,
        lastFetchedAt: Date.now(),
        error: null
      })

      console.log(`✅ Loaded ${result.data.length} orders`)
    } catch (error: any) {
      console.error('❌ Error loading orders:', error)
      set({
        error: error.message || 'خطأ في تحميل الطلبات',
        isLoading: false,
        isRefreshing: false
      })
    }
  },

  // ============================================================================
  // تحميل طلب واحد بواسطة ID
  // ============================================================================
  loadOrderById: async (id) => {
    set({ isLoading: true, error: null })

    try {
      console.log('🔍 Loading order by ID:', id)

      const result = await orderService.getById(id)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return
      }

      set({
        currentOrder: result.data,
        isLoading: false,
        error: null
      })

      console.log('✅ Order loaded successfully')
    } catch (error: any) {
      console.error('❌ Error loading order:', error)
      set({
        error: error.message || 'خطأ في تحميل الطلب',
        isLoading: false
      })
    }
  },

  // ============================================================================
  // تحميل طلب بواسطة رقم الطلب
  // ============================================================================
  loadOrderByNumber: async (orderNumber) => {
    set({ isLoading: true, error: null })

    try {
      console.log('🔍 Loading order by number:', orderNumber)

      const result = await orderService.getByOrderNumber(orderNumber)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return
      }

      set({
        currentOrder: result.data,
        isLoading: false,
        error: null
      })

      console.log('✅ Order loaded successfully')
    } catch (error: any) {
      console.error('❌ Error loading order:', error)
      set({
        error: error.message || 'خطأ في تحميل الطلب',
        isLoading: false
      })
    }
  },

  // ============================================================================
  // تحميل طلبات العميل بواسطة رقم الهاتف
  // ============================================================================
  loadOrdersByPhone: async (phoneNumber) => {
    set({ isLoading: true, error: null })

    try {
      console.log('📞 Loading orders by phone:', phoneNumber)

      const result = await orderService.getByPhone(phoneNumber)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return
      }

      set({
        orders: result.data,
        isLoading: false,
        error: null
      })

      console.log(`✅ Loaded ${result.data.length} orders`)
    } catch (error: any) {
      console.error('❌ Error loading orders:', error)
      set({
        error: error.message || 'خطأ في تحميل الطلبات',
        isLoading: false
      })
    }
  },

  // ============================================================================
  // إنشاء طلب جديد
  // ============================================================================
  createOrder: async (orderData) => {
    set({ isLoading: true, error: null })

    try {
      console.log('📦 Creating order:', orderData)

      const result = await orderService.create(orderData)

      if (result.error || !result.data) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error || 'خطأ في إنشاء الطلب' }
      }

      // إضافة الطلب الجديد إلى القائمة
      set((state) => ({
        orders: [result.data!, ...state.orders],
        isLoading: false,
        error: null
      }))

      console.log('✅ Order created successfully:', result.data.id)
      return { success: true, data: result.data }
    } catch (error: any) {
      console.error('❌ Error creating order:', error)
      const errorMessage = error.message || 'خطأ في إنشاء الطلب'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // تحديث طلب
  // ============================================================================
  updateOrder: async (id, updates) => {
    set({ isLoading: true, error: null })

    try {
      console.log('🔄 Updating order:', id)

      const result = await orderService.update(id, updates)

      if (result.error || !result.data) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error || 'خطأ في تحديث الطلب' }
      }

      // تحديث الطلب في القائمة
      set((state) => ({
        orders: state.orders.map(order =>
          order.id === id ? result.data! : order
        ),
        currentOrder: state.currentOrder?.id === id ? result.data : state.currentOrder,
        isLoading: false,
        error: null
      }))

      console.log('✅ Order updated successfully')
      return { success: true, data: result.data }
    } catch (error: any) {
      console.error('❌ Error updating order:', error)
      const errorMessage = error.message || 'خطأ في تحديث الطلب'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // حذف طلب
  // ============================================================================
  deleteOrder: async (id) => {
    set({ isLoading: true, error: null })

    try {
      console.log('🗑️ Deleting order:', id)

      const result = await orderService.delete(id)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error }
      }

      // حذف الطلب من القائمة
      set((state) => ({
        orders: state.orders.filter(order => order.id !== id),
        currentOrder: state.currentOrder?.id === id ? null : state.currentOrder,
        isLoading: false,
        error: null
      }))

      console.log('✅ Order deleted successfully')
      return { success: true }
    } catch (error: any) {
      console.error('❌ Error deleting order:', error)
      const errorMessage = error.message || 'خطأ في حذف الطلب'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // بدء العمل في الطلب (للعمال)
  // ============================================================================
  startOrderWork: async (orderId) => {
    return get().updateOrder(orderId, { status: 'in_progress' })
  },

  // ============================================================================
  // إنهاء الطلب (للعمال)
  // ============================================================================
  completeOrder: async (orderId, completedImages) => {
    return get().updateOrder(orderId, {
      status: 'completed',
      completed_images: completedImages || []
    })
  },

  // ============================================================================
  // وظائف مساعدة
  // ============================================================================
  clearError: () => {
    set({ error: null })
  },

  clearCurrentOrder: () => {
    set({ currentOrder: null })
  },

  // Force a fresh fetch, bypassing the cache TTL
  forceRefresh: async () => {
    console.log('🔄 Force refreshing orders...')
    set({ lastFetchedAt: null })  // Clear the cache timestamp
    await get().loadOrders()
  },

  // ============================================================================
  // إحصائيات
  // ============================================================================
  getStats: () => {
    const { orders } = get()

    return {
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      inProgressOrders: orders.filter(o => o.status === 'in_progress').length,
      completedOrders: orders.filter(o => o.status === 'completed').length,
      deliveredOrders: orders.filter(o => o.status === 'delivered').length,
      cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
      activeOrders: orders.filter(o => ['pending', 'in_progress'].includes(o.status)).length,
      totalRevenue: orders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, order) => sum + Number(order.price), 0),
      paidAmount: orders
        .reduce((sum, order) => sum + Number(order.paid_amount), 0),
      unpaidAmount: orders
        .filter(o => o.payment_status !== 'paid')
        .reduce((sum, order) => sum + (Number(order.price) - Number(order.paid_amount)), 0)
    }
  }
}))

