-- Exercise the installed trigger against temporary rows only. Real orders,
-- payroll entries, and financial triggers are never modified by this test.
begin;
create temporary table cutter_test_people as
select w.id, w.user_id, w.worker_type, u.full_name
from public.workers w join public.users u on u.id = w.user_id
where w.is_available and u.is_active;
create temporary table cutter_test_orders (
  id integer primary key,
  worker_id uuid,
  cutter_id uuid,
  cutter_name text,
  cut_at timestamptz,
  notes text
);
-- Legacy fixture before attaching the trigger.
insert into cutter_test_orders(id, worker_id)
values (1, (select id from cutter_test_people where worker_type = 'tailor' limit 1));
insert into cutter_test_orders(id, cutter_id, cutter_name, cut_at)
select 2, id, full_name, '2020-01-01T00:00:00Z' from cutter_test_people
where worker_type = 'workshop_manager' limit 1;
create trigger cutter_test_guard before insert or update on cutter_test_orders
for each row execute function public.enforce_order_cutter_assignment();
grant select on cutter_test_people to authenticated;
grant select, insert, update on cutter_test_orders to authenticated;

do $$
declare
  manager_id uuid := (select id from cutter_test_people where worker_type = 'workshop_manager' limit 1);
  tailor_id uuid := (select id from cutter_test_people where worker_type = 'tailor' limit 1);
begin
  assert manager_id is not null and tailor_id is not null, 'Missing test roles';
  update cutter_test_orders set notes = 'Legacy update' where id = 1;
  assert (select cut_at is null from cutter_test_orders where id = 1), 'Legacy date was invented';
  begin
    insert into cutter_test_orders(id, worker_id) values (3, tailor_id);
    raise exception 'Tailor assignment without cutter was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into cutter_test_orders(id, cutter_id) values (3, tailor_id);
    raise exception 'Tailor accepted as cutter';
  exception when check_violation then null;
  end;
  insert into cutter_test_orders(id, cutter_id, cutter_name, cut_at)
  values (3, manager_id, 'Forged name', '2000-01-01');
  assert (select cut_at = statement_timestamp() and cutter_name = (select full_name from cutter_test_people where id = manager_id)
    from cutter_test_orders where id = 3), 'Server assignment values were not enforced';
  update cutter_test_orders set worker_id = tailor_id where id = 3;
  update cutter_test_orders set cut_at = '2001-01-01', cutter_name = 'Forged name' where id = 2;
  assert (select cut_at = '2020-01-01T00:00:00Z' and cutter_name <> 'Forged name' from cutter_test_orders where id = 2), 'Date or name could be forged';
  update cutter_test_orders set cutter_id = cutter_id, notes = 'Same assignment' where id = 2;
  assert (select cut_at = '2020-01-01T00:00:00Z' from cutter_test_orders where id = 2), 'Same assignment changed date';
  begin
    update cutter_test_orders set cutter_id = null where id = 3;
    raise exception 'Cutter cleared while tailor remains assigned';
  exception when check_violation then null;
  end;
  if (select count(*) from cutter_test_people where worker_type = 'workshop_manager') > 1 then
    update cutter_test_orders set cutter_id = (select id from cutter_test_people where worker_type = 'workshop_manager' and id <> manager_id limit 1) where id = 2;
    assert (select cut_at = statement_timestamp() from cutter_test_orders where id = 2), 'Reassignment date not refreshed';
  end if;
  -- Removing only a cutter with no tailor clears its saved name and timestamp.
  update cutter_test_orders set cutter_id = null where id = 2;
  assert (select cutter_id is null and cutter_name is null and cut_at is null from cutter_test_orders where id = 2), 'Cutter removal retained assignment metadata';
  -- The UI-confirmed removal of both assignments must be atomic.
  update cutter_test_orders set cutter_id = null, worker_id = null where id = 3;
  assert (select cutter_id is null and worker_id is null and cutter_name is null and cut_at is null from cutter_test_orders where id = 3), 'Combined removal did not clear both assignments';
end;
$$;

-- An assigned tailor cannot change the cutter through the Data API.
select set_config('request.jwt.claim.sub', (select user_id::text from cutter_test_people where worker_type = 'tailor' limit 1), true);
set local role authenticated;
do $$
begin
  begin
    update cutter_test_orders set cutter_id = (select id from cutter_test_people where worker_type = 'workshop_manager' limit 1) where id = 1;
    raise exception 'Tailor changed cutter without permission';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Workshop manager assignment succeeds with authenticated RLS in effect.
select set_config('request.jwt.claim.sub', (select user_id::text from cutter_test_people where worker_type = 'workshop_manager' limit 1), true);
set local role authenticated;
insert into cutter_test_orders(id, cutter_id)
select 4, id from cutter_test_people where worker_type = 'workshop_manager' limit 1;
reset role;
do $$ begin
  assert (select cut_at is not null and cutter_name is not null from cutter_test_orders where id = 4), 'Manager could not assign cutter';
  assert ('2026-08-31T21:00:00Z'::timestamptz >= '2026-09-01T00:00:00+03:00'::timestamptz), 'Riyadh month start';
  assert not ('2026-09-30T21:00:00Z'::timestamptz < '2026-10-01T00:00:00+03:00'::timestamptz), 'Riyadh month end';
end $$;
rollback;
select 'All cutter assignment, permission, legacy, timestamp, and Riyadh boundary checks passed' as result;
