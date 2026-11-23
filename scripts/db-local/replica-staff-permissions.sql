-- نسخة مصغّرة من أجزاء الإنتاج التي تلمسها هجرة 20261123120000_staff_permissions.sql
-- (أدوار Supabase + الجداول بالأعمدة التي تذكرها السياسات + الدوال الحية قبل الهجرة).
-- محلية فقط — لا تُشغَّل على Supabase.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema private;
grant usage on schema private to anon, authenticated;

create table public.users (
  id uuid primary key, email text, full_name text, role text not null,
  is_active boolean not null default true, created_at timestamptz default now()
);
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  worker_type text, is_available boolean not null default true
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  worker_id uuid, cutter_id uuid, cut_at timestamptz, cutter_name text,
  branch text default 'tailoring', pre_delivery_network_amount numeric default 0,
  client_name text
);
create table public.alterations (id uuid primary key default gen_random_uuid(), worker_id uuid);
create table public.order_payments (id uuid primary key default gen_random_uuid());
create table public.order_additional_payments (
  id text primary key, order_id uuid, branch text, method text, amount numeric,
  occurred_at timestamptz, alostaz_invoice_code text
);
create table public.discount_coupons (id uuid primary key default gen_random_uuid());
create table public.cash_box_adjustments (id uuid primary key default gen_random_uuid());
create table public.cash_box_order_receipts (id uuid primary key default gen_random_uuid(), order_id uuid, receipt_type text, amount numeric);
create table public.cash_box_withdrawals (id uuid primary key default gen_random_uuid());
create table public.accounting_categories (id uuid primary key default gen_random_uuid(), name text);
create table public.women_workshop_transactions (id uuid primary key default gen_random_uuid(), source text, order_id uuid);
create table public.attendance_devices (id uuid primary key default gen_random_uuid());
create table public.attendance_device_users (id uuid primary key default gen_random_uuid());
create table public.attendance_events (id uuid primary key default gen_random_uuid(), worker_id uuid);
create table public.attendance_worker_mappings (id uuid primary key default gen_random_uuid());
create table public.attendance_worker_suspensions (id uuid primary key default gen_random_uuid(), worker_id uuid, resumed_at timestamptz);
create table public.order_quality_review_attempts (id uuid primary key default gen_random_uuid(), reviewed_by uuid);

do $$
declare t text;
begin
  foreach t in array array['orders','alterations','order_payments','order_additional_payments','discount_coupons',
    'cash_box_adjustments','cash_box_order_receipts','cash_box_withdrawals','accounting_categories',
    'women_workshop_transactions','attendance_devices','attendance_device_users','attendance_events',
    'attendance_worker_mappings','attendance_worker_suspensions','order_quality_review_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- سياسات قديمة ممثِّلة (حرفياً من الحي)
create policy "Admins can view all orders" on public.orders for select to authenticated
  using (exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin'));
create policy "Admins can insert orders" on public.orders for insert to authenticated
  with check (exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin'));
create policy "Admins can update all orders" on public.orders for update to authenticated
  using (exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin'))
  with check (exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin'));
create policy "Admins can delete orders" on public.orders for delete to authenticated
  using (exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin'));
create policy "Workshop managers can view all orders" on public.orders for select to authenticated
  using (exists (select 1 from public.workers where workers.user_id = auth.uid() and workers.worker_type = 'workshop_manager'));
create policy "Workshop managers can update orders" on public.orders for update to authenticated
  using (exists (select 1 from public.workers where workers.user_id = auth.uid() and workers.worker_type = 'workshop_manager'))
  with check (exists (select 1 from public.workers where workers.user_id = auth.uid() and workers.worker_type = 'workshop_manager'));
create policy "Workers can view assigned orders" on public.orders for select to authenticated
  using (exists (select 1 from public.workers where workers.user_id = auth.uid() and workers.id = orders.worker_id));

-- الدوال الحية قبل الهجرة
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users as profile
    where profile.id = (select auth.uid()) and profile.role = 'admin' and profile.is_active is true);
$$;

create or replace function private.require_active_admin() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1 from public.users as u where u.id = v_user_id and u.is_active = true and u.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'active_admin_required';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.can_access_finance_branch(p_branch text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.users u left join public.workers w on w.user_id = u.id
    where u.id = auth.uid() and u.is_active = true and (
      u.role = 'admin'
      or (u.role = 'worker' and w.worker_type = 'fabric_store_manager' and p_branch = 'fabrics')
      or (u.role = 'worker' and w.worker_type = 'accountant' and p_branch in ('tailoring', 'ready_designs'))
    )
  );
$$;
grant execute on function private.can_access_finance_branch(text) to authenticated;

create or replace function private.cash_box_user_is_authorized(p_for_withdrawal boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users as u left join public.workers as w on w.user_id = u.id
    where u.id = (select auth.uid()) and u.is_active = true and (
      u.role = 'admin' or (u.role = 'worker' and (
        (p_for_withdrawal and w.worker_type = 'accountant')
        or (not p_for_withdrawal and w.worker_type in ('accountant', 'general_manager', 'fabric_store_manager'))
      ))
    )
  );
$$;
grant execute on function private.cash_box_user_is_authorized(boolean) to authenticated;

create or replace function private.assert_payroll_branch_access(p_branch text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.users u left join public.workers w on w.user_id = u.id
    where u.id = auth.uid() and u.is_active = true and (
      u.role = 'admin' or (u.role = 'worker' and w.worker_type = 'fabric_store_manager' and p_branch = 'fabrics')
    )
  ) then
    raise exception using errcode = '42501', message = 'PAYROLL_FORBIDDEN|ليس لديك صلاحية تعديل رواتب هذا القسم';
  end if;
end;
$$;
grant execute on function private.assert_payroll_branch_access(text) to authenticated;

-- مثبّت لفحص الإسناد فقط (الدالة الحية تُستبدل بالهجرة)
create or replace function public.enforce_order_cutter_assignment() returns trigger language plpgsql set search_path = '' as $$
begin return new; end;
$$;
create trigger enforce_order_cutter_assignment before insert or update on public.orders
  for each row execute function public.enforce_order_cutter_assignment();
