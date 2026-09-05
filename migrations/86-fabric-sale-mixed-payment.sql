-- ============================================================================
-- مبيعة قماش مدفوعة كاش وشبكة معاً (mixed)
-- ============================================================================
-- الهدف:
--   السماح بتسجيل مبيعة أقمشة واحدة يُدفع جزء منها شبكة وجزء كاش:
--     • network_amount → القيمة الوحيدة التي تُرسَل كفاتورة إلى تطبيق الأستاذ.
--     • cash_amount    → لا تُرسَل للمحاسبة إطلاقاً، وتضاف لرصيد الصندوق فقط.
--     • amount         → يبقى الإجمالي (cash_amount + network_amount) كي تبقى
--                        تقارير المبيعات والإحصاءات القائمة صحيحة دون تغيير.
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) توسيع طريقة الدفع لتشمل 'mixed'
-- --------------------------------------------------------------------------
-- قيد CHECK الأصلي أُنشئ ضمنياً في الهجرة 24 دون اسم صريح، لذلك نحذف أي قيد
-- تحقق على العمود مهما كان اسمه ثم نعيد إنشاءه باسم ثابت.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  FOR v_constraint_name IN
    SELECT c.conname
    FROM pg_constraint AS c
    JOIN pg_class AS t ON t.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'income'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.income DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE public.income
  ADD CONSTRAINT income_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'network', 'mixed'));

COMMENT ON COLUMN public.income.payment_method IS
  'طريقة الدفع: cash (كاش) أو network (شبكة) أو mixed (كاش وشبكة معاً)';

-- --------------------------------------------------------------------------
-- 2) تفصيل المبلغ عند الدفع المختلط
-- --------------------------------------------------------------------------
ALTER TABLE public.income
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS network_amount NUMERIC(12, 2);

COMMENT ON COLUMN public.income.cash_amount IS
  'جزء الكاش من مبيعة مختلطة — يدخل الصندوق ولا يُرسَل للمحاسبة أبداً';
COMMENT ON COLUMN public.income.network_amount IS
  'جزء الشبكة من مبيعة مختلطة — هذه وحدها قيمة فاتورة الأستاذ';

ALTER TABLE public.income
  DROP CONSTRAINT IF EXISTS income_split_amounts_check;
ALTER TABLE public.income
  ADD CONSTRAINT income_split_amounts_check
  CHECK (
    (cash_amount IS NULL OR cash_amount >= 0)
    AND (network_amount IS NULL OR network_amount >= 0)
    AND (
      payment_method IS DISTINCT FROM 'mixed'
      OR (cash_amount IS NOT NULL AND network_amount IS NOT NULL)
    )
  );

