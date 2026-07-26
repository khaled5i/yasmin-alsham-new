-- ============================================================================
-- Atomic idempotency guard for tailoring invoices sent to Alostaz
-- ============================================================================
-- The old guard checked alostaz_invoice_id before the remote request. Two
-- concurrent requests could both see NULL, create two invoices, then save only
-- one remote id. The route now atomically changes the row to "sending" before
-- it calls Alostaz. PostgreSQL row locking guarantees that only one request can
-- win that conditional update.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS alostaz_sync_token UUID,
  ADD COLUMN IF NOT EXISTS alostaz_sync_error TEXT;

COMMENT ON COLUMN public.orders.alostaz_sync_token IS
  'Unique token of the invoice dispatch attempt that atomically claimed this order.';

COMMENT ON COLUMN public.orders.alostaz_sync_error IS
  'Last Alostaz dispatch error. review_required blocks unsafe automatic retries.';

COMMENT ON COLUMN public.orders.alostaz_sync_status IS
  'Alostaz sync state: sending / sent / failed / review_required / NULL.';

-- A remote invoice must never be mapped back to more than one tailoring order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_alostaz_invoice_id_unique
  ON public.orders (alostaz_invoice_id)
  WHERE alostaz_invoice_id IS NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_alostaz_sync_status_valid;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_alostaz_sync_status_valid
  CHECK (
    alostaz_sync_status IS NULL
    OR alostaz_sync_status IN ('sending', 'sent', 'failed', 'review_required')
  );
