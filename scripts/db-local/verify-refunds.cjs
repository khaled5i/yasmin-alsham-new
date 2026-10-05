// Stage 8 end to end: a real local Postgres (migrations 2 → 8), the mock Moyasar server
// (with its refund endpoint), and the app's own logic (payments.ts, confirm.ts, refunds.ts,
// moyasar.ts loaded with jiti from a temp copy). The database is reached as the routes
// reach it: RPC calls AS service_role.
// What matters most: Moyasar has NO idempotency key for refunds, so a lost answer must
// never turn into a second refund.
//   node scripts/db-local/verify-refunds.cjs [--mutate8 "<find>" "<replace>"]... [--mutate-ts <file> "<find>" "<replace>"]...
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
const edits8 = []
const tsEdits = { 'moyasar.ts': [], 'payments.ts': [], 'confirm.ts': [], 'invoice-lines.ts': [], 'refunds.ts': [] }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mutate8') { edits8.push([args[i + 1], args[i + 2]]); i += 2 }
  else if (args[i] === '--mutate-ts') { tsEdits[args[i + 1]].push([args[i + 2], args[i + 3]]); i += 3 }
}

const REPO = path.join(__dirname, '..', '..')
const TS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-refunds-ts-'))
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
const refunds = jiti(path.join(TS_DIR, 'refunds.ts'))
// (review v2) the page's pending-action policy (pure module); missing before the fix.
let pendingAction = null
try { pendingAction = jiti(path.join(REPO, 'src/lib/fabric-store/pending-action.ts')) } catch { /* reported by its scenario */ }
process.on('exit', () => fs.rmSync(TS_DIR, { recursive: true, force: true }))

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const WEBHOOK_SECRET = 'whsec-local-test-0123456789'
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001'

