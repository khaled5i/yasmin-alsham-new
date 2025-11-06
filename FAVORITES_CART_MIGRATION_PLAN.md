# 🛒 خطة نقل المفضلة والسلة من localStorage إلى Supabase
## Favorites & Cart Migration to Supabase - Comprehensive Plan

**التاريخ:** 2025-11-03  
**المشروع:** Yasmin Al-Sham  
**الهدف:** نقل ميزات المفضلة (Favorites) والسلة (Cart) من localStorage إلى قاعدة بيانات Supabase

---

## 📋 جدول المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [التحليل الحالي](#التحليل-الحالي)
3. [المرحلة 1: تصميم مخطط قاعدة البيانات](#المرحلة-1-تصميم-مخطط-قاعدة-البيانات)
4. [المرحلة 2: طبقة الخدمات](#المرحلة-2-طبقة-الخدمات)
5. [المرحلة 3: تكامل الواجهة الأمامية](#المرحلة-3-تكامل-الواجهة-الأمامية)
6. [المرحلة 4: الترحيل والاختبار](#المرحلة-4-الترحيل-والاختبار)
7. [الدروس المستفادة](#الدروس-المستفادة)
8. [الجدول الزمني](#الجدول-الزمني)

---

## 🎯 نظرة عامة

### الوضع الحالي
- **المفضلة (Favorites):** محفوظة في localStorage عبر Zustand persist
- **السلة (Cart):** محفوظة في localStorage عبر Zustand persist
- **المشكلة:** البيانات محلية فقط، لا تتزامن بين الأجهزة، تُفقد عند مسح المتصفح

### الهدف المطلوب
- ✅ نقل البيانات إلى Supabase
- ✅ دعم المستخدمين المجهولين (Anonymous/Guest Users)
- ✅ مزامنة البيانات بين الأجهزة للمستخدمين المسجلين
- ✅ الحفاظ على جميع الوظائف الحالية
- ✅ تحسين الأداء والأمان

### المتطلبات الأساسية
1. **دعم المستخدمين المجهولين:** يجب أن يتمكن الضيوف من إضافة عناصر للسلة والمفضلة بدون تسجيل دخول
2. **سياسات RLS صحيحة:** تسمح للمستخدمين المجهولين بالتفاعل مع البيانات
3. **استمرارية الوظائف:** جميع الميزات الحالية تعمل بسلاسة بعد الترحيل
4. **أنماط الكود:** اتباع المعمارية الحالية في المشروع

---

## 🔍 التحليل الحالي

### 1. الملفات المتأثرة

#### أ. Store (Zustand)
- **`src/store/shopStore.ts`**
  - يحتوي على `favorites` و `cart` في localStorage
  - يستخدم Zustand persist middleware
  - الدوال: `addToFavorites`, `removeFromFavorites`, `addToCart`, `removeFromCart`, إلخ

#### ب. المكونات (Components)
- **`src/app/favorites/page.tsx`** - صفحة المفضلة
- **`src/app/cart/page.tsx`** - صفحة السلة
- **`src/app/designs/page.tsx`** - عرض التصاميم مع أزرار المفضلة والسلة
- **`src/app/designs/[id]/page.tsx`** - تفاصيل التصميم
- **`src/components/Header.tsx`** - عرض عدد العناصر في السلة والمفضلة

#### ج. قاعدة البيانات الحالية
- **الجداول موجودة بالفعل:**
  - `favorites` - جدول المفضلة
  - `cart_items` - جدول السلة
- **المشكلة:** سياسات RLS الحالية تتطلب مصادقة (`auth.uid()`)

### 2. التحديات الرئيسية

#### التحدي 1: المستخدمون المجهولون
**المشكلة:**
```sql
-- السياسة الحالية تتطلب مصادقة
CREATE POLICY "Authenticated users can add to cart"
ON cart_items FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**الحل المطلوب:**
- استخدام `session_id` للمستخدمين المجهولين
- تحديث سياسات RLS للسماح بالعمليات بناءً على `session_id`

#### التحدي 2: تعريف الجلسة (Session Identification)
**الخيارات:**
1. **UUID محلي في localStorage** (الأبسط)
2. **Supabase Anonymous Auth** (الأكثر أماناً)
3. **Fingerprinting** (معقد)

**الاختيار:** UUID محلي + ترقية اختيارية لـ Anonymous Auth

#### التحدي 3: الترحيل من localStorage
- البيانات الموجودة في localStorage يجب نقلها
- يجب التعامل مع حالات الفشل (fallback)

---

## 🗄️ المرحلة 1: تصميم مخطط قاعدة البيانات

### 1.1 تحديث جدول المفضلة (Favorites)

#### التصميم الجديد
```sql
-- تحديث جدول المفضلة لدعم المستخدمين المجهولين
ALTER TABLE favorites 
  ADD COLUMN session_id TEXT,
  ALTER COLUMN user_id DROP NOT NULL;

-- إضافة قيد للتأكد من وجود user_id أو session_id
ALTER TABLE favorites 
  ADD CONSTRAINT favorites_user_or_session_check 
  CHECK (
    (user_id IS NOT NULL AND session_id IS NULL) OR 
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- إضافة فهرس للأداء
CREATE INDEX idx_favorites_session_id ON favorites(session_id);

-- تحديث القيد الفريد
DROP INDEX IF EXISTS favorites_user_id_design_id_key;
CREATE UNIQUE INDEX favorites_unique_user_design 
  ON favorites(user_id, design_id) 
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX favorites_unique_session_design 
  ON favorites(session_id, design_id) 
  WHERE session_id IS NOT NULL;
```

### 1.2 تحديث جدول السلة (Cart Items)

```sql
-- تحديث جدول السلة لدعم المستخدمين المجهولين
ALTER TABLE cart_items 
  ADD COLUMN session_id TEXT,
  ALTER COLUMN user_id DROP NOT NULL;

-- إضافة قيد للتأكد من وجود user_id أو session_id
ALTER TABLE cart_items 
  ADD CONSTRAINT cart_items_user_or_session_check 
  CHECK (
    (user_id IS NOT NULL AND session_id IS NULL) OR 
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- إضافة فهرس للأداء
CREATE INDEX idx_cart_items_session_id ON cart_items(session_id);

-- إضافة عمود لتتبع آخر نشاط (لتنظيف السلات القديمة)
ALTER TABLE cart_items 
  ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger لتحديث last_activity_at
CREATE OR REPLACE FUNCTION update_cart_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cart_items_activity_trigger
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION update_cart_last_activity();
```

### 1.3 سياسات RLS الجديدة

#### سياسات المفضلة (Favorites)
```sql
-- حذف السياسات القديمة
DROP POLICY IF EXISTS "Users can view their own favorites" ON favorites;
DROP POLICY IF EXISTS "Authenticated users can add favorites" ON favorites;
DROP POLICY IF EXISTS "Users can delete their own favorites" ON favorites;

-- سياسات جديدة تدعم المستخدمين المجهولين

-- 1. القراءة: المستخدمون المسجلون أو الجلسات
CREATE POLICY "Users and sessions can view their favorites"
ON favorites FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL)
);

-- 2. الإضافة: المستخدمون المسجلون أو الجلسات
CREATE POLICY "Users and sessions can add favorites"
ON favorites FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND session_id IS NULL) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL AND user_id IS NULL)
);

-- 3. الحذف: المستخدمون المسجلون أو الجلسات
CREATE POLICY "Users and sessions can delete their favorites"
ON favorites FOR DELETE
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL)
);
```

#### سياسات السلة (Cart Items)
```sql
-- حذف السياسات القديمة
DROP POLICY IF EXISTS "Users can view their own cart" ON cart_items;
DROP POLICY IF EXISTS "Authenticated users can add to cart" ON cart_items;
DROP POLICY IF EXISTS "Users can update their own cart" ON cart_items;
DROP POLICY IF EXISTS "Users can delete from their own cart" ON cart_items;

-- سياسات جديدة تدعم المستخدمين المجهولين

-- 1. القراءة
CREATE POLICY "Users and sessions can view their cart"
ON cart_items FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL)
);

