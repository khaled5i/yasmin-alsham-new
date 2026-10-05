-- Exercise fix batch A / AUD-01 (migration 20261001120000): who may read and write
-- public.income and public.expenses, and that a browser session cannot touch the alostaz
-- state of an online-store sale.
--
-- SAFE ON THE LIVE DATABASE: no row is inserted into income (that would use a shop invoice
-- number even when rolled back). Write checks use expenses (uuid key, no sequence). Real
-- staff accounts are impersonated by id only; only aggregate counts are read. Everything
-- runs in ONE transaction that is ROLLED BACK. No temporary tables (SQL Editor drops them).
-- Run in the Supabase SQL editor AFTER applying 20261001120000.
-- Success = the last result row reads: PASS finance RLS (…)
-- Before the migration it fails at case 1 (anon still has privileges).

begin;

select set_config('finance_test.income_before',
  (select count(*) from public.income)::text || '#'
  || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq), false);

create function pg_temp.expect(p_case text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'TEST FAILED: %: expected % but got %', p_case, p_want, p_got;
  end if;
end;
$$;

-- first active account of a kind (null when none exists)
create function pg_temp.staff(p_role text, p_type text, p_active boolean default true)
returns uuid language sql stable as $$
  select u.id from public.users u left join public.workers w on w.user_id = u.id
  where u.role = p_role and u.is_active = p_active
    and (p_type is null and w.worker_type is null or w.worker_type = p_type)
  order by u.created_at limit 1
$$;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.act_reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- try one expense insert as the current session; 'NO_ERROR' or the SQLSTATE
create function pg_temp.try_expense(p_branch text) returns text language plpgsql as $$
begin
  insert into public.expenses (branch, type, category, description, amount)
  values (p_branch, 'other', 'اختبار الصلاحيات', 'finance_rls test row (rolled back)', 0);
  return 'NO_ERROR';
exception when others then
  return sqlstate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) anon: no privilege on the tables, the invoice sequence, or the recurring generator
-- ---------------------------------------------------------------------------
do $$
declare
  v_priv text;
begin
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    perform pg_temp.expect('anon ' || v_priv || ' on income', has_table_privilege('anon', 'public.income', v_priv)::text, 'false');
    perform pg_temp.expect('anon ' || v_priv || ' on expenses', has_table_privilege('anon', 'public.expenses', v_priv)::text, 'false');
  end loop;
  foreach v_priv in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    perform pg_temp.expect('authenticated ' || v_priv || ' on income', has_table_privilege('authenticated', 'public.income', v_priv)::text, 'false');
    perform pg_temp.expect('authenticated ' || v_priv || ' on expenses', has_table_privilege('authenticated', 'public.expenses', v_priv)::text, 'false');
  end loop;
  perform pg_temp.expect('anon USAGE on the invoice sequence',
    has_sequence_privilege('anon', 'public.fabrics_invoice_number_seq', 'USAGE')::text, 'false');
  perform pg_temp.expect('anon UPDATE on the invoice sequence',
    has_sequence_privilege('anon', 'public.fabrics_invoice_number_seq', 'UPDATE')::text, 'false');
  perform pg_temp.expect('anon EXECUTE generate_recurring_expenses',
    has_function_privilege('anon', 'public.generate_recurring_expenses(character varying, date)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('authenticated EXECUTE generate_recurring_expenses',
    has_function_privilege('authenticated', 'public.generate_recurring_expenses(character varying, date)', 'EXECUTE')::text, 'true');
  perform pg_temp.expect('anon EXECUTE can_access_finance_branch',
    has_function_privilege('anon', 'private.can_access_finance_branch(text)', 'EXECUTE')::text, 'false');
end $$;

-- ---------------------------------------------------------------------------
-- 2) the policies: the eight staff policies only, none of them `true`
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.expect('policies on income/expenses',
    (select string_agg(tablename || '.' || policyname || ':' || cmd || ':' || roles::text, ', ' order by tablename, policyname)
     from pg_policies where schemaname = 'public' and tablename in ('income', 'expenses')),
    'expenses.expenses_staff_delete:DELETE:{authenticated}, expenses.expenses_staff_insert:INSERT:{authenticated}, '
    || 'expenses.expenses_staff_select:SELECT:{authenticated}, expenses.expenses_staff_update:UPDATE:{authenticated}, '
    || 'income.income_staff_delete:DELETE:{authenticated}, income.income_staff_insert:INSERT:{authenticated}, '
    || 'income.income_staff_select:SELECT:{authenticated}, income.income_staff_update:UPDATE:{authenticated}');
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('income', 'expenses')
             and (coalesce(qual, '') ~* '^\s*\(?\s*true\s*\)?\s*$' or coalesce(with_check, '') ~* '^\s*\(?\s*true\s*\)?\s*$')) then
    raise exception 'TEST FAILED: a policy on income/expenses is still `true`';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('income', 'expenses')
             and coalesce(qual, with_check) !~ 'can_access_finance_branch') then
    raise exception 'TEST FAILED: a policy does not go through private.can_access_finance_branch';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('income', 'expenses')
             and cmd = 'UPDATE' and coalesce(with_check, '') !~ 'can_access_finance_branch') then
    raise exception 'TEST FAILED: an UPDATE policy lets a row move to a branch the actor does not hold';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) anon reads nothing and writes nothing
