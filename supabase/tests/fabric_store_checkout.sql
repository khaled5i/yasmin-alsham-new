-- Exercise stage 4 (migration 20260924114354): the server entry points
-- public.fabric_store_quote_snapshot and public.fabric_store_create_checkout,
-- called AS service_role exactly as the Next.js routes call them.
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end.
-- It creates its OWN throwaway fabrics (like the stage 3 test) and never inserts
-- into income. Order numbers taken from the FS- sequence are not given back by
-- the rollback (a gap in FS- numbers before launch; harmless).
--
-- Run after applying the stage 2, 3 AND 4 migrations, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store checkout (…)
-- Any failure aborts with: TEST FAILED: <case>: …

begin;

create function pg_temp.expect_status(p_case text, p_result jsonb, p_status text)
returns void language plpgsql as $$
begin
  if p_result ->> 'status' is distinct from p_status then
    raise exception 'TEST FAILED: %: expected status % but got: %', p_case, p_status, p_result;
  end if;
end;
$$;

create function pg_temp.expect_rejected(p_case text, p_result jsonb, p_code text)
returns void language plpgsql as $$
begin
  if p_result ->> 'status' is distinct from 'rejected' or p_result ->> 'code' is distinct from p_code then
    raise exception 'TEST FAILED: %: expected rejected/% but got: %', p_case, p_code, p_result;
  end if;
end;
$$;

