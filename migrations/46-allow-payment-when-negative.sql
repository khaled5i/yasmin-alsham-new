-- Migration 46: السماح بتسجيل دفعة عندما يكون صافي المستحق بالسالب
-- يسمح بتسجيل دفعات حتى لو كان net_due سالباً (العامل متأخر أو سلفه تجاوز راتبه)
-- الرصيد السالب يتراكم ويظهر تلقائياً كـ"خصومات متراكمة" في الشهر التالي

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

  -- تم إزالة قيد net_due < 0 : الآن يمكن تسجيل دفعة حتى لو كان صافي المستحق سالباً
  -- الدفعة الزائدة تُرحَّل كدين على العامل في الشهور القادمة وتظهر كـ"خصومات متراكمة"

  -- عندما يكون net_due موجباً: لا يُسمح بالدفع أكثر من المتبقي
  -- عندما يكون net_due سالباً: أي مبلغ موجب مسموح (الدين يتراكم)
  IF v_month.net_due >= 0 AND p_amount > v_before + 0.009 THEN
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
