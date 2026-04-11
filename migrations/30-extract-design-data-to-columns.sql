-- ============================================================================
-- Migration 30: فصل بيانات التصميم من measurements إلى أعمدة JSONB مستقلة
-- Extract design data from measurements JSONB into dedicated JSONB columns
--
-- الأعمدة الجديدة:
--   image_annotations  - تعليقات صوتية على الصورة (مصفوفة JSON)
--   image_drawings     - مسارات الرسم على الصورة (مصفوفة JSON)
--   design_comments    - تعليقات التصميم المحفوظة (كان اسمها saved_design_comments)
--
-- الفائدة:
--   كل عمود يُحدَّث باستقلالية تامة - عند تحديث الرسومات مثلاً لا نحتاج
--   لقراءة المقاسات ودمجها، مما يمنع بغ حذف البيانات الذي واجهناه سابقاً.
-- ============================================================================

-- 1. إضافة الأعمدة الجديدة
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS image_annotations  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS image_drawings     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS design_comments    JSONB NOT NULL DEFAULT '[]';

-- 2. ترحيل البيانات من measurements إلى الأعمدة الجديدة
UPDATE orders SET
  image_annotations = COALESCE(
    measurements->'image_annotations',
    '[]'::jsonb
  ),
  image_drawings = COALESCE(
    measurements->'image_drawings',
    '[]'::jsonb
  ),
  design_comments = COALESCE(
    measurements->'saved_design_comments',
    '[]'::jsonb
  )
WHERE measurements IS NOT NULL
  AND measurements != '{}'::jsonb
  AND (
    measurements ? 'image_annotations'
    OR measurements ? 'image_drawings'
    OR measurements ? 'saved_design_comments'
  );

-- ⚠️  الخطوة 3 (تنظيف measurements) محذوفة من هنا عمداً
-- ============================================================================
-- لا تنفّذ تنظيف measurements قبل رفع الكود الجديد على الإنترنت.
-- الكود القديم المنشور يقرأ من measurements مباشرة، وحذف الحقول منها
-- سيُظهر تعليقات التصميم فارغة للمستخدمين حتى يُرفع الكود الجديد.
--
-- بعد التحقق من أن الكود الجديد يعمل على الإنترنت، شغّل ملف:
--   migrations/30b-cleanup-measurements.sql
-- ============================================================================

-- 4. فهارس GIN لتسريع البحث داخل المصفوفات (اختيارية - تُفعَّل عند الحاجة)
-- CREATE INDEX IF NOT EXISTS idx_orders_image_annotations ON orders USING GIN (image_annotations);
-- CREATE INDEX IF NOT EXISTS idx_orders_image_drawings    ON orders USING GIN (image_drawings);
-- CREATE INDEX IF NOT EXISTS idx_orders_design_comments  ON orders USING GIN (design_comments);

-- فهرس جزئي لاكتشاف الطلبات التي تحتوي على تعليقات تصميم (أكثر كفاءة)
CREATE INDEX IF NOT EXISTS idx_orders_has_design_comments
  ON orders ((design_comments != '[]'::jsonb))
  WHERE design_comments != '[]'::jsonb;

-- 5. تعليقات
COMMENT ON COLUMN orders.image_annotations IS 'تعليقات صوتية على صورة التصميم (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.image_drawings    IS 'مسارات الرسم على صورة التصميم (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.design_comments   IS 'تعليقات التصميم المحفوظة (كانت saved_design_comments داخل measurements)';

-- ملاحظة: measurements بعد هذه الهجرة يحتوي فقط على:
--   المقاسات الفعلية (chest, waist, etc.)
--   custom_design_image  - صورة base64 مخصصة (ستُعالج في migration 31)
--   ai_generated_images  - صور AI
--   design_thumbnail     - صورة مصغرة للعرض في بطاقة العامل