-- 2. الإضافة
CREATE POLICY "Users and sessions can add to cart"
ON cart_items FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND session_id IS NULL) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL AND user_id IS NULL)
);

-- 3. التحديث
CREATE POLICY "Users and sessions can update their cart"
ON cart_items FOR UPDATE
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL)
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL)
);

-- 4. الحذف
CREATE POLICY "Users and sessions can delete from their cart"
ON cart_items FOR DELETE
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL)
);
```

### 1.4 دوال مساعدة

```sql
-- دالة لنقل بيانات الجلسة إلى المستخدم عند تسجيل الدخول
CREATE OR REPLACE FUNCTION merge_session_to_user(
  p_session_id TEXT,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- نقل المفضلة
  UPDATE favorites 
  SET user_id = p_user_id, session_id = NULL
  WHERE session_id = p_session_id
  ON CONFLICT (user_id, design_id) DO NOTHING;
  
  -- حذف المفضلة المكررة
  DELETE FROM favorites WHERE session_id = p_session_id;
  
  -- نقل السلة
  UPDATE cart_items 
  SET user_id = p_user_id, session_id = NULL
  WHERE session_id = p_session_id;
  
  -- حذف السلة المكررة (يمكن دمجها بدلاً من الحذف)
  DELETE FROM cart_items 
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لتنظيف السلات القديمة (تشغل كـ cron job)
CREATE OR REPLACE FUNCTION cleanup_old_carts()
RETURNS VOID AS $$
BEGIN
  -- حذف السلات التي لم يتم استخدامها منذ 30 يوم
  DELETE FROM cart_items 
  WHERE session_id IS NOT NULL 
    AND last_activity_at < NOW() - INTERVAL '30 days';
    
  -- حذف المفضلة للجلسات القديمة (اختياري)
  DELETE FROM favorites 
  WHERE session_id IS NOT NULL 
    AND created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## ⚙️ المرحلة 2: طبقة الخدمات

### 2.1 إنشاء ملف الخدمات

**الملف:** `src/lib/services/favorites-cart-service.ts`

#### هيكل الملف

```typescript
/**
 * Favorites & Cart Service
 * خدمة المفضلة والسلة
 *
 * تدعم المستخدمين المسجلين والمجهولين
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// Types & Interfaces
// ============================================

export interface Favorite {
  id: string
  user_id?: string
  session_id?: string
  design_id: string
  created_at: string
  design?: any // سيتم جلبها من جدول designs
}

export interface CartItem {
  id: string
  user_id?: string
  session_id?: string
  design_id: string
  quantity: number
  selected_size?: string
  selected_color?: string
  customizations?: any
  created_at: string
  updated_at: string
  last_activity_at: string
  design?: any // سيتم جلبها من جدول designs
}

// ============================================
// Session Management
// ============================================

const SESSION_KEY = 'yasmin-session-id'

/**
 * الحصول على session_id أو إنشاء واحد جديد
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''

  let sessionId = localStorage.getItem(SESSION_KEY)

  if (!sessionId) {
    sessionId = uuidv4()
    localStorage.setItem(SESSION_KEY, sessionId)
    console.log('🆔 Created new session ID:', sessionId)
  }

  return sessionId
}

/**
 * الحصول على معرف المستخدم أو الجلسة
 */
function getUserOrSessionId(): { userId: string | null; sessionId: string | null } {
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return { userId: user.id, sessionId: null }
  }

  return { userId: null, sessionId: getOrCreateSessionId() }
}

/**
 * دمج بيانات الجلسة مع المستخدم عند تسجيل الدخول
 */
export async function mergeSessionToUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const sessionId = localStorage.getItem(SESSION_KEY)
  if (!sessionId) return

  try {
    console.log('🔄 Merging session data to user...', { userId, sessionId })

    // استدعاء الدالة في قاعدة البيانات
    const { error } = await supabase.rpc('merge_session_to_user', {
      p_session_id: sessionId,
      p_user_id: userId
    })

    if (error) throw error

    console.log('✅ Session data merged successfully')

    // مسح session_id بعد الدمج
    localStorage.removeItem(SESSION_KEY)
  } catch (error) {
    console.error('❌ Error merging session data:', error)
  }
}
```

### 2.2 خدمة المفضلة (Favorites Service)

```typescript
// ============================================
// Favorites Service
// ============================================

export const FavoritesService = {
  /**
   * جلب جميع المفضلة
   */
  async getAll(): Promise<{ data: Favorite[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      let query = supabase
        .from('favorites')
        .select('*, design:designs(*)')
        .order('created_at', { ascending: false })

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { data, error } = await query

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error: any) {
      console.error('❌ Error fetching favorites:', error)
      return { data: [], error: error.message }
    }
  },

  /**
   * إضافة تصميم للمفضلة
   */
  async add(designId: string): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      const { error } = await supabase
        .from('favorites')
        .insert({
          design_id: designId,
          user_id: userId,
          session_id: sessionId
        })

      if (error) throw error

      console.log('✅ Added to favorites:', designId)
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error adding to favorites:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * إزالة تصميم من المفضلة
   */
  async remove(designId: string): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      let query = supabase
        .from('favorites')
        .delete()
        .eq('design_id', designId)

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { error } = await query

      if (error) throw error

      console.log('✅ Removed from favorites:', designId)
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error removing from favorites:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * التحقق من وجود تصميم في المفضلة
   */
  async isFavorite(designId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      let query = supabase
        .from('favorites')
        .select('id')
        .eq('design_id', designId)
        .limit(1)

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { data, error } = await query

      if (error) throw error

      return (data?.length || 0) > 0
    } catch (error) {
      console.error('❌ Error checking favorite:', error)
      return false
    }
  },

  /**
   * مسح جميع المفضلة
   */
  async clear(): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      let query = supabase.from('favorites').delete()

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { error } = await query

      if (error) throw error

      console.log('✅ Cleared all favorites')
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error clearing favorites:', error)
      return { success: false, error: error.message }
    }
  }
}
```

### 2.3 خدمة السلة (Cart Service)

```typescript
// ============================================
// Cart Service
// ============================================

export const CartService = {
  /**
   * جلب جميع عناصر السلة
   */
  async getAll(): Promise<{ data: CartItem[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      let query = supabase
        .from('cart_items')
        .select('*, design:designs(*)')
        .order('created_at', { ascending: false })

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { data, error } = await query

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error: any) {
      console.error('❌ Error fetching cart:', error)
      return { data: [], error: error.message }
    }
  },

  /**
   * إضافة عنصر للسلة
   */
  async add(item: {
    designId: string
    quantity?: number
    selectedSize?: string
    selectedColor?: string
    customizations?: any
  }): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      const { error } = await supabase
        .from('cart_items')
        .insert({
          design_id: item.designId,
          quantity: item.quantity || 1,
          selected_size: item.selectedSize,
          selected_color: item.selectedColor,
          customizations: item.customizations,
          user_id: userId,
          session_id: sessionId
        })

      if (error) throw error

      console.log('✅ Added to cart:', item.designId)
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error adding to cart:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * تحديث عنصر في السلة
   */
  async update(
    itemId: string,
    updates: {
      quantity?: number
      selectedSize?: string
      selectedColor?: string
      customizations?: any
    }
  ): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .update({
          quantity: updates.quantity,
          selected_size: updates.selectedSize,
          selected_color: updates.selectedColor,
          customizations: updates.customizations
        })
        .eq('id', itemId)

      if (error) throw error

      console.log('✅ Updated cart item:', itemId)
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error updating cart item:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * إزالة عنصر من السلة
   */
  async remove(itemId: string): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      console.log('✅ Removed from cart:', itemId)
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error removing from cart:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * مسح السلة
   */
  async clear(): Promise<{ success: boolean; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' }
    }

    try {
      const { userId, sessionId } = await getUserOrSessionId()

      let query = supabase.from('cart_items').delete()

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (sessionId) {
        query = query.eq('session_id', sessionId)
      }

      const { error } = await query

      if (error) throw error

      console.log('✅ Cleared cart')
      return { success: true, error: null }
    } catch (error: any) {
      console.error('❌ Error clearing cart:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * حساب إجمالي السلة
   */
  async getTotal(): Promise<number> {
    const { data } = await this.getAll()

    return data.reduce((total, item) => {
      const price = item.design?.price || 0
      return total + (price * item.quantity)
    }, 0)
  }
}
```

---

## 🎨 المرحلة 3: تكامل الواجهة الأمامية

### 3.1 تحديث Zustand Store

**الملف:** `src/store/shopStore.ts`

#### التغييرات المطلوبة

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { FavoritesService, CartService, mergeSessionToUser } from '@/lib/services/favorites-cart-service'

// ... (الأنواع الموجودة)

interface ShopState {
  // المنتجات من Supabase (لا تتغير)
  products: Product[]
  loadProducts: () => Promise<void>
  getProductById: (id: string) => Product | undefined

  // المفضلة - الآن من Supabase
  favorites: Product[]
  loadFavorites: () => Promise<void>
  addToFavorites: (product: Product) => Promise<void>
  removeFromFavorites: (productId: string) => Promise<void>
  isFavorite: (productId: string) => boolean
  clearFavorites: () => Promise<void>

  // السلة - الآن من Supabase
  cart: CartItem[]
  loadCart: () => Promise<void>
  addToCart: (product: Product, quantity?: number, size?: string, color?: string) => Promise<void>
  removeFromCart: (productId: string) => Promise<void>
  isInCart: (productId: string) => boolean
  updateCartItemQuantity: (productId: string, quantity: number) => Promise<void>
  clearCart: () => Promise<void>
  getCartTotal: () => number
  getCartItemsCount: () => number

  // حالة التحميل
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
}

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      // المنتجات (لا تتغير)
      products: [],
      loadProducts: async () => {
        // ... الكود الموجود
      },
      getProductById: (id: string) => {
        // ... الكود الموجود
      },

      // ============================================
      // المفضلة - الآن من Supabase
      // ============================================
      favorites: [],

      loadFavorites: async () => {
        if (!isSupabaseConfigured()) {
          // Fallback: تحميل من localStorage
          const stored = localStorage.getItem('yasmin-favorites')
          if (stored) {
            set({ favorites: JSON.parse(stored) })
          }
          return
        }

        try {
          const { data, error } = await FavoritesService.getAll()

          if (error) throw new Error(error)

          // تحويل البيانات إلى Product[]
          const favorites = data.map(fav => fav.design).filter(Boolean)
          set({ favorites })
        } catch (error) {
          console.error('Error loading favorites:', error)
          // Fallback: تحميل من localStorage
          const stored = localStorage.getItem('yasmin-favorites')
          if (stored) {
            set({ favorites: JSON.parse(stored) })
          }
        }
      },

      addToFavorites: async (product: Product) => {
        const { favorites } = get()

        // تحديث الحالة المحلية فوراً (Optimistic Update)
        if (!favorites.find(item => item.id === product.id)) {
          set({ favorites: [...favorites, product] })
        }

        if (!isSupabaseConfigured()) {
          // Fallback: حفظ في localStorage
          localStorage.setItem('yasmin-favorites', JSON.stringify([...favorites, product]))
          return
        }

        try {
          const { success, error } = await FavoritesService.add(product.id)

          if (!success) throw new Error(error || 'Failed to add to favorites')

          // إعادة تحميل المفضلة للتأكد من المزامنة
          await get().loadFavorites()
        } catch (error) {
          console.error('Error adding to favorites:', error)
          // التراجع عن التحديث المتفائل
          set({ favorites: favorites.filter(item => item.id !== product.id) })
        }
      },

      removeFromFavorites: async (productId: string) => {
        const { favorites } = get()

        // تحديث الحالة المحلية فوراً (Optimistic Update)
        const newFavorites = favorites.filter(item => item.id !== productId)
        set({ favorites: newFavorites })

        if (!isSupabaseConfigured()) {
          // Fallback: حفظ في localStorage
          localStorage.setItem('yasmin-favorites', JSON.stringify(newFavorites))
          return
        }

        try {
          const { success, error } = await FavoritesService.remove(productId)

          if (!success) throw new Error(error || 'Failed to remove from favorites')
        } catch (error) {
          console.error('Error removing from favorites:', error)
          // التراجع عن التحديث المتفائل
          await get().loadFavorites()
        }
      },

      isFavorite: (productId: string) => {
        const { favorites } = get()
        return favorites.some(item => item.id === productId)
      },

      clearFavorites: async () => {
        const { favorites } = get()

        // تحديث الحالة المحلية فوراً
        set({ favorites: [] })

        if (!isSupabaseConfigured()) {
          localStorage.removeItem('yasmin-favorites')
          return
        }

        try {
          const { success, error } = await FavoritesService.clear()

          if (!success) throw new Error(error || 'Failed to clear favorites')
        } catch (error) {
          console.error('Error clearing favorites:', error)
          // التراجع عن التحديث المتفائل
          set({ favorites })
        }
      },

      // ============================================
      // السلة - الآن من Supabase
      // ============================================
      cart: [],

      loadCart: async () => {
        if (!isSupabaseConfigured()) {
          // Fallback: تحميل من localStorage
          const stored = localStorage.getItem('yasmin-cart')
          if (stored) {
            set({ cart: JSON.parse(stored) })
          }
          return
        }

        try {
          const { data, error } = await CartService.getAll()

          if (error) throw new Error(error)

          // تحويل البيانات إلى CartItem[]
          const cart = data.map(item => ({
            id: item.design_id,
            name: item.design?.name || '',
            price: item.design?.price || 0,
            image: item.design?.image_url || '',
            quantity: item.quantity,
            selectedSize: item.selected_size,
            selectedColor: item.selected_color,
            customizations: item.customizations
          }))

          set({ cart })
        } catch (error) {
          console.error('Error loading cart:', error)
          // Fallback: تحميل من localStorage
          const stored = localStorage.getItem('yasmin-cart')
          if (stored) {
            set({ cart: JSON.parse(stored) })
          }
        }
      },

      addToCart: async (product: Product, quantity = 1, size?: string, color?: string) => {
        const { cart } = get()

        // تحديث الحالة المحلية فوراً
        const existingItem = cart.find(item => item.id === product.id)

        let newCart: CartItem[]
        if (existingItem) {
          newCart = cart.map(item =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + quantity }
              : item
          )
        } else {
          newCart = [
            ...cart,
            {
              id: product.id,
              name: product.name,
              price: product.price,
              image: product.image_url,
              quantity,
              selectedSize: size,
              selectedColor: color
            }
          ]
        }

        set({ cart: newCart })

        if (!isSupabaseConfigured()) {
          localStorage.setItem('yasmin-cart', JSON.stringify(newCart))
          return
        }

        try {
          const { success, error } = await CartService.add({
            designId: product.id,
            quantity,
            selectedSize: size,
            selectedColor: color
          })

          if (!success) throw new Error(error || 'Failed to add to cart')

          // إعادة تحميل السلة للتأكد من المزامنة
          await get().loadCart()
        } catch (error) {
          console.error('Error adding to cart:', error)
          // التراجع عن التحديث المتفائل
          set({ cart })
        }
      },

      removeFromCart: async (productId: string) => {
        const { cart } = get()

        // تحديث الحالة المحلية فوراً
        const newCart = cart.filter(item => item.id !== productId)
        set({ cart: newCart })

        if (!isSupabaseConfigured()) {
          localStorage.setItem('yasmin-cart', JSON.stringify(newCart))
          return
        }

        try {
          // البحث عن العنصر في قاعدة البيانات
          const { data } = await CartService.getAll()
          const item = data.find(i => i.design_id === productId)

          if (item) {
            const { success, error } = await CartService.remove(item.id)
            if (!success) throw new Error(error || 'Failed to remove from cart')
          }
        } catch (error) {
          console.error('Error removing from cart:', error)
          // التراجع عن التحديث المتفائل
          await get().loadCart()
        }
      },

      isInCart: (productId: string) => {
        const { cart } = get()
        return cart.some(item => item.id === productId)
      },

      updateCartItemQuantity: async (productId: string, quantity: number) => {
        const { cart } = get()

        if (quantity < 1) {
          await get().removeFromCart(productId)
          return
        }

        // تحديث الحالة المحلية فوراً
        const newCart = cart.map(item =>
          item.id === productId ? { ...item, quantity } : item
        )
        set({ cart: newCart })

        if (!isSupabaseConfigured()) {
          localStorage.setItem('yasmin-cart', JSON.stringify(newCart))
          return
        }

        try {
          const { data } = await CartService.getAll()
          const item = data.find(i => i.design_id === productId)

          if (item) {
            const { success, error } = await CartService.update(item.id, { quantity })
            if (!success) throw new Error(error || 'Failed to update cart item')
          }
        } catch (error) {
          console.error('Error updating cart item:', error)
          // التراجع عن التحديث المتفائل
          set({ cart })
        }
      },

      clearCart: async () => {
        const { cart } = get()

        // تحديث الحالة المحلية فوراً
        set({ cart: [] })

        if (!isSupabaseConfigured()) {
          localStorage.removeItem('yasmin-cart')
          return
        }

        try {
          const { success, error } = await CartService.clear()
          if (!success) throw new Error(error || 'Failed to clear cart')
        } catch (error) {
          console.error('Error clearing cart:', error)
          // التراجع عن التحديث المتفائل
          set({ cart })
        }
      },

      getCartTotal: () => {
        const { cart } = get()
        return cart.reduce((total, item) => total + item.price * item.quantity, 0)
      },

      getCartItemsCount: () => {
        const { cart } = get()
        return cart.reduce((total, item) => total + item.quantity, 0)
      },

      // حالة التحميل
      isLoading: false,
      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      error: null,
      setError: (error: string | null) => {
        set({ error })
      }
    }),
    {
      name: 'yasmin-alsham-shop',
      partialize: (state) => ({
        // لا نحفظ favorites و cart في localStorage بعد الآن
        // فقط products (إذا لزم الأمر)
      })
    }
  )
)
```

### 3.2 تحديث AuthStore لدمج البيانات عند تسجيل الدخول

**الملف:** `src/store/authStore.ts`

```typescript
import { mergeSessionToUser } from '@/lib/services/favorites-cart-service'

