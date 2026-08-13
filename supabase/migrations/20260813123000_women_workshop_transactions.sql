-- Women workshop transactions ledger

CREATE TABLE IF NOT EXISTS public.women_workshop_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'manual_invoice'
    CHECK (source IN ('manual_invoice', 'order_measurement')),
  operation_type TEXT NOT NULL
    CHECK (
      operation_type IN (
        'external_measurement',
        'fitting',
        'bridal_measurement',
        'dress_alteration',
        'other',
        'order_measurement'
      )
    ),
  operation_name TEXT NOT NULL
    CHECK (char_length(btrim(operation_name)) BETWEEN 2 AND 120),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alostaz_customer_id INTEGER,
  alostaz_invoice_id INTEGER,
  alostaz_invoice_code TEXT,
  alostaz_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      alostaz_sync_status IN (
        'pending',
        'sending',
        'sent',
        'failed',
        'review_required',
        'not_required'
      )
    ),
  alostaz_sync_token UUID,
  alostaz_sync_error TEXT,
  alostaz_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, order_id)
);

COMMENT ON TABLE public.women_workshop_transactions IS
  'السجل المالي الموحد لفواتير المشغل النسائي وعمليات أخذ المقاس من صفحة الطلبات الحديثة.';
COMMENT ON COLUMN public.women_workshop_transactions.amount IS
  'المبلغ النهائي شامل ضريبة القيمة المضافة.';
COMMENT ON COLUMN public.women_workshop_transactions.payment_method IS
  'cash للكاش المحلي أو card للشبكة المرسلة إلى تطبيق الأستاذ.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_women_workshop_alostaz_invoice_unique
  ON public.women_workshop_transactions (alostaz_invoice_id)
  WHERE alostaz_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_women_workshop_occurred_at
  ON public.women_workshop_transactions (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_women_workshop_payment_method
  ON public.women_workshop_transactions (payment_method, occurred_at DESC);

ALTER TABLE public.women_workshop_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS women_workshop_read_accounting ON public.women_workshop_transactions;
CREATE POLICY women_workshop_read_accounting
  ON public.women_workshop_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'accountant'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS women_workshop_admin_manage ON public.women_workshop_transactions;
CREATE POLICY women_workshop_admin_manage
  ON public.women_workshop_transactions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'general_manager'
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'general_manager'
            )
          )
        )
    )
  );

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.sync_women_workshop_measurement_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.has_measurements IS TRUE
    AND NEW.measurement_source = 'yasmin_alsham'
    AND NEW.measurement_payment_method = 'card'
  THEN
    INSERT INTO public.women_workshop_transactions (
      source,
      operation_type,
      operation_name,
      amount,
      payment_method,
      order_id,
      created_by,
      occurred_at,
      alostaz_customer_id,
      alostaz_invoice_id,
      alostaz_invoice_code,
      alostaz_sync_status,
      alostaz_sync_token,
      alostaz_sync_error,
      alostaz_synced_at,
      updated_at
    )
    VALUES (
      'order_measurement',
      'order_measurement',
      'أخذ مقاس',
      85,
      'card',
      NEW.id,
      auth.uid(),
      COALESCE(NEW.alostaz_measurement_synced_at, now()),
      NEW.alostaz_customer_id,
      NEW.alostaz_measurement_invoice_id,
      NEW.alostaz_measurement_invoice_code,
      COALESCE(NEW.alostaz_measurement_sync_status, 'pending'),
      NEW.alostaz_measurement_sync_token,
      NEW.alostaz_measurement_sync_error,
      NEW.alostaz_measurement_synced_at,
      now()
    )
    ON CONFLICT (source, order_id)
    DO UPDATE SET
      alostaz_customer_id = EXCLUDED.alostaz_customer_id,
      alostaz_invoice_id = EXCLUDED.alostaz_invoice_id,
      alostaz_invoice_code = EXCLUDED.alostaz_invoice_code,
      alostaz_sync_status = EXCLUDED.alostaz_sync_status,
      alostaz_sync_token = EXCLUDED.alostaz_sync_token,
      alostaz_sync_error = EXCLUDED.alostaz_sync_error,
      alostaz_synced_at = EXCLUDED.alostaz_synced_at,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_women_workshop_measurement_transaction() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_women_workshop_measurement_transaction ON public.orders;
CREATE TRIGGER sync_women_workshop_measurement_transaction
  AFTER INSERT OR UPDATE OF
    has_measurements,
    measurement_source,
    measurement_payment_method,
    alostaz_customer_id,
    alostaz_measurement_invoice_id,
    alostaz_measurement_invoice_code,
    alostaz_measurement_sync_status,
    alostaz_measurement_sync_token,
    alostaz_measurement_sync_error,
    alostaz_measurement_synced_at
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_women_workshop_measurement_transaction();
