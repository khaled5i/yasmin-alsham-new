-- Exercise stage 8 (migration 20260930091944): refunds (full, partial, cancel before the
-- cut), the refund reconciliation queue, the refunded-payment webhook, restock and credit
-- note refusals — AS service_role, like the dashboard routes and the scheduled job.
--
-- SAFE ON THE LIVE DATABASE: no income row is created. Refunds here are on TEST payments
-- (no sale), or on a live payment whose sale was never recorded (cancelled first). The
-- path that writes a refund row into income and puts fabric back in stock is LOCAL ONLY:
-- scripts/db-local/stage8-local-refund.sql. The last case checks that no sale and no
-- invoice number were used. Everything runs in ONE transaction that is ROLLED BACK.
-- Run after applying the stage 2 → 8 migrations AND the stage 8 correction (20260930135711),
-- in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store refunds (…)

begin;

select set_config('fabric_store_test.income_before',
  (select count(*) from public.income)::text || '#'
  || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq), false);

-- Fix batch C (20261005120000) changed two signatures and made the money functions check that the
-- actor is an active admin (AUD-12). The actor is therefore a real active admin from public.users
-- (read only), and the calls whose meaning changed with C branch on pg_temp.fix_c().
create function pg_temp.fix_c() returns boolean language sql stable as $fn$
  select to_regprocedure('public.fabric_store_refund_record_external(uuid, uuid, uuid, text, bigint, text, text, bigint, uuid)') is not null
$fn$;
create function pg_temp.actor() returns uuid language sql stable as $fn$
  select coalesce((select u.id from public.users u where u.role = 'admin' and u.is_active order by u.created_at, u.id limit 1),
                  'aaaaaaaa-0000-4000-8000-00000000abcd'::uuid)
$fn$;

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
  values ('اختبار الاسترداد ' || p_label, 'اختبار الاسترداد ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار الاسترداد');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار الاسترداد', 'https://example.invalid/fabric-store-test.jpg', 100.00,
            greatest(p_meters, 0), 1, true, true, v_item, v_color)
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
  v_listing uuid := pg_temp.make_listing(p_access, 10);
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('refund-client-' || p_access),
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

create function pg_temp.pay(p_access text, p_env text, p_status text default 'paid', p_refunded bigint default null)
returns jsonb language plpgsql as $$
declare
  v_begin jsonb;
  v jsonb;
  v_amount bigint;
begin
  select o.total_halalas into v_amount from public.fabric_store_orders o where o.access_token_hash = pg_temp.h(p_access);
  set local role service_role;
  if p_status = 'paid' then
    v_begin := public.fabric_store_begin_payment(pg_temp.h(p_access), p_env, pg_temp.h('payer-' || p_access));
    if v_begin ->> 'status' <> 'created' then
      raise exception 'TEST FAILED: fixture payment start for %: %', p_access, v_begin;
    end if;
    perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-' || p_access,
                                               'https://checkout.moyasar.com/invoices/inv-' || p_access);
  end if;
  v := public.fabric_store_apply_payment(null, p_env, jsonb_build_object(
         'id', 'pay-' || p_access, 'status', p_status, 'amount', v_amount, 'currency', 'SAR',
         'invoice_id', 'inv-' || p_access, 'refunded', p_refunded), null);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

-- A test-mode paid order whose confirmation ran (no sale; the hold consumed).
create function pg_temp.paid_test_order(p_access text, p_phone text) returns uuid language plpgsql as $$
declare
  v_order uuid := pg_temp.order_for(p_access, p_phone);
  v jsonb;
begin
  perform pg_temp.expect_status('fixture payment ' || p_access, pg_temp.pay(p_access, 'test'), 'paid');
  set local role service_role;
  v := public.fabric_store_confirm_order(v_order);
  reset role;
  perform pg_temp.expect_status('fixture confirm ' || p_access, v, 'test_no_sale');
  return v_order;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.begin_refund(p_order uuid, p_amount bigint, p_cancel boolean, p_key uuid default gen_random_uuid(),
                                     p_reason text default 'طلبت الزبونة الإلغاء', p_support text default null)
