-- ============================================================================
-- إصلاح AUD-01 (تقرير التدقيق، 30 سبتمبر 2026) — الدفعة A
-- ============================================================================
-- الحي قبل هذه الهجرة: أربع سياسات `to public using (true)` على `income` وأخرى على
-- `expenses`، وكل الصلاحيات لـanon. أي زائر بمفتاح anon المنشور يقرأ ويُدرج ويعدّل
-- ويحذف. هذه السياسات ليست في أي ملف هجرة بالمستودع.
--
-- مصفوفة الأدوار (قرار المالكة، 1 أكتوبر 2026):
--   • فرع الأقمشة   (branch = 'fabrics')                 : المدير + مدير متجر الأقمشة.
--   • التفصيل والتصاميم الجاهزة ('tailoring','ready_designs'): المدير + المحاسب.
--   • المدير العام، مدير الورشة، الخياط، الشكّاك، الزائر   : لا شيء.
--   كل العمليات (قراءة/إضافة/تعديل/حذف) لمن له الفرع. التعديل لا ينقل صفاً إلى فرع آخر
--   لا يملكه الفاعل (with check). الخادم (service_role) يتجاوز RLS كما اليوم.
--
-- وأيضاً:
--   • لا صلاحية لـanon على الجدولين ولا على تسلسل فواتير الأقمشة.
--   • authenticated يفقد TRUNCATE وREFERENCES وTRIGGER (الـTRUNCATE يتجاوز RLS).
--   • `generate_recurring_expenses` لا يستدعيها الزائر (الجسم كما هو).
--   • `private.fabric_store_protect_online_sale`: أعمدة `alostaz_*` لصف مرتبط بطلب المتجر
--     لا تتغير من جلسة متصفح (anon/authenticated)؛ الخادم وحده يكتبها. `notes` و`fabric_images`
--     تبقى للموظفين.
--
-- لا يمس أي صف، ولا حارس المخزون، ولا مسار خصم المخزون. يُطبَّق خارج ساعات المحل من SQL Editor.
-- التراجع: docs/store-launch-plans/implementation/payments/fixes/FIX-A-rollback.sql
--          (يعيد سياسات مقيدة بـcan_manage_fabric_operations، لا `true`).
-- ============================================================================
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0) فحص الانحراف: نرفض إن وجدنا على الجدولين أو الحارس شيئاً لم نقرأه.
-- ---------------------------------------------------------------------------
do $$
declare
  v_unknown text;
begin
  select string_agg(p.tablename || '.' || p.policyname, ', ') into v_unknown
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('income', 'expenses')
    and p.policyname not in (
      'income_select_policy', 'income_insert_policy', 'income_update_policy', 'income_delete_policy',
      'expenses_select_policy', 'expenses_insert_policy', 'expenses_update_policy', 'expenses_delete_policy',
      -- هذه الهجرة نفسها (إعادة التطبيق آمنة)
      'income_staff_select', 'income_staff_insert', 'income_staff_update', 'income_staff_delete',
      'expenses_staff_select', 'expenses_staff_insert', 'expenses_staff_update', 'expenses_staff_delete',
      -- سكربت التراجع fixes/FIX-A-rollback.sql (إعادة التطبيق بعده آمنة)
      'income_fallback_select', 'income_fallback_insert', 'income_fallback_update', 'income_fallback_delete',
      'expenses_fallback_select', 'expenses_fallback_insert', 'expenses_fallback_update', 'expenses_fallback_delete');
  if v_unknown is not null then
    raise exception 'FINANCE_RLS_DRIFT: unexpected policies (%) — inspect them before replacing', v_unknown;
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = 'private.fabric_store_protect_online_sale()'::regprocedure
      and md5(replace(p.prosrc, E'\r\n', E'\n')) in (
        '622e10db571e50a8532878425e41f0e1', -- المرحلة 8 (20260930091944)، مقروءة من الحي 1 أكتوبر
        '8fd8694fded5ec1daaaf34e5b481fb15'  -- هذه الهجرة (إعادة التطبيق آمنة)
      )
  ) then
    raise exception 'FABRIC_STORE_PROTECT_ONLINE_SALE_DRIFT: inspect the deployed function before replacing it';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) من يملك فرعاً مالياً
-- ---------------------------------------------------------------------------
create or replace function private.can_access_finance_branch(p_branch text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
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
  );
$$;
revoke all on function private.can_access_finance_branch(text) from public, anon;
grant execute on function private.can_access_finance_branch(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) الصلاحيات
-- ---------------------------------------------------------------------------
revoke all on table public.income, public.expenses from anon;
revoke truncate, references, trigger on table public.income, public.expenses from authenticated;
grant select, insert, update, delete on table public.income, public.expenses to authenticated;

-- set_income_invoice_number (security invoker) يحتاج USAGE لموظف يُدرج مبيعة؛ الزائر لا.
revoke all on sequence public.fabrics_invoice_number_seq from anon;

