-- ========================================
-- Migration 07: Fix Products RLS Policy
-- ========================================
-- التاريخ: 2025-11-03
-- الهدف: إصلاح سياسة RLS للمنتجات للسماح للمستخدمين غير المسجلين بعرض المنتجات
-- المشكلة: السياسة الحالية تتطلب published_at IS NOT NULL مما يمنع عرض المنتجات بدون تاريخ نشر
-- ========================================

-- ========================================
-- الخطوة 1: حذف السياسة القديمة
-- ========================================

DROP POLICY IF EXISTS "Anyone can view available products" ON public.products;

-- ========================================
-- الخطوة 2: إنشاء السياسة الجديدة المحسّنة
-- ========================================

-- Policy: الجميع (بما في ذلك المستخدمين غير المسجلين) يمكنهم عرض المنتجات المتاحة
-- ملاحظة: تم إزالة شرط published_at للسماح بعرض المنتجات حتى بدون تاريخ نشر
CREATE POLICY "Anyone can view available products"
  ON public.products
  FOR SELECT
  USING (
    is_available = true
    AND (
      published_at IS NULL  -- السماح بالمنتجات بدون تاريخ نشر
      OR published_at <= NOW()  -- أو المنتجات المنشورة
    )
  );

-- ========================================
-- الخطوة 3: التحقق من السياسات الأخرى
-- ========================================

-- التأكد من أن سياسة Admin موجودة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'products' 
    AND policyname = 'Admins can view all products'
  ) THEN
    CREATE POLICY "Admins can view all products"
      ON public.products
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'admin'
          AND users.is_active = true
        )
      );
  END IF;
END $$;

-- ========================================
-- الخطوة 4: التحقق من الصلاحيات
-- ========================================

-- التأكد من أن المستخدمين غير المسجلين (anon) لديهم صلاحية SELECT
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.categories TO anon;

-- ========================================
-- الخطوة 5: اختبار السياسة
-- ========================================

-- عرض جميع السياسات على جدول products
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policies on public.products:';
  RAISE NOTICE '========================================';
  
  FOR policy_record IN 
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies 
    WHERE tablename = 'products'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'Policy: %', policy_record.policyname;
    RAISE NOTICE 'Command: %', policy_record.cmd;
    RAISE NOTICE '----------------------------------------';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 07 completed successfully!';
  RAISE NOTICE '✅ Anonymous users can now view available products';
  RAISE NOTICE '========================================';
END $$;

-- ========================================
-- ملاحظات مهمة
-- ========================================

-- 1. السياسة الجديدة تسمح بعرض المنتجات إذا:
--    - is_available = true
--    - published_at IS NULL أو published_at <= NOW()

-- 2. للتحقق من أن السياسة تعمل:
--    - افتح الموقع في وضع Incognito (بدون تسجيل دخول)
--    - يجب أن تظهر جميع المنتجات المتاحة

-- 3. للتحقق من المنتجات في قاعدة البيانات:
--    SELECT id, title, is_available, published_at 
--    FROM public.products 
--    ORDER BY created_at DESC;

-- 4. لتحديث published_at للمنتجات الموجودة (اختياري):
--    UPDATE public.products 
--    SET published_at = created_at 
--    WHERE published_at IS NULL AND is_available = true;

