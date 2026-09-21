-- ============================================================================
-- سجل الدفعات الإضافية للطلب (نافذة «تعديل الطلب» ← «إضافة دفعة جديدة»)
-- ============================================================================
-- المشكلة:
--   الدفعة الإضافية كانت تُدمج فقط في orders.pre_delivery_cash/network_amount،
--   فيُحدَّث إيصال «عربون كاش» المجمّع في cash_box_order_receipts مع إبقاء
--   تاريخه على تاريخ إنشاء الطلب. النتيجة: الرصيد يزيد، لكن الدفعة لا تظهر
--   كحركة مستقلة بتاريخها في سجل الصندوق ولا في سجل الواردات.
--
-- الحل:
--   • جدول order_additional_payments: صف لكل دفعة بتاريخ ووقت استلامها.
--   • إيصال العربون المجمّع = كاش ما قبل التسليم − دفعات الكاش المسجّلة هنا،
--     وكل دفعة كاش تظهر حركةً مستقلة في الصندوق (بدون احتساب مزدوج).
--   • صفحة الواردات تقرأ الجدول نفسه وتفصل الدفعات عن العربون.
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_additional_payments (
  -- معرّف الدفعة المولَّد في الواجهة؛ يجعل إعادة المحاولة آمنة (idempotent)
  id TEXT PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alostaz_invoice_code TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_additional_payments IS
  'الدفعات المضافة لاحقاً لطلب التفصيل — لكل دفعة تاريخها في سجل الصندوق والواردات';

CREATE INDEX IF NOT EXISTS idx_order_additional_payments_order
  ON public.order_additional_payments (order_id);
CREATE INDEX IF NOT EXISTS idx_order_additional_payments_branch_occurred_at
  ON public.order_additional_payments (branch, occurred_at DESC);

ALTER TABLE public.order_additional_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_additional_payments_select_authorized
  ON public.order_additional_payments;
CREATE POLICY order_additional_payments_select_authorized
  ON public.order_additional_payments
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
            AND w.worker_type IN ('accountant', 'general_manager', 'fabric_store_manager')
          )
        )
    )
  );

-- الكتابة عبر الدالة record_order_additional_payment فقط
REVOKE ALL ON TABLE public.order_additional_payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_additional_payments FROM authenticated;
GRANT SELECT ON TABLE public.order_additional_payments TO authenticated;
GRANT ALL ON TABLE public.order_additional_payments TO service_role;

-- --------------------------------------------------------------------------
-- 1) كاش ما قبل التسليم (نفس منطق الهجرة 78) ومجموع دفعات الكاش الإضافية
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.tailoring_order_pre_delivery_cash(p_order public.orders)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT ROUND(
    CASE
      WHEN p_order.pre_delivery_cash_amount IS NOT NULL
        THEN GREATEST(p_order.pre_delivery_cash_amount, 0)
      WHEN p_order.payment_method = 'cash' AND p_order.status = 'delivered'
        THEN GREATEST(COALESCE(p_order.deposit_amount, p_order.paid_amount, 0), 0)
      WHEN p_order.payment_method = 'cash'
        THEN GREATEST(COALESCE(p_order.paid_amount, 0), 0)
      ELSE 0
    END,
    2
  );
$$;

CREATE OR REPLACE FUNCTION private.tailoring_order_additional_cash(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(p.amount), 0)
  FROM public.order_additional_payments AS p
  WHERE p.order_id = p_order_id
    AND p.method = 'cash';
$$;

