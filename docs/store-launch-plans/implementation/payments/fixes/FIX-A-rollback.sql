-- ============================================================================
-- تراجع الدفعة A (AUD-01) — يُبطل 20261001120000_restrict_income_expenses_rls.sql جزئياً
-- ============================================================================
-- متى يُستعمل: إن أوقفت مصفوفة الأدوار الجديدة عمل موظف يحتاجه المحل الآن (مثلاً: شاشة
-- واردات الأقمشة لا تحفظ مبيعة)، ولا وقت للتشخيص. يُطبَّق من SQL Editor.
--
-- ما يفعله:
--   • يستبدل السياسات الثماني بسياسات «احتياطية» أوسع لكنها للموظفين فقط:
--     private.can_manage_fabric_operations() — المدير والمحاسب والمدير العام ومدير الأقمشة،
--     في كل الفروع. (هي البوابة القائمة على جداول المخزون منذ أغسطس.)
--   • يحذف private.can_access_finance_branch(text).
--
-- ما لا يفعله، عمداً (لا يعيد فتح ثغرة):
--   • لا يعيد سياسات `true`، ولا يعيد أي صلاحية لـanon على الجدولين أو تسلسل الفواتير
--     أو generate_recurring_expenses، ولا يعيد TRUNCATE لـauthenticated.
--   • لا يعيد نسخة المرحلة 8 من private.fabric_store_protect_online_sale: الفحص الجديد يمنع
--     جلسة المتصفح من تغيير حالة فاتورة الأستاذ لمبيعة المتجر، ولا مستهلك متصفح لذلك.
--   • لا يمس أي صف.
--
-- إعادة الهجرة بعده آمنة (تعرف أسماء السياسات الاحتياطية وتحذفها).
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('private.can_access_finance_branch(text)') is null then
    raise exception 'FIX_A_ROLLBACK_NOT_NEEDED: migration 20261001120000 is not applied';
  end if;
  if to_regprocedure('private.can_manage_fabric_operations()') is null then
    raise exception 'FIX_A_ROLLBACK_REFUSED: private.can_manage_fabric_operations() is missing — no safe fallback gate';
  end if;
end $$;

drop policy if exists income_staff_select on public.income;
drop policy if exists income_staff_insert on public.income;
drop policy if exists income_staff_update on public.income;
drop policy if exists income_staff_delete on public.income;
drop policy if exists expenses_staff_select on public.expenses;
drop policy if exists expenses_staff_insert on public.expenses;
drop policy if exists expenses_staff_update on public.expenses;
drop policy if exists expenses_staff_delete on public.expenses;

drop policy if exists income_fallback_select on public.income;
drop policy if exists income_fallback_insert on public.income;
drop policy if exists income_fallback_update on public.income;
drop policy if exists income_fallback_delete on public.income;
drop policy if exists expenses_fallback_select on public.expenses;
drop policy if exists expenses_fallback_insert on public.expenses;
drop policy if exists expenses_fallback_update on public.expenses;
drop policy if exists expenses_fallback_delete on public.expenses;

create policy income_fallback_select on public.income for select to authenticated
  using ((select private.can_manage_fabric_operations()));
create policy income_fallback_insert on public.income for insert to authenticated
  with check ((select private.can_manage_fabric_operations()));
create policy income_fallback_update on public.income for update to authenticated
  using ((select private.can_manage_fabric_operations()))
  with check ((select private.can_manage_fabric_operations()));
create policy income_fallback_delete on public.income for delete to authenticated
  using ((select private.can_manage_fabric_operations()));

create policy expenses_fallback_select on public.expenses for select to authenticated
  using ((select private.can_manage_fabric_operations()));
create policy expenses_fallback_insert on public.expenses for insert to authenticated
  with check ((select private.can_manage_fabric_operations()));
create policy expenses_fallback_update on public.expenses for update to authenticated
  using ((select private.can_manage_fabric_operations()))
  with check ((select private.can_manage_fabric_operations()));
create policy expenses_fallback_delete on public.expenses for delete to authenticated
  using ((select private.can_manage_fabric_operations()));

drop function private.can_access_finance_branch(text);

-- تحقق: لا شيء لـanon، ولا سياسة `true`
do $$
begin
  if has_table_privilege('anon', 'public.income', 'SELECT') or has_table_privilege('anon', 'public.expenses', 'SELECT')
     or has_table_privilege('anon', 'public.income', 'INSERT') or has_table_privilege('anon', 'public.expenses', 'INSERT') then
    raise exception 'FIX_A_ROLLBACK_CHECK: anon has a privilege on income/expenses';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('income', 'expenses')
             and coalesce(qual, with_check) !~ 'can_manage_fabric_operations') then
    raise exception 'FIX_A_ROLLBACK_CHECK: a policy on income/expenses is not the staff fallback';
  end if;
end $$;
