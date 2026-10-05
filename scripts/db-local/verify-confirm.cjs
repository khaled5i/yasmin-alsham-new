// Stage 6 end to end: a real local Postgres (migrations 2 → 6), the mock Moyasar server,
// and the app's own logic (payments.ts, confirm.ts, invoice-lines.ts loaded with jiti from
// a temp copy). The database is reached as the routes reach it: RPC calls AS service_role.
// The alostaz call itself is replaced by a recorder: this checks WHEN and HOW OFTEN the
// queue sends, not the alostaz HTTP API (that code is the shop's, moved unchanged).
//   node scripts/db-local/verify-confirm.cjs [--mutate6 "<find>" "<replace>"]... [--mutate-ts <file> "<find>" "<replace>"]...
// Exit code 0 only if every check passes.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createJiti } = require(require.resolve('jiti', { paths: [path.join(__dirname, '..', '..')] }))
const { FILES, connect, startServer, buildReplica, mutate, finish, read, sleep } = require('./lib.cjs')
const { startMoyasarMock } = require('./moyasar-mock.cjs')

const args = process.argv.slice(2)
const edits6 = []
const tsEdits = { 'moyasar.ts': [], 'payments.ts': [], 'confirm.ts': [], 'invoice-lines.ts': [] }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mutate6') { edits6.push([args[i + 1], args[i + 2]]); i += 2 }
  else if (args[i] === '--mutate-ts') { tsEdits[args[i + 1]].push([args[i + 2], args[i + 3]]); i += 3 }
}

const REPO = path.join(__dirname, '..', '..')
const TS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-confirm-ts-'))
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
const confirm = jiti(path.join(TS_DIR, 'confirm.ts'))
const lines = jiti(path.join(TS_DIR, 'invoice-lines.ts'))
process.on('exit', () => fs.rmSync(TS_DIR, { recursive: true, force: true }))

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const WEBHOOK_SECRET = 'whsec-local-test-0123456789'

