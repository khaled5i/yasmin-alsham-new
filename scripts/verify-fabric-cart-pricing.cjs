// اختبارات حسابية لعقد تسعير سلة الأقمشة.
// تعمل بلا شبكة وبلا Supabase: تُحمّل الوحدات النقية فقط بعد ترجمتها بـtypescript.
// التشغيل: node scripts/verify-fabric-cart-pricing.cjs
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src')
const cache = new Map()

// مُحمّل صغير: يترجم ملفات .ts النقية ويحل الاستيراد النسبي بينها،
// ويترك حزم node_modules (zod) لـrequire الحقيقي. لا يلمس أي ملف يستورد
// zustand أو supabase، ولهذا نُقلت قاعدة الخصم إلى وحدة مستقلة.
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

const commerce = load('lib/fabric-commerce')
const pricing = load('lib/fabric-display-pricing')

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

const line = (overrides = {}) => ({
  fabricId: 'fabric-1',
  purchaseMode: 'meter',
  quantity: 1,
  addedAt: '2026-09-19T00:00:00.000Z',
  snapshot: { label: 'قماش اختبار', fabricCode: 'SS-0001', color: 'وردي', image: null, unitPrice: 100 },
  ...overrides,
})

// ============================================
// 1) طريقة البيع مشتقة من المخزون
// ============================================
assert.equal(commerce.getFabricPurchaseMode(fabric({ stock_quantity: 3 })), 'piece')
assert.equal(commerce.getFabricPurchaseMode(fabric({ stock_quantity: 3.5 })), 'piece')
assert.equal(commerce.getFabricPurchaseMode(fabric({ stock_quantity: 4 })), 'meter')
assert.equal(commerce.getFabricPurchaseMode(fabric({ stock_quantity: 2.5 })), 'meter')

// ============================================
// 2) البيع بالقطعة: 3.5 متر × 100 = 350 للقطعة، لا 350 × 3.5
// ============================================
const wholePiece = fabric({ stock_quantity: 3.5, price_per_meter: 100 })
assert.equal(commerce.getFabricUnitPrice(wholePiece), 350, 'سعر القطعة = سعر المتر × أمتار القطعة')

const pieceBounds = commerce.getFabricQuantityBounds(wholePiece)
assert.deepEqual(pieceBounds, { min: 1, max: 1, step: 1, decimals: 0 }, 'القطعة الكاملة قطعة واحدة بلا كسور')

const pieceLine = commerce.resolveCartLine(
  line({ purchaseMode: 'piece', quantity: 1, snapshot: { ...line().snapshot, unitPrice: 350 } }),
  wholePiece
)
assert.equal(pieceLine.lineTotal, 350, 'إجمالي القطعة لا يُضرب بعدد الأمتار مرة ثانية')
assert.equal(pieceLine.status, 'ok')
assert.deepEqual(pieceLine.notices, [])

// كسور القطعة ممنوعة: 2.5 قطعة تُثبَّت على قطعة واحدة
assert.equal(commerce.clampFabricQuantity(2.5, pieceBounds), 1)
assert.equal(commerce.clampFabricQuantity(0.5, pieceBounds), 1)

// ============================================
// 3) البيع بالمتر: الحد الأدنى 1 والخطوة 0.5
// ============================================
const meterFabric = fabric({ stock_quantity: 10, price_per_meter: 200 })
const meterBounds = commerce.getFabricQuantityBounds(meterFabric)
assert.deepEqual(meterBounds, { min: 1, max: 10, step: 0.5, decimals: 2 })

assert.equal(commerce.clampFabricQuantity(2.5, meterBounds), 2.5, 'الكمية الكسرية على الخطوة تمر كما هي')
assert.equal(commerce.clampFabricQuantity(2.3, meterBounds), 2.5, 'تُثبَّت على أقرب خطوة')
assert.equal(commerce.clampFabricQuantity(2.2, meterBounds), 2, 'تُثبَّت للأسفل عند الأقرب')
assert.equal(commerce.clampFabricQuantity(0.5, meterBounds), 1, 'لا تنزل تحت الحد الأدنى')
assert.equal(commerce.clampFabricQuantity(-5, meterBounds), 1)

const meterLine = commerce.resolveCartLine(
  line({ quantity: 2.5, snapshot: { ...line().snapshot, unitPrice: 200 } }),
  meterFabric
)
assert.equal(meterLine.lineTotal, 500, '2.5 متر × 200 = 500')

