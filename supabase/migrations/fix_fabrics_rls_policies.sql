-- ============================================================================
-- إصلاح سياسات RLS لجدول fabrics و Storage
-- Fix RLS Policies for Fabrics Table and Storage
-- ============================================================================
-- المشكلة: مدير الأقمشة (fabric_store_manager) لا يستطيع تعديل أو إضافة أقمشة
-- الحل: تحديث السياسات للسماح لـ admin و fabric_store_manager و general_manager
-- ============================================================================

-- ============================================================================
-- الخطوة 1: حذف السياسات القديمة لجدول fabrics
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view available fabrics" ON public.fabrics;
DROP POLICY IF EXISTS "Admins can view all fabrics" ON public.fabrics;
DROP POLICY IF EXISTS "Only admins can insert fabrics" ON public.fabrics;
DROP POLICY IF EXISTS "Only admins can update fabrics" ON public.fabrics;
DROP POLICY IF EXISTS "Only admins can delete fabrics" ON public.fabrics;

-- ============================================================================
-- الخطوة 2: إنشاء دالة مساعدة للتحقق من صلاحيات إدارة الأقمشة
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_fabrics()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.workers w ON w.user_id = u.id
    WHERE u.id = auth.uid()
    AND u.is_active = true
    AND (
      -- Admin
      u.role = 'admin'
      OR
      -- Fabric Store Manager
      (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
      OR
      -- General Manager
      (u.role = 'worker' AND w.worker_type = 'general_manager')
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- الخطوة 3: إنشاء سياسات جديدة لجدول fabrics
-- ============================================================================

-- 3.1 SELECT: الجميع يمكنهم عرض الأقمشة المتاحة
CREATE POLICY "Anyone can view available fabrics"
ON public.fabrics
FOR SELECT
USING (is_available = true);

-- 3.2 SELECT: المدراء ومديرو الأقمشة يمكنهم عرض جميع الأقمشة
CREATE POLICY "Managers can view all fabrics"
ON public.fabrics
FOR SELECT
TO authenticated
USING (can_manage_fabrics());

-- 3.3 INSERT: المدراء ومديرو الأقمشة يمكنهم إضافة أقمشة
CREATE POLICY "Managers can insert fabrics"
ON public.fabrics
FOR INSERT
TO authenticated
WITH CHECK (can_manage_fabrics());

-- 3.4 UPDATE: المدراء ومديرو الأقمشة يمكنهم تعديل الأقمشة
CREATE POLICY "Managers can update fabrics"
ON public.fabrics
FOR UPDATE
TO authenticated
USING (can_manage_fabrics())
WITH CHECK (can_manage_fabrics());

-- 3.5 DELETE: المدراء ومديرو الأقمشة يمكنهم حذف الأقمشة
CREATE POLICY "Managers can delete fabrics"
ON public.fabrics
FOR DELETE
TO authenticated
USING (can_manage_fabrics());

-- ============================================================================
-- الخطوة 4: تحديث سياسات Storage للصور
-- ============================================================================

-- 4.1 حذف السياسات القديمة
DROP POLICY IF EXISTS "Public Access for Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Product Images" ON storage.objects;

-- 4.2 SELECT: الجميع يمكنهم قراءة الصور
CREATE POLICY "Public Access for Product Images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

-- 4.3 INSERT: المدراء ومديرو الأقمشة يمكنهم رفع صور
CREATE POLICY "Managers can upload images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  )
);

-- 4.4 UPDATE: المدراء ومديرو الأقمشة يمكنهم تحديث الصور
CREATE POLICY "Managers can update images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  )
);

-- 4.5 DELETE: المدراء ومديرو الأقمشة يمكنهم حذف الصور
CREATE POLICY "Managers can delete images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  )
);

-- ============================================================================
-- الخطوة 5: التحقق من السياسات
-- ============================================================================

-- عرض جميع السياسات على جدول fabrics
SELECT
  policyname AS "اسم السياسة",
  cmd AS "العملية",
  CASE
    WHEN roles = '{public}' THEN 'الجميع'
    WHEN roles = '{authenticated}' THEN 'المستخدمون المسجلون'
    ELSE roles::text
  END AS "الأدوار"
FROM pg_policies
WHERE tablename = 'fabrics'
ORDER BY cmd, policyname;

-- عرض جميع السياسات على storage.objects
SELECT
  policyname AS "اسم السياسة",
  cmd AS "العملية"
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%images%'
ORDER BY cmd, policyname;

-- ============================================================================
-- الخطوة 6: اختبار الدالة المساعدة
-- ============================================================================

-- اختبار دالة can_manage_fabrics() للمستخدم الحالي
SELECT
  auth.uid() AS "معرف المستخدم",
  can_manage_fabrics() AS "يمكنه إدارة الأقمشة؟";

-- عرض معلومات المستخدم الحالي
SELECT
  u.id,
  u.email,
  u.full_name,
  u.role AS "الدور",
  w.worker_type AS "نوع العامل",
  u.is_active AS "نشط؟"
FROM public.users u
LEFT JOIN public.workers w ON w.user_id = u.id
WHERE u.id = auth.uid();

-- ============================================================================
-- ملاحظات مهمة
-- ============================================================================

/*
1. **تطبيق هذا الملف:**
   - افتح Supabase Dashboard
   - اذهب إلى SQL Editor
   - انسخ والصق المحتوى
   - اضغط Run

2. **من يمكنه إدارة الأقمشة الآن:**
   - Admin (role = 'admin')
   - مدير الأقمشة (role = 'worker' AND worker_type = 'fabric_store_manager')
   - المدير العام (role = 'worker' AND worker_type = 'general_manager')

3. **الصلاحيات:**
   - SELECT: الجميع يمكنهم عرض الأقمشة المتاحة
   - SELECT: المدراء يمكنهم عرض جميع الأقمشة
   - INSERT/UPDATE/DELETE: المدراء ومديرو الأقمشة فقط

4. **Storage:**
   - SELECT: الجميع يمكنهم قراءة الصور
   - INSERT/UPDATE/DELETE: المدراء ومديرو الأقمشة فقط

5. **التحقق:**
   - بعد تطبيق Migration، قم بتسجيل الدخول كمدير أقمشة
   - جرب إضافة أو تعديل قماش
   - جرب رفع صورة
   - يجب أن تعمل جميع العمليات بنجاح

6. **استكشاف الأخطاء:**
   - إذا استمرت المشكلة، تحقق من:
     * هل المستخدم لديه is_active = true؟
     * هل worker_type محفوظ بشكل صحيح في جدول workers؟
     * هل تم تطبيق Migration بنجاح؟
*/