-- --------------------------------------------------------------------------
-- 3) حساب الرصيد: المبيعة المختلطة تضيف جزء الكاش فقط
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.calculate_cash_box_balance(
  p_branch TEXT,
  p_as_of DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH order_cash AS (
    SELECT COALESCE(SUM(r.amount), 0) AS amount
    FROM public.cash_box_order_receipts AS r
    WHERE r.branch = p_branch
      AND (
        p_as_of IS NULL
        OR (r.occurred_at AT TIME ZONE 'Asia/Riyadh')::DATE <= p_as_of
      )
  ),
  manual_cash_income AS (
    SELECT COALESCE(
      SUM(
        CASE
          WHEN i.payment_method = 'mixed' THEN GREATEST(COALESCE(i.cash_amount, 0), 0)
          ELSE i.amount
        END
      ),
      0
    ) AS amount
    FROM public.income AS i
    WHERE i.branch = p_branch
      AND i.payment_method IN ('cash', 'mixed')
      AND (p_branch <> 'tailoring' OR i.order_id IS NULL)
      AND (p_as_of IS NULL OR i.date <= p_as_of)
  ),
  box_expenses AS (
    SELECT COALESCE(SUM(e.amount), 0) AS amount
    FROM public.expenses AS e
    WHERE e.branch = p_branch
      AND e.cash_source = 'box'
      AND (p_as_of IS NULL OR e.date <= p_as_of)
  ),
  legacy_adjustments AS (
    SELECT COALESCE(SUM(a.amount), 0) AS amount
    FROM public.cash_box_adjustments AS a
    WHERE a.branch = p_branch
      AND (
        p_as_of IS NULL
        OR a.created_at < (p_as_of + 1)::TIMESTAMP
      )
  ),
  withdrawals AS (
    SELECT COALESCE(SUM(w.amount), 0) AS amount
    FROM public.cash_box_withdrawals AS w
    WHERE w.branch = p_branch
      AND (
        p_as_of IS NULL
        OR w.created_at < (p_as_of + 1)::TIMESTAMP
      )
  )
  SELECT ROUND(
    order_cash.amount
    + manual_cash_income.amount
    - box_expenses.amount
    + legacy_adjustments.amount
    - withdrawals.amount,
    2
  )
  FROM order_cash, manual_cash_income, box_expenses, legacy_adjustments, withdrawals;
$fn$;

REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM anon;
REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM authenticated;

-- --------------------------------------------------------------------------
-- 4) سجل الحركات: إظهار جزء الكاش من المبيعة المختلطة فقط
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cash_box_transactions(
  p_branch TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  transaction_id TEXT,
  transaction_type TEXT,
  amount NUMERIC,
  occurred_at TIMESTAMPTZ,
  title TEXT,
  description TEXT,
  actor_name TEXT,
  reference_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_branch NOT IN ('tailoring', 'fabrics', 'ready_designs') THEN
    RAISE EXCEPTION 'فرع الصندوق غير صالح';
  END IF;

  IF NOT private.cash_box_user_is_authorized(FALSE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لعرض سجل الصندوق' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH order_deposits AS (
    SELECT
      'order-receipt:' || r.id::TEXT AS transaction_id,
      r.receipt_type::TEXT AS transaction_type,
      ROUND(r.amount, 2) AS amount,
      r.occurred_at,
      r.title::TEXT,
      r.description::TEXT,
      NULL::TEXT AS actor_name,
      r.order_id AS reference_id
    FROM public.cash_box_order_receipts AS r
    WHERE r.branch = p_branch
      AND r.amount > 0
  ),
  manual_income AS (
    SELECT
      'income:' || i.id::TEXT AS transaction_id,
      'cash_income'::TEXT AS transaction_type,
      ROUND(
        CASE
          WHEN i.payment_method = 'mixed' THEN GREATEST(COALESCE(i.cash_amount, 0), 0)
          ELSE i.amount
        END,
        2
      ) AS amount,
      COALESCE(
        i.created_at,
        i.date::TIMESTAMP AT TIME ZONE 'Asia/Riyadh'
      ) AS occurred_at,
      CASE
        WHEN i.payment_method = 'mixed' THEN 'وارد كاش (من مبيعة كاش وشبكة)'
        ELSE 'وارد كاش'
      END::TEXT AS title,
      COALESCE(NULLIF(i.description, ''), NULLIF(i.customer_name, ''), 'وارد نقدي')::TEXT AS description,
      NULL::TEXT AS actor_name,
      i.id AS reference_id
    FROM public.income AS i
    WHERE i.branch = p_branch
      AND i.payment_method IN ('cash', 'mixed')
      AND (p_branch <> 'tailoring' OR i.order_id IS NULL)
      AND CASE
            WHEN i.payment_method = 'mixed' THEN COALESCE(i.cash_amount, 0)
            ELSE i.amount
          END > 0
  ),
  expenses_from_box AS (
    SELECT
      'expense:' || e.id::TEXT AS transaction_id,
      'box_expense'::TEXT AS transaction_type,
      -ROUND(e.amount, 2) AS amount,
      COALESCE(
        e.created_at,
        e.date::TIMESTAMP AT TIME ZONE 'Asia/Riyadh'
      ) AS occurred_at,
      'مصروف من الصندوق'::TEXT AS title,
      COALESCE(NULLIF(e.description, ''), NULLIF(e.category, ''), 'مصروف نقدي')::TEXT AS description,
      NULL::TEXT AS actor_name,
      e.id AS reference_id
    FROM public.expenses AS e
    WHERE e.branch = p_branch
      AND e.cash_source = 'box'
      AND e.amount > 0
  ),
  adjustments AS (
    SELECT
      'adjustment:' || a.id::TEXT AS transaction_id,
      'balance_adjustment'::TEXT AS transaction_type,
      ROUND(a.amount, 2) AS amount,
      a.created_at AS occurred_at,
      CASE
        WHEN a.amount >= 0 THEN 'زيادة يدوية في الرصيد'
        ELSE 'تخفيض يدوي للرصيد'
      END::TEXT AS title,
      COALESCE(NULLIF(a.note, ''), 'تعديل رصيد الصندوق')::TEXT AS description,
      a.created_by_name::TEXT AS actor_name,
      a.id AS reference_id
    FROM public.cash_box_adjustments AS a
    WHERE a.branch = p_branch
      AND a.amount <> 0
  ),
  cash_withdrawals AS (
    SELECT
      'withdrawal:' || w.id::TEXT AS transaction_id,
      'withdrawal'::TEXT AS transaction_type,
      -ROUND(w.amount, 2) AS amount,
      w.created_at AS occurred_at,
      'سحب من الصندوق'::TEXT AS title,
      w.reason::TEXT AS description,
      w.created_by_name::TEXT AS actor_name,
      w.id AS reference_id
    FROM public.cash_box_withdrawals AS w
    WHERE w.branch = p_branch
  ),
  movements AS (
    SELECT * FROM order_deposits
    UNION ALL
    SELECT * FROM manual_income
    UNION ALL
    SELECT * FROM expenses_from_box
    UNION ALL
    SELECT * FROM adjustments
    UNION ALL
    SELECT * FROM cash_withdrawals
  )
  SELECT
    m.transaction_id,
    m.transaction_type,
    m.amount,
    m.occurred_at,
    m.title,
    m.description,
    m.actor_name,
    m.reference_id
  FROM movements AS m
  ORDER BY m.occurred_at DESC, m.transaction_id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) TO service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
