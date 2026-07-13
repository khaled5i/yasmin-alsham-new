-- ============================================================================
-- الربط مع تطبيق الأستاذ للمحاسبة (alostaz.io) — فرع التفصيل
-- ============================================================================
-- الهدف:
--   1) تتبّع مزامنة كل طلب مع الأستاذ (معرّف الفاتورة/العميل + حالة الإرسال)
--      لمنع الإرسال المكرر وإظهار حالة «تم الإرسال» في الواجهة.
--   2) إعداد عام (app_settings) لتفعيل «الإرسال التلقائي لكل الفواتير».
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

-- ── (1) أعمدة الأستاذ على جدول الطلبات ───────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS alostaz_customer_id  INTEGER,
  ADD COLUMN IF NOT EXISTS alostaz_invoice_id   INTEGER,
  ADD COLUMN IF NOT EXISTS alostaz_invoice_code TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_sync_status  TEXT,        -- 'sent' | 'failed' | NULL
  ADD COLUMN IF NOT EXISTS alostaz_synced_at    TIMESTAMPTZ;

COMMENT ON COLUMN orders.alostaz_customer_id  IS 'معرّف العميل (partner) في الأستاذ';
COMMENT ON COLUMN orders.alostaz_invoice_id   IS 'معرّف الفاتورة في الأستاذ — وجوده يعني أن الطلب أُرسِل (منع التكرار)';
COMMENT ON COLUMN orders.alostaz_invoice_code IS 'رقم الفاتورة النصّي في الأستاذ (مثل INV-26-1-000001)';
COMMENT ON COLUMN orders.alostaz_sync_status  IS 'حالة آخر محاولة مزامنة: sent / failed';
COMMENT ON COLUMN orders.alostaz_synced_at    IS 'وقت آخر محاولة مزامنة مع الأستاذ';

-- فهرس جزئي للطلبات غير المُرسَلة (يسرّع أي مسح لاحق)
CREATE INDEX IF NOT EXISTS idx_orders_alostaz_unsent
  ON orders (id)
  WHERE alostaz_invoice_id IS NULL;

-- ── (2) إعدادات عامة (key/value) — لمفتاح الإرسال التلقائي ────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_settings IS 'إعدادات عامة للتطبيق (مفتاح/قيمة)';

-- القيمة الافتراضية: الإرسال التلقائي متوقّف
INSERT INTO app_settings (key, value)
VALUES ('alostaz_auto_send', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS: القراءة لأي مستخدم مسجّل؛ الكتابة للمدير فقط
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_authenticated" ON app_settings;
CREATE POLICY "app_settings_select_authenticated"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_settings_write_admin" ON app_settings;
CREATE POLICY "app_settings_write_admin"
  ON app_settings FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