// ============================================
// 4) حدود المخزون
// ============================================
const lowStock = fabric({ stock_quantity: 2.2, price_per_meter: 100 })
const lowBounds = commerce.getFabricQuantityBounds(lowStock)
assert.equal(lowBounds.max, 2.2)
assert.equal(commerce.clampFabricQuantity(5, lowBounds), 2, 'لا تتجاوز المخزون، وتنزل لأقرب خطوة صالحة')

const belowMin = fabric({ stock_quantity: 0.5, price_per_meter: 100 })
assert.equal(
  commerce.clampFabricQuantity(1, commerce.getFabricQuantityBounds(belowMin)),
  null,
  'مخزون أقل من الحد الأدنى ⇒ لا كمية صالحة'
)
assert.equal(
  commerce.resolveCartLine(line(), belowMin).status,
  'out-of-stock',
  'يظهر كنفاد كمية بدل أن يختفي بصمت'
)

const clampedLine = commerce.resolveCartLine(line({ quantity: 8 }), lowStock)
assert.equal(clampedLine.quantity, 2)
assert.ok(clampedLine.notices.includes('quantity-adjusted'), 'تعديل الكمية يُبلَّغ للمستخدم')

// ============================================
// 5) الخصم يُطبَّق مرة واحدة
// ============================================
const discounted = fabric({ price_per_meter: 200, is_on_sale: true, discount_percentage: 25 })
assert.equal(pricing.getFabricNetPricePerMeter(discounted), 150)
assert.equal(commerce.getFabricUnitPrice(discounted), 150, 'الخصم لا يُطبَّق مرتين')

const discountedPiece = fabric({
  price_per_meter: 200,
  is_on_sale: true,
  discount_percentage: 25,
  stock_quantity: 3,
})
assert.equal(commerce.getFabricUnitPrice(discountedPiece), 450, '3 × 150 بعد خصم واحد فقط')

// خصم غير مفعّل أو صفر لا يغيّر السعر
assert.equal(commerce.getFabricUnitPrice(fabric({ is_on_sale: false, discount_percentage: 25 })), 100)
assert.equal(commerce.getFabricUnitPrice(fabric({ is_on_sale: true, discount_percentage: 0 })), 100)

// ============================================
// 6) غياب السعر والقيمة صفر
// ============================================
assert.equal(commerce.getFabricUnitPrice(fabric({ price_per_meter: null })), null, 'السعر عند الطلب')
assert.equal(commerce.getFabricUnitPrice(fabric({ price_per_meter: 0 })), null, 'الصفر لا يُشترى')
assert.equal(
  pricing.getFabricNetPricePerMeter(fabric({ price_per_meter: 0 })),
  0,
  'الصفر يبقى صفراً في البيانات ولا يتحول إلى سعر افتراضي'
)

assert.equal(commerce.resolveCartLine(line(), fabric({ price_per_meter: null })).status, 'price-on-request')
assert.equal(commerce.resolveCartLine(line(), fabric({ price_per_meter: 0 })).status, 'price-on-request')

// ============================================
// 7) المنتج المخفي أو المحذوف لا يُشترى ولو كان محفوظاً
// ============================================
for (const [label, overrides] of [
  ['محذوف', { deleted_at: '2026-09-01T00:00:00Z' }],
  ['غير نشط', { is_active: false }],
  ['غير متاح', { is_available: false }],
  ['مخفي يدوياً', { is_manually_hidden: true }],
]) {
  const resolved = commerce.resolveCartLine(line(), fabric(overrides))
  assert.equal(resolved.status, 'unavailable', `${label}: يُعلَّم غير متاح`)
  assert.equal(resolved.isPurchasable, false, `${label}: لا يمكن شراؤه`)
  assert.equal(resolved.lineTotal, null, `${label}: لا يدخل الإجمالي`)
}

const missing = commerce.resolveCartLine(line(), null)
assert.equal(missing.status, 'missing')
assert.equal(missing.isPurchasable, false)

// قبل وصول البيانات الحيّة لا يُقال للمستخدم إن القماش حُذف
const pending = commerce.resolveCartLine(line(), null, { isLookupPending: true })
assert.equal(pending.status, 'pending', 'أثناء التحميل: قيد التحقق لا «محذوف»')
assert.equal(pending.isPurchasable, false, 'لا يُشترى قبل التحقق')

