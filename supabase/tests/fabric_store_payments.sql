-- Exercise stage 5 (migration 20260924160000): payment attempts, provider events,
-- and applying a payment the server re-fetched from Moyasar — all AS service_role,
-- the way the Next.js routes call them.
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end. It creates
-- its own throwaway fabrics and orders (like the stage 3 and 4 tests) and never
-- inserts into income. No call leaves the database: Moyasar payments are JSON here.
--
-- Run after applying the stage 2, 3, 4 AND 5 migrations, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store payments (…)

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
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار السداد ' || p_label, 'اختبار السداد ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون اختبار ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار السداد');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار السداد', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            greatest(p_meters, 0), 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0
    where id = v_listing;
  end if;
  return query select v_item, v_color, v_listing;
end;
$$;

-- A 1 m pickup order at 100.00 SAR/m (total 115.00) through the stage 4 entry point.
-- Its access token is the text p_access; the hash is what the cookie proves.
create function pg_temp.order_for(p_access text, p_phone text) returns uuid language plpgsql as $$
declare
  v_listing uuid;
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  select listing_id into v_listing from pg_temp.make_fabric(p_access, 10);
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('payments-client-' || p_access),
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
exception when others then
  reset role;
  raise;
end;
$$;

-- Server-role wrappers around the stage 5 entry points.
-- Each order pays from its own sender by default (the start limit is 10 per sender per 10 minutes).
create function pg_temp.begin_pay(p_access text, p_client text default null) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_begin_payment(pg_temp.h(p_access), 'test', pg_temp.h(coalesce(p_client, 'payer-' || p_access)));
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.attach(p_attempt uuid, p_invoice text, p_url text default null) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_attach_invoice(p_attempt, p_invoice, coalesce(p_url, 'https://checkout.moyasar.com/invoices/' || p_invoice));
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.abandon(p_attempt uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_abandon_attempt(p_attempt, 'create_failed', 'اختبار');
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.event(p_event_id text, p_payment jsonb, p_env text default 'test') returns uuid language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_record_payment_event(p_env, 'webhook', p_event_id, 'payment_' || (p_payment ->> 'status'),
         p_payment ->> 'invoice_id', p_payment ->> 'id', jsonb_build_object('data', p_payment));
  reset role;
  return (v ->> 'event_id')::uuid;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.apply(p_event uuid, p_payment jsonb, p_hint uuid default null, p_env text default 'test')
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_apply_payment(p_event, p_env, p_payment, p_hint);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.view(p_access text, p_attempt uuid, p_client text default 'viewer') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_payment_view(pg_temp.h(p_access), p_attempt, pg_temp.h(p_client));
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.pay(p_id text, p_invoice text, p_status text, p_amount bigint default 11500, p_currency text default 'SAR')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'status', p_status, 'amount', p_amount, 'currency', p_currency,
                            'invoice_id', p_invoice, 'message', 'اختبار')
$$;

-- ---------------------------------------------------------------------------
-- 0) Privileges: eight server entry points, service_role only
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.fabric_store_begin_payment(bytea, text, bytea)',
    'public.fabric_store_attach_invoice(uuid, text, text)',
    'public.fabric_store_abandon_attempt(uuid, text, text)',
    'public.fabric_store_record_payment_event(text, text, text, text, text, text, jsonb)',
    'public.fabric_store_apply_payment(uuid, text, jsonb, uuid)',
    'public.fabric_store_note_event_failure(uuid, text, boolean)',
    'public.fabric_store_pending_payment_events(integer)',
    'public.fabric_store_payment_view(bytea, uuid, bytea)']
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
end $$;

-- ---------------------------------------------------------------------------
-- 1) Starting a payment: one open attempt, bounded by the hold, same link twice
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-start', '+966560000001');
  v_res jsonb;
  v_attempt uuid;
  v_row record;
  v_hold timestamptz;
