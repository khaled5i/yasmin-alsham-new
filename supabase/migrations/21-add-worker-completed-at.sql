-- ============================================================================
-- Add worker_completed_at field to orders table
-- Records the exact timestamp when the worker marked the order as completed
-- ============================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS worker_completed_at TIMESTAMPTZ;

-- Index for filtering/sorting completed orders by completion time
CREATE INDEX IF NOT EXISTS idx_orders_worker_completed_at
  ON orders (worker_completed_at)
  WHERE worker_completed_at IS NOT NULL;

COMMIT;
