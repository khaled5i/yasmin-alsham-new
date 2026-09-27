// اختبارات عقد المال والتسعير للمتجر الإلكتروني (المرحلة 1 من خطة الدفع).
// تعمل بلا شبكة وبلا Supabase: تُحمّل الوحدات النقية فقط بعد ترجمتها بـtypescript.
// التشغيل: node scripts/verify-fabric-store-pricing.cjs
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src')
const cache = new Map()

// نفس المُحمّل الصغير في verify-fabric-cart-pricing.cjs: يترجم ملفات .ts النقية
// ويحل الاستيراد النسبي بينها، ويترك حزم node_modules (zod) لـrequire الحقيقي.
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

const money = load('lib/fabric-store/money')
const pricing = load('lib/fabric-store/pricing')
const commerce = load('lib/fabric-commerce')

/** قماش افتراضي مرئي للبيع؛ الاختبارات تعدّل ما يعنيها فقط. */
const fabric = (overrides = {}) => ({
  id: 'fabric-1',
  name: 'قماش اختبار',
  fabric_code: 'SS-0001',
  available_colors: ['وردي'],
  images: [],
  price_per_meter: 100,
  is_on_sale: false,
  discount_percentage: 0,
  stock_quantity: 10,
  min_order_meters: 1,
  is_available: true,
  is_active: true,
  is_manually_hidden: false,
  deleted_at: null,
  ...overrides,
})

const cartLine = (overrides = {}) => ({
  fabricId: 'fabric-1',
  purchaseMode: 'meter',
  quantity: 1,
  addedAt: '2026-09-21T00:00:00.000Z',
  snapshot: { label: 'قماش اختبار', fabricCode: 'SS-0001', color: 'وردي', image: null, unitPrice: null },
  ...overrides,
})

const rejectionOf = (result) => (result.ok ? 'ok' : result.reason)

// ============================================
// 1) التحويل إلى أعداد صحيحة بلا ضجيج الفاصلة العائمة
// ============================================
assert.equal(money.toScaledInteger(33.33, 2), 3333, '33.33 مخزّن ثنائياً 33.3299… ويجب أن يصير 3333 لا 3332')
assert.equal(money.toScaledInteger(1.005, 2), 101, 'التقريب على الرقم العشري المكتوب لا على تمثيله الثنائي')
assert.equal(money.toScaledInteger('12.345', 2), 1235, 'نصف للأعلى')
assert.equal(money.toScaledInteger(0.1 + 0.2, 2), 30)
assert.equal(money.toScaledInteger(-2.5, 0), -3, 'بعيداً عن الصفر للسالب')
assert.equal(money.toScaledInteger(-0.001, 2), 0, 'لا صفر سالب')
assert.ok(Object.is(money.toScaledInteger(-0.001, 2), 0))
for (const bad of [NaN, Infinity, -Infinity, null, undefined, '', '   ', 'abc', 1e13, '0x10', '1e3', 'Infinity', '12.', '.5']) {
  assert.equal(money.toScaledInteger(bad, 2), null, `قيمة غير صالحة تُرفض: ${String(bad)}`)
}
assert.equal(money.toScaledInteger(' 12.5 ', 2), 1250, 'النص العشري العادي يُقبل')
assert.equal(money.toScaledInteger('-0.5', 2), -50)

assert.equal(money.toScaledIntegerStrict(2.5, 2), 250)
assert.equal(money.toScaledIntegerStrict(0.1 + 0.2, 2), 30, 'ضجيج التمثيل الثنائي ليس خانة عشرية حقيقية')
assert.equal(money.toScaledIntegerStrict(2.504, 2), null, 'الخانة الثالثة تُرفض ولا تُقرَّب بصمت')
assert.equal(money.sarToHalalas(350), 35000)
assert.equal(money.halalasToSar(97750), 977.5)
assert.equal(money.metersToCentimeters(3.5), 350)
assert.equal(money.centimetersToMeters(250), 2.5)

