-- ============================================================================
-- صندوق النقد لقسم التفصيل: الرصيد، سجل الحركات، والسحب الآمن
-- ============================================================================
-- مصادر الرصيد:
--   + كاش العربون/الدفعات قبل التسليم من orders
--   + كاش الدفعة المتبقية عند التسليم من orders
--   + الواردات اليدوية المسجلة ككاش في income
--   - المصروفات التي مصدرها الصندوق في expenses
--   + تعديلات الرصيد القديمة في cash_box_adjustments
--   - عمليات السحب المسجلة في cash_box_withdrawals
--
-- عملية السحب ذرية: يتم قفل الفرع أثناء فحص الرصيد وإضافة السجل لمنع سحبين
-- متزامنين من تجاوز الرصيد المتاح.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.cash_box_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch TEXT NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  balance_before NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2) NOT NULL CHECK (balance_after >= 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cash_box_withdrawals IS
  'سجل غير قابل للتعديل لعمليات السحب النقدي من صندوق الفروع';
COMMENT ON COLUMN public.cash_box_withdrawals.amount IS
  'قيمة السحب الموجبة؛ تُطرح من رصيد الصندوق عند الحساب';
COMMENT ON COLUMN public.cash_box_withdrawals.reason IS
  'سبب السحب كما أدخله المستخدم';

CREATE INDEX IF NOT EXISTS idx_cash_box_withdrawals_branch_created_at
  ON public.cash_box_withdrawals (branch, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_box_withdrawals_created_by
  ON public.cash_box_withdrawals (created_by);

ALTER TABLE public.cash_box_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_box_withdrawals_select_authorized
  ON public.cash_box_withdrawals;
CREATE POLICY cash_box_withdrawals_select_authorized
  ON public.cash_box_withdrawals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS u
      LEFT JOIN public.workers AS w ON w.user_id = u.id
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND (
          u.role = 'admin'
          OR (
            u.role = 'worker'
            AND w.worker_type IN (
              'accountant',
              'general_manager',
              'fabric_store_manager'
            )
          )
        )
    )
  );

-- لا يوجد INSERT/UPDATE/DELETE مباشر. الإدخال يتم حصراً عبر RPC السحب الذري.
REVOKE ALL ON TABLE public.cash_box_withdrawals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cash_box_withdrawals FROM authenticated;
GRANT SELECT ON TABLE public.cash_box_withdrawals TO authenticated;
GRANT ALL ON TABLE public.cash_box_withdrawals TO service_role;

-- --------------------------------------------------------------------------
-- إيصالات كاش الطلبات من لحظة تفعيل الصندوق
-- --------------------------------------------------------------------------
-- لا نعيد احتساب الطلبات التاريخية لأن سحوباتها القديمة غير موجودة في النظام؛
-- يبدأ هذا السجل من لحظة تطبيق الهجرة ويحفظ كل كاش جديد يدخل فعلياً للدرج.

CREATE TABLE IF NOT EXISTS public.cash_box_order_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch TEXT NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  order_id UUID NOT NULL,
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('order_deposit', 'order_delivery')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, receipt_type)
);

COMMENT ON TABLE public.cash_box_order_receipts IS
  'إيصالات كاش الطلبات الجديدة ودفعات التسليم المسجلة تلقائياً من لحظة تفعيل الصندوق';

CREATE INDEX IF NOT EXISTS idx_cash_box_order_receipts_branch_occurred_at
  ON public.cash_box_order_receipts (branch, occurred_at DESC);

ALTER TABLE public.cash_box_order_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_box_order_receipts_select_authorized
  ON public.cash_box_order_receipts;
CREATE POLICY cash_box_order_receipts_select_authorized
  ON public.cash_box_order_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS u
      LEFT JOIN public.workers AS w ON w.user_id = u.id
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND (
          u.role = 'admin'
          OR (
            u.role = 'worker'
            AND w.worker_type IN (
              'accountant',
              'general_manager',
              'fabric_store_manager'
            )
          )
        )
    )
  );

REVOKE ALL ON TABLE public.cash_box_order_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cash_box_order_receipts FROM authenticated;
GRANT SELECT ON TABLE public.cash_box_order_receipts TO authenticated;
GRANT ALL ON TABLE public.cash_box_order_receipts TO service_role;

CREATE OR REPLACE FUNCTION private.sync_tailoring_cash_box_order_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deposit_cash NUMERIC(12, 2);
  v_delivery_cash NUMERIC(12, 2);
  v_order_label TEXT;
  v_customer_name TEXT;
