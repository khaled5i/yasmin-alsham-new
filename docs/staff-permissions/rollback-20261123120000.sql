-- =============================================================================
-- التراجع عن هجرة 20261123120000_staff_permissions.sql
-- يعيد الدوال المركزية إلى نصّها الحي قبل الهجرة (قُرئت من الإنتاج 23 نوفمبر 2026)
-- ويحذف السياسات والجداول والدوال الجديدة.
-- ⚠️ يحذف تخصيصات الصلاحيات المحفوظة لكل العمال.
-- =============================================================================

begin;

-- 1) السياسات الإضافية
drop policy if exists "Staff permission: view orders" on public.orders;
drop policy if exists "Staff permission: create orders" on public.orders;
drop policy if exists "Staff permission: update orders" on public.orders;
drop policy if exists "Staff permission: delete orders" on public.orders;
drop policy if exists "Staff permission: view alterations" on public.alterations;
drop policy if exists "Staff permission: create alterations" on public.alterations;
drop policy if exists "Staff permission: update alterations" on public.alterations;
drop policy if exists "Staff permission: delete alterations" on public.alterations;
drop policy if exists "Staff permission: order payments" on public.order_payments;
drop policy if exists "Staff permission: view order additional payments" on public.order_additional_payments;
drop policy if exists "Staff permission: view discount coupons" on public.discount_coupons;
drop policy if exists "Staff permission: view cash box adjustments" on public.cash_box_adjustments;
drop policy if exists "Staff permission: view cash box order receipts" on public.cash_box_order_receipts;
drop policy if exists "Staff permission: view cash box withdrawals" on public.cash_box_withdrawals;
drop policy if exists "Staff permission: insert accounting categories" on public.accounting_categories;
drop policy if exists "Staff permission: update accounting categories" on public.accounting_categories;
drop policy if exists "Staff permission: delete accounting categories" on public.accounting_categories;
drop policy if exists "Staff permission: view women workshop" on public.women_workshop_transactions;
drop policy if exists "Staff permission: insert women workshop from orders" on public.women_workshop_transactions;
drop policy if exists "Staff permission: update women workshop from orders" on public.women_workshop_transactions;
drop policy if exists "Staff permission: view attendance devices" on public.attendance_devices;
drop policy if exists "Staff permission: view attendance device users" on public.attendance_device_users;
drop policy if exists "Staff permission: view attendance events" on public.attendance_events;
drop policy if exists "Staff permission: manage attendance mappings" on public.attendance_worker_mappings;
drop policy if exists "Staff permission: view attendance suspensions" on public.attendance_worker_suspensions;
drop policy if exists "Staff permission: suspend workers" on public.attendance_worker_suspensions;
drop policy if exists "Staff permission: resume workers" on public.attendance_worker_suspensions;
drop policy if exists "Staff permission: view quality attempts" on public.order_quality_review_attempts;
drop policy if exists "Staff permission: create quality attempts" on public.order_quality_review_attempts;

-- 2) الدوال المركزية — النص الحي السابق
create or replace function private.can_access_finance_branch(p_branch text)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
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
$function$;

create or replace function public.can_manage_fabrics()
returns boolean
language plpgsql
security definer
as $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.workers w ON w.user_id = u.id
    WHERE u.id = auth.uid()
    AND u.is_active = true
    AND (
      -- Admin
      u.role = 'admin'
      OR
      -- Fabric Store Manager
      (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
      OR
      -- General Manager
      (u.role = 'worker' AND w.worker_type = 'general_manager')
    )
  );
END;
$function$;
alter function public.can_manage_fabrics() reset search_path;

create or replace function private.can_manage_fabric_operations()
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select auth.uid() is not null and exists (
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
  );
$function$;

