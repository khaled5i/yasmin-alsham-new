-- ============================================================================
-- Migration 36: إضافة عمود روابط التصميم
-- Add design_links column to orders table
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS design_links TEXT DEFAULT NULL;

COMMENT ON COLUMN orders.design_links IS 'روابط التصاميم المرجعية التي يضيفها المستخدم عند إنشاء الطلب';
