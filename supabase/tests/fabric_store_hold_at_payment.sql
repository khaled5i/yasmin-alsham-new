-- Exercise fix batch B / AUD-02 (migration 20261003120000): creating an order holds no stock
-- (it still validates the card, the price and what is free), the hold starts at «ادفعي» for
-- 25 minutes with the Moyasar page always shorter, an order has at most 5 lines, and the
-- stock held at once is capped per phone, per sender (IP fingerprint) and for the whole store.
--
-- SAFE ON THE LIVE DATABASE: its own throwaway fabrics and orders, called AS service_role like
-- the Next.js routes; never inserts into income (checked at the end, with the invoice sequence).
-- ONE transaction, ROLLED BACK. No temporary tables. While it runs it holds the store-wide cap
-- lock, so a real «ادفعي» in those seconds waits for it (no error).
-- The store-wide cap cases need nothing else held on the store; with real holds present they
-- are skipped with a notice (the per-phone and per-sender cases still run).
-- Run AFTER applying 20261003120000, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store hold at payment (…)
-- Before the migration it fails at case 1 (the order holds its stock).

begin;

select set_config('fabric_store_test.income_before',
  (select count(*) from public.income)::text || '#'
  || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq), false);

create function pg_temp.expect(p_case text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'TEST FAILED: %: expected % but got %', p_case, p_want, p_got;
  end if;
end;
$$;

create function pg_temp.hex(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;
create function pg_temp.h(p text) returns bytea language sql immutable as $$
  select sha256(convert_to(p, 'UTF8'))
$$;

-- one colour with p_meters in stock and its storefront card (100.00 SAR/m)
create function pg_temp.make_fabric(p_label text, p_meters numeric)
returns table (item_id uuid, color_id uuid, listing_id uuid) language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار الحجز عند الدفع ' || p_label, 'اختبار الحجز عند الدفع ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار الحجز عند الدفع');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار الحجز عند الدفع', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            greatest(p_meters, 0), 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0
    where id = v_listing;
  end if;
  return query select v_item, v_color, v_listing;
end;
$$;

-- An order through the stage 4 entry point. p_lines: [{"listing": uuid, "mode": "piece"|"meter", "cm": n}].
-- Nets are whole riyals, so the 15% VAT splits exactly per line.
create function pg_temp.checkout(p_access text, p_phone text, p_lines jsonb, p_price_halalas bigint default 10000)
returns jsonb language plpgsql as $$
declare
  v_key uuid := gen_random_uuid();
  v_items jsonb := '[]'::jsonb;
  v_line jsonb;
  v_net bigint;
  v_total_net bigint := 0;
  v_res jsonb;
begin
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_net := p_price_halalas * (v_line ->> 'cm')::bigint / 100;
    v_total_net := v_total_net + v_net;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'fabric_id', v_line ->> 'listing', 'purchase_mode', v_line ->> 'mode',
      'piece_length_cm', case when v_line ->> 'mode' = 'piece' then (v_line ->> 'cm')::integer end,
      'quantity_cm', case when v_line ->> 'mode' = 'meter' then (v_line ->> 'cm')::integer end,
      'price_per_meter_halalas', p_price_halalas, 'discount_basis_points', 0,
      'unit_price_halalas', case when v_line ->> 'mode' = 'piece' then v_net else p_price_halalas end,
      'net_halalas', v_net, 'vat_halalas', v_net * 15 / 100));
  end loop;
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('hold-at-payment-creator-' || p_access),
    'customer', jsonb_build_object('name', 'عميلة اختبار', 'phone', p_phone),
    'delivery', jsonb_build_object('method', 'pickup', 'shipping_net_halalas', 0, 'shipping_vat_halalas', 0),
    'totals', jsonb_build_object('items_net_halalas', v_total_net, 'vat_halalas', v_total_net * 15 / 100,
                                 'total_halalas', v_total_net + v_total_net * 15 / 100),
    'policies', jsonb_build_object('terms', 't', 'returns', 'r', 'privacy', 'p'),
    'items', v_items));
  reset role;
  return v_res;
