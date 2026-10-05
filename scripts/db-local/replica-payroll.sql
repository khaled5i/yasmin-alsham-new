-- Local stand-ins for the 13 payroll RPCs of fix batch A (scripts/db-local/verify-payroll-rpc.cjs only;
-- NOT part of buildReplica). Same names, argument names, types, defaults and return types as
-- live (pg_get_function_arguments, read 1 Oct 2026); the bodies only log who called them with
-- which arguments, so the wrappers' role gate and argument pass-through can be checked.
-- The real bodies stay untouched on live (the migration renames them, fingerprint-checked).

create table public.worker_payroll_operations (
  id uuid primary key default gen_random_uuid(), branch varchar not null, metadata jsonb not null default '{}'::jsonb
);
create table public.worker_payroll_deduction_payments (
  id uuid primary key default gen_random_uuid(), branch varchar not null
);
create table public.replica_payroll_calls (
  n bigint generated always as identity, fn text not null, actor uuid, args jsonb not null
);

-- the two internal helpers (signatures as live; never called from a browser)
create or replace function public.create_worker_payroll_journal_entry(p_operation_id uuid, p_operation_type character varying,
  p_amount numeric, p_operation_date date, p_year integer, p_month integer, p_description text, p_payment_account character varying)
returns uuid language sql security definer set search_path = public as $$ select null::uuid $$;
create or replace function public.ensure_worker_payroll_month(p_branch character varying, p_worker_id text, p_worker_name text,
  p_year integer, p_month integer)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;