// ...ولا يُشترى اعتماداً على نسخة قديمة من الكتالوج قبل أن يردّ الخادم
const staleCopy = commerce.resolveCartLine(line(), fabric(), { isLookupPending: true })
assert.equal(staleCopy.status, 'pending', 'نسخة الكتالوج ليست تحققاً')
assert.equal(staleCopy.isPurchasable, false, 'لا شراء قبل ردّ الخادم')
assert.equal(staleCopy.lineTotal, null, 'ولا يدخل الإجمالي')

// السطر قيد التحميل ليس سطراً معطّلاً يُطلب من المستخدم معالجته
const loadingTotals = commerce.computeCartTotals([pending])
assert.equal(loadingTotals.blockedCount, 0, 'قيد التحميل لا يُحتسب كعنصر معطّل')
assert.equal(loadingTotals.purchasableCount, 0)
assert.equal(loadingTotals.total, 0)
assert.equal(
  commerce.computeCartTotals([missing]).blockedCount,
  1,
  'المحذوف فعلاً يُحتسب كعنصر يحتاج تدخّلاً'
)

// ============================================
// 8) تغيّر السعر وطريقة البيع يظهران للمستخدم
// ============================================
const pricier = commerce.resolveCartLine(
  line({ snapshot: { ...line().snapshot, unitPrice: 100 } }),
  fabric({ price_per_meter: 150 })
)
assert.ok(pricier.notices.includes('price-changed'))
assert.equal(pricier.isPurchasable, true, 'تغيّر السعر ينبّه ولا يمنع الشراء')

const flipped = commerce.resolveCartLine(
  line({ purchaseMode: 'meter', snapshot: { ...line().snapshot, unitPrice: 100 } }),
  fabric({ stock_quantity: 3 })
)
assert.equal(flipped.purchaseMode, 'piece', 'طريقة البيع تُعاد اشتقاقها من المخزون الحيّ')
assert.equal(flipped.status, 'needs-quantity')
assert.equal(flipped.unitPrice, 300)
assert.deepEqual(
  flipped.notices,
  [],
  'لا مقارنة سعر بين وحدتين مختلفتين، ولا تكرار لرسالة تغيّر الوحدة'
)
assert.equal(
  flipped.key,
  commerce.getCartLineKey('fabric-1', 'meter'),
  'المفتاح يبقى على طريقة البيع المحفوظة، وإلا توقّف الحذف وتعديل الكمية عن مطابقة السطر'
)

// المفتاح ثابت في كل الحالات: هو عنوان السطر المحفوظ لا وصف حالته الحيّة
for (const [label, live] of [
  ['متاح', fabric()],
  ['محذوف', fabric({ deleted_at: '2026-09-01T00:00:00Z' })],
  ['بلا سعر', fabric({ price_per_meter: null })],
  ['نافد', fabric({ stock_quantity: 0 })],
  ['مفقود', null],
]) {
  assert.equal(
    commerce.resolveCartLine(line(), live).key,
    commerce.getCartLineKey('fabric-1', 'meter'),
    `${label}: المفتاح يطابق السطر المحفوظ`
  )
}

// ============================================
// 9) مفتاح السطر ودمج الأسطر
// ============================================
assert.equal(commerce.getCartLineKey('a', 'meter'), 'a::meter')
assert.notEqual(commerce.getCartLineKey('a', 'meter'), commerce.getCartLineKey('a', 'piece'))
assert.notEqual(commerce.getCartLineKey('a', 'meter'), commerce.getCartLineKey('b', 'meter'))

// ============================================
// 10) الإجماليات والضريبة
// ============================================
const totals = commerce.computeCartTotals([
  commerce.resolveCartLine(line({ quantity: 2.5, snapshot: { ...line().snapshot, unitPrice: 200 } }), meterFabric),
  commerce.resolveCartLine(
    line({ purchaseMode: 'piece', snapshot: { ...line().snapshot, unitPrice: 350 } }),
    wholePiece
  ),
])
assert.equal(totals.subtotal, 850, '500 + 350')
assert.equal(totals.vat, 127.5, 'ضريبة 15%')
assert.equal(totals.total, 977.5)
assert.equal(totals.purchasableCount, 2)
assert.equal(totals.blockedCount, 0)

