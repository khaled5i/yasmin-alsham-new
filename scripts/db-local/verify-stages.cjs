// Verify stages 2 and 3 on a real local Postgres 17 (see README.md).
//   node scripts/db-local/verify-stages.cjs [--no-concurrency]
//        [--mutate2 "<find>" "<replace>"]... [--mutate3 "<find>" "<replace>"]...
// Exit code 0 only if every check passes.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
  FILES, connect, startServer, buildReplica, garble, mutate, runSqlTest, finish, read, sleep,
} = require('./lib.cjs')

const STAFF = 'aaaaaaaa-0000-4000-8000-000000000002' // an active fabric_store_manager in replica-wiring.sql

const args = process.argv.slice(2)
const edits = { 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], '7r': [], 8: [], 9: [], A: [], B: [] }
for (let i = 0; i < args.length; i++) {
  const stage = { '--mutate2': 2, '--mutate3': 3, '--mutate4': 4, '--mutate5': 5, '--mutate6': 6, '--mutate7': 7, '--mutate7r': '7r', '--mutate8': 8, '--mutate9': 9, '--mutateA': 'A', '--mutateB': 'B' }[args[i]]
  if (stage) { edits[stage].push([args[i + 1], args[i + 2]]); i += 2 }
}
const withConcurrency = !args.includes('--no-concurrency')

async function asStaff(client) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: STAFF, role: 'authenticated' })])
  await client.query('set role authenticated')
}

async function makeFabric(client, label, meters) {
  const { rows: [item] } = await client.query(
    `insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
     values ($1, $1, 'meter', 100.00, array['https://x.invalid/a.jpg']) returning id`,
    [`db-local ${label}`])
  const { rows: [color] } = await client.query(
    `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, $2) returning id`, [item.id, label])
  await client.query(
    `insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity) values ($1, $2, 'in', $3)`,
    [item.id, color.id, meters])
  // the storefront card the shop screen shows (replica-wiring keeps it in step with the colour)
  const { rows: [listing] } = await client.query(
    `select id from public.fabrics where inventory_color_id = $1`, [color.id])
  return { item: item.id, color: color.id, listing: listing.id }
}

