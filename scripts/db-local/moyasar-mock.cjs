// A local stand-in for the three Moyasar endpoints stage 5 uses, shaped after the
// official docs (24 Sep 2026): POST /v1/invoices, GET /v1/invoices/:id,
// GET /v1/payments/:id, HTTP Basic auth with the secret key as the username.
// It is NOT Moyasar: real test keys must still confirm the shapes (stage 5 report §7).
//
// Test hooks (plain functions, not HTTP):
//   pay(invoiceId, status)      → a payment on the invoice, as the hosted page would make
//   webhook(payment, options)   → the raw webhook body Moyasar would POST
//   failNext(mode)              → the next invoice creation: '500' | '422' | 'timeout' | 'bad-url' | 'wrong-amount'
//   down(true|false)            → every GET answers 503
const http = require('node:http')
const crypto = require('node:crypto')

function startMoyasarMock({ secretKey = 'sk_test_mockkey123' } = {}) {
  const invoices = new Map()
  const payments = new Map()
  const log = []
  let failMode = null
  let isDown = false
  const expectedAuth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`
  const safeParse = text => { try { return JSON.parse(text) } catch { return {} } }
  function createInvoice(input, mode) {
    const id = crypto.randomUUID()
    const invoice = {
      id,
      status: 'initiated',
      amount: mode === 'wrong-amount' ? input.amount + 1 : input.amount,
      currency: input.currency,
      description: input.description,
      url: mode === 'bad-url' ? `https://evil.example/pay/${id}` : `https://checkout.moyasar.com/mock/${id}`,
      expired_at: input.expired_at ?? null,
      success_url: input.success_url ?? null,
      back_url: input.back_url ?? null,
      metadata: input.metadata ?? null,
      payments: [],
    }
    invoices.set(id, invoice)
    return invoice
  }

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      log.push({ method: req.method, url: req.url })
      const send = (status, json) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(json))
      }
      if (req.headers.authorization !== expectedAuth) {
        return send(401, { type: 'authentication_error', message: 'Invalid authorization credentials' })
      }
      const invoiceMatch = /^\/v1\/invoices\/([^/?]+)$/.exec(req.url)
      const paymentMatch = /^\/v1\/payments\/([^/?]+)$/.exec(req.url)

      if (req.method === 'POST' && req.url === '/v1/invoices') {
        const mode = failMode
        failMode = null
        // 'timeout': answer only after 12 s — after the client's 7 s limit. A client with
        // no limit would receive this success, so the timeout itself is under test.
        if (mode === 'timeout') {
          const timer = setTimeout(() => { if (!res.destroyed) send(201, createInvoice(safeParse(body))) }, 12_000)
          res.on('close', () => clearTimeout(timer))
          return
        }
        if (mode === '500') return send(500, { type: 'api_error', message: 'boom' })
        if (mode === '422') return send(400, { type: 'invalid_request_error', message: 'amount is invalid' })
        const input = safeParse(body)
        if (!Number.isInteger(input.amount) || input.amount < 100 || input.currency !== 'SAR' || !input.description) {
          return send(400, { type: 'invalid_request_error', message: 'validation failed' })
        }
        return send(201, createInvoice(input, mode))
      }
      if (isDown && req.method === 'GET') return send(503, { message: 'maintenance' })
      if (req.method === 'GET' && invoiceMatch) {
        const invoice = invoices.get(decodeURIComponent(invoiceMatch[1]))
        return invoice ? send(200, invoice) : send(404, { message: 'Object not found' })
      }
      if (req.method === 'GET' && paymentMatch) {
        const payment = payments.get(decodeURIComponent(paymentMatch[1]))
        return payment ? send(200, payment) : send(404, { message: 'Object not found' })
      }
      return send(404, { message: 'no route' })
    })
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`
      resolve({
        base,
        secretKey,
        invoices,
        payments,
        log,
        failNext(mode) { failMode = mode },
        down(value) { isDown = value },
        pay(invoiceId, status = 'paid', overrides = {}) {
          const invoice = invoices.get(invoiceId)
          if (!invoice) throw new Error(`mock: no invoice ${invoiceId}`)
          const payment = {
            id: `pay_${crypto.randomBytes(8).toString('hex')}`,
            status,
            amount: invoice.amount,
            fee: 0,
            currency: 'SAR',
            refunded: 0,
            captured: status === 'paid' ? invoice.amount : 0,
            description: invoice.description,
            invoice_id: invoice.id,
            created_at: new Date().toISOString(),
            source: {
              type: 'creditcard', company: 'mada', name: 'Card Holder', number: '4111-11XX-XXXX-1111',
              gateway_id: 'gw_secret_ref', reference_number: '123456',
              message: status === 'paid' ? 'APPROVED' : 'INSUFFICIENT FUNDS',
            },
            ...overrides,
          }
          payments.set(payment.id, payment)
          invoice.payments.push(payment)
          if (status === 'paid') invoice.status = 'paid'
          return payment
        },
        webhook(payment, { type, live = false, secret, id = `evt_${crypto.randomBytes(6).toString('hex')}`, data } = {}) {
          return JSON.stringify({
            id,
            type: type || (payment.status === 'failed' ? 'payment_faild' : `payment_${payment.status}`),
            created_at: new Date().toISOString(),
            secret_token: secret,
            account_name: 'mock',
            live,
            data: data || payment,
          })
        },
        close() { return new Promise(done => server.close(() => done())) },
      })
    })
  })
}

module.exports = { startMoyasarMock }
