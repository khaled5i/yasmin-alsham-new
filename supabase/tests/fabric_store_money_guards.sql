-- Exercise fix batch C (migration 20261005120000): AUD-06 (test payments do not ship), AUD-05 (no
-- second invoice beside a payable failed one; no cancelling while a payment page is open), AUD-04
-- (extra payments and payments on cancelled orders: refundable, and alerted until refunded),
-- AUD-03 (a refund made outside the system is quarantined, alerted, and recordable), AUD-08 (a new
-- refund after a closed-but-sent one needs Moyasar support's reference) and AUD-12 (the money
-- functions check that the actor is an active admin) — AS service_role, like the dashboard routes.
--
-- SAFE ON THE LIVE DATABASE: TEST payments only (no sale, no stock movement), no income row and no
-- invoice number (checked at the end). The admin actor is an existing active admin read from
-- public.users. Everything runs in ONE transaction that is ROLLED BACK.
-- Run after applying the stage 2 → 9 migrations and fix batches A, B and C, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store money guards (…)

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
-- not an active admin: an existing non-admin account when there is one, else an unknown id
create function pg_temp.not_admin() returns uuid language sql stable as $$
  select coalesce((select u.id from public.users u where u.role <> 'admin' order by u.created_at, u.id limit 1),
                  'aaaaaaaa-0000-4000-8000-00000000abcd'::uuid)
$$;

create function pg_temp.make_listing(p_label text) returns uuid language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار الدفعة C ' || p_label, 'اختبار الدفعة C ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', 10, 'رصيد اختبار الدفعة C');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار الدفعة C', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            10, 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0
    where id = v_listing;
  end if;
  return v_listing;
end;
$$;

-- 1 m at 100.00 SAR/m, pickup: 115.00 (11500 halalas).
create function pg_temp.order_for(p_access text, p_phone text) returns uuid language plpgsql as $$
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
    'client_hash', pg_temp.hex('guards-client-' || p_access),
    'customer', jsonb_build_object('name', 'عميلة اختبار', 'phone', p_phone),
    'delivery', jsonb_build_object('method', 'pickup', 'shipping_net_halalas', 0, 'shipping_vat_halalas', 0),
    'totals', jsonb_build_object('items_net_halalas', 10000, 'vat_halalas', 1500, 'total_halalas', 11500),
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

