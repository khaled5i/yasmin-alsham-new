-- ============================================================================
-- Migration 08: Performance Optimization for Fabrics Table
-- ============================================================================
-- التاريخ: 2025-11-06
-- الهدف: تحسين أداء جدول الأقمشة بإضافة فهارس مفقودة
-- المشكلة: جدول fabrics يفتقر إلى فهارس مهمة مما يؤثر على أداء الاستعلامات
-- الحل: إضافة فهارس على الأعمدة المستخدمة في الفلترة والترتيب
-- ============================================================================

-- ============================================================================
-- الخطوة 1: إضافة فهارس مفقودة لجدول الأقمشة
-- ============================================================================

-- فهرس على created_at للترتيب (ORDER BY created_at DESC)
-- هذا الفهرس مهم جداً لأن جميع استعلامات الأقمشة تستخدم ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_fabrics_created_at ON fabrics(created_at DESC);

-- فهرس على price_per_meter للفلترة (WHERE price_per_meter BETWEEN min AND max)
-- يستخدم في فلترة الأقمشة حسب السعر
CREATE INDEX IF NOT EXISTS idx_fabrics_price_per_meter ON fabrics(price_per_meter);

-- فهرس على is_featured للفلترة (WHERE is_featured = true)
-- يستخدم في جلب الأقمشة المميزة
CREATE INDEX IF NOT EXISTS idx_fabrics_is_featured ON fabrics(is_featured);

-- فهرس على category للفلترة (WHERE category = 'silk')
-- يستخدم في فلترة الأقمشة حسب الفئة
CREATE INDEX IF NOT EXISTS idx_fabrics_category ON fabrics(category);

-- فهرس على is_available للفلترة (WHERE is_available = true)
-- يستخدم في جلب الأقمشة المتاحة فقط
-- ملاحظة: هذا الفهرس موجود بالفعل في is_active، لكن نحتاج is_available أيضاً
CREATE INDEX IF NOT EXISTS idx_fabrics_is_available ON fabrics(is_available);

-- فهرس على is_on_sale للفلترة (WHERE is_on_sale = true)
-- يستخدم في جلب الأقمشة المخفضة
CREATE INDEX IF NOT EXISTS idx_fabrics_is_on_sale ON fabrics(is_on_sale);

-- ============================================================================
-- الخطوة 2: إضافة فهارس مركبة (Composite Indexes) للاستعلامات الشائعة
-- ============================================================================

-- فهرس مركب على (is_available, is_active, created_at)
-- يستخدم في الاستعلام الأكثر شيوعاً: جلب الأقمشة المتاحة والنشطة مرتبة حسب التاريخ
CREATE INDEX IF NOT EXISTS idx_fabrics_available_active_created 
ON fabrics(is_available, is_active, created_at DESC)
WHERE is_available = true AND is_active = true;

-- فهرس مركب على (is_featured, is_available, is_active, created_at)
-- يستخدم في جلب الأقمشة المميزة
CREATE INDEX IF NOT EXISTS idx_fabrics_featured_available_created 
ON fabrics(is_featured, is_available, is_active, created_at DESC)
WHERE is_featured = true AND is_available = true AND is_active = true;

-- فهرس مركب على (category, is_available, created_at)
-- يستخدم في فلترة الأقمشة حسب الفئة
CREATE INDEX IF NOT EXISTS idx_fabrics_category_available_created 
ON fabrics(category, is_available, created_at DESC)
WHERE is_available = true;

-- ============================================================================
-- الخطوة 3: إضافة فهارس للبحث النصي (Full-Text Search)
-- ============================================================================

-- فهرس GIN للبحث النصي في الاسم (العربي)
CREATE INDEX IF NOT EXISTS idx_fabrics_name_search 
ON fabrics USING gin(to_tsvector('arabic', name));

-- فهرس GIN للبحث النصي في الوصف (العربي)
CREATE INDEX IF NOT EXISTS idx_fabrics_description_search 
ON fabrics USING gin(to_tsvector('arabic', description));

-- فهرس GIN للبحث في الوسوم (tags)
-- ملاحظة: يتطلب وجود عمود tags في جدول fabrics
-- إذا لم يكن موجوداً، يمكن تخطي هذا الفهرس
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fabrics' AND column_name = 'tags'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_fabrics_tags ON fabrics USING gin(tags);
  END IF;
END $$;

-- ============================================================================
-- الخطوة 4: تحليل الجدول لتحديث إحصائيات المحسّن
-- ============================================================================

-- تحليل جدول fabrics لتحديث إحصائيات PostgreSQL
-- هذا يساعد المحسّن (Query Planner) على اختيار أفضل خطة تنفيذ
ANALYZE fabrics;

