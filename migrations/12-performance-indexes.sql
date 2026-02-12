-- =============================================================================
-- Migration: Add composite index for orders performance optimization
-- Created: 2026-02-12
-- Purpose: Optimize common query patterns used in dashboard order listing
-- =============================================================================

-- Composite index: (status, created_at DESC)
-- This index covers the most common query pattern: 
-- SELECT ... FROM orders WHERE status IN ('pending', 'in_progress') ORDER BY created_at DESC
-- Without this index, every query must full-scan + sort.
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at 
ON orders (status, created_at DESC);

-- Index for payment_status filtering (used in financial reports)
CREATE INDEX IF NOT EXISTS idx_orders_payment_status 
ON orders (payment_status);

-- Index for worker_id + status (used in worker dashboards)
CREATE INDEX IF NOT EXISTS idx_orders_worker_status 
ON orders (worker_id, status) 
WHERE worker_id IS NOT NULL;
