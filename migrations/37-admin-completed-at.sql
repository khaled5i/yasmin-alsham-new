-- ============================================================================
-- Migration 37: إضافة عمود admin_completed_at
-- يسجّل متى قام المدير بتغيير حالة الطلب إلى (completed أو delivered)
-- يُكمّل worker_completed_at الذي يسجّل إنهاء العامل
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS admin_completed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN orders.admin_completed_at IS 'وقت تغيير المدير لحالة الطلب إلى completed أو delivered';