// في دالة signIn، بعد تسجيل الدخول بنجاح:
signIn: async (email: string, password: string) => {
  // ... الكود الموجود

  if (authData.user) {
    // دمج بيانات الجلسة مع المستخدم
    await mergeSessionToUser(authData.user.id)

    // إعادة تحميل المفضلة والسلة
    const { loadFavorites, loadCart } = useShopStore.getState()
    await Promise.all([loadFavorites(), loadCart()])

    // ... باقي الكود
  }
}
```

### 3.3 تحديث المكونات

#### أ. تحديث `src/app/favorites/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useShopStore } from '@/store/shopStore'

export default function FavoritesPage() {
  const {
    favorites,
    loadFavorites,
    removeFromFavorites,
    addToCart,
    isInCart
  } = useShopStore()

  const [isClient, setIsClient] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsClient(true)

    // تحميل المفضلة من Supabase
    const loadData = async () => {
      setIsLoading(true)
      await loadFavorites()
      setIsLoading(false)
    }

    loadData()
  }, [loadFavorites])

  // ... باقي الكود
}
```

#### ب. تحديث `src/app/cart/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useShopStore } from '@/store/shopStore'

export default function CartPage() {
  const {
    cart,
    loadCart,
    removeFromCart,
    updateCartItemQuantity,
    getCartTotal,
    clearCart
  } = useShopStore()

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // تحميل السلة من Supabase
    const loadData = async () => {
      setIsLoading(true)
      await loadCart()
      setIsLoading(false)
    }

    loadData()
  }, [loadCart])

  // ... باقي الكود
}
```

#### ج. تحديث `src/app/designs/page.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { useShopStore } from '@/store/shopStore'

