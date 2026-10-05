-- LOCAL REPLICA ONLY — never run this on Supabase: it creates income rows (a sale, then
-- a negative refund row), which consumes numbers from the shop's invoice sequence even
-- inside a rolled-back transaction. The live-safe checks are in supabase/tests/fabric_store_refunds.sql.
--
-- Stage 8, the full path: a live sale refunded — the negative refund row in income, fabric
-- back to stock through an IN movement, the locks, the credit note — AS service_role.
-- The fixture helpers are the stage 6 ones (scripts/db-local/stage6-local-sale.sql).
-- Success = the last result row reads: PASS stage 8 local refund (…)

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

create function pg_temp.begin_refund(p_order uuid, p_amount bigint, p_cancel boolean, p_reason text,
                                     p_key uuid default gen_random_uuid()) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_refund_begin(p_order, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'مديرة',
                                        p_amount, p_reason, p_cancel, p_key);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.finish_refund(p_refund uuid, p_refunded bigint) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_refund_finish(p_refund,
         (select r.claim_token from public.fabric_store_refunds r where r.id = p_refund), 'succeeded', p_refunded, null);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.restock(p_order uuid, p_lines jsonb, p_key uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_restock_return(p_order, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, p_lines,
                                          'استلمنا المرتجع وفحصناه', p_key);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.stock(p_color uuid) returns numeric language sql as $$
  select current_quantity from public.fabric_inventory_colors where id = p_color
$$;

-- ---------------------------------------------------------------------------
-- 1) Cancel a live sale before the cut: a negative refund row, all the fabric back
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid; v_color uuid; v_listing uuid;
  v_order uuid;
  v_res jsonb;
  v_sale record;
  v_refund_row record;
  v_refund uuid;
  v_next bigint;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('R1', 10);
  v_order := pg_temp.simple_order('local-r1', '+966560000901', v_listing);
  perform pg_temp.start('local-r1');
  perform pg_temp.expect_status('pay', pg_temp.apply('local-r1'), 'paid');
  perform pg_temp.expect_status('confirm', pg_temp.confirm(v_order), 'confirmed');
  select * into v_sale from public.income where id = (select income_id from public.fabric_store_orders where id = v_order);
  if pg_temp.stock(v_color) is distinct from 9 then raise exception 'TEST FAILED: fixture — the sale takes 1 m'; end if;

  v_res := pg_temp.begin_refund(v_order, 11500, true, 'طلبت الزبونة الإلغاء قبل القص');
  perform pg_temp.expect_status('begin cancel', v_res, 'started');
  v_refund := (v_res ->> 'refund_id')::uuid;
  select case when is_called then last_value + 1 else last_value end into v_next from public.fabrics_invoice_number_seq;
  v_res := pg_temp.finish_refund(v_refund, 11500);
  perform pg_temp.expect_status('finish cancel', v_res, 'succeeded');

  select * into v_refund_row from public.income where id = (v_res ->> 'refund_income_id')::uuid;
  -- NULL-safe: a missing row must fail here, not slip through NULL comparisons
  if v_refund_row.id is null or v_refund_row.branch <> 'fabrics' or v_refund_row.category <> 'fabric_store_refund'
     or v_refund_row.amount <> -115.00 or v_refund_row.payment_method <> 'network'
     or v_refund_row.customer_source <> 'المتجر الإلكتروني' or not v_refund_row.is_automatic
     or v_refund_row.invoice_number <> v_next or v_refund_row.invoice_number = v_sale.invoice_number
     or v_refund_row.description not like '%مرتجع عن الفاتورة ' || v_sale.invoice_number
     or v_refund_row.buyer_phone <> v_sale.buyer_phone or v_refund_row.notes <> 'طلبت الزبونة الإلغاء قبل القص'
     or v_refund_row.fabric_items is not null or v_refund_row.quantity_meters is not null
     or v_refund_row.date <> (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'TEST FAILED: the refund row: %', row_to_json(v_refund_row);
  end if;
  if (select income_id from public.fabric_store_refunds where id = v_refund) is distinct from v_refund_row.id then
    raise exception 'TEST FAILED: the refund is linked to its row in income';
  end if;
  if exists (select 1 from public.fabric_inventory_movements where sale_income_id = v_refund_row.id) then
    raise exception 'TEST FAILED: the stock trigger must ignore the refund row';
  end if;
  if (select amount from public.income where id = v_sale.id) is distinct from 115.00
     or (select count(*) from public.fabric_inventory_movements where sale_income_id = v_sale.id) is distinct from 1 then
    raise exception 'TEST FAILED: the original sale stays as it was';
  end if;

  if pg_temp.stock(v_color) is distinct from 10 or (select stock_quantity from public.fabrics where id = v_listing) is distinct from 10 then
    raise exception 'TEST FAILED: the whole metre goes back to stock and to the storefront card (stock %)', pg_temp.stock(v_color);
  end if;
  if (select count(*) || ':' || min(reason) || ':' || sum(quantity_cm) from public.fabric_store_restocks where order_id = v_order)
     <> '1:cancelled_before_cut:100'
     or not exists (select 1 from public.fabric_inventory_movements m
                    join public.fabric_store_restocks r on r.movement_id = m.id
                    where r.order_id = v_order and m.movement_type = 'in' and m.quantity = 1
                      and m.sale_income_id is null and m.color_id = v_color
                      and m.created_by = 'aaaaaaaa-0000-4000-8000-000000000001') then
    raise exception 'TEST FAILED: one IN movement in the admin''s name, recorded in the restock ledger';
  end if;
  if (select fulfillment_status || ':' || payment_status from public.fabric_store_orders where id = v_order) is distinct from 'cancelled:refunded' then
    raise exception 'TEST FAILED: the order ends cancelled and refunded';
  end if;

  -- the refund row is locked like the online sale
  begin
    update public.income set amount = -1 where id = v_refund_row.id;
    raise exception 'TEST FAILED: the refund row amount changed';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_ONLINE_SALE_LOCKED%' then raise; end if;
  end;
  begin
    delete from public.income where id = v_refund_row.id;
    raise exception 'TEST FAILED: the refund row was deleted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_ONLINE_SALE_LOCKED%' then raise; end if;
  end;
  update public.income set notes = 'ملاحظة المحاسب' where id = v_refund_row.id;

  -- credit note: recorded once
  set local role service_role;
  v_res := public.fabric_store_record_credit_note(v_refund, 'aaaaaaaa-0000-4000-8000-000000000001', ' CN-77 ');
  perform pg_temp.expect_status('credit note', v_res, 'ok');
  v_res := public.fabric_store_record_credit_note(v_refund, 'aaaaaaaa-0000-4000-8000-000000000001', 'CN-77');
  perform pg_temp.expect_status('credit note again', v_res, 'ok');
  v_res := public.fabric_store_record_credit_note(v_refund, 'aaaaaaaa-0000-4000-8000-000000000001', 'CN-78');
  perform pg_temp.expect_status('another credit note', v_res, 'already_recorded');
  reset role;
  if (select credit_note_code from public.fabric_store_refunds where id = v_refund) is distinct from 'CN-77' then
    raise exception 'TEST FAILED: the credit note code is kept trimmed';
  end if;
  v_res := pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": 100}]');
  perform pg_temp.expect_status('restock a cancelled order again', v_res, 'not_cut');
end $$;

-- ---------------------------------------------------------------------------
-- 2) After the cut: a partial refund row, then returned fabric back to stock by hand
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid; v_color uuid; v_listing uuid;
  v_order uuid;
  v_res jsonb;
  v_key uuid := gen_random_uuid();
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('R2', 10);
  v_order := pg_temp.simple_order('local-r2', '+966560000902', v_listing, 300);
  perform pg_temp.start('local-r2');
  perform pg_temp.expect_status('pay', pg_temp.apply('local-r2'), 'paid');
  perform pg_temp.expect_status('confirm', pg_temp.confirm(v_order), 'confirmed');
  if pg_temp.stock(v_color) is distinct from 7 then raise exception 'TEST FAILED: fixture — the sale takes 3 m'; end if;

  v_res := pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": 100}]');
  perform pg_temp.expect_status('restock before the cut', v_res, 'not_cut');

  set local role service_role;
  perform pg_temp.expect_status('cut', public.fabric_store_staff_set_fulfillment(v_order, 'preparing',
    'aaaaaaaa-0000-4000-8000-000000000001', null, null, null), 'ok');
  reset role;

  v_res := pg_temp.begin_refund(v_order, 11500, false, 'أرجعت الزبونة متراً سليماً');
  perform pg_temp.expect_status('partial begin', v_res, 'started');
  v_res := pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 11500);
  perform pg_temp.expect_status('partial finish', v_res, 'succeeded');
  if (select amount from public.income where id = (v_res ->> 'refund_income_id')::uuid) is distinct from -115.00
     or (v_res ->> 'restocked_lines')::int <> 0 or pg_temp.stock(v_color) is distinct from 7 then
    raise exception 'TEST FAILED: a partial refund writes its row and does not touch the stock: %', v_res;
  end if;

  v_res := pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": 100}]', v_key);
  perform pg_temp.expect_status('restock 1 m', v_res, 'ok');
  perform pg_temp.expect_status('same request again', pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": 100}]', v_key), 'already_done');
  if pg_temp.stock(v_color) is distinct from 8 then raise exception 'TEST FAILED: 1 m back (stock %)', pg_temp.stock(v_color); end if;
  perform pg_temp.expect_status('more than what was sold', pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": 250}]'), 'exceeds');
  perform pg_temp.expect_status('a line that is not there', pg_temp.restock(v_order, '[{"line_number": 2, "quantity_cm": 50}]'), 'bad_request');
  perform pg_temp.expect_status('a bad length', pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": -50}]'), 'bad_request');
  if pg_temp.stock(v_color) is distinct from 8 or (select sum(quantity_cm) from public.fabric_store_restocks where order_id = v_order) is distinct from 100 then
    raise exception 'TEST FAILED: refused restocks leave nothing behind';
  end if;
  perform pg_temp.expect_status('the rest', pg_temp.restock(v_order, '[{"line_number": 1, "quantity_cm": 200}]'), 'ok');
  if pg_temp.stock(v_color) is distinct from 10 then raise exception 'TEST FAILED: all 3 m back at most'; end if;
end $$;

select 'PASS stage 8 local refund (a cancelled live sale gets one negative refund row with its own invoice number, the stock trigger ignores it, the original sale stays, the metre goes back through an IN movement in the admin''s name, the refund row is locked, one credit note; a partial refund does not touch stock, returned fabric goes back by hand up to what was sold, once per request)' as result;

rollback;
