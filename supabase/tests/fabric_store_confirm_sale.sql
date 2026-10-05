-- Exercise stage 6 (migration 20260929120000): confirming the sale of a paid order,
-- the outbox queue, and the lock on online sales — AS service_role, the way the
-- Next.js jobs call them.
--
-- SAFE ON THE LIVE DATABASE: every case here ends WITHOUT an income row (test
-- payments, a cancelled order, fabric that is gone). The invoice-number sequence of
-- the shop must not move — case 3 checks that. The full path (a real sale and a real
-- stock deduction) runs only on the local replica: scripts/db-local/stage6-local-sale.sql.
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end.
-- Run after applying the stage 2 → 6 migrations, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store confirm sale (…)

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
  values ('اختبار الاعتماد ' || p_label, 'اختبار الاعتماد ' || p_label, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون اختبار ' || p_label)
  returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', p_meters, 'رصيد اختبار الاعتماد');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار الاعتماد', 'https://example.invalid/fabric-store-test.jpg', 100.00,
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
create function pg_temp.order_for(p_access text, p_phone text, p_listing uuid default null) returns uuid
language plpgsql as $$
declare
  v_listing uuid := p_listing;
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  if v_listing is null then
    select listing_id into v_listing from pg_temp.make_fabric(p_access, 10);
  end if;
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('confirm-client-' || p_access),
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

-- Start → attach (the customer is on Moyasar's page), in the given environment.
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

-- …then the verified payment of 115.00 lands.
create function pg_temp.apply(p_access text, p_env text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_apply_payment(null, p_env, jsonb_build_object(
         'id', 'pay-' || p_access, 'status', 'paid', 'amount', 11500, 'currency', 'SAR',
         'invoice_id', 'inv-' || p_access), null);
  reset role;
  return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.pay(p_access text, p_env text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.start(p_access, p_env);
  return pg_temp.apply(p_access, p_env);
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

create function pg_temp.due(p_order uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_due_outbox(array['confirm_order', 'alostaz_invoice'], 50, p_order);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.finish(p_task uuid, p_outcome text, p_seconds integer default 60) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_finish_outbox(p_task, p_outcome, 'اختبار', p_seconds);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

-- Baseline of the shop's sales and invoice numbers, checked again in case 5. Kept in a
-- session setting, not a temp table (the Supabase SQL editor lost an ON COMMIT DROP table).
select set_config('fabric_store_test.income_before',
  (select count(*) from public.income)::text || '#'
  || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq), false);

-- ---------------------------------------------------------------------------
-- 0) Privileges: three server entry points (service_role only), a private helper,
--    and the lock trigger on income
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.fabric_store_confirm_order(uuid)',
    'public.fabric_store_due_outbox(text[], integer, uuid)',
    'public.fabric_store_finish_outbox(uuid, text, text, integer)']
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

  foreach v_fn in array array[
    'private.fabric_store_close_confirm_task(uuid, text)',
    'private.fabric_store_protect_online_sale()']
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'TEST FAILED: % can execute %', v_role, v_fn;
      end if;
    end loop;
  end loop;

  -- BEFORE (2), ROW (1), DELETE (8) and UPDATE (16), and nothing else (INSERT 4, TRUNCATE 32)
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.income'::regclass and tgname = 'fabric_store_protect_online_sale'
                   and not tgisinternal and tgenabled = 'O'
                   and tgtype = (1 | 2 | 8 | 16)
                   and tgfoid = 'private.fabric_store_protect_online_sale()'::regprocedure) then
    raise exception 'TEST FAILED: the online-sale lock trigger (before update or delete, each row) is missing on income';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) A TEST payment: no sale, no stock deduction; the hold ends so the fabric is back
-- ---------------------------------------------------------------------------
do $$
declare
  v_listing uuid;
  v_color uuid;
  v_order uuid;
  v_res jsonb;
  v_before numeric;
