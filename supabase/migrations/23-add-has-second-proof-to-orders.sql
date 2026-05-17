-- ============================================================================
-- Add has_second_proof field to orders table
-- When TRUE, indicates the order has a second proof delivery scheduled
-- one day before the final due_date (stored).
-- ============================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS has_second_proof BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
