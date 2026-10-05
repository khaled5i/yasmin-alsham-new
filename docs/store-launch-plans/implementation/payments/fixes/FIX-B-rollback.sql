-- ============================================================================
-- تراجع الدفعة B (AUD-02) — يُبطل 20261003120000_fabric_store_hold_at_payment.sql
-- ============================================================================
-- يعيد fabric_store_create_checkout (المرحلة 4) وfabric_store_begin_payment (المرحلة 5) حرفياً
-- من ملفي هجرتيهما، ويحذف private.fabric_store_hold_clients (بصمات عناوين فقط، لا مال).
--
-- ⚠ هذا يعيد ثغرة AUD-02 (الحجز عند إنشاء الطلب، 40 سطراً، بلا سقف كمية). لذلك:
--   • التراجع الأول دائماً **إطفاء مفتاح الطلبات** (FABRIC_STORE_CHECKOUT_ENABLED على Vercel) —
--     بلا أي تغيير في القاعدة. هذا السكربت للحالة التي تحتاجين فيها المتجر مغلقاً ثم إعادة الهجرة.
--   • يرفض العمل ما لم تُعلني في الجلسة نفسها أن المتجر مغلق:
--         set local fabric_store.rollback_b_ack = 'checkout-disabled';
--     (الصقي السطر أعلاه قبل السكربت داخل المعاملة نفسها في SQL Editor.)
--   • يرفض ما دام لطلب محاولة دفع مفتوحة (صفحة ميسر قد تكون مفتوحة الآن).
-- الطلبات التي أُنشئت بلا حجز في عهد الدفعة B: بعد التراجع يرد «ادفعي» عليها hold_expiring
-- فتعيد الزبونة إنشاء الطلب من السلة. الحجوزات القائمة تبقى كما هي (لا يُمس صف).
-- إعادة الهجرة بعده آمنة (تعرف بصمتي المرحلتين 4 و5).
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if coalesce(current_setting('fabric_store.rollback_b_ack', true), '') <> 'checkout-disabled' then
    raise exception 'FIX_B_ROLLBACK_REFUSED: this re-opens AUD-02. Turn FABRIC_STORE_CHECKOUT_ENABLED off first, then run: set local fabric_store.rollback_b_ack = ''checkout-disabled''; in the same transaction';
  end if;
  if to_regclass('private.fabric_store_hold_clients') is null then
    raise exception 'FIX_B_ROLLBACK_NOT_NEEDED: migration 20261003120000 is not applied';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.fabric_store_begin_payment(bytea, text, bytea)'::regprocedure
      and md5(replace(p.prosrc, E'\r\n', E'\n')) = '5c4a23f068e34f5671498446c82891f2'
  ) or not exists (
    select 1 from pg_proc p
    where p.oid = 'public.fabric_store_create_checkout(jsonb)'::regprocedure
      and md5(replace(p.prosrc, E'\r\n', E'\n')) = 'a50962d6f5a166c8ea8a7361c2827551'
  ) then
    raise exception 'FIX_B_ROLLBACK_DRIFT: the deployed functions are not the batch B versions — inspect before rolling back';
  end if;
  -- قفل المحاولات قبل الفحص، فلا تبدأ محاولة بين الفحص والاستبدال.
  lock table public.fabric_store_payment_attempts in share row exclusive mode nowait;
  if exists (select 1 from public.fabric_store_payment_attempts a
             where a.status in ('created', 'initiated', 'authorized') and a.expires_at > now()) then
    raise exception 'FIX_B_ROLLBACK_REFUSED: a payment page is open now — wait until it ends';
  end if;
end $$;

