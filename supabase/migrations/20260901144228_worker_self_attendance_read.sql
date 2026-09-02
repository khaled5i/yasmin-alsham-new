-- Allow each signed-in worker to read only the attendance rows that belong to
-- their own worker profile. Manager policies remain unchanged.

drop policy if exists "Workers can view own attendance events"
  on public.attendance_events;
create policy "Workers can view own attendance events"
on public.attendance_events
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.workers worker
    where worker.id = attendance_events.worker_id
      and worker.user_id = (select auth.uid())
  )
);

drop policy if exists "Workers can view own attendance suspensions"
  on public.attendance_worker_suspensions;
create policy "Workers can view own attendance suspensions"
on public.attendance_worker_suspensions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.workers worker
    where worker.id = attendance_worker_suspensions.worker_id
      and worker.user_id = (select auth.uid())
  )
);
