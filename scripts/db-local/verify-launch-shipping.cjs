// Stage 10 B: quote -> local checkout RPC -> stored amounts -> invoice plan.
// Since 27 Oct 2026 also the whole-riyal meter price (migration 20261027120000): the shown price per
// meter is what is paid, through the real checkout function and the widened constraints.
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
// Same expression as the order VAT constraint since migration 20261027120000.
const vatFromTotal = total => Math.floor((total * 1500 * 2 + 11500) / 23000)

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
  const shipping = { shippingNetHalalas: option.shippingNetHalalas, shippingGrossHalalas: option.shippingGrossHalalas }
  // Explore every VAT rounding residue and asymmetric multi-line allocation.
  for (let gross = 1; gross <= 2000; gross++) {
    const amounts = [gross, gross % 17 + 1]
    const b = pricing.computeFabricGrossOrderBreakdown(amounts, shipping)
    assert.equal(b.shippingGrossHalalas, 5000, `fixed shipping with items ${amounts}`)
    assert.equal(b.totalHalalas, amounts[0] + amounts[1] + 5000, 'the total is the shown amounts plus 50, unrounded')
    assert.equal(b.vatHalalas, vatFromTotal(b.totalHalalas), 'VAT is extracted once from the whole order')
    assert.equal(b.lineVatHalalas.reduce((sum, amount) => sum + amount, 0) + 652, b.vatHalalas)
    assert(b.lineNetHalalas.every(net => net >= 0))
  }
  // The smallest purchasable line: 1 riyal per meter beside 50 SAR shipping.
  const edge = pricing.computeFabricGrossOrderBreakdown([100], shipping)
  assert.equal(edge.totalHalalas, 5100)
  assert.equal(edge.vatHalalas, 665)
  assert.deepEqual(edge.lineVatHalalas, [13])
  assert.deepEqual(edge.lineNetHalalas, [87])
  assert.equal(edge.shippingGrossHalalas, 5000)
  assert.throws(() => pricing.computeFabricGrossOrderBreakdown([10000],
    { shippingNetHalalas: 4348, shippingGrossHalalas: 5000.5 }), RangeError)
  assert.throws(() => pricing.computeFabricGrossOrderBreakdown([10000],
    { shippingNetHalalas: 4348, shippingGrossHalalas: 5750 }), RangeError)
  const pickup = priceCart(new Map([[syntheticRow.fabric_id, syntheticRow]]),
    [{ fabricId: syntheticRow.fabric_id, purchaseMode: 'meter', quantity: 1 }], 'pickup')
  assert.equal(pickup.order.totalHalalas, 11500)
  assert.equal(pickup.quote.totals.shippingGrossHalalas, 0)

  // 250 per meter before VAT = 287.50 = shown and paid as 288.
  const wholeRow = { ...syntheticRow, price_per_meter: 250 }
  const whole = priceCart(new Map([[wholeRow.fabric_id, wholeRow]]),
    [{ fabricId: wholeRow.fabric_id, purchaseMode: 'meter', quantity: 1.5 }], 'shipping')
  assert.equal(whole.quote.lines[0].grossHalalas, 43200, '288 × 1.5')
  assert.equal(whole.order.totalHalalas, 48200, '432 + 50')
  assert.equal(whole.order.items[0].net_halalas + whole.order.items[0].vat_halalas, 43200)

  const ShippingPolicy = load('app/shipping-policy/page').default
  const SalesTerms = load('app/sales-terms/page').default
  const shippingText = renderToStaticMarkup(React.createElement(ShippingPolicy)).replace(/<[^>]*>/g, '')
  const termsText = renderToStaticMarkup(React.createElement(SalesTerms)).replace(/<[^>]*>/g, '')
  assert.match(shippingText, /50 ريالاً شاملة ضريبة القيمة المضافة 15%/)
  assert.doesNotMatch(shippingText, /50 ريالاً \+ ضريبة/)
  assert.match(shippingText, /الشحن مجاني متى بلغت قيمة الأقمشة في الطلب 1000 ريال/)
  for (const method of ['Apple Pay', 'Samsung Pay', 'مدى', 'Visa', 'Mastercard']) assert(termsText.includes(method))
  assert.equal(contract.FABRIC_STORE_POLICY_VERSIONS.terms, '2026-10-24')
  assert.equal(contract.FABRIC_STORE_POLICY_VERSIONS.returns, '2026-09-28')
  assert.equal(contract.FABRIC_STORE_POLICY_VERSIONS.privacy, '2026-10-20')
  console.log('PASS quotes, 2000 VAT rounding cases, whole-riyal 288 × 1.5, pickup, rendered policies and payment methods')
}

/** A live-safe SQL test file runs its own begin … rollback; it must run outside any open transaction. */
async function expectSqlTest(file, shouldPass) {
  try {
    await db.query(h.read(file))
  } catch (error) {
    await db.query('rollback').catch(() => {})
    if (shouldPass) throw error
    return
  }
  if (!shouldPass) throw Error(`${path.basename(file)} passed against the strict stage 2 constraints`)
}

