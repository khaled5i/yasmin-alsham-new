-- ============================================================================
-- Worker Payroll Ledger (tailoring/fabrics/ready_designs)
-- ============================================================================

BEGIN;

-- ============================================================================
-- Core tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_payroll_period_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  payroll_year INTEGER NOT NULL CHECK (payroll_year BETWEEN 2000 AND 2100),
  payroll_month INTEGER NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  lock_reason TEXT,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch, payroll_year, payroll_month)
);

CREATE TABLE IF NOT EXISTS worker_payroll_months (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  payroll_year INTEGER NOT NULL CHECK (payroll_year BETWEEN 2000 AND 2100),
  payroll_month INTEGER NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  period_key TEXT GENERATED ALWAYS AS (payroll_year::TEXT || '-' || LPAD(payroll_month::TEXT, 2, '0')) STORED,
  basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  works_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (works_total >= 0),
  allowances_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allowances_total >= 0),
  deductions_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (deductions_total >= 0),
  advances_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (advances_total >= 0),
  net_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  remaining_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  salary_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
    CHECK (salary_status IN ('unpaid', 'partial', 'paid', 'negative', 'zero')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (branch, worker_id, payroll_year, payroll_month)
);

CREATE TABLE IF NOT EXISTS worker_payroll_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month_id UUID NOT NULL REFERENCES worker_payroll_months(id) ON DELETE CASCADE,
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  payroll_year INTEGER NOT NULL CHECK (payroll_year BETWEEN 2000 AND 2100),
  payroll_month INTEGER NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  operation_type VARCHAR(20) NOT NULL
    CHECK (operation_type IN ('salary', 'payment', 'advance', 'deduction')),
  operation_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  before_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  after_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  salary_status_after VARCHAR(20) NOT NULL
    CHECK (salary_status_after IN ('unpaid', 'partial', 'paid', 'negative', 'zero')),
  reference VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES auth.users(id),
  journal_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT worker_payroll_operations_reference_unique UNIQUE (reference),
  CONSTRAINT worker_payroll_operations_month_scope_fk
    FOREIGN KEY (branch, worker_id, payroll_year, payroll_month)
    REFERENCES worker_payroll_months(branch, worker_id, payroll_year, payroll_month)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS worker_payroll_adjustment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  payroll_year INTEGER NOT NULL CHECK (payroll_year BETWEEN 2000 AND 2100),
  payroll_month INTEGER NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  reason TEXT NOT NULL,
  request_note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_payroll_months_scope
  ON worker_payroll_months(branch, payroll_year, payroll_month);
CREATE INDEX IF NOT EXISTS idx_worker_payroll_months_worker
  ON worker_payroll_months(worker_id, payroll_year, payroll_month);
CREATE INDEX IF NOT EXISTS idx_worker_payroll_months_status
  ON worker_payroll_months(salary_status);

CREATE INDEX IF NOT EXISTS idx_worker_payroll_operations_scope
  ON worker_payroll_operations(branch, payroll_year, payroll_month, operation_date DESC);