-- ---------------------------------------------------------------------------
do $$
declare
  v_err text;
begin
  set local role anon;
  begin
    perform count(*) from public.income;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlstate;
  end;
  perform pg_temp.expect('anon reads income', v_err, '42501');
  begin
    perform count(*) from public.expenses;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlstate;
  end;
  perform pg_temp.expect('anon reads expenses', v_err, '42501');
  perform pg_temp.expect('anon inserts an expense', pg_temp.try_expense('fabrics'), '42501');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4) the role matrix with real accounts (aggregate counts only)
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := pg_temp.staff('admin', null);
  v_fabrics uuid := pg_temp.staff('worker', 'fabric_store_manager');
  v_accountant uuid := pg_temp.staff('worker', 'accountant');
  v_tailor uuid := pg_temp.staff('worker', 'tailor');
  v_workshop uuid := pg_temp.staff('worker', 'workshop_manager');
  v_gm uuid := pg_temp.staff('worker', 'general_manager');
  v_all_income bigint := (select count(*) from public.income);
  v_fab_income bigint := (select count(*) from public.income where branch = 'fabrics');
  v_all_exp bigint := (select count(*) from public.expenses);
  v_fab_exp bigint := (select count(*) from public.expenses where branch = 'fabrics');
  v_n bigint;
  v_m bigint;
  v_who uuid;