// ============================================
// 2) القسمة الصحيحة مع التقريب
// ============================================
assert.equal(money.divideRoundHalfUp(5, 2), 3)
assert.equal(money.divideRoundHalfUp(4, 2), 2)
assert.equal(money.divideRoundHalfUp(1, 3), 0)
assert.equal(money.divideRoundHalfUp(2, 3), 1)
assert.equal(money.divideRoundHalfUp(-5, 2), -3)
assert.equal(money.divideRoundHalfUp(0, 7), 0)
assert.throws(() => money.divideRoundHalfUp(1, 0), RangeError)
assert.throws(() => money.divideRoundHalfUp(1.5, 2), RangeError, 'لا كسور في الحساب الصحيح')
assert.throws(() => money.multiplyExact(Number.MAX_SAFE_INTEGER, 2), RangeError, 'فقد الدقة يُرفض لا يُبتلع')

// خاصية: الناتج متسق مع القسمة الحقيقية حتى قرب حد الدقة
for (const [numerator, denominator] of [
  [Number.MAX_SAFE_INTEGER, 3],
  [Number.MAX_SAFE_INTEGER, 7],
  [Number.MAX_SAFE_INTEGER - 1, 10000],
  [123456789012345, 100],
]) {
  const rounded = money.divideRoundHalfUp(numerator, denominator)
  const remainderTimesTwo = (BigInt(numerator) - BigInt(rounded) * BigInt(denominator)) * 2n
  assert.ok(
    remainderTimesTwo < BigInt(denominator) && remainderTimesTwo >= -BigInt(denominator),
    `القسمة صحيحة للقيم الكبيرة: ${numerator} / ${denominator}`
  )
}

// ============================================
// 3) توزيع مبلغ بالباقي الأكبر
// ============================================
assert.deepEqual(money.allocateByWeights(500, [1111, 1111, 1111]), [167, 167, 166])
assert.deepEqual(money.allocateByWeights(10, [1, 1, 1]), [4, 3, 3], 'الهللة الزائدة للبند الأسبق')
assert.deepEqual(money.allocateByWeights(7, [0, 3]), [0, 7], 'الوزن الصفري لا يأخذ شيئاً')
assert.deepEqual(money.allocateByWeights(0, [5, 0]), [0, 0])
assert.deepEqual(money.allocateByWeights(0, []), [])
assert.throws(() => money.allocateByWeights(5, [0, 0]), RangeError)
assert.throws(() => money.allocateByWeights(-1, [1]), RangeError)
assert.throws(() => money.allocateByWeights(5, [1, -1]), RangeError)
for (const [total, weights] of [
  [12750, [50000, 35000]],
  [1, [3, 3, 3]],
  [99999, [1, 2, 3, 4, 5, 6, 7]],
]) {
  const shares = money.allocateByWeights(total, weights)
  assert.equal(shares.reduce((a, b) => a + b, 0), total, 'مجموع الحصص = المبلغ بالضبط')
}

// ============================================
// 4) سعر الوحدة بالهللة
// ============================================
assert.equal(pricing.getFabricUnitPriceHalalas(fabric()), 10000, 'متر بـ100 ريال')
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ stock_quantity: 3.5 })), 35000, 'قطعة 3.5م = 350 لا 350 × 3.5')
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ stock_quantity: 3, price_per_meter: 200 })), 60000)
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: '100' })), 10000)

// الخصم مرة واحدة ومن القاعدة الوحيدة لتفعيله
const onSale = { is_on_sale: true, discount_percentage: 25 }
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: 200, ...onSale })), 15000)
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: 200, stock_quantity: 3, ...onSale })), 45000)
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ is_on_sale: false, discount_percentage: 25 })), 10000)
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ is_on_sale: true, discount_percentage: 0 })), 10000)