CREATE INDEX IF NOT EXISTS idx_worker_payroll_operations_worker
  ON worker_payroll_operations(worker_id, payroll_year, payroll_month, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_payroll_operations_type
  ON worker_payroll_operations(operation_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_payroll_payment_duplicate
  ON worker_payroll_operations(branch, worker_id, payroll_year, payroll_month, operation_date, amount)
  WHERE operation_type = 'payment';
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_payroll_deduction_duplicate
  ON worker_payroll_operations(branch, worker_id, payroll_year, payroll_month, operation_date, amount)
  WHERE operation_type = 'deduction';

CREATE INDEX IF NOT EXISTS idx_worker_payroll_period_locks_scope
  ON worker_payroll_period_locks(branch, payroll_year, payroll_month);
CREATE INDEX IF NOT EXISTS idx_worker_payroll_adjustment_requests_scope
  ON worker_payroll_adjustment_requests(branch, payroll_year, payroll_month, status);

-- ============================================================================
-- Helpers and triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION worker_payroll_status(p_net_due NUMERIC, p_total_paid NUMERIC)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_net_due < 0 THEN
    RETURN 'negative';
  END IF;

  IF ABS(p_net_due) <= 0.009 THEN
    RETURN 'zero';
  END IF;

  IF p_total_paid <= 0.009 THEN
    RETURN 'unpaid';
  END IF;

  IF p_total_paid + 0.009 >= p_net_due THEN
    RETURN 'paid';
  END IF;

  RETURN 'partial';
END;
$$;

CREATE OR REPLACE FUNCTION sync_worker_payroll_month_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.net_due := ROUND(
    COALESCE(NEW.basic_salary, 0)
    + COALESCE(NEW.works_total, 0)
    + COALESCE(NEW.allowances_total, 0)
    - COALESCE(NEW.deductions_total, 0)
    - COALESCE(NEW.advances_total, 0)
  , 2);

  NEW.remaining_due := ROUND(COALESCE(NEW.net_due, 0) - COALESCE(NEW.total_paid, 0), 2);
  NEW.salary_status := worker_payroll_status(NEW.net_due, NEW.total_paid);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_worker_payroll_month_totals ON worker_payroll_months;
CREATE TRIGGER trg_sync_worker_payroll_month_totals
BEFORE INSERT OR UPDATE ON worker_payroll_months
FOR EACH ROW
EXECUTE FUNCTION sync_worker_payroll_month_totals();

CREATE OR REPLACE FUNCTION set_worker_payroll_period_locks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_payroll_period_locks_updated_at ON worker_payroll_period_locks;
CREATE TRIGGER trg_worker_payroll_period_locks_updated_at
BEFORE UPDATE ON worker_payroll_period_locks
FOR EACH ROW
EXECUTE FUNCTION set_worker_payroll_period_locks_updated_at();

CREATE OR REPLACE FUNCTION set_worker_payroll_adjustment_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_payroll_adjustment_requests_updated_at ON worker_payroll_adjustment_requests;
CREATE TRIGGER trg_worker_payroll_adjustment_requests_updated_at
BEFORE UPDATE ON worker_payroll_adjustment_requests
FOR EACH ROW
EXECUTE FUNCTION set_worker_payroll_adjustment_requests_updated_at();

CREATE OR REPLACE FUNCTION prevent_mutation_of_approved_payroll_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_prevent_mutation_of_approved_payroll_operations ON worker_payroll_operations;
CREATE TRIGGER trg_prevent_mutation_of_approved_payroll_operations
BEFORE UPDATE OR DELETE ON worker_payroll_operations
FOR EACH ROW
EXECUTE FUNCTION prevent_mutation_of_approved_payroll_operations();

CREATE OR REPLACE FUNCTION is_worker_payroll_period_locked(
  p_branch VARCHAR,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT is_locked
      FROM worker_payroll_period_locks
      WHERE branch = p_branch
        AND payroll_year = p_year
        AND payroll_month = p_month
      LIMIT 1
    ),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION assert_worker_payroll_operation_period(
  p_year INTEGER,
  p_month INTEGER,
  p_operation_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll period'
      USING ERRCODE = '22023';
  END IF;

  IF DATE_TRUNC('month', p_operation_date)::DATE <> MAKE_DATE(p_year, p_month, 1) THEN
    RAISE EXCEPTION 'Operation date must belong to payroll month %-%', p_year, LPAD(p_month::TEXT, 2, '0')
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ============================================================================
-- Journal helpers
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS worker_payroll_journal_seq START 1;

DO $$
BEGIN
  IF TO_REGCLASS('public.accounts') IS NOT NULL THEN
    INSERT INTO accounts (
      account_code,
      account_name,
      account_name_en,
      account_type,
      level,
      is_system,
      normal_balance,
      description
    ) VALUES
      ('1140', 'سلف العمال', 'Worker Advances', 'asset', 3, FALSE, 'debit', 'Worker advances receivable'),
      ('2140', 'مستحقات العمال', 'Workers Payable', 'liability', 3, FALSE, 'credit', 'Worker payroll payable')
    ON CONFLICT (account_code) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_account_id_by_code(p_code VARCHAR)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF TO_REGCLASS('public.accounts') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_account_id
  FROM accounts
  WHERE account_code = p_code
  LIMIT 1;

  RETURN v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_worker_payroll_journal_entry(
  p_operation_id UUID,
  p_operation_type VARCHAR,
  p_amount NUMERIC,
  p_operation_date DATE,
  p_year INTEGER,
  p_month INTEGER,
  p_description TEXT,
  p_payment_account VARCHAR DEFAULT 'cash'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_journal_id UUID;
  v_entry_number TEXT;
  v_debit_code VARCHAR(10);
  v_credit_code VARCHAR(10);
  v_debit_account_id UUID;
  v_credit_account_id UUID;
  v_reference_type VARCHAR(30);
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  IF TO_REGCLASS('public.journal_entries') IS NULL
     OR TO_REGCLASS('public.journal_entry_lines') IS NULL
     OR TO_REGCLASS('public.accounts') IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_operation_type = 'salary' THEN
    v_debit_code := '6100';
    v_credit_code := '2140';
    v_reference_type := 'adjustment';
  ELSIF p_operation_type = 'payment' THEN
    v_debit_code := '2140';
    v_credit_code := CASE WHEN p_payment_account = 'bank' THEN '1112' ELSE '1111' END;
    v_reference_type := 'payment_voucher';
  ELSIF p_operation_type = 'advance' THEN
    v_debit_code := '1140';
    v_credit_code := CASE WHEN p_payment_account = 'bank' THEN '1112' ELSE '1111' END;
    v_reference_type := 'payment_voucher';
  ELSIF p_operation_type = 'deduction' THEN
    v_debit_code := '2140';
    v_credit_code := '1140';
    v_reference_type := 'adjustment';
  ELSE
    RETURN NULL;
  END IF;

  v_debit_account_id := get_account_id_by_code(v_debit_code);
  v_credit_account_id := get_account_id_by_code(v_credit_code);

  IF v_debit_account_id IS NULL OR v_credit_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_entry_number := 'PR-' || p_year::TEXT || LPAD(p_month::TEXT, 2, '0') || '-' ||
    LPAD(NEXTVAL('worker_payroll_journal_seq')::TEXT, 6, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    reference_type,
    reference_id,
    description,
    total_debit,
    total_credit,
    status,
    fiscal_year,
    fiscal_period,
    created_by,
    posted_by,
    posted_at
  ) VALUES (
    v_entry_number,
    p_operation_date,
    v_reference_type,
    p_operation_id,
    p_description,
    ROUND(p_amount, 2),
    ROUND(p_amount, 2),
    'posted',
    p_year,
    p_month,
    v_actor,
    v_actor,
    NOW()
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES
  (
    v_journal_id,
    v_debit_account_id,
    ROUND(p_amount, 2),
    0,
    p_description
  ),
  (
    v_journal_id,
    v_credit_account_id,
    0,
    ROUND(p_amount, 2),
    p_description
  );

  RETURN v_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_worker_payroll_month(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS worker_payroll_months
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_month worker_payroll_months%ROWTYPE;
BEGIN
  IF is_worker_payroll_period_locked(p_branch, p_year, p_month) THEN
    RAISE EXCEPTION 'Payroll month is locked'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO worker_payroll_months (
    branch,
    worker_id,
    worker_name,
    payroll_year,
    payroll_month,
    created_by,
    updated_by
  ) VALUES (
    p_branch,
    p_worker_id,
    p_worker_name,
    p_year,
    p_month,
    v_actor,
    v_actor
  )
  ON CONFLICT (branch, worker_id, payroll_year, payroll_month)
  DO UPDATE SET
    worker_name = EXCLUDED.worker_name,
    updated_by = v_actor
  RETURNING * INTO v_month;

  RETURN v_month;
END;
$$;

-- ============================================================================
-- RPC: Upsert salary month snapshot
-- Formula:
-- basic_salary + works_total + allowances_total - deductions_total - advances_total = net_due
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
  p_note TEXT DEFAULT NULL
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
BEGIN
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll period'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_basic_salary, 0) < 0
     OR COALESCE(p_works_total, 0) < 0
     OR COALESCE(p_allowances_total, 0) < 0
     OR COALESCE(p_deductions_total, 0) < 0
     OR COALESCE(p_advances_total, 0) < 0 THEN
    RAISE EXCEPTION 'Salary components cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  IF is_worker_payroll_period_locked(p_branch, p_year, p_month) THEN
    RAISE EXCEPTION 'Payroll month is locked'
      USING ERRCODE = '42501';
  END IF;

  PERFORM assert_worker_payroll_operation_period(p_year, p_month, v_operation_date);

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
    ROUND(COALESCE(p_basic_salary, 0), 2),
    ROUND(COALESCE(p_works_total, 0), 2),
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

CREATE OR REPLACE FUNCTION register_worker_payroll_payment(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER,
  p_operation_date DATE,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_payment_account VARCHAR DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_month worker_payroll_months%ROWTYPE;
  v_operation worker_payroll_operations%ROWTYPE;
  v_operation_id UUID := gen_random_uuid();
  v_reference TEXT;
  v_before NUMERIC(14,2);
  v_after NUMERIC(14,2);
  v_journal_id UUID;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  PERFORM assert_worker_payroll_operation_period(p_year, p_month, p_operation_date);

  IF is_worker_payroll_period_locked(p_branch, p_year, p_month) THEN
    RAISE EXCEPTION 'Payroll month is locked'
      USING ERRCODE = '42501';
  END IF;

  v_month := ensure_worker_payroll_month(p_branch, p_worker_id, p_worker_name, p_year, p_month);
  v_before := COALESCE(v_month.remaining_due, 0);

  IF v_month.net_due < 0 THEN
    RAISE EXCEPTION 'لا يمكن الدفع، صافي المستحق بالسالب'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount > v_before + 0.009 THEN
    RAISE EXCEPTION 'Payment amount cannot exceed remaining due'
      USING ERRCODE = '22023';
  END IF;

  UPDATE worker_payroll_months
  SET total_paid = ROUND(total_paid + p_amount, 2),
      updated_by = v_actor
  WHERE id = v_month.id
  RETURNING * INTO v_month;

  v_after := COALESCE(v_month.remaining_due, 0);
  v_reference := NULLIF(BTRIM(p_reference), '');
  IF v_reference IS NULL THEN
    v_reference := 'PAY-' || p_worker_id || '-' || p_year::TEXT || LPAD(p_month::TEXT, 2, '0') || '-' ||
      TO_CHAR(NOW(), 'HH24MISSMS');
  END IF;

  v_journal_id := create_worker_payroll_journal_entry(
    v_operation_id,
    'payment',
    p_amount,
    p_operation_date,
    p_year,
    p_month,
    'Payroll payment - ' || p_worker_name || ' - ' || p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0'),
    p_payment_account
  );

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
    'payment',
    p_operation_date,
    ROUND(p_amount, 2),
    v_before,
    v_after,
    v_month.salary_status,
    v_reference,
    p_note,
    jsonb_build_object('payment_account', p_payment_account),
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

CREATE OR REPLACE FUNCTION register_worker_payroll_adjustment(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER,
  p_operation_type VARCHAR,
  p_operation_date DATE,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_payment_account VARCHAR DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_month worker_payroll_months%ROWTYPE;
  v_operation worker_payroll_operations%ROWTYPE;
  v_operation_id UUID := gen_random_uuid();
  v_reference TEXT;
  v_before NUMERIC(14,2);
  v_after NUMERIC(14,2);
  v_journal_id UUID;
BEGIN
  IF p_operation_type NOT IN ('advance', 'deduction') THEN
    RAISE EXCEPTION 'Adjustment type must be advance or deduction'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  PERFORM assert_worker_payroll_operation_period(p_year, p_month, p_operation_date);

  IF is_worker_payroll_period_locked(p_branch, p_year, p_month) THEN
    RAISE EXCEPTION 'Payroll month is locked'
      USING ERRCODE = '42501';
  END IF;

  v_month := ensure_worker_payroll_month(p_branch, p_worker_id, p_worker_name, p_year, p_month);
  v_before := COALESCE(v_month.remaining_due, 0);

  IF p_operation_type = 'advance' THEN
    UPDATE worker_payroll_months
    SET advances_total = ROUND(advances_total + p_amount, 2),
        updated_by = v_actor
    WHERE id = v_month.id
    RETURNING * INTO v_month;
  ELSE
    UPDATE worker_payroll_months
    SET deductions_total = ROUND(deductions_total + p_amount, 2),
        updated_by = v_actor
    WHERE id = v_month.id
    RETURNING * INTO v_month;
  END IF;

  v_after := COALESCE(v_month.remaining_due, 0);
  v_reference := NULLIF(BTRIM(p_reference), '');
  IF v_reference IS NULL THEN
    v_reference := CASE WHEN p_operation_type = 'advance' THEN 'ADV-' ELSE 'DED-' END ||
      p_worker_id || '-' || p_year::TEXT || LPAD(p_month::TEXT, 2, '0') || '-' ||
      TO_CHAR(NOW(), 'HH24MISSMS');
  END IF;

  v_journal_id := create_worker_payroll_journal_entry(
    v_operation_id,
    p_operation_type,
    p_amount,
    p_operation_date,
    p_year,
    p_month,
    CASE
      WHEN p_operation_type = 'advance'
        THEN 'Worker advance - ' || p_worker_name || ' - ' || p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0')
      ELSE 'Advance deduction - ' || p_worker_name || ' - ' || p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0')
    END,
    p_payment_account
  );

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
    p_operation_type,
    p_operation_date,
    ROUND(p_amount, 2),
    v_before,
    v_after,
    v_month.salary_status,
    v_reference,
    p_note,
    jsonb_build_object('payment_account', p_payment_account),
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

CREATE OR REPLACE FUNCTION lock_worker_payroll_period(
  p_branch VARCHAR,
  p_year INTEGER,
  p_month INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_lock worker_payroll_period_locks%ROWTYPE;
  v_locked_rows INTEGER := 0;
BEGIN
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll period'
      USING ERRCODE = '22023';
  END IF;

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
    TRUE,
    p_reason,
    NOW(),
    v_actor
  )
  ON CONFLICT (branch, payroll_year, payroll_month)
  DO UPDATE SET
    is_locked = TRUE,
    lock_reason = EXCLUDED.lock_reason,
    locked_at = NOW(),
    locked_by = v_actor
  RETURNING * INTO v_lock;

  UPDATE worker_payroll_months
  SET is_locked = TRUE,
      locked_at = NOW(),
      locked_by = v_actor,
      updated_by = v_actor
  WHERE branch = p_branch
    AND payroll_year = p_year
    AND payroll_month = p_month
    AND is_locked = FALSE;

  GET DIAGNOSTICS v_locked_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'lock', to_jsonb(v_lock),
    'locked_rows', v_locked_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_worker_payroll_adjustment_request(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER,
  p_reason TEXT,
  p_request_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request worker_payroll_adjustment_requests%ROWTYPE;
BEGIN
  IF COALESCE(BTRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Reason is required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO worker_payroll_adjustment_requests (
    branch,
    worker_id,
    worker_name,
    payroll_year,
    payroll_month,
    reason,
    request_note,
    requested_by
  ) VALUES (
    p_branch,
    p_worker_id,
    p_worker_name,
    p_year,
    p_month,
    p_reason,
    p_request_note,
    v_actor
  )
  RETURNING * INTO v_request;

  RETURN to_jsonb(v_request);
END;
$$;

ALTER TABLE worker_payroll_period_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_payroll_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_payroll_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_payroll_adjustment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_payroll_period_locks_select ON worker_payroll_period_locks;
CREATE POLICY worker_payroll_period_locks_select
  ON worker_payroll_period_locks FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS worker_payroll_months_select ON worker_payroll_months;
CREATE POLICY worker_payroll_months_select
  ON worker_payroll_months FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS worker_payroll_operations_select ON worker_payroll_operations;
CREATE POLICY worker_payroll_operations_select
  ON worker_payroll_operations FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS worker_payroll_adjustment_requests_select ON worker_payroll_adjustment_requests;
CREATE POLICY worker_payroll_adjustment_requests_select
  ON worker_payroll_adjustment_requests FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS worker_payroll_adjustment_requests_insert ON worker_payroll_adjustment_requests;
CREATE POLICY worker_payroll_adjustment_requests_insert
  ON worker_payroll_adjustment_requests FOR INSERT TO authenticated WITH CHECK (TRUE);

GRANT SELECT ON worker_payroll_period_locks TO authenticated;
GRANT SELECT ON worker_payroll_months TO authenticated;
GRANT SELECT ON worker_payroll_operations TO authenticated;
GRANT SELECT, INSERT ON worker_payroll_adjustment_requests TO authenticated;

GRANT EXECUTE ON FUNCTION is_worker_payroll_period_locked(VARCHAR, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_worker_payroll_month_snapshot(VARCHAR, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION register_worker_payroll_payment(VARCHAR, TEXT, TEXT, INTEGER, INTEGER, DATE, NUMERIC, TEXT, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION register_worker_payroll_adjustment(VARCHAR, TEXT, TEXT, INTEGER, INTEGER, VARCHAR, DATE, NUMERIC, TEXT, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION lock_worker_payroll_period(VARCHAR, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_worker_payroll_adjustment_request(VARCHAR, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

COMMIT;
