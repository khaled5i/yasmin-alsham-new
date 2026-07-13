-- ============================================================================
-- الربط مع تطبيق الأستاذ للمحاسبة (alostaz.io) — فرع الأقمشة
-- ============================================================================
-- الهدف:
--   1) تتبّع مزامنة كل فاتورة مبيعات قماش مع الأستاذ (معرّف الفاتورة/العميل +
--      حالة الإرسال) لمنع الإرسال المكرر وإظهار حالة «تم الإرسال» في الواجهة.
--   2) ربط كل صنف مخزون بمنتجه المقابل في الأستاذ (alostaz_product_id) حتى
--      يُنشأ المنتج مرة واحدة فقط ثم يُعاد استخدامه في الفواتير اللاحقة.
--
--   يبني على الهجرة 64 (أعمدة الأستاذ على الطلبات + جدول app_settings).
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

-- ── (1) أعمدة الأستاذ على جدول الواردات (income) ─────────────────────────────
ALTER TABLE income
  ADD COLUMN IF NOT EXISTS alostaz_customer_id  INTEGER,
  ADD COLUMN IF NOT EXISTS alostaz_invoice_id   INTEGER,
  ADD COLUMN IF NOT EXISTS alostaz_invoice_code TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_sync_status  TEXT,        -- 'sent' | 'failed' | NULL
  ADD COLUMN IF NOT EXISTS alostaz_synced_at    TIMESTAMPTZ;

COMMENT ON COLUMN income.alostaz_customer_id  IS 'معرّف العميل (partner) في الأستاذ';
COMMENT ON COLUMN income.alostaz_invoice_id   IS 'معرّف الفاتورة في الأستاذ — وجوده يعني أن المبيعة أُرسِلت (منع التكرار)';
COMMENT ON COLUMN income.alostaz_invoice_code IS 'رقم الفاتورة النصّي في الأستاذ (مثل INV-26-1-000001)';
COMMENT ON COLUMN income.alostaz_sync_status  IS 'حالة آخر محاولة مزامنة: sent / failed';
COMMENT ON COLUMN income.alostaz_synced_at    IS 'وقت آخر محاولة مزامنة مع الأستاذ';

-- فهرس جزئي للمبيعات غير المُرسَلة في فرع الأقمشة (يسرّع الإرسال الجماعي)
CREATE INDEX IF NOT EXISTS idx_income_alostaz_unsent
  ON income (id)
  WHERE alostaz_invoice_id IS NULL;

-- ── (2) ربط صنف المخزون بمنتجه في الأستاذ ───────────────────────────────────
ALTER TABLE fabric_inventory
  ADD COLUMN IF NOT EXISTS alostaz_product_id INTEGER;

COMMENT ON COLUMN fabric_inventory.alostaz_product_id
  IS 'معرّف المنتج المقابل لهذا القماش في الأستاذ — يُنشأ مرة واحدة ثم يُعاد استخدامه';

-- ── (3) مفتاح الإرسال التلقائي لفواتير الأقمشة (منفصل عن التفصيل) ────────────
-- يعتمد على جدول app_settings المُنشأ في الهجرة 64. عند التفعيل تُرسَل فاتورة كل
-- مبيعة شبكة جديدة تلقائياً بمجرد إنشائها (الكاش مستثنى — يُرسَل يدوياً فقط).
INSERT INTO app_settings (key, value)
VALUES ('alostaz_fabrics_auto_send', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
