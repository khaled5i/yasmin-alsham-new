-- Consolidate manager and worker self-service SELECT rules into one policy per table.
-- This preserves manager access while avoiding multiple permissive policies.

drop policy if exists "Attendance managers can view events"
  on public.attendance_events;
drop policy if exists "Workers can view own attendance events"
  on public.attendance_events;
create policy "Authorized users can view attendance events"
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
  or exists (
    select 1
    from public.workers worker
    where worker.id = attendance_events.worker_id
      and worker.user_id = (select auth.uid())
  )
);

drop policy if exists "Attendance managers can view worker suspensions"
  on public.attendance_worker_suspensions;
drop policy if exists "Workers can view own attendance suspensions"
  on public.attendance_worker_suspensions;
create policy "Authorized users can view attendance suspensions"
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
  or exists (
    select 1
    from public.workers worker
    where worker.id = attendance_worker_suspensions.worker_id
      and worker.user_id = (select auth.uid())
  )
);
