-- ============================================================================
-- تراجع المرحلة 8 (20260930091944_fabric_store_refunds.sql) — من SQL Editor
-- ============================================================================
-- أطفئي FABRIC_STORE_REFUNDS_ENABLED و NEXT_PUBLIC_FABRIC_STORE_REFUNDS_ENABLED أولاً.
--
-- يرفض إن وُجد استرداد معلّق: مال قد يكون في الطريق لدى ميسر، ولا يُترك بلا مطابقة.
--
-- ما يعود: fabric_store_apply_payment (نسخة المرحلة 5) و fabric_store_staff_set_fulfillment
-- (نسخة المرحلة 7) حرفياً، وتُحذف دوال المرحلة 8 وحارسها وفهرساها.
--
-- ما يبقى عمداً (لا يعيد فتح ثغرة ولا يمحو تاريخاً):
--   • fabric_store_orders.cut_started_at (واقعة بدء القص؛ لا يُكتب بعد التراجع لكنه لا يُمحى).
--   • أعمدة المرحلة 8 على fabric_store_refunds، وجدول fabric_store_restocks: سجل
--     استردادات حقيقية وحركات مخزون حقيقية.
--   • صفوف المرتجع في income وحركات IN التي أعادت القماش: مال رُدّ وقماش عاد فعلاً.
--   • private.fabric_store_protect_online_sale بنسخة المرحلة 8: إعادة نسخة المرحلة 6 كانت
--     ستفتح صفوف المرتجع للتعديل والحذف. النسخة الباقية تعمل بالأعمدة الباقية.
-- الترتيب: 8 ← 7 ← 6 ← … (تراجع 7 يرفض ما دامت 8 مطبّقة).
-- ============================================================================

begin;

set local lock_timeout = '5s';

lock table public.fabric_store_refunds in share row exclusive mode nowait;

do $$
begin
  if to_regprocedure('public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint)') is not null then
    raise exception 'ROLLBACK REFUSED: the stage 8 correction is applied — run stage-08-fix-rollback.sql first';
  end if;
  if exists (select 1 from public.fabric_store_refunds where status = 'pending') then
    raise exception 'ROLLBACK REFUSED: a refund is pending — let the job reconcile it with Moyasar first';
  end if;
end $$;

drop function public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid);
drop function public.fabric_store_refund_mark_called(uuid, uuid);
drop function public.fabric_store_refund_finish(uuid, uuid, text, bigint, text);
drop function public.fabric_store_due_refunds(integer);
drop function public.fabric_store_restock_return(uuid, uuid, jsonb, text, uuid);
drop function public.fabric_store_record_credit_note(uuid, uuid, text);
drop function private.fabric_store_restock_line(uuid, text, smallint, integer, text, uuid, uuid, text, text, uuid);

drop trigger fabric_store_refunds_guard_stage8 on public.fabric_store_refunds;
drop trigger fabric_store_orders_mark_cut on public.fabric_store_orders;
drop function private.fabric_store_mark_cut();
drop function private.fabric_store_guard_refund_stage8();
drop index public.fabric_store_refunds_one_pending;
drop index public.fabric_store_refunds_income_key;

-- نسخة المرحلة 5 (20260924160000) حرفياً
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

    elsif v_status in ('refunded', 'voided') and v_attempt.status = 'paid' then
      v_result := 'quarantined';
      v_reason := format('ميسر يُظهر الدفعة %s بحالة %s دون استرداد مسجّل لدينا', v_payment_id, v_status);
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders
      set needs_review = true, review_reason = left(v_reason, 500)
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

-- نسخة المرحلة 7 (20260929150000) حرفياً
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

commit;
