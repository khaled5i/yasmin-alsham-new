-- Server-side cache for Al Khobar prayer times used by attendance analysis.
-- No worker or biometric data is sent to the external prayer-time provider.

create table if not exists public.attendance_prayer_times (
  prayer_date date primary key,
  dhuhr_at timestamptz not null,
  maghrib_at timestamptz not null,
  isha_at timestamptz not null,
  source text not null default 'aladhan',
  method_id smallint not null default 4,
  method_name text,
  timezone text not null default 'Asia/Riyadh',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_prayer_times_source_length
    check (char_length(source) between 1 and 80),
  constraint attendance_prayer_times_method_id
    check (method_id between 0 and 99),
  constraint attendance_prayer_times_timezone_length
    check (char_length(timezone) between 1 and 80)
);

comment on table public.attendance_prayer_times is
  'Monthly prayer-time cache for attendance classification in Al Khobar. Contains no worker data.';

alter table public.attendance_prayer_times enable row level security;

revoke all on table public.attendance_prayer_times from anon, authenticated;
grant select, insert, update on table public.attendance_prayer_times to service_role;

-- The Next.js server route reads and refreshes this cache with service_role.
-- Attendance managers receive the sanitized values through that route only.
