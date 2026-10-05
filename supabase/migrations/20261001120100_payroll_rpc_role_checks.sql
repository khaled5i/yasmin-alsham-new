-- ============================================================================
-- الدفعة A — دوال الرواتب كانت قابلة للتنفيذ لأي زائر (تقرير التدقيق §6)
-- ============================================================================
-- الحي قبل هذه الهجرة: 13 دالة رواتب `security definer` يملكها postgres، و`EXECUTE`
-- لـanon وauthenticated، ولا فحص للدور في أجسامها (إلا حذف «خصم من الراتب»). أي زائر
-- بمفتاح anon المنشور يسجّل دفعات، ويمحو ديوناً، ويحذف عمليات معتمدة، ويفتح شهراً مقفلاً.
-- التفاصيل: docs/store-launch-plans/implementation/payments/fixes/PAYROLL-ANON-CHECK.md
--
-- مصفوفة المالكة (1 أكتوبر 2026):
--   • رواتب التفصيل ('tailoring')      : المدير فقط.
--   • رواتب الأقمشة ('fabrics')         : المدير + مدير متجر الأقمشة.
--   • بقية الفروع (أو فرع غير معروف)     : المدير فقط.
--   الواجهة اليوم تفعل ذلك أصلاً للتفصيل (TailoringPayrollDashboard: التعديل للمدير وحده)،
--   فلا يتغير سلوك أي شاشة؛ الذي يتغير أن القاعدة صارت تفرضه.
--
-- الطريقة — بلا تعديل حرف من منطق الرواتب:
--   1. لكل دالة: نتحقق أن جسمها على الحي هو الذي قرأناه (بصمة md5)، ثم نعيد تسميتها
--      `<الاسم>_unchecked`، ونسحب تنفيذها من الجميع.
--   2. ننشئ بالاسم والتوقيع والقيم الافتراضية نفسها غلافاً `security definer` يتحقق من الدور
--      ثم يستدعي الأصل بالمعاملات نفسها (بالاسم). الاستدعاءات الداخلية بين الدوال (مثل حذف
--      سداد دين ← حذف عملية) تمر بالغلاف أيضاً، والفاعل نفسه (auth.uid) يبقى.
--   3. الدالتان المساعدتان create_worker_payroll_journal_entry وensure_worker_payroll_month
--      لا يستدعيهما التطبيق مباشرة (فقط من داخل دوال security definer): نسحب تنفيذهما من
--      المتصفح.
--
-- لا يمس أي صف. لا يمس الدوال الأحدث المحمية أصلاً (record_tailoring_payroll_disbursement،
-- set_tailoring_payroll_suspension، save_tailoring_salary_settings، withdraw_cash_box_worker_advance).
-- التراجع: docs/store-launch-plans/implementation/payments/fixes/FIX-A-payroll-rollback.sql
--          (يعيد الدوال الأصلية بأسمائها، ويُبقي الزائر ممنوعاً).
-- ============================================================================
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) من يعدّل رواتب فرع
-- ---------------------------------------------------------------------------
create or replace function private.assert_payroll_branch_access(p_branch text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.users u
    left join public.workers w on w.user_id = u.id
    where u.id = auth.uid()
      and u.is_active = true
      and (
        u.role = 'admin'
        or (u.role = 'worker' and w.worker_type = 'fabric_store_manager' and p_branch = 'fabrics')
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'PAYROLL_FORBIDDEN|ليس لديك صلاحية تعديل رواتب هذا القسم';
  end if;
end;
$$;
revoke all on function private.assert_payroll_branch_access(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) البصمات ثم إعادة التسمية (مرة واحدة؛ إعادة تطبيق الهجرة تتخطاها)
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_fp text;
begin
  for v_fn in
    select * from (values
    ('create_worker_payroll_adjustment_request', 'character varying, text, text, integer, integer, text, text', '872e73bfd01fd53383f088611483ebb5'),
    ('delete_worker_deduction_payment', 'uuid', 'eee03d5d29f4184b23b5a89defbdd672'),
    ('delete_worker_payroll_operation', 'uuid', 'a11471c50c9e1b2f4bcb4e363ba2cd36'),
    ('lock_worker_payroll_period', 'character varying, integer, integer, text', '375b48ebfd888f257a3116ebedbb5976'),
    ('pay_worker_deduction_debt', 'character varying, text, text, numeric, date, text', 'b8147ec8d6f550bafd7bdb667ed59349'),
    ('propagate_worker_salary_to_future_months', 'character varying, text, text, integer, integer, character varying, numeric, numeric', '9297ac41768d82e0a0dcb48f3fc7b0da'),
    ('register_worker_payroll_adjustment', 'character varying, text, text, integer, integer, character varying, date, numeric, text, text, character varying', '6e4770766f123661473067d35293e4e1'),
    ('register_worker_payroll_big_debt_payment', 'character varying, text, numeric', '84fdc520a5f397ac75bfe6d7975e9931'),
    ('register_worker_payroll_payment', 'character varying, text, text, integer, integer, date, numeric, text, text, character varying', 'bce46e9f8437c934af39be1ab311a3df'),
    ('settle_worker_debt_from_salary', 'character varying, text, text, integer, integer, numeric, date, text', '2e5a43843af8224e208ce4ab5bcffacf'),
    ('unlock_worker_payroll_period', 'character varying, integer, integer', '95de41fb779861d99aa61bfcc6631692'),
    ('upsert_worker_payroll_big_debt', 'character varying, text, text, numeric', 'd321e6e91968bcd854f42bfc31ce7730'),
    ('upsert_worker_payroll_month_snapshot', 'character varying, text, text, integer, integer, numeric, numeric, numeric, numeric, numeric, date, text, text, character varying, numeric, numeric, numeric, numeric, numeric', '10e39cfd68949814343ae94501dad18b')
    ) as t(name, ident, fp)
  loop
    if to_regprocedure(format('public.%s_unchecked(%s)', v_fn.name, v_fn.ident)) is not null then
      -- أُعيدت تسميتها من قبل (إعادة تطبيق): الأصل يجب أن يبقى كما قرأناه
      select md5(replace(p.prosrc, E'\r\n', E'\n')) into v_fp
      from pg_proc p where p.oid = to_regprocedure(format('public.%s_unchecked(%s)', v_fn.name, v_fn.ident));
    else
      select md5(replace(p.prosrc, E'\r\n', E'\n')) into v_fp
      from pg_proc p where p.oid = to_regprocedure(format('public.%s(%s)', v_fn.name, v_fn.ident));
    end if;
    if v_fp is distinct from v_fn.fp then
      raise exception 'PAYROLL_FUNCTION_DRIFT: % — expected %, found % (nothing was changed)', v_fn.name, v_fn.fp, coalesce(v_fp, 'missing');
    end if;
  end loop;

  for v_fn in
    select * from (values
    ('create_worker_payroll_adjustment_request', 'character varying, text, text, integer, integer, text, text', '872e73bfd01fd53383f088611483ebb5'),
    ('delete_worker_deduction_payment', 'uuid', 'eee03d5d29f4184b23b5a89defbdd672'),
    ('delete_worker_payroll_operation', 'uuid', 'a11471c50c9e1b2f4bcb4e363ba2cd36'),
    ('lock_worker_payroll_period', 'character varying, integer, integer, text', '375b48ebfd888f257a3116ebedbb5976'),
    ('pay_worker_deduction_debt', 'character varying, text, text, numeric, date, text', 'b8147ec8d6f550bafd7bdb667ed59349'),
    ('propagate_worker_salary_to_future_months', 'character varying, text, text, integer, integer, character varying, numeric, numeric', '9297ac41768d82e0a0dcb48f3fc7b0da'),
    ('register_worker_payroll_adjustment', 'character varying, text, text, integer, integer, character varying, date, numeric, text, text, character varying', '6e4770766f123661473067d35293e4e1'),
    ('register_worker_payroll_big_debt_payment', 'character varying, text, numeric', '84fdc520a5f397ac75bfe6d7975e9931'),
    ('register_worker_payroll_payment', 'character varying, text, text, integer, integer, date, numeric, text, text, character varying', 'bce46e9f8437c934af39be1ab311a3df'),
    ('settle_worker_debt_from_salary', 'character varying, text, text, integer, integer, numeric, date, text', '2e5a43843af8224e208ce4ab5bcffacf'),
    ('unlock_worker_payroll_period', 'character varying, integer, integer', '95de41fb779861d99aa61bfcc6631692'),
    ('upsert_worker_payroll_big_debt', 'character varying, text, text, numeric', 'd321e6e91968bcd854f42bfc31ce7730'),
    ('upsert_worker_payroll_month_snapshot', 'character varying, text, text, integer, integer, numeric, numeric, numeric, numeric, numeric, date, text, text, character varying, numeric, numeric, numeric, numeric, numeric', '10e39cfd68949814343ae94501dad18b')
    ) as t(name, ident, fp)
  loop
    if to_regprocedure(format('public.%s_unchecked(%s)', v_fn.name, v_fn.ident)) is null then
      execute format('alter function public.%s(%s) rename to %s', v_fn.name, v_fn.ident, v_fn.name || '_unchecked');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) الأغلفة بالأسماء والتواقيع الأصلية
-- ---------------------------------------------------------------------------
create or replace function public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.create_worker_payroll_adjustment_request_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_year => p_year, p_month => p_month, p_reason => p_reason, p_request_note => p_request_note);
end;
$$;
revoke all on function public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text) from public, anon;
grant execute on function public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text) to authenticated, service_role;
revoke all on function public.create_worker_payroll_adjustment_request_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text) from public, anon, authenticated, service_role;