create function pg_temp.hex(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

-- A throwaway fabric with one colour and its storefront card at 100.00 SAR/m (as in the stage 3 test).
create function pg_temp.make_fabric(p_label text, p_meters numeric)
returns table (item_id uuid, color_id uuid, listing_id uuid) language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار الدفع ' || p_label, 'اختبار صفحة الدفع ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون اختبار ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار صفحة الدفع');

  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار صفحة الدفع', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            greatest(p_meters, 0), 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics
    set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0
    where id = v_listing;
  end if;
  return query select v_item, v_color, v_listing;
end;
$$;

-- The request the server sends for ONE line at p_price halalas/m, priced exactly as
-- src/lib/fabric-store/pricing.ts prices it (unit, line, VAT on items + shipping,
-- VAT split by largest remainder with ties to the line).
create function pg_temp.req(
  p_key uuid, p_listing uuid, p_mode text, p_cm integer,
  p_phone text default '+966500000001',
  p_client text default 'client-a',
  p_method text default 'pickup',
  p_supersede text default null,
  p_access text default null,
  p_fp text default null,
  p_price bigint default 10000)
returns jsonb language plpgsql as $$
declare
  v_unit bigint := case when p_mode = 'piece'
                        then (p_price * 10000 * p_cm + 500000) / 1000000
                        else (p_price * 10000 + 5000) / 10000 end;
  v_net bigint;
  v_ship bigint := case when p_method = 'shipping' then 5000 else 0 end;
  v_vat bigint;
  v_line_vat bigint;
  v_ship_vat bigint;
begin
  v_net := case when p_mode = 'piece' then v_unit else (v_unit * p_cm + 50) / 100 end;
  v_vat := ((v_net + v_ship) * 1500 + 5000) / 10000;
  if v_ship = 0 then
    v_line_vat := v_vat; v_ship_vat := 0;
  else
    v_line_vat := (v_vat * v_net) / (v_net + v_ship);
    v_ship_vat := (v_vat * v_ship) / (v_net + v_ship);
    if v_line_vat + v_ship_vat < v_vat then
      if (v_vat * v_net) % (v_net + v_ship) >= (v_vat * v_ship) % (v_net + v_ship)
        then v_line_vat := v_line_vat + 1; else v_ship_vat := v_ship_vat + 1; end if;
    end if;
  end if;

  return jsonb_build_object(
    'checkout_key', p_key,
    'request_fingerprint', pg_temp.hex(coalesce(p_fp, p_key::text || ':fp')),
    'access_token_hash', pg_temp.hex(coalesce(p_access, p_key::text || ':access')),
    'client_hash', pg_temp.hex(p_client),
    'supersede_access_hash', case when p_supersede is not null then pg_temp.hex(p_supersede) end,
    'customer', jsonb_build_object('name', 'عميلة اختبار', 'phone', p_phone, 'email', null),
    'delivery', jsonb_build_object(
      'method', p_method,
      'option_code', case when p_method = 'shipping' then 'ksa_flat' end,
      'option_label', case when p_method = 'shipping' then 'شحن داخل السعودية' end,
      'shipping_net_halalas', v_ship,
      'shipping_vat_halalas', v_ship_vat),
    'address', case when p_method = 'shipping' then jsonb_build_object(
      'recipient_name', 'عميلة اختبار', 'recipient_phone', p_phone, 'city', 'الرياض',
      'short_address', 'RRRD2929') end,
    'totals', jsonb_build_object('items_net_halalas', v_net, 'vat_halalas', v_vat,
                                 'total_halalas', v_net + v_ship + v_vat),
    'policies', jsonb_build_object('terms', 'test', 'returns', 'test', 'privacy', 'test'),
    'marketing_opt_in', false,
    'items', jsonb_build_array(jsonb_build_object(
      'fabric_id', p_listing,
      'purchase_mode', p_mode,
      'piece_length_cm', case when p_mode = 'piece' then p_cm end,
      'quantity_cm', case when p_mode = 'meter' then p_cm end,
      'price_per_meter_halalas', p_price,
      'discount_basis_points', 0,
      'unit_price_halalas', v_unit,
      'net_halalas', v_net,
      'vat_halalas', v_line_vat)));
end;
$$;

-- Call the entry points with the server's role (the Next.js routes use service_role).
create function pg_temp.co(p jsonb) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_create_checkout(p);
  reset role;
  return v;
exception when others then
  reset role;
  raise;
end;
$$;

create function pg_temp.quote(p_ids uuid[], p_client text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_quote_snapshot(p_ids, decode(pg_temp.hex(p_client), 'hex'));
  reset role;
  return v;
exception when others then
  reset role;
  raise;
end;
$$;

create function pg_temp.hits(p_bucket text, p_client text) returns integer language sql as $$
  select coalesce(sum(hits), 0)::integer from private.fabric_store_rate_limits
  where bucket = p_bucket and subject_hash = decode(pg_temp.hex(p_client), 'hex')
$$;

-- A shop-side stock OUT (what each shop sale line becomes through the income trigger).
create function pg_temp.shop_out(p_item uuid, p_color uuid, p_meters numeric)
returns text language plpgsql as $$
begin
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (p_item, p_color, 'out', p_meters, 'صرف اختبار صفحة الدفع');
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Privileges: the server may call the two entry points; browsers may not;
--    nobody reaches the rate-limit table or its helper directly.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array['public.fabric_store_create_checkout(jsonb)', 'public.fabric_store_quote_snapshot(uuid[], bytea)']
  loop
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'TEST FAILED: service_role cannot execute %', v_fn;
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'TEST FAILED: % can execute % (browser roles must not)', v_role, v_fn;
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""']
            from pg_proc p where p.oid = v_fn::regprocedure) then
      raise exception 'TEST FAILED: % must be SECURITY DEFINER with an empty search_path', v_fn;
    end if;
  end loop;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'private.fabric_store_rate_limits', 'SELECT')
       or has_table_privilege(v_role, 'private.fabric_store_rate_limits', 'INSERT')
       or has_table_privilege(v_role, 'private.fabric_store_rate_limits', 'UPDATE')
       or has_table_privilege(v_role, 'private.fabric_store_rate_limits', 'DELETE') then
      raise exception 'TEST FAILED: % can touch the rate-limit table directly', v_role;
    end if;
    if has_function_privilege(v_role, 'private.fabric_store_take_rate_limit(text, bytea, integer, interval)', 'EXECUTE') then
      raise exception 'TEST FAILED: % can bump or reset rate limits directly', v_role;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Bad input is refused before any effect
