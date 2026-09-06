-- Disposable test dependencies: production function definitions with a no-op journal stub.
-- Never apply this fixture to the application database.
ALTER TABLE public.worker_payroll_months ADD COLUMN approved_at timestamptz, ADD COLUMN approved_by uuid;
ALTER TABLE public.worker_payroll_operations ADD COLUMN payroll_month_id uuid, ADD COLUMN worker_id text, ADD COLUMN worker_name text, ADD COLUMN payroll_year integer, ADD COLUMN payroll_month integer, ADD COLUMN operation_date date, ADD COLUMN amount numeric, ADD COLUMN before_amount numeric, ADD COLUMN after_amount numeric, ADD COLUMN salary_status_after text, ADD COLUMN reference text, ADD COLUMN note text, ADD COLUMN metadata jsonb DEFAULT '{}', ADD COLUMN journal_entry_id uuid, ADD COLUMN created_by uuid, ADD COLUMN approved_by uuid;
CREATE FUNCTION public.assert_worker_payroll_operation_period(integer,integer,date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.create_worker_payroll_journal_entry(uuid,varchar,numeric,date,integer,integer,text,varchar DEFAULT 'cash') RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date DEFAULT NULL::date, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_salary_type character varying DEFAULT 'fixed'::character varying, p_fixed_salary_value numeric DEFAULT NULL::numeric, p_piece_count numeric DEFAULT 0, p_piece_rate numeric DEFAULT 0, p_overtime_hours numeric DEFAULT 0, p_overtime_rate numeric DEFAULT 12.5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- الإصلاح: احترام المعدل المُمرَّر بدلاً من فرض 12.5 دائماً
  v_overtime_rate NUMERIC(14,2) := ROUND(COALESCE(NULLIF(p_overtime_rate, 0), 12.5), 2);
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
$function$;

CREATE OR REPLACE FUNCTION public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_salary_type VARCHAR(20) := CASE
    WHEN COALESCE(BTRIM(p_salary_type), '') = 'piecework' THEN 'piecework'
    ELSE 'fixed'
  END;
  v_fixed_value NUMERIC(14,2) := ROUND(COALESCE(p_fixed_salary_value, 0), 2);
  v_updated INTEGER := 0;
BEGIN
  IF v_salary_type = 'fixed' THEN
    -- الراتب الثابت: تحديث النوع والقيمة في الأشهر المستقبلية الموجودة وغير المقفلة
    UPDATE worker_payroll_months m
    SET salary_type = 'fixed',
        fixed_salary_value = v_fixed_value,
        basic_salary = v_fixed_value,
        piece_count = 0,
        piece_rate = 0,
        piece_total = 0,
        updated_by = v_actor
    WHERE m.branch = p_branch
      AND m.worker_id = p_worker_id
      AND m.is_locked = FALSE
      AND (m.payroll_year > p_from_year
           OR (m.payroll_year = p_from_year AND m.payroll_month > p_from_month))
      AND NOT is_worker_payroll_period_locked(p_branch, m.payroll_year, m.payroll_month);
  ELSE
    -- نظام القطعة: نقل النوع فقط، وتصفير أي راتب ثابت منسوخ خطأً
    -- لا نلمس piece_count/piece_total للأشهر التي سُجِّلت قطعةً بالفعل (بياناتها حقيقية)
    UPDATE worker_payroll_months m
    SET salary_type = 'piecework',
        basic_salary = 0,
        fixed_salary_value = 0,
        updated_by = v_actor
    WHERE m.branch = p_branch
      AND m.worker_id = p_worker_id
      AND m.is_locked = FALSE
      AND (m.payroll_year > p_from_year
           OR (m.payroll_year = p_from_year AND m.payroll_month > p_from_month))
      AND NOT is_worker_payroll_period_locked(p_branch, m.payroll_year, m.payroll_month);
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;
