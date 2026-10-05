-- Exercise stage 7 (migration 20260929150000): staff actions on online orders —
-- preparing, ready for pickup, shipped (carrier + tracking), delivered, cancelling an
-- unpaid order, resolving a review flag, notes — AS service_role, like the dashboard routes.
--
-- SAFE ON THE LIVE DATABASE: no income row is created (test payments, and live payments
-- whose sale is never confirmed here). Case 9 checks that no sale and no invoice number
-- were used. Everything runs in ONE transaction that is ROLLED BACK at the end.
-- Run after applying the stage 2 → 7 migrations AND 20260929170000 (review fixes), in the
-- Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store order admin (…)

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

create function pg_temp.make_listing(p_label text, p_meters numeric) returns uuid language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار الإدارة ' || p_label, 'اختبار الإدارة ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار الإدارة');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار الإدارة', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            greatest(p_meters, 0), 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0
    where id = v_listing;
  end if;
  return v_listing;
end;
$$;

-- 1 m at 100.00 SAR/m. Pickup: 115.00. Shipping (+50.00): 172.50 (VAT 22.50 = 15.00 on the line + 7.50 on shipping).
create function pg_temp.order_for(p_access text, p_phone text, p_shipping boolean default false) returns uuid
language plpgsql as $$
declare
  v_listing uuid := pg_temp.make_listing(p_access, 10);
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('admin-client-' || p_access),
    'customer', jsonb_build_object('name', 'عميلة اختبار', 'phone', p_phone),
    'delivery', case when p_shipping
      then jsonb_build_object('method', 'shipping', 'option_code', 'ksa_flat', 'option_label', 'شحن داخل السعودية',
                              'shipping_net_halalas', 5000, 'shipping_vat_halalas', 750)
      else jsonb_build_object('method', 'pickup', 'shipping_net_halalas', 0, 'shipping_vat_halalas', 0) end,
    'address', case when p_shipping then jsonb_build_object(
      'recipient_name', 'عميلة اختبار', 'recipient_phone', p_phone, 'city', 'الرياض', 'short_address', 'RRRD2929') end,
    'totals', jsonb_build_object('items_net_halalas', 10000, 'vat_halalas', case when p_shipping then 2250 else 1500 end,
                                 'total_halalas', case when p_shipping then 17250 else 11500 end),
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
exception when others then
  reset role;
  raise;
end;
$$;

create function pg_temp.start(p_access text, p_env text) returns void language plpgsql as $$
declare
  v_begin jsonb;
begin
  set local role service_role;
  v_begin := public.fabric_store_begin_payment(pg_temp.h(p_access), p_env, pg_temp.h('payer-' || p_access));
  if v_begin ->> 'status' <> 'created' then
    raise exception 'TEST FAILED: fixture payment start for %: %', p_access, v_begin;
  end if;
  perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-' || p_access,
                                             'https://checkout.moyasar.com/invoices/inv-' || p_access);
  reset role;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.apply(p_access text, p_env text) returns jsonb language plpgsql as $$
declare
  v jsonb;
  v_amount bigint;
begin
  select o.total_halalas into v_amount from public.fabric_store_orders o where o.access_token_hash = pg_temp.h(p_access);
  set local role service_role;
  v := public.fabric_store_apply_payment(null, p_env, jsonb_build_object(
         'id', 'pay-' || p_access, 'status', 'paid', 'amount', v_amount, 'currency', 'SAR',
         'invoice_id', 'inv-' || p_access), null);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

-- A test-mode paid order whose confirmation ran (no sale; the hold consumed).
create function pg_temp.paid_test_order(p_access text, p_phone text, p_shipping boolean default false) returns uuid
language plpgsql as $$
declare
  v_order uuid := pg_temp.order_for(p_access, p_phone, p_shipping);
  v jsonb;
