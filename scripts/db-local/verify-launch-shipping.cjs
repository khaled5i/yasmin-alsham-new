// Stage 10 B: quote -> local checkout RPC -> stored amounts -> invoice plan.
// Real local PostgreSQL only; no .env, Supabase, Moyasar or Alostaz connections.
// NODE_PATH must point at the external db-local dependencies (README.md).
// --unit-only skips PostgreSQL but retains pricing and server-rendered policy checks.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')
const cache = new Map()
function load(relative) {
  const base = path.join(SRC, relative)
  const full = fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'
  if (cache.has(full)) return cache.get(full)
  const exports = {}
  cache.set(full, exports)
  const { outputText } = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: full,
  })
  const localRequire = name => {
    // Only priceCart is exercised; its HTTP dependency must never run in this test.
    if (relative === 'lib/server/fabric-store/quote-service' && name === './http') {
      return { toByteaHex() { throw Error('Unexpected HTTP helper call') } }
    }
    if (name.startsWith('@/')) return load(name.slice(2))
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), name))
    return require(name)
  }
  new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)(
    exports, localRequire, { exports }, full, path.dirname(full))
  return exports
}

const contract = load('lib/fabric-store/checkout-contract')
const pricing = load('lib/fabric-store/pricing')
const { priceCart } = load('lib/server/fabric-store/quote-service')
const { planOnlineInvoiceLines } = load('lib/server/fabric-store/invoice-lines')
const sha = input => crypto.createHash('sha256').update(input).digest('hex')
const syntheticRow = {
  fabric_id: 'fabric-test', name: 'قماش اختبار', fabric_code: 'SS-TEST', price_per_meter: 100,
  is_on_sale: false, discount_percentage: 0, min_order_meters: 1, deleted_at: null,
  is_active: true, is_available: true, is_manually_hidden: false,
  inventory_item_id: 'inventory-test', inventory_color_id: 'color-test', inventory_unit: 'meter',
  physical_quantity: 10, color_required: false, reserved_cm: 0,
}

function unitChecks() {
  const quote = priceCart(new Map([[syntheticRow.fabric_id, syntheticRow]]),
    [{ fabricId: syntheticRow.fabric_id, purchaseMode: 'meter', quantity: 1 }], 'shipping')
  assert.equal(quote.order.shippingNetHalalas + quote.order.shippingVatHalalas, 5000,
    'The shipping fee in the checkout payload must be exactly 50 SAR including VAT')
  assert.equal(quote.quote.totals.shippingGrossHalalas, 5000)
  assert.equal(quote.order.shippingNetHalalas, 4348)
  assert.equal(quote.order.shippingVatHalalas, 652)
  assert.equal(quote.order.vatHalalas, 2152)
  assert.equal(quote.order.totalHalalas, 16500)
  assert.equal(quote.quote.totals.totalHalalas, quote.order.totalHalalas)

  const option = contract.FABRIC_DELIVERY_OPTIONS.shipping
  // Explore every VAT rounding residue and asymmetric multi-line allocation.
  for (let net = 1; net <= 2000; net++) {
    const amounts = [net, net % 17 + 1]
    const b = pricing.computeFabricOrderBreakdown(amounts, {
      shippingNetHalalas: option.shippingNetHalalas, shippingGrossHalalas: option.shippingGrossHalalas,
    })
    assert.equal(b.shippingGrossHalalas, 5000, `fixed shipping with items ${amounts}`)
    assert.equal(b.vatHalalas, Math.floor(((net + amounts[1] + 4348) * 1500 + 5000) / 10000),
      'VAT is still rounded once on the whole taxable order')
    assert.equal(b.lineGrossHalalas.reduce((sum, amount) => sum + amount, 0) + 5000, b.totalHalalas)
    assert(b.lineGrossHalalas.every((gross, i) => gross >= amounts[i]))
  }
  // Naively reducing shipping net alone can allocate one extra halala to shipping.
  const edge = pricing.computeFabricOrderBreakdown([2], {
    shippingNetHalalas: option.shippingNetHalalas, shippingGrossHalalas: option.shippingGrossHalalas,
  })
  assert.deepEqual(edge.lineGrossHalalas, [3])
  assert.equal(edge.shippingGrossHalalas, 5000)
  assert.equal(edge.totalHalalas, 5003)
  assert.throws(() => pricing.computeFabricOrderBreakdown([10000],
    { shippingNetHalalas: 4348, shippingGrossHalalas: 5000.5 }), RangeError)
  assert.throws(() => pricing.computeFabricOrderBreakdown([10000],
    { shippingNetHalalas: 4348, shippingGrossHalalas: 5750 }), RangeError)
  const pickup = priceCart(new Map([[syntheticRow.fabric_id, syntheticRow]]),
    [{ fabricId: syntheticRow.fabric_id, purchaseMode: 'meter', quantity: 1 }], 'pickup')
  assert.equal(pickup.order.totalHalalas, 11500)
  assert.equal(pickup.quote.totals.shippingGrossHalalas, 0)

  const ShippingPolicy = load('app/shipping-policy/page').default
  const SalesTerms = load('app/sales-terms/page').default
  const shippingText = renderToStaticMarkup(React.createElement(ShippingPolicy)).replace(/<[^>]*>/g, '')
  const termsText = renderToStaticMarkup(React.createElement(SalesTerms)).replace(/<[^>]*>/g, '')
  assert.match(shippingText, /50 ريالاً شاملة ضريبة القيمة المضافة 15%/)
  assert.doesNotMatch(shippingText, /50 ريالاً \+ ضريبة/)
  for (const method of ['Apple Pay', 'Samsung Pay', 'مدى', 'Visa', 'Mastercard']) assert(termsText.includes(method))
  assert.equal(contract.FABRIC_STORE_POLICY_VERSIONS.terms, '2026-10-06')
  assert.equal(contract.FABRIC_STORE_POLICY_VERSIONS.returns, '2026-09-28')
  assert.equal(contract.FABRIC_STORE_POLICY_VERSIONS.privacy, '2026-10-05')
  console.log('PASS quotes, 2000 VAT rounding cases, pickup, rendered policies and payment methods')
}