begin
  perform pg_temp.expect_status('unknown token', pg_temp.begin_pay('nobody'), 'not_found');

  v_res := pg_temp.begin_pay('pay-start');
  perform pg_temp.expect_status('first start', v_res, 'created');
  v_attempt := (v_res ->> 'attempt_id')::uuid;
  select * into v_row from public.fabric_store_payment_attempts where id = v_attempt;
  select min(expires_at) into v_hold from public.fabric_store_stock_reservations where order_id = v_order;
  if v_row.status <> 'created' or v_row.amount_halalas <> 11500 or v_row.environment <> 'test'
     or v_row.expires_at > v_hold - interval '2 minutes'
     or v_row.expires_at > clock_timestamp() + interval '20 minutes' then
    raise exception 'TEST FAILED: the attempt must be created for 115.00 and end 2 min before the hold: % (hold %)',
      row_to_json(v_row), v_hold;
  end if;

  perform pg_temp.expect_status('a second start while the first is talking to Moyasar',
    pg_temp.begin_pay('pay-start'), 'in_progress');

  perform pg_temp.expect_status('an http checkout url', pg_temp.attach(v_attempt, 'inv-start', 'http://evil.example/x'), 'bad_request');
  perform pg_temp.expect_status('attach the invoice', pg_temp.attach(v_attempt, 'inv-start'), 'initiated');
  perform pg_temp.expect_status('attach twice', pg_temp.attach(v_attempt, 'inv-other'), 'not_created');

  v_res := pg_temp.begin_pay('pay-start');
  perform pg_temp.expect_status('pressing pay again', v_res, 'existing');
  if (v_res ->> 'attempt_id')::uuid <> v_attempt
     or v_res ->> 'checkout_url' <> 'https://checkout.moyasar.com/invoices/inv-start' then
    raise exception 'TEST FAILED: pressing pay again must return the same invoice link: %', v_res;
  end if;
  if (select count(*) from public.fabric_store_payment_attempts where order_id = v_order) <> 1 then
    raise exception 'TEST FAILED: pressing pay again opened a second attempt';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) The hold must outlive the payment page; at most five attempts per order
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid;
  v_res jsonb;
  i integer;
begin
  -- an order whose hold ends in 4 minutes: no payment page can fit before it
  v_order := pg_temp.order_for('short-hold-order', '+966560000002');
  delete from public.fabric_store_stock_reservations where order_id = v_order;
  perform private.fabric_store_reserve_order(v_order, clock_timestamp() + interval '4 minutes');
  perform pg_temp.expect_status('a hold ending in 4 minutes', pg_temp.begin_pay('short-hold-order'), 'hold_expiring');
  -- a released hold is the same as no hold
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار');
  perform pg_temp.expect_status('no live hold', pg_temp.begin_pay('short-hold-order', 'payer-b'), 'hold_expiring');
  -- a 10-minute hold leaves an 8-minute page (2 minutes before the hold ends)
  v_order := pg_temp.order_for('mid-hold-order', '+966560000011');
  delete from public.fabric_store_stock_reservations where order_id = v_order;
  perform private.fabric_store_reserve_order(v_order, clock_timestamp() + interval '10 minutes');
  v_res := pg_temp.begin_pay('mid-hold-order', 'payer-c');
  perform pg_temp.expect_status('a hold ending in 10 minutes', v_res, 'created');
  if (v_res ->> 'expires_at')::timestamptz > clock_timestamp() + interval '8 minutes' then
    raise exception 'TEST FAILED: the payment page must end 2 minutes before the hold: %', v_res;
  end if;

  -- five abandoned starts, then no more
  v_order := pg_temp.order_for('many-attempts', '+966560000003');
  for i in 1..5 loop
    v_res := pg_temp.begin_pay('many-attempts', 'many-' || i);
    perform pg_temp.expect_status('start ' || i, v_res, 'created');
    perform pg_temp.expect_status('abandon ' || i, pg_temp.abandon((v_res ->> 'attempt_id')::uuid), 'cancelled');
  end loop;
  perform pg_temp.expect_status('sixth start', pg_temp.begin_pay('many-attempts', 'many-6'), 'too_many_attempts');

  -- ten starts in ten minutes from one sender
  insert into private.fabric_store_rate_limits (bucket, subject_hash, window_start, hits)
  values ('payment_start', pg_temp.h('flooder'), to_timestamp(floor(extract(epoch from clock_timestamp()) / 600) * 600), 10);
  perform pg_temp.expect_status('eleventh start', pg_temp.begin_pay('many-attempts', 'flooder'), 'rate_limited');
