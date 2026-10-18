// FAB-AUD-001: an invoice POST whose response cannot be read must never be retried
// automatically. Real sender + real alostaz-service, synthetic Supabase and a
// recording fake of Alostaz. No .env, no network: any URL outside the fake host throws.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

const FAKE_BASE = 'https://alostaz.invalid/api'
process.env.ALOSTAZ_API_TOKEN = 'synthetic-test-token'
process.env.ALOSTAZ_BASE_URL = FAKE_BASE
process.env.ALOSTAZ_FABRICS_INVOICE_STATUS = 'issued'
process.env.FABRIC_STORE_ALOSTAZ_ENABLED = 'true'

const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }
  cache.set(file, mod)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const local = (spec) =>
    spec.startsWith('@/') ? load(path.join(root, 'src', spec.slice(2) + '.ts'))
      : spec.startsWith('.') ? load(path.resolve(path.dirname(file), spec + '.ts'))
        : require(spec)
  new Function('require', 'module', 'exports', output)(local, mod, mod.exports)
  return mod.exports
}
const src = (p) => path.join(root, 'src', p)
const config = load(src('lib/alostaz-config.ts'))
const service = load(src('lib/services/alostaz-service.ts'))
const sender = load(src('lib/server/alostaz-fabric-invoice.ts'))
const confirm = load(src('lib/server/fabric-store/confirm.ts'))

// ── fake Alostaz ───────────────────────────────────────────────
const enc = new TextEncoder()
/** 2xx/5xx headers arrive, then the body stream dies after a partial chunk. */
function cutBody(status) {
  return new Response(new ReadableStream({
    start(c) { c.enqueue(enc.encode('{"id":90')); c.error(new TypeError('terminated: other side closed')) },
  }), { status, headers: { 'content-type': 'application/json' } })
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let invoicePosts, committed, invoiceModes, partnersMode, lastInvoiceBody
const INVOICE_MODES = {
  // provider committed the invoice, sent 200, the body was lost
  'committed-body-cut': () => { committed++; return cutBody(200) },
  'committed-truncated-json': () => { committed++; return new Response('{"id": 9', { status: 200 }) },
  'server-error-body-cut': () => cutBody(502),
  'connect-fail': () => { throw new TypeError('fetch failed: ECONNRESET') },
  // provider explicitly rejected it (validation): nothing was created
  'rejected-body-cut': () => cutBody(422),
  'rejected': () => json({ message: 'synthetic validation error' }, 422),
  'ok': () => { committed++; return json({ id: 900 + committed, code: `INV-${900 + committed}` }) },
}
global.fetch = async (url, init = {}) => {
  url = String(url)
  assert(url.startsWith(FAKE_BASE + '/'), 'network escape forbidden: ' + url)
  const endpoint = url.slice(FAKE_BASE.length)
  const method = String(init.method || 'GET').toUpperCase()
  if (/^\/products\/\d+$/.test(endpoint) && method === 'GET') {
    return json({ data: { id: Number(endpoint.split('/')[2]), name: 'Synthetic fabric' } })
  }
  if (endpoint === '/partners' && method === 'GET') {
    if (partnersMode === 'body-cut') return cutBody(200)
    return json({ data: [{ id: 1, name: 'Synthetic buyer', contacts: [] }] })
  }
  if (endpoint === '/invoices' && method === 'POST') {
    invoicePosts++
    lastInvoiceBody = JSON.parse(init.body)
    const mode = invoiceModes.length > 1 ? invoiceModes.shift() : invoiceModes[0]
    return INVOICE_MODES[mode]()
  }
  throw new Error(`unexpected fake endpoint ${method} ${endpoint}`)
}

// ── synthetic Supabase that evaluates the filters the sender uses ──
function makeAdmin({ online, income }) {
  const order = { id: 'synthetic-order', order_number: 'FS-100123', total_halalas: 11500,
    shipping_net_halalas: 0, shipping_vat_halalas: 0, payment_status: 'paid' }
  return {
    from(table) {
      const filters = []
      let patch = null, options = {}, wantsRow = false
      const q = {
        select() { if (patch) wantsRow = true; return q },
        eq(col, val) { filters.push((r) => r[col] === val); return q },
        is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return q },
        lt(col, val) { filters.push((r) => String(r[col] ?? '') < String(val)); return q },
        or(expr) {
          const parts = expr.split(',').map((p) => p.split('.'))
          filters.push((r) => parts.some(([c, op, v]) => (op === 'is' && v === 'null' ? r[c] == null : r[c] === v)))
          return q
        },
        order() { return q },
        update(p, o) { patch = p; options = o || {}; return q },
        async run() {
          if (table === 'income') {
            const match = filters.every((f) => f(income))
            if (patch) {
              if (match) Object.assign(income, patch)
              return { data: match && wantsRow ? { id: income.id } : null, error: null, count: options.count ? (match ? 1 : 0) : undefined }
            }
            return { data: match ? { ...income } : null, error: match ? null : { message: 'not found' } }
          }
          if (table === 'fabric_store_orders') return { data: online ? order : null, error: null }
          if (table === 'fabric_store_order_items') {
            return { data: [{ line_number: 1, stock_consumption_cm: 100, gross_halalas: 11500, fabric_name: 'Synthetic fabric' }], error: null }
          }
          if (table === 'fabric_inventory') {
            return { data: { id: 'synthetic-stock', name: 'Synthetic fabric', alostaz_product_id: 67,
              alostaz_product_branch_id: config.ALOSTAZ_FABRICS_BRANCH_ID }, error: null }
          }
          throw new Error('unexpected synthetic table ' + table)
        },
        single() { return q.run() }, maybeSingle() { return q.run() }, then(a, b) { return q.run().then(a, b) },
      }
      return q
    },
  }
}

