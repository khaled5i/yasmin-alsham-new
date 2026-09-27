-- Exercise the fabric-store order/payment schema (migration 20260924102616)
-- against throwaway rows only. Everything runs inside ONE transaction that is
-- ROLLED BACK at the end: no order, attempt, refund, reservation or event
-- survives. No existing row is modified. The reservation checks only REFERENCE
-- one existing inventory colour (a foreign key); its stock is never touched.
--
-- Run after applying the migration, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store schema (…)
-- Any failure aborts with: TEST FAILED: <case>: …

begin;

-- ---------------------------------------------------------------------------
-- Helpers (temporary; vanish with the session)
-- ---------------------------------------------------------------------------

-- Assert that a caught error is the expected one.
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

-- A consistent order: 1 meter line + 1 piece line, shipping or pickup.
-- meter: 200.00 SAR/m x 2.5 m = 50000 ; piece: 100.00 SAR/m x 3.5 m = 35000
-- shipping 25.00 net. taxable = 85000 + 2500 = 87500 ; VAT 15% = 13125
-- VAT split by largest remainder over [50000, 35000, 2500] = [7500, 5250, 375]
create function pg_temp.make_order(p_delivery text, p_color uuid, p_item uuid, p_with_address boolean default true)
returns uuid language plpgsql as $$
declare
  v_order uuid;
  v_shipping bigint := case when p_delivery = 'shipping' then 2500 else 0 end;
  v_shipping_vat bigint := case when p_delivery = 'shipping' then 375 else 0 end;
  v_vat bigint := case when p_delivery = 'shipping' then 13125 else 12750 end;
begin
  insert into public.fabric_store_orders (
    access_token_hash, access_expires_at, checkout_key, request_fingerprint,
    customer_name, customer_phone, customer_email, delivery_method, delivery_option_code,
    vat_basis_points, items_net_halalas, shipping_net_halalas, shipping_vat_halalas,
    vat_halalas, total_halalas, payment_due_at,
    terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at
  ) values (
    decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'),
    now() + interval '90 days', gen_random_uuid(),
    decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'),
    'عميلة اختبار', '+966500000000', null, p_delivery,
    case when p_delivery = 'shipping' then 'test_zone' end,
    1500, 85000, v_shipping, v_shipping_vat, v_vat, 85000 + v_shipping + v_vat, now() + interval '20 minutes',
    't-test', 'r-test', 'p-test', now()
  ) returning id into v_order;

  insert into public.fabric_store_order_items (
    order_id, line_number, fabric_id, inventory_item_id, inventory_color_id, fabric_code, fabric_name,
    purchase_mode, quantity_cm, stock_consumption_cm,
    price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas
  ) values
    (v_order, 1, gen_random_uuid(), p_item, p_color, 'TEST-0001', 'قماش اختبار بالمتر',
     'meter', 250, 250, 20000, 0, 20000, 50000, 7500, 57500);

  insert into public.fabric_store_order_items (
    order_id, line_number, fabric_id, inventory_item_id, inventory_color_id, fabric_code, fabric_name,
    purchase_mode, piece_length_cm, quantity_pieces, stock_consumption_cm,
    price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas
  ) values
    (v_order, 2, gen_random_uuid(), p_item, p_color, 'TEST-0002', 'قماش اختبار قطعة',
     'piece', 350, 1, 350, 10000, 0, 35000, 35000, 5250, 40250);

  if p_delivery = 'shipping' and p_with_address then
    insert into public.fabric_store_order_addresses (order_id, recipient_name, recipient_phone, city, short_address)
    values (v_order, 'عميلة اختبار', '+966500000000', 'الرياض', 'RRRD2929');
  end if;
  return v_order;
end;
$$;

create function pg_temp.hold_order(p_order uuid)
returns void language plpgsql as $$
begin
  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
  select p_order, item.id, item.inventory_item_id, item.inventory_color_id,
         item.stock_consumption_cm, now() + interval '20 minutes'
  from public.fabric_store_order_items item where item.order_id = p_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Lockdown: RLS on, no browser role can touch anything
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_role text;
  v_priv text;
  v_sequence text;
