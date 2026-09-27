-- ============================================================================
-- متجر الأقمشة الإلكتروني — ربط الدفع (ميسر): المحاولات والأحداث واعتماد السداد
-- المرحلة 5 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- ما تضيفه (كلها security definer في public، لـservice_role وحده، مثل المرحلة 4):
--   • fabric_store_begin_payment          — محاولة دفع created قبل الاتصال بميسر،
--                                            أو المحاولة المفتوحة نفسها («ادفعي» مرتين).
--   • fabric_store_attach_invoice         — ربط فاتورة ميسر ورابطها بالمحاولة (initiated).
--   • fabric_store_abandon_attempt        — محاولة لم تصل فاتورتها للزبونة ⇒ cancelled.
--   • fabric_store_record_payment_event   — حفظ الحدث أولاً (webhook/استعلام/رجوع)، بلا تكرار.
--   • fabric_store_apply_payment          — تطبيق دفعة **أعاد الخادم جلبها من ميسر**:
--                                            اعتماد السداد ذرياً، أو مراجعة، أو حجر.
--   • fabric_store_note_event_failure     — فشل معالجة حدث ⇒ يُعاد لاحقاً (أو يُحجر).
--   • fabric_store_pending_payment_events — أحداث تنتظر إعادة المعالجة.
--   • fabric_store_payment_view           — حالة الطلب ومحاولته لصفحة الرجوع (برمز الزبونة).
--
-- ما لا تفعله: لا income، ولا خصم مخزون، ولا استهلاك حجز، ولا فاتورة أستاذ — كلها
-- المرحلة 6، وتبدأ من مهمة confirm_order التي يضعها اعتماد السداد في الـoutbox.
-- لذلك **لا تُفعَّل المرحلة 5 للزبائن قبل المرحلة 6**: الحجز ينتهي بعد 30 دقيقة.
--
-- قواعد:
--   • لا يُعتمد سداد من محتوى webhook أو من رابط الرجوع: الخادم يجلب الدفعة من
--     واجهة ميسر بمفتاحه ثم يمررها هنا؛ وهنا يُطابَق المبلغ والعملة والبيئة والفاتورة.
--   • دفعة حقيقية لا تُرفض أبداً: غير المطابق يُحجر ويُرفع الطلب للمراجعة بسبب مكتوب.
--   • paid لا يعود إلى failed (حارس المرحلة 2)، والحدث المكرر لا يُطبَّق مرتين.
--
-- لا يغيّر أي جدول أو دالة قائمة. لا أقفال على جداول المحل.
-- التحقق: supabase/tests/fabric_store_payments.sql (داخل معاملة تُلغى).
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_create_checkout(jsonb)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE4_MISSING|طبّق هجرات المراحل 2 و3 و4 قبل هذه الهجرة';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) بدء الدفع: محاولة created مقيّدة بمدة الحجز
-- ---------------------------------------------------------------------------
-- الحالات: created (محاولة جديدة؛ الخادم ينشئ فاتورة ميسر الآن) · existing (فاتورة
-- مفتوحة صالحة؛ نفس الرابط) · in_progress (بدء آخر جارٍ لتوّه) · already_paid ·
-- not_payable · hold_expiring (الحجز انتهى أو يوشك) · too_many_attempts ·
-- rate_limited · not_found.

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

  select o.id, o.order_number, o.total_halalas, o.payment_status, o.fulfillment_status, o.needs_review
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

