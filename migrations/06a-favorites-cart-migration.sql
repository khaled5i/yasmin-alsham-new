-- ========================================
-- Migration 06a: Favorites & Cart - localStorage to Supabase
-- ========================================
-- التاريخ: 2025-11-03
-- الهدف: نقل المفضلة والسلة من localStorage إلى Supabase
-- الميزات: دعم المستخدمين المجهولين، المزامنة بين الأجهزة
-- ========================================
-- ⚠️ ARCHIVED - محفوظة للتوثيق فقط - لا تُطبّق هذا الملف
-- -----------------------------------------------------------------------
-- تم إلغاء ميزة المفضلة (favorites) والسلة (cart_items) لاحقاً.
-- الجداول التي ينشئها هذا الملف (favorites, cart_items) تم حذفها من
-- قاعدة البيانات الفعلية. الدوال المصاحبة لها تم حذفها أيضاً في
-- migration 24-cleanup-orphaned-functions.sql
-- -----------------------------------------------------------------------

-- تفعيل UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- الخطوة 0: إنشاء الجداول إذا لم تكن موجودة
-- ========================================

-- إنشاء جدول المفضلة إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  session_id TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء جدول السلة إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  session_id TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  selected_size TEXT,
  selected_color TEXT,
  customizations JSONB DEFAULT '{}',
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- الخطوة 1: تحديث جدول المفضلة (Favorites)
-- ========================================

-- إضافة عمود session_id إذا لم يكن موجوداً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'favorites' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE favorites ADD COLUMN session_id TEXT;
  END IF;
END $$;

-- إضافة عمود updated_at إذا لم يكن موجوداً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'favorites' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE favorites ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- جعل user_id قابل للقيمة NULL (للمستخدمين المجهولين)
DO $$
BEGIN
  ALTER TABLE favorites ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- إضافة قيد: يجب أن يكون user_id أو session_id موجوداً (ليس كلاهما)
ALTER TABLE favorites
DROP CONSTRAINT IF EXISTS favorites_user_or_session_check;

ALTER TABLE favorites
ADD CONSTRAINT favorites_user_or_session_check
CHECK (
  (user_id IS NOT NULL AND session_id IS NULL) OR
  (user_id IS NULL AND session_id IS NOT NULL)
);

-- تحديث القيد الفريد ليشمل session_id
ALTER TABLE favorites
DROP CONSTRAINT IF EXISTS favorites_user_id_design_id_key;

ALTER TABLE favorites
DROP CONSTRAINT IF EXISTS favorites_user_id_product_id_key;

-- إنشاء فهرس فريد للمستخدمين المسجلين
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_product_unique
ON favorites(user_id, product_id)
WHERE user_id IS NOT NULL;

-- إنشاء فهرس فريد للمستخدمين المجهولين
CREATE UNIQUE INDEX IF NOT EXISTS favorites_session_product_unique
ON favorites(session_id, product_id)
WHERE session_id IS NOT NULL;

-- إنشاء فهرس للأداء على session_id
CREATE INDEX IF NOT EXISTS idx_favorites_session_id
ON favorites(session_id)
WHERE session_id IS NOT NULL;

-- ========================================
-- الخطوة 2: تحديث جدول السلة (Cart Items)
-- ========================================

-- إضافة عمود session_id إذا لم يكن موجوداً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN session_id TEXT;
  END IF;
END $$;

-- إضافة عمود last_activity_at إذا لم يكن موجوداً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- جعل user_id قابل للقيمة NULL (للمستخدمين المجهولين)
DO $$
BEGIN
  ALTER TABLE cart_items ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- إضافة قيد: يجب أن يكون user_id أو session_id موجوداً (ليس كلاهما)
ALTER TABLE cart_items
DROP CONSTRAINT IF EXISTS cart_items_user_or_session_check;

ALTER TABLE cart_items
ADD CONSTRAINT cart_items_user_or_session_check
CHECK (
  (user_id IS NOT NULL AND session_id IS NULL) OR
  (user_id IS NULL AND session_id IS NOT NULL)
);

