-- Migration 22: Add delete_worker_payroll_operation stored procedure
-- This allows deleting a payroll operation (payment or advance) and recalculating the month
-- Fix: changed p_operation_id from TEXT to UUID to match worker_payroll_operations.id column type
-- Fix: use SET LOCAL app.bypass_trigger = 'true' to bypass immutability trigger
--      (app.* custom settings do not require superuser in PostgreSQL/Supabase)
-- Note: prevent_mutation_of_approved_payroll_operations trigger must check this setting (see below)

-- Step 1: Update the immutability trigger to support the bypass variable
CREATE OR REPLACE FUNCTION prevent_mutation_of_approved_payroll_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow bypass for controlled SECURITY DEFINER operations (e.g. delete_worker_payroll_operation)
  IF COALESCE(current_setting('app.bypass_trigger', TRUE), '') = 'true' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_approved THEN
    RAISE EXCEPTION 'Approved payroll operations cannot be updated'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.is_approved THEN
    RAISE EXCEPTION 'Approved payroll operations cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Step 2: Create the delete function
CREATE OR REPLACE FUNCTION delete_worker_payroll_operation(
  p_operation_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation worker_payroll_operations%ROWTYPE;
  v_month worker_payroll_months%ROWTYPE;
  v_op worker_payroll_operations%ROWTYPE;
  v_running_remaining NUMERIC;
BEGIN
  -- Get the operation to delete
  SELECT * INTO v_operation
  FROM worker_payroll_operations
  WHERE id = p_operation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operation not found';
  END IF;

  -- Check if the period is locked
  IF EXISTS (
    SELECT 1 FROM worker_payroll_period_locks
    WHERE branch = v_operation.branch
      AND payroll_year = v_operation.payroll_year
      AND payroll_month = v_operation.payroll_month
      AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete operation: payroll period is locked';
  END IF;

  -- Signal the immutability trigger to allow this controlled delete
  SET LOCAL "app.bypass_trigger" = 'true';

  -- Delete the operation
  DELETE FROM worker_payroll_operations
  WHERE id = p_operation_id;

  -- Get the month record
  SELECT * INTO v_month
  FROM worker_payroll_months
  WHERE branch = v_operation.branch
    AND worker_id = v_operation.worker_id
    AND payroll_year = v_operation.payroll_year
    AND payroll_month = v_operation.payroll_month;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Recalculate the month from scratch
  -- Update total_paid by summing all remaining payments
  UPDATE worker_payroll_months
  SET total_paid = COALESCE((
    SELECT SUM(amount)
    FROM worker_payroll_operations
    WHERE branch = v_month.branch
      AND worker_id = v_month.worker_id
      AND payroll_year = v_month.payroll_year
      AND payroll_month = v_month.payroll_month
      AND operation_type = 'payment'
  ), 0)
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Recalculate advances_total by summing all remaining advance operations
  UPDATE worker_payroll_months
  SET advances_total = COALESCE((
    SELECT SUM(amount)
    FROM worker_payroll_operations
    WHERE branch = v_month.branch
      AND worker_id = v_month.worker_id
      AND payroll_year = v_month.payroll_year
      AND payroll_month = v_month.payroll_month
      AND operation_type = 'advance'
  ), 0)
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Calculate remaining_due (net_due is auto-recalculated by trigger when advances_total changes)
  UPDATE worker_payroll_months
  SET remaining_due = net_due - total_paid
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Update salary_status based on remaining_due
  UPDATE worker_payroll_months
  SET salary_status = CASE
    WHEN remaining_due < -0.009 THEN 'negative'
    WHEN remaining_due > 0.009 THEN
      CASE
        WHEN total_paid > 0.009 THEN 'partial'
        ELSE 'unpaid'
      END
    ELSE
      CASE
        WHEN net_due > 0.009 THEN 'paid'
        ELSE 'zero'
      END
  END
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Refresh the month record
  SELECT * INTO v_month
  FROM worker_payroll_months
  WHERE branch = v_operation.branch
    AND worker_id = v_operation.worker_id
    AND payroll_year = v_operation.payroll_year
    AND payroll_month = v_operation.payroll_month;

  -- Recalculate before_amount and after_amount for all remaining operations
  -- (app.bypass_trigger is still 'true' from SET LOCAL above, UPDATE trigger is also bypassed)
  v_running_remaining := v_month.net_due;

  FOR v_op IN (
    SELECT * FROM worker_payroll_operations
    WHERE branch = v_operation.branch
      AND worker_id = v_operation.worker_id
      AND payroll_year = v_operation.payroll_year
      AND payroll_month = v_operation.payroll_month
      AND id != p_operation_id
    ORDER BY operation_date ASC, created_at ASC
  ) LOOP
    UPDATE worker_payroll_operations
    SET before_amount = v_running_remaining,
        after_amount = v_running_remaining - v_op.amount,
        salary_status_after = CASE
          WHEN (v_running_remaining - v_op.amount) < -0.009 THEN 'negative'
          WHEN (v_running_remaining - v_op.amount) > 0.009 THEN 'partial'
          WHEN v_month.net_due > 0.009 THEN 'paid'
          ELSE 'zero'
        END
    WHERE id = v_op.id;

    v_running_remaining := v_running_remaining - v_op.amount;
  END LOOP;

  -- Reset bypass signal (SET LOCAL auto-resets at transaction end, but explicit reset is safer)
  SET LOCAL "app.bypass_trigger" = '';

END;
$$;

GRANT EXECUTE ON FUNCTION delete_worker_payroll_operation(UUID) TO authenticated;
