-- Sanitized user directory imported from the Dahua terminals.
-- Fingerprint/face templates and identity-document fields are intentionally excluded.

create table if not exists public.attendance_device_users (
  id uuid primary key default uuid_generate_v4(),
  device_id uuid not null references public.attendance_devices(id) on delete cascade,
  device_user_id text not null,
  display_name text,
  user_type text,
  user_status text,
  is_present_on_device boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, device_user_id),
  constraint attendance_device_users_user_id_length
    check (char_length(device_user_id) between 1 and 100),
  constraint attendance_device_users_display_name_length
    check (display_name is null or char_length(display_name) <= 160),
  constraint attendance_device_users_user_type_length
    check (user_type is null or char_length(user_type) <= 80),
  constraint attendance_device_users_user_status_length
    check (user_status is null or char_length(user_status) <= 80)
);

create index if not exists attendance_device_users_active_idx
  on public.attendance_device_users (device_id, device_user_id)
  where is_present_on_device;

comment on table public.attendance_device_users is
  'Sanitized terminal user directory only. Never store biometric templates, face images, fingerprints, CitizenID, or card secrets here.';

create or replace function public.sync_attendance_device_users(
  p_device_id uuid,
  p_users jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  synced_at timestamptz := now();
begin
  if jsonb_typeof(p_users) is distinct from 'array' then
    raise exception 'p_users must be a JSON array';
  end if;

  update public.attendance_device_users
  set is_present_on_device = false,
      updated_at = synced_at
  where device_id = p_device_id
    and is_present_on_device;

  insert into public.attendance_device_users (
    device_id,
    device_user_id,
    display_name,
    user_type,
    user_status,
    is_present_on_device,
    first_seen_at,
    last_seen_at,
    updated_at
  )
  select
    p_device_id,
    trim(item->>'deviceUserId'),
    nullif(trim(item->>'displayName'), ''),
    nullif(trim(item->>'userType'), ''),
    nullif(trim(item->>'userStatus'), ''),
    true,
    synced_at,
    synced_at,
    synced_at
  from jsonb_array_elements(p_users) as item
  on conflict (device_id, device_user_id) do update
  set display_name = excluded.display_name,
      user_type = excluded.user_type,
      user_status = excluded.user_status,
      is_present_on_device = true,
      last_seen_at = synced_at,
      updated_at = synced_at;

  return jsonb_array_length(p_users);
end;
$$;

revoke all on function public.sync_attendance_device_users(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_attendance_device_users(uuid, jsonb)
  to service_role;

alter table public.attendance_device_users enable row level security;

revoke all on table public.attendance_device_users from anon, authenticated;
grant select on table public.attendance_device_users to authenticated;

drop policy if exists "Attendance managers can view device users" on public.attendance_device_users;
create policy "Attendance managers can view device users"
on public.attendance_device_users
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
