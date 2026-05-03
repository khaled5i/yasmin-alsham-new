-- ============================================================================
-- Migration 48: فصل الخصومات عن حساب الراتب
-- الخصومات لم تعد تُخصم من net_due - تُتابع كدين مستقل عبر worker_payroll_big_debts
-- الراتب المتبقي = الراتب الأساسي + الإضافات - السلف - المدفوع فقط
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. تعديل trigger الحساب: حذف deductions_total من معادلة net_due
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_worker_payroll_month_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.net_due := ROUND(
    COALESCE(NEW.basic_salary, 0)
    + COALESCE(NEW.works_total, 0)
    + COALESCE(NEW.allowances_total, 0)
    -- deductions_total intentionally excluded: tracked separately as debt in worker_payroll_big_debts
    - COALESCE(NEW.advances_total, 0)
  , 2);

  NEW.remaining_due := ROUND(COALESCE(NEW.net_due, 0) - COALESCE(NEW.total_paid, 0), 2);
  NEW.salary_status := worker_payroll_status(NEW.net_due, NEW.total_paid);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. إضافة جدول سجل دفعات ديون الخصومات
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_payroll_deduction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  note TEXT,
  before_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  after_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_worker_payroll_deduction_payments_scope
  ON worker_payroll_deduction_payments(branch, worker_id, payment_date DESC);

ALTER TABLE worker_payroll_deduction_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_payroll_deduction_payments_select ON worker_payroll_deduction_payments;
CREATE POLICY worker_payroll_deduction_payments_select
  ON worker_payroll_deduction_payments FOR SELECT TO authenticated USING (TRUE);

-- ============================================================================
-- 3. تعديل register_worker_payroll_adjustment:
--    عند تسجيل خصم → يُضاف أيضاً إلى worker_payroll_big_debts
-- ============================================================================

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
    -- الخصم: يُسجَّل في deductions_total للتاريخ، ويُضاف للدين المستقل
    UPDATE worker_payroll_months
    SET deductions_total = ROUND(deductions_total + p_amount, 2),
        updated_by = v_actor
    WHERE id = v_month.id
    RETURNING * INTO v_month;

    -- إضافة الخصم إلى رصيد الدين المستقل
    INSERT INTO worker_payroll_big_debts (
      branch, worker_id, worker_name, original_amount, remaining_amount, created_by, updated_by
    ) VALUES (
      p_branch, p_worker_id, p_worker_name,
      ROUND(p_amount, 2), ROUND(p_amount, 2),
      v_actor, v_actor
    )
    ON CONFLICT (branch, worker_id) DO UPDATE SET
      original_amount = worker_payroll_big_debts.original_amount + ROUND(p_amount, 2),
      remaining_amount = worker_payroll_big_debts.remaining_amount + ROUND(p_amount, 2),
      updated_by = v_actor;
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
    id, payroll_month_id, branch, worker_id, worker_name,
    payroll_year, payroll_month, operation_type, operation_date,
    amount, before_amount, after_amount, salary_status_after,
    reference, note, metadata, journal_entry_id, created_by, approved_by
  ) VALUES (
    v_operation_id, v_month.id, v_month.branch, v_month.worker_id, v_month.worker_name,
    v_month.payroll_year, v_month.payroll_month, p_operation_type, p_operation_date,
    ROUND(p_amount, 2), v_before, v_after, v_month.salary_status,
    v_reference, p_note,
    jsonb_build_object('payment_account', p_payment_account),
    v_journal_id, v_actor, v_actor
  )
  RETURNING * INTO v_operation;

  RETURN jsonb_build_object(
    'month', to_jsonb(v_month),
    'operation', to_jsonb(v_operation)
  );
END;
$$;

-- ============================================================================
-- 4. دالة تسديد دفعة من دين الخصومات
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_worker_deduction_debt(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_debt worker_payroll_big_debts%ROWTYPE;
  v_before NUMERIC(14,2);
  v_after NUMERIC(14,2);
  v_payment_id UUID := gen_random_uuid();
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_debt
  FROM worker_payroll_big_debts
  WHERE branch = p_branch AND worker_id = p_worker_id;

  IF NOT FOUND OR v_debt.remaining_amount <= 0.009 THEN
    RAISE EXCEPTION 'لا يوجد دين نشط لهذا العامل'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount > v_debt.remaining_amount + 0.009 THEN
    RAISE EXCEPTION 'مبلغ السداد أكبر من الدين المتبقي'
      USING ERRCODE = '22023';
  END IF;

  v_before := v_debt.remaining_amount;
  v_after := ROUND(GREATEST(v_debt.remaining_amount - p_amount, 0), 2);

  UPDATE worker_payroll_big_debts
  SET remaining_amount = v_after,
      updated_by = v_actor
  WHERE branch = p_branch AND worker_id = p_worker_id;

  INSERT INTO worker_payroll_deduction_payments (
    id, branch, worker_id, worker_name,
    amount, payment_date, note,
    before_amount, after_amount, created_by
  ) VALUES (
    v_payment_id, p_branch, p_worker_id, p_worker_name,
    ROUND(p_amount, 2), p_payment_date, p_note,
    v_before, v_after, v_actor
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'before_amount', v_before,
    'after_amount', v_after,
    'paid_amount', ROUND(p_amount, 2)
  );
END;
$$;

-- ============================================================================
-- 5. ترحيل البيانات الحالية: إضافة الخصومات الموجودة إلى worker_payroll_big_debts
--    فقط إذا لم يكن للعامل دين مسجل مسبقاً
-- ============================================================================

INSERT INTO worker_payroll_big_debts (
  branch, worker_id, worker_name, original_amount, remaining_amount
)
SELECT
  branch,
  worker_id,
  MAX(worker_name) AS worker_name,
  ROUND(SUM(deductions_total), 2) AS original_amount,
  ROUND(SUM(deductions_total), 2) AS remaining_amount
FROM worker_payroll_months
WHERE deductions_total > 0.009
GROUP BY branch, worker_id
ON CONFLICT (branch, worker_id) DO UPDATE SET
  original_amount = worker_payroll_big_debts.original_amount + EXCLUDED.original_amount,
  remaining_amount = worker_payroll_big_debts.remaining_amount + EXCLUDED.remaining_amount;

-- ============================================================================
-- 6. إعادة حساب net_due لجميع الأشهر التي تحتوي على خصومات
--    (trigger سيُعيد الحساب تلقائياً بدون خصم deductions_total)
-- ============================================================================

UPDATE worker_payroll_months
SET basic_salary = basic_salary
WHERE deductions_total > 0.009;

-- ============================================================================
-- 7. صلاحيات
-- ============================================================================

GRANT SELECT ON worker_payroll_deduction_payments TO authenticated;
GRANT EXECUTE ON FUNCTION pay_worker_deduction_debt(VARCHAR, TEXT, TEXT, NUMERIC, DATE, TEXT) TO authenticated;

COMMIT;
