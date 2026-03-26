-- ============================================================================
-- Add admin_confirmed field to orders table
-- When admin clicks the "send ready for pickup" button, the order is marked as
-- confirmed/reviewed. The customer-facing status only shows "ready for pickup"
-- after admin_confirmed = true.
-- ============================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS admin_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for filtering by admin_confirmed in completed orders
CREATE INDEX IF NOT EXISTS idx_orders_admin_confirmed
  ON orders (admin_confirmed)
  WHERE status = 'completed';

COMMIT;
