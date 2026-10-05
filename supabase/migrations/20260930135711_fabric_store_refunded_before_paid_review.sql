-- ============================================================================
-- تصحيح المرحلة 8 (المراجع، 30 سبتمبر) — يُطبَّق بعد 20260930091944 وقبل المرحلة 9
-- ============================================================================
-- 1) دفعة تُرى أول مرة وهي «refunded» (سُدّدت ثم استُردت قبل أن نسجّلها): كانت تُتجاهل
--    فيبقى الطلب pending بلا مراجعة. الآن تُحجر ويُحفظ حدثها دليلاً ويُرفع الطلب للمراجعة.
-- 2) استرداد نُودي عليه ولم يظهر لدى ميسر (سياسة المالك عبر المراجع): 24 ساعة من النداء
--    **موعد لمراجعة المدير، لا سبب لاعتباره فاشلاً**. لا يُفتح استرداد جديد على الدفعة حتى
--    يوجد دليل نهائي: إما أن يُظهره ميسر (فتكمله المهمة وحدها)، أو يغلقه المدير بمرجع
--    التسوية بعد 24 ساعة وميسر لا يُظهر أي استرداد — ويُحفظ المرجع والقرار ومن اتخذه.
-- لا يمس أي جدول أو دالة للمحل.
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid)') is null then
    raise exception 'FABRIC_STORE_STAGE8_MISSING';
  end if;
  -- بصمة الدالة المطبّقة (نهايات الأسطر موحّدة: SQL Editor قد يحفظ CRLF).
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.fabric_store_apply_payment(uuid,text,jsonb,uuid)'::regprocedure
      and p.prokind = 'f'
      and md5(replace(p.prosrc, E'\r\n', E'\n')) in (
        '11131f901767abbc2c76d8b4811e15ea', -- deployed stage 8, read-only verified
        '1765947e6672185ceddae676da4b37e0'  -- this correction, safe to reapply
      )
  ) then
    raise exception 'FABRIC_STORE_APPLY_PAYMENT_DRIFT: inspect the deployed function before replacing it';
  end if;
end $$;

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

revoke all on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2) الاسترداد غير المؤكد: قرار المدير بعد 24 ساعة، بمرجع التسوية، في سجل قابل للتدقيق
-- ---------------------------------------------------------------------------

alter table public.fabric_store_refunds
  drop constraint if exists fabric_store_refunds_review,
  add column if not exists review_reference text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add constraint fabric_store_refunds_review
    check ((review_reference is null) = (reviewed_at is null)
           and (review_reference is null) = (reviewed_by is null)
           and (review_reference is null or (status = 'failed'
                                             and char_length(btrim(review_reference)) between 3 and 120
                                             and char_length(btrim(coalesce(review_note, ''))) between 3 and 500)));

comment on column public.fabric_store_refunds.review_reference is
  'مرجع التسوية أو مراسلة ميسر الذي أغلق به المدير استرداداً نُودي ولم يظهر (بعد 24 ساعة، وميسر لا يُظهر استرداداً).';

-- الحارس نفسه (المرحلة 8) + قرار المراجعة لا يُكتب إلا مرة ولا يتغير.
create or replace function private.fabric_store_guard_refund_stage8()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.cancels_order is distinct from old.cancels_order
     or new.provider_refunded_before is distinct from old.provider_refunded_before
     or (old.income_id is not null and new.income_id is distinct from old.income_id)
     or (old.provider_called_at is not null and new.provider_called_at is null)
     or (new.provider_called_at is distinct from old.provider_called_at and old.status <> 'pending')
     or (old.credit_note_code is not null and (new.credit_note_code is distinct from old.credit_note_code
                                               or new.credit_note_by is distinct from old.credit_note_by
                                               or new.credit_note_at is distinct from old.credit_note_at))
     or (old.review_reference is not null and (new.review_reference is distinct from old.review_reference
                                               or new.review_note is distinct from old.review_note
                                               or new.reviewed_by is distinct from old.reviewed_by
                                               or new.reviewed_at is distinct from old.reviewed_at))
     or (new.review_reference is not null and old.review_reference is null and old.status <> 'pending') then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_REFUND_IMMUTABLE|بيانات الاسترداد لا تتغير بعد تسجيله';
  end if;
  if new.status <> 'pending' and new.locked_until is not null then
    new.locked_until := null;
  end if;
  if new.status <> 'pending' and new.claim_token is not null then
    new.claim_token := null;
  end if;
  return new;
end;
$$;

revoke all on function private.fabric_store_guard_refund_stage8() from public, anon, authenticated;

-- المدير يغلق استرداداً معلّقاً لم يظهر لدى ميسر. p_provider_refunded = حقل refunded لدى ميسر
-- **لحظة الطلب** (يجلبه الخادم بمفتاحه). النتيجة: ok · too_early · provider_changed ·
-- note_required · bad_request · not_found · already_<status>.
--   - نداء لم يُرسل أصلاً (provider_called_at فارغ): يُغلق فوراً — لا مال في الطريق.
--   - نداء أُرسل: بعد 24 ساعة منه فقط، وميسر لا يُظهر أي حركة منذ «المسترد قبل».
-- إن أظهر ميسر حركة ⇒ provider_changed: تُكملها المهمة (نجح) أو تُحجر (لا تطابق)، لا المدير.

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

revoke all on function public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint) to service_role;

-- Reject a Windows code-page read before the replacement can commit garbled Arabic.
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'public.fabric_store_apply_payment(uuid, text, jsonb, uuid)'::regprocedure;
  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: refunded-first correction was read with the wrong text encoding';
  end if;
end $$;