// أنصاف الهللات: تقريب واحد في النهاية، نصف للأعلى
const odd = { price_per_meter: 33.33, is_on_sale: true, discount_percentage: 15 }
assert.equal(pricing.getFabricUnitPriceHalalas(fabric(odd)), 2833, '3333 × 0.85 = 2833.05 ⇒ 2833')
assert.equal(
  pricing.getFabricUnitPriceHalalas(fabric({ ...odd, stock_quantity: 3.5 })),
  9916,
  'القطعة: 3333 × 0.85 × 3.5 = 9915.675 ⇒ 9916 بتقريب واحد لا تقريبين'
)
assert.equal(
  pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: 99.99, is_on_sale: true, discount_percentage: 12.5 })),
  8749,
  '9999 × 0.875 = 8749.125 ⇒ 8749'
)
// مثال يفرّق بين التقريب مرة والتقريب مرتين: سعر المتر بعد الخصم 8998.2 هللة.
// مرة واحدة: 8998.2 × 3 = 26994.6 ⇒ 26995. مرتين: 8998 × 3 = 26994 (خطأ).
assert.equal(
  pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: 99.98, is_on_sale: true, discount_percentage: 10, stock_quantity: 3 })),
  26995,
  'سعر القطعة يُقرَّب مرة واحدة في النهاية، لا بعد الخصم ثم بعد الضرب'
)
assert.equal(
  pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: 99.98, is_on_sale: true, discount_percentage: 10 })),
  8998,
  'بالمتر: سعر المتر بعد الخصم يُقرَّب لأقرب هللة'
)

// ما لا يُشترى تلقائياً
for (const [label, overrides] of [
  ['السعر عند الطلب', { price_per_meter: null }],
  ['الصفر', { price_per_meter: 0 }],
  ['السالب', { price_per_meter: -5 }],
  ['نص غير رقمي', { price_per_meter: 'abc' }],
  ['خصم 100%', { is_on_sale: true, discount_percentage: 100 }],
  ['خصم أكبر من 100%', { is_on_sale: true, discount_percentage: 150 }],
  ['فوق حد الأمان (خطأ إدخال)', { price_per_meter: 1_000_000.01 }],
  ['سعر مقرَّب إلى صفر هللة', { price_per_meter: 0.01, is_on_sale: true, discount_percentage: 99 }],
]) {
  assert.equal(pricing.getFabricUnitPriceHalalas(fabric(overrides)), null, label)
}
assert.equal(pricing.getFabricUnitPriceHalalas(fabric({ price_per_meter: 1_000_000 })), 100_000_000, 'حد الأمان نفسه مقبول')

// قيم عبثية في البيانات لا تُسقط السلة: تُعرض «السعر عند الطلب» أو «نفدت» بلا استثناء.
for (const price of [1e6, 1e7, 1e9, 1e11, 1e12, 1e13, 5e15]) {
  for (const stock of [3, 3.5, 100, 1e6, 1e13]) {
    const source = fabric({ price_per_meter: price, stock_quantity: stock })
    const mode = commerce.getFabricPurchaseMode(source)
    assert.doesNotThrow(() => {
      const resolved = commerce.resolveCartLine(cartLine({ purchaseMode: mode, quantity: mode === 'piece' ? 1 : 100 }), source)
      commerce.computeCartTotals([resolved, resolved, resolved])
      commerce.getFabricQuantityBounds(source)
      pricing.priceFabricLine(source, { purchaseMode: mode, quantity: mode === 'piece' ? 1 : 100 })
    }, `لا استثناء: سعر ${price} ومخزون ${stock}`)
  }
}
// أكبر سلة ممكنة بأعلى سعر مقبول: 40 سطراً × 100 متر لا تتجاوز الحساب الآمن.
const maxLine = commerce.resolveCartLine(
  cartLine({ quantity: 100 }),
  fabric({ price_per_meter: 1_000_000, stock_quantity: 1000 })
)
assert.equal(maxLine.status, 'ok')
assert.doesNotThrow(() => commerce.computeCartTotals(Array.from({ length: 40 }, () => maxLine)))