begin
  perform pg_temp.start(p_access, 'test');
  perform pg_temp.expect_status('fixture payment ' || p_access, pg_temp.apply(p_access, 'test'), 'paid');
  set local role service_role;
  v := public.fabric_store_confirm_order(v_order);
  reset role;
  perform pg_temp.expect_status('fixture confirm ' || p_access, v, 'test_no_sale');
  return v_order;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.set_to(p_order uuid, p_to text, p_carrier text default null, p_tracking text default null,
                               p_note text default null) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_staff_set_fulfillment(p_order, p_to, 'aaaaaaaa-0000-4000-8000-00000000abcd'::uuid,
                                                 p_carrier, p_tracking, p_note);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.review_snapshot(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object('reason', o.review_reason,
    'eventId', (select max(e.id)::text from public.fabric_store_order_events e where e.order_id = o.id),
    'alertIds', (select coalesce(jsonb_agg(t.id::text order by t.id::text), '[]'::jsonb)
                from public.fabric_store_outbox t
                where t.order_id = o.id and t.topic = 'notify_staff' and t.status <> 'done'))
  from public.fabric_store_orders o where o.id = p_order
$$;

create function pg_temp.resolve(p_order uuid, p_note text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_staff_resolve_review(p_order, 'aaaaaaaa-0000-4000-8000-00000000abcd'::uuid,
                                               p_note, pg_temp.review_snapshot(p_order));
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.note(p_order uuid, p_note text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_staff_add_note(p_order, 'aaaaaaaa-0000-4000-8000-00000000abcd'::uuid, p_note);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Privileges: three staff entry points, service_role only
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text)',
    'public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb)',
    'public.fabric_store_staff_add_note(uuid, uuid, text)']
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
  -- 20260929170000 replaces the 3-argument version; left in place it would resolve
  -- a review without comparing the staff snapshot.
  if to_regprocedure('public.fabric_store_staff_resolve_review(uuid, uuid, text)') is not null then
    raise exception 'TEST FAILED: the old resolve_review(uuid, uuid, text) still exists — apply 20260929170000';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Pickup: preparing → ready for pickup → delivered, each in the audit log with the staff id
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('admin-pickup', '+966560000301');
  v_row record;
begin
  perform pg_temp.expect_status('bad target', pg_temp.set_to(v_order, 'lost'), 'bad_request');
  perform pg_temp.expect_status('unknown order', pg_temp.set_to(gen_random_uuid(), 'preparing'), 'not_found');
  perform pg_temp.expect_status('skip preparing', pg_temp.set_to(v_order, 'delivered'), 'refused');
  perform pg_temp.expect_status('preparing', pg_temp.set_to(v_order, 'preparing', p_note => 'بدأ القص'), 'ok');
  perform pg_temp.expect_status('a pickup order is not shipped',
    pg_temp.set_to(v_order, 'shipped', 'سمسا', 'SMSA123'), 'refused');
  perform pg_temp.expect_status('ready for pickup', pg_temp.set_to(v_order, 'ready_for_pickup'), 'ok');
  perform pg_temp.expect_status('ready again (no-op)', pg_temp.set_to(v_order, 'ready_for_pickup'), 'ok');
  perform pg_temp.expect_status('handed over', pg_temp.set_to(v_order, 'delivered'), 'ok');

  select fulfillment_status, delivered_at, shipping_carrier into v_row from public.fabric_store_orders where id = v_order;
  if v_row.fulfillment_status <> 'delivered' or v_row.delivered_at is null or v_row.shipping_carrier is not null then
    raise exception 'TEST FAILED: the pickup order must end delivered, with no shipping data: %', row_to_json(v_row);
  end if;
  if (select count(*) from public.fabric_store_order_events
      where order_id = v_order and event_type = 'fulfillment_status' and actor_type = 'staff'
        and actor_id = 'aaaaaaaa-0000-4000-8000-00000000abcd') <> 3
     or not exists (select 1 from public.fabric_store_order_events
                    where order_id = v_order and event_type = 'note' and note = 'بدأ القص') then
    raise exception 'TEST FAILED: each step and the note must be logged with the staff id';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Shipping: shipped needs a carrier and a tracking number, kept for the customer
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('admin-ship', '+966560000302', true);
  v_row record;
begin
  perform pg_temp.expect_status('preparing', pg_temp.set_to(v_order, 'preparing'), 'ok');
  perform pg_temp.expect_status('a shipping order is not ready for pickup', pg_temp.set_to(v_order, 'ready_for_pickup'), 'refused');
  perform pg_temp.expect_status('shipped without data', pg_temp.set_to(v_order, 'shipped'), 'tracking_required');
  perform pg_temp.expect_status('shipped without a number', pg_temp.set_to(v_order, 'shipped', 'سمسا', null), 'tracking_required');
  perform pg_temp.expect_status('a tracking number with odd characters', pg_temp.set_to(v_order, 'shipped', 'سمسا', 'abc<script>'), 'tracking_required');
  perform pg_temp.expect_status('shipped', pg_temp.set_to(v_order, 'shipped', '  سمسا  ', ' smsa 29 29-01 '), 'ok');
  select shipping_carrier, tracking_number, shipped_at into v_row from public.fabric_store_orders where id = v_order;
  if v_row.shipping_carrier <> 'سمسا' or v_row.tracking_number <> 'SMSA2929-01' or v_row.shipped_at is null then
    raise exception 'TEST FAILED: carrier and tracking must be stored cleaned: %', row_to_json(v_row);
  end if;
  perform pg_temp.expect_status('back from shipped', pg_temp.set_to(v_order, 'preparing'), 'refused');
  perform pg_temp.expect_status('delivered', pg_temp.set_to(v_order, 'delivered'), 'ok');
  if (select tracking_number from public.fabric_store_orders where id = v_order) <> 'SMSA2929-01' then
    raise exception 'TEST FAILED: delivering must keep the tracking number';
  end if;

  -- shipping data belongs to shipping orders only (row constraint)
  begin
    update public.fabric_store_orders set tracking_number = 'X123'
    where id = (select id from public.fabric_store_orders where access_token_hash = pg_temp.h('admin-pickup'));
    raise exception 'TEST FAILED: a pickup order took a tracking number';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Unpaid orders: never prepared; cancelling one frees its fabric at once
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('admin-unpaid', '+966560000303');
  v_res jsonb;
begin
  v_res := pg_temp.set_to(v_order, 'preparing');
  perform pg_temp.expect_status('prepare unpaid', v_res, 'refused');
  if v_res ->> 'code' <> 'FABRIC_STORE_FULFILLMENT_UNPAID' then
    raise exception 'TEST FAILED: the refusal must say why: %', v_res;
  end if;
  v_res := pg_temp.set_to(v_order, 'cancelled', p_note => 'طلبت الزبونة الإلغاء');
  perform pg_temp.expect_status('cancel unpaid', v_res, 'ok');
  if (v_res ->> 'released_holds')::int <> 1
     or exists (select 1 from public.fabric_store_stock_reservations where order_id = v_order and status = 'active')
     or (select cancel_reason from public.fabric_store_orders where id = v_order) <> 'طلبت الزبونة الإلغاء' then
    raise exception 'TEST FAILED: cancelling an unpaid order must release its hold and keep the reason: %', v_res;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Paid orders are not cancelled here (the refund is stage 8, admin only)
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('admin-paid-cancel', '+966560000304');
begin
  perform pg_temp.expect_status('cancel a paid order', pg_temp.set_to(v_order, 'cancelled'), 'refund_required');
  if (select fulfillment_status from public.fabric_store_orders where id = v_order) <> 'unfulfilled' then
    raise exception 'TEST FAILED: a paid order must not be cancelled from the staff screen';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) A live payment whose sale is not recorded yet cannot be prepared
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('admin-live', '+966560000305');
begin
  perform pg_temp.start('admin-live', 'live');
  perform pg_temp.expect_status('live payment', pg_temp.apply('admin-live', 'live'), 'paid');
  perform pg_temp.expect_status('prepare before the sale exists', pg_temp.set_to(v_order, 'preparing'), 'sale_pending');
