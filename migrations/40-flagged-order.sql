-- Migration 40: إضافة حقل الإشارة على الطلب
-- يضيف عمود is_flagged لتمييز الطلبات المُعلَّمة (يُلوَّن اسم العميل باللون الأحمر في الطباعة)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;

-- فهرس للتقارير والفلترة
CREATE INDEX IF NOT EXISTS idx_orders_is_flagged ON orders(is_flagged) WHERE is_flagged = TRUE;

COMMENT ON COLUMN orders.is_flagged IS 'هل هذا طلب مُعلَّم بإشارة؟ (يُلوَّن اسم العميل باللون الأحمر في الطباعة)';