begin
  foreach v_table in array array[
    'fabric_store_orders', 'fabric_store_order_items', 'fabric_store_order_addresses',
    'fabric_store_payment_attempts', 'fabric_store_payment_events', 'fabric_store_stock_reservations',
    'fabric_store_refunds', 'fabric_store_outbox', 'fabric_store_order_events'
  ] loop
    if not (select c.relrowsecurity from pg_class c
            where c.oid = ('public.' || v_table)::regclass) then
      raise exception 'TEST FAILED: RLS is not enabled on %', v_table;
    end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_table) then
      raise exception 'TEST FAILED: % must have no RLS policy (server-only table)', v_table;
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(v_role, 'public.' || v_table, v_priv) then
          raise exception 'TEST FAILED: % has % on %', v_role, v_priv, v_table;
        end if;
      end loop;
    end loop;
  end loop;

  if has_sequence_privilege('anon', 'public.fabric_store_order_number_seq', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.fabric_store_order_number_seq', 'USAGE') then
    raise exception 'TEST FAILED: browser roles can use the order number sequence';
  end if;

  -- ...and the same for EVERY sequence of the section, including the identity
  -- sequence behind the audit log: a browser role holding UPDATE on it can
  -- setval it to the top and stop every new order (or re-number the audit).
  for v_sequence in
    select n.nspname || '.' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S'
      and n.nspname = 'public'
      and c.relname like 'fabric\_store%'
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['USAGE', 'SELECT', 'UPDATE'] loop
        if has_sequence_privilege(v_role, v_sequence, v_priv) then
          raise exception 'TEST FAILED: % has % on sequence %', v_role, v_priv, v_sequence;
        end if;
      end loop;
    end loop;
  end loop;

  -- the audit log really is an identity column (it needs no sequence grant to
  -- work, which is what makes the full revoke above safe)
  if pg_get_serial_sequence('public.fabric_store_order_events', 'id') is null then
    raise exception 'TEST FAILED: the audit log has no identity sequence to protect';
  end if;

  -- service_role: snapshots and audit are append-only even for the server.
  if has_table_privilege('service_role', 'public.fabric_store_order_items', 'UPDATE')
     or has_table_privilege('service_role', 'public.fabric_store_order_items', 'DELETE')
     or has_table_privilege('service_role', 'public.fabric_store_order_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.fabric_store_order_events', 'DELETE')
     or has_table_privilege('service_role', 'public.fabric_store_order_addresses', 'DELETE')
     or has_table_privilege('service_role', 'public.fabric_store_payment_events', 'DELETE')
     or has_table_privilege('service_role', 'public.fabric_store_refunds', 'DELETE') then
    raise exception 'TEST FAILED: service_role can rewrite an append-only table';
  end if;
  if not has_table_privilege('service_role', 'public.fabric_store_orders', 'INSERT')
     or not has_sequence_privilege('service_role', 'public.fabric_store_order_number_seq', 'USAGE') then
    raise exception 'TEST FAILED: service_role cannot create orders';
  end if;

  -- One deliberate exception (stage 3): signed-in staff must be able to READ the
  -- online holds, because the shop's stock guard runs with their identity.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'fabric_store%'
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or (has_function_privilege('authenticated', p.oid, 'EXECUTE')
               and p.proname <> 'fabric_store_stock_hold'))
  ) then
    raise exception 'TEST FAILED: a fabric_store function is executable by a browser role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) The full happy path, run AS service_role (the server's real identity)
-- ---------------------------------------------------------------------------
do $$
declare
  v_color uuid;
  v_item uuid;
  v_order uuid;
  v_attempt uuid;
  v_number text;
  v_err text;
  v_events text;