let h, server, db
async function main() {
  try {
    unitChecks()
    if (process.argv.includes('--unit-only')) return
    h = require('./lib.cjs')
    server = await h.startServer('launch-shipping')
    db = await h.connect()
    await h.buildReplica(db)
    for (const key of ['migration2', 'migration3', 'migration4', 'migration5', 'migration6',
      'migration7', 'migration7r', 'migration8', 'migration8fix', 'migration9',
      'migrationA', 'migrationB', 'migrationC', 'migrationD', 'migrationE']) {
      await db.query(h.read(h.FILES[key]))
    }
    const fixture = h.read(h.FILES.test6local)
    await db.query(fixture.slice(0, fixture.indexOf('-- 1) The normal case')))
    for (const [index, method] of ['shipping', 'pickup', 'shipping'].entries()) {
      const { rows: [fabric] } = await db.query('select * from pg_temp.make_fabric($1,10)', [`LAUNCH-${index}`])
      if (index === 2) await db.query('update public.fabrics set price_per_meter=0.02 where id=$1', [fabric.listing_id])
      await db.query('set local role service_role')
      const { rows: [{ result: snapshot }] } = await db.query(
        'select public.fabric_store_quote_snapshot($1::uuid[],$2::bytea) as result',
        [[fabric.listing_id], Buffer.from(sha(`quote-${index}`), 'hex')])
      assert.equal(snapshot.status, 'ok')
      const priced = priceCart(new Map(snapshot.fabrics.map(row => [row.fabric_id, row])),
        [{ fabricId: fabric.listing_id, purchaseMode: 'meter', quantity: 1 }], method)
      assert(priced.quote.canCheckout && priced.order)
      const p = priced.order
      const delivery = contract.FABRIC_DELIVERY_OPTIONS[method]
      const phone = `+96656000890${index}`
      const request = {
        checkout_key: crypto.randomUUID(), request_fingerprint: sha(`request-${index}`),
        access_token_hash: sha(`access-${index}`), client_hash: sha(`client-${index}`),
        customer: { name: 'عميلة اختبار محلي', phone },
        delivery: { method, option_code: delivery.code, option_label: delivery.label,
          shipping_net_halalas: p.shippingNetHalalas, shipping_vat_halalas: p.shippingVatHalalas },
        address: method === 'shipping' ? { recipient_name: 'عميلة اختبار محلي', recipient_phone: phone,
          city: 'الرياض', short_address: 'RRRD2929' } : null,
        totals: { items_net_halalas: p.itemsNetHalalas, vat_halalas: p.vatHalalas, total_halalas: p.totalHalalas },
        policies: contract.FABRIC_STORE_POLICY_VERSIONS, items: p.items,
      }
      const { rows: [{ result: created }] } = await db.query(
        'select public.fabric_store_create_checkout($1::jsonb) as result', [JSON.stringify(request)])
      assert.equal(created.status, 'created', JSON.stringify(created))
      const { rows: [{ result: replayed }] } = await db.query(
        'select public.fabric_store_create_checkout($1::jsonb) as result', [JSON.stringify(request)])
      assert.equal(replayed.order_id, created.order_id, 'retry keeps the same immutable order')
      await db.query('reset role')
      const { rows: [order] } = await db.query('select * from public.fabric_store_orders where id=$1', [created.order_id])
      const { rows: items } = await db.query('select * from public.fabric_store_order_items where order_id=$1 order by line_number', [order.id])
      assert.equal(Number(order.total_halalas), priced.quote.totals.totalHalalas)
      assert.equal(Number(order.shipping_net_halalas) + Number(order.shipping_vat_halalas), method === 'shipping' ? 5000 : 0)
      assert.equal(order.terms_version, '2026-10-06')
      const invoice = planOnlineInvoiceLines(order, items, items.map(item => ({ name: item.fabric_name })), Number(order.total_halalas) / 100)
      assert.equal(invoice.reduce((sum, line) => sum + Math.round(line.amount * 100), 0), Number(order.total_halalas))
      assert.equal(invoice.find(line => line.kind === 'shipping')?.amount ?? 0, method === 'shipping' ? 50 : 0)
      assert.equal(Number((await db.query('select current_quantity from public.fabric_inventory_colors where id=$1', [fabric.color_id])).rows[0].current_quantity), 10)
    }
    assert.equal(Number((await db.query('select count(*) n from public.income')).rows[0].n), 0)
    assert.equal(Number((await db.query("select count(*) n from public.fabric_store_stock_reservations where status='active'")).rows[0].n), 0)
    console.log('PASS local SQL snapshots -> checkout/retry -> stored VAT/policies -> invoice plans: shipping 50, pickup 0, rounding edge; no sale or hold')
    await db.query('rollback')
    await db.end()
    await h.finish(server, 0)
  } catch (error) {
    console.error(`✘ ${error.message}`)
    if (db) { await db.query('rollback').catch(() => {}); await db.end().catch(() => {}) }
    if (h) await h.finish(server, 1)
    process.exit(1)
  }
}
main()