end $$;

-- ---------------------------------------------------------------------------
-- 3) A verified payment: order paid once, confirm_order queued once
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-ok', '+966560000004');
  v_attempt uuid;
  v_event uuid;
  v_res jsonb;
  v_row record;
begin
  v_attempt := (pg_temp.begin_pay('pay-ok') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_attempt, 'inv-ok');

  -- authorised is not collected
  v_res := pg_temp.apply(pg_temp.event('evt-ok-auth', pg_temp.pay('pay-ok-1', 'inv-ok', 'authorized')),
                         pg_temp.pay('pay-ok-1', 'inv-ok', 'authorized'));
  perform pg_temp.expect_status('authorised only', v_res, 'ignored');
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'pending' then
    raise exception 'TEST FAILED: an authorisation marked the order paid';
  end if;

  v_event := pg_temp.event('evt-ok-paid', pg_temp.pay('pay-ok-1', 'inv-ok', 'paid'));
  v_res := pg_temp.apply(v_event, pg_temp.pay('pay-ok-1', 'inv-ok', 'paid'));
  perform pg_temp.expect_status('paid', v_res, 'paid');

  select o.payment_status, o.paid_attempt_id, o.needs_review, a.status as attempt_status, a.provider_payment_id
  into v_row
  from public.fabric_store_orders o join public.fabric_store_payment_attempts a on a.id = v_attempt
  where o.id = v_order;
  if v_row.payment_status <> 'paid' or v_row.paid_attempt_id <> v_attempt or v_row.needs_review
     or v_row.attempt_status <> 'paid' or v_row.provider_payment_id <> 'pay-ok-1' then
    raise exception 'TEST FAILED: the verified payment must mark order and attempt paid: %', row_to_json(v_row);
  end if;
  if (select count(*) from public.fabric_store_outbox
      where dedupe_key = 'confirm_order:' || v_order and topic = 'confirm_order' and order_id = v_order) <> 1 then
    raise exception 'TEST FAILED: a paid order must queue exactly one confirm_order task';
  end if;
  if not exists (select 1 from public.fabric_store_order_events
                 where order_id = v_order and event_type = 'payment_status' and to_value = 'paid' and actor_type = 'provider') then
    raise exception 'TEST FAILED: the audit log must show the provider marking the order paid';
  end if;
  if (select processing_status from public.fabric_store_payment_events where id = v_event) <> 'processed'
     or (select attempt_id from public.fabric_store_payment_events where id = v_event) <> v_attempt then
    raise exception 'TEST FAILED: the event must be processed and linked to its attempt';
  end if;

  -- the same event again, and the same payment seen by another route
  if (select (x ->> 'status') from (select public.fabric_store_record_payment_event('test', 'webhook', 'evt-ok-paid', 'payment_paid',
        'inv-ok', 'pay-ok-1', '{}'::jsonb) as x) s) <> 'duplicate' then
    raise exception 'TEST FAILED: a repeated webhook must be recorded once';
  end if;
  perform pg_temp.expect_status('the same payment again',
    pg_temp.apply(pg_temp.event('return:pay-ok-1:paid', pg_temp.pay('pay-ok-1', 'inv-ok', 'paid')),
                  pg_temp.pay('pay-ok-1', 'inv-ok', 'paid')), 'already_paid');
  -- a late "failed" never undoes a payment
  perform pg_temp.expect_status('failed after paid',
    pg_temp.apply(pg_temp.event('evt-ok-late-fail', pg_temp.pay('pay-ok-0', 'inv-ok', 'failed')),
                  pg_temp.pay('pay-ok-0', 'inv-ok', 'failed')), 'ignored');
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'paid'
     or (select count(*) from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) <> 1 then
    raise exception 'TEST FAILED: repeats or a late failure changed a paid order';
  end if;

  perform pg_temp.expect_status('pay a paid order', pg_temp.begin_pay('pay-ok'), 'already_paid');
end $$;

-- ---------------------------------------------------------------------------
-- 4) A payment that does not match its attempt is quarantined, never approved
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-mismatch', '+966560000005');
  v_attempt uuid;
  v_event uuid;
  v_row record;