// الأسطر غير القابلة للشراء تبقى معروضة لكنها لا تدخل الإجمالي
const mixed = commerce.computeCartTotals([
  commerce.resolveCartLine(line({ quantity: 2 }), fabric({ price_per_meter: 100 })),
  commerce.resolveCartLine(line(), fabric({ price_per_meter: null })),
  commerce.resolveCartLine(line(), null),
])
assert.equal(mixed.subtotal, 200)
assert.equal(mixed.vat, 30)
assert.equal(mixed.total, 230)
assert.equal(mixed.purchasableCount, 1)
assert.equal(mixed.blockedCount, 2)

assert.deepEqual(commerce.computeCartTotals([]), {
  subtotal: 0,
  vat: 0,
  total: 0,
  purchasableCount: 0,
  blockedCount: 0,
})

// ============================================
// 11) تحقق العقد المحفوظ محلياً
// ============================================
const good = commerce.fabricCartStateSchema.safeParse({ schemaVersion: 1, lines: [line()] })
assert.equal(good.success, true)

assert.equal(commerce.fabricCartStateSchema.safeParse({ schemaVersion: 99, lines: [] }).success, false, 'إصدار مختلف يُرفض')
assert.equal(commerce.fabricCartStateSchema.safeParse({ lines: [] }).success, false)
assert.equal(
  commerce.fabricCartStateSchema.safeParse({ schemaVersion: 1, lines: [line({ quantity: -1 })] }).success,
  false,
  'كمية سالبة تُرفض'
)
assert.equal(
  commerce.fabricCartStateSchema.safeParse({ schemaVersion: 1, lines: [line({ quantity: 10000 })] }).success,
  false,
  'كمية فوق السقف تُرفض'
)
assert.equal(
  commerce.fabricCartStateSchema.safeParse({ schemaVersion: 1, lines: [line({ purchaseMode: 'kilo' })] }).success,
  false,
  'وحدة بيع مجهولة تُرفض'
)
assert.equal(
  commerce.fabricCartStateSchema.safeParse({
    schemaVersion: 1,
    lines: Array.from({ length: 41 }, () => line()),
  }).success,
  false,
  'تجاوز سقف الأسطر يُرفض'
)

// ============================================
// 12) انقلاب وحدة البيع لا يغيّر معنى الطلب بصمت
// ============================================
// قطعة 3.5م بـ350 ريال، ثم يرتفع المخزون فتصبح طريقة البيع «بالمتر».
// تحويلها تلقائياً كان يجعلها متراً واحداً بـ100 ريال دون موافقة المستخدمة.
const savedPiece = line({
  purchaseMode: 'piece',
  quantity: 1,
  snapshot: { ...line().snapshot, unitPrice: 350 },
})
const flippedUnit = commerce.resolveCartLine(savedPiece, fabric({ stock_quantity: 5, price_per_meter: 100 }))
assert.equal(flippedUnit.status, 'needs-quantity', 'تغيّر الوحدة يوقف السطر حتى تُعاد الكمية')
assert.equal(flippedUnit.isPurchasable, false, 'لا يُشترى بكمية بوحدة قديمة')
assert.equal(flippedUnit.lineTotal, null, 'ولا يدخل الإجمالي بمبلغ لم تختره المستخدمة')
assert.equal(flippedUnit.purchaseMode, 'meter', 'الوحدة المعروضة هي الجديدة')
assert.ok(flippedUnit.bounds, 'الحدود متاحة ليعرض عليها منتقي الكمية')
assert.deepEqual(flippedUnit.notices, [], 'رسالة الحالة وحدها تشرح ما جرى وما المطلوب')
assert.equal(
  commerce.getCartLineKey(flippedUnit.line.fabricId, flippedUnit.line.purchaseMode),
  flippedUnit.key,
  'المفتاح يظل على السطر المحفوظ ليبقى الحذف والتعديل ممكنين'
)

// السطر المنتظر إعادة الاختيار يحتاج تدخّل المستخدمة فعلاً ⇒ يُحتسب معطّلاً
const flippedTotals = commerce.computeCartTotals([flippedUnit])
assert.equal(flippedTotals.blockedCount, 1)
assert.equal(flippedTotals.total, 0)