end $$;

-- ---------------------------------------------------------------------------
-- 6) Review flag: blocks preparing; resolved only with a note; staff alerts closed
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('admin-review', '+966560000306');
  v_res jsonb;
begin
  perform pg_temp.start('admin-review', 'test');
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار: انتهت المهلة');
  perform pg_temp.expect_status('late payment', pg_temp.apply('admin-review', 'test'), 'paid');
  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
  values ('notify_staff', 'stock_unavailable:test-' || v_order, v_order, '{}'::jsonb);
  if not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: fixture — the late payment must be flagged';
  end if;

  v_res := pg_temp.set_to(v_order, 'preparing');
  if v_res ->> 'status' <> 'refused' or v_res ->> 'code' <> 'FABRIC_STORE_FULFILLMENT_UNDER_REVIEW' then
    raise exception 'TEST FAILED: a flagged order must not be prepared: %', v_res;
  end if;
  perform pg_temp.expect_status('resolve without a note', pg_temp.resolve(v_order, '  '), 'note_required');
  v_res := pg_temp.resolve(v_order, 'تأكدنا من توفر القماش في المحل');
  perform pg_temp.expect_status('resolve', v_res, 'ok');
  if (v_res ->> 'closed_alerts')::int <> 1
     or (select needs_review from public.fabric_store_orders where id = v_order)
     or exists (select 1 from public.fabric_store_outbox where order_id = v_order and topic = 'notify_staff' and status <> 'done')
     or not exists (select 1 from public.fabric_store_order_events where order_id = v_order and event_type = 'review_flag'
                    and to_value = 'false' and actor_type = 'staff')
     or not exists (select 1 from public.fabric_store_order_events where order_id = v_order and event_type = 'note'
                    and note like 'حُسمت المراجعة: تأكدنا%') then
    raise exception 'TEST FAILED: resolving must lift the flag, close the alerts and log who and why: %', v_res;
  end if;
  perform pg_temp.expect_status('resolve again', pg_temp.resolve(v_order, 'مرة ثانية'), 'not_flagged');
  perform pg_temp.expect_status('prepare after resolving (test payment)', pg_temp.set_to(v_order, 'preparing'), 'ok');