begin
  select color.id, color.inventory_item_id into v_color, v_item
  from public.fabric_inventory_colors color
  order by color.created_at
  limit 1;
  if v_color is null then
    raise exception 'TEST FAILED: no inventory colour exists to reference';
  end if;

  set local role service_role;
  if current_user <> 'service_role' then
    raise exception 'TEST FAILED: could not switch to service_role (running as %)', current_user;
  end if;
  perform set_config('fabric_store.actor_type', 'customer', true);

  v_order := pg_temp.make_order('shipping', v_color, v_item);
  set constraints all immediate;   -- run the deferred order/items/address check now
  set constraints all deferred;

  select order_number into v_number from public.fabric_store_orders where id = v_order;
  if v_number !~ '^FS-[0-9]{6,}$' then
    raise exception 'TEST FAILED: order number format: %', v_number;
  end if;

  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
  select v_order, item.id, item.inventory_item_id, item.inventory_color_id, item.stock_consumption_cm,
         now() + interval '20 minutes'
  from public.fabric_store_order_items item where item.order_id = v_order;

  insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  values (v_order, 'moyasar', 'test', gen_random_uuid(), 100625, now() + interval '15 minutes')
  returning id into v_attempt;

  update public.fabric_store_payment_attempts
  set status = 'initiated', provider_invoice_id = 'inv_test_1', checkout_url = 'https://checkout.example/inv_test_1'
  where id = v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_1'
  where id = v_attempt;

  insert into public.fabric_store_payment_events
    (provider, environment, source, provider_event_id, event_type, provider_invoice_id, provider_payment_id,
     attempt_id, order_id, payload)
  values ('moyasar', 'test', 'webhook', 'evt_test_1', 'payment_paid', 'inv_test_1', 'pay_test_1',
          v_attempt, v_order, '{"id": "evt_test_1"}');
  update public.fabric_store_payment_events set processing_status = 'processed' where provider_event_id = 'evt_test_1';

  perform set_config('fabric_store.actor_type', 'provider', true);
  update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = v_attempt where id = v_order;
  update public.fabric_store_stock_reservations set status = 'consumed' where order_id = v_order;

  perform set_config('fabric_store.actor_type', 'staff', true);
  perform set_config('fabric_store.actor_id', '00000000-0000-4000-8000-000000000001', true);
  update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
  update public.fabric_store_orders set fulfillment_status = 'shipped' where id = v_order;
  update public.fabric_store_orders set fulfillment_status = 'delivered' where id = v_order;

  -- Partial then full refund, never above what was collected.
  insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by)
  values (v_order, v_attempt, gen_random_uuid(), 40000, 'قطعة معيبة', '00000000-0000-4000-8000-000000000001');
  insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by)
  values (v_order, v_attempt, gen_random_uuid(), 60625, 'استرداد الباقي', '00000000-0000-4000-8000-000000000001');
  begin
    insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by)
    values (v_order, v_attempt, gen_random_uuid(), 1, 'هللة زائدة', '00000000-0000-4000-8000-000000000001');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('refund above collected (as service_role)', v_err, 'FABRIC_STORE_REFUND_EXCEEDS');

  update public.fabric_store_refunds set status = 'succeeded' where order_id = v_order;
  perform set_config('fabric_store.actor_type', 'provider', true);
  update public.fabric_store_orders set payment_status = 'partially_refunded' where id = v_order;
  update public.fabric_store_orders set payment_status = 'refunded' where id = v_order;

  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
  values ('alostaz_invoice', 'alostaz_invoice:' || v_order, v_order, '{}');
  begin
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('alostaz_invoice', 'alostaz_invoice:' || v_order, v_order, '{}');
    v_err := 'NO_ERROR';
  exception when unique_violation then v_err := 'duplicate outbox task';
  end;
  perform pg_temp.expect('outbox dedupe key', v_err, 'duplicate outbox task');

  select string_agg(event_type || ':' || coalesce(to_value, '') || ':' || actor_type, ',' order by id)
  into v_events
  from public.fabric_store_order_events where order_id = v_order;
  if v_events <> 'order_created:pending:customer,payment_status:paid:provider,'
                 || 'fulfillment_status:preparing:staff,fulfillment_status:shipped:staff,'
                 || 'fulfillment_status:delivered:staff,payment_status:partially_refunded:provider,'
                 || 'payment_status:refunded:provider' then
    raise exception 'TEST FAILED: audit trail: %', v_events;
  end if;
  if not exists (select 1 from public.fabric_store_order_events
                 where order_id = v_order and actor_id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'TEST FAILED: staff actor id was not recorded';
  end if;

  -- The server may purge an abandoned order (no payment attempt) even though it
  -- has no DELETE on lines/audit: the cascade runs with the table owner's rights.
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('shipping', v_color, v_item);
  set constraints all immediate;
  delete from public.fabric_store_orders where id = v_order;
  set constraints all deferred;
  if exists (select 1 from public.fabric_store_order_items where order_id = v_order)
     or exists (select 1 from public.fabric_store_order_events where order_id = v_order) then
    raise exception 'TEST FAILED: purge as service_role left parts behind';
  end if;
  -- ...but cannot delete a single line or audit row directly.
  begin
    delete from public.fabric_store_order_events where true;
    v_err := 'NO_ERROR';
  exception when insufficient_privilege then v_err := 'no direct delete';
  end;
  perform pg_temp.expect('audit rows cannot be deleted by the server', v_err, 'no direct delete');

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Money rules: the database refuses amounts the pricing contract would not produce
-- ---------------------------------------------------------------------------
do $$
declare
  v_color uuid;
  v_item uuid;
  v_order uuid;
  v_err text;
begin
  select color.id, color.inventory_item_id into v_color, v_item
  from public.fabric_inventory_colors color order by color.created_at limit 1;
  perform set_config('fabric_store.actor_type', 'customer', true);

  -- VAT not equal to round_half_up(taxable x 15%)
  begin
    insert into public.fabric_store_orders (access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, delivery_method, vat_basis_points, items_net_halalas, vat_halalas, total_halalas,
      payment_due_at, terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at)
    values (decode(repeat('ab', 32), 'hex'), now() + interval '1 day', gen_random_uuid(), decode(repeat('cd', 32), 'hex'),
      'عميلة', '+966500000000', 'pickup', 1500, 3333, 499, 3832,
      now() + interval '20 minutes', 't', 'r', 'p', now());
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('VAT must be 499.95 rounded half up = 500', v_err, 'fabric_store_orders_vat_rule');

  -- total must equal items + shipping + VAT
  begin
    insert into public.fabric_store_orders (access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, delivery_method, vat_basis_points, items_net_halalas, vat_halalas, total_halalas,
      payment_due_at, terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at)
    values (decode(repeat('ab', 32), 'hex'), now() + interval '1 day', gen_random_uuid(), decode(repeat('cd', 32), 'hex'),
      'عميلة', '+966500000000', 'pickup', 1500, 3333, 500, 3834,
      now() + interval '20 minutes', 't', 'r', 'p', now());
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('total = items + shipping + VAT', v_err, 'fabric_store_orders_total_sum');

  -- pickup orders carry no shipping fee
  begin
    insert into public.fabric_store_orders (access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, delivery_method, vat_basis_points, items_net_halalas, shipping_net_halalas,
      vat_halalas, total_halalas, payment_due_at, terms_version, returns_policy_version, privacy_policy_version,
      policies_accepted_at)
    values (decode(repeat('ab', 32), 'hex'), now() + interval '1 day', gen_random_uuid(), decode(repeat('cd', 32), 'hex'),
      'عميلة', '+966500000000', 'pickup', 1500, 10000, 1000, 1650, 12650,
      now() + interval '20 minutes', 't', 'r', 'p', now());
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('pickup without shipping fee', v_err, 'fabric_store_orders_pickup_without_shipping');

  -- a new order cannot start paid
  begin
    insert into public.fabric_store_orders (access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, delivery_method, vat_basis_points, items_net_halalas, vat_halalas, total_halalas,
      payment_due_at, terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at, payment_status)
    values (decode(repeat('ab', 32), 'hex'), now() + interval '1 day', gen_random_uuid(), decode(repeat('cd', 32), 'hex'),
      'عميلة', '+966500000000', 'pickup', 1500, 10000, 1500, 11500,
      now() + interval '20 minutes', 't', 'r', 'p', now(), 'paid');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('new order starts pending', v_err, 'FABRIC_STORE_ORDER_INITIAL_STATE');

  -- Line price rules mirror src/lib/fabric-store/pricing.ts
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  set constraints all immediate;
  set constraints all deferred;

  -- piece: 99.98 SAR/m, 10% off, 3 m = 26994.6 -> 26995 (ONE rounding). 26994 must be refused.
  begin
    insert into public.fabric_store_order_items (order_id, line_number, fabric_id, inventory_item_id, fabric_name,
      purchase_mode, piece_length_cm, quantity_pieces, stock_consumption_cm,
      price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas)
    values (v_order, 3, gen_random_uuid(), v_item, 'قطعة', 'piece', 300, 1, 300, 9998, 1000, 26994, 26994, 0, 26994);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('piece price rounded once, not twice', v_err, 'fabric_store_order_items_unit_price_rule');

  -- meter: 33.33 x 1.5 m = 4999.5 -> 5000 (half up). 4999 must be refused.
  begin
    insert into public.fabric_store_order_items (order_id, line_number, fabric_id, inventory_item_id, fabric_name,
      purchase_mode, quantity_cm, stock_consumption_cm,
      price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas)
    values (v_order, 3, gen_random_uuid(), v_item, 'متر', 'meter', 150, 150, 3333, 0, 3333, 4999, 0, 4999);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('meter line rounded half up', v_err, 'fabric_store_order_items_net_rule');

  -- a whole piece is one piece of 3 or 3.5 m, consuming its full length
  begin
    insert into public.fabric_store_order_items (order_id, line_number, fabric_id, inventory_item_id, fabric_name,
      purchase_mode, piece_length_cm, quantity_pieces, stock_consumption_cm,
      price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas)
    values (v_order, 3, gen_random_uuid(), v_item, 'قطعة', 'piece', 350, 1, 100, 10000, 0, 35000, 35000, 0, 35000);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('piece consumes its full length', v_err, 'fabric_store_order_items_quantity_shape');

  -- items that do not add up to the order are refused at commit time
  begin
    insert into public.fabric_store_order_items (order_id, line_number, fabric_id, inventory_item_id, fabric_name,
      purchase_mode, quantity_cm, stock_consumption_cm,
      price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas)
    values (v_order, 3, gen_random_uuid(), v_item, 'سطر زائد', 'meter', 100, 100, 10000, 0, 10000, 10000, 0, 10000);
    set constraints all immediate;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  set constraints all deferred;
  perform pg_temp.expect('items must add up to the order total', v_err, 'FABRIC_STORE_ORDER_ITEMS_TOTAL');

  -- a shipping order must come with its address (checked at commit)
  begin
    perform pg_temp.make_order('shipping', v_color, v_item, false);
    set constraints all immediate;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  set constraints all deferred;
  perform pg_temp.expect('shipping order needs an address', v_err, 'FABRIC_STORE_ORDER_ADDRESS_REQUIRED');

  -- snapshots never change
  begin
    update public.fabric_store_order_items set fabric_name = 'اسم جديد' where order_id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('order line snapshot is immutable', v_err, 'FABRIC_STORE_APPEND_ONLY');

  -- a pickup order stores no address
  begin
    insert into public.fabric_store_order_addresses (order_id, recipient_name, recipient_phone, city, short_address)
    values (v_order, 'عميلة', '+966500000000', 'الرياض', 'RRRD2929');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('pickup order has no address', v_err, 'FABRIC_STORE_ORDER_ADDRESS_UNEXPECTED');

  -- order totals are immutable after creation
  begin
    update public.fabric_store_orders set customer_name = customer_name, total_halalas = total_halalas + 1
    where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('order totals are immutable', v_err, 'FABRIC_STORE_ORDER_IMMUTABLE');
end $$;

-- ---------------------------------------------------------------------------
-- 3) State machine: who may move what, and where
-- ---------------------------------------------------------------------------
do $$
declare
  v_color uuid;
  v_item uuid;
  v_order uuid;
  v_other uuid;
  v_attempt uuid;
  v_second uuid;
  v_err text;
