// فحص لمرة واحدة للمرحلة 1 من خطة الدفع: هل تغيّر ما تعرضه السلة للزبونة؟
//
// يقارن حساب السلة قبل المرحلة (من git، الإيداع cb95638) بالحساب الجديد بالهللة،
// على مصفوفة أسعار/خصومات/مخزون اصطناعية، واختيارياً على كتالوج المتجر الحيّ.
// كل اختلاف يُقارَن بمرجع دقيق (BigInt) ويُصنَّف؛ أي اختلاف لا يفسّره المرجع يُفشل الفحص.
//
// التشغيل:
//   node scripts/verify-fabric-store-pricing-parity.cjs            ← المصفوفة الاصطناعية فقط
//   node scripts/verify-fabric-store-pricing-parity.cjs --catalog  ← + الكتالوج الحيّ
// الخيار --catalog يقرأ حقول التسعير العامة من جدول fabrics بالمفتاح العام (anon) في
// .env.local — نفس ما يراه أي زائر للمتجر. لا يكتب شيئاً.
const { execFileSync } = require('node:child_process')
const { readFileSync, existsSync } = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.join(__dirname, '..')
const BASELINE_COMMIT = 'cb95638'

function makeLoader(readSource) {
  const cache = new Map()
  return function load(fileFromSrc) {
    if (cache.has(fileFromSrc)) return cache.get(fileFromSrc)
    const { outputText } = ts.transpileModule(readSource(fileFromSrc), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: fileFromSrc + '.ts',
    })
    const moduleExports = {}
    cache.set(fileFromSrc, moduleExports)
    const localRequire = specifier => {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        return load(path.posix.join(path.posix.dirname(fileFromSrc), specifier))
      }
      if (specifier.startsWith('@/')) return load(specifier.slice(2))
      return require(specifier)
    }
    new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)(
      moduleExports, localRequire, { exports: moduleExports }, fileFromSrc, ROOT
    )
    return moduleExports
  }
}

const readBaseline = file =>
  execFileSync('git', ['show', `${BASELINE_COMMIT}:src/${file}.ts`], { cwd: ROOT, encoding: 'utf8' })
const readCurrent = file => readFileSync(path.join(ROOT, 'src', file + '.ts'), 'utf8')

const before = makeLoader(readBaseline)('lib/fabric-commerce')
const after = makeLoader(readCurrent)('lib/fabric-commerce')