-- ---------------------------------------------------------------------------
do $$
declare
  v_listing uuid;
  v_req jsonb;
  v_items jsonb := '[]'::jsonb;
  i integer;
begin
  select listing_id into v_listing from pg_temp.make_fabric('مدخلات', 50);
  v_req := pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'bad-input');

  perform pg_temp.expect_status('checkout key is not a uuid',
    pg_temp.co(jsonb_set(v_req, '{checkout_key}', '"not-a-uuid"')), 'bad_request');
  perform pg_temp.expect_status('fingerprint is not 32 bytes',
    pg_temp.co(jsonb_set(v_req, '{request_fingerprint}', '"abcd"')), 'bad_request');
  perform pg_temp.expect_status('items is not an array',
    pg_temp.co(jsonb_set(v_req, '{items}', '{"a": 1}')), 'bad_request');
  perform pg_temp.expect_status('no items',
    pg_temp.co(jsonb_set(v_req, '{items}', '[]')), 'bad_request');
  for i in 1..41 loop v_items := v_items || (v_req -> 'items' -> 0); end loop;
  perform pg_temp.expect_status('41 lines',
    pg_temp.co(jsonb_set(v_req, '{items}', v_items)), 'bad_request');
  if pg_temp.hits('checkout_10m', 'bad-input') <> 0 then
    raise exception 'TEST FAILED: unreadable input consumed the rate limit';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Quote snapshot: live card + physical stock + what is already held
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_q jsonb;
  v_ids uuid[] := '{}';
  i integer;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('عرض سعر', 10);

  v_q := pg_temp.quote(array[v_listing], 'quote-client');
  perform pg_temp.expect_status('quote works for the server', v_q, 'ok');
  if (v_q -> 'fabrics' -> 0 ->> 'physical_quantity')::numeric <> 10
     or (v_q -> 'fabrics' -> 0 ->> 'reserved_cm')::bigint <> 0
     or (v_q -> 'fabrics' -> 0 ->> 'inventory_color_id')::uuid is distinct from v_color then
    raise exception 'TEST FAILED: quote snapshot before a hold: %', v_q;
  end if;

  perform pg_temp.expect_status('an order holds 4 m',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 400, p_phone => '+966500000002', p_client => 'quote-buyer')), 'created');
  v_q := pg_temp.quote(array[v_listing], 'quote-client');
  if (v_q -> 'fabrics' -> 0 ->> 'reserved_cm')::bigint <> 400 then
    raise exception 'TEST FAILED: the quote does not see the 4 m hold: %', v_q;
  end if;

  for i in 1..41 loop v_ids := v_ids || gen_random_uuid(); end loop;
  perform pg_temp.expect_status('quote of 41 fabrics', pg_temp.quote(v_ids, 'quote-client'), 'bad_request');

  -- the 61st quote in the same 10-minute window is refused
  insert into private.fabric_store_rate_limits (bucket, subject_hash, window_start, hits)
  values ('quote', decode(pg_temp.hex('quote-flood'), 'hex'),
          to_timestamp(floor(extract(epoch from clock_timestamp()) / 600) * 600), 60);
  perform pg_temp.expect_status('quote flood', pg_temp.quote(array[v_listing], 'quote-flood'), 'rate_limited');
end $$;

