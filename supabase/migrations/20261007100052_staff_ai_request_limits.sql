-- Owner applies this file from SQL Editor; no production execution by the assistant.
-- Separate staff AI counters: no financial, payroll, store hold or stock tables touched.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('private.staff_ai_request_limits') is not null
    or to_regprocedure('public.staff_ai_take_request_budget(uuid,text)') is not null then
    raise exception 'STAFF_AI_BUDGET_EXISTS: inspect the existing definitions; do not overwrite';
  end if;
end;
$$;

create table private.staff_ai_request_limits (
  subject_id uuid not null,
  operation_group text not null check (operation_group in ('text','image','ocr','audio')),
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds in (600,86400)),
  hits integer not null check (hits >= 0),
  primary key (subject_id, operation_group, window_seconds, window_start)
);
alter table private.staff_ai_request_limits enable row level security;
revoke all on table private.staff_ai_request_limits from public, anon, authenticated, service_role;

-- SECURITY DEFINER is required to reach the closed private counter table.
-- EXECUTE is granted only to service_role; the verified user is checked again below.
create function public.staff_ai_take_request_budget(p_user_id uuid, p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_group text;
  v_short_limit integer;
  v_day_limit integer;
  v_now timestamptz := clock_timestamp();
  v_short_start timestamptz;
  v_day_start timestamptz;
  v_short_hits integer := 0;
  v_day_hits integer := 0;
  v_retry integer := 0;
begin
  if not exists (select 1 from public.users u where u.id=p_user_id
    and u.is_active is true and u.role in ('admin','worker')) then
    return jsonb_build_object('status','forbidden');
  end if;
  case p_operation
    when 'translate-text', 'generate-design-prompt' then
      v_group := 'text'; v_short_limit := 120; v_day_limit := 2000;
    when 'generate-design-image', 'convert-to-cartoon', 'remove-model' then
      v_group := 'image'; v_short_limit := 30; v_day_limit := 200;
    when 'spatial-ocr' then
      v_group := 'ocr'; v_short_limit := 60; v_day_limit := 500;
    when 'transcribe-audio' then
      v_group := 'audio'; v_short_limit := 40; v_day_limit := 300;
    else
      return jsonb_build_object('status','bad_request');
  end case;

  -- Serialize only this employee and group across all Vercel instances.
  perform pg_advisory_xact_lock(hashtextextended('staff_ai:'||p_user_id::text||':'||v_group,0));
  v_now := clock_timestamp();
  v_short_start := to_timestamp(floor(extract(epoch from v_now)/600)*600);
  v_day_start := to_timestamp(floor(extract(epoch from v_now)/86400)*86400);
  select coalesce(max(r.hits) filter (where r.window_seconds=600 and r.window_start=v_short_start),0),
         coalesce(max(r.hits) filter (where r.window_seconds=86400 and r.window_start=v_day_start),0)
    into v_short_hits,v_day_hits
    from private.staff_ai_request_limits r
    where r.subject_id=p_user_id and r.operation_group=v_group
      and r.window_start in (v_short_start,v_day_start);
  if v_short_hits >= v_short_limit then
    v_retry := greatest(1,ceil(extract(epoch from v_short_start+interval '10 minutes'-v_now))::integer);
  end if;
  if v_day_hits >= v_day_limit then
    v_retry := greatest(v_retry,1,ceil(extract(epoch from v_day_start+interval '1 day'-v_now))::integer);
  end if;
  if v_retry > 0 then
    return jsonb_build_object('status','rate_limited','retry_after_seconds',v_retry);
  end if;

  insert into private.staff_ai_request_limits as r (subject_id,operation_group,window_start,window_seconds,hits)
    values (p_user_id,v_group,v_short_start,600,1),(p_user_id,v_group,v_day_start,86400,1)
    on conflict (subject_id,operation_group,window_seconds,window_start)
    do update set hits=r.hits+1;
  -- Bounded cleanup of this subject/group only; other counters and store tables are untouched.
  delete from private.staff_ai_request_limits r
    where r.ctid in (select stale.ctid from private.staff_ai_request_limits stale
      where stale.subject_id=p_user_id and stale.operation_group=v_group
        and stale.window_start < v_now-interval '2 days'
      order by stale.window_start limit 100);
  return jsonb_build_object('status','allowed');
end;
$$;

revoke all on function public.staff_ai_take_request_budget(uuid,text) from public, anon, authenticated;
grant execute on function public.staff_ai_take_request_budget(uuid,text) to service_role;
comment on function public.staff_ai_take_request_budget(uuid,text) is
  'Staff AI per-user distributed budget; service_role only; active admin/worker rechecked; enable STAFF_AI_RATE_LIMIT_ENABLED after applying.';
commit;
