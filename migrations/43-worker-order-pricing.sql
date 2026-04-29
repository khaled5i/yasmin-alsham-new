-- Migration 43: إضافة أعمدة تسعير وتقييم العمال للطلبات
-- يستبدل التخزين المحلي (localStorage) بأعمدة في قاعدة البيانات
-- حتى تكون البيانات متاحة من أي جهاز

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS worker_price   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS worker_bonus   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS worker_rating  SMALLINT CHECK (worker_rating IS NULL OR (worker_rating >= 0 AND worker_rating <= 5)),
  ADD COLUMN IF NOT EXISTS worker_notes   TEXT;

-- فهرس لتسريع استعلامات تحديد الطلبات المسعَّرة لعامل معين
CREATE INDEX IF NOT EXISTS idx_orders_worker_price
  ON orders (worker_id, worker_price)
  WHERE worker_price IS NOT NULL;