// ============================================
// المرجع الدقيق (BigInt، تقريب نصف للأعلى على الكسر الحقيقي)
// ============================================
const halfUp = (numerator, denominator) => {
  const quotient = numerator / denominator
  return (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient
}
function exactUnitHalalas(f) {
  if (f.price_per_meter == null || !(Number(f.price_per_meter) > 0)) return null
  const price = BigInt(Math.round(Number(f.price_per_meter) * 100))
  const discount = f.is_on_sale && Number(f.discount_percentage) > 0
    ? BigInt(Math.round(Number(f.discount_percentage) * 100))
    : 0n
  if (10000n - discount <= 0n) return null
  const stockCm = BigInt(Math.round(Number(f.stock_quantity) * 100))
  const unit = stockCm === 300n || stockCm === 350n
    ? halfUp(price * (10000n - discount) * stockCm, 1000000n)
    : halfUp(price * (10000n - discount), 10000n)
  return unit > 0n ? unit : null
}
const toSar = halalas => (halalas == null ? null : Number(halalas) / 100)

// ============================================
// المقارنة
// ============================================
const shell = { name: 'x', fabric_code: 'X-1', available_colors: ['c'], images: [], id: 'f' }
const cartLine = (mode, quantity, unitPrice) => ({
  fabricId: 'f', purchaseMode: mode, quantity, addedAt: '2026-09-21T00:00:00.000Z',
  snapshot: { label: 'x', fabricCode: 'X-1', color: 'c', image: null, unitPrice },
})
const withoutNewFields = ({ lineTotalHalalas, fabric, ...rest }) => rest

const stats = { checks: 0, identical: 0, exactFix: 0, zeroPriceNowBlocked: 0, unexplained: [] }

function classify(label, source, oldValue, newValue, kind) {
  stats.checks += 1
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
    stats.identical += 1
    return
  }
  const exact = exactUnitHalalas(source)
  const oldUnit = kind === 'unit' ? oldValue : oldValue?.unitPrice
  // (أ) القديم كان يعرض سعراً مقرَّباً إلى صفر كأنه قابل للشراء؛ الجديد يمنعه.
  if (exact == null && (oldUnit === 0 || (kind === 'totals' && oldValue.purchasableCount > newValue.purchasableCount))) {
    stats.zeroPriceNowBlocked += 1
    return
  }
  // (ب) الجديد يطابق المرجع الدقيق، والقديم خالفه بخطأ الفاصلة العائمة.
  if (kind === 'unit' && newValue === toSar(exact) && oldValue !== toSar(exact)) {
    stats.exactFix += 1
    return
  }
  if (kind === 'line') {
    const unitMatches = newValue.unitPrice === toSar(exact)
    let lineMatches = true
    let oldWrong = oldValue.unitPrice !== toSar(exact)
    if (newValue.lineTotal != null) {
      const exactLine = newValue.purchaseMode === 'piece'
        ? exact * BigInt(newValue.quantity)
        : halfUp(exact * BigInt(Math.round(newValue.quantity * 100)), 100n)
      lineMatches = newValue.lineTotal === toSar(exactLine)
      oldWrong = oldWrong || oldValue.lineTotal !== toSar(exactLine)
    }
    if (unitMatches && lineMatches && oldWrong) {
      stats.exactFix += 1
      return
    }
  }
  if (kind === 'totals') {
    const subtotal = BigInt(Math.round(newValue.subtotal * 100))
    const vat = halfUp(subtotal * 1500n, 10000n)
    if (newValue.vat === toSar(vat) && newValue.total === toSar(subtotal + vat)) {
      stats.exactFix += 1
      return
    }
  }
  stats.unexplained.push({ label, old: oldValue, new: newValue })
}

function compareFabric(label, row) {
  const f = { ...shell, ...row, id: 'f' }
  classify(`${label} unit`, f, before.getFabricUnitPrice(f), after.getFabricUnitPrice(f), 'unit')
  for (const [name, a, b] of [
    ['bounds', before.getFabricQuantityBounds(f), after.getFabricQuantityBounds(f)],
    ['mode', before.getFabricPurchaseMode(f), after.getFabricPurchaseMode(f)],
    ['visible', before.isFabricPubliclyVisible(f), after.isFabricPubliclyVisible(f)],
  ]) {
    stats.checks += 1
    if (JSON.stringify(a) === JSON.stringify(b)) stats.identical += 1
    else stats.unexplained.push({ label: `${label} ${name}`, old: a, new: b })
  }
  const oldLines = []
  const newLines = []
  for (const mode of ['meter', 'piece']) {
    for (let quantity = 0.25; quantity <= 25; quantity += 0.25) {
      for (const snapshotPrice of [null, before.getFabricUnitPrice(f), 1, 350]) {
        const a = before.resolveCartLine(cartLine(mode, quantity, snapshotPrice), f)
        const b = after.resolveCartLine(cartLine(mode, quantity, snapshotPrice), f)
        classify(`${label} ${mode} q=${quantity}`, f, withoutNewFields(a), withoutNewFields(b), 'line')
        if (snapshotPrice === null) {
          oldLines.push(a)
          newLines.push(b)
        }
      }
    }
  }
  classify(`${label} totals`, f, before.computeCartTotals(oldLines), after.computeCartTotals(newLines), 'totals')
}