-- ============================================================================
-- الخطوة 5: إضافة تعليقات على الفهارس
-- ============================================================================

COMMENT ON INDEX idx_fabrics_created_at IS 'فهرس للترتيب حسب تاريخ الإنشاء';
COMMENT ON INDEX idx_fabrics_price_per_meter IS 'فهرس للفلترة حسب السعر';
COMMENT ON INDEX idx_fabrics_is_featured IS 'فهرس للفلترة حسب الأقمشة المميزة';
COMMENT ON INDEX idx_fabrics_category IS 'فهرس للفلترة حسب الفئة';
COMMENT ON INDEX idx_fabrics_is_available IS 'فهرس للفلترة حسب التوفر';
COMMENT ON INDEX idx_fabrics_is_on_sale IS 'فهرس للفلترة حسب العروض';

-- ============================================================================
-- الخطوة 6: إنشاء دالة لتحديث updated_at تلقائياً (إذا لم تكن موجودة)
-- ============================================================================

-- التحقق من وجود الدالة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_fabrics_updated_at'
  ) THEN
    -- إنشاء الدالة
    CREATE OR REPLACE FUNCTION update_fabrics_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    -- إنشاء Trigger
    CREATE TRIGGER trigger_update_fabrics_updated_at
      BEFORE UPDATE ON fabrics
      FOR EACH ROW
      EXECUTE FUNCTION update_fabrics_updated_at();
  END IF;
END $$;

-- ============================================================================
-- الخطوة 7: إحصائيات الأداء
-- ============================================================================

-- عرض حجم الجدول والفهارس
SELECT 
  pg_size_pretty(pg_total_relation_size('fabrics')) as total_size,
  pg_size_pretty(pg_relation_size('fabrics')) as table_size,
  pg_size_pretty(pg_total_relation_size('fabrics') - pg_relation_size('fabrics')) as indexes_size;

-- عرض جميع الفهارس على جدول fabrics
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'fabrics'
ORDER BY indexname;

-- ============================================================================
-- ملاحظات مهمة
-- ============================================================================

-- 1. الفهارس تحسّن سرعة القراءة (SELECT) ولكن تبطئ الكتابة (INSERT/UPDATE/DELETE) قليلاً
-- 2. الفهارس المركبة (Composite) أكثر فعالية من الفهارس المفردة للاستعلامات المعقدة
-- 3. يجب تحليل الجدول (ANALYZE) بعد إضافة الفهارس
-- 4. يمكن مراقبة استخدام الفهارس باستخدام:
--    SELECT * FROM pg_stat_user_indexes WHERE relname = 'fabrics';
-- 5. إذا كان الفهرس غير مستخدم، يمكن حذفه لتوفير المساحة

-- ============================================================================
-- اختبار الأداء
-- ============================================================================

-- اختبار 1: جلب الأقمشة المتاحة مرتبة حسب التاريخ
EXPLAIN ANALYZE
SELECT * FROM fabrics
WHERE is_available = true AND is_active = true
ORDER BY created_at DESC
LIMIT 20;

-- اختبار 2: جلب الأقمشة المميزة
EXPLAIN ANALYZE
SELECT * FROM fabrics
WHERE is_featured = true AND is_available = true AND is_active = true
ORDER BY created_at DESC
LIMIT 4;

-- اختبار 3: فلترة حسب الفئة والسعر
EXPLAIN ANALYZE
SELECT * FROM fabrics
WHERE category = 'silk' 
  AND is_available = true
  AND price_per_meter BETWEEN 100 AND 500
ORDER BY created_at DESC;

-- اختبار 4: البحث النصي
EXPLAIN ANALYZE
SELECT * FROM fabrics
WHERE to_tsvector('arabic', name) @@ to_tsquery('arabic', 'حرير')
  AND is_available = true
ORDER BY created_at DESC;

-- ============================================================================
-- نهاية Migration
-- ============================================================================

-- ملاحظة: بعد تنفيذ هذا الـ Migration، يجب:
-- 1. مراقبة أداء الاستعلامات باستخدام EXPLAIN ANALYZE
-- 2. التحقق من استخدام الفهارس باستخدام pg_stat_user_indexes
-- 3. حذف الفهارس غير المستخدمة إذا لزم الأمر
-- 4. تحديث إحصائيات الجدول دورياً باستخدام ANALYZE

-- التأثير المتوقع:
-- - تحسين سرعة استعلامات الفلترة بنسبة 50-80%
-- - تحسين سرعة الترتيب (ORDER BY) بنسبة 60-90%
-- - تحسين سرعة البحث النصي بنسبة 80-95%
-- - زيادة طفيفة في حجم قاعدة البيانات (5-10%)
-- - تأثير طفيف على سرعة الكتابة (5-10% أبطأ)