// ============================================
// 5) حدود البيع بالمتر
// ============================================
assert.deepEqual(pricing.getFabricMeterBounds(fabric()), { minCm: 100, maxCm: 1000, stepCm: 50 })
assert.deepEqual(pricing.getFabricMeterBounds(fabric({ min_order_meters: 1.5 })).minCm, 150)
assert.deepEqual(pricing.getFabricMeterBounds(fabric({ min_order_meters: null })).minCm, 100)
assert.equal(pricing.getFabricMeterBounds(fabric(), 300).maxCm, 300, 'المحجوز يُخصم من المتاح')
assert.equal(pricing.getFabricMeterBounds(fabric(), 99999).maxCm, 1000, 'المتاح لا يتجاوز المخزون الفعلي')
assert.equal(pricing.getFabricMeterBounds(fabric(), -50).maxCm, 0)
assert.equal(pricing.getFabricMeterBounds(fabric({ stock_quantity: 250 })).maxCm, 10000, 'سقف 100 متر للسطر')

// ============================================
// 6) تسعير سطر طلب — تحقق صارم للخادم
// ============================================
const meterOk = pricing.priceFabricLine(fabric({ price_per_meter: 200 }), { purchaseMode: 'meter', quantity: 2.5 })
assert.equal(meterOk.ok, true)
assert.deepEqual(meterOk.line, {
  purchaseMode: 'meter',
  unitPriceHalalas: 20000,
  quantity: { unit: 'meter', centimeters: 250 },
  stockConsumptionCm: 250,
  netHalalas: 50000,
})

const halfHalala = pricing.priceFabricLine(fabric({ price_per_meter: 33.33 }), { purchaseMode: 'meter', quantity: 1.5 })
assert.equal(halfHalala.line.netHalalas, 5000, '3333 × 1.5 = 4999.5 ⇒ 5000')

const pieceOk = pricing.priceFabricLine(fabric({ stock_quantity: 3.5 }), { purchaseMode: 'piece', quantity: 1 })
assert.deepEqual(pieceOk.line, {
  purchaseMode: 'piece',
  unitPriceHalalas: 35000,
  quantity: { unit: 'piece', pieces: 1, pieceLengthCm: 350 },
  stockConsumptionCm: 350,
  netHalalas: 35000,
}, 'القطعة تستهلك طولها كاملاً من المخزون')

