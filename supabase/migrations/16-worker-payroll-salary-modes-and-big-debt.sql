-- ============================================================================
-- Worker Payroll Salary Modes + Big Debt Tracking
-- ============================================================================

BEGIN;

-- ============================================================================
-- Salary system columns (fixed / piecework + overtime)
-- ============================================================================

ALTER TABLE worker_payroll_months
  ADD COLUMN IF NOT EXISTS salary_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS fixed_salary_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fixed_salary_value >= 0),
  ADD COLUMN IF NOT EXISTS piece_count NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (piece_count >= 0),
  ADD COLUMN IF NOT EXISTS piece_rate NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (piece_rate >= 0),
  ADD COLUMN IF NOT EXISTS piece_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (piece_total >= 0),
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(14,2) NOT NULL DEFAULT 12.5 CHECK (overtime_rate >= 0),
  ADD COLUMN IF NOT EXISTS overtime_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (overtime_total >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'worker_payroll_months_salary_type_check'
  ) THEN
    ALTER TABLE worker_payroll_months
      ADD CONSTRAINT worker_payroll_months_salary_type_check
      CHECK (salary_type IN ('fixed', 'piecework'));
  END IF;
END;
$$;

UPDATE worker_payroll_months
SET
  salary_type = COALESCE(NULLIF(salary_type, ''), 'fixed'),
  fixed_salary_value = CASE
    WHEN COALESCE(fixed_salary_value, 0) > 0 THEN ROUND(fixed_salary_value, 2)
    ELSE ROUND(COALESCE(basic_salary, 0), 2)
  END,
  piece_count = ROUND(COALESCE(piece_count, 0), 2),
  piece_rate = ROUND(COALESCE(piece_rate, 0), 2),
  piece_total = ROUND(COALESCE(piece_total, 0), 2),
  overtime_hours = ROUND(COALESCE(overtime_hours, 0), 2),
  overtime_rate = CASE
    WHEN COALESCE(overtime_rate, 0) > 0 THEN ROUND(overtime_rate, 2)
    ELSE 12.5
  END,
  overtime_total = ROUND(COALESCE(overtime_total, 0), 2);

