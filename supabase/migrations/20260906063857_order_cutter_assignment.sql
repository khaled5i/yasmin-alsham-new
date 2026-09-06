-- Keep legacy orders unchanged: cutting dates are only recorded on assignment.
alter table public.orders
  add column cutter_id uuid references public.workers(id) on delete restrict,
  add column cutter_name text,
  add column cut_at timestamptz;

create index orders_cutter_cut_at_idx on public.orders(cutter_id, cut_at desc)
  where cutter_id is not null;

create function public.enforce_order_cutter_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cutter_changed boolean;
  worker_changed boolean;
  assigned_name text;
begin
  if tg_op = 'INSERT' then
    cutter_changed := new.cutter_id is not null;
    worker_changed := new.worker_id is not null;
    new.cut_at := null;
    new.cutter_name := null;
  else
    cutter_changed := new.cutter_id is distinct from old.cutter_id;
    worker_changed := new.worker_id is distinct from old.worker_id;
    -- Clients cannot forge the timestamp or the saved name.
    new.cut_at := old.cut_at;
    new.cutter_name := old.cutter_name;
  end if;

  if cutter_changed then
    if current_user not in ('postgres', 'service_role') and not (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
      or exists (select 1 from public.workers where user_id = auth.uid() and worker_type = 'workshop_manager')
    ) then
      raise exception 'Only administrators and workshop managers can assign the cutter' using errcode = '42501';
    end if;

    if new.cutter_id is not null then
      select u.full_name into assigned_name
      from public.workers w join public.users u on u.id = w.user_id
      where w.id = new.cutter_id and w.worker_type = 'workshop_manager'
        and w.is_available and u.is_active;
      if not found then
        raise exception 'القصّاص يجب أن يكون مدير ورشة متاحاً / Cutter must be an active workshop manager' using errcode = '23514';
      end if;
      new.cutter_name := assigned_name;
      new.cut_at := statement_timestamp();
    else
      new.cutter_name := null;
      new.cut_at := null;
    end if;
  end if;

  if new.worker_id is not null and new.cutter_id is null and (worker_changed or cutter_changed) then
    raise exception 'يجب اختيار القصّاص قبل العامل الخياط / Select the cutter before assigning the tailor' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_order_cutter_assignment
before insert or update on public.orders
for each row execute function public.enforce_order_cutter_assignment();

comment on column public.orders.cut_at is 'Server timestamp of the current cutter assignment; never inferred for legacy orders.';
comment on column public.orders.cutter_name is 'Name at assignment, retained for order lists and historical display.';
