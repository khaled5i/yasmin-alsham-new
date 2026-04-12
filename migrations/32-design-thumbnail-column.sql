-- ============================================================================
-- Migration 32: نقل design_thumbnail من measurements JSONB إلى عمود مستقل
--
-- ⚠️  نفّذ هذا الملف من:
--   Supabase Dashboard → SQL Editor
--
-- ما تفعله هذه السكريبت:
--   1. تضيف عمود design_thumbnail TEXT مستقل
--   2. تنقل البيانات من measurements->>'design_thumbnail'
--   3. تحذف المفتاح من measurements
--
-- النتيجة:
--   measurements يبقى للمقاسات الرقمية + custom_design_image + ai_generated_images
--   design_thumbnail يصبح عموداً مستقلاً قابلاً للاستعلام مباشرة
-- ============================================================================

-- 1. إضافة العمود
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS design_thumbnail TEXT;

-- 2. نقل البيانات الموجودة
UPDATE orders
SET design_thumbnail = measurements->>'design_thumbnail'
WHERE measurements ? 'design_thumbnail'
  AND measurements->>'design_thumbnail' IS NOT NULL
  AND measurements->>'design_thumbnail' != '';

-- 3. تنظيف measurements من المفتاح المنقول
UPDATE orders
SET measurements = measurements - 'design_thumbnail'
WHERE measurements ? 'design_thumbnail';

-- 4. فهرس جزئي لتسريع الاستعلام على الطلبات التي لها thumbnail
CREATE INDEX IF NOT EXISTS idx_orders_has_thumbnail
  ON orders (design_thumbnail)
  WHERE design_thumbnail IS NOT NULL;

-- للتحقق بعد التنفيذ:
-- SELECT COUNT(*) FROM orders WHERE design_thumbnail IS NOT NULL;
-- SELECT COUNT(*) FROM orders WHERE measurements ? 'design_thumbnail';  -- يجب أن يُرجع 0
-- ============================================================================
