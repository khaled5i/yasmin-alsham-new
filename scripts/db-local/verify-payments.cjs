// Stage 5 end to end, without Moyasar keys: a real local Postgres (migrations 2 → 5),
// a mock Moyasar server (moyasar-mock.cjs), and the app's own payment logic
// (src/lib/server/fabric-store/payments.ts + moyasar.ts, loaded with jiti).
// The database is reached exactly as the routes reach it: RPC calls AS service_role.
//   node scripts/db-local/verify-payments.cjs [--mutate5 "<find>" "<replace>"]...
// Exit code 0 only if every check passes.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')
const { createJiti } = require(require.resolve('jiti', { paths: [path.join(__dirname, '..', '..')] }))
const { FILES, connect, startServer, buildReplica, mutate, finish, read } = require('./lib.cjs')
const { startMoyasarMock } = require('./moyasar-mock.cjs')

const fs = require('node:fs')
const os = require('node:os')

const args = process.argv.slice(2)
const edits5 = []
const tsEdits = { 'moyasar.ts': [], 'payments.ts': [] }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mutate5') { edits5.push([args[i + 1], args[i + 2]]); i += 2 }
  else if (args[i] === '--mutate-ts') { tsEdits[args[i + 1]].push([args[i + 2], args[i + 3]]); i += 3 }
}

// The payment logic is loaded from a COPY in a temp folder, so a TypeScript mutant
// never touches the repo files (a crash cannot leave a mutated source behind).
const REPO = path.join(__dirname, '..', '..')
const TS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-payments-ts-'))
for (const file of Object.keys(tsEdits)) {
  const source = read(path.join(REPO, 'src/lib/server/fabric-store', file))
  try {
    fs.writeFileSync(path.join(TS_DIR, file), mutate(source, tsEdits[file]))
  } catch (error) {
    console.log(`✘ ${error.message}`)
    fs.rmSync(TS_DIR, { recursive: true, force: true })
    process.exit(error.patternMissing ? 3 : 1)
  }
}
const jiti = createJiti(__filename, {
  alias: { zod: path.dirname(require.resolve('zod/package.json', { paths: [REPO] })) },
})
const payments = jiti(path.join(TS_DIR, 'payments.ts'))
const moyasarLib = jiti(path.join(TS_DIR, 'moyasar.ts'))
process.on('exit', () => fs.rmSync(TS_DIR, { recursive: true, force: true }))

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const WEBHOOK_SECRET = 'whsec-local-test-0123456789'

