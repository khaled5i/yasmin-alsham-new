-- ============================================================================
-- Fabrics: default auto-send + atomic Alostaz invoice idempotency + Realtime
-- ============================================================================

ALTER TABLE public.income
  ADD COLUMN IF NOT EXISTS alostaz_sync_token UUID,
  ADD COLUMN IF NOT EXISTS alostaz_sync_error TEXT;

COMMENT ON COLUMN public.income.alostaz_sync_token IS
  'Unique token of the Alostaz invoice dispatch attempt that claimed this fabric sale.';

COMMENT ON COLUMN public.income.alostaz_sync_error IS
  'Last Alostaz dispatch error. review_required blocks unsafe automatic retries.';

COMMENT ON COLUMN public.income.alostaz_sync_status IS
  'Alostaz sync state: sending / sent / failed / review_required / NULL.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_income_alostaz_invoice_id_unique
  ON public.income (alostaz_invoice_id)
  WHERE alostaz_invoice_id IS NOT NULL;

ALTER TABLE public.income
  DROP CONSTRAINT IF EXISTS income_alostaz_sync_status_valid;

ALTER TABLE public.income
  ADD CONSTRAINT income_alostaz_sync_status_valid
  CHECK (
    alostaz_sync_status IS NULL
    OR alostaz_sync_status IN ('sending', 'sent', 'failed', 'review_required')
  );

-- Auto-send is enabled by default. It remains enabled until explicitly stopped
-- from the fabrics print station.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('alostaz_fabrics_auto_send', '{"enabled": true}'::jsonb, now())
ON CONFLICT (key) DO UPDATE
SET value = '{"enabled": true}'::jsonb,
    updated_at = now();

-- Publish income updates so the sent badge synchronizes across open devices.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'income'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.income;
  END IF;
END
$$;
