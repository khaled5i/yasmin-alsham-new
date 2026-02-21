-- ============================================================================
-- إضافة دعم الفيديو إلى Storage Bucket
-- Add Video Support to Storage Bucket
-- ============================================================================

-- المشكلة: bucket الـ product-images يقبل فقط أنواع الصور (image/jpeg, image/jpg, image/png, image/webp)
-- الحل: إضافة أنواع الفيديو (video/mp4, video/quicktime, video/mov, video/webm, video/avi)
-- وزيادة حد حجم الملف من 5MB إلى 50MB لدعم الفيديوهات

-- تحديث bucket الموجود لإضافة دعم الفيديو
UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50MB (لدعم الفيديوهات)
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/mov', 'video/webm', 'video/avi'
  ]
WHERE id = 'product-images';

-- التحقق من التحديث
SELECT id, name, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'product-images';

/*
تعليمات التنفيذ:
1. افتح Supabase Dashboard
2. اذهب إلى SQL Editor
3. انسخ والصق هذا الملف
4. اضغط Run
5. تحقق من النتيجة - يجب أن ترى allowed_mime_types تتضمن أنواع الفيديو

بعد التنفيذ، سيتمكن المستخدمون من رفع الفيديوهات في قسم "صور التصميم"
*/