returns jsonb language plpgsql as $$
declare v jsonb; v_actor uuid := pg_temp.actor();
begin
  set local role service_role;
  if p_support is null then
    v := public.fabric_store_refund_begin(p_order, v_actor, 'مدير الاختبار',
                                          p_amount, p_reason, p_cancel, p_key);
  else
    v := public.fabric_store_refund_begin(p_order, v_actor, 'مدير الاختبار',
                                          p_amount, p_reason, p_cancel, p_key, null, p_support);
  end if;
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.finish_refund(p_refund uuid, p_outcome text, p_refunded bigint, p_message text default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  -- as the current claim holder
  v := public.fabric_store_refund_finish(p_refund,
         (select r.claim_token from public.fabric_store_refunds r where r.id = p_refund), p_outcome, p_refunded, p_message);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.set_to(p_order uuid, p_to text) returns jsonb language plpgsql as $$
declare v jsonb; v_actor uuid := pg_temp.actor(); v_c boolean := pg_temp.fix_c();
begin
  set local role service_role;
  if v_c then
    -- these are TEST payments: after fix C only an admin's explicit «تجربة اللوحة» moves them (AUD-06)
    v := public.fabric_store_staff_set_fulfillment(p_order, p_to, v_actor, null, null, null, true);
  else
    v := public.fabric_store_staff_set_fulfillment(p_order, p_to, v_actor,
                                                   null, null, null);
  end if;
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Privileges: six new entry points, service_role only; the restock ledger read-only
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    case when pg_temp.fix_c() then 'public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid, uuid, text)'
         else 'public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid)' end,
    'public.fabric_store_refund_finish(uuid, uuid, text, bigint, text)',
    'public.fabric_store_due_refunds(integer)',
    'public.fabric_store_refund_mark_called(uuid, uuid)',
    'public.fabric_store_restock_return(uuid, uuid, jsonb, text, uuid)',
    'public.fabric_store_record_credit_note(uuid, uuid, text)',
    'public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint)']
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
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.fabric_store_restocks', 'SELECT') then
      raise exception 'TEST FAILED: % can read fabric_store_restocks', v_role;
    end if;
    if has_sequence_privilege(v_role, pg_get_serial_sequence('public.fabric_store_restocks', 'id'), 'UPDATE') then
      raise exception 'TEST FAILED: % can move the restock id sequence', v_role;
    end if;
  end loop;
  if has_table_privilege('service_role', 'public.fabric_store_restocks', 'INSERT')
     or has_table_privilege('service_role', 'public.fabric_store_restocks', 'DELETE') then
    raise exception 'TEST FAILED: the restock ledger is written by its function only';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.fabric_store_restocks'::regclass) then
    raise exception 'TEST FAILED: RLS must be on for fabric_store_restocks';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Cancel before the cut: full refund, the order cancelled, preparing blocked meanwhile
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-cancel', '+966560000801');
  v_key uuid := gen_random_uuid();
  v_res jsonb;
  v_refund uuid;
  v_row record;