begin
  select listing_id, color_id into v_listing, v_color from pg_temp.make_fabric('test-pay', 10);
  v_order := pg_temp.order_for('confirm-test-pay', '+966560000101', v_listing);
  perform pg_temp.expect_status('test payment', pg_temp.pay('confirm-test-pay', 'test'), 'paid');
  select current_quantity into v_before from public.fabric_inventory_colors where id = v_color;

  if jsonb_array_length(pg_temp.due(v_order)) <> 1 then
    raise exception 'TEST FAILED: a paid order must have one due confirm task: %', pg_temp.due(v_order);
  end if;

  v_res := pg_temp.confirm(v_order);
  perform pg_temp.expect_status('confirm a test payment', v_res, 'test_no_sale');
  if (select income_id from public.fabric_store_orders where id = v_order) is not null
     or (select current_quantity from public.fabric_inventory_colors where id = v_color) <> v_before
     or exists (select 1 from public.fabric_store_stock_reservations where order_id = v_order and status <> 'consumed')
     or (select status from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) <> 'done'
     or (select payload ->> 'result' from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order) <> 'test_no_sale'
     or exists (select 1 from public.fabric_store_outbox where dedupe_key = 'alostaz_invoice:' || v_order) then
    raise exception 'TEST FAILED: a test payment must end the hold and close the task, with no sale, stock change or invoice task';
  end if;
  -- the hold no longer counts: the shop sees all 10 m again
  if (select reserved_cm from private.fabric_store_stock_hold(null, v_color)) is distinct from 0 then
    raise exception 'TEST FAILED: the test order still holds fabric';
  end if;

  perform pg_temp.expect_status('confirm the test payment again', pg_temp.confirm(v_order), 'test_no_sale');
  if (select count(*) from public.fabric_store_order_events
      where order_id = v_order and event_type = 'note' and note like 'دفعة اختبار%') <> 1 then
    raise exception 'TEST FAILED: repeating the confirmation must not repeat the audit note';
  end if;
  if jsonb_array_length(pg_temp.due(v_order)) <> 0 then
    raise exception 'TEST FAILED: a closed task must not be due again';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Nothing to confirm: unknown order, unpaid order, cancelled order
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid;
begin
  perform pg_temp.expect_status('unknown order', pg_temp.confirm(gen_random_uuid()), 'not_found');

  v_order := pg_temp.order_for('confirm-unpaid', '+966560000102');
  perform pg_temp.expect_status('unpaid order', pg_temp.confirm(v_order), 'not_paid');
  if exists (select 1 from public.fabric_store_stock_reservations where order_id = v_order and status <> 'active') then
    raise exception 'TEST FAILED: confirming an unpaid order must not touch its hold';
  end if;

  -- staff cancel while the customer is on the payment page (live): money recorded, nothing sold, order flagged
  v_order := pg_temp.order_for('confirm-cancelled', '+966560000103');
  perform pg_temp.start('confirm-cancelled', 'live');
  perform set_config('fabric_store.actor_type', 'staff', true);
  update public.fabric_store_orders set fulfillment_status = 'cancelled', cancel_reason = 'اختبار' where id = v_order;
  perform pg_temp.expect_status('live payment on a cancelled order', pg_temp.apply('confirm-cancelled', 'live'), 'paid');
  perform pg_temp.expect_status('confirm a cancelled order', pg_temp.confirm(v_order), 'cancelled_order');
  if (select income_id from public.fabric_store_orders where id = v_order) is not null
     or not (select needs_review from public.fabric_store_orders where id = v_order) then
    raise exception 'TEST FAILED: a cancelled paid order must stay without a sale and be flagged';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Paid (live) after the hold lapsed and the fabric was sold: never refused,
--    no sale, flagged for review, staff told — and no invoice number used
-- ---------------------------------------------------------------------------
do $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_order uuid;
  v_res jsonb;
  v_row record;
