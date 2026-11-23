-- =============================================================================
-- نظام الصلاحيات التفصيلي للموظفين
--   المدير الأكبر (users.role = 'admin')            ← كل شيء دائماً
--   المدير العام  (workers.worker_type = 'general_manager') ← كل ما ليس "للمدير الأكبر فقط" افتراضياً
--   بقية العمال                                      ← افتراضيات نوعهم + تخصيص لكل عامل
--
-- المبدأ في هذه المرحلة: الإضافة فقط.
--   • لا تُحذف ولا تُضيَّق أي سياسة أو دالة قائمة؛ كل ما يصل إليه أي عامل اليوم يبقى.
--   • الصلاحية الممنوحة (public.staff_can) تفتح وصولاً إضافياً عبر سياسات جديدة
--     وشروط OR مضافة إلى الدوال المركزية.
--   • إطفاء صلاحية كانت لنوع العامل قبل هذا النظام يُطبَّق في الواجهة ومسارات
--     الخادم، وتبقى قاعدة البيانات على شرطها القديم لذلك النوع (المرحلة الثانية
--     تحوّل الشروط القديمة إلى staff_can).
--
-- مرآة هذا الكتالوج في الكود: src/lib/staff-permissions.ts
-- فحص التطابق: node scripts/check-staff-permissions-sync.cjs
--
-- التراجع: docs/staff-permissions/rollback-20261123120000.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) كتالوج الصلاحيات (يُكتب بالهجرات فقط)
-- -----------------------------------------------------------------------------
create table if not exists public.staff_permission_catalog (
  key text primary key,
  owner_only boolean not null default false,
  default_worker_types text[] not null default '{}'::text[],
  constraint staff_permission_catalog_key_format check (key ~ '^[a-z_]+(\.[a-z_]+)+$')
);

comment on table public.staff_permission_catalog is
  'كتالوج صلاحيات الموظفين. owner_only = للمدير الأكبر فقط ولا يُمنح. المدير العام يملك كل غير المقفل افتراضياً.';

alter table public.staff_permission_catalog enable row level security;

drop policy if exists staff_permission_catalog_read on public.staff_permission_catalog;
create policy staff_permission_catalog_read
  on public.staff_permission_catalog
  for select to authenticated
  using (true);

revoke all on public.staff_permission_catalog from anon;
revoke insert, update, delete, truncate on public.staff_permission_catalog from authenticated;
grant select on public.staff_permission_catalog to authenticated;

