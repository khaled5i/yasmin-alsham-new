-- LOCAL REPLICA ONLY — never run this on Supabase: it creates income rows, which
-- consumes numbers from the shop's invoice sequence even inside a rolled-back
-- transaction. The live-safe checks are in supabase/tests/fabric_store_confirm_sale.sql.
--
-- Stage 6, the full path: a paid (live) order becomes ONE fabric sale in income, the
-- stock goes down through the shop's own trigger chain, the hold is consumed, the
-- alostaz task is queued — all called AS service_role, like the Next.js jobs.
-- Success = the last result row reads: PASS stage 6 local sale (…)

begin;

create function pg_temp.expect_status(p_case text, p_result jsonb, p_status text)
returns void language plpgsql as $$
begin
  if p_result ->> 'status' is distinct from p_status then
    raise exception 'TEST FAILED: %: expected status % but got: %', p_case, p_status, p_result;
  end if;
end;
$$;

create function pg_temp.hex(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;
create function pg_temp.h(p text) returns bytea language sql immutable as $$
  select sha256(convert_to(p, 'UTF8'))
$$;

create function pg_temp.make_fabric(p_label text, p_meters numeric)
returns table (item_id uuid, color_id uuid, listing_id uuid) language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images, base_fabric_code)
  values ('قماش ' || p_label, 'قماش ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'], 'SS-' || p_label)
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name, fabric_code)
  values (v_item, 'لون ' || p_label, 'SS-' || p_label || '-1')
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0, name = 'بطاقة ' || p_label
  where id = v_listing;
  return query select v_item, v_color, v_listing;
end;
$$;

-- One checkout through the stage 4 entry point. p_lines: [{listing, mode, cm, net, vat}], all at 100.00 SAR/m.
create function pg_temp.checkout(p_access text, p_phone text, p_lines jsonb, p_net bigint, p_vat bigint,
                                 p_ship bigint default 0, p_ship_vat bigint default 0) returns uuid
language plpgsql as $$
declare
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('local-client-' || p_access),
    'customer', jsonb_build_object('name', 'عميلة ' || p_access, 'phone', p_phone),
    'delivery', case when p_ship > 0
      then jsonb_build_object('method', 'shipping', 'option_code', 'ksa_flat', 'option_label', 'شحن داخل السعودية',
                              'shipping_net_halalas', p_ship, 'shipping_vat_halalas', p_ship_vat)
      else jsonb_build_object('method', 'pickup', 'shipping_net_halalas', 0, 'shipping_vat_halalas', 0) end,
    'address', case when p_ship > 0 then jsonb_build_object(
      'recipient_name', 'عميلة', 'recipient_phone', p_phone, 'city', 'الرياض', 'short_address', 'RRRD2929') end,
    'totals', jsonb_build_object('items_net_halalas', p_net, 'vat_halalas', p_vat, 'total_halalas', p_net + p_ship + p_vat),
    'policies', jsonb_build_object('terms', 't', 'returns', 'r', 'privacy', 'p'),
    'items', (select jsonb_agg(jsonb_build_object(
        'fabric_id', l ->> 'listing', 'purchase_mode', l ->> 'mode',
        'piece_length_cm', case when l ->> 'mode' = 'piece' then (l ->> 'cm')::int end,
        'quantity_cm', case when l ->> 'mode' = 'meter' then (l ->> 'cm')::int end,
        'price_per_meter_halalas', 10000, 'discount_basis_points', 0,
        'unit_price_halalas', case when l ->> 'mode' = 'piece' then (l ->> 'cm')::bigint * 100 else 10000 end,
        'net_halalas', (l ->> 'net')::bigint, 'vat_halalas', (l ->> 'vat')::bigint))
      from jsonb_array_elements(p_lines) l)));
  reset role;
  if v_res ->> 'status' <> 'created' then
    raise exception 'TEST FAILED: fixture checkout %: %', p_access, v_res;
  end if;
  return (v_res ->> 'order_id')::uuid;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.simple_order(p_access text, p_phone text, p_listing uuid, p_cm integer default 100) returns uuid
language sql as $$
  select pg_temp.checkout(p_access, p_phone,
    jsonb_build_array(jsonb_build_object('listing', p_listing, 'mode', 'meter', 'cm', p_cm,
                                         'net', p_cm * 100, 'vat', (p_cm * 100 * 1500 + 5000) / 10000)),
    p_cm * 100, (p_cm * 100 * 1500 + 5000) / 10000)
$$;

create function pg_temp.start(p_access text) returns void language plpgsql as $$
declare
  v_begin jsonb;