function sale(kind) {
  const base = { id: `synthetic-income-${kind}`, branch: 'fabrics', category: 'fabric_sale', invoice_number: 123,
    buyer_name: 'Synthetic buyer', buyer_phone: null, date: '2026-10-18', description: null,
    fabric_items: [{ name: 'Synthetic fabric', quantity_meters: 1 }], customer_name: 'Synthetic fabric',
    quantity_meters: 1, alostaz_invoice_id: null, alostaz_invoice_code: null, alostaz_sync_status: null }
  if (kind === 'online') return { ...base, amount: 115, payment_method: 'network', network_amount: null, customer_source: 'المتجر الإلكتروني' }
  if (kind === 'shop-mixed') return { ...base, amount: 200, payment_method: 'mixed', network_amount: 80, customer_source: null }
  return { ...base, amount: 150, payment_method: 'network', network_amount: null, customer_source: null }
}

function reset(modes) { invoicePosts = 0; committed = 0; invoiceModes = modes; partnersMode = 'ok'; lastInvoiceBody = null }

const cases = []
const test = (name, fn) => cases.push({ name, fn })

for (const kind of ['online', 'shop', 'shop-mixed']) {
  test(`${kind}: invoice committed, 200 then body stream cut → review_required, never a 2nd POST`, async () => {
    reset(['committed-body-cut'])
    const income = sale(kind), admin = makeAdmin({ online: kind === 'online', income })
    const first = await sender.sendFabricIncomeToAlostaz(admin, income.id)
    assert.equal(first.kind, 'failed')
    assert.equal(first.outcomeUnknown, true, 'body loss after 2xx must be outcome-unknown')
    assert.equal(income.alostaz_sync_status, 'review_required')
    assert.equal(confirm.alostazTaskOutcome(first).outcome, 'dead', 'outbox must not retry')
    const second = await sender.sendFabricIncomeToAlostaz(admin, income.id) // button press / outbox rerun
    assert.equal(second.kind, 'review_required')
    assert.equal(invoicePosts, 1); assert.equal(committed, 1)
  })
}

test('online: button and outbox concurrently during body loss → one POST only', async () => {
  reset(['committed-body-cut'])
  const income = sale('online'), admin = makeAdmin({ online: true, income })
  const [a, b] = await Promise.all([sender.sendFabricIncomeToAlostaz(admin, income.id), sender.sendFabricIncomeToAlostaz(admin, income.id)])
  assert.deepEqual([a.kind, b.kind].sort(), ['failed', 'in_progress'])
  assert.equal(invoicePosts, 1)
  assert.equal(income.alostaz_sync_status, 'review_required')
  const again = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(again.kind, 'review_required'); assert.equal(invoicePosts, 1)
})