-- ---------------------------------------------------------------------------
-- 2) ربط فاتورة ميسر بالمحاولة، أو إغلاق محاولة لم تصل فاتورتها
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_attach_invoice(
  p_attempt_id uuid,
  p_invoice_id text,
  p_checkout_url text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_invoice_id is null or char_length(p_invoice_id) not between 1 and 100
     or p_checkout_url is null or p_checkout_url !~ '^https://' or char_length(p_checkout_url) > 1000 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select a.status into v_status
  from public.fabric_store_payment_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_status <> 'created' then
    return jsonb_build_object('status', 'not_created', 'attempt_status', v_status);
  end if;

  update public.fabric_store_payment_attempts
  set status = 'initiated',
      provider_invoice_id = p_invoice_id,
      checkout_url = p_checkout_url,
      last_provider_status = 'initiated'
      -- last_verified_at يبقى فارغاً: الربط لم يتحقق من شيء، وأول رجوع للزبونة يسأل ميسر فوراً.
  where id = p_attempt_id;

  return jsonb_build_object('status', 'initiated');
end;
$$;

-- ميسر رفض إنشاء الفاتورة، أو انقطع الرد: الزبونة لم تر أي رابط، فلا يُدفع شيء
-- عليها. إن كانت الفاتورة قد أُنشئت فعلاً لدى ميسر فستنتهي مدتها وحدها، وأي دفعة
-- عليها (مستحيلة عملياً بلا رابط) تُطابَق بمعرّف المحاولة في metadata.
create or replace function public.fabric_store_abandon_attempt(
  p_attempt_id uuid,
  p_code text,
  p_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select a.status into v_status
  from public.fabric_store_payment_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_status <> 'created' then
    return jsonb_build_object('status', 'not_created', 'attempt_status', v_status);
  end if;

  update public.fabric_store_payment_attempts
  set status = 'cancelled',
      failure_code = left(coalesce(nullif(btrim(p_code), ''), 'create_failed'), 100),
      failure_message = left(p_message, 500)
  where id = p_attempt_id;

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) حفظ الحدث أولاً — المكرر يعود بحالته دون أثر جديد
-- ---------------------------------------------------------------------------
-- webhook: معرّف الحدث من ميسر. poll/return: `<source>:<payment id>:<status>`، فمشاهدة
-- الحالة نفسها مرتين لا تُسجَّل مرتين. المحتوى منقَّح في الخادم قبل الوصول هنا.

create or replace function public.fabric_store_record_payment_event(
  p_environment text,
  p_source text,
  p_event_id text,
  p_event_type text,
  p_invoice_id text,
  p_payment_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  insert into public.fabric_store_payment_events
    (provider, environment, source, provider_event_id, event_type, provider_invoice_id, provider_payment_id, payload)
  values ('moyasar', p_environment, p_source, p_event_id, p_event_type,
          nullif(p_invoice_id, ''), nullif(p_payment_id, ''), p_payload)
  on conflict (provider, environment, provider_event_id) do nothing
  returning id, processing_status into v_id, v_status;

  if v_id is not null then
    return jsonb_build_object('status', 'recorded', 'event_id', v_id, 'processing_status', v_status);
  end if;

  select e.id, e.processing_status into v_id, v_status
  from public.fabric_store_payment_events e
  where e.provider = 'moyasar' and e.environment = p_environment and e.provider_event_id = p_event_id;

  return jsonb_build_object('status', 'duplicate', 'event_id', v_id, 'processing_status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) تطبيق دفعة أعاد الخادم جلبها من ميسر — قلب المرحلة
-- ---------------------------------------------------------------------------
-- p_payment: {id, status, amount, currency, invoice_id, message} كما أعادتها واجهة ميسر.
-- p_attempt_hint: معرّف المحاولة من metadata فاتورة ميسر (مجلوبة أيضاً بالمفتاح) —
--   يُستعمل فقط إن لم تُعرف الفاتورة (بدء تعطّل بعد إنشائها وقبل ربطها).
-- النتيجة (status): paid · already_paid · overpaid · failed · ignored · quarantined · unknown.

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

-- ---------------------------------------------------------------------------
-- 5) إعادة المعالجة: فشل مؤقت ⇒ يُعاد لاحقاً؛ بعد 10 محاولات أو لسبب نهائي ⇒ يُحجر
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_note_event_failure(
  p_event_id uuid,
  p_error text,
  p_final boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.fabric_store_payment_events
  set processing_attempts = processing_attempts + 1,
      processing_status = case when p_final or processing_attempts + 1 >= 10 then 'quarantined' else 'failed' end,
      last_error = left(coalesce(p_error, 'unknown error'), 1000)
  where id = p_event_id
    and processing_status not in ('processed', 'ignored', 'quarantined')
  returning processing_status into v_status;

  return jsonb_build_object('status', coalesce(v_status, 'unchanged'));
end;
$$;

create or replace function public.fabric_store_pending_payment_events(p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', e.id, 'environment', e.environment, 'source', e.source,
           'provider_payment_id', e.provider_payment_id, 'provider_invoice_id', e.provider_invoice_id,
           'processing_attempts', e.processing_attempts) order by e.received_at), '[]'::jsonb)
  from (
    select * from public.fabric_store_payment_events e
    where e.processing_status in ('received', 'failed')
      and e.processing_attempts < 10
      and e.received_at < now() - interval '1 minute'
    order by e.received_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) e;
$$;

-- ---------------------------------------------------------------------------
-- 6) حالة الطلب ومحاولته لصفحة الرجوع — برمز الزبونة فقط
-- ---------------------------------------------------------------------------
-- verify_due: المحاولة غير نهائية ولم تُسأل ميسر عنها منذ 10 ثوانٍ ⇒ الخادم يسأل الآن
-- (ويُحجز الدور ذرياً، فتحديث الصفحة المتكرر لا يرسل سيلاً من الطلبات لميسر).