const cases = [
  ['قطعتان من قطعة واحدة', fabric({ stock_quantity: 3.5 }), { purchaseMode: 'piece', quantity: 2 }, 'invalid-quantity'],
  ['نصف قطعة', fabric({ stock_quantity: 3.5 }), { purchaseMode: 'piece', quantity: 0.5 }, 'invalid-quantity'],
  ['طلب بالمتر وصار قطعة', fabric({ stock_quantity: 3 }), { purchaseMode: 'meter', quantity: 1 }, 'mode-changed'],
  ['طلب بالقطعة وصار بالمتر', fabric({ stock_quantity: 10 }), { purchaseMode: 'piece', quantity: 1 }, 'mode-changed'],
  ['محذوف', fabric({ deleted_at: '2026-09-01T00:00:00Z' }), { purchaseMode: 'meter', quantity: 1 }, 'unavailable'],
  ['غير نشط', fabric({ is_active: false }), { purchaseMode: 'meter', quantity: 1 }, 'unavailable'],
  ['غير متاح', fabric({ is_available: false }), { purchaseMode: 'meter', quantity: 1 }, 'unavailable'],
  ['مخفي يدوياً', fabric({ is_manually_hidden: true }), { purchaseMode: 'meter', quantity: 1 }, 'unavailable'],
  ['لا مخزون', fabric({ stock_quantity: 0 }), { purchaseMode: 'meter', quantity: 1 }, 'out-of-stock'],
  ['مخزون تحت الحد الأدنى', fabric({ stock_quantity: 0.5 }), { purchaseMode: 'meter', quantity: 1 }, 'out-of-stock'],
  ['السعر عند الطلب', fabric({ price_per_meter: null }), { purchaseMode: 'meter', quantity: 1 }, 'price-on-request'],
  ['الصفر', fabric({ price_per_meter: 0 }), { purchaseMode: 'meter', quantity: 1 }, 'price-on-request'],
  ['تحت الحد الأدنى', fabric(), { purchaseMode: 'meter', quantity: 0.5 }, 'below-minimum'],
  ['خارج الخطوة', fabric(), { purchaseMode: 'meter', quantity: 1.25 }, 'off-step'],
  ['خارج الخطوة 2.3', fabric(), { purchaseMode: 'meter', quantity: 2.3 }, 'off-step'],
  ['ثلاث خانات عشرية', fabric(), { purchaseMode: 'meter', quantity: 2.504 }, 'invalid-quantity'],
  ['ليست رقماً', fabric(), { purchaseMode: 'meter', quantity: NaN }, 'invalid-quantity'],
  ['نص', fabric(), { purchaseMode: 'meter', quantity: 'abc' }, 'invalid-quantity'],
  ['سالبة', fabric(), { purchaseMode: 'meter', quantity: -1 }, 'invalid-quantity'],
  ['صفر', fabric(), { purchaseMode: 'meter', quantity: 0 }, 'invalid-quantity'],
  ['فوق سقف السطر', fabric({ stock_quantity: 150 }), { purchaseMode: 'meter', quantity: 101 }, 'invalid-quantity'],
  ['فوق المخزون', fabric({ stock_quantity: 2.2 }), { purchaseMode: 'meter', quantity: 2.5 }, 'exceeds-available'],
  ['حد أدنى 1.5 وخطوة من الحد', fabric({ min_order_meters: 1.5 }), { purchaseMode: 'meter', quantity: 1.75 }, 'off-step'],
]
for (const [label, source, request, expected] of cases) {
  assert.equal(rejectionOf(pricing.priceFabricLine(source, request)), expected, label)
}
assert.equal(rejectionOf(pricing.priceFabricLine(fabric({ stock_quantity: 2.2 }), { purchaseMode: 'meter', quantity: 2 })), 'ok')
assert.equal(rejectionOf(pricing.priceFabricLine(fabric({ min_order_meters: 1.5 }), { purchaseMode: 'meter', quantity: 2 })), 'ok')

// الرفض يحمل طريقة البيع الحالية ليعرض المتصفح الحدود الجديدة
assert.equal(pricing.priceFabricLine(fabric({ stock_quantity: 3 }), { purchaseMode: 'meter', quantity: 1 }).currentMode, 'piece')

// المتاح بعد خصم المحجوز (تمرّره المرحلة 3)
const reserved = { availableCm: 300 }
assert.equal(rejectionOf(pricing.priceFabricLine(fabric(), { purchaseMode: 'meter', quantity: 3.5 }, reserved)), 'exceeds-available')
assert.equal(rejectionOf(pricing.priceFabricLine(fabric(), { purchaseMode: 'meter', quantity: 3 }, reserved)), 'ok')
assert.equal(rejectionOf(pricing.priceFabricLine(fabric(), { purchaseMode: 'meter', quantity: 1 }, { availableCm: 0 })), 'exceeds-available')
assert.equal(
  rejectionOf(pricing.priceFabricLine(fabric({ stock_quantity: 3.5 }), { purchaseMode: 'piece', quantity: 1 }, { availableCm: 0 })),
  'exceeds-available',
  'قطعة محجوزة لزبونة أخرى لا تُباع مرتين'
)
assert.equal(
  rejectionOf(pricing.priceFabricLine(fabric(), { purchaseMode: 'meter', quantity: 10 }, { availableCm: 99999 })),
  'ok',
  'المتاح المُمرَّر لا يرفع السقف فوق المخزون الفعلي'
)
assert.equal(
  rejectionOf(pricing.priceFabricLine(fabric(), { purchaseMode: 'meter', quantity: 10.5 }, { availableCm: 99999 })),
  'exceeds-available'
)

