-- Exercise fix batch A / payroll (migration 20261001120100): the 13 payroll RPCs are no longer
-- callable by a visitor, each one checks the role first (tailoring = admin, fabrics = admin +
-- fabric_store_manager, anything else = admin), and the original bodies sit behind them as
-- `<name>_unchecked`, callable by no API role.
--
-- SAFE ON THE LIVE DATABASE: the only calls that get past the role check are
-- unlock_worker_payroll_period for the year 2000 (an empty period) and
-- delete_worker_payroll_operation for a random id (raises "not found"). Everything runs in ONE
-- transaction that is ROLLED BACK. No income row, no temporary table.
-- Run in the Supabase SQL editor AFTER applying 20261001120100.
-- Success = the last result row reads: PASS payroll RPC access (…)
-- Before the migration it fails at case 1 (anon can still execute).

begin;

create function pg_temp.expect(p_case text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'TEST FAILED: %: expected % but got %', p_case, p_want, p_got;
  end if;
end;
$$;

create function pg_temp.staff(p_role text, p_type text)
returns uuid language sql stable as $$
  select u.id from public.users u left join public.workers w on w.user_id = u.id
  where u.role = p_role and u.is_active
    and (p_type is null and w.worker_type is null or w.worker_type = p_type)
  order by u.created_at limit 1
$$;

-- call one probe as a given account ('anon' for a visitor); returns 'NO_ERROR', or SQLSTATE:prefix
create function pg_temp.probe(p_who uuid, p_anon boolean, p_sql text) returns text language plpgsql as $$
declare
  v_result text;
begin
  if p_anon then
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute p_sql;
    v_result := 'NO_ERROR';
  exception when others then
    v_result := sqlstate || ':' || split_part(sqlerrm, '|', 1);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) privileges: nobody in the browser reaches a payroll writer except through a wrapper
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_names text[] := array['create_worker_payroll_adjustment_request', 'delete_worker_deduction_payment',
    'delete_worker_payroll_operation', 'lock_worker_payroll_period', 'pay_worker_deduction_debt',
    'propagate_worker_salary_to_future_months', 'register_worker_payroll_adjustment',
    'register_worker_payroll_big_debt_payment', 'register_worker_payroll_payment', 'settle_worker_debt_from_salary',
    'unlock_worker_payroll_period', 'upsert_worker_payroll_big_debt', 'upsert_worker_payroll_month_snapshot'];
  v_count integer := 0;
