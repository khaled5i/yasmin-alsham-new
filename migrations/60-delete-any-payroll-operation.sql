-- ============================================================================
-- Migration 60: حذف أي عملية من سجل العمليات مع عكس آثارها الجانبية تلقائياً
--
-- المشكلة: بعض العمليات لا يمكن حذفها لأن حذفها المباشر كان سيفسد رصيد الدين:
-- - عملية "دين": تسجيلها يزيد الدين المتراكم (worker_payroll_big_debts)
--   لكن حذفها القديم (migration 22) لم يكن يُنقصه.
-- - دفعة "تسوية دين": مرتبطة بسجل سداد في worker_payroll_deduction_payments.
-- - سجل "سداد دين": لم تكن هناك دالة حذف له إطلاقاً.
--
-- الحل:
-- 1. توسيع delete_worker_payroll_operation لتعكس كل الآثار الجانبية:
--    - حذف دين → إنقاص الدين المتراكم بنفس المبلغ + إعادة حساب deductions_total
--    - حذف دفعة تسوية → إعادة مبلغ التسديد للدين المتراكم + حذف سجل السداد المرتبط
-- 2. دالة جديدة delete_worker_deduction_payment لحذف سجل سداد الدين:
--    - تُعيد المبلغ إلى الدين المتراكم
--    - إن وُجدت دفعة تسوية مرتبطة تُحذف معها (عبر الدالة الموحدة)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. توسيع دالة حذف العمليات
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_worker_payroll_operation(
  p_operation_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION delete_worker_payroll_operation(UUID) TO authenticated;

-- ============================================================================
-- 2. دالة حذف سجل سداد الدين
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_worker_deduction_payment(
  p_payment_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_payment worker_payroll_deduction_payments%ROWTYPE;
  v_linked_op UUID;
BEGIN
  SELECT * INTO v_payment
  FROM worker_payroll_deduction_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt payment not found';
  END IF;

  -- إن وُجدت دفعة تسوية مرتبطة نحذفها عبر الدالة الموحدة
  -- (هي التي تُعيد الدين وتحذف هذا السجل وتعيد حساب الشهر)
  SELECT id INTO v_linked_op
  FROM worker_payroll_operations
  WHERE operation_type = 'payment'
    AND metadata->>'debt_payment_id' = p_payment_id::TEXT
  LIMIT 1;

  IF v_linked_op IS NOT NULL THEN
    PERFORM delete_worker_payroll_operation(v_linked_op);
    RETURN;
  END IF;

  -- سداد قديم (بدون دفعة تسوية مرتبطة): إعادة المبلغ إلى الدين المتراكم وحذف السجل
  UPDATE worker_payroll_big_debts
  SET remaining_amount = ROUND(remaining_amount + v_payment.amount, 2),
      updated_by = v_actor
  WHERE branch = v_payment.branch
    AND worker_id = v_payment.worker_id;

  DELETE FROM worker_payroll_deduction_payments
  WHERE id = p_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_worker_deduction_payment(UUID) TO authenticated;

COMMIT;