exception when others then
  reset role;
  raise;
end;
$$;

create function pg_temp.pay(p_access text, p_payer text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_begin_payment(pg_temp.h(p_access), 'test', pg_temp.h(p_payer));
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.held_cm(p_color uuid) returns bigint language sql as $$
  select hold.reserved_cm from private.fabric_store_stock_hold(
    (select c.inventory_item_id from public.fabric_inventory_colors c where c.id = p_color), p_color) hold
$$;

create function pg_temp.lines(p_spec text) returns jsonb language plpgsql as $$
-- p_spec: 'piece:N' (N whole 3.5 m pieces, each its own fabric) or 'meter:CM' (one fabric, 30 m in stock)
declare
  v_out jsonb := '[]'::jsonb;
  v_f record;
  v_kind text := split_part(p_spec, ':', 1);
  v_n integer := split_part(p_spec, ':', 2)::integer;
begin
  if v_kind = 'piece' then
    for i in 1 .. v_n loop
      select * into v_f from pg_temp.make_fabric('قطعة-' || gen_random_uuid(), 3.5);
      v_out := v_out || jsonb_build_array(jsonb_build_object('listing', v_f.listing_id, 'mode', 'piece', 'cm', 350));
    end loop;
  else
    select * into v_f from pg_temp.make_fabric('متر-' || gen_random_uuid(), 30);
    v_out := jsonb_build_array(jsonb_build_object('listing', v_f.listing_id, 'mode', 'meter', 'cm', v_n));
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) creating an order holds nothing; «ادفعي» holds it for 25 minutes; the page is shorter
-- ---------------------------------------------------------------------------
do $$
declare
  v_f record;
  v_res jsonb;
  v_order uuid;
  v_pay jsonb;
  v_hold timestamptz;
begin
  select * into v_f from pg_temp.make_fabric('أساس', 10);
  v_res := pg_temp.checkout('hap-base', '+966561000001',
    jsonb_build_array(jsonb_build_object('listing', v_f.listing_id, 'mode', 'meter', 'cm', 200)));
  perform pg_temp.expect('a valid order is created', v_res ->> 'status', 'created');
  v_order := (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('creating the order reserves nothing',
    (select count(*) from public.fabric_store_stock_reservations where order_id = v_order)::text, '0');
  perform pg_temp.expect('the shop screen sees nothing held after the order', pg_temp.held_cm(v_f.color_id)::text, '0');
  perform pg_temp.expect('the order has 30 minutes to start paying',
    ((select payment_due_at from public.fabric_store_orders where id = v_order)
      between now() + interval '29 minutes' and now() + interval '31 minutes')::text, 'true');

  v_pay := pg_temp.pay('hap-base', 'hap-payer-base');
  perform pg_temp.expect('«ادفعي» opens an attempt', v_pay ->> 'status', 'created');
  select min(expires_at) into v_hold from public.fabric_store_stock_reservations where order_id = v_order and status = 'active';
  perform pg_temp.expect('«ادفعي» holds every line',
    (select count(*) from public.fabric_store_stock_reservations where order_id = v_order and status = 'active')::text, '1');
  perform pg_temp.expect('the hold lasts 25 minutes',
    (v_hold between clock_timestamp() + interval '24 minutes' and clock_timestamp() + interval '26 minutes')::text, 'true');
  perform pg_temp.expect('the payment page ends at least 2 minutes before the hold',
    ((v_pay ->> 'expires_at')::timestamptz <= v_hold - interval '2 minutes')::text, 'true');
  perform pg_temp.expect('the shop screen now sees the 2 m held', pg_temp.held_cm(v_f.color_id)::text, '200');
  perform pg_temp.expect('the sender of «ادفعي» is recorded',
    ((select client_hash from private.fabric_store_hold_clients where order_id = v_order) = pg_temp.h('hap-payer-base'))::text, 'true');
  -- pressing again: the same page, no second hold
  v_pay := pg_temp.pay('hap-base', 'hap-payer-base');
  perform pg_temp.expect('pressing again while the start runs', v_pay ->> 'status', 'in_progress');
  perform pg_temp.expect('still one hold row',
    (select count(*) from public.fabric_store_stock_reservations where order_id = v_order)::text, '1');
end $$;

-- ---------------------------------------------------------------------------
-- 2) the order is still validated at creation; and again at «ادفعي»
-- ---------------------------------------------------------------------------
do $$
declare
  v_f record;
  v_res jsonb;
  v_order uuid;
  v_pay jsonb;