-- إنشاء فهرس فريد للمستخدمين المسجلين
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_product_unique
ON cart_items(user_id, product_id)
WHERE user_id IS NOT NULL;

-- إنشاء فهرس للمستخدمين المجهولين (يمكن أن يكون لديهم نفس التصميم بأحجام مختلفة)
CREATE INDEX IF NOT EXISTS idx_cart_items_session_id
ON cart_items(session_id)
WHERE session_id IS NOT NULL;

-- إنشاء فهرس للأداء على last_activity_at
CREATE INDEX IF NOT EXISTS idx_cart_items_last_activity
ON cart_items(last_activity_at);

-- ========================================
-- الخطوة 3: إنشاء Trigger لتحديث last_activity_at
-- ========================================

-- دالة لتحديث last_activity_at تلقائياً
CREATE OR REPLACE FUNCTION update_cart_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger عند التحديث
DROP TRIGGER IF EXISTS cart_items_update_activity ON cart_items;
CREATE TRIGGER cart_items_update_activity
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION update_cart_last_activity();

-- ========================================
-- الخطوة 4: حذف سياسات RLS القديمة
-- ========================================

-- حذف سياسات المفضلة القديمة
DROP POLICY IF EXISTS "Users can view their own favorites" ON favorites;
DROP POLICY IF EXISTS "Authenticated users can add favorites" ON favorites;
DROP POLICY IF EXISTS "Users can delete their own favorites" ON favorites;

-- حذف سياسات السلة القديمة
DROP POLICY IF EXISTS "Users can view their own cart" ON cart_items;
DROP POLICY IF EXISTS "Authenticated users can add to cart" ON cart_items;
DROP POLICY IF EXISTS "Users can update their own cart" ON cart_items;
DROP POLICY IF EXISTS "Users can delete from their own cart" ON cart_items;

-- ========================================
-- الخطوة 5: إنشاء سياسات RLS الجديدة للمفضلة
-- ========================================

-- القراءة: المستخدمون المسجلون والمجهولون (anonymous) يرون مفضلاتهم فقط
-- ملاحظة: يجب استخدام Supabase Anonymous Auth للمستخدمين المجهولين
CREATE POLICY "Users can view their favorites"
ON favorites FOR SELECT
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- الإضافة: المستخدمون المسجلون والمجهولون (anonymous) يمكنهم إضافة للمفضلة
CREATE POLICY "Users can add favorites"
ON favorites FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- الحذف: المستخدمون المسجلون والمجهولون (anonymous) يحذفون مفضلاتهم
CREATE POLICY "Users can delete favorites"
ON favorites FOR DELETE
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- ========================================
-- الخطوة 6: إنشاء سياسات RLS الجديدة للسلة
-- ========================================

-- القراءة: المستخدمون المسجلون والمجهولون (anonymous) يرون سلتهم فقط
CREATE POLICY "Users can view cart"
ON cart_items FOR SELECT
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- الإضافة: المستخدمون المسجلون والمجهولون (anonymous) يمكنهم إضافة للسلة
CREATE POLICY "Users can add to cart"
ON cart_items FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- التحديث: المستخدمون المسجلون والمجهولون (anonymous) يحدثون سلتهم
CREATE POLICY "Users can update cart"
ON cart_items FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
)
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- الحذف: المستخدمون المسجلون والمجهولون (anonymous) يحذفون من سلتهم
CREATE POLICY "Users can delete from cart"
ON cart_items FOR DELETE
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- ========================================
-- الخطوة 7: دالة دمج بيانات الجلسة مع المستخدم
-- ========================================

