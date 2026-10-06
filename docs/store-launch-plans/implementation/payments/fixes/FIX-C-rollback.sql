-- ============================================================================
-- تراجع الدفعة C (AUD-06، 05، 04، 03، 08، 12) — يُبطل 20261005120000_fabric_store_money_guards.sql
-- ============================================================================
-- يعيد سبع دوال حرفياً من ملفات هجراتها: begin_payment (الدفعة B)، staff_set_fulfillment وrefund_begin
-- وrefund_finish (المرحلة 8)، apply_payment وrefund_close_unconfirmed (تصحيح المرحلة 8)، staff_alerts
-- (المرحلة 9)؛ ويحذف التوقيعين الجديدين ودالة تسجيل الاسترداد الخارجي وفحص المدير وحارس الأعمدة.
-- (هذا الملف مولَّد من ملفات الهجرات نفسها؛ بصماته تُفحص في آخره.)
--
-- ⚠ هذا يعيد الثغرات AUD-06/05/04/03/08/12. لذلك:
--   • التراجع الأول دائماً **إطفاء مفتاحي الدفع والاسترداد** على Vercel (FABRIC_STORE_PAYMENTS_ENABLED،
--     FABRIC_STORE_REFUNDS_ENABLED) — بلا أي تغيير في القاعدة.
--   • يرفض العمل ما لم تُعلني في الجلسة نفسها أن الدفع الجديد والاسترداد مطفآن:
--         set local fabric_store.rollback_c_ack = 'payments-and-refunds-disabled';
--   • يرفض ما دام استرداد معلّق (مال قد يكون في الطريق؛ نسخة المرحلة 8 من refund_finish تكتب صف
--     مرتجع للمبيعة المعتمدة حتى لو كان الاسترداد على دفعة إضافية).
--   • يرفض إن وُجدت صفحة دفع مفتوحة أو فاتورة فاشلة ما زالت قابلة للدفع.
-- ما يبقى عمداً (سجل مالي وتدقيق، لا يعيد فتح شيء): الأعمدة provider_refunded_halalas وsupport_reference
-- وexternal_reference وقيودها، وصفوف الاسترداد التي سُجّلت بها (مال رُدّ فعلاً).
-- إعادة الهجرة بعده آمنة (تعرف البصمات القديمة).
-- الترتيب: C ← B ← A ← 9 ← … (تراجعا 9 وB يرفضان ما دامت C مطبّقة).
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if coalesce(current_setting('fabric_store.rollback_c_ack', true), '') <> 'payments-and-refunds-disabled' then
    raise exception 'FIX_C_ROLLBACK_REFUSED: this re-opens AUD-06/05/04/03/08/12. Turn FABRIC_STORE_PAYMENTS_ENABLED and FABRIC_STORE_REFUNDS_ENABLED off first, then run: set local fabric_store.rollback_c_ack = ''payments-and-refunds-disabled''; in the same transaction';
  end if;
  if to_regprocedure('public.fabric_store_refund_record_external(uuid, uuid, uuid, text, bigint, text, text, bigint, uuid)') is null then
    raise exception 'FIX_C_ROLLBACK_NOT_NEEDED: migration 20261005120000 is not applied';
  end if;
  if exists (
    select 1 from (values
      ('public.fabric_store_begin_payment(bytea, text, bytea)', '473981a63b6bad888d09387cd3007512'),
      ('public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text, boolean)', '7881b262985db9cac3f2e7e96cb019b5'),
      ('public.fabric_store_apply_payment(uuid, text, jsonb, uuid)', '409ccff40230a97c87746ac94d849a43'),
      ('public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid, uuid, text)', '3d48074794f708dbaf67087f9e283f8e'),
      ('public.fabric_store_refund_finish(uuid, uuid, text, bigint, text)', '0e6d1c21e280876e68ae2af8bcc0ec61'),
      ('public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint)', 'c9f8fa22045b74f78d348999da316fad'),
      ('public.fabric_store_staff_alerts()', 'e2b2ab019bc598894c0cc9fd3b042c77')
    ) as x(sig, fp)
    where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(x.sig)
                        and md5(replace(p.prosrc, E'\r\n', E'\n')) = x.fp)
  ) then
    raise exception 'FIX_C_ROLLBACK_DRIFT: the deployed functions are not the batch C versions — inspect before rolling back';
  end if;
  -- قفل الجدولين قبل الفحص، فلا يبدأ استرداد ولا محاولة بين الفحص والاستبدال.
  lock table public.fabric_store_refunds in share row exclusive mode nowait;
  lock table public.fabric_store_payment_attempts in share row exclusive mode nowait;
  if exists (select 1 from public.fabric_store_refunds r where r.status = 'pending') then
    raise exception 'FIX_C_ROLLBACK_REFUSED: a refund is pending — let the job reconcile it with Moyasar first';
  end if;
  if exists (select 1 from public.fabric_store_payment_attempts a
             where a.status in ('created', 'initiated', 'authorized', 'failed') and a.expires_at > now()) then
    raise exception 'FIX_C_ROLLBACK_REFUSED: a payment page can still take a payment — wait until it ends';
  end if;
end $$;

drop function public.fabric_store_refund_record_external(uuid, uuid, uuid, text, bigint, text, text, bigint, uuid);
drop function public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text, boolean);
drop function public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid, uuid, text);
drop trigger fabric_store_refunds_guard_batch_c on public.fabric_store_refunds;
drop function private.fabric_store_guard_refund_batch_c();