// بلا انقلاب: السلوك الطبيعي يبقى كما هو
assert.equal(
  commerce.resolveCartLine(savedPiece, fabric({ stock_quantity: 3.5, price_per_meter: 100 })).status,
  'ok',
  'ثبات الوحدة لا يطلب شيئاً من المستخدمة'
)

// ============================================
// 13) الرسالة لا تصف قماشاً لم يُتحقق منه بأنه غير متاح
// ============================================
const wa = load('lib/fabric-cart-whatsapp')
const pendingMsg = wa.buildCartInquiryMessage([pending], commerce.computeCartTotals([pending]))
assert.ok(pendingMsg.includes('لم يكتمل التحقق'), 'السطر غير المتحقق منه يوصف بصدق')
assert.ok(!pendingMsg.includes('غير متاح حالياً'), 'ولا يُقدَّم للتاجر كأنه نافد')
const reselectMsg = wa.buildCartInquiryMessage([flippedUnit], flippedTotals)
assert.ok(reselectMsg.includes('لم تُعتمد الكمية'), 'والمنتظر إعادة اختيار الكمية كذلك')
assert.ok(
  wa.buildCartInquiryMessage([missing], commerce.computeCartTotals([missing])).includes('غير متاح حالياً'),
  'أما المحذوف فعلاً فيبقى «غير متاح»'
)

// ============================================
// 14) «نقل إلى المفضلة» لا يحذف من المكانين
// ============================================
// متجر المفضلة يعمل في node: لا يلمس window إلا عند hydrate/persist المحميين.
const favStore = load('store/fabricFavoritesStore').useFabricFavoritesStore
const sample = fabric()

assert.equal(favStore.getState().add(sample), true, 'إضافة أولى')
assert.equal(favStore.getState().items.length, 1)

// هذه هي الحالة التي كانت تُفقد القماش: موجود مسبقاً ثم يُضغط «نقل للمفضلة»
assert.equal(favStore.getState().add(sample), false, 'الإضافة المكررة لا تُبدّل')
assert.equal(favStore.getState().items.length, 1, 'ويبقى في المفضلة، لا يُزال منها')
assert.equal(favStore.getState().isFavorite(sample.id), true, 'القماش لم يُفقد من المكانين')

// التبديل (زر القلب) يبقى تبديلاً
assert.equal(favStore.getState().toggle(sample), false, 'القلب يزيل الموجود')
assert.equal(favStore.getState().isFavorite(sample.id), false)
assert.equal(favStore.getState().toggle(sample), true, 'والقلب يعيد إضافته')
assert.equal(favStore.getState().items.length, 1)
favStore.getState().clear()
assert.equal(favStore.getState().items.length, 0)

// ============================================
// 15) تثبيت الكمية يُنتج دائماً رقماً صالحاً للعرض
// ============================================
// الحقل يعرض ما يُحتسب: كتابة 99 والحد الأعلى 5 ⇒ الرقم المعتمد 5 لا 99.
const capped = commerce.getFabricQuantityBounds(fabric({ stock_quantity: 5 }))
assert.equal(commerce.clampFabricQuantity(99, capped), 5)
assert.equal(commerce.clampFabricQuantity(5, capped), 5, 'التثبيت ثابت: نفس القيمة تبقى')

console.log('PASS: طريقة البيع المشتقة من المخزون، سعر القطعة الكاملة (3.5 × 100 = 350 لا 350 × 3.5)، الحد الأدنى والخطوة 0.5، الكميات الكسرية وحدود المخزون.')
console.log('PASS: الخصم يُطبَّق مرة واحدة، غياب السعر والصفر لا يُشتريان، المخفي والمحذوف يُعلَّم ولا يختفي، والتحميل لا يُقدَّم كحذف، تغيّر السعر وطريقة البيع يظهران.')
console.log('PASS: انقلاب وحدة البيع يطلب إعادة اختيار الكمية بدل تغيير الطلب صامتاً، والرسالة تصف غير المتحقق منه بصدق.')
console.log('PASS: «نقل إلى المفضلة» يضيف ولا يبدّل فلا يختفي القماش من السلة والمفضلة معاً.')
console.log('PASS: مفتاح السطر يفصل وحدات البيع ويثبت على السطر المحفوظ، الضريبة 15%، الأسطر المعطّلة لا تدخل الإجمالي، وعقد التخزين المحلي يرفض البيانات الفاسدة.')