end $$;

-- A screen loaded before a new financial alert cannot dismiss that alert.
do $$
declare
  v_order uuid := pg_temp.order_for('review-stale', '+966560009991');
  v_snapshot jsonb;
  v_result jsonb;
begin
  perform set_config('fabric_store.actor_type', 'system', true);
  update public.fabric_store_orders set needs_review = true, review_reason = 'Check pickup' where id = v_order;
  v_snapshot := pg_temp.review_snapshot(v_order);
  insert into public.fabric_store_outbox(topic, dedupe_key, order_id, payload)
  values ('notify_staff', 'overpaid:stale-review-test', v_order, '{"reason":"overpaid"}'::jsonb);
  set local role service_role;
  v_result := public.fabric_store_staff_resolve_review(v_order, 'aaaaaaaa-0000-4000-8000-00000000abcd',
    'Pickup verified', v_snapshot);
  reset role;
  perform pg_temp.expect_status('stale review snapshot', v_result, 'review_changed');
  if not (select needs_review from public.fabric_store_orders where id = v_order)
     or (select status from public.fabric_store_outbox where dedupe_key = 'overpaid:stale-review-test') <> 'pending' then
    raise exception 'TEST FAILED: stale review must preserve the flag and new financial alert';
  end if;
  perform pg_temp.expect_status('missing review snapshot',
    public.fabric_store_staff_resolve_review(v_order, 'aaaaaaaa-0000-4000-8000-00000000abcd', 'Old client'), 'review_changed');
  perform pg_temp.expect_status('review after refreshing', pg_temp.resolve(v_order, 'Both issues checked'), 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- 7) Notes
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('admin-note', '+966560000307');
begin
  perform pg_temp.expect_status('empty note', pg_temp.note(v_order, ' '), 'note_required');
  perform pg_temp.expect_status('note on an unknown order', pg_temp.note(gen_random_uuid(), 'ملاحظة'), 'not_found');
  perform pg_temp.expect_status('note', pg_temp.note(v_order, 'اتصلت الزبونة تسأل عن اللون'), 'ok');
  if (select actor_id from public.fabric_store_order_events where order_id = v_order and event_type = 'note')
     <> 'aaaaaaaa-0000-4000-8000-00000000abcd' then
    raise exception 'TEST FAILED: the note must carry the staff id';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9) The shop was not touched: no income row, no invoice number used
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.income)::text || '#'
     || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq)
     is distinct from current_setting('fabric_store_test.income_before', true) then
    raise exception 'TEST FAILED: this test must not create a sale nor use an invoice number';
  end if;
end $$;

select 'PASS fabric_store order admin (privileges, pickup flow with staff id in the log, shipping needs carrier + tracking and keeps them, unpaid never prepared and cancelling frees the fabric, paid not cancelled here, live payment without its sale blocked, review blocks and is lifted only with a note, notes, no income row and no invoice number used)' as result;

rollback;
