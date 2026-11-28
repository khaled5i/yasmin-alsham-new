-- =============================================================================
-- منح «رواتب العمال» و«إدارة محطات الطباعة» للمدير العام (24 نوفمبر 2026)
--
-- كانت الصلاحيتان مقفلتين للمدير الأكبر (owner_only) لأن دوالهما في القاعدة
-- تفحص role = 'admin' مباشرة. بعد هذه الهجرة:
--   • تُمنحان للمدير العام فقط، وبتشغيل صريح من المدير الأكبر في «الصلاحيات».
--     لا يفتحهما قانون «المدير العام يملك كل غير المقفل افتراضياً»، فلا يتغيّر
--     شيء لأي مدير عام حالي حتى يُشغَّل المفتاح له. أي نوع عامل آخر لا يحملهما
--     حتى لو خُزّن له تخصيص.
--   • الدوال التي كانت تفحص المدير الأكبر تقبل أيضاً من يملك الصلاحية.
--     التعديل استبدال نصي واحد ودقيق في تعريف الدالة الحي (لا نسخ ولا إعادة
--     كتابة)، ويفشل كل شيء إن لم يُوجد النص المتوقع مرة واحدة بالضبط.
--
-- يبقى للمدير الأكبر وحده (بلا تغيير):
--   • إضافة عامل جديد بحساب دخول (زر «إضافة عامل» في الرواتب = إدارة العمال).
--   • فتح درج الكاش من محطة التفصيل، وطباعة فواتير المشغل النسائي عبر المحطة.
--   • رواتب الفروع الأخرى غير التفصيل/الأقمشة/التصاميم الجاهزة.
--
-- مرآة الكتالوج: src/lib/staff-permissions.ts (grantOnlyTo)
-- التراجع:      docs/staff-permissions/rollback-20261124120000.sql
-- الفحص المحلي: node scripts/db-local/verify-gm-payroll-print-grants.cjs
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) الكتالوج: «يُمنح صراحةً لهذه الأنواع فقط»
-- -----------------------------------------------------------------------------
alter table public.staff_permission_catalog
  add column if not exists grant_only_worker_types text[] not null default '{}'::text[];

comment on column public.staff_permission_catalog.grant_only_worker_types is
  'إن لم يكن فارغاً: لا تُمنح الصلاحية افتراضياً لأحد (ولا للمدير العام)، وتُمنح بتشغيل صريح فقط لهذه الأنواع.';

insert into public.staff_permission_catalog (key, owner_only, default_worker_types, grant_only_worker_types) values
  ('accounting.tailoring.salaries',      false, '{}', '{general_manager}'),
  ('settings.print_stations',            false, '{}', '{general_manager}')
on conflict (key) do update
  set owner_only = excluded.owner_only,
      default_worker_types = excluded.default_worker_types,
      grant_only_worker_types = excluded.grant_only_worker_types;

-- -----------------------------------------------------------------------------
-- 2) الحساب: فرع جديد للصلاحيات الصريحة (CASE يضمن ألا يُحوَّل نص غير منطقي)
-- -----------------------------------------------------------------------------
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
        -- صريحة فقط، ولأنواع محددة: لا افتراضي، ولا «المدير العام يملك الكل»
        when cardinality(c.grant_only_worker_types) > 0 then
          case
            when not coalesce(w.worker_type = any (c.grant_only_worker_types), false) then false
            when jsonb_typeof(sp.overrides -> k.key) = 'boolean' then (sp.overrides ->> k.key)::boolean
            else false
          end
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

-- الحفظ: لا يُخزَّن منح صريح لنوع غير مسموح له
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
  v_worker_type text;
  v_clean jsonb := '{}'::jsonb;
  v_entry record;
  v_owner_only boolean;
  v_grant_only text[];
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

  select w.worker_type into v_worker_type
  from public.workers as w
  where w.user_id = p_user_id
  limit 1;

  for v_entry in select key, value from jsonb_each(p_overrides) loop
    if jsonb_typeof(v_entry.value) <> 'boolean' then
      raise exception using errcode = '22023', message = 'INVALID_PERMISSION_VALUE:' || v_entry.key;
    end if;

    select c.owner_only, c.grant_only_worker_types into v_owner_only, v_grant_only
    from public.staff_permission_catalog as c
    where c.key = v_entry.key;

    if not found then
      raise exception using errcode = '22023', message = 'UNKNOWN_PERMISSION:' || v_entry.key;
    end if;

    -- المقفل لا يُمنح ولا يُخزَّن.
    if v_owner_only then
      continue;
    end if;

    -- الصريح لأنواع محددة: لا يُخزَّن لغيرها.
    if cardinality(v_grant_only) > 0 and not coalesce(v_worker_type = any (v_grant_only), false) then
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