begin
  if v_admin is null or v_fabrics is null then
    raise exception 'TEST FAILED: needs an active admin and an active fabric_store_manager to impersonate';
  end if;

  -- admin: everything
  perform pg_temp.act_as(v_admin);
  select count(*) into v_n from public.income;
  select count(*) into v_m from public.expenses;
  perform pg_temp.act_reset();
  perform pg_temp.expect('admin sees all income', v_n::text, v_all_income::text);
  perform pg_temp.expect('admin sees all expenses', v_m::text, v_all_exp::text);
  perform pg_temp.act_as(v_admin);
  perform pg_temp.expect('admin adds a fabrics expense', pg_temp.try_expense('fabrics'), 'NO_ERROR');
  perform pg_temp.expect('admin adds a tailoring expense', pg_temp.try_expense('tailoring'), 'NO_ERROR');
  perform pg_temp.act_reset();

  -- fabric_store_manager: the fabrics branch, all of it, nothing else
  -- (baseline again: the admin rows above are still in this transaction)
  v_fab_income := (select count(*) from public.income where branch = 'fabrics');
  v_fab_exp := (select count(*) from public.expenses where branch = 'fabrics');
  perform pg_temp.act_as(v_fabrics);
  select count(*), count(*) filter (where branch <> 'fabrics') into v_n, v_m from public.income;
  perform pg_temp.act_reset();
  perform pg_temp.expect('fabric manager sees every fabrics sale', v_n::text, v_fab_income::text);
  perform pg_temp.expect('fabric manager sees no other branch', v_m::text, '0');
  perform pg_temp.act_as(v_fabrics);
  select count(*), count(*) filter (where branch <> 'fabrics') into v_n, v_m from public.expenses;
  perform pg_temp.act_reset();
  perform pg_temp.expect('fabric manager sees every fabrics expense', v_n::text, v_fab_exp::text);
  perform pg_temp.expect('fabric manager sees no other branch expense', v_m::text, '0');
  perform pg_temp.act_as(v_fabrics);
  perform pg_temp.expect('fabric manager adds a fabrics expense', pg_temp.try_expense('fabrics'), 'NO_ERROR');
  perform pg_temp.expect('fabric manager adds a tailoring expense', pg_temp.try_expense('tailoring'), '42501');
  -- cannot move its own fabrics row out of the branch (the UPDATE policy's with check)
  begin
    update public.expenses set branch = 'tailoring'
    where description = 'finance_rls test row (rolled back)' and branch = 'fabrics';
    get diagnostics v_n = row_count;
    v_who := null;
  exception when others then
    v_n := -1;
    v_who := case when sqlstate = '42501' then v_fabrics end;
  end;
  perform pg_temp.act_reset();
  perform pg_temp.expect('fabric manager moves a fabrics expense to tailoring',
    case when v_n = -1 and v_who is not null then 'refused' else 'moved ' || v_n end, 'refused');

  -- accountant: tailoring + ready_designs, nothing of fabrics
  if v_accountant is null then
    raise notice 'skipped: no active accountant';
  else
    perform pg_temp.act_as(v_accountant);
    select count(*), count(*) filter (where branch = 'fabrics') into v_n, v_m from public.income;
    perform pg_temp.act_reset();
    perform pg_temp.expect('accountant sees every tailoring/ready_designs sale', v_n::text,
      (select count(*) from public.income where branch <> 'fabrics')::text);
    perform pg_temp.expect('accountant sees no fabrics sale', v_m::text, '0');
    perform pg_temp.act_as(v_accountant);
    select count(*) filter (where branch = 'fabrics') into v_m from public.expenses;
    perform pg_temp.act_reset();
    perform pg_temp.expect('accountant sees no fabrics expense', v_m::text, '0');
    perform pg_temp.act_as(v_accountant);
    perform pg_temp.expect('accountant adds a tailoring expense', pg_temp.try_expense('tailoring'), 'NO_ERROR');
    perform pg_temp.expect('accountant adds a ready_designs expense', pg_temp.try_expense('ready_designs'), 'NO_ERROR');
    perform pg_temp.expect('accountant adds a fabrics expense', pg_temp.try_expense('fabrics'), '42501');
    -- a no-op update: under the policy no fabrics row is even visible
    update public.income set notes = notes where branch = 'fabrics';
    get diagnostics v_n = row_count;
    perform pg_temp.act_reset();
    perform pg_temp.expect('accountant updates fabrics sales', v_n::text, '0');
  end if;

  -- no finance access at all
  foreach v_who in array array[v_tailor, v_workshop, v_gm] loop
    continue when v_who is null;
    perform pg_temp.act_as(v_who);
    select (select count(*) from public.income) + (select count(*) from public.expenses) into v_n;
    perform pg_temp.expect('a non-finance account inserts an expense', pg_temp.try_expense('fabrics'), '42501');
    perform pg_temp.act_reset();
    perform pg_temp.expect('a non-finance account sees rows', v_n::text, '0');
  end loop;

  -- an inactive admin is nobody
  v_who := pg_temp.staff('admin', null, false);
  if v_who is not null then
    perform pg_temp.act_as(v_who);
    select count(*) into v_n from public.income;
    perform pg_temp.act_reset();
    perform pg_temp.expect('an inactive admin sees income', v_n::text, '0');
  end if;

  -- a browser JWT with no user id is nobody
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.income;
  perform pg_temp.act_reset();
  perform pg_temp.expect('a JWT without a user id sees income', v_n::text, '0');
end $$;

-- ---------------------------------------------------------------------------
-- 5) the alostaz state of an online-store sale: never from a browser session
--    (live has no online sale yet → skipped there; the local suite always runs it)
-- ---------------------------------------------------------------------------
do $$
declare
  v_income uuid;
  v_admin uuid := pg_temp.staff('admin', null);
  v_err text;