insert into public.staff_permission_catalog (key, owner_only, default_worker_types) values
  -- الطلبات
  ('orders.view_all',                    false, '{workshop_manager}'),
  ('orders.create',                      false, '{}'),
  ('orders.manage_workflow',             false, '{workshop_manager}'),
  ('orders.edit',                        false, '{}'),
  ('orders.payments',                    false, '{}'),
  ('orders.delete',                      false, '{}'),
  ('orders.completed',                   false, '{workshop_manager}'),
  ('orders.delivered',                   false, '{workshop_manager}'),
  ('orders.schedule',                    false, '{workshop_manager}'),
  ('orders.notifications',               false, '{}'),
  ('orders.client_phone',                false, '{}'),
  -- التعديلات
  ('alterations.view_all',               false, '{}'),
  ('alterations.create',                 false, '{}'),
  ('alterations.edit',                   false, '{}'),
  ('alterations.delete',                 false, '{}'),
  ('alterations.error_reason',           false, '{}'),
  -- الفواتير السريعة
  ('invoices.women_workshop',            false, '{}'),
  ('invoices.tailoring',                 false, '{}'),
  -- الأقمشة والمتجر
  ('fabrics.manage',                     false, '{fabric_store_manager}'),
  ('fabrics.inventory',                  false, '{fabric_store_manager}'),
  ('fabrics.online_orders',              false, '{fabric_store_manager}'),
  ('fabrics.online_orders_admin',        true,  '{}'),
  -- محاسبة الأقمشة
  ('accounting.fabrics.income',          false, '{fabric_store_manager}'),
  ('accounting.fabrics.purchases',       false, '{fabric_store_manager}'),
  ('accounting.fabrics.fixed_expenses',  false, '{fabric_store_manager}'),
  ('accounting.fabrics.salaries',        false, '{fabric_store_manager}'),
  ('accounting.fabrics.categories',      false, '{fabric_store_manager}'),
  ('accounting.fabrics.print_station',   false, '{fabric_store_manager}'),
  ('accounting.fabrics.send_alostaz',    false, '{fabric_store_manager}'),
  ('accounting.fabrics.influencers',     true,  '{}'),
  ('accounting.fabrics.cash_box_edit',   true,  '{}'),
  -- محاسبة التفصيل
  ('accounting.tailoring.cash_box',      false, '{}'),
  ('accounting.tailoring.income',        false, '{}'),
  ('accounting.tailoring.materials',     false, '{accountant}'),
  ('accounting.tailoring.fixed_expenses',false, '{}'),
  ('accounting.tailoring.categories',    false, '{}'),
  ('accounting.tailoring.salaries',      true,  '{}'),
  ('accounting.organization_reports',    false, '{}'),
  ('accounting.hala',                    false, '{}'),
  -- المشغل النسائي والتصاميم الجاهزة
  ('accounting.women_workshop',          false, '{accountant}'),
  ('accounting.women_workshop_expenses', false, '{}'),
  ('accounting.ready_designs',           false, '{}'),
  -- العمال
  ('workers.monitoring',                 false, '{workshop_manager}'),
  ('workers.attendance',                 false, '{workshop_manager}'),
  ('workers.quality_report',             false, '{}'),
  ('workers.manage',                     true,  '{}'),
  -- التقارير
  ('reports.view',                       false, '{}'),
  ('reports.whatsapp',                   false, '{}'),
  -- الإعدادات
  ('settings.print_stations',            true,  '{}')
on conflict (key) do update
  set owner_only = excluded.owner_only,
      default_worker_types = excluded.default_worker_types;

-- -----------------------------------------------------------------------------
-- 2) تخصيص كل موظف (الفروقات عن افتراضي نوعه)
-- -----------------------------------------------------------------------------
create table if not exists public.staff_permissions (
  user_id uuid primary key references public.users(id) on delete cascade,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  constraint staff_permissions_overrides_object check (jsonb_typeof(overrides) = 'object')
);

comment on table public.staff_permissions is
  'تخصيص صلاحيات كل عامل: {مفتاح: true|false} يغلب افتراضي نوعه. يُكتب عبر set_staff_permissions فقط.';

alter table public.staff_permissions enable row level security;

drop policy if exists staff_permissions_select on public.staff_permissions;
create policy staff_permissions_select
  on public.staff_permissions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.staff_permissions from anon;
revoke insert, update, delete, truncate on public.staff_permissions from authenticated;
grant select on public.staff_permissions to authenticated;

-- -----------------------------------------------------------------------------
-- 3) الحساب
-- -----------------------------------------------------------------------------
-- هل يملك المستخدم أياً من الصلاحيات؟ استعلام واحد مهما كان عدد المفاتيح
-- (تُستدعى لكل صف في سياسات الواردات والمصروفات عبر can_access_finance_branch).
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

