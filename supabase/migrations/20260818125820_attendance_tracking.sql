-- Secure attendance storage for the two Dahua entry/exit terminals.
-- Biometric templates and face/fingerprint images are intentionally not stored.

create table if not exists public.attendance_devices (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  direction text not null check (direction in ('entry', 'exit')),
  is_active boolean not null default true,
  connector_id text,
  last_seen_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_devices_code_format
    check (code ~ '^[a-z0-9][a-z0-9_-]{2,49}$')
);

create table if not exists public.attendance_worker_mappings (
  id uuid primary key default uuid_generate_v4(),
  device_id uuid not null references public.attendance_devices(id) on delete cascade,
  device_user_id text not null,
  worker_id uuid not null references public.workers(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, device_user_id)
);

create table if not exists public.attendance_events (
  id uuid primary key default uuid_generate_v4(),
  event_key text not null unique,
  device_id uuid not null references public.attendance_devices(id) on delete restrict,
  worker_id uuid references public.workers(id) on delete set null,
  device_user_id text not null,
  device_person_name text,
  direction text not null check (direction in ('entry', 'exit')),
  occurred_at timestamptz not null,
  verification_method smallint,
  attendance_state smallint,
  was_successful boolean not null default true,
  received_at timestamptz not null default now(),
  constraint attendance_events_event_key_format
    check (event_key ~ '^[a-f0-9]{64}$')
);

create index if not exists attendance_events_occurred_at_idx
  on public.attendance_events (occurred_at desc);
create index if not exists attendance_events_worker_occurred_idx
  on public.attendance_events (worker_id, occurred_at desc);
create index if not exists attendance_events_unmapped_idx
  on public.attendance_events (device_id, device_user_id)
  where worker_id is null;
create index if not exists attendance_worker_mappings_worker_idx
  on public.attendance_worker_mappings (worker_id)
  where is_active;

create schema if not exists private;

create or replace function private.apply_attendance_worker_mapping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    update public.attendance_events
    set worker_id = new.worker_id
    where device_id = new.device_id
      and device_user_id = new.device_user_id
      and worker_id is distinct from new.worker_id;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_attendance_worker_mapping() from public, anon, authenticated;

drop trigger if exists apply_attendance_worker_mapping_after_write
  on public.attendance_worker_mappings;
create trigger apply_attendance_worker_mapping_after_write
after insert or update of worker_id, is_active
on public.attendance_worker_mappings
for each row
execute function private.apply_attendance_worker_mapping();

comment on table public.attendance_events is
  'Sanitized attendance events only. Never store biometric templates or fingerprint/face images here.';
comment on column public.attendance_events.device_person_name is
  'Optional display name reported by the terminal; protected by RLS.';

insert into public.attendance_devices (code, name, direction)
values
  ('workshop-entry', 'جهاز الدخول', 'entry'),
  ('workshop-exit', 'جهاز الخروج', 'exit')
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    updated_at = now();

alter table public.attendance_devices enable row level security;
alter table public.attendance_worker_mappings enable row level security;
alter table public.attendance_events enable row level security;

revoke all on table public.attendance_devices from anon, authenticated;
revoke all on table public.attendance_worker_mappings from anon, authenticated;
revoke all on table public.attendance_events from anon, authenticated;

grant select on table public.attendance_devices to authenticated;
grant select, insert, update, delete on table public.attendance_worker_mappings to authenticated;
grant select on table public.attendance_events to authenticated;

drop policy if exists "Attendance managers can view devices" on public.attendance_devices;
create policy "Attendance managers can view devices"
on public.attendance_devices
for select
to authenticated
using (
  exists (
    select 1
    from public.users profile
    left join public.workers worker on worker.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and worker.worker_type = 'workshop_manager')
      )
  )
);

drop policy if exists "Attendance managers can view mappings" on public.attendance_worker_mappings;
create policy "Attendance managers can view mappings"
on public.attendance_worker_mappings
for select
to authenticated
using (
  exists (
    select 1
    from public.users profile
    left join public.workers manager on manager.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and manager.worker_type = 'workshop_manager')
      )
  )
);

drop policy if exists "Attendance managers can create mappings" on public.attendance_worker_mappings;
create policy "Attendance managers can create mappings"
on public.attendance_worker_mappings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users profile
    left join public.workers manager on manager.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and manager.worker_type = 'workshop_manager')
      )
  )
);

drop policy if exists "Attendance managers can update mappings" on public.attendance_worker_mappings;
create policy "Attendance managers can update mappings"
on public.attendance_worker_mappings
for update
to authenticated
using (
  exists (
    select 1
    from public.users profile
    left join public.workers manager on manager.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and manager.worker_type = 'workshop_manager')
      )
  )
)
with check (
  exists (
    select 1
    from public.users profile
    left join public.workers manager on manager.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and manager.worker_type = 'workshop_manager')
      )
  )
);

drop policy if exists "Attendance managers can delete mappings" on public.attendance_worker_mappings;
create policy "Attendance managers can delete mappings"
on public.attendance_worker_mappings
for delete
to authenticated
using (
  exists (
    select 1
    from public.users profile
    left join public.workers manager on manager.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and manager.worker_type = 'workshop_manager')
      )
  )
);

drop policy if exists "Attendance managers can view events" on public.attendance_events;
create policy "Attendance managers can view events"
on public.attendance_events
for select
to authenticated
using (
  exists (
    select 1
    from public.users profile
    left join public.workers manager on manager.user_id = profile.id
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or (profile.role = 'worker' and manager.worker_type = 'workshop_manager')
      )
  )
);