-- ---------------------------------------------------------------------------
-- 3) Create: order + line snapshot from the card + a 30-minute hold the shop respects
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_other_item uuid;
  v_key uuid := gen_random_uuid();
  v_req jsonb;
  v_res jsonb;
  v_order record;
  v_line record;
  v_hold record;
  v_hits integer;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('إنشاء', 10);
  select item_id into v_other_item from pg_temp.make_fabric('إنشاء آخر', 10);
  update public.fabrics set name = 'اسم البطاقة الحقيقي', fabric_code = 'FS-TEST-1' where id = v_listing;

  v_req := pg_temp.req(v_key, v_listing, 'meter', 400, p_client => 'create-client');
  -- whatever the request claims about inventory or names is ignored: the card decides
  v_req := jsonb_set(v_req, '{items,0,inventory_item_id}', to_jsonb(v_other_item));
  v_req := jsonb_set(v_req, '{items,0,fabric_name}', '"اسم مزوّر"');

  v_res := pg_temp.co(v_req);
  perform pg_temp.expect_status('a valid pickup order', v_res, 'created');

  select * into v_order from public.fabric_store_orders where checkout_key = v_key;
  if v_order.id is distinct from (v_res ->> 'order_id')::uuid
     or v_order.order_number is distinct from v_res ->> 'order_number'
     or v_order.total_halalas <> 46000
     or v_order.payment_status <> 'pending' or v_order.fulfillment_status <> 'unfulfilled'
     or v_order.access_expires_at < now() + interval '89 days' then
    raise exception 'TEST FAILED: created order row: % / %', row_to_json(v_order), v_res;
  end if;

  select * into v_line from public.fabric_store_order_items where order_id = v_order.id;
  if v_line.fabric_name <> 'اسم البطاقة الحقيقي' or v_line.fabric_code <> 'FS-TEST-1'
     or v_line.inventory_item_id <> v_item or v_line.inventory_color_id <> v_color then
    raise exception 'TEST FAILED: the line snapshot must come from the card, got: %', row_to_json(v_line);
  end if;

  select * into v_hold from public.fabric_store_stock_reservations where order_id = v_order.id;
  if v_hold.status <> 'active' or v_hold.quantity_cm <> 400
     or v_hold.expires_at not between clock_timestamp() + interval '29 minutes' and clock_timestamp() + interval '31 minutes'
     or v_order.payment_due_at <> v_hold.expires_at then
    raise exception 'TEST FAILED: the hold must be 4 m for 30 minutes, got: % (due %)', row_to_json(v_hold), v_order.payment_due_at;
  end if;

  if not exists (select 1 from public.fabric_store_order_events
                 where order_id = v_order.id and event_type = 'order_created' and actor_type = 'customer') then
    raise exception 'TEST FAILED: the audit log must record the customer as the creator';
  end if;

  -- end to end: the shop's stock guard now keeps the held 4 m out of a shop sale
  if position('FABRIC_STOCK_RESERVED' in pg_temp.shop_out(v_item, v_color, 7)) = 0 then
    raise exception 'TEST FAILED: the shop could sell metres held by the online order';
  end if;

  -- a replay (lost response, double click) returns the same order and costs nothing
  v_hits := pg_temp.hits('checkout_10m', 'create-client');
  v_res := pg_temp.co(v_req);
  perform pg_temp.expect_status('replay with the same key and inputs', v_res, 'existing');
  if (v_res ->> 'order_id')::uuid is distinct from v_order.id
     or (select count(*) from public.fabric_store_orders where checkout_key = v_key) <> 1
     or (select count(*) from public.fabric_store_stock_reservations where order_id = v_order.id) <> 1
     or pg_temp.hits('checkout_10m', 'create-client') <> v_hits then
    raise exception 'TEST FAILED: a replay must return the same order without a new hold or rate cost: %', v_res;
  end if;

  -- the same key with other inputs, or another browser's token, is refused
  perform pg_temp.expect_status('same key, different inputs',
    pg_temp.co(pg_temp.req(v_key, v_listing, 'meter', 400, p_client => 'create-client', p_fp => 'other inputs')),
    'key_reused');
  perform pg_temp.expect_status('same key, different access token',
    pg_temp.co(pg_temp.req(v_key, v_listing, 'meter', 400, p_client => 'create-client', p_access => 'someone else')),
    'key_reused');
end $$;

-- ---------------------------------------------------------------------------
-- 4) Refusals leave nothing behind
-- ---------------------------------------------------------------------------
do $$
declare
  v_listing uuid;
  v_key uuid;
  v_req jsonb;
  v_unlinked uuid;
  v_before bigint;