async function main() {
  const server = await startServer('payments')
  const mock = await startMoyasarMock()
  let failures = 0
  const results = []
  try {
    const admin = await connect()
    await buildReplica(admin)
    for (const file of [FILES.migration2, FILES.migration3, FILES.migration4]) await admin.query(read(file))
    await admin.query(mutate(read(FILES.migration5), edits5))

    const svc = await connect()
    await svc.query('set role service_role')
    // supabase-js rpc(fn, {named args}) over pg, AS service_role.
    const rpc = async (fn, named) => {
      const names = Object.keys(named)
      const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
      try {
        const { rows } = await svc.query(sql, names.map(n => {
          const v = named[n]
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
        }))
        return { data: rows[0].r, error: null }
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } }
      }
    }

    const config = { secretKey: mock.secretKey, environment: 'test', apiBase: `${mock.base}/v1`, webhookSecret: WEBHOOK_SECRET }
    const deps = { rpc, config, moyasar: moyasarLib.createMoyasarClient(config) }
    const ORIGIN = 'https://www.example-shop.test'

    let fabricNo = 0
    async function newOrder(label) {
      fabricNo += 1
      const { rows: [item] } = await admin.query(
        `insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
         values ($1, $1, 'meter', 100.00, array['https://x.invalid/a.jpg']) returning id`, [`pay-${label}`])
      const { rows: [color] } = await admin.query(
        `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, $2) returning id`, [item.id, label])
      await admin.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
                         values ($1, $2, 'in', 10)`, [item.id, color.id])
      const { rows: [listing] } = await admin.query(`select id from public.fabrics where inventory_color_id = $1`, [color.id])
      const token = crypto.randomBytes(32).toString('hex')
      const key = crypto.randomUUID()
      const { data, error } = await rpc('fabric_store_create_checkout', { p_request: {
        checkout_key: key, request_fingerprint: sha(`${key}:fp`), access_token_hash: sha(token),
        client_hash: sha(`client-${label}`), customer: { name: 'عميلة', phone: `+96657${String(fabricNo).padStart(7, '0')}` },
        delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
        totals: { items_net_halalas: 10000, vat_halalas: 1500, total_halalas: 11500 },
        policies: { terms: 't', returns: 'r', privacy: 'p' },
        items: [{ fabric_id: listing.id, purchase_mode: 'meter', quantity_cm: 100, price_per_meter_halalas: 10000,
          discount_basis_points: 0, unit_price_halalas: 10000, net_halalas: 10000, vat_halalas: 1500 }],
      } })
      assert.equal(error, null, error && error.message)
      assert.equal(data.status, 'created', JSON.stringify(data))
      return { orderId: data.order_id, accessHash: sha(token), clientHash: sha(`payer-${label}`) }
    }
    const start = (order, clientHash = order.clientHash) =>
      payments.startPayment(deps, { accessHash: order.accessHash, clientHash, origin: ORIGIN })
    const state = async orderId => (await admin.query(`
      select o.payment_status, o.needs_review, o.paid_attempt_id,
             (select count(*) from public.fabric_store_outbox x where x.dedupe_key = 'confirm_order:' || o.id)::int as confirms,
             (select string_agg(a.status, ',' order by a.created_at) from public.fabric_store_payment_attempts a where a.order_id = o.id) as attempts
      from public.fabric_store_orders o where o.id = $1`, [orderId])).rows[0]
    const invoiceFor = attemptId => [...mock.invoices.values()].find(i => i.metadata && i.metadata.attempt_id === attemptId)

    const scenarios = {
      async 'configuration refuses what it must'() {
        const cfg = moyasarLib.getMoyasarConfig
        assert.equal(cfg({}).ok, false)
        assert.equal(cfg({ MOYASAR_SECRET_KEY: 'pk_test_abc' }).ok, false, 'a publishable key is not a secret key')
        assert.equal(cfg({ MOYASAR_SECRET_KEY: 'sk_live_abc' }).reason, 'live-disabled', 'live keys need the explicit launch flag')
        assert.equal(cfg({ MOYASAR_SECRET_KEY: 'sk_live_abc', FABRIC_STORE_ALLOW_LIVE_PAYMENTS: 'true' }).config.environment, 'live')
        assert.equal(cfg({ MOYASAR_SECRET_KEY: 'sk_test_abc', MOYASAR_API_BASE: 'https://evil.example/v1' }).reason, 'bad-api-base')
        assert.equal(cfg({ MOYASAR_SECRET_KEY: 'sk_test_abc', MOYASAR_API_BASE: 'http://127.0.0.1:9/v1', NODE_ENV: 'production' }).reason, 'bad-api-base')
        assert.equal(cfg({ MOYASAR_SECRET_KEY: 'sk_test_abc', MOYASAR_WEBHOOK_SECRET: 'short' }).config.webhookSecret, null)
        return 'no key / publishable key / live without the launch flag / foreign API base → refused'
      },

      async 'start: invoice created once, pressing pay again returns the same link'() {
        const order = await newOrder('start')
        const first = await start(order)
        assert.equal(first.ok, true, JSON.stringify(first))
        const invoice = invoiceFor(first.attemptId)
        assert.ok(invoice, 'Moyasar received an invoice for the attempt')
        assert.equal(invoice.amount, 11500)
        assert.equal(invoice.success_url, `${ORIGIN}/fabrics/payment/return/?attempt=${first.attemptId}`)
        assert.ok(Date.parse(invoice.expired_at) <= Date.now() + 20 * 60 * 1000 + 1000, 'the page ends within 20 minutes')
        const again = await start(order)
        assert.equal(again.ok && again.checkoutUrl, first.checkoutUrl)
        assert.equal(again.reused, true)
        assert.equal([...mock.invoices.values()].filter(i => i.metadata.attempt_id === first.attemptId).length, 1)
        assert.equal((await state(order.orderId)).attempts, 'initiated')
        return 'one invoice (115.00, return URL, ≤ 20 min); the second press reused it'
      },

      async 'webhook: verified payment marks the order paid, replays change nothing'() {
        const order = await newOrder('webhook')
        const started = await start(order)
        const payment = mock.pay(invoiceFor(started.attemptId).id, 'paid')
        const body = mock.webhook(payment, { secret: WEBHOOK_SECRET, id: 'evt-webhook-1' })
        const first = await payments.handleMoyasarWebhook(deps, body)
        assert.equal(first.httpStatus, 200)
        assert.equal(first.outcome, 'paid')
        let s = await state(order.orderId)
        assert.equal(s.payment_status, 'paid'); assert.equal(s.confirms, 1); assert.equal(s.needs_review, false)
        const replay = await payments.handleMoyasarWebhook(deps, body)
        assert.equal(replay.httpStatus, 200); assert.equal(replay.outcome, 'duplicate')
        const again = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: WEBHOOK_SECRET, id: 'evt-webhook-2' }))
        assert.equal(again.outcome, 'already_paid')
        s = await state(order.orderId)
        assert.equal(s.confirms, 1)
        const { rows: [stored] } = await admin.query(
          `select payload::text as p from public.fabric_store_payment_events where provider_event_id = 'evt-webhook-1'`)
        assert.ok(!/4111|Card Holder|gw_secret_ref|123456|whsec/.test(stored.p), `card data or the secret was stored: ${stored.p}`)
        return 'paid once, one confirm_order; replays are no-ops; no card data or secret in the stored event'
      },

      async 'webhook: forged, malformed, or unconfigured is refused and not stored'() {
        const order = await newOrder('forged')
        const started = await start(order)
        const payment = mock.pay(invoiceFor(started.attemptId).id, 'paid')
        const before = (await admin.query('select count(*)::int as n from public.fabric_store_payment_events')).rows[0].n
        const forged = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: 'guessed-secret-000000' }))
        assert.equal(forged.httpStatus, 401)
        assert.equal((await payments.handleMoyasarWebhook(deps, '{not json')).httpStatus, 400)
        assert.equal((await payments.handleMoyasarWebhook(deps, JSON.stringify({ id: 'x' }))).httpStatus, 400)
        const unconfigured = await payments.handleMoyasarWebhook({ ...deps, config: { ...config, webhookSecret: null } },
          mock.webhook(payment, { secret: WEBHOOK_SECRET }))
        assert.equal(unconfigured.httpStatus, 503)
        const after = (await admin.query('select count(*)::int as n from public.fabric_store_payment_events')).rows[0].n
        assert.equal(after, before, 'refused webhooks must not be stored')
        assert.equal((await state(order.orderId)).payment_status, 'pending')
        return 'wrong secret 401 · bad JSON 400 · no secret configured 503 · nothing stored, nothing paid'
      },

      async 'webhook body says paid, Moyasar says failed: Moyasar wins'() {
        const order = await newOrder('lying')
        const started = await start(order)
        const payment = mock.pay(invoiceFor(started.attemptId).id, 'failed')
        const lie = mock.webhook(payment, { secret: WEBHOOK_SECRET, type: 'payment_paid', data: { ...payment, status: 'paid' } })
        const result = await payments.handleMoyasarWebhook(deps, lie)
        assert.equal(result.httpStatus, 200)
        assert.equal(result.outcome, 'failed')
        const s = await state(order.orderId)
        assert.equal(s.payment_status, 'pending'); assert.equal(s.attempts, 'failed')
        return 'the stored body said paid; the re-fetched payment said failed; the order stayed unpaid'
      },

      async 'live event on a test server is quarantined'() {
        const order = await newOrder('live-event')
        const started = await start(order)
        const payment = mock.pay(invoiceFor(started.attemptId).id, 'paid')
        const result = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: WEBHOOK_SECRET, live: true }))
        assert.equal(result.httpStatus, 200); assert.equal(result.outcome, 'quarantined')
        assert.equal((await state(order.orderId)).payment_status, 'pending')
        return 'stored, quarantined, order untouched'
      },

      async 'declined card, then pay again with a new invoice'() {
        const order = await newOrder('declined')
        const first = await start(order)
        const declined = mock.pay(invoiceFor(first.attemptId).id, 'failed')
        const r1 = await payments.handleMoyasarWebhook(deps, mock.webhook(declined, { secret: WEBHOOK_SECRET }))
        assert.equal(r1.outcome, 'failed')
        const second = await start(order)
        assert.equal(second.ok, true); assert.notEqual(second.attemptId, first.attemptId)
        const paid = mock.pay(invoiceFor(second.attemptId).id, 'paid')
        assert.equal((await payments.handleMoyasarWebhook(deps, mock.webhook(paid, { secret: WEBHOOK_SECRET }))).outcome, 'paid')
        const s = await state(order.orderId)
        assert.equal(s.payment_status, 'paid'); assert.equal(s.attempts, 'failed,paid')
        return 'the declined attempt failed (type payment_faild); a new invoice paid the order'
      },

      async 'no webhook at all: the return page confirms from Moyasar'() {
        const order = await newOrder('return')
        const started = await start(order)
        mock.pay(invoiceFor(started.attemptId).id, 'paid')
        const view = await payments.viewPaymentForReturn(deps, { accessHash: order.accessHash, clientHash: order.clientHash, attemptId: started.attemptId })
        assert.equal(view.verified, true); assert.equal(view.payment_status, 'paid')
        const refresh = await payments.viewPaymentForReturn(deps, { accessHash: order.accessHash, clientHash: order.clientHash, attemptId: started.attemptId })
        assert.equal(refresh.verified, false, 'a paid order is not re-verified')
        assert.equal((await state(order.orderId)).confirms, 1)
        return 'the customer closed nothing and no webhook came: the return page fetched the invoice and the order is paid'
      },

      async 'Moyasar down while processing a saved webhook: kept, retried later'() {
        const order = await newOrder('down')
        const started = await start(order)
        const payment = mock.pay(invoiceFor(started.attemptId).id, 'paid')
        mock.down(true)
        const result = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: WEBHOOK_SECRET, id: 'evt-down' }))
        mock.down(false)
        assert.equal(result.httpStatus, 200, 'the event is saved, so Moyasar must not resend it')
        assert.equal(result.outcome, 'retry')
        assert.equal((await state(order.orderId)).payment_status, 'pending')
        // the retry queue waits a minute; age the event (local harness only: triggers off for this one update)
        await admin.query(`set session_replication_role = replica;
          update public.fabric_store_payment_events set received_at = now() - interval '2 minutes' where provider_event_id = 'evt-down';
          set session_replication_role = origin;`)
        const outcomes = await payments.processPendingPaymentEvents(deps)
        assert.equal(outcomes.paid, 1, JSON.stringify(outcomes))
        assert.equal((await state(order.orderId)).payment_status, 'paid')
        return `saved while Moyasar was down (200), then the retry job paid it ${JSON.stringify(outcomes)}`
      },

      async 'invoice creation fails or times out: nothing dangling, the next press works'() {
        const order = await newOrder('create-fail')
        mock.failNext('500')
        const r500 = await start(order)
        assert.equal(r500.ok, false); assert.equal(r500.httpStatus, 503)
        mock.failNext('422')
        const r422 = await start(order)
        assert.equal(r422.ok, false); assert.equal(r422.httpStatus, 502)
        mock.failNext('bad-url')
        const bad = await start(order)
        assert.equal(bad.ok, false); assert.equal(bad.code, 'provider-mismatch')
        mock.failNext('wrong-amount')
        const wrong = await start(order)
        assert.equal(wrong.ok, false); assert.equal(wrong.code, 'provider-mismatch')
        assert.equal((await state(order.orderId)).attempts, 'cancelled,cancelled,cancelled,cancelled')
        const ok = await start(order)
        assert.equal(ok.ok, true, JSON.stringify(ok))
        return '500 → 503 · 400 → 502 · foreign checkout URL and wrong amount refused · each attempt closed · the fifth start works'
      },

      async 'timeout creating the invoice'() {
        const order = await newOrder('timeout')
        mock.failNext('timeout')
        const t0 = Date.now()
        const result = await start(order)
        assert.equal(result.ok, false); assert.equal(result.httpStatus, 503)
        assert.ok(Date.now() - t0 < 9000, 'the request must give up within the timeout')
        assert.equal((await state(order.orderId)).attempts, 'cancelled')
        return `gave up after ${Date.now() - t0} ms; attempt closed as create_unknown`
      },

      async 'crash after Moyasar created the invoice: metadata recovers the payment'() {
        const order = await newOrder('crash')
        // the app dies between "invoice created" and "invoice attached"
        const failingRpc = (fn, named) => fn === 'fabric_store_attach_invoice'
          ? Promise.resolve({ data: null, error: { message: 'connection reset' } }) : rpc(fn, named)
        await assert.rejects(payments.startPayment({ ...deps, rpc: failingRpc },
          { accessHash: order.accessHash, clientHash: order.clientHash, origin: ORIGIN }))
        const { rows: [attempt] } = await admin.query(
          `select id, status, provider_invoice_id from public.fabric_store_payment_attempts where order_id = $1`, [order.orderId])
        assert.equal(attempt.status, 'created'); assert.equal(attempt.provider_invoice_id, null)
        const payment = mock.pay(invoiceFor(attempt.id).id, 'paid')
        const result = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: WEBHOOK_SECRET }))
        assert.equal(result.outcome, 'paid')
        assert.equal((await state(order.orderId)).payment_status, 'paid')
        return 'the unattached attempt was found through the invoice metadata and the order paid'
      },

      async 'amount paid differs from the order: quarantined, flagged, not paid'() {
        const order = await newOrder('amount')
        const started = await start(order)
        const payment = mock.pay(invoiceFor(started.attemptId).id, 'paid', { amount: 100 })
        const result = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: WEBHOOK_SECRET }))
        assert.equal(result.outcome, 'quarantined')
        const s = await state(order.orderId)
        assert.equal(s.payment_status, 'pending'); assert.equal(s.needs_review, true)
        return 'a 1.00 payment on 115.00: order flagged for review, not paid'
      },
    }

    for (const [label, scenario] of Object.entries(scenarios)) {
      try { results.push(`✔ ${label}: ${await scenario()}`) } catch (error) {
        failures += 1; results.push(`✘ ${label}: ${error.message}`)
      }
    }
    await svc.end(); await admin.end()
  } catch (error) {
    failures += 1
    results.push(error.patternMissing ? `✘ ${error.message}` : `✘ run aborted: ${error.stack || error.message}`)
    if (error.patternMissing) { console.log(results.join('\n')); await mock.close(); return finish(server, 3) }
  }
  console.log(results.join('\n'))
  await mock.close()
  return finish(server, failures ? 1 : 0)
}

main()