create or replace function public.fabric_store_create_checkout(p_request jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '800ms'
as $$
declare
  -- ثوابت العمل (المالك، 24 سبتمبر 2026). تغييرها = هجرة جديدة.
  c_hold interval := interval '30 minutes';
  c_access interval := interval '90 days';
  c_per_client_10m integer := 6;
  c_per_client_day integer := 30;
  c_live_orders_per_phone integer := 3;
  c_live_orders_total integer := 50;

  v_key uuid;
  v_fingerprint bytea;
  v_access_hash bytea;
  v_client_hash bytea;
  v_supersede_hash bytea;
  v_phone text;
  v_items jsonb;
  v_item jsonb;
  v_line integer;
  v_listing record;
  v_existing record;
  v_old record;
  v_order_id uuid;
  v_order_number text;
  v_hold_until timestamptz;
  v_mode text;
  v_state text;
  v_message text;
  v_code text;
begin
  -- مدخلات لا تُقرأ (معرّف أو بصمة تالفة) تُرفض قبل أي أثر.
  begin
    v_key := (p_request ->> 'checkout_key')::uuid;
    v_fingerprint := decode(p_request ->> 'request_fingerprint', 'hex');
    v_access_hash := decode(p_request ->> 'access_token_hash', 'hex');
    v_client_hash := decode(p_request ->> 'client_hash', 'hex');
    v_supersede_hash := decode(nullif(p_request ->> 'supersede_access_hash', ''), 'hex');
    v_phone := p_request -> 'customer' ->> 'phone';
    v_items := p_request -> 'items';
  exception when data_exception then
    return jsonb_build_object('status', 'bad_request');
  end;

  if v_key is null
     or octet_length(v_fingerprint) is distinct from 32
     or octet_length(v_access_hash) is distinct from 32
     or octet_length(v_client_hash) is distinct from 32
     or (v_supersede_hash is not null and octet_length(v_supersede_hash) <> 32)
     or v_phone is null
     or jsonb_typeof(v_items) is distinct from 'array' then
    return jsonb_build_object('status', 'bad_request');
  end if;
  -- منفصل عمّا قبله: ترتيب تقييم OR في SQL غير مضمون، وjsonb_array_length ترمي لغير المصفوفة.
  if jsonb_array_length(v_items) not between 1 and 40 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  -- طلبان متزامنان بالمفتاح نفسه يُسلسلان هنا: الثاني يرى الأول بعد التزامه.
  perform pg_advisory_xact_lock(hashtextextended('fabric_store_checkout:' || v_key::text, 0));

  select o.id, o.order_number, o.request_fingerprint, o.access_token_hash, o.total_halalas,
         o.payment_due_at, o.payment_status, o.fulfillment_status
  into v_existing
  from public.fabric_store_orders o
  where o.checkout_key = v_key;

  if found then
    if v_existing.request_fingerprint = v_fingerprint and v_existing.access_token_hash = v_access_hash then
      return jsonb_build_object(
        'status', 'existing',
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'total_halalas', v_existing.total_halalas,
        'hold_expires_at', v_existing.payment_due_at,
        'payment_status', v_existing.payment_status,
        'fulfillment_status', v_existing.fulfillment_status);
    end if;
    return jsonb_build_object('status', 'key_reused');
  end if;

  -- حدود المعدّل: تُحتسب قبل الكتلة المحمية، فلا يمحوها رفض الطلب.
  if not private.fabric_store_take_rate_limit('checkout_10m', v_client_hash, c_per_client_10m, interval '10 minutes')
     or not private.fabric_store_take_rate_limit('checkout_day', v_client_hash, c_per_client_day, interval '1 day') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  begin
    -- ١) طلب سابق من نفس المتصفح لم يُدفع ولم تبدأ له محاولة دفع: يُلغى ويُحرَّر
    --    حجزه أولاً، فلا تحجز الزبونة القماش نفسه مرتين ولا تنافس نفسها على آخر قطعة.
    if v_supersede_hash is not null then
      for v_old in
        select o.id
        from public.fabric_store_orders o
        where o.access_token_hash = v_supersede_hash
          and o.payment_status = 'pending'
          and o.fulfillment_status = 'unfulfilled'
        for update
      loop
        if not exists (
          select 1 from public.fabric_store_payment_attempts attempt
          where attempt.order_id = v_old.id
            and attempt.status in ('created', 'initiated', 'authorized', 'paid')
        ) then
          perform private.fabric_store_release_order_reservations(v_old.id, 'استُبدل بطلب أحدث من نفس المتصفح');
          perform set_config('fabric_store.actor_type', 'system', true);
          update public.fabric_store_orders
          set fulfillment_status = 'cancelled',
              cancel_reason = 'استُبدل بطلب أحدث من نفس المتصفح قبل الدفع'
          where id = v_old.id;
        end if;
      end loop;
    end if;

    -- ٢) سقوف الطلبات الحيّة (محجوزة ولم تُدفع): لكل هاتف، وللمتجر كله. تحمي قماش
    --    المحل من أن يُحجز كله بطلبات لا تنوي الدفع. تُرمى (لا return) حتى يُلغى
    --    الاستبدال أعلاه معها: طلب قديم لا يُلغى لأجل طلب جديد لم يُنشأ.
    if (select count(*) from public.fabric_store_orders o
        where o.customer_phone = v_phone
          and o.payment_status = 'pending'
          and o.fulfillment_status = 'unfulfilled'
          and exists (select 1 from public.fabric_store_stock_reservations r
                      where r.order_id = o.id and r.status = 'active' and r.expires_at > now()))
       >= c_live_orders_per_phone then
      raise exception using errcode = 'P0001', message = 'FABRIC_STORE_PHONE_LIMIT|limit';
    end if;
    if (select count(distinct r.order_id) from public.fabric_store_stock_reservations r
        where r.status = 'active' and r.expires_at > now()) >= c_live_orders_total then
      raise exception using errcode = 'P0001', message = 'FABRIC_STORE_STORE_BUSY|limit';
    end if;

    -- ٣) الطلب نفسه. فحوص الاتساق مؤجَّلة حتى تُدرج الأسطر (قد يكون المستدعي جعلها فورية).
    set constraints public.fabric_store_orders_consistency,
                    public.fabric_store_order_items_consistency,
                    public.fabric_store_order_addresses_consistency deferred;
    v_hold_until := clock_timestamp() + c_hold;
    perform set_config('fabric_store.actor_type', 'customer', true);

    insert into public.fabric_store_orders (
      access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, customer_email,
      delivery_method, delivery_option_code, delivery_option_label,
      vat_basis_points, items_net_halalas, shipping_net_halalas, shipping_vat_halalas,
      vat_halalas, total_halalas, payment_due_at,
      terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at,
      marketing_opt_in
    ) values (
      v_access_hash, now() + c_access, v_key, v_fingerprint,
      p_request -> 'customer' ->> 'name', v_phone, nullif(p_request -> 'customer' ->> 'email', ''),
      p_request -> 'delivery' ->> 'method',
      nullif(p_request -> 'delivery' ->> 'option_code', ''),
      nullif(p_request -> 'delivery' ->> 'option_label', ''),
      1500,
      (p_request -> 'totals' ->> 'items_net_halalas')::bigint,
      coalesce((p_request -> 'delivery' ->> 'shipping_net_halalas')::bigint, 0),
      coalesce((p_request -> 'delivery' ->> 'shipping_vat_halalas')::bigint, 0),
      (p_request -> 'totals' ->> 'vat_halalas')::bigint,
      (p_request -> 'totals' ->> 'total_halalas')::bigint,
      v_hold_until,
      p_request -> 'policies' ->> 'terms',
      p_request -> 'policies' ->> 'returns',
      p_request -> 'policies' ->> 'privacy',
      now(),
      coalesce((p_request ->> 'marketing_opt_in')::boolean, false)
    )
    returning id, order_number into v_order_id, v_order_number;

    -- ٤) الأسطر: الأرقام من الخادم (تتحقق منها القيود والحجز)، والنص ومراجع
    --    المخزون من بطاقة المتجر نفسها.
    v_line := 0;
    for v_item in select value from jsonb_array_elements(v_items)
    loop
      v_line := v_line + 1;
      select listing.id, listing.name, listing.fabric_code, (listing.available_colors)[1] as color,
             coalesce((listing.images)[1], listing.thumbnail_image, listing.image_url) as image,
             listing.inventory_item_id, listing.inventory_color_id
      into v_listing
      from public.fabrics listing
      where listing.id = (v_item ->> 'fabric_id')::uuid;

      if not found or v_listing.inventory_item_id is null then
        raise exception using
          errcode = 'P0001',
          message = 'FABRIC_STORE_LISTING_UNAVAILABLE|أحد الأقمشة في السلة لم يعد متاحاً للشراء الإلكتروني';
      end if;

      v_mode := v_item ->> 'purchase_mode';
      insert into public.fabric_store_order_items (
        order_id, line_number, fabric_id, inventory_item_id, inventory_color_id,
        fabric_code, fabric_name, color_name, image_url,
        purchase_mode, piece_length_cm, quantity_pieces, quantity_cm, stock_consumption_cm,
        price_per_meter_halalas, discount_basis_points, unit_price_halalas,
        net_halalas, vat_halalas, gross_halalas
      ) values (
        v_order_id, v_line, v_listing.id, v_listing.inventory_item_id, v_listing.inventory_color_id,
        left(nullif(btrim(v_listing.fabric_code), ''), 60),
        left(coalesce(nullif(btrim(v_listing.name), ''), nullif(btrim(v_listing.fabric_code), ''), 'قماش'), 200),
        left(nullif(btrim(v_listing.color), ''), 60),
        case when v_listing.image ~ '^https://' and char_length(v_listing.image) <= 1000 then v_listing.image end,
        v_mode,
        case when v_mode = 'piece' then (v_item ->> 'piece_length_cm')::integer end,
        case when v_mode = 'piece' then 1 end,
        case when v_mode = 'meter' then (v_item ->> 'quantity_cm')::integer end,
        case when v_mode = 'piece' then (v_item ->> 'piece_length_cm')::integer
             else (v_item ->> 'quantity_cm')::integer end,
        (v_item ->> 'price_per_meter_halalas')::bigint,
        (v_item ->> 'discount_basis_points')::integer,
        (v_item ->> 'unit_price_halalas')::bigint,
        (v_item ->> 'net_halalas')::bigint,
        (v_item ->> 'vat_halalas')::bigint,
        (v_item ->> 'net_halalas')::bigint + (v_item ->> 'vat_halalas')::bigint
      );
    end loop;

    -- ٥) عنوان الشحن (يرفضه حارس المرحلة 2 لطلب الاستلام).
    if jsonb_typeof(p_request -> 'address') = 'object' then
      insert into public.fabric_store_order_addresses (
        order_id, recipient_name, recipient_phone, city, district, street,
        building_number, postal_code, additional_number, short_address, notes
      ) values (
        v_order_id,
        p_request -> 'address' ->> 'recipient_name',
        p_request -> 'address' ->> 'recipient_phone',
        p_request -> 'address' ->> 'city',
        nullif(p_request -> 'address' ->> 'district', ''),
        nullif(p_request -> 'address' ->> 'street', ''),
        nullif(p_request -> 'address' ->> 'building_number', ''),
        nullif(p_request -> 'address' ->> 'postal_code', ''),
        nullif(p_request -> 'address' ->> 'additional_number', ''),
        nullif(p_request -> 'address' ->> 'short_address', ''),
        nullif(p_request -> 'address' ->> 'notes', '')
      );
    end if;

    -- ٦) الحجز الذري (المرحلة 3): يقفل صفوف المخزون ويتحقق من البطاقة والسعر والمتاح.
    perform private.fabric_store_reserve_order(v_order_id, v_hold_until);

    -- ٧) اتساق الطلب (مجموع الأسطر، حصص الضريبة، العنوان) يُفحص الآن لا عند الالتزام،
    --    ليقع أي خلل داخل هذه الكتلة فيُلغى الطلب كله ويعود رفضاً مفهوماً. بالأسماء لا
    --    بـall، ثم تُعاد مؤجَّلة: الإعداد يبقى لبقية المعاملة، وطلب ثانٍ في المعاملة
    --    نفسها كان سيُفحص قبل أن تُدرج أسطره.
    set constraints public.fabric_store_orders_consistency,
                    public.fabric_store_order_items_consistency,
                    public.fabric_store_order_addresses_consistency immediate;
    set constraints public.fabric_store_orders_consistency,
                    public.fabric_store_order_items_consistency,
                    public.fabric_store_order_addresses_consistency deferred;
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state = '55P03' then
        raise;  -- انتظار قفل: الخادم يعيد المحاولة
      end if;
      if v_state = 'P0001' and position('|' in v_message) > 0 then
        v_code := split_part(v_message, '|', 1);
        v_message := substr(v_message, position('|' in v_message) + 1);
      elsif v_state like '23%' or v_state like '22%' then
        v_code := 'FABRIC_STORE_ORDER_INVALID';
        v_message := 'بيانات الطلب غير متسقة؛ أعيدي مراجعة السلة';
      else
        raise;
      end if;
      if v_code = 'FABRIC_STORE_PHONE_LIMIT' then
        return jsonb_build_object('status', 'phone_limit');
      elsif v_code = 'FABRIC_STORE_STORE_BUSY' then
        return jsonb_build_object('status', 'store_busy');
      end if;
      return jsonb_build_object('status', 'rejected', 'code', v_code, 'message', left(v_message, 500),
                                'sqlstate', v_state);
  end;

  return jsonb_build_object(
    'status', 'created',
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_halalas', (p_request -> 'totals' ->> 'total_halalas')::bigint,
    'hold_expires_at', v_hold_until,
    'payment_status', 'pending',
    'fulfillment_status', 'unfulfilled');
end;
$$;

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

revoke all on function public.fabric_store_create_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.fabric_store_create_checkout(jsonb) to service_role;
revoke all on function public.fabric_store_begin_payment(bytea, text, bytea) from public, anon, authenticated;
grant execute on function public.fabric_store_begin_payment(bytea, text, bytea) to service_role;

drop table private.fabric_store_hold_clients;

-- تحقق: الدالتان عادتا حرفياً إلى المرحلتين 4 و5
do $$
begin
  if (select md5(replace(p.prosrc, E'\r\n', E'\n')) from pg_proc p
      where p.oid = 'public.fabric_store_create_checkout(jsonb)'::regprocedure) <> 'b5b222ed320f83ea5c20730244f5b2f1'
     or (select md5(replace(p.prosrc, E'\r\n', E'\n')) from pg_proc p
      where p.oid = 'public.fabric_store_begin_payment(bytea, text, bytea)'::regprocedure) <> '69e5b1bc11acc9d8a0be3a385bc5552b' then
    raise exception 'FIX_B_ROLLBACK_CHECK: the restored functions do not match stages 4 and 5';
  end if;
end $$;
