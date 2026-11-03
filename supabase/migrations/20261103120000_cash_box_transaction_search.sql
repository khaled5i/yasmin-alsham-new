-- ============================================================================
-- البحث في سجل الصندوق كاملاً (3 نوفمبر 2026)
-- ============================================================================
-- المشكلة:
--   get_cash_box_transactions تعيد أحدث 200 حركة كحد أقصى ولا تقبل بحثاً، فالبحث
--   داخل القائمة المحمّلة في الصفحة لا يصل إلى الحركات الأقدم ويقول «لا توجد
--   نتائج» رغم وجودها.
--
-- الحل:
--   • مُعامل اختياري p_search يبحث في كل الحركات قبل تطبيق الحد الأقصى: العنوان
--     (وفيه رقم الطلب)، الوصف (اسم العميل أو السبب)، المستخدم، والمبلغ.
--   • يجب أن تطابق الحركة كل كلمة في البحث، وتوحَّد الحروف كما في normalizeSearchText
--     (src/lib/fabric-search.ts) والأرقام العربية كما في toLatinDigits.
--   • استعلام الحركات نفسه لم يتغير؛ أضيف شرط WHERE فقط.
--
--   ⚠️ هذه الهجرة مطلوبة لعمل البحث. قبل تطبيقها يبقى السجل والرصيد يعملان،
--      ويظهر خطأ واضح عند البحث فقط.
--
-- التراجع: إرجاع الكود يكفي؛ الاستدعاء القديم (p_branch, p_limit) يعمل على الدالة
-- الجديدة كما هو، ولا حاجة لتغيير قاعدة البيانات.
-- ============================================================================

BEGIN;

-- الحروف مكتوبة بأكوادها حتى لا يفسدها ترميز الأداة التي تُطبَّق منها الهجرة.
CREATE OR REPLACE FUNCTION private.cash_box_search_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(COALESCE(p_value, '')),
      -- من: أ إ آ ة ى
      E'أإآةى'
        -- الأرقام العربية ثم الفارسية
        || E'٠١٢٣٤٥٦٧٨٩'
        || E'۰۱۲۳۴۵۶۷۸۹'
        -- بلا مقابل فتُحذف: التشكيل والكشيدة
        || E'ًٌٍَُِّْـ',
      -- إلى: ا ا ا ه ي
      E'اااهي' || '0123456789' || '0123456789'
    ),
    '\s+', ' ', 'g'
  ));
$$;

REVOKE ALL ON FUNCTION private.cash_box_search_text(TEXT) FROM PUBLIC, anon, authenticated;

-- إضافة مُعامل تغيّر توقيع الدالة، فلا بد من حذف القديمة حتى لا تتعارض النسختان.
DROP FUNCTION IF EXISTS public.get_cash_box_transactions(TEXT, INTEGER);

CREATE FUNCTION public.get_cash_box_transactions(
  p_branch TEXT,
  p_limit INTEGER DEFAULT 100,
  p_search TEXT DEFAULT NULL
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
DECLARE
  v_terms TEXT[];
BEGIN
  IF p_branch NOT IN ('tailoring', 'fabrics', 'ready_designs') THEN
    RAISE EXCEPTION 'فرع الصندوق غير صالح';
  END IF;

  IF NOT private.cash_box_user_is_authorized(FALSE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لعرض سجل الصندوق' USING ERRCODE = '42501';
  END IF;

  -- بحث فارغ أو NULL يعطي مصفوفة فارغة، فتمر كل الحركات كما كانت.
  v_terms := string_to_array(private.cash_box_search_text(LEFT(p_search, 100)), ' ');

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
  WHERE NOT EXISTS (
    SELECT 1
    FROM unnest(v_terms) AS s(term)
    WHERE strpos(
      private.cash_box_search_text(
        concat_ws(' ', m.title, m.description, m.actor_name, ABS(m.amount)::TEXT)
      ),
      s.term
    ) = 0
  )
  ORDER BY m.occurred_at DESC, m.transaction_id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_box_transactions(TEXT, INTEGER, TEXT) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
