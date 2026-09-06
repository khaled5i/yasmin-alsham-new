BEGIN;

-- One transaction for salary settings; financial balances always come from the locked row.
CREATE OR REPLACE FUNCTION public.save_tailoring_salary_settings(
  p_worker_id text, p_year integer, p_month integer, p_salary_type varchar,
  p_fixed_salary_value numeric, p_overtime_total numeric DEFAULT 0,
  p_apply_future boolean DEFAULT false, p_only_if_missing boolean DEFAULT false,
  p_operation_date date DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_current public.worker_payroll_months%ROWTYPE;
  v_previous public.worker_payroll_months%ROWTYPE;
  v_name text;
  v_result jsonb;
  v_future integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'Only administrators can change salary settings' USING ERRCODE='42501';
  END IF;
  IF p_year NOT BETWEEN 2000 AND 2100 OR p_month NOT BETWEEN 1 AND 12
     OR p_salary_type IS NULL OR p_salary_type NOT IN ('fixed','piecework')
     OR p_fixed_salary_value IS NULL OR p_fixed_salary_value < 0
     OR p_overtime_total IS NULL OR p_overtime_total < 0 THEN
    RAISE EXCEPTION 'Invalid salary settings' USING ERRCODE='22023';
  END IF;
  SELECT u.full_name INTO v_name FROM public.workers w JOIN public.users u ON u.id=w.user_id
  WHERE w.id::text=p_worker_id AND w.worker_type IN ('tailor','workshop_manager');
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found' USING ERRCODE='22023'; END IF;

  -- Serializes initial preparation in separate tabs as well as settings changes for this worker.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tailoring-salary:'||p_worker_id,0));
  SELECT * INTO v_current FROM public.worker_payroll_months
  WHERE branch='tailoring' AND worker_id=p_worker_id AND payroll_year=p_year AND payroll_month=p_month
  FOR UPDATE;
  IF p_only_if_missing THEN
    IF FOUND THEN RETURN jsonb_build_object('month',to_jsonb(v_current),'operation',NULL); END IF;
    IF make_date(p_year,p_month,1) <> date_trunc('month',now() AT TIME ZONE 'Asia/Riyadh')::date THEN
      RAISE EXCEPTION 'Automatic preparation is limited to the current month' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_previous FROM public.worker_payroll_months
    WHERE branch='tailoring' AND worker_id=p_worker_id AND (payroll_year,payroll_month)<(p_year,p_month)
    ORDER BY payroll_year DESC,payroll_month DESC LIMIT 1;
    IF NOT FOUND OR v_previous.salary_type <> 'fixed' OR v_previous.fixed_salary_value <= 0 THEN
      RAISE EXCEPTION 'No previous fixed salary to prepare' USING ERRCODE='22023';
    END IF;
    p_salary_type := 'fixed';
    p_fixed_salary_value := v_previous.fixed_salary_value;
    p_overtime_total := 0;
    p_apply_future := false;
  END IF;

  v_result := public.upsert_worker_payroll_month_snapshot(
    p_branch=>'tailoring'::varchar, p_worker_id=>p_worker_id, p_worker_name=>v_name,
    p_year=>p_year, p_month=>p_month,
    p_basic_salary=>CASE WHEN p_salary_type='fixed' THEN p_fixed_salary_value ELSE 0 END,
    p_works_total=>p_overtime_total,
    p_allowances_total=>COALESCE(v_current.allowances_total,0),
    p_deductions_total=>COALESCE(v_current.deductions_total,0),
    p_advances_total=>COALESCE(v_current.advances_total,0),
    p_operation_date=>p_operation_date, p_note=>p_note,
    p_salary_type=>p_salary_type, p_fixed_salary_value=>p_fixed_salary_value,
    p_piece_count=>0, p_piece_rate=>CASE WHEN p_salary_type='piecework' THEN 1 ELSE 0 END,
    p_overtime_hours=>p_overtime_total, p_overtime_rate=>1
  );
  IF p_apply_future THEN
    v_future := public.propagate_worker_salary_to_future_months(
      'tailoring'::varchar,p_worker_id,v_name,p_year,p_month,p_salary_type,p_fixed_salary_value,1
    );
    IF p_salary_type='fixed' THEN
      -- Switching from piecework must remove its old works subtotal, retaining this month's overtime.
      UPDATE public.worker_payroll_months SET works_total=overtime_total
      WHERE branch='tailoring' AND worker_id=p_worker_id
        AND (payroll_year,payroll_month)>(p_year,p_month);
    END IF;
    UPDATE public.worker_payroll_operations
    SET metadata=metadata||jsonb_build_object('future_months_updated',v_future)
    WHERE id=(v_result->'operation'->>'id')::uuid;
  END IF;
  RETURN v_result||jsonb_build_object('future_months_updated',v_future);
END;
$$;
REVOKE ALL ON FUNCTION public.save_tailoring_salary_settings(text,integer,integer,varchar,numeric,numeric,boolean,boolean,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_tailoring_salary_settings(text,integer,integer,varchar,numeric,numeric,boolean,boolean,date,text) TO authenticated;
COMMIT;
