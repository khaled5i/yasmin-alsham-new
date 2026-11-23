#!/usr/bin/env node
/**
 * يتحقق أن كتالوج الصلاحيات في الكود (src/lib/staff-permissions.ts) يطابق
 * ما تزرعه الهجرة في public.staff_permission_catalog:
 *   نفس المفاتيح، ونفس "للمدير الأكبر فقط"، ونفس الأنواع الافتراضية.
 *
 * التشغيل: node scripts/check-staff-permissions-sync.cjs
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const tsPath = path.join(root, 'src/lib/staff-permissions.ts')
const migrationsDir = path.join(root, 'supabase/migrations')

const ts = fs.readFileSync(tsPath, 'utf8')

// كل تعريف صلاحية في مصفوفة الأقسام: { key: '...', ... }
const tsDefs = new Map()
const defRe = /\{\s*key:\s*'([a-z_.]+)'([^}]*)\}/g
let m
while ((m = defRe.exec(ts))) {
  const key = m[1]
  const rest = m[2]
  const ownerOnly = /ownerOnly:\s*true/.test(rest)
  const df = rest.match(/defaultFor:\s*\[([^\]]*)\]/)
  const defaults = df
    ? df[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean).sort()
    : []
  tsDefs.set(key, { ownerOnly, defaults })
}

// المفاتيح في نوع StaffPermissionKey
const typeBlock = ts.match(/export type StaffPermissionKey =([\s\S]*?)\n\n/)
const typeKeys = new Set(typeBlock ? [...typeBlock[1].matchAll(/'([a-z_.]+)'/g)].map(x => x[1]) : [])

// آخر زرع للكتالوج في الهجرات (الأحدث يغلب)
const sqlDefs = new Map()
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  const block = sql.match(/insert into public\.staff_permission_catalog[\s\S]*?on conflict/i)
  if (!block) continue
  const rowRe = /\(\s*'([a-z_.]+)'\s*,\s*(true|false)\s*,\s*'\{([^}]*)\}'\s*\)/g
  let r
  while ((r = rowRe.exec(block[0]))) {
    sqlDefs.set(r[1], {
      ownerOnly: r[2] === 'true',
      defaults: r[3].split(',').map(s => s.trim()).filter(Boolean).sort(),
    })
  }
}

const problems = []
for (const key of typeKeys) {
  if (!tsDefs.has(key)) problems.push(`النوع يذكر ${key} لكنه غير معرّف في الأقسام`)
}
for (const key of tsDefs.keys()) {
  if (!typeKeys.has(key)) problems.push(`${key} معرّف في الأقسام وغير موجود في النوع`)
}
for (const [key, def] of tsDefs) {
  const sql = sqlDefs.get(key)
  if (!sql) { problems.push(`${key} موجود في الكود وغير موجود في الهجرة`); continue }
  if (sql.ownerOnly !== def.ownerOnly) problems.push(`${key}: ownerOnly مختلف (كود ${def.ownerOnly} / قاعدة ${sql.ownerOnly})`)
  if (sql.defaults.join(',') !== def.defaults.join(',')) {
    problems.push(`${key}: الافتراضي مختلف (كود [${def.defaults}] / قاعدة [${sql.defaults}])`)
  }
}
for (const key of sqlDefs.keys()) {
  if (!tsDefs.has(key)) problems.push(`${key} موجود في الهجرة وغير موجود في الكود`)
}

if (problems.length) {
  console.error('❌ الكتالوج غير متطابق:\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`✅ الكتالوج متطابق (${tsDefs.size} صلاحية).`)
