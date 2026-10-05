-- ============================================================================
-- متجر الأقمشة الإلكتروني — إدارة الطلبات في اللوحة (تجهيز، استلام، شحن، مراجعة)
-- المرحلة 7 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- قرارات المالك (29 سبتمبر): يدير الطلبات **المدير ومدير متجر الأقمشة**، ويحسمان
-- علامة المراجعة؛ الشحن يُسجَّل يدوياً (الشركة + رقم البوليصة)؛ إشعار الزبونة بزر واتساب.
--
-- ما تضيفه:
--   • أعمدة على fabric_store_orders: shipping_carrier, tracking_number, shipped_at.
--     قيد: بيانات الشحن لطلبات الشحن فقط. «لا شحن بلا بوليصة» في دالة الموظف أدناه.
--   • public.fabric_store_staff_set_fulfillment — تغيير حالة التنفيذ باسم الموظف:
--       تجهيز · جاهز للاستلام · شُحن (مع الشركة والرقم) · سُلِّم · إرجاع إلى «لم يُجهَّز» ·
--       إلغاء طلب **غير مدفوع** (ويُحرَّر حجزه). طلب مدفوع لا يُلغى هنا: الإلغاء معه
--       استرداد، وهو المرحلة 8 (للمدير فقط).
--   • public.fabric_store_staff_resolve_review — رفع علامة المراجعة بملاحظة إلزامية.
--   • public.fabric_store_staff_add_note — ملاحظة في سجل الطلب.
--
-- الصلاحية: الدوال لـservice_role وحده. **من هو الموظف** يتحقق منه مسار الخادم
-- (src/lib/server/fabric-store/staff-auth.ts) من جلسته، ثم يمرّر معرّفه هنا فيُسجَّل
-- في سجل التدقيق (actor_type = staff, actor_id). حارس المرحلة 2 يبقى الحكم على
-- الانتقالات المسموحة، ولا يُجهَّز طلب غير مدفوع أو تحت المراجعة.
--
-- لا يمس أي جدول أو دالة للمحل. التطبيق في أي وقت (يقفل fabric_store_orders لحظياً).
-- التحقق: supabase/tests/fabric_store_order_admin.sql (آمن على الحي: لا income).
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_confirm_order(uuid)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE6_MISSING|طبّق هجرات المراحل 2 → 6 قبل هذه الهجرة';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) بيانات الشحن على الطلب
-- ---------------------------------------------------------------------------

alter table public.fabric_store_orders
  add column shipping_carrier text,
  add column tracking_number text,
  add column shipped_at timestamptz,
  add constraint fabric_store_orders_shipping_carrier
    check (shipping_carrier is null or char_length(btrim(shipping_carrier)) between 2 and 80),
  add constraint fabric_store_orders_tracking_number
    check (tracking_number is null or tracking_number ~ '^[A-Za-z0-9-]{3,60}$'),
  -- «لا شحن بلا بوليصة» يُفرض في fabric_store_staff_set_fulfillment (المسار الوحيد للشحن)،
  -- لا بقيد على الصف: اختبار المرحلة 2 المعتمد يشحن طلباً مباشرة بلا بوليصة.
  add constraint fabric_store_orders_tracking_only_for_shipping
    check (delivery_method = 'shipping' or (shipping_carrier is null and tracking_number is null and shipped_at is null));

comment on column public.fabric_store_orders.tracking_number is
  'رقم بوليصة الشحن كما كتبه الموظف (المرحلة 7، يدوياً). يظهر للزبونة في صفحة التتبّع.';

-- ---------------------------------------------------------------------------
-- 2) تغيير حالة التنفيذ باسم الموظف
-- ---------------------------------------------------------------------------
-- النتيجة (status): ok · not_found · bad_request · sale_pending (سداد live لم تُسجَّل
-- مبيعته بعد) · refund_required (إلغاء طلب مدفوع = المرحلة 8) · tracking_required ·
-- refused (رفض حارس المرحلة 2: الكود في code والسبب في message).