create or replace function private.staff_permission_for_user(p_user_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_permission_any_for_user(p_user_id, array[p_key]);
$$;

-- لا تُستدعى مباشرة: الدوال العامة أدناه (security definer) هي الواجهة.
revoke all on function private.staff_permission_any_for_user(uuid, text[]) from public, anon, authenticated;
revoke all on function private.staff_permission_for_user(uuid, text) from public, anon, authenticated;

-- هل يملك المستخدم الحالي الصلاحية؟ (للسياسات والدوال)
create or replace function public.staff_can(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_permission_any_for_user((select auth.uid()), array[p_key]);
$$;

revoke all on function public.staff_can(text) from public, anon;
grant execute on function public.staff_can(text) to authenticated;

-- هل يملك أياً منها؟
create or replace function public.staff_can_any(p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_permission_any_for_user((select auth.uid()), p_keys);
$$;

revoke all on function public.staff_can_any(text[]) from public, anon;
grant execute on function public.staff_can_any(text[]) to authenticated;

-- لمسارات الخادم (مفتاح الخدمة): صلاحية مستخدم محدد
create or replace function public.staff_can_user(p_user_id uuid, p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_permission_any_for_user(p_user_id, p_keys);
$$;

revoke all on function public.staff_can_user(uuid, text[]) from public, anon, authenticated;
grant execute on function public.staff_can_user(uuid, text[]) to service_role;

-- صلاحياتي (للواجهة)
create or replace function public.get_my_staff_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', u.role,
    'worker_type', w.worker_type,
    'permissions', coalesce((
      select jsonb_object_agg(c.key, private.staff_permission_for_user(u.id, c.key))
      from public.staff_permission_catalog as c
    ), '{}'::jsonb)
  )
  from public.users as u
  left join public.workers as w on w.user_id = u.id
  where u.id = (select auth.uid())
    and u.is_active is true;
$$;

revoke all on function public.get_my_staff_permissions() from public, anon;
grant execute on function public.get_my_staff_permissions() to authenticated;

-- صلاحيات عامل محدد (للمدير الأكبر في شاشة إدارة العمال)
create or replace function public.get_staff_permissions(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_active_admin();

  select jsonb_build_object(
    'user_id', u.id,
    'role', u.role,
    'worker_type', w.worker_type,
    'overrides', coalesce(sp.overrides, '{}'::jsonb),
    'updated_at', sp.updated_at,
    'permissions', coalesce((
      select jsonb_object_agg(c.key, private.staff_permission_for_user(u.id, c.key))
      from public.staff_permission_catalog as c
    ), '{}'::jsonb)
  )
  into v_result
  from public.users as u
  left join public.workers as w on w.user_id = u.id
  left join public.staff_permissions as sp on sp.user_id = u.id
  where u.id = p_user_id;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_staff_permissions(uuid) from public, anon;
grant execute on function public.get_staff_permissions(uuid) to authenticated;

-- حفظ تخصيص عامل (المدير الأكبر فقط). يستبدل التخصيص كاملاً.
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

revoke all on function public.set_staff_permissions(uuid, jsonb) from public, anon;
grant execute on function public.set_staff_permissions(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) فتح الوصول الممنوح — سياسات إضافية (OR مع القائم)
-- -----------------------------------------------------------------------------

-- الطلبات
drop policy if exists "Staff permission: view orders" on public.orders;
create policy "Staff permission: view orders"
  on public.orders for select to authenticated
  using ((select public.staff_can_any(array[
    'orders.view_all', 'orders.create', 'orders.manage_workflow', 'orders.edit',
    'orders.payments', 'orders.delete', 'orders.completed', 'orders.delivered',
    'orders.schedule', 'orders.notifications',
    'alterations.view_all', 'alterations.create',
    'workers.monitoring', 'workers.quality_report', 'reports.view',
    'accounting.tailoring.income', 'accounting.tailoring.cash_box',
    'accounting.organization_reports'
  ])));

drop policy if exists "Staff permission: create orders" on public.orders;
create policy "Staff permission: create orders"
  on public.orders for insert to authenticated
  with check ((select public.staff_can('orders.create')));

drop policy if exists "Staff permission: update orders" on public.orders;
create policy "Staff permission: update orders"
  on public.orders for update to authenticated
  using ((select public.staff_can_any(array[
    'orders.edit', 'orders.manage_workflow', 'orders.payments',
    'orders.completed', 'orders.delivered', 'orders.notifications'
  ])))
  with check ((select public.staff_can_any(array[
    'orders.edit', 'orders.manage_workflow', 'orders.payments',
    'orders.completed', 'orders.delivered', 'orders.notifications'
  ])));

drop policy if exists "Staff permission: delete orders" on public.orders;
create policy "Staff permission: delete orders"
  on public.orders for delete to authenticated
  using ((select public.staff_can('orders.delete')));

-- التعديلات
drop policy if exists "Staff permission: view alterations" on public.alterations;
create policy "Staff permission: view alterations"
  on public.alterations for select to authenticated
  using ((select public.staff_can_any(array[
    'alterations.view_all', 'alterations.create', 'alterations.edit', 'alterations.delete',
    'workers.monitoring', 'workers.quality_report', 'reports.view',
    'accounting.organization_reports'
  ])));

drop policy if exists "Staff permission: create alterations" on public.alterations;
create policy "Staff permission: create alterations"
  on public.alterations for insert to authenticated
  with check ((select public.staff_can('alterations.create')));

drop policy if exists "Staff permission: update alterations" on public.alterations;
create policy "Staff permission: update alterations"
  on public.alterations for update to authenticated
  using ((select public.staff_can('alterations.edit')))
  with check ((select public.staff_can('alterations.edit')));

drop policy if exists "Staff permission: delete alterations" on public.alterations;
create policy "Staff permission: delete alterations"
  on public.alterations for delete to authenticated
  using ((select public.staff_can('alterations.delete')));

-- دفعات الطلب
drop policy if exists "Staff permission: order payments" on public.order_payments;
create policy "Staff permission: order payments"
  on public.order_payments for all to authenticated
  using ((select public.staff_can('orders.payments')))
  with check ((select public.staff_can('orders.payments')));

drop policy if exists "Staff permission: view order additional payments" on public.order_additional_payments;
create policy "Staff permission: view order additional payments"
  on public.order_additional_payments for select to authenticated
  using ((select public.staff_can_any(array[
    'orders.payments', 'accounting.tailoring.cash_box', 'accounting.tailoring.income'
  ])));

-- قسائم الخصم (تُقرأ عند التسليم والبيع)
drop policy if exists "Staff permission: view discount coupons" on public.discount_coupons;
create policy "Staff permission: view discount coupons"
  on public.discount_coupons for select to authenticated
  using ((select public.staff_can_any(array[
    'orders.completed', 'orders.delivered', 'orders.edit', 'orders.payments',
    'accounting.fabrics.income'
  ])));

-- الصندوق (قراءة)
drop policy if exists "Staff permission: view cash box adjustments" on public.cash_box_adjustments;
create policy "Staff permission: view cash box adjustments"
  on public.cash_box_adjustments for select to authenticated
  using ((select public.staff_can('accounting.tailoring.cash_box')));

drop policy if exists "Staff permission: view cash box order receipts" on public.cash_box_order_receipts;
create policy "Staff permission: view cash box order receipts"
  on public.cash_box_order_receipts for select to authenticated
  using ((select public.staff_can('accounting.tailoring.cash_box')));

drop policy if exists "Staff permission: view cash box withdrawals" on public.cash_box_withdrawals;
create policy "Staff permission: view cash box withdrawals"
  on public.cash_box_withdrawals for select to authenticated
  using ((select public.staff_can('accounting.tailoring.cash_box')));

-- فئات المحاسبة
drop policy if exists "Staff permission: insert accounting categories" on public.accounting_categories;
create policy "Staff permission: insert accounting categories"
  on public.accounting_categories for insert to authenticated
  with check ((select public.staff_can_any(array[
    'accounting.fabrics.categories', 'accounting.tailoring.categories',
    'accounting.tailoring.materials', 'accounting.ready_designs'
  ])));

drop policy if exists "Staff permission: update accounting categories" on public.accounting_categories;
create policy "Staff permission: update accounting categories"
  on public.accounting_categories for update to authenticated
  using ((select public.staff_can_any(array[
    'accounting.fabrics.categories', 'accounting.tailoring.categories', 'accounting.ready_designs'
  ])))
  with check ((select public.staff_can_any(array[
    'accounting.fabrics.categories', 'accounting.tailoring.categories', 'accounting.ready_designs'
  ])));

drop policy if exists "Staff permission: delete accounting categories" on public.accounting_categories;
create policy "Staff permission: delete accounting categories"
  on public.accounting_categories for delete to authenticated
  using ((select public.staff_can_any(array[
    'accounting.fabrics.categories', 'accounting.tailoring.categories', 'accounting.ready_designs'
  ])));

-- المشغل النسائي: القراءة لمن يملك القسم، والكتابة لمن ينشئ/يعدّل الطلبات
-- (الطلب الذي فيه "أخذ مقاس" بالشبكة يكتب حركة هنا عبر trigger بصلاحية المستخدم).
-- إضافة الفواتير والمصاريف اليدوية تمر بمسارات الخادم لا بهذه السياسات.
drop policy if exists "Staff permission: view women workshop" on public.women_workshop_transactions;
create policy "Staff permission: view women workshop"
  on public.women_workshop_transactions for select to authenticated
  using ((select public.staff_can_any(array[
    'accounting.women_workshop', 'accounting.women_workshop_expenses',
    'invoices.women_workshop', 'accounting.organization_reports',
    'orders.create', 'orders.edit'
  ])));

drop policy if exists "Staff permission: insert women workshop from orders" on public.women_workshop_transactions;
create policy "Staff permission: insert women workshop from orders"
  on public.women_workshop_transactions for insert to authenticated
  with check (
    source = 'order_measurement'
    and (select public.staff_can_any(array['orders.create', 'orders.edit']))
  );

drop policy if exists "Staff permission: update women workshop from orders" on public.women_workshop_transactions;
create policy "Staff permission: update women workshop from orders"
  on public.women_workshop_transactions for update to authenticated
  using (
    source = 'order_measurement'
    and (select public.staff_can_any(array['orders.create', 'orders.edit']))
  )
  with check (
    source = 'order_measurement'
    and (select public.staff_can_any(array['orders.create', 'orders.edit']))
  );

-- الحضور والانصراف
drop policy if exists "Staff permission: view attendance devices" on public.attendance_devices;
create policy "Staff permission: view attendance devices"
  on public.attendance_devices for select to authenticated
  using ((select public.staff_can('workers.attendance')));

drop policy if exists "Staff permission: view attendance device users" on public.attendance_device_users;
create policy "Staff permission: view attendance device users"
  on public.attendance_device_users for select to authenticated
  using ((select public.staff_can('workers.attendance')));

drop policy if exists "Staff permission: view attendance events" on public.attendance_events;
create policy "Staff permission: view attendance events"
  on public.attendance_events for select to authenticated
  using ((select public.staff_can_any(array['workers.attendance', 'workers.monitoring'])));

drop policy if exists "Staff permission: manage attendance mappings" on public.attendance_worker_mappings;
create policy "Staff permission: manage attendance mappings"
  on public.attendance_worker_mappings for all to authenticated
  using ((select public.staff_can('workers.attendance')))
  with check ((select public.staff_can('workers.attendance')));

drop policy if exists "Staff permission: view attendance suspensions" on public.attendance_worker_suspensions;
create policy "Staff permission: view attendance suspensions"
  on public.attendance_worker_suspensions for select to authenticated
  using ((select public.staff_can_any(array['workers.attendance', 'workers.monitoring'])));

drop policy if exists "Staff permission: suspend workers" on public.attendance_worker_suspensions;
create policy "Staff permission: suspend workers"
  on public.attendance_worker_suspensions for insert to authenticated
  with check (resumed_at is null and (select public.staff_can('workers.attendance')));

drop policy if exists "Staff permission: resume workers" on public.attendance_worker_suspensions;
create policy "Staff permission: resume workers"
  on public.attendance_worker_suspensions for update to authenticated
  using (resumed_at is null and (select public.staff_can('workers.attendance')))
  with check (resumed_at is not null and (select public.staff_can('workers.attendance')));

-- مراجعة الجودة
drop policy if exists "Staff permission: view quality attempts" on public.order_quality_review_attempts;
create policy "Staff permission: view quality attempts"
  on public.order_quality_review_attempts for select to authenticated
  using ((select public.staff_can_any(array['orders.completed', 'workers.quality_report'])));

drop policy if exists "Staff permission: create quality attempts" on public.order_quality_review_attempts;
create policy "Staff permission: create quality attempts"
  on public.order_quality_review_attempts for insert to authenticated
  with check (
    reviewed_by = (select auth.uid())
    and (select public.staff_can_any(array['orders.completed', 'workers.quality_report']))
  );

-- -----------------------------------------------------------------------------
-- 5) الدوال المركزية — الشروط القديمة كما هي + الصلاحية الممنوحة
-- -----------------------------------------------------------------------------

-- الواردات والمصروفات حسب الفرع
create or replace function private.can_access_finance_branch(p_branch text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.users u
      left join public.workers w on w.user_id = u.id
      where u.id = auth.uid()
        and u.is_active = true
        and (
          u.role = 'admin'
          or (u.role = 'worker' and w.worker_type = 'fabric_store_manager' and p_branch = 'fabrics')
          or (u.role = 'worker' and w.worker_type = 'accountant' and p_branch in ('tailoring', 'ready_designs'))
        )
    )
    or (p_branch = 'fabrics' and public.staff_can_any(array[
      'accounting.fabrics.income', 'accounting.fabrics.purchases',
      'accounting.fabrics.fixed_expenses', 'accounting.fabrics.salaries',
      'accounting.fabrics.print_station', 'accounting.fabrics.send_alostaz',
      'fabrics.online_orders', 'accounting.organization_reports'
    ]))
    or (p_branch = 'tailoring' and public.staff_can_any(array[
      'accounting.tailoring.income', 'accounting.tailoring.materials',
      'accounting.tailoring.fixed_expenses', 'accounting.tailoring.cash_box',
      'accounting.organization_reports', 'accounting.hala', 'orders.payments'
    ]))
    or (p_branch = 'ready_designs' and public.staff_can_any(array[
      'accounting.ready_designs', 'accounting.organization_reports'
    ]))
  );
$$;

-- بطاقات الأقمشة
create or replace function public.can_manage_fabrics()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.users u
    left join public.workers w on w.user_id = u.id
    where u.id = auth.uid()
      and u.is_active = true
      and (
        u.role = 'admin'
        or (u.role = 'worker' and w.worker_type = 'fabric_store_manager')
        or (u.role = 'worker' and w.worker_type = 'general_manager')
      )
  ) or public.staff_can('fabrics.manage');
end;
$$;

-- المخزون (والمبيعات تحرّك المخزون عبر triggers بصلاحية المستخدم)
create or replace function private.can_manage_fabric_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.users u
      left join public.workers w on w.user_id = u.id
      where u.id = auth.uid()
        and u.is_active = true
        and (
          u.role = 'admin'
          or (u.role = 'worker' and w.worker_type in (
            'accountant', 'general_manager', 'fabric_store_manager'
          ))
        )
    )
    or public.staff_can_any(array[
      'fabrics.inventory', 'fabrics.manage', 'fabrics.online_orders',
      'accounting.fabrics.income', 'accounting.fabrics.purchases'
    ])
  );