BEGIN
  IF NEW.branch <> 'tailoring' OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  v_order_label := COALESCE(NEW.order_number, LEFT(NEW.id::TEXT, 8));
  v_customer_name := COALESCE(NULLIF(NEW.client_name, ''), 'عميل');

  v_deposit_cash := ROUND(
    CASE
      WHEN NEW.pre_delivery_cash_amount IS NOT NULL
        THEN GREATEST(NEW.pre_delivery_cash_amount, 0)
      WHEN NEW.payment_method = 'cash' AND NEW.status = 'delivered'
        THEN GREATEST(COALESCE(NEW.deposit_amount, NEW.paid_amount, 0), 0)
      WHEN NEW.payment_method = 'cash'
        THEN GREATEST(COALESCE(NEW.paid_amount, 0), 0)
      ELSE 0
    END,
    2
  );

  -- إنشاء الطلب الجديد: تسجيل عربون الكاش فقط.
  IF TG_OP = 'INSERT' AND v_deposit_cash > 0 THEN
    INSERT INTO public.cash_box_order_receipts (
      branch,
      order_id,
      receipt_type,
      amount,
      title,
      description,
      occurred_at
    )
    VALUES (
      'tailoring',
      NEW.id,
      'order_deposit',
      v_deposit_cash,
      'عربون كاش — طلب ' || v_order_label,
      v_customer_name,
      COALESCE(NEW.created_at, now())
    )
    ON CONFLICT (order_id, receipt_type) DO NOTHING;
  END IF;

  -- إذا أُضيف كاش آخر للطلب قبل التسليم، حدّث إيصال العربون المجمّع.
  IF TG_OP = 'UPDATE'
    AND NEW.status <> 'delivered'
    AND (
      NEW.pre_delivery_cash_amount IS DISTINCT FROM OLD.pre_delivery_cash_amount
      OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    )
  THEN
    IF v_deposit_cash > 0 THEN
      INSERT INTO public.cash_box_order_receipts (
        branch,
        order_id,
        receipt_type,
        amount,
        title,
        description,
        occurred_at
      )
      VALUES (
        'tailoring',
        NEW.id,
        'order_deposit',
        v_deposit_cash,
        'عربون كاش — طلب ' || v_order_label,
        v_customer_name,
        COALESCE(NEW.created_at, now())
      )
      ON CONFLICT (order_id, receipt_type) DO UPDATE
      SET
        amount = EXCLUDED.amount,
        title = EXCLUDED.title,
        description = EXCLUDED.description;
    ELSE
      UPDATE public.cash_box_order_receipts
      SET amount = 0
      WHERE order_id = NEW.id
        AND receipt_type = 'order_deposit';
    END IF;
  END IF;

  -- الانتقال الفعلي إلى "تم التسليم": تسجيل جزء الكاش من الدفعة المتبقية.
  IF (
    (TG_OP = 'INSERT' AND NEW.status = 'delivered')
    OR (
      TG_OP = 'UPDATE'
      AND OLD.status IS DISTINCT FROM 'delivered'
      AND NEW.status = 'delivered'
    )
  ) THEN
    v_delivery_cash := ROUND(
      CASE
        WHEN NEW.remaining_cash_amount IS NOT NULL
          THEN GREATEST(NEW.remaining_cash_amount, 0)
        WHEN NEW.remaining_payment_method = 'cash'
          THEN GREATEST(
            COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.deposit_amount, 0),
            0
          )
        ELSE 0
      END,
      2
    );

    IF v_delivery_cash > 0 THEN
      INSERT INTO public.cash_box_order_receipts (
        branch,
        order_id,
        receipt_type,
        amount,
        title,
        description,
        occurred_at
      )
      VALUES (
        'tailoring',
        NEW.id,
        'order_delivery',
        v_delivery_cash,
        'كاش عند التسليم — طلب ' || v_order_label,
        v_customer_name,
        COALESCE(
          NEW.delivery_notified_at,
          NEW.admin_completed_at,
          NEW.updated_at,
          now()
        )
      )
      ON CONFLICT (order_id, receipt_type) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_tailoring_cash_box_order_receipt() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_tailoring_cash_box_order_receipt() FROM anon;
REVOKE ALL ON FUNCTION private.sync_tailoring_cash_box_order_receipt() FROM authenticated;

DROP TRIGGER IF EXISTS trigger_sync_tailoring_cash_box_order_receipt
  ON public.orders;
CREATE TRIGGER trigger_sync_tailoring_cash_box_order_receipt
AFTER INSERT OR UPDATE OF
  status,
  paid_amount,
  payment_method,
  deposit_amount,
  pre_delivery_cash_amount,
  remaining_payment_method,
  remaining_cash_amount
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.sync_tailoring_cash_box_order_receipt();