create or replace function public.fabric_store_payment_view(
  p_access_hash bytea,
  p_attempt_id uuid,
  p_client_hash bytea
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_attempt record;
  v_due boolean := false;
begin
  if p_access_hash is null or octet_length(p_access_hash) <> 32
     or p_client_hash is null or octet_length(p_client_hash) <> 32 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if not private.fabric_store_take_rate_limit('payment_status', p_client_hash, 120, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select o.id, o.order_number, o.total_halalas, o.payment_status, o.fulfillment_status, o.needs_review, o.payment_due_at
  into v_order
  from public.fabric_store_orders o
  where o.access_token_hash = p_access_hash and o.access_expires_at > now();
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select a.id, a.status, a.environment, a.provider_invoice_id, a.expires_at, a.last_verified_at
  into v_attempt
  from public.fabric_store_payment_attempts a
  where a.id = p_attempt_id and a.order_id = v_order.id
  for update;

  if found and v_attempt.provider_invoice_id is not null
     and v_attempt.status in ('initiated', 'authorized', 'failed', 'expired', 'cancelled')
     and v_order.payment_status = 'pending'
     and (v_attempt.last_verified_at is null or v_attempt.last_verified_at < now() - interval '10 seconds') then
    update public.fabric_store_payment_attempts set last_verified_at = now() where id = v_attempt.id;
    v_due := true;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'order_number', v_order.order_number,
    'total_halalas', v_order.total_halalas,
    'payment_status', v_order.payment_status,
    'fulfillment_status', v_order.fulfillment_status,
    'needs_review', v_order.needs_review,
    'hold_expires_at', v_order.payment_due_at,
    'attempt', case when v_attempt.id is null then null else jsonb_build_object(
      'id', v_attempt.id, 'status', v_attempt.status, 'environment', v_attempt.environment,
      'provider_invoice_id', v_attempt.provider_invoice_id, 'expires_at', v_attempt.expires_at) end,
    'verify_due', v_due);
end;
$$;

-- ---------------------------------------------------------------------------
-- الصلاحيات: service_role وحده (الافتراضي في public يمنح anon وauthenticated كل دالة)
-- ---------------------------------------------------------------------------

revoke all on function public.fabric_store_begin_payment(bytea, text, bytea) from public, anon, authenticated;
revoke all on function public.fabric_store_attach_invoice(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fabric_store_abandon_attempt(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fabric_store_record_payment_event(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_note_event_failure(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.fabric_store_pending_payment_events(integer) from public, anon, authenticated;
revoke all on function public.fabric_store_payment_view(bytea, uuid, bytea) from public, anon, authenticated;

grant execute on function public.fabric_store_begin_payment(bytea, text, bytea) to service_role;
grant execute on function public.fabric_store_attach_invoice(uuid, text, text) to service_role;
grant execute on function public.fabric_store_abandon_attempt(uuid, text, text) to service_role;
grant execute on function public.fabric_store_record_payment_event(text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.fabric_store_note_event_failure(uuid, text, boolean) to service_role;
grant execute on function public.fabric_store_pending_payment_events(integer) to service_role;
grant execute on function public.fabric_store_payment_view(bytea, uuid, bytea) to service_role;

comment on function public.fabric_store_apply_payment(uuid, text, jsonb, uuid) is
  'للخادم فقط: يطبّق دفعة أعاد الخادم جلبها من واجهة ميسر. يطابق المبلغ والعملة والبيئة والفاتورة، ويعتمد السداد ذرياً (المحاولة + الطلب + مهمة confirm_order)، أو يرفع الطلب للمراجعة ويحجر الحدث. لا يعيد paid إلى failed.';

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabric_store_apply_payment';

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