begin
  select color.id, color.inventory_item_id into v_color, v_item
  from public.fabric_inventory_colors color order by color.created_at limit 1;
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  v_other := pg_temp.make_order('pickup', v_color, v_item);
  perform pg_temp.hold_order(v_order);
  set constraints all immediate;
  set constraints all deferred;

  -- status change without declaring the actor
  perform set_config('fabric_store.actor_type', '', true);
  begin
    update public.fabric_store_orders set payment_status = 'failed' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('actor must be declared', v_err, 'FABRIC_STORE_ACTOR_REQUIRED');

  -- the customer cannot raise or clear the review flag
  perform set_config('fabric_store.actor_type', 'customer', true);
  begin
    update public.fabric_store_orders set needs_review = true, review_reason = 'x' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('customer cannot touch the review flag', v_err, 'FABRIC_STORE_REVIEW_ACTOR');

  -- staff can never mark an order paid
  perform set_config('fabric_store.actor_type', 'staff', true);
  begin
    update public.fabric_store_orders set payment_status = 'failed' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('staff cannot change payment status', v_err, 'FABRIC_STORE_PAYMENT_ACTOR');

  -- nothing is prepared before payment
  begin
    update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('no preparing before payment', v_err, 'FABRIC_STORE_FULFILLMENT_UNPAID');

  -- attempt amount must equal the order total
  begin
    insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
    values (v_order, 'moyasar', 'test', gen_random_uuid(), 97749, now() + interval '15 minutes');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('attempt amount = order total', v_err, 'FABRIC_STORE_ATTEMPT_AMOUNT');

  insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  values (v_order, 'moyasar', 'test', gen_random_uuid(), 97750, now() + interval '15 minutes')
  returning id into v_attempt;

  -- double-clicking "pay" cannot open a second attempt
  begin
    insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
    values (v_order, 'moyasar', 'test', gen_random_uuid(), 97750, now() + interval '15 minutes');
    v_err := 'NO_ERROR';
  exception when unique_violation then v_err := 'one open attempt';
  end;
  perform pg_temp.expect('one open attempt per order', v_err, 'one open attempt');

  -- an order cannot be marked paid by an attempt that did not succeed, or by another order's attempt
  perform set_config('fabric_store.actor_type', 'provider', true);
  begin
    update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = v_attempt where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('paid needs a successful attempt', v_err, 'FABRIC_STORE_PAID_ATTEMPT_INVALID');

  update public.fabric_store_payment_attempts
  set status = 'initiated', provider_invoice_id = 'inv_test_2' where id = v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'expired' where id = v_attempt;

  -- the order closes unpaid...
  update public.fabric_store_orders set payment_status = 'failed' where id = v_order;

  -- ...a paid provider payment cannot be claimed by a second attempt
  insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  values (v_other, 'moyasar', 'test', gen_random_uuid(), 97750, now() + interval '15 minutes')
  returning id into v_second;
  update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = 'pay_test_2' where id = v_second;

  -- ...then a late success arrives: failed -> paid is allowed (money was captured), and flagged
  update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = 'pay_test_3' where id = v_attempt;
  begin
    update public.fabric_store_payment_attempts set provider_payment_id = 'pay_test_2' where id = v_attempt;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('provider payment id is fixed once set', v_err, 'FABRIC_STORE_ATTEMPT_IMMUTABLE');

  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt, needs_review = true,
      review_reason = 'دفعة متأخرة بعد انتهاء الحجز'
  where id = v_order;

  -- paid can never go back to failed
  begin
    update public.fabric_store_orders set payment_status = 'failed' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('paid never returns to failed', v_err, 'FABRIC_STORE_PAYMENT_TRANSITION');

  -- an order under review is not prepared
  perform set_config('fabric_store.actor_type', 'staff', true);
  begin
    update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('no preparing while under review', v_err, 'FABRIC_STORE_FULFILLMENT_UNDER_REVIEW');

  -- a pickup order is never "shipped"
  update public.fabric_store_orders set needs_review = false, review_reason = null where id = v_order;
  update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;

  -- EVERY forward step is re-checked, not just the first one: an order already
  -- being prepared stops the moment it is flagged for review.
  update public.fabric_store_orders set needs_review = true, review_reason = 'مراجعة أثناء التجهيز' where id = v_order;
  begin
    update public.fabric_store_orders set fulfillment_status = 'ready_for_pickup' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a flagged order stops mid-way', v_err, 'FABRIC_STORE_FULFILLMENT_UNDER_REVIEW');
  -- ...while stepping back or cancelling stays available so staff can settle it
  update public.fabric_store_orders set fulfillment_status = 'unfulfilled' where id = v_order;
  update public.fabric_store_orders set needs_review = false, review_reason = null where id = v_order;
  update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
  begin
    update public.fabric_store_orders set fulfillment_status = 'shipped' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('pickup order cannot be shipped', v_err, 'fabric_store_orders_fulfillment_matches_delivery');

  -- a refund from an attempt of another order is refused
  begin
    insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by)
    values (v_order, v_second, gen_random_uuid(), 100, 'خطأ', gen_random_uuid());
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('refund only from this order''s payment', v_err, 'FABRIC_STORE_REFUND_ATTEMPT');

  -- an order that ever had a payment attempt cannot be deleted...
  begin
    delete from public.fabric_store_orders where id = v_other;
    v_err := 'NO_ERROR';
  exception when foreign_key_violation then v_err := 'order with payment history kept';
  end;
  perform pg_temp.expect('orders with payment attempts are never deleted', v_err, 'order with payment history kept');

  -- ...while an abandoned order without any attempt can be purged with all its parts
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_other := pg_temp.make_order('shipping', v_color, v_item);
  set constraints all immediate;
  delete from public.fabric_store_orders where id = v_other;
  set constraints all deferred;
  if exists (select 1 from public.fabric_store_order_items where order_id = v_other)
     or exists (select 1 from public.fabric_store_order_addresses where order_id = v_other)
     or exists (select 1 from public.fabric_store_order_events where order_id = v_other) then
    raise exception 'TEST FAILED: purging an abandoned order left parts behind';
  end if;

  -- the same provider event is stored once
  insert into public.fabric_store_payment_events (provider, environment, source, provider_event_id, event_type, payload)
  values ('moyasar', 'test', 'webhook', 'evt_dup', 'payment_paid', '{}');
  begin
    insert into public.fabric_store_payment_events (provider, environment, source, provider_event_id, event_type, payload)
    values ('moyasar', 'test', 'webhook', 'evt_dup', 'payment_paid', '{}');
    v_err := 'NO_ERROR';
  exception when unique_violation then v_err := 'duplicate event';
  end;
  perform pg_temp.expect('duplicate webhook stored once', v_err, 'duplicate event');

  begin
    update public.fabric_store_payment_events set payload = '{"tampered": true}' where provider_event_id = 'evt_dup';
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('event payload is immutable', v_err, 'FABRIC_STORE_EVENT_IMMUTABLE');
end $$;