// One-line pickup order; same formulas as supabase/tests/fabric_store_reservations.sql (100.00 SAR/m).
async function makeOrder(client, lines) {
  const priced = lines.map(({ mode, cm }) => {
    const unit = mode === 'piece' ? (10000 * cm) / 100 : 10000
    const net = mode === 'piece' ? unit : Math.floor((10000 * cm + 50) / 100)
    return { mode, cm, unit, net }
  })
  const itemsNet = priced.reduce((sum, line) => sum + line.net, 0)
  const vat = Math.floor((itemsNet * 1500 + 5000) / 10000)
  // largest-remainder split of the VAT, like computeFabricOrderBreakdown
  const shares = priced.map(line => Math.floor((vat * line.net) / itemsNet))
  let left = vat - shares.reduce((a, b) => a + b, 0)
  priced.map((line, i) => ({ i, rem: (vat * line.net) % itemsNet }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i)
    .forEach(({ i }) => { if (left > 0) { shares[i] += 1; left -= 1 } })

  await client.query('begin')
  await client.query(`select set_config('fabric_store.actor_type', 'customer', true)`)
  const { rows: [order] } = await client.query(`
    insert into public.fabric_store_orders (access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, delivery_method, vat_basis_points, items_net_halalas, vat_halalas, total_halalas,
      payment_due_at, terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at)
    values (decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'), now() + interval '90 days',
      gen_random_uuid(), decode(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 'hex'),
      'عميلة', '+966500000000', 'pickup', 1500, $1, $2, $3, now() + interval '30 minutes', 't', 'r', 'p', now())
    returning id`, [itemsNet, vat, itemsNet + vat])
  for (const [n, line] of priced.entries()) {
    const { fabric } = lines[n]
    await client.query(`
      insert into public.fabric_store_order_items (order_id, line_number, fabric_id, inventory_item_id, inventory_color_id,
        fabric_name, purchase_mode, piece_length_cm, quantity_pieces, quantity_cm, stock_consumption_cm,
        price_per_meter_halalas, discount_basis_points, unit_price_halalas, net_halalas, vat_halalas, gross_halalas)
      values ($1, $2, $14, $3, $4, 'قماش', $5, $6, $7, $8, $9, 10000, 0, $10, $11, $12, $13)`,
      [order.id, n + 1, fabric.item, fabric.color, line.mode, line.mode === 'piece' ? line.cm : null,
       line.mode === 'piece' ? 1 : null, line.mode === 'meter' ? line.cm : null, line.cm,
       line.unit, line.net, shares[n], line.net + shares[n], fabric.listing])
  }
  await client.query('commit')
  return order.id
}

const HOLD = `select private.fabric_store_reserve_order($1, now() + interval '30 minutes')`

// Stage 4: the request the Next.js route sends, for one line at 100.00 SAR/m (pickup).
const CHECKOUT = 'select public.fabric_store_create_checkout($1::jsonb) as r'
const sha256hex = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
function checkoutRequest({ key = crypto.randomUUID(), listing, mode, cm, client, phone = '+966540000000' }) {
  const unit = mode === 'piece' ? (10000 * cm) / 100 : 10000
  const net = mode === 'piece' ? unit : Math.floor((unit * cm + 50) / 100)
  const vat = Math.floor((net * 1500 + 5000) / 10000)
  return JSON.stringify({
    checkout_key: key, request_fingerprint: sha256hex(`${key}:fp`), access_token_hash: sha256hex(`${key}:access`),
    client_hash: sha256hex(client), customer: { name: 'عميلة', phone },
    delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
    totals: { items_net_halalas: net, vat_halalas: vat, total_halalas: net + vat },
    policies: { terms: 't', returns: 'r', privacy: 'p' },
    items: [{ fabric_id: listing, purchase_mode: mode, piece_length_cm: mode === 'piece' ? cm : null,
      quantity_cm: mode === 'meter' ? cm : null, price_per_meter_halalas: 10000, discount_basis_points: 0,
      unit_price_halalas: unit, net_halalas: net, vat_halalas: vat }],
  })
}
async function asServer(client) { await client.query('set role service_role'); return client }

// Stage 6 fixture: an order paid in LIVE mode through the stage 4 + 5 entry points.
// lapse: the hold is released while the customer is on the payment page.
let paidCounter = 0
async function paidLiveOrder(admin, fabric, cm, { lapse = false } = {}) {
  paidCounter += 1
  const token = `s6-token-${paidCounter}-${crypto.randomUUID()}`
  const request = JSON.parse(checkoutRequest({ listing: fabric.listing, mode: 'meter', cm, client: `s6-${paidCounter}`,
    phone: `+96657${String(paidCounter).padStart(7, '0')}` }))
  request.access_token_hash = sha256hex(token)
  const svc = await asServer(await connect())
  const created = (await svc.query(CHECKOUT, [JSON.stringify(request)])).rows[0].r
  assert.equal(created.status, 'created', JSON.stringify(created))
  const begun = (await svc.query(`select public.fabric_store_begin_payment(decode($1, 'hex'), 'live', decode($2, 'hex')) as r`,
    [sha256hex(token), sha256hex(`s6-payer-${paidCounter}`)])).rows[0].r
  assert.equal(begun.status, 'created', JSON.stringify(begun))
  await svc.query(`select public.fabric_store_attach_invoice($1, $2, 'https://checkout.moyasar.com/x')`, [begun.attempt_id, `inv-s6-${paidCounter}`])
  if (lapse) await admin.query(`select private.fabric_store_release_order_reservations($1, 'انتهت المهلة')`, [created.order_id])
  const total = request.totals.total_halalas
  const applied = (await svc.query(`select public.fabric_store_apply_payment(null, 'live', $1::jsonb, null) as r`,
    [JSON.stringify({ id: `pay-s6-${paidCounter}`, status: 'paid', amount: total, currency: 'SAR', invoice_id: `inv-s6-${paidCounter}` })])).rows[0].r
  assert.equal(applied.status, 'paid', JSON.stringify(applied))
  await svc.end()
  return created.order_id
}
const CONFIRM = 'select public.fabric_store_confirm_order($1) as r'

async function shopSale(client, lines) {
  await client.query(
    `insert into public.income (branch, category, customer_name, amount, fabric_items) values ('fabrics', 'fabric_sale', 'زبونة المحل', 100, $1::jsonb)`,
    [JSON.stringify(lines.map(l => ({ inventory_id: l.item, inventory_color_id: l.color, name: 'قماش', quantity_meters: l.meters })))])
}

// Run fn in its own transaction; state.result = 'OK' or the error message.
function inTx(client, fn) {
  const state = { done: false, result: null, code: null }
  state.promise = (async () => {
    try {
      await client.query('begin'); await fn(); await client.query('commit'); state.result = 'OK'
    } catch (error) {
      await client.query('rollback').catch(() => {}); state.result = error.message; state.code = error.code
    } finally { state.done = true }
  })()
  return state
}

const scenarios = {
  async 'web hold first, shop sale waits'(admin) {
    const fabric = await makeFabric(admin, 'web-first', 3.5)
    const order = await makeOrder(admin, [{ fabric, mode: 'piece', cm: 350 }])
    const web = await connect(); const shop = await connect(); await asStaff(shop)
    await web.query('begin'); await web.query(HOLD, [order])
    const sale = inTx(shop, () => shopSale(shop, [{ ...fabric, meters: 0.5 }]))
    await sleep(500); const waited = !sale.done
    await web.query('commit'); await sale.promise; await web.end(); await shop.end()
    assert.ok(waited, 'the shop sale must wait for the web hold')
    assert.match(sale.result, /FABRIC_STOCK_RESERVED/, `the hold must refuse the shop sale, got: ${sale.result}`)
    return 'the shop sale waited, then was refused with a readable message'
  },
  async 'shop sale first, web hold waits'(admin) {
    const fabric = await makeFabric(admin, 'shop-first', 3.5)
    const order = await makeOrder(admin, [{ fabric, mode: 'piece', cm: 350 }])
    const web = await connect(); const shop = await connect(); await asStaff(shop)
    await shop.query('begin'); await shopSale(shop, [{ ...fabric, meters: 0.5 }])
    const hold = inTx(web, () => web.query(HOLD, [order]))
    await sleep(500); const waited = !hold.done
    await shop.query('commit'); await hold.promise; await web.end(); await shop.end()
    assert.ok(waited, 'the web hold must wait for the shop sale')
    assert.match(hold.result, /FABRIC_STORE_STOCK_CHANGED/, `the web hold must see the new stock, got: ${hold.result}`)
    return 'the web hold waited, then saw the piece had changed (3.5 m → 3 m)'
  },
  async 'two web buyers, one piece'(admin) {
    const fabric = await makeFabric(admin, 'two-web', 3.5)
    const o1 = await makeOrder(admin, [{ fabric, mode: 'piece', cm: 350 }])
    const o2 = await makeOrder(admin, [{ fabric, mode: 'piece', cm: 350 }])
    const w1 = await connect(); const w2 = await connect()
    await w1.query('begin'); await w1.query(HOLD, [o1])
    const second = inTx(w2, () => w2.query(HOLD, [o2]))
    await sleep(500); const waited = !second.done
    await w1.query('commit'); await second.promise; await w1.end(); await w2.end()
    assert.ok(waited, 'the second hold must wait')
    assert.match(second.result, /FABRIC_STORE_STOCK_UNAVAILABLE/, `the second hold must fail, got: ${second.result}`)
    return 'exactly one hold'
  },
  async '12 sessions, mixed shop sales and web holds'(admin) {
    const START_CM = 2000
    const fabric = await makeFabric(admin, 'stress', START_CM / 100)
    const orders = []
    for (let i = 0; i < 30; i++) orders.push(await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 + 50 * (i % 5) }]))
    const clients = []
    for (let i = 0; i < 12; i++) { const c = await connect(); if (i % 2 === 0) await asStaff(c); clients.push(c) }
    const outcomes = {}
    let next = 0
    await Promise.all(clients.map(async (client, i) => {
      for (let round = 0; round < 8; round++) {
        await sleep(Math.floor(Math.random() * 15))
        const index = i % 2 === 0 ? -1 : next++
        const state = i % 2 === 0
          ? inTx(client, () => shopSale(client, [{ ...fabric, meters: 0.5 * (1 + Math.floor(Math.random() * 4)) }]))
          : (index < orders.length ? inTx(client, () => client.query(HOLD, [orders[index]])) : null)
        if (!state) continue
        await state.promise
        const key = `${i % 2 === 0 ? 'shop' : 'web'}:${state.result === 'OK' ? 'ok' : (state.result.match(/FABRIC_[A-Z_]+/) || ['other'])[0]}`
        outcomes[key] = (outcomes[key] || 0) + 1
      }
    }))
    for (const c of clients) await c.end()
    const { rows: [f] } = await admin.query(`
      select (select current_quantity * 100 from public.fabric_inventory_colors where id = $1)::bigint as physical,
             (select coalesce(sum(quantity_cm), 0) from public.fabric_store_stock_reservations
               where inventory_color_id = $1 and status = 'active' and expires_at > now())::bigint as held,
             (select coalesce(sum(quantity * 100), 0) from public.fabric_inventory_movements
               where color_id = $1 and movement_type = 'out')::bigint as sold`, [fabric.color])
    assert.ok(Number(f.physical) >= 0, 'stock went negative')
    assert.ok(Number(f.held) <= Number(f.physical), `holds ${f.held} exceed stock ${f.physical}: held fabric was sold`)
    assert.equal(Number(f.physical) + Number(f.sold), START_CM, 'movements do not add up')
    return `20 m → ${f.physical / 100} m on the shelf, ${f.held / 100} m held, ${f.sold / 100} m sold · ${JSON.stringify(outcomes)}`
  },
  async 'opposite lock order (deadlock risk)'(admin) {
    const x = await makeFabric(admin, 'dl-x', 10)
    const y = await makeFabric(admin, 'dl-y', 10)
    const order = await makeOrder(admin, [{ fabric: x, mode: 'meter', cm: 200 }, { fabric: y, mode: 'meter', cm: 200 }])
    const [low, high] = [x, y].sort((a, b) => (a.color < b.color ? -1 : 1))
    const web = await connect(); const shop = await connect(); await asStaff(shop)
    // web holds the lower colour (as the hold function locks in id order); the shop sale takes the higher one first
    await web.query('begin')
    await web.query('select 1 from public.fabric_inventory_colors where id = $1 for update', [low.color])
    const sale = inTx(shop, () => shopSale(shop, [{ ...high, meters: 1 }, { ...low, meters: 1 }]))
    await sleep(50)
    let webResult = 'OK'
    try { await web.query(HOLD, [order]); await web.query('commit') } catch (error) {
      await web.query('rollback').catch(() => {}); webResult = `${error.code} ${error.message}`
    }
    await sale.promise; await web.end(); await shop.end()
    assert.equal(sale.result, 'OK', `the shop sale must go through, got: ${sale.result}`)
    assert.ok(webResult.startsWith('55P03'), `the web hold must back off with a lock timeout, got: ${webResult}`)
    return 'the web hold backed off (lock timeout, retryable); the shop sale went through'
  },
  async 'concurrent refunds (stage 2)'(admin) {
    const fabric = await makeFabric(admin, 'refund', 10)
    const order = await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 }]) // total 115.00
    await admin.query('begin')
    await admin.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
    const { rows: [attempt] } = await admin.query(`
      insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
      values ($1, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '15 minutes') returning id`, [order])
    await admin.query(`update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = $2 where id = $1`, [attempt.id, `pay_${attempt.id}`])
    await admin.query(`update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = $2 where id = $1`, [order, attempt.id])
    await admin.query('commit')
    const refund = client => client.query(`
      insert into public.fabric_store_refunds (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by)
      values ($1, $2, gen_random_uuid(), 7000, 'سباق', gen_random_uuid())`, [order, attempt.id])
    const a = await connect(); const b = await connect()
    await a.query('begin'); await refund(a)
    const second = inTx(b, () => refund(b))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    assert.ok(waited, 'the second refund must wait on the payment lock')
    assert.match(second.result, /FABRIC_STORE_REFUND_EXCEEDS/, `the second refund must be refused, got: ${second.result}`)
    return 'two 70.00 refunds on 115.00: the second waited, then was refused'
  },
  async 'concurrent payment attempts (stage 2)'(admin) {
    const fabric = await makeFabric(admin, 'attempt', 10)
    const order = await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 }])
    const insert = client => client.query(`
      insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
      values ($1, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '15 minutes')`, [order])
    const a = await connect(); const b = await connect()
    await a.query('begin'); await insert(a)
    const second = inTx(b, () => insert(b))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    assert.ok(waited, 'the second attempt must wait')
    assert.equal(second.code, '23505', `the second attempt must hit the one-open-attempt index, got: ${second.result}`)
    return 'double "pay": the second attempt waited, then was refused'
  },
  // The reviewer's race (round 2): a direct release of the hold and the payment
  // landing at the same moment must never end as "paid, and the fabric is back on
  // the shop shelf". Either one transaction dies, or the order comes out flagged.
  async 'payment lands while the hold is released'(admin) {
    const fabric = await makeFabric(admin, 'paid-race', 10)
    const order = await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 }])
    await admin.query(HOLD, [order])
    await admin.query('begin')
    await admin.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
    const { rows: [attempt] } = await admin.query(`
      insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
      values ($1, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '15 minutes') returning id`, [order])
    await admin.query(`update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = $2 where id = $1`,
      [attempt.id, `pay_race_${attempt.id}`])
    await admin.query('commit')

    const releaser = await connect(); const provider = await connect()
    await releaser.query('begin')
    await releaser.query(`update public.fabric_store_stock_reservations set status = 'released', end_reason = 'سباق' where order_id = $1`, [order])
    const pay = inTx(provider, async () => {
      await provider.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
      await provider.query(`update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = $2 where id = $1`, [order, attempt.id])
    })
    await sleep(400)
    const waited = !pay.done
    const releaseResult = await releaser.query('commit').then(() => 'OK', error => error.message)
    await pay.promise
    await releaser.end(); await provider.end()

    const { rows: [state] } = await admin.query(`
      select o.payment_status, o.needs_review,
             (select string_agg(r.status, ',') from public.fabric_store_stock_reservations r where r.order_id = o.id) as holds
      from public.fabric_store_orders o where o.id = $1`, [order])
    const paidWithLiveHold = state.payment_status === 'paid' && !/released/.test(state.holds || '')
    const paidAndFlagged = state.payment_status === 'paid' && state.needs_review
    const notPaid = state.payment_status !== 'paid'
    assert.ok(paidWithLiveHold || paidAndFlagged || notPaid,
      `paid order left with a released hold and no review flag: ${JSON.stringify(state)}`)
    assert.ok(waited, 'the payment must wait for the release transaction')
    return `the payment waited; ended ${state.payment_status}/${state.holds}, review=${state.needs_review} (release: ${String(releaseResult).split('\n')[0]})`
  },
  // ...and the other way round: the payment is committed first, then a direct
  // release arrives. Reading the order without locking it would let the release
  // see the pre-payment snapshot and free fabric a customer has already paid for.
  async 'hold released while the payment is landing'(admin) {
    const fabric = await makeFabric(admin, 'release-after-pay', 10)
    const order = await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 }])
    await admin.query(HOLD, [order])
    await admin.query('begin')
    await admin.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
    const { rows: [attempt] } = await admin.query(`
      insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
      values ($1, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '15 minutes') returning id`, [order])
    await admin.query(`update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = $2 where id = $1`,
      [attempt.id, `pay_late_${attempt.id}`])
    await admin.query('commit')

    const provider = await connect(); const releaser = await connect()
    await provider.query('begin')
    await provider.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
    await provider.query(`update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = $2 where id = $1`, [order, attempt.id])
    const release = inTx(releaser, () =>
      releaser.query(`update public.fabric_store_stock_reservations set status = 'released', end_reason = 'متأخر' where order_id = $1`, [order]))
    await sleep(400)
    const waited = !release.done
    await provider.query('commit')
    await release.promise
    await provider.end(); await releaser.end()

    const { rows: [state] } = await admin.query(`
      select o.payment_status,
             (select string_agg(r.status, ',') from public.fabric_store_stock_reservations r where r.order_id = o.id) as holds
      from public.fabric_store_orders o where o.id = $1`, [order])
    assert.ok(waited, 'the release must wait for the payment transaction')
    assert.match(release.result, /FABRIC_STORE_RESERVATION_PAID_ORDER/,
      `the late release must be refused, got: ${release.result}`)
    assert.equal(state.holds, 'active', `a paid order kept its hold, got: ${state.holds}`)
    return 'the release waited, then was refused: the paid order keeps its fabric'
  },
  async 'direct release and payment use compatible locks'(admin) {
    const fabric = await makeFabric(admin, 'no-payment-deadlock', 10)
    const order = await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 }])
    await admin.query(HOLD, [order])
    const { rows: [attempt] } = await admin.query(`
      insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
      values ($1, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '15 minutes') returning id`, [order])
    await admin.query(`update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = $2 where id = $1`,
      [attempt.id, `pay_no_dl_${attempt.id}`])
    const releaser = await connect(); const provider = await connect()
    await releaser.query('begin')
    await releaser.query(`select id from public.fabric_store_stock_reservations where order_id = $1 for update`, [order])
    await provider.query('begin')
    await provider.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
    const pay = provider.query(`update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = $2 where id = $1`,
      [order, attempt.id]).then(() => 'OK', error => `${error.code} ${error.message}`)
    await sleep(300)
    const release = await releaser.query(`update public.fabric_store_stock_reservations set status = 'released' where order_id = $1`,
      [order]).then(() => 'OK', error => `${error.code} ${error.message}`)
    await releaser.query(release === 'OK' ? 'commit' : 'rollback')
    const payment = await pay
    await provider.query(payment === 'OK' ? 'commit' : 'rollback')
    await releaser.end(); await provider.end()
    const { rows: [state] } = await admin.query(`
      select o.payment_status, o.needs_review, r.status as reservation_status
      from public.fabric_store_orders o join public.fabric_store_stock_reservations r on r.order_id = o.id
      where o.id = $1`, [order])
    assert.equal(release, 'OK', `release must complete without a deadlock, got: ${release}`)
    assert.equal(payment, 'OK', `payment must complete without a deadlock, got: ${payment}`)
    assert.deepEqual(state, { payment_status: 'paid', needs_review: true, reservation_status: 'released' })
    return 'release and payment both committed; the paid order is flagged for review'
  },
  async 'hold expires while payment waits on its row'(admin) {
    const fabric = await makeFabric(admin, 'expiry-during-payment', 10)
    const order = await makeOrder(admin, [{ fabric, mode: 'meter', cm: 100 }])
    await admin.query(`select private.fabric_store_reserve_order($1, clock_timestamp() + interval '3 seconds')`, [order])
    const { rows: [attempt] } = await admin.query(`
      insert into public.fabric_store_payment_attempts (order_id, provider, environment, idempotency_key, amount_halalas, expires_at)
      values ($1, 'moyasar', 'test', gen_random_uuid(), 11500, now() + interval '15 minutes') returning id`, [order])
    await admin.query(`update public.fabric_store_payment_attempts set status = 'paid', provider_payment_id = $2 where id = $1`,
      [attempt.id, `pay_expiry_${attempt.id}`])
    const locker = await connect(); const provider = await connect()
    await locker.query('begin')
    await locker.query(`select id from public.fabric_store_stock_reservations where order_id = $1 for update`, [order])
    await provider.query('begin')
    await provider.query(`select set_config('fabric_store.actor_type', 'provider', true)`)
    const pay = provider.query(`update public.fabric_store_orders set payment_status = 'paid', paid_attempt_id = $2 where id = $1`,
      [order, attempt.id]).then(() => 'OK', error => `${error.code} ${error.message}`)
    await sleep(4000)
    await locker.query('commit')
    const payment = await pay
    await provider.query(payment === 'OK' ? 'commit' : 'rollback')
    await locker.end(); await provider.end()
    const { rows: [state] } = await admin.query(`
      select o.payment_status, o.needs_review, r.expires_at < clock_timestamp() as expired
      from public.fabric_store_orders o join public.fabric_store_stock_reservations r on r.order_id = o.id
      where o.id = $1`, [order])
    assert.equal(payment, 'OK', `payment must be recorded, got: ${payment}`)
    assert.equal(state.expired, true, 'the hold must have expired during the wait')
    assert.equal(state.needs_review, true, 'the late payment must be flagged after the lock wait')
    return 'payment was recorded after expiry and flagged for review'
  },
  // --- stage 4: the server entry point under real concurrency ---
  async 'stage 4: the same checkout sent twice at once'(admin) {
    const fabric = await makeFabric(admin, 'double-submit', 10)
    const key = crypto.randomUUID()
    const request = checkoutRequest({ key, listing: fabric.listing, mode: 'meter', cm: 200, client: 'double' })
    const a = await asServer(await connect()); const b = await asServer(await connect())
    await a.query('begin')
    const first = await a.query(CHECKOUT, [request])
    const second = inTx(b, () => b.query(CHECKOUT, [request]).then(r => { second.status = r.rows[0].r.status }))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    const { rows: [n] } = await admin.query(
      `select (select count(*) from public.fabric_store_orders where checkout_key = $1)::int as orders,
              (select count(*) from public.fabric_store_stock_reservations r join public.fabric_store_orders o on o.id = r.order_id
                where o.checkout_key = $1)::int as holds`, [key])
    assert.equal(first.rows[0].r.status, 'created')
    assert.ok(waited, 'the second submit must wait for the first')
    assert.equal(second.status, 'existing', `the second submit must return the same order, got: ${second.result}/${second.status}`)
    assert.deepEqual(n, { orders: 1, holds: 1 })
    return 'the second submit waited, then got the same order (1 order, 1 hold)'
  },
  async 'stage 4: two browsers, the last piece'(admin) {
    const fabric = await makeFabric(admin, 'last-piece-web', 3.5)
    const a = await asServer(await connect()); const b = await asServer(await connect())
    await a.query('begin')
    const first = await a.query(CHECKOUT, [checkoutRequest({ listing: fabric.listing, mode: 'piece', cm: 350, client: 'lp-a', phone: '+966540000001' })])
    const second = inTx(b, () => b.query(CHECKOUT, [checkoutRequest({ listing: fabric.listing, mode: 'piece', cm: 350, client: 'lp-b', phone: '+966540000002' })])
      .then(r => { second.body = r.rows[0].r }))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    assert.equal(first.rows[0].r.status, 'created')
    assert.ok(waited, 'the second checkout must wait on the stock row')
    assert.equal(second.body && second.body.code, 'FABRIC_STORE_STOCK_UNAVAILABLE', `got: ${second.result} ${JSON.stringify(second.body)}`)
    const { rows: [held] } = await admin.query(
      `select count(*)::int as n from public.fabric_store_stock_reservations where inventory_color_id = $1 and status = 'active'`, [fabric.color])
    assert.equal(held.n, 1)
    return 'exactly one hold; the second browser waited, then was told the piece is gone'
  },
  async 'stage 4: a shop sale holds the stock row too long'(admin) {
    const fabric = await makeFabric(admin, 'busy-shop', 10)
    const shop = await connect(); await asStaff(shop)
    const web = await asServer(await connect())
    await shop.query('begin')
    await shopSale(shop, [{ ...fabric, meters: 1 }])
    const key = crypto.randomUUID()
    let webResult
    try {
      await web.query(CHECKOUT, [checkoutRequest({ key, listing: fabric.listing, mode: 'meter', cm: 100, client: 'busy', phone: '+966540000003' })])
      webResult = 'returned'
    } catch (error) { webResult = error.code }
    await shop.query('commit'); await shop.end(); await web.end()
    const { rows: [n] } = await admin.query(`select count(*)::int as n from public.fabric_store_orders where checkout_key = $1`, [key])
    assert.equal(webResult, '55P03', `the checkout must back off with a retryable lock timeout, got: ${webResult}`)
    assert.equal(n.n, 0, 'a backed-off checkout must leave no order')
    return 'the checkout backed off (55P03, retryable, nothing left); the shop sale went through'
  },
  // --- stage 5: the same payment confirmed twice at once (webhook + return page) ---
  async 'stage 5: one payment applied twice at the same moment'(admin) {
    const fabric = await makeFabric(admin, 'double-apply', 10)
    const token = 'double-apply-token'
    const key = crypto.randomUUID()
    const request = JSON.parse(checkoutRequest({ key, listing: fabric.listing, mode: 'meter', cm: 100, client: 'dbl', phone: '+966540000009' }))
    request.access_token_hash = sha256hex(token)
    const svc = await asServer(await connect())
    const created = (await svc.query(CHECKOUT, [JSON.stringify(request)])).rows[0].r
    assert.equal(created.status, 'created')
    const begun = (await svc.query(
      `select public.fabric_store_begin_payment(decode($1, 'hex'), 'test', decode($2, 'hex')) as r`,
      [sha256hex(token), sha256hex('dbl-payer')])).rows[0].r
    await svc.query(`select public.fabric_store_attach_invoice($1, 'inv-double', 'https://checkout.moyasar.com/x')`, [begun.attempt_id])
    await svc.end()
    const payment = JSON.stringify({ id: 'pay-double', status: 'paid', amount: 11500, currency: 'SAR', invoice_id: 'inv-double' })
    const apply = `select public.fabric_store_apply_payment(null, 'test', $1::jsonb, null) as r`
    const a = await asServer(await connect()); const b = await asServer(await connect())
    await a.query('begin')
    const first = (await a.query(apply, [payment])).rows[0].r
    const second = inTx(b, () => b.query(apply, [payment]).then(r => { second.status = r.rows[0].r.status }))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    const { rows: [n] } = await admin.query(`select
      (select count(*) from public.fabric_store_outbox where dedupe_key = 'confirm_order:' || $1::text)::int as confirms,
      (select payment_status from public.fabric_store_orders where id = $1::uuid) as payment`, [created.order_id])
    assert.equal(first.status, 'paid')
    assert.ok(waited, 'the second confirmation must wait on the order lock')
    assert.equal(second.status, 'already_paid', `got: ${second.result}/${second.status}`)
    assert.deepEqual(n, { confirms: 1, payment: 'paid' })
    return 'the second waited on the order, then saw it paid: one confirmation task'
  },
  // --- stage 6: confirming the sale next to the shop screen ---
  async 'stage 6: a shop sale holds the stock row while the sale is confirmed'(admin) {
    const fabric = await makeFabric(admin, 's6-busy', 10)
    const order = await paidLiveOrder(admin, fabric, 100)
    const shop = await connect(); await asStaff(shop)
    const web = await asServer(await connect())
    // a confirmation that waited for the shop instead of backing off would hang this test
    await web.query(`set statement_timeout = '5s'`)
    await shop.query('begin')
    await shopSale(shop, [{ ...fabric, meters: 2 }])
    let first
    try { first = (await web.query(CONFIRM, [order])).rows[0].r.status } catch (error) { first = error.code }
    const { rows: [mid] } = await admin.query(`select income_id,
      (select string_agg(status, ',') from public.fabric_store_stock_reservations where order_id = $1) as holds
      from public.fabric_store_orders where id = $1`, [order])
    await shop.query('commit')
    const second = (await web.query(CONFIRM, [order])).rows[0].r.status
    await shop.end(); await web.end()
    const { rows: [f] } = await admin.query(`select current_quantity::numeric as q from public.fabric_inventory_colors where id = $1`, [fabric.color])
    assert.equal(first, '55P03', `the confirmation must back off (lock timeout), got: ${first}`)
    assert.deepEqual(mid, { income_id: null, holds: 'active' }, 'a backed-off confirmation must leave nothing behind')
    assert.equal(second, 'confirmed')
    assert.equal(Number(f.q), 7, `10 − 2 (shop) − 1 (web) = 7, got ${f.q}`)
    return 'the confirmation backed off (55P03, nothing changed), the shop sale went through; the retry sold it (10 → 7 m)'
  },
  async 'stage 6: the same order confirmed twice at once'(admin) {
    const fabric = await makeFabric(admin, 's6-double', 10)
    const order = await paidLiveOrder(admin, fabric, 150)
    const a = await asServer(await connect()); const b = await asServer(await connect())
    await a.query('begin')
    const first = (await a.query(CONFIRM, [order])).rows[0].r.status
    const second = inTx(b, () => b.query(CONFIRM, [order]).then(r => { second.status = r.rows[0].r.status }))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    const { rows: [n] } = await admin.query(`select
      (select count(*) from public.income i join public.fabric_store_orders o on o.income_id = i.id where o.id = $1)::int as sales,
      (select count(*) from public.fabric_inventory_movements m join public.fabric_store_orders o on o.income_id = m.sale_income_id where o.id = $1)::int as movements,
      (select current_quantity::numeric from public.fabric_inventory_colors where id = $2) as stock`, [order, fabric.color])
    assert.equal(first, 'confirmed')
    assert.ok(waited, 'the second confirmation must wait on the order lock')
    assert.equal(second.status, 'already_confirmed', `got: ${second.result}/${second.status}`)
    assert.deepEqual({ ...n, stock: Number(n.stock) }, { sales: 1, movements: 1, stock: 8.5 })
    return 'the second waited, then saw the sale: one sale, one movement (10 → 8.5 m)'
  },
  async 'stage 6: late payment and a shop sale race for the last metre'(admin) {
    const fabric = await makeFabric(admin, 's6-last', 1)
    const order = await paidLiveOrder(admin, fabric, 100, { lapse: true })
    const shop = await connect(); await asStaff(shop)
    const web = await asServer(await connect())
    await web.query('begin')
    const confirmed = (await web.query(CONFIRM, [order])).rows[0].r.status
    const sale = inTx(shop, () => shopSale(shop, [{ ...fabric, meters: 1 }]))
    await sleep(400); const waited = !sale.done
    await web.query('commit'); await sale.promise; await shop.end(); await web.end()
    const { rows: [f] } = await admin.query(`select current_quantity::numeric as q from public.fabric_inventory_colors where id = $1`, [fabric.color])
    assert.equal(confirmed, 'confirmed')
    assert.ok(waited, 'the shop sale must wait for the confirmation')
    assert.match(sale.result, /FABRIC_STOCK_INSUFFICIENT/, `the shop must be refused, got: ${sale.result}`)
    assert.equal(Number(f.q), 0, 'stock must end at 0, never below')
    return 'the web sale took the last metre; the shop sale waited, then was refused (stock 0, never negative)'
  },
  async 'service_role writes stock directly'(admin) {
    const fabric = await makeFabric(admin, 'service', 5)
    const client = await connect()
    await client.query('set role service_role')
    let result = 'OK'
    try {
      await client.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity) values ($1, $2, 'out', 1)`, [fabric.item, fabric.color])
    } catch (error) { result = error.message }
    await client.end()
    assert.match(result, /permission denied for schema private/, `expected the documented refusal, got: ${result}`)
    return 'refused (permission denied for schema private) — server stock writes must go through a SECURITY DEFINER function'
  },
}

// Fix batch B (AUD-02): the hold starts at «ادفعي». Run after the migration is applied.
const BEGIN = `select public.fabric_store_begin_payment(decode($1, 'hex'), 'live', decode($2, 'hex')) as r`
let bCounter = 0
/** An order (no hold) whose access token is returned, ready for «ادفعي». */
async function orderB(fabric, mode, cm, phone) {
  bCounter += 1
  const token = `b-token-${bCounter}-${crypto.randomUUID()}`
  const request = JSON.parse(checkoutRequest({ listing: fabric.listing, mode, cm, client: `b-${bCounter}`, phone }))
  request.access_token_hash = sha256hex(token)
  const svc = await asServer(await connect())
  const created = (await svc.query(CHECKOUT, [JSON.stringify(request)])).rows[0].r
  await svc.end()
  assert.equal(created.status, 'created', JSON.stringify(created))
  return { token, orderId: created.order_id }
}
const payArgs = (order, payer) => [sha256hex(order.token), sha256hex(payer)]

const scenariosB = {
  async 'fix B: two customers press «ادفعي» for the last piece at once'(admin) {
    const fabric = await makeFabric(admin, 'b-last-piece', 3.5)
    // both orders are accepted: creating an order holds nothing
    const one = await orderB(fabric, 'piece', 350, '+966541000001')
    const two = await orderB(fabric, 'piece', 350, '+966541000002')
    const a = await asServer(await connect()); const b = await asServer(await connect())
    await a.query('begin')
    const first = (await a.query(BEGIN, payArgs(one, 'b-lp-a'))).rows[0].r
    const second = inTx(b, () => b.query(BEGIN, payArgs(two, 'b-lp-b')).then(r => { second.body = r.rows[0].r }))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    assert.equal(first.status, 'created', JSON.stringify(first))
    assert.ok(waited, 'the second «ادفعي» must wait (cap lock / stock row)')
    assert.equal(second.body && `${second.body.status}/${second.body.code}`, 'rejected/FABRIC_STORE_STOCK_UNAVAILABLE',
      `got: ${second.result} ${JSON.stringify(second.body)}`)
    const { rows: [n] } = await admin.query(`select
      (select count(*) from public.fabric_store_stock_reservations where inventory_color_id = $1 and status = 'active')::int as holds,
      (select count(*) from public.fabric_store_payment_attempts where order_id = $2)::int as second_attempts`, [fabric.color, two.orderId])
    assert.deepEqual(n, { holds: 1, second_attempts: 0 })
    return 'both orders were accepted; one hold; the second customer waited, then was told the piece is gone (no attempt)'
  },

  async 'fix B: two «ادفعي» at once with the store one piece below its cap'(admin) {
    // fill the store to 19 whole pieces held (orders of ≤ 5 pieces, each its own phone and sender)
    const held = (await admin.query(`select count(*) filter (where i.purchase_mode = 'piece')::int as n
      from public.fabric_store_stock_reservations r join public.fabric_store_order_items i on i.id = r.order_item_id
      where r.status = 'active' and r.expires_at > clock_timestamp()`)).rows[0].n
    let toHold = 19 - held
    assert.ok(toHold >= 0, `the replica already holds ${held} pieces`)
    let k = 0
    while (toHold > 0) {
      k += 1
      const f = await makeFabric(admin, `b-cap-fill-${k}`, 3.5)
      const o = await orderB(f, 'piece', 350, `+9665420000${String(k).padStart(2, '0')}`)
      const svc = await asServer(await connect())
      const r = (await svc.query(BEGIN, payArgs(o, `b-cap-fill-sender-${k}`))).rows[0].r
      await svc.end()
      assert.equal(r.status, 'created', JSON.stringify(r))
      toHold -= 1
    }
    const fa = await makeFabric(admin, 'b-cap-a', 3.5)
    const fb = await makeFabric(admin, 'b-cap-b', 3.5)
    const oa = await orderB(fa, 'piece', 350, '+966543000001')
    const ob = await orderB(fb, 'piece', 350, '+966543000002')
    const a = await asServer(await connect()); const b = await asServer(await connect())
    await a.query('begin')
    const first = (await a.query(BEGIN, payArgs(oa, 'b-cap-sender-a'))).rows[0].r
    const second = inTx(b, () => b.query(BEGIN, payArgs(ob, 'b-cap-sender-b')).then(r => { second.body = r.rows[0].r }))
    await sleep(400); const waited = !second.done
    await a.query('commit'); await second.promise; await a.end(); await b.end()
    assert.equal(first.status, 'created', JSON.stringify(first))
    assert.ok(waited, 'the second «ادفعي» must wait for the first to count')
    assert.equal(second.body && `${second.body.status}/${second.body.scope}`, 'hold_limit/store',
      `got: ${second.result} ${JSON.stringify(second.body)}`)
    const now = (await admin.query(`select count(*) filter (where i.purchase_mode = 'piece')::int as n
      from public.fabric_store_stock_reservations r join public.fabric_store_order_items i on i.id = r.order_item_id
      where r.status = 'active' and r.expires_at > clock_timestamp()`)).rows[0].n
    assert.equal(now, 20)
    // free the store for the scenarios after this one
    // (unpaid orders only: the stage 2 guard refuses to release a paid order's hold, rightly)
    await admin.query(`update public.fabric_store_stock_reservations set status = 'released', end_reason = 'scenario cleanup'
      where status = 'active' and order_id in (select id from public.fabric_store_orders where payment_status = 'pending')`)
    return 'the second waited on the cap lock, then was refused (store); exactly 20 pieces held, never 21'
  },

  async 'fix B: a shop sale and «ادفعي» on the same metre'(admin) {
    const fabric = await makeFabric(admin, 'b-busy-shop', 10)
    const o = await orderB(fabric, 'meter', 100, '+966544000001')
    const shop = await connect(); await asStaff(shop)
    const web = await asServer(await connect())
    await shop.query('begin')
    await shopSale(shop, [{ ...fabric, meters: 1 }])
    let webResult
    try {
      await web.query(BEGIN, payArgs(o, 'b-busy-sender'))
      webResult = 'returned'
    } catch (error) { webResult = error.code }
    await shop.query('commit'); await shop.end(); await web.end()
    const { rows: [n] } = await admin.query(`select
      (select count(*) from public.fabric_store_stock_reservations where order_id = $1)::int as holds,
      (select count(*) from public.fabric_store_payment_attempts where order_id = $1)::int as attempts`, [o.orderId])
    assert.equal(webResult, '55P03', `«ادفعي» must back off with a retryable lock timeout, got: ${webResult}`)
    assert.deepEqual(n, { holds: 0, attempts: 0 })
    return '«ادفعي» backed off (55P03, retryable, no hold, no attempt); the shop sale went through'
  },

  async 'fix B: «ادفعي» after the 30-minute order deadline'(admin) {
    const fabric = await makeFabric(admin, 'b-late', 10)
    const o = await orderB(fabric, 'meter', 100, '+966545000001')
    // the order guard forbids moving payment_due_at; only this test bypasses triggers to age the order
    await admin.query(`set session_replication_role = replica`)
    await admin.query(`update public.fabric_store_orders set created_at = now() - interval '40 minutes',
      payment_due_at = now() - interval '10 minutes' where id = $1`, [o.orderId])
    await admin.query(`set session_replication_role = origin`)
    const svc = await asServer(await connect())
    const r = (await svc.query(BEGIN, payArgs(o, 'b-late-sender'))).rows[0].r
    await svc.end()
    const { rows: [n] } = await admin.query(`select count(*)::int as holds from public.fabric_store_stock_reservations where order_id = $1`, [o.orderId])
    assert.equal(r.status, 'order_expired', JSON.stringify(r))
    assert.equal(n.holds, 0)
    return 'refused (order_expired), nothing held'
  },
}

async function main() {
  const server = await startServer('verify')
  let failures = 0
  const fail = message => { failures += 1; console.log(`✘ ${message}`) }
  try {
    const admin = await connect()
    await buildReplica(admin)

    const migration2 = mutate(read(FILES.migration2), edits[2])
    const migration3 = mutate(read(FILES.migration3), edits[3])

    // A migration read with the wrong encoding (what happened in August) must refuse and leave nothing.
    try {
      await admin.query(garble(migration2)); fail('garbled stage 2 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select count(*)::int as n from pg_class where relname like 'fabric_store%'`)
      if (left.n) fail(`garbled stage 2 left ${left.n} objects`); else console.log('✔ garbled stage 2 migration refused, nothing left')
    }
    await admin.query(migration2)
    try {
      await admin.query(garble(migration3)); fail('garbled stage 3 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname = 'fabric_store_stock_hold')::int as hold_fn,
        (select position('fabric_store_stock_hold' in prosrc) from pg_proc where proname = 'validate_fabric_inventory_availability')::int as changed`)
      if (left.hold_fn || left.changed) fail('garbled stage 3 left a trace'); else console.log('✔ garbled stage 3 migration refused, shop guard untouched')
    }
    await admin.query(migration3)
    const migration4 = mutate(read(FILES.migration4), edits[4])
    try {
      await admin.query(garble(migration4)); fail('garbled stage 4 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname in ('fabric_store_create_checkout', 'fabric_store_quote_snapshot', 'fabric_store_take_rate_limit'))::int as fn,
        (select count(*) from pg_class where relname = 'fabric_store_rate_limits')::int as rel`)
      if (left.fn || left.rel) fail('garbled stage 4 left a trace'); else console.log('✔ garbled stage 4 migration refused, nothing left')
    }
    await admin.query(migration4)
    const migration5 = mutate(read(FILES.migration5), edits[5])
    try {
      await admin.query(garble(migration5)); fail('garbled stage 5 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(
        `select count(*)::int as fn from pg_proc where proname in ('fabric_store_begin_payment', 'fabric_store_apply_payment', 'fabric_store_payment_view')`)
      if (left.fn) fail('garbled stage 5 left a trace'); else console.log('✔ garbled stage 5 migration refused, nothing left')
    }
    await admin.query(migration5)
    const migration6 = mutate(read(FILES.migration6), edits[6])
    try {
      await admin.query(garble(migration6)); fail('garbled stage 6 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname in ('fabric_store_confirm_order', 'fabric_store_due_outbox',
          'fabric_store_finish_outbox', 'fabric_store_protect_online_sale', 'fabric_store_close_confirm_task'))::int as fn,
        (select count(*) from pg_trigger where tgname = 'fabric_store_protect_online_sale')::int as trg`)
      if (left.fn || left.trg) fail('garbled stage 6 left a trace'); else console.log('✔ garbled stage 6 migration refused, nothing left (income untouched)')
    }
    await admin.query(migration6)
    const migration7 = mutate(read(FILES.migration7), edits[7])
    try {
      await admin.query(garble(migration7)); fail('garbled stage 7 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname like 'fabric_store_staff_%')::int as fn,
        (select count(*) from information_schema.columns where table_name = 'fabric_store_orders' and column_name = 'tracking_number')::int as col`)
      if (left.fn || left.col) fail('garbled stage 7 left a trace'); else console.log('✔ garbled stage 7 migration refused, nothing left')
    }
    await admin.query(migration7)
    const migration7r = mutate(read(FILES.migration7r), edits['7r'])
    try {
      await admin.query(garble(migration7r)); fail('garbled stage 7 review migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select array_agg(p.oid::regprocedure::text) as sigs from pg_proc p
        where p.proname = 'fabric_store_staff_resolve_review'`)
      if (String(left.sigs) !== 'fabric_store_staff_resolve_review(uuid,uuid,text)') fail(`garbled stage 7 review migration left a trace: ${left.sigs}`)
      else console.log('✔ garbled stage 7 review migration refused, the applied 3-argument version untouched')
    }
    await admin.query(migration7r)
    {
      const { rows: [after] } = await admin.query(`select array_agg(p.oid::regprocedure::text) as sigs from pg_proc p
        where p.proname = 'fabric_store_staff_resolve_review'`)
      if (String(after.sigs) !== 'fabric_store_staff_resolve_review(uuid,uuid,text,jsonb)') fail(`after the review migration: ${after.sigs}`)
      else console.log('✔ review migration: only the 4-argument resolve_review remains')
    }
    // The live correction replaces apply_payment after stage 8. Mutations in that function
    // must hit the final definition, otherwise the correction would hide the mutant.
    const fix8 = read(FILES.migration8fix)
    const edits8Fix = edits[8].filter(([find]) => fix8.includes(find))
    const edits8Base = edits[8].filter(([find]) => !fix8.includes(find))
    const migration8 = mutate(read(FILES.migration8), edits8Base)
    try {
      await admin.query(garble(migration8)); fail('garbled stage 8 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname in ('fabric_store_refund_begin', 'fabric_store_refund_finish',
          'fabric_store_due_refunds', 'fabric_store_restock_return', 'fabric_store_record_credit_note'))::int as fn,
        (select count(*) from information_schema.tables where table_name = 'fabric_store_restocks')::int as tbl,
        (select count(*) from information_schema.columns where table_name = 'fabric_store_refunds' and column_name = 'cancels_order')::int as col`)
      if (left.fn || left.tbl || left.col) fail('garbled stage 8 left a trace'); else console.log('✔ garbled stage 8 migration refused, nothing left')
    }
    await admin.query(migration8)
    const migration9 = mutate(read(FILES.migration9), edits[9])
    try {
      await admin.query(migration9)
      fail('stage 9 was applied without the refunded-first correction')
    } catch (error) {
      if (!String(error.message).includes('FABRIC_STORE_REFUNDED_FIRST_FIX_MISSING')) fail(`stage 9 dependency check: ${error.message}`)
      else console.log('✔ stage 9 refuses to run before the refunded-first correction')
    }
    const migration8fix = mutate(fix8, edits8Fix)
    try {
      await admin.query(garble(migration8fix)); fail('garbled stage 8 correction was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname = 'fabric_store_refund_close_unconfirmed')::int as fn,
        (select count(*) from information_schema.columns where table_name = 'fabric_store_refunds' and column_name = 'review_reference')::int as col,
        (select position('v_status = ''refunded'' and v_attempt.status <> ''paid''' in prosrc) from pg_proc
          where oid = 'public.fabric_store_apply_payment(uuid,text,jsonb,uuid)'::regprocedure)::int as branch`)
      if (left.fn || left.col || left.branch) fail('garbled stage 8 correction left a trace'); else console.log('✔ garbled stage 8 correction refused, nothing left')
    }
    await admin.query(migration8fix)
    try {
      await admin.query(garble(migration9)); fail('garbled stage 9 migration was APPLIED')
    } catch {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_proc where proname in ('fabric_store_due_reconciliation', 'fabric_store_complete_reconciliation', 'fabric_store_staff_alerts'))::int as fn,
        (select count(*) from information_schema.columns where table_name = 'fabric_store_payment_attempts' and column_name = 'reconciled_at')::int as col`)
      if (left.fn || left.col) fail('garbled stage 9 left a trace'); else console.log('✔ garbled stage 9 migration refused, nothing left')
    }
    await admin.query(migration9)
    // fix batch A (AUD-01): every stage test below runs with the income/expenses policies of the fix
    await admin.query(mutate(read(FILES.migrationA), edits.A))
    console.log('✔ replica built; stage 2 → 9 migrations + fix A applied')

    for (const [label, file] of [['stage 2 SQL test', FILES.test2], ['stage 3 SQL test', FILES.test3],
      ['stage 4 SQL test', FILES.test4], ['stage 5 SQL test', FILES.test5], ['stage 6 SQL test (live-safe)', FILES.test6],
      ['stage 6 local sale test (replica only)', FILES.test6local], ['stage 7 SQL test (live-safe)', FILES.test7],
      ['stage 8 SQL test (live-safe)', FILES.test8], ['stage 8 local refund test (replica only)', FILES.test8local],
      ['stage 9 SQL test (live-safe)', FILES.test9], ['fix A finance RLS SQL test (live-safe)', FILES.testA]]) {
      const result = await runSqlTest(admin, file)
      if (result === 'PASS') console.log(`✔ ${label}: PASS`); else fail(`${label}: ${result}`)
    }

    if (withConcurrency) {
      for (const [label, scenario] of Object.entries(scenarios)) {
        try { console.log(`✔ ${label}: ${await scenario(admin)}`) } catch (error) { fail(`${label}: ${error.message}`) }
      }
    }

    // ── fix batch B (AUD-02): everything above ran on the stages as written (holds at checkout).
    // B moves the hold to «ادفعي»: the stage 4 / 6-local / 7 tests and the two stage 4 races
    // assert the old behaviour on purpose and are not re-run; the rest must still pass on top of B.
    {
      // the live-safe B test must FAIL on the stages as written (the order holds its stock at checkout)
      const before = await runSqlTest(admin, FILES.testB)
      if (before.startsWith('FAILED') && /creating the order reserves nothing/.test(before)) console.log(`✔ fix B SQL test fails before the fix: ${before.slice(0, 120)}`)
      else fail(`fix B SQL test before the fix should fail at case 1, got: ${before}`)
    }
    // A mutant inside either replaced function changes its fingerprint; the re-apply and the rollback
    // would then stop at their own DRIFT checks before any behaviour check runs (a mutant "caught" for
    // the wrong reason). Point the self-fingerprints at the mutated bodies — only when a body changed.
    const bodyOf = (sql, head) => {
      const s = sql.replace(/\r\n/g, '\n')
      const open = s.indexOf('as $$', s.indexOf(head)) + 5
      return s.slice(open, s.indexOf('$$;', open))
    }
    const md5Text = text => crypto.createHash('md5').update(text, 'utf8').digest('hex')
    const originalB = read(FILES.migrationB)
    let migrationB = mutate(originalB, edits.B)
    let rollbackBText = read(FILES.rollbackB)
    for (const [head, own] of [['create or replace function public.fabric_store_create_checkout(p_request jsonb)', 'a50962d6f5a166c8ea8a7361c2827551'],
                               ['create or replace function public.fabric_store_begin_payment(', '5c4a23f068e34f5671498446c82891f2']]) {
      const mutated = bodyOf(migrationB, head)
      if (mutated !== bodyOf(originalB, head)) {
        migrationB = migrationB.split(`'${own}'`).join(`'${md5Text(mutated)}'`)
        rollbackBText = rollbackBText.split(`'${own}'`).join(`'${md5Text(mutated)}'`)
      }
    }
    {
      const md5Of = async signature => (await admin.query(
        `select md5(replace(prosrc, E'\\r\\n', E'\\n')) as m from pg_proc where oid = '${signature}'::regprocedure`)).rows[0].m
      // read with the wrong encoding: refused, nothing changed
      try {
        await admin.query(garble(migrationB)); fail('garbled fix B migration was APPLIED')
      } catch (error) {
        await admin.query('rollback').catch(() => {})
        const left = (await admin.query(`select to_regclass('private.fabric_store_hold_clients') is not null as t`)).rows[0].t
        if (/ENCODING/.test(error.message) && !left && (await md5Of('public.fabric_store_create_checkout(jsonb)')) === 'b5b222ed320f83ea5c20730244f5b2f1')
          console.log('✔ garbled fix B migration refused (encoding), nothing changed')
        else fail(`garbled fix B: ${error.message} / table left: ${left}`)
      }
      // a deployed begin_payment that is not the one we read: refused
      const original = (await admin.query(`select pg_get_functiondef('public.fabric_store_begin_payment(bytea, text, bytea)'::regprocedure) as d`)).rows[0].d
      await admin.query(`create or replace function public.fabric_store_begin_payment(p_access_hash bytea, p_environment text, p_client_hash bytea)
        returns jsonb language sql security definer set search_path = '' as $$ select '{"status":"changed by someone"}'::jsonb $$`)
      try {
        await admin.query(migrationB); fail('fix B replaced a begin_payment it did not read')
      } catch (error) {
        await admin.query('rollback').catch(() => {})
        if (/FABRIC_STORE_BEGIN_PAYMENT_DRIFT/.test(error.message)) console.log('✔ fix B refuses a begin_payment with another fingerprint')
        else fail(`fix B drift check: ${error.message}`)
      }
      await admin.query(original)
    }
    await admin.query(migrationB)
    await admin.query(migrationB) // re-applying is safe
    console.log('✔ fix B applied (and re-applied)')
    for (const [label, file] of [['stage 5 SQL test after B', FILES.test5], ['stage 6 SQL test after B (live-safe)', FILES.test6],
      ['stage 8 SQL test after B (live-safe)', FILES.test8], ['stage 8 local refund test after B', FILES.test8local],
      ['stage 9 SQL test after B (live-safe)', FILES.test9], ['fix A SQL test after B (live-safe)', FILES.testA],
      ['fix B SQL test (live-safe)', FILES.testB]]) {
      const result = await runSqlTest(admin, file)
      if (result === 'PASS') console.log(`✔ ${label}: PASS`); else fail(`${label}: ${result}`)
    }
    if (withConcurrency) {
      for (const [label, scenario] of Object.entries(scenariosB)) {
        try { console.log(`✔ ${label}: ${await scenario(admin)}`) } catch (error) { fail(`${label}: ${error.message}`) }
      }
    }

    // ── fix B rollback: refuses without the store-closed acknowledgement and with an open page;
    //    restores stages 4 and 5 byte for byte; B re-applies after it.
    {
      const rollbackB = rollbackBText
      const tryRollback = async ack => {
        try {
          await admin.query('begin')
          if (ack) await admin.query("set local fabric_store.rollback_b_ack = 'checkout-disabled'")
          await admin.query(rollbackB)
          await admin.query('commit')
          return 'OK'
        } catch (error) { await admin.query('rollback').catch(() => {}); return error.message }
      }
      const noAck = await tryRollback(false)
      if (/FIX_B_ROLLBACK_REFUSED: this re-opens AUD-02/.test(noAck)) console.log('✔ fix B rollback refuses without the checkout-disabled acknowledgement')
      else fail(`fix B rollback without acknowledgement: ${noAck}`)
      // an open payment page (a fresh order paid to «created»)
      const f = await makeFabric(admin, 'b-rollback-open', 5)
      const o = await orderB(f, 'meter', 100, '+966546000001')
      const svc = await asServer(await connect())
      const begun = (await svc.query(BEGIN, payArgs(o, 'b-rollback-sender'))).rows[0].r
      await svc.end()
      const openPage = await tryRollback(true)
      if (begun.status === 'created' && /a payment page is open now/.test(openPage)) console.log('✔ fix B rollback refuses while a payment page is open')
      else fail(`fix B rollback with an open page: ${begun.status} / ${openPage}`)
      await admin.query("update public.fabric_store_payment_attempts set status = 'cancelled', failure_code = 'test' where status in ('created', 'initiated', 'authorized')")
      const done = await tryRollback(true)
      const { rows: [after] } = await admin.query(`select
        (select md5(replace(prosrc, E'\\r\\n', E'\\n')) from pg_proc where oid = 'public.fabric_store_create_checkout(jsonb)'::regprocedure) as cc,
        (select md5(replace(prosrc, E'\\r\\n', E'\\n')) from pg_proc where oid = 'public.fabric_store_begin_payment(bytea, text, bytea)'::regprocedure) as bp,
        to_regclass('private.fabric_store_hold_clients') is null as table_gone`)
      if (done === 'OK' && after.cc === 'b5b222ed320f83ea5c20730244f5b2f1' && after.bp === '69e5b1bc11acc9d8a0be3a385bc5552b' && after.table_gone)
        console.log('✔ fix B rollback restores stages 4 and 5 byte for byte and drops hold_clients')
      else fail(`fix B rollback: ${done} ${JSON.stringify(after)}`)
      await admin.query(migrationB)
      const again = await runSqlTest(admin, FILES.testB)
      if (again === 'PASS') console.log('✔ fix B re-applied after its rollback: SQL test PASS'); else fail(`fix B after rollback: ${again}`)
    }
    await admin.end()
  } catch (error) {
    fail(error.patternMissing ? error.message : `run aborted: ${error.message}`)
    if (error.patternMissing) return finish(server, 3)
  }
  return finish(server, failures ? 1 : 0)
}

main()
