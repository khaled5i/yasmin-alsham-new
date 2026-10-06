// Audit proofs (30 Sep 2026) — each scenario demonstrates one AUDIT-REPORT.md finding on a
// real LOCAL Postgres (migrations 2 → 9 exactly as in the repo) with the mock Moyasar server
// and the app's own TypeScript (payments.ts, confirm.ts, refunds.ts, moyasar.ts via jiti).
// Nothing here touches Supabase, Moyasar or alostaz.
//
//   NODE_PATH="$TEMP/ys-db-local/node_modules" node scripts/db-local/audit/audit-proofs.cjs [name-filter]
//
// A scenario PASSES when the weakness is reproduced (it prints what happened). After a fix,
// the matching scenario is expected to FAIL — turn it into a regression test in that fix.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')
const { createJiti } = require(require.resolve('jiti', { paths: [path.join(__dirname, '..', '..', '..')] }))
const { FILES, connect, startServer, buildReplica, finish, read } = require('../lib.cjs')
const { startMoyasarMock } = require('../moyasar-mock.cjs')

const REPO = path.join(__dirname, '..', '..', '..')
const jiti = createJiti(__filename, {
  alias: { zod: path.dirname(require.resolve('zod/package.json', { paths: [REPO] })) },
})
const lib = file => jiti(path.join(REPO, 'src/lib/server/fabric-store', file))
const payments = lib('payments.ts')
const moyasarLib = lib('moyasar.ts')
const confirm = lib('confirm.ts')
const refunds = lib('refunds.ts')

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001'
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000002'
const ORIGIN = 'https://shop.example.test'
const filter = process.argv[2] || ''