create or replace function public.delete_worker_deduction_payment(p_payment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access((select d.branch from public.worker_payroll_deduction_payments d where d.id = p_payment_id));
  perform public.delete_worker_deduction_payment_unchecked(p_payment_id => p_payment_id);
  return;
end;
$$;
revoke all on function public.delete_worker_deduction_payment(p_payment_id uuid) from public, anon;
grant execute on function public.delete_worker_deduction_payment(p_payment_id uuid) to authenticated, service_role;
revoke all on function public.delete_worker_deduction_payment_unchecked(p_payment_id uuid) from public, anon, authenticated, service_role;

create or replace function public.delete_worker_payroll_operation(p_operation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access((select o.branch from public.worker_payroll_operations o where o.id = p_operation_id));
  perform public.delete_worker_payroll_operation_unchecked(p_operation_id => p_operation_id);
  return;
end;
$$;
revoke all on function public.delete_worker_payroll_operation(p_operation_id uuid) from public, anon;
grant execute on function public.delete_worker_payroll_operation(p_operation_id uuid) to authenticated, service_role;
revoke all on function public.delete_worker_payroll_operation_unchecked(p_operation_id uuid) from public, anon, authenticated, service_role;

create or replace function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text DEFAULT NULL::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.lock_worker_payroll_period_unchecked(p_branch => p_branch, p_year => p_year, p_month => p_month, p_reason => p_reason);
end;
$$;
revoke all on function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text) from public, anon;
grant execute on function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text) to authenticated, service_role;
revoke all on function public.lock_worker_payroll_period_unchecked(p_branch character varying, p_year integer, p_month integer, p_reason text) from public, anon, authenticated, service_role;