async function loadCatalog() {
  const envPath = path.join(ROOT, '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local غير موجود')
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')])
  )
  const fields = 'price_per_meter,is_on_sale,discount_percentage,stock_quantity,min_order_meters,is_active,is_available,is_manually_hidden,deleted_at'
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fabrics?select=${fields}`, {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  })
  if (!response.ok) throw new Error(`تعذّرت قراءة الكتالوج: HTTP ${response.status}`)
  return response.json()
}

async function main() {
  const prices = [null, 0, 0.01, 0.99, 1, 7.77, 33.33, 45.45, 99.98, 99.99, 100, 123.45, 145.5, 250, 999.95, 1999.99]
  const discounts = [0, 5, 10, 15, 20, 25, 33, 50, 99, 100]
  const stocks = [0, 0.5, 1, 1.25, 2.2, 3, 3.5, 4, 5.75, 7.25, 17.5, 99.5, 150]
  for (const price of prices) for (const discount of discounts) for (const stock of stocks) {
    compareFabric(`p=${price} d=${discount} s=${stock}`, {
      price_per_meter: price, is_on_sale: discount > 0, discount_percentage: discount,
      stock_quantity: stock, min_order_meters: 1,
      is_active: true, is_available: true, is_manually_hidden: false, deleted_at: null,
    })
  }
  const syntheticChecks = stats.checks

  let catalogReport = 'لم يُفحص (شغّل بالخيار --catalog)'
  if (process.argv.includes('--catalog')) {
    const catalog = await loadCatalog()
    const beforeCatalog = { ...stats, unexplained: stats.unexplained.length }
    catalog.forEach((row, index) => compareFabric(`catalog#${index}`, row))

    // سلال متعددة الأسطر من الكتالوج نفسه (مولّد حتمي ليُعاد نفس الفحص).
    let seed = 42
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const CART_COUNT = 3000
    for (let cart = 0; cart < CART_COUNT; cart += 1) {
      const picks = Array.from({ length: 1 + Math.floor(random() * 8) }, () => ({
        row: catalog[Math.floor(random() * catalog.length)],
        meters: 1 + Math.floor(random() * 10) * 0.5,
      }))
      const build = commerce => picks.map(({ row, meters }) => {
        const f = { ...shell, ...row, id: 'f' }
        const mode = commerce.getFabricPurchaseMode(f)
        return commerce.resolveCartLine(cartLine(mode, mode === 'piece' ? 1 : meters, null), f)
      })
      const f = { ...shell, ...picks[0].row, id: 'f' }
      classify(`catalog cart#${cart}`, f, before.computeCartTotals(build(before)), after.computeCartTotals(build(after)), 'totals')
    }

    const changed = (stats.checks - beforeCatalog.checks) - (stats.identical - beforeCatalog.identical)
    catalogReport = `${catalog.length} قماشاً + ${CART_COUNT} سلة عشوائية منها، ${stats.checks - syntheticChecks} مقارنة، المختلف منها: ${changed}`
  }

  console.log(`المقارنات: ${stats.checks} (الاصطناعية: ${syntheticChecks})`)
  console.log(`متطابقة: ${stats.identical}`)
  console.log(`تصحيح دقيق (القديم أخطأ بالفاصلة العائمة والجديد يطابق المرجع): ${stats.exactFix}`)
  console.log(`سعر مقرَّب إلى صفر كان قابلاً للشراء وصار ممنوعاً: ${stats.zeroPriceNowBlocked}`)
  console.log(`الكتالوج الحيّ: ${catalogReport}`)
  if (stats.unexplained.length > 0) {
    console.error(`FAIL: ${stats.unexplained.length} اختلاف بلا تفسير. أمثلة:`)
    console.error(JSON.stringify(stats.unexplained.slice(0, 5), null, 1))
    process.exit(1)
  }
  console.log('PASS: كل اختلاف بين الحسابين إما تصحيح دقيق أو منع شراء بسعر صفر؛ لا اختلاف بلا تفسير.')
}

main().catch(error => {
  console.error('FAIL:', error.message)
  process.exit(1)
})
