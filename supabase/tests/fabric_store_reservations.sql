-- Exercise stage 3 (migration 20260924102654): online holds are respected by the
-- shop's stock guard, and web holds are atomic and never oversell.
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end.
-- It creates its OWN throwaway fabrics (new type, new colours, own IN movement),
-- so no real stock row is read for writing, locked, or changed. It never inserts
-- into income (that would consume a shop invoice number even after rollback):
-- the shop's path is exercised through stock OUT movements, which is exactly
-- what every shop sale produces through the income trigger.
--
-- Run after applying the stage 2 AND stage 3 migrations, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store reservations (…)
-- Any failure aborts with: TEST FAILED: <case>: …

begin;

create function pg_temp.expect(p_case text, p_error text, p_expected text)
returns void language plpgsql as $$
begin
  if p_error = 'NO_ERROR' then
    raise exception 'TEST FAILED: %: expected % but the statement succeeded', p_case, p_expected;
  end if;
  if position(p_expected in p_error) = 0 then
    raise exception 'TEST FAILED: %: expected % but got: %', p_case, p_expected, p_error;
  end if;
end;
$$;

create function pg_temp.expect_ok(p_case text, p_result text)
returns void language plpgsql as $$
begin
  if p_result is distinct from 'NO_ERROR' then
    raise exception 'TEST FAILED: %: expected success but got: %', p_case, p_result;
  end if;
end;
$$;

-- A throwaway fabric: one inventory item with one colour holding p_meters,
-- plus the storefront card the shop screen sells from (100.00 SAR/m, no discount).
-- The production sync creates that card by itself; if it did not (no code, no
-- image) the test creates a minimal one, so the hold always checks a real price.
create function pg_temp.make_fabric(p_label text, p_meters numeric, p_with_colour boolean default true)
returns table (item_id uuid, color_id uuid, listing_id uuid) language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار حجز ' || p_label, 'اختبار حجز المتجر ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  if p_with_colour then
    insert into public.fabric_inventory_colors (inventory_item_id, color_name)
    values (v_item, 'لون اختبار ' || p_label)
    returning id into v_color;
  end if;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار الحجز');

  if v_color is not null then
    select id into v_listing from public.fabrics where inventory_color_id = v_color;
  else
    select id into v_listing from public.fabrics
    where inventory_item_id = v_item and inventory_color_id is null;
  end if;

  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار حجز المتجر', 'https://example.invalid/fabric-store-test.jpg', 100.00,
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

-- A consistent pickup order with ONE line on the given stock unit.
-- meter: 100.00 SAR/m ; piece: 100.00 SAR/m x piece length.
create function pg_temp.make_order(p_item uuid, p_color uuid, p_listing uuid, p_mode text, p_cm integer)
returns uuid language plpgsql as $$
declare
  v_order uuid;
  v_unit bigint := case when p_mode = 'piece' then 10000::bigint * p_cm / 100 else 10000 end;
  v_net bigint := case when p_mode = 'piece' then 10000::bigint * p_cm / 100 else (10000::bigint * p_cm + 50) / 100 end;
  v_vat bigint;
begin
  v_vat := (v_net * 1500 + 5000) / 10000;
  perform set_config('fabric_store.actor_type', 'customer', true);
  insert into public.fabric_store_orders (
    access_token_hash, access_expires_at, checkout_key, request_fingerprint,
    customer_name, customer_phone, delivery_method, vat_basis_points,
    items_net_halalas, vat_halalas, total_halalas, payment_due_at,
    terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at
  ) values (
    decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'),
    now() + interval '90 days', gen_random_uuid(),
    decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'),
    'عميلة اختبار', '+966500000000', 'pickup', 1500, v_net, v_vat, v_net + v_vat,
    now() + interval '30 minutes', 't-test', 'r-test', 'p-test', now()
  ) returning id into v_order;

  insert into public.fabric_store_order_items (
    order_id, line_number, fabric_id, inventory_item_id, inventory_color_id, fabric_name, purchase_mode,
    piece_length_cm, quantity_pieces, quantity_cm, stock_consumption_cm,
    price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas
  ) values (
    v_order, 1, p_listing, p_item, p_color, 'قماش اختبار الحجز', p_mode,
    case when p_mode = 'piece' then p_cm end,
    case when p_mode = 'piece' then 1 end,
    case when p_mode = 'meter' then p_cm end,
    p_cm, 10000, 0, v_unit, v_net, v_vat, v_net + v_vat
  );
  return v_order;
end;
$$;