-- «ادفعي»: a payment attempt with its (fake) Moyasar invoice attached. Returns begin_payment's answer.
create function pg_temp.open_page(p_access text, p_invoice text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_begin_payment(pg_temp.h(p_access), 'test', pg_temp.h('payer-' || p_access));
  if v ->> 'status' = 'created' then
    perform public.fabric_store_attach_invoice((v ->> 'attempt_id')::uuid, p_invoice,
                                               'https://checkout.moyasar.com/invoices/' || p_invoice);
  end if;
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.apply(p_payment text, p_invoice text, p_status text, p_refunded bigint default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_apply_payment(null, 'test', jsonb_build_object(
         'id', p_payment, 'status', p_status, 'amount', 11500, 'currency', 'SAR',
         'invoice_id', p_invoice, 'refunded', p_refunded), null);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.fulfil(p_order uuid, p_to text, p_actor uuid, p_allow_test boolean) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_staff_set_fulfillment(p_order, p_to, p_actor, null, null, null, p_allow_test);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.refund(p_order uuid, p_actor uuid, p_amount bigint, p_cancel boolean,
                               p_attempt uuid default null, p_support text default null,
                               p_key uuid default gen_random_uuid()) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_refund_begin(p_order, p_actor, 'مدير الاختبار', p_amount, 'سبب الاختبار', p_cancel, p_key,
                                        p_attempt, p_support);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

-- the refund's claim holder records the call, then Moyasar shows p_refunded
create function pg_temp.settle(p_refund uuid, p_refunded bigint) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  if (select r.provider_called_at from public.fabric_store_refunds r where r.id = p_refund) is null then
    perform pg_temp.expect_status('call recorded', public.fabric_store_refund_mark_called(p_refund,
      (select r.claim_token from public.fabric_store_refunds r where r.id = p_refund)), 'ok');
  end if;
  v := public.fabric_store_refund_finish(p_refund,
         (select r.claim_token from public.fabric_store_refunds r where r.id = p_refund), 'succeeded', p_refunded, null);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.alert_for(p_kind text, p_order uuid) returns boolean language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_staff_alerts();
  reset role;
  return exists (select 1 from jsonb_array_elements(v) a where a ->> 'kind' = p_kind and a ->> 'order_id' = p_order::text);
exception when others then reset role; raise;
end;
$$;

-- what the dashboard sends with «حسم المراجعة» (the review snapshot)
create function pg_temp.resolve(p_order uuid, p_actor uuid) returns jsonb language plpgsql as $$
declare
  v_snapshot jsonb;
  v jsonb;
begin
  select jsonb_build_object(
    'reason', o.review_reason,
    'eventId', (select max(e.id)::text from public.fabric_store_order_events e where e.order_id = o.id),
    'alertIds', (select coalesce(jsonb_agg(t.id::text order by t.id::text), '[]'::jsonb) from public.fabric_store_outbox t
                 where t.order_id = o.id and t.topic = 'notify_staff' and t.status <> 'done'))
  into v_snapshot
  from public.fabric_store_orders o where o.id = p_order;
  set local role service_role;
  v := public.fabric_store_staff_resolve_review(p_order, p_actor, 'راجعتها', v_snapshot);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Signatures and privileges
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  if pg_temp.admin() is null then
    raise exception 'TEST FAILED: no active admin in public.users to act as the refund manager';
  end if;
  if to_regprocedure('public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text)') is not null
     or to_regprocedure('public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid)') is not null then
    raise exception 'TEST FAILED: the old signatures must be gone (a second function would bypass the fix)';
  end if;
  foreach v_fn in array array[
    'public.fabric_store_begin_payment(bytea, text, bytea)',
    'public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text, boolean)',
    'public.fabric_store_apply_payment(uuid, text, jsonb, uuid)',
    'public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid, uuid, text)',
    'public.fabric_store_refund_finish(uuid, uuid, text, bigint, text)',
    'public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint)',
    'public.fabric_store_refund_record_external(uuid, uuid, uuid, text, bigint, text, text, bigint, uuid)',
    'public.fabric_store_staff_alerts()']
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
      raise exception 'TEST FAILED: % must be security definer with an empty search_path', v_fn;
    end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'private.fabric_store_actor_is_admin(uuid)', 'EXECUTE') then
      raise exception 'TEST FAILED: % can execute the admin check', v_role;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1) AUD-06: a TEST payment does not move to preparing/shipping/delivery — except the admin's
--    explicit «تجربة اللوحة», which is logged
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('guards-test-order', '+966561000001');
begin
  perform pg_temp.open_page('guards-test-order', 'inv-guards-test-order');
  perform pg_temp.expect_status('test payment', pg_temp.apply('pay-guards-test-order', 'inv-guards-test-order', 'paid'), 'paid');
  perform pg_temp.expect_status('no flag', pg_temp.fulfil(v_order, 'preparing', pg_temp.admin(), false), 'test_order');
  perform pg_temp.expect_status('flag from a non-admin', pg_temp.fulfil(v_order, 'preparing', pg_temp.not_admin(), true), 'forbidden');
  perform pg_temp.expect_status('ready without flag', pg_temp.fulfil(v_order, 'ready_for_pickup', pg_temp.admin(), false), 'test_order');
  perform pg_temp.expect_status('delivered without flag', pg_temp.fulfil(v_order, 'delivered', pg_temp.admin(), false), 'test_order');
  if (select fulfillment_status from public.fabric_store_orders where id = v_order) <> 'unfulfilled' then
    raise exception 'TEST FAILED: the test order moved';
  end if;
  perform pg_temp.expect_status('the admin tries the dashboard', pg_temp.fulfil(v_order, 'preparing', pg_temp.admin(), true), 'ok');
  if not exists (select 1 from public.fabric_store_order_events where order_id = v_order and event_type = 'note'
                 and actor_id = pg_temp.admin() and note like 'تجربة اللوحة%') then
    raise exception 'TEST FAILED: the dashboard trial on a test payment is logged';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) AUD-05: a declined card leaves the invoice payable — the same link comes back, no second