async function main() {
  const server = await startServer('confirm')
  const mock = await startMoyasarMock()
  let failures = 0
  const results = []
  try {
    const admin = await connect()
    await buildReplica(admin)
    for (const file of [FILES.migration2, FILES.migration3, FILES.migration4, FILES.migration5]) await admin.query(read(file))
    await admin.query(mutate(read(FILES.migration6), edits6))
    // fix batch B (AUD-02): the hold starts at «ادفعي» — the chain production runs
    await admin.query(read(FILES.migrationB))

    const svc = await connect()
    await svc.query('set role service_role')
    const rpc = async (fn, named) => {
      const names = Object.keys(named)
      const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
      try {
        const { rows } = await svc.query(sql, names.map(n => {
          const v = named[n]
          if (Array.isArray(v)) return v
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
        }))
        return { data: rows[0].r, error: null }
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } }
      }
    }

    const ORIGIN = 'https://www.example-shop.test'
    const payDeps = environment => {
      const config = { secretKey: mock.secretKey, environment, apiBase: `${mock.base}/v1`, webhookSecret: WEBHOOK_SECRET }
      return { rpc, config, moyasar: moyasarLib.createMoyasarClient(config) }
    }
    const live = payDeps('live')
    const test = payDeps('test')

    let n = 0
    // A fabric with `meters` in stock and a 1 m pickup order on it (115.00), paid through
    // startPayment → Moyasar invoice → payment (webhook), in the given environment.
    async function paidOrder(label, { environment = 'live', meters = 10, onPaid } = {}) {
      n += 1
      const { rows: [item] } = await admin.query(
        `insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
         values ($1, $1, 'meter', 100.00, array['https://x.invalid/a.jpg']) returning id`, [`قماش ${label}`])
      const { rows: [color] } = await admin.query(
        `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, $2) returning id`, [item.id, label])
      await admin.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
                         values ($1, $2, 'in', $3)`, [item.id, color.id, meters])
      const { rows: [listing] } = await admin.query(`select id from public.fabrics where inventory_color_id = $1`, [color.id])
      const token = crypto.randomBytes(32).toString('hex')
      const key = crypto.randomUUID()
      const { data, error } = await rpc('fabric_store_create_checkout', { p_request: {
        checkout_key: key, request_fingerprint: sha(`${key}:fp`), access_token_hash: sha(token),
        client_hash: sha(`client-${label}`), customer: { name: 'عميلة', phone: `+96658${String(n).padStart(7, '0')}` },
        delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
        totals: { items_net_halalas: 10000, vat_halalas: 1500, total_halalas: 11500 },
        policies: { terms: 't', returns: 'r', privacy: 'p' },
        items: [{ fabric_id: listing.id, purchase_mode: 'meter', quantity_cm: 100, price_per_meter_halalas: 10000,
          discount_basis_points: 0, unit_price_halalas: 10000, net_halalas: 10000, vat_halalas: 1500 }],
      } })
      assert.equal(error, null, error && error.message)
      assert.equal(data.status, 'created', JSON.stringify(data))
      const deps = { ...(environment === 'live' ? live : test), onPaid }
      const started = await payments.startPayment(deps, { accessHash: sha(token), clientHash: sha(`payer-${label}`), origin: ORIGIN })
      assert.equal(started.ok, true, JSON.stringify(started))
      const invoice = [...mock.invoices.values()].find(i => i.metadata && i.metadata.attempt_id === started.attemptId)
      return { orderId: data.order_id, color: color.id, token, attemptId: started.attemptId, invoice, deps }
    }
    const payByWebhook = async order => {
      const payment = mock.pay(order.invoice.id, 'paid')
      const result = await payments.handleMoyasarWebhook(order.deps,
        mock.webhook(payment, { secret: WEBHOOK_SECRET, live: order.deps.config.environment === 'live' }))
      assert.equal(result.outcome, 'paid', JSON.stringify(result))
    }
    const sale = async orderId => (await admin.query(`
      select o.income_id, o.needs_review, i.amount::text as amount, i.invoice_number,
        (select string_agg(r.status, ',') from public.fabric_store_stock_reservations r where r.order_id = o.id) as holds,
        (select status || ':' || attempts from public.fabric_store_outbox t where t.dedupe_key = 'confirm_order:' || o.id) as confirm_task,
        (select status || ':' || attempts from public.fabric_store_outbox t where t.dedupe_key = 'alostaz_invoice:' || o.id) as alostaz_task
      from public.fabric_store_orders o left join public.income i on i.id = o.income_id where o.id = $1`, [orderId])).rows[0]
    const stock = async color => Number((await admin.query(
      `select current_quantity from public.fabric_inventory_colors where id = $1`, [color])).rows[0].current_quantity)

    function recorder(outcomes) {
      const calls = []
      const send = async incomeId => { calls.push(incomeId); return outcomes.shift() ?? { outcome: 'done', note: 'sent' } }
      return { calls, send }
    }

    const scenarios = {
      async 'webhook (live): the sale is recorded before the reply'() {
        const order = await paidOrder('webhook-live', { onPaid: id => confirm.processFabricStoreOutbox({ rpc }, { orderId: id }).then(() => {}) })
        await payByWebhook(order)
        const s = await sale(order.orderId)
        assert.ok(s.income_id, 'the webhook must leave a sale behind')
        assert.equal(s.amount, '115.00'); assert.equal(s.holds, 'consumed'); assert.equal(s.confirm_task, 'done:0')
        assert.equal(s.alostaz_task, 'pending:0', 'the invoice waits (alostaz off in the request)')
        assert.equal(await stock(order.color), 9)
        return `sale ${s.invoice_number} for 115.00, stock 10 → 9, hold consumed; the alostaz task is queued`
      },

      async 'return page (live), no webhook: the sale is recorded too'() {
        const order = await paidOrder('return-live', { onPaid: id => confirm.processFabricStoreOutbox({ rpc }, { orderId: id }).then(() => {}) })
        mock.pay(order.invoice.id, 'paid')
        const view = await payments.viewPaymentForReturn(order.deps, { accessHash: sha(order.token), clientHash: sha('payer-return-live'), attemptId: order.attemptId })
        assert.equal(view.payment_status, 'paid')
        const s = await sale(order.orderId)
        assert.ok(s.income_id); assert.equal(await stock(order.color), 9)
        return 'the return page verified the payment with Moyasar and the sale followed'
      },

      async 'test mode: paid, no sale, the fabric is back on the shelf'() {
        const order = await paidOrder('test-mode', { environment: 'test', onPaid: id => confirm.processFabricStoreOutbox({ rpc }, { orderId: id }).then(() => {}) })
        await payByWebhook(order)
        const s = await sale(order.orderId)
        assert.equal(s.income_id, null); assert.equal(s.holds, 'consumed'); assert.equal(s.alostaz_task, null)
        assert.equal(await stock(order.color), 10)
        const { rows: [hold] } = await admin.query(`select reserved_cm from private.fabric_store_stock_hold(null, $1)`, [order.color])
        assert.equal(Number(hold.reserved_cm), 0)
        return 'no income row, no invoice task, stock 10, nothing held'
      },

      async 'the after-payment step fails: the payment still stands, the job finishes it'() {
        const order = await paidOrder('onpaid-fails', { onPaid: async () => { throw new Error('database unreachable') } })
        await payByWebhook(order)
        let s = await sale(order.orderId)
        assert.equal(s.income_id, null); assert.equal(s.confirm_task, 'pending:0')
        const counts = await confirm.processFabricStoreOutbox({ rpc })
        assert.ok(counts['confirm:confirmed'] >= 1, JSON.stringify(counts))
        s = await sale(order.orderId)
        assert.ok(s.income_id)
        return `webhook still 'paid'; the job recorded the sale ${JSON.stringify(counts)}`
      },

      async 'queue: confirm then send the invoice once, then nothing is due'() {
        const order = await paidOrder('queue-once')
        await payByWebhook(order)
        const rec = recorder([])
        const counts = await confirm.processFabricStoreOutbox({ rpc, sendAlostazInvoice: rec.send }, { orderId: order.orderId })
        assert.equal(counts['confirm:confirmed'], 1, JSON.stringify(counts))
        assert.equal(counts['alostaz:done'], 1, JSON.stringify(counts))
        const s = await sale(order.orderId)
        assert.deepEqual(rec.calls, [s.income_id])
        assert.equal(s.alostaz_task, 'done:0')
        const again = await confirm.processFabricStoreOutbox({ rpc, sendAlostazInvoice: rec.send }, { orderId: order.orderId })
        assert.deepEqual(again, {}); assert.equal(rec.calls.length, 1)
        return 'one confirmation, one send for the new sale; a second run finds nothing'
      },

      async 'queue: alostaz switched off leaves the invoice task untouched'() {
        const order = await paidOrder('queue-off')
        await payByWebhook(order)
        const counts = await confirm.processFabricStoreOutbox({ rpc }, { orderId: order.orderId })
        assert.deepEqual(counts, { 'confirm:confirmed': 1 })
        assert.equal((await sale(order.orderId)).alostaz_task, 'pending:0')
        return 'confirmed; alostaz task still pending with 0 attempts'
      },

      async 'queue: a failed send waits and retries; an unknown outcome stops for a person'() {
        const order = await paidOrder('queue-retry')
        await payByWebhook(order)
        await confirm.processFabricStoreOutbox({ rpc }, { orderId: order.orderId })
        const rec = recorder([
          confirm.alostazTaskOutcome({ kind: 'failed', error: 'alostaz 422', outcomeUnknown: false }),
          confirm.alostazTaskOutcome({ kind: 'failed', error: 'socket hang up', outcomeUnknown: true }),
        ])
        const deps = { rpc, sendAlostazInvoice: rec.send }
        assert.deepEqual(await confirm.processFabricStoreOutbox(deps, { orderId: order.orderId }), { 'alostaz:retry': 1 })
        const { rows: [task] } = await admin.query(
          `select status, attempts, run_after > now() + interval '50 seconds' as later from public.fabric_store_outbox where dedupe_key = $1`,
          [`alostaz_invoice:${order.orderId}`])
        assert.deepEqual(task, { status: 'failed', attempts: 1, later: true })
        assert.deepEqual(await confirm.processFabricStoreOutbox(deps, { orderId: order.orderId }), {}, 'not due before its time')
        await admin.query(`update public.fabric_store_outbox set run_after = now() - interval '1 second' where dedupe_key = $1`,
          [`alostaz_invoice:${order.orderId}`])
        assert.deepEqual(await confirm.processFabricStoreOutbox(deps, { orderId: order.orderId }), { 'alostaz:dead': 1 })
        assert.equal((await sale(order.orderId)).alostaz_task, 'dead:2')
        return 'failure → retry in ≥ 60 s (not before) → outcome unknown → dead (no automatic resend)'
      },

      async 'a shop sale holds the stock row: confirmation retries and succeeds'() {
        const order = await paidOrder('busy-row')
        await payByWebhook(order)
        const blocker = await connect()
        await blocker.query('begin')
        await blocker.query('select 1 from public.fabric_inventory_colors where id = $1 for update', [order.color])
        setTimeout(() => { blocker.query('commit').then(() => blocker.end()) }, 1000)
        const t0 = Date.now()
        const result = await confirm.confirmPaidOrder({ rpc }, order.orderId, { attempts: 3, delayMs: 400 })
        assert.equal(result.status, 'confirmed', JSON.stringify(result))
        return `lock timeout, waited, retried: confirmed after ${Date.now() - t0} ms`
      },

      async 'a shop sale holds the stock row: one try only → the task waits for the job'() {
        const order = await paidOrder('busy-row-once')
        await payByWebhook(order)
        const blocker = await connect()
        await blocker.query('begin')
        await blocker.query('select 1 from public.fabric_inventory_colors where id = $1 for update', [order.color])
        const counts = await confirm.processFabricStoreOutbox({ rpc }, { limit: 50 })
        await blocker.query('commit'); await blocker.end()
        assert.ok(counts['confirm:retry'] >= 1, JSON.stringify(counts))
        const s = await sale(order.orderId)
        assert.equal(s.income_id, null); assert.equal(s.holds, 'active'); assert.match(s.confirm_task, /^failed:1$/)
        await admin.query(`update public.fabric_store_outbox set run_after = now() where dedupe_key = $1`, [`confirm_order:${order.orderId}`])
        const later = await confirm.processFabricStoreOutbox({ rpc }, { limit: 50 })
        assert.ok(later['confirm:confirmed'] >= 1, JSON.stringify(later))
        assert.ok((await sale(order.orderId)).income_id)
        return 'the scheduled run backed off (nothing changed, task failed:1), the next run sold it'
      },

      async 'invoice lines: each line as paid, shipping on its own, totals must agree'() {
        const order = { order_number: 'FS-100200', total_halalas: 63250, shipping_net_halalas: 5000, shipping_vat_halalas: 750 }
        const items = [
          { stock_consumption_cm: 350, gross_halalas: 40250, fabric_name: 'بطاقة' },
          { stock_consumption_cm: 150, gross_halalas: 17250, fabric_name: 'بطاقة 2' },
        ]
        const planned = lines.planOnlineInvoiceLines(order, items, [{ name: 'قماش P' }, { name: 'قماش M' }], '632.50')
        assert.deepEqual(planned.map(l => [l.kind, l.productName, l.quantity_meters, l.amount]), [
          ['fabric', 'قماش P', 3.5, 402.5], ['fabric', 'قماش M', 1.5, 172.5], ['shipping', 'رسوم شحن', 1, 57.5]])
        assert.throws(() => lines.planOnlineInvoiceLines(order, items, [{ name: 'x' }, { name: 'y' }], '632.49'), /لا تطابق/)
        assert.throws(() => lines.planOnlineInvoiceLines(order, items, [{ name: 'x' }], '632.50'), /لا تطابق/)
        assert.throws(() => lines.planOnlineInvoiceLines({ ...order, total_halalas: 63251 }, items, [{}, {}], '632.51'), /لا تطابق/)
        const pickup = lines.planOnlineInvoiceLines({ ...order, total_halalas: 57500, shipping_net_halalas: 0, shipping_vat_halalas: 0 },
          items, [{}, {}], 575)
        assert.equal(pickup.length, 2, 'no shipping line for pickup')
        assert.equal(pickup[0].productName, 'بطاقة', 'falls back to the snapshot name')
        return '402.50 + 172.50 + shipping 57.50 = 632.50; any disagreement stops before an invoice exists'
      },

      async 'alostaz outcomes: an unknown result is never retried'() {
        const map = confirm.alostazTaskOutcome
        assert.equal(map({ kind: 'sent', invoice_id: 1, invoice_code: 'INV-1', customer_id: 2, is_draft: false }).outcome, 'done')
        assert.equal(map({ kind: 'already_sent', invoice_id: 1, invoice_code: null }).outcome, 'done')
        assert.equal(map({ kind: 'in_progress' }).outcome, 'retry')
        assert.equal(map({ kind: 'failed', error: 'x', outcomeUnknown: false }).outcome, 'retry')
        for (const kind of ['review_required', 'not_found', 'not_fabric']) assert.equal(map({ kind }).outcome, 'dead', kind)
        assert.equal(map({ kind: 'failed', error: 'x', outcomeUnknown: true }).outcome, 'dead')
        assert.equal(map({ kind: 'sent_unsaved', invoice_id: 1, invoice_code: 'INV-1', warning: 'w' }).outcome, 'dead')
        return 'sent/already → done · in progress/known failure → retry · unknown/review/unsaved → stop'
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
