-- ============================================================================
-- Migration 34: نوع الخطأ في التعديلات + تتبع التعديلات في الطلبات
-- Add error_type / error_notes to alterations, alteration tracking to orders
-- ============================================================================

-- ============================================================================
-- 1. إضافة حقلَي نوع الخطأ والملاحظات إلى جدول alterations
-- ============================================================================

ALTER TABLE alterations
  ADD COLUMN IF NOT EXISTS error_type TEXT
    CHECK (error_type IN (
      'tailor_error',    -- خطأ الخياط
      'cutter_error',    -- خطأ القصاص
      'measurement_error', -- خطأ قياس
      'customer_error',  -- خطأ زبونة
      'other_error'      -- خطأ آخر
    )),
  ADD COLUMN IF NOT EXISTS error_notes TEXT;

COMMENT ON COLUMN alterations.error_type IS 'سبب التعديل: tailor_error / cutter_error / measurement_error / customer_error / other_error';
COMMENT ON COLUMN alterations.error_notes IS 'ملاحظات إضافية حول سبب التعديل (اختياري)';

-- ============================================================================
-- 2. إضافة حقول تتبع التعديلات إلى جدول orders
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS alteration_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_alterations   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_alteration_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.alteration_count  IS 'عدد طلبات التعديل المرتبطة بهذا الطلب';
COMMENT ON COLUMN orders.has_alterations   IS 'هل يوجد طلب تعديل مرتبط بهذا الطلب';
COMMENT ON COLUMN orders.last_alteration_at IS 'تاريخ آخر طلب تعديل مرتبط';

-- ============================================================================
-- 3. تهيئة بيانات الطلبات الموجودة بناءً على بيانات alterations الحالية
-- ============================================================================

UPDATE orders o
SET
  alteration_count   = a.cnt,
  has_alterations    = (a.cnt > 0),
  last_alteration_at = a.latest
FROM (
  SELECT
    original_order_id,
    COUNT(*)        AS cnt,
    MAX(created_at) AS latest
  FROM alterations
  WHERE original_order_id IS NOT NULL
  GROUP BY original_order_id
) a
WHERE o.id = a.original_order_id;

-- ============================================================================
-- 4. فهرس لتحسين الأداء
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_alterations_error_type ON alterations(error_type);
CREATE INDEX IF NOT EXISTS idx_orders_has_alterations  ON orders(has_alterations);