create or replace function public.create_worker_payroll_adjustment_request(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_reason text, p_request_note text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('create_worker_payroll_adjustment_request', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_reason', p_reason, 'p_request_note', p_request_note));
  return jsonb_build_object('fn', 'create_worker_payroll_adjustment_request', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_reason', p_reason, 'p_request_note', p_request_note));
end;
$$;
create or replace function public.delete_worker_deduction_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('delete_worker_deduction_payment', auth.uid(), jsonb_build_object('p_payment_id', p_payment_id));
  perform delete_worker_payroll_operation(o.id) from worker_payroll_operations o
  where o.metadata->>'debt_payment_id' = p_payment_id::text limit 1;
  return;
end;
$$;
create or replace function public.delete_worker_payroll_operation(p_operation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('delete_worker_payroll_operation', auth.uid(), jsonb_build_object('p_operation_id', p_operation_id));
  return;
end;
$$;
create or replace function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('lock_worker_payroll_period', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_year', p_year, 'p_month', p_month, 'p_reason', p_reason));
  return jsonb_build_object('fn', 'lock_worker_payroll_period', 'args', jsonb_build_object('p_branch', p_branch, 'p_year', p_year, 'p_month', p_month, 'p_reason', p_reason));
end;
$$;
create or replace function public.pay_worker_deduction_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric, p_payment_date date, p_note text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('pay_worker_deduction_debt', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_amount', p_amount, 'p_payment_date', p_payment_date, 'p_note', p_note));
  return jsonb_build_object('fn', 'pay_worker_deduction_debt', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_amount', p_amount, 'p_payment_date', p_payment_date, 'p_note', p_note));
end;
$$;
create or replace function public.propagate_worker_salary_to_future_months(p_branch character varying, p_worker_id text, p_worker_name text, p_from_year integer, p_from_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_piece_rate numeric)
returns integer language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('propagate_worker_salary_to_future_months', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_from_year', p_from_year, 'p_from_month', p_from_month, 'p_salary_type', p_salary_type, 'p_fixed_salary_value', p_fixed_salary_value, 'p_piece_rate', p_piece_rate));
  return 1;
end;
$$;
create or replace function public.register_worker_payroll_adjustment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_type character varying, p_operation_date date, p_amount numeric, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_payment_account character varying DEFAULT 'cash'::character varying)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('register_worker_payroll_adjustment', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_operation_type', p_operation_type, 'p_operation_date', p_operation_date, 'p_amount', p_amount, 'p_reference', p_reference, 'p_note', p_note, 'p_payment_account', p_payment_account));
  return jsonb_build_object('fn', 'register_worker_payroll_adjustment', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_operation_type', p_operation_type, 'p_operation_date', p_operation_date, 'p_amount', p_amount, 'p_reference', p_reference, 'p_note', p_note, 'p_payment_account', p_payment_account));
end;
$$;
create or replace function public.register_worker_payroll_big_debt_payment(p_branch character varying, p_worker_id text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('register_worker_payroll_big_debt_payment', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_amount', p_amount));
  return jsonb_build_object('fn', 'register_worker_payroll_big_debt_payment', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_amount', p_amount));
end;
$$;
create or replace function public.register_worker_payroll_payment(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_operation_date date, p_amount numeric, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_payment_account character varying DEFAULT 'cash'::character varying)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('register_worker_payroll_payment', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_operation_date', p_operation_date, 'p_amount', p_amount, 'p_reference', p_reference, 'p_note', p_note, 'p_payment_account', p_payment_account));
  return jsonb_build_object('fn', 'register_worker_payroll_payment', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_operation_date', p_operation_date, 'p_amount', p_amount, 'p_reference', p_reference, 'p_note', p_note, 'p_payment_account', p_payment_account));
end;
$$;
create or replace function public.settle_worker_debt_from_salary(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_amount numeric, p_payment_date date, p_note text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('settle_worker_debt_from_salary', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_amount', p_amount, 'p_payment_date', p_payment_date, 'p_note', p_note));
  return jsonb_build_object('fn', 'settle_worker_debt_from_salary', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_amount', p_amount, 'p_payment_date', p_payment_date, 'p_note', p_note));
end;
$$;
create or replace function public.unlock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('unlock_worker_payroll_period', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_year', p_year, 'p_month', p_month));
  return jsonb_build_object('fn', 'unlock_worker_payroll_period', 'args', jsonb_build_object('p_branch', p_branch, 'p_year', p_year, 'p_month', p_month));
end;
$$;
create or replace function public.upsert_worker_payroll_big_debt(p_branch character varying, p_worker_id text, p_worker_name text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('upsert_worker_payroll_big_debt', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_amount', p_amount));
  return jsonb_build_object('fn', 'upsert_worker_payroll_big_debt', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_amount', p_amount));
end;
$$;
create or replace function public.upsert_worker_payroll_month_snapshot(p_branch character varying, p_worker_id text, p_worker_name text, p_year integer, p_month integer, p_basic_salary numeric, p_works_total numeric, p_allowances_total numeric, p_deductions_total numeric, p_advances_total numeric, p_operation_date date DEFAULT NULL::date, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_salary_type character varying DEFAULT 'fixed'::character varying, p_fixed_salary_value numeric DEFAULT NULL::numeric, p_piece_count numeric DEFAULT 0, p_piece_rate numeric DEFAULT 0, p_overtime_hours numeric DEFAULT 0, p_overtime_rate numeric DEFAULT 12.5)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.replica_payroll_calls (fn, actor, args) values ('upsert_worker_payroll_month_snapshot', auth.uid(), jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_basic_salary', p_basic_salary, 'p_works_total', p_works_total, 'p_allowances_total', p_allowances_total, 'p_deductions_total', p_deductions_total, 'p_advances_total', p_advances_total, 'p_operation_date', p_operation_date, 'p_reference', p_reference, 'p_note', p_note, 'p_salary_type', p_salary_type, 'p_fixed_salary_value', p_fixed_salary_value, 'p_piece_count', p_piece_count, 'p_piece_rate', p_piece_rate, 'p_overtime_hours', p_overtime_hours, 'p_overtime_rate', p_overtime_rate));
  return jsonb_build_object('fn', 'upsert_worker_payroll_month_snapshot', 'args', jsonb_build_object('p_branch', p_branch, 'p_worker_id', p_worker_id, 'p_worker_name', p_worker_name, 'p_year', p_year, 'p_month', p_month, 'p_basic_salary', p_basic_salary, 'p_works_total', p_works_total, 'p_allowances_total', p_allowances_total, 'p_deductions_total', p_deductions_total, 'p_advances_total', p_advances_total, 'p_operation_date', p_operation_date, 'p_reference', p_reference, 'p_note', p_note, 'p_salary_type', p_salary_type, 'p_fixed_salary_value', p_fixed_salary_value, 'p_piece_count', p_piece_count, 'p_piece_rate', p_piece_rate, 'p_overtime_hours', p_overtime_hours, 'p_overtime_rate', p_overtime_rate));
end;
$$;