create or replace function private.cash_box_user_is_authorized(p_for_withdrawal boolean default false)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    LEFT JOIN public.workers AS w ON w.user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND u.is_active = TRUE
      AND (
        u.role = 'admin'
        OR (
          u.role = 'worker'
          AND (
            (p_for_withdrawal AND w.worker_type = 'accountant')
            OR (
              NOT p_for_withdrawal
              AND w.worker_type IN (
                'accountant',
                'general_manager',
                'fabric_store_manager'
              )
            )
          )
        )
      )
  );
$function$;

create or replace function private.assert_payroll_branch_access(p_branch text)
returns void
language plpgsql
stable security definer
set search_path to ''
as $function$
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
  ) then
    raise exception using
      errcode = '42501',
      message = 'PAYROLL_FORBIDDEN|ليس لديك صلاحية تعديل رواتب هذا القسم';
  end if;
end;
$function$;

create or replace function public.enforce_order_cutter_assignment()
returns trigger
language plpgsql
set search_path to ''
as $function$
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
$function$;

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
set search_path to ''
as $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_amount NUMERIC(12, 2) := ROUND(COALESCE(p_amount, 0), 2);
  v_method_total NUMERIC(12, 2);
  v_recorded NUMERIC(12, 2);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = (SELECT auth.uid()) AND u.is_active = TRUE AND u.role = 'admin'
  ) AND NOT private.cash_box_user_is_authorized(FALSE) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لتسجيل دفعات الطلب' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(TRIM(p_payment_id), '') = '' THEN
    RAISE EXCEPTION 'معرّف الدفعة مطلوب';
  END IF;
  IF p_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة دفع غير صالحة';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة غير صالح';
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_additional_payments WHERE id = p_payment_id) THEN
    UPDATE public.order_additional_payments
    SET alostaz_invoice_code = COALESCE(NULLIF(TRIM(p_alostaz_invoice_code), ''), alostaz_invoice_code)
    WHERE id = p_payment_id AND order_id = p_order_id;
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  v_method_total := CASE
    WHEN p_method = 'cash' THEN private.tailoring_order_pre_delivery_cash(v_order)
    ELSE GREATEST(COALESCE(v_order.pre_delivery_network_amount, 0), 0)
  END;
  SELECT COALESCE(SUM(p.amount), 0) INTO v_recorded
  FROM public.order_additional_payments AS p
  WHERE p.order_id = p_order_id AND p.method = p_method;

  IF v_recorded + v_amount > v_method_total + 0.005 THEN
    RAISE EXCEPTION 'مبلغ الدفعة لا يطابق المبالغ المحفوظة على الطلب';
  END IF;

  INSERT INTO public.order_additional_payments (
    id, order_id, branch, method, amount, occurred_at, alostaz_invoice_code
  )
  VALUES (
    p_payment_id,
    p_order_id,
    COALESCE(v_order.branch, 'tailoring'),
    p_method,
    v_amount,
    COALESCE(p_occurred_at, now()),
    NULLIF(TRIM(p_alostaz_invoice_code), '')
  );

  IF p_method = 'cash' AND v_order.status <> 'delivered' THEN
    UPDATE public.cash_box_order_receipts
    SET amount = GREATEST(
      private.tailoring_order_pre_delivery_cash(v_order)
        - private.tailoring_order_additional_cash(p_order_id),
      0
    )
    WHERE order_id = p_order_id
      AND receipt_type = 'order_deposit';
  END IF;
END;
$function$;

-- 3) الدوال والجداول الجديدة
drop function if exists public.set_staff_permissions(uuid, jsonb);
drop function if exists public.get_staff_permissions(uuid);
drop function if exists public.get_my_staff_permissions();
drop function if exists public.staff_can_user(uuid, text[]);
drop function if exists public.staff_can_any(text[]);
drop function if exists public.staff_can(text);
drop function if exists private.staff_permission_for_user(uuid, text);
drop function if exists private.staff_permission_any_for_user(uuid, text[]);
drop table if exists public.staff_permissions;
drop table if exists public.staff_permission_catalog;

commit;
