'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// تعريف نوع المنتج
export interface Product {
  id: string
  name: string
  price: number
  image: string
  description?: string
  category?: string
  sizes?: string[]
  colors?: string[]
}

// تعريف عنصر السلة
export interface CartItem extends Product {
  quantity: number
  selectedSize?: string
  selectedColor?: string
}

// تعريف حالة المتجر
interface ShopState {
  // المفضلة
  favorites: Product[]
  addToFavorites: (product: Product) => void
  removeFromFavorites: (productId: string) => void
  isFavorite: (productId: string) => boolean
  clearFavorites: () => void

  // السلة
  cart: CartItem[]
  addToCart: (product: Product, quantity?: number, size?: string, color?: string) => void
  removeFromCart: (productId: string) => void
  isInCart: (productId: string) => boolean
  updateCartItemQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  getCartTotal: () => number
  getCartItemsCount: () => number

  // حالة التحميل
  isLoading: boolean
  setLoading: (loading: boolean) => void
}

// إنشاء المتجر
export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      // المفضلة
      favorites: [],
      
      addToFavorites: (product: Product) => {
        const { favorites } = get()
        if (!favorites.find(item => item.id === product.id)) {
          set({ favorites: [...favorites, product] })
        }
      },

      removeFromFavorites: (productId: string) => {
        const { favorites } = get()
        set({ favorites: favorites.filter(item => item.id !== productId) })
      },

      isFavorite: (productId: string) => {
        const { favorites } = get()
        return favorites.some(item => item.id === productId)
      },

      clearFavorites: () => {
        set({ favorites: [] })
      },

      // السلة
      cart: [],

      addToCart: (product: Product, quantity = 1, size?: string, color?: string) => {
        const { cart } = get()
        const existingItem = cart.find(item => 
          item.id === product.id && 
          item.selectedSize === size && 
          item.selectedColor === color
        )

        if (existingItem) {
          // إذا كان المنتج موجود، زيادة الكمية
          set({
            cart: cart.map(item =>
              item.id === product.id && 
              item.selectedSize === size && 
              item.selectedColor === color
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          })
        } else {
          // إضافة منتج جديد
          const newItem: CartItem = {
            ...product,
            quantity,
            selectedSize: size,
            selectedColor: color
          }
          set({ cart: [...cart, newItem] })
        }
      },

      removeFromCart: (productId: string) => {
        const { cart } = get()
        set({ cart: cart.filter(item => item.id !== productId) })
      },

      isInCart: (productId: string) => {
        const { cart } = get()
        return cart.some(item => item.id === productId)
      },

      updateCartItemQuantity: (productId: string, quantity: number) => {
        const { cart } = get()
        if (quantity <= 0) {
          set({ cart: cart.filter(item => item.id !== productId) })
        } else {
          set({
            cart: cart.map(item =>
              item.id === productId ? { ...item, quantity } : item
            )
          })
        }
      },

      clearCart: () => {
        set({ cart: [] })
      },

      getCartTotal: () => {
        const { cart } = get()
        return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
      },

      getCartItemsCount: () => {
        const { cart } = get()
        return cart.reduce((total, item) => total + item.quantity, 0)
      },

      // حالة التحميل
      isLoading: false,
      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      }
    }),
    {
      name: 'yasmin-alsham-shop',
      partialize: (state) => ({
        favorites: state.favorites,
        cart: state.cart
      })
    }
  )
)

// دالة مساعدة لتنسيق السعر
export const formatPrice = (price: number): string => {
  return `${price.toLocaleString('en')} ريال`
}

// دالة مساعدة لإنشاء رسالة واتساب للسلة
export const generateWhatsAppMessage = (cart: CartItem[]): string => {
  if (cart.length === 0) return ''

  let message = '🌸 *طلب جديد من ياسمين الشام* 🌸\n\n'
  message += '📋 *تفاصيل الطلب:*\n'
  
  cart.forEach((item, index) => {
    message += `\n${index + 1}. *${item.name}*\n`
    message += `   💰 السعر: ${formatPrice(item.price)}\n`
    message += `   📦 الكمية: ${item.quantity}\n`
    
    if (item.selectedSize) {
      message += `   📏 المقاس: ${item.selectedSize}\n`
    }
    
    if (item.selectedColor) {
      message += `   🎨 اللون: ${item.selectedColor}\n`
    }
    
    message += `   💵 المجموع الفرعي: ${formatPrice(item.price * item.quantity)}\n`
  })

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  message += `\n💰 *إجمالي الطلب: ${formatPrice(total)}*\n\n`
  message += '📞 يرجى التواصل معي لتأكيد الطلب وترتيب التسليم.\n'
  message += '🙏 شكراً لكم'

  return encodeURIComponent(message)
}
