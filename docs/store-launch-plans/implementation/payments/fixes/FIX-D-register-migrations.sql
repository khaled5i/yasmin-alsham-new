-- ============================================================================
-- ⛔ مسحوب — لا تشغّليه (المراجعة المستقلة REVIEW-CD.md، R-CD-08، 6 أكتوبر 2026)
--   • A وB مسجّلتان على الحي **بأرقام أخرى** (20261003101953، 20261003102028، 20261003102058) — هذا
--     الملف كان سيضيف أرقامها الأصلية فوقها.
--   • كائن واحد لكل هجرة لا يثبت اكتمالها (مثلاً وجود purge_addresses لا يثبت سحب أعمدة التكلفة).
--   القاعدة المعتمدة بدلاً منه: **لا `supabase db push` لهذا المشروع؛ كل هجرة من SQL Editor.**
--   تسوية السجل، إن لزمت يوماً، خطة مستقلة تتحقق من كل كائن ومنح وبصمة وتعرف الأرقام البديلة.
-- ============================================================================
do $$ begin raise exception 'FIX_D_REGISTER_WITHDRAWN: this proposal was withdrawn (REVIEW-CD.md R-CD-08) — do not run it'; end $$;
-- (النص الأصلي للاقتراح يبقى أدناه للتاريخ فقط)
-- اقتراح (AUD-11) — تسجيل الهجرات المطبّقة من SQL Editor في سجل ترحيلات Supabase
-- ============================================================================
-- **لم يُنفَّذ. القرار للمالكة** (كتابة على الحي). كُتب ليُراجَع ثم يُشغَّل مرة من SQL Editor إن قررتِ.
--
-- لماذا: SQL Editor لا يسجّل ما يطبّقه. هذه الهجرات مطبّقة على الحي وغائبة عن
-- supabase_migrations.schema_migrations، فلو شُغّل يوماً `supabase db push` لحاول تطبيقها من جديد:
-- بعضها يفشل في منتصفه (مثل 20260929150000: add column بلا if not exists)، وغيرها يُعاد بلا داعٍ.
--
-- كيف يحمي نفسه: يُسجَّل الرقم **فقط** إن كان كائن تنشئه تلك الهجرة موجوداً فعلاً، وإن لم يكن
-- الرقم مسجّلاً. رقم بلا كائنه لا يُسجَّل (وإلا تخطّى db push هجرة لم تُطبَّق). النتيجة في آخره:
-- ما سُجّل وما تُرك.
--
-- البديل إن لم تُشغّليه: القاعدة الثابتة «لا `supabase db push` لهذا المشروع؛ كل هجرة من SQL Editor».
-- ملاحظة: الرقم 20261005130000 لهجرة أخرى (المشغل النسائي) — ليس في هذه القائمة.
-- ============================================================================
-- جملة واحدة (لا جدول مؤقت: SQL Editor لا يُبقيه بين الجمل — HANDOFF §8 الدرس 24)
with pending (version, name, applied) as (
  values
  ('20260920120000', 'harden_users_rls',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users'
            and policyname = 'Authenticated users can view active users')),
  ('20260920120100', 'harden_workers_rls',
    exists (select 1 from pg_trigger where tgname = 'prevent_worker_self_escalation' and not tgisinternal)),
  ('20260920120200', 'prevent_user_self_reactivation',
    exists (select 1 from pg_trigger where tgname = 'prevent_user_self_reactivation' and not tgisinternal)),
  ('20260924160000', 'fabric_store_payments',
    to_regprocedure('public.fabric_store_attach_invoice(uuid, text, text)') is not null),
  ('20260929120000', 'fabric_store_confirm_sale',
    to_regprocedure('public.fabric_store_confirm_order(uuid)') is not null),
  ('20260929150000', 'fabric_store_order_admin',
    to_regprocedure('public.fabric_store_staff_add_note(uuid, uuid, text)') is not null),
  ('20260929170000', 'fabric_store_review_recheck',
    to_regprocedure('public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb)') is not null
    and to_regprocedure('public.fabric_store_staff_resolve_review(uuid, uuid, text)') is null),
  ('20261001120000', 'restrict_income_expenses_rls',
    to_regprocedure('private.can_access_finance_branch(text)') is not null),
  ('20261001120100', 'payroll_rpc_role_checks',
    to_regprocedure('private.assert_payroll_branch_access(text)') is not null),
  ('20261003120000', 'fabric_store_hold_at_payment',
    to_regclass('private.fabric_store_hold_clients') is not null),
  ('20261005120000', 'fabric_store_money_guards',
    to_regprocedure('public.fabric_store_refund_record_external(uuid, uuid, uuid, text, bigint, text, text, bigint, uuid)') is not null),
  ('20261005150000', 'fabric_store_privacy_ops',
    to_regprocedure('public.fabric_store_purge_addresses(integer, interval)') is not null)
), registered as (
  insert into supabase_migrations.schema_migrations (version, name, statements)
  select p.version, p.name, array[]::text[]
  from pending p
  where p.applied
    and not exists (select 1 from supabase_migrations.schema_migrations m where m.version = p.version)
  returning version
)
select p.version, p.name,
       case when p.version in (select version from registered) then 'سُجّلت الآن'
            when not p.applied then 'لم تُسجَّل: كائنها غير موجود — تحقّقي هل طُبّقت'
            else 'مسجّلة من قبل' end as result
from pending p
order by p.version;
