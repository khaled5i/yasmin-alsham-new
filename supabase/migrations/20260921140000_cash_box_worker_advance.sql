-- ============================================================================
-- سحب سلفة لعامل من صندوق التفصيل ← دفعة راتب تلقائية في قسم الرواتب
-- ============================================================================
-- عند اختيار «سحب سلفة» في نافذة السحب واختيار العامل، تُنفَّذ في معاملة واحدة:
--   1) سحب نقدي عادي من الصندوق (withdraw_from_cash_box) بنفس الحماية من السحب الزائد.
--   2) «دفعة راتب» على العامل في شهر اليوم (توقيت الرياض) مع ملاحظة
--      «سحب من الصندوق بتاريخ YYYY-MM-DD».
-- إن فشل أيّ منهما لا يُحفظ شيء.
--
-- الفرق عن register_worker_payroll_payment: لا يوجد حد أعلى بالمتبقي.
-- عامل القطعة يكون مستحقه صفرًا أول الشهر حتى تُسعَّر قطعه، فتُقبل السلفة
-- ويصبح المتبقي سالبًا مؤقتًا ثم يعود للارتفاع مع التسعير.
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) قائمة العمال لنافذة السحب (المحاسب لا يملك قراءة workers مباشرة دائمًا)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cash_box_advance_workers()
RETURNS TABLE (
  worker_id UUID,
  worker_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.cash_box_user_is_authorized(TRUE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لإجراء سحب من الصندوق' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT w.id, u.full_name::TEXT
  FROM public.workers AS w
  JOIN public.users AS u ON u.id = w.user_id
  WHERE u.is_active = TRUE
    AND NULLIF(btrim(u.full_name), '') IS NOT NULL
  ORDER BY u.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_box_advance_workers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_box_advance_workers() TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 2) سحب السلفة + دفعة الراتب (ذري، وآمن لإعادة المحاولة بنفس p_request_id)
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
  v_operation public.worker_payroll_operations%ROWTYPE;
  v_operation_id UUID := gen_random_uuid();
  v_before NUMERIC(14, 2);
  v_journal_id UUID;
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

  v_month := public.ensure_worker_payroll_month(
    'tailoring', p_worker_id::TEXT, v_worker_name, v_year, v_month_no
  );

  SELECT * INTO v_month
  FROM public.worker_payroll_months
  WHERE id = v_month.id
  FOR UPDATE;

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
    v_today,
    v_year,
    v_month_no,
    'Payroll advance from cash box - ' || v_worker_name || ' - '
      || v_year::TEXT || '-' || LPAD(v_month_no::TEXT, 2, '0'),
    'cash'
  );

  INSERT INTO public.worker_payroll_operations (
    id, payroll_month_id, branch, worker_id, worker_name,
    payroll_year, payroll_month, operation_type, operation_date,
    amount, before_amount, after_amount, salary_status_after,
    reference, note, metadata, journal_entry_id, created_by, approved_by
  ) VALUES (
    v_operation_id, v_month.id, v_month.branch, v_month.worker_id, v_month.worker_name,
    v_month.payroll_year, v_month.payroll_month, 'payment', v_today,
    v_amount, v_before, COALESCE(v_month.remaining_due, 0), v_month.salary_status,
    v_reference, v_payroll_note,
    jsonb_build_object(
      'payment_account', 'cash',
      'source', 'cash_box_advance',
      'cash_box_withdrawal_id', v_withdrawal.withdrawal_id
    ),
    v_journal_id, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_operation;

  RETURN jsonb_build_object(
    'withdrawal_id', v_withdrawal.withdrawal_id,
    'reason', v_reason,
    'balance_before', v_withdrawal.balance_before,
    'balance_after', v_withdrawal.balance_after,
    'created_at', v_withdrawal.created_at,
    'created_by_name', v_withdrawal.created_by_name,
    'worker_name', v_worker_name,
    'operation_id', v_operation.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_cash_box_worker_advance(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_cash_box_worker_advance(UUID, NUMERIC, UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
