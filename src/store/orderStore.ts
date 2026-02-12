/**
 * Order Store - مخزن الطلبات مع Supabase
 * يتعامل مع جميع عمليات الطلبات باستخدام Supabase
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Server-side pagination: loads only one page at a time
 * - Server-side status filtering: DB filters instead of client-side
 * - Optimistic loading: Show cached data immediately while fetching
 * - Smart caching: Skip redundant fetches within 30 seconds
 * - isRefreshing vs isLoading: Only show loading UI when no cached data
 * - Console logging guarded behind isDev
 */

'use client'

import { create } from 'zustand'
import { orderService, Order, CreateOrderData, UpdateOrderData } from '@/lib/services/order-service'
import { onCacheInvalidation } from '@/store/authStore'

const isDev = process.env.NODE_ENV === 'development'

// Smart fetch TTL: 30 seconds - skip redundant fetches within this window
const FETCH_TTL_MS = 30 * 1000

// ============================================================================
// أنواع البيانات
// ============================================================================

interface OrderState {
  // البيانات
  orders: Order[]
  currentOrder: Order | null
  totalOrders: number | null  // total count from server for pagination

  // حالة التحميل
  isLoading: boolean       // True only if we have NO cached orders AND are fetching
  isRefreshing: boolean    // True when fetching in background (already have cached orders)
  lastFetchedAt: number | null  // Timestamp of last successful fetch
  lastFilters: string | null    // Serialized last-used filters for cache validation
  error: string | null

  // العمليات الأساسية
  loadOrders: (filters?: {
    status?: string | string[]
    worker_id?: string
    user_id?: string
    payment_status?: string
    page?: number
    pageSize?: number
    lightweight?: boolean
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

  // إحصائيات (computed from current page of orders)
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
  totalOrders: null,
  isLoading: false,
  isRefreshing: false,
  lastFetchedAt: null,
  lastFilters: null,
  error: null,

  // ============================================================================
  // تحميل الطلبات (with pagination & server-side filtering)
  // ============================================================================
  loadOrders: async (filters) => {
    const state = get()
    const now = Date.now()
    const filtersKey = JSON.stringify(filters || {})

    // OPTIMIZATION: Skip redundant fetches if data is fresh AND filters haven't changed
    if (
      state.lastFetchedAt &&
      (now - state.lastFetchedAt) < FETCH_TTL_MS &&
      state.lastFilters === filtersKey
    ) {
      if (isDev) console.log('⚡ Orders data is fresh, skipping fetch')
      return
    }

    // OPTIMISTIC LOADING: If we have cached orders, don't show loading spinner
    const hasCachedOrders = state.orders.length > 0

    if (hasCachedOrders) {
      set({ isRefreshing: true, error: null })
    } else {
      set({ isLoading: true, error: null })
    }

    try {
      if (isDev) console.log('📋 Loading orders...', filters)

      const result = await orderService.getAll(filters)

      if (result.error) {
        set({ error: result.error, isLoading: false, isRefreshing: false, lastFetchedAt: null })
        return
      }

      set({
        orders: result.data,
        totalOrders: result.total ?? null,
        isLoading: false,
        isRefreshing: false,
        lastFetchedAt: Date.now(),
        lastFilters: filtersKey,
        error: null
      })

      if (isDev) console.log(`✅ Loaded ${result.data.length} orders (total: ${result.total})`)
    } catch (error: any) {
      console.error('❌ Error loading orders:', error.message)
      set({
        error: error.message || 'خطأ في تحميل الطلبات',
        isLoading: false,
        isRefreshing: false,
        lastFetchedAt: null
      })
    }
  },

  // ============================================================================
  // تحميل طلب واحد بواسطة ID (full data including measurements)
  // ============================================================================
  loadOrderById: async (id) => {
    set({ isLoading: true, error: null })

    try {
      if (isDev) console.log('🔍 Loading order by ID:', id)

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

      if (isDev) console.log('✅ Order loaded successfully')
    } catch (error: any) {
      console.error('❌ Error loading order:', error.message)
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
      if (isDev) console.log('🔍 Loading order by number:', orderNumber)

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

      if (isDev) console.log('✅ Order loaded successfully')
    } catch (error: any) {
      console.error('❌ Error loading order:', error.message)
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
      if (isDev) console.log('📞 Loading orders by phone:', phoneNumber)

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

      if (isDev) console.log(`✅ Loaded ${result.data.length} orders`)
    } catch (error: any) {
      console.error('❌ Error loading orders:', error.message)
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
      if (isDev) console.log('📦 Creating order')

      const result = await orderService.create(orderData)

      if (result.error || !result.data) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error || 'خطأ في إنشاء الطلب' }
      }

      // إضافة الطلب الجديد إلى القائمة
      set((state) => ({
        orders: [result.data!, ...state.orders],
        totalOrders: state.totalOrders !== null ? state.totalOrders + 1 : null,
        isLoading: false,
        error: null
      }))

      if (isDev) console.log('✅ Order created successfully:', result.data.id)
      return { success: true, data: result.data }
    } catch (error: any) {
      console.error('❌ Error creating order:', error.message)
      const errorMessage = error.message || 'خطأ في إنشاء الطلب'
      set({ error: errorMessage, isLoading: false })
      return { success: false, error: errorMessage }
    }
  },