// Each case: delivery, listing stock (3.5 = whole piece), price before VAT (null = fixture 100), request, total paid.
const CASES = [
  { method: 'shipping', stock: 10, price: null, mode: 'meter', quantity: 1, total: 16500 },
  { method: 'pickup', stock: 10, price: null, mode: 'meter', quantity: 1, total: 11500 },
  { method: 'shipping', stock: 10, price: 0.44, mode: 'meter', quantity: 1, total: 5100 },
  { method: 'shipping', stock: 10, price: 250, mode: 'meter', quantity: 1.5, total: 48200 },
  { method: 'pickup', stock: 3.5, price: 250, mode: 'piece', quantity: 1, total: 100800 },
  { method: 'pickup', stock: 10, price: 249.78, mode: 'meter', quantity: 2, total: 57400 },
]

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
      'migrationA', 'migrationB', 'migrationC', 'migrationD', 'migrationE', 'migrationW']) {
      await db.query(h.read(h.FILES[key]))
    }
    // Whole-riyal migration: its live-safe test passes, fails after the rollback, passes on re-apply.
    await expectSqlTest(h.FILES.testW, true)
    await db.query(h.read(h.FILES.rollbackW))
    await expectSqlTest(h.FILES.testW, false)
    await db.query(h.read(h.FILES.migrationW))
    await expectSqlTest(h.FILES.testW, true)
    console.log('PASS whole-riyal SQL test (live-safe) -> rollback restores the strict rules -> re-apply')

    const fixture = h.read(h.FILES.test6local)
    await db.query(fixture.slice(0, fixture.indexOf('-- 1) The normal case')))
    for (const [index, c] of CASES.entries()) {
      const { rows: [fabric] } = await db.query('select * from pg_temp.make_fabric($1,$2)', [`LAUNCH-${index}`, c.stock])
      if (c.price != null) await db.query('update public.fabrics set price_per_meter=$2 where id=$1', [fabric.listing_id, c.price])
      await db.query('set local role service_role')
      const { rows: [{ result: snapshot }] } = await db.query(
        'select public.fabric_store_quote_snapshot($1::uuid[],$2::bytea) as result',
        [[fabric.listing_id], Buffer.from(sha(`quote-${index}`), 'hex')])
      assert.equal(snapshot.status, 'ok')
      const priced = priceCart(new Map(snapshot.fabrics.map(row => [row.fabric_id, row])),
        [{ fabricId: fabric.listing_id, purchaseMode: c.mode, quantity: c.quantity }], c.method)
      assert(priced.quote.canCheckout && priced.order, `case ${index}: ${JSON.stringify(priced.quote.lines)}`)
      const p = priced.order
      const delivery = contract.FABRIC_DELIVERY_OPTIONS[c.method]
      const phone = `+96656000890${index}`
      const request = {
        checkout_key: crypto.randomUUID(), request_fingerprint: sha(`request-${index}`),
        access_token_hash: sha(`access-${index}`), client_hash: sha(`client-${index}`),
        customer: { name: 'عميلة اختبار محلي', phone },
        delivery: { method: c.method, option_code: delivery.code, option_label: delivery.label,
          shipping_net_halalas: p.shippingNetHalalas, shipping_vat_halalas: p.shippingVatHalalas },
        address: c.method === 'shipping' ? { recipient_name: 'عميلة اختبار محلي', recipient_phone: phone,
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
      assert.equal(Number(order.total_halalas), c.total, `case ${index}: the order total is the shown price × meters (+ shipping)`)
      assert.equal(Number(order.total_halalas), priced.quote.totals.totalHalalas)
      assert.equal(Number(order.vat_halalas), vatFromTotal(c.total), `case ${index}: VAT extracted from the total`)
      assert.equal(Number(order.shipping_net_halalas) + Number(order.shipping_vat_halalas), c.method === 'shipping' ? 5000 : 0)
      assert.equal(order.terms_version, '2026-10-24')
      const invoice = planOnlineInvoiceLines(order, items, items.map(item => ({ name: item.fabric_name })), Number(order.total_halalas) / 100)
      assert.equal(invoice.reduce((sum, line) => sum + Math.round(line.amount * 100), 0), Number(order.total_halalas))
      assert.equal(invoice.find(line => line.kind === 'shipping')?.amount ?? 0, c.method === 'shipping' ? 50 : 0)
      assert.equal(Number((await db.query('select current_quantity from public.fabric_inventory_colors where id=$1', [fabric.color_id])).rows[0].current_quantity), c.stock)
    }
    assert.equal(Number((await db.query('select count(*) n from public.income')).rows[0].n), 0)
    assert.equal(Number((await db.query("select count(*) n from public.fabric_store_stock_reservations where status='active'")).rows[0].n), 0)

    // With whole-riyal orders stored, the rollback refuses and changes nothing.
    await db.query('savepoint before_rollback_w')
    await assert.rejects(db.query(h.read(h.FILES.rollbackW)), /FABRIC_STORE_WHOLE_RIYAL_ROLLBACK_REFUSED/)
    await db.query('rollback to savepoint before_rollback_w')
    console.log(`PASS local SQL snapshots -> checkout/retry -> stored VAT/policies -> invoice plans: ${CASES.length} cases (shipping 50, pickup 0, 1 riyal edge, 288 × 1.5, piece 288 × 3.5, 287 × 2); rollback refused; no sale or hold`)
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