async function main() {
  const server = await startServer('refunds')
  const mock = await startMoyasarMock()
  let failures = 0
  const results = []
  try {
    const admin = await connect()
    await buildReplica(admin)
    for (const file of [FILES.migration2, FILES.migration3, FILES.migration4, FILES.migration5, FILES.migration6,
                        FILES.migration7, FILES.migration7r]) await admin.query(read(file))
    const fix8 = read(FILES.migration8fix)
    await admin.query(mutate(read(FILES.migration8), edits8.filter(([find]) => !fix8.includes(find))))
    await admin.query(mutate(fix8, edits8.filter(([find]) => fix8.includes(find))))
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
          // text[] (p_topics) goes as an array; jsonb arrays of objects (p_lines) as JSON
          if (Array.isArray(v)) return v.some(x => x !== null && typeof x === 'object') ? JSON.stringify(v) : v
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
        }))
        return { data: rows[0].r, error: null }
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } }
      }
    }

    const ORIGIN = 'https://www.example-shop.test'
    const makeDeps = environment => {
      const config = { secretKey: mock.secretKey, environment, apiBase: `${mock.base}/v1`, webhookSecret: WEBHOOK_SECRET }
      return { rpc, config, moyasar: moyasarLib.createMoyasarClient(config) }
    }
    const live = makeDeps('live')
    const test = makeDeps('test')

    let n = 0
    // 1 m pickup (115.00), paid by webhook in live mode, the sale recorded (stock 10 → 9).
    async function soldOrder(label) {
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
        client_hash: sha(`client-${label}`), customer: { name: 'عميلة', phone: `+96657${String(n).padStart(7, '0')}` },
        delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
        totals: { items_net_halalas: 10000, vat_halalas: 1500, total_halalas: 11500 },
        policies: { terms: 't', returns: 'r', privacy: 'p' },
        items: [{ fabric_id: listing.id, purchase_mode: 'meter', quantity_cm: 100, price_per_meter_halalas: 10000,
          discount_basis_points: 0, unit_price_halalas: 10000, net_halalas: 10000, vat_halalas: 1500 }],
      } })
      assert.equal(data.status, 'created', JSON.stringify(data))
      const deps = { ...live, onPaid: id => confirm.processFabricStoreOutbox({ rpc }, { orderId: id }).then(() => {}) }
      const started = await payments.startPayment(deps, { accessHash: sha(token), clientHash: sha(`payer-${label}`), origin: ORIGIN })
      assert.equal(started.ok, true, JSON.stringify(started))
      const invoice = [...mock.invoices.values()].find(i => i.metadata && i.metadata.attempt_id === started.attemptId)
      const payment = mock.pay(invoice.id, 'paid')
      const hook = await payments.handleMoyasarWebhook(deps, mock.webhook(payment, { secret: WEBHOOK_SECRET, live: true }))
      assert.equal(hook.outcome, 'paid', JSON.stringify(hook))
      const { rows: [o] } = await admin.query(`select income_id from public.fabric_store_orders where id = $1`, [data.order_id])
      assert.ok(o.income_id, 'fixture: the sale is recorded')
      return { orderId: data.order_id, color: color.id, payment }
    }
    const state = async orderId => (await admin.query(`
      select o.payment_status, o.fulfillment_status, o.needs_review,
        (select string_agg(r.status, ',' order by r.created_at) from public.fabric_store_refunds r where r.order_id = o.id) as refunds,
        (select count(*)::int from public.income i join public.fabric_store_refunds r on r.income_id = i.id where r.order_id = o.id) as refund_rows,
        (select current_quantity::float from public.fabric_inventory_colors c
          join public.fabric_store_order_items it on it.inventory_color_id = c.id where it.order_id = o.id limit 1) as stock
      from public.fabric_store_orders o where o.id = $1`, [orderId])).rows[0]
    const prepare = orderId => rpc('fabric_store_staff_set_fulfillment', {
      p_order_id: orderId, p_to: 'preparing', p_actor_id: ADMIN, p_carrier: null, p_tracking: null, p_note: null })
    const refund = (orderId, amount, cancel, key = crypto.randomUUID(), deps = live) => refunds.startRefund(deps, {
      orderId, actorId: ADMIN, actorLabel: 'مديرة', amountHalalas: amount, reason: cancel ? 'إلغاء قبل القص' : 'عيب في القماش',
      cancel, key })
    const expireLocks = () => admin.query(`update public.fabric_store_refunds set locked_until = now() - interval '1 second' where status = 'pending'`)
    const callsFor = payment => mock.refundLog.filter(r => r.paymentId === payment.id)

    const scenarios = {
      async 'disabling refunds pauses unsent money while still allowing later reconciliation'() {
        const o = await soldOrder('disabled-unsent')
        await prepare(o.orderId)
        const begun = await rpc('fabric_store_refund_begin', {
          p_order_id: o.orderId, p_actor_id: ADMIN, p_actor_label: 'مديرة',
          p_amount_halalas: 1000, p_reason: 'عيب في القماش', p_cancel: false, p_key: crypto.randomUUID(),
        })
        assert.equal(begun.data.status, 'started', JSON.stringify(begun))
        await expireLocks()
        const paused = await refunds.processPendingRefunds(live, 10, false)
        assert.equal(paused.pending, 1, JSON.stringify(paused))
        assert.equal(callsFor(o.payment).length, 0, 'the disabled flag forbids the first provider call')
        await expireLocks()
        const resumed = await refunds.processPendingRefunds(live, 10, true)
        assert.equal(resumed.succeeded, 1, JSON.stringify(resumed))
        assert.equal(callsFor(o.payment).length, 1)
        return 'flag off: zero provider calls; flag on: one refund, and the existing row completes'
      },
      async 'cancel before the cut: one Moyasar refund, the order cancelled, the metre back, one refund row'() {
        const o = await soldOrder('cancel')
        const key = crypto.randomUUID()
        const result = await refund(o.orderId, 11500, true, key)
        assert.equal(result.ok && result.status, 'succeeded', JSON.stringify(result))
        const s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.fulfillment_status, s.refunds, s.refund_rows, s.stock],
          ['refunded', 'cancelled', 'succeeded', 1, 10])
        assert.equal(callsFor(o.payment).length, 1)
        // the second click (same key): nothing new
        const again = await refund(o.orderId, 11500, true, key)
        assert.equal(again.ok && again.status, 'succeeded')
        assert.equal(callsFor(o.payment).length, 1, 'no second call for the same click')
        // Moyasar's refunded webhook for our own refund: no review
        const hook = await payments.handleMoyasarWebhook({ ...live },
          mock.webhook(o.payment, { secret: WEBHOOK_SECRET, live: true, type: 'payment_refunded' }))
        assert.notEqual(hook.outcome, 'quarantined', JSON.stringify(hook))
        assert.equal((await state(o.orderId)).needs_review, false, 'our refund does not flag the order')
        return 'refunded + cancelled, stock 9 → 10, one row in income, one call to Moyasar even when clicked twice; the refunded webhook is not a review'
      },

      async 'the answer is lost after Moyasar refunded: the job completes it WITHOUT a second refund'() {
        const o = await soldOrder('lost')
        assert.equal((await prepare(o.orderId)).data.status, 'ok')
        mock.failRefundNext('lost')
        const result = await refund(o.orderId, 5000, false)
        assert.equal(result.ok && result.status, 'pending', JSON.stringify(result))
        assert.equal(o.payment.refunded, 5000, 'fixture: Moyasar did refund')
        assert.equal((await state(o.orderId)).refunds, 'pending')
        let counts = await refunds.processPendingRefunds(live)
        assert.deepEqual(counts, {}, 'the route still holds the refund: the job leaves it')
        await expireLocks()
        counts = await refunds.processPendingRefunds(live)
        assert.equal(counts.succeeded, 1, JSON.stringify(counts))
        assert.equal(callsFor(o.payment).length, 1, 'no second refund call')
        const s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.refunds, s.refund_rows, s.stock], ['partially_refunded', 'succeeded', 1, 9])
        return 'pending, then the job saw refunded=5000 at Moyasar and recorded it: 1 call, 50.00 back once, stock untouched (partial)'
      },

      async 'Moyasar times out after refunding: same, no second refund'() {
        const o = await soldOrder('timeout')
        await prepare(o.orderId)
        mock.failRefundNext('timeout')
        const result = await refund(o.orderId, 2000, false)
        assert.equal(result.ok && result.status, 'pending', JSON.stringify(result))
        await expireLocks()
        const counts = await refunds.processPendingRefunds(live)
        assert.equal(counts.succeeded, 1, JSON.stringify(counts))
        assert.equal(callsFor(o.payment).length, 1)
        assert.equal(o.payment.refunded, 2000)
        return 'the 7 s client limit left it pending; the job found the refund at Moyasar: 1 call'
      },

      // (review v2) A 500 does not prove Moyasar will not still refund: a call that went out is
      // never repeated. The job only watches; after 15 minutes the order is flagged for a human.
      async 'Moyasar answered 500 and shows nothing: never called again, flagged after 15 minutes'() {
        const o = await soldOrder('five-hundred')
        await prepare(o.orderId)
        mock.failRefundNext('500')
        const result = await refund(o.orderId, 3000, false)
        assert.equal(result.ok && result.status, 'pending', JSON.stringify(result))
        await expireLocks()
        await refunds.processPendingRefunds(live)
        assert.equal(callsFor(o.payment).length, 1, 'no second call after a call whose outcome is unknown')
        assert.equal((await state(o.orderId)).needs_review, false, 'not flagged before 15 minutes')
        await admin.query(`update public.fabric_store_refunds set provider_called_at = now() - interval '20 minutes'
                           where order_id = $1 and status = 'pending'`, [o.orderId])
        await expireLocks()
        await refunds.processPendingRefunds(live)
        const s = await state(o.orderId)
        assert.deepEqual([s.refunds, s.needs_review, callsFor(o.payment).length, o.payment.refunded], ['pending', true, 1, 0])
        return 'one call, still pending, the order flagged for review after 15 minutes; 0 refunded twice'
      },

      // (review v3) 24 hours is when a human decides, not a failure. The manager closes with a
      // settlement reference only if Moyasar STILL shows nothing (asked by the server), and the
      // decision is kept. A refund Moyasar did apply is never closed as failed.
      async '(review v3) the manager closes an unconfirmed refund only after 24h and only if Moyasar shows nothing'() {
        const close = (o, called) => refunds.closeUnconfirmedRefund(live, {
          refundId: o.refundId, paymentId: o.payment.id, environment: 'live', called,
          actorId: ADMIN, reference: 'SETTLE-2026-0001', note: 'كشف التسوية لا يُظهر الاسترداد' })
        const refundOf = async o => (await admin.query(
          `select id, status, review_reference, reviewed_by from public.fabric_store_refunds where order_id = $1`, [o.orderId])).rows[0]
        const o = await soldOrder('close-none')
        await prepare(o.orderId)
        mock.failRefundNext('500')
        assert.equal((await refund(o.orderId, 3000, false)).status, 'pending')
        o.refundId = (await refundOf(o)).id
        const early = await close(o, true)
        assert.equal(!early.ok && early.code, 'too_early', JSON.stringify(early))
        await admin.query(`update public.fabric_store_refunds set provider_called_at = now() - interval '25 hours' where id = $1`, [o.refundId])
        const closed = await close(o, true)
        assert.equal(closed.ok, true, JSON.stringify(closed))
        const row = await refundOf(o)
        assert.deepEqual([row.status, row.review_reference, row.reviewed_by], ['failed', 'SETTLE-2026-0001', ADMIN])
        assert.equal(callsFor(o.payment).length, 1, 'closing never calls Moyasar to refund')
        await assert.rejects(admin.query(`update public.fabric_store_refunds set review_reference = 'X-OTHER' where id = $1`, [o.refundId]),
          /IMMUTABLE/, 'the decision cannot be rewritten')

        const lost = await soldOrder('close-lost')
        await prepare(lost.orderId)
        mock.failRefundNext('lost') // Moyasar applied it, then answered 500
        assert.equal((await refund(lost.orderId, 2000, false)).status, 'pending')
        lost.refundId = (await refundOf(lost)).id
        await admin.query(`update public.fabric_store_refunds set provider_called_at = now() - interval '25 hours' where id = $1`, [lost.refundId])
        const refused = await close(lost, true)
        assert.equal(!refused.ok && refused.code, 'provider_changed', JSON.stringify(refused))
        assert.equal((await refundOf(lost)).status, 'pending', 'a refund Moyasar applied is not closed as failed')
        return 'too_early before 24h; closed with the reference after; Moyasar showing the money refuses the close'
      },

      async '(review v2) Moyasar is still processing (late): the job waits, one refund lands'() {
        const o = await soldOrder('late')
        await prepare(o.orderId)
        mock.failRefundNext('late')
        const result = await refund(o.orderId, 2000, false)
        assert.equal(result.ok && result.status, 'pending', JSON.stringify(result))
        await expireLocks()
        await refunds.processPendingRefunds(live) // before the late refund lands
        assert.equal(callsFor(o.payment).length, 1, 'not called again while the first may land')
        await new Promise(resolve => setTimeout(resolve, 2_000))
        await expireLocks()
        const counts = await refunds.processPendingRefunds(live)
        assert.equal(counts.succeeded, 1, JSON.stringify(counts))
        assert.deepEqual([o.payment.refunded, callsFor(o.payment).length], [2000, 1])
        return 'pending, not re-called; the late refund landed and was recorded: 20.00 back once'
      },

      async '(review v2) a stale worker resumes after the job took over: one refund at Moyasar'() {
        const o = await soldOrder('stale')
        await prepare(o.orderId)
        // worker A (the route) reads Moyasar, then stalls before calling
        let releaseA; const gateA = new Promise(resolve => { releaseA = resolve })
        let fetchedA; const aFetched = new Promise(resolve => { fetchedA = resolve })
        const depsA = { ...live, moyasar: { ...live.moyasar, fetchPayment: async id => {
          const payment = await live.moyasar.fetchPayment(id); fetchedA(); await gateA; return payment } } }
        const aRun = refund(o.orderId, 1000, false, crypto.randomUUID(), depsA)
        await aFetched
        // A's claim runs out; worker B (the job) takes it, calls Moyasar, and stalls before recording
        await expireLocks()
        let releaseB; const gateB = new Promise(resolve => { releaseB = resolve })
        let calledB; const bCalled = new Promise(resolve => { calledB = resolve })
        const depsB = { ...live, moyasar: { ...live.moyasar, refundPayment: async (id, amount) => {
          const payment = await live.moyasar.refundPayment(id, amount); calledB(); await gateB; return payment } } }
        const bRun = refunds.processPendingRefunds(depsB)
        await bCalled
        releaseA()
        const a = await aRun
        releaseB()
        await bRun
        assert.equal(callsFor(o.payment).length, 1, `A must not call Moyasar with B's claim (A ended ${JSON.stringify(a)})`)
        assert.equal(o.payment.refunded, 1000)
        const s = await state(o.orderId)
        assert.deepEqual([s.refunds, s.payment_status], ['succeeded', 'partially_refunded'])
        return `A resumed and stopped (${a.status}); B's single call recorded: 10.00 back once`
      },

      async '(review v2) cutting and cancelling at once; a direct row update cannot cut during a cancellation'() {
        const c1 = await connect(); const c2 = await connect()
        try {
          for (const c of [c1, c2]) await c.query('set role service_role')
          const call = (c, sql, params) => c.query(sql, params).then(r => r.rows[0].r)
          const beginCancel = (c, orderId) => call(c, `select public.fabric_store_refund_begin($1, $2, 'مديرة', 11500, 'إلغاء قبل القص', true, $3) as r`,
            [orderId, ADMIN, crypto.randomUUID()])
          const cut = (c, orderId) => call(c, `select public.fabric_store_staff_set_fulfillment($1, 'preparing', $2, null, null, null) as r`, [orderId, ADMIN])
          // cancel first (uncommitted), then cut waits → refused
          const o1 = await soldOrder('race-cancel-first')
          await c1.query('begin'); assert.equal((await beginCancel(c1, o1.orderId)).status, 'started')
          const cutLater = cut(c2, o1.orderId)
          await new Promise(resolve => setTimeout(resolve, 300))
          await c1.query('commit')
          assert.equal((await cutLater).status, 'refund_pending')
          // a direct update (bypassing the staff function) is refused by the row trigger too
          let direct = 'NO_ERROR'
          try {
            await admin.query('begin')
            await admin.query(`select set_config('fabric_store.actor_type', 'staff', true)`)
            await admin.query(`update public.fabric_store_orders set fulfillment_status = 'preparing' where id = $1`, [o1.orderId])
            await admin.query('rollback')
          } catch (error) { direct = error.message; await admin.query('rollback') }
          assert.match(direct, /FABRIC_STORE_REFUND_PENDING_CUT/, `direct update: ${direct}`)
          // cut first (uncommitted), then cancel waits → already_cut
          const o2 = await soldOrder('race-cut-first')
          await c2.query('begin'); assert.equal((await cut(c2, o2.orderId)).status, 'ok')
          const cancelLater = beginCancel(c1, o2.orderId)
          await new Promise(resolve => setTimeout(resolve, 300))
          await c2.query('commit')
          assert.equal((await cancelLater).status, 'already_cut')
        } finally { await c1.end(); await c2.end() }
        return 'cancel-then-cut → refund_pending (function and row trigger); cut-then-cancel → already_cut'
      },

      async '(review v2) a lost answer on restock and refund: the retry reuses the key and adds nothing'() {
        const o = await soldOrder('retry-key')
        await prepare(o.orderId)
        const policy = pendingAction
        // the page keeps the key when the answer is lost or unclear, and only then
        assert.equal(policy.isSettled({ kind: 'network' }), false)
        assert.equal(policy.isSettled({ kind: 'http', status: 502 }), false)
        assert.equal(policy.isSettled({ kind: 'http', status: 409, code: 'unavailable' }), false)
        assert.equal(policy.isSettled({ kind: 'http', status: 200 }), true)
        assert.equal(policy.isSettled({ kind: 'http', status: 400, code: 'exceeds' }), true)
        const key = crypto.randomUUID()
        const restock = () => rpc('fabric_store_restock_return', { p_order_id: o.orderId, p_actor_id: ADMIN,
          p_lines: [{ line_number: 1, quantity_cm: 30 }], p_note: 'استلمنا 30 سم سليمة', p_key: key })
        assert.equal((await restock()).data.status, 'ok')
        assert.equal((await restock()).data.status, 'already_done', 'the same key again adds nothing')
        assert.equal((await state(o.orderId)).stock, 9.3)
        const refundKey = crypto.randomUUID()
        assert.equal((await refund(o.orderId, 500, false, refundKey)).status, 'succeeded')
        assert.equal((await refund(o.orderId, 500, false, refundKey)).status, 'succeeded')
        assert.equal(callsFor(o.payment).length, 1)
        // a page reload keeps the unsettled action (stored per order)
        const store = new Map()
        const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }
        policy.savePending(storage, o.orderId, { kind: 'restock', key, body: { lines: [] } })
        assert.equal(policy.loadPending(storage, o.orderId).key, key)
        policy.clearPending(storage, o.orderId)
        assert.equal(policy.loadPending(storage, o.orderId), null)
        return 'restock 9 → 9.3 once (not 9.6); the refund retried with its key made one call; the key survives a reload'
      },

      async 'Moyasar refuses (400): failed, nothing changes, a new refund can start'() {
        const o = await soldOrder('refused')
        await prepare(o.orderId)
        mock.failRefundNext('400')
        const result = await refund(o.orderId, 1000, false)
        assert.equal(result.ok && result.status, 'failed', JSON.stringify(result))
        let s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.refunds, s.refund_rows], ['paid', 'failed', 0])
        const retry = await refund(o.orderId, 1000, false)
        assert.equal(retry.ok && retry.status, 'succeeded')
        s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.refunds, s.refund_rows], ['partially_refunded', 'failed,succeeded', 1])
        return 'failed and recorded; the next attempt went through'
      },

      async 'a refund made in the Moyasar dashboard: no call, the order is flagged'() {
        const o = await soldOrder('dashboard')
        await prepare(o.orderId)
        o.payment.refunded = 4000 // done by hand at Moyasar, never recorded here
        const result = await refund(o.orderId, 1000, false)
        assert.equal(result.ok && result.status, 'mismatch', JSON.stringify(result))
        assert.equal(callsFor(o.payment).length, 0, 'nothing sent to Moyasar')
        const s = await state(o.orderId)
        assert.deepEqual([s.payment_status, s.refunds, s.needs_review], ['paid', 'failed', true])
        return 'mismatch: no call, refund closed as failed, order flagged for review'
      },

      async 'a test key never refunds a live payment'() {
        const o = await soldOrder('wrong-key')
        await prepare(o.orderId)
        const result = await refund(o.orderId, 1000, false, crypto.randomUUID(), test)
        assert.equal(result.ok && result.status, 'pending', JSON.stringify(result))
        assert.equal(callsFor(o.payment).length, 0)
        await expireLocks()
        await refunds.processPendingRefunds(test)
        assert.equal(callsFor(o.payment).length, 0, 'the job with the wrong key leaves it')
        await expireLocks()
        await refunds.processPendingRefunds(live)
        // this order only (other scenarios may leave refunds for the job on purpose)
        assert.deepEqual([(await state(o.orderId)).refunds, callsFor(o.payment).length], ['succeeded', 1])
        return 'left pending under a test key; completed once the live key ran the job'
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
