// FAB-AUD-005: the Moyasar return page must never claim "nothing was charged" (or push a
// new payment) unless our server recorded the attempt as ended. Runs the real ReturnView
// through a minimal hook runtime (state, effects, refs) with fake timers and a mocked
// status API, and inspects every rendered frame. No browser, no provider, no .env.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '..')

// ── minimal hook runtime ───────────────────────────────────────
let slots, idx, dirty
const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))
const hooks = {
  useState(init) {
    const s = slots[idx] ??= { v: typeof init === 'function' ? init() : init }
    idx++
    s.set ??= (u) => { const nv = typeof u === 'function' ? u(s.v) : u; if (!Object.is(nv, s.v)) { s.v = nv; dirty = true } }
    return [s.v, s.set]
  },
  useRef(init) { const s = slots[idx++] ??= { current: init }; return s },
  useCallback(fn, deps) {
    const s = slots[idx++] ??= {}
    if (changed(s.deps, deps)) { s.fn = fn; s.deps = deps }
    return s.fn
  },
  useEffect(fn, deps) {
    const s = slots[idx++] ??= {}
    if (changed(s.deps, deps)) { s.deps = deps; pendingEffects.push(() => { s.cleanup?.(); s.cleanup = fn() || undefined }) }
  },
}
let pendingEffects

// ── fake timers ────────────────────────────────────────────────
let now, timers, nextTimerId
globalThis.setTimeout = (fn, ms = 0) => { const id = ++nextTimerId; timers.push({ id, at: now + ms, fn }); return id }
globalThis.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id) }
const tick = () => new Promise((r) => setImmediate(r))

// ── load the real page with stubbed leaf modules ───────────────
let searchParams, cartCleared
// RETURN_PAGE_FILE: run the same cases against another copy (e.g. the pre-fix page)
const filename = process.env.RETURN_PAGE_FILE || path.join(root, 'src/app/fabrics/payment/return/page.tsx')
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8') + '\nexport { ReturnView as __ReturnView };', {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: filename,
}).outputText
const fakeRequire = (name) => {
  if (name === 'react') return { ...React, ...hooks }
  if (name === 'next/navigation') return { useSearchParams: () => searchParams }
  if (name === 'next/link') return (p) => React.createElement('a', { href: p.href, className: p.className }, p.children)
  if (name.includes('FabricPayNowButton')) return (p) => React.createElement('button', { 'data-pay': '1' }, 'SYNTHETIC-PAY-BUTTON ' + (p.label || ''))
  if (name.includes('checkout-contract')) return { IS_FABRIC_STORE_PAYMENTS_ENABLED: true }
  if (name.includes('order-status')) return { IS_FABRIC_STORE_ORDERS_ENABLED: true }
  if (name.includes('fabric-number-format')) return { formatFabricNumber: String }
  if (name.includes('fabricCartStore')) return { useFabricCartStore: (f) => f({ clear() { cartCleared = true } }) }
  return require(name)
}
const mod = { exports: {} }
new Function('require', 'exports', 'module', output)(fakeRequire, mod.exports, mod)
const ReturnView = mod.exports.__ReturnView

// ── driver ─────────────────────────────────────────────────────
let frames, tree, statusCalls
function render() {
  idx = 0; pendingEffects = []
  tree = ReturnView()
  frames.push(renderToStaticMarkup(tree))
  for (const run of pendingEffects) run()
}
async function settle() {
  for (let i = 0; i < 50; i++) {
    await tick()
    if (dirty) { dirty = false; render() }
  }
}
async function advance(ms) {
  const until = now + ms
  for (;;) {
    timers.sort((a, b) => a.at - b.at)
    const t = timers[0]
    if (!t || t.at > until) break
    timers.shift(); now = t.at; t.fn(); await settle()
  }
  now = until
}
async function mount(query, respond) {
  slots = []; dirty = false; now = 0; timers = []; nextTimerId = 0; frames = []; statusCalls = 0; cartCleared = false
  searchParams = new URLSearchParams(query)
  globalThis.fetch = async (url) => {
    assert(String(url).startsWith('/api/fabric-store/payment/status/'), 'unexpected fetch ' + url)
    return respond(++statusCalls)
  }
  render(); await settle()
}
function findButton(node, text) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) { for (const n of node) { const f = findButton(n, text); if (f) return f } return null }
  const p = node.props || {}
  if (node.type === 'button' && renderToStaticMarkup(node).includes(text)) return p
  return findButton(p.children, text)
}

