-- ============================================================================
-- أكواد المشاهير + بوابة «شركاء النجاح»
-- ============================================================================
-- الهدف:
--   • المدير يضيف مشهوراً (اسم، هاتف، اسم مستخدم، كلمة مرور) وكوداً أو أكثر
--     لكل مشهور: نسبة خصم للعميلة، نسبة عمولة للمشهور، فترة صلاحية.
--   • الكود يُطبَّق في «مبيعات الأقمشة» في نفس خانة كوبون التسليم الحالي.
--     غير محدود الاستخدام، لكن مرة واحدة لكل رقم هاتف عميلة (الهاتف إجباري).
--   • عمولة المشهور = نسبته × المبلغ بعد الخصم (income.amount)، محسوبة حيّة من
--     المبيعة فتتبع أي تعديل أو حذف لها تلقائياً.
--   • المدير يسجّل دفعات للمشهور؛ المستحق = العمولات − المدفوع. لا يمس الصندوق.
--   • المشهور يدخل صفحة /partners باسم مستخدم وكلمة مرور خاصين (ليسا حساب
--     Supabase Auth) فلا يملك أي صلاحية على بقية النظام. الجلسة رمز عشوائي
--     يُخزَّن مجزَّأً (sha256) وتُتحقق منه API على الخادم بمفتاح service_role.
--
-- لا تغيير على دوال كوبون التسليم (هجرة 89) ولا على أعمدة income:
--   المبيعة بكود مشهور تحفظ coupon_code/discount_* كالمعتاد مع coupon_id = NULL،
--   والربط بالمشهور في جدول influencer_code_redemptions (income_id فريد).
--
--   ⚠️ هذه الهجرة مطلوبة مع النشر (deploy).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- --------------------------------------------------------------------------
-- الجداول
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.influencer_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  phone TEXT,
  social_handle TEXT,
  notes TEXT,
  username TEXT NOT NULL CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_influencer_partners_username
  ON public.influencer_partners (username);

COMMENT ON TABLE public.influencer_partners IS
  'المشاهير (شركاء النجاح) أصحاب أكواد الخصم في قسم الأقمشة';