begin
  -- six lines: refused, nothing created
  v_res := pg_temp.checkout('hap-six', '+966561000002', pg_temp.lines('piece:6'));
  perform pg_temp.expect('a six-line order', (v_res ->> 'status') || '/' || coalesce(v_res ->> 'code', ''),
    'rejected/FABRIC_STORE_TOO_MANY_LINES');
  perform pg_temp.expect('the refused order left nothing',
    (select count(*) from public.fabric_store_orders where access_token_hash = pg_temp.h('hap-six'))::text, '0');
  -- five lines: fine
  v_res := pg_temp.checkout('hap-five', '+966561000003', pg_temp.lines('piece:5'));
  perform pg_temp.expect('a five-line order', v_res ->> 'status', 'created');

  -- a price the card no longer has: refused at creation (the reservation dry run still checks)
  select * into v_f from pg_temp.make_fabric('سعر', 10);
  v_res := pg_temp.checkout('hap-price', '+966561000004',
    jsonb_build_array(jsonb_build_object('listing', v_f.listing_id, 'mode', 'meter', 'cm', 100)), 9000);
  perform pg_temp.expect('a stale price at creation', (v_res ->> 'status') || '/' || coalesce(v_res ->> 'code', ''),
    'rejected/FABRIC_STORE_PRICE_CHANGED');
  -- more than is free: refused at creation
  v_res := pg_temp.checkout('hap-much', '+966561000005',
    jsonb_build_array(jsonb_build_object('listing', v_f.listing_id, 'mode', 'meter', 'cm', 1100)));
  perform pg_temp.expect('more than the stock at creation', (v_res ->> 'status') || '/' || coalesce(v_res ->> 'code', ''),
    'rejected/FABRIC_STORE_STOCK_UNAVAILABLE');
  perform pg_temp.expect('the dry runs left no hold behind', pg_temp.held_cm(v_f.color_id)::text, '0');

  -- the price changes between the order and «ادفعي»: no hold, no attempt
  v_res := pg_temp.checkout('hap-later', '+966561000006',
    jsonb_build_array(jsonb_build_object('listing', v_f.listing_id, 'mode', 'meter', 'cm', 100)));
  perform pg_temp.expect('the order before the price change', v_res ->> 'status', 'created');
  v_order := (v_res ->> 'order_id')::uuid;
  update public.fabrics set price_per_meter = 120.00 where id = v_f.listing_id;
  v_pay := pg_temp.pay('hap-later', 'hap-payer-later');
  perform pg_temp.expect('«ادفعي» after a price change', (v_pay ->> 'status') || '/' || coalesce(v_pay ->> 'code', ''),
    'rejected/FABRIC_STORE_PRICE_CHANGED');
  perform pg_temp.expect('no hold and no attempt after the refusal',
    (select count(*) from public.fabric_store_stock_reservations where order_id = v_order)::text || '/'
    || (select count(*) from public.fabric_store_payment_attempts where order_id = v_order)::text, '0/0');
end $$;

-- ---------------------------------------------------------------------------
-- 3) caps per sender and per phone: 5 whole pieces and 20 m held at once
-- ---------------------------------------------------------------------------
do $$
declare
  v_pay jsonb;