begin
  select item_id, color_id, listing_id into v_item, v_color, v_listing from pg_temp.make_fabric('gone', 10);
  v_order := pg_temp.order_for('confirm-gone', '+966560000104', v_listing);
  perform pg_temp.start('confirm-gone', 'live');
  -- while the customer is on the payment page the hold ends, and the shop floor sells
  -- all ten metres (a manual stock-out)
  perform private.fabric_store_release_order_reservations(v_order, 'اختبار');
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'out', 10, 'اختبار: بيع كامل الرصيد');

  perform pg_temp.expect_status('live payment after the fabric is gone', pg_temp.apply('confirm-gone', 'live'), 'paid');
  v_res := pg_temp.confirm(v_order);
  perform pg_temp.expect_status('confirm with no fabric left', v_res, 'stock_unavailable');

  select o.payment_status, o.income_id, o.needs_review, o.review_reason into v_row
  from public.fabric_store_orders o where o.id = v_order;
  if v_row.payment_status <> 'paid' or v_row.income_id is not null or not v_row.needs_review
     or v_row.review_reason not like 'تعذّر خصم القماش بعد السداد%' then
    raise exception 'TEST FAILED: fabric gone after payment must flag the order, not sell: %', row_to_json(v_row);
  end if;
  if not exists (select 1 from public.fabric_store_outbox where dedupe_key = 'stock_unavailable:' || v_order)
     or (select payload ->> 'result' from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || v_order)
        <> 'stock_unavailable' then
    raise exception 'TEST FAILED: staff must be told, and the confirm task closed';
  end if;
  if (select current_quantity from public.fabric_inventory_colors where id = v_color) <> 0 then
    raise exception 'TEST FAILED: stock changed although nothing was sold';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) The queue: retry with a delay, give up after max attempts, done is final
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('confirm-queue', '+966560000105');
  v_task uuid;
  v_row record;
  i integer;
begin
  -- a task of its own (not produced by a payment) to drive the queue
  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload, max_attempts)
  values ('alostaz_invoice', 'alostaz_invoice:test-queue:' || v_order, v_order, '{}'::jsonb, 3)
  returning id into v_task;

  perform pg_temp.expect_status('bad outcome', pg_temp.finish(v_task, 'maybe'), 'bad_request');
  perform pg_temp.expect_status('retry 1', pg_temp.finish(v_task, 'retry', 120), 'failed');
  select status, attempts, run_after, completed_at into v_row from public.fabric_store_outbox where id = v_task;
  if v_row.attempts <> 1 or v_row.run_after < now() + interval '100 seconds' or v_row.completed_at is not null then
    raise exception 'TEST FAILED: a retry must count, wait and stay open: %', row_to_json(v_row);
  end if;
  if jsonb_array_length(pg_temp.due(v_order)) <> 0 then
    raise exception 'TEST FAILED: a task waiting for its retry time must not be due';
  end if;

  update public.fabric_store_outbox set run_after = now() - interval '1 second' where id = v_task;
  if jsonb_array_length(pg_temp.due(v_order)) <> 1 then
    raise exception 'TEST FAILED: a task past its retry time must be due again';
  end if;
  perform pg_temp.expect_status('retry 2', pg_temp.finish(v_task, 'retry'), 'failed');
  perform pg_temp.expect_status('retry 3 = the last allowed', pg_temp.finish(v_task, 'retry'), 'dead');
  if (select completed_at from public.fabric_store_outbox where id = v_task) is null then
    raise exception 'TEST FAILED: a dead task must be closed';
  end if;
  perform pg_temp.expect_status('finish a dead task', pg_temp.finish(v_task, 'done'), 'unchanged');

  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
  values ('alostaz_invoice', 'alostaz_invoice:test-done:' || v_order, v_order, '{}'::jsonb)
  returning id into v_task;
  perform pg_temp.expect_status('done', pg_temp.finish(v_task, 'done'), 'done');
  perform pg_temp.expect_status('retry after done', pg_temp.finish(v_task, 'retry'), 'unchanged');

  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
  values ('alostaz_invoice', 'alostaz_invoice:test-dead:' || v_order, v_order, '{}'::jsonb)
  returning id into v_task;
  perform pg_temp.expect_status('dead on purpose (needs a person)', pg_temp.finish(v_task, 'dead'), 'dead');
  if (select attempts from public.fabric_store_outbox where id = v_task) <> 1 then
    raise exception 'TEST FAILED: giving up must still count the attempt';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) The shop was not touched: no income row, no invoice number used
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.income)::text || '#'
     || (select last_value || '/' || is_called from public.fabrics_invoice_number_seq)
     is distinct from current_setting('fabric_store_test.income_before', true) then
    raise exception 'TEST FAILED: this test must not create a sale nor use an invoice number';
  end if;
end $$;

select 'PASS fabric_store confirm sale (privileges, test payment = no sale and the hold ends, idempotent, unknown/unpaid/cancelled, fabric gone after payment = review without a sale, queue retry/dead/done, no income row and no invoice number used)' as result;

rollback;
