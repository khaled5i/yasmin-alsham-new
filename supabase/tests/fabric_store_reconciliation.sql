-- Exercise stage 9 (migration 20260930135919): which payment attempts the periodic
-- reconciliation asks Moyasar about, and the staff alerts — AS service_role, like the job
-- and the dashboard route.
--
-- SAFE ON THE LIVE DATABASE: test payments only, no income row (checked at the end).
-- Everything runs in ONE transaction that is ROLLED BACK. Real attempts that happen to be
-- due are claimed inside the transaction too, and released by the rollback.
-- Run after applying the stage 2 → 9 migrations, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store reconciliation (…)

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

-- 1 m at 100.00 SAR/m, pickup: 115.00, on its own test fabric.
create function pg_temp.order_for(p_access text, p_phone text) returns uuid language plpgsql as $$
declare
  v_item uuid;
  v_color uuid;
  v_listing uuid;
  v_key uuid := gen_random_uuid();
  v_res jsonb;
begin
  insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
  values ('اختبار المطابقة ' || p_access, 'اختبار المطابقة ' || p_access, 'meter', 100.00,
          array['https://example.invalid/fabric-store-test.jpg'])
  returning id into v_item;
  insert into public.fabric_inventory_colors (inventory_item_id, color_name)
  values (v_item, 'لون ' || p_access) returning id into v_color;
  insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity, description)
  values (v_item, v_color, 'in', 10, 'رصيد اختبار المطابقة');
  select id into v_listing from public.fabrics where inventory_color_id = v_color;
  if v_listing is null then
    insert into public.fabrics (category, image_url, price_per_meter, stock_quantity, min_order_meters,
                                is_available, is_active, inventory_item_id, inventory_color_id)
    values ('اختبار المطابقة', 'https://example.invalid/fabric-store-test.jpg', 100.00, 10, 1, true, true, v_item, v_color)
    returning id into v_listing;
  else
    update public.fabrics set price_per_meter = 100.00, is_on_sale = false, discount_percentage = 0 where id = v_listing;
  end if;
  set local role service_role;
  v_res := public.fabric_store_create_checkout(jsonb_build_object(
    'checkout_key', v_key,
    'request_fingerprint', pg_temp.hex(v_key::text || ':fp'),
    'access_token_hash', pg_temp.hex(p_access),
    'client_hash', pg_temp.hex('reconcile-client-' || p_access),
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

-- A payment page opened (attempt initiated, invoice attached); returns the attempt id.
create function pg_temp.open_page(p_access text) returns uuid language plpgsql as $$
declare v_begin jsonb;
begin
  set local role service_role;
  v_begin := public.fabric_store_begin_payment(pg_temp.h(p_access), 'test', pg_temp.h('payer-' || p_access));
  if v_begin ->> 'status' <> 'created' then
    raise exception 'TEST FAILED: fixture payment start for %: %', p_access, v_begin;
  end if;
  perform public.fabric_store_attach_invoice((v_begin ->> 'attempt_id')::uuid, 'inv-' || p_access,
                                             'https://checkout.moyasar.com/invoices/inv-' || p_access);
  reset role;
  return (v_begin ->> 'attempt_id')::uuid;
exception when others then reset role; raise;
end;
$$;

-- A payment page opened 30 minutes ago and ended 10 minutes ago (expires_at > created_at holds;
-- inside one transaction now() cannot move, so the attempt is written with its past times).
create function pg_temp.ended_page(p_access text) returns uuid language plpgsql as $$
declare
  v_order uuid := (select id from public.fabric_store_orders where access_token_hash = pg_temp.h(p_access));
  v_attempt uuid;
begin
  insert into public.fabric_store_payment_attempts
    (order_id, provider, environment, idempotency_key, amount_halalas, currency, status, expires_at, created_at)
  values (v_order, 'moyasar', 'test', gen_random_uuid(), 11500, 'SAR', 'created',
          now() - interval '10 minutes', now() - interval '30 minutes')
  returning id into v_attempt;
  update public.fabric_store_payment_attempts
  set status = 'initiated', provider_invoice_id = 'inv-' || p_access,
      checkout_url = 'https://checkout.moyasar.com/invoices/inv-' || p_access
  where id = v_attempt;
  return v_attempt;
end;
$$;

create function pg_temp.due(p_env text default 'test') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_due_reconciliation(p_env, 50);
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.complete(p_rows jsonb, p_attempt uuid) returns jsonb language plpgsql as $$
declare
  v_token uuid := (select (e ->> 'claim_token')::uuid from jsonb_array_elements(p_rows) e
                    where (e ->> 'attempt_id')::uuid = p_attempt);
  v_result jsonb;
begin
  set local role service_role;
  v_result := public.fabric_store_complete_reconciliation(p_attempt, v_token);
  reset role;
  return v_result;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.has(p_rows jsonb, p_attempt uuid) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements(p_rows) e where (e ->> 'attempt_id')::uuid = p_attempt)
$$;

create function pg_temp.alerts() returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  v := public.fabric_store_staff_alerts();
  reset role; return v;
exception when others then reset role; raise;
end;
$$;

create function pg_temp.alert_for(p_kind text, p_order uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(pg_temp.alerts()) e
                 where e ->> 'kind' = p_kind and (e ->> 'order_id')::uuid is not distinct from p_order)
$$;

-- ---------------------------------------------------------------------------
-- 0) Privileges: two new entry points, service_role only
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.fabric_store_due_reconciliation(text, integer)',
    'public.fabric_store_complete_reconciliation(uuid, uuid)',
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
      raise exception 'TEST FAILED: % must be SECURITY DEFINER with an empty search_path', v_fn;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1) An unpaid attempt is asked about once its page has ended, then every 15 minutes