begin
  for v_fn in
    select p.oid, p.proname, p.prosrc, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (v_names)
  loop
    v_count := v_count + 1;
    perform pg_temp.expect(v_fn.proname || ': anon EXECUTE', has_function_privilege('anon', v_fn.oid, 'EXECUTE')::text, 'false');
    perform pg_temp.expect(v_fn.proname || ': authenticated EXECUTE', has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')::text, 'true');
    perform pg_temp.expect(v_fn.proname || ': wrapper is security definer with an empty search_path',
      (v_fn.prosecdef and v_fn.proconfig @> array['search_path=""'])::text, 'true');
    if v_fn.prosrc !~ '^\s*begin\s+perform private\.assert_payroll_branch_access\(' then
      raise exception 'TEST FAILED: %: the role check is not the first statement', v_fn.proname;
    end if;
    if position('public.' || v_fn.proname || '_unchecked(' in v_fn.prosrc) = 0 then
      raise exception 'TEST FAILED: %: the wrapper does not call the original', v_fn.proname;
    end if;
  end loop;
  perform pg_temp.expect('wrappers found', v_count::text, '13');

  v_count := 0;
  for v_fn in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (select x || '_unchecked' from unnest(v_names) x)
  loop
    v_count := v_count + 1;
    perform pg_temp.expect(v_fn.proname || ': anon EXECUTE', has_function_privilege('anon', v_fn.oid, 'EXECUTE')::text, 'false');
    perform pg_temp.expect(v_fn.proname || ': authenticated EXECUTE', has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')::text, 'false');
    perform pg_temp.expect(v_fn.proname || ': service_role EXECUTE', has_function_privilege('service_role', v_fn.oid, 'EXECUTE')::text, 'false');
  end loop;
  perform pg_temp.expect('originals kept as _unchecked', v_count::text, '13');

  perform pg_temp.expect('anon EXECUTE create_worker_payroll_journal_entry', has_function_privilege('anon',
    'public.create_worker_payroll_journal_entry(uuid, character varying, numeric, date, integer, integer, text, character varying)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('authenticated EXECUTE create_worker_payroll_journal_entry', has_function_privilege('authenticated',
    'public.create_worker_payroll_journal_entry(uuid, character varying, numeric, date, integer, integer, text, character varying)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('anon EXECUTE ensure_worker_payroll_month', has_function_privilege('anon',
    'public.ensure_worker_payroll_month(character varying, text, text, integer, integer)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('authenticated EXECUTE ensure_worker_payroll_month', has_function_privilege('authenticated',
    'public.ensure_worker_payroll_month(character varying, text, text, integer, integer)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('authenticated EXECUTE the role check itself',
    has_function_privilege('authenticated', 'private.assert_payroll_branch_access(text)', 'EXECUTE')::text, 'false');

  -- no other payroll writer is left open to a visitor
  perform pg_temp.expect('other security definer payroll functions open to anon',
    coalesce((select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
        and p.proname ~ '(payroll|worker_debt|deduction|worker_salary|big_debt)'), ''), '');
end $$;

-- ---------------------------------------------------------------------------
-- 2) who passes the role check (real accounts; probes are harmless and rolled back)
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := pg_temp.staff('admin', null);
  v_fabrics uuid := pg_temp.staff('worker', 'fabric_store_manager');
  v_accountant uuid := pg_temp.staff('worker', 'accountant');
  v_tailor uuid := pg_temp.staff('worker', 'tailor');
  v_workshop uuid := pg_temp.staff('worker', 'workshop_manager');
  c_tailoring constant text := 'select public.unlock_worker_payroll_period(''tailoring'', 2000, 1)';
  c_fabrics constant text := 'select public.unlock_worker_payroll_period(''fabrics'', 2000, 1)';
  c_ready constant text := 'select public.unlock_worker_payroll_period(''ready_designs'', 2000, 1)';
  c_unknown_op constant text := 'select public.delete_worker_payroll_operation(gen_random_uuid())';
  v_who uuid;
begin
  if v_admin is null or v_fabrics is null then
    raise exception 'TEST FAILED: needs an active admin and an active fabric_store_manager to impersonate';
  end if;

  perform pg_temp.expect('a visitor unlocks a tailoring month', split_part(pg_temp.probe(null, true, c_tailoring), ':', 1), '42501');
  perform pg_temp.expect('a visitor deletes an operation', split_part(pg_temp.probe(null, true, c_unknown_op), ':', 1), '42501');

  perform pg_temp.expect('admin unlocks a tailoring month', pg_temp.probe(v_admin, false, c_tailoring), 'NO_ERROR');
  perform pg_temp.expect('admin unlocks a fabrics month', pg_temp.probe(v_admin, false, c_fabrics), 'NO_ERROR');
  perform pg_temp.expect('admin unlocks a ready_designs month', pg_temp.probe(v_admin, false, c_ready), 'NO_ERROR');
  -- an unknown operation: past the role check, the original answers (live: "not found")
  if pg_temp.probe(v_admin, false, c_unknown_op) like '42501%' then
    raise exception 'TEST FAILED: admin refused by the role check on an unknown operation';
  end if;

  perform pg_temp.expect('fabric manager unlocks a fabrics month', pg_temp.probe(v_fabrics, false, c_fabrics), 'NO_ERROR');
  perform pg_temp.expect('fabric manager unlocks a tailoring month', pg_temp.probe(v_fabrics, false, c_tailoring), '42501:PAYROLL_FORBIDDEN');
  perform pg_temp.expect('fabric manager unlocks a ready_designs month', pg_temp.probe(v_fabrics, false, c_ready), '42501:PAYROLL_FORBIDDEN');
  perform pg_temp.expect('fabric manager deletes an operation of no known branch', pg_temp.probe(v_fabrics, false, c_unknown_op), '42501:PAYROLL_FORBIDDEN');

  foreach v_who in array array[v_accountant, v_tailor, v_workshop] loop
    continue when v_who is null;
    perform pg_temp.expect('a non-payroll account unlocks a tailoring month', pg_temp.probe(v_who, false, c_tailoring), '42501:PAYROLL_FORBIDDEN');
    perform pg_temp.expect('a non-payroll account unlocks a fabrics month', pg_temp.probe(v_who, false, c_fabrics), '42501:PAYROLL_FORBIDDEN');
  end loop;

  -- a browser JWT with no user id is nobody
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.unlock_worker_payroll_period('fabrics', 2000, 1);
    raise exception 'TEST FAILED: a JWT without a user id unlocked a month';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

select 'PASS payroll RPC access (13 wrappers, role check first, originals unreachable, helpers closed, no payroll writer open to anon; admin all branches, fabric manager fabrics only, accountant/tailor/workshop/visitor/no-sub refused)' as result;

rollback;