begin
  -- one sender, five one-piece orders (each from its own phone): the sixth piece is refused
  for i in 1 .. 5 loop
    perform pg_temp.expect('one-piece order ' || i,
      pg_temp.checkout('hap-ip-' || i, '+96656200000' || i, pg_temp.lines('piece:1')) ->> 'status', 'created');
    perform pg_temp.expect('one sender holds piece ' || i, pg_temp.pay('hap-ip-' || i, 'hap-one-sender') ->> 'status', 'created');
  end loop;
  perform pg_temp.expect('one-piece order 6',
    pg_temp.checkout('hap-ip-6', '+966562000006', pg_temp.lines('piece:1')) ->> 'status', 'created');
  v_pay := pg_temp.pay('hap-ip-6', 'hap-one-sender');
  perform pg_temp.expect('the same sender holds a sixth piece', (v_pay ->> 'status') || '/' || coalesce(v_pay ->> 'scope', ''), 'hold_limit/client');
  perform pg_temp.expect('the refused order holds nothing',
    (select count(*) from public.fabric_store_stock_reservations r join public.fabric_store_orders o on o.id = r.order_id
     where o.access_token_hash = pg_temp.h('hap-ip-6'))::text, '0');
  -- another sender is not affected by that sender's holds
  perform pg_temp.expect('another sender for the sixth order', pg_temp.pay('hap-ip-6', 'hap-other-sender') ->> 'status', 'created');

  -- one phone: 3 + 2 pieces held (two senders), then one more piece is refused
  perform pg_temp.checkout('hap-ph-a', '+966563000001', pg_temp.lines('piece:3'));
  perform pg_temp.checkout('hap-ph-b', '+966563000001', pg_temp.lines('piece:2'));
  perform pg_temp.checkout('hap-ph-c', '+966563000001', pg_temp.lines('piece:1'));
  perform pg_temp.expect('the phone holds 3 pieces', pg_temp.pay('hap-ph-a', 'hap-ph-sender-a') ->> 'status', 'created');
  perform pg_temp.expect('the phone holds 2 more', pg_temp.pay('hap-ph-b', 'hap-ph-sender-b') ->> 'status', 'created');
  v_pay := pg_temp.pay('hap-ph-c', 'hap-ph-sender-c');
  perform pg_temp.expect('the same phone holds a sixth piece', (v_pay ->> 'status') || '/' || coalesce(v_pay ->> 'scope', ''), 'hold_limit/phone');

  -- metres: 15 m then 6 m from one sender is over 20 m; 5 m is exactly 20 m
  perform pg_temp.checkout('hap-m-a', '+966564000001', pg_temp.lines('meter:1500'));
  perform pg_temp.checkout('hap-m-b', '+966564000002', pg_temp.lines('meter:600'));
  perform pg_temp.checkout('hap-m-c', '+966564000003', pg_temp.lines('meter:500'));
  perform pg_temp.expect('15 m held', pg_temp.pay('hap-m-a', 'hap-metre-sender') ->> 'status', 'created');
  v_pay := pg_temp.pay('hap-m-b', 'hap-metre-sender');
  perform pg_temp.expect('15 m + 6 m from one sender', (v_pay ->> 'status') || '/' || coalesce(v_pay ->> 'scope', ''), 'hold_limit/client');
  perform pg_temp.expect('15 m + 5 m from one sender (exactly 20 m)', pg_temp.pay('hap-m-c', 'hap-metre-sender') ->> 'status', 'created');
end $$;

-- ---------------------------------------------------------------------------
-- 4) the whole store: 20 whole pieces and 100 m held at once
-- ---------------------------------------------------------------------------
do $$
declare
  v_pieces bigint;
  v_cm bigint;
  v_pay jsonb;
