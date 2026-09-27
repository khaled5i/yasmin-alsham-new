-- ============================================================================
-- متجر الأقمشة الإلكتروني — نقطة دخول الخادم: عرض السعر وإنشاء الطلب والحجز
-- المرحلة 4 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- لماذا دوال في public: service_role لا يملك USAGE على مخطط private، فلا يستطيع
-- مسار الخادم استدعاء دوال الحجز مباشرة (مثبَّت باختبار المرحلة 3). الدالتان هنا
-- security definer يملكهما postgres، ممنوحتان لـservice_role **وحده**، وتستدعيان
-- دوال private من الداخل.
--
-- ما تضيفه:
--   • private.fabric_store_rate_limits        — عدّادات حدود المعدّل (نافذة ثابتة).
--   • private.fabric_store_take_rate_limit    — يزيد العدّاد ويقول هل بقي ضمن الحد.
--   • public.fabric_store_quote_snapshot      — قراءة بطاقات الأقمشة + المخزون الفعلي
--                                               + المحجوز، لعرض السعر (قراءة فقط).
--   • public.fabric_store_create_checkout     — إنشاء الطلب وأسطره وعنوانه وحجز
--                                               المخزون في معاملة واحدة، بعدم تكرار.
--
-- ما لا تغيّره: لا جدول ولا دالة ولا سياسة قائمة. مبيعات المحل والمخزون والأستاذ
-- كما هي. لا مرجع FK إلى جدول عامل، فلا قفل على income أو المخزون أثناء الهجرة.
--
-- قواعد تفرضها القاعدة هنا لا الخادم وحده:
--   • نص لقطة السطر (الاسم والكود واللون والصورة) ومراجع المخزون تُقرأ من بطاقة
--     المتجر نفسها؛ الخادم يرسل معرّف البطاقة والكمية والأرقام فقط. فلا يستطيع
--     طلب أن يسمّي قماشاً بغير اسمه، ولا أن يشير إلى مخزون غير مخزون بطاقته.
--   • الأرقام يتحقق منها: قيود المرحلة 2 (معادلات pricing.ts) + فحص السعر والخصم
--     والظهور وطريقة البيع تحت القفل في fabric_store_reserve_order (المرحلة 3).
--   • حدود المعدّل ومدة الحجز وسقوف الطلبات الحيّة داخل المعاملة نفسها، ولا
--     يمحوها رفض الطلب (العدّاد خارج الكتلة التي تُلغى).
--
-- التطبيق: من SQL Editor في Supabase (ترميز UTF-8). لا أقفال على جداول عاملة.
-- التحقق بعدها: supabase/tests/fabric_store_checkout.sql (داخل معاملة تُلغى).
-- التراجع: تقرير المرحلة 4 §التراجع.
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('private.fabric_store_reserve_order(uuid, timestamp with time zone)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE3_MISSING|طبّق هجرتي المرحلتين 2 و3 قبل هذه الهجرة';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) حدود المعدّل — نافذة ثابتة لكل (نوع، بصمة صاحب الطلب)
-- ---------------------------------------------------------------------------
-- البصمة HMAC لعنوان IP يحسبها الخادم بسرّه، فلا يُخزَّن عنوان ولا يمكن عكسه.
-- في private: لا يراه PostgREST، ولا صلاحية لأي دور عليه؛ تكتبه دوال postgres.

create table private.fabric_store_rate_limits (
  bucket text not null,
  subject_hash bytea not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  constraint fabric_store_rate_limits_pkey primary key (bucket, subject_hash, window_start),
  constraint fabric_store_rate_limits_bucket check (bucket ~ '^[a-z0-9_]{1,40}$'),
  constraint fabric_store_rate_limits_subject check (octet_length(subject_hash) = 32),
  constraint fabric_store_rate_limits_hits check (hits >= 0)
);

alter table private.fabric_store_rate_limits enable row level security;
revoke all on table private.fabric_store_rate_limits from public, anon, authenticated, service_role;

comment on table private.fabric_store_rate_limits is
  'عدّادات حدود المعدّل لمسارات المتجر الإلكتروني. البصمة HMAC لعنوان IP (لا يُخزَّن العنوان). تُنظَّف ذاتياً بعد يومين.';

create or replace function private.fabric_store_take_rate_limit(
  p_bucket text,
  p_subject bytea,
  p_limit integer,
  p_window interval
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_seconds double precision := extract(epoch from p_window);
  v_start timestamptz;
  v_hits integer;
begin
  if p_subject is null or octet_length(p_subject) <> 32 or v_seconds is null or v_seconds <= 0 then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_RATE_SUBJECT|بصمة صاحب الطلب غير صالحة';
  end if;

  v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_seconds) * v_seconds);

  insert into private.fabric_store_rate_limits as rl (bucket, subject_hash, window_start, hits)
  values (p_bucket, p_subject, v_start, 1)
  on conflict (bucket, subject_hash, window_start)
  do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- تنظيف ذاتي محدود: لا يحتاج مهمة مجدولة، ولا يطول مع الوقت.
  delete from private.fabric_store_rate_limits old_rl
  where old_rl.ctid in (
    select stale.ctid from private.fabric_store_rate_limits stale
    where stale.window_start < clock_timestamp() - interval '2 days'
    limit 50
  );

  return v_hits <= p_limit;
