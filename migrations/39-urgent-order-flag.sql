-- Migration 39: إضافة حقل الطلب المستعجل
-- يضيف عمود is_urgent لتمييز الطلبات المستعجلة (مع زيادة السعر 30%)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE;

-- فهرس للتقارير والفلترة
CREATE INDEX IF NOT EXISTS idx_orders_is_urgent ON orders(is_urgent) WHERE is_urgent = TRUE;

COMMENT ON COLUMN orders.is_urgent IS 'هل هذا طلب مستعجل؟ (يُطبَّق عليه زيادة 30% في السعر)';
