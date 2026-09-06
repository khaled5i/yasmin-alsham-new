-- Payroll navigation has no period locking or new advances. Historical amounts remain intact.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_worker_payroll_period_locked(p_branch varchar, p_year integer, p_month integer)
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE WHEN p_branch = 'tailoring' THEN false ELSE COALESCE((
    SELECT l.is_locked FROM public.worker_payroll_period_locks l
    WHERE l.branch=p_branch AND l.payroll_year=p_year AND l.payroll_month=p_month LIMIT 1
  ),false) END;
$$;

CREATE OR REPLACE FUNCTION public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_lock worker_payroll_period_locks%ROWTYPE;
  v_locked_rows INTEGER := 0;
BEGIN
  IF p_branch = 'tailoring' THEN
    RAISE EXCEPTION 'قفل الشهور غير مستخدم في رواتب التفصيل' USING ERRCODE = '22023';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION private.enforce_piecework_payroll_pricing_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pricing_total NUMERIC(14,2);
BEGIN
  IF NEW.branch <> 'tailoring'
     OR NEW.salary_type <> 'piecework' THEN
    RETURN NEW;
  END IF;

  v_pricing_total := private.worker_piecework_pricing_total(
    NEW.worker_id,
    NEW.payroll_year,
    NEW.payroll_month
  );

  -- Piece prices vary per order, so the payroll snapshot stores the source total as total x 1.
  -- Keeping the rate at 1 also represents a genuine zero as 0 x 1 instead of an empty value.
  NEW.basic_salary := 0;
  NEW.fixed_salary_value := 0;
  NEW.piece_count := v_pricing_total;
  NEW.piece_rate := 1;
  NEW.piece_total := v_pricing_total;
  NEW.works_total := ROUND(v_pricing_total + COALESCE(NEW.overtime_total, 0), 2);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.refresh_worker_piecework_payroll_month(p_worker_id text, p_completed_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_year INTEGER;
  v_month INTEGER;
  v_salary_type VARCHAR(20);
  v_worker_name TEXT;
  v_pricing_total NUMERIC(14,2);
  v_actor UUID := auth.uid();
BEGIN
  IF p_worker_id IS NULL OR p_completed_at IS NULL THEN
    RETURN;
  END IF;

  v_year := EXTRACT(YEAR FROM p_completed_at AT TIME ZONE 'UTC')::INTEGER;
  v_month := EXTRACT(MONTH FROM p_completed_at AT TIME ZONE 'UTC')::INTEGER;


  SELECT m.salary_type, m.worker_name
  INTO v_salary_type, v_worker_name
  FROM public.worker_payroll_months AS m
  WHERE m.branch = 'tailoring'
    AND m.worker_id = p_worker_id
    AND (
      m.payroll_year < v_year
      OR (m.payroll_year = v_year AND m.payroll_month <= v_month)
    )
  ORDER BY m.payroll_year DESC, m.payroll_month DESC
  LIMIT 1;

  IF v_salary_type IS DISTINCT FROM 'piecework' THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.full_name), ''), v_worker_name, p_worker_id)
  INTO v_worker_name
  FROM public.workers AS w
  LEFT JOIN public.users AS u ON u.id = w.user_id
  WHERE w.id::TEXT = p_worker_id
  LIMIT 1;

  v_worker_name := COALESCE(NULLIF(BTRIM(v_worker_name), ''), p_worker_id);
  v_pricing_total := private.worker_piecework_pricing_total(
    p_worker_id,
    v_year,
    v_month
  );

  INSERT INTO public.worker_payroll_months (
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
    created_by,
    updated_by
  ) VALUES (
    'tailoring',
    p_worker_id,
    v_worker_name,
    v_year,
    v_month,
    0,
    v_pricing_total,
    'piecework',
    0,
    v_pricing_total,
    1,
    v_pricing_total,
    v_actor,
    v_actor
  )
  ON CONFLICT (branch, worker_id, payroll_year, payroll_month)
  DO UPDATE SET
    worker_name = EXCLUDED.worker_name,
    basic_salary = 0,
    fixed_salary_value = 0,
    piece_count = EXCLUDED.piece_count,
    piece_rate = 1,
    piece_total = EXCLUDED.piece_total,
    works_total = ROUND(EXCLUDED.piece_total + public.worker_payroll_months.overtime_total, 2),
    updated_by = v_actor
  WHERE public.worker_payroll_months.salary_type = 'piecework';
END;
$function$;


-- Keep all historical metadata; prohibit new locks through legacy clients as well.
UPDATE public.worker_payroll_period_locks SET is_locked=false WHERE branch='tailoring' AND is_locked;
UPDATE public.worker_payroll_months SET is_locked=false WHERE branch='tailoring' AND is_locked;
ALTER TABLE public.worker_payroll_period_locks ADD CONSTRAINT tailoring_payroll_period_always_open CHECK (branch <> 'tailoring' OR NOT is_locked);
ALTER TABLE public.worker_payroll_months ADD CONSTRAINT tailoring_payroll_month_always_open CHECK (branch <> 'tailoring' OR NOT is_locked);

