-- ============================================================================
-- Migration 89: أكواد خصم الهدية عند تسليم الطلب (Delivery Discount Coupons)
-- ----------------------------------------------------------------------------
-- الهدف:
--   كل عميلة يُسلَّم طلبها وتُرسَل لها رسالة واتساب التسليم تحصل على كود خصم
--   هدية بنسبة 20% صالح لمدة شهر، يُستخدَم مرة واحدة في محل ياسمين الشام
--   للأقمشة عند تسجيل مبيعة جديدة في قسم الأقمشة.
--
-- التدفّق:
--   1) صفحة التسليم/مركز الإشعارات تستدعي issue_delivery_discount_coupon
--      قبل فتح واتساب. الدالة idempotent: طالما للطلب كود ساري غير مستخدَم
--      تُعيده كما هو، فلا تتولّد أكواد جديدة عند إعادة إرسال الرسالة.
--   2) صفحة «إضافة مبيعة جديدة» في الأقمشة تتحقق عبر validate_discount_coupon
--      (صالح / غير موجود / منتهي / مستخدَم سابقاً).
--   3) عند الحفظ تُحجَز الكوبونة ذرياً عبر redeem_discount_coupon باسم معرّف
--      المبيعة، ثم يُنشأ سجل income. الحجز قبل الإنشاء يمنع استخدام الكود مرتين.
--   4) حذف المبيعة أو نزع الكود منها يحرّر الكوبونة تلقائياً عبر trigger.
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- جدول الكوبونات
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 20
    CHECK (discount_percent > 0 AND discount_percent <= 100),
  source TEXT NOT NULL DEFAULT 'order_delivery',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  client_name TEXT,
  client_phone TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_income_id UUID,
  redeemed_subtotal NUMERIC(12, 2),
  redeemed_discount NUMERIC(12, 2),
  redeemed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at)
);

COMMENT ON TABLE public.discount_coupons IS
  'أكواد خصم الهدية المُولَّدة تلقائياً لكل عميلة سُلِّم طلبها؛ تُستخدَم مرة واحدة في قسم الأقمشة';
COMMENT ON COLUMN public.discount_coupons.code IS
  'الكود الظاهر للعميلة بصيغة YS-XXXXXX (أحرف كبيرة، بلا حروف/أرقام ملتبسة)';
COMMENT ON COLUMN public.discount_coupons.discount_percent IS
  'نسبة الخصم المئوية المثبَّتة لحظة التوليد (20 افتراضياً) — لا تتأثر بتغيير الإعدادات لاحقاً';
COMMENT ON COLUMN public.discount_coupons.order_id IS
  'الطلب الذي وُلِّد عنه الكود؛ يبقى الكود صالحاً حتى لو حُذف الطلب لاحقاً';
COMMENT ON COLUMN public.discount_coupons.redeemed_income_id IS
  'معرّف مبيعة الأقمشة التي استُخدم فيها الكود؛ NULL = لم يُستخدم بعد';

CREATE INDEX IF NOT EXISTS idx_discount_coupons_order
  ON public.discount_coupons (order_id, issued_at DESC)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discount_coupons_redeemed_income
  ON public.discount_coupons (redeemed_income_id)
  WHERE redeemed_income_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discount_coupons_client_phone
  ON public.discount_coupons (client_phone)
  WHERE client_phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- أعمدة الخصم على مبيعات الأقمشة
-- ---------------------------------------------------------------------------
-- amount يبقى دائماً «المبلغ المدفوع فعلياً بعد الخصم» حتى لا تتأثر الصندوق
-- ولا فاتورة الأستاذ ولا الإحصائيات بأي منطق إضافي. القيم التالية للعرض والتدقيق.

ALTER TABLE public.income
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.discount_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2);

COMMENT ON COLUMN public.income.coupon_code IS
  'كود الخصم المطبَّق على المبيعة (نسخة نصّية تبقى حتى لو حُذفت الكوبونة)';
