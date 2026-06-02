-- Migration 50: Add design_summary_notes column for voice design summary
-- ملخص التصميم الصوتي: عمود JSONB جديد لحفظ التسجيلات الصوتية مع النصوص المحوّلة

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS design_summary_notes JSONB DEFAULT '[]'::jsonb;

-- Index للبحث السريع داخل الملخصات (اختياري)
CREATE INDEX IF NOT EXISTS idx_orders_design_summary_notes
  ON orders USING GIN (design_summary_notes);

COMMENT ON COLUMN orders.design_summary_notes IS
  'ملخص التصميم الصوتي: مصفوفة من التسجيلات الصوتية مع النص المحوّل لكل طلب';