CREATE OR REPLACE FUNCTION private.prevent_new_tailoring_payroll_advance()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.branch='tailoring' AND NEW.operation_type='advance' THEN
    RAISE EXCEPTION 'استخدم الديون والدفعات؛ إنشاء سلف جديدة غير متاح' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_new_tailoring_payroll_advance BEFORE INSERT ON public.worker_payroll_operations
FOR EACH ROW EXECUTE FUNCTION private.prevent_new_tailoring_payroll_advance();

CREATE TABLE public.worker_payroll_pricing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  payroll_year integer NOT NULL,
  payroll_month integer NOT NULL CHECK (payroll_month BETWEEN 1 AND 12),
  before_amount numeric(14,2) NOT NULL,
  after_amount numeric(14,2) NOT NULL,
  remaining_before numeric(14,2) NOT NULL,
  remaining_after numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX worker_payroll_pricing_events_worker_time ON public.worker_payroll_pricing_events(worker_id, created_at DESC, id);
ALTER TABLE public.worker_payroll_pricing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_payroll_pricing_events FROM anon, authenticated;
GRANT SELECT ON public.worker_payroll_pricing_events TO authenticated;
CREATE POLICY payroll_pricing_events_read ON public.worker_payroll_pricing_events FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid()) AND u.role='admin')
  OR EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id=(SELECT auth.uid())
    AND (w.id::text=worker_id OR w.worker_type IN ('accountant','general_manager','workshop_manager')))
);

CREATE OR REPLACE FUNCTION private.record_payroll_pricing_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.branch <> 'tailoring' OR NEW.salary_type <> 'piecework' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.piece_total IS NOT DISTINCT FROM OLD.piece_total THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND NEW.piece_total=0 THEN RETURN NEW; END IF;
  INSERT INTO public.worker_payroll_pricing_events(worker_id,payroll_year,payroll_month,before_amount,after_amount,remaining_before,remaining_after,created_by)
  VALUES(NEW.worker_id,NEW.payroll_year,NEW.payroll_month,
    CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.piece_total END,NEW.piece_total,
    CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.remaining_due END,NEW.remaining_due,auth.uid());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_payroll_pricing_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_new_tailoring_payroll_advance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_payroll_pricing_change AFTER INSERT OR UPDATE ON public.worker_payroll_months
FOR EACH ROW EXECUTE FUNCTION private.record_payroll_pricing_change();

-- Select one previous snapshot per worker in Postgres, rather than downloading all history.
CREATE OR REPLACE FUNCTION public.get_worker_payroll_previous_context(p_branch varchar, p_year integer, p_month integer)
RETURNS SETOF public.worker_payroll_months LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
  SELECT DISTINCT ON (m.worker_id) m.* FROM public.worker_payroll_months m
  WHERE m.branch=p_branch AND (m.payroll_year,m.payroll_month)<(p_year,p_month)
  ORDER BY m.worker_id,m.payroll_year DESC,m.payroll_month DESC;
$$;
REVOKE ALL ON FUNCTION public.get_worker_payroll_previous_context(varchar,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_payroll_previous_context(varchar,integer,integer) TO authenticated;

-- Shared entitlement definition for payroll, reports and accounting summaries.
CREATE OR REPLACE FUNCTION public.get_worker_payroll_report_months(p_branch varchar, p_start date, p_end date)
RETURNS SETOF public.worker_payroll_months LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
  SELECT m.* FROM public.worker_payroll_months m
  WHERE m.branch=p_branch
    AND (m.payroll_year,m.payroll_month)>=(EXTRACT(YEAR FROM p_start)::integer,EXTRACT(MONTH FROM p_start)::integer)
    AND (m.payroll_year,m.payroll_month)<=(EXTRACT(YEAR FROM p_end)::integer,EXTRACT(MONTH FROM p_end)::integer)
    AND NOT EXISTS (SELECT 1 FROM public.worker_payroll_suspensions s WHERE s.branch=m.branch AND s.worker_id::text=m.worker_id AND s.payroll_year=m.payroll_year AND s.payroll_month=m.payroll_month)
    AND NOT EXISTS (SELECT 1 FROM public.worker_payroll_persistent_suspensions s WHERE s.branch=m.branch AND s.worker_id::text=m.worker_id AND (s.start_year,s.start_month)<=(m.payroll_year,m.payroll_month))
  ORDER BY m.payroll_year,m.payroll_month,m.worker_id;
$$;
REVOKE ALL ON FUNCTION public.get_worker_payroll_report_months(varchar,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_payroll_report_months(varchar,date,date) TO authenticated;

COMMIT;