-- -----------------------------------------------------------------------------
-- 3) بوابتان جديدتان (المدير الأكبر النشط دائماً نعم عبر staff_permission_for_user)
-- -----------------------------------------------------------------------------
create or replace function private.can_manage_tailoring_payroll()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_permission_for_user((select auth.uid()), 'accounting.tailoring.salaries');
$$;

create or replace function private.require_print_station_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or not private.staff_permission_for_user(v_user_id, 'settings.print_stations') then
    raise exception using
      errcode = '42501',
      message = 'print_station_permission_required';
  end if;
  return v_user_id;
end;
$$;

revoke all on function private.can_manage_tailoring_payroll() from public, anon, authenticated;
revoke all on function private.require_print_station_manager() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) رواتب التفصيل: البوابة المركزية لدوال الرواتب ذات الفرع
-- -----------------------------------------------------------------------------
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
  and not (p_branch = 'tailoring' and public.staff_can('accounting.tailoring.salaries'))
  then
    raise exception using
      errcode = '42501',
      message = 'PAYROLL_FORBIDDEN|ليس لديك صلاحية تعديل رواتب هذا القسم';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) استبدال نصي دقيق داخل الدوال الحية
--    كل دالة يجب أن تحتوي النص القديم مرة واحدة بالضبط، أو النص الجديد (أُعيد
--    التشغيل) — غير ذلك = إيقاف الهجرة كلها. CREATE OR REPLACE يحفظ المالك
--    والصلاحيات والإعدادات كما هي. لا يحتوي أيّ نصّين أحدهما الآخر، فالتراجع
--    هو الاستبدال نفسه بالعكس.
-- -----------------------------------------------------------------------------
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
    return; -- مطبّقة من قبل
  end if;
  if v_count <> 1 then
    raise exception 'swap_function_text: % contains the expected text % time(s), expected 1', p_function, v_count;
  end if;

  execute replace(pg_catalog.pg_get_functiondef(p_function), p_old, p_new);
end;
$$;

-- 5أ) محطات الطباعة (التفصيل + التعديلات/المشغل النسائي): 14 دالة إدارة
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
      'private.require_active_admin()',
      'private.require_print_station_manager()'
    );
  end loop;
end;
$$;

-- 5ب) رواتب التفصيل: الدوال التي تفحص المدير الأكبر داخلها
do $$
begin
  perform pg_temp.swap_function_text(
    'public.save_tailoring_salary_settings(text, integer, integer, character varying, numeric, numeric, boolean, boolean, date, text)'::regprocedure,
    'EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)',
    'private.can_manage_tailoring_payroll()'
  );

  perform pg_temp.swap_function_text(
    'public.record_tailoring_payroll_disbursement(text, integer, integer, date, uuid, numeric, numeric, text, text)'::regprocedure,
    'EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)',
    'private.can_manage_tailoring_payroll()'
  );

  perform pg_temp.swap_function_text(
    'public.set_tailoring_payroll_suspension(uuid, integer, integer, boolean, boolean)'::regprocedure,
    'EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)',
    'private.can_manage_tailoring_payroll()'
  );

  -- حذف «خصم من الراتب»: المدير الأكبر لكل الفروع (كما كان)، والممنوح للتفصيل فقط
  perform pg_temp.swap_function_text(
    'public.delete_worker_payroll_operation_unchecked(uuid)'::regprocedure,
    'EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role=''admin'' AND is_active)',
    '(public.is_admin() OR (v_operation.branch = ''tailoring'' AND private.can_manage_tailoring_payroll()))'
  );
end;
$$;

drop function pg_temp.swap_function_text(regprocedure, text, text);

-- -----------------------------------------------------------------------------
-- 6) قراءة إضافية لصفحة الرواتب: العمال غير المتاحين والحسابات الموقوفة
--    (الموجود يُظهر للموظفين المتاحين/النشطين فقط؛ الرواتب تحتاج الكل)
-- -----------------------------------------------------------------------------
drop policy if exists "Staff permission: payroll reads workers" on public.workers;
create policy "Staff permission: payroll reads workers"
  on public.workers for select to authenticated
  using ((select public.staff_can('accounting.tailoring.salaries')));

drop policy if exists "Staff permission: payroll reads users" on public.users;
create policy "Staff permission: payroll reads users"
  on public.users for select to authenticated
  using ((select public.staff_can('accounting.tailoring.salaries')));

commit;
