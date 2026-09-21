-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 3 — الجزء ب: تشديد سياسات جدول workers
-- التاريخ: 20 سبتمبر 2026 · النسخة 3 (بعد مراجعتين مستقلتين)
-- المرجع: docs/store-launch-plans/implementation/stage-03-users-and-workers-rls.md
--
-- ⚠️ لم يُطبَّق هذا الملف. مكتوب لمراجعة المالك وتطبيقه بنفسه.
-- ⚠️ لا تطبّقه قبل نشر إصلاح مسارات API التسعة (المرحلة 3-أ في الكود)
--    وقبل تطبيق 20260920120000_harden_users_rls.sql واستقراره.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ تصحيح جوهري على النسخة 1 — كان الحارس معطّلاً بالكامل                    │
-- │                                                                          │
-- │ النسخة 1 عرّفت الدالة SECURITY DEFINER ثم استثنت:                        │
-- │     current_user IN ('service_role', 'postgres', 'supabase_admin')      │
-- │                                                                          │
-- │ داخل دالة SECURITY DEFINER يمثّل current_user **مالك الدالة** لا مُستدعيها.│
-- │ وكل دوال هذا المشروع مملوكة لـpostgres (تحقّقنا من pg_proc.proowner)،     │
-- │ فكان الشرط يتحقق في **كل** استدعاء ويعيد RETURN NEW قبل أي فحص.          │
-- │                                                                          │
-- │ أي أن الحارس كان لا يمنع شيئاً إطلاقاً، بينما يبدو حمايةً قائمة —         │
-- │ وهذا أسوأ من غياب الحارس لأنه يولّد ثقة زائفة.                           │
-- │                                                                          │
-- │ التصحيح: SECURITY INVOKER + الاعتماد على ادعاء الـJWT بدل current_user.  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- القسم 1 — منع العامل من ترقية نفسه
--
-- سياسة "Workers can update own profile" فحصها يحرس total_completed_orders
-- وحده. worker_type و hourly_rate غير محروسين، فهذه الجملة تمرّ:
--
--     UPDATE workers SET worker_type = 'workshop_manager' WHERE user_id = auth.uid();
--
-- وسياسات orders تمنح عندها "Workshop managers can view/update all orders".
--
-- لماذا SECURITY INVOKER:
--   الدالة لا تحتاج أي صلاحية مرتفعة — تقارن OLD بـNEW وتستدعي public.is_admin()
--   وهي نفسها SECURITY DEFINER فتتكفّل بقراءة جدول users. وبـINVOKER لا يتلوّث
--   الفحص بهوية مالك الدالة كما حدث في النسخة 1.
--   ⚠️ لكن INVOKER لا يثبت دائماً هوية المستخدم الأصلي: إن وصل التحديث عبر
--      دالة أخرى SECURITY DEFINER فقد يرث سياقها المرتفع. لذلك يجب اختبار
--      الاستدعاء المباشر والمتداخل قبل الاعتماد.
--
-- لماذا ادعاء الـJWT وليس current_user أو session_user:
--   ادعاء الـJWT يعكس هوية طلب HTTP الذي تحقّق منه PostgREST، فهو أمتن من
--   current_user لهذا الغرض. ويبقى current_user مستخدماً في فرع غياب السياق
--   وحده، وهو الفرع الذي يلزم إثباته تشغيلياً (الاختبار 4).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_worker_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims   text;
  jwt_role text;