create or replace function public.fabric_store_staff_set_fulfillment(
  p_order_id uuid,
  p_to text,
  p_actor_id uuid,
  p_carrier text,
  p_tracking text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.fabric_store_orders%rowtype;
  v_environment text;
  v_carrier text := nullif(btrim(coalesce(p_carrier, '')), '');
  v_tracking text := nullif(upper(regexp_replace(coalesce(p_tracking, ''), '\s', '', 'g')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_released integer;
  v_message text;
begin
  if p_actor_id is null
     or p_to is null
     or p_to not in ('unfulfilled', 'preparing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled')
     or char_length(coalesce(v_note, '')) > 500 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select o.* into v_order
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.fulfillment_status = p_to then
    return jsonb_build_object('status', 'ok', 'fulfillment_status', p_to, 'unchanged', true);
  end if;

  select a.environment into v_environment
  from public.fabric_store_payment_attempts a
  where a.id = v_order.paid_attempt_id;

  -- التقدّم في تجهيز سداد حقيقي يحتاج مبيعته مسجّلة (وإلا فالقماش لم يُخصم بعد).
  if p_to in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')
     and v_environment = 'live' and v_order.income_id is null then
    return jsonb_build_object('status', 'sale_pending');
  end if;

  if p_to = 'cancelled' and v_order.payment_status not in ('pending', 'failed') then
    return jsonb_build_object('status', 'refund_required');
  end if;

  if p_to = 'shipped' then
    if v_carrier is null or char_length(v_carrier) not between 2 and 80
       or v_tracking is null or v_tracking !~ '^[A-Z0-9-]{3,60}$' then
      return jsonb_build_object('status', 'tracking_required');
    end if;
  end if;

  perform set_config('fabric_store.actor_type', 'staff', true);
  perform set_config('fabric_store.actor_id', p_actor_id::text, true);

  begin
    update public.fabric_store_orders
    set fulfillment_status = p_to,
        cancel_reason = case when p_to = 'cancelled' then coalesce(left(v_note, 300), 'أُلغي من لوحة المتجر') else cancel_reason end,
        shipping_carrier = case when p_to = 'shipped' then v_carrier else shipping_carrier end,
        tracking_number = case when p_to = 'shipped' then v_tracking else tracking_number end,
        shipped_at = case when p_to = 'shipped' then now() else shipped_at end
    where id = p_order_id;
  exception when sqlstate 'P0001' or check_violation then
    get stacked diagnostics v_message = message_text;
    return jsonb_build_object('status', 'refused',
      'code', split_part(v_message, '|', 1),
      'message', coalesce(nullif(split_part(v_message, '|', 2), ''), v_message));
  end;

  -- طلب غير مدفوع أُلغي: يعود قماشه للمحل فوراً.
  if p_to = 'cancelled' then
    v_released := private.fabric_store_release_order_reservations(p_order_id, 'أُلغي الطلب من لوحة المتجر');
  end if;

  if v_note is not null then
    insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
    values (p_order_id, 'note', 'staff', p_actor_id, v_note);
  end if;

  return jsonb_build_object('status', 'ok', 'fulfillment_status', p_to, 'released_holds', coalesce(v_released, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) حسم علامة المراجعة
-- ---------------------------------------------------------------------------
-- الملاحظة إلزامية (ماذا حُسم وكيف: وُفّر القماش، رُدّ الدفع الزائد لدى ميسر...). تُغلق معها
-- تنبيهات الموظفين المفتوحة للطلب.
-- هذه النسخة كما طُبّقت على القاعدة الحية (29 سبتمبر). استبدلتها الهجرة
-- 20260929170000_fabric_store_review_recheck.sql بعد المراجعة: لقطة ما رآه الموظف،
-- وإعادة جدولة الاعتماد بعد نقص المخزون.

create or replace function public.fabric_store_staff_resolve_review(
  p_order_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_needs_review boolean;
  v_closed integer;
begin
  if p_actor_id is null or v_note is null or char_length(v_note) not between 3 and 500 then
    return jsonb_build_object('status', 'note_required');
  end if;

  select o.needs_review into v_needs_review
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not v_needs_review then
    return jsonb_build_object('status', 'not_flagged');
  end if;

  perform set_config('fabric_store.actor_type', 'staff', true);
  perform set_config('fabric_store.actor_id', p_actor_id::text, true);
  -- قيد المرحلة 2 يمنع review_reason بلا علامة، فيُمحى السبب هنا. هو محفوظ في سجل التدقيق
  -- منذ رُفعت العلامة (حدث review_flag بسببه)، ويُضاف إليه سبب الحسم أدناه.
  update public.fabric_store_orders
  set needs_review = false, review_reason = null
  where id = p_order_id;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id, left('حُسمت المراجعة: ' || v_note, 500));

  update public.fabric_store_outbox
  set status = 'done', completed_at = now(), locked_until = null,
      payload = payload || jsonb_build_object('resolved_by', p_actor_id)
  where order_id = p_order_id
    and topic = 'notify_staff'
    and status not in ('done', 'dead');
  get diagnostics v_closed = row_count;

  return jsonb_build_object('status', 'ok', 'closed_alerts', v_closed);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) ملاحظة في سجل الطلب
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_staff_add_note(
  p_order_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_actor_id is null or v_note is null or char_length(v_note) not between 2 and 500 then
    return jsonb_build_object('status', 'note_required');
  end if;
  if not exists (select 1 from public.fabric_store_orders o where o.id = p_order_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id, v_note);
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- الصلاحيات: service_role وحده
-- ---------------------------------------------------------------------------

revoke all on function public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fabric_store_staff_resolve_review(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fabric_store_staff_add_note(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.fabric_store_staff_resolve_review(uuid, uuid, text) to service_role;
grant execute on function public.fabric_store_staff_add_note(uuid, uuid, text) to service_role;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabric_store_staff_set_fulfillment';

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
