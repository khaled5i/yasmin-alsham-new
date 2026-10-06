-- Exercise fix batch D (migration 20261005150000): AUD-14 (visitors cannot read the fabric cost and
-- purchase columns), AUD-10 (shipping addresses are erased 90 days after the order ends) and AUD-09
-- (the reconciliation window for paid attempts) — AS anon and AS service_role.
--
-- SAFE ON THE LIVE DATABASE: TEST payments only, no income row and no invoice number (checked at the
-- end). Everything runs in ONE transaction that is ROLLED BACK. Note: the purge is called once with a
-- zero retention, which inside this transaction also erases the addresses of real finished orders —
-- the ROLLBACK at the end restores them; only this test's own order is checked.
-- Run after applying the stage 2 → 9 migrations and fix batches A → D, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store privacy ops (…)

begin;

select set_config('fabric_store_test.income_before',
  (select count(*) from public.income)::text || '#'
  || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq), false);

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
create function pg_temp.admin() returns uuid language sql stable as $$
  select u.id from public.users u where u.role = 'admin' and u.is_active order by u.created_at, u.id limit 1
$$;

create function pg_temp.make_listing(p_label text) returns uuid language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار الدفعة D ' || p_label, 'اختبار الدفعة D ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', 10, 'رصيد اختبار الدفعة D');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار الدفعة D', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            10, 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0
    where id = v_listing;
  end if;
  return v_listing;
end;
$$;

-- 1 m at 100.00 SAR/m, shipped (+50.00): 172.50.
create function pg_temp.shipping_order(p_access text, p_phone text) returns uuid language plpgsql as $$
declare
  v_listing uuid := pg_temp.make_listing(p_access);
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('privacy-client-' || p_access),
    'customer', jsonb_build_object('name', 'عميلة اختبار', 'phone', p_phone),
    'delivery', jsonb_build_object('method', 'shipping', 'option_code', 'ksa_flat', 'option_label', 'شحن داخل السعودية',
                                   'shipping_net_halalas', 5000, 'shipping_vat_halalas', 750),
    'address', jsonb_build_object('recipient_name', 'عميلة اختبار', 'recipient_phone', p_phone,
                                  'city', 'الرياض', 'short_address', 'RRRD2929'),
    'totals', jsonb_build_object('items_net_halalas', 10000, 'vat_halalas', 2250, 'total_halalas', 17250),
    'policies', jsonb_build_object('terms', 't', 'returns', 'r', 'privacy', 'p'),
    'items', jsonb_build_array(jsonb_build_object(
      'fabric_id', v_listing, 'purchase_mode', 'meter', 'quantity_cm', 100,
      'price_per_meter_halalas', 10000, 'discount_basis_points', 0,
      'unit_price_halalas', 10000, 'net_halalas', 10000, 'vat_halalas', 1500))));
  reset role;
  if v_res ->> 'status' <> 'created' then
    raise exception 'TEST FAILED: fixture order for %: %', p_access, v_res;
  end if;
  return (v_res ->> 'order_id')::uuid;
exception when others then reset role; raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) AUD-14: the visitor reads fabric cards, never their cost or purchase columns
-- ---------------------------------------------------------------------------
do $$
declare
  v_col text;
  v_n integer;
begin
  foreach v_col in array array['cost_per_meter', 'average_cost', 'last_purchase_price', 'supplier_id', 'last_purchase_date'] loop
    if has_column_privilege('anon', 'public.fabrics', v_col, 'SELECT') then
      raise exception 'TEST FAILED: anon can read fabrics.%', v_col;
    end if;
    if not has_column_privilege('authenticated', 'public.fabrics', v_col, 'SELECT') then
      raise exception 'TEST FAILED: the dashboard (authenticated) lost fabrics.%', v_col;
    end if;
  end loop;
  foreach v_col in array array['id', 'name', 'price_per_meter', 'is_on_sale', 'discount_percentage', 'images',
                               'stock_quantity', 'is_available', 'is_active', 'deleted_at', 'categories', 'design_images'] loop
    if not has_column_privilege('anon', 'public.fabrics', v_col, 'SELECT') then
      raise exception 'TEST FAILED: the store lost fabrics.% for visitors', v_col;
    end if;
  end loop;
  -- every column but the five is readable: the explicit list in the app matches the database
  select count(*) into v_n from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'fabrics'
    and c.column_name not in ('cost_per_meter', 'average_cost', 'last_purchase_price', 'supplier_id', 'last_purchase_date')
    and not has_column_privilege('anon', 'public.fabrics', c.column_name, 'SELECT');
  if v_n <> 0 then
    raise exception 'TEST FAILED: % public fabric column(s) unreadable for visitors', v_n;
  end if;

  set local role anon;
  perform id, price_per_meter from public.fabrics limit 1;
  begin
    perform cost_per_meter from public.fabrics limit 1;
    reset role;
    raise exception 'TEST FAILED: a visitor read cost_per_meter';
  exception when insufficient_privilege then
    reset role;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2) AUD-10: the address of a finished order is erased after the retention (90 days); the city stays;
--    an order still running keeps it; the purge is the server's only
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.shipping_order('privacy-ship', '+966562000001');
  v_begin jsonb;
  v_res jsonb;
  v_row record;