begin
  perform pg_temp.expect_status('no reason', pg_temp.begin_refund(v_order, 11500, true, p_reason => ' '), 'bad_request');
  perform pg_temp.expect_status('zero amount', pg_temp.begin_refund(v_order, 0, true), 'bad_request');
  perform pg_temp.expect_status('cancel with part of the amount', pg_temp.begin_refund(v_order, 5000, true), 'bad_request');
  perform pg_temp.expect_status('all of it before the cut without cancelling', pg_temp.begin_refund(v_order, 11500, false), 'use_cancel');
  perform pg_temp.expect_status('more than paid', pg_temp.begin_refund(v_order, 11600, true), 'exceeds');
  perform pg_temp.expect_status('unknown order', pg_temp.begin_refund(gen_random_uuid(), 100, false), 'not_found');

  v_res := pg_temp.begin_refund(v_order, 11500, true, v_key);
  perform pg_temp.expect_status('start the cancellation', v_res, 'started');
  v_refund := (v_res ->> 'refund_id')::uuid;
  if v_res ->> 'payment_id' <> 'pay-refund-cancel' or (v_res ->> 'refunded_before')::bigint <> 0
     or v_res ->> 'environment' <> 'test' then
    raise exception 'TEST FAILED: begin must return what the server needs for Moyasar: %', v_res;
  end if;
  perform pg_temp.expect_status('same key again', pg_temp.begin_refund(v_order, 11500, true, v_key), 'existing');
  perform pg_temp.expect_status('same key, other amount', pg_temp.begin_refund(v_order, 100, false, v_key), 'key_conflict');
  perform pg_temp.expect_status('a second refund while one is pending', pg_temp.begin_refund(v_order, 100, false), 'refund_in_progress');
  perform pg_temp.expect_status('no cutting while the cancellation is pending', pg_temp.set_to(v_order, 'preparing'), 'refund_pending');
  -- (review v2) the row itself refuses, not only the staff function
  begin
    perform set_config('fabric_store.actor_type', 'staff', true);
    update public.fabric_store_orders set fulfillment_status = 'preparing' where id = v_order;
    raise exception 'TEST FAILED: a direct update cut the fabric during a pending cancellation';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_REFUND_PENDING_CUT%' then raise; end if;
  end;

  perform pg_temp.expect_status('Moyasar does not show it yet', pg_temp.finish_refund(v_refund, 'succeeded', 0), 'not_confirmed');
  perform pg_temp.expect_status('Moyasar confirms', pg_temp.finish_refund(v_refund, 'succeeded', 11500), 'succeeded');
  perform pg_temp.expect_status('finish twice', pg_temp.finish_refund(v_refund, 'succeeded', 11500), 'already_succeeded');

  select o.payment_status, o.fulfillment_status, o.cancel_reason, o.cancelled_at, o.needs_review into v_row
  from public.fabric_store_orders o where o.id = v_order;
  if v_row.payment_status <> 'refunded' or v_row.fulfillment_status <> 'cancelled' or v_row.cancelled_at is null
     or v_row.cancel_reason <> 'طلبت الزبونة الإلغاء' or v_row.needs_review then
    raise exception 'TEST FAILED: the order must end refunded and cancelled with its reason: %', row_to_json(v_row);
  end if;
  if exists (select 1 from public.fabric_store_restocks where order_id = v_order)
     or (select income_id from public.fabric_store_refunds where id = v_refund) is not null then
    raise exception 'TEST FAILED: a test payment sold nothing — nothing goes back to stock, no refund row in income';
  end if;
  if (select count(*) from public.fabric_store_order_events
      where order_id = v_order and event_type = 'fulfillment_status' and to_value = 'cancelled'
        and actor_type = 'staff' and actor_id = pg_temp.actor()) is distinct from 1 then
    raise exception 'TEST FAILED: the cancellation must be logged in the name of the admin who started it';
  end if;
  perform pg_temp.expect_status('refund a refunded order', pg_temp.begin_refund(v_order, 100, false), 'not_refundable');
  perform pg_temp.expect_status('same key after success', pg_temp.begin_refund(v_order, 11500, true, v_key), 'existing');
end $$;

-- ---------------------------------------------------------------------------
-- 2) After the cut: partial refunds up to what was paid, never a cancellation
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-partial', '+966560000802');
  v_res jsonb;
begin
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  perform pg_temp.expect_status('cancel after the cut', pg_temp.begin_refund(v_order, 11500, true), 'already_cut');

  v_res := pg_temp.begin_refund(v_order, 3000, false, p_reason => 'نقص في الطول');
  perform pg_temp.expect_status('partial', v_res, 'started');
  perform pg_temp.expect_status('partial confirmed',
    pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 3000), 'succeeded');
  if (select payment_status from public.fabric_store_orders where id = v_order) is distinct from 'partially_refunded' then
    raise exception 'TEST FAILED: a partial refund leaves the order partially_refunded';
  end if;
  perform pg_temp.expect_status('still being prepared', pg_temp.set_to(v_order, 'ready_for_pickup'), 'ok');

  perform pg_temp.expect_status('more than what is left', pg_temp.begin_refund(v_order, 8600, false), 'exceeds');
  v_res := pg_temp.begin_refund(v_order, 8500, false, p_reason => 'عيب في القماش');
  if (v_res ->> 'refunded_before')::bigint <> 3000 then
    raise exception 'TEST FAILED: the second refund must know what was refunded before: %', v_res;
  end if;
  perform pg_temp.expect_status('the rest, Moyasar shows the old total only',
    pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 3000), 'not_confirmed');
  perform pg_temp.expect_status('the rest confirmed',
    pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 11500), 'succeeded');
  if (select payment_status from public.fabric_store_orders where id = v_order) is distinct from 'refunded' then
    raise exception 'TEST FAILED: refunding everything leaves the order refunded';
  end if;
  v_res := pg_temp.set_to(v_order, 'delivered');
  if v_res ->> 'status' <> 'refused' or v_res ->> 'code' <> 'FABRIC_STORE_FULFILLMENT_UNPAID' then
    raise exception 'TEST FAILED: a fully refunded order is not handed over: %', v_res;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Moyasar refused, or shows a refund we never recorded
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-fail', '+966560000803');
  v_res jsonb;
  v_refund uuid;
