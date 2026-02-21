-- ============================================================================
-- Add unlock functionality for worker payroll periods
-- ============================================================================

BEGIN;

-- Create function to unlock a payroll period
CREATE OR REPLACE FUNCTION unlock_worker_payroll_period(
  p_branch VARCHAR,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_lock worker_payroll_period_locks%ROWTYPE;
  v_unlocked_rows INTEGER := 0;
BEGIN
  -- Validate period
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll period'
      USING ERRCODE = '22023';
  END IF;

  -- Update or insert lock record to unlocked state
  INSERT INTO worker_payroll_period_locks (
    branch,
    payroll_year,
    payroll_month,
    is_locked,
    lock_reason,
    locked_at,
    locked_by
  ) VALUES (
    p_branch,
    p_year,
    p_month,
    FALSE,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (branch, payroll_year, payroll_month)
  DO UPDATE SET
    is_locked = FALSE,
    lock_reason = NULL,
    locked_at = NULL,
    locked_by = NULL
  RETURNING * INTO v_lock;

  -- Unlock all worker payroll month records for this period
  UPDATE worker_payroll_months
  SET is_locked = FALSE,
      locked_at = NULL,
      locked_by = NULL,
      updated_by = v_actor
  WHERE branch = p_branch
    AND payroll_year = p_year
    AND payroll_month = p_month
    AND is_locked = TRUE;

  GET DIAGNOSTICS v_unlocked_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'lock', to_jsonb(v_lock),
    'unlocked_rows', v_unlocked_rows
  );
END;
$$;

COMMIT;