// ============================================
// 7) إجماليات الطلب والضريبة
// ============================================
assert.deepEqual(pricing.computeFabricOrderTotals([50000, 35000]), {
  itemsNetHalalas: 85000,
  shippingNetHalalas: 0,
  taxableHalalas: 85000,
  vatHalalas: 12750,
  totalHalalas: 97750,
}, 'نفس مثال السلة: 850 + 127.5 = 977.5')

const basic = pricing.computeFabricOrderBreakdown([50000, 35000])
assert.deepEqual(basic.lineGrossHalalas, [57500, 40250])
assert.equal(basic.shippingGrossHalalas, 0)
assert.equal(basic.totalHalalas, 97750, 'التفصيل لا يغيّر الإجماليات')

const withShipping = pricing.computeFabricOrderBreakdown([10000], { shippingNetHalalas: 2500 })
assert.equal(withShipping.taxableHalalas, 12500, 'الشحن داخل وعاء الضريبة')
assert.equal(withShipping.vatHalalas, 1875)
assert.equal(withShipping.totalHalalas, 14375)
assert.deepEqual(withShipping.lineGrossHalalas, [11500])
assert.equal(withShipping.shippingGrossHalalas, 2875)

const rounding = pricing.computeFabricOrderBreakdown([1111, 1111, 1111])
assert.equal(rounding.vatHalalas, 500, '3333 × 15% = 499.95 ⇒ 500، تقريب واحد على الطلب')
assert.deepEqual(rounding.lineGrossHalalas, [1278, 1278, 1277])
assert.equal(
  rounding.lineGrossHalalas.reduce((a, b) => a + b, 0) + rounding.shippingGrossHalalas,
  rounding.totalHalalas,
  'مجموع بنود الفاتورة شاملة الضريبة = الإجمالي المدفوع بالضبط'
)

assert.deepEqual(pricing.computeFabricOrderBreakdown([]), {
  itemsNetHalalas: 0,
  shippingNetHalalas: 0,
  taxableHalalas: 0,
  vatHalalas: 0,
  totalHalalas: 0,
  lineGrossHalalas: [],
  shippingGrossHalalas: 0,
})
assert.throws(() => pricing.computeFabricOrderTotals([-1]), RangeError)
assert.throws(() => pricing.computeFabricOrderTotals([10.5]), RangeError)
assert.throws(() => pricing.computeFabricOrderTotals([100], { shippingNetHalalas: -1 }), RangeError)

// سقف الطلب الواحد: التفصيل يرفض صراحةً بدل توزيع غير دقيق؛ والإجماليات وحدها لا ترمي.
const atCap = Math.floor(pricing.FABRIC_MAX_ORDER_TOTAL_HALALAS / 1.15)
assert.doesNotThrow(() => pricing.computeFabricOrderBreakdown([atCap - 7, 7]))
const breakdownAtCap = pricing.computeFabricOrderBreakdown([atCap - 7, 7])
assert.equal(
  breakdownAtCap.lineGrossHalalas.reduce((a, b) => a + b, 0),
  breakdownAtCap.totalHalalas,
  'التوزيع دقيق حتى عند السقف'
)
assert.throws(() => pricing.computeFabricOrderBreakdown([atCap + 100]), RangeError)
assert.doesNotThrow(() => pricing.computeFabricOrderTotals([4e11]), 'أكبر سلة ممكنة لا تُسقط الإجماليات')

