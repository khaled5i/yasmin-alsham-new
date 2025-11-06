-- ============================================================================
-- Supabase Storage Setup for Product Images
-- إعداد Supabase Storage لصور المنتجات
-- ============================================================================

-- ملاحظة: هذا الملف يحتوي على تعليمات SQL لإنشاء Storage Bucket
-- يجب تنفيذه في Supabase Dashboard → SQL Editor

-- ============================================================================
-- 1. إنشاء Storage Bucket
-- ============================================================================

-- إنشاء bucket للصور (إذا لم يكن موجوداً)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true, -- public bucket
  5242880, -- 5MB max file size
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. إعداد Storage Policies (RLS)
-- ============================================================================

-- السماح للجميع بقراءة الصور
CREATE POLICY "Public Access for Product Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- السماح للمدراء فقط برفع الصور
CREATE POLICY "Admin Upload Product Images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  )
);

-- السماح للمدراء فقط بتحديث الصور
CREATE POLICY "Admin Update Product Images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  )
);

-- السماح للمدراء فقط بحذف الصور
CREATE POLICY "Admin Delete Product Images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  )
);

-- ============================================================================
-- 3. إنشاء المجلدات (Folders) - اختياري
-- ============================================================================

-- ملاحظة: المجلدات في Supabase Storage يتم إنشاؤها تلقائياً عند رفع الملفات
-- البنية المقترحة:
-- product-images/
--   ├── products/           (الصور الأساسية)
--   │   ├── 1234567890-abc123.jpg
--   │   └── 1234567891-def456.png
--   └── products/thumbnails/ (الصور المصغرة)
--       ├── thumb_1234567890-abc123.jpg
--       └── thumb_1234567891-def456.png

-- ============================================================================
-- 4. التحقق من الإعداد
-- ============================================================================

-- التحقق من إنشاء Bucket
SELECT * FROM storage.buckets WHERE id = 'product-images';

-- التحقق من Policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%Product Images%';

-- ============================================================================
-- ملاحظات مهمة
-- ============================================================================

/*
1. **تنفيذ هذا الملف:**
   - افتح Supabase Dashboard
   - اذهب إلى SQL Editor
   - انسخ والصق المحتوى
   - اضغط Run

2. **التحقق من الإعداد:**
   - اذهب إلى Storage في Supabase Dashboard
   - يجب أن ترى bucket باسم "product-images"
   - تحقق من أن Public Access مفعّل

3. **اختبار الرفع:**
   - جرب رفع صورة من لوحة التحكم
   - تحقق من ظهور الصورة في المجلد products/

4. **الأمان:**
   - المدراء فقط يمكنهم رفع/تعديل/حذف الصور
   - الجميع يمكنهم قراءة الصور (public access)

5. **الحد الأقصى لحجم الملف:**
   - 5MB لكل صورة
   - يمكن تغييره من file_size_limit في الأعلى

6. **أنواع الملفات المدعومة:**
   - JPG, JPEG, PNG, WEBP فقط
   - يمكن إضافة أنواع أخرى في allowed_mime_types
*/