-- ---------------------------------------------------------------------------
-- 4) Reservations and addresses
-- ---------------------------------------------------------------------------
do $$
declare
  v_color uuid;
  v_item uuid;
  v_order uuid;
  v_line uuid;
  v_second_order uuid;
  v_second_line uuid;
  v_err text;
begin
  select color.id, color.inventory_item_id into v_color, v_item
  from public.fabric_inventory_colors color order by color.created_at limit 1;
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('shipping', v_color, v_item);
  set constraints all immediate;
  set constraints all deferred;
  select id into v_line from public.fabric_store_order_items where order_id = v_order and line_number = 1;

  -- a reservation must match its line exactly
  begin
    insert into public.fabric_store_stock_reservations
      (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
    values (v_order, v_line, v_item, v_color, 100, now() + interval '20 minutes');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('reservation quantity = line consumption', v_err, 'FABRIC_STORE_RESERVATION_MISMATCH');

  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
  values (v_order, v_line, v_item, v_color, 250, now() + interval '20 minutes');

  -- the same line cannot be reserved twice
  begin
    insert into public.fabric_store_stock_reservations
      (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
    values (v_order, v_line, v_item, v_color, 250, now() + interval '20 minutes');
    v_err := 'NO_ERROR';
  exception when unique_violation then v_err := 'double reservation';
  end;
  perform pg_temp.expect('one reservation per line', v_err, 'double reservation');

  -- the two-hour window is a row rule, not only a rule inside the reserve function:
  -- a direct update cannot freeze shop stock for a hundred years
  begin
    update public.fabric_store_stock_reservations
    set expires_at = now() + interval '100 years'
    where order_item_id = v_line;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('an active hold is never extended', v_err, 'FABRIC_STORE_RESERVATION_NO_EXTENSION');

  v_second_order := pg_temp.make_order('pickup', v_color, v_item);
  select id into v_second_line
  from public.fabric_store_order_items where order_id = v_second_order and line_number = 1;
  begin
    insert into public.fabric_store_stock_reservations
      (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
    values (v_second_order, v_second_line, v_item, v_color, 250, now() + interval '3 hours');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a hold longer than two hours is refused', v_err,
                         'fabric_store_stock_reservations_window');

  update public.fabric_store_stock_reservations set status = 'expired', end_reason = 'انتهت مدة الدفع'
  where order_item_id = v_line;
  begin
    update public.fabric_store_stock_reservations set status = 'active' where order_item_id = v_line;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('an expired hold never re-activates', v_err, 'FABRIC_STORE_RESERVATION_TRANSITION');
  -- a late payment may consume an expired hold (after an atomic stock check, stage 3)
  update public.fabric_store_stock_reservations set status = 'consumed' where order_item_id = v_line;

  -- an address cannot be wiped while the order is open
  begin
    update public.fabric_store_order_addresses
    set recipient_name = null, recipient_phone = null, short_address = null, anonymized_at = now()
    where order_id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('no anonymising an open order', v_err, 'FABRIC_STORE_ADDRESS_IN_USE');

  -- a correction before shipping is allowed
  update public.fabric_store_order_addresses set notes = 'البوابة الخلفية' where order_id = v_order;

  -- after the order closes, personal data is wiped and the row stays
  perform set_config('fabric_store.actor_type', 'system', true);
  update public.fabric_store_orders set payment_status = 'failed' where id = v_order;
  update public.fabric_store_order_addresses
  set recipient_name = null, recipient_phone = null, short_address = null, notes = null, anonymized_at = now()
  where order_id = v_order;
  begin
    update public.fabric_store_order_addresses set city = 'جدة' where order_id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('an anonymised address is frozen', v_err, 'FABRIC_STORE_ADDRESS_ANONYMIZED');
end $$;

-- ---------------------------------------------------------------------------
-- 5) A fully refunded order is never handed over
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_order uuid;
  v_attempt uuid;
  v_err text;
begin
  select color.inventory_item_id, color.id into v_item, v_color
  from public.fabric_inventory_colors color
  order by color.created_at
  limit 1;

  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  perform pg_temp.hold_order(v_order);

  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_refund_block'
  where id = v_attempt;
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;

  -- it was already being prepared when the whole amount went back
  perform set_config('fabric_store.actor_type', 'staff', true);
  update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;

  perform set_config('fabric_store.actor_type', 'provider', true);
  update public.fabric_store_orders set payment_status = 'refunded' where id = v_order;

  perform set_config('fabric_store.actor_type', 'staff', true);
  begin
    update public.fabric_store_orders set fulfillment_status = 'ready_for_pickup' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a refunded order is not handed over', v_err, 'FABRIC_STORE_FULFILLMENT_UNPAID');

  -- cancelling it (or stepping back) is still allowed, so staff can close it
  update public.fabric_store_orders set fulfillment_status = 'cancelled' where id = v_order;

  -- a partial refund, on the other hand, does not stop the handover
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  perform pg_temp.hold_order(v_order);
  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_partial_ok'
  where id = v_attempt;
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;
  update public.fabric_store_orders set payment_status = 'partially_refunded' where id = v_order;
  perform set_config('fabric_store.actor_type', 'staff', true);
  update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
  update public.fabric_store_orders set fulfillment_status = 'ready_for_pickup' where id = v_order;
  update public.fabric_store_orders set fulfillment_status = 'delivered' where id = v_order;
end $$;

-- ---------------------------------------------------------------------------
-- 6) A payment that lands while the hold is gone is flagged, never handed over
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_order uuid;
  v_line uuid;
  v_attempt uuid;
  v_err text;
  v_review boolean;
  v_reason text;