--    invoice beside it; near its end we wait; after it a new invoice
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('guards-declined', '+966561000002');
  v_first jsonb;
  v_again jsonb;
begin
  v_first := pg_temp.open_page('guards-declined', 'inv-guards-declined-1');
  perform pg_temp.expect_status('first page', v_first, 'created');
  perform pg_temp.expect_status('card declined', pg_temp.apply('pay-guards-declined-1', 'inv-guards-declined-1', 'failed'), 'failed');
  v_again := pg_temp.open_page('guards-declined', 'inv-guards-declined-2');
  perform pg_temp.expect_status('«ادفعي» again', v_again, 'existing');
  if v_again ->> 'attempt_id' <> v_first ->> 'attempt_id'
     or v_again ->> 'checkout_url' <> 'https://checkout.moyasar.com/invoices/inv-guards-declined-1' then
    raise exception 'TEST FAILED: the declined invoice''s own link comes back: %', v_again;
  end if;
  if (select count(*) from public.fabric_store_payment_attempts where order_id = v_order) <> 1 then
    raise exception 'TEST FAILED: no second attempt beside a payable invoice';
  end if;

  -- staff cannot cancel while that page can still take a payment (owner decision)
  perform pg_temp.expect_status('cancel with a payable declined page', pg_temp.fulfil(v_order, 'cancelled', pg_temp.admin(), false),
                                'payment_in_progress');

  update public.fabric_store_payment_attempts set expires_at = clock_timestamp() + interval '30 seconds'
  where id = (v_first ->> 'attempt_id')::uuid;
  perform pg_temp.expect_status('the old page is about to end', pg_temp.open_page('guards-declined', 'inv-guards-declined-2'),
                                'invoice_closing');

  update public.fabric_store_payment_attempts set expires_at = created_at + interval '1 millisecond'
  where id = (v_first ->> 'attempt_id')::uuid;
  perform pg_temp.expect_status('after it ended, a new invoice', pg_temp.open_page('guards-declined', 'inv-guards-declined-2'),
                                'created');
end $$;

-- ---------------------------------------------------------------------------
-- 3) AUD-05 (owner decision): no cancelling while the payment page is open; after it ends, yes
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('guards-open-cancel', '+966561000003');
  v_page jsonb;
  v_res jsonb;
begin
  v_page := pg_temp.open_page('guards-open-cancel', 'inv-guards-open-cancel');
  v_res := pg_temp.fulfil(v_order, 'cancelled', pg_temp.admin(), false);
  perform pg_temp.expect_status('cancel with an open page', v_res, 'payment_in_progress');
  if (v_res ->> 'retry_after')::timestamptz is distinct from (v_page ->> 'expires_at')::timestamptz then
    raise exception 'TEST FAILED: the refusal says when the page ends: % / %', v_res, v_page;
  end if;
  update public.fabric_store_payment_attempts set expires_at = created_at + interval '1 millisecond'
  where id = (v_page ->> 'attempt_id')::uuid;
  perform pg_temp.expect_status('cancel after the page ended', pg_temp.fulfil(v_order, 'cancelled', pg_temp.not_admin(), false), 'ok');

  -- AUD-04: the page's late payment lands on a cancelled order — alerted until refunded, whatever the review says
  perform pg_temp.expect_status('late payment', pg_temp.apply('pay-guards-open-cancel', 'inv-guards-open-cancel', 'paid'), 'paid');
  if not pg_temp.alert_for('cancelled_paid_unrefunded', v_order) then
    raise exception 'TEST FAILED: a payment on a cancelled order is an alert';
  end if;
  perform pg_temp.expect_status('a manager resolves the review', pg_temp.resolve(v_order, pg_temp.not_admin()), 'ok');
  if not pg_temp.alert_for('cancelled_paid_unrefunded', v_order) then
    raise exception 'TEST FAILED: resolving the review does not hide money that was not refunded';
  end if;
  v_res := pg_temp.refund(v_order, pg_temp.admin(), 11500, false);
  perform pg_temp.expect_status('refund the late payment', v_res, 'started');
  perform pg_temp.expect_status('Moyasar shows it', pg_temp.settle((v_res ->> 'refund_id')::uuid, 11500), 'succeeded');
  if pg_temp.alert_for('cancelled_paid_unrefunded', v_order) then
    raise exception 'TEST FAILED: the alert ends once the money is refunded';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) AUD-04: a second successful payment — refunded in full from the system, without touching the