-- A shop-side stock OUT (what each shop sale line becomes through the income trigger).
create function pg_temp.shop_out(p_item uuid, p_color uuid, p_meters numeric)
returns text language plpgsql as $$
begin
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (p_item, p_color, 'out', p_meters, 'صرف اختبار الحجز');
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

create function pg_temp.reserve(p_order uuid)
returns text language plpgsql as $$
begin
  perform private.fabric_store_reserve_order(p_order, now() + interval '30 minutes');
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Privileges and the repaired Arabic text
-- ---------------------------------------------------------------------------
do $$
declare
  v_body text;
begin
  if not has_function_privilege('authenticated', 'private.fabric_store_stock_hold(uuid, uuid)', 'EXECUTE') then
    raise exception 'TEST FAILED: shop staff (authenticated) cannot read holds; every shop sale would fail';
  end if;
  if has_function_privilege('anon', 'private.fabric_store_stock_hold(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.fabric_store_reserve_order(uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.fabric_store_release_order_reservations(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.fabric_store_expire_reservations(integer)', 'EXECUTE')
     or has_function_privilege('anon', 'private.fabric_store_reserve_order(uuid, timestamptz)', 'EXECUTE') then
    raise exception 'TEST FAILED: a browser role can reserve, release, expire, or read holds';
  end if;
  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'TEST FAILED: authenticated lost USAGE on schema private; the shop stock guard needs it';
  end if;

  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'validate_fabric_inventory_availability';
  -- "الكمية" and "المحجوزة" as code points, so the check itself cannot be garbled in transit.
  if position(chr(1575) || chr(1604) || chr(1603) || chr(1605) || chr(1610) || chr(1577) in v_body) = 0
     or position(chr(1605) || chr(1581) || chr(1580) || chr(1608) || chr(1586) || chr(1577) in v_body) = 0 then
    raise exception 'TEST FAILED: the stock guard messages are not proper Arabic (re-apply the migration from a UTF-8 editor)';
  end if;
  if position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'TEST FAILED: the stock guard still contains garbled (mojibake) Arabic';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) A meter fabric (10 m): holds are subtracted from what the shop may sell
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_a uuid;
  v_b uuid;
  v_err text;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('متر', 10);

  v_a := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 400);
  perform pg_temp.expect_ok('first web hold', pg_temp.reserve(v_a));

  -- 10 m on the shelf, 4 m held online: the shop may sell 6 m, not 7.
  perform pg_temp.expect('shop cannot sell held metres', pg_temp.shop_out(v_item, v_color, 7), 'FABRIC_STOCK_RESERVED');
  perform pg_temp.expect_ok('shop sells the free metres', pg_temp.shop_out(v_item, v_color, 6));
  perform pg_temp.expect('nothing free is left for the shop', pg_temp.shop_out(v_item, v_color, 0.5), 'FABRIC_STOCK_RESERVED');

  -- The shop message is readable Arabic and names the numbers.
  v_err := pg_temp.shop_out(v_item, v_color, 0.5);
  if position(chr(1605) || chr(1581) || chr(1580) || chr(1608) || chr(1586) || chr(1577) in v_err) = 0
     or position('4 ' in v_err) = 0 then
    raise exception 'TEST FAILED: reserved message is not readable: %', v_err;
  end if;

  -- A second web order cannot take what is held.
  v_b := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 100);
  perform pg_temp.expect('no double hold online', pg_temp.reserve(v_b), 'FABRIC_STORE_STOCK_UNAVAILABLE');

  -- Holding twice for the same order is refused.
  perform pg_temp.expect('an order is held once', pg_temp.reserve(v_a), 'FABRIC_STORE_ALREADY_RESERVED');

  -- Releasing gives the metres back to the shop at once.
  if private.fabric_store_release_order_reservations(v_a, 'اختبار') <> 1 then
    raise exception 'TEST FAILED: release did not release the hold';
  end if;
  perform pg_temp.expect_ok('released metres are sellable', pg_temp.shop_out(v_item, v_color, 0.5));
  if private.fabric_store_release_order_reservations(v_a, 'اختبار') <> 0 then
    raise exception 'TEST FAILED: release is not idempotent';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) A whole piece (3.5 m): one online buyer, and the shop cannot cut from it
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_c uuid;
  v_d uuid;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('قطعة', 3.5);

  v_c := pg_temp.make_order(v_item, v_color, v_listing, 'piece', 350);
  perform pg_temp.expect_ok('piece hold', pg_temp.reserve(v_c));
  perform pg_temp.expect('shop cannot cut a held piece', pg_temp.shop_out(v_item, v_color, 0.5), 'FABRIC_STOCK_RESERVED');

  v_d := pg_temp.make_order(v_item, v_color, v_listing, 'piece', 350);
  perform pg_temp.expect('the same piece is never held twice', pg_temp.reserve(v_d), 'FABRIC_STORE_STOCK_UNAVAILABLE');