test('200 with truncated JSON (no id) → review_required', async () => {
  reset(['committed-truncated-json'])
  const income = sale('shop'), admin = makeAdmin({ online: false, income })
  const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(r.outcomeUnknown, true); assert.equal(income.alostaz_sync_status, 'review_required')
})

test('5xx with body stream cut → review_required', async () => {
  reset(['server-error-body-cut'])
  const income = sale('online'), admin = makeAdmin({ online: true, income })
  const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(r.outcomeUnknown, true); assert.equal(income.alostaz_sync_status, 'review_required')
})

test('connection dropped before headers → review_required', async () => {
  reset(['connect-fail'])
  const income = sale('shop'), admin = makeAdmin({ online: false, income })
  const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(r.outcomeUnknown, true); assert.equal(income.alostaz_sync_status, 'review_required')
})

test('4xx rejection with readable body → failed, retry allowed, retry sends once', async () => {
  reset(['rejected', 'ok'])
  const income = sale('online'), admin = makeAdmin({ online: true, income })
  const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(r.kind, 'failed'); assert.equal(r.outcomeUnknown, false)
  assert.equal(income.alostaz_sync_status, 'failed')
  assert.equal(confirm.alostazTaskOutcome(r).outcome, 'retry')
  const retry = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(retry.kind, 'sent'); assert.equal(invoicePosts, 2); assert.equal(committed, 1)
})

test('4xx rejection whose body is cut → still a proven rejection, retry allowed', async () => {
  reset(['rejected-body-cut'])
  const income = sale('shop'), admin = makeAdmin({ online: false, income })
  const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(r.outcomeUnknown, false); assert.equal(income.alostaz_sync_status, 'failed')
})

test('body cut on a lookup before any invoice POST → failed, retry allowed', async () => {
  reset(['ok']); partnersMode = 'body-cut'
  const income = sale('shop'), admin = makeAdmin({ online: false, income })
  const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
  assert.equal(r.kind, 'failed'); assert.equal(r.outcomeUnknown, false)
  assert.equal(income.alostaz_sync_status, 'failed'); assert.equal(invoicePosts, 0)
})

for (const kind of ['online', 'shop', 'shop-mixed']) {
  test(`${kind}: normal send → sent once, reference saved, then already_sent`, async () => {
    reset(['ok'])
    const income = sale(kind), admin = makeAdmin({ online: kind === 'online', income })
    const r = await sender.sendFabricIncomeToAlostaz(admin, income.id)
    assert.equal(r.kind, 'sent'); assert.equal(income.alostaz_sync_status, 'sent')
    assert.equal(income.alostaz_invoice_id, r.invoice_id)
    const expectedHalalas = { online: 11500, shop: 15000, 'shop-mixed': 8000 }[kind]
    assert.equal(lastInvoiceBody.payments[0].amount, expectedHalalas)
    const again = await sender.sendFabricIncomeToAlostaz(admin, income.id)
    assert.equal(again.kind, 'already_sent'); assert.equal(invoicePosts, 1)
  })
}

test('tailoring/workshop share alostazFetch: body cut after 200 → isAlostazInvoiceOutcomeUnknown', async () => {
  reset(['committed-body-cut'])
  await assert.rejects(
    service.createInvoiceForOrder({ order_number: 'T-1', client_name: 'Synthetic buyer', price: 100, paid_amount: 100, payment_method: 'card' }),
    (err) => service.isAlostazInvoiceOutcomeUnknown(err) === true
  )
  assert.equal(invoicePosts, 1)
})

;(async () => {
  let failed = 0
  for (const c of cases) {
    try { await c.fn(); console.log('PASS', c.name) }
    catch (e) { failed++; console.log('FAIL', c.name, '\n     ', e.message.split('\n')[0]) }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`)
  process.exit(failed ? 1 : 0)
})()