// ============================================
// 8) السلة والخادم يحسبان الرقم نفسه
// ============================================
// كل كمية تنتجها أداة اختيار الكمية في السلة يقبلها الخادم، وبنفس الإجمالي.
let pairs = 0
const prices = [0.01, 1, 33.33, 99.99, 100, 145.5, 250, 1999.99]
const discounts = [null, 10, 12.5, 25, 33]
const stocks = [0.5, 1, 2.2, 3, 3.5, 4, 7.25, 17.5, 150]
const minimums = [1, 1.5, null]
for (const price of prices) {
  for (const discount of discounts) {
    for (const stock of stocks) {
      for (const minimum of minimums) {
        const source = fabric({
          price_per_meter: price,
          is_on_sale: discount != null,
          discount_percentage: discount ?? 0,
          stock_quantity: stock,
          min_order_meters: minimum,
        })
        const mode = commerce.getFabricPurchaseMode(source)
        const bounds = commerce.getFabricQuantityBounds(source)
        const resolvedLines = []
        const serverNets = []
        for (let raw = 0; raw <= 20; raw += 0.25) {
          const quantity = commerce.clampFabricQuantity(raw, bounds)
          if (quantity == null) continue
          const resolved = commerce.resolveCartLine(cartLine({ purchaseMode: mode, quantity }), source)
          const server = pricing.priceFabricLine(source, { purchaseMode: mode, quantity })
          assert.equal(server.ok, resolved.isPurchasable, `قبول الخادم = قبول السلة (${price}/${stock}/${quantity})`)
          if (!server.ok) continue
          assert.equal(server.line.netHalalas, resolved.lineTotalHalalas, `نفس إجمالي السطر (${price}/${stock}/${quantity})`)
          assert.equal(resolved.lineTotal, money.halalasToSar(resolved.lineTotalHalalas))
          resolvedLines.push(resolved)
          serverNets.push(server.line.netHalalas)
          pairs += 1
        }
        if (resolvedLines.length > 0) {
          const cartTotals = commerce.computeCartTotals(resolvedLines)
          const serverTotals = pricing.computeFabricOrderTotals(serverNets)
          assert.equal(money.sarToHalalas(cartTotals.total), serverTotals.totalHalalas, 'نفس إجمالي الطلب')
          assert.equal(money.sarToHalalas(cartTotals.vat), serverTotals.vatHalalas, 'نفس الضريبة')
        }
      }
    }
  }
}
assert.ok(pairs > 5000, `مصفوفة المقارنة غطّت ${pairs} حالة`)

// ============================================
// 9) الثوابت القديمة في السلة لم تتغير قيمها
// ============================================
assert.equal(commerce.FABRIC_VAT_RATE, 0.15)
assert.equal(commerce.FABRIC_METER_STEP, 0.5)
assert.equal(commerce.FABRIC_METER_MIN_FALLBACK, 1)
assert.equal(commerce.MAX_METERS_PER_LINE, 100)
assert.equal(commerce.isFabricPubliclyVisible, pricing.isFabricPubliclyVisible, 'قاعدة الظهور واحدة')
assert.equal(commerce.getFabricPurchaseMode, pricing.getFabricPurchaseMode, 'قاعدة طريقة البيع واحدة')

console.log('PASS: التحويل إلى هللة وسنتيمتر بلا ضجيج ثنائي، القسمة والتقريب نصف للأعلى، والتوزيع بالباقي الأكبر يساوي المبلغ بالضبط.')
console.log('PASS: سعر الوحدة بالهللة (المتر والقطعة والخصم مرة واحدة وأنصاف الهللات)، وما لا يُشترى تلقائياً يُرفض.')
console.log('PASS: تحقق الخادم الصارم يرفض بسبب محدد (الوحدة، الحد الأدنى، الخطوة، الخانات، المخزون، المحجوز) ولا يعدّل بصمت.')
console.log('PASS: الضريبة على مجموع الطلب مع الشحن، وبنود الفاتورة شاملة الضريبة تساوي الإجمالي بالهللة.')
console.log(`PASS: السلة والخادم يحسبان نفس الإجمالي في ${pairs} حالة، وكل كمية تنتجها السلة يقبلها الخادم.`)