begin
  select listing_id into v_listing from pg_temp.make_fabric('رفض', 4);
  select count(*) into v_before from public.fabric_store_orders;

  -- price changed since the quote (the card says 100.00, the request 90.00)
  v_key := gen_random_uuid();
  perform pg_temp.expect_rejected('an old price',
    pg_temp.co(pg_temp.req(v_key, v_listing, 'meter', 100, p_client => 'refusals', p_price => 9000)),
    'FABRIC_STORE_PRICE_CHANGED');

  -- arithmetic that breaks the stage 2 pricing rules
  v_req := pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'refusals');
  v_req := jsonb_set(v_req, '{items,0,net_halalas}', '10001');
  perform pg_temp.expect_rejected('a line total off by one halala', pg_temp.co(v_req), 'FABRIC_STORE_ORDER_INVALID');

  -- order totals that do not match the lines (checked now, not at commit)
  v_req := pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'refusals');
  v_req := jsonb_set(v_req, '{totals}', '{"items_net_halalas": 20000, "vat_halalas": 3000, "total_halalas": 23000}');
  perform pg_temp.expect_rejected('order totals disagree with the lines', pg_temp.co(v_req), 'FABRIC_STORE_ORDER_ITEMS_TOTAL');

  -- more than is on the shelf
  perform pg_temp.expect_rejected('more than the stock',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 450, p_client => 'refusals')),
    'FABRIC_STORE_STOCK_UNAVAILABLE');

  -- a card that does not exist, and a manual card with no stock behind it
  perform pg_temp.expect_rejected('an unknown card',
    pg_temp.co(pg_temp.req(gen_random_uuid(), gen_random_uuid(), 'meter', 100, p_client => 'refusals-2')),
    'FABRIC_STORE_LISTING_UNAVAILABLE');
  insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters, is_available, is_active)
  values ('اختبار صفحة الدفع', 'https://example.invalid/x.jpg', 100.00, 10, 1, true, true)
  returning id into v_unlinked;
  perform pg_temp.expect_rejected('a card without stock behind it',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_unlinked, 'meter', 100, p_client => 'refusals-2')),
    'FABRIC_STORE_LISTING_UNAVAILABLE');

  -- delivery and address must agree
  v_req := pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'refusals-2', p_method => 'shipping');
  perform pg_temp.expect_rejected('shipping without an address', pg_temp.co(v_req - 'address'),
    'FABRIC_STORE_ORDER_ADDRESS_REQUIRED');
  v_req := pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'refusals-2');
  v_req := v_req || jsonb_build_object('address', jsonb_build_object(
    'recipient_name', 'عميلة', 'recipient_phone', '+966500000001', 'city', 'الرياض', 'short_address', 'RRRD2929'));
  perform pg_temp.expect_rejected('pickup with an address', pg_temp.co(v_req), 'FABRIC_STORE_ORDER_ADDRESS_UNEXPECTED');

  if (select count(*) from public.fabric_store_orders) <> v_before then
    raise exception 'TEST FAILED: a refused checkout left an order behind';
  end if;
  if exists (select 1 from public.fabric_store_orders where checkout_key = v_key) then
    raise exception 'TEST FAILED: the old-price order exists';
  end if;
  -- the refusals still count against the sender (the counter is outside the undone block)
  if pg_temp.hits('checkout_10m', 'refusals') <> 4 then
    raise exception 'TEST FAILED: refused attempts must still count against the rate limit, got %',
      pg_temp.hits('checkout_10m', 'refusals');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Shipping order: 50.00 SAR + VAT, address stored
-- ---------------------------------------------------------------------------
do $$
declare
  v_listing uuid;
  v_key uuid := gen_random_uuid();
  v_order record;