$$;

-- الصندوق
create or replace function private.cash_box_user_is_authorized(p_for_withdrawal boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users as u
    left join public.workers as w on w.user_id = u.id
    where u.id = (select auth.uid())
      and u.is_active = true
      and (
        u.role = 'admin'
        or (
          u.role = 'worker'
          and (
            (p_for_withdrawal and w.worker_type = 'accountant')
            or (
              not p_for_withdrawal
              and w.worker_type in (
                'accountant',
                'general_manager',
                'fabric_store_manager'
              )
            )
          )
        )
      )
  ) or public.staff_can('accounting.tailoring.cash_box');
$$;

-- رواتب الفروع (التفصيل يبقى للمدير الأكبر)
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

-- إسناد القصّاص: المدير الأكبر ومدير الورشة كما كان + من يملك إدارة سير الطلب
create or replace function public.enforce_order_cutter_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cutter_changed boolean;
  worker_changed boolean;
  assigned_name text;
begin
  if tg_op = 'INSERT' then
    cutter_changed := new.cutter_id is not null;
    worker_changed := new.worker_id is not null;
    new.cut_at := null;
    new.cutter_name := null;
  else
    cutter_changed := new.cutter_id is distinct from old.cutter_id;
    worker_changed := new.worker_id is distinct from old.worker_id;
    -- Clients cannot forge the timestamp or the saved name.
    new.cut_at := old.cut_at;
    new.cutter_name := old.cutter_name;
  end if;

  if cutter_changed then
    if current_user not in ('postgres', 'service_role') and not (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
      or exists (select 1 from public.workers where user_id = auth.uid() and worker_type = 'workshop_manager')
      or public.staff_can_any(array['orders.manage_workflow', 'orders.edit'])
    ) then
      raise exception 'Only administrators and workshop managers can assign the cutter' using errcode = '42501';
    end if;

    if new.cutter_id is not null then
      select u.full_name into assigned_name
      from public.workers w join public.users u on u.id = w.user_id
      where w.id = new.cutter_id and w.worker_type = 'workshop_manager'
        and w.is_available and u.is_active;
      if not found then
        raise exception 'القصّاص يجب أن يكون مدير ورشة متاحاً / Cutter must be an active workshop manager' using errcode = '23514';
      end if;
      new.cutter_name := assigned_name;
      new.cut_at := statement_timestamp();
    else
      new.cutter_name := null;
      new.cut_at := null;
    end if;
  end if;

  if new.worker_id is not null and new.cutter_id is null and (worker_changed or cutter_changed) then
    raise exception 'يجب اختيار القصّاص قبل العامل الخياط / Select the cutter before assigning the tailor' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- تسجيل دفعات الطلب: كما كان + من يملك الأسعار والدفعات