begin
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  v_res := pg_temp.begin_refund(v_order, 2000, false, p_reason => 'تعويض تأخير');
  perform pg_temp.expect_status('refused by Moyasar',
    pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'failed', null, 'Moyasar 400: amount'), 'failed');
  if (select payment_status from public.fabric_store_orders where id = v_order) is distinct from 'paid'
     or (select status from public.fabric_store_refunds where id = (v_res ->> 'refund_id')::uuid) is distinct from 'failed' then
    raise exception 'TEST FAILED: a refused refund changes nothing but its own row';
  end if;

  v_res := pg_temp.begin_refund(v_order, 2000, false, p_reason => 'تعويض تأخير');
  v_refund := (v_res ->> 'refund_id')::uuid;
  perform pg_temp.expect_status('a refund we did not record', pg_temp.finish_refund(v_refund, 'mismatch', null, 'refunded=5000'), 'mismatch');
  if not (select needs_review from public.fabric_store_orders where id = v_order)
     or not exists (select 1 from public.fabric_store_outbox
                    where dedupe_key = 'refund_mismatch:' || v_refund and topic = 'notify_staff') then
    raise exception 'TEST FAILED: a mismatch flags the order and tells the staff';
  end if;

  v_order := pg_temp.paid_test_order('refund-over', '+966560000804');
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  v_res := pg_temp.begin_refund(v_order, 1000, false, p_reason => 'تعويض');
  perform pg_temp.expect_status('Moyasar shows more than we asked',
    pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 4000), 'succeeded');
  if not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: an over-refund at Moyasar flags the order';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) A live payment whose sale is not recorded: only a cancellation, and no sale after it
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('refund-live', '+966560000805');
  v_res jsonb;
begin
  perform pg_temp.expect_status('live payment', pg_temp.pay('refund-live', 'live'), 'paid');
  perform pg_temp.expect_status('partial before the sale', pg_temp.begin_refund(v_order, 1000, false), 'sale_pending');
  v_res := pg_temp.begin_refund(v_order, 11500, true);
  perform pg_temp.expect_status('cancel before the sale', v_res, 'started');
  perform pg_temp.expect_status('cancel confirmed',
    pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 11500), 'succeeded');
  if (select fulfillment_status from public.fabric_store_orders where id = v_order) is distinct from 'cancelled'
     or (select status from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) is distinct from 'done' then
    raise exception 'TEST FAILED: the cancelled live order is closed and its sale task closed';
  end if;
  set local role service_role;
  v_res := public.fabric_store_confirm_order(v_order);
  reset role;
  perform pg_temp.expect_status('no sale for a refunded order', v_res, 'not_paid');
end $$;

-- ---------------------------------------------------------------------------
-- 5) Moyasar's "refunded" webhook: ours is not a review; an unknown one still is
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-hook', '+966560000806');
  v_res jsonb;