begin
  v_attempt := (pg_temp.begin_pay('pay-mismatch') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_attempt, 'inv-mismatch');

  v_event := pg_temp.event('evt-mismatch', pg_temp.pay('pay-mm', 'inv-mismatch', 'paid', 100));
  perform pg_temp.expect_status('a 1.00 payment on a 115.00 order',
    pg_temp.apply(v_event, pg_temp.pay('pay-mm', 'inv-mismatch', 'paid', 100)), 'quarantined');
  select o.payment_status, o.needs_review, o.review_reason, a.status as attempt_status
  into v_row
  from public.fabric_store_orders o join public.fabric_store_payment_attempts a on a.id = v_attempt
  where o.id = v_order;
  if v_row.payment_status <> 'pending' or v_row.attempt_status = 'paid' or not v_row.needs_review
     or v_row.review_reason is null then
    raise exception 'TEST FAILED: a mismatched payment must flag the order, not pay it: %', row_to_json(v_row);
  end if;
  if (select processing_status from public.fabric_store_payment_events where id = v_event) <> 'quarantined'
     or not exists (select 1 from public.fabric_store_outbox where dedupe_key = 'payment_mismatch:pay-mm') then
    raise exception 'TEST FAILED: a mismatched payment must be quarantined and staff notified';
  end if;

  perform pg_temp.expect_status('wrong currency',
    pg_temp.apply(null, pg_temp.pay('pay-mm-2', 'inv-mismatch', 'paid', 11500, 'USD')), 'quarantined');
  -- a live-mode payment never matches a test attempt (and the reverse)
  perform pg_temp.expect_status('live payment on a test invoice',
    pg_temp.apply(null, pg_temp.pay('pay-mm-3', 'inv-mismatch', 'paid'), null, 'live'), 'unknown');
  perform pg_temp.expect_status('an invoice nobody knows',
    pg_temp.apply(null, pg_temp.pay('pay-mm-4', 'inv-nobody', 'paid')), 'unknown');
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'pending' then
    raise exception 'TEST FAILED: a mismatched payment marked the order paid';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Failed, retried, then a late success on the old attempt: flagged as overpaid
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-retry', '+966560000006');
  v_a uuid;
  v_b uuid;
  v_row record;
begin
  v_a := (pg_temp.begin_pay('pay-retry') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_a, 'inv-retry-a');
  perform pg_temp.expect_status('card declined',
    pg_temp.apply(null, pg_temp.pay('pay-retry-a1', 'inv-retry-a', 'failed')), 'failed');
  if (select status from public.fabric_store_payment_attempts where id = v_a) <> 'failed'
     or (select payment_status from public.fabric_store_orders where id = v_order) <> 'pending' then
    raise exception 'TEST FAILED: a declined card fails the attempt and leaves the order payable';
  end if;

  v_b := (pg_temp.begin_pay('pay-retry', 'payer-2') ->> 'attempt_id')::uuid;
  if v_b is null or v_b = v_a then
    raise exception 'TEST FAILED: after a declined card a new attempt must open';
  end if;
  perform pg_temp.attach(v_b, 'inv-retry-b');
  perform pg_temp.expect_status('second attempt paid',
    pg_temp.apply(null, pg_temp.pay('pay-retry-b1', 'inv-retry-b', 'paid')), 'paid');

  perform pg_temp.expect_status('a late success on the first invoice',
    pg_temp.apply(null, pg_temp.pay('pay-retry-a2', 'inv-retry-a', 'paid')), 'overpaid');
  select o.paid_attempt_id, o.needs_review, a.status as a_status
  into v_row
  from public.fabric_store_orders o join public.fabric_store_payment_attempts a on a.id = v_a
  where o.id = v_order;
  if v_row.paid_attempt_id <> v_b or not v_row.needs_review or v_row.a_status <> 'paid'
     or not exists (select 1 from public.fabric_store_outbox where dedupe_key = 'overpaid:pay-retry-a2') then
    raise exception 'TEST FAILED: a second successful payment keeps the first, flags the order and tells staff: %', row_to_json(v_row);
  end if;
  if (select count(*) from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) <> 1 then
    raise exception 'TEST FAILED: an overpayment must not queue a second confirmation';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) The start crashed after Moyasar created the invoice: the metadata hint recovers it
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-hint', '+966560000007');
  v_other uuid := pg_temp.order_for('pay-hint-other', '+966560000008');
  v_attempt uuid;
  v_other_attempt uuid;