-- نسخة الدفعة B (20261003120000_fabric_store_hold_at_payment.sql) حرفياً
create or replace function public.fabric_store_begin_payment(
  p_access_hash bytea,
  p_environment text,
  p_client_hash bytea
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '800ms'
as $$
declare
  -- صفحة الدفع أقصر من الحجز (HANDOFF §4 القرار 9): 20 دقيقة على الأكثر، وتنتهي قبل الحجز بدقيقتين.
  c_attempt_window interval := interval '20 minutes';
  c_hold_margin interval := interval '2 minutes';
  c_min_window interval := interval '5 minutes';
  c_max_attempts integer := 5;
  -- الدفعة B (AUD-02، قرار المالكة 1 أكتوبر 2026): الحجز يبدأ هنا لا عند إنشاء الطلب.
  -- مدته أطول من صفحة ميسر دائماً (20 دقيقة تنتهي قبله بدقيقتين). السقوف على الكمية
  -- المحجوزة في وقت واحد: قطع كاملة (عدد) وبالمتر (سنتيمتر)، لكل جوال ولكل بصمة IP وللمتجر كله.
  c_hold interval := interval '25 minutes';
  c_cap_pieces_per_holder integer := 5;
  c_cap_cm_per_holder bigint := 2000;
  c_cap_pieces_store integer := 20;
  c_cap_cm_store bigint := 10000;
  v_need_pieces integer;
  v_need_cm bigint;
  v_held record;
  v_state text;
  v_message text;

  v_order record;
  v_open record;
  v_hold_until timestamptz;
  v_hold_count integer;
  v_item_count integer;
  v_expires timestamptz;
  v_attempt_id uuid;
begin
  if p_environment is null or p_environment not in ('test', 'live')
     or p_access_hash is null or octet_length(p_access_hash) <> 32
     or p_client_hash is null or octet_length(p_client_hash) <> 32 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if not private.fabric_store_take_rate_limit('payment_start', p_client_hash, 10, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select o.id, o.order_number, o.total_halalas, o.payment_status, o.fulfillment_status, o.needs_review,
         o.payment_due_at, o.customer_phone
  into v_order
  from public.fabric_store_orders o
  where o.access_token_hash = p_access_hash
    and o.access_expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.payment_status in ('paid', 'partially_refunded', 'refunded') then
    return jsonb_build_object('status', 'already_paid', 'order_number', v_order.order_number);
  end if;
  if v_order.payment_status <> 'pending' or v_order.fulfillment_status <> 'unfulfilled' or v_order.needs_review then
    return jsonb_build_object('status', 'not_payable', 'order_number', v_order.order_number);
  end if;

  -- محاولة مفتوحة: فاتورة صالحة ⇒ الرابط نفسه (ضغط «ادفعي» مرتين لا يفتح فاتورتين).
  select a.id, a.status, a.checkout_url, a.expires_at, a.created_at
  into v_open
  from public.fabric_store_payment_attempts a
  where a.order_id = v_order.id
    and a.status in ('created', 'initiated', 'authorized')
  for update;

  if found then
    if v_open.status in ('initiated', 'authorized') and v_open.expires_at > clock_timestamp()
       and v_open.checkout_url is not null then
      return jsonb_build_object('status', 'existing', 'attempt_id', v_open.id,
                                'checkout_url', v_open.checkout_url, 'expires_at', v_open.expires_at,
                                'order_number', v_order.order_number);
    end if;
    if v_open.status = 'created' and v_open.created_at > clock_timestamp() - interval '2 minutes' then
      -- بدء آخر جارٍ الآن (ينتظر رد ميسر). لا نفتح ثانية بجانبه.
      return jsonb_build_object('status', 'in_progress', 'order_number', v_order.order_number);
    end if;
    -- فاتورة انتهت مدتها (لا تقبل دفعاً بعدها لدى ميسر)، أو بدء تعطّل قبل أن يصل
    -- رابطه للزبونة: تُغلق. دفعة تصل عليها لاحقاً تبقى مقبولة (expired/cancelled → paid).
    update public.fabric_store_payment_attempts
    set status = case when v_open.status = 'created' then 'cancelled' else 'expired' end,
        failure_code = coalesce(failure_code,
                                case when v_open.status = 'created' then 'create_unknown' else 'invoice_expired' end)
    where id = v_open.id;
  end if;

  if (select count(*) from public.fabric_store_payment_attempts a where a.order_id = v_order.id) >= c_max_attempts then
    return jsonb_build_object('status', 'too_many_attempts', 'order_number', v_order.order_number);
  end if;

  -- ── الدفعة B: أول «ادفعي» ينشئ الحجز. السطر يُحجز مرة واحدة فقط (unique على سطر الطلب
  --    ولا تمديد للحجز): بعد انتهاء الحجز يُعاد إنشاء الطلب من السلة، كما كان قبل الدفعة B.
  if not exists (select 1 from public.fabric_store_stock_reservations r where r.order_id = v_order.id) then
    if v_order.payment_due_at <= clock_timestamp() then
      return jsonb_build_object('status', 'order_expired', 'order_number', v_order.order_number);
    end if;

    -- السقوف تُحسب وتُحجز تحت قفل واحد: بدءان متزامنان لا يتجاوزانها معاً.
    perform pg_advisory_xact_lock(hashtextextended('fabric_store_hold_caps', 0));

    select count(*) filter (where i.purchase_mode = 'piece')::integer,
           coalesce(sum(i.stock_consumption_cm) filter (where i.purchase_mode = 'meter'), 0)::bigint
    into v_need_pieces, v_need_cm
    from public.fabric_store_order_items i
    where i.order_id = v_order.id;

    select
      count(*) filter (where i.purchase_mode = 'piece')::integer as store_pieces,
      coalesce(sum(r.quantity_cm) filter (where i.purchase_mode = 'meter'), 0)::bigint as store_cm,
      count(*) filter (where i.purchase_mode = 'piece' and o.customer_phone = v_order.customer_phone)::integer as phone_pieces,
      coalesce(sum(r.quantity_cm) filter (where i.purchase_mode = 'meter' and o.customer_phone = v_order.customer_phone), 0)::bigint as phone_cm,
      count(*) filter (where i.purchase_mode = 'piece' and h.client_hash = p_client_hash)::integer as client_pieces,
      coalesce(sum(r.quantity_cm) filter (where i.purchase_mode = 'meter' and h.client_hash = p_client_hash), 0)::bigint as client_cm
    into v_held
    from public.fabric_store_stock_reservations r
    join public.fabric_store_order_items i on i.id = r.order_item_id
    join public.fabric_store_orders o on o.id = r.order_id
    left join private.fabric_store_hold_clients h on h.order_id = r.order_id
    where r.status = 'active'
      and r.expires_at > clock_timestamp();

    if v_held.phone_pieces + v_need_pieces > c_cap_pieces_per_holder or v_held.phone_cm + v_need_cm > c_cap_cm_per_holder then
      return jsonb_build_object('status', 'hold_limit', 'scope', 'phone', 'order_number', v_order.order_number);
    end if;
    if v_held.client_pieces + v_need_pieces > c_cap_pieces_per_holder or v_held.client_cm + v_need_cm > c_cap_cm_per_holder then
      return jsonb_build_object('status', 'hold_limit', 'scope', 'client', 'order_number', v_order.order_number);
    end if;
    if v_held.store_pieces + v_need_pieces > c_cap_pieces_store or v_held.store_cm + v_need_cm > c_cap_cm_store then
      return jsonb_build_object('status', 'hold_limit', 'scope', 'store', 'order_number', v_order.order_number);
    end if;

    begin
      perform private.fabric_store_reserve_order(v_order.id, clock_timestamp() + c_hold);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state = 'P0001' and position('|' in v_message) > 0 then
        -- تغيّر السعر أو المتاح أو الظهور منذ إنشاء الطلب: لا حجز ولا محاولة دفع.
        return jsonb_build_object('status', 'rejected', 'code', split_part(v_message, '|', 1),
                                  'message', left(substr(v_message, position('|' in v_message) + 1), 500),
                                  'order_number', v_order.order_number);
      end if;
      raise;  -- 55P03 (انتظار قفل) وغيره: الخادم يعيد «أعيدي المحاولة»
    end;
    insert into private.fabric_store_hold_clients (order_id, client_hash) values (v_order.id, p_client_hash);
  end if;

  -- الحجز يجب أن يغطي نافذة الدفع كلها: لا فاتورة تعيش بعد حجز قماشها.
  select count(*), min(r.expires_at)
  into v_hold_count, v_hold_until
  from public.fabric_store_stock_reservations r
  where r.order_id = v_order.id
    and r.status = 'active'
    and r.expires_at > clock_timestamp();
  select count(*) into v_item_count from public.fabric_store_order_items i where i.order_id = v_order.id;

  v_expires := least(clock_timestamp() + c_attempt_window, v_hold_until - c_hold_margin);
  if v_hold_count <> v_item_count or v_hold_until is null or v_expires < clock_timestamp() + c_min_window then
    return jsonb_build_object('status', 'hold_expiring', 'order_number', v_order.order_number);
  end if;

  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  values (v_order.id, 'moyasar', p_environment, gen_random_uuid(), v_order.total_halalas, v_expires)
  returning id into v_attempt_id;

  return jsonb_build_object('status', 'created', 'attempt_id', v_attempt_id,
                            'amount_halalas', v_order.total_halalas, 'expires_at', v_expires,
                            'order_number', v_order.order_number);
end;
$$;

-- نسخة المرحلة 8 (20260930091944_fabric_store_refunds.sql) حرفياً
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

  -- المرحلة 8: إلغاء مع استرداد بدأه المدير ولم يؤكده ميسر بعد — القماش لم يُقص، ولا يُقص.
  if p_to in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')
     and exists (select 1 from public.fabric_store_refunds r
                 where r.order_id = p_order_id and r.status = 'pending' and r.cancels_order) then
    return jsonb_build_object('status', 'refund_pending');
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

-- نسخة تصحيح المرحلة 8 (20260930135711_fabric_store_refunded_before_paid_review.sql) حرفياً
create or replace function public.fabric_store_apply_payment(
  p_event_id uuid,
  p_environment text,
  p_payment jsonb,
  p_attempt_hint uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_payment_id text := nullif(p_payment ->> 'id', '');
  v_invoice_id text := nullif(p_payment ->> 'invoice_id', '');
  v_status text := lower(coalesce(p_payment ->> 'status', ''));
  v_amount bigint;
  v_refunded bigint;
  v_currency text := upper(coalesce(p_payment ->> 'currency', ''));
  v_message text := left(nullif(btrim(coalesce(p_payment ->> 'message', '')), ''), 500);
  v_attempt_id uuid;
  v_attempt record;
  v_order record;
  v_order_id uuid;
  v_result text;
  v_reason text;
begin
  begin
    v_amount := (p_payment ->> 'amount')::bigint;
  exception when data_exception then
    v_amount := null;
  end;
  begin
    v_refunded := (p_payment ->> 'refunded')::bigint;
  exception when data_exception then
    v_refunded := null;
  end;
  if v_payment_id is null or char_length(v_payment_id) > 100 or v_status = '' then
    return jsonb_build_object('status', 'bad_request');
  end if;

  -- المحاولة: بفاتورتها لدى ميسر، أو بالتلميح إن لم تُربط فاتورتها بعد.
  select a.id into v_attempt_id
  from public.fabric_store_payment_attempts a
  where a.provider = 'moyasar' and a.environment = p_environment and a.provider_invoice_id = v_invoice_id;
  if v_attempt_id is null and p_attempt_hint is not null then
    select a.id into v_attempt_id
    from public.fabric_store_payment_attempts a
    where a.id = p_attempt_hint and a.provider_invoice_id is null;
  end if;

  if v_attempt_id is null then
    v_result := 'unknown';
    v_reason := 'دفعة لفاتورة لا تخص محاولة معروفة';
  else
    -- قفل الطلب ثم المحاولة: نفس ترتيب بدء الدفع وحارس المرحلة 2.
    select o.id, o.payment_status, o.fulfillment_status, o.paid_attempt_id, o.needs_review, o.total_halalas
    into v_order
    from public.fabric_store_orders o
    where o.id = (select a.order_id from public.fabric_store_payment_attempts a where a.id = v_attempt_id)
    for update;
    v_order_id := v_order.id;
    select a.* into v_attempt
    from public.fabric_store_payment_attempts a
    where a.id = v_attempt_id
    for update;

    if v_attempt.environment <> p_environment
       or v_amount is distinct from v_attempt.amount_halalas
       or v_currency <> v_attempt.currency
       or (v_attempt.provider_invoice_id is not null and v_attempt.provider_invoice_id is distinct from v_invoice_id) then
      v_result := 'quarantined';
      v_reason := format('دفعة لا تطابق محاولتها (المبلغ %s مقابل %s، العملة %s، البيئة %s) — لا تُعتمد وتُراجع يدوياً',
                         coalesce(v_amount::text, '؟'), v_attempt.amount_halalas, v_currency, p_environment);
      if v_status in ('paid', 'captured') then
        perform set_config('fabric_store.actor_type', 'system', true);
        update public.fabric_store_orders
        set needs_review = true, review_reason = left(v_reason, 500)
        where id = v_order.id and not needs_review;
        insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
        values ('notify_staff', 'payment_mismatch:' || v_payment_id, v_order.id,
                jsonb_build_object('attempt_id', v_attempt_id, 'payment_id', v_payment_id, 'reason', 'mismatch'))
        on conflict (dedupe_key) do nothing;
      end if;

    elsif v_status in ('paid', 'captured') then
      if v_attempt.provider_payment_id is not null and v_attempt.provider_payment_id <> v_payment_id then
        -- دفعتان ناجحتان على الفاتورة نفسها: الأولى هي المعتمدة، والثانية مراجعة واسترداد.
        v_result := 'overpaid';
        v_reason := format('دفعة ناجحة ثانية (%s) على المحاولة نفسها — تُسترد', v_payment_id);
      else
        update public.fabric_store_payment_attempts
        set status = 'paid',
            provider_invoice_id = coalesce(provider_invoice_id, v_invoice_id),
            provider_payment_id = coalesce(provider_payment_id, v_payment_id),
            last_provider_status = v_status,
            last_verified_at = now()
        where id = v_attempt_id;

        if v_order.paid_attempt_id is null then
          perform set_config('fabric_store.actor_type', 'provider', true);
          update public.fabric_store_orders
          set payment_status = 'paid', paid_attempt_id = v_attempt_id
          where id = v_order.id;
          -- حارس المرحلة 2 يرفع علامة المراجعة وحده إن وصل السداد بلا حجز سارٍ.
          if v_order.fulfillment_status = 'cancelled' then
            perform set_config('fabric_store.actor_type', 'system', true);
            update public.fabric_store_orders
            set needs_review = true,
                review_reason = coalesce(review_reason, 'وصل سداد لطلب ملغى — يُسترد أو يُعاد تفعيله')
            where id = v_order.id;
          end if;
          -- المرحلة 6 تبدأ من هنا: مبيعة income واستهلاك الحجز وفاتورة الأستاذ.
          insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
          values ('confirm_order', 'confirm_order:' || v_order.id, v_order.id,
                  jsonb_build_object('attempt_id', v_attempt_id, 'payment_id', v_payment_id))
          on conflict (dedupe_key) do nothing;
          v_result := 'paid';
        elsif v_order.paid_attempt_id = v_attempt_id then
          v_result := 'already_paid';
        else
          v_result := 'overpaid';
          v_reason := format('الطلب مسدَّد بمحاولة أخرى، ووصلت دفعة ناجحة ثانية (%s) — تُسترد', v_payment_id);
        end if;
      end if;

      if v_result = 'overpaid' then
        perform set_config('fabric_store.actor_type', 'system', true);
        update public.fabric_store_orders
        set needs_review = true, review_reason = left(v_reason, 500)
        where id = v_order.id and not needs_review;
        insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
        values ('notify_staff', 'overpaid:' || v_payment_id, v_order.id,
                jsonb_build_object('attempt_id', v_attempt_id, 'payment_id', v_payment_id, 'reason', 'overpaid'))
        on conflict (dedupe_key) do nothing;
      end if;

    elsif v_status = 'failed' then
      if v_attempt.status in ('created', 'initiated', 'authorized') then
        update public.fabric_store_payment_attempts
        set status = 'failed',
            provider_invoice_id = coalesce(provider_invoice_id, v_invoice_id),
            last_provider_status = v_status,
            last_verified_at = now(),
            failure_code = coalesce(failure_code, 'payment_failed'),
            failure_message = coalesce(v_message, failure_message)
        where id = v_attempt_id;
        v_result := 'failed';
      else
        -- محاولة سابقة فاشلة لا تمحو دفعة ناجحة، ولا يعود paid إلى failed.
        v_result := 'ignored';
      end if;

    elsif v_status = 'refunded' and v_attempt.status = 'paid'
          and v_refunded is not null
          and v_refunded <= (select coalesce(sum(r.amount_halalas), 0)
                             from public.fabric_store_refunds r
                             where r.attempt_id = v_attempt_id and r.status in ('pending', 'succeeded')) then
      -- المرحلة 8: استرداد بدأناه أو سجّلناه نحن — لا مراجعة.
      update public.fabric_store_payment_attempts
      set last_provider_status = v_status, last_verified_at = now()
      where id = v_attempt_id;
      v_result := 'ignored';

    elsif v_status in ('refunded', 'voided') and v_attempt.status = 'paid' then
      v_result := 'quarantined';
      v_reason := format('ميسر يُظهر الدفعة %s بحالة %s دون استرداد مسجّل لدينا', v_payment_id, v_status);
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders
      set needs_review = true, review_reason = left(v_reason, 500)
      where id = v_order.id and not needs_review;

    elsif v_status = 'refunded' and v_attempt.status <> 'paid' then
      -- دفعة تُرى أول مرة وهي مستردة: تُحجر ويبقى حدثها دليلاً، ويُراجع الطلب (لا مبيعة ولا مخزون).
      v_result := 'quarantined';
      v_reason := left(format('ميسر يُظهر الدفعة %s مستردة (%s هللة) قبل أن نسجّل سدادها — تحقّقي من الحركتين في لوحة ميسر',
                              v_payment_id, coalesce(v_refunded::text, '؟')), 500);
      update public.fabric_store_payment_attempts
      set last_provider_status = v_status, last_verified_at = now()
      where id = v_attempt_id;
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders
      set needs_review = true, review_reason = v_reason
      where id = v_order.id and not needs_review;

    else
      -- initiated/authorized/verified: ليست تحصيلاً (التفويض ليس سداداً). تُسجَّل للاطلاع.
      update public.fabric_store_payment_attempts
      set last_provider_status = left(v_status, 40), last_verified_at = now()
      where id = v_attempt_id;
      v_result := 'ignored';
    end if;
  end if;

  if p_event_id is not null then
    update public.fabric_store_payment_events
    set processing_status = case v_result
                              when 'quarantined' then 'quarantined'
                              when 'unknown' then 'quarantined'
                              when 'ignored' then 'ignored'
                              else 'processed' end,
        processing_attempts = processing_attempts + 1,
        attempt_id = coalesce(attempt_id, v_attempt_id),
        order_id = coalesce(order_id, v_order_id),
        last_error = case when v_result in ('quarantined', 'unknown', 'overpaid') then left(v_reason, 1000) end
    where id = p_event_id
      and processing_status not in ('processed', 'ignored');
  end if;

  return jsonb_build_object('status', v_result, 'attempt_id', v_attempt_id, 'order_id', v_order_id);
end;
$$;

-- نسخة المرحلة 8 (20260930091944_fabric_store_refunds.sql) حرفياً
create or replace function public.fabric_store_refund_begin(
  p_order_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_amount_halalas bigint,
  p_reason text,
  p_cancel boolean,
  p_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_existing public.fabric_store_refunds%rowtype;
  v_order public.fabric_store_orders%rowtype;
  v_attempt public.fabric_store_payment_attempts%rowtype;
  v_refunded bigint;
  v_remaining bigint;
  v_refund uuid;
  v_claim uuid;
begin
  if p_actor_id is null or p_key is null or p_cancel is null
     or v_reason is null or char_length(v_reason) not between 3 and 500
     or p_amount_halalas is null or p_amount_halalas <= 0 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select r.* into v_existing from public.fabric_store_refunds r where r.idempotency_key = p_key;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.amount_halalas <> p_amount_halalas
       or v_existing.cancels_order <> p_cancel then
      return jsonb_build_object('status', 'key_conflict');
    end if;
    return jsonb_build_object('status', 'existing', 'refund_id', v_existing.id, 'refund_status', v_existing.status);
  end if;

  select o.* into v_order from public.fabric_store_orders o where o.id = p_order_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.payment_status not in ('paid', 'partially_refunded') then
    return jsonb_build_object('status', 'not_refundable', 'payment_status', v_order.payment_status);
  end if;

  select a.* into v_attempt from public.fabric_store_payment_attempts a where a.id = v_order.paid_attempt_id;
  if not found or v_attempt.provider_payment_id is null then
    return jsonb_build_object('status', 'not_refundable', 'payment_status', v_order.payment_status);
  end if;

  if exists (select 1 from public.fabric_store_refunds r where r.order_id = p_order_id and r.status = 'pending') then
    return jsonb_build_object('status', 'refund_in_progress');
  end if;

  select coalesce(sum(r.amount_halalas), 0) into v_refunded
  from public.fabric_store_refunds r
  where r.attempt_id = v_attempt.id and r.status = 'succeeded';
  v_remaining := v_attempt.amount_halalas - v_refunded;

  if p_amount_halalas > v_remaining then
    return jsonb_build_object('status', 'exceeds', 'remaining_halalas', v_remaining);
  end if;

  if v_order.fulfillment_status = 'cancelled' then
    -- (مراجعة 2) طلب ملغى وصله سداد متأخر: لا قماش ولا مبيعة (الاعتماد يرفض الملغى)،
    -- فالاسترداد مباشر ويبقى الطلب ملغى. «إلغاء» ثانٍ لا معنى له.
    if p_cancel then
      return jsonb_build_object('status', 'already_cancelled');
    end if;
  elsif p_cancel then
    -- القص يبدأ عند «بدء التجهيز» (قرار المالك)، وواقعته دائمة: الرجوع إلى «لم يُجهَّز»
    -- لا يعيد أهلية الإلغاء. بعده لا إلغاء، بل استرداد بسبب.
    if v_order.fulfillment_status <> 'unfulfilled' or v_order.cut_started_at is not null then
      return jsonb_build_object('status', 'already_cut', 'fulfillment_status', v_order.fulfillment_status);
    end if;
    if p_amount_halalas <> v_remaining then
      return jsonb_build_object('status', 'bad_request', 'remaining_halalas', v_remaining);
    end if;
  else
    -- استرداد كل الباقي قبل القص = إلغاء (يعيد القماش). بدونه يبقى القماش مخصوماً
    -- لطلب لا يُجهَّز (الحارس يمنع تجهيز المسترد كاملاً).
    if v_order.fulfillment_status = 'unfulfilled' and v_order.cut_started_at is null
       and p_amount_halalas = v_remaining then
      return jsonb_build_object('status', 'use_cancel');
    end if;
    -- سداد حقيقي لم تُسجَّل مبيعته بعد: الجزئي ينتظرها (الاعتماد لا يبيع ما استُرد جزئياً).
    if v_attempt.environment = 'live' and v_order.income_id is null then
      return jsonb_build_object('status', 'sale_pending');
    end if;
  end if;

  insert into public.fabric_store_refunds
    (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by, requested_by_label,
     cancels_order, provider_refunded_before, locked_until, claim_token)
  values (p_order_id, v_attempt.id, p_key, p_amount_halalas, v_reason, p_actor_id,
          left(nullif(btrim(coalesce(p_actor_label, '')), ''), 200),
          p_cancel, v_refunded, now() + interval '2 minutes', gen_random_uuid())
  returning id, claim_token into v_refund, v_claim;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id,
          left(format('%s %s ريال: %s', case when p_cancel then 'بدأ إلغاء الطلب واسترداد' else 'بدأ استرداد' end,
                      trim_scale(round(p_amount_halalas / 100.0, 2)), v_reason), 500));

  return jsonb_build_object(
    'status', 'started',
    'refund_id', v_refund,
    'payment_id', v_attempt.provider_payment_id,
    'environment', v_attempt.environment,
    'amount_halalas', p_amount_halalas,
    'refunded_before', v_refunded,
    'claim_token', v_claim);
end;
$$;

-- نسخة المرحلة 8 (20260930091944_fabric_store_refunds.sql) حرفياً
create or replace function public.fabric_store_refund_finish(
  p_refund_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_provider_refunded bigint,
  p_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  c_source constant text := 'المتجر الإلكتروني';
  v_order_id uuid;
  v_order public.fabric_store_orders%rowtype;
  v_refund public.fabric_store_refunds%rowtype;
  v_attempt public.fabric_store_payment_attempts%rowtype;
  v_message text := left(nullif(btrim(coalesce(p_message, '')), ''), 500);
  v_total bigint;
  v_sale record;
  v_invoice bigint;
  v_income uuid;
  v_line record;
  v_restocked integer := 0;
  v_reason text;
begin
  if p_outcome is null or p_outcome not in ('succeeded', 'failed', 'mismatch', 'unconfirmed') then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select r.order_id into v_order_id from public.fabric_store_refunds r where r.id = p_refund_id;
  if v_order_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- الطلب ثم الاسترداد: نفس ترتيب البدء.
  select o.* into v_order from public.fabric_store_orders o where o.id = v_order_id for update;
  select r.* into v_refund from public.fabric_store_refunds r where r.id = p_refund_id for update;
  if v_refund.status <> 'pending' then
    return jsonb_build_object('status', 'already_' || v_refund.status);
  end if;
  if v_refund.claim_token is distinct from p_claim_token then
    return jsonb_build_object('status', 'stale_claim');
  end if;
  select a.* into v_attempt from public.fabric_store_payment_attempts a where a.id = v_refund.attempt_id;

  if p_outcome = 'unconfirmed' then
    if v_refund.provider_called_at is null or v_refund.provider_called_at > now() - interval '15 minutes' then
      return jsonb_build_object('status', 'too_early');
    end if;
    v_reason := left(format('استرداد %s ريال أُرسل لميسر (%s) ولم يظهر بعد — لا يُعاد إرساله آلياً. تحقّقي من لوحة ميسر',
                            trim_scale(round(v_refund.amount_halalas / 100.0, 2)),
                            to_char(v_refund.provider_called_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')), 500);
    perform set_config('fabric_store.actor_type', 'system', true);
    update public.fabric_store_orders set needs_review = true, review_reason = v_reason
    where id = v_order_id and not needs_review;
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('notify_staff', 'refund_unconfirmed:' || p_refund_id::text, v_order_id,
            jsonb_build_object('reason', 'refund_unconfirmed', 'refund_id', p_refund_id))
    on conflict (dedupe_key) do nothing;
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  if p_outcome in ('failed', 'mismatch') then
    update public.fabric_store_refunds
    set status = 'failed',
        failure_message = coalesce(v_message, case when p_outcome = 'mismatch' then 'mismatch' else 'failed' end)
    where id = p_refund_id;
    insert into public.fabric_store_order_events (order_id, event_type, actor_type, note)
    values (v_order_id, 'note', 'system',
            left('لم يتم الاسترداد: ' || coalesce(v_message, 'رفضه ميسر'), 500));
    if p_outcome = 'mismatch' then
      v_reason := left('المسترد لدى ميسر لا يطابق سجلنا — لم يُرسل استرداد جديد. راجعي لوحة ميسر: '
                       || coalesce(v_message, ''), 500);
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders set needs_review = true, review_reason = v_reason
      where id = v_order_id and not needs_review;
      insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
      values ('notify_staff', 'refund_mismatch:' || p_refund_id::text, v_order_id,
              jsonb_build_object('reason', 'refund_mismatch', 'refund_id', p_refund_id))
      on conflict (dedupe_key) do nothing;
    end if;
    return jsonb_build_object('status', p_outcome);
  end if;

  -- succeeded: ميسر يجب أن يُظهر ما سجّلناه + هذا المبلغ على الأقل.
  if p_provider_refunded is null
     or p_provider_refunded < v_refund.provider_refunded_before + v_refund.amount_halalas then
    return jsonb_build_object('status', 'not_confirmed');
  end if;

  update public.fabric_store_refunds set status = 'succeeded' where id = p_refund_id;

  if p_provider_refunded > v_refund.provider_refunded_before + v_refund.amount_halalas then
    v_reason := left(format('ميسر يُظهر مسترداً (%s) أكثر مما سجّلنا (%s) — راجعي لوحة ميسر',
                            p_provider_refunded, v_refund.provider_refunded_before + v_refund.amount_halalas), 500);
    perform set_config('fabric_store.actor_type', 'system', true);
    update public.fabric_store_orders set needs_review = true, review_reason = v_reason
    where id = v_order_id and not needs_review;
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('notify_staff', 'refund_mismatch:' || p_refund_id::text, v_order_id,
            jsonb_build_object('reason', 'refund_mismatch', 'refund_id', p_refund_id))
    on conflict (dedupe_key) do nothing;
  end if;

  select coalesce(sum(r.amount_halalas), 0) into v_total
  from public.fabric_store_refunds r
  where r.attempt_id = v_refund.attempt_id and r.status = 'succeeded';

  perform set_config('fabric_store.actor_type', 'system', true);
  update public.fabric_store_orders
  set payment_status = case when v_total >= v_attempt.amount_halalas then 'refunded' else 'partially_refunded' end
  where id = v_order_id
    and payment_status is distinct from
        (case when v_total >= v_attempt.amount_halalas then 'refunded' else 'partially_refunded' end);

  -- مبيعة live مسجّلة ⇒ صف مرتجع سالب مرتبط بها. رقم فاتورة من تسلسل الأقمشة صراحةً
  -- (trigger الترقيم يفشل داخل search_path='' — HANDOFF §8 الدرس 20).
  select i.id, i.invoice_number, i.customer_name, i.buyer_name, i.buyer_phone
  into v_sale
  from public.income i
  where i.id = v_order.income_id;
  if found then
    v_invoice := nextval('public.fabrics_invoice_number_seq');
    insert into public.income (
      branch, category, customer_name, description, amount, date, is_automatic, notes,
      payment_method, customer_source, buyer_name, buyer_phone, invoice_number, created_by
    ) values (
      'fabrics',
      'fabric_store_refund',
      v_sale.customer_name,
      left(format('استرداد طلب المتجر الإلكتروني %s — مرتجع عن الفاتورة %s', v_order.order_number, v_sale.invoice_number), 500),
      -round(v_refund.amount_halalas / 100.0, 2),
      (now() at time zone 'Asia/Riyadh')::date,
      true,
      left(v_refund.reason, 500),
      'network',
      c_source,
      v_sale.buyer_name,
      v_sale.buyer_phone,
      v_invoice,
      null
    )
    returning id into v_income;
    update public.fabric_store_refunds set income_id = v_income where id = p_refund_id;
  end if;

  if v_refund.cancels_order then
    -- القص الدائم: لا إلغاء ولا إعادة قماش إن بدأ القص يوماً (حتى لو عادت الحالة).
    if v_order.fulfillment_status = 'unfulfilled' and v_order.cut_started_at is null then
      perform set_config('fabric_store.actor_type', 'staff', true);
      perform set_config('fabric_store.actor_id', v_refund.requested_by::text, true);
      update public.fabric_store_orders
      set fulfillment_status = 'cancelled', cancel_reason = left(v_refund.reason, 300)
      where id = v_order_id;
      -- خُصم القماش (مبيعة live) ⇒ يعود كله للمخزون: لم يُقص.
      if v_order.income_id is not null then
        for v_line in
          select item.line_number, item.stock_consumption_cm
          from public.fabric_store_order_items item
          where item.order_id = v_order_id
          order by item.inventory_color_id nulls last, item.inventory_item_id, item.line_number
        loop
          perform private.fabric_store_restock_line(v_order_id, v_order.order_number, v_line.line_number,
            v_line.stock_consumption_cm, 'cancelled_before_cut', p_refund_id, null, null, 'staff', v_refund.requested_by);
          v_restocked := v_restocked + 1;
        end loop;
      end if;
      -- سداد لم تُسجَّل مبيعته: لا مبيعة لاحقاً (الاعتماد يرى الطلب مسترداً أيضاً).
      perform private.fabric_store_close_confirm_task(v_order_id, 'refunded');
    else
      -- بدأ التجهيز بين البدء والإنهاء (لا يُفترض: دالة التجهيز ترفض أثناء إلغاء معلّق).
      v_reason := 'استُرد المبلغ كاملاً لإلغاء الطلب بعد أن بدأ تجهيزه — لا يُسلَّم، وقرّري مصير القماش';
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders set needs_review = true, review_reason = v_reason
      where id = v_order_id and not needs_review;
    end if;
  end if;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (v_order_id, 'note', 'staff', v_refund.requested_by,
          left(format('%s %s ريال%s', case when v_refund.cancels_order then 'أُلغي الطلب واستُرد' else 'استُرد' end,
                      trim_scale(round(v_refund.amount_halalas / 100.0, 2)),
                      case when v_invoice is not null then format(' — مرتجع رقم %s في الواردات', v_invoice) else '' end), 500));

  return jsonb_build_object('status', 'succeeded', 'refund_income_id', v_income, 'refund_invoice_number', v_invoice,
                            'restocked_lines', v_restocked,
                            'payment_status', case when v_total >= v_attempt.amount_halalas then 'refunded' else 'partially_refunded' end);
end;
$$;

-- نسخة تصحيح المرحلة 8 (20260930135711_fabric_store_refunded_before_paid_review.sql) حرفياً
create or replace function public.fabric_store_refund_close_unconfirmed(
  p_refund_id uuid,
  p_actor_id uuid,
  p_reference text,
  p_note text,
  p_provider_refunded bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_order_id uuid;
  v_refund public.fabric_store_refunds%rowtype;
begin
  if p_actor_id is null then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if v_reference is null or char_length(v_reference) not between 3 and 120
     or v_note is null or char_length(v_note) not between 3 and 500 then
    return jsonb_build_object('status', 'note_required');
  end if;

  select r.order_id into v_order_id from public.fabric_store_refunds r where r.id = p_refund_id;
  if v_order_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- الطلب ثم الاسترداد: ترتيب البدء والإنهاء نفسه. قفل الصف يسبق أي تسجيل نداء متزامن.
  perform 1 from public.fabric_store_orders o where o.id = v_order_id for update;
  select r.* into v_refund from public.fabric_store_refunds r where r.id = p_refund_id for update;
  if v_refund.status <> 'pending' then
    return jsonb_build_object('status', 'already_' || v_refund.status);
  end if;

  if v_refund.provider_called_at is not null then
    if v_refund.provider_called_at > now() - interval '24 hours' then
      return jsonb_build_object('status', 'too_early',
        'review_after', v_refund.provider_called_at + interval '24 hours');
    end if;
    if p_provider_refunded is null then
      return jsonb_build_object('status', 'bad_request');
    end if;
    if p_provider_refunded <> v_refund.provider_refunded_before then
      return jsonb_build_object('status', 'provider_changed');
    end if;
  end if;

  update public.fabric_store_refunds
  set status = 'failed',
      failure_message = left('أُغلق بقرار المدير — ' || v_reference, 500),
      review_reference = v_reference,
      review_note = v_note,
      reviewed_by = p_actor_id,
      reviewed_at = now()
  where id = p_refund_id;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (v_order_id, 'note', 'staff', p_actor_id,
          left(format('أُغلق استرداد %s ريال دون تنفيذ (%s) — المرجع: %s — %s',
                      trim_scale(round(v_refund.amount_halalas / 100.0, 2)),
                      case when v_refund.provider_called_at is null then 'لم يُرسل لميسر'
                           else 'أُرسل ولم يظهر لدى ميسر بعد 24 ساعة' end,
                      v_reference, v_note), 500));

  return jsonb_build_object('status', 'ok');
end;
$$;

-- نسخة المرحلة 9 (20260930135919_fabric_store_reconciliation.sql) حرفياً
create or replace function public.fabric_store_staff_alerts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with refund_totals as (
    select r.attempt_id, sum(r.amount_halalas) filter (where r.status = 'succeeded') as refunded
    from public.fabric_store_refunds r
    group by r.attempt_id
  ), alerts as (
    -- سداد حقيقي بلا مبيعة لأكثر من 30 دقيقة (مهمة الاعتماد متعثرة)
    select 'sale_missing' as kind, o.id as order_id, o.order_number, o.paid_at as since, a.environment,
           'سداد حقيقي منذ أكثر من 30 دقيقة ولم تُسجَّل مبيعته في الواردات (القماش لم يُخصم)' as detail
    from public.fabric_store_orders o
    join public.fabric_store_payment_attempts a on a.id = o.paid_attempt_id
    where a.environment = 'live' and o.payment_status = 'paid' and o.income_id is null
      and o.fulfillment_status <> 'cancelled' and o.paid_at < now() - interval '30 minutes'

    union all
    -- مهمة توقفت نهائياً (اعتماد، فاتورة الأستاذ…)
    select 'task_dead', t.order_id, o.order_number, coalesce(t.completed_at, t.created_at), null,
           left(t.topic || ': ' || coalesce(t.last_error, 'توقفت بعد أقصى عدد من المحاولات'), 300)
    from public.fabric_store_outbox t
    left join public.fabric_store_orders o on o.id = t.order_id
    where t.status = 'dead'

    union all
    -- مبيعة الواردات لا تساوي إجمالي الطلب
    select 'sale_amount_mismatch', o.id, o.order_number, o.paid_at, 'live',
           format('مبيعة الواردات %s ريال والطلب %s ريال', i.amount, round(o.total_halalas / 100.0, 2))
    from public.fabric_store_orders o
    join public.income i on i.id = o.income_id
    where round(i.amount * 100) <> o.total_halalas

    union all
    -- حالة الدفع لا تطابق سجل الاستردادات
    select 'refund_ledger_mismatch', o.id, o.order_number, coalesce(o.paid_at, o.created_at), a.environment,
           format('حالة الدفع %s والمسترد المسجّل %s من %s هللة', o.payment_status, coalesce(rt.refunded, 0), a.amount_halalas)
    from public.fabric_store_orders o
    join public.fabric_store_payment_attempts a on a.id = o.paid_attempt_id
    left join refund_totals rt on rt.attempt_id = a.id
    where (o.payment_status = 'refunded' and coalesce(rt.refunded, 0) <> a.amount_halalas)
       or (o.payment_status = 'partially_refunded' and (coalesce(rt.refunded, 0) <= 0 or coalesce(rt.refunded, 0) >= a.amount_halalas))
       or (o.payment_status = 'paid' and coalesce(rt.refunded, 0) > 0)

    union all
    -- استرداد نُودي عليه ولم يظهر لدى ميسر بعد 15 دقيقة (لا يُعاد نداؤه آلياً)
    select 'refund_unconfirmed', r.order_id, o.order_number, r.provider_called_at, a.environment,
           format('استرداد %s ريال أُرسل لميسر ولم يظهر — تحقّقي من لوحة ميسر', round(r.amount_halalas / 100.0, 2))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.fabric_store_payment_attempts a on a.id = r.attempt_id
    where r.status = 'pending' and r.provider_called_at < now() - interval '15 minutes'

    union all
    -- (سياسة المالك) 24 ساعة على نداء لم يظهر: موعد قرار المدير بمرجع التسوية — لا فشل تلقائي
    select 'refund_review_due', r.order_id, o.order_number, r.provider_called_at + interval '24 hours', a.environment,
           format('مضت 24 ساعة على استرداد %s ريال لم يظهر لدى ميسر — راجعي التسوية وقرّري من صفحة الطلب',
                  round(r.amount_halalas / 100.0, 2))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.fabric_store_payment_attempts a on a.id = r.attempt_id
    where r.status = 'pending' and r.provider_called_at < now() - interval '24 hours'

    union all
    -- استرداد معلّق لم يُرسَل لأكثر من 30 دقيقة (مفتاح ميسر بيئة أخرى، أو ميسر لا يرد)
    select 'refund_stuck', r.order_id, o.order_number, r.created_at, a.environment,
           format('استرداد %s ريال معلّق منذ أكثر من 30 دقيقة ولم يُرسل لميسر', round(r.amount_halalas / 100.0, 2))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.fabric_store_payment_attempts a on a.id = r.attempt_id
    where r.status = 'pending' and r.provider_called_at is null and r.created_at < now() - interval '30 minutes'

    union all
    -- إشعار دائن مطلوب: مرتجع في الواردات وفاتورة البيع في الأستاذ، ولم يُسجَّل رقمه
    select 'credit_note_missing', r.order_id, o.order_number, r.completed_at, 'live',
           format('مرتجع %s ريال على فاتورة الأستاذ %s — أصدري الإشعار الدائن وسجّلي رقمه',
                  round(r.amount_halalas / 100.0, 2), coalesce(sale.alostaz_invoice_code, '؟'))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.income sale on sale.id = o.income_id
    where r.status = 'succeeded' and r.income_id is not null and r.credit_note_code is null
      and (sale.alostaz_invoice_id is not null or sale.alostaz_sync_status = 'sent')

    union all
    -- حدث دفع محجور خلال 30 يوماً (فاتورة غير معروفة، مبلغ أو عملة لا تطابق، بيئة أخرى)
    select 'payment_quarantined', e.order_id, o.order_number, e.received_at, e.environment,
           left(coalesce(e.last_error, e.event_type) || coalesce(' — ' || e.provider_payment_id, ''), 300)
    from public.fabric_store_payment_events e
    left join public.fabric_store_orders o on o.id = e.order_id
    where e.processing_status = 'quarantined' and e.received_at > now() - interval '30 days'

    union all
    -- فاتورة الأستاذ لمبيعة إلكترونية فشلت أو توقفت للمراجعة
    select 'alostaz_review', o.id, o.order_number, i.alostaz_synced_at, 'live',
           left('فاتورة الأستاذ: ' || i.alostaz_sync_status || coalesce(' — ' || i.alostaz_sync_error, ''), 300)
    from public.fabric_store_orders o
    join public.income i on i.id = o.income_id
    where i.alostaz_sync_status in ('failed', 'review_required')

    union all
    -- الطلبات تحت المراجعة
    select 'needs_review', o.id, o.order_number, coalesce(o.paid_at, o.created_at), null,
           left(coalesce(o.review_reason, 'تحت المراجعة'), 300)
    from public.fabric_store_orders o
    where o.needs_review
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', a.kind, 'order_id', a.order_id, 'order_number', a.order_number,
           'since', a.since, 'environment', a.environment, 'detail', a.detail)
           order by a.since desc nulls last), '[]'::jsonb)
  from (select * from alerts order by since desc nulls last limit 200) a
$$;

drop function private.fabric_store_actor_is_admin(uuid);

revoke all on function public.fabric_store_begin_payment(bytea, text, bytea) from public, anon, authenticated;
revoke all on function public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_refund_finish(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.fabric_store_staff_alerts() from public, anon, authenticated;
grant execute on function public.fabric_store_begin_payment(bytea, text, bytea) to service_role;
grant execute on function public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid) to service_role;
grant execute on function public.fabric_store_refund_finish(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint) to service_role;
grant execute on function public.fabric_store_staff_alerts() to service_role;

-- الدوال المستعادة تطابق ملفات هجراتها بايتاً ببايت (وإلا يُلغى التراجع كله)
do $$
begin
  if exists (
    select 1 from (values
      ('public.fabric_store_begin_payment(bytea, text, bytea)', '5c4a23f068e34f5671498446c82891f2'),
      ('public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text)', '78d62032755d8e26fb4892f7766d83a1'),
      ('public.fabric_store_apply_payment(uuid, text, jsonb, uuid)', '1765947e6672185ceddae676da4b37e0'),
      ('public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid)', '7f57692dc07439719a1180687ead40b8'),
      ('public.fabric_store_refund_finish(uuid, uuid, text, bigint, text)', 'a30341cf2c84bca4f2982a0355b2cddf'),
      ('public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint)', '7f32f17cd249e8a77b796f6568cbecf9'),
      ('public.fabric_store_staff_alerts()', '43c3144ff49b95b5b9105105f1e2eb74')
    ) as x(sig, fp)
    where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(x.sig)
                        and md5(replace(p.prosrc, E'\r\n', E'\n')) = x.fp)
  ) then
    raise exception 'FIX_C_ROLLBACK_CHECK: a restored function does not match its migration file';
  end if;
end $$;
