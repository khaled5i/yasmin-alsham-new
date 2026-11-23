// الشحن المجاني لكل الطلبات ولكل الدول (قرار المالكة 19 نوفمبر 2026): رسم الشحن صفر
// دائماً، والإجمالي = الأقمشة؛ وعنوان دولي وجوال برمز الدولة مقبولان.
// يعمل بلا شبكة وبلا Supabase. التشغيل: node scripts/verify-fabric-free-shipping.cjs
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src')
const cache = new Map()

// نفس المُحمّل الصغير في verify-fabric-store-pricing.cjs.
function load(fileFromSrc) {
  const full = path.join(SRC, fileFromSrc + '.ts')
  if (cache.has(full)) return cache.get(full)

  const source = readFileSync(full, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: full,
  })

  const moduleExports = {}
  cache.set(full, moduleExports)

  const localRequire = specifier => {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return load(path.posix.join(path.posix.dirname(fileFromSrc), specifier))
    }
    if (specifier.startsWith('@/')) return load(specifier.slice(2))
    return require(specifier)
  }

  new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)(
    moduleExports,
    localRequire,
    { exports: moduleExports },
    full,
    path.dirname(full)
  )
  return moduleExports
}

const contract = load('lib/fabric-store/checkout-contract')
const { priceCart } = load('lib/server/fabric-store/quote-service')

/** صف لقطة قماش يُباع بالمتر؛ السعر قبل الضريبة. */
const row = (id, pricePerMeter) => ({
  fabric_id: id,
  name: null,
  fabric_code: id,
  price_per_meter: pricePerMeter,
  is_on_sale: false,
  discount_percentage: 0,
  min_order_meters: 1,
  deleted_at: null,
  is_active: true,
  is_available: true,
  is_manually_hidden: false,
  inventory_item_id: 'inv-' + id,
  inventory_color_id: null,
  inventory_unit: 'meter',
  physical_quantity: 20,
  color_required: false,
  reserved_cm: 0,
})

const rows = new Map([['a', row('a', 100)], ['b', row('b', 200)]])
const priceMeters = (fabricId, meters, method) =>
  priceCart(rows, [{ fabricId, purchaseMode: 'meter', quantity: meters }], method)

// قرار المالكة 19 نوفمبر 2026: الشحن مجاني لكل الطلبات ولكل الدول (قبله 50 ريالاً ومجاني فوق 1000).
for (const [fabricId, meters] of [['a', 1], ['a', 8], ['b', 5]]) {
  const { quote, order } = priceMeters(fabricId, meters, 'shipping')
  assert.equal(order.delivery.method, 'shipping')
  assert.equal(order.delivery.code, 'free_worldwide')
  assert.match(order.delivery.code, /^[a-z0-9_]{1,40}$/) // قيد القاعدة على delivery_option_code
  assert.equal(order.shippingNetHalalas, 0)
  assert.equal(order.shippingVatHalalas, 0)
  assert.equal(quote.totals.shippingGrossHalalas, 0)
  assert.equal(order.totalHalalas, order.itemsNetHalalas + order.vatHalalas)
  assert.equal(order.vatHalalas, Math.floor((order.itemsNetHalalas * 1500 + 5000) / 10000))
  assert.equal(order.items.reduce((sum, item) => sum + item.vat_halalas, 0), order.vatHalalas)
  for (const option of quote.deliveryOptions) assert.equal(option.shippingGrossHalalas, 0)
}
{
  const { order } = priceMeters('b', 5, 'pickup')
  assert.equal(order.delivery.code, 'shop_pickup')
  assert.equal(order.shippingNetHalalas, 0)
}

// الجوال: الصيغ السعودية كما كانت، والدولية برمز الدولة.
assert.equal(contract.normalizeCustomerPhone('0551234567'), '+966551234567')
assert.equal(contract.normalizeCustomerPhone('+971 50 123 4567'), '+971501234567')
assert.equal(contract.normalizeCustomerPhone('0044 7700 900123'), '+447700900123')
assert.equal(contract.normalizeCustomerPhone('+966 13 812 3456'), null) // أرضي سعودي
assert.equal(contract.normalizeCustomerPhone('12345'), null)

// العنوان: السعودية بقواعد العنوان الوطني، وبقية الدول بسطر عنوان ورمز بريدي حر.
const base = { recipientName: 'سارة', recipientPhone: '+971501234567', city: 'دبي' }
{
  const parsed = contract.fabricAddressSchema.safeParse({ ...base, countryCode: 'ae', street: 'Marina, Bldg 4, Apt 12', postalCode: '', shortAddress: 'RRRD2929', buildingNumber: '2929' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.data.countryCode, 'AE')
  assert.equal(parsed.data.shortAddress, null)
  assert.equal(parsed.data.buildingNumber, null)
}
{
  const parsed = contract.fabricAddressSchema.safeParse({ ...base, countryCode: 'GB', street: '10 Downing St', postalCode: 'sw1a 2aa' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.data.postalCode, 'SW1A 2AA')
}
assert.equal(contract.fabricAddressSchema.safeParse({ ...base, countryCode: 'AE' }).success, false) // بلا عنوان
assert.equal(contract.fabricAddressSchema.safeParse({ ...base, countryCode: 'IL', street: 'x st' }).success, false)
assert.equal(contract.fabricAddressSchema.safeParse({ ...base, countryCode: 'ZZ', street: 'x st' }).success, false)
{
  const sa = { recipientName: 'سارة', recipientPhone: '0551234567', city: 'الخبر' }
  const ok = contract.fabricAddressSchema.safeParse({ ...sa, shortAddress: 'RRRD2929' })
  assert.equal(ok.success, true)
  assert.equal(ok.data.countryCode, 'SA') // غياب الدولة = السعودية
  assert.equal(contract.fabricAddressSchema.safeParse({ ...sa, countryCode: 'SA', street: 'x' }).success, false)
  assert.equal(contract.fabricAddressSchema.safeParse({ ...sa, countryCode: 'SA', shortAddress: 'RRRD2929', postalCode: 'AB12' }).success, false)
}

console.log('OK: free worldwide shipping')
