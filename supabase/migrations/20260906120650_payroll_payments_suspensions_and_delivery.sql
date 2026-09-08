BEGIN;

ALTER TABLE public.worker_payroll_months ADD COLUMN salary_deductions_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (salary_deductions_total >= 0);
ALTER TABLE public.worker_payroll_operations DROP CONSTRAINT worker_payroll_operations_operation_type_check;
ALTER TABLE public.worker_payroll_operations ADD CONSTRAINT worker_payroll_operations_operation_type_check
  CHECK (operation_type IN ('salary','payment','advance','deduction','salary_deduction'));

-- Identical amounts on the same date can be separate legitimate payments.
-- Tailoring now uses a request reference for retry safety instead of amount/date uniqueness.
DROP INDEX public.uq_worker_payroll_payment_duplicate;
CREATE UNIQUE INDEX uq_worker_payroll_payment_duplicate ON public.worker_payroll_operations
  (branch,worker_id,payroll_year,payroll_month,operation_date,amount,COALESCE(metadata->>'debt_settlement','false'))
  WHERE operation_type='payment' AND branch<>'tailoring';

CREATE OR REPLACE FUNCTION public.record_tailoring_payroll_disbursement(
  p_worker_id text,p_year integer,p_month integer,p_operation_date date,p_request_id uuid,
  p_payment numeric,p_deduction numeric DEFAULT 0,p_note text DEFAULT NULL,p_deduction_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_month public.worker_payroll_months%ROWTYPE;
  v_existing public.worker_payroll_operations%ROWTYPE;
  v_operation public.worker_payroll_operations%ROWTYPE;
  v_before numeric;
  v_result jsonb;
  v_metadata jsonb := jsonb_build_object('request_payment',p_payment,'request_deduction',p_deduction,
    'request_note',p_note,'request_deduction_note',p_deduction_note);
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'Only administrators can record payroll changes' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_payment IS NULL OR p_deduction IS NULL OR p_payment<0 OR p_deduction<0
    OR p_payment+p_deduction<=0 OR p_payment::text='NaN' OR p_deduction::text='NaN'
    OR (p_deduction>0 AND NULLIF(btrim(p_deduction_note),'') IS NULL) THEN
    RAISE EXCEPTION 'Enter valid amounts and a reason for the deduction' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_worker_payroll_operation_period(p_year,p_month,p_operation_date);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payroll-request:'||p_request_id::text,0));
  SELECT * INTO v_existing FROM public.worker_payroll_operations
    WHERE reference IN ('PAY-'||p_request_id::text,'CUT-'||p_request_id::text) LIMIT 1;
  IF FOUND THEN
    IF v_existing.worker_id<>p_worker_id OR v_existing.payroll_year<>p_year OR v_existing.payroll_month<>p_month
      OR v_existing.operation_date<>p_operation_date OR NOT v_existing.metadata @> v_metadata THEN
      RAISE EXCEPTION 'This request was already saved with different details. Reload before recording a new entry.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_month FROM public.worker_payroll_months WHERE id=v_existing.payroll_month_id;
    RETURN jsonb_build_object('month',to_jsonb(v_month),'operation',to_jsonb(v_existing));
  END IF;
  SELECT * INTO v_month FROM public.worker_payroll_months WHERE branch='tailoring' AND worker_id=p_worker_id
    AND payroll_year=p_year AND payroll_month=p_month FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Set the salary for this month first' USING ERRCODE='22023'; END IF;
  IF p_payment+p_deduction>v_month.remaining_due+0.009 THEN
    RAISE EXCEPTION 'Payment and deduction exceed the remaining salary' USING ERRCODE='22023';
  END IF;
  IF p_deduction>0 THEN
    v_before:=v_month.remaining_due;
    UPDATE public.worker_payroll_months SET salary_deductions_total=salary_deductions_total+round(p_deduction,2),updated_by=auth.uid()
      WHERE id=v_month.id RETURNING * INTO v_month;
    INSERT INTO public.worker_payroll_operations(payroll_month_id,branch,worker_id,worker_name,payroll_year,payroll_month,
      operation_type,operation_date,amount,before_amount,after_amount,salary_status_after,reference,note,metadata,created_by,approved_by)
    VALUES(v_month.id,'tailoring',p_worker_id,v_month.worker_name,p_year,p_month,'salary_deduction',p_operation_date,
      round(p_deduction,2),v_before,v_month.remaining_due,v_month.salary_status,'CUT-'||p_request_id::text,p_deduction_note,v_metadata,auth.uid(),auth.uid())
    RETURNING * INTO v_operation;
    v_result:=jsonb_build_object('month',to_jsonb(v_month),'operation',to_jsonb(v_operation));
  END IF;
  IF p_payment>0 THEN
    v_result:=public.register_worker_payroll_payment('tailoring'::varchar,p_worker_id,v_month.worker_name,p_year,p_month,
      p_operation_date,round(p_payment,2),'PAY-'||p_request_id::text,p_note,'cash'::varchar);
    PERFORM set_config('app.bypass_trigger','true',true);
    UPDATE public.worker_payroll_operations SET metadata=metadata||v_metadata WHERE id=(v_result->'operation'->>'id')::uuid;
    PERFORM set_config('app.bypass_trigger','',true);
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_tailoring_payroll_disbursement(text,integer,integer,date,uuid,numeric,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_tailoring_payroll_disbursement(text,integer,integer,date,uuid,numeric,numeric,text,text) TO authenticated;

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
      VALUES('tailoring',p_worker_id,v_name,p_year,p_month,auth.uid())
      ON CONFLICT(branch,worker_id) DO UPDATE SET start_year=EXCLUDED.start_year,start_month=EXCLUDED.start_month,updated_at=now();
    ELSE
      INSERT INTO public.worker_payroll_suspensions(branch,worker_id,worker_name,payroll_year,payroll_month,suspended_by)
      VALUES('tailoring',p_worker_id,v_name,p_year,p_month,auth.uid()) ON CONFLICT(branch,worker_id,payroll_year,payroll_month) DO NOTHING;
    END IF;
  ELSE
    SELECT make_date(start_year,start_month,1) INTO v_start FROM public.worker_payroll_persistent_suspensions
      WHERE branch='tailoring' AND worker_id=p_worker_id FOR UPDATE;
    IF FOUND AND v_start<=v_selected THEN
      -- Preserve the vacation months before resuming. Never erase their suspension history.
      INSERT INTO public.worker_payroll_suspensions(branch,worker_id,worker_name,payroll_year,payroll_month,suspended_by,reason)
      SELECT 'tailoring',p_worker_id,v_name,extract(year FROM d)::int,extract(month FROM d)::int,auth.uid(),'تعليق محفوظ قبل العودة من الإجازة'
      FROM generate_series(v_start::timestamp,(v_selected-interval '1 month')::timestamp,interval '1 month') d
      ON CONFLICT(branch,worker_id,payroll_year,payroll_month) DO NOTHING;
      DELETE FROM public.worker_payroll_persistent_suspensions WHERE branch='tailoring' AND worker_id=p_worker_id;
    END IF;
    DELETE FROM public.worker_payroll_suspensions WHERE branch='tailoring' AND worker_id=p_worker_id AND payroll_year=p_year AND payroll_month=p_month;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_tailoring_payroll_suspension(uuid,integer,integer,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_tailoring_payroll_suspension(uuid,integer,integer,boolean,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.sync_worker_payroll_month_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.net_due := ROUND(
    COALESCE(NEW.basic_salary, 0)
    + COALESCE(NEW.works_total, 0)
    + COALESCE(NEW.allowances_total, 0)
    -- Deductions are tracked separately as debt in worker_payroll_big_debts.
    - COALESCE(NEW.advances_total, 0)
    - COALESCE(NEW.salary_deductions_total, 0),
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
$function$;

CREATE OR REPLACE FUNCTION private.worker_piecework_pricing_total(p_worker_id text, p_year integer, p_month integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT ROUND(
    COALESCE(
      SUM(
        CASE
          WHEN COALESCE(o.worker_price, 0) > 0
            THEN COALESCE(o.worker_price, 0) + COALESCE(o.worker_bonus, 0)
          ELSE 0
        END
      ),
      0
    ),
    2
  )
  FROM public.orders AS o
  WHERE o.worker_id::TEXT = p_worker_id
    AND COALESCE(o.worker_completed_at,o.admin_completed_at,o.delivery_date::timestamp AT TIME ZONE 'UTC') IS NOT NULL
    AND o.status IN ('completed', 'delivered')
    AND COALESCE(o.worker_completed_at,o.admin_completed_at,o.delivery_date::timestamp AT TIME ZONE 'UTC') >= MAKE_TIMESTAMPTZ(p_year, p_month, 1, 0, 0, 0, 'UTC')
    AND COALESCE(o.worker_completed_at,o.admin_completed_at,o.delivery_date::timestamp AT TIME ZONE 'UTC') < MAKE_TIMESTAMPTZ(
      CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
      CASE WHEN p_month = 12 THEN 1 ELSE p_month + 1 END,
      1,
      0,
      0,
      0,
      'UTC'
    );
$function$;

CREATE OR REPLACE FUNCTION private.sync_piecework_payroll_from_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_old timestamptz;
  v_new timestamptz;
BEGIN
  IF TG_OP='UPDATE' AND OLD.worker_id IS NOT DISTINCT FROM NEW.worker_id
    AND OLD.worker_completed_at IS NOT DISTINCT FROM NEW.worker_completed_at
    AND OLD.admin_completed_at IS NOT DISTINCT FROM NEW.admin_completed_at
    AND OLD.delivery_date IS NOT DISTINCT FROM NEW.delivery_date
    AND OLD.worker_price IS NOT DISTINCT FROM NEW.worker_price
    AND OLD.worker_bonus IS NOT DISTINCT FROM NEW.worker_bonus
    AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old:=COALESCE(OLD.worker_completed_at,OLD.admin_completed_at,OLD.delivery_date::timestamp AT TIME ZONE 'UTC');
    IF OLD.worker_id IS NOT NULL AND v_old IS NOT NULL THEN
      PERFORM private.refresh_worker_piecework_payroll_month(OLD.worker_id::text,v_old);
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new:=COALESCE(NEW.worker_completed_at,NEW.admin_completed_at,NEW.delivery_date::timestamp AT TIME ZONE 'UTC');
    IF NEW.worker_id IS NOT NULL AND v_new IS NOT NULL AND
      (TG_OP='INSERT' OR OLD.worker_id IS DISTINCT FROM NEW.worker_id OR v_old IS NULL
       OR date_trunc('month',v_old AT TIME ZONE 'UTC') IS DISTINCT FROM date_trunc('month',v_new AT TIME ZONE 'UTC')) THEN
      PERFORM private.refresh_worker_piecework_payroll_month(NEW.worker_id::text,v_new);
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_worker_payroll_operation(p_operation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_operation worker_payroll_operations%ROWTYPE;
  v_month worker_payroll_months%ROWTYPE;
  v_op worker_payroll_operations%ROWTYPE;
  v_running_remaining NUMERIC;
  v_is_settlement BOOLEAN;
  v_debt_payment_id UUID;
  v_debt_restore NUMERIC(14,2);
BEGIN
  -- Get the operation to delete
  SELECT * INTO v_operation
  FROM worker_payroll_operations
  WHERE id = p_operation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operation not found';
  END IF;

  IF v_operation.operation_type = 'salary_deduction' THEN
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND is_active) THEN
      RAISE EXCEPTION 'Only administrators can delete a salary deduction' USING ERRCODE='42501';
    END IF;
    PERFORM 1 FROM public.worker_payroll_months WHERE id=v_operation.payroll_month_id FOR UPDATE;
    SET LOCAL "app.bypass_trigger" = 'true';
    DELETE FROM public.worker_payroll_operations WHERE id=p_operation_id RETURNING * INTO v_operation;
    IF FOUND THEN
      UPDATE public.worker_payroll_months
      SET salary_deductions_total=GREATEST(0,salary_deductions_total-v_operation.amount),updated_by=v_actor
      WHERE id=v_operation.payroll_month_id;
    END IF;
    SET LOCAL "app.bypass_trigger" = '';
    RETURN;
  END IF;

  -- Check if the period is locked
  IF EXISTS (
    SELECT 1 FROM worker_payroll_period_locks
    WHERE branch = v_operation.branch
      AND payroll_year = v_operation.payroll_year
      AND payroll_month = v_operation.payroll_month
      AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete operation: payroll period is locked';
  END IF;

  -- Signal the immutability trigger to allow this controlled delete
  SET LOCAL "app.bypass_trigger" = 'true';

  -- --------------------------------------------------------------------
  -- عكس الآثار الجانبية على الدين المتراكم قبل الحذف
  -- --------------------------------------------------------------------
  v_is_settlement := v_operation.operation_type = 'payment'
    AND COALESCE(v_operation.metadata->>'debt_settlement', 'false') = 'true';

  IF v_is_settlement THEN
    -- حذف دفعة تسوية دين: يُعاد كامل مبلغ التسديد إلى الدين المتراكم
    -- ويُحذف سجل السداد المرتبط من worker_payroll_deduction_payments
    v_debt_restore := ROUND(COALESCE(
      NULLIF(v_operation.metadata->>'debt_payment_total', '')::NUMERIC,
      v_operation.amount
    ), 2);
    v_debt_payment_id := NULLIF(v_operation.metadata->>'debt_payment_id', '')::UUID;

    UPDATE worker_payroll_big_debts
    SET remaining_amount = ROUND(remaining_amount + v_debt_restore, 2),
        updated_by = v_actor
    WHERE branch = v_operation.branch
      AND worker_id = v_operation.worker_id;

    IF v_debt_payment_id IS NOT NULL THEN
      DELETE FROM worker_payroll_deduction_payments
      WHERE id = v_debt_payment_id;
    END IF;

  ELSIF v_operation.operation_type = 'deduction' THEN
    -- حذف عملية دين: يُنقص الدين المتراكم بنفس المبلغ (كان قد أُضيف عند التسجيل)
    UPDATE worker_payroll_big_debts
    SET remaining_amount = ROUND(GREATEST(remaining_amount - v_operation.amount, 0), 2),
        original_amount = ROUND(GREATEST(original_amount - v_operation.amount, 0), 2),
        updated_by = v_actor
    WHERE branch = v_operation.branch
      AND worker_id = v_operation.worker_id;
  END IF;

  -- Delete the operation
  DELETE FROM worker_payroll_operations
  WHERE id = p_operation_id;

  -- Get the month record
  SELECT * INTO v_month
  FROM worker_payroll_months
  WHERE branch = v_operation.branch
    AND worker_id = v_operation.worker_id
    AND payroll_year = v_operation.payroll_year
    AND payroll_month = v_operation.payroll_month;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Recalculate the month from scratch
  -- Update total_paid by summing all remaining payments
  UPDATE worker_payroll_months
  SET total_paid = COALESCE((
    SELECT SUM(amount)
    FROM worker_payroll_operations
    WHERE branch = v_month.branch
      AND worker_id = v_month.worker_id
      AND payroll_year = v_month.payroll_year
      AND payroll_month = v_month.payroll_month
      AND operation_type = 'payment'
  ), 0)
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Recalculate advances_total by summing all remaining advance operations
  UPDATE worker_payroll_months
  SET advances_total = COALESCE((
    SELECT SUM(amount)
    FROM worker_payroll_operations
    WHERE branch = v_month.branch
      AND worker_id = v_month.worker_id
      AND payroll_year = v_month.payroll_year
      AND payroll_month = v_month.payroll_month
      AND operation_type = 'advance'
  ), 0)
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Recalculate deductions_total by summing all remaining deduction operations
  -- (كانت مفقودة في migration 22 — للعرض التاريخي فقط، لا تؤثر على net_due منذ migration 48)
  UPDATE worker_payroll_months
  SET deductions_total = COALESCE((
    SELECT SUM(amount)
    FROM worker_payroll_operations
    WHERE branch = v_month.branch
      AND worker_id = v_month.worker_id
      AND payroll_year = v_month.payroll_year
      AND payroll_month = v_month.payroll_month
      AND operation_type = 'deduction'
  ), 0)
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Calculate remaining_due (net_due is auto-recalculated by trigger)
  UPDATE worker_payroll_months
  SET remaining_due = net_due - total_paid
  WHERE branch = v_month.branch
    AND worker_id = v_month.worker_id
    AND payroll_year = v_month.payroll_year
    AND payroll_month = v_month.payroll_month;

  -- Refresh the month record
  SELECT * INTO v_month
  FROM worker_payroll_months
  WHERE branch = v_operation.branch
    AND worker_id = v_operation.worker_id
    AND payroll_year = v_operation.payroll_year
    AND payroll_month = v_operation.payroll_month;

  -- Recalculate before_amount and after_amount for all remaining operations
  v_running_remaining := v_month.net_due;

  FOR v_op IN (
    SELECT * FROM worker_payroll_operations
    WHERE branch = v_operation.branch
      AND worker_id = v_operation.worker_id
      AND payroll_year = v_operation.payroll_year
      AND payroll_month = v_operation.payroll_month
      AND id != p_operation_id
    ORDER BY operation_date ASC, created_at ASC
  ) LOOP
    UPDATE worker_payroll_operations
    SET before_amount = v_running_remaining,
        after_amount = v_running_remaining - v_op.amount,
        salary_status_after = CASE
          WHEN (v_running_remaining - v_op.amount) < -0.009 THEN 'negative'
          WHEN (v_running_remaining - v_op.amount) > 0.009 THEN 'partial'
          WHEN v_month.net_due > 0.009 THEN 'paid'
          ELSE 'zero'
        END
    WHERE id = v_op.id;

    v_running_remaining := v_running_remaining - v_op.amount;
  END LOOP;

  -- Reset bypass signal
  SET LOCAL "app.bypass_trigger" = '';

END;
$function$;

-- Correct only worker/month combinations affected by the missing fallback.
-- Never change order dates, existing payment amounts, or recorded debt.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT worker_id::text AS worker_id,
    date_trunc('month',COALESCE(admin_completed_at,delivery_date::timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS completed_at
    FROM public.orders WHERE worker_id IS NOT NULL AND worker_completed_at IS NULL
      AND COALESCE(admin_completed_at,delivery_date::timestamp AT TIME ZONE 'UTC') IS NOT NULL
      AND status IN ('completed','delivered') AND worker_price>0
  LOOP
    -- Some legacy snapshots already include manual transfers or other preserved amounts.
    -- Backfill an established shortfall only; never lower a historical snapshot here.
    IF NOT EXISTS (
      SELECT 1 FROM public.worker_payroll_months m WHERE m.branch='tailoring' AND m.worker_id=r.worker_id
        AND m.payroll_year=extract(year FROM r.completed_at AT TIME ZONE 'UTC')::int
        AND m.payroll_month=extract(month FROM r.completed_at AT TIME ZONE 'UTC')::int
        AND m.piece_total>=private.worker_piecework_pricing_total(m.worker_id,m.payroll_year,m.payroll_month)
    ) THEN
      PERFORM private.refresh_worker_piecework_payroll_month(r.worker_id,r.completed_at);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
