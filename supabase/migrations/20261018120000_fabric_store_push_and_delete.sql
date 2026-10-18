-- طلبات المتجر الإلكتروني: إشعارات المتصفح (Web Push) + حذف الطلب للمدير (18 أكتوبر 2026).
-- المالك يطبّق هذا الملف من SQL Editor؛ لا تنفيذ على الإنتاج من المساعد.
--
-- 1) staff_push_subscriptions: اشتراكات إشعارات المتصفح لكل جهاز (المدير ومدير متجر الأقمشة).
-- 2) fabric_store_order_push_log: «أُرسل إشعار هذا الطلب» — مرة واحدة لكل طلب مهما تكرر السداد
--    (webhook + صفحة الرجوع + المهمة المجدولة).
-- 3) fabric_store_orders.deleted_at/deleted_by + fabric_store_staff_delete_order: «حذف» الطلب
--    إخفاءٌ من قوائم اللوحة، لا محو: محاولات الدفع وأحداث ميسر والاستردادات مربوطة بالطلب
--    بـ ON DELETE RESTRICT عمداً (أثر مالي لا يُمحى). يُحذف فقط طلب لا مال عليه:
--    ملغى قبل الدفع، أو مسترد كاملاً. للمدير الفعّال فقط، ويُسجَّل في سجل الطلب.
--
-- التراجع: drop function public.fabric_store_staff_delete_order(uuid, uuid, text);
--          alter table public.fabric_store_orders drop column deleted_by, drop column deleted_at;
--          drop table public.fabric_store_order_push_log; drop table public.staff_push_subscriptions;

begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.staff_push_subscriptions') is not null
     or to_regclass('public.fabric_store_order_push_log') is not null
     or to_regprocedure('public.fabric_store_staff_delete_order(uuid,uuid,text)') is not null then
    raise exception 'FABRIC_STORE_PUSH_EXISTS: inspect the existing definitions; do not overwrite';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) اشتراكات الإشعارات — يقرؤها ويكتبها الخادم (service_role) فقط
-- ---------------------------------------------------------------------------
create table public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  constraint staff_push_subscriptions_endpoint_key unique (endpoint),
  constraint staff_push_subscriptions_endpoint_https check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  constraint staff_push_subscriptions_keys_size check (char_length(p256dh) <= 200 and char_length(auth) <= 100),
  constraint staff_push_subscriptions_user_agent_size check (user_agent is null or char_length(user_agent) <= 300)
);
create index staff_push_subscriptions_user_idx on public.staff_push_subscriptions (user_id);
alter table public.staff_push_subscriptions enable row level security;
revoke all on table public.staff_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- 2) سجل «أُرسل إشعار الطلب الجديد»
-- ---------------------------------------------------------------------------
create table public.fabric_store_order_push_log (
  order_id uuid primary key references public.fabric_store_orders(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.fabric_store_order_push_log enable row level security;
revoke all on table public.fabric_store_order_push_log from public, anon, authenticated;
grant select, insert on table public.fabric_store_order_push_log to service_role;

-- ---------------------------------------------------------------------------
-- 3) حذف الطلب (إخفاء) للمدير
-- ---------------------------------------------------------------------------
alter table public.fabric_store_orders
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.users(id) on delete set null;

create index fabric_store_orders_not_deleted_idx
  on public.fabric_store_orders (created_at desc) where deleted_at is null;

-- النتيجة (status): ok · already_deleted · not_found · bad_request · forbidden · not_deletable
create function public.fabric_store_staff_delete_order(p_order_id uuid, p_actor_id uuid, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.fabric_store_orders%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_order_id is null or p_actor_id is null or char_length(coalesce(v_note, '')) > 300 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if not private.fabric_store_actor_is_admin(p_actor_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select o.* into v_order from public.fabric_store_orders o where o.id = p_order_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.deleted_at is not null then
    return jsonb_build_object('status', 'already_deleted');
  end if;

  -- لا مال على الطلب: ملغى ولم يُدفع، أو رُدّ كامل مبلغه. ولا علامة مراجعة، ولا استرداد معلّق،
  -- ولا دفعة ناجحة (ولو إضافية أو متأخرة بعد الإلغاء) لم يُرد كامل مبلغها.
  if not (
       (v_order.fulfillment_status = 'cancelled' and v_order.payment_status in ('pending', 'failed'))
       or v_order.payment_status = 'refunded'
     )
     or v_order.needs_review
     or exists (select 1 from public.fabric_store_refunds r where r.order_id = p_order_id and r.status = 'pending')
     or exists (select 1 from public.fabric_store_payment_attempts a
                where a.order_id = p_order_id and a.status = 'paid'
                  and a.amount_halalas > coalesce((select sum(r.amount_halalas) from public.fabric_store_refunds r
                                                   where r.attempt_id = a.id and r.status = 'succeeded'), 0)) then
    return jsonb_build_object('status', 'not_deletable');
  end if;

  update public.fabric_store_orders
  set deleted_at = now(), deleted_by = p_actor_id
  where id = p_order_id;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id,
          'حُذف الطلب من قوائم اللوحة' || coalesce(' — ' || v_note, ''));

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.fabric_store_staff_delete_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fabric_store_staff_delete_order(uuid, uuid, text) to service_role;

commit;
