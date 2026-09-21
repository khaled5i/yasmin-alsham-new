-- ============================================================================
-- دفعة راتب حتى لو كان المستحق صفرًا (صفحة الرواتب «تسجيل دفعة» + سلفة الصندوق)
-- ============================================================================
-- عامل القطعة يكون مستحقه صفرًا أول الشهر إلى أن تُسعَّر قطعه، فكانت الدفعة
-- تُرفض («Set the salary for this month first» أو «exceed the remaining salary»).
-- الآن:
--   • الدفعة النقدية لا حد أعلى لها؛ المتبقي قد يصبح سالبًا ثم يرتفع مع التسعير.
--   • الخصم من الراتب ما زال لا يتجاوز المتبقي (لا معنى لخصم مستحق غير موجود).
--   • إن لم يوجد صف للشهر يُنشأ بنفس نوع راتب آخر شهر مسجل:
--       قطعة ← salary_type='piecework' حتى يستمر تحديثه تلقائيًا من التسعير
--       (صف 'fixed' افتراضي كان سيوقف مزامنة القطع لهذا الشهر وما بعده).
--       ثابت ← نفس الراتب الثابت السابق.
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy)، بعد 20260921140000.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) إنشاء صف الشهر إن لم يوجد، على نمط آخر شهر مسجل
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.ensure_tailoring_payroll_month(
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS public.worker_payroll_months
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month public.worker_payroll_months%ROWTYPE;
  v_previous public.worker_payroll_months%ROWTYPE;
  v_piece NUMERIC(14, 2);
BEGIN
  SELECT * INTO v_month
  FROM public.worker_payroll_months
  WHERE branch = 'tailoring' AND worker_id = p_worker_id
    AND payroll_year = p_year AND payroll_month = p_month
  FOR UPDATE;
  IF FOUND THEN
    RETURN v_month;
  END IF;

  SELECT * INTO v_previous
  FROM public.worker_payroll_months
  WHERE branch = 'tailoring' AND worker_id = p_worker_id
    AND (payroll_year, payroll_month) < (p_year, p_month)
  ORDER BY payroll_year DESC, payroll_month DESC
  LIMIT 1;

  IF FOUND AND v_previous.salary_type = 'piecework' THEN
    v_piece := private.worker_piecework_pricing_total(p_worker_id, p_year, p_month);
    INSERT INTO public.worker_payroll_months (
      branch, worker_id, worker_name, payroll_year, payroll_month,
      basic_salary, works_total, salary_type, fixed_salary_value,
      piece_count, piece_rate, piece_total, created_by, updated_by
    ) VALUES (
      'tailoring', p_worker_id, p_worker_name, p_year, p_month,
      0, v_piece, 'piecework', 0,
      v_piece, 1, v_piece, auth.uid(), auth.uid()
    )
    ON CONFLICT (branch, worker_id, payroll_year, payroll_month) DO NOTHING;
  ELSIF FOUND AND v_previous.salary_type = 'fixed' AND v_previous.fixed_salary_value > 0 THEN
    INSERT INTO public.worker_payroll_months (
      branch, worker_id, worker_name, payroll_year, payroll_month,
      basic_salary, salary_type, fixed_salary_value, created_by, updated_by
    ) VALUES (
      'tailoring', p_worker_id, p_worker_name, p_year, p_month,
      v_previous.fixed_salary_value, 'fixed', v_previous.fixed_salary_value,
      auth.uid(), auth.uid()
    )
    ON CONFLICT (branch, worker_id, payroll_year, payroll_month) DO NOTHING;
  ELSE
    -- لا يوجد سجل سابق: صف فارغ يُحدَّد نوعه لاحقًا من «إعداد الراتب»
    INSERT INTO public.worker_payroll_months (
      branch, worker_id, worker_name, payroll_year, payroll_month, created_by, updated_by
    ) VALUES (
      'tailoring', p_worker_id, p_worker_name, p_year, p_month, auth.uid(), auth.uid()
    )
    ON CONFLICT (branch, worker_id, payroll_year, payroll_month) DO NOTHING;
  END IF;

  SELECT * INTO v_month
  FROM public.worker_payroll_months
  WHERE branch = 'tailoring' AND worker_id = p_worker_id
    AND payroll_year = p_year AND payroll_month = p_month
  FOR UPDATE;

  RETURN v_month;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_tailoring_payroll_month(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2) دفعة نقدية بلا حد أعلى بالمتبقي (مشتركة بين الصرف والسلفة)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.insert_tailoring_payroll_cash_payment(
  p_month_id UUID,
  p_operation_date DATE,
  p_amount NUMERIC,
  p_reference TEXT,
  p_note TEXT,
  p_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month public.worker_payroll_months%ROWTYPE;
  v_operation public.worker_payroll_operations%ROWTYPE;
  v_operation_id UUID := gen_random_uuid();
  v_amount NUMERIC(14, 2) := ROUND(p_amount, 2);
  v_before NUMERIC(14, 2);
  v_journal_id UUID;
BEGIN
  SELECT * INTO v_month FROM public.worker_payroll_months WHERE id = p_month_id FOR UPDATE;
  v_before := COALESCE(v_month.remaining_due, 0);

  UPDATE public.worker_payroll_months
  SET total_paid = ROUND(total_paid + v_amount, 2),
      updated_by = auth.uid()
  WHERE id = v_month.id
  RETURNING * INTO v_month;

  v_journal_id := public.create_worker_payroll_journal_entry(
    v_operation_id,
    'payment',
    v_amount,
    p_operation_date,
    v_month.payroll_year,
    v_month.payroll_month,
    'Payroll payment - ' || v_month.worker_name || ' - '
      || v_month.payroll_year::TEXT || '-' || LPAD(v_month.payroll_month::TEXT, 2, '0'),
    'cash'
  );

  INSERT INTO public.worker_payroll_operations (
    id, payroll_month_id, branch, worker_id, worker_name,
    payroll_year, payroll_month, operation_type, operation_date,
    amount, before_amount, after_amount, salary_status_after,
    reference, note, metadata, journal_entry_id, created_by, approved_by
  ) VALUES (
    v_operation_id, v_month.id, v_month.branch, v_month.worker_id, v_month.worker_name,
    v_month.payroll_year, v_month.payroll_month, 'payment', p_operation_date,
    v_amount, v_before, COALESCE(v_month.remaining_due, 0), v_month.salary_status,
    p_reference, p_note,
    jsonb_build_object('payment_account', 'cash') || COALESCE(p_metadata, '{}'::JSONB),
    v_journal_id, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_operation;

  RETURN jsonb_build_object('month', to_jsonb(v_month), 'operation', to_jsonb(v_operation));
END;
$$;

REVOKE ALL ON FUNCTION private.insert_tailoring_payroll_cash_payment(UUID, DATE, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3) صفحة الرواتب: «تسجيل دفعة» (+ خصم اختياري)
-- --------------------------------------------------------------------------
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
  IF p_deduction>v_month.remaining_due+0.009 THEN
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

-- --------------------------------------------------------------------------
-- 4) سلفة الصندوق: نفس إنشاء الشهر ونفس إدراج الدفعة
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_cash_box_worker_advance(
  p_worker_id UUID,
  p_amount NUMERIC,
  p_request_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount NUMERIC(12, 2) := ROUND(COALESCE(p_amount, 0), 2);
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_reference TEXT := 'CBA-' || p_request_id::TEXT;
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::DATE;
  v_year INTEGER := EXTRACT(YEAR FROM v_today)::INTEGER;
  v_month_no INTEGER := EXTRACT(MONTH FROM v_today)::INTEGER;
  v_worker_name TEXT;
  v_reason TEXT;
  v_payroll_note TEXT;
  v_existing public.worker_payroll_operations%ROWTYPE;
  v_withdrawal RECORD;
  v_saved public.cash_box_withdrawals%ROWTYPE;
  v_month public.worker_payroll_months%ROWTYPE;
  v_result JSONB;
BEGIN
  IF NOT private.cash_box_user_is_authorized(TRUE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لإجراء سحب من الصندوق' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL OR p_worker_id IS NULL THEN
    RAISE EXCEPTION 'اختر العامل وأعد المحاولة' USING ERRCODE = '22023';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'قيمة السلفة يجب أن تكون أكبر من صفر' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cash-box-advance:' || p_request_id::TEXT, 0)
  );

  -- إعادة المحاولة بنفس الطلب: نعيد النتيجة المحفوظة بدل سحب جديد
  SELECT * INTO v_existing
  FROM public.worker_payroll_operations
  WHERE reference = v_reference
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_saved
    FROM public.cash_box_withdrawals
    WHERE id = NULLIF(v_existing.metadata->>'cash_box_withdrawal_id', '')::UUID;

    RETURN jsonb_build_object(
      'withdrawal_id', v_saved.id,
      'reason', v_saved.reason,
      'balance_before', v_saved.balance_before,
      'balance_after', private.calculate_cash_box_balance('tailoring', NULL),
      'created_at', v_saved.created_at,
      'created_by_name', v_saved.created_by_name,
      'worker_name', v_existing.worker_name,
      'operation_id', v_existing.id
    );
  END IF;

  SELECT u.full_name INTO v_worker_name
  FROM public.workers AS w
  JOIN public.users AS u ON u.id = w.user_id
  WHERE w.id = p_worker_id;

  IF NOT FOUND OR NULLIF(btrim(v_worker_name), '') IS NULL THEN
    RAISE EXCEPTION 'العامل غير موجود' USING ERRCODE = '22023';
  END IF;

  v_reason := LEFT(
    'سلفة للعامل ' || v_worker_name || COALESCE(' — ' || v_note, ''),
    500
  );
  v_payroll_note := 'سحب من الصندوق بتاريخ ' || to_char(v_today, 'YYYY-MM-DD')
    || COALESCE(' — ' || v_note, '');

  -- 1) السحب النقدي (يتحقق من الرصيد ويقفل الصندوق)
  SELECT * INTO v_withdrawal
  FROM public.withdraw_from_cash_box('tailoring', v_amount, v_reason);

  -- 2) دفعة الراتب على شهر اليوم، بلا حد أعلى بالمتبقي
  PERFORM public.assert_worker_payroll_operation_period(v_year, v_month_no, v_today);
  v_month := private.ensure_tailoring_payroll_month(
    p_worker_id::TEXT, v_worker_name, v_year, v_month_no
  );
  v_result := private.insert_tailoring_payroll_cash_payment(
    v_month.id, v_today, v_amount, v_reference, v_payroll_note,
    jsonb_build_object(
      'source', 'cash_box_advance',
      'cash_box_withdrawal_id', v_withdrawal.withdrawal_id
    )
  );

  RETURN jsonb_build_object(
    'withdrawal_id', v_withdrawal.withdrawal_id,
    'reason', v_reason,
    'balance_before', v_withdrawal.balance_before,
    'balance_after', v_withdrawal.balance_after,
    'created_at', v_withdrawal.created_at,
    'created_by_name', v_withdrawal.created_by_name,
    'worker_name', v_worker_name,
    'operation_id', v_result->'operation'->>'id'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_cash_box_worker_advance(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_cash_box_worker_advance(UUID, NUMERIC, UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
