-- Match the TEXT worker_id in persistent suspensions while keeping UUID comparisons on monthly suspensions.
CREATE OR REPLACE FUNCTION public.set_tailoring_payroll_suspension(
  p_worker_id uuid,p_year integer,p_month integer,p_suspended boolean,p_ongoing boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_name text;
  v_start date;
  v_selected date:=make_date(p_year,p_month,1);
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'Only administrators can change payroll suspension' USING ERRCODE='42501';
  END IF;
  IF p_year NOT BETWEEN 2000 AND 2100 OR p_suspended IS NULL THEN RAISE EXCEPTION 'Invalid period'; END IF;
  SELECT u.full_name INTO v_name FROM public.workers w JOIN public.users u ON u.id=w.user_id WHERE w.id=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payroll-suspension:'||p_worker_id::text,0));
  IF p_suspended THEN
    IF p_ongoing THEN
      INSERT INTO public.worker_payroll_persistent_suspensions(branch,worker_id,worker_name,start_year,start_month,suspended_by)
      VALUES('tailoring',p_worker_id::text,v_name,p_year,p_month,auth.uid())
      ON CONFLICT(branch,worker_id) DO UPDATE SET start_year=EXCLUDED.start_year,start_month=EXCLUDED.start_month,updated_at=now();
    ELSE
      INSERT INTO public.worker_payroll_suspensions(branch,worker_id,worker_name,payroll_year,payroll_month,suspended_by)
      VALUES('tailoring',p_worker_id,v_name,p_year,p_month,auth.uid()) ON CONFLICT(branch,worker_id,payroll_year,payroll_month) DO NOTHING;
    END IF;
  ELSE
    SELECT make_date(start_year,start_month,1) INTO v_start FROM public.worker_payroll_persistent_suspensions
      WHERE branch='tailoring' AND worker_id=p_worker_id::text FOR UPDATE;
    IF FOUND AND v_start<=v_selected THEN
      -- Preserve the vacation months before resuming. Never erase their suspension history.
      INSERT INTO public.worker_payroll_suspensions(branch,worker_id,worker_name,payroll_year,payroll_month,suspended_by,reason)
      SELECT 'tailoring',p_worker_id,v_name,extract(year FROM d)::int,extract(month FROM d)::int,auth.uid(),'تعليق محفوظ قبل العودة من الإجازة'
      FROM generate_series(v_start::timestamp,(v_selected-interval '1 month')::timestamp,interval '1 month') d
      ON CONFLICT(branch,worker_id,payroll_year,payroll_month) DO NOTHING;
      DELETE FROM public.worker_payroll_persistent_suspensions WHERE branch='tailoring' AND worker_id=p_worker_id::text;
    END IF;
    DELETE FROM public.worker_payroll_suspensions WHERE branch='tailoring' AND worker_id=p_worker_id AND payroll_year=p_year AND payroll_month=p_month;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_tailoring_payroll_suspension(uuid,integer,integer,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_tailoring_payroll_suspension(uuid,integer,integer,boolean,boolean) TO authenticated;