create or replace function public.record_order_additional_payment(
  p_payment_id text,
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_occurred_at timestamp with time zone default null::timestamp with time zone,
  p_alostaz_invoice_code text default null::text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_method_total numeric(12, 2);
  v_recorded numeric(12, 2);
begin
  if not exists (
    select 1 from public.users as u
    where u.id = (select auth.uid()) and u.is_active = true and u.role = 'admin'
  ) and not private.cash_box_user_is_authorized(false)
    and not public.staff_can('orders.payments') then
    raise exception 'ليس لديك صلاحية لتسجيل دفعات الطلب' using errcode = '42501';
  end if;

  if coalesce(trim(p_payment_id), '') = '' then
    raise exception 'معرّف الدفعة مطلوب';
  end if;
  if p_method not in ('cash', 'card') then
    raise exception 'طريقة دفع غير صالحة';
  end if;
  if v_amount <= 0 then
    raise exception 'مبلغ الدفعة غير صالح';
  end if;

  -- إعادة المحاولة بنفس المعرّف: نُكمل رقم فاتورة الأستاذ فقط
  if exists (select 1 from public.order_additional_payments where id = p_payment_id) then
    update public.order_additional_payments
    set alostaz_invoice_code = coalesce(nullif(trim(p_alostaz_invoice_code), ''), alostaz_invoice_code)
    where id = p_payment_id and order_id = p_order_id;
    return;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'الطلب غير موجود';
  end if;

  -- لا يُسجَّل أكثر مما هو محفوظ فعلاً على الطلب بهذه الطريقة
  v_method_total := case
    when p_method = 'cash' then private.tailoring_order_pre_delivery_cash(v_order)
    else greatest(coalesce(v_order.pre_delivery_network_amount, 0), 0)
  end;
  select coalesce(sum(p.amount), 0) into v_recorded
  from public.order_additional_payments as p
  where p.order_id = p_order_id and p.method = p_method;

  if v_recorded + v_amount > v_method_total + 0.005 then
    raise exception 'مبلغ الدفعة لا يطابق المبالغ المحفوظة على الطلب';
  end if;

  insert into public.order_additional_payments (
    id, order_id, branch, method, amount, occurred_at, alostaz_invoice_code
  )
  values (
    p_payment_id,
    p_order_id,
    coalesce(v_order.branch, 'tailoring'),
    p_method,
    v_amount,
    coalesce(p_occurred_at, now()),
    nullif(trim(p_alostaz_invoice_code), '')
  );

  -- نقل مبلغ الكاش من إيصال العربون المجمّع إلى حركته المستقلة
  if p_method = 'cash' and v_order.status <> 'delivered' then
    update public.cash_box_order_receipts
    set amount = greatest(
      private.tailoring_order_pre_delivery_cash(v_order)
        - private.tailoring_order_additional_cash(p_order_id),
      0
    )
    where order_id = p_order_id
      and receipt_type = 'order_deposit';
  end if;
end;
$$;

commit;
