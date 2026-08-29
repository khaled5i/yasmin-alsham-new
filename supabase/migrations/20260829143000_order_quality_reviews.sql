-- مراجعات البروفا الأولى والثانية والفستان النهائي.
-- التفاصيل الداخلية (المقاسات والأخطاء والصوت) محفوظة في جدول محمي، بينما
-- تحمل orders حالات الجاهزية الآمنة فقط لعرضها في صفحة تتبع الزبونة.

alter table public.orders
  add column if not exists first_proof_review_status text not null default 'pending',
  add column if not exists first_proof_reviewed_at timestamptz,
  add column if not exists second_proof_review_status text not null default 'pending',
  add column if not exists second_proof_reviewed_at timestamptz,
  add column if not exists final_review_status text not null default 'pending',
  add column if not exists final_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_first_proof_review_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_first_proof_review_status_check
      check (first_proof_review_status in ('pending', 'passed', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_second_proof_review_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_second_proof_review_status_check
      check (second_proof_review_status in ('pending', 'passed', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_final_review_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_final_review_status_check
      check (final_review_status in ('pending', 'passed', 'failed'));
  end if;
end;
$$;

create table if not exists public.order_quality_review_attempts (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage text not null check (stage in ('first_proof', 'second_proof', 'final_dress')),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('passed', 'failed')),
  measurement_checks jsonb not null,
  design_matches boolean not null,
  discrepancy_text text,
  voice_notes jsonb not null default '[]'::jsonb,
  reviewed_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint order_quality_review_measurements_array_check
    check (jsonb_typeof(measurement_checks) = 'array' and jsonb_array_length(measurement_checks) > 0),
  constraint order_quality_review_voice_notes_array_check
    check (jsonb_typeof(voice_notes) = 'array'),
  constraint order_quality_review_attempt_unique
    unique (order_id, stage, attempt_number)
);

create index if not exists order_quality_review_latest_idx
  on public.order_quality_review_attempts (order_id, stage, attempt_number desc);

comment on table public.order_quality_review_attempts is
  'Immutable internal quality-review attempts for first proof, second proof, and final dress.';
comment on column public.order_quality_review_attempts.voice_notes is
  'Base64 audio and transcription using the same shape as design_summary_notes.';

create schema if not exists private;

create or replace function private.prepare_order_quality_review_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  order_has_second_proof boolean;
  latest_status text;
  has_invalid_check boolean;
  has_mismatch boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;

  select orders.has_second_proof
    into order_has_second_proof
  from public.orders orders
  where orders.id = new.order_id;

  if not found then
    raise exception 'order_not_found_or_not_accessible';
  end if;

  if new.stage = 'second_proof' and not coalesce(order_has_second_proof, false) then
    raise exception 'second_proof_not_enabled_for_order';
  end if;

  select attempts.status
    into latest_status
  from public.order_quality_review_attempts attempts
  where attempts.order_id = new.order_id
    and attempts.stage = new.stage
  order by attempts.attempt_number desc
  limit 1;

  if latest_status = 'passed' then
    raise exception 'passed_review_cannot_be_retested';
  end if;

  if jsonb_typeof(new.measurement_checks) is distinct from 'array'
    or jsonb_array_length(new.measurement_checks) = 0 then
    raise exception 'measurement_checks_required';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(new.measurement_checks) check_item
    where jsonb_typeof(check_item -> 'matched') is distinct from 'boolean'
      or coalesce(check_item ->> 'key', '') = ''
      or coalesce(check_item ->> 'expected_value', '') = ''
  ) into has_invalid_check;

  if has_invalid_check then
    raise exception 'invalid_measurement_check';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(new.measurement_checks) check_item
    where (check_item ->> 'matched')::boolean is not true
  ) into has_mismatch;

  if new.design_matches is false
    and coalesce(btrim(new.discrepancy_text), '') = ''
    and jsonb_array_length(coalesce(new.voice_notes, '[]'::jsonb)) = 0 then
    raise exception 'design_discrepancy_details_required';
  end if;

  new.attempt_number := coalesce((
    select max(attempts.attempt_number)
    from public.order_quality_review_attempts attempts
    where attempts.order_id = new.order_id
      and attempts.stage = new.stage
  ), 0) + 1;
  new.status := case
    when not has_mismatch and new.design_matches then 'passed'
    else 'failed'
  end;
  new.reviewed_by := (select auth.uid());
  new.created_at := now();
  new.voice_notes := coalesce(new.voice_notes, '[]'::jsonb);
  new.discrepancy_text := nullif(btrim(new.discrepancy_text), '');

  return new;
end;
$$;

create or replace function private.sync_order_quality_review_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage = 'first_proof' then
    update public.orders
    set first_proof_review_status = new.status,
        first_proof_reviewed_at = new.created_at
    where id = new.order_id;
  elsif new.stage = 'second_proof' then
    update public.orders
    set second_proof_review_status = new.status,
        second_proof_reviewed_at = new.created_at
    where id = new.order_id;
  else
    update public.orders
    set final_review_status = new.status,
        final_reviewed_at = new.created_at
    where id = new.order_id;
  end if;

  if not found then
    raise exception 'order_review_status_sync_failed';
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_order_quality_review_attempt() from public, anon, authenticated;
revoke all on function private.sync_order_quality_review_status() from public, anon, authenticated;

drop trigger if exists prepare_order_quality_review_attempt
  on public.order_quality_review_attempts;
create trigger prepare_order_quality_review_attempt
before insert on public.order_quality_review_attempts
for each row
execute function private.prepare_order_quality_review_attempt();

drop trigger if exists sync_order_quality_review_status
  on public.order_quality_review_attempts;
create trigger sync_order_quality_review_status
after insert on public.order_quality_review_attempts
for each row
execute function private.sync_order_quality_review_status();

alter table public.order_quality_review_attempts enable row level security;

revoke all on table public.order_quality_review_attempts from anon, authenticated;
grant select, insert on table public.order_quality_review_attempts to authenticated;
grant select, insert on table public.order_quality_review_attempts to service_role;

drop policy if exists "Quality reviewers can view attempts"
  on public.order_quality_review_attempts;
create policy "Quality reviewers can view attempts"
on public.order_quality_review_attempts
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

drop policy if exists "Quality reviewers can create attempts"
  on public.order_quality_review_attempts;
create policy "Quality reviewers can create attempts"
on public.order_quality_review_attempts
for insert
to authenticated
with check (
  reviewed_by = (select auth.uid())
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