-- --------------------------------------------------------------------------
-- فحص صلاحيات الصندوق
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cash_box_user_is_authorized(
  p_for_withdrawal BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    LEFT JOIN public.workers AS w ON w.user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND u.is_active = TRUE
      AND (
        u.role = 'admin'
        OR (
          u.role = 'worker'
          AND (
            (p_for_withdrawal AND w.worker_type = 'accountant')
            OR (
              NOT p_for_withdrawal
              AND w.worker_type IN (
                'accountant',
                'general_manager',
                'fabric_store_manager'
              )
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.cash_box_user_is_authorized(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cash_box_user_is_authorized(BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION private.cash_box_user_is_authorized(BOOLEAN) FROM authenticated;

-- --------------------------------------------------------------------------
-- الحساب المركزي للرصيد
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
AS $$
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
    SELECT COALESCE(SUM(i.amount), 0) AS amount
    FROM public.income AS i
    WHERE i.branch = p_branch
      AND i.payment_method = 'cash'
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
$$;

REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM anon;
REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM authenticated;

-- --------------------------------------------------------------------------
-- RPC: جلب الرصيد
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_cash_box_balance(
  p_branch TEXT,
  p_as_of DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_branch NOT IN ('tailoring', 'fabrics', 'ready_designs') THEN
    RAISE EXCEPTION 'فرع الصندوق غير صالح';
  END IF;

  IF NOT private.cash_box_user_is_authorized(FALSE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لعرض الصندوق' USING ERRCODE = '42501';
  END IF;

  RETURN private.calculate_cash_box_balance(p_branch, p_as_of);
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_box_balance(TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cash_box_balance(TEXT, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cash_box_balance(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_box_balance(TEXT, DATE) TO service_role;

-- --------------------------------------------------------------------------
-- RPC: سجل حركات الصندوق الموحد
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
AS $$
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
      ROUND(i.amount, 2) AS amount,
      COALESCE(
        i.created_at,
        i.date::TIMESTAMP AT TIME ZONE 'Asia/Riyadh'
      ) AS occurred_at,
      'وارد كاش'::TEXT AS title,
      COALESCE(NULLIF(i.description, ''), NULLIF(i.customer_name, ''), 'وارد نقدي')::TEXT AS description,
      NULL::TEXT AS actor_name,
      i.id AS reference_id
    FROM public.income AS i
    WHERE i.branch = p_branch
      AND i.payment_method = 'cash'
      AND (p_branch <> 'tailoring' OR i.order_id IS NULL)
      AND i.amount > 0
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
$$;

REVOKE ALL ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) TO service_role;

-- --------------------------------------------------------------------------
-- RPC: سحب نقدي ذري
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.withdraw_from_cash_box(
  p_branch TEXT,
  p_amount NUMERIC,
  p_reason TEXT
)
RETURNS TABLE (
  withdrawal_id UUID,
  balance_before NUMERIC,
  balance_after NUMERIC,
  created_at TIMESTAMPTZ,
  created_by_name TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_balance_before NUMERIC(14, 2);
  v_balance_after NUMERIC(14, 2);
  v_withdrawal_id UUID;
  v_created_at TIMESTAMPTZ;
  v_amount NUMERIC(12, 2);
  v_reason TEXT;
BEGIN
  IF p_branch NOT IN ('tailoring', 'fabrics', 'ready_designs') THEN
    RAISE EXCEPTION 'فرع الصندوق غير صالح';
  END IF;

  IF NOT private.cash_box_user_is_authorized(TRUE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لإجراء سحب من الصندوق' USING ERRCODE = '42501';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0), 2);
  v_reason := btrim(COALESCE(p_reason, ''));

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'قيمة السحب يجب أن تكون أكبر من صفر';
  END IF;

  IF v_amount > 999999999.99 THEN
    RAISE EXCEPTION 'قيمة السحب أكبر من الحد المسموح';
  END IF;

  IF char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'سبب السحب يجب أن يكون بين 3 و500 حرف';
  END IF;

  SELECT u.full_name
  INTO v_user_name
  FROM public.users AS u
  WHERE u.id = v_user_id;

  -- تسلسل عمليات السحب داخل الفرع نفسه حتى لا تتجاوز عمليتان متزامنتان الرصيد.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cash-box:' || p_branch, 0)
  );

  v_balance_before := private.calculate_cash_box_balance(p_branch, NULL);

  IF v_amount > v_balance_before THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ. الرصيد الحالي: % ر.س', v_balance_before;
  END IF;

  v_balance_after := ROUND(v_balance_before - v_amount, 2);

  INSERT INTO public.cash_box_withdrawals (
    branch,
    amount,
    reason,
    balance_before,
    balance_after,
    created_by,
    created_by_name
  )
  VALUES (
    p_branch,
    v_amount,
    v_reason,
    v_balance_before,
    v_balance_after,
    v_user_id,
    COALESCE(NULLIF(v_user_name, ''), 'مستخدم النظام')
  )
  RETURNING
    id,
    public.cash_box_withdrawals.created_at
  INTO v_withdrawal_id, v_created_at;

  RETURN QUERY
  SELECT
    v_withdrawal_id,
    v_balance_before,
    v_balance_after,
    v_created_at,
    COALESCE(NULLIF(v_user_name, ''), 'مستخدم النظام');
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_from_cash_box(TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_from_cash_box(TEXT, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_from_cash_box(TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_from_cash_box(TEXT, NUMERIC, TEXT) TO service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
