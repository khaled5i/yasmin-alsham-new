-- ============================================================================
-- فواتير التفصيل المرحلية في الأستاذ: عربون الشبكة ثم شبكة المتبقي عند التسليم
-- ============================================================================
-- الإصدار 1 = طلب قديم؛ لا يُرسل تلقائياً بعد هذا التغيير.
-- الإصدار 2 = طلب جديد؛ له فاتورة عربون مستقلة وفاتورة تسليم مستقلة.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS alostaz_billing_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS alostaz_deposit_invoice_id INTEGER,
  ADD COLUMN IF NOT EXISTS alostaz_deposit_invoice_code TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_deposit_invoice_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS alostaz_deposit_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_deposit_sync_token UUID,
  ADD COLUMN IF NOT EXISTS alostaz_deposit_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_deposit_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.alostaz_billing_version IS
  '1 = طلب قديم يُعالج يدوياً، 2 = فاتورة عربون شبكة عند الإنشاء وفاتورة شبكة المتبقي عند التسليم';

COMMENT ON COLUMN public.orders.alostaz_deposit_invoice_id IS
  'معرّف فاتورة عربون الشبكة المرسلة إلى الأستاذ عند إنشاء الطلب';

COMMENT ON COLUMN public.orders.alostaz_deposit_invoice_code IS
  'رقم فاتورة عربون الشبكة المسترد من الأستاذ والمطبوع على الفاتورة المبدئية';

COMMENT ON COLUMN public.orders.alostaz_deposit_invoice_amount IS
  'قيمة عربون الشبكة التي أُرسلت في فاتورة الإنشاء إلى الأستاذ';

COMMENT ON COLUMN public.orders.alostaz_deposit_sync_status IS
  'حالة مزامنة فاتورة العربون: sending / sent / failed / review_required / NULL';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_alostaz_billing_version_valid,
  ADD CONSTRAINT orders_alostaz_billing_version_valid
    CHECK (alostaz_billing_version >= 1),
  DROP CONSTRAINT IF EXISTS orders_alostaz_deposit_invoice_amount_nonnegative,
  ADD CONSTRAINT orders_alostaz_deposit_invoice_amount_nonnegative
    CHECK (
      alostaz_deposit_invoice_amount IS NULL
      OR alostaz_deposit_invoice_amount >= 0
    ),
  DROP CONSTRAINT IF EXISTS orders_alostaz_deposit_sync_status_valid,
  ADD CONSTRAINT orders_alostaz_deposit_sync_status_valid
    CHECK (
      alostaz_deposit_sync_status IS NULL
      OR alostaz_deposit_sync_status IN ('sending', 'sent', 'failed', 'review_required')
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_alostaz_deposit_invoice_id_unique
  ON public.orders (alostaz_deposit_invoice_id)
  WHERE alostaz_deposit_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_alostaz_deposit_unsent_v2
  ON public.orders (id)
  WHERE alostaz_billing_version >= 2
    AND alostaz_deposit_invoice_id IS NULL;