end $$;

-- ---------------------------------------------------------------------------
-- 3) Stock changed since the quote: the order's meaning changed, so it is refused
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_order uuid;
begin
  -- 4 m quoted "by the metre"; the shop sells 0.5 m first -> 3.5 m is now a whole piece.
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('تغير-متر', 4);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 100);
  perform pg_temp.expect_ok('shop sale before the hold', pg_temp.shop_out(v_item, v_color, 0.5));
  perform pg_temp.expect('meter order on what became a whole piece', pg_temp.reserve(v_order), 'FABRIC_STORE_STOCK_CHANGED');

  -- a 3.5 m piece quoted; the shop sells 0.5 m first -> a different (3 m) piece.
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('تغير-قطعة', 3.5);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'piece', 350);
  perform pg_temp.expect_ok('shop sale before the piece hold', pg_temp.shop_out(v_item, v_color, 0.5));
  perform pg_temp.expect('piece order on a different piece', pg_temp.reserve(v_order), 'FABRIC_STORE_STOCK_CHANGED');
end $$;

-- ---------------------------------------------------------------------------
-- 4) Expiry: an overdue hold stops counting at once; the sweep only relabels it
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_order uuid;
  v_line uuid;
  v_expired integer;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('انتهاء', 5);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 500);
  select id into v_line from public.fabric_store_order_items where order_id = v_order;

  -- An "active" hold whose time already ran out (created an hour ago for 30 minutes).
  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at, created_at)
  values (v_order, v_line, v_item, v_color, 500, now() - interval '30 minutes', now() - interval '1 hour');

  perform pg_temp.expect_ok('an overdue hold no longer blocks the shop', pg_temp.shop_out(v_item, v_color, 5));

  v_expired := private.fabric_store_expire_reservations(5000);
  if v_expired < 1 or (select status from public.fabric_store_stock_reservations where order_item_id = v_line) <> 'expired' then
    raise exception 'TEST FAILED: the sweep did not relabel the overdue hold';
  end if;
  -- ...and it never touches a hold whose time has not run out (e.g. the piece held in section 2).
  if exists (select 1 from public.fabric_store_stock_reservations where status = 'expired' and expires_at > now())
     or not exists (select 1 from public.fabric_store_stock_reservations where status = 'active' and expires_at > now()) then
    raise exception 'TEST FAILED: the sweep expired a hold that is still within its time';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Guards on the hold itself
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_order uuid;
  v_err text;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('حراسة', 5);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 100);

  begin
    perform private.fabric_store_reserve_order(v_order, now() + interval '3 hours');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('hold window is capped', v_err, 'FABRIC_STORE_HOLD_WINDOW');

  perform set_config('fabric_store.actor_type', 'system', true);
  update public.fabric_store_orders set payment_status = 'failed' where id = v_order;
  perform pg_temp.expect('a closed order is not held', pg_temp.reserve(v_order), 'FABRIC_STORE_ORDER_NOT_RESERVABLE');

  -- A fabric without colours is held by its item.
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('بلا-لون', 5, false);
  v_order := pg_temp.make_order(v_item, null, v_listing, 'meter', 300);
  perform pg_temp.expect_ok('hold on a fabric without colours', pg_temp.reserve(v_order));
  perform pg_temp.expect('shop respects holds on a fabric without colours',
    pg_temp.shop_out(v_item, null, 2.5), 'FABRIC_STOCK_RESERVED');
end $$;

-- ---------------------------------------------------------------------------
-- 6) The real shop identity: a signed-in fabric manager (authenticated + RLS)
-- ---------------------------------------------------------------------------
do $$
declare
  v_staff uuid;
  v_listing uuid;
  v_item uuid;
  v_color uuid;
  v_order uuid;
  v_err text;
begin
  select u.id into v_staff
  from public.users u
  left join public.workers w on w.user_id = u.id
  where u.is_active
    and (u.role = 'admin' or (u.role = 'worker' and w.worker_type in ('accountant', 'general_manager', 'fabric_store_manager')))
  order by u.created_at
  limit 1;
  if v_staff is null then
    raise exception 'TEST FAILED: no active fabric operator exists to impersonate';
  end if;

  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('موظف', 6);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 500);
  perform pg_temp.expect_ok('hold before the staff sale', pg_temp.reserve(v_order));

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
    values (v_item, v_color, 'out', 2, 'صرف موظف اختبار');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('signed-in staff are blocked by the hold (not by a permission error)', v_err, 'FABRIC_STOCK_RESERVED');

  begin
    insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
    values (v_item, v_color, 'out', 1, 'صرف موظف اختبار');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect_ok('signed-in staff sell the free metre', v_err);

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 7) The storefront card changed since the quote: price, discount, or visibility
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_other_item uuid;
  v_other_color uuid;
  v_other_listing uuid;
  v_manual_listing uuid;
  v_order uuid;