async function main() {
  const server = await startServer('audit')
  const mock = await startMoyasarMock()
  const results = []
  let failures = 0
  try {
    const admin = await connect()
    await buildReplica(admin)
    for (const file of [FILES.migration2, FILES.migration3, FILES.migration4, FILES.migration5, FILES.migration6,
                        FILES.migration7, FILES.migration7r, FILES.migration8, FILES.migration8fix, FILES.migration9,
                        // fixes written after the audit: a scenario whose weakness they close now FAILS
                        FILES.migrationA, FILES.migrationB, FILES.migrationC]) {
      await admin.query(read(file))
    }

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
    const makeDeps = environment => {
      const config = { secretKey: mock.secretKey, environment, apiBase: `${mock.base}/v1`, webhookSecret: 'whsec-audit-0123456789' }
      return {
        rpc, config, moyasar: moyasarLib.createMoyasarClient(config),
        onPaid: id => confirm.processFabricStoreOutbox({ rpc }, { orderId: id }).then(() => {}),
      }
    }
    const live = makeDeps('live')
    const test = makeDeps('test')

    let n = 0
    const newFabric = async (label, meters, pricePerMeter = 100) => {
      const { rows: [item] } = await admin.query(
        `insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
         values ($1, $1, 'meter', $2, array['https://x.invalid/a.jpg']) returning id`, [`قماش ${label}`, pricePerMeter])
      const { rows: [color] } = await admin.query(
        `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, $2) returning id`, [item.id, label])
      await admin.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
                         values ($1, $2, 'in', $3)`, [item.id, color.id, meters])
      const { rows: [listing] } = await admin.query(`select id from public.fabrics where inventory_color_id = $1`, [color.id])
      return { item: item.id, color: color.id, listing: listing.id }
    }
    // A 1 m pickup order (115.00 SAR) with its Moyasar payment page opened.
    async function openOrder(label, deps = live) {
      n += 1
      const f = await newFabric(label, 10)
      const token = crypto.randomBytes(32).toString('hex')
      const key = crypto.randomUUID()
      const { data } = await rpc('fabric_store_create_checkout', { p_request: {
        checkout_key: key, request_fingerprint: sha(`${key}:fp`), access_token_hash: sha(token),
        client_hash: sha(`client-${label}`), customer: { name: 'عميلة', phone: `+96558${String(n).padStart(7, '0')}` },
        delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
        totals: { items_net_halalas: 10000, vat_halalas: 1500, total_halalas: 11500 },
        policies: { terms: 't', returns: 'r', privacy: 'p' },
        items: [{ fabric_id: f.listing, purchase_mode: 'meter', quantity_cm: 100, price_per_meter_halalas: 10000,
          discount_basis_points: 0, unit_price_halalas: 10000, net_halalas: 10000, vat_halalas: 1500 }],
      } })
      assert.equal(data.status, 'created', JSON.stringify(data))
      const started = await payments.startPayment(deps, { accessHash: sha(token), clientHash: sha(`payer-${label}`), origin: ORIGIN })
      assert.equal(started.ok, true, JSON.stringify(started))
      const invoice = [...mock.invoices.values()].find(i => i.metadata && i.metadata.attempt_id === started.attemptId)
      return { orderId: data.order_id, orderNumber: data.order_number, token, color: f.color, attemptId: started.attemptId, invoice }
    }
    const returnPage = (o, attemptId = o.attemptId, deps = live) => payments.viewPaymentForReturn(deps, {
      accessHash: sha(o.token), clientHash: sha(`return-${o.orderId}`), attemptId })
    const order = async id => (await admin.query(`select o.*, (select count(*)::int from public.fabric_store_refunds r
      where r.order_id = o.id and r.status = 'succeeded') as refunds_ok from public.fabric_store_orders o where id = $1`, [id])).rows[0]
    const alertsFor = async orderId => ((await rpc('fabric_store_staff_alerts', {})).data || []).filter(a => a.order_id === orderId)
    const snapshotFor = async orderId => {
      const { rows: [s] } = await admin.query(`select jsonb_build_object(
        'reason', o.review_reason,
        'eventId', (select max(e.id)::text from public.fabric_store_order_events e where e.order_id = o.id),
        'alertIds', (select coalesce(jsonb_agg(t.id::text order by t.id::text), '[]'::jsonb) from public.fabric_store_outbox t
                     where t.order_id = o.id and t.topic = 'notify_staff' and t.status <> 'done')) as s
        from public.fabric_store_orders o where o.id = $1`, [orderId])
      return s.s
    }

    const scenarios = {
      // AUD-01 ─────────────────────────────────────────────────────────────────
      async 'AUD-01 income: anyone (anon) reads, inserts, deletes, and resets the alostaz state of an online sale'() {
        // The live pre-fix policies on income (four `to public` policies, all `true`, read 30 Sep
        // 2026) are now part of the replica itself (replica-wiring.sql, fix batch A), and the
        // migration list above applies the fix on top — so this scenario runs against "live + fix".
        // a real online sale (live payment, confirmed), whose alostaz send ended "outcome unknown"
        const o = await openOrder('aud01')
        mock.pay(o.invoice.id, 'paid')
        await returnPage(o)
        const sold = await order(o.orderId)
        assert.ok(sold.income_id, 'the online sale exists')
        await admin.query(`update public.income set alostaz_sync_status = 'review_required',
                             alostaz_sync_error = 'timeout after send' where id = $1`, [sold.income_id])
        const shop = await admin.query(`insert into public.income (branch, category, amount, payment_method, buyer_phone, buyer_name)
          values ('fabrics', 'fabric_sale', 250, 'cash', '0551234567', 'زبونة المحل') returning id`)

        const anon = await connect()
        await anon.query(`set role anon`)
        const seen = (await anon.query(`select count(*)::int as n, count(buyer_phone)::int as phones from public.income`)).rows[0]
        // re-open a sale whose alostaz outcome is unknown (the send path only claims null/'failed')
        const reopened = await anon.query(`update public.income set alostaz_sync_status = 'failed', alostaz_sync_error = null
          where id = $1`, [sold.income_id])
        // or make sure it is never sent
        const faked = await anon.query(`update public.income set alostaz_invoice_id = 999999, alostaz_invoice_code = 'FAKE'
          where id = $1 returning id`, [sold.income_id])
        let amountBlocked = false
        try { await anon.query(`update public.income set amount = 1 where id = $1`, [sold.income_id]) } catch (e) {
          amountBlocked = /FABRIC_STORE_ONLINE_SALE_LOCKED/.test(e.message)
        }
        const cash = await anon.query(`insert into public.income (branch, category, amount, payment_method, description)
          values ('fabrics', 'other', 50000, 'cash', 'fake cash income') returning id`)
        const deleted = await anon.query(`delete from public.income where id = $1`, [shop.rows[0].id])
        await anon.end()
        assert.ok(seen.n >= 2 && seen.phones >= 2)
        assert.equal(reopened.rowCount, 1)
        assert.equal(faked.rowCount, 1)
        assert.equal(amountBlocked, true)
        assert.equal(cash.rowCount, 1)
        assert.equal(deleted.rowCount, 1)
        return `anon read ${seen.n} rows (${seen.phones} with buyer phone); reset review_required → failed on the ONLINE sale; ` +
               `set a fake alostaz_invoice_id on it; inserted a 50,000 SAR cash row; deleted a shop sale. ` +
               `Only the amount change was blocked (FABRIC_STORE_ONLINE_SALE_LOCKED).`
      },

      // AUD-02 ─────────────────────────────────────────────────────────────────
      async 'AUD-02 one anonymous order of 40 whole pieces freezes 40 fabrics for the shop for 30 minutes'() {
        const lines = []
        const units = []
        for (let i = 0; i < 40; i++) {
          const f = await newFabric(`freeze-${i}`, 3.5)
          units.push(f)
          lines.push({ fabric_id: f.listing, purchase_mode: 'piece', piece_length_cm: 350, price_per_meter_halalas: 10000,
            discount_basis_points: 0, unit_price_halalas: 35000, net_halalas: 35000, vat_halalas: 5250 })
        }
        const token = crypto.randomBytes(32).toString('hex')
        const key = crypto.randomUUID()
        const { data } = await rpc('fabric_store_create_checkout', { p_request: {
          checkout_key: key, request_fingerprint: sha(`${key}:fp`), access_token_hash: sha(token),
          client_hash: sha('attacker-ip-1'), customer: { name: 'اسم وهمي', phone: '+966500000001' },
          delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
          totals: { items_net_halalas: 1400000, vat_halalas: 210000, total_halalas: 1610000 },
          policies: { terms: 't', returns: 'r', privacy: 'p' }, items: lines,
        } })
        assert.equal(data.status, 'created', JSON.stringify(data))
        let blocked = 0
        for (const f of units.slice(0, 5)) {
          try {
            await admin.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
                               values ($1, $2, 'out', 3.5)`, [f.item, f.color])
          } catch (e) { if (/FABRIC_STOCK_RESERVED/.test(e.message)) blocked++ }
        }
        assert.equal(blocked, 5)
        // how far the documented limits let one person go in 10 minutes with 2 IPs and fake phones
        let created = 1
        for (let i = 0; i < 11; i++) {
          const f = await newFabric(`freeze-more-${i}`, 3.5)
          const t = crypto.randomBytes(32).toString('hex')
          const k = crypto.randomUUID()
          const { data: d } = await rpc('fabric_store_create_checkout', { p_request: {
            checkout_key: k, request_fingerprint: sha(`${k}:fp`), access_token_hash: sha(t),
            client_hash: sha(`attacker-ip-${1 + Math.floor((i + 1) / 6)}`),
            customer: { name: 'اسم وهمي', phone: `+9665000001${String(i).padStart(2, '0')}` },
            delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
            totals: { items_net_halalas: 35000, vat_halalas: 5250, total_halalas: 40250 },
            policies: { terms: 't', returns: 'r', privacy: 'p' },
            items: [{ ...lines[0], fabric_id: f.listing }],
          } })
          if (d.status === 'created') created++
        }
        return `one order (16,100 SAR, under the 20,000 cap, no payment) reserved 40 whole pieces; the shop was refused ` +
               `${blocked}/5 sales (FABRIC_STOCK_RESERVED). With 2 client hashes and fake phones, ${created}/12 orders were ` +
               `accepted in the same 10 minutes (≈ ${created * 40} pieces if each carries 40 lines).`
      },

      // AUD-03 ─────────────────────────────────────────────────────────────────
      async 'AUD-03 a partial refund made in the Moyasar dashboard is never flagged, and blocks every in-system refund'() {
        const o = await openOrder('aud03')
        const payment = mock.pay(o.invoice.id, 'paid')
        await returnPage(o)
        assert.ok((await order(o.orderId)).income_id)
        // staff refund 50 SAR from the Moyasar dashboard: Moyasar keeps status 'paid' for a partial refund (mock and docs)
        payment.refunded = 5000
        await admin.query(`update public.fabric_store_payment_attempts set reconciled_at = now() - interval '25 hours' where id = $1`, [o.attemptId])
        const counts = await payments.reconcilePayments(live)
        const after = await order(o.orderId)
        const alerts = await alertsFor(o.orderId)
        assert.equal(after.needs_review, false)
        assert.equal(alerts.length, 0)
        // the admin now tries a normal partial refund through the system
        const first = await refunds.startRefund(live, { orderId: o.orderId, actorId: ADMIN, actorLabel: 'مديرة',
          amountHalalas: 1000, reason: 'عيب', cancel: false, key: crypto.randomUUID() })
        await rpc('fabric_store_staff_resolve_review', { p_order_id: o.orderId, p_actor_id: ADMIN, p_note: 'راجعت',
          p_expected_review: await snapshotFor(o.orderId) })
        const second = await refunds.startRefund(live, { orderId: o.orderId, actorId: ADMIN, actorLabel: 'مديرة',
          amountHalalas: 1000, reason: 'عيب', cancel: false, key: crypto.randomUUID() })
        const { rows: [sale] } = await admin.query(`select amount::float from public.income where id = $1`, [after.income_id])
        assert.equal(first.status, 'mismatch')
        assert.equal(second.status, 'mismatch')
        return `reconciliation outcome ${JSON.stringify(counts)} → order ${after.payment_status}, needs_review=${after.needs_review}, ` +
               `alerts=${alerts.length}; income still ${sale.amount} SAR. In-system refunds afterwards: ${first.status}, ${second.status} ` +
               `(no path records the external refund).`
      },

      // AUD-04 ─────────────────────────────────────────────────────────────────
      async 'AUD-04 staff cancel an unpaid order while its payment page is open; the payment arrives; a manager resolves the review; no alert remains'() {
        const o = await openOrder('aud04')
        const cancelled = await rpc('fabric_store_staff_set_fulfillment', { p_order_id: o.orderId, p_to: 'cancelled',
          p_actor_id: MANAGER, p_carrier: null, p_tracking: null, p_note: 'لم تدفع' })
        assert.equal(cancelled.data.status, 'ok', JSON.stringify(cancelled))
        mock.pay(o.invoice.id, 'paid')
        await returnPage(o)
        const flagged = await order(o.orderId)
        const before = await alertsFor(o.orderId)
        const resolved = await rpc('fabric_store_staff_resolve_review', { p_order_id: o.orderId, p_actor_id: MANAGER,
          p_note: 'سنراجعها لاحقاً', p_expected_review: await snapshotFor(o.orderId) })
        const afterAlerts = await alertsFor(o.orderId)
        const now = await order(o.orderId)
        assert.equal(resolved.data.status, 'ok', JSON.stringify(resolved))
        assert.deepEqual([now.payment_status, now.fulfillment_status, now.income_id, now.refunds_ok], ['paid', 'cancelled', null, 0])
        assert.equal(afterAlerts.length, 0)
        return `cancel with an open page: ${cancelled.data.status}; payment applied → ${flagged.payment_status}/${flagged.fulfillment_status}, ` +
               `review=${flagged.needs_review}, alerts ${before.map(a => a.kind).join(',')}; manager resolved → alerts now ${afterAlerts.length}; ` +
               `115 SAR held: no sale, no refund, nothing left to remind anyone.`
      },

      // AUD-05 ─────────────────────────────────────────────────────────────────
      async 'AUD-05 declined card, new invoice, then both invoices paid: second payment has no in-system refund and disappears after resolve'() {
        const o = await openOrder('aud05')
        mock.pay(o.invoice.id, 'failed')
        await returnPage(o)
        const failedAttempt = (await admin.query(`select status from public.fabric_store_payment_attempts where id = $1`, [o.attemptId])).rows[0]
        const again = await payments.startPayment(live, { accessHash: sha(o.token), clientHash: sha('payer-aud05-2'), origin: ORIGIN })
        assert.equal(again.ok, true, JSON.stringify(again))
        const invoiceB = [...mock.invoices.values()].find(i => i.metadata && i.metadata.attempt_id === again.attemptId)
        mock.pay(invoiceB.id, 'paid')
        await returnPage(o, again.attemptId)
        mock.pay(o.invoice.id, 'paid') // the first page, still open in another tab, accepts another card
        // the return page no longer asks Moyasar once the order is paid; the webhook or the
        // reconciliation job (after the first page's window) applies it — here reconciliation.
        await admin.query(`update public.fabric_store_payment_attempts set expires_at = created_at + interval '1 millisecond'
                           where id = $1`, [o.attemptId])
        const second = await payments.reconcilePayments(live)
        const flagged = await order(o.orderId)
        const resolved = await rpc('fabric_store_staff_resolve_review', { p_order_id: o.orderId, p_actor_id: MANAGER,
          p_note: 'تمت المراجعة', p_expected_review: await snapshotFor(o.orderId) })
        const { rows: attempts } = await admin.query(`select status from public.fabric_store_payment_attempts where order_id = $1 order by created_at`, [o.orderId])
        const afterAlerts = await alertsFor(o.orderId)
        assert.equal(resolved.data.status, 'ok')
        assert.deepEqual(attempts.map(a => a.status), ['paid', 'paid'])
        assert.equal(afterAlerts.length, 0)
        return `first attempt ${failedAttempt.status} → new invoice created while the first stayed payable; both paid ` +
               `(attempts: ${attempts.map(a => a.status).join('+')}), reconciliation ${JSON.stringify(second)}, review=${flagged.needs_review}; ` +
               `refund_begin can only target the order's paid attempt; after a manager resolve: alerts ${afterAlerts.length}. ` +
               `230 SAR collected for a 115 SAR order.`
      },

      // AUD-06 ─────────────────────────────────────────────────────────────────
      async 'AUD-06 an order paid with a Moyasar TEST card can be prepared, shipped and delivered'() {
        const o = await openOrder('aud06', test)
        mock.pay(o.invoice.id, 'paid')
        await returnPage(o, o.attemptId, test)
        const steps = []
        for (const [to, carrier, tracking] of [['preparing'], ['shipped', 'SMSA', 'AB123456'], ['delivered']]) {
          // pickup order: go through ready_for_pickup instead of shipped
          const target = to === 'shipped' ? 'ready_for_pickup' : to
          const r = await rpc('fabric_store_staff_set_fulfillment', { p_order_id: o.orderId, p_to: target, p_actor_id: MANAGER,
            p_carrier: carrier ?? null, p_tracking: tracking ?? null, p_note: null })
          steps.push(`${target}:${r.data.status}`)
        }
        const now = await order(o.orderId)
        assert.equal(now.fulfillment_status, 'delivered')
        return `test payment → ${steps.join(' → ')}; income ${now.income_id ?? 'none'} (no sale, no stock deducted). ` +
               `Nothing in the database stops real fabric leaving for a test card.`
      },
    }

    for (const [name, run] of Object.entries(scenarios)) {
      if (filter && !name.includes(filter)) continue
      try {
        const detail = await run()
        results.push(`✔ ${name}\n    ${detail}`)
      } catch (error) {
        failures++
        results.push(`✘ ${name}\n    ${error.stack || error.message}`)
      }
    }
    await svc.end()
    await admin.end()
  } catch (error) {
    failures++
    results.push(`✘ setup: ${error.stack || error.message}`)
  } finally {
    await mock.close?.()
  }
  console.log(results.join('\n'))
  console.log(failures ? `\n${failures} scenario(s) did not reproduce` : '\nall scenarios reproduced')
  await finish(server, failures ? 1 : 0)
}

main()
