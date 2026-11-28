-- =============================================================================
-- تراجع هجرة 20261124120000_gm_payroll_print_station_grants.sql
--   يعيد «رواتب العمال» و«إدارة محطات الطباعة» مقفلتين للمدير الأكبر،
--   ويعيد الدوال إلى نصها السابق حرفياً، ويحذف منحهما المخزّن للمدراء العامين.
--   بقية التخصيصات تبقى كما هي.
-- =============================================================================

begin;

create or replace function pg_temp.swap_function_text(
  p_function regprocedure,
  p_old text,
  p_new text
) returns void
language plpgsql
as $$
declare
  v_src text;
  v_count int;
begin
  if strpos(p_new, p_old) > 0 or strpos(p_old, p_new) > 0 then
    raise exception 'swap_function_text: old and new text must not contain each other';
  end if;

  select p.prosrc into v_src from pg_catalog.pg_proc p where p.oid = p_function;
  v_count := (length(v_src) - length(replace(v_src, p_old, ''))) / length(p_old);

  if v_count = 0 and strpos(v_src, p_new) > 0 then
    return; -- متراجَع عنها من قبل
  end if;
  if v_count <> 1 then
    raise exception 'swap_function_text: % contains the expected text % time(s), expected 1', p_function, v_count;
  end if;

  execute replace(pg_catalog.pg_get_functiondef(p_function), p_old, p_new);
end;
$$;

-- 1) الدوال إلى نصها السابق
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'private.list_tailoring_print_stations_impl()',
    'private.create_tailoring_print_station_impl(text, integer)',
    'private.rotate_tailoring_print_station_secret_impl(uuid)',
    'private.set_tailoring_print_station_enabled_impl(uuid, boolean)',
    'private.release_tailoring_print_station_lease_impl(uuid)',
    'private.retry_tailoring_print_job_impl(uuid)',
    'private.cancel_tailoring_print_job_impl(uuid)',
    'private.list_alterations_print_stations_impl()',
    'private.create_alterations_print_station_impl(text, integer)',
    'private.rotate_alterations_print_station_secret_impl(uuid)',
    'private.set_alterations_print_station_enabled_impl(uuid, boolean)',
    'private.release_alterations_print_station_lease_impl(uuid)',
    'private.retry_alterations_print_job_impl(uuid)',
    'private.cancel_alterations_print_job_impl(uuid)'
  ] loop
    perform pg_temp.swap_function_text(
      v_fn::regprocedure,
      'private.require_print_station_manager()',
      'private.require_active_admin()'
    );
  end loop;

  perform pg_temp.swap_function_text(
    'public.save_tailoring_salary_settings(text, integer, integer, character varying, numeric, numeric, boolean, boolean, date, text)'::regprocedure,
    'private.can_manage_tailoring_payroll()',
    'EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)'
  );

  perform pg_temp.swap_function_text(
    'public.record_tailoring_payroll_disbursement(text, integer, integer, date, uuid, numeric, numeric, text, text)'::regprocedure,
    'private.can_manage_tailoring_payroll()',
    'EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)'
  );

  perform pg_temp.swap_function_text(
    'public.set_tailoring_payroll_suspension(uuid, integer, integer, boolean, boolean)'::regprocedure,
    'private.can_manage_tailoring_payroll()',
    'EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)'
  );

  perform pg_temp.swap_function_text(
    'public.delete_worker_payroll_operation_unchecked(uuid)'::regprocedure,
    '(public.is_admin() OR (v_operation.branch = ''tailoring'' AND private.can_manage_tailoring_payroll()))',
    'EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)'
  );
end;
$$;

drop function pg_temp.swap_function_text(regprocedure, text, text);

