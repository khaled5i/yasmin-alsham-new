// Local Postgres and a recording-only Alostaz adapter. No production connections.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createJiti } = require('jiti')
const h = require('./lib.cjs')
const ROOT = path.resolve(__dirname, '../..')

// mutate.cjs: --mutate7r <find> <replace> breaks a copy of the review migration in memory.
const args = process.argv.slice(2)
const edits7r = []
for (let i = 0; i < args.length; i++) if (args[i] === '--mutate7r') { edits7r.push([args[i + 1], args[i + 2]]); i += 2 }

async function invoices() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-review-invoices-'))
  const stub = path.join(dir, 'service.cjs')
  const previousFlag = process.env.FABRIC_STORE_ALOSTAZ_ENABLED
  try {
    fs.writeFileSync(stub, `exports.calls=[];
exports.getFabricsBranchContext=async()=>({branchId:1});
exports.createProduct=async()=>{throw Error('Unexpected product creation')};
exports.isAlostazInvoiceOutcomeUnknown=()=>false;
exports.createInvoiceForFabricSale=async(input)=>{exports.calls.push(input);return {invoice_id:1,invoice_code:'MOCK',customer_id:1,is_draft:false}};`)
    const jiti = createJiti(__filename, { alias: {
      '@/lib/services/alostaz-service': stub,
      '@/lib/server/fabric-store/invoice-lines': path.join(ROOT, 'src/lib/server/fabric-store/invoice-lines.ts'),
    } })
    const { sendFabricIncomeToAlostaz } = jiti(path.join(ROOT, 'src/lib/server/alostaz-fabric-invoice.ts'))
    const service = require(stub)
    function client({ online = true, error = null, mixed = false, alreadySent = false, source = null, category = null, paymentStatus = 'paid' } = {}) {
      const state = { writes: 0 }
      const income = { id: 'sale', branch: 'fabrics', amount: 230, payment_method: mixed ? 'mixed' : 'network',
        customer_source: source, category,
        network_amount: 80, fabric_items: [{ name: 'fabric', quantity_meters: 1 }], invoice_number: 7,
        alostaz_invoice_id: alreadySent ? 17 : null, date: '2026-09-29' }
      state.from = table => {
        let update = false
        const q = {
          select() { return q }, eq() { return q }, is() { return q }, or() { return q }, order() { return q },
          update() { update = true; state.writes++; return q },
          single: async () => ({ data: income }),
          maybeSingle: async () => table === 'income' ? { data: { id: 'sale' } }
            : table === 'fabric_store_orders' ? { data: error || !online ? null : {
              id: 'order', order_number: 'FS-7', total_halalas: 23000, shipping_net_halalas: 10000, shipping_vat_halalas: 1500,
              payment_status: paymentStatus,
            }, error }
              : table === 'app_settings' ? { data: { value: { product_id: 99, branch_id: 1 } } }
                : { data: { id: 'fabric', alostaz_product_id: 55, alostaz_product_branch_id: 1 } },
          then(resolve, reject) { return Promise.resolve(update ? { count: 1, error: null }
            : { data: [{ line_number: 1, stock_consumption_cm: 100, gross_halalas: 11500, fabric_name: 'fabric' }] }).then(resolve, reject) },
        }
        return q
      }
      return state
    }
    process.env.FABRIC_STORE_ALOSTAZ_ENABLED = 'false'
    const disabled = client()
    assert.equal((await sendFabricIncomeToAlostaz(disabled, 'sale')).kind, 'disabled')
    assert.equal(disabled.writes, 0)
    assert.equal(service.calls.length, 0)
    for (const code of ['42501', '42703', '57014', 'PGRST000', undefined]) {
      const bad = client({ error: { code, message: `${code}: fabric_store_orders lookup failed` } })
      assert.equal((await sendFabricIncomeToAlostaz(bad, 'sale')).kind, 'failed')
      assert.equal(bad.writes, 0)
      assert.equal(service.calls.length, 0)
    }
    // The orders table itself absent (stage 2 rolled back): a sale marked online still
    // stops; a shop sale is sent as before, so shop invoices survive the rollback.
    for (const code of ['42P01', 'PGRST205']) {
      const missing = { code, message: `relation fabric_store_orders does not exist (${code})` }
      const marked = client({ error: missing, source: 'المتجر الإلكتروني' })
      assert.equal((await sendFabricIncomeToAlostaz(marked, 'sale')).kind, 'failed')
      assert.equal(marked.writes, 0)
      assert.equal(service.calls.length, 0)
    }
    for (const code of ['42P01', 'PGRST205']) {
      const before = service.calls.length
      const shop = client({ error: { code, message: 'missing' }, source: 'زبونة المحل' })
      assert.equal((await sendFabricIncomeToAlostaz(shop, 'sale')).kind, 'sent')
      assert.equal(service.calls.length, before + 1)
      assert.equal(service.calls.at(-1).lines[0].amount, 230)
    }
    service.calls.length = 0
    // Stage 8: a store refund row (negative) is never sent as a sale; a fully refunded
    // order's sale is not invoiced (sale and refund row net out in income).
    const refundRow = client({ online: false, category: 'fabric_store_refund' })
    assert.equal((await sendFabricIncomeToAlostaz(refundRow, 'sale')).kind, 'not_fabric')
    assert.equal(refundRow.writes, 0)
    const refundedOrder = client({ paymentStatus: 'refunded' })
    assert.equal((await sendFabricIncomeToAlostaz(refundedOrder, 'sale')).kind, 'refunded')
    assert.equal(refundedOrder.writes, 0)
    assert.equal(service.calls.length, 0)
    assert.equal((await sendFabricIncomeToAlostaz(client({ alreadySent: true }), 'sale')).kind, 'already_sent')
    assert.equal((await sendFabricIncomeToAlostaz(client({ online: false }), 'sale')).kind, 'sent')
    assert.equal(service.calls.at(-1).lines[0].amount, 230)
    assert.equal((await sendFabricIncomeToAlostaz(client({ online: false, mixed: true }), 'sale')).kind, 'sent')
    assert.equal(service.calls.at(-1).lines[0].amount, 80)
    process.env.FABRIC_STORE_ALOSTAZ_ENABLED = 'true'
    assert.equal((await sendFabricIncomeToAlostaz(client(), 'sale')).kind, 'sent')
    assert.deepEqual(service.calls.at(-1).lines.map(l => [l.product_id, l.amount]), [[55, 115], [99, 115]])
    console.log('PASS invoice gate, fail-closed lookup, shop/mixed sales, online shipping split')
  } finally {
    if (previousFlag === undefined) delete process.env.FABRIC_STORE_ALOSTAZ_ENABLED
    else process.env.FABRIC_STORE_ALOSTAZ_ENABLED = previousFlag
    if (path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir())) throw Error('Unsafe temporary path')
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  let server
  try {
    await invoices()
    const target = path.resolve(os.tmpdir(), `ys-db-local-review-fixes-${h.PORT}`)
    if (path.dirname(target) !== path.resolve(os.tmpdir())) throw Error('Unsafe database path')
    server = await h.startServer('review-fixes')
    const db = await h.connect()
    await h.buildReplica(db)
    for (let stage = 2; stage <= 7; stage++) await db.query(h.read(h.FILES[`migration${stage}`]))
    await db.query(h.mutate(h.read(h.FILES.migration7r), edits7r))
    assert.equal(await h.runSqlTest(db, h.FILES.test7), 'PASS')
    console.log('PASS stage 7 permissions, fulfillment, stale review and refreshed resolution')
    const fixture = h.read(h.FILES.test6local)
    await db.query(fixture.slice(0, fixture.indexOf('-- 1) The normal case')))
    const { rows: [fabric] } = await db.query("select * from pg_temp.make_fabric('RECOVERY',10)")
    const { rows: [order] } = await db.query("select pg_temp.simple_order('recovery','+966560009901',$1,100) id", [fabric.listing_id])
    await db.query("select pg_temp.start('recovery')")
    await db.query("select private.fabric_store_release_order_reservations($1,'test')", [order.id])
    await db.query("insert into public.fabric_inventory_movements(inventory_item_id,color_id,movement_type,quantity) values($1,$2,'out',10)", [fabric.item_id, fabric.color_id])
    await db.query("select pg_temp.apply('recovery')")
    assert.equal((await db.query('select pg_temp.confirm($1) r', [order.id])).rows[0].r.status, 'stock_unavailable')
    const snapshot = async () => (await db.query(`select jsonb_build_object('reason',o.review_reason,
      'eventId',(select max(id)::text from public.fabric_store_order_events where order_id=o.id),
      'alertIds',(select coalesce(jsonb_agg(id::text order by id::text),'[]'::jsonb) from public.fabric_store_outbox
                   where order_id=o.id and topic='notify_staff' and status<>'done')) r
      from public.fabric_store_orders o where id=$1`, [order.id])).rows[0].r
    const resolve = async () => (await db.query(`select public.fabric_store_staff_resolve_review(
      $1,'aaaaaaaa-0000-4000-8000-000000000001','Stock checked',$2::jsonb) r`, [order.id, JSON.stringify(await snapshot())])).rows[0].r
    assert.equal((await resolve()).confirmation_queued, true)
    // A mistaken resolution cannot sell unavailable stock; staff can then retry.
    assert.equal((await db.query('select pg_temp.confirm($1) r', [order.id])).rows[0].r.status, 'stock_unavailable')
    await db.query("insert into public.fabric_inventory_movements(inventory_item_id,color_id,movement_type,quantity) values($1,$2,'in',10)", [fabric.item_id, fabric.color_id])
    assert.equal((await resolve()).confirmation_queued, true)
    const due = (await db.query("select public.fabric_store_due_outbox(array['confirm_order'],20,$1) r", [order.id])).rows[0].r
    assert.equal(due.length, 1)
    assert.equal((await db.query('select pg_temp.confirm($1) r', [due[0].order_id])).rows[0].r.status, 'confirmed')
    assert.equal((await db.query('select pg_temp.confirm($1) r', [order.id])).rows[0].r.status, 'already_confirmed')
    assert.equal(Number((await db.query('select current_quantity from public.fabric_inventory_colors where id=$1', [fabric.color_id])).rows[0].current_quantity), 9)
    assert.equal((await db.query(`select public.fabric_store_staff_set_fulfillment(
      $1,'preparing','aaaaaaaa-0000-4000-8000-000000000001',null,null,null) r`, [order.id])).rows[0].r.status, 'ok')
    console.log('PASS shortage -> review -> retry still short -> restock -> one sale and one stock deduction -> fulfillment')
    await db.query('rollback')
    await db.end()
    await h.finish(server, 0)
  } catch (error) {
    console.error(`✘ ${error.message}`)
    await h.finish(server, error.patternMissing ? 3 : 1)
  }
}
main()