begin
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  v_res := pg_temp.begin_refund(v_order, 5000, false, p_reason => 'قطعة معيبة');
  perform pg_temp.expect_status('our refund, reported while pending',
    pg_temp.pay('refund-hook', 'test', 'refunded', 5000), 'ignored');
  perform pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 5000);
  perform pg_temp.expect_status('our refund, reported again', pg_temp.pay('refund-hook', 'test', 'refunded', 5000), 'ignored');
  if (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: a refund we recorded must not flag the order';
  end if;
  perform pg_temp.expect_status('a refund we never made', pg_temp.pay('refund-hook', 'test', 'refunded', 9000), 'quarantined');
  if not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: an unknown refund at Moyasar flags the order';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) The reconciliation queue claims pending refunds once, and skips claimed ones
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-queue', '+966560000807');
  v_res jsonb;
  v_refund uuid;
  v_due jsonb;
begin
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  v_res := pg_temp.begin_refund(v_order, 1500, false, p_reason => 'تعويض');
  v_refund := (v_res ->> 'refund_id')::uuid;
  set local role service_role;
  v_due := public.fabric_store_due_refunds(50);
  reset role;
  if exists (select 1 from jsonb_array_elements(v_due) e where e ->> 'refund_id' = v_refund::text) then
    raise exception 'TEST FAILED: a refund the route is still calling Moyasar for is not handed to the job';
  end if;
  update public.fabric_store_refunds set locked_until = now() - interval '1 second' where id = v_refund;
  set local role service_role;
  v_due := public.fabric_store_due_refunds(50);
  reset role;
  if not exists (select 1 from jsonb_array_elements(v_due) e
                 where e ->> 'refund_id' = v_refund::text and e ->> 'payment_id' = 'pay-refund-queue'
                   and (e ->> 'refunded_before')::bigint = 0 and (e ->> 'amount_halalas')::bigint = 1500) then
    raise exception 'TEST FAILED: an abandoned refund goes to the job with what it needs: %', v_due;
  end if;
  set local role service_role;
  v_due := public.fabric_store_due_refunds(50);
  reset role;
  if exists (select 1 from jsonb_array_elements(v_due) e where e ->> 'refund_id' = v_refund::text) then
    raise exception 'TEST FAILED: a claimed refund is not handed out twice';
  end if;
  set local role service_role;
  perform pg_temp.expect_status('mark the call while holding the claim', public.fabric_store_refund_mark_called(v_refund,
    (select claim_token from public.fabric_store_refunds where id = v_refund)), 'ok');
  reset role;
  if (select provider_called_at from public.fabric_store_refunds where id = v_refund) is null then
    raise exception 'TEST FAILED: the call is recorded before it is made';
  end if;
  update public.fabric_store_refunds set locked_until = now() - interval '1 second' where id = v_refund;
  set local role service_role;
  perform pg_temp.expect_status('mark the call without the claim', public.fabric_store_refund_mark_called(v_refund,
    (select claim_token from public.fabric_store_refunds where id = v_refund)), 'held_elsewhere');
  v_due := public.fabric_store_due_refunds(50);
  reset role;
  if not exists (select 1 from jsonb_array_elements(v_due) e where e ->> 'refund_id' = v_refund::text and (e ->> 'called')::boolean) then
    raise exception 'TEST FAILED: the job must know a call may already have gone out: %', v_due;
  end if;
  -- (review v2) the claim is the token, not the clock: the old holder is refused, and even the
  -- new holder may not call Moyasar a second time for the same refund
  set local role service_role;
  perform pg_temp.expect_status('an old claim token', public.fabric_store_refund_mark_called(v_refund, gen_random_uuid()), 'held_elsewhere');
  perform pg_temp.expect_status('a second call for the same refund', public.fabric_store_refund_mark_called(v_refund,
    (select (e ->> 'claim_token')::uuid from jsonb_array_elements(v_due) e where e ->> 'refund_id' = v_refund::text)), 'already_called');
  perform pg_temp.expect_status('an old holder writes a result', public.fabric_store_refund_finish(v_refund, gen_random_uuid(),
    'succeeded', 1500, null), 'stale_claim');
  perform pg_temp.expect_status('unconfirmed right after the call', public.fabric_store_refund_finish(v_refund,
    (select claim_token from public.fabric_store_refunds where id = v_refund), 'unconfirmed', 0, null), 'too_early');
  reset role;
  update public.fabric_store_refunds set provider_called_at = now() - interval '20 minutes' where id = v_refund;
  set local role service_role;
  perform pg_temp.expect_status('unconfirmed after 15 minutes', public.fabric_store_refund_finish(v_refund,
    (select claim_token from public.fabric_store_refunds where id = v_refund), 'unconfirmed', 0, null), 'unconfirmed');
  reset role;
  if (select status from public.fabric_store_refunds where id = v_refund) is distinct from 'pending'
     or not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: an unconfirmed refund stays pending and flags the order';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) Restock and credit note refuse where nothing was sold
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-restock', '+966560000808');
  v_refund uuid;
  v_res jsonb;
begin
  set local role service_role;
  v_res := public.fabric_store_restock_return(v_order, pg_temp.actor(),
    '[{"line_number": 1, "quantity_cm": 100}]'::jsonb, 'رجعت القطعة سليمة', gen_random_uuid());
  reset role;
  perform pg_temp.expect_status('restock a test order', v_res, 'nothing_to_restock');
  set local role service_role;
  v_res := public.fabric_store_restock_return(v_order, pg_temp.actor(),
    '[{"line_number": 1, "quantity_cm": 100}]'::jsonb, ' ', gen_random_uuid());
  reset role;
  perform pg_temp.expect_status('restock without a note', v_res, 'note_required');

  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  v_res := pg_temp.begin_refund(v_order, 1000, false, p_reason => 'تعويض');
  v_refund := (v_res ->> 'refund_id')::uuid;
  set local role service_role;
  v_res := public.fabric_store_record_credit_note(v_refund, pg_temp.actor(), 'CN-1');
  reset role;
  perform pg_temp.expect_status('credit note for a pending refund', v_res, 'not_required');
  perform pg_temp.finish_refund(v_refund, 'succeeded', 1000);
  set local role service_role;
  v_res := public.fabric_store_record_credit_note(v_refund, pg_temp.actor(), 'CN-1');
  reset role;
  perform pg_temp.expect_status('credit note where no sale exists', v_res, 'not_required');
end $$;

-- ---------------------------------------------------------------------------
-- 8) Refund rows are fixed once written
-- ---------------------------------------------------------------------------
do $$
declare
  v_refund uuid := (select id from public.fabric_store_refunds
                    where order_id = (select id from public.fabric_store_orders where access_token_hash = pg_temp.h('refund-cancel')));
