-- ============================================================================
-- إصلاح AUD-02 (تقرير التدقيق، 30 سبتمبر 2026) — الدفعة B
-- تجميد مخزون المحل بطلبات لا تُدفع
-- ============================================================================
-- قبل هذه الهجرة: إنشاء الطلب يحجز المخزون 30 دقيقة قبل أي دفع، والطلب حتى 40 سطراً،
-- والحدود على عدد الطلبات لا على الكمية. طلب واحد بلا دفع جمّد 40 قطعة كاملة، و12 طلباً
-- من عنوانَي IP في 10 دقائق تكفي لكل القطع الكاملة المعروضة (305).
--
-- قرار المالكة (1 أكتوبر 2026):
--   • لا حجز قبل «ادفعي». إنشاء الطلب يتحقق من البطاقة والسعر والمتاح (تجربة الحجز الذري
--     كاملاً ثم إلغاؤها) ولا يحجز شيئاً؛ للزبونة 30 دقيقة لتضغط «ادفعي» (payment_due_at).
--   • أول «ادفعي» ينشئ الحجز 25 دقيقة، وصفحة ميسر 20 دقيقة تنتهي قبله بدقيقتين (دائماً أقصر).
--     الحجز لا يُمدَّد (حارس المرحلة 2)، والسطر يُحجز مرة واحدة (unique)؛ بعد انتهاء الحجز يُعاد
--     إنشاء الطلب من السلة — كما كان.
--   • السقوف («أشد»): الطلب ≤ 5 أسطر؛ المحجوز في وقت واحد لكل جوال ولكل بصمة IP ≤ 5 قطع كاملة
--     و≤ 20 متراً بالمتر؛ وللمتجر كله ≤ 20 قطعة و≤ 100 متر. تُحسب تحت قفل استشاري واحد.
--   • لا CAPTCHA، ولا زر تحرير.
--
-- ما يتغير: public.fabric_store_create_checkout، public.fabric_store_begin_payment (استبدال بفحص
-- بصمة)، وجدول جديد private.fabric_store_hold_clients (بصمة IP من بدأ الدفع، للسقف).
-- لا يمس حارس المحل ولا مسار الخصم ولا confirm_order ولا apply_payment. لا يمس صفاً قائماً.
-- التراجع: docs/store-launch-plans/implementation/payments/fixes/FIX-B-rollback.sql
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('private.fabric_store_reserve_order(uuid, timestamptz)') is null
     or to_regprocedure('public.fabric_store_attach_invoice(uuid, text, text)') is null then
    raise exception 'FABRIC_STORE_STAGES_MISSING: stages 3 and 5 must be applied first';
  end if;
  -- بصمة الدالتين المطبّقتين (نهايات الأسطر موحّدة). القيمة الأولى من ملف هجرتها، والتدقيق
  -- (30 سبتمبر) أثبت أن دوال المتجر الـ47 على الحي تطابق المستودع؛ الثانية هذه الهجرة.
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.fabric_store_create_checkout(jsonb)'::regprocedure
      and md5(replace(p.prosrc, E'\r\n', E'\n')) in (
        'b5b222ed320f83ea5c20730244f5b2f1', -- المرحلة 4 (20260924114354)
        'a50962d6f5a166c8ea8a7361c2827551'  -- هذه الهجرة (إعادة التطبيق آمنة)
      )
  ) then
    raise exception 'FABRIC_STORE_CREATE_CHECKOUT_DRIFT: inspect the deployed function before replacing it';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.fabric_store_begin_payment(bytea, text, bytea)'::regprocedure
      and md5(replace(p.prosrc, E'\r\n', E'\n')) in (
        '69e5b1bc11acc9d8a0be3a385bc5552b', -- المرحلة 5 (20260924160000)
        '5c4a23f068e34f5671498446c82891f2'  -- هذه الهجرة (إعادة التطبيق آمنة)
      )
  ) then
    raise exception 'FABRIC_STORE_BEGIN_PAYMENT_DRIFT: inspect the deployed function before replacing it';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) من بدأ الدفع (بصمة IP كما يحسبها الخادم): للسقف لكل عنوان