COMMENT ON COLUMN public.income.discount_amount IS
  'قيمة الخصم بالريال المخصومة من الإجمالي قبل الخصم';
COMMENT ON COLUMN public.income.subtotal_amount IS
  'الإجمالي قبل الخصم؛ amount = subtotal_amount - discount_amount';

CREATE INDEX IF NOT EXISTS idx_income_coupon
  ON public.income (coupon_id)
  WHERE coupon_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: القراءة للمخوّلين فقط، وكل التعديلات تمرّ عبر الدوال الذرية
-- ---------------------------------------------------------------------------

ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.discount_coupon_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.id = (SELECT auth.uid())
      AND u.is_active = TRUE
  );
$$;

COMMENT ON FUNCTION private.discount_coupon_user_is_active() IS
  'أي مستخدم نشط في النظام يستطيع توليد كود التسليم أو التحقق منه أو استخدامه';

REVOKE ALL ON FUNCTION private.discount_coupon_user_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.discount_coupon_user_is_active() FROM anon;
REVOKE ALL ON FUNCTION private.discount_coupon_user_is_active() FROM authenticated;

DROP POLICY IF EXISTS discount_coupons_select_authorized ON public.discount_coupons;
CREATE POLICY discount_coupons_select_authorized
  ON public.discount_coupons
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
              'workshop_manager',
              'fabric_store_manager'
            )
          )
        )
    )
  );

REVOKE ALL ON TABLE public.discount_coupons FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.discount_coupons FROM authenticated;
GRANT SELECT ON TABLE public.discount_coupons TO authenticated;
GRANT ALL ON TABLE public.discount_coupons TO service_role;

-- ---------------------------------------------------------------------------
-- توليد كود فريد بأبجدية خالية من الأحرف الملتبسة (0/O و 1/I)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.generate_discount_coupon_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_attempt INTEGER := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;

    SELECT 'YS-' || string_agg(
             substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::INTEGER, 1),
             ''
           )
      INTO v_code
      FROM generate_series(1, 6);

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.discount_coupons AS c WHERE c.code = v_code
    );

    IF v_attempt >= 50 THEN
      RAISE EXCEPTION 'تعذّر توليد كود خصم فريد';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION private.generate_discount_coupon_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.generate_discount_coupon_code() FROM anon;
REVOKE ALL ON FUNCTION private.generate_discount_coupon_code() FROM authenticated;

-- ---------------------------------------------------------------------------
-- RPC: توليد/استرجاع كود هدية التسليم لطلب معيّن
-- ---------------------------------------------------------------------------
-- idempotent: إعادة إرسال رسالة التسليم لا تولّد كوداً ثانياً ما دام الأول
-- سارياً وغير مستخدَم. الكود المنتهي أو المستخدَم يفتح المجال لكود جديد.

