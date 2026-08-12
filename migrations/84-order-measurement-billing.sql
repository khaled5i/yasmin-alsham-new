-- ============================================================================
-- تصنيف المقاسات وفاتورة أجرة المقاس في تطبيق الأستاذ
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS measurement_source TEXT,
  ADD COLUMN IF NOT EXISTS measurement_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_measurement_invoice_id INTEGER,
  ADD COLUMN IF NOT EXISTS alostaz_measurement_invoice_code TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_measurement_invoice_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS alostaz_measurement_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_measurement_sync_token UUID,
  ADD COLUMN IF NOT EXISTS alostaz_measurement_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS alostaz_measurement_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.measurement_source IS
  'مصدر المقاس: yasmin_alsham أو external.';
COMMENT ON COLUMN public.orders.measurement_payment_method IS
  'طريقة دفع أجرة مقاس ياسمين الشام: cash أو card؛ وتكون NULL للمقاس الخارجي.';
COMMENT ON COLUMN public.orders.alostaz_measurement_invoice_id IS
  'معرّف فاتورة أجرة المقاس المرسلة إلى الأستاذ.';
COMMENT ON COLUMN public.orders.alostaz_measurement_invoice_code IS
  'رقم فاتورة أجرة المقاس النصّي في الأستاذ.';
COMMENT ON COLUMN public.orders.alostaz_measurement_invoice_amount IS
  'قيمة فاتورة أجرة المقاس بالريال، ثابتة حالياً عند 85 ريالاً شاملة الضريبة.';
COMMENT ON COLUMN public.orders.alostaz_measurement_sync_status IS
  'حالة مزامنة فاتورة المقاس: sending / sent / failed / review_required / NULL.';
COMMENT ON COLUMN public.orders.alostaz_measurement_sync_token IS
  'رمز محاولة إرسال فاتورة المقاس المستخدم للحجز الذري ومنع التكرار.';
COMMENT ON COLUMN public.orders.alostaz_measurement_sync_error IS
  'آخر خطأ في إرسال فاتورة المقاس إلى الأستاذ.';
COMMENT ON COLUMN public.orders.alostaz_measurement_synced_at IS
  'وقت آخر محاولة مزامنة لفاتورة المقاس.';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_measurement_selection_valid,
  ADD CONSTRAINT orders_measurement_selection_valid
    CHECK (
      (measurement_source IS NULL AND measurement_payment_method IS NULL)
      OR (measurement_source = 'external' AND measurement_payment_method IS NULL)
      OR (
        measurement_source = 'yasmin_alsham'
        AND measurement_payment_method IN ('cash', 'card')
      )
    ),
  DROP CONSTRAINT IF EXISTS orders_alostaz_measurement_amount_valid,
  ADD CONSTRAINT orders_alostaz_measurement_amount_valid
    CHECK (
      alostaz_measurement_invoice_amount IS NULL
      OR alostaz_measurement_invoice_amount = 85
    ),
  DROP CONSTRAINT IF EXISTS orders_alostaz_measurement_sync_status_valid,
  ADD CONSTRAINT orders_alostaz_measurement_sync_status_valid
    CHECK (
      alostaz_measurement_sync_status IS NULL
      OR alostaz_measurement_sync_status IN ('sending', 'sent', 'failed', 'review_required')
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_alostaz_measurement_invoice_id_unique
  ON public.orders (alostaz_measurement_invoice_id)
  WHERE alostaz_measurement_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_alostaz_measurement_unsent
  ON public.orders (id)
  WHERE measurement_source = 'yasmin_alsham'
    AND measurement_payment_method = 'card'
    AND alostaz_measurement_invoice_id IS NULL;