begin
  set local role service_role;
  v_begin := public.fabric_store_begin_payment(pg_temp.h(p_access), 'live', pg_temp.h('payer-' || p_access));
  if v_begin ->> 'status' <> 'created' then
    raise exception 'TEST FAILED: fixture payment start for %: %', p_access, v_begin;
  end if;
  perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-' || p_access,
                                             'https://checkout.moyasar.com/invoices/inv-' || p_access);
  reset role;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.apply(p_access text) returns jsonb language plpgsql as $$
declare
  v jsonb;
  v_amount bigint;
begin
  select o.total_halalas into v_amount from public.fabric_store_orders o where o.access_token_hash = pg_temp.h(p_access);
  set local role service_role;
  v := public.fabric_store_apply_payment(null, 'live', jsonb_build_object(
         'id', 'pay-' || p_access, 'status', 'paid', 'amount', v_amount, 'currency', 'SAR',
         'invoice_id', 'inv-' || p_access), null);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.confirm(p_order uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_confirm_order(p_order);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) The normal case: paid within the hold → one sale, stock down, hold consumed
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid; v_color uuid; v_listing uuid;
  v_order uuid;
  v_res jsonb;
  v_income record;
  v_seq_before bigint;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('A1', 10);
  v_order := pg_temp.simple_order('local-a1', '+966560000201', v_listing);
  perform pg_temp.start('local-a1');
  perform pg_temp.expect_status('pay', pg_temp.apply('local-a1'), 'paid');
  -- the number the next nextval() will return (a sequence never used yet returns last_value itself)
  select case when is_called then last_value + 1 else last_value end into v_seq_before
  from public.fabrics_invoice_number_seq;

  v_res := pg_temp.confirm(v_order);
  perform pg_temp.expect_status('confirm', v_res, 'confirmed');

  select * into v_income from public.income where id = (v_res ->> 'income_id')::uuid;
  if v_income.branch <> 'fabrics' or v_income.category <> 'fabric_sale' or v_income.amount <> 115.00
     or v_income.payment_method <> 'network' or v_income.customer_source <> 'المتجر الإلكتروني'
     or not v_income.is_automatic or v_income.buyer_phone <> '0560000201' or v_income.buyer_name <> 'عميلة local-a1'
     or v_income.customer_name <> 'قماش A1' or v_income.quantity_meters <> 1.00
     or v_income.invoice_number <> (v_res ->> 'invoice_number')::bigint
     or v_income.invoice_number <> v_seq_before
     or v_income.description not like 'طلب المتجر الإلكتروني FS-%'
     or v_income.notes is not null
     or not v_income.fabric_inventory_tracked
     or v_income.date <> (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'TEST FAILED: the sale row: %', row_to_json(v_income);
  end if;
  if v_income.fabric_items <> jsonb_build_array(jsonb_build_object(
       'inventory_id', v_item, 'inventory_color_id', v_color, 'fabric_code', 'SS-A1-1',
       'name', 'قماش A1', 'quantity_meters', 1)) then
    raise exception 'TEST FAILED: fabric_items must use the shop''s shape: %', v_income.fabric_items;
  end if;

  if (select current_quantity from public.fabric_inventory_colors where id = v_color) <> 9
     or (select count(*) from public.fabric_inventory_movements where sale_income_id = v_income.id) <> 1
     or (select quantity from public.fabric_inventory_movements where sale_income_id = v_income.id) <> 1
     or (select stock_quantity from public.fabrics where id = v_listing) <> 9 then
    raise exception 'TEST FAILED: the stock must go down once, through the shop''s trigger chain';
  end if;
  if exists (select 1 from public.fabric_store_stock_reservations where order_id = v_order and status <> 'consumed')
     or (select income_id from public.fabric_store_orders where id = v_order) <> v_income.id
     or (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: the hold must be consumed and the order linked, not flagged';
  end if;
  if (select status || ':' || (payload ->> 'result') from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) <> 'done:confirmed'
     or (select payload ->> 'income_id' from public.fabric_store_outbox
         where dedupe_key = 'alostaz_invoice:' || v_order and topic = 'alostaz_invoice' and status = 'pending')
        is distinct from v_income.id::text then
    raise exception 'TEST FAILED: the confirm task closes and one alostaz task is queued';
  end if;

  -- again: nothing new
  perform pg_temp.expect_status('confirm again', pg_temp.confirm(v_order), 'already_confirmed');
  if (select count(*) from public.income where description like '%' || (select order_number from public.fabric_store_orders where id = v_order) || '%') <> 1
     or (select current_quantity from public.fabric_inventory_colors where id = v_color) <> 9
     or (select count(*) from public.fabric_store_outbox where order_id = v_order and topic = 'alostaz_invoice') <> 1 then
    raise exception 'TEST FAILED: a repeated confirmation must change nothing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Two lines (a whole 3.5 m piece + 1.5 m) with shipping: one sale for the total
-- ---------------------------------------------------------------------------
do $$
declare
  v_p record; v_m record;
  v_order uuid;
  v_res jsonb;
  v_income record;
begin
  select * into v_p from pg_temp.make_fabric('P1', 3.5);
  select * into v_m from pg_temp.make_fabric('M1', 10);
  -- items 350.00 + 150.00 = 500.00, shipping 50.00 → VAT 82.50 = 52.50 + 22.50 + 7.50 → total 632.50
  v_order := pg_temp.checkout('local-two', '+966560000202', jsonb_build_array(
    jsonb_build_object('listing', v_p.listing_id, 'mode', 'piece', 'cm', 350, 'net', 35000, 'vat', 5250),
    jsonb_build_object('listing', v_m.listing_id, 'mode', 'meter', 'cm', 150, 'net', 15000, 'vat', 2250)),
    50000, 8250, 5000, 750);
  perform pg_temp.start('local-two');
  perform pg_temp.expect_status('pay', pg_temp.apply('local-two'), 'paid');
  v_res := pg_temp.confirm(v_order);
  perform pg_temp.expect_status('confirm two lines', v_res, 'confirmed');

  select * into v_income from public.income where id = (v_res ->> 'income_id')::uuid;
  if v_income.amount <> 632.50 or v_income.quantity_meters <> 5.00
     or v_income.notes <> 'يشمل رسوم الشحن 57.5 ريال مع الضريبة'
     or jsonb_array_length(v_income.fabric_items) <> 2
     or (v_income.fabric_items -> 0 ->> 'quantity_meters')::numeric <> 3.5
     or (v_income.fabric_items -> 1 ->> 'quantity_meters')::numeric <> 1.5
     or v_income.customer_name <> 'قماش P1'
     or v_income.description not like '%قماش P1، قماش M1' then
    raise exception 'TEST FAILED: the two-line sale: %', row_to_json(v_income);
  end if;
  if (select current_quantity from public.fabric_inventory_colors where id = v_p.color_id) <> 0
     or (select current_quantity from public.fabric_inventory_colors where id = v_m.color_id) <> 8.5 then
    raise exception 'TEST FAILED: both stocks must go down';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Paid after the hold ended, fabric still there → sold, and the review flag lifts
-- ---------------------------------------------------------------------------
do $$
declare
  v_f record;
  v_order uuid;
  v_row record;
begin
  select * into v_f from pg_temp.make_fabric('LATE', 10);
  v_order := pg_temp.simple_order('local-late', '+966560000203', v_f.listing_id);
  perform pg_temp.start('local-late');
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار: انتهت المهلة');
  perform pg_temp.expect_status('late payment', pg_temp.apply('local-late'), 'paid');
  if not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: fixture — the late payment must be flagged by the stage 2 guard';
  end if;

  perform pg_temp.expect_status('confirm late payment', pg_temp.confirm(v_order), 'confirmed');
  select o.needs_review, o.review_reason, o.income_id into v_row from public.fabric_store_orders o where o.id = v_order;
  if v_row.needs_review or v_row.review_reason is not null or v_row.income_id is null
     or (select current_quantity from public.fabric_inventory_colors where id = v_f.color_id) <> 9
     or exists (select 1 from public.fabric_store_stock_reservations where order_id = v_order and status <> 'consumed') then
    raise exception 'TEST FAILED: fabric found after a late payment must be sold and the flag lifted: %', row_to_json(v_row);
  end if;
  if not exists (select 1 from public.fabric_store_order_events
                 where order_id = v_order and event_type = 'review_flag' and to_value = 'false' and actor_type = 'system') then
    raise exception 'TEST FAILED: lifting the flag must be in the audit log';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Late, AND staff were told about something else → sold, but the flag stays
-- ---------------------------------------------------------------------------
do $$
declare
  v_f record;
  v_order uuid;
begin
  select * into v_f from pg_temp.make_fabric('LATE2', 10);
  v_order := pg_temp.simple_order('local-late2', '+966560000204', v_f.listing_id);
  perform pg_temp.start('local-late2');
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار');
  perform pg_temp.expect_status('late payment', pg_temp.apply('local-late2'), 'paid');
  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
  values ('notify_staff', 'overpaid:test-' || v_order, v_order, jsonb_build_object('reason', 'overpaid'));

  perform pg_temp.expect_status('confirm', pg_temp.confirm(v_order), 'confirmed');
  if not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: a flag with another open reason must stay';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Late, and ANOTHER customer now holds the fabric → not sold, flagged, no invoice number
-- ---------------------------------------------------------------------------
do $$
declare
  v_f record;
  v_late uuid;
  v_other uuid;
  v_seq text;
  v_res jsonb;
begin
  select * into v_f from pg_temp.make_fabric('TAKEN', 10);
  v_late := pg_temp.simple_order('local-taken', '+966560000205', v_f.listing_id, 100);
  perform pg_temp.start('local-taken');
  perform private.fabric_store_release_order_reservations(v_late, 'اختبار');
  v_other := pg_temp.simple_order('local-taker', '+966560000206', v_f.listing_id, 950);   -- holds 9.5 of 10 m
  perform pg_temp.expect_status('late payment', pg_temp.apply('local-taken'), 'paid');
  select last_value || '/' || is_called into v_seq from public.fabrics_invoice_number_seq;

  v_res := pg_temp.confirm(v_late);
  perform pg_temp.expect_status('confirm against another hold', v_res, 'stock_unavailable');
  if v_res ->> 'reason' not like '%المطلوب 1 م، المتاح 0.5 م%'
     or (select income_id from public.fabric_store_orders where id = v_late) is not null
     or (select last_value || '/' || is_called from public.fabrics_invoice_number_seq) <> v_seq
     or (select current_quantity from public.fabric_inventory_colors where id = v_f.color_id) <> 10
     or (select status from public.fabric_store_stock_reservations where order_id = v_other) <> 'active' then
    raise exception 'TEST FAILED: another customer''s live hold must win: %', v_res;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) The online sale is locked in income; everything else in income is not
-- ---------------------------------------------------------------------------
do $$
declare
  v_income uuid := (select o.income_id from public.fabric_store_orders o
                    where o.access_token_hash = pg_temp.h('local-a1'));
  v_shop uuid;
  v_error text;
begin
  -- the fabric manager (as on the shop screen)
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.income set amount = 1 where id = v_income;
    v_error := 'none';
  exception when others then v_error := sqlerrm;
  end;
  if v_error not like 'FABRIC_STORE_ONLINE_SALE_LOCKED|%' then
    reset role;
    raise exception 'TEST FAILED: changing the amount of an online sale must be refused, got: %', v_error;
  end if;

  begin
    update public.income set fabric_items = '[]'::jsonb where id = v_income;
    v_error := 'none';
  exception when others then v_error := sqlerrm;
  end;
  if v_error not like 'FABRIC_STORE_ONLINE_SALE_LOCKED|%' then
    reset role;
    raise exception 'TEST FAILED: changing the fabric of an online sale must be refused, got: %', v_error;
  end if;

  begin
    delete from public.income where id = v_income;
    v_error := 'none';
  exception when others then v_error := sqlerrm;
  end;
  -- the reason the clerk reads must be the delete one ("لا تُحذف")
  if v_error not like 'FABRIC_STORE_ONLINE_SALE_LOCKED|%لا تُحذف%' then
    reset role;
    raise exception 'TEST FAILED: deleting an online sale must be refused as a delete, got: %', v_error;
  end if;

  update public.income set notes = 'ملاحظة موظفة' where id = v_income;

  -- an ordinary shop sale is untouched by the lock
  insert into public.income (branch, category, customer_name, amount, payment_method, fabric_items)
  values ('fabrics', 'fabric_sale', 'زبونة المحل', 100, 'cash', null) returning id into v_shop;
  update public.income set amount = 120 where id = v_shop;
  delete from public.income where id = v_shop;
  reset role;

  -- the alostaz sync writes (as the server)
  set local role service_role;
  update public.income
  set alostaz_sync_status = 'sending', alostaz_sync_token = gen_random_uuid(), alostaz_synced_at = now()
  where id = v_income;
  reset role;

  if (select notes from public.income where id = v_income) <> 'ملاحظة موظفة'
     or (select alostaz_sync_status from public.income where id = v_income) <> 'sending'
     or (select amount from public.income where id = v_income) <> 115.00 then
    raise exception 'TEST FAILED: notes and alostaz sync fields stay writable; the amount does not change';
  end if;
end $$;

select 'PASS stage 6 local sale (one sale with the shop''s shape and invoice number, stock down once, hold consumed, alostaz queued, idempotent, two lines + shipping, late payment sold and flag lifted, flag kept with another reason, another hold wins with no invoice number used, online sale locked)' as result;

rollback;
