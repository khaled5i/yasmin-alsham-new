-- ============================================================================
-- تراجع الدفعة A (الرواتب) — يُبطل 20261001120100_payroll_rpc_role_checks.sql
-- ============================================================================
-- متى يُستعمل: إن منع الفحص الجديد عملية رواتب يحتاجها المدير ولا وقت للتشخيص.
-- ما يفعله: يحذف الأغلفة، ويعيد كل دالة أصلية (`*_unchecked`) إلى اسمها كما كانت حرفياً.
-- ما لا يفعله، عمداً (لا يعيد فتح الثغرة كاملة):
--   • لا يعيد EXECUTE لـanon على أي دالة رواتب؛ تبقى للموظفين المسجّلين (authenticated) فقط —
--     وهذا هو «الحد الأدنى» الموصوف في PAYROLL-ANON-CHECK.md §6 الخطوة 1.
--   • لا يعيد EXECUTE للمتصفح على الدالتين المساعدتين.
--   • لا يمس أي صف.
-- إعادة الهجرة بعده آمنة (بصمات الأجسام لم تتغير).
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('private.assert_payroll_branch_access(text)') is null then
    raise exception 'PAYROLL_ROLLBACK_NOT_NEEDED: migration 20261001120100 is not applied';
  end if;
end $$;

drop function if exists public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text);
alter function public.create_worker_payroll_adjustment_request_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text) rename to create_worker_payroll_adjustment_request;
revoke all on function public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text) from public, anon;
grant execute on function public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text) to authenticated, service_role;

drop function if exists public.delete_worker_deduction_payment(p_payment_id uuid);
alter function public.delete_worker_deduction_payment_unchecked(p_payment_id uuid) rename to delete_worker_deduction_payment;
revoke all on function public.delete_worker_deduction_payment(p_payment_id uuid) from public, anon;
grant execute on function public.delete_worker_deduction_payment(p_payment_id uuid) to authenticated, service_role;

drop function if exists public.delete_worker_payroll_operation(p_operation_id uuid);
alter function public.delete_worker_payroll_operation_unchecked(p_operation_id uuid) rename to delete_worker_payroll_operation;
revoke all on function public.delete_worker_payroll_operation(p_operation_id uuid) from public, anon;
grant execute on function public.delete_worker_payroll_operation(p_operation_id uuid) to authenticated, service_role;

drop function if exists public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text);
alter function public.lock_worker_payroll_period_unchecked(p_branch character varying, p_year integer, p_month integer, p_reason text) rename to lock_worker_payroll_period;
revoke all on function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text) from public, anon;
grant execute on function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text) to authenticated, service_role;

drop function if exists public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text);
alter function public.pay_worker_deduction_debt_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text) rename to pay_worker_deduction_debt;
revoke all on function public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text) from public, anon;
grant execute on function public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text) to authenticated, service_role;

drop function if exists public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric);
alter function public.propagate_worker_salary_to_future_months_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric) rename to propagate_worker_salary_to_future_months;
revoke all on function public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric) from public, anon;
grant execute on function public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric) to authenticated, service_role;

drop function if exists public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying);
alter function public.register_worker_payroll_adjustment_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) rename to register_worker_payroll_adjustment;
revoke all on function public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) from public, anon;
grant execute on function public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) to authenticated, service_role;

drop function if exists public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric);
alter function public.register_worker_payroll_big_debt_payment_unchecked(p_branch character varying, p_worker_id text, p_amount numeric) rename to register_worker_payroll_big_debt_payment;
revoke all on function public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric) from public, anon;
grant execute on function public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric) to authenticated, service_role;

drop function if exists public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying);
alter function public.register_worker_payroll_payment_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) rename to register_worker_payroll_payment;
revoke all on function public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) from public, anon;
grant execute on function public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text, p_note text, p_payment_account character varying) to authenticated, service_role;

drop function if exists public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text);
alter function public.settle_worker_debt_from_salary_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text) rename to settle_worker_debt_from_salary;
revoke all on function public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text) from public, anon;
grant execute on function public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text) to authenticated, service_role;

drop function if exists public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer);
alter function public.unlock_worker_payroll_period_unchecked(p_branch character varying, p_year integer, p_month integer) rename to unlock_worker_payroll_period;
revoke all on function public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer) from public, anon;
grant execute on function public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer) to authenticated, service_role;

drop function if exists public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric);
alter function public.upsert_worker_payroll_big_debt_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric) rename to upsert_worker_payroll_big_debt;
revoke all on function public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric) from public, anon;
grant execute on function public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric) to authenticated, service_role;

drop function if exists public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric);
alter function public.upsert_worker_payroll_month_snapshot_unchecked(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric) rename to upsert_worker_payroll_month_snapshot;
revoke all on function public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric) from public, anon;
grant execute on function public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date, p_reference text, p_note text, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_count numeric, p_piece_rate numeric, p_overtime_hours numeric, p_overtime_rate numeric) to authenticated, service_role;


drop function private.assert_payroll_branch_access(text);

-- تحقق: لا دالة رواتب لـanon، ولا أثر لـ_unchecked
do $$
declare
  v_left text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname like '%\_unchecked' escape '\'
         or (p.proname ~ '(payroll|worker_debt|deduction|worker_salary|big_debt)' and p.prosecdef
             and has_function_privilege('anon', p.oid, 'EXECUTE')));
  if v_left is not null then
    raise exception 'PAYROLL_ROLLBACK_CHECK: %', v_left;
  end if;
end $$;