-- ---------------------------------------------------------------------------
create table if not exists private.fabric_store_hold_clients (
  order_id uuid primary key references public.fabric_store_orders(id) on delete cascade,
  client_hash bytea not null check (octet_length(client_hash) = 32),
  created_at timestamptz not null default now()
);
alter table private.fabric_store_hold_clients enable row level security;
revoke all on table private.fabric_store_hold_clients from public, anon, authenticated, service_role;
create index if not exists fabric_store_hold_clients_client_idx on private.fabric_store_hold_clients (client_hash);

comment on table private.fabric_store_hold_clients is
  'الدفعة B (AUD-02): بصمة عنوان من ضغط «ادفعي» لطلب، ليُحسب سقف المحجوز لكل عنوان. لا يصلها أي دور API.';

-- ---------------------------------------------------------------------------
-- 2) إنشاء الطلب: لا حجز، ≤ 5 أسطر (نسخة المرحلة 4 + ثلاثة تغييرات معلَّمة «الدفعة B»)
-- 3) بدء الدفع: الحجز والسقوف هنا (نسخة المرحلة 5 + كتلة معلَّمة «الدفعة B»)
-- ---------------------------------------------------------------------------
create or replace function public.fabric_store_create_checkout(p_request jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '800ms'
as $$
declare
  -- ثوابت العمل (المالك، 24 سبتمبر 2026؛ والدفعة B، 1 أكتوبر 2026). تغييرها = هجرة جديدة.
  -- c_hold صار مهلة الضغط على «ادفعي» (payment_due_at)، لا مدة حجز: لا حجز قبل الدفع.
  c_hold interval := interval '30 minutes';
  c_max_lines integer := 5;
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
  -- الدفعة B (AUD-02): الطلب غير المدفوع لا يتجاوز c_max_lines سطراً (قرار المالكة).
  if jsonb_array_length(v_items) > c_max_lines then
    return jsonb_build_object('status', 'rejected', 'code', 'FABRIC_STORE_TOO_MANY_LINES',
      'message', format('الطلب الإلكتروني يصل إلى %s أقمشة؛ للكميات الأكبر تواصلي مع المحل', c_max_lines));
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

    -- ٦) الدفعة B (AUD-02): لا حجز قبل «ادفعي». يُجرَّب الحجز الذري (المرحلة 3) كاملاً
    --    — البطاقة والسعر والظهور والمتاح تحت أقفال المخزون نفسها — ثم يُلغى داخل كتلة
    --    فرعية: لا يبقى صف حجز، وتُفك الأقفال فوراً. الزبونة تعرف الآن إن تغيّر شيء، والمحل
    --    لا يُحجز عنه شيء. الحجز الحقيقي في fabric_store_begin_payment.
    begin
      perform private.fabric_store_reserve_order(v_order_id, v_hold_until);
      raise exception using errcode = 'P0001', message = 'FABRIC_STORE_DRY_RUN|ok';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state is distinct from 'P0001' or v_message is distinct from 'FABRIC_STORE_DRY_RUN|ok' then
        raise;
      end if;
    end;

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

revoke all on function public.fabric_store_create_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.fabric_store_create_checkout(jsonb) to service_role;
revoke all on function public.fabric_store_begin_payment(bytea, text, bytea) from public, anon, authenticated;
grant execute on function public.fabric_store_begin_payment(bytea, text, bytea) to service_role;

comment on function public.fabric_store_create_checkout(jsonb) is
  'للخادم فقط (service_role): ينشئ طلب المتجر وأسطره وعنوانه في معاملة واحدة، ويتحقق من البطاقة والسعر والمتاح بتجربة الحجز ثم إلغائها — لا حجز قبل «ادفعي» (الدفعة B). ≤ 5 أسطر. عدم تكرار بـcheckout_key + بصمة المدخلات. حدود: 6 طلبات/10 دقائق و30/يوم لكل صاحب طلب، 3 طلبات حيّة لكل هاتف، 50 للمتجر.';
comment on function public.fabric_store_begin_payment(bytea, text, bytea) is
  'للخادم فقط (service_role): أول «ادفعي» يحجز المخزون 25 دقيقة بعد فحص السقوف (5 قطع و20 م لكل جوال ولكل بصمة IP؛ 20 قطعة و100 م للمتجر)، ثم محاولة دفع مدتها أقصر من الحجز.';

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'public.fabric_store_create_checkout(jsonb)'::regprocedure;

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
