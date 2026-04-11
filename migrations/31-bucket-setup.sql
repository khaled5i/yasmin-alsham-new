-- ============================================================================
-- Migration 31: إنشاء Supabase Storage bucket لصور الطلبات
--
-- ⚠️  نفّذ هذا الملف من:
--   Supabase Dashboard → SQL Editor
--
-- ما تفعله هذه السكريبت:
--   1. تنشئ bucket اسمه "order-images" (public)
--   2. تضع سياسات RLS:
--      - المستخدمون المسجلون (Admin/Staff) يرفعون ويحذفون
--      - الجميع يشاهد (لأن الـ bucket public)
-- ============================================================================

-- 1. إنشاء الـ bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-images',
  'order-images',
  true,
  10485760,   -- 10 MB حد أقصى لكل ملف
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public            = true,
  file_size_limit   = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. سياسة الرفع: المستخدمون المسجلون فقط
CREATE POLICY "Authenticated users can upload order images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'order-images');

-- 3. سياسة التحديث (upsert): المستخدمون المسجلون فقط
CREATE POLICY "Authenticated users can update order images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'order-images');

-- 4. سياسة القراءة: الجميع (public bucket)
CREATE POLICY "Anyone can view order images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'order-images');

-- 5. سياسة الحذف: المستخدمون المسجلون فقط
CREATE POLICY "Authenticated users can delete order images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'order-images');

-- ============================================================================
-- للتحقق بعد التنفيذ:
-- SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'order-images';
-- ============================================================================
