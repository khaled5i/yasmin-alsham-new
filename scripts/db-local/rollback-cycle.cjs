// Rollback cycle for stages 2 → 6 on a real local Postgres (see README.md). Order: 6 → 5 → 4 → 3 → 2.
// The rollback SQL is read from the stage reports themselves, so what is tested
// is exactly what the owner would run.
//   node scripts/db-local/rollback-cycle.cjs
const { FILES, connect, startServer, buildReplica, functionBody, md5, sqlBlockAfter, runSqlTest, finish, read } = require('./lib.cjs')

const ROLLBACK2 = sqlBlockAfter(FILES.report2, '## 9. التراجع')
const ROLLBACK3 = sqlBlockAfter(FILES.report3, '## 7. التراجع')
const ROLLBACK4 = sqlBlockAfter(FILES.report4, '## 8. التراجع')
const ROLLBACK5 = sqlBlockAfter(FILES.report5, '## 8. التراجع')
const ROLLBACK6 = sqlBlockAfter(FILES.report6, '## 8. التراجع')
const ROLLBACK7 = sqlBlockAfter(FILES.report7, '## 8. التراجع')
const ROLLBACK8 = read(FILES.rollback8)
const ROLLBACK9 = read(FILES.rollback9)
const ROLLBACK8FIX = read(FILES.rollback8fix)
const ORIGINAL_GUARD = md5(functionBody('20260823161026_sync_fabric_sales_with_inventory.sql', 'private.validate_fabric_inventory_availability'))

// One fabric with a storefront card, and one consistent pickup order on it.
async function seed(db, label) {
  const { rows: [item] } = await db.query(
    `insert into public.fabric_inventory (name, fabric_type, sale_price_per_unit, images)
     values ($1, $1, 100.00, array['https://x.invalid/a.jpg']) returning id`, [label])
  const { rows: [color] } = await db.query(
    `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, 'c') returning id`, [item.id])
  await db.query(
    `insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity) values ($1, $2, 'in', 3.5)`,
    [item.id, color.id])
  const { rows: [listing] } = await db.query(`select id from public.fabrics where inventory_color_id = $1`, [color.id])
  await db.query('begin')
  await db.query(`select set_config('fabric_store.actor_type', 'customer', true)`)
  const { rows: [order] } = await db.query(`
    insert into public.fabric_store_orders (access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, delivery_method, vat_basis_points, items_net_halalas, vat_halalas, total_halalas,
      payment_due_at, terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at)
    values (decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'), now() + interval '9 days',
      gen_random_uuid(), decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'),
      'عميلة', '+966500000000', 'pickup', 1500, 35000, 5250, 40250, now() + interval '30 minutes', 't', 'r', 'p', now())
    returning id`)
  await db.query(`
    insert into public.fabric_store_order_items (order_id, line_number, fabric_id, inventory_item_id, inventory_color_id,
      fabric_name, purchase_mode, piece_length_cm, quantity_pieces, stock_consumption_cm, price_per_meter_halalas,
      discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas)
    values ($1, 1, $4, $2, $3, 'قطعة', 'piece', 350, 1, 350, 10000, 0, 35000, 35000, 5250, 40250)`,
    [order.id, item.id, color.id, listing.id])
  await db.query('commit')
  return { item: item.id, color: color.id, order: order.id }
}

