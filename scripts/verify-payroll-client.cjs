// Focused client-model tests with a mocked order service; no network or financial writes.
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, require: id => { if (id in mocks) return mocks[id]; throw new Error(`Unexpected dependency: ${id}`) }, Intl, Date, Math, Number, Map, Promise, setTimeout, clearTimeout })
  return exports
}
async function main() {
  const model = load('src/lib/payroll-display.ts')
  assert.equal(model.pieceworkAmount(0, 50), 0)
  assert.equal(model.pieceworkAmount(100, 25), 125)
  assert.equal(model.pieceworkAmount(null, 25), 0)
  assert.equal(model.shiftPayrollMonth('2026-12', 1), '2027-01')
  assert.equal(model.shiftPayrollMonth('2026-01', -1), '2025-12')
  assert.equal(model.payrollMonth(new Date('2026-08-31T22:30:00Z')), '2026-09')
  assert(!model.payrollMoney(100.75, false).includes('.'))
  assert(model.payrollMoney(0.4, false).includes('less than 1'))
  const amounts = model.payrollAmounts({ net_due: 1000, total_paid: 400, remaining_due: 600 }, [
    { operation_type: 'payment', amount: 300, metadata: {} },
    { operation_type: 'payment', amount: 100, metadata: { debt_settlement: true } },
    { operation_type: 'deduction', amount: 50, metadata: {} },
  ])
  assert.equal(amounts.remaining, 600)
  assert.equal(amounts.cashOut, 350)
  assert.equal(amounts.settledDebt, 100)
  let release
  const barrier = new Promise(resolve => { release = resolve })
  const calls = []
  const service = { orderService: { update: async (id, update) => {
    calls.push(update.worker_price)
    if (calls.length === 1) await barrier
    return { data: { id }, error: null }
  } } }
  const queue = load('src/lib/services/order-pricing-save-queue.ts', { './order-service': service })
  const first = queue.saveOrderPricing('fixture', { worker_price: 100 })
  await new Promise(resolve => setImmediate(resolve))
  const middle = queue.saveOrderPricing('fixture', { worker_price: 200 })
  const last = queue.saveOrderPricing('fixture', { worker_price: 300 })
  release()
  await Promise.all([first, middle, last])
  assert.deepEqual(calls, [100, 300], 'Pending writes coalesce and the newest price wins')
  service.orderService.update = async () => ({ data: null, error: 'fixture failure' })
  await assert.rejects(queue.saveOrderPricing('fixture', { worker_price: 400 }), /fixture failure/)
  service.orderService.update = async id => ({ data: { id }, error: null })
  await queue.saveOrderPricing('fixture', { worker_price: 500 })
  console.log('PASS: whole-riyal display, small balances, month boundaries, salary/cash/debt separation, ordered pricing saves and error/retry behavior.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