begin
  -- what this test holds so far is part of the store total; anything else would be real customers
  select count(*) filter (where i.purchase_mode = 'piece'),
         coalesce(sum(r.quantity_cm) filter (where i.purchase_mode = 'meter'), 0)
  into v_pieces, v_cm
  from public.fabric_store_stock_reservations r
  join public.fabric_store_order_items i on i.id = r.order_item_id
  join public.fabric_store_orders o on o.id = r.order_id
  where r.status = 'active' and r.expires_at > clock_timestamp()
    and o.access_token_hash not in (select pg_temp.h(x) from unnest(array['hap-base', 'hap-ip-1', 'hap-ip-2', 'hap-ip-3',
      'hap-ip-4', 'hap-ip-5', 'hap-ip-6', 'hap-ph-a', 'hap-ph-b', 'hap-m-a', 'hap-m-c']) x);
  if v_pieces > 0 or v_cm > 0 then
    raise notice 'skipped: real holds exist on the store now (% pieces, % cm); the store cap cases need none', v_pieces, v_cm;
    return;
  end if;

  -- held by this test: 6 (ip) + 5 (phone) = 11 pieces. Nine more, from new phones and senders.
  perform pg_temp.checkout('hap-st-a', '+966565000001', pg_temp.lines('piece:5'));
  perform pg_temp.checkout('hap-st-b', '+966565000002', pg_temp.lines('piece:4'));
  perform pg_temp.checkout('hap-st-c', '+966565000003', pg_temp.lines('piece:1'));
  perform pg_temp.expect('store at 16 pieces', pg_temp.pay('hap-st-a', 'hap-st-sender-a') ->> 'status', 'created');
  perform pg_temp.expect('store at 20 pieces', pg_temp.pay('hap-st-b', 'hap-st-sender-b') ->> 'status', 'created');
  v_pay := pg_temp.pay('hap-st-c', 'hap-st-sender-c');
  perform pg_temp.expect('a 21st piece on the store', (v_pay ->> 'status') || '/' || coalesce(v_pay ->> 'scope', ''), 'hold_limit/store');

  -- metres: this test holds 2 + 15 + 5 = 22 m. 20 m × 3 + 18 m = 100 m; then 1 m more is refused.
  perform pg_temp.checkout('hap-sm-1', '+966566000001', pg_temp.lines('meter:2000'));
  perform pg_temp.checkout('hap-sm-2', '+966566000002', pg_temp.lines('meter:2000'));
  perform pg_temp.checkout('hap-sm-3', '+966566000003', pg_temp.lines('meter:2000'));
  perform pg_temp.checkout('hap-sm-4', '+966566000004', pg_temp.lines('meter:1800'));
  perform pg_temp.checkout('hap-sm-5', '+966566000005', pg_temp.lines('meter:100'));
  for i in 1 .. 4 loop
    perform pg_temp.expect('store metres order ' || i, pg_temp.pay('hap-sm-' || i, 'hap-sm-sender-' || i) ->> 'status', 'created');
  end loop;
  v_pay := pg_temp.pay('hap-sm-5', 'hap-sm-sender-5');
  perform pg_temp.expect('one metre over 100 m on the store', (v_pay ->> 'status') || '/' || coalesce(v_pay ->> 'scope', ''), 'hold_limit/store');
end $$;

-- ---------------------------------------------------------------------------
-- 5) privileges
-- ---------------------------------------------------------------------------
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    perform pg_temp.expect(v_role || ' reads hold_clients',
      has_table_privilege(v_role, 'private.fabric_store_hold_clients', 'SELECT')::text, 'false');
  end loop;
  perform pg_temp.expect('anon runs create_checkout', has_function_privilege('anon', 'public.fabric_store_create_checkout(jsonb)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('authenticated runs begin_payment', has_function_privilege('authenticated', 'public.fabric_store_begin_payment(bytea, text, bytea)', 'EXECUTE')::text, 'false');
  perform pg_temp.expect('service_role runs begin_payment', has_function_privilege('service_role', 'public.fabric_store_begin_payment(bytea, text, bytea)', 'EXECUTE')::text, 'true');
end $$;

-- ---------------------------------------------------------------------------
-- 6) the shop was not touched: no income row, no invoice number used
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.income)::text || '#'
     || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq)
     is distinct from current_setting('fabric_store_test.income_before', true) then
    raise exception 'TEST FAILED: this test must not create a sale nor use an invoice number';
  end if;
end $$;

select 'PASS fabric_store hold at payment (no hold at order creation but full validation, ≤ 5 lines, «ادفعي» holds 25 min with a shorter page, re-validated at «ادفعي», 5 pieces / 20 m per sender and per phone, 20 pieces / 100 m for the store, hold_clients unreachable, no income row and no invoice number used)' as result;

rollback;