async function main() {
  const server = await startServer('cycle')
  let failures = 0
  const check = (ok, text) => { console.log(`${ok ? '✔' : '✘'} ${text}`); if (!ok) failures += 1 }
  const db = await connect()
  const attempt = async sql => { try { await db.query(sql); return 'OK' } catch (e) { await db.query('rollback').catch(() => {}); return e.message } }
  try {
    await buildReplica(db)
    await db.query(read(FILES.migration2)); await db.query(read(FILES.migration3)); await db.query(read(FILES.migration4))
    await db.query(read(FILES.migration5))

    // --- stage 4 first: its rollback must work with a live order and hold in place ---
    const web = await seed(db, 'cycle-web')
    const { rows: [webListing] } = await db.query(`select id from public.fabrics where inventory_color_id = $1`, [web.color])
    await db.query('set role service_role')
    const { rows: [created] } = await db.query(`select public.fabric_store_create_checkout($1::jsonb) as r`, [JSON.stringify({
      checkout_key: '00000000-0000-4000-8000-00000000c4c4',
      request_fingerprint: 'aa'.repeat(32), access_token_hash: 'bb'.repeat(32), client_hash: 'cc'.repeat(32),
      customer: { name: 'عميلة', phone: '+966550000000' },
      delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
      // the seed fabric is 3.5 m: a whole piece (100.00 SAR/m × 3.5)
      totals: { items_net_halalas: 35000, vat_halalas: 5250, total_halalas: 40250 },
      policies: { terms: 't', returns: 'r', privacy: 'p' },
      items: [{ fabric_id: webListing.id, purchase_mode: 'piece', piece_length_cm: 350, price_per_meter_halalas: 10000,
        discount_basis_points: 0, unit_price_halalas: 35000, net_halalas: 35000, vat_halalas: 5250 }],
    })])
    await db.query('reset role')
    check(created.r.status === 'created', `a checkout order exists before the rollbacks (${created.r.status} ${created.r.code || ''})`)
    await db.query(`delete from public.fabric_store_orders where id = $1`, [web.order]) // the seed's own unreserved order

    // --- stage 5: refuses while a payment page is open; once closed, goes cleanly and keeps the records ---
    await db.query('set role service_role')
    const { rows: [begun] } = await db.query(
      `select public.fabric_store_begin_payment(decode($1, 'hex'), 'test', decode($2, 'hex')) as r`, ['bb'.repeat(32), 'dd'.repeat(32)])
    await db.query(`select public.fabric_store_attach_invoice($1, 'inv-cycle', 'https://checkout.moyasar.com/cycle')`, [begun.r.attempt_id])
    await db.query('reset role')
    check(begun.r.status === 'created', `a payment page is open (${begun.r.status})`)
    check(/ROLLBACK REFUSED: stage 5 is applied/.test(await attempt(ROLLBACK4)), 'rollback 4 refuses while stage 5 is applied')
    check(/ROLLBACK REFUSED: a payment page is open/.test(await attempt(ROLLBACK5)), 'rollback 5 refuses while a payment page is open')
    await db.query(`select public.fabric_store_apply_payment(null, 'test',
      '{"id":"pay-cycle","status":"failed","amount":40250,"currency":"SAR","invoice_id":"inv-cycle"}'::jsonb, null)`)
    check((await attempt(ROLLBACK5)) === 'OK', 'rollback 5 runs once no payment page is open')
    const { rows: [left5] } = await db.query(`select
      (select count(*) from pg_proc where proname in ('fabric_store_begin_payment', 'fabric_store_attach_invoice',
        'fabric_store_abandon_attempt', 'fabric_store_record_payment_event', 'fabric_store_apply_payment',
        'fabric_store_note_event_failure', 'fabric_store_pending_payment_events', 'fabric_store_payment_view'))::int as fn,
      (select count(*) from public.fabric_store_payment_attempts where provider_invoice_id = 'inv-cycle')::int as kept`)
    check(left5.fn === 0 && left5.kept === 1, `rollback 5 removes its 8 functions and keeps the payment record (${left5.fn} functions, ${left5.kept} attempt)`)
    await db.query('delete from public.fabric_store_payment_events; delete from public.fabric_store_payment_attempts')

    check(/ROLLBACK REFUSED: stage 4 is applied/.test(await attempt(ROLLBACK3)), 'rollback 3 refuses while stage 4 is applied')
    check((await attempt(ROLLBACK4)) === 'OK', 'rollback 4 runs with a live checkout order and hold in place')
    const { rows: [left4] } = await db.query(`select
      (select count(*) from pg_proc where proname in ('fabric_store_create_checkout', 'fabric_store_quote_snapshot', 'fabric_store_take_rate_limit'))::int as fn,
      (select count(*) from pg_class where relname = 'fabric_store_rate_limits')::int as rel,
      (select count(*) from public.fabric_store_orders where checkout_key = '00000000-0000-4000-8000-00000000c4c4')::int as kept`)
    check(left4.fn === 0 && left4.rel === 0 && left4.kept === 1,
      `rollback 4 removes its functions and table and keeps the order (${left4.fn} functions, ${left4.rel} tables, ${left4.kept} order)`)
    const { rows: [webHold] } = await db.query(
      `select count(*)::int as n from public.fabric_store_stock_reservations where inventory_color_id = $1 and status = 'active'`, [web.color])
    check(webHold.n === 1, 'the checkout hold still protects the fabric after rollback 4 (the shop guard still counts it)')
    await db.query(`select private.fabric_store_release_order_reservations(o.id, 'cycle')
      from public.fabric_store_orders o where o.checkout_key = '00000000-0000-4000-8000-00000000c4c4'`)

    const fixture = await seed(db, 'cycle')
    const item = { id: fixture.item }
    const color = { id: fixture.color }
    const order = { id: fixture.order }
    await db.query(`select private.fabric_store_reserve_order($1, now() + interval '30 minutes')`, [order.id])

    check(/ROLLBACK REFUSED: online holds are active/.test(await attempt(ROLLBACK3)), 'rollback 3 refuses while an online hold is active')
    check(/ROLLBACK REFUSED: stage 3 is applied/.test(await attempt(ROLLBACK2)), 'rollback 2 refuses while stage 3 is applied')

    await db.query(`select private.fabric_store_release_order_reservations($1, 'cycle')`, [order.id])
    check((await attempt(ROLLBACK3)) === 'OK', 'rollback 3 runs once no hold is active')
    const { rows: [guard] } = await db.query(`select md5(prosrc) as m from pg_proc where proname = 'validate_fabric_inventory_availability'`)
    check(guard.m === ORIGINAL_GUARD, 'the shop stock guard is back to the original byte for byte')
    const { rows: [left3] } = await db.query(`select
      (select count(*) from pg_proc where proname in
        ('fabric_store_stock_hold', 'fabric_store_reserve_order', 'fabric_store_release_order_reservations',
         'fabric_store_expire_reservations', 'fabric_store_block_reserved_stock_delete'))::int as fn,
      (select count(*) from pg_trigger where tgname like 'fabric_store_block_reserved%' and not tgisinternal)::int as tg`)
    check(left3.fn === 0 && left3.tg === 0, `no stage 3 function or trigger is left (${left3.fn} functions, ${left3.tg} triggers)`)

    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: 'aaaaaaaa-0000-4000-8000-000000000002', role: 'authenticated' })])
    await db.query('set role authenticated')
    const sale = await attempt(`insert into public.income (branch, category, customer_name, amount, fabric_items)
      values ('fabrics', 'fabric_sale', 'x', 100, '[{"inventory_id":"${item.id}","inventory_color_id":"${color.id}","name":"x","quantity_meters":0.5}]')`)
    await db.query('reset role')
    check(sale === 'OK', `a shop sale works after rollback 3 (${sale})`)

    check(/ROLLBACK REFUSED: fabric_store tables hold data/.test(await attempt(ROLLBACK2)), 'rollback 2 refuses while orders exist')
    await db.query('delete from public.fabric_store_orders')
    check((await attempt(ROLLBACK2)) === 'OK', 'rollback 2 runs on empty tables')
    const { rows: [left2] } = await db.query(`select (select count(*) from pg_class where relname like 'fabric_store%')::int as rel,
      (select count(*) from pg_proc where proname like 'fabric_store%')::int as fn`)
    check(left2.rel === 0 && left2.fn === 0, `nothing left (${left2.rel} relations, ${left2.fn} functions)`)

    await db.query(read(FILES.migration2)); await db.query(read(FILES.migration3)); await db.query(read(FILES.migration4))
    await db.query(read(FILES.migration5))
    const t2 = await runSqlTest(db, FILES.test2)
    const t3 = await runSqlTest(db, FILES.test3)
    const t4 = await runSqlTest(db, FILES.test4)
    const t5 = await runSqlTest(db, FILES.test5)
    check([t2, t3, t4, t5].every(t => t === 'PASS'), `re-applied: stage 2 ${t2} · stage 3 ${t3} · stage 4 ${t4} · stage 5 ${t5}`)

    // --- stage 7 on top of 6: rollback 6 refuses while 7 is applied; rollback 7 keeps the shipping data ---
    await db.query(read(FILES.migration6))
    await db.query(read(FILES.migration7))
    await db.query(read(FILES.migration7r))
    const t6 = await runSqlTest(db, FILES.test6)
    const t7 = await runSqlTest(db, FILES.test7)
    check(t6 === 'PASS' && t7 === 'PASS', `stages 6 and 7 applied, their live-safe tests ${t6} · ${t7}`)

    // --- stage 8 on top of 7: refuses while a refund is pending; restores the two replaced
    //     functions byte for byte; keeps the refund history and the refund-row lock ---
    // --- stage 9 on top of 8 (applied, tested, rolled back, re-applied, rolled back) ---
    const stage9 = async () => {
      await db.query(read(FILES.migration9))
      const t9 = await runSqlTest(db, FILES.test9)
      check(t9 === 'PASS', `stage 9 applied, its live-safe test ${t9}`)
      check((await attempt(ROLLBACK9)) === 'OK', 'rollback 9 runs')
      const { rows: [left9] } = await db.query(`select
        (select count(*) from pg_proc where proname in ('fabric_store_due_reconciliation', 'fabric_store_complete_reconciliation', 'fabric_store_staff_alerts'))::int as fn,
        (select count(*) from information_schema.columns where table_name = 'fabric_store_payment_attempts' and column_name = 'reconciled_at')::int as col`)
      check(left9.fn === 0 && left9.col === 1, `rollback 9 removes its 3 functions and keeps the column (${JSON.stringify(left9)})`)
    }

    // (fix batch A) `order by 1` inside an aggregate sorts by the constant 1, so the two rows came
    // out in heap order and an identical restore could compare unequal. Sort by the signature.
    const replaced = async () => (await db.query(`select string_agg(p.oid::regprocedure::text || '=' || md5(p.prosrc), ';' order by p.oid::regprocedure::text) as s
      from pg_proc p where p.proname in ('fabric_store_apply_payment', 'fabric_store_staff_set_fulfillment')`)).rows[0].s
    const before8 = await replaced()
    await db.query(read(FILES.migration8))
    const applyPaymentStage8 = await replaced()
    await db.query(read(FILES.migration8fix))
    const t8 = await runSqlTest(db, FILES.test8)
    check(t8 === 'PASS', `stage 8 applied, its live-safe test ${t8}`)
    await stage9()
    await stage9() // re-applied over the kept column, then rolled back again
    // --- the stage 8 correction: refuses under stage 9 and with a sent pending refund; restores stage 8 byte for byte ---
    await db.query(read(FILES.migration9))
    check(/ROLLBACK REFUSED: stage 9 is applied/.test(await attempt(ROLLBACK8FIX)), 'rollback of the stage 8 correction refuses while stage 9 is applied')
    check((await attempt(ROLLBACK9)) === 'OK', 'rollback 9 runs (before the correction rollback)')
    check(/ROLLBACK REFUSED: the stage 8 correction is applied/.test(await attempt(ROLLBACK8)), 'rollback 8 refuses while its correction is applied')
    await db.query(`set session_replication_role = replica`)
    await db.query(`insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by, provider_called_at)
                    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 100, 'مُرسل', gen_random_uuid(), now())`)
    await db.query(`set session_replication_role = default`)
    check(/ROLLBACK REFUSED: a refund sent to Moyasar is still pending/.test(await attempt(ROLLBACK8FIX)), 'the correction rollback refuses while a sent refund is pending')
    await db.query(`set session_replication_role = replica`)
    await db.query(`delete from public.fabric_store_refunds where reason = 'مُرسل'`)
    await db.query(`set session_replication_role = default`)
    check((await attempt(ROLLBACK8FIX)) === 'OK', 'the correction rollback runs')
    check((await replaced()) === applyPaymentStage8, 'the correction rollback restores the stage 8 apply_payment byte for byte')
    const { rows: [leftFix] } = await db.query(`select to_regprocedure('public.fabric_store_refund_close_unconfirmed(uuid, uuid, text, text, bigint)') is null as gone`)
    check(leftFix.gone, 'the correction rollback removes the close function')
    await db.query(read(FILES.migration8fix)) // re-applied, then rolled back before stage 8
    check((await attempt(ROLLBACK8FIX)) === 'OK', 'the correction rollback runs again')
    check(/ROLLBACK REFUSED: stage 8 is applied/.test(await attempt(ROLLBACK7)), 'rollback 7 refuses while stage 8 is applied')
    // a pending refund (FK/guards bypassed on purpose: only its presence matters here)
    await db.query(`set session_replication_role = replica`)
    await db.query(`insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by)
                    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 100, 'معلّق', gen_random_uuid())`)
    await db.query(`set session_replication_role = default`)
    check(/ROLLBACK REFUSED: a refund is pending/.test(await attempt(ROLLBACK8)), 'rollback 8 refuses while a refund is pending')
    await db.query(`set session_replication_role = replica`)
    await db.query(`delete from public.fabric_store_refunds where reason = 'معلّق'`)
    await db.query(`set session_replication_role = default`)
    check((await attempt(ROLLBACK8)) === 'OK', 'rollback 8 runs')
    check((await replaced()) === before8, 'rollback 8 restores apply_payment and set_fulfillment byte for byte')
    const { rows: [left8] } = await db.query(`select
      (select count(*) from pg_proc where proname in ('fabric_store_refund_begin', 'fabric_store_refund_finish', 'fabric_store_due_refunds',
         'fabric_store_refund_mark_called', 'fabric_store_restock_return', 'fabric_store_record_credit_note', 'fabric_store_restock_line',
         'fabric_store_mark_cut'))::int as fn,
      (select count(*) from information_schema.tables where table_name = 'fabric_store_restocks')::int as tbl,
      (select count(*) from information_schema.columns where table_name = 'fabric_store_refunds' and column_name = 'income_id')::int as col,
      (select position('fabric_store_refund' in prosrc) > 0 from pg_proc where proname = 'fabric_store_protect_online_sale') as lock_kept`)
    check(left8.fn === 0 && left8.tbl === 1 && left8.col === 1 && left8.lock_kept,
      `rollback 8 removes its functions, keeps the refund history and the refund-row lock (${JSON.stringify(left8)})`)
    const t7again = await runSqlTest(db, FILES.test7)
    check(t7again === 'PASS', `after rollback 8 the stage 7 test still passes (${t7again})`)
    // redo over what the rollback kept, then undo again
    const redo8 = await attempt(read(FILES.migration8))
    if (redo8 === 'OK') await db.query(read(FILES.migration8fix))
    const t8again = redo8 === 'OK' ? await runSqlTest(db, FILES.test8) : redo8
    check(t8again === 'PASS', `stage 8 re-applied over the kept columns and table, its test ${t8again}`)
    check((await attempt(ROLLBACK8FIX)) === 'OK', 'the correction rolled back before stage 8 again')
    check((await attempt(ROLLBACK8)) === 'OK' && (await replaced()) === before8, 'rollback 8 runs again')

    check(/ROLLBACK REFUSED: stage 7 is applied/.test(await attempt(ROLLBACK6)), 'rollback 6 refuses while stage 7 is applied')
    check((await attempt(ROLLBACK7)) === 'OK', 'rollback 7 runs')
    const { rows: [left7] } = await db.query(`select
      (select count(*) from pg_proc where proname like 'fabric_store_staff_%')::int as fn,
      (select count(*) from information_schema.columns where table_name = 'fabric_store_orders'
         and column_name in ('shipping_carrier', 'tracking_number', 'shipped_at'))::int as cols`)
    check(left7.fn === 0 && left7.cols === 3, `rollback 7 removes its 3 functions and keeps the shipping columns (${left7.fn} functions, ${left7.cols} columns)`)

    // --- stage 6: refuses while a paid order waits for its sale; goes cleanly and keeps the sale ---
    const six = await seed(db, 'cycle-six')
    await db.query(`delete from public.fabric_store_orders where id = $1`, [six.order])
    const { rows: [sixListing] } = await db.query(`select id from public.fabrics where inventory_color_id = $1`, [six.color])
    await db.query('set role service_role')
    const { rows: [sixOrder] } = await db.query(`select public.fabric_store_create_checkout($1::jsonb) as r`, [JSON.stringify({
      checkout_key: '00000000-0000-4000-8000-00000000c6c6',
      request_fingerprint: 'a6'.repeat(32), access_token_hash: 'b6'.repeat(32), client_hash: 'c6'.repeat(32),
      customer: { name: 'عميلة', phone: '+966550000006' },
      delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
      totals: { items_net_halalas: 35000, vat_halalas: 5250, total_halalas: 40250 },
      policies: { terms: 't', returns: 'r', privacy: 'p' },
      items: [{ fabric_id: sixListing.id, purchase_mode: 'piece', piece_length_cm: 350, price_per_meter_halalas: 10000,
        discount_basis_points: 0, unit_price_halalas: 35000, net_halalas: 35000, vat_halalas: 5250 }],
    })])
    const { rows: [sixBegun] } = await db.query(
      `select public.fabric_store_begin_payment(decode($1, 'hex'), 'live', decode($2, 'hex')) as r`, ['b6'.repeat(32), 'd6'.repeat(32)])
    await db.query(`select public.fabric_store_attach_invoice($1, 'inv-cycle6', 'https://checkout.moyasar.com/cycle6')`, [sixBegun.r.attempt_id])
    const { rows: [sixPaid] } = await db.query(`select public.fabric_store_apply_payment(null, 'live',
      '{"id":"pay-cycle6","status":"paid","amount":40250,"currency":"SAR","invoice_id":"inv-cycle6"}'::jsonb, null) as r`)
    await db.query('reset role')
    check(sixOrder.r.status === 'created' && sixPaid.r.status === 'paid', `a live order is paid (${sixOrder.r.status}/${sixPaid.r.status})`)
    check(/ROLLBACK REFUSED: stage 6 is applied/.test(await attempt(ROLLBACK5)), 'rollback 5 refuses while stage 6 is applied')
    check(/ROLLBACK REFUSED: paid orders are waiting/.test(await attempt(ROLLBACK6)), 'rollback 6 refuses while a paid order waits for its sale')
    await db.query('set role service_role')
    const { rows: [sixSale] } = await db.query(`select public.fabric_store_confirm_order($1) as r`, [sixOrder.r.order_id])
    await db.query('reset role')
    check(sixSale.r.status === 'confirmed', `the sale is recorded (${sixSale.r.status})`)
    check((await attempt(ROLLBACK6)) === 'OK', 'rollback 6 runs once no sale is pending')
    const { rows: [left6] } = await db.query(`select
      (select count(*) from pg_proc where proname in ('fabric_store_confirm_order', 'fabric_store_due_outbox',
        'fabric_store_finish_outbox', 'fabric_store_close_confirm_task', 'fabric_store_protect_online_sale'))::int as fn,
      (select count(*) from pg_trigger where tgname = 'fabric_store_protect_online_sale')::int as trg,
      (select count(*) from public.income i join public.fabric_store_orders o on o.income_id = i.id where o.id = $1)::int as kept`,
      [sixOrder.r.order_id])
    check(left6.fn === 0 && left6.trg === 0 && left6.kept === 1,
      `rollback 6 removes its 5 functions and the income trigger, and keeps the sale (${left6.fn} functions, ${left6.trg} triggers, ${left6.kept} sale)`)
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: 'aaaaaaaa-0000-4000-8000-000000000002', role: 'authenticated' })])
    await db.query('set role authenticated')
    const shopEdit = await attempt(`update public.income set notes = 'بعد التراجع' where id = '${sixSale.r.income_id}'`)
    await db.query('reset role')
    check(shopEdit === 'OK', `income is written normally after rollback 6 (${shopEdit})`)

    // the NOWAIT races below exercise rollback 3 on its own
    check((await attempt(ROLLBACK5)) === 'OK', 'rollback 5 again, before the rollback 3 races')
    check((await attempt(ROLLBACK4)) === 'OK', 'rollback 4 again, before the rollback 3 races')

    // An in-flight hold must make the rollback give up before it drops the guard.
    const racing = await seed(db, 'race')
    const other = await connect()
    await other.query('begin')
    await other.query(`select private.fabric_store_reserve_order($1, now() + interval '30 minutes')`, [racing.order])
    const startedAt = Date.now()
    const raced = await attempt(ROLLBACK3)
    const waitedMs = Date.now() - startedAt
    await other.query('rollback').catch(() => {})
    await other.end()
    check(/could not obtain lock|lock not available/i.test(raced) && waitedMs < 4000,
      `rollback 3 backs off from an in-flight hold (waited ${waitedMs} ms: ${raced.split('\n')[0]})`)
    const { rows: [guardAfter] } = await db.query(
      `select count(*)::int as n from pg_proc where proname = 'fabric_store_stock_hold'`)
    check(guardAfter.n === 1, 'the refused rollback left stage 3 intact')

    // The usual sale can lock its colour before inserting a movement.
    // NOWAIT must abandon the rollback rather than waiting on that colour.
    const LOCKS = ROLLBACK3.split('\n').filter(line => line.startsWith('lock table'))
    const raceRollback = async lockStatements => {
      const shop = await connect()
      const roll = await connect()
      await shop.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: 'aaaaaaaa-0000-4000-8000-000000000002', role: 'authenticated' })])
      await shop.query('set role authenticated')
      const seeded = await seed(db, `race-${Math.random().toString(16).slice(2, 8)}`)
      await shop.query('begin')
      // the sale has taken the colour row and is about to reach the stock guard
      await shop.query('update public.fabric_inventory_colors set current_quantity = current_quantity where id = $1', [seeded.color])
      await roll.query('begin')
      await roll.query(`set local lock_timeout = '5s'`)
      // the rollback takes its first lock, then the sale reaches the stock guard,
      // then the rollback asks for the rest: the interleaving that closes the cycle
      const firstLock = roll.query(lockStatements[0]).then(() => 'OK', error => error.message)
      await new Promise(resolve => setTimeout(resolve, 300))
      const sale = shop.query(
        `insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
         values ($1, $2, 'out', 0.5)`, [seeded.item, seeded.color]).then(() => 'OK', error => error.message)
      const rollLocks = firstLock.then(first => first !== 'OK' ? first
        : roll.query(lockStatements.slice(1).join('\n')).then(() => 'OK', error => error.message))
      const [rollResult, saleResult] = await Promise.all([rollLocks, sale])
      await roll.query('rollback').catch(() => {})
      await shop.query('rollback').catch(() => {})
      await roll.end(); await shop.end()
      return { roll: String(rollResult).split('\n')[0], sale: String(saleResult).split('\n')[0] }
    }
    const scriptOrder = await raceRollback(LOCKS)
    check(scriptOrder.sale === 'OK' && /could not obtain lock|lock not available/i.test(scriptOrder.roll),
      `the rollback never costs the shop a sale (sale: ${scriptOrder.sale} · rollback: ${scriptOrder.roll})`)
    // The inventory screen also inserts movements directly. That route gets a
    // movement-table lock BEFORE its trigger reaches the colour. A rollback that
    // already locked the colour must release it immediately when it sees the
    // movement-table lock, even though the usual sale above has the other order.
    const directMovement = async lockStatements => {
      const shop = await connect(); const roll = await connect()
      await shop.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: 'aaaaaaaa-0000-4000-8000-000000000002', role: 'authenticated' })])
      await shop.query('set role authenticated')
      const seeded = await seed(db, `direct-${Math.random().toString(16).slice(2, 8)}`)
      await roll.query('begin')
      await roll.query(`set local lock_timeout = '5s'`)
      await roll.query(lockStatements[0])
      await shop.query('begin')
      const movement = shop.query(
        `insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
         values ($1, $2, 'out', 0.5)`, [seeded.item, seeded.color]).then(() => 'OK', error => error.message)
      await new Promise(resolve => setTimeout(resolve, 300))
      const rollResult = await roll.query(lockStatements[1]).then(() => 'OK', error => error.message)
      await roll.query('rollback').catch(() => {})
      const movementResult = await movement
      await shop.query('rollback').catch(() => {})
      await roll.end(); await shop.end()
      return { roll: String(rollResult).split('\n')[0], movement: String(movementResult).split('\n')[0] }
    }
    const direct = await directMovement(LOCKS)
    check(direct.movement === 'OK' && /could not obtain lock|lock not available/i.test(direct.roll),
      `the rollback backs off from a direct stock movement (movement: ${direct.movement} · rollback: ${direct.roll})`)
    const blocking = await directMovement(LOCKS.map(sql => sql.replace(/ nowait;/i, ';')))
    check(/deadlock/i.test(`${blocking.movement} ${blocking.roll}`),
      `without NOWAIT the same route deadlocks (movement: ${blocking.movement} · rollback: ${blocking.roll})`)
  } catch (error) {
    check(false, `cycle aborted: ${error.message}`)
  }
  await db.end().catch(() => {})
  return finish(server, failures ? 1 : 0)
}

main()