export default function DesignsPage() {
  const {
    products,
    loadProducts,
    loadFavorites,
    loadCart,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    addToCart,
    isInCart
  } = useShopStore()

  useEffect(() => {
    // تحميل البيانات من Supabase
    const loadData = async () => {
      await Promise.all([
        loadProducts(),
        loadFavorites(),
        loadCart()
      ])
    }

    loadData()
  }, [loadProducts, loadFavorites, loadCart])

  // ... باقي الكود
}
```

#### د. تحديث `src/components/Header.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useShopStore } from '@/store/shopStore'

export default function Header() {
  const {
    favorites,
    cart,
    getCartItemsCount,
    loadFavorites,
    loadCart
  } = useShopStore()

  const [isHydrated, setIsHydrated] = useState(false)
  const [cartItemsCount, setCartItemsCount] = useState(0)
  const [favoritesCount, setFavoritesCount] = useState(0)

  useEffect(() => {
    // تحميل البيانات عند تحميل الصفحة
    const loadData = async () => {
      await Promise.all([loadFavorites(), loadCart()])
      setIsHydrated(true)
      setCartItemsCount(getCartItemsCount())
      setFavoritesCount(favorites.length)
    }

    loadData()
  }, [])

  // تحديث العدادات عند تغيير البيانات
  useEffect(() => {
    if (isHydrated) {
      setCartItemsCount(getCartItemsCount())
      setFavoritesCount(favorites.length)
    }
  }, [favorites, cart, isHydrated, getCartItemsCount])

  // ... باقي الكود
}
```

### 3.4 ملاحظات مهمة للتكامل

#### Optimistic Updates
- نستخدم **Optimistic Updates** لتحسين تجربة المستخدم
- نحدث الحالة المحلية فوراً قبل انتظار استجابة الخادم
- في حالة الفشل، نتراجع عن التحديث

#### Fallback Strategy
- إذا لم يكن Supabase متاحاً، نستخدم localStorage
- هذا يضمن استمرار عمل التطبيق حتى في حالة انقطاع الاتصال

#### Loading States
- نعرض حالات التحميل للمستخدم
- نستخدم `isLoading` state في كل مكون

---

## 🧪 المرحلة 4: الترحيل والاختبار

### 4.1 استراتيجية الترحيل

#### أ. Migration Script

**الملف:** `src/lib/migrations/migrate-favorites-cart.ts`

```typescript
/**
 * Migration Script: localStorage to Supabase
 * نقل بيانات المفضلة والسلة من localStorage إلى Supabase
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { FavoritesService, CartService, getOrCreateSessionId } from '@/lib/services/favorites-cart-service'

export async function migrateFavoritesAndCart(): Promise<{
  success: boolean
  migratedFavorites: number
  migratedCart: number
  errors: string[]
}> {
  const errors: string[] = []
  let migratedFavorites = 0
  let migratedCart = 0

  if (!isSupabaseConfigured()) {
    errors.push('Supabase is not configured')
    return { success: false, migratedFavorites, migratedCart, errors }
  }

  try {
    console.log('🔄 Starting migration from localStorage to Supabase...')

    // 1. ترحيل المفضلة
    const storedFavorites = localStorage.getItem('yasmin-alsham-shop')
    if (storedFavorites) {
      try {
        const data = JSON.parse(storedFavorites)
        const favorites = data.state?.favorites || []

        console.log(`📦 Found ${favorites.length} favorites in localStorage`)

        for (const product of favorites) {
          try {
            const { success } = await FavoritesService.add(product.id)
            if (success) {
              migratedFavorites++
              console.log(`✅ Migrated favorite: ${product.name}`)
            }
          } catch (error: any) {
            console.error(`❌ Failed to migrate favorite ${product.id}:`, error)
            errors.push(`Favorite ${product.id}: ${error.message}`)
          }
        }
      } catch (error: any) {
        console.error('❌ Error parsing favorites from localStorage:', error)
        errors.push(`Parse favorites: ${error.message}`)
      }
    }

    // 2. ترحيل السلة
    if (storedFavorites) {
      try {
        const data = JSON.parse(storedFavorites)
        const cart = data.state?.cart || []

        console.log(`🛒 Found ${cart.length} cart items in localStorage`)

        for (const item of cart) {
          try {
            const { success } = await CartService.add({
              designId: item.id,
              quantity: item.quantity,
              selectedSize: item.selectedSize,
              selectedColor: item.selectedColor,
              customizations: item.customizations
            })
            if (success) {
              migratedCart++
              console.log(`✅ Migrated cart item: ${item.name}`)
            }
          } catch (error: any) {
            console.error(`❌ Failed to migrate cart item ${item.id}:`, error)
            errors.push(`Cart item ${item.id}: ${error.message}`)
          }
        }
      } catch (error: any) {
        console.error('❌ Error parsing cart from localStorage:', error)
        errors.push(`Parse cart: ${error.message}`)
      }
    }

    console.log(`✅ Migration completed: ${migratedFavorites} favorites, ${migratedCart} cart items`)

    return {
      success: errors.length === 0,
      migratedFavorites,
      migratedCart,
      errors
    }
  } catch (error: any) {
    console.error('❌ Migration failed:', error)
    errors.push(`Migration: ${error.message}`)
    return { success: false, migratedFavorites, migratedCart, errors }
  }
}

/**
 * تشغيل الترحيل تلقائياً عند تحميل التطبيق
 */
