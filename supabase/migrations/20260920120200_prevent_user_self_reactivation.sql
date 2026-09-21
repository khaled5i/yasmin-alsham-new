-- ════════════════════════════════════════════════════════════════════════════
-- منع المستخدم الموقوف من إعادة تنشيط نفسه
-- التاريخ: 20 سبتمبر 2026
-- المرجع: docs/store-launch-plans/implementation/stage-04-soniox-authorization.md
--
-- ⚠️ لم يُطبَّق هذا الملف. مكتوب لمراجعة المالك وتطبيقه بنفسه.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 🚨 رُفع من «قسم مؤجَّل» إلى ترحيل مستقل بعد مراجعة المرحلة 4              │
-- │                                                                          │
-- │ كان هذا القسم معلّقاً كتعليق داخل 20260920120000_harden_users_rls.sql،    │
-- │ مؤجَّلاً إلى ما بعد استقرار غيره. المراجعة أثبتت أن تأجيله **يُبطل**       │
-- │ بوابات التفويض الجديدة كلها:                                             │
-- │                                                                          │
-- │   requireActiveStaff تفحص is_active — لكن المستخدم الموقوف يستطيع        │
-- │   إعادة تنشيط نفسه أولاً ثم يجتاز البوابة:                               │
-- │     UPDATE users SET is_active = true WHERE id = auth.uid();             │
-- │                                                                          │
-- │ الحالة الحية المرصودة (قراءة فقط):                                        │
-- │   • المشغّل prevent_user_self_reactivation: **غير مركّب**                 │
-- │   • authenticated يملك UPDATE على العمود is_active: **نعم**              │
-- │   • "Users can update own profile" فحصها يثبّت role **وحده**              │
-- │   • prevent_role_change يفحص role **وحده**                                │
-- │                                                                          │
-- │ أي أن فحص is_active في طبقة التطبيق صحيح لكنه **قابل للالتفاف** من طبقة  │
-- │ القاعدة. هذا الترحيل يغلق الالتفاف.                                       │
-- │                                                                          │
-- │ ⚠️ لم يُختبر الالتفاف عملياً — استنتاج من الإعدادات المقروءة.             │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- لا يغيّر أي بيانات. لا DROP TABLE ولا DELETE.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_user_self_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims   text;
  jwt_role text;
BEGIN
  -- ── الخطوة 1: هل تغيّر is_active أصلاً؟ ──────────────────────────────────
  -- إن لم يتغيّر فلا شأن للحارس بهذا التحديث مهما كان سياقه. كل تحديثات
  -- users العادية (الاسم، الهاتف، البريد …) تمرّ بلا قيد.
  IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  -- ── الخطوة 2: تغيّر is_active — هل السياق موثوق؟ ─────────────────────────
  claims := current_setting('request.jwt.claims', true);

  IF claims IS NULL OR claims = '' THEN
    -- غياب سياق الطلب لا يثبت التخويل، فلا نسمح إلا لأدوار محددة.
    -- ⚠️ current_user يمثّل سياق التنفيذ الفعلي لا بالضرورة المستخدم الأصلي:
    --    الاستدعاء عبر دالة SECURITY DEFINER قد يورّث سياقها المرتفع.
    --    يجب اختبار هذا الفرع مباشرةً ومتداخلاً قبل الاعتماد.
    IF current_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'is_active cannot be changed without a trusted context (role: %)', current_user;
  END IF;

  BEGIN
    jwt_role := claims::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;

  -- مفتاح الخدمة: /api/workers/delete يوقف الحسابات، والإدارة تعيد تفعيلها.
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- ── الخطوة 3: سياق غير مخوّل يغيّر حالة النشاط ──────────────────────────
  RAISE EXCEPTION 'You cannot change your own active status';
END;
$$;

DROP TRIGGER IF EXISTS prevent_user_self_reactivation ON public.users;

CREATE TRIGGER prevent_user_self_reactivation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_self_reactivation();

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- التحقق بعد التطبيق
-- ════════════════════════════════════════════════════════════════════════════

-- 1) المشغّل مركّب والدالة INVOKER — المتوقع صف واحد، prosecdef = false
--
-- SELECT t.tgname, p.prosecdef AS security_definer
-- FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- JOIN pg_proc  p ON p.oid = t.tgfoid
-- WHERE c.relname = 'users' AND t.tgname = 'prevent_user_self_reactivation';

-- 2) ⚠️ إلزامي — الموقوف لا يعيد تنشيط نفسه.
--    في بيئة اختبار، بحساب موقوف عبر API، أو عبر psql بسياق مضبوط:
--
--      BEGIN;
--        SET LOCAL role authenticated;
--        SET LOCAL request.jwt.claims =
--          '{"sub":"<uuid المستخدم>","role":"authenticated"}';
--        UPDATE public.users SET is_active = true WHERE id = '<uuid>'::uuid;
--      ROLLBACK;
--
--    المتوقع: EXCEPTION 'You cannot change your own active status'

-- 3) ⚠️ إلزامي — التحديث العادي يمرّ من نفس السياق (الخطوة 1 في الدالة):
--      UPDATE public.users SET full_name = 'test' WHERE id = '<uuid>'::uuid;
--    المتوقع: ينجح. إن فشل فالحارس يرفض أكثر مما يلزم.

-- 4) إيقاف عامل وإعادة تفعيله من لوحة الإدارة — يدوياً، يجب أن ينجحا.
-- 5) /api/workers/delete (يوقف الحساب بمفتاح الخدمة) — يدوياً، يجب أن ينجح.


-- ════════════════════════════════════════════════════════════════════════════
-- التراجع
--
-- ❌ لا تُسقط المشغّل كعلاج: بين الإسقاط وإعادة التركيب نافذة مكشوفة،
--    وإسقاطه يُبطل بوابات التفويض في كل مسارات API.
--
-- ✅ إن منع مساراً مشروعاً، صحّح جسم الدالة بـCREATE OR REPLACE داخل معاملة
--    واحدة — المشغّل يبقى مركّباً فلا توجد لحظة بلا حماية:
--
--      BEGIN;
--        CREATE OR REPLACE FUNCTION public.prevent_user_self_reactivation()
--        RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
--        AS $$ BEGIN /* المنطق المصحّح */ END; $$;
--      COMMIT;
-- ════════════════════════════════════════════════════════════════════════════