-- ---------------------------------------------------------------------------
do $$
declare
  v_open_order uuid := pg_temp.order_for('rec-still-open', '+966560000900');
  v_open uuid := pg_temp.open_page('rec-still-open');
  v_order uuid := pg_temp.order_for('rec-open', '+966560000901');
  v_attempt uuid := pg_temp.ended_page('rec-open');
  v_rows jsonb;
  v_new_rows jsonb;
begin
  -- asked with the live key first, while the test attempt is still unclaimed
  if pg_temp.has(pg_temp.due('live'), v_attempt) then
    raise exception 'TEST FAILED: the live key never asks about a test attempt';
  end if;
  v_rows := pg_temp.due();
  if pg_temp.has(v_rows, v_open) then
    raise exception 'TEST FAILED: a page still open is left to the return page and the webhook';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_rows) e
                 where (e ->> 'attempt_id')::uuid = v_attempt and e ->> 'invoice_id' = 'inv-rec-open') then
    raise exception 'TEST FAILED: an ended unpaid page is asked about, with its invoice: %', v_rows;
  end if;
  if pg_temp.has(pg_temp.due(), v_attempt) then
    raise exception 'TEST FAILED: a claimed attempt is not asked about twice within 15 minutes';
  end if;
  if (select reconciled_at from public.fabric_store_payment_attempts where id = v_attempt) is not null then
    raise exception 'TEST FAILED: claiming is not a completed reconciliation';
  end if;
  if pg_temp.due('prod') <> '[]'::jsonb then
    raise exception 'TEST FAILED: an unknown environment returns nothing';
  end if;
  update public.fabric_store_payment_attempts
  set reconcile_claimed_at = now() - interval '6 minutes' where id = v_attempt;
  v_new_rows := pg_temp.due();
  if not pg_temp.has(v_new_rows, v_attempt) then
    raise exception 'TEST FAILED: an abandoned lease is retried';
  end if;
  perform pg_temp.expect_status('stale claimant cannot finish', pg_temp.complete(v_rows, v_attempt), 'stale_claim');
  if pg_temp.has(pg_temp.due(), v_attempt) then
    raise exception 'TEST FAILED: the active lease was given out twice';
  end if;
  perform pg_temp.expect_status('successful reconciliation', pg_temp.complete(v_new_rows, v_attempt), 'ok');
  if (select reconciled_at from public.fabric_store_payment_attempts where id = v_attempt) is null then
    raise exception 'TEST FAILED: successful completion records its time';
  end if;
  -- the lease is released by success, so only the 15-minute clock stops the next run asking again
  if pg_temp.has(pg_temp.due(), v_attempt) then
    raise exception 'TEST FAILED: an unpaid attempt checked successfully is not asked again within 15 minutes';
  end if;
  update public.fabric_store_payment_attempts set reconciled_at = now() - interval '16 minutes' where id = v_attempt;
  if not pg_temp.has(pg_temp.due(), v_attempt) then
    raise exception 'TEST FAILED: asked again after 15 minutes';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) A paid attempt is re-checked once a day
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('rec-paid', '+966560000902');
  v_attempt uuid := pg_temp.open_page('rec-paid');
  v_res jsonb;
  v_rows jsonb;