begin
  begin
    update public.fabric_store_refunds set cancels_order = false where id = v_refund;
    raise exception 'TEST FAILED: cancels_order changed after the fact';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_REFUND_IMMUTABLE%' then raise; end if;
  end;
  begin
    update public.fabric_store_refunds set provider_refunded_before = 7 where id = v_refund;
    raise exception 'TEST FAILED: provider_refunded_before changed after the fact';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_REFUND_IMMUTABLE%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8b) (review v2) Once cut, always cut: going back to «unfulfilled» does not reopen the cancellation
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-recut', '+966560000809');
  v_res jsonb;
begin
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  perform pg_temp.expect_status('back to not prepared', pg_temp.set_to(v_order, 'unfulfilled'), 'ok');
  perform pg_temp.expect_status('cancel after a cut that was undone', pg_temp.begin_refund(v_order, 11500, true), 'already_cut');
  if (select cut_started_at from public.fabric_store_orders where id = v_order) is null then
    raise exception 'TEST FAILED: the cut is recorded and survives going back';
  end if;
  begin
    update public.fabric_store_orders set cut_started_at = null where id = v_order;
    raise exception 'TEST FAILED: the cut was erased';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_CUT_IMMUTABLE%' then raise; end if;
  end;
  -- a full refund of a cut order is a plain refund, not «use_cancel»
  v_res := pg_temp.begin_refund(v_order, 11500, false, p_reason => 'عيب بعد القص');
  perform pg_temp.expect_status('full refund after a cut', v_res, 'started');
  perform pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 11500);
  if (select fulfillment_status from public.fabric_store_orders where id = v_order) is distinct from 'unfulfilled'
     or exists (select 1 from public.fabric_store_restocks where order_id = v_order) then
    raise exception 'TEST FAILED: a cut order is refunded without being cancelled or restocked';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8c) (review v2) A late payment on a cancelled unpaid order can be refunded; it stays cancelled
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('refund-late-cancelled', '+966560000810');
  v_res jsonb;
  v_stock numeric;
  v_begin jsonb;