end;
$$;

revoke all on function private.fabric_store_take_rate_limit(text, bytea, integer, interval)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) لقطة عرض السعر — بطاقات الأقمشة + المخزون الفعلي + المحجوز (قراءة فقط)
-- ---------------------------------------------------------------------------
-- الخادم يسعّر بـpricing.ts على هذه الأرقام نفسها، فعرض السعر يرى المحجوز كما
-- سيراه الحجز. البطاقة المخفية تعود بأعلام الظهور فقط؛ الخادم لا يعرض سعرها.

create or replace function public.fabric_store_quote_snapshot(
  p_fabric_ids uuid[],
  p_client_hash bytea
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if p_fabric_ids is null or cardinality(p_fabric_ids) = 0 or cardinality(p_fabric_ids) > 40 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if p_client_hash is null or octet_length(p_client_hash) <> 32 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if not private.fabric_store_take_rate_limit('quote', p_client_hash, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'fabric_id', listing.id,
           'name', listing.name,
           'fabric_code', listing.fabric_code,
           'color', (listing.available_colors)[1],
           'image', coalesce((listing.images)[1], listing.thumbnail_image, listing.image_url),
           'price_per_meter', listing.price_per_meter,
           'is_on_sale', listing.is_on_sale,
           'discount_percentage', listing.discount_percentage,
           'min_order_meters', listing.min_order_meters,
           'deleted_at', listing.deleted_at,
           'is_active', listing.is_active,
           'is_available', listing.is_available,
           'is_manually_hidden', listing.is_manually_hidden,
           'inventory_item_id', listing.inventory_item_id,
           'inventory_color_id', listing.inventory_color_id,
           'inventory_unit', inv.unit,
           -- مخزون وحدة المخزون نفسها (اللون، أو الصنف بلا ألوان) — ما يقرؤه الحجز.
           'physical_quantity', case
             when listing.inventory_color_id is not null then color.current_quantity
             when listing.inventory_item_id is not null then inv.current_quantity
           end,
           'color_required', (listing.inventory_color_id is null and listing.inventory_item_id is not null
                              and exists (select 1 from public.fabric_inventory_colors any_color
                                          where any_color.inventory_item_id = listing.inventory_item_id)),
           'reserved_cm', coalesce(hold.reserved_cm, 0)
         )), '[]'::jsonb)
  into v_rows
  from public.fabrics listing
  left join public.fabric_inventory inv on inv.id = listing.inventory_item_id
  left join public.fabric_inventory_colors color
    on color.id = listing.inventory_color_id and color.inventory_item_id = listing.inventory_item_id
  left join lateral private.fabric_store_stock_hold(listing.inventory_item_id, listing.inventory_color_id) hold
    on listing.inventory_item_id is not null
  where listing.id = any (p_fabric_ids);

  return jsonb_build_object('status', 'ok', 'fabrics', v_rows);
end;
$$;

revoke all on function public.fabric_store_quote_snapshot(uuid[], bytea) from public, anon, authenticated;
grant execute on function public.fabric_store_quote_snapshot(uuid[], bytea) to service_role;

comment on function public.fabric_store_quote_snapshot(uuid[], bytea) is
  'للخادم فقط (service_role): بطاقات الأقمشة المطلوبة مع المخزون الفعلي والمحجوز، لعرض السعر. 60 طلباً لكل صاحب طلب في 10 دقائق.';

-- ---------------------------------------------------------------------------
-- 3) إنشاء الطلب والحجز — كله أو لا شيء، بعدم تكرار
-- ---------------------------------------------------------------------------
-- الحالات المُرجعة (status):
--   created    — طلب جديد محجوز لمدة 30 دقيقة.
--   existing   — نفس checkout_key بنفس المدخلات ورمز الوصول: نفس الطلب، بلا أثر جديد.
--   key_reused — نفس checkout_key بمدخلات أو رمز مختلف: مرفوض.
--   rate_limited / phone_limit / store_busy — حدود المعدّل والطلبات الحيّة.
--   rejected   — رفضته قيود الطلب أو الحجز (code + message بالعربية)؛ لا يبقى منه شيء.
--   bad_request — مدخلات لا تُقرأ.
-- خطأ 55P03 (انتظار قفل) يخرج كما هو: الخادم يعيده «أعيدي المحاولة».

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

revoke all on function public.fabric_store_create_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.fabric_store_create_checkout(jsonb) to service_role;

comment on function public.fabric_store_create_checkout(jsonb) is
  'للخادم فقط (service_role): ينشئ طلب المتجر وأسطره وعنوانه ويحجز مخزونه 30 دقيقة في معاملة واحدة. عدم تكرار بـcheckout_key + بصمة المدخلات. حدود: 6 طلبات/10 دقائق و30/يوم لكل صاحب طلب، 3 طلبات حيّة لكل هاتف، 50 طلباً حيّاً للمتجر.';

-- ============================================================================
-- فحص ذاتي للترميز (كما في هجرتي المرحلتين 2 و3): إن قُرئ الملف بترميز خاطئ
-- تفشل الهجرة كلها ولا يُطبَّق شيء. الفحص بأكواد الحروف.
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabric_store_create_checkout';

  -- "قماش"
  if position(chr(1602) || chr(1605) || chr(1575) || chr(1588) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