begin
  select o.income_id into v_income from public.fabric_store_orders o where o.income_id is not null limit 1;
  if v_income is null then
    raise notice 'skipped: no online-store sale exists yet';
    return;
  end if;
  perform pg_temp.act_as(v_admin);
  -- every alostaz column on its own, then together
  begin
    update public.income set alostaz_sync_status = 'failed' where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := split_part(sqlerrm, '|', 1);
  end;
  perform pg_temp.expect('admin (browser) changes only the alostaz sync status', v_err, 'FABRIC_STORE_ONLINE_SALE_LOCKED');
  begin
    update public.income set alostaz_sync_error = coalesce(alostaz_sync_error, '') || 'x' where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := split_part(sqlerrm, '|', 1);
  end;
  perform pg_temp.expect('admin (browser) changes only the alostaz sync error', v_err, 'FABRIC_STORE_ONLINE_SALE_LOCKED');
  begin
    update public.income set alostaz_sync_token = gen_random_uuid() where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := split_part(sqlerrm, '|', 1);
  end;
  perform pg_temp.expect('admin (browser) takes the alostaz send claim', v_err, 'FABRIC_STORE_ONLINE_SALE_LOCKED');
  begin
    update public.income set alostaz_sync_status = 'failed', alostaz_sync_error = null where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := split_part(sqlerrm, '|', 1);
  end;
  perform pg_temp.expect('admin (browser) resets the alostaz state of an online sale', v_err, 'FABRIC_STORE_ONLINE_SALE_LOCKED');
  begin
    update public.income set alostaz_invoice_id = 999999 where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := split_part(sqlerrm, '|', 1);
  end;
  perform pg_temp.expect('admin (browser) fakes an alostaz invoice id', v_err, 'FABRIC_STORE_ONLINE_SALE_LOCKED');
  begin
    update public.income set notes = coalesce(notes, '') where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.act_reset();
  perform pg_temp.expect('admin (browser) edits the notes of an online sale', v_err, 'NO_ERROR');

  set local role service_role;
  begin
    update public.income set alostaz_sync_error = alostaz_sync_error || '' where id = v_income;
    update public.income set alostaz_synced_at = coalesce(alostaz_synced_at, now()) where id = v_income;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  reset role;
  perform pg_temp.expect('the server writes the alostaz state', v_err, 'NO_ERROR');
end $$;

-- ---------------------------------------------------------------------------
-- 6) the shop was not touched: no income row, no invoice number used
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.income)::text || '#'
     || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq)
     is distinct from current_setting('finance_test.income_before', true) then
    raise exception 'TEST FAILED: this test must not create a sale nor use an invoice number';
  end if;
end $$;

select 'PASS finance RLS (anon has nothing, the eight staff policies, admin all, fabric manager = fabrics only and cannot move a row out, accountant = tailoring + ready_designs, tailor/workshop/general manager/inactive/no-sub see nothing, online-sale alostaz state is server-only, no income row and no invoice number used)' as result;

rollback;