-- دالة لنقل بيانات الجلسة إلى المستخدم عند تسجيل الدخول
CREATE OR REPLACE FUNCTION merge_session_to_user(
  p_session_id TEXT,
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_favorites_merged INTEGER := 0;
  v_cart_merged INTEGER := 0;
  v_favorites_deleted INTEGER := 0;
  v_cart_deleted INTEGER := 0;
BEGIN
  -- دمج المفضلة
  -- تحديث العناصر التي ليست موجودة للمستخدم
  UPDATE favorites
  SET user_id = p_user_id, session_id = NULL, updated_at = NOW()
  WHERE session_id = p_session_id
    AND product_id NOT IN (
      SELECT product_id FROM favorites WHERE user_id = p_user_id
    );
  
  GET DIAGNOSTICS v_favorites_merged = ROW_COUNT;
  
  -- حذف المفضلة المكررة (التي كانت موجودة للمستخدم)
  DELETE FROM favorites 
  WHERE session_id = p_session_id;
  
  GET DIAGNOSTICS v_favorites_deleted = ROW_COUNT;
  
  -- دمج السلة
  -- تحديث العناصر التي ليست موجودة للمستخدم
  UPDATE cart_items
  SET user_id = p_user_id, session_id = NULL, updated_at = NOW()
  WHERE session_id = p_session_id
    AND product_id NOT IN (
      SELECT product_id FROM cart_items WHERE user_id = p_user_id
    );
  
  GET DIAGNOSTICS v_cart_merged = ROW_COUNT;
  
  -- حذف عناصر السلة المكررة
  DELETE FROM cart_items 
  WHERE session_id = p_session_id;
  
  GET DIAGNOSTICS v_cart_deleted = ROW_COUNT;
  
  -- إرجاع نتائج الدمج
  RETURN json_build_object(
    'favorites_merged', v_favorites_merged,
    'favorites_deleted', v_favorites_deleted,
    'cart_merged', v_cart_merged,
    'cart_deleted', v_cart_deleted,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- الخطوة 8: دالة تنظيف البيانات القديمة
-- ========================================

-- دالة لحذف السلات القديمة للجلسات غير النشطة (أكثر من 30 يوم)
CREATE OR REPLACE FUNCTION cleanup_old_carts()
RETURNS JSON AS $$
DECLARE
  v_deleted_carts INTEGER := 0;
  v_deleted_favorites INTEGER := 0;
BEGIN
  -- حذف عناصر السلة القديمة للجلسات
  DELETE FROM cart_items
  WHERE session_id IS NOT NULL
    AND last_activity_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_carts = ROW_COUNT;

  -- حذف المفضلة القديمة للجلسات (أكثر من 90 يوم)
  DELETE FROM favorites
  WHERE session_id IS NOT NULL
    AND created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_favorites = ROW_COUNT;

  -- إرجاع نتائج التنظيف
  RETURN json_build_object(
    'deleted_carts', v_deleted_carts,
    'deleted_favorites', v_deleted_favorites,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- الخطوة 9: التحقق من نجاح Migration
-- ========================================

-- عرض معلومات الجداول المحدثة
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 06 completed successfully!';
  RAISE NOTICE '📊 Favorites table updated with session_id support';
  RAISE NOTICE '📊 Cart items table updated with session_id and last_activity_at';
  RAISE NOTICE '🔒 RLS policies updated for anonymous users';
  RAISE NOTICE '🔧 Helper functions created: merge_session_to_user, cleanup_old_carts';
END $$;

-- ========================================
-- ملاحظات مهمة
-- ========================================

-- 1. لتشغيل دالة الدمج عند تسجيل الدخول:
--    SELECT merge_session_to_user('session-uuid-here', 'user-uuid-here');

-- 2. لتشغيل دالة التنظيف (يُنصح بجدولتها كـ cron job):
--    SELECT cleanup_old_carts();

-- 3. للتحقق من البيانات:
--    SELECT * FROM favorites WHERE session_id IS NOT NULL;
--    SELECT * FROM cart_items WHERE session_id IS NOT NULL;

-- 4. اختبار السياسات:
--    - اختبر كمستخدم مجهول (بدون auth.uid())
--    - اختبر كمستخدم مسجل
--    - تأكد من عدم القدرة على الوصول لبيانات الآخرين