begin
  -- the payment page was opened, then staff cancelled the unpaid order (its hold released)
  set local role service_role;
  v_begin := public.fabric_store_begin_payment(pg_temp.h('refund-late-cancelled'), 'live', pg_temp.h('payer-refund-late-cancelled'));
  perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-refund-late-cancelled',
                                             'https://checkout.moyasar.com/invoices/inv-refund-late-cancelled');
  reset role;
  if pg_temp.fix_c() then
    -- fix C (AUD-05, owner decision): no cancelling while the page can take a payment
    perform pg_temp.expect_status('cancel with the page open', pg_temp.set_to(v_order, 'cancelled'), 'payment_in_progress');
    update public.fabric_store_payment_attempts set expires_at = created_at + interval '1 millisecond'
    where id = (v_begin ->> 'attempt_id')::uuid;
  end if;
  perform pg_temp.expect_status('cancel unpaid', pg_temp.set_to(v_order, 'cancelled'), 'ok');
  select c.current_quantity into v_stock from public.fabric_inventory_colors c
    join public.fabric_store_order_items i on i.inventory_color_id = c.id where i.order_id = v_order;
  -- then the payment arrives
  set local role service_role;
  v_res := public.fabric_store_apply_payment(null, 'live', jsonb_build_object(
    'id', 'pay-refund-late-cancelled', 'status', 'paid', 'amount', 11500, 'currency', 'SAR',
    'invoice_id', 'inv-refund-late-cancelled'), null);
  v_res := public.fabric_store_confirm_order(v_order);
  reset role;
  perform pg_temp.expect_status('no sale for the cancelled order', v_res, 'cancelled_order');

  perform pg_temp.expect_status('cancel it again', pg_temp.begin_refund(v_order, 11500, true), 'already_cancelled');
  v_res := pg_temp.begin_refund(v_order, 11500, false, p_reason => 'سداد وصل بعد الإلغاء');
  perform pg_temp.expect_status('refund the late payment', v_res, 'started');
  perform pg_temp.expect_status('confirmed', pg_temp.finish_refund((v_res ->> 'refund_id')::uuid, 'succeeded', 11500), 'succeeded');
  if (select fulfillment_status || ':' || payment_status from public.fabric_store_orders where id = v_order)
       is distinct from 'cancelled:refunded'
     or (select income_id from public.fabric_store_orders where id = v_order) is not null
     or exists (select 1 from public.fabric_store_restocks where order_id = v_order)
     or (select c.current_quantity from public.fabric_inventory_colors c
          join public.fabric_store_order_items i on i.inventory_color_id = c.id where i.order_id = v_order) is distinct from v_stock then
    raise exception 'TEST FAILED: the late payment is refunded, the order stays cancelled, no sale, stock unchanged';
  end if;
  perform pg_temp.expect_status('no second refund', pg_temp.begin_refund(v_order, 100, false), 'not_refundable');
end $$;

-- ---------------------------------------------------------------------------
-- 10) (review v3) A payment first seen as refunded is quarantined as evidence, never ignored
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('refund-first-seen', '+966560000811');
  v_begin jsonb;
  v_res jsonb;
begin
  set local role service_role;
  v_begin := public.fabric_store_begin_payment(pg_temp.h('refund-first-seen'), 'test', pg_temp.h('payer-refund-first-seen'));
  perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-refund-first-seen',
                                             'https://checkout.moyasar.com/invoices/inv-refund-first-seen');
  v_res := public.fabric_store_apply_payment(null, 'test', jsonb_build_object(
    'id', 'pay-refund-first-seen', 'status', 'refunded', 'amount', 11500, 'currency', 'SAR',
    'invoice_id', 'inv-refund-first-seen', 'refunded', 11500), null);
  reset role;
  perform pg_temp.expect_status('paid then refunded before we heard of it', v_res, 'quarantined');
  if (select payment_status from public.fabric_store_orders where id = v_order) is distinct from 'pending'
     or not (select needs_review from public.fabric_store_orders where id = v_order)
     or (select review_reason from public.fabric_store_orders where id = v_order) not like '%pay-refund-first-seen%'
     or exists (select 1 from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) then
    raise exception 'TEST FAILED: the refunded-first payment flags the order with its payment id, sells nothing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11) (review v3) An unconfirmed refund: 24 hours is a review date, not a failure; closed only
--     by the admin with a settlement reference while Moyasar shows nothing; the decision is kept
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.paid_test_order('refund-close', '+966560000812');
  v_res jsonb;
  v_refund uuid;
  v_quiet uuid;
  v_row record;