  // ============================================================================
  // تحديث طلب
  // ============================================================================
  updateOrder: async (id, updates) => {
    // OPTIMISTIC UI: Don't block the entire UI during update  
    // Only set isLoading if no orders are cached
    const hasCachedOrders = get().orders.length > 0
    if (!hasCachedOrders) {
      set({ isLoading: true, error: null })
    } else {
      set({ error: null })
    }

    try {
      if (isDev) console.log('🔄 Updating order:', id)

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

      if (isDev) console.log('✅ Order updated successfully')
      return { success: true, data: result.data }
    } catch (error: any) {
      console.error('❌ Error updating order:', error.message)
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
      if (isDev) console.log('🗑️ Deleting order:', id)

      const result = await orderService.delete(id)

      if (result.error) {
        set({ error: result.error, isLoading: false })
        return { success: false, error: result.error }
      }

      // حذف الطلب من القائمة
      set((state) => ({
        orders: state.orders.filter(order => order.id !== id),
        currentOrder: state.currentOrder?.id === id ? null : state.currentOrder,
        totalOrders: state.totalOrders !== null ? Math.max(0, state.totalOrders - 1) : null,
        isLoading: false,
        error: null
      }))

      if (isDev) console.log('✅ Order deleted successfully')
      return { success: true }
    } catch (error: any) {
      console.error('❌ Error deleting order:', error.message)
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
    if (isDev) console.log('🔄 Force refreshing orders...')
    set({ lastFetchedAt: null, lastFilters: null })
    await get().loadOrders()
  },

  // ============================================================================
  // إحصائيات (computed from current page of orders)
  // ============================================================================
  getStats: () => {
    const { orders } = get()

    // Pre-compute in a single pass for O(n) instead of 8x O(n)
    let pendingOrders = 0
    let inProgressOrders = 0
    let completedOrders = 0
    let deliveredOrders = 0
    let cancelledOrders = 0
    let totalRevenue = 0
    let paidAmount = 0
    let unpaidAmount = 0

    for (const order of orders) {
      const price = Number(order.price)
      const paid = Number(order.paid_amount)

      switch (order.status) {
        case 'pending': pendingOrders++; break
        case 'in_progress': inProgressOrders++; break
        case 'completed': completedOrders++; break
        case 'delivered': deliveredOrders++; break
        case 'cancelled': cancelledOrders++; break
      }

      if (order.status !== 'cancelled') {
        totalRevenue += price
      }

      paidAmount += paid

      if (order.payment_status !== 'paid') {
        unpaidAmount += price - paid
      }
    }

    return {
      totalOrders: orders.length,
      pendingOrders,
      inProgressOrders,
      completedOrders,
      deliveredOrders,
      cancelledOrders,
      activeOrders: pendingOrders + inProgressOrders,
      totalRevenue,
      paidAmount,
      unpaidAmount
    }
  }
}))

// AUTO-INVALIDATION: When auth state changes (login/logout/token refresh),
// clear the fetch cache so orders are re-fetched with the new credentials.
if (typeof window !== 'undefined') {
  onCacheInvalidation(() => {
    if (isDev) console.log('🔄 orderStore: Auth cache invalidation received, clearing fetch cache')
    useOrderStore.setState({ lastFetchedAt: null, lastFilters: null })
  })
}