begin
  -- the price rose between the quote and the payment: the old price is not honoured
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('سعر', 10);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 200);
  update public.fabrics set price_per_meter = 130.00 where id = v_listing;
  perform pg_temp.expect('a raised price is not honoured', pg_temp.reserve(v_order), 'FABRIC_STORE_PRICE_CHANGED');

  -- back to the quoted price: the same order is held normally
  update public.fabrics set price_per_meter = 100.00 where id = v_listing;
  perform pg_temp.expect_ok('the quoted price still holds', pg_temp.reserve(v_order));

  -- a discount switched on after the quote also changes the line
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('خصم', 10);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 200);
  update public.fabrics set is_on_sale = true, discount_percentage = 20 where id = v_listing;
  perform pg_temp.expect('a new discount is not ignored', pg_temp.reserve(v_order), 'FABRIC_STORE_PRICE_CHANGED');

  -- a card hidden (or deleted) after the quote is no longer sellable
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('إخفاء', 10);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 200);
  update public.fabrics set is_manually_hidden = true where id = v_listing;
  perform pg_temp.expect('a hidden fabric is not sold', pg_temp.reserve(v_order), 'FABRIC_STORE_LISTING_UNAVAILABLE');

  update public.fabrics set is_manually_hidden = false, deleted_at = now() where id = v_listing;
  perform pg_temp.expect('a deleted fabric is not sold', pg_temp.reserve(v_order), 'FABRIC_STORE_LISTING_UNAVAILABLE');

  -- a line pointing at no card at all (a deleted row) is refused, not sold blind
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('بلا-بطاقة', 10);
  -- (the line is stamped with a card that no longer exists; items are append-only)
  v_order := pg_temp.make_order(v_item, v_color, gen_random_uuid(), 'meter', 200);
  perform pg_temp.expect('a line with no card is refused', pg_temp.reserve(v_order), 'FABRIC_STORE_LISTING_UNAVAILABLE');

  -- ...and a card that exists, is visible and carries the SAME price, but belongs
  -- to a different fabric: matching the price alone would let a cheap card's price
  -- be paid for expensive stock, so the card must be this stock unit's own card.
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('مخزون-أ', 10);
  select item_id, color_id, listing_id into v_other_item, v_other_color, v_other_listing
  from pg_temp.make_fabric('مخزون-ب', 10);
  v_order := pg_temp.make_order(v_item, v_color, v_other_listing, 'meter', 200);
  perform pg_temp.expect('another fabric''s card is refused', pg_temp.reserve(v_order),
                         'FABRIC_STORE_LISTING_MISMATCH');

  -- the same fabric's own card still passes (the check is a match, not a ban)
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 200);
  perform pg_temp.expect_ok('the fabric''s own card still holds', pg_temp.reserve(v_order));

  -- a storefront card created by hand, with no stock behind it, cannot be held
  insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                              is_available, is_active)
  values ('اختبار حجز المتجر', 'https://example.invalid/fabric-store-test.jpg', 100.00, 10, 1, true, true)
  returning id into v_manual_listing;
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('بطاقة-يدوية', 10);
  v_order := pg_temp.make_order(v_item, v_color, v_manual_listing, 'meter', 200);
  perform pg_temp.expect('a card with no stock behind it is refused', pg_temp.reserve(v_order),
                         'FABRIC_STORE_LISTING_MISMATCH');
end $$;

