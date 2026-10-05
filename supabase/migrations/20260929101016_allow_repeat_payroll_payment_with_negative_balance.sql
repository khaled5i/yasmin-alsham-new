-- Cash payments remain allowed when remaining_due is negative; validate available salary only for an actual deduction.
CREATE OR REPLACE FUNCTION public.record_tailoring_payroll_disbursement(
  p_worker_id text,p_year integer,p_month integer,p_operation_date date,p_request_id uuid,
  p_payment numeric,p_deduction numeric DEFAULT 0,p_note text DEFAULT NULL,p_deduction_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_month public.worker_payroll_months%ROWTYPE;
  v_existing public.worker_payroll_operations%ROWTYPE;
  v_operation public.worker_payroll_operations%ROWTYPE;
  v_before numeric;
  v_name text;
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

  SELECT u.full_name INTO v_name FROM public.workers w JOIN public.users u ON u.id=w.user_id
    WHERE w.id::text=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found' USING ERRCODE='22023'; END IF;

  -- قد لا يوجد صف بعد (عامل قطعة بلا أعمال مسعّرة): يُنشأ على نمط الشهر السابق
  v_month := private.ensure_tailoring_payroll_month(p_worker_id, v_name, p_year, p_month);

  -- الخصم يخفض المستحق فلا يتجاوزه؛ الدفعة النقدية لا حد لها
  IF p_deduction>0 AND p_deduction>v_month.remaining_due+0.009 THEN
    RAISE EXCEPTION 'The deduction exceeds the remaining salary' USING ERRCODE='22023';
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
    v_result:=private.insert_tailoring_payroll_cash_payment(
      v_month.id, p_operation_date, p_payment, 'PAY-'||p_request_id::text, p_note, v_metadata
    );
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_tailoring_payroll_disbursement(text,integer,integer,date,uuid,numeric,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_tailoring_payroll_disbursement(text,integer,integer,date,uuid,numeric,numeric,text,text) TO authenticated;
