-- ============================================================================
-- متجر الأقمشة: الشحن لكل دول العالم (19 نوفمبر 2026، قرار المالكة)
-- ============================================================================
-- قبلها كان عنوان الشحن «عنواناً وطنياً» سعودياً فقط. هذه الترحيلة:
--   ١) تضيف country_code (ISO 3166-1 ثنائي، افتراضيه SA فكل العناوين القديمة سعودية).
--   ٢) الرمز البريدي: 5 أرقام في السعودية، وحروف إنجليزية وأرقام خارجها (مثل SW1A 1AA).
--   ٣) العنوان الإلزامي: في السعودية العنوان المختصر أو الحي والشارع معاً (كما كان)؛
--      خارجها سطر العنوان (street) يكفي.
--   ٤) رقم المبنى والرقم الإضافي والعنوان المختصر للسعودية وحدها.
--   ٥) fabric_store_create_checkout: نفس تعريف 20261003120000 حرفياً، والفرق الوحيد
--      إدخال country_code من p_request.address (غيابه = SA، فالكود القديم يبقى صحيحاً).
--
-- الشحن نفسه صار مجانياً في الكود (shipping = 0)، والقاعدة تقبل الصفر أصلاً — لا تغيير هنا.
-- جوال الزبونة الدولي: قيود القاعدة كانت E.164 عامة من البداية — لا تغيير.
--
-- الترتيب: طبّقيها قبل نشر الكود (صفحة الطلبات تقرأ country_code، والكود الجديد يرسل
-- رموزاً بريدية غير سعودية).
--
-- التراجع (قبل وصول أي طلب دولي):
--   أعيدي تعريف fabric_store_create_checkout من 20261003120000، ثم:
--   alter table public.fabric_store_order_addresses
--     drop constraint fabric_store_order_addresses_national_fields_sa,
--     drop constraint fabric_store_order_addresses_country_code,
--     drop constraint fabric_store_order_addresses_postal_code,
--     add constraint fabric_store_order_addresses_postal_code
--       check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
--     drop constraint fabric_store_order_addresses_required,
--     add constraint fabric_store_order_addresses_required check (
--       anonymized_at is not null
--       or (recipient_name is not null and recipient_phone is not null and city is not null
--           and (short_address is not null or (district is not null and street is not null)))),
--     drop column country_code;
-- ============================================================================

alter table public.fabric_store_order_addresses
  add column if not exists country_code text not null default 'SA';

alter table public.fabric_store_order_addresses
  add constraint fabric_store_order_addresses_country_code
    check (country_code ~ '^[A-Z]{2}$'),
  drop constraint fabric_store_order_addresses_postal_code,
  add constraint fabric_store_order_addresses_postal_code
    check (
      postal_code is null
      or (country_code = 'SA' and postal_code ~ '^[0-9]{5}$')
      or (country_code <> 'SA' and postal_code ~ '^[A-Z0-9][A-Z0-9 -]{1,11}$')
    ),
  drop constraint fabric_store_order_addresses_required,
  add constraint fabric_store_order_addresses_required
    check (
      anonymized_at is not null
      or (recipient_name is not null
          and recipient_phone is not null
          and city is not null
          and (short_address is not null
               or (street is not null and (district is not null or country_code <> 'SA'))))
    ),
  add constraint fabric_store_order_addresses_national_fields_sa
    check (country_code = 'SA'
           or (building_number is null and additional_number is null and short_address is null));

comment on column public.fabric_store_order_addresses.country_code is
  'دولة الشحن (ISO 3166-1 ثنائي). SA للعناوين السعودية وكل ما قبل 19 نوفمبر 2026. لا يُمحى مع البيانات الشخصية (للإحصاء).';

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
        order_id, country_code, recipient_name, recipient_phone, city, district, street,
        building_number, postal_code, additional_number, short_address, notes
      ) values (
        v_order_id,
        coalesce(nullif(p_request -> 'address' ->> 'country_code', ''), 'SA'),
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

revoke all on function public.fabric_store_create_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.fabric_store_create_checkout(jsonb) to service_role;
