-- Attendance-specific worker suspensions.
-- Raw device events remain immutable; suspension only controls reporting and visibility.

create table if not exists public.attendance_worker_suspensions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  suspended_at timestamptz not null default now(),
  resumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_worker_suspensions_valid_period
    check (resumed_at is null or resumed_at >= suspended_at)
);

create index if not exists attendance_worker_suspensions_worker_idx
  on public.attendance_worker_suspensions (worker_id);

create unique index if not exists attendance_worker_suspensions_one_active_idx
  on public.attendance_worker_suspensions (worker_id)
  where resumed_at is null;

comment on table public.attendance_worker_suspensions is
  'Attendance-only exclusion periods. Device events remain stored and unchanged.';

alter table public.attendance_worker_suspensions enable row level security;

revoke all on table public.attendance_worker_suspensions from anon, authenticated;
grant select, insert on table public.attendance_worker_suspensions to authenticated;
grant update (resumed_at, updated_at) on table public.attendance_worker_suspensions to authenticated;

drop policy if exists "Attendance managers can view worker suspensions"
  on public.attendance_worker_suspensions;
create policy "Attendance managers can view worker suspensions"
on public.attendance_worker_suspensions
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

drop policy if exists "Attendance managers can suspend workers"
  on public.attendance_worker_suspensions;
create policy "Attendance managers can suspend workers"
on public.attendance_worker_suspensions
for insert
to authenticated
with check (
  resumed_at is null
  and exists (
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

drop policy if exists "Attendance managers can resume workers"
  on public.attendance_worker_suspensions;
create policy "Attendance managers can resume workers"
on public.attendance_worker_suspensions
for update
to authenticated
using (
  resumed_at is null
  and exists (
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
  resumed_at is not null
  and exists (
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