REVOKE ALL ON FUNCTION private.tailoring_order_pre_delivery_cash(public.orders) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_order_additional_cash(UUID) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2) مزامنة إيصالات الطلب: العربون المجمّع يستثني الدفعات الإضافية
-- --------------------------------------------------------------------------
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

  -- دفعات الكاش الإضافية تظهر كحركات مستقلة، فلا تُحتسب ضمن العربون.
  v_deposit_cash := GREATEST(
    private.tailoring_order_pre_delivery_cash(NEW)
      - private.tailoring_order_additional_cash(NEW.id),
    0
  );

  -- إنشاء الطلب الجديد: تسجيل عربون الكاش فقط.
  IF TG_OP = 'INSERT' AND v_deposit_cash > 0 THEN
    INSERT INTO public.cash_box_order_receipts (
      branch, order_id, receipt_type, amount, title, description, occurred_at
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

  -- إذا تغيّر كاش ما قبل التسليم، حدّث إيصال العربون المجمّع.
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
        branch, order_id, receipt_type, amount, title, description, occurred_at
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
        branch, order_id, receipt_type, amount, title, description, occurred_at
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

REVOKE ALL ON FUNCTION private.sync_tailoring_cash_box_order_receipt() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3) تسجيل دفعة إضافية (بعد حفظ الطلب بمبالغه الجديدة)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_order_additional_payment(
  p_payment_id TEXT,
  p_order_id UUID,
  p_amount NUMERIC,
  p_method TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_alostaz_invoice_code TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_amount NUMERIC(12, 2) := ROUND(COALESCE(p_amount, 0), 2);
  v_method_total NUMERIC(12, 2);
  v_recorded NUMERIC(12, 2);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = (SELECT auth.uid()) AND u.is_active = TRUE AND u.role = 'admin'
  ) AND NOT private.cash_box_user_is_authorized(FALSE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لتسجيل دفعات الطلب' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(TRIM(p_payment_id), '') = '' THEN
    RAISE EXCEPTION 'معرّف الدفعة مطلوب';
  END IF;
  IF p_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة دفع غير صالحة';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة غير صالح';
  END IF;

  -- إعادة المحاولة بنفس المعرّف: نُكمل رقم فاتورة الأستاذ فقط
  IF EXISTS (SELECT 1 FROM public.order_additional_payments WHERE id = p_payment_id) THEN
    UPDATE public.order_additional_payments
    SET alostaz_invoice_code = COALESCE(NULLIF(TRIM(p_alostaz_invoice_code), ''), alostaz_invoice_code)
    WHERE id = p_payment_id AND order_id = p_order_id;
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  -- لا يُسجَّل أكثر مما هو محفوظ فعلاً على الطلب بهذه الطريقة
  v_method_total := CASE
    WHEN p_method = 'cash' THEN private.tailoring_order_pre_delivery_cash(v_order)
    ELSE GREATEST(COALESCE(v_order.pre_delivery_network_amount, 0), 0)
  END;
  SELECT COALESCE(SUM(p.amount), 0) INTO v_recorded
  FROM public.order_additional_payments AS p
  WHERE p.order_id = p_order_id AND p.method = p_method;

  IF v_recorded + v_amount > v_method_total + 0.005 THEN
    RAISE EXCEPTION 'مبلغ الدفعة لا يطابق المبالغ المحفوظة على الطلب';
  END IF;

  INSERT INTO public.order_additional_payments (
    id, order_id, branch, method, amount, occurred_at, alostaz_invoice_code
  )
  VALUES (
    p_payment_id,
    p_order_id,
    COALESCE(v_order.branch, 'tailoring'),
    p_method,
    v_amount,
    COALESCE(p_occurred_at, now()),
    NULLIF(TRIM(p_alostaz_invoice_code), '')
  );

  -- نقل مبلغ الكاش من إيصال العربون المجمّع إلى حركته المستقلة
  IF p_method = 'cash' AND v_order.status <> 'delivered' THEN
    UPDATE public.cash_box_order_receipts
    SET amount = GREATEST(
      private.tailoring_order_pre_delivery_cash(v_order)
        - private.tailoring_order_additional_cash(p_order_id),
      0
    )
    WHERE order_id = p_order_id
      AND receipt_type = 'order_deposit';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_additional_payment(TEXT, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_order_additional_payment(TEXT, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 4) رصيد الصندوق: يضيف دفعات الكاش الإضافية
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
  order_payments_cash AS (
    SELECT COALESCE(SUM(p.amount), 0) AS amount
    FROM public.order_additional_payments AS p
    WHERE p.branch = p_branch
      AND p.method = 'cash'
      AND (
        p_as_of IS NULL
        OR (p.occurred_at AT TIME ZONE 'Asia/Riyadh')::DATE <= p_as_of
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
    + order_payments_cash.amount
    + manual_cash_income.amount
    - box_expenses.amount
    + legacy_adjustments.amount
    - withdrawals.amount,
    2
  )
  FROM order_cash, order_payments_cash, manual_cash_income, box_expenses, legacy_adjustments, withdrawals;
$fn$;

REVOKE ALL ON FUNCTION private.calculate_cash_box_balance(TEXT, DATE) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 5) سجل الحركات: كل دفعة كاش إضافية حركة مستقلة بتاريخها
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
  order_payments AS (
    SELECT
      'order-payment:' || p.id AS transaction_id,
      'order_payment'::TEXT AS transaction_type,
      ROUND(p.amount, 2) AS amount,
      p.occurred_at,
      ('دفعة كاش — طلب ' || COALESCE(o.order_number, LEFT(o.id::TEXT, 8)))::TEXT AS title,
      COALESCE(NULLIF(o.client_name, ''), 'عميل')::TEXT AS description,
      u.full_name::TEXT AS actor_name,
      p.order_id AS reference_id
    FROM public.order_additional_payments AS p
    JOIN public.orders AS o ON o.id = p.order_id
    LEFT JOIN public.users AS u ON u.id = p.created_by
    WHERE p.branch = p_branch
      AND p.method = 'cash'
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
    SELECT * FROM order_payments
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

REVOKE ALL ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER) TO authenticated, service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
