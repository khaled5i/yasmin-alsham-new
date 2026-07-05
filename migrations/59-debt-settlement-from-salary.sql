-- ============================================================================
-- Migration 59: تسديد الدين من الراتب + مفهوم "النقد الفعلي المصروف"
--
-- المطلوب:
-- 1. تسديد دفعة من الدين يُحتسب ضمن سداد الراتب (ليصبح الراتب مكتملاً)
--    لكنه لا يُعتبر نقداً فعلياً مصروفاً هذا الشهر.
-- 2. تسجيل دين جديد = نقد فعلي خرج من الصندوق → يُحتسب في "إجمالي المدفوع"
--    (يُحسب في الواجهة من عمليات deduction الشهرية — لا حاجة لتغيير في القاعدة).
--
-- التنفيذ:
-- - دالة settle_worker_debt_from_salary: تُخفّض الدين وتسجّل دفعة الدين (كما سابقاً)
--   وتسجّل تلقائياً "دفعة راتب" بعلامة metadata.debt_settlement = true
--   بحد أقصى المتبقي من راتب الشهر (لا تتجاوزه).
-- - تعديل قيد منع تكرار الدفعات ليفرّق بين الدفعة النقدية ودفعة التسوية
--   (حتى لا يفشل تسجيل تسوية بنفس مبلغ وتاريخ دفعة نقدية).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. إعادة إنشاء قيد منع تكرار الدفعات مع تمييز دفعات تسوية الدين
-- ============================================================================

DROP INDEX IF EXISTS uq_worker_payroll_payment_duplicate;
CREATE UNIQUE INDEX uq_worker_payroll_payment_duplicate
  ON worker_payroll_operations(
    branch,
    worker_id,
    payroll_year,
    payroll_month,
    operation_date,
    amount,
    (COALESCE(metadata->>'debt_settlement', 'false'))
  )
  WHERE operation_type = 'payment';

-- ============================================================================
-- 2. دالة تسديد الدين من الراتب
-- ============================================================================

CREATE OR REPLACE FUNCTION settle_worker_debt_from_salary(
  p_branch VARCHAR,
  p_worker_id TEXT,
  p_worker_name TEXT,
  p_year INTEGER,
  p_month INTEGER,
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
  v_amount NUMERIC(14,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_debt worker_payroll_big_debts%ROWTYPE;
  v_debt_before NUMERIC(14,2);
  v_debt_after NUMERIC(14,2);
  v_payment_id UUID := gen_random_uuid();
  v_month worker_payroll_months%ROWTYPE;
  v_salary_part NUMERIC(14,2) := 0;
  v_operation worker_payroll_operations%ROWTYPE;
  v_operation_id UUID := gen_random_uuid();
  v_before NUMERIC(14,2);
  v_after NUMERIC(14,2);
  v_journal_id UUID;
  v_month_start DATE := MAKE_DATE(p_year, p_month, 1);
  v_month_end DATE := (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE;
  v_op_date DATE;
  v_period_locked BOOLEAN := is_worker_payroll_period_locked(p_branch, p_year, p_month);
BEGIN
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll period'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------
  -- (أ) تخفيض الدين المتراكم + تسجيله في سجل دفعات الديون (كما سابقاً)
  -- --------------------------------------------------------------------
  SELECT * INTO v_debt
  FROM worker_payroll_big_debts
  WHERE branch = p_branch AND worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND OR v_debt.remaining_amount <= 0.009 THEN
    RAISE EXCEPTION 'لا يوجد دين نشط لهذا العامل'
      USING ERRCODE = '22023';
  END IF;

  IF v_amount > v_debt.remaining_amount + 0.009 THEN
    RAISE EXCEPTION 'مبلغ السداد أكبر من الدين المتبقي'
      USING ERRCODE = '22023';
  END IF;

  v_debt_before := v_debt.remaining_amount;
  v_debt_after := ROUND(GREATEST(v_debt.remaining_amount - v_amount, 0), 2);

  UPDATE worker_payroll_big_debts
  SET remaining_amount = v_debt_after,
      updated_by = v_actor
  WHERE id = v_debt.id;

  INSERT INTO worker_payroll_deduction_payments (
    id, branch, worker_id, worker_name,
    amount, payment_date, note,
    before_amount, after_amount, created_by
  ) VALUES (
    v_payment_id, p_branch, p_worker_id, p_worker_name,
    v_amount, p_payment_date, p_note,
    v_debt_before, v_debt_after, v_actor
  );

  -- --------------------------------------------------------------------
  -- (ب) احتساب التسوية ضمن سداد راتب الشهر (بحد أقصى المتبقي من الراتب)
  --     تُتجاوز هذه الخطوة إذا كان الشهر مقفلاً — يبقى تسديد الدين نافذاً
  -- --------------------------------------------------------------------
  IF NOT v_period_locked THEN
    v_month := ensure_worker_payroll_month(p_branch, p_worker_id, p_worker_name, p_year, p_month);
    v_before := COALESCE(v_month.remaining_due, 0);
    v_salary_part := ROUND(LEAST(v_amount, GREATEST(v_before, 0)), 2);

    IF v_salary_part > 0.009 THEN
      -- تاريخ العملية يجب أن يقع ضمن شهر الراتب (قيد محاسبي)
      v_op_date := LEAST(GREATEST(p_payment_date, v_month_start), v_month_end);

      UPDATE worker_payroll_months
      SET total_paid = ROUND(total_paid + v_salary_part, 2),
          updated_by = v_actor
      WHERE id = v_month.id
      RETURNING * INTO v_month;

      v_after := COALESCE(v_month.remaining_due, 0);

      -- قيد محاسبي: تسوية سلفة من مستحقات العامل (لا حركة نقدية)
      v_journal_id := create_worker_payroll_journal_entry(
        v_operation_id,
        'deduction',
        v_salary_part,
        v_op_date,
        p_year,
        p_month,
        'Debt settlement from salary - ' || p_worker_name || ' - ' || p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0'),
        'cash'
      );

      INSERT INTO worker_payroll_operations (
        id, payroll_month_id, branch, worker_id, worker_name,
        payroll_year, payroll_month, operation_type, operation_date,
        amount, before_amount, after_amount, salary_status_after,
        reference, note, metadata, journal_entry_id, created_by, approved_by
      ) VALUES (
        v_operation_id, v_month.id, v_month.branch, v_month.worker_id, v_month.worker_name,
        v_month.payroll_year, v_month.payroll_month, 'payment', v_op_date,
        v_salary_part, v_before, v_after, v_month.salary_status,
        'DSTL-' || p_worker_id || '-' || p_year::TEXT || LPAD(p_month::TEXT, 2, '0') || '-' ||
          TO_CHAR(NOW(), 'HH24MISSMS'),
        COALESCE(p_note, 'تسوية دين من الراتب'),
        jsonb_build_object(
          'debt_settlement', true,
          'debt_payment_id', v_payment_id,
          'debt_payment_total', v_amount
        ),
        v_journal_id, v_actor, v_actor
      )
      RETURNING * INTO v_operation;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'before_amount', v_debt_before,
    'after_amount', v_debt_after,
    'paid_amount', v_amount,
    'salary_part', v_salary_part,
    'period_locked', v_period_locked,
    'month', CASE WHEN v_month.id IS NOT NULL THEN to_jsonb(v_month) ELSE NULL END,
    'operation', CASE WHEN v_operation.id IS NOT NULL THEN to_jsonb(v_operation) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settle_worker_debt_from_salary(VARCHAR, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, DATE, TEXT) TO authenticated;

COMMIT;