export async function autoMigrate(): Promise<void> {
  // التحقق من أن الترحيل لم يتم من قبل
  const migrationDone = localStorage.getItem('yasmin-migration-done')
  if (migrationDone) {
    console.log('✅ Migration already completed')
    return
  }

  console.log('🚀 Starting auto-migration...')
  const result = await migrateFavoritesAndCart()

  if (result.success) {
    // وضع علامة على أن الترحيل تم بنجاح
    localStorage.setItem('yasmin-migration-done', 'true')
    console.log('✅ Auto-migration completed successfully')
  } else {
    console.error('❌ Auto-migration failed:', result.errors)
  }
}
```

#### ب. تفعيل الترحيل التلقائي

**الملف:** `src/app/layout.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { autoMigrate } from '@/lib/migrations/migrate-favorites-cart'

export default function RootLayout({ children }) {
  useEffect(() => {
    // تشغيل الترحيل التلقائي عند تحميل التطبيق
    autoMigrate()
  }, [])

  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
```

### 4.2 حالات الاختبار

#### اختبارات المستخدمين المجهولين (Guest Users)

##### 1. إضافة تصميم للمفضلة كضيف
```
الخطوات:
1. افتح التطبيق بدون تسجيل دخول
2. اذهب إلى صفحة التصاميم
3. انقر على أيقونة القلب لإضافة تصميم للمفضلة
4. تحقق من إضافة التصميم

النتيجة المتوقعة:
✅ يتم إضافة التصميم للمفضلة
✅ يتم إنشاء session_id في localStorage
✅ يتم حفظ البيانات في Supabase مع session_id
```

##### 2. إضافة عنصر للسلة كضيف
```
الخطوات:
1. افتح التطبيق بدون تسجيل دخول
2. اذهب إلى صفحة التصاميم
3. انقر على "أضف للسلة"
4. تحقق من إضافة العنصر

النتيجة المتوقعة:
✅ يتم إضافة العنصر للسلة
✅ يظهر العدد الصحيح في Header
✅ يتم حفظ البيانات في Supabase
```

##### 3. استمرارية البيانات عند إعادة تحميل الصفحة
```
الخطوات:
1. أضف عناصر للمفضلة والسلة كضيف
2. أعد تحميل الصفحة (F5)
3. تحقق من وجود البيانات

النتيجة المتوقعة:
✅ تظهر جميع العناصر المضافة
✅ يتم استخدام نفس session_id
✅ لا يتم فقدان أي بيانات
```

##### 4. دمج البيانات عند تسجيل الدخول
```
الخطوات:
1. أضف عناصر للمفضلة والسلة كضيف
2. سجل دخول بحساب مستخدم
3. تحقق من دمج البيانات

النتيجة المتوقعة:
✅ يتم نقل جميع عناصر الجلسة إلى المستخدم
✅ يتم حذف session_id من localStorage
✅ تظهر جميع العناصر في حساب المستخدم
```

#### اختبارات المستخدمين المسجلين (Authenticated Users)

##### 5. مزامنة المفضلة بين الأجهزة
```
الخطوات:
1. سجل دخول على جهاز 1
2. أضف تصميم للمفضلة
3. سجل دخول على جهاز 2 بنفس الحساب
4. تحقق من ظهور التصميم

النتيجة المتوقعة:
✅ يظهر التصميم على جهاز 2
✅ المزامنة تتم تلقائياً
```

##### 6. مزامنة السلة بين الأجهزة
```
الخطوات:
1. سجل دخول على جهاز 1
2. أضف عناصر للسلة
3. سجل دخول على جهاز 2 بنفس الحساب
4. تحقق من ظهور العناصر

النتيجة المتوقعة:
✅ تظهر جميع العناصر على جهاز 2
✅ الكميات صحيحة
```

##### 7. تحديث الكميات في السلة
```
الخطوات:
1. أضف عنصر للسلة
2. غير الكمية (زيادة/نقصان)
3. أعد تحميل الصفحة
4. تحقق من الكمية

النتيجة المتوقعة:
✅ يتم حفظ الكمية الجديدة
✅ تظهر الكمية الصحيحة بعد إعادة التحميل
```

##### 8. حذف العناصر
```
الخطوات:
1. أضف عناصر للمفضلة والسلة
2. احذف بعض العناصر
3. تحقق من الحذف

النتيجة المتوقعة:
✅ يتم حذف العناصر من Supabase
✅ لا تظهر العناصر المحذوفة بعد إعادة التحميل
```

#### اختبارات الأداء (Performance Tests)

##### 9. سرعة التحميل
```
الاختبار:
- قياس وقت تحميل المفضلة والسلة من Supabase
- مقارنة مع localStorage

النتيجة المتوقعة:
✅ وقت التحميل < 500ms
✅ لا يوجد تأخير ملحوظ في الواجهة
```

##### 10. Optimistic Updates
```
الاختبار:
- إضافة/حذف عناصر بسرعة
- التحقق من استجابة الواجهة

النتيجة المتوقعة:
✅ الواجهة تستجيب فوراً
✅ لا يوجد تأخير في التحديثات
```

#### اختبارات الأخطاء (Error Handling)

##### 11. فشل الاتصال بـ Supabase
```
الاختبار:
- قطع الاتصال بالإنترنت
- محاولة إضافة عناصر

النتيجة المتوقعة:
✅ يتم استخدام localStorage كـ fallback
✅ تظهر رسالة خطأ واضحة
✅ لا يتعطل التطبيق
```

##### 12. RLS Policy Errors
```
الاختبار:
- محاولة الوصول إلى بيانات مستخدم آخر
- محاولة تعديل بيانات بدون صلاحيات

النتيجة المتوقعة:
✅ يتم رفض العملية
✅ تظهر رسالة خطأ مناسبة
✅ لا يتم تسريب البيانات
```

### 4.3 أدوات الاختبار

#### أ. Console Logging
```typescript
// تفعيل السجلات التفصيلية
localStorage.setItem('yasmin-debug', 'true')

// في كل خدمة:
if (localStorage.getItem('yasmin-debug')) {
  console.log('🔍 Debug:', { userId, sessionId, data })
}
```

#### ب. Testing Utilities
```typescript
// src/lib/testing/favorites-cart-test-utils.ts

export const TestUtils = {
  // مسح جميع البيانات
  async clearAll() {
    await FavoritesService.clear()
    await CartService.clear()
    localStorage.clear()
  },

  // إنشاء بيانات تجريبية
  async seedTestData() {
    // إضافة 5 تصاميم للمفضلة
    // إضافة 3 عناصر للسلة
  },

  // التحقق من المزامنة
  async verifySync() {
    const localFavorites = JSON.parse(localStorage.getItem('yasmin-favorites') || '[]')
    const { data: dbFavorites } = await FavoritesService.getAll()

    return localFavorites.length === dbFavorites.length
  }
}
```

### 4.4 Rollback Plan (خطة التراجع)

في حالة فشل الترحيل أو وجود مشاكل:

```typescript
// src/lib/migrations/rollback.ts

export async function rollbackToLocalStorage(): Promise<void> {
  console.log('⚠️ Rolling back to localStorage...')

  // 1. تعطيل Supabase integration
  localStorage.setItem('yasmin-use-localStorage', 'true')

  // 2. إعادة تحميل البيانات من localStorage
  const { loadFavorites, loadCart } = useShopStore.getState()
  await Promise.all([loadFavorites(), loadCart()])

  console.log('✅ Rollback completed')
}
```

---

## 📚 الدروس المستفادة

### من تجربة Appointments Migration

#### 1. مشاكل RLS Policies مع المستخدمين المجهولين

**المشكلة السابقة:**
```sql
-- السياسة القديمة كانت تتطلب مصادقة فقط
CREATE POLICY "Authenticated users can add favorites"
ON favorites FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**الدرس المستفاد:**
- ✅ يجب دعم المستخدمين المجهولين من البداية
- ✅ استخدام `session_id` كبديل لـ `user_id`
- ✅ إضافة قيود CHECK للتأكد من وجود أحدهما فقط

**الحل الصحيح:**
```sql
CREATE POLICY "Users and sessions can add favorites"
ON favorites FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND session_id IS NULL) OR
  (auth.uid() IS NULL AND session_id IS NOT NULL AND user_id IS NULL)
);
```

#### 2. أهمية Fallback Strategy

**الدرس المستفاد:**
- ✅ دائماً احتفظ بـ fallback لـ localStorage
- ✅ لا تعتمد 100% على Supabase
- ✅ التطبيق يجب أن يعمل حتى في حالة انقطاع الاتصال

**التطبيق:**
```typescript
if (!isSupabaseConfigured()) {
  // Fallback to localStorage
  const stored = localStorage.getItem('yasmin-favorites')
  if (stored) {
    set({ favorites: JSON.parse(stored) })
  }
  return
}
```

#### 3. Session Management البسيط أفضل

**الخيارات المتاحة:**
1. ❌ **Supabase Anonymous Auth** - معقد، يتطلب إدارة إضافية
2. ❌ **Browser Fingerprinting** - غير موثوق، مشاكل خصوصية
3. ✅ **UUID في localStorage** - بسيط، فعال، يعمل دائماً

**الدرس المستفاد:**
- البساطة أفضل من التعقيد
- UUID في localStorage كافٍ لمعظم الحالات
- يمكن الترقية لاحقاً إذا لزم الأمر

#### 4. Optimistic Updates تحسن التجربة

**الدرس المستفاد:**
- ✅ تحديث الواجهة فوراً قبل انتظار الخادم
- ✅ التراجع عن التحديث في حالة الفشل
- ✅ يعطي شعوراً بالسرعة والاستجابة

**التطبيق:**
```typescript
// تحديث فوري
set({ favorites: [...favorites, product] })

// محاولة الحفظ في Supabase
try {
  await FavoritesService.add(product.id)
} catch (error) {
  // التراجع في حالة الفشل
  set({ favorites: favorites.filter(item => item.id !== product.id) })
}
```

#### 5. أهمية الاختبار الشامل

**الدرس المستفاد:**
- ✅ اختبار جميع الحالات قبل النشر
- ✅ اختبار المستخدمين المجهولين والمسجلين
- ✅ اختبار حالات الفشل والأخطاء
- ✅ اختبار المزامنة بين الأجهزة

#### 6. دمج البيانات عند تسجيل الدخول

**المشكلة:**
- المستخدم يضيف عناصر كضيف
- ثم يسجل دخول
- ماذا يحدث للبيانات؟

**الحل:**
```sql
CREATE OR REPLACE FUNCTION merge_session_to_user(
  p_session_id TEXT,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- نقل المفضلة
  UPDATE favorites
  SET user_id = p_user_id, session_id = NULL
  WHERE session_id = p_session_id
  ON CONFLICT (user_id, design_id) DO NOTHING;

  -- حذف المفضلة المكررة
  DELETE FROM favorites WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 7. تنظيف البيانات القديمة

**الدرس المستفاد:**
- ✅ السلات القديمة للجلسات تتراكم
- ✅ يجب تنظيفها دورياً
- ✅ استخدام `last_activity_at` لتتبع النشاط

**الحل:**
```sql
-- دالة لتنظيف السلات القديمة (تشغل كـ cron job)
CREATE OR REPLACE FUNCTION cleanup_old_carts()
RETURNS VOID AS $$
BEGIN
  DELETE FROM cart_items
  WHERE session_id IS NOT NULL
    AND last_activity_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### الأخطاء الشائعة التي يجب تجنبها

#### ❌ خطأ 1: عدم التحقق من `isSupabaseConfigured()`
```typescript
// خطأ
const { data } = await supabase.from('favorites').select()

// صحيح
if (!isSupabaseConfigured()) {
  return { data: [], error: 'Supabase not configured' }
}
const { data } = await supabase.from('favorites').select()
```

#### ❌ خطأ 2: عدم معالجة الأخطاء
```typescript
// خطأ
await FavoritesService.add(productId)

// صحيح
try {
  const { success, error } = await FavoritesService.add(productId)
  if (!success) {
    console.error('Failed to add:', error)
    // عرض رسالة للمستخدم
  }
} catch (error) {
  console.error('Error:', error)
}
```

#### ❌ خطأ 3: نسيان تحديث `last_activity_at`
```typescript
// يجب تحديث last_activity_at عند كل عملية على السلة
// هذا يتم تلقائياً عبر Trigger في قاعدة البيانات
```

#### ❌ خطأ 4: عدم دمج البيانات عند تسجيل الدخول
```typescript
// خطأ: تجاهل بيانات الجلسة
signIn: async (email, password) => {
  const { data } = await supabase.auth.signInWithPassword({ email, password })
  set({ user: data.user })
}

// صحيح: دمج البيانات
signIn: async (email, password) => {
  const { data } = await supabase.auth.signInWithPassword({ email, password })
  await mergeSessionToUser(data.user.id)
  await Promise.all([loadFavorites(), loadCart()])
  set({ user: data.user })
}
```

### نصائح للنجاح

#### ✅ 1. ابدأ بالبساطة
- لا تعقد الأمور من البداية
- استخدم UUID بسيط للجلسات
- يمكن الترقية لاحقاً

#### ✅ 2. اختبر كل شيء
- اختبر المستخدمين المجهولين
- اختبر المستخدمين المسجلين
- اختبر حالات الفشل

#### ✅ 3. احتفظ بـ Fallback
- localStorage كـ backup
- التطبيق يجب أن يعمل دائماً

#### ✅ 4. استخدم Optimistic Updates
- تحسين تجربة المستخدم
- الواجهة تستجيب فوراً

#### ✅ 5. نظف البيانات القديمة
- استخدام Cron Jobs
- حذف الجلسات القديمة

#### ✅ 6. وثق كل شيء
- اكتب تعليقات واضحة
- وثق السياسات والقرارات
- سهل على الآخرين الفهم

---

## ⏱️ الجدول الزمني المفصل

### المرحلة 1: تصميم قاعدة البيانات (2 ساعة)

| المهمة | المدة | التفاصيل |
|--------|-------|----------|
| 1.1 تحديث جدول favorites | 30 دقيقة | إضافة session_id، القيود، الفهارس |
| 1.2 تحديث جدول cart_items | 30 دقيقة | إضافة session_id، last_activity_at |
| 1.3 تحديث سياسات RLS | 45 دقيقة | سياسات جديدة للمستخدمين المجهولين |
| 1.4 إنشاء الدوال المساعدة | 15 دقيقة | merge_session_to_user، cleanup_old_carts |
| **الإجمالي** | **2 ساعة** | |

**الملفات المتأثرة:**
- `migrations/06-favorites-cart-migration.sql` (جديد)

**Checklist:**
- [ ] تحديث جدول favorites
- [ ] تحديث جدول cart_items
- [ ] تحديث سياسات RLS
- [ ] إنشاء الدوال المساعدة
- [ ] اختبار السياسات في Supabase Dashboard

---

### المرحلة 2: طبقة الخدمات (3 ساعات)

| المهمة | المدة | التفاصيل |
|--------|-------|----------|
| 2.1 إنشاء ملف الخدمات | 30 دقيقة | الهيكل الأساسي، Types |
| 2.2 Session Management | 30 دقيقة | getOrCreateSessionId، mergeSessionToUser |
| 2.3 Favorites Service | 1 ساعة | getAll، add، remove، isFavorite، clear |
| 2.4 Cart Service | 1 ساعة | getAll، add، update، remove، clear، getTotal |
| **الإجمالي** | **3 ساعات** | |

**الملفات المتأثرة:**
- `src/lib/services/favorites-cart-service.ts` (جديد)

**Checklist:**
- [ ] إنشاء Types & Interfaces
- [ ] تطبيق Session Management
- [ ] تطبيق Favorites Service
- [ ] تطبيق Cart Service
- [ ] اختبار الخدمات في Console

---

### المرحلة 3: تكامل الواجهة الأمامية (4 ساعات)

| المهمة | المدة | التفاصيل |
|--------|-------|----------|
| 3.1 تحديث shopStore | 1.5 ساعة | إزالة persist، إضافة دوال Supabase |
| 3.2 تحديث authStore | 30 دقيقة | دمج البيانات عند تسجيل الدخول |
| 3.3 تحديث صفحة المفضلة | 30 دقيقة | استخدام loadFavorites |
| 3.4 تحديث صفحة السلة | 30 دقيقة | استخدام loadCart |
| 3.5 تحديث صفحة التصاميم | 30 دقيقة | تحميل البيانات عند التحميل |
| 3.6 تحديث Header | 30 دقيقة | عرض العدادات الصحيحة |
| **الإجمالي** | **4 ساعات** | |

**الملفات المتأثرة:**
- `src/store/shopStore.ts`
- `src/store/authStore.ts`
- `src/app/favorites/page.tsx`
- `src/app/cart/page.tsx`
- `src/app/designs/page.tsx`
- `src/app/designs/[id]/page.tsx`
- `src/components/Header.tsx`

**Checklist:**
- [ ] تحديث shopStore
- [ ] تحديث authStore
- [ ] تحديث جميع المكونات
- [ ] اختبار الواجهة محلياً

---

### المرحلة 4: الترحيل والاختبار (3 ساعات)

| المهمة | المدة | التفاصيل |
|--------|-------|----------|
| 4.1 إنشاء Migration Script | 30 دقيقة | migrateFavoritesAndCart، autoMigrate |
| 4.2 اختبار المستخدمين المجهولين | 1 ساعة | 4 حالات اختبار |
| 4.3 اختبار المستخدمين المسجلين | 1 ساعة | 4 حالات اختبار |
| 4.4 اختبار الأداء والأخطاء | 30 دقيقة | 4 حالات اختبار |
| **الإجمالي** | **3 ساعات** | |

**الملفات المتأثرة:**
- `src/lib/migrations/migrate-favorites-cart.ts` (جديد)
- `src/lib/migrations/rollback.ts` (جديد)
- `src/lib/testing/favorites-cart-test-utils.ts` (جديد)

**Checklist:**
- [ ] إنشاء Migration Script
- [ ] اختبار جميع الحالات (12 حالة)
- [ ] إصلاح الأخطاء المكتشفة
- [ ] توثيق النتائج

---

### الجدول الزمني الإجمالي

| المرحلة | المدة المقدرة | الحالة |
|---------|---------------|---------|
| 1. تصميم قاعدة البيانات | 2 ساعة | ⏳ قيد الانتظار |
| 2. طبقة الخدمات | 3 ساعات | ⏳ قيد الانتظار |
| 3. تكامل الواجهة | 4 ساعات | ⏳ قيد الانتظار |
| 4. الترحيل والاختبار | 3 ساعات | ⏳ قيد الانتظار |
| **الإجمالي** | **12 ساعة** | |

**ملاحظة:** يمكن توزيع العمل على يومين:
- **اليوم 1:** المرحلة 1 + المرحلة 2 (5 ساعات)
- **اليوم 2:** المرحلة 3 + المرحلة 4 (7 ساعات)

---

## ✅ الخطوات التالية

### الخطوة 1: مراجعة الخطة ✅
- [x] قراءة الخطة كاملة
- [x] فهم جميع المراحل
- [x] التأكد من الجاهزية

### الخطوة 2: تنفيذ المرحلة 1 ⏳
```bash
# 1. إنشاء ملف Migration
touch migrations/06-favorites-cart-migration.sql

# 2. نسخ SQL من الخطة
# 3. تنفيذ في Supabase Dashboard
# 4. التحقق من النتائج
```

### الخطوة 3: تنفيذ المرحلة 2 ⏳
```bash
# 1. إنشاء ملف الخدمات
touch src/lib/services/favorites-cart-service.ts

# 2. نسخ الكود من الخطة
# 3. اختبار الخدمات
```

### الخطوة 4: تنفيذ المرحلة 3 ⏳
```bash
# 1. تحديث shopStore
# 2. تحديث authStore
# 3. تحديث المكونات
# 4. اختبار الواجهة
```

### الخطوة 5: تنفيذ المرحلة 4 ⏳
```bash
# 1. إنشاء Migration Script
# 2. تشغيل الاختبارات
# 3. إصلاح الأخطاء
# 4. النشر
```

---

## 📊 مؤشرات النجاح (Success Metrics)

### الوظائف (Functionality)
- ✅ جميع الميزات الحالية تعمل بنفس الطريقة
- ✅ المستخدمون المجهولون يمكنهم إضافة عناصر
- ✅ المستخدمون المسجلون يرون بياناتهم على جميع الأجهزة
- ✅ دمج البيانات يعمل عند تسجيل الدخول

### الأداء (Performance)
- ✅ وقت التحميل < 500ms
- ✅ Optimistic Updates تعمل بسلاسة
- ✅ لا يوجد تأخير ملحوظ في الواجهة

### الأمان (Security)
- ✅ RLS Policies تعمل بشكل صحيح
- ✅ لا يمكن الوصول إلى بيانات مستخدمين آخرين
- ✅ session_id آمن ومحمي

### الموثوقية (Reliability)
- ✅ Fallback إلى localStorage يعمل
- ✅ معالجة الأخطاء صحيحة
- ✅ لا يوجد فقدان للبيانات

---

## 🎉 الخلاصة

هذه الخطة الشاملة توفر:

### ✅ تصميم قوي
- مخطط قاعدة بيانات محكم
- سياسات RLS صحيحة
- دعم المستخدمين المجهولين

### ✅ تطبيق احترافي
- طبقة خدمات منظمة
- Optimistic Updates
- معالجة أخطاء شاملة

### ✅ تكامل سلس
- تحديثات تدريجية
- Fallback Strategy
- Migration Script

### ✅ اختبار شامل
- 12 حالة اختبار
- أدوات اختبار
- Rollback Plan

### ✅ توثيق كامل
- شرح مفصل لكل خطوة
- أمثلة كود واضحة
- دروس مستفادة

---

## 📞 الدعم والمساعدة

إذا واجهت أي مشاكل أثناء التنفيذ:

1. **راجع قسم الدروس المستفادة** - قد تجد الحل هناك
2. **تحقق من الأخطاء الشائعة** - تجنب الأخطاء المعروفة
3. **استخدم أدوات الاختبار** - للتحقق من المشاكل
4. **استخدم Rollback Plan** - في حالة الفشل الكامل

---

## 📝 ملاحظات نهائية

### ⚠️ تحذيرات مهمة
1. **لا تحذف localStorage** حتى تتأكد من نجاح الترحيل
2. **اختبر على بيئة تطوير** قبل النشر للإنتاج
3. **احتفظ بنسخة احتياطية** من قاعدة البيانات
4. **راقب الأخطاء** في Console بعد النشر

### 🎯 أولويات التنفيذ
1. **الأولوية القصوى:** RLS Policies صحيحة
2. **الأولوية العالية:** Fallback Strategy
3. **الأولوية المتوسطة:** Optimistic Updates
4. **الأولوية المنخفضة:** تنظيف البيانات القديمة

### 🚀 التحسينات المستقبلية
- [ ] استخدام Supabase Realtime للمزامنة الفورية
- [ ] إضافة Analytics لتتبع الاستخدام
- [ ] تحسين الأداء بـ Caching
- [ ] إضافة Offline Support

---

**تاريخ الإنشاء:** 2025-11-03
**الإصدار:** 1.0
**الحالة:** جاهز للتنفيذ ✅

---

**ملاحظة:** هذه الخطة قابلة للتعديل بناءً على التطورات أثناء التنفيذ. يُنصح بمراجعتها بعد كل مرحلة وتحديثها حسب الحاجة.