const ATTEMPT = 'aaaaaaaa-0000-4000-8000-000000000001'
const ok = (body) => new Response(JSON.stringify({ ok: true, orderNumber: 'FS-100123', totalHalalas: 11500, ...body }), { status: 200 })
const outage = () => new Response(JSON.stringify({ ok: false, error: 'تعذّر التحقق الآن — سنعيد المحاولة' }), { status: 503 })
const PENDING = { paymentStatus: 'pending', attemptStatus: 'initiated' }
const FORBIDDEN = ['لم يُخصم شيء', 'لم يكتمل الدفع', 'SYNTHETIC-PAY-BUTTON', 'إعادة محاولة الدفع']
const noFalseClaim = () => frames.forEach((html, i) => FORBIDDEN.forEach((s) =>
  assert(!html.includes(s), `frame ${i} shows «${s}» while the outcome is unknown`)))
const last = () => frames[frames.length - 1]

const cases = []
const test = (name, fn) => cases.push({ name, fn })

for (const [label, respond] of [
  ['status API 503 every time', () => outage()],
  ['network throws every time', () => { throw new TypeError('Failed to fetch') }],
  ['attempt stays pending/initiated', () => ok(PENDING)],
]) {
  test(`back=1 + ${label}: no no-charge claim, no pay button, ends in a neutral recheck view`, async () => {
    await mount(`attempt=${ATTEMPT}&back=1`, respond)
    await advance(3_000 * 2)            // the old code gave up after 2 polls
    noFalseClaim()
    await advance(3_000 * 30)           // well past MAX_POLLS
    noFalseClaim()
    assert.equal(timers.length, 0, 'polling must stop: no endless loading')
    assert(!last().includes('animate-spin'), 'must not stay on the spinner forever')
    assert(last().includes('لم يصلنا تأكيد الدفع بعد'))
    assert(last().includes('ولا حاجة للدفع مرة أخرى'))
    assert(last().includes('href="/fabrics/order/"'), 'order tracking link')
    assert(findButton(tree, 'تحقّقي مرة أخرى'), 'recheck button')
  })
}

test('back=1 + pending, then a late paid → success, cart cleared, never a pay button', async () => {
  await mount(`attempt=${ATTEMPT}&back=1`, (n) => (n < 6 ? (n % 2 ? outage() : ok(PENDING)) : ok({ paymentStatus: 'paid', attemptStatus: 'paid' })))
  await advance(3_000 * 10)
  noFalseClaim()
  assert(last().includes('تم الدفع بنجاح')); assert.equal(cartCleared, true)
})

test('back=1 + outage until polling stops, then «تحقّقي مرة أخرى» picks up paid', async () => {
  let paid = false
  await mount(`attempt=${ATTEMPT}&back=1`, () => (paid ? ok({ paymentStatus: 'paid', attemptStatus: 'paid' }) : outage()))
  await advance(3_000 * 30)
  noFalseClaim()
  paid = true
  findButton(tree, 'تحقّقي مرة أخرى').onClick(); await settle(); await advance(3_000)
  assert(last().includes('تم الدفع بنجاح'))
})

test('no back param + outage: same neutral ending (unchanged behaviour)', async () => {
  await mount(`attempt=${ATTEMPT}`, () => outage())
  await advance(3_000 * 30)
  noFalseClaim()
  assert(last().includes('لم يصلنا تأكيد الدفع بعد')); assert.equal(timers.length, 0)
})

test('server recorded the attempt as failed → «لم يكتمل الدفع» + retry stays (unchanged)', async () => {
  await mount(`attempt=${ATTEMPT}&back=1`, () => ok({ paymentStatus: 'pending', attemptStatus: 'failed' }))
  await advance(3_000)
  assert(last().includes('لم يكتمل الدفع')); assert(last().includes('SYNTHETIC-PAY-BUTTON'))
  assert.equal(timers.length, 0)
})

test('paid on the first check → success (unchanged)', async () => {
  await mount(`attempt=${ATTEMPT}`, () => ok({ paymentStatus: 'paid', attemptStatus: 'paid' }))
  await advance(0)
  assert(last().includes('تم الدفع بنجاح')); assert.equal(statusCalls, 1)
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