begin
  v_attempt := (pg_temp.begin_pay('pay-hint') ->> 'attempt_id')::uuid;   -- never attached
  perform pg_temp.expect_status('paid on an unattached invoice, found by its metadata',
    pg_temp.apply(null, pg_temp.pay('pay-hint-1', 'inv-hint', 'paid'), v_attempt), 'paid');
  if (select provider_invoice_id from public.fabric_store_payment_attempts where id = v_attempt) <> 'inv-hint'
     or (select payment_status from public.fabric_store_orders where id = v_order) <> 'paid' then
    raise exception 'TEST FAILED: the hint must adopt the invoice and pay the order';
  end if;

  -- a hint never re-points an attempt that already has its own invoice
  v_other_attempt := (pg_temp.begin_pay('pay-hint-other') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_other_attempt, 'inv-hint-other');
  perform pg_temp.expect_status('hint to an attempt with another invoice',
    pg_temp.apply(null, pg_temp.pay('pay-hint-2', 'inv-stranger', 'paid'), v_other_attempt), 'unknown');
  if (select payment_status from public.fabric_store_orders where id = v_other) <> 'pending' then
    raise exception 'TEST FAILED: a stranger invoice paid another order through the hint';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) Paid after the hold is gone: recorded, never refused, flagged for review
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-late', '+966560000009');
  v_attempt uuid;
begin
  v_attempt := (pg_temp.begin_pay('pay-late') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_attempt, 'inv-late');
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار');
  perform pg_temp.expect_status('paid with no live hold',
    pg_temp.apply(null, pg_temp.pay('pay-late-1', 'inv-late', 'paid')), 'paid');
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'paid'
     or not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: money must be recorded and the order flagged when its hold is gone';
  end if;

  -- refunded at Moyasar with no refund on our side
  perform pg_temp.expect_status('refunded outside the system',
    pg_temp.apply(null, pg_temp.pay('pay-late-1', 'inv-late', 'refunded')), 'quarantined');
end $$;

do $$
declare
  v_order uuid := pg_temp.order_for('pay-cancelled', '+966560000012');
  v_attempt uuid;
begin
  v_attempt := (pg_temp.begin_pay('pay-cancelled') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_attempt, 'inv-cancelled');
  -- staff cancel the order while the customer is on the payment page
  perform set_config('fabric_store.actor_type', 'staff', true);
  update public.fabric_store_orders set fulfillment_status = 'cancelled', cancel_reason = 'اختبار' where id = v_order;
  perform pg_temp.expect_status('paid after cancellation',
    pg_temp.apply(null, pg_temp.pay('pay-cancelled-1', 'inv-cancelled', 'paid')), 'paid');
  if (select payment_status from public.fabric_store_orders where id = v_order) <> 'paid'
     or not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: money on a cancelled order must be recorded and flagged';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Event retries: failed until ten attempts, then quarantined; the queue lists due events
-- ---------------------------------------------------------------------------
do $$
declare
  v_event uuid;
  v_final uuid;
  v_old uuid;
  v_old_quarantined uuid;
  v_fresh uuid;
  i integer;
  v_res jsonb;
