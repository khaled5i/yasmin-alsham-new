// Stage 10 C: actual Next route handlers and configuration/feature gates.
// Financial processors, Supabase and Alostaz are recording stubs; fetch is forbidden.
// No .env files, external calls, database writes or real credentials.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const next = require('next/server')

const SRC = path.resolve(__dirname, '../src')
const cache = new Map()
const calls = []
const scheduled = []
const ORDER = 'aaaaaaaa-0000-4000-8000-000000000001'
const ATTEMPT = 'bbbbbbbb-0000-4000-8000-000000000001'
const LOCAL_CRON = 'synthetic-cron-token-for-unit-tests'
let staffRole = 'admin'
let staffActive = true
let staffTokenValid = true
const count = name => calls.filter(c => c.name === name).length
const record = (name, detail = {}) => calls.push({ name, ...detail })
const client = {
  auth: { getUser: async () => ({ data: { user: staffTokenValid ? { id: ORDER } : null }, error: null }) },
  from(table) {
    assert(['users', 'workers'].includes(table), `Unexpected table access: ${table}`)
    const query = {
      select() { return query }, eq() { return query },
      async single() { return { data: { role: staffRole, is_active: staffActive }, error: null } },
      async maybeSingle() {
        return { data: table === 'users'
          ? { role: staffRole, is_active: true, full_name: 'Local test admin' }
          : { worker_type: 'fabric_store_manager' }, error: null }
      },
    }
    return query
  },
  async rpc(name) {
    assert.equal(name, 'fabric_store_purge_addresses', 'only the local address-job stub may call RPC')
    record('addressJob')
    return { data: { status: 'ok', anonymized: 0 }, error: null }
  },
}

const stubs = {
  '@supabase/supabase-js': { createClient: () => client },
  'next/server': { ...next, after: cb => scheduled.push(cb) },
  'lib/server/alostaz-fabric-invoice': {
    async sendFabricIncomeToAlostaz() { record('invoice'); return { kind: 'sent', invoice_code: 'LOCAL' } },
  },
  'lib/server/fabric-store/payments': {
    async startPayment() {
      record('newPayment')
      return { ok: true, checkoutUrl: 'https://checkout.example.invalid/local', attemptId: ATTEMPT }
    },
    async handleMoyasarWebhook(deps) {
      assert.equal(deps.config.environment, 'live')
      assert(deps.config.webhookSecret)
      record('webhook')
      await deps.onPaid(ORDER)
      return { httpStatus: 200, body: { ok: true }, outcome: 'paid' }
    },
    async viewPaymentForReturn() {
      record('return')
      return { status: 'ok', order_number: 'FS-LOCAL', total_halalas: 11500,
        payment_status: 'paid', fulfillment_status: 'unfulfilled', needs_review: false,
        hold_expires_at: null, attempt: { status: 'paid', environment: 'live', expires_at: null } }
    },
    async processPendingPaymentEvents() { record('events'); return { paid: 1 } },
    async reconcilePayments() { record('reconcile'); return { paid: 1 } },
  },
  'lib/server/fabric-store/refunds': {
    async startRefund() { record('newRefund'); return { ok: true, status: 'succeeded', refundId: ATTEMPT } },
    async processPendingRefunds(deps, limit, allowNewCalls) {
      record('pendingRefunds', { allowNewCalls }); return { succeeded: 1 }
    },
  },
  'lib/server/fabric-store/confirm': {
    alostazTaskOutcome: result => ({ outcome: 'done', note: result.invoice_code }),
    async processFabricStoreOutbox(deps) {
      record('outbox', { invoiceEnabled: !!deps.sendAlostazInvoice })
      if (deps.sendAlostazInvoice) await deps.sendAlostazInvoice('synthetic-income')
      return { confirmed: 1 }
    },
  },
}

function load(relative) {
  if (stubs[relative]) return stubs[relative]
  if (cache.has(relative)) return cache.get(relative)
  const full = path.join(SRC, relative + '.ts')
  const exports = {}
  cache.set(relative, exports)
  const { outputText } = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      esModuleInterop: true }, fileName: full,
  })
  const localRequire = name => {
    if (stubs[name]) return stubs[name]
    if (name.startsWith('@/')) return load(name.slice(2))
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), name))
    return require(name)
  }
  new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)(
    exports, localRequire, { exports }, full, path.dirname(full))
  return exports
}

