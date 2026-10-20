// الشحن المجاني فوق 1000 ريال (قرار المالكة 20 أكتوبر 2026): تسعير الخادم يختار
// رسم الشحن من مجموع الأقمشة شاملة الضريبة، ويبقى الإجمالي = الأقمشة + الشحن.
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

const THRESHOLD = contract.FABRIC_STORE_FREE_SHIPPING_MIN_ITEMS_GROSS_HALALAS
assert.equal(THRESHOLD, 100_000)

// تحت العتبة: 8 م × 100 = 800 صافي ⇒ 920 شامل ⇒ الشحن 50 كما كان.
{
  const { quote, order } = priceMeters('a', 8, 'shipping')
  assert.equal(order.delivery.code, 'ksa_flat')
  assert.equal(quote.totals.shippingGrossHalalas, 5_000)
  assert.equal(quote.totals.totalHalalas, 92_000 + 5_000)
  assert.equal(order.shippingNetHalalas + order.shippingVatHalalas, 5_000)
  const shipping = quote.deliveryOptions.find(option => option.method === 'shipping')
  assert.equal(shipping.shippingGrossHalalas, 5_000)
}

// عند العتبة تماماً: 1000 ريال شاملة ⇒ مجاني. 869.57 صافي لا يُنتج 1000.00 بالضبط،
// فنختبر الحدّ بالدالة مباشرة، ثم بسلة حقيقية فوقه.
assert.equal(contract.resolveFabricDeliveryOption('shipping', THRESHOLD).shippingGrossHalalas, 0)
assert.equal(contract.resolveFabricDeliveryOption('shipping', THRESHOLD - 1).shippingGrossHalalas, 5_000)
assert.equal(contract.resolveFabricDeliveryOption('pickup', THRESHOLD - 1).shippingGrossHalalas, 0)

// فوقها: 5 م × 200 = 1000 صافي ⇒ 1150 شامل ⇒ الشحن صفر، والإجمالي = الأقمشة فقط.
{
  const { quote, order } = priceMeters('b', 5, 'shipping')
  assert.equal(order.delivery.method, 'shipping')
  assert.equal(order.delivery.code, 'ksa_free')
  assert.match(order.delivery.code, /^[a-z0-9_]{1,40}$/) // قيد القاعدة على delivery_option_code
  assert.equal(order.shippingNetHalalas, 0)
  assert.equal(order.shippingVatHalalas, 0)
  assert.equal(quote.totals.shippingGrossHalalas, 0)
  assert.equal(quote.totals.totalHalalas, 115_000)
  assert.equal(order.totalHalalas, order.itemsNetHalalas + order.vatHalalas)
  // قيد القاعدة: الضريبة = (البنود + الشحن) × 15% مقرّبة نصفاً للأعلى.
  assert.equal(order.vatHalalas, Math.floor((order.itemsNetHalalas * 1500 + 5000) / 10000))
  assert.equal(order.items.reduce((sum, item) => sum + item.vat_halalas, 0), order.vatHalalas)
}

// الاستلام من المحل لا يتغير أبداً.
{
  const { order } = priceMeters('b', 5, 'pickup')
  assert.equal(order.delivery.code, 'shop_pickup')
  assert.equal(order.shippingNetHalalas, 0)
}

// سطر مرفوض لا يُحتسب في العتبة: القماش السليم وحده (920) تحت 1000.
{
  const { quote } = priceCart(rows, [
    { fabricId: 'a', purchaseMode: 'meter', quantity: 8 },
    { fabricId: 'missing', purchaseMode: 'meter', quantity: 50 },
  ], 'shipping')
  assert.equal(quote.canCheckout, false)
  assert.equal(quote.totals.shippingGrossHalalas, 5_000)
}

console.log('OK: free shipping over 1000 SAR')