CREATE OR REPLACE FUNCTION public.issue_delivery_discount_coupon(
  p_order_id UUID,
  p_client_name TEXT DEFAULT NULL,
  p_client_phone TEXT DEFAULT NULL,
  p_valid_days INTEGER DEFAULT 30,
  p_discount_percent NUMERIC DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  discount_percent NUMERIC,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_new BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.discount_coupons%ROWTYPE;
  v_created public.discount_coupons%ROWTYPE;
  v_days INTEGER := GREATEST(1, COALESCE(p_valid_days, 30));
  v_percent NUMERIC(5, 2) := COALESCE(p_discount_percent, 20);
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لتوليد كود خصم' USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب لتوليد كود الهدية';
  END IF;

  IF v_percent <= 0 OR v_percent > 100 THEN
    RAISE EXCEPTION 'نسبة الخصم غير صالحة';
  END IF;

  -- قفل على مستوى الطلب: ضغطتان متتاليتان على زر الواتساب لا تولّدان كودين.
  PERFORM pg_advisory_xact_lock(hashtext('discount_coupon:' || p_order_id::TEXT));

  SELECT c.* INTO v_existing
  FROM public.discount_coupons AS c
  WHERE c.order_id = p_order_id
    AND c.redeemed_at IS NULL
    AND c.expires_at > now()
  ORDER BY c.issued_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.code,
      v_existing.discount_percent,
      v_existing.issued_at,
      v_existing.expires_at,
      FALSE;
    RETURN;
  END IF;

  INSERT INTO public.discount_coupons (
    code,
    discount_percent,
    source,
    order_id,
    client_name,
    client_phone,
    expires_at
  )
  VALUES (
    private.generate_discount_coupon_code(),
    v_percent,
    'order_delivery',
    p_order_id,
    NULLIF(BTRIM(COALESCE(p_client_name, '')), ''),
    NULLIF(BTRIM(COALESCE(p_client_phone, '')), ''),
    now() + make_interval(days => v_days)
  )
  RETURNING * INTO v_created;

  RETURN QUERY
  SELECT
    v_created.id,
    v_created.code,
    v_created.discount_percent,
    v_created.issued_at,
    v_created.expires_at,
    TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_delivery_discount_coupon(UUID, TEXT, TEXT, INTEGER, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_delivery_discount_coupon(UUID, TEXT, TEXT, INTEGER, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_delivery_discount_coupon(UUID, TEXT, TEXT, INTEGER, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_delivery_discount_coupon(UUID, TEXT, TEXT, INTEGER, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: التحقق من كود الخصم قبل تطبيقه
-- ---------------------------------------------------------------------------
-- تُعيد دائماً سطراً واحداً يشرح الحالة، ولا ترفع استثناءً للكود الخاطئ
-- كي تعرض الواجهة رسالة مفهومة بدل خطأ تقني.

CREATE OR REPLACE FUNCTION public.validate_discount_coupon(
  p_code TEXT
)
RETURNS TABLE (
  status TEXT,
  id UUID,
  code TEXT,
  discount_percent NUMERIC,
  client_name TEXT,
  client_phone TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coupon public.discount_coupons%ROWTYPE;
  v_normalized TEXT := UPPER(BTRIM(COALESCE(p_code, '')));
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية للتحقق من أكواد الخصم' USING ERRCODE = '42501';
  END IF;

  IF v_normalized = '' THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::NUMERIC,
                        NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT c.* INTO v_coupon
  FROM public.discount_coupons AS c
  WHERE c.code = v_normalized;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::NUMERIC,
                        NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN v_coupon.redeemed_at IS NOT NULL THEN 'redeemed'
      WHEN v_coupon.expires_at <= now() THEN 'expired'
      ELSE 'valid'
    END::TEXT,
    v_coupon.id,
    v_coupon.code,
    v_coupon.discount_percent,
    v_coupon.client_name,
    v_coupon.client_phone,
    v_coupon.issued_at,
    v_coupon.expires_at,
    v_coupon.redeemed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_discount_coupon(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_discount_coupon(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_discount_coupon(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_discount_coupon(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: حجز الكود لمبيعة معيّنة (ذرّي، مرة واحدة)
-- ---------------------------------------------------------------------------
-- يُستدعى قبل إنشاء سجل income بمعرّفه الثابت. إعادة الاستدعاء بالمعرّف نفسه
-- (إعادة محاولة بعد انقطاع شبكة، أو تعديل مبلغ المبيعة) تُحدّث القيم فقط.

CREATE OR REPLACE FUNCTION public.redeem_discount_coupon(
  p_code TEXT,
  p_income_id UUID,
  p_subtotal NUMERIC,
  p_discount NUMERIC
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  discount_percent NUMERIC,
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coupon public.discount_coupons%ROWTYPE;
  v_normalized TEXT := UPPER(BTRIM(COALESCE(p_code, '')));
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لاستخدام أكواد الخصم' USING ERRCODE = '42501';
  END IF;

  IF p_income_id IS NULL THEN
    RAISE EXCEPTION 'معرّف المبيعة مطلوب لاستخدام كود الخصم';
  END IF;

  IF COALESCE(p_subtotal, 0) <= 0 OR COALESCE(p_discount, 0) < 0 THEN
    RAISE EXCEPTION 'قيم الخصم غير صالحة';
  END IF;

  IF COALESCE(p_discount, 0) > COALESCE(p_subtotal, 0) THEN
    RAISE EXCEPTION 'قيمة الخصم أكبر من إجمالي المبيعة';
  END IF;

  -- القفل يمنع استخدام الكود نفسه من جهازين في اللحظة ذاتها.
  SELECT c.* INTO v_coupon
  FROM public.discount_coupons AS c
  WHERE c.code = v_normalized
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'كود الخصم غير صحيح' USING ERRCODE = 'P0001';
  END IF;

  IF v_coupon.redeemed_at IS NOT NULL
     AND v_coupon.redeemed_income_id IS DISTINCT FROM p_income_id THEN
    RAISE EXCEPTION 'كود الخصم مستخدَم مسبقاً' USING ERRCODE = 'P0001';
  END IF;

  IF v_coupon.expires_at <= now()
     AND v_coupon.redeemed_income_id IS DISTINCT FROM p_income_id THEN
    RAISE EXCEPTION 'انتهت صلاحية كود الخصم' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.discount_coupons AS c
  SET redeemed_at = COALESCE(c.redeemed_at, now()),
      redeemed_income_id = p_income_id,
      redeemed_subtotal = ROUND(p_subtotal, 2),
      redeemed_discount = ROUND(p_discount, 2),
      redeemed_by = (SELECT auth.uid())
  WHERE c.id = v_coupon.id
  RETURNING * INTO v_coupon;

  RETURN QUERY
  SELECT
    v_coupon.id,
    v_coupon.code,
    v_coupon.discount_percent,
    v_coupon.expires_at,
    v_coupon.redeemed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_discount_coupon(TEXT, UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_discount_coupon(TEXT, UUID, NUMERIC, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_discount_coupon(TEXT, UUID, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_discount_coupon(TEXT, UUID, NUMERIC, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: تحرير الكود المحجوز لمبيعة لم تكتمل
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_discount_coupon(
  p_income_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released INTEGER := 0;
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لتحرير أكواد الخصم' USING ERRCODE = '42501';
  END IF;

  IF p_income_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.discount_coupons AS c
  SET redeemed_at = NULL,
      redeemed_income_id = NULL,
      redeemed_subtotal = NULL,
      redeemed_discount = NULL,
      redeemed_by = NULL
  WHERE c.redeemed_income_id = p_income_id;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_discount_coupon(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_discount_coupon(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_discount_coupon(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_discount_coupon(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- شبكة أمان: حذف المبيعة أو نزع الكود منها يعيد الكوبونة قابلة للاستخدام
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sync_discount_coupon_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.discount_coupons AS c
    SET redeemed_at = NULL,
        redeemed_income_id = NULL,
        redeemed_subtotal = NULL,
        redeemed_discount = NULL,
        redeemed_by = NULL
    WHERE c.redeemed_income_id = OLD.id;

    RETURN OLD;
  END IF;

  -- تغيير الكود المطبَّق على المبيعة (أو نزعه) يحرّر الكود القديم وحده.
  IF OLD.coupon_id IS NOT NULL AND NEW.coupon_id IS DISTINCT FROM OLD.coupon_id THEN
    UPDATE public.discount_coupons AS c
    SET redeemed_at = NULL,
        redeemed_income_id = NULL,
        redeemed_subtotal = NULL,
        redeemed_discount = NULL,
        redeemed_by = NULL
    WHERE c.id = OLD.coupon_id
      AND c.redeemed_income_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_discount_coupon_redemption() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_discount_coupon_redemption() FROM anon;
REVOKE ALL ON FUNCTION private.sync_discount_coupon_redemption() FROM authenticated;

DROP TRIGGER IF EXISTS sync_discount_coupon_redemption ON public.income;
CREATE TRIGGER sync_discount_coupon_redemption
AFTER UPDATE OR DELETE ON public.income
FOR EACH ROW
EXECUTE FUNCTION private.sync_discount_coupon_redemption();

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