begin
  select listing_id into v_listing from pg_temp.make_fabric('شحن', 10);
  perform pg_temp.expect_status('a shipping order',
    pg_temp.co(pg_temp.req(v_key, v_listing, 'meter', 150, p_phone => '+966500000005', p_client => 'shipping', p_method => 'shipping')), 'created');
  select * into v_order from public.fabric_store_orders where checkout_key = v_key;
  -- 150.00 + 50.00 shipping = 200.00 ; VAT 30.00 ; total 230.00
  if v_order.shipping_net_halalas <> 5000 or v_order.vat_halalas <> 3000 or v_order.total_halalas <> 23000
     or v_order.delivery_option_code <> 'ksa_flat'
     or not exists (select 1 from public.fabric_store_order_addresses a
                    where a.order_id = v_order.id and a.city = 'الرياض' and a.short_address = 'RRRD2929') then
    raise exception 'TEST FAILED: shipping order: %', row_to_json(v_order);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Rate limits: per sender (10 minutes and per day), live orders per phone, store-wide
-- ---------------------------------------------------------------------------
do $$
declare
  v_listing uuid;
  v_x uuid := gen_random_uuid();
  i integer;
  v_res jsonb;
begin
  select listing_id into v_listing from pg_temp.make_fabric('حدود', 40);

  -- six attempts in ten minutes (even refused ones), the seventh is refused
  for i in 1..6 loop
    perform pg_temp.expect_rejected('burst attempt ' || i,
      pg_temp.co(pg_temp.req(gen_random_uuid(), gen_random_uuid(), 'meter', 100, p_client => 'burst')),
      'FABRIC_STORE_LISTING_UNAVAILABLE');
  end loop;
  perform pg_temp.expect_status('seventh attempt in ten minutes',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'burst')), 'rate_limited');

  -- thirty in a day
  insert into private.fabric_store_rate_limits (bucket, subject_hash, window_start, hits)
  values ('checkout_day', decode(pg_temp.hex('daily'), 'hex'),
          to_timestamp(floor(extract(epoch from clock_timestamp()) / 86400) * 86400), 30);
  perform pg_temp.expect_status('thirty-first attempt today',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_client => 'daily')), 'rate_limited');

  -- three live orders per phone; the fourth is refused
  for i in 1..3 loop
    perform pg_temp.expect_status('live order ' || i || ' for one phone',
      pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100,
                             p_phone => '+966511111111', p_client => 'phone-' || i)), 'created');
  end loop;
  perform pg_temp.expect_status('fourth live order for one phone',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100,
                           p_phone => '+966511111111', p_client => 'phone-4')), 'phone_limit');

  -- a refused order must not have cancelled the order it was going to replace
  perform pg_temp.expect_status('an order from another phone',
    pg_temp.co(pg_temp.req(v_x, v_listing, 'meter', 100, p_phone => '+966522222222',
                           p_client => 'phone-x', p_access => 'x-access')), 'created');
  perform pg_temp.expect_status('a capped phone tries to replace it',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100, p_phone => '+966511111111',
                           p_client => 'phone-5', p_supersede => 'x-access')), 'phone_limit');
  if (select fulfillment_status from public.fabric_store_orders where checkout_key = v_x) <> 'unfulfilled'
     or not exists (select 1 from public.fabric_store_stock_reservations r
                    join public.fabric_store_orders o on o.id = r.order_id
                    where o.checkout_key = v_x and r.status = 'active') then
    raise exception 'TEST FAILED: a refused order cancelled or released the order it would have replaced';
  end if;
end $$;

do $$
declare
  v_listing uuid;
  i integer := 0;
  v_res jsonb;
  v_live integer;
begin
  select listing_id into v_listing from pg_temp.make_fabric('سقف المتجر', 80);
  -- fill the store up to its cap of live (held, unpaid) orders; the next one is refused
  loop
    i := i + 1;
    v_res := pg_temp.co(pg_temp.req(gen_random_uuid(), v_listing, 'meter', 100,
                                    p_phone => '+9665300' || lpad(i::text, 5, '0'),
                                    p_client => 'store-cap-' || i));
    exit when v_res ->> 'status' <> 'created' or i > 60;
  end loop;
  select count(distinct order_id) into v_live
  from public.fabric_store_stock_reservations where status = 'active' and expires_at > now();
  perform pg_temp.expect_status('the order past the store cap', v_res, 'store_busy');
  if v_live <> 50 then
    raise exception 'TEST FAILED: the store cap must stop at 50 live orders, stopped at %', v_live;
  end if;
