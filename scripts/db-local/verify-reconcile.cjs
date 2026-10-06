// Stage 9 end to end: a real local Postgres (migrations 2 → 9), the mock Moyasar server and
// the app's own logic (payments.ts, confirm.ts, moyasar.ts loaded with jiti from a temp
// copy). What matters: a payment Moyasar knows about but we never heard of (webhook lost,
// page closed) is found and sold ONCE; a refund made outside the system is flagged; the
// staff alerts follow the state.
//   node scripts/db-local/verify-reconcile.cjs [--mutate9 "<find>" "<replace>"]... [--mutate-ts <file> "<find>" "<replace>"]...
// Exit code 0 only if every check passes.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createJiti } = require(require.resolve('jiti', { paths: [path.join(__dirname, '..', '..')] }))
const { FILES, connect, startServer, buildReplica, mutate, finish, read } = require('./lib.cjs')
const { startMoyasarMock } = require('./moyasar-mock.cjs')

const args = process.argv.slice(2)
const edits9 = []
const editsC = [] // fix batch C mutants (--mutateC)
const tsEdits = { 'moyasar.ts': [], 'payments.ts': [], 'confirm.ts': [], 'invoice-lines.ts': [] }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mutate9') { edits9.push([args[i + 1], args[i + 2]]); i += 2 }
  else if (args[i] === '--mutateC') { editsC.push([args[i + 1], args[i + 2]]); i += 2 }
  else if (args[i] === '--mutate-ts') { tsEdits[args[i + 1]].push([args[i + 2], args[i + 3]]); i += 3 }
}

const REPO = path.join(__dirname, '..', '..')
const TS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-reconcile-ts-'))
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
process.on('exit', () => fs.rmSync(TS_DIR, { recursive: true, force: true }))

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const WEBHOOK_SECRET = 'whsec-local-test-0123456789'