begin
  perform pg_temp.expect_status('cut', pg_temp.set_to(v_order, 'preparing'), 'ok');
  v_res := pg_temp.begin_refund(v_order, 1000, false, p_reason => 'تعويض');
  v_refund := (v_res ->> 'refund_id')::uuid;
  set local role service_role;
  perform pg_temp.expect_status('the call is recorded', public.fabric_store_refund_mark_called(v_refund,
    (select claim_token from public.fabric_store_refunds where id = v_refund)), 'ok');
  perform pg_temp.expect_status('closed right after the call', public.fabric_store_refund_close_unconfirmed(
    v_refund, pg_temp.actor(), 'STL-2026-09-30', 'لم يظهر في التسوية', 0), 'too_early');
  reset role;
  update public.fabric_store_refunds set provider_called_at = now() - interval '25 hours' where id = v_refund;
  set local role service_role;
  perform pg_temp.expect_status('without a reference', public.fabric_store_refund_close_unconfirmed(
    v_refund, pg_temp.actor(), ' ', 'لم يظهر', 0), 'note_required');
  perform pg_temp.expect_status('Moyasar shows a movement', public.fabric_store_refund_close_unconfirmed(
    v_refund, pg_temp.actor(), 'STL-2026-09-30', 'لم يظهر في التسوية', 1000), 'provider_changed');
  perform pg_temp.expect_status('another refund meanwhile', pg_temp.begin_refund(v_order, 500, false, p_reason => 'تعويض آخر'), 'refund_in_progress');
  perform pg_temp.expect_status('closed after 24 hours, nothing at Moyasar', public.fabric_store_refund_close_unconfirmed(
    v_refund, pg_temp.actor(), 'STL-2026-09-30', 'لم يظهر في التسوية', 0), 'ok');
  reset role;
  select status, review_reference, review_note, reviewed_by, reviewed_at into v_row from public.fabric_store_refunds where id = v_refund;
  if v_row.status is distinct from 'failed' or v_row.review_reference is distinct from 'STL-2026-09-30'
     or v_row.reviewed_by is distinct from pg_temp.actor() or v_row.reviewed_at is null
     or not exists (select 1 from public.fabric_store_order_events where order_id = v_order and event_type = 'note'
                    and actor_id = pg_temp.actor() and note like '%STL-2026-09-30%') then
    raise exception 'TEST FAILED: the decision, its reference and who took it are kept: %', row_to_json(v_row);
  end if;
  begin
    update public.fabric_store_refunds set review_reference = 'OTHER' where id = v_refund;
    raise exception 'TEST FAILED: the decision was rewritten';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'FABRIC_STORE_REFUND_IMMUTABLE%' then raise; end if;
  end;
  if pg_temp.fix_c() then
    -- fix C (AUD-08): the closed refund had been sent to Moyasar — a new one needs Moyasar support's reference
    perform pg_temp.expect_status('a new refund after the decision, no support reference',
      pg_temp.begin_refund(v_order, 500, false, p_reason => 'تعويض آخر'), 'support_reference_required');
    perform pg_temp.expect_status('a new refund after the decision', pg_temp.begin_refund(v_order, 500, false,
      p_reason => 'تعويض آخر', p_support => 'MOY-SUPPORT-1'), 'started');
  else
    perform pg_temp.expect_status('a new refund after the decision', pg_temp.begin_refund(v_order, 500, false, p_reason => 'تعويض آخر'), 'started');
  end if;

  -- a refund never sent to Moyasar (e.g. sending switched off) can be closed at once
  v_quiet := (select id from public.fabric_store_refunds where order_id = v_order and status = 'pending');
  set local role service_role;
  perform pg_temp.expect_status('closing a refund never sent', public.fabric_store_refund_close_unconfirmed(
    v_quiet, pg_temp.actor(), 'لم يُرسل', 'أُطفئ الإرسال', null), 'ok');
  perform pg_temp.expect_status('closing twice', public.fabric_store_refund_close_unconfirmed(
    v_quiet, pg_temp.actor(), 'لم يُرسل', 'أُطفئ الإرسال', null), 'already_failed');
  reset role;
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

select 'PASS fabric_store refunds (privileges, cancel before the cut refunds all and cancels in the admin''s name, preparing blocked while it is pending, partial refunds capped by what was paid, Moyasar must show the refund, refused and unknown refunds, live payment without its sale only cancelled and never sold, our refund webhook not a review, reconciliation queue, restock and credit note refusals, refund rows fixed, no income row and no invoice number used)' as result;

rollback;