begin
  set local role service_role;
  v_res := public.fabric_store_apply_payment(null, 'test', jsonb_build_object(
    'id', 'pay-rec-paid', 'status', 'paid', 'amount', 11500, 'currency', 'SAR', 'invoice_id', 'inv-rec-paid'), null);
  reset role;
  perform pg_temp.expect_status('paid', v_res, 'paid');
  v_rows := pg_temp.due();
  if not pg_temp.has(v_rows, v_attempt) then
    raise exception 'TEST FAILED: a paid attempt is re-checked (refund or void outside the system)';
  end if;
  perform pg_temp.expect_status('paid reconciliation completed', pg_temp.complete(v_rows, v_attempt), 'ok');
  if pg_temp.has(pg_temp.due(), v_attempt) then
    raise exception 'TEST FAILED: not twice in a day';
  end if;
  update public.fabric_store_payment_attempts set reconciled_at = now() - interval '25 hours' where id = v_attempt;
  if not pg_temp.has(pg_temp.due(), v_attempt) then
    raise exception 'TEST FAILED: re-checked again the next day';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Alerts are computed from the state, and go away when it is fixed
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid := pg_temp.order_for('rec-alerts', '+966560000903');
  v_attempt uuid := pg_temp.open_page('rec-alerts');
  v_res jsonb;
  v_refund uuid;
  v_task uuid;
  v_event uuid;
begin
  set local role service_role;
  v_res := public.fabric_store_apply_payment(null, 'test', jsonb_build_object(
    'id', 'pay-rec-alerts', 'status', 'paid', 'amount', 11500, 'currency', 'SAR', 'invoice_id', 'inv-rec-alerts'), null);
  v_res := public.fabric_store_confirm_order(v_order);
  v_res := public.fabric_store_staff_set_fulfillment(v_order, 'preparing', 'aaaaaaaa-0000-4000-8000-00000000abcd', null, null, null);
  reset role;
  if pg_temp.alert_for('needs_review', v_order) or pg_temp.alert_for('refund_unconfirmed', v_order) then
    raise exception 'TEST FAILED: a healthy order raises no alert';
  end if;

  -- a refund sent to Moyasar that does not show after 15 minutes
  set local role service_role;
  v_res := public.fabric_store_refund_begin(v_order, 'aaaaaaaa-0000-4000-8000-00000000abcd', 'مديرة', 1000, 'تعويض', false, gen_random_uuid());
  reset role;
  v_refund := (v_res ->> 'refund_id')::uuid;
  update public.fabric_store_refunds set provider_called_at = now() - interval '20 minutes' where id = v_refund;
  if not pg_temp.alert_for('refund_unconfirmed', v_order) then
    raise exception 'TEST FAILED: a refund that never shows at Moyasar is an alert';
  end if;
  if pg_temp.alert_for('refund_review_due', v_order) then
    raise exception 'TEST FAILED: the manager review is not due before 24 hours';
  end if;
  update public.fabric_store_refunds set provider_called_at = now() - interval '25 hours' where id = v_refund;
  if not pg_temp.alert_for('refund_review_due', v_order) then
    raise exception 'TEST FAILED: after 24 hours the unconfirmed refund is due for the manager review';
  end if;
  set local role service_role;
  v_res := public.fabric_store_refund_finish(v_refund, (select claim_token from public.fabric_store_refunds where id = v_refund),
                                              'succeeded', 1000, null);
  reset role;
  perform pg_temp.expect_status('the refund shows at last', v_res, 'succeeded');
  if pg_temp.alert_for('refund_unconfirmed', v_order) then
    raise exception 'TEST FAILED: the alert goes away once the refund is recorded';
  end if;

  -- a task that stopped for good
  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload, status, completed_at)
  values ('alostaz_invoice', 'alostaz_invoice:rec-test-' || v_order, v_order, '{}'::jsonb, 'dead', now())
  returning id into v_task;
  if not pg_temp.alert_for('task_dead', v_order) then
    raise exception 'TEST FAILED: a dead task is an alert';
  end if;
  delete from public.fabric_store_outbox where id = v_task;

  -- a quarantined payment event (e.g. an invoice nobody knows)
  insert into public.fabric_store_payment_events
    (provider, environment, source, provider_event_id, event_type, provider_payment_id, payload, processing_status, last_error)
  values ('moyasar', 'test', 'poll', 'rec-quarantined-test', 'payment_paid', 'pay-stranger', '{}'::jsonb, 'quarantined',
          'دفعة لفاتورة لا تخص محاولة معروفة')
  returning id into v_event;
  if not exists (select 1 from jsonb_array_elements(pg_temp.alerts()) e
                 where e ->> 'kind' = 'payment_quarantined' and e ->> 'detail' like '%pay-stranger%') then
    raise exception 'TEST FAILED: a quarantined payment is an alert';
  end if;

  -- an order under review
  perform set_config('fabric_store.actor_type', 'system', true);
  update public.fabric_store_orders set needs_review = true, review_reason = 'اختبار' where id = v_order;
  if not pg_temp.alert_for('needs_review', v_order) then
    raise exception 'TEST FAILED: an order under review is an alert';
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

select 'PASS fabric_store reconciliation (privileges, ended unpaid pages asked about every 15 minutes, paid ones once a day, environment separated, alerts computed from state and cleared when fixed, no income row and no invoice number used)' as result;

rollback;
