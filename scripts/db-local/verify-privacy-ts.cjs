// Fix batch D — the TypeScript half (no database, no network): AUD-07 track-only token and link,
// AUD-10 analytics exclusion and security headers, AUD-13 a cut alostaz send becomes «review».
//   node scripts/db-local/verify-privacy-ts.cjs [--mutate-ts <file> "<find>" "<replace>"]...
// <file> is a path under src/ (e.g. lib/server/fabric-store/http.ts); a COPY is mutated, the repo file is not touched.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createJiti } = require('jiti')

const ROOT = path.resolve(__dirname, '../..')
const args = process.argv.slice(2)
const tsEdits = []
for (let i = 0; i < args.length; i++) if (args[i] === '--mutate-ts') { tsEdits.push([args[i + 1], args[i + 2], args[i + 3]]); i += 3 }

// a mutated copy of src/ only for the files named; jiti resolves @/ to it
// inside the repo's node_modules/.cache (git-ignored): module resolution from the copy reaches node_modules
fs.mkdirSync(path.join(ROOT, 'node_modules', '.cache'), { recursive: true })
const work = fs.mkdtempSync(path.join(ROOT, 'node_modules', '.cache', 'ys-privacy-ts-'))
const srcRoot = tsEdits.length ? path.join(work, 'src') : path.join(ROOT, 'src')
if (tsEdits.length) {
  fs.cpSync(path.join(ROOT, 'src'), srcRoot, { recursive: true })
  for (const [file, find, replace] of tsEdits) {
    const target = path.join(srcRoot, file)
    const text = fs.readFileSync(target, 'utf8')
    if (!text.includes(find)) { console.log(`MUTATION PATTERN NOT FOUND in ${file}: ${find.slice(0, 60)}`); process.exit(3) }
    fs.writeFileSync(target, text.replace(find, () => replace))
  }
}

const stub = path.join(work, 'alostaz-service.cjs')
fs.writeFileSync(stub, `exports.getFabricsBranchContext=async()=>({branchId:1});
exports.createProduct=async()=>{throw Error('unexpected')};
exports.isAlostazInvoiceOutcomeUnknown=()=>false;
exports.createInvoiceForFabricSale=async()=>{throw Error('no invoice may be created here')};`)
const jiti = createJiti(__filename, { alias: {
  '@/lib/services/alostaz-service': stub,
  '@': srcRoot,
} })
const load = file => jiti(path.join(srcRoot, file))

let failures = 0
const results = []
async function check(name, fn) {
  try { results.push(`✔ ${name}: ${await fn()}`) } catch (error) { failures++; results.push(`✘ ${name}: ${error.message}`) }
}

