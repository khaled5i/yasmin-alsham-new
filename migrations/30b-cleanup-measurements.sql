-- ============================================================================
-- Migration 30b: تنظيف measurements بعد نجاح migration 30
--
-- ⚠️  الشروط قبل تشغيل هذا الملف:
--   1. تم تشغيل migration 30 بنجاح (الأعمدة الثلاثة موجودة والبيانات مُرحَّلة)
--   2. تم رفع الكود الجديد على الإنترنت ويعمل بشكل صحيح
--   3. تحققت يدوياً أن تعليقات التصميم تظهر بشكل صحيح لعدة طلبات
--
-- ما تفعله هذه السكريبت:
--   تحذف image_annotations و image_drawings و saved_design_comments
--   من داخل عمود measurements لأنها انتقلت لأعمدة مستقلة.
--   الكود الجديد لا يقرأها من measurements بعد الآن.
-- ============================================================================

-- تنظيف measurements من الحقول المنقولة
-- (نُبقي: custom_design_image, ai_generated_images, design_thumbnail, والمقاسات الفعلية)
UPDATE orders SET
  measurements = measurements
    - 'image_annotations'
    - 'image_drawings'
    - 'saved_design_comments'
WHERE measurements IS NOT NULL
  AND measurements != '{}'::jsonb
  AND (
    measurements ? 'image_annotations'
    OR measurements ? 'image_drawings'
    OR measurements ? 'saved_design_comments'
  );

-- للتحقق بعد التشغيل: يجب أن يُرجع 0
SELECT COUNT(*) AS remaining_legacy_keys
FROM orders
WHERE measurements ? 'image_annotations'
   OR measurements ? 'image_drawings'
   OR measurements ? 'saved_design_comments';
