-- The existing totals trigger inherited the caller search_path. Piecework synchronization
-- invokes it from a hardened private function, so all referenced helpers must be qualified.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_worker_payroll_month_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.net_due := ROUND(
    COALESCE(NEW.basic_salary, 0)
    + COALESCE(NEW.works_total, 0)
    + COALESCE(NEW.allowances_total, 0)
    -- Deductions are tracked separately as debt in worker_payroll_big_debts.
    - COALESCE(NEW.advances_total, 0),
    2
  );

  NEW.remaining_due := ROUND(
    COALESCE(NEW.net_due, 0) - COALESCE(NEW.total_paid, 0),
    2
  );
  NEW.salary_status := public.worker_payroll_status(NEW.net_due, NEW.total_paid);
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.worker_payroll_status(NUMERIC, NUMERIC)
  SET search_path = '';

COMMIT;