begin
  select color.inventory_item_id, color.id into v_item, v_color
  from public.fabric_inventory_colors color order by color.created_at limit 1;

  -- A captured payment with no reservation cannot be prepared silently.
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_no_hold'
  where id = v_attempt;
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;
  select needs_review, review_reason into v_review, v_reason
  from public.fabric_store_orders where id = v_order;
  if not v_review or v_reason is null then
    raise exception 'TEST FAILED: a payment with no holds must raise the review flag with a reason';
  end if;
  perform set_config('fabric_store.actor_type', 'staff', true);
  begin
    update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a payment without holds does not go to preparing', v_err,
                         'FABRIC_STORE_FULFILLMENT_UNDER_REVIEW');

  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  select id into v_line
  from public.fabric_store_order_items where order_id = v_order and line_number = 1;
  perform pg_temp.hold_order(v_order);

  -- the hold is released while the customer is still paying (a cancel, a sweep,
  -- or a direct write by the payment server)
  update public.fabric_store_stock_reservations
  set status = 'released', end_reason = 'اختبار'
  where order_item_id = v_line;

  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_dead_hold'
  where id = v_attempt;

  -- the money is recorded (it was really captured) but the order is NOT deliverable
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;
  select needs_review, review_reason into v_review, v_reason
  from public.fabric_store_orders where id = v_order;
  if not v_review or v_reason is null then
    raise exception 'TEST FAILED: a payment on a released hold must raise the review flag with a reason';
  end if;

  perform set_config('fabric_store.actor_type', 'staff', true);
  begin
    update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.expect('a payment on a released hold does not go to preparing', v_err,
                         'FABRIC_STORE_FULFILLMENT_UNDER_REVIEW');

  -- the same for a hold whose window simply ran out before the payment arrived
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  select id into v_line
  from public.fabric_store_order_items where order_id = v_order and line_number = 1;
  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at, created_at)
  values (v_order, v_line, v_item, v_color, 250, now() - interval '1 minute', now() - interval '31 minutes');
  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
  select v_order, item.id, item.inventory_item_id, item.inventory_color_id,
         item.stock_consumption_cm, now() + interval '20 minutes'
  from public.fabric_store_order_items item
  where item.order_id = v_order and item.line_number = 2;

  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_late_hold'
  where id = v_attempt;
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;
  select needs_review into v_review from public.fabric_store_orders where id = v_order;
  if not v_review then
    raise exception 'TEST FAILED: a payment arriving after the hold expired must raise the review flag';
  end if;

  -- ...while a payment on a live hold is not flagged at all
  perform set_config('fabric_store.actor_type', 'customer', true);
  v_order := pg_temp.make_order('pickup', v_color, v_item);
  select id into v_line
  from public.fabric_store_order_items where order_id = v_order and line_number = 1;
  perform pg_temp.hold_order(v_order);
  perform set_config('fabric_store.actor_type', 'provider', true);
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
  select v_order, 'moyasar', 'test', gen_random_uuid(), total_halalas, now() + interval '15 minutes'
  from public.fabric_store_orders where id = v_order
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'paid', provider_payment_id = 'pay_test_live_hold'
  where id = v_attempt;
  update public.fabric_store_orders
  set payment_status = 'paid', paid_attempt_id = v_attempt
  where id = v_order;
  select needs_review into v_review from public.fabric_store_orders where id = v_order;
  if v_review then
    raise exception 'TEST FAILED: a payment on a live hold must NOT be flagged for review';
  end if;
  perform set_config('fabric_store.actor_type', 'staff', true);
  update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
end $$;

select 'PASS fabric_store schema (lockdown, sequences, service_role happy path, money rules, state machine, forward steps, reservations, hold window, payment on a dead hold, addresses)' as result;

rollback;