begin
  v_event := pg_temp.event('evt-retry', pg_temp.pay('pay-retry-x', 'inv-x', 'paid'));
  for i in 1..9 loop
    set local role service_role;
    v_res := public.fabric_store_note_event_failure(v_event, 'ميسر لا يرد', false);
    reset role;
    perform pg_temp.expect_status('transient failure ' || i, v_res, 'failed');
  end loop;
  set local role service_role;
  v_res := public.fabric_store_note_event_failure(v_event, 'ميسر لا يرد', false);
  reset role;
  perform pg_temp.expect_status('tenth failure', v_res, 'quarantined');

  v_final := pg_temp.event('evt-final', pg_temp.pay('pay-final', 'inv-final', 'paid'));
  set local role service_role;
  v_res := public.fabric_store_note_event_failure(v_final, 'secret mismatch', true);
  reset role;
  perform pg_temp.expect_status('a final failure quarantines at once', v_res, 'quarantined');

  insert into public.fabric_store_payment_events
    (provider, environment, source, provider_event_id, event_type, provider_payment_id, payload, received_at)
  values ('moyasar', 'test', 'webhook', 'evt-old', 'payment_paid', 'pay-old', '{}'::jsonb, now() - interval '5 minutes')
  returning id into v_old;
  -- an OLD quarantined event is never retried (a fresh one would be skipped by age alone)
  insert into public.fabric_store_payment_events
    (provider, environment, source, provider_event_id, event_type, provider_payment_id, payload, received_at,
     processing_status, last_error)
  values ('moyasar', 'test', 'webhook', 'evt-old-quarantined', 'payment_paid', 'pay-old-q', '{}'::jsonb,
          now() - interval '5 minutes', 'quarantined', 'اختبار')
  returning id into v_old_quarantined;
  -- an event received a moment ago is still being handled by its own request
  v_fresh := pg_temp.event('evt-fresh', pg_temp.pay('pay-fresh', 'inv-fresh', 'paid'));
  set local role service_role;
  v_res := public.fabric_store_pending_payment_events(50);
  reset role;
  if not exists (select 1 from jsonb_array_elements(v_res) e where (e ->> 'event_id')::uuid = v_old)
     or exists (select 1 from jsonb_array_elements(v_res) e
                where (e ->> 'event_id')::uuid in (v_event, v_final, v_fresh, v_old_quarantined)) then
    raise exception 'TEST FAILED: the retry queue must list due events, skip quarantined ones, and leave fresh ones alone: %', v_res;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9) The return page sees only its own order, and asks Moyasar at most every 10 s
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('pay-view', '+966560000010');
  v_attempt uuid;
  v_foreign uuid;
  v_res jsonb;
begin
  v_attempt := (pg_temp.begin_pay('pay-view') ->> 'attempt_id')::uuid;
  perform pg_temp.attach(v_attempt, 'inv-view');
  update public.fabric_store_payment_attempts set last_verified_at = now() - interval '1 minute' where id = v_attempt;

  v_res := pg_temp.view('pay-view', v_attempt);
  perform pg_temp.expect_status('return page', v_res, 'ok');
  if v_res ->> 'payment_status' <> 'pending' or (v_res -> 'attempt' ->> 'id')::uuid <> v_attempt
     or not (v_res ->> 'verify_due')::boolean then
    raise exception 'TEST FAILED: the return page must see its attempt and ask Moyasar: %', v_res;
  end if;
  if (pg_temp.view('pay-view', v_attempt) ->> 'verify_due')::boolean then
    raise exception 'TEST FAILED: a refresh within 10 seconds must not ask Moyasar again';
  end if;

  -- another order's attempt is invisible with this token
  v_foreign := (select id from public.fabric_store_payment_attempts where provider_invoice_id = 'inv-ok');
  v_res := pg_temp.view('pay-view', v_foreign);
  if v_res -> 'attempt' <> 'null'::jsonb or (v_res ->> 'verify_due')::boolean then
    raise exception 'TEST FAILED: a token saw another order''s attempt: %', v_res;
  end if;
  perform pg_temp.expect_status('a token that opens nothing', pg_temp.view('nobody', v_attempt), 'not_found');

  -- 120 status checks per sender per 10 minutes
  insert into private.fabric_store_rate_limits (bucket, subject_hash, window_start, hits)
  values ('payment_status', pg_temp.h('refresher'), to_timestamp(floor(extract(epoch from clock_timestamp()) / 600) * 600), 120);
  perform pg_temp.expect_status('the 121st status check', pg_temp.view('pay-view', v_attempt, 'refresher'), 'rate_limited');
end $$;

select 'PASS fabric_store payments (privileges, start bounded by the hold, same link twice, attempt cap, rate limit, verified payment once, authorisation is not payment, repeats and late failures, mismatches quarantined, live/test separated, retry after decline, overpayment flagged, crash recovery by metadata, late payment flagged, event retries, return page scope and throttle)' as result;

rollback;