begin
  if has_function_privilege('anon', 'public.fabric_store_purge_addresses(integer, interval)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fabric_store_purge_addresses(integer, interval)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fabric_store_purge_addresses(integer, interval)', 'EXECUTE') then
    raise exception 'TEST FAILED: the purge is for the server only';
  end if;

  -- a running order (not paid yet): the guard refuses erasure, and the purge leaves it
  begin
    update public.fabric_store_order_addresses
    set recipient_name = null, recipient_phone = null, short_address = null, anonymized_at = now()
    where order_id = v_order;
    raise exception 'TEST FAILED: the address of a running order was erased';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_ADDRESS_IN_USE%' then raise; end if;
  end;

  -- paid (test card), shipped and delivered by the admin's dashboard trial
  set local role service_role;
  v_begin := public.fabric_store_begin_payment(pg_temp.h('privacy-ship'), 'test', pg_temp.h('payer-privacy-ship'));
  perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-privacy-ship',
                                             'https://checkout.moyasar.com/invoices/inv-privacy-ship');
  perform pg_temp.expect_status('paid', public.fabric_store_apply_payment(null, 'test', jsonb_build_object(
    'id', 'pay-privacy-ship', 'status', 'paid', 'amount', 17250, 'currency', 'SAR', 'invoice_id', 'inv-privacy-ship'), null), 'paid');
  perform pg_temp.expect_status('preparing', public.fabric_store_staff_set_fulfillment(v_order, 'preparing', pg_temp.admin(), null, null, null, true), 'ok');
  perform pg_temp.expect_status('shipped', public.fabric_store_staff_set_fulfillment(v_order, 'shipped', pg_temp.admin(), 'SMSA', 'AB123456', null, true), 'ok');
  perform pg_temp.expect_status('delivered', public.fabric_store_staff_set_fulfillment(v_order, 'delivered', pg_temp.admin(), null, null, null, true), 'ok');

  -- delivered just now: the 90-day retention keeps it
  v_res := public.fabric_store_purge_addresses(500);
  reset role;
  if (select anonymized_at from public.fabric_store_order_addresses where order_id = v_order) is not null then
    raise exception 'TEST FAILED: an address was erased before 90 days: %', v_res;
  end if;
  set local role service_role;
  perform pg_temp.expect_status('a negative retention', public.fabric_store_purge_addresses(10, interval '-1 day'), 'bad_request');
  if obj_description('public.fabric_store_purge_addresses(integer, interval)'::regprocedure, 'pg_proc') like '%R-CD-06%' then
    -- batch E (R-CD-06): no retention below 90 days, even for the server. The erasure past 90 days is
    -- checked locally (verify-stages ages the dates the stage 2 guard protects); here the delivered
    -- order's address is erased through the guard itself, which allows it for a finished order.
    perform pg_temp.expect_status('zero retention after batch E', public.fabric_store_purge_addresses(500, interval '0'), 'bad_request');
    reset role;
    update public.fabric_store_order_addresses
    set recipient_name = null, recipient_phone = null, short_address = null, anonymized_at = now()
    where order_id = v_order;
  else
    -- past the retention (zero here): erased, the city kept
    v_res := public.fabric_store_purge_addresses(500, interval '0');
    reset role;
  end if;
  select * into v_row from public.fabric_store_order_addresses where order_id = v_order;
  if v_row.anonymized_at is null or v_row.recipient_name is not null or v_row.recipient_phone is not null
     or v_row.short_address is not null or v_row.city is distinct from 'الرياض' then
    raise exception 'TEST FAILED: the finished order''s address is erased, the city kept: % / %', row_to_json(v_row), v_res;
  end if;
  begin
    update public.fabric_store_order_addresses set recipient_name = 'عودة' where order_id = v_order;
    raise exception 'TEST FAILED: an erased address was written again';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_ADDRESS_ANONYMIZED%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3) AUD-09: a paid attempt reconciled a day ago is due again daily (first 30 days)
-- ---------------------------------------------------------------------------
do $$
declare
  v_attempt uuid;
  v_rows jsonb;
begin
  select a.id into v_attempt from public.fabric_store_payment_attempts a
  where a.provider_invoice_id = 'inv-privacy-ship';
  update public.fabric_store_payment_attempts set reconciled_at = now() - interval '25 hours', reconcile_claimed_at = null
  where id = v_attempt;
  set local role service_role;
  v_rows := public.fabric_store_due_reconciliation('test', 50);
  reset role;
  if not exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'attempt_id' = v_attempt::text) then
    raise exception 'TEST FAILED: a paid attempt last reconciled 25 hours ago is due';
  end if;
  if (select prosrc from pg_proc where oid = 'public.fabric_store_due_reconciliation(text, integer)'::regprocedure)
     not like '%interval ''120 days''%' then
    raise exception 'TEST FAILED: paid attempts are reconciled up to 120 days';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) The shop was not touched: no income row, no invoice number used
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.income)::text || '#'
     || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq)
     is distinct from current_setting('fabric_store_test.income_before', true) then
    raise exception 'TEST FAILED: this test must not create a sale nor use an invoice number';
  end if;
end $$;

select 'PASS fabric_store privacy ops (visitors read fabric cards without cost or purchase columns, the dashboard keeps them, a running order keeps its address, a finished one is erased after the retention with its city kept and never rewritten, the purge is the server''s, paid attempts reconciled daily and up to 120 days, no income row and no invoice number used)' as result;

rollback;