--    order's payment status; alerted until refunded, whatever the review says
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('guards-extra', '+966561000004');
  v_a jsonb;
  v_b jsonb;
  v_res jsonb;
begin
  v_a := pg_temp.open_page('guards-extra', 'inv-guards-extra-a');
  perform pg_temp.apply('pay-guards-extra-a1', 'inv-guards-extra-a', 'failed');
  update public.fabric_store_payment_attempts set expires_at = created_at + interval '1 millisecond'
  where id = (v_a ->> 'attempt_id')::uuid;
  v_b := pg_temp.open_page('guards-extra', 'inv-guards-extra-b');
  perform pg_temp.expect_status('second page', v_b, 'created');
  perform pg_temp.expect_status('paid on B', pg_temp.apply('pay-guards-extra-b', 'inv-guards-extra-b', 'paid'), 'paid');
  perform pg_temp.expect_status('a late success on A', pg_temp.apply('pay-guards-extra-a2', 'inv-guards-extra-a', 'paid'), 'overpaid');
  if not pg_temp.alert_for('extra_payment_unrefunded', v_order) then
    raise exception 'TEST FAILED: an extra payment is an alert';
  end if;
  perform pg_temp.expect_status('a manager resolves the review', pg_temp.resolve(v_order, pg_temp.not_admin()), 'ok');
  if not pg_temp.alert_for('extra_payment_unrefunded', v_order) then
    raise exception 'TEST FAILED: resolving the review does not hide an extra payment';
  end if;

  perform pg_temp.expect_status('not an admin', pg_temp.refund(v_order, pg_temp.not_admin(), 11500, false, (v_a ->> 'attempt_id')::uuid), 'forbidden');
  perform pg_temp.expect_status('part of it', pg_temp.refund(v_order, pg_temp.admin(), 5000, false, (v_a ->> 'attempt_id')::uuid), 'extra_full_only');
  perform pg_temp.expect_status('as a cancellation', pg_temp.refund(v_order, pg_temp.admin(), 11500, true, (v_a ->> 'attempt_id')::uuid), 'extra_full_only');
  perform pg_temp.expect_status('an attempt of another order', pg_temp.refund(v_order, pg_temp.admin(), 11500, false, gen_random_uuid()), 'not_refundable');
  v_res := pg_temp.refund(v_order, pg_temp.admin(), 11500, false, (v_a ->> 'attempt_id')::uuid);
  perform pg_temp.expect_status('refund the extra payment', v_res, 'started');
  if (v_res ->> 'extra_payment')::boolean is distinct from true then
    raise exception 'TEST FAILED: the refund is on the extra payment: %', v_res;
  end if;
  perform pg_temp.expect_status('Moyasar shows it', pg_temp.settle((v_res ->> 'refund_id')::uuid, 11500), 'succeeded');
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'paid'
     or (select paid_attempt_id from public.fabric_store_orders where id = v_order) <> (v_b ->> 'attempt_id')::uuid
     or exists (select 1 from public.fabric_store_refunds where order_id = v_order and income_id is not null) then
    raise exception 'TEST FAILED: refunding the extra payment leaves the order paid by B, with no return row';
  end if;
  if pg_temp.alert_for('extra_payment_unrefunded', v_order) then
    raise exception 'TEST FAILED: the alert ends once the extra payment is refunded';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) AUD-03: a partial refund made in the Moyasar dashboard (status stays paid) is quarantined,
--    flagged and alerted; the admin records it (no call); in-system refunds work afterwards.
--    Our own refund in flight (sent, not yet finished) is NOT external.
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('guards-external', '+966561000005');
  v_attempt uuid;
  v_res jsonb;
  v_key uuid := gen_random_uuid();
