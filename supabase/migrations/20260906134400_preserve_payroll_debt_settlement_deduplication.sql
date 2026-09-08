BEGIN;
-- Only ordinary tailoring cash payments use the new request-based deduplication.
-- Preserve the existing safeguard for debt settlements and all other branches.
DROP INDEX public.uq_worker_payroll_payment_duplicate;
CREATE UNIQUE INDEX uq_worker_payroll_payment_duplicate ON public.worker_payroll_operations
  (branch,worker_id,payroll_year,payroll_month,operation_date,amount,COALESCE(metadata->>'debt_settlement','false'))
  WHERE operation_type='payment'
    AND (branch<>'tailoring' OR COALESCE(metadata->>'debt_settlement','false')='true');
COMMIT;