async function main() {
  const server = await startServer('reconcile')
  const mock = await startMoyasarMock()
  let failures = 0
  const results = []
  try {
    const admin = await connect()
    await buildReplica(admin)
    for (const file of [FILES.migration2, FILES.migration3, FILES.migration4, FILES.migration5, FILES.migration6,
                        FILES.migration7, FILES.migration7r, FILES.migration8, FILES.migration8fix]) await admin.query(read(file))
    await admin.query(mutate(read(FILES.migration9), edits9))
    // fix batch B (AUD-02): the hold starts at «ادفعي» — the chain production runs
    await admin.query(read(FILES.migrationB))
    // fix batch C (what the app runs on now). Not under a mutant of an earlier stage: C's drift check
    // would refuse it, and the mutant would be "caught" for the wrong reason.
    if (!edits9.length) await admin.query(mutate(read(FILES.migrationC), editsC))

    const svc = await connect()
    await svc.query('set role service_role')
    const rpc = async (fn, named) => {
      const names = Object.keys(named)
      const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
      try {
        const { rows } = await svc.query(sql, names.map(n => {
          const v = named[n]
          if (Array.isArray(v)) return v.some(x => x !== null && typeof x === 'object') ? JSON.stringify(v) : v
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
        }))
        return { data: rows[0].r, error: null }
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } }
      }
    }

    const ORIGIN = 'https://www.example-shop.test'
    const makeDeps = (environment, withConfirm = true) => {
      const config = { secretKey: mock.secretKey, environment, apiBase: `${mock.base}/v1`, webhookSecret: WEBHOOK_SECRET }
      return {
        rpc, config, moyasar: moyasarLib.createMoyasarClient(config),
        onPaid: withConfirm ? id => confirm.processFabricStoreOutbox({ rpc }, { orderId: id }).then(() => {}) : undefined,
      }
    }
    const live = makeDeps('live')
    const liveNoConfirm = makeDeps('live', false)
    const test = makeDeps('test')

    let n = 0
    // A 1 m pickup order (115.00) with its payment page opened; nothing paid yet.
    async function openOrder(label, deps = live) {
      n += 1
      const { rows: [item] } = await admin.query(
        `insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
         values ($1, $1, 'meter', 100.00, array['https://x.invalid/a.jpg']) returning id`, [`قماش ${label}`])
      const { rows: [color] } = await admin.query(
        `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, $2) returning id`, [item.id, label])
      await admin.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
                         values ($1, $2, 'in', 10)`, [item.id, color.id])
      const { rows: [listing] } = await admin.query(`select id from public.fabrics where inventory_color_id = $1`, [color.id])
      const token = crypto.randomBytes(32).toString('hex')
      const key = crypto.randomUUID()
      const { data } = await rpc('fabric_store_create_checkout', { p_request: {
        checkout_key: key, request_fingerprint: sha(`${key}:fp`), access_token_hash: sha(token),
        client_hash: sha(`client-${label}`), customer: { name: 'عميلة', phone: `+96559${String(n).padStart(7, '0')}` },
        delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
        totals: { items_net_halalas: 10000, vat_halalas: 1500, total_halalas: 11500 },
        policies: { terms: 't', returns: 'r', privacy: 'p' },
        items: [{ fabric_id: listing.id, purchase_mode: 'meter', quantity_cm: 100, price_per_meter_halalas: 10000,
          discount_basis_points: 0, unit_price_halalas: 10000, net_halalas: 10000, vat_halalas: 1500 }],
      } })
      assert.equal(data.status, 'created', JSON.stringify(data))
      const started = await payments.startPayment(deps, { accessHash: sha(token), clientHash: sha(`payer-${label}`), origin: ORIGIN })
      assert.equal(started.ok, true, JSON.stringify(started))
      const invoice = [...mock.invoices.values()].find(i => i.metadata && i.metadata.attempt_id === started.attemptId)
      return { orderId: data.order_id, color: color.id, attemptId: started.attemptId, invoice }
    }
    // The page's time is over (the attempt's own expiry, kept after its creation time).
    const endPage = attemptId => admin.query(
      `update public.fabric_store_payment_attempts set expires_at = created_at + interval '1 millisecond' where id = $1`, [attemptId])
    const state = async orderId => (await admin.query(`
      select o.payment_status, o.needs_review, o.income_id is not null as sold,
        (select count(*)::int from public.income i where i.description like '%' || o.order_number || '%' and i.category = 'fabric_sale') as sales,
        (select current_quantity::float from public.fabric_inventory_colors c
          join public.fabric_store_order_items it on it.inventory_color_id = c.id where it.order_id = o.id limit 1) as stock
      from public.fabric_store_orders o where o.id = $1`, [orderId])).rows[0]
    const alerts = async () => (await rpc('fabric_store_staff_alerts', {})).data

    const scenarios = {
      async 'the customer paid and closed the page, the webhook never came: found and sold once'() {
        const o = await openOrder('closed-page')
        mock.pay(o.invoice.id, 'paid') // Moyasar has it; we never hear of it
        let counts = await payments.reconcilePayments(live)
        assert.equal((await state(o.orderId)).payment_status, 'pending', `the page is still open: left alone (${JSON.stringify(counts)})`)
        await endPage(o.attemptId)
        counts = await payments.reconcilePayments(live)
        assert.equal(counts.paid, 1, JSON.stringify(counts))
        let s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.sold, s.sales, s.stock], ['paid', true, 1, 9])
        // asked again later: nothing new
        await admin.query(`update public.fabric_store_payment_attempts set reconciled_at = now() - interval '25 hours' where id = $1`, [o.attemptId])
        counts = await payments.reconcilePayments(live)
        s = await state(o.orderId)
        assert.deepEqual([s.sales, s.stock], [1, 9], `again: ${JSON.stringify(counts)}`)
        return 'left alone while the page was open; then paid, one sale, stock 10 → 9; asked again — nothing new'
      },

      async 'declined, then paid on the same invoice after the page ended'() {
        const o = await openOrder('declined-then-paid')
        mock.pay(o.invoice.id, 'failed')
        mock.pay(o.invoice.id, 'paid')
        await endPage(o.attemptId)
        const counts = await payments.reconcilePayments(live)
        const s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.sales], ['paid', 1], JSON.stringify(counts))
        return `the late success was found (${JSON.stringify(counts)})`
      },

      async 'a paid then refunded payment first seen by reconciliation is quarantined'() {
        const o = await openOrder('refunded-first')
        const payment = mock.pay(o.invoice.id, 'paid')
        payment.status = 'refunded'
        payment.refunded = 11500
        await endPage(o.attemptId)
        const counts = await payments.reconcilePayments(live)
        const s = await state(o.orderId)
        assert.equal(counts.quarantined, 1, JSON.stringify(counts))
        assert.deepEqual([s.payment_status, s.needs_review, s.sold, s.stock], ['pending', true, false, 10])
        const { rows: [event] } = await admin.query(`select processing_status from public.fabric_store_payment_events
          where provider_payment_id = $1 and source = 'poll'`, [payment.id])
        assert.equal(event.processing_status, 'quarantined')
        return 'the paid/refunded evidence is quarantined and visible for review; no sale or stock movement'
      },

      async 'a successful eleventh payment is not lost behind ten declines'() {
        const o = await openOrder('eleventh-paid')
        for (let i = 0; i < 10; i++) mock.pay(o.invoice.id, 'failed')
        mock.pay(o.invoice.id, 'paid')
        await endPage(o.attemptId)
        const counts = await payments.reconcilePayments(live)
        const s = await state(o.orderId)
        assert.equal(counts.paid, 1, JSON.stringify(counts))
        assert.deepEqual([s.payment_status, s.sales, s.stock], ['paid', 1, 9])
        return 'all eleven payments examined; the only successful payment records one sale'
      },

      async 'provider outage leaves last successful reconciliation unchanged and retries after the lease'() {
        const o = await openOrder('retry-after-outage')
        mock.pay(o.invoice.id, 'paid')
        await endPage(o.attemptId)
        mock.invoices.delete(o.invoice.id)
        const failed = await payments.reconcilePayments(live)
        assert.equal(failed.invoice_not_found, 1, JSON.stringify(failed))
        const { rows: [first] } = await admin.query(`select reconciled_at from public.fabric_store_payment_attempts where id = $1`, [o.attemptId])
        assert.equal(first.reconciled_at, null, 'a failed fetch is not a successful reconciliation')
        mock.invoices.set(o.invoice.id, o.invoice)
        const beforeLease = await payments.reconcilePayments(live)
        assert.equal(beforeLease.paid ?? 0, 0, 'another worker waits for the short lease')
        await admin.query(`update public.fabric_store_payment_attempts
          set reconcile_claimed_at = now() - interval '6 minutes' where id = $1`, [o.attemptId])
        const retried = await payments.reconcilePayments(live)
        assert.equal(retried.paid, 1, JSON.stringify(retried))
        assert.equal((await state(o.orderId)).sales, 1)
        return 'failed fetch did not advance the success clock; the next lease found and recorded the payment'
      },

      async 'refunded in the Moyasar dashboard days later: flagged on the daily check'() {
        const o = await openOrder('refunded-outside')
        const payment = mock.pay(o.invoice.id, 'paid')
        await payments.handleMoyasarWebhook(live, mock.webhook(payment, { secret: WEBHOOK_SECRET, live: true }))
        await payments.reconcilePayments(live) // first daily check: nothing wrong
        assert.equal((await state(o.orderId)).needs_review, false)
        payment.refunded = 11500
        payment.status = 'refunded'
        await admin.query(`update public.fabric_store_payment_attempts set reconciled_at = now() - interval '25 hours' where id = $1`, [o.attemptId])
        const counts = await payments.reconcilePayments(live)
        assert.equal(counts.quarantined, 1, JSON.stringify(counts))
        assert.equal((await state(o.orderId)).needs_review, true)
        assert.ok((await alerts()).some(a => a.kind === 'needs_review' && a.order_id === o.orderId))
        return 'quarantined, the order flagged for review and listed in the alerts'
      },

      async 'an invoice Moyasar does not know, and the other key: no harm'() {
        const o = await openOrder('unknown-invoice')
        await admin.query(`update public.fabric_store_payment_attempts set provider_invoice_id = null where id = $1`, [o.attemptId])
          .catch(() => {}) // immutable once set: fall back to deleting the mock's copy
        mock.invoices.delete(o.invoice.id)
        await endPage(o.attemptId)
        const other = await payments.reconcilePayments(test)
        assert.equal(other.invoice_not_found ?? 0, 0, 'the test key asks nothing about live attempts')
        const counts = await payments.reconcilePayments(live)
        assert.equal(counts.invoice_not_found, 1, JSON.stringify(counts))
        assert.equal((await state(o.orderId)).payment_status, 'pending')
        return `counted, nothing changed (${JSON.stringify(counts)})`
      },

      async 'alerts follow the state: a paid live order whose sale never came, until it comes'() {
        const o = await openOrder('sale-missing', liveNoConfirm)
        const payment = mock.pay(o.invoice.id, 'paid')
        await payments.handleMoyasarWebhook(liveNoConfirm, mock.webhook(payment, { secret: WEBHOOK_SECRET, live: true }))
        assert.equal((await state(o.orderId)).sold, false, 'fixture: the sale step did not run')
        assert.ok(!(await alerts()).some(a => a.kind === 'sale_missing' && a.order_id === o.orderId), 'not before 30 minutes')
        // 40 minutes later (paid_at is fixed by its guard: moved here with the guards off, local only)
        await admin.query('set session_replication_role = replica')
        await admin.query(`update public.fabric_store_orders set paid_at = now() - interval '40 minutes' where id = $1`, [o.orderId])
        await admin.query('set session_replication_role = default')
        assert.ok((await alerts()).some(a => a.kind === 'sale_missing' && a.order_id === o.orderId), 'the stuck sale is an alert')
        await confirm.processFabricStoreOutbox({ rpc }, { orderId: o.orderId })
        assert.equal((await state(o.orderId)).sold, true)
        assert.ok(!(await alerts()).some(a => a.kind === 'sale_missing' && a.order_id === o.orderId), 'gone once sold')
        return 'no alert at first; after 30 minutes an alert; gone once the sale was recorded'
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