-- ============================================================================
-- Big debt table (not auto deducted from salary)
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_payroll_big_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  remaining_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  has_active_debt BOOLEAN GENERATED ALWAYS AS (remaining_amount > 0) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (branch, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_payroll_big_debts_scope
  ON worker_payroll_big_debts(branch, worker_id);

CREATE OR REPLACE FUNCTION set_worker_payroll_big_debts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_payroll_big_debts_updated_at ON worker_payroll_big_debts;
CREATE TRIGGER trg_worker_payroll_big_debts_updated_at
BEFORE UPDATE ON worker_payroll_big_debts
FOR EACH ROW
EXECUTE FUNCTION set_worker_payroll_big_debts_updated_at();

CREATE OR REPLACE FUNCTION upsert_worker_payroll_big_debt(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_amount NUMERIC(14,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_debt worker_payroll_big_debts%ROWTYPE;
BEGIN
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'Debt amount cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO worker_payroll_big_debts (
    branch,
    worker_id,
    worker_name,
    original_amount,
    remaining_amount,
    created_by,
    updated_by
  ) VALUES (
    p_branch,
    p_worker_id,
    COALESCE(NULLIF(BTRIM(p_worker_name), ''), p_worker_id),
    v_amount,
    v_amount,
    v_actor,
    v_actor
  )
  ON CONFLICT (branch, worker_id)
  DO UPDATE SET
    worker_name = COALESCE(NULLIF(BTRIM(EXCLUDED.worker_name), ''), EXCLUDED.worker_id),
    original_amount = EXCLUDED.original_amount,
    remaining_amount = EXCLUDED.remaining_amount,
    updated_by = v_actor
  RETURNING * INTO v_debt;

  RETURN to_jsonb(v_debt);
END;
$$;

CREATE OR REPLACE FUNCTION register_worker_payroll_big_debt_payment(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_amount NUMERIC(14,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_debt worker_payroll_big_debts%ROWTYPE;
BEGIN
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Debt payment amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_debt
  FROM worker_payroll_big_debts
  WHERE branch = p_branch
    AND worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Big debt is not found for this worker'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_debt.remaining_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'No active debt to settle'
      USING ERRCODE = '22023';
  END IF;

  IF v_amount > v_debt.remaining_amount + 0.009 THEN
    RAISE EXCEPTION 'Debt payment amount cannot exceed remaining amount'
      USING ERRCODE = '22023';
  END IF;

  UPDATE worker_payroll_big_debts
  SET remaining_amount = ROUND(remaining_amount - v_amount, 2),
      updated_by = v_actor
  WHERE id = v_debt.id
  RETURNING * INTO v_debt;

  RETURN to_jsonb(v_debt);
END;
$$;

-- ============================================================================
-- RPC: Upsert salary month snapshot (supports fixed/piecework + overtime)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_worker_payroll_month_snapshot(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER,
  p_basic_salary NUMERIC,
  p_works_total NUMERIC,
  p_allowances_total NUMERIC,
  p_deductions_total NUMERIC,
  p_advances_total NUMERIC,
  p_operation_date DATE DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_salary_type VARCHAR DEFAULT 'fixed',
  p_fixed_salary_value NUMERIC DEFAULT NULL,
  p_piece_count NUMERIC DEFAULT 0,
  p_piece_rate NUMERIC DEFAULT 0,
  p_overtime_hours NUMERIC DEFAULT 0,
  p_overtime_rate NUMERIC DEFAULT 12.5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_month worker_payroll_months%ROWTYPE;
  v_before NUMERIC(14,2) := 0;
  v_after NUMERIC(14,2) := 0;
  v_operation worker_payroll_operations%ROWTYPE;
  v_operation_id UUID := gen_random_uuid();
  v_reference TEXT;
  v_operation_date DATE := COALESCE(
    p_operation_date,
    (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE
  );
  v_journal_id UUID;
  v_salary_type VARCHAR(20) := CASE
    WHEN COALESCE(BTRIM(p_salary_type), '') = 'piecework' THEN 'piecework'
    ELSE 'fixed'
  END;
  v_fixed_salary_value NUMERIC(14,2) := ROUND(COALESCE(p_fixed_salary_value, p_basic_salary, 0), 2);
  v_piece_count NUMERIC(14,2) := ROUND(COALESCE(p_piece_count, 0), 2);
  v_piece_rate NUMERIC(14,2) := ROUND(COALESCE(p_piece_rate, 0), 2);
  v_piece_total NUMERIC(14,2);
  v_overtime_hours NUMERIC(14,2) := ROUND(COALESCE(p_overtime_hours, 0), 2);
  v_overtime_rate NUMERIC(14,2) := 12.5;
  v_overtime_total NUMERIC(14,2);
  v_effective_basic NUMERIC(14,2);
  v_effective_works NUMERIC(14,2);
BEGIN
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll period'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_allowances_total, 0) < 0
     OR COALESCE(p_deductions_total, 0) < 0
     OR COALESCE(p_advances_total, 0) < 0
     OR v_fixed_salary_value < 0
     OR v_piece_count < 0
     OR v_piece_rate < 0
     OR v_overtime_hours < 0 THEN
    RAISE EXCEPTION 'Salary components cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  IF is_worker_payroll_period_locked(p_branch, p_year, p_month) THEN
    RAISE EXCEPTION 'Payroll month is locked'
      USING ERRCODE = '42501';
  END IF;

  PERFORM assert_worker_payroll_operation_period(p_year, p_month, v_operation_date);

  v_overtime_total := ROUND(v_overtime_hours * v_overtime_rate, 2);
  v_piece_total := ROUND(v_piece_count * v_piece_rate, 2);

  IF v_salary_type = 'fixed' THEN
    v_effective_basic := v_fixed_salary_value;
    IF v_overtime_hours > 0 THEN
      v_effective_works := v_overtime_total;
    ELSE
      v_effective_works := ROUND(COALESCE(p_works_total, 0), 2);
    END IF;
  ELSE
    v_effective_basic := 0;
    IF v_piece_count > 0 OR v_piece_rate > 0 OR v_overtime_hours > 0 THEN
      v_effective_works := ROUND(v_piece_total + v_overtime_total, 2);
    ELSE
      v_effective_works := ROUND(COALESCE(p_works_total, 0), 2);
      v_piece_total := ROUND(GREATEST(v_effective_works - v_overtime_total, 0), 2);
    END IF;
  END IF;

  SELECT remaining_due
  INTO v_before
  FROM worker_payroll_months
  WHERE branch = p_branch
    AND worker_id = p_worker_id
    AND payroll_year = p_year
    AND payroll_month = p_month
  LIMIT 1;

  v_before := COALESCE(v_before, 0);

  INSERT INTO worker_payroll_months (
    branch,
    worker_id,
    worker_name,
    payroll_year,
    payroll_month,
    basic_salary,
    works_total,
    salary_type,
    fixed_salary_value,
    piece_count,
    piece_rate,
    piece_total,
    overtime_hours,
    overtime_rate,
    overtime_total,
    allowances_total,
    deductions_total,
    advances_total,
    approved_at,
    approved_by,
    created_by,
    updated_by
  ) VALUES (
    p_branch,
    p_worker_id,
    p_worker_name,
    p_year,
    p_month,
    ROUND(v_effective_basic, 2),
    ROUND(v_effective_works, 2),
    v_salary_type,
    v_fixed_salary_value,
    v_piece_count,
    v_piece_rate,
    v_piece_total,
    v_overtime_hours,
    v_overtime_rate,
    v_overtime_total,
    ROUND(COALESCE(p_allowances_total, 0), 2),
    ROUND(COALESCE(p_deductions_total, 0), 2),
    ROUND(COALESCE(p_advances_total, 0), 2),
    NOW(),
    v_actor,
    v_actor,
    v_actor
  )
  ON CONFLICT (branch, worker_id, payroll_year, payroll_month)
  DO UPDATE SET
    worker_name = EXCLUDED.worker_name,
    basic_salary = EXCLUDED.basic_salary,
    works_total = EXCLUDED.works_total,
    salary_type = EXCLUDED.salary_type,
    fixed_salary_value = EXCLUDED.fixed_salary_value,
    piece_count = EXCLUDED.piece_count,
    piece_rate = EXCLUDED.piece_rate,
    piece_total = EXCLUDED.piece_total,
    overtime_hours = EXCLUDED.overtime_hours,
    overtime_rate = EXCLUDED.overtime_rate,
    overtime_total = EXCLUDED.overtime_total,
    allowances_total = EXCLUDED.allowances_total,
    deductions_total = EXCLUDED.deductions_total,
    advances_total = EXCLUDED.advances_total,
    approved_at = NOW(),
    approved_by = v_actor,
    updated_by = v_actor
  RETURNING * INTO v_month;

  v_after := COALESCE(v_month.remaining_due, 0);
  v_reference := NULLIF(BTRIM(p_reference), '');

  IF v_reference IS NULL THEN
    v_reference := 'SAL-' || p_worker_id || '-' || p_year::TEXT || LPAD(p_month::TEXT, 2, '0') || '-' ||
      TO_CHAR(NOW(), 'HH24MISSMS');
  END IF;

  IF v_month.net_due > 0 THEN
    v_journal_id := create_worker_payroll_journal_entry(
      v_operation_id,
      'salary',
      v_month.net_due,
      v_operation_date,
      p_year,
      p_month,
      'Payroll accrual - ' || p_worker_name || ' - ' || p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0'),
      'cash'
    );
  ELSE
    v_journal_id := NULL;
  END IF;

  INSERT INTO worker_payroll_operations (
    id,
    payroll_month_id,
    branch,
    worker_id,
    worker_name,
    payroll_year,
    payroll_month,
    operation_type,
    operation_date,
    amount,
    before_amount,
    after_amount,
    salary_status_after,
    reference,
    note,
    metadata,
    journal_entry_id,
    created_by,
    approved_by
  ) VALUES (
    v_operation_id,
    v_month.id,
    v_month.branch,
    v_month.worker_id,
    v_month.worker_name,
    v_month.payroll_year,
    v_month.payroll_month,
    'salary',
    v_operation_date,
    ABS(v_month.net_due),
    v_before,
    v_after,
    v_month.salary_status,
    v_reference,
    p_note,
    jsonb_build_object(
      'salary_type', v_month.salary_type,
      'fixed_salary_value', v_month.fixed_salary_value,
      'piece_count', v_month.piece_count,
      'piece_rate', v_month.piece_rate,
      'piece_total', v_month.piece_total,
      'overtime_hours', v_month.overtime_hours,
      'overtime_rate', v_month.overtime_rate,
      'overtime_total', v_month.overtime_total,
      'basic_salary', v_month.basic_salary,
      'works_total', v_month.works_total,
      'allowances_total', v_month.allowances_total,
      'deductions_total', v_month.deductions_total,
      'advances_total', v_month.advances_total,
      'net_due', v_month.net_due
    ),
    v_journal_id,
    v_actor,
    v_actor
  )
  RETURNING * INTO v_operation;

  RETURN jsonb_build_object(
    'month', to_jsonb(v_month),
    'operation', to_jsonb(v_operation)
  );
END;
$$;

ALTER TABLE worker_payroll_big_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_payroll_big_debts_select ON worker_payroll_big_debts;
CREATE POLICY worker_payroll_big_debts_select
  ON worker_payroll_big_debts FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS worker_payroll_big_debts_insert ON worker_payroll_big_debts;
CREATE POLICY worker_payroll_big_debts_insert
  ON worker_payroll_big_debts FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS worker_payroll_big_debts_update ON worker_payroll_big_debts;
CREATE POLICY worker_payroll_big_debts_update
  ON worker_payroll_big_debts FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON worker_payroll_big_debts TO authenticated;

GRANT EXECUTE ON FUNCTION upsert_worker_payroll_big_debt(VARCHAR, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION register_worker_payroll_big_debt_payment(VARCHAR, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_worker_payroll_month_snapshot(
  VARCHAR,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  DATE,
  TEXT,
  TEXT,
  VARCHAR,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC
) TO authenticated;

COMMIT;