-- ---------------------------------------------------------------------------
-- 8) Held stock cannot be deleted from the inventory screen
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_order uuid;
  v_err text;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('حذف-لون', 8);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 300);
  perform pg_temp.expect_ok('hold before the delete', pg_temp.reserve(v_order));

  begin
    delete from public.fabric_inventory_colors where id = v_color;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a held colour is not deleted', v_err, 'FABRIC_STOCK_RESERVED_DELETE');
  -- the message names the fabric and the hour the hold ends
  if position(chr(1605) || chr(1581) || chr(1580) || chr(1608) || chr(1586) || chr(1577) in v_err) = 0
     or v_err !~ '[0-9]{2}:[0-9]{2}' then
    raise exception 'TEST FAILED: the delete refusal is not readable: %', v_err;
  end if;

  -- deleting the whole item would take the held colour with it (cascade)
  begin
    delete from public.fabric_inventory where id = v_item;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a held item is not deleted', v_err, 'FABRIC_STOCK_RESERVED_DELETE');

  -- once the hold is released, the same delete works
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار الحذف');
  begin
    delete from public.fabric_inventory_colors where id = v_color;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect_ok('a released colour is deleted normally', v_err);

  -- an expired hold does not block a delete either
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('حذف-منتهٍ', 8);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 300);
  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at, created_at)
  select v_order, id, v_item, v_color, 300, now() - interval '10 minutes', now() - interval '40 minutes'
  from public.fabric_store_order_items where order_id = v_order;
  begin
    delete from public.fabric_inventory_colors where id = v_color;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect_ok('an overdue hold does not block a delete', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- 9) A paid order's hold is never released behind the customer's back
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_order uuid;
  v_attempt uuid;
  v_err text;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('مدفوع', 8);
  v_order := pg_temp.make_order(v_item, v_color, v_listing, 'meter', 300);
  perform pg_temp.expect_ok('hold before the payment', pg_temp.reserve(v_order));

  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_release'
  where id = v_attempt;
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;

  begin
    perform private.fabric_store_release_order_reservations(v_order, 'تحرير خاطئ');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a paid order keeps its hold', v_err, 'FABRIC_STORE_RELEASE_PAID');

  -- ...and the row itself cannot be flipped to released by hand either
  begin
    update public.fabric_store_stock_reservations set status = 'released' where order_id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a paid hold is not released by hand', v_err, 'FABRIC_STORE_RESERVATION_PAID_ORDER');

  -- consuming it (the sale) is the way out, and it still works
  update public.fabric_store_stock_reservations set status = 'consumed' where order_id = v_order;
  if exists (select 1 from public.fabric_store_stock_reservations
             where order_id = v_order and status <> 'consumed') then
    raise exception 'TEST FAILED: a paid hold could not be consumed by the sale';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10) Reading the holds is limited to the people who may touch stock
-- ---------------------------------------------------------------------------
do $$
declare
  v_other uuid;
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_err text;
begin
  select u.id into v_other
  from public.users u
  left join public.workers w on w.user_id = u.id
  where u.is_active
    and u.role <> 'admin'
    and (w.worker_type is null or w.worker_type not in ('accountant', 'general_manager', 'fabric_store_manager'))
  order by u.created_at
  limit 1;

  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('قراءة', 5);

  if v_other is null then
    raise notice 'skipped: no signed-in non-operator exists to impersonate';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform private.fabric_store_stock_hold(v_item, v_color);
      v_err := 'NO_ERROR';
    exception when others then v_err := sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.expect('a signed-in non-operator cannot read the holds', v_err, 'FABRIC_STORE_HOLD_FORBIDDEN');
  end if;

  -- a browser session whose JWT carries no user id is NOT a server session:
  -- the decision is the session ROLE, not whether auth.uid() happens to be set.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform private.fabric_store_stock_hold(v_item, v_color);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.expect('a JWT without a user id cannot read the holds', v_err, 'FABRIC_STORE_HOLD_FORBIDDEN');

  -- the visitor role has no execute right on it at all
  set local role anon;
  begin
    perform private.fabric_store_stock_hold(v_item, v_color);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  reset role;
  perform pg_temp.expect('anon cannot read the holds', v_err, 'permission denied for function');

  -- the server's own path (no signed-in user) still reads them
  begin
    perform private.fabric_store_stock_hold(v_item, v_color);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect_ok('the server path still reads the holds', v_err);

  -- ...and service_role CANNOT call the hold functions itself: it has no USAGE on
  -- schema private, and SECURITY DEFINER does not change that (it changes whose
  -- privileges the body runs with, not the right to reach the schema). Stage 4's
  -- entry point must therefore be a SECURITY DEFINER function in `public` granted
  -- to service_role, which calls these. Pinned here so stage 4 cannot forget it.
  set local role service_role;
  begin
    perform private.fabric_store_reserve_order(gen_random_uuid(), now() + interval '30 minutes');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  reset role;
  perform pg_temp.expect('service_role cannot reserve directly', v_err, 'permission denied for schema private');
end $$;

select 'PASS fabric_store reservations (privileges, Arabic text, meter holds, whole piece, stock changed, expiry, guards, signed-in staff, live card, card belongs to the stock, held-stock deletes, paid holds, hold reads by role)' as result;

rollback;