BEGIN
  -- ── الخطوة 1: هل تغيّر عمود محمي أصلاً؟ ──────────────────────────────────
  -- إن لم يتغيّر أي منها فلا شأن للحارس بهذا التحديث مهما كان سياقه. وهذا
  -- يُبقي كل التحديثات العادية (is_available, bio, skills, specialty,
  -- performance_rating …) تعمل من أي سياق — بما فيه مهام الصيانة والخدمات
  -- التي تعمل بأدوار غير مستثناة. الحارس يضيق على الأعمدة المحمية وحدها.
  IF  NEW.worker_type  IS NOT DISTINCT FROM OLD.worker_type
  AND NEW.hourly_rate  IS NOT DISTINCT FROM OLD.hourly_rate
  AND NEW.user_id      IS NOT DISTINCT FROM OLD.user_id
  THEN
    RETURN NEW;
  END IF;

  -- ── الخطوة 2: تغيّر عمود محمي — هل السياق موثوق؟ ─────────────────────────
  claims := current_setting('request.jwt.claims', true);

  IF claims IS NULL OR claims = '' THEN
    -- لا سياق طلب. غيابه لا يثبت التخويل، فلا نسمح إلا لأدوار محددة.
    -- ⚠️ current_user يمثّل سياق التنفيذ الفعلي لا بالضرورة المستخدم الأصلي:
    --    الاستدعاء عبر دالة SECURITY DEFINER قد يورّث سياقها المرتفع.
    --    هذا الفرع يجب أن يُختبر مباشرةً ومتداخلاً قبل الاعتماد.
    IF current_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Protected worker columns cannot be changed without a trusted context (role: %)', current_user;
  END IF;

  BEGIN
    jwt_role := claims::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;

  -- مفتاح الخدمة: مسارات /api/* الخادمية الموثوقة.
  -- ضروري لأن is_admin() تعيد false لها (auth.uid() تكون NULL).
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- المدير يغيّر نوع العامل وأجره من لوحة التحكم — مسار مشروع.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- ── الخطوة 3: سياق غير مخوّل يحاول تغيير عمود محمي ──────────────────────
  IF NEW.worker_type IS DISTINCT FROM OLD.worker_type THEN
    RAISE EXCEPTION 'You cannot change your own worker_type';
  END IF;

  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'You cannot change your own hourly_rate';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'You cannot change user_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_worker_self_escalation ON public.workers;

CREATE TRIGGER prevent_worker_self_escalation
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_worker_self_escalation();

-- ────────────────────────────────────────────────────────────────────────────
-- القسم 2 — إزالة INSERT و DELETE المفتوحين
--
-- لا يوجد INSERT أو DELETE على workers من جهة العميل: worker-service.ts
-- يقوم بـUPDATE فقط (السطر 372)، والإنشاء والحذف عبر /api/workers/*
-- بمفتاح الخدمة الذي يتجاوز RLS.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert workers" ON public.workers;
DROP POLICY IF EXISTS "Authenticated users can delete workers" ON public.workers;

-- ────────────────────────────────────────────────────────────────────────────
-- القسم 3 — منع الزائر غير المسجّل من قراءة جدول العمال
--
-- الشرط يبقى كما هو ويُقصر على authenticated.
-- ⚠️ هذا احتواء جزئي لا إغلاق كامل: الدور authenticated يشمل أيضاً أي عميل
--    مسجّل وأي حساب موقوف ما زال يحمل رمزاً صالحاً. التضييق النهائي بحسب
--    الدور مؤجَّل إلى ما بعد جرد الصلاحيات (المرحلة 0).
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view available workers" ON public.workers;

CREATE POLICY "Authenticated users can view available workers"
  ON public.workers
  FOR SELECT
  TO authenticated
  USING (is_available = true);

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- التحقق بعد التطبيق — الاختبار 4 إلزامي
-- ════════════════════════════════════════════════════════════════════════════

-- 1) الدالة صارت INVOKER لا DEFINER — المتوقع prosecdef = false
--
-- SELECT proname, prosecdef AS security_definer, pg_get_userbyid(proowner) AS owner
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND proname='prevent_worker_self_escalation';

-- 2) المشغّل مركّب — المتوقع صف واحد
--
-- SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
-- WHERE c.relname='workers' AND tgname='prevent_worker_self_escalation';

-- 3) الزائر لا يرى العمال — المتوقع 0 (كان 19)
--
-- BEGIN; SET LOCAL role anon;
--   SELECT count(*) AS workers_visible_to_anon FROM public.workers;
-- ROLLBACK;

-- 4) ⚠️ إلزامي — الحارس يمنع فعلاً.
--    في بيئة اختبار منفصلة. يصحّ عبر API بحساب عامل، أو عبر psql بشرط
--    ضبط السياق — فبلا ضبطه لا يمثّل الاختبار عاملاً حقيقياً:
--
--      BEGIN;
--        SET LOCAL role authenticated;
--        SET LOCAL request.jwt.claims =
--          '{"sub":"<uuid العامل>","role":"authenticated"}';
--
--        UPDATE public.workers SET worker_type = 'workshop_manager'
--          WHERE user_id = '<uuid العامل>'::uuid;
--      ROLLBACK;
--
--    المتوقع: EXCEPTION 'You cannot change your own worker_type'
--    إن نجحت الجملة فالحارس معطّل — أوقف كل شيء وراجع.
--
--    واختبر أيضاً أن التحديث العادي يمرّ من نفس السياق (الخطوة 1 في الدالة):
--      UPDATE public.workers SET bio = 'test' WHERE user_id = '<uuid>'::uuid;  -- يجب أن ينجح

-- 5) المدير ما زال يستطيع تغيير نوع العامل من اللوحة — يدوياً.
-- 6) إنشاء عامل وحذفه عبر /api/workers/* — يدوياً.


-- ════════════════════════════════════════════════════════════════════════════
-- التراجع — أُعيدت كتابته بعد المراجعة
--
-- ❌ النسخة 1 عرضت نصاً يعيد سياسات INSERT/DELETE المفتوحة والقراءة العامة.
--    ذلك ليس تراجعاً بل إعادة فتح ثغرتين، ورُفض بحق. حُذف.
--
-- ✅ القاعدة: عند أي عطل، عالج المسار المتعطل تحديداً أو أوقف العملية
--    المتأثرة مؤقتاً — مع إبقاء المنع قائماً.
-- ════════════════════════════════════════════════════════════════════════════

-- ❌ لا تستخدم DROP TRIGGER كعلاج. بين الإسقاط وإعادة التركيب تبقى نافذة
--    تصعيد مكشوفة، و«أعد تركيبه لاحقاً» ليس خطة.
--
-- ✅ إن منع الحارس مساراً مشروعاً، صحّح منطق الدالة داخل معاملة واحدة.
--    CREATE OR REPLACE يستبدل الجسم ذرّياً والمشغّل يبقى مركّباً طوال الوقت،
--    فلا توجد لحظة واحدة بلا حماية:
--
--      BEGIN;
--        CREATE OR REPLACE FUNCTION public.prevent_worker_self_escalation()
--        RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
--        AS $$
--        BEGIN
--          -- ... المنطق المصحّح، مع إبقاء فحص worker_type و hourly_rate ...
--        END;
--        $$;
--      COMMIT;
--
-- ✅ وإن لزم تعطيل العملية المتأثرة ريثما يُصحَّح المنطق، قيّدها في طبقة
--    التطبيق (إيقاف الشاشة أو المسار) مع إبقاء الحارس قائماً في القاعدة.
--
-- إن تعطّلت قراءة العمال لدور مشروع، الإصلاح سياسة إضافية دقيقة لذلك الدور
-- — لا العودة إلى TO public.
