#!/usr/bin/env node
/**
 * Audit helper (read-only): fingerprints of every function defined in the store
 * migrations, as the LAST definition in migration order would leave it.
 *
 * Output: JSON lines {schema, name, file, md5} where md5 = md5 of the function body
 * (text between the dollar-quote tags) with CRLF normalised to LF — the same value as
 * `md5(replace(prosrc, E'\r\n', E'\n'))` on the live database.
 *
 * Usage: node scripts/db-local/audit/function-fingerprints.cjs [migration-glob-prefix...]
 * Default prefixes: 2026092 2026093 (payment-plan migrations).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const dir = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const prefixes = process.argv.slice(2).length ? process.argv.slice(2) : ['2026092', '2026093']
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql') && prefixes.some(p => f.startsWith(p))).sort()

const re = /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+)\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\bas\s+(\$[a-z_]*\$)([\s\S]*?)\4/gi
const latest = new Map()
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8')
  let m
  re.lastIndex = 0
  while ((m = re.exec(text))) {
    const [, schema, name, args, , body] = m
    const argTypes = args.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
    const key = `${schema}.${name}(${argTypes})`
    const normalised = body.replace(/\r\n/g, '\n')
    latest.set(key, { schema, name, args: argTypes, file, md5: crypto.createHash('md5').update(normalised, 'utf8').digest('hex') })
  }
}
for (const v of latest.values()) console.log(JSON.stringify(v))