-- كلمة المرور في جدول منفصل لا يُقرأ إلا من داخل الدوال
CREATE TABLE IF NOT EXISTS private.influencer_partner_credentials (
  partner_id UUID PRIMARY KEY REFERENCES public.influencer_partners(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.influencer_partner_sessions (
  token_hash BYTEA PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.influencer_partners(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_influencer_partner_sessions_partner
  ON private.influencer_partner_sessions (partner_id);

CREATE TABLE IF NOT EXISTS public.influencer_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.influencer_partners(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,30}$' AND code NOT LIKE 'YS-%'),
  discount_percent NUMERIC(5, 2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  commission_percent NUMERIC(5, 2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_influencer_codes_code ON public.influencer_codes (code);
CREATE INDEX IF NOT EXISTS idx_influencer_codes_partner ON public.influencer_codes (partner_id);

COMMENT ON COLUMN public.influencer_codes.code IS
  'الكود كما يكتبه العميل (أحرف لاتينية كبيرة وأرقام)؛ البادئة YS- محجوزة لكوبونات التسليم';
COMMENT ON COLUMN public.influencer_codes.valid_until IS
  'آخر يوم صلاحية (شامل) بتوقيت الرياض';

-- كل استخدام = مبيعة أقمشة واحدة. العمولة لا تُخزَّن: تُحسب من income.amount
CREATE TABLE IF NOT EXISTS public.influencer_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES public.influencer_codes(id) ON DELETE RESTRICT,
  partner_id UUID NOT NULL REFERENCES public.influencer_partners(id) ON DELETE RESTRICT,
  income_id UUID NOT NULL,
  code TEXT NOT NULL,
  client_phone_key TEXT NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL,
  commission_percent NUMERIC(5, 2) NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_by UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_influencer_code_redemptions_income
  ON public.influencer_code_redemptions (income_id);
CREATE INDEX IF NOT EXISTS idx_influencer_code_redemptions_code_phone
  ON public.influencer_code_redemptions (code_id, client_phone_key);
CREATE INDEX IF NOT EXISTS idx_influencer_code_redemptions_partner
  ON public.influencer_code_redemptions (partner_id);

COMMENT ON COLUMN public.influencer_code_redemptions.client_phone_key IS
  'آخر 9 أرقام من هاتف العميلة (يوحّد 05xxxxxxxx و 9665xxxxxxxx) لمنع تكرار الاستخدام';
COMMENT ON COLUMN public.influencer_code_redemptions.commission_percent IS
  'نسبة العمولة المثبَّتة لحظة الاستخدام — تغيير نسبة الكود لاحقاً لا يغيّر العمليات السابقة';

CREATE TABLE IF NOT EXISTS public.influencer_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.influencer_partners(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_influencer_payouts_partner
  ON public.influencer_payouts (partner_id, paid_on DESC);

-- --------------------------------------------------------------------------
-- الصلاحيات: لا وصول مباشر للجداول؛ كل شيء عبر الدوال
-- --------------------------------------------------------------------------

ALTER TABLE public.influencer_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.influencer_partner_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.influencer_partner_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.influencer_partners FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.influencer_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.influencer_code_redemptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.influencer_payouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.influencer_partner_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.influencer_partner_sessions FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.influencer_partners TO service_role;
GRANT ALL ON TABLE public.influencer_codes TO service_role;
GRANT ALL ON TABLE public.influencer_code_redemptions TO service_role;
GRANT ALL ON TABLE public.influencer_payouts TO service_role;

-- --------------------------------------------------------------------------
-- دوال مساعدة
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.influencer_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin' AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION private.influencer_phone_key(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 9), '');
$$;

CREATE OR REPLACE FUNCTION private.influencer_riyadh_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Riyadh')::DATE;
$$;

-- الاستخدامات المحتسبة: التي لها مبيعة أقمشة موجودة فعلاً.
-- الحجز الذي فشلت مبيعته ولم يُحرَّر يُهمَل تلقائياً.
CREATE OR REPLACE FUNCTION private.influencer_effective_redemptions()
RETURNS TABLE (
  redemption_id UUID,
  code_id UUID,
  partner_id UUID,
  code TEXT,
  income_id UUID,
  sale_date DATE,
  redeemed_at TIMESTAMPTZ,
  sale_amount NUMERIC,
  subtotal_amount NUMERIC,
  discount_amount NUMERIC,
  discount_percent NUMERIC,
  commission_percent NUMERIC,
  commission_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    r.id, r.code_id, r.partner_id, r.code, r.income_id, i.date, r.redeemed_at,
    ROUND(i.amount, 2),
    ROUND(COALESCE(i.subtotal_amount, i.amount + COALESCE(i.discount_amount, 0)), 2),
    ROUND(COALESCE(i.discount_amount, 0), 2),
    r.discount_percent,
    r.commission_percent,
    ROUND(i.amount * r.commission_percent / 100, 2)
  FROM public.influencer_code_redemptions AS r
  JOIN public.income AS i ON i.id = r.income_id AND i.branch = 'fabrics';
$$;

REVOKE ALL ON FUNCTION private.influencer_user_is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.influencer_phone_key(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.influencer_riyadh_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.influencer_effective_redemptions() FROM PUBLIC, anon, authenticated;

-- ملخص مالي لمشهور واحد (يُستخدم في لوحة المدير وبوابة المشهور)
CREATE OR REPLACE FUNCTION private.influencer_partner_totals(p_partner_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH r AS (
    SELECT * FROM private.influencer_effective_redemptions() WHERE partner_id = p_partner_id
  ), p AS (
    SELECT COALESCE(SUM(amount), 0) AS paid FROM public.influencer_payouts WHERE partner_id = p_partner_id
  )
  SELECT jsonb_build_object(
    'uses_count', (SELECT COUNT(*) FROM r),
    'sales_total', (SELECT COALESCE(SUM(sale_amount), 0) FROM r),
    'discount_total', (SELECT COALESCE(SUM(discount_amount), 0) FROM r),
    'commission_total', (SELECT COALESCE(SUM(commission_amount), 0) FROM r),
    'paid_total', (SELECT paid FROM p),
    'balance_due', (SELECT COALESCE(SUM(commission_amount), 0) FROM r) - (SELECT paid FROM p),
    'last_use_at', (SELECT MAX(redeemed_at) FROM r)
  );
$$;

REVOKE ALL ON FUNCTION private.influencer_partner_totals(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.influencer_code_rows(p_partner_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'code', c.code,
      'discount_percent', c.discount_percent,
      'commission_percent', c.commission_percent,
      'valid_from', c.valid_from,
      'valid_until', c.valid_until,
      'is_active', c.is_active,
      'status', CASE
        WHEN NOT c.is_active THEN 'inactive'
        WHEN private.influencer_riyadh_today() < c.valid_from THEN 'scheduled'
        WHEN private.influencer_riyadh_today() > c.valid_until THEN 'expired'
        ELSE 'active'
      END,
      'uses_count', COALESCE(s.uses_count, 0),
      'sales_total', COALESCE(s.sales_total, 0),
      'commission_total', COALESCE(s.commission_total, 0)
    ) ORDER BY c.valid_until DESC, c.created_at DESC
  ), '[]'::JSONB)
  FROM public.influencer_codes AS c
  LEFT JOIN (
    SELECT code_id, COUNT(*) AS uses_count, SUM(sale_amount) AS sales_total,
           SUM(commission_amount) AS commission_total
    FROM private.influencer_effective_redemptions()
    GROUP BY code_id
  ) AS s ON s.code_id = c.id
  WHERE c.partner_id = p_partner_id;
$$;

REVOKE ALL ON FUNCTION private.influencer_code_rows(UUID) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- لوحة المدير: القراءة
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_influencer_partners_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.influencer_user_is_admin() THEN
    RAISE EXCEPTION 'هذا القسم للمدير فقط' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'phone', p.phone,
        'social_handle', p.social_handle,
        'notes', p.notes,
        'username', p.username,
        'is_active', p.is_active,
        'created_at', p.created_at,
        'last_login_at', cr.last_login_at,
        'codes', private.influencer_code_rows(p.id),
        'totals', private.influencer_partner_totals(p.id)
      ) ORDER BY p.is_active DESC, p.created_at DESC
    )
    FROM public.influencer_partners AS p
    LEFT JOIN private.influencer_partner_credentials AS cr ON cr.partner_id = p.id
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.get_influencer_partners_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_influencer_partners_overview() TO authenticated;

-- تفاصيل مشهور للمدير: العمليات (مع اسم وهاتف العميلة) والدفعات
CREATE OR REPLACE FUNCTION public.get_influencer_partner_activity(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.influencer_user_is_admin() THEN
    RAISE EXCEPTION 'هذا القسم للمدير فقط' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'sales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'income_id', r.income_id,
        'code', r.code,
        'sale_date', r.sale_date,
        'redeemed_at', r.redeemed_at,
        'sale_amount', r.sale_amount,
        'subtotal_amount', r.subtotal_amount,
        'discount_amount', r.discount_amount,
        'commission_percent', r.commission_percent,
        'commission_amount', r.commission_amount,
        'buyer_name', i.buyer_name,
        'buyer_phone', i.buyer_phone
      ) ORDER BY r.redeemed_at DESC)
      FROM private.influencer_effective_redemptions() AS r
      JOIN public.income AS i ON i.id = r.income_id
      WHERE r.partner_id = p_partner_id
    ), '[]'::JSONB),
    'payouts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', po.id, 'amount', po.amount, 'paid_on', po.paid_on, 'note', po.note,
        'created_at', po.created_at
      ) ORDER BY po.paid_on DESC, po.created_at DESC)
      FROM public.influencer_payouts AS po
      WHERE po.partner_id = p_partner_id
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_influencer_partner_activity(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_influencer_partner_activity(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- لوحة المدير: الكتابة
-- --------------------------------------------------------------------------

-- إضافة/تعديل مشهور. كلمة المرور: إجبارية عند الإضافة، واختيارية عند التعديل
-- (NULL = بلا تغيير). تغييرها أو إيقاف المشهور ينهي كل جلساته.
CREATE OR REPLACE FUNCTION public.save_influencer_partner(
  p_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_social_handle TEXT,
  p_notes TEXT,
  p_username TEXT,
  p_password TEXT,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID := p_id;
  v_username TEXT := lower(btrim(COALESCE(p_username, '')));
  v_password TEXT := NULLIF(p_password, '');
BEGIN
  IF NOT private.influencer_user_is_admin() THEN
    RAISE EXCEPTION 'هذا القسم للمدير فقط' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'اسم المشهور مطلوب' USING ERRCODE = '22023';
  END IF;
  IF v_username !~ '^[a-z0-9._-]{3,40}$' THEN
    RAISE EXCEPTION 'اسم المستخدم: 3 إلى 40 حرفاً لاتينياً أو أرقاماً أو . _ - فقط' USING ERRCODE = '22023';
  END IF;
  IF v_password IS NOT NULL AND length(v_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.influencer_partners
    WHERE username = v_username AND id IS DISTINCT FROM p_id
  ) THEN
    RAISE EXCEPTION 'اسم المستخدم مستخدَم لمشهور آخر' USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    IF v_password IS NULL THEN
      RAISE EXCEPTION 'كلمة المرور مطلوبة عند إضافة مشهور جديد' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.influencer_partners (
      full_name, phone, social_handle, notes, username, is_active, created_by
    ) VALUES (
      btrim(p_full_name), NULLIF(btrim(COALESCE(p_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_social_handle, '')), ''), NULLIF(btrim(COALESCE(p_notes, '')), ''),
      v_username, COALESCE(p_is_active, TRUE), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.influencer_partners
    SET full_name = btrim(p_full_name),
        phone = NULLIF(btrim(COALESCE(p_phone, '')), ''),
        social_handle = NULLIF(btrim(COALESCE(p_social_handle, '')), ''),
        notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
        username = v_username,
        is_active = COALESCE(p_is_active, TRUE),
        updated_at = now()
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'المشهور غير موجود' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_password IS NOT NULL THEN
    INSERT INTO private.influencer_partner_credentials (partner_id, password_hash)
    VALUES (v_id, extensions.crypt(v_password, extensions.gen_salt('bf', 10)))
    ON CONFLICT (partner_id) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = now();
  END IF;

  IF v_password IS NOT NULL OR NOT COALESCE(p_is_active, TRUE) THEN
    DELETE FROM private.influencer_partner_sessions WHERE partner_id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_influencer_partner(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_influencer_partner(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- إضافة/تعديل كود. نص الكود لا يتغيّر بعد أول استخدام (هو ما نشره المشهور).
CREATE OR REPLACE FUNCTION public.save_influencer_code(
  p_id UUID,
  p_partner_id UUID,
  p_code TEXT,
  p_discount_percent NUMERIC,
  p_commission_percent NUMERIC,
  p_valid_from DATE,
  p_valid_until DATE,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID := p_id;
  v_code TEXT := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v_existing public.influencer_codes%ROWTYPE;
BEGIN
  IF NOT private.influencer_user_is_admin() THEN
    RAISE EXCEPTION 'هذا القسم للمدير فقط' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[A-Z0-9_-]{3,30}$' THEN
    RAISE EXCEPTION 'الكود: 3 إلى 30 حرفاً لاتينياً أو أرقاماً (مثل NOOR15)' USING ERRCODE = '22023';
  END IF;
  IF v_code LIKE 'YS-%' THEN
    RAISE EXCEPTION 'البادئة YS- محجوزة لكوبونات التسليم' USING ERRCODE = '22023';
  END IF;
  IF p_discount_percent IS NULL OR p_discount_percent <= 0 OR p_discount_percent > 100 THEN
    RAISE EXCEPTION 'نسبة الخصم يجب أن تكون بين 1 و 100' USING ERRCODE = '22023';
  END IF;
  IF p_commission_percent IS NULL OR p_commission_percent < 0 OR p_commission_percent > 100 THEN
    RAISE EXCEPTION 'نسبة أرباح المشهور يجب أن تكون بين 0 و 100' USING ERRCODE = '22023';
  END IF;
  IF p_valid_from IS NULL OR p_valid_until IS NULL OR p_valid_until < p_valid_from THEN
    RAISE EXCEPTION 'تاريخ انتهاء الصلاحية يجب أن يكون بعد تاريخ البداية' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.influencer_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'المشهور غير موجود' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.discount_coupons WHERE code = v_code) THEN
    RAISE EXCEPTION 'هذا الكود مستخدَم ككوبون تسليم' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.influencer_codes WHERE code = v_code AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'هذا الكود موجود مسبقاً' USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.influencer_codes (
      partner_id, code, discount_percent, commission_percent, valid_from, valid_until, is_active, created_by
    ) VALUES (
      p_partner_id, v_code, ROUND(p_discount_percent, 2), ROUND(p_commission_percent, 2),
      p_valid_from, p_valid_until, COALESCE(p_is_active, TRUE), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing FROM public.influencer_codes WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'الكود غير موجود' USING ERRCODE = '22023';
    END IF;
    IF v_existing.partner_id <> p_partner_id THEN
      RAISE EXCEPTION 'لا يمكن نقل الكود إلى مشهور آخر' USING ERRCODE = '22023';
    END IF;
    IF v_existing.code <> v_code AND EXISTS (
      SELECT 1 FROM public.influencer_code_redemptions WHERE code_id = v_id
    ) THEN
      RAISE EXCEPTION 'لا يمكن تغيير نص كود استُخدم في مبيعات' USING ERRCODE = '22023';
    END IF;
    UPDATE public.influencer_codes
    SET code = v_code,
        discount_percent = ROUND(p_discount_percent, 2),
        commission_percent = ROUND(p_commission_percent, 2),
        valid_from = p_valid_from,
        valid_until = p_valid_until,
        is_active = COALESCE(p_is_active, TRUE),
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_influencer_code(UUID, UUID, TEXT, NUMERIC, NUMERIC, DATE, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_influencer_code(UUID, UUID, TEXT, NUMERIC, NUMERIC, DATE, DATE, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_influencer_payout(
  p_partner_id UUID,
  p_amount NUMERIC,
  p_paid_on DATE,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT private.influencer_user_is_admin() THEN
    RAISE EXCEPTION 'هذا القسم للمدير فقط' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount::TEXT = 'NaN' THEN
    RAISE EXCEPTION 'أدخل مبلغاً أكبر من صفر' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.influencer_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'المشهور غير موجود' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.influencer_payouts (partner_id, amount, paid_on, note, created_by)
  VALUES (
    p_partner_id, ROUND(p_amount, 2), COALESCE(p_paid_on, private.influencer_riyadh_today()),
    NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_influencer_payout(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_influencer_payout(UUID, NUMERIC, DATE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_influencer_payout(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.influencer_user_is_admin() THEN
    RAISE EXCEPTION 'هذا القسم للمدير فقط' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.influencer_payouts WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_influencer_payout(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_influencer_payout(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- مبيعات الأقمشة: التحقق والحجز والتحرير
-- --------------------------------------------------------------------------
-- نفس صلاحية كوبون التسليم (أي مستخدم نشط يسجّل مبيعات).

CREATE OR REPLACE FUNCTION public.validate_influencer_code(
  p_code TEXT,
  p_client_phone TEXT,
  p_income_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code public.influencer_codes%ROWTYPE;
  v_partner public.influencer_partners%ROWTYPE;
  v_phone_key TEXT := private.influencer_phone_key(p_client_phone);
  v_today DATE := private.influencer_riyadh_today();
  v_status TEXT := 'valid';
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية للتحقق من أكواد الخصم' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_code FROM public.influencer_codes
  WHERE code = upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT * INTO v_partner FROM public.influencer_partners WHERE id = v_code.partner_id;

  IF NOT v_code.is_active OR NOT v_partner.is_active THEN
    v_status := 'inactive';
  ELSIF v_today < v_code.valid_from THEN
    v_status := 'not_started';
  ELSIF v_today > v_code.valid_until THEN
    v_status := 'expired';
  ELSIF v_phone_key IS NULL OR length(v_phone_key) < 9 THEN
    v_status := 'phone_required';
  ELSIF EXISTS (
    SELECT 1
    FROM public.influencer_code_redemptions AS r
    WHERE r.code_id = v_code.id
      AND r.client_phone_key = v_phone_key
      AND r.income_id IS DISTINCT FROM p_income_id
      AND (EXISTS (SELECT 1 FROM public.income AS i WHERE i.id = r.income_id)
           OR r.redeemed_at > now() - INTERVAL '15 minutes')
  ) THEN
    v_status := 'used_by_phone';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'id', v_code.id,
    'code', v_code.code,
    'discount_percent', v_code.discount_percent,
    'partner_name', v_partner.full_name,
    'valid_until', v_code.valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_influencer_code(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_influencer_code(TEXT, TEXT, UUID) TO authenticated;

-- يُستدعى قبل إنشاء/تعديل المبيعة بمعرّفها الثابت؛ إعادة الاستدعاء آمنة.
-- مبيعة محفوظة سابقاً بنفس الكود تبقى مقبولة عند التعديل ولو انتهت صلاحيته.
CREATE OR REPLACE FUNCTION public.redeem_influencer_code(
  p_code TEXT,
  p_income_id UUID,
  p_client_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code public.influencer_codes%ROWTYPE;
  v_partner public.influencer_partners%ROWTYPE;
  v_prior public.influencer_code_redemptions%ROWTYPE;
  v_phone_key TEXT := private.influencer_phone_key(p_client_phone);
  v_today DATE := private.influencer_riyadh_today();
  v_same_code BOOLEAN := FALSE;
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لاستخدام أكواد الخصم' USING ERRCODE = '42501';
  END IF;
  IF p_income_id IS NULL THEN
    RAISE EXCEPTION 'معرّف المبيعة مطلوب لاستخدام كود الخصم';
  END IF;
  IF v_phone_key IS NULL OR length(v_phone_key) < 9 THEN
    RAISE EXCEPTION 'أدخل رقم هاتف العميلة لاستخدام كود المشهور' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_code FROM public.influencer_codes
  WHERE code = upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'كود الخصم غير صحيح' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_partner FROM public.influencer_partners WHERE id = v_code.partner_id;

  SELECT * INTO v_prior FROM public.influencer_code_redemptions WHERE income_id = p_income_id;
  v_same_code := FOUND AND v_prior.code_id = v_code.id;

  IF NOT v_same_code THEN
    IF NOT v_code.is_active OR NOT v_partner.is_active THEN
      RAISE EXCEPTION 'كود الخصم موقوف' USING ERRCODE = 'P0001';
    END IF;
    IF v_today < v_code.valid_from THEN
      RAISE EXCEPTION 'كود الخصم لم يبدأ بعد' USING ERRCODE = 'P0001';
    END IF;
    IF v_today > v_code.valid_until THEN
      RAISE EXCEPTION 'انتهت صلاحية كود الخصم' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- القفل (الكود FOR UPDATE أعلاه) يمنع جهازين من استخدام الكود لنفس الرقم معاً
  IF EXISTS (
    SELECT 1
    FROM public.influencer_code_redemptions AS r
    WHERE r.code_id = v_code.id
      AND r.client_phone_key = v_phone_key
      AND r.income_id <> p_income_id
      AND (EXISTS (SELECT 1 FROM public.income AS i WHERE i.id = r.income_id)
           OR r.redeemed_at > now() - INTERVAL '15 minutes')
  ) THEN
    RAISE EXCEPTION 'هذه العميلة استخدمت كود % مسبقاً', v_code.code USING ERRCODE = 'P0001';
  END IF;

  IF v_same_code THEN
    UPDATE public.influencer_code_redemptions
    SET client_phone_key = v_phone_key
    WHERE id = v_prior.id;
  ELSE
    DELETE FROM public.influencer_code_redemptions WHERE income_id = p_income_id;
    INSERT INTO public.influencer_code_redemptions (
      code_id, partner_id, income_id, code, client_phone_key,
      discount_percent, commission_percent, redeemed_by
    ) VALUES (
      v_code.id, v_code.partner_id, p_income_id, v_code.code, v_phone_key,
      v_code.discount_percent, v_code.commission_percent, auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_code.id,
    'code', v_code.code,
    'discount_percent', CASE WHEN v_same_code THEN v_prior.discount_percent ELSE v_code.discount_percent END,
    'partner_name', v_partner.full_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_influencer_code(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_influencer_code(TEXT, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_influencer_code(p_income_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF NOT private.discount_coupon_user_is_active() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لتحرير أكواد الخصم' USING ERRCODE = '42501';
  END IF;
  IF p_income_id IS NULL THEN
    RETURN 0;
  END IF;
  -- لا يُحرَّر كود مبيعة محفوظة فعلاً (الحذف والتعديل يمرّان عبر الـ trigger)
  DELETE FROM public.influencer_code_redemptions AS r
  WHERE r.income_id = p_income_id
    AND NOT EXISTS (SELECT 1 FROM public.income AS i WHERE i.id = p_income_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_influencer_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_influencer_code(UUID) TO authenticated;

-- حذف المبيعة أو تغيير/نزع الكود منها يلغي الاستخدام (والعمولة معه)
CREATE OR REPLACE FUNCTION private.sync_influencer_code_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.influencer_code_redemptions WHERE income_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.coupon_code IS DISTINCT FROM OLD.coupon_code THEN
    DELETE FROM public.influencer_code_redemptions
    WHERE income_id = NEW.id
      AND code IS DISTINCT FROM upper(btrim(COALESCE(NEW.coupon_code, '')));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_influencer_code_redemption() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_influencer_code_redemption ON public.income;
CREATE TRIGGER sync_influencer_code_redemption
AFTER UPDATE OR DELETE ON public.income
FOR EACH ROW
EXECUTE FUNCTION private.sync_influencer_code_redemption();

-- --------------------------------------------------------------------------
-- بوابة «شركاء النجاح» — تُستدعى من API الخادم فقط (service_role)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.partner_portal_login(
  p_username TEXT,
  p_password TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partner public.influencer_partners%ROWTYPE;
  v_cred private.influencer_partner_credentials%ROWTYPE;
  v_token TEXT;
  v_expires TIMESTAMPTZ := now() + INTERVAL '30 days';
BEGIN
  SELECT * INTO v_partner FROM public.influencer_partners
  WHERE username = lower(btrim(COALESCE(p_username, '')));
  IF NOT FOUND THEN
    -- نفس كلفة التحقق كي لا يُعرف وجود اسم المستخدم من زمن الرد
    PERFORM extensions.crypt(COALESCE(p_password, ''), extensions.gen_salt('bf', 10));
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_cred FROM private.influencer_partner_credentials
  WHERE partner_id = v_partner.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > now() THEN
    RETURN jsonb_build_object('status', 'locked', 'locked_until', v_cred.locked_until);
  END IF;

  IF v_cred.password_hash <> extensions.crypt(COALESCE(p_password, ''), v_cred.password_hash) THEN
    UPDATE private.influencer_partner_credentials
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + INTERVAL '15 minutes' END
    WHERE partner_id = v_partner.id;
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF NOT v_partner.is_active THEN
    RETURN jsonb_build_object('status', 'inactive');
  END IF;

  UPDATE private.influencer_partner_credentials
  SET failed_attempts = 0, locked_until = NULL, last_login_at = now()
  WHERE partner_id = v_partner.id;

  DELETE FROM private.influencer_partner_sessions WHERE expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO private.influencer_partner_sessions (token_hash, partner_id, expires_at, user_agent)
  VALUES (extensions.digest(v_token, 'sha256'), v_partner.id, v_expires, LEFT(p_user_agent, 300));

  RETURN jsonb_build_object('status', 'ok', 'token', v_token, 'expires_at', v_expires);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_portal_login(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_login(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.partner_portal_dashboard(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partner public.influencer_partners%ROWTYPE;
BEGIN
  SELECT p.* INTO v_partner
  FROM private.influencer_partner_sessions AS s
  JOIN public.influencer_partners AS p ON p.id = s.partner_id
  WHERE s.token_hash = extensions.digest(COALESCE(p_token, ''), 'sha256')
    AND s.expires_at > now()
    AND p.is_active;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- بلا أي بيانات عن العملاء: تاريخ ومبالغ فقط
  RETURN jsonb_build_object(
    'partner', jsonb_build_object(
      'full_name', v_partner.full_name,
      'username', v_partner.username,
      'social_handle', v_partner.social_handle
    ),
    'codes', private.influencer_code_rows(v_partner.id),
    'totals', private.influencer_partner_totals(v_partner.id),
    'sales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', r.code,
        'sale_date', r.sale_date,
        'sale_amount', r.sale_amount,
        'commission_percent', r.commission_percent,
        'commission_amount', r.commission_amount
      ) ORDER BY r.redeemed_at DESC)
      FROM private.influencer_effective_redemptions() AS r
      WHERE r.partner_id = v_partner.id
    ), '[]'::JSONB),
    'payouts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'amount', po.amount, 'paid_on', po.paid_on, 'note', po.note
      ) ORDER BY po.paid_on DESC, po.created_at DESC)
      FROM public.influencer_payouts AS po
      WHERE po.partner_id = v_partner.id
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_portal_dashboard(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_dashboard(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.partner_portal_logout(p_token TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM private.influencer_partner_sessions
  WHERE token_hash = extensions.digest(COALESCE(p_token, ''), 'sha256');
$$;

REVOKE ALL ON FUNCTION public.partner_portal_logout(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_logout(TEXT) TO service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