create or replace function public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.pay_worker_deduction_debt_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_amount => p_amount, p_payment_date => p_payment_date, p_note => p_note);
end;
$$;
revoke all on function public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text) from public, anon;
grant execute on function public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text) to authenticated, service_role;
revoke all on function public.pay_worker_deduction_debt_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text) from public, anon, authenticated, service_role;

create or replace function public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.propagate_worker_salary_to_future_months_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_from_year => p_from_year, p_from_month => p_from_month, p_salary_type => p_salary_type, p_fixed_salary_value => p_fixed_salary_value, p_piece_rate => p_piece_rate);
end;
$$;
revoke all on function public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric) from public, anon;
grant execute on function public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric) to authenticated, service_role;
revoke all on function public.propagate_worker_salary_to_future_months_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric) from public, anon, authenticated, service_role;

create or replace function public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_payment_account character varying DEFAULT 'cash'::character varying)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.register_worker_payroll_adjustment_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_year => p_year, p_month => p_month, p_operation_type => p_operation_type, p_operation_date => p_operation_date, p_amount => p_amount, p_reference => p_reference, p_note => p_note, p_payment_account => p_payment_account);
end;
$$;
revoke all on function public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) from public, anon;
grant execute on function public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) to authenticated, service_role;
revoke all on function public.register_worker_payroll_adjustment_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) from public, anon, authenticated, service_role;

