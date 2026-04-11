-- ============================================================================
-- Migration 29: فصل الأعلام من measurements إلى أعمدة حقيقية
-- Extract flag fields from measurements JSONB into dedicated columns
--
-- الأعمدة الجديدة:
--   has_measurements  - هل تم تسجيل مقاسات الطلب
--   is_printed        - هل تمت الطباعة
--   needs_review      - هل يحتاج مراجعة
--   is_pre_booking    - هل هو حجز مسبق
--   whatsapp_sent     - هل تم إرسال رسالة واتساب
--   fabric_type       - نوع القماش (داخلي/خارجي)
-- ============================================================================

-- 1. إضافة الأعمدة الجديدة
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS has_measurements  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_printed        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS needs_review      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_pre_booking    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fabric_type       TEXT;

-- 2. ترحيل البيانات من measurements إلى الأعمدة الجديدة
UPDATE orders SET
  has_measurements = COALESCE(
    (measurements->>'has_measurements')::boolean,
    FALSE
  ),
  is_printed = COALESCE(
    (measurements->>'is_printed')::boolean,
    FALSE
  ),
  needs_review = COALESCE(
    (measurements->>'needs_review')::boolean,
    FALSE
  ),
  is_pre_booking = COALESCE(
    (measurements->>'is_pre_booking')::boolean,
    FALSE
  ),
  whatsapp_sent = COALESCE(
    (measurements->>'whatsapp_sent')::boolean,
    FALSE
  ),
  fabric_type = measurements->>'fabric_type'
WHERE measurements IS NOT NULL AND measurements != '{}';

-- 3. فهارس للأعمدة الأكثر استخداماً في الفلترة
CREATE INDEX IF NOT EXISTS idx_orders_needs_review   ON orders(needs_review)   WHERE needs_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_is_pre_booking ON orders(is_pre_booking) WHERE is_pre_booking = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_has_measurements ON orders(has_measurements);
CREATE INDEX IF NOT EXISTS idx_orders_fabric_type    ON orders(fabric_type);

-- 4. تعليقات
COMMENT ON COLUMN orders.has_measurements  IS 'هل تم تسجيل مقاسات الطلب (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.is_printed        IS 'هل تمت طباعة الطلب (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.needs_review      IS 'هل يحتاج الطلب لمراجعة (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.is_pre_booking    IS 'هل الطلب حجز مسبق (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.whatsapp_sent     IS 'هل تم إرسال رسالة واتساب للعميل (نُقل من measurements JSONB)';
COMMENT ON COLUMN orders.fabric_type       IS 'نوع القماش: internal/external (نُقل من measurements JSONB)';

-- ملاحظة: القيم القديمة في measurements تُبقى مؤقتاً للتوافق العكسي.
-- بعد التحقق من نجاح الترحيل يمكن حذفها بـ:
-- UPDATE orders SET measurements = measurements - 'has_measurements' - 'is_printed'
--   - 'needs_review' - 'is_pre_booking' - 'whatsapp_sent' - 'fabric_type';