function request(route, body, extraHeaders = {}) {
  return new next.NextRequest(`https://store.example.invalid${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { host: 'store.example.invalid', origin: 'https://store.example.invalid', 'content-type': 'application/json',
      'sec-fetch-site': 'same-origin', cookie: `ys_fabric_order=${'a'.repeat(64)}`, ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function verifyLaunchClients() {
  const targets = [
    ['app/fabrics/checkout/page.tsx', 'startPayment'],
    ['components/fabrics/FabricPayNowButton.tsx', 'start'],
  ]
  for (const [file, action] of targets) {
    const source = fs.readFileSync(path.join(SRC, file), 'utf8')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let declaration; let helper = ''
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === action) declaration = node.getText(ast)
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'postJson') helper = node.getText(ast)
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert(declaration, `${file}: actual payment action found`)
    const code = ts.transpileModule(`return (async () => { ${helper}; const ${declaration}; await ${action}(); })()`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText
    for (const loggedIn of [false, true]) {
      let requests = 0; let destination
      const fetch = async (url, options) => {
        requests++
        assert.equal(url, '/api/fabric-store/payment/start/')
        assert.equal(options.credentials, 'same-origin')
        assert.equal(options.headers['Content-Type'], 'application/json')
        assert.equal(options.headers.Authorization, loggedIn ? 'Bearer synthetic-client-session' : undefined)
        assert.equal(options.body, '{}')
        return new Response(JSON.stringify({ ok: true, checkoutUrl: 'https://checkout.example.invalid/local' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const noOp = () => {}
      await new Function('fetch', 'getAuthHeader', 'window', 'setPayError', 'setError', 'setIsStarting', code)(
        fetch, async () => loggedIn ? { Authorization: 'Bearer synthetic-client-session' } : {},
        { location: { assign: url => { destination = url } } }, noOp, noOp, noOp)
      assert.equal(requests, 1)
      assert.equal(destination, 'https://checkout.example.invalid/local')
    }
  }
  console.log('PASS both real payment client actions: staff session attached; public guest request unchanged')
}

async function main() {
  const previousEnv = { ...process.env }
  const previousFetch = global.fetch
  try {
    global.fetch = async () => { throw Error('External network is forbidden in this verification') }
    // Synthetic values only. Actual deployment credentials are never loaded.
    Object.assign(process.env, {
      NODE_ENV: 'production', VERCEL_ENV: 'production',
      MOYASAR_SECRET_KEY: 'sk_live_unit000', MOYASAR_WEBHOOK_SECRET: 'synthetic-webhook-token-for-unit-tests',
      FABRIC_STORE_ALLOW_LIVE_PAYMENTS: 'true', FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION: 'false',
      FABRIC_STORE_CHECKOUT_ENABLED: 'true', FABRIC_STORE_PAYMENTS_ENABLED: 'false',
      FABRIC_STORE_LAUNCH_ADMIN_ONLY: 'false',
      FABRIC_STORE_ORDERS_ENABLED: 'true', FABRIC_STORE_REFUNDS_ENABLED: 'true',
      FABRIC_STORE_RECONCILE_ENABLED: 'true', FABRIC_STORE_ALOSTAZ_ENABLED: 'false',
      NEXT_PUBLIC_FABRIC_STORE_PAYMENTS_ENABLED: 'false',
      NEXT_PUBLIC_SUPABASE_URL: 'https://local.example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', FABRIC_STORE_ACCESS_SECRET: 'synthetic-access-token-for-unit-tests',
      CRON_SECRET: LOCAL_CRON,
    })
    delete process.env.MOYASAR_API_BASE
    await verifyLaunchClients()

    const { getMoyasarConfig: cfg } = load('lib/server/fabric-store/moyasar')
    const live = { MOYASAR_SECRET_KEY: 'sk_live_unit000', VERCEL_ENV: 'production' }
    const test = { MOYASAR_SECRET_KEY: 'sk_test_unit000', VERCEL_ENV: 'production' }
    assert.equal(cfg({}).ok, false)
    assert.equal(cfg({ MOYASAR_SECRET_KEY: 'pk_live_unit000' }).ok, false)
    assert.equal(cfg(live).reason, 'live-disabled')
    assert.equal(cfg({ ...live, FABRIC_STORE_ALLOW_LIVE_PAYMENTS: 'true' }).config.environment, 'live')
    assert.equal(cfg(test).reason, 'test-on-production')
    assert.equal(cfg({ ...test, FABRIC_STORE_ALLOW_LIVE_PAYMENTS: 'true' }).reason, 'test-on-production')
    assert.equal(cfg({ ...test, FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION: 'true' }).config.environment, 'test')
    assert.equal(cfg({ ...test, VERCEL_ENV: 'preview' }).config.environment, 'test')
    assert.equal(cfg({ ...live, FABRIC_STORE_ALLOW_LIVE_PAYMENTS: 'true', MOYASAR_API_BASE: 'http://127.0.0.1:9/v1' }).reason, 'bad-api-base')
    assert.equal(cfg({ ...test, VERCEL_ENV: 'preview', NODE_ENV: 'production', MOYASAR_API_BASE: 'http://127.0.0.1:9/v1' }).reason, 'bad-api-base')
    assert.equal(cfg({ ...test, VERCEL_ENV: 'preview', MOYASAR_API_BASE: 'https://outside.example.invalid' }).reason, 'bad-api-base')
    assert.equal(cfg({ ...test, VERCEL_ENV: 'preview', MOYASAR_WEBHOOK_SECRET: 'short' }).config.webhookSecret, null)
    console.log('PASS 12 live/test configuration checks; no provider requests')

    const start = load('app/api/fabric-store/payment/start/route')
    const hook = load('app/api/payments/moyasar/webhook/route')
    const status = load('app/api/fabric-store/payment/status/route')
    const jobs = load('app/api/fabric-store/jobs/run/route')
    const events = load('app/api/fabric-store/jobs/payment-events/route')
    const staff = load('app/api/fabric-store/staff/orders/[id]/route')
    const refundRequest = () => request(`/api/fabric-store/staff/orders/${ORDER}/`,
      { action: 'refund', amountHalalas: 1000, reason: 'Local test', cancel: false, key: ATTEMPT },
      { authorization: 'Bearer synthetic-staff-session' })

    assert.equal((await start.POST(request('/api/fabric-store/payment/start/', {}))).status, 404)
    assert.equal(count('newPayment'), 0, 'off blocks a stale UI calling the start endpoint directly')
    process.env.FABRIC_STORE_PAYMENTS_ENABLED = 'true'
    assert.equal((await start.POST(request('/api/fabric-store/payment/start/', {}))).status, 200)
    assert.equal(count('newPayment'), 1)
    process.env.FABRIC_STORE_LAUNCH_ADMIN_ONLY = 'true'
    const privateRequest = () => request('/api/fabric-store/payment/start/', {}, { authorization: 'Bearer synthetic-staff-session' })
    assert.equal((await start.POST(request('/api/fabric-store/payment/start/', {}))).status, 401)
    staffTokenValid = false
    assert.equal((await start.POST(privateRequest())).status, 401)
    staffTokenValid = true; staffActive = false
    assert.equal((await start.POST(privateRequest())).status, 403)
    staffActive = true; staffRole = 'worker'
    assert.equal((await start.POST(privateRequest())).status, 403)
    staffRole = 'customer'
    assert.equal((await start.POST(privateRequest())).status, 403)
    assert.equal(count('newPayment'), 1, 'private launch refusals never create or retrieve a provider URL')
    staffRole = 'admin'
    assert.equal((await start.POST(privateRequest())).status, 200)
    assert.equal(count('newPayment'), 2)
    console.log('PASS private launch: guests, invalid sessions, stopped admin, worker and customer denied; active admin allowed')
    process.env.FABRIC_STORE_PAYMENTS_ENABLED = 'false'
    assert.equal((await start.POST(request('/api/fabric-store/payment/start/', {}))).status, 404)
    assert.equal(count('newPayment'), 2, 'off prevents starting/retrieving a new payment URL')

    assert.equal((await hook.POST(request('/api/payments/moyasar/webhook/', { id: 'synthetic-event' }))).status, 200)
    assert.equal(count('webhook'), 1)
    assert.equal(count('outbox'), 1, 'existing payment reaches the sale-confirmation queue after switch-off')
    assert.equal(scheduled.length, 0, 'Alostaz off remains independent')
    const returned = await status.GET(request(`/api/fabric-store/payment/status/?attempt=${ATTEMPT}`))
    assert.equal(returned.status, 200)
    assert.equal((await returned.json()).paymentStatus, 'paid')
    assert.equal(count('return'), 1)
    assert.equal((await events.GET(request('/api/fabric-store/jobs/payment-events/', undefined,
      { authorization: `Bearer ${LOCAL_CRON}` }))).status, 200)
    assert.equal((await jobs.GET(request('/api/fabric-store/jobs/run/'))).status, 401)
    const ran = await jobs.GET(request('/api/fabric-store/jobs/run/', undefined,
      { authorization: `Bearer ${LOCAL_CRON}` }))
    assert.equal(ran.status, 200)
    assert.equal(count('reconcile'), 1)
    assert.equal(count('pendingRefunds'), 1)
    assert.equal(calls.find(c => c.name === 'pendingRefunds').allowNewCalls, true)
    assert.equal(count('outbox'), 2)
    assert.equal(count('addressJob'), 1)
    assert.equal((await staff.POST(refundRequest(), { params: Promise.resolve({ id: ORDER }) })).status, 200)
    assert.equal(count('newRefund'), 1)
    staffRole = 'worker'
    assert.equal((await staff.POST(refundRequest(), { params: Promise.resolve({ id: ORDER }) })).status, 403)
    assert.equal(count('newRefund'), 1)
    staffRole = 'admin'
    console.log('PASS actual routes: payment start stops; webhook, return, events, reconciliation, outbox and admin refund continue')

    // Owner's chosen rollout: refunds off, invoices on; neither follows the payment switch.
    process.env.FABRIC_STORE_REFUNDS_ENABLED = 'false'
    process.env.FABRIC_STORE_ALOSTAZ_ENABLED = 'true'
    const ranWithOwnerFlags = await jobs.GET(request('/api/fabric-store/jobs/run/', undefined,
      { authorization: `Bearer ${LOCAL_CRON}` }))
    assert.equal(ranWithOwnerFlags.status, 200)
    assert.equal(calls.filter(c => c.name === 'pendingRefunds').at(-1).allowNewCalls, false)
    assert.equal(count('invoice'), 1)
    assert.equal((await staff.POST(refundRequest(), { params: Promise.resolve({ id: ORDER }) })).status, 404)
    assert.equal(count('newRefund'), 1)
    process.env.FABRIC_STORE_RECONCILE_ENABLED = 'false'
    await jobs.GET(request('/api/fabric-store/jobs/run/', undefined, { authorization: `Bearer ${LOCAL_CRON}` }))
    assert.equal(count('reconcile'), 2, 'reconciliation has its own switch')
    assert.equal(load('lib/fabric-store/checkout-contract').IS_FABRIC_STORE_PAYMENTS_ENABLED, false)
    console.log('PASS independent flags: refunds off still polls pending; Alostaz on still drains invoices; reconciliation independent')

    // Removing live permission is NOT the emergency switch: it stops existing-payment verification.
    process.env.FABRIC_STORE_ALLOW_LIVE_PAYMENTS = 'false'
    assert.equal((await hook.POST(request('/api/payments/moyasar/webhook/', {}))).status, 503)
    assert.equal((await status.GET(request(`/api/fabric-store/payment/status/?attempt=${ATTEMPT}`))).status, 503)
    assert.equal(count('webhook'), 1)
    assert.equal(count('return'), 1)
    console.log('PASS removing live permission blocks existing-payment verification; runbook must preserve it')
  } finally {
    process.env = previousEnv
    global.fetch = previousFetch
  }
}
main().catch(error => { console.error(`FAIL ${error.stack}`); process.exit(1) })