-- 2) البوابة المركزية للرواتب كما كانت (بلا فرع التفصيل)
create or replace function private.assert_payroll_branch_access(p_branch text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.users u
    left join public.workers w on w.user_id = u.id
    where u.id = auth.uid()
      and u.is_active = true
      and (
        u.role = 'admin'
        or (u.role = 'worker' and w.worker_type = 'fabric_store_manager' and p_branch = 'fabrics')
      )
  )
  and not (p_branch = 'fabrics' and public.staff_can('accounting.fabrics.salaries'))
  and not (p_branch = 'ready_designs' and public.staff_can('accounting.ready_designs'))
  then
    raise exception using
      errcode = '42501',
      message = 'PAYROLL_FORBIDDEN|ليس لديك صلاحية تعديل رواتب هذا القسم';
  end if;
end;
$$;

-- 3) سياسات القراءة الإضافية
drop policy if exists "Staff permission: payroll reads workers" on public.workers;
drop policy if exists "Staff permission: payroll reads users" on public.users;

-- 4) البوابتان الجديدتان
drop function if exists private.can_manage_tailoring_payroll();
drop function if exists private.require_print_station_manager();

-- 5) الحساب والحفظ كما في 20261123120000
create or replace function private.staff_permission_any_for_user(p_user_id uuid, p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select bool_or(
      case
        when u.role = 'admin' then true
        when u.role <> 'worker' then false
        when c.key is null or c.owner_only then false
        when sp.overrides ? k.key and jsonb_typeof(sp.overrides -> k.key) = 'boolean'
          then (sp.overrides ->> k.key)::boolean
        when w.worker_type = 'general_manager' then true
        else coalesce(w.worker_type = any (c.default_worker_types), false)
      end
    )
    from public.users as u
    left join public.workers as w on w.user_id = u.id
    left join public.staff_permissions as sp on sp.user_id = u.id
    cross join unnest(coalesce(p_keys, '{}'::text[])) as k(key)
    left join public.staff_permission_catalog as c on c.key = k.key
    where u.id = p_user_id
      and u.is_active is true
  ), false);
$$;

create or replace function public.set_staff_permissions(p_user_id uuid, p_overrides jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := private.require_active_admin();
  v_role text;
  v_clean jsonb := '{}'::jsonb;
  v_entry record;
  v_owner_only boolean;
begin
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_OVERRIDES';
  end if;

  select u.role into v_role
  from public.users as u
  where u.id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND';
  end if;

  -- المدير الأكبر لا تُقيَّد صلاحياته، والعملاء لا صلاحيات لهم.
  if v_role is distinct from 'worker' then
    raise exception using errcode = '22023', message = 'ONLY_WORKERS_HAVE_PERMISSIONS';
  end if;

  for v_entry in select key, value from jsonb_each(p_overrides) loop
    if jsonb_typeof(v_entry.value) <> 'boolean' then
      raise exception using errcode = '22023', message = 'INVALID_PERMISSION_VALUE:' || v_entry.key;
    end if;

    select c.owner_only into v_owner_only
    from public.staff_permission_catalog as c
    where c.key = v_entry.key;

    if not found then
      raise exception using errcode = '22023', message = 'UNKNOWN_PERMISSION:' || v_entry.key;
    end if;

    -- المقفل لا يُمنح ولا يُخزَّن.
    if v_owner_only then
      continue;
    end if;

    v_clean := v_clean || jsonb_build_object(v_entry.key, v_entry.value);
  end loop;

  insert into public.staff_permissions (user_id, overrides, updated_at, updated_by)
  values (p_user_id, v_clean, now(), v_admin_id)
  on conflict (user_id) do update
    set overrides = excluded.overrides,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return public.get_staff_permissions(p_user_id);
end;
$$;

-- 6) حذف المنح المخزّن لهاتين فقط، وإعادتهما مقفلتين
update public.staff_permissions
set overrides = overrides - 'accounting.tailoring.salaries' - 'settings.print_stations',
    updated_at = now()
where overrides ?| array['accounting.tailoring.salaries', 'settings.print_stations'];

update public.staff_permission_catalog
set owner_only = true, default_worker_types = '{}'
where key in ('accounting.tailoring.salaries', 'settings.print_stations');

alter table public.staff_permission_catalog drop column if exists grant_only_worker_types;

commit;
