-- ============================================================================
-- Migration 33: نقل custom_design_image و ai_generated_images إلى أعمدة مستقلة
-- Extract custom_design_image and ai_generated_images from measurements JSONB
-- into dedicated top-level columns.
--
-- ⚠️  نفّذ هذا الملف من:
--   Supabase Dashboard → SQL Editor
--
-- السبب:
--   كلا الحقلين كانا داخل measurements JSONB، مما يسبب:
--   1. تلوث MeasurementsModal: يقرأ measurements كاملاً ويحوّل كل قيمة إلى
--      رقم بـ Number()، فتصبح URLs أرقام NaN تُخزَّن كـ null في DB.
--   2. ثقل measurements: حتى لو لم تكن الصور عناوين URL بعد، يحمّل كل
--      استعلام للقائمة هذه الحقول.
--
-- النتيجة بعد الهجرة:
--   measurements يحتوي فقط على الأرقام الفعلية (ch, sh, w...) + additional_notes
--   custom_design_image → عمود TEXT مستقل (URL أو null)
--   ai_generated_images → عمود JSONB مستقل (مصفوفة URLs)
-- ============================================================================

-- 1. إضافة الأعمدة الجديدة
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS custom_design_image TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated_images JSONB NOT NULL DEFAULT '[]';

-- 2. نقل البيانات الموجودة من measurements
UPDATE orders
SET
  custom_design_image = measurements->>'custom_design_image',
  ai_generated_images = COALESCE(measurements->'ai_generated_images', '[]'::jsonb)
WHERE measurements IS NOT NULL
  AND (
    measurements ? 'custom_design_image'
    OR measurements ? 'ai_generated_images'
  );

-- 3. تنظيف measurements من المفاتيح المنقولة
UPDATE orders
SET measurements = measurements - 'custom_design_image' - 'ai_generated_images'
WHERE measurements ? 'custom_design_image'
  OR measurements ? 'ai_generated_images';

-- للتحقق بعد التنفيذ:
-- SELECT COUNT(*) FROM orders WHERE custom_design_image IS NOT NULL;
-- SELECT COUNT(*) FROM orders WHERE ai_generated_images != '[]';
-- SELECT COUNT(*) FROM orders WHERE measurements ? 'custom_design_image';  -- يجب أن يُرجع 0
-- SELECT COUNT(*) FROM orders WHERE measurements ? 'ai_generated_images';  -- يجب أن يُرجع 0
-- ============================================================================
