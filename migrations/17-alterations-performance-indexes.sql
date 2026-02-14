-- =============================================================================
-- Migration: Add composite indexes for alterations listing performance
-- Created: 2026-02-14
-- Purpose: Optimize list queries that filter by status/search and order by created_at
-- =============================================================================

-- Covers:
-- SELECT ... FROM alterations WHERE status IN (...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_alterations_status_created_at
ON alterations (status, created_at DESC);

-- Covers worker dashboards:
-- SELECT ... FROM alterations WHERE worker_id = ? AND status IN (...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_alterations_worker_status_created_at
ON alterations (worker_id, status, created_at DESC)
WHERE worker_id IS NOT NULL;

ANALYZE alterations;