begin
  v_attempt := (pg_temp.open_page('guards-external', 'inv-guards-external') ->> 'attempt_id')::uuid;
  perform pg_temp.expect_status('paid', pg_temp.apply('pay-guards-external', 'inv-guards-external', 'paid', 0), 'paid');
  perform pg_temp.fulfil(v_order, 'preparing', pg_temp.admin(), true);  -- cut: partial refunds allowed

  -- our own refund, sent and not yet confirmed: Moyasar already shows it — not external
  v_res := pg_temp.refund(v_order, pg_temp.admin(), 1000, false);
  perform pg_temp.expect_status('our refund', v_res, 'started');
  set local role service_role;
  perform public.fabric_store_refund_mark_called((v_res ->> 'refund_id')::uuid,
    (select claim_token from public.fabric_store_refunds where id = (v_res ->> 'refund_id')::uuid));
  reset role;
  v_res := pg_temp.apply('pay-guards-external', 'inv-guards-external', 'paid', 1000);
  if (v_res ->> 'external_refund')::boolean or pg_temp.alert_for('external_refund', v_order) then
    raise exception 'TEST FAILED: our own refund in flight is not an external refund: %', v_res;
  end if;
  perform pg_temp.expect_status('ours confirmed', pg_temp.settle(
    (select id from public.fabric_store_refunds where order_id = v_order and status = 'pending'), 1000), 'succeeded');

  -- 50 SAR more refunded from the Moyasar dashboard
  update public.fabric_store_orders set needs_review = false, review_reason = null where id = v_order and needs_review;
  v_res := pg_temp.apply('pay-guards-external', 'inv-guards-external', 'paid', 6000);
  perform pg_temp.expect_status('reconciliation sees it', v_res, 'already_paid');
  if (v_res ->> 'external_refund')::boolean is distinct from true
     or not (select needs_review from public.fabric_store_orders where id = v_order)
     or (select provider_refunded_halalas from public.fabric_store_payment_attempts where id = v_attempt) <> 6000
     or not pg_temp.alert_for('external_refund', v_order) then
    raise exception 'TEST FAILED: a refund outside the system is flagged and alerted: %', v_res;
  end if;
  perform pg_temp.expect_status('a manager resolves the review', pg_temp.resolve(v_order, pg_temp.not_admin()), 'ok');
  if not pg_temp.alert_for('external_refund', v_order) then
    raise exception 'TEST FAILED: resolving the review does not hide an unrecorded refund';
  end if;

  set local role service_role;
  perform pg_temp.expect_status('record it: not an admin', public.fabric_store_refund_record_external(
    v_order, v_attempt, pg_temp.not_admin(), 'x', 5000, 'MOY-DASH-1', 'رد من اللوحة', 6000, gen_random_uuid()), 'forbidden');
  perform pg_temp.expect_status('record it: another amount', public.fabric_store_refund_record_external(
    v_order, v_attempt, pg_temp.admin(), 'مدير', 4000, 'MOY-DASH-1', 'رد من اللوحة', 6000, gen_random_uuid()), 'amount_mismatch');
  perform pg_temp.expect_status('record it: no reference', public.fabric_store_refund_record_external(
    v_order, v_attempt, pg_temp.admin(), 'مدير', 5000, ' ', 'رد من اللوحة', 6000, gen_random_uuid()), 'bad_request');
  perform pg_temp.expect_status('record it', public.fabric_store_refund_record_external(
    v_order, v_attempt, pg_temp.admin(), 'مدير', 5000, 'MOY-DASH-1', 'رد من اللوحة', 6000, v_key), 'ok');
  perform pg_temp.expect_status('record it again (same key)', public.fabric_store_refund_record_external(
    v_order, v_attempt, pg_temp.admin(), 'مدير', 5000, 'MOY-DASH-1', 'رد من اللوحة', 6000, v_key), 'existing');
  reset role;
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'partially_refunded'
     or (select provider_called_at from public.fabric_store_refunds where idempotency_key = v_key) is not null
     or (select external_reference from public.fabric_store_refunds where idempotency_key = v_key) <> 'MOY-DASH-1'
     or pg_temp.alert_for('external_refund', v_order) then
    raise exception 'TEST FAILED: the recorded external refund is in the ledger, never called, and the alert ends';
  end if;
  begin
    update public.fabric_store_refunds set external_reference = 'OTHER' where idempotency_key = v_key;
    raise exception 'TEST FAILED: the external reference was rewritten';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_REFUND_IMMUTABLE%' then raise; end if;
  end;
  v_res := pg_temp.refund(v_order, pg_temp.admin(), 1000, false);
  perform pg_temp.expect_status('an in-system refund afterwards', v_res, 'started');
  if (v_res ->> 'refunded_before')::bigint <> 6000 then
    raise exception 'TEST FAILED: the next refund builds on what Moyasar shows: %', v_res;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) AUD-08 + AUD-12: closing a sent refund is the admin's; a new refund on that payment needs