end $$;

-- the cap would stop the next cases: release the filler orders
do $$
begin
  perform private.fabric_store_release_order_reservations(o.id, 'تنظيف الاختبار')
  from public.fabric_store_orders o
  where o.customer_phone like '+9665300%';
end $$;

-- ---------------------------------------------------------------------------
-- 7) A newer order from the same browser replaces an unpaid one
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_other uuid;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_e uuid := gen_random_uuid();
  v_order_a uuid;
  v_order_e uuid;
begin
  -- a 3.5 m whole piece: the customer's first order holds it
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('استبدال', 3.5);
  perform pg_temp.expect_status('first order holds the piece',
    pg_temp.co(pg_temp.req(v_a, v_listing, 'piece', 350, p_phone => '+966500000007', p_client => 'swap', p_access => 'swap-browser')), 'created');
  select id into v_order_a from public.fabric_store_orders where checkout_key = v_a;

  -- she goes back and checks out again from the same browser: the piece is hers, not "unavailable"
  perform pg_temp.expect_status('second order from the same browser',
    pg_temp.co(pg_temp.req(v_b, v_listing, 'piece', 350, p_phone => '+966500000007', p_client => 'swap',
                           p_access => 'swap-browser-2', p_supersede => 'swap-browser')), 'created');
  if (select fulfillment_status from public.fabric_store_orders where id = v_order_a) <> 'cancelled'
     or (select status from public.fabric_store_stock_reservations where order_id = v_order_a) <> 'released'
     or not exists (select 1 from public.fabric_store_order_events
                    where order_id = v_order_a and event_type = 'fulfillment_status'
                      and to_value = 'cancelled' and actor_type = 'system') then
    raise exception 'TEST FAILED: the replaced order must be cancelled by the system and its hold released';
  end if;

  -- a refused newer order does not cancel the older one
  select listing_id into v_other from pg_temp.make_fabric('استبدال مرفوض', 1);
  perform pg_temp.expect_rejected('refused replacement',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_other, 'meter', 500, p_client => 'swap-2',
                           p_supersede => 'swap-browser-2')), 'FABRIC_STORE_STOCK_UNAVAILABLE');
  if (select fulfillment_status from public.fabric_store_orders where checkout_key = v_b) <> 'unfulfilled' then
    raise exception 'TEST FAILED: a refused replacement cancelled the live order';
  end if;

  -- an order whose payment has started is never replaced
  select listing_id into v_other from pg_temp.make_fabric('دفع بدأ', 10);
  perform pg_temp.expect_status('an order about to be paid',
    pg_temp.co(pg_temp.req(v_e, v_other, 'meter', 100, p_phone => '+966500000008', p_client => 'swap-3', p_access => 'paying-browser')), 'created');
  select id into v_order_e from public.fabric_store_orders where checkout_key = v_e;
  insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  values (v_order_e, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '20 minutes');
  perform pg_temp.expect_status('a new order from the paying browser',
    pg_temp.co(pg_temp.req(gen_random_uuid(), v_other, 'meter', 100, p_phone => '+966500000008', p_client => 'swap-3',
                           p_access => 'paying-browser-2', p_supersede => 'paying-browser')), 'created');
  if (select fulfillment_status from public.fabric_store_orders where id = v_order_e) <> 'unfulfilled'
     or (select status from public.fabric_store_stock_reservations where order_id = v_order_e) <> 'active' then
    raise exception 'TEST FAILED: an order with a payment attempt was replaced';
  end if;
end $$;

select 'PASS fabric_store checkout (privileges, bad input, quote + holds + rate, create from the card, 30-minute hold seen by the shop, replay, key reuse, refusals leave nothing, shipping, sender/day/phone/store limits, replacement by the same browser)' as result;

rollback;