revoke execute on function public.generate_recurring_expenses(character varying, date) from public, anon;
grant execute on function public.generate_recurring_expenses(character varying, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) السياسات
-- ---------------------------------------------------------------------------
alter table public.income enable row level security;
alter table public.expenses enable row level security;

drop policy if exists income_select_policy on public.income;
drop policy if exists income_insert_policy on public.income;
drop policy if exists income_update_policy on public.income;
drop policy if exists income_delete_policy on public.income;
drop policy if exists income_staff_select on public.income;
drop policy if exists income_staff_insert on public.income;
drop policy if exists income_staff_update on public.income;
drop policy if exists income_staff_delete on public.income;
drop policy if exists income_fallback_select on public.income;
drop policy if exists income_fallback_insert on public.income;
drop policy if exists income_fallback_update on public.income;
drop policy if exists income_fallback_delete on public.income;

create policy income_staff_select on public.income for select to authenticated
  using (private.can_access_finance_branch(branch));
create policy income_staff_insert on public.income for insert to authenticated
  with check (private.can_access_finance_branch(branch));
create policy income_staff_update on public.income for update to authenticated
  using (private.can_access_finance_branch(branch))
  with check (private.can_access_finance_branch(branch));
create policy income_staff_delete on public.income for delete to authenticated
  using (private.can_access_finance_branch(branch));

drop policy if exists expenses_select_policy on public.expenses;
drop policy if exists expenses_insert_policy on public.expenses;
drop policy if exists expenses_update_policy on public.expenses;
drop policy if exists expenses_delete_policy on public.expenses;
drop policy if exists expenses_staff_select on public.expenses;
drop policy if exists expenses_staff_insert on public.expenses;
drop policy if exists expenses_staff_update on public.expenses;
drop policy if exists expenses_staff_delete on public.expenses;
drop policy if exists expenses_fallback_select on public.expenses;
drop policy if exists expenses_fallback_insert on public.expenses;
drop policy if exists expenses_fallback_update on public.expenses;
drop policy if exists expenses_fallback_delete on public.expenses;

create policy expenses_staff_select on public.expenses for select to authenticated
  using (private.can_access_finance_branch(branch));
create policy expenses_staff_insert on public.expenses for insert to authenticated
  with check (private.can_access_finance_branch(branch));
create policy expenses_staff_update on public.expenses for update to authenticated
  using (private.can_access_finance_branch(branch))
  with check (private.can_access_finance_branch(branch));
create policy expenses_staff_delete on public.expenses for delete to authenticated
  using (private.can_access_finance_branch(branch));

-- ---------------------------------------------------------------------------
-- 4) حارس مبيعة المتجر: حالة فاتورة الأستاذ للخادم وحده
-- ---------------------------------------------------------------------------
-- نسخة المرحلة 8 كما هي، مع فحص واحد إضافي: جلسة متصفح (anon/authenticated) لا تغيّر
-- `alostaz_*` على صف مرتبط بطلب. `current_setting('role')` يبقى دور الجلسة داخل
-- security definer (بعكس current_user). الخادم بـservice_role، وSQL Editor بـpostgres.
create or replace function private.fabric_store_protect_online_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_mutable constant text[] := array[
    'alostaz_customer_id', 'alostaz_invoice_id', 'alostaz_invoice_code', 'alostaz_sync_status',
    'alostaz_synced_at', 'alostaz_sync_token', 'alostaz_sync_error',
    'notes', 'fabric_images', 'fabric_inventory_tracked'];
  c_staff_mutable constant text[] := array['notes', 'fabric_images', 'fabric_inventory_tracked'];
  v_order_number text;
  v_kind text;
begin
  if old.branch is distinct from 'fabrics'
     or old.category is null or old.category not in ('fabric_sale', 'fabric_store_refund') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- تراجع خاطئ حذف جداول المتجر: لا طلبات = لا مبيعات مقفلة، ولا تتعطل مبيعات المحل.
  if to_regclass('public.fabric_store_orders') is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.category = 'fabric_sale' then
    select o.order_number into v_order_number
    from public.fabric_store_orders o
    where o.income_id = old.id;
    v_kind := 'مبيعة';
  else
    select o.order_number into v_order_number
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    where r.income_id = old.id;
    v_kind := 'مرتجع';
  end if;

  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|%s الطلب الإلكتروني %s مرتبطة بدفعة حقيقية ولا تُحذف؛ الإلغاء والاسترداد من طلبات المتجر', v_kind, v_order_number);
  end if;

  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|%s الطلب الإلكتروني %s مرتبطة بدفعة حقيقية ولا يُعدَّل مبلغها أو قماشها أو تاريخها', v_kind, v_order_number);
  end if;

  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated')
     and (to_jsonb(new) - c_staff_mutable) is distinct from (to_jsonb(old) - c_staff_mutable) then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|حالة فاتورة الأستاذ ل%s الطلب الإلكتروني %s يحدّثها الخادم وحده', v_kind, v_order_number);
  end if;

  return new;
end;
$$;
revoke all on function private.fabric_store_protect_online_sale() from public, anon, authenticated;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'private.fabric_store_protect_online_sale()'::regprocedure;

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FINANCE_RLS_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
