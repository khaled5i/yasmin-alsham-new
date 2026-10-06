-- Exercise batch E (migration 20261006120000): fabric_store_purge_addresses refuses any retention
-- shorter than 90 days (review R-CD-06), still for the server only.
--
-- SAFE ON THE LIVE DATABASE: the only purge call that could erase anything uses exactly 90 days (the
-- job's own default) and everything runs in ONE transaction that is ROLLED BACK. No income row.
-- Run after the batch D and E migrations, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store purge retention floor (…)

begin;

create function pg_temp.expect_status(p_case text, p_result jsonb, p_status text)
returns void language plpgsql as $$
begin
  if p_result ->> 'status' is distinct from p_status then
    raise exception 'TEST FAILED: %: expected status % but got: %', p_case, p_status, p_result;
  end if;
end;
$$;

do $$
declare
  v_retention interval;
begin
  if has_function_privilege('anon', 'public.fabric_store_purge_addresses(integer, interval)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fabric_store_purge_addresses(integer, interval)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fabric_store_purge_addresses(integer, interval)', 'EXECUTE') then
    raise exception 'TEST FAILED: the purge is for the server only';
  end if;
  set local role service_role;
  foreach v_retention in array array[interval '-1 day', interval '0', interval '1 day', interval '89 days 23 hours'] loop
    perform pg_temp.expect_status('retention ' || v_retention, public.fabric_store_purge_addresses(500, v_retention), 'bad_request');
  end loop;
  perform pg_temp.expect_status('null retention', public.fabric_store_purge_addresses(500, null), 'bad_request');
  perform pg_temp.expect_status('exactly 90 days', public.fabric_store_purge_addresses(500, interval '90 days'), 'ok');
  perform pg_temp.expect_status('the default', public.fabric_store_purge_addresses(500), 'ok');
  reset role;
end $$;

select 'PASS fabric_store purge retention floor (server only; below 90 days refused, 90 days and the default accepted)' as result;

rollback;