create or replace function public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.register_worker_payroll_big_debt_payment_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_amount => p_amount);
end;
$$;
revoke all on function public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric) from public, anon;
grant execute on function public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric) to authenticated, service_role;
revoke all on function public.register_worker_payroll_big_debt_payment_unchecked(p_branch character varying, p_worker_id text, p_amount numeric) from public, anon, authenticated, service_role;

create or replace function public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_payment_account character varying DEFAULT 'cash'::character varying)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.register_worker_payroll_payment_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_year => p_year, p_month => p_month, p_operation_date => p_operation_date, p_amount => p_amount, p_reference => p_reference, p_note => p_note, p_payment_account => p_payment_account);
end;
$$;
revoke all on function public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) from public, anon;
grant execute on function public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) to authenticated, service_role;
revoke all on function public.register_worker_payroll_payment_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) from public, anon, authenticated, service_role;

create or replace function public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.settle_worker_debt_from_salary_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_year => p_year, p_month => p_month, p_amount => p_amount, p_payment_date => p_payment_date, p_note => p_note);
end;
$$;
revoke all on function public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text) from public, anon;
grant execute on function public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text) to authenticated, service_role;
revoke all on function public.settle_worker_debt_from_salary_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text) from public, anon, authenticated, service_role;

create or replace function public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.unlock_worker_payroll_period_unchecked(p_branch => p_branch, p_year => p_year, p_month => p_month);
end;
$$;
revoke all on function public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer) from public, anon;
grant execute on function public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer) to authenticated, service_role;
revoke all on function public.unlock_worker_payroll_period_unchecked(p_branch character varying, p_year integer, p_month integer) from public, anon, authenticated, service_role;

create or replace function public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.upsert_worker_payroll_big_debt_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_amount => p_amount);
end;
$$;
revoke all on function public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric) from public, anon;
grant execute on function public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric) to authenticated, service_role;
revoke all on function public.upsert_worker_payroll_big_debt_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric) from public, anon, authenticated, service_role;

create or replace function public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date DEFAULT NULL::date, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_salary_type character varying DEFAULT 'fixed'::character varying, p_fixed_salary_value numeric DEFAULT NULL::numeric, p_piece_count numeric DEFAULT 0, p_piece_rate numeric DEFAULT 0, p_overtime_hours numeric DEFAULT 0, p_overtime_rate numeric DEFAULT 12.5)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_branch_access(p_branch);
  return public.upsert_worker_payroll_month_snapshot_unchecked(p_branch => p_branch, p_worker_id => p_worker_id, p_worker_name => p_worker_name, p_year => p_year, p_month => p_month, p_basic_salary => p_basic_salary, p_works_total => p_works_total, p_allowances_total => p_allowances_total, p_deductions_total => p_deductions_total, p_advances_total => p_advances_total, p_operation_date => p_operation_date, p_reference => p_reference, p_note => p_note, p_salary_type => p_salary_type, p_fixed_salary_value => p_fixed_salary_value, p_piece_count => p_piece_count, p_piece_rate => p_piece_rate, p_overtime_hours => p_overtime_hours, p_overtime_rate => p_overtime_rate);
end;
$$;
revoke all on function public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric) from public, anon;
grant execute on function public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric) to authenticated, service_role;
revoke all on function public.upsert_worker_payroll_month_snapshot_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4) الدالتان المساعدتان: لا يستدعيهما المتصفح
-- ---------------------------------------------------------------------------
revoke all on function public.create_worker_payroll_journal_entry(uuid, character varying, numeric, date, integer, integer, text, character varying)
  from public, anon, authenticated;
revoke all on function public.ensure_worker_payroll_month(character varying, text, text, integer, integer)
  from public, anon, authenticated;

-- أعيدت تسمية دوال يستدعيها PostgREST بأسمائها: pgrst_ddl_watch يعيد تحميل المخطط عادةً،
-- وهذا تأكيد صريح (يُرسل عند الالتزام فقط).
notify pgrst, 'reload schema';

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "رواتب"
-- ============================================================================
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'private.assert_payroll_branch_access(text)'::regprocedure;

  if position(chr(1585) || chr(1608) || chr(1575) || chr(1578) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'PAYROLL_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