--    Moyasar support's reference; if the closed one shows up later it is an alert
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('guards-late', '+966561000006');
  v_res jsonb;
  v_refund uuid;
begin
  perform pg_temp.open_page('guards-late', 'inv-guards-late');
  perform pg_temp.apply('pay-guards-late', 'inv-guards-late', 'paid', 0);
  perform pg_temp.fulfil(v_order, 'preparing', pg_temp.admin(), true);
  perform pg_temp.expect_status('refund by a non-admin', pg_temp.refund(v_order, pg_temp.not_admin(), 1000, false), 'forbidden');
  v_res := pg_temp.refund(v_order, pg_temp.admin(), 1000, false);
  v_refund := (v_res ->> 'refund_id')::uuid;
  set local role service_role;
  perform public.fabric_store_refund_mark_called(v_refund, (select claim_token from public.fabric_store_refunds where id = v_refund));
  reset role;
  update public.fabric_store_refunds set provider_called_at = now() - interval '25 hours' where id = v_refund;
  set local role service_role;
  perform pg_temp.expect_status('close: not an admin', public.fabric_store_refund_close_unconfirmed(
    v_refund, pg_temp.not_admin(), 'STL-1', 'لم يظهر في التسوية', 0), 'forbidden');
  perform pg_temp.expect_status('close', public.fabric_store_refund_close_unconfirmed(
    v_refund, pg_temp.admin(), 'STL-1', 'لم يظهر في التسوية', 0), 'ok');
  reset role;
  perform pg_temp.expect_status('a new refund, no support reference', pg_temp.refund(v_order, pg_temp.admin(), 1000, false),
                                'support_reference_required');
  perform pg_temp.expect_status('a too short reference', pg_temp.refund(v_order, pg_temp.admin(), 1000, false, null, 'x'),
                                'bad_request');
  v_res := pg_temp.refund(v_order, pg_temp.admin(), 1000, false, null, 'MOY-TICKET-77');
  perform pg_temp.expect_status('with Moyasar support''s reference', v_res, 'started');
  if (select support_reference from public.fabric_store_refunds where id = (v_res ->> 'refund_id')::uuid) <> 'MOY-TICKET-77' then
    raise exception 'TEST FAILED: the support reference is kept on the refund';
  end if;
  -- the closed one is executed late: Moyasar shows both — more than our ledger
  perform pg_temp.settle((v_res ->> 'refund_id')::uuid, 1000);
  perform pg_temp.apply('pay-guards-late', 'inv-guards-late', 'paid', 2000);
  if not pg_temp.alert_for('external_refund', v_order) then
    raise exception 'TEST FAILED: a closed refund executed late is an alert';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) The shop was not touched: no income row, no invoice number used
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.income)::text || '#'
     || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq)
     is distinct from current_setting('fabric_store_test.income_before', true) then
    raise exception 'TEST FAILED: this test must not create a sale nor use an invoice number';
  end if;
end $$;

select 'PASS fabric_store money guards (signatures and privileges, test payments do not ship except the admin''s logged trial, a declined invoice''s own link comes back, no cancelling while a page can take payment, payments on cancelled orders and extra payments refundable and alerted past a review, external refunds quarantined, alerted, recorded without a call, a refund after a closed sent one needs Moyasar support''s reference, the money functions need an active admin, no income row and no invoice number used)' as result;

rollback;