;(async () => {
  const http = load('lib/server/fabric-store/http.ts')
  const analytics = load('lib/analytics-privacy.ts')
  const secret = 'x'.repeat(40)
  const key = '7f0c2f0e-3a2b-4c1d-9e8f-0a1b2c3d4e5f'

  await check('AUD-07 the track token is not the access token, and only it matches', () => {
    const access = http.deriveAccessToken(secret, key)
    const track = http.deriveTrackToken(secret, key)
    assert.match(track, /^[0-9a-f]{64}$/)
    assert.notEqual(track, access)
    assert.equal(http.trackTokenMatches(secret, key, track), true)
    assert.equal(http.trackTokenMatches(secret, key, access), false, 'the access token is not a track token')
    assert.equal(http.trackTokenMatches(secret, 'another-key', track), false, 'a token for another order')
    assert.equal(http.trackTokenMatches(secret, key, track.toUpperCase()), false, 'only the canonical form')
    assert.equal(http.trackTokenMatches(secret, key, 'zz'), false)
    // the track token is never a valid cookie: the database looks the cookie up by sha256(access token)
    assert.notEqual(http.sha256Hex(track), http.sha256Hex(access))
    return 'derived with another purpose; the access token, another order and bad input are refused'
  })

  await check('AUD-07 the customer link carries the token after # (never sent to the server)', () => {
    const link = http.trackingLink('https://shop.example', 'FS-100269', 'a'.repeat(64))
    assert.equal(link, `https://shop.example/fabrics/order/#n=FS-100269&k=${'a'.repeat(64)}`)
    assert.equal(new URL(link).search, '', 'no query string')
    return link.replace(/a{64}/, '<64 hex>')
  })

  await check('AUD-07/10 Google Analytics is off on checkout, payment and order tracking', () => {
    for (const p of ['/fabrics/checkout/', '/fabrics/checkout', '/fabrics/payment/return/', '/fabrics/order/'])
      assert.equal(analytics.isAnalyticsExcludedPath(p), true, p)
    for (const p of ['/', '/fabrics/', '/fabrics/abc/', '/fabrics/cart/', '/track-order/'])
      assert.equal(analytics.isAnalyticsExcludedPath(p), false, p)
    const script = analytics.analyticsBootstrapScript()
    assert.match(script, /ga-disable-G-8KCD0TSPCJ/)
    assert.match(script, /page_location: location\.origin \+ location\.pathname/)
    // the bootstrap disables before config, and the exclusion list is the same one
    assert.ok(script.indexOf('ga-disable') < script.indexOf("gtag('config'"))
    for (const p of analytics.GA_EXCLUDED_PATH_PREFIXES) assert.ok(script.includes(p))
    return 'excluded: checkout, payment, order; page_location without query or #'
  })

  await check('AUD-10 security headers on every page; CSP report-only; payment form to Moyasar allowed', async () => {
    const config = jiti(path.join(ROOT, 'next.config.ts')).default
    assert.equal(typeof config.headers, 'function')
    const [rule] = await config.headers()
    assert.equal(rule.source, '/:path*')
    const h = Object.fromEntries(rule.headers.map(x => [x.key, x.value]))
    assert.match(h['Strict-Transport-Security'], /max-age=\d{7,}/)
    assert.equal(h['X-Content-Type-Options'], 'nosniff')
    assert.equal(h['X-Frame-Options'], 'DENY')
    assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin')
    const csp = h['Content-Security-Policy-Report-Only']
    assert.ok(csp, 'report-only first')
    assert.equal(h['Content-Security-Policy'], undefined, 'not enforced yet')
    for (const part of ["frame-ancestors 'none'", 'https://checkout.moyasar.com', 'https://*.supabase.co', 'https://www.googletagmanager.com', "object-src 'none'"])
      assert.ok(csp.includes(part), part)
    return `${rule.headers.length} headers`
  })

  // R-CD-07: the bootstrap sets the disable flag BEFORE the URL changes (history wrapped), not after
  await check('R-CD-07 the flag is set synchronously before every in-site navigation (pushState, replaceState, back)', () => {
    const vm = require('node:vm')
    const listeners = []
    const historyCalls = []
    const win = {
      location: new URL('https://shop.example/fabrics/'),
      history: {
        pushState(s, t, u) { historyCalls.push(['push', u, win['ga-disable-G-8KCD0TSPCJ']]); win.location = new URL(u, win.location.href) },
        replaceState(s, t, u) { historyCalls.push(['replace', u, win['ga-disable-G-8KCD0TSPCJ']]); win.location = new URL(u, win.location.href) },
      },
      addEventListener(type, fn) { listeners.push([type, fn]) },
      URL,
    }
    win.window = win
    win.dataLayer = []
    const ctx = vm.createContext(win)
    vm.runInContext(analytics.analyticsBootstrapScript(), ctx)
    const flag = () => win['ga-disable-G-8KCD0TSPCJ']
    const config = win.dataLayer.find(a => a[0] === 'config')
    assert.equal(flag(), false, 'store page: analytics on')
    assert.equal(config[2].send_page_view, true)
    win.history.pushState(null, '', '/fabrics/order/')
    assert.equal(historyCalls[0][2], true, 'the flag was set before the original pushState ran')
    win.history.replaceState(null, '', '/fabrics/abc/')
    assert.equal(historyCalls[1][2], false, 'leaving the sensitive page turns it back on before the URL changes')
    win.history.pushState(null, '', 'https://shop.example/fabrics/checkout/?x=1')
    assert.equal(flag(), true)
    // back to a store page with the browser button
    win.location = new URL('https://shop.example/fabrics/')
    for (const [type, fn] of listeners) if (type === 'popstate') fn()
    assert.equal(flag(), false)
    // a first load on a sensitive page: disabled, and no page_view from config
    const win2 = { location: new URL('https://shop.example/fabrics/payment/return/?attempt=1'), history: { pushState() {}, replaceState() {} },
      addEventListener() {}, URL, dataLayer: [] }
    win2.window = win2
    vm.runInContext(analytics.analyticsBootstrapScript(), vm.createContext(win2))
    assert.equal(win2['ga-disable-G-8KCD0TSPCJ'], true)
    assert.equal(win2.dataLayer.find(a => a[0] === 'config')[2].send_page_view, false)
    assert.equal(win2.dataLayer.find(a => a[0] === 'config')[2].page_location, 'https://shop.example/fabrics/payment/return/')
    return 'pushState/replaceState/popstate set the flag first; a sensitive first load sends nothing'
  })

  await check('R-CD-07 page views are ours, only on allowed pages, without query', () => {
    const sent = []
    const win = { location: { origin: 'https://shop.example', pathname: '/' }, gtag: (...a) => sent.push(a) }
    assert.equal(analytics.applyAnalyticsRoute(win, '/fabrics/', true), 'first')
    assert.equal(sent.length, 0, 'the first load is sent by config')
    assert.equal(analytics.applyAnalyticsRoute(win, '/fabrics/order/', false), 'excluded')
    assert.equal(win['ga-disable-G-8KCD0TSPCJ'], true)
    assert.equal(sent.length, 0)
    assert.equal(analytics.applyAnalyticsRoute(win, '/fabrics/abc/', false), 'sent')
    assert.equal(win['ga-disable-G-8KCD0TSPCJ'], false)
    assert.deepEqual(sent[0], ['event', 'page_view', { page_location: 'https://shop.example/fabrics/abc/', page_path: '/fabrics/abc/' }])
    return 'excluded: flag on, nothing sent; allowed: one page_view'
  })

  await check('the «seen» key of a store alert does not change with the daily reconciliation time', () => {
    const alerts = load('lib/fabric-store/store-alerts.ts')
    const a = { kind: 'external_refund', orderId: 'o1', orderNumber: 'FS-1', since: '2026-10-05T08:00:00Z', environment: 'live', detail: 'x' }
    const later = { ...a, since: '2026-10-06T08:00:00Z' }
    assert.equal(alerts.alertKey(a), alerts.alertKey(later))
    const seen = new Set([alerts.alertKey(a)])
    assert.equal(alerts.newAlertsCount([later], seen), 0, 'the same alert is not «new» again after a reconciliation')
    assert.equal(alerts.newAlertsCount([{ ...a, orderId: 'o2' }], seen), 1, 'another order is new')
    return 'kind + order; a later reconciliation keeps it seen'
  })

  // R-CD-05: the loops start nothing after the deadline (no Moyasar call, no task)
  await check('R-CD-05 the job loops start no item after the deadline', async () => {
    const payments = load('lib/server/fabric-store/payments.ts')
    const refunds = load('lib/server/fabric-store/refunds.ts')
    const confirm = load('lib/server/fabric-store/confirm.ts')
    const forbidden = () => { throw new Error('nothing may be called after the deadline') }
    const moyasar = { fetchPayment: forbidden, fetchInvoice: forbidden, refundPayment: forbidden, createInvoice: forbidden }
    const rows = {
      fabric_store_pending_payment_events: [1, 2, 3].map(i => ({ event_id: `e${i}`, environment: 'test', provider_payment_id: `p${i}` })),
      fabric_store_due_reconciliation: [1, 2].map(i => ({ attempt_id: `a${i}`, invoice_id: `i${i}`, status: 'paid', claim_token: 't' })),
      fabric_store_due_refunds: [{ refund_id: 'r1', payment_id: 'p1', environment: 'test', amount_halalas: 100, refunded_before: 0, called: false, claim_token: 'c' }],
      fabric_store_due_outbox: [{ id: 'x1', topic: 'confirm_order', order_id: 'o1', payload: {}, attempts: 0 }],
    }
    const rpc = async fn => {
      if (rows[fn]) return { data: rows[fn], error: null }
      throw new Error(`unexpected rpc after the deadline: ${fn}`)
    }
    const deps = { rpc, moyasar, config: { environment: 'test' } }
    const past = Date.now() - 1
    assert.deepEqual(await payments.processPendingPaymentEvents(deps, 20, past), { deferred: 3 })
    assert.deepEqual(await payments.reconcilePayments(deps, 20, past), { deferred: 2 })
    assert.deepEqual(await refunds.processPendingRefunds(deps, 10, true, past), { deferred: 1 })
    assert.deepEqual(await confirm.processFabricStoreOutbox({ rpc, sendAlostazInvoice: null }, { limit: 20, deadline: past }), { deferred: 1 })
    return 'events 3, reconciliation 2, refunds 1, outbox 1: all deferred, nothing called'
  })

  const { sendFabricIncomeToAlostaz } = load('lib/server/alostaz-fabric-invoice.ts')
  // a shop sale whose earlier send was cut after the claim: the row stays «sending»
  // markCount: how many rows the «review» update changes (0 = the row changed meanwhile)
  function stuck(syncedAgoMs, markCount = 1) {
    const updates = []
    const income = { id: 'sale', branch: 'fabrics', amount: 230, payment_method: 'network', customer_source: null, category: null,
      network_amount: 0, fabric_items: [], invoice_number: 7, alostaz_invoice_id: null, date: '2026-10-05',
      alostaz_sync_status: 'sending', alostaz_synced_at: new Date(Date.now() - syncedAgoMs).toISOString() }
    return {
      updates,
      from: () => {
        let update = null
        const q = {
          select() { return q }, eq() { return q }, is() { return q }, or() { return q }, order() { return q }, lt() { return q },
          update(payload) { update = payload; updates.push(payload); return q },
          single: async () => ({ data: income }),
          maybeSingle: async () => ({ data: null }),
          // the claim (null/failed → sending) changes nothing: the row is «sending» already; the review mark changes markCount
          then(resolve, reject) {
            const result = !update ? { data: [] }
              : update.alostaz_sync_status === 'review_required' ? { count: markCount, error: null } : { count: 0, error: null }
            return Promise.resolve(result).then(resolve, reject)
          },
        }
        return q
      },
    }
  }
  await check('AUD-13 a send cut more than 10 minutes ago becomes «review», never «failed»', async () => {
    const old = stuck(11 * 60 * 1000)
    assert.equal((await sendFabricIncomeToAlostaz(old, 'sale')).kind, 'review_required')
    const marked = old.updates.find(u => u.alostaz_sync_status === 'review_required')
    assert.ok(marked, 'the row is moved to review')
    assert.equal(old.updates.some(u => u.alostaz_sync_status === 'failed'), false, 'never failed (a resend could duplicate the invoice)')
    const fresh = stuck(2 * 60 * 1000)
    assert.equal((await sendFabricIncomeToAlostaz(fresh, 'sale')).kind, 'in_progress')
    assert.equal(fresh.updates.some(u => u.alostaz_sync_status === 'review_required'), false, 'a send in progress is left alone')
    // the row changed between the read and the write (the send finished): not announced as «review»
    const raced = stuck(11 * 60 * 1000, 0)
    assert.equal((await sendFabricIncomeToAlostaz(raced, 'sale')).kind, 'in_progress')
    return '11 min: review_required (no resend); 2 min: in_progress; the mark not written: in_progress'
  })

  console.log(results.join('\n'))
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
  fs.rmSync(work, { recursive: true, force: true })
  process.exit(failures ? 1 : 0)
})()
