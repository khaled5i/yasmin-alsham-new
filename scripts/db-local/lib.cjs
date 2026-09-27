// Local real-Postgres harness for the fabric-store payment plan (stages 2+).
// Builds a replica of the production pieces the plan touches, then applies the
// repo migrations exactly as written. See README.md in this folder.
//
// Dependencies live OUTSIDE the repo (NODE_PATH); nothing here is part of the app.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const EmbeddedPostgres = require('embedded-postgres').default
const { Client } = require('pg')

const ROOT = path.join(__dirname, '..', '..')
const PORT = Number(process.env.DB_LOCAL_PORT || 54329)
const PASSWORD = 'local-test-only'

const repoPath = (...parts) => path.join(ROOT, ...parts)
const read = file => fs.readFileSync(file, 'utf8')
const readLf = file => read(file).replace(/\r\n/g, '\n')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const FILES = {
  migration2: repoPath('supabase/migrations/20260924102616_fabric_store_orders_and_payments.sql'),
  migration3: repoPath('supabase/migrations/20260924102654_fabric_store_stock_reservations.sql'),
  migration4: repoPath('supabase/migrations/20260924114354_fabric_store_checkout.sql'),
  test2: repoPath('supabase/tests/fabric_store_orders_schema.sql'),
  test3: repoPath('supabase/tests/fabric_store_reservations.sql'),
  test4: repoPath('supabase/tests/fabric_store_checkout.sql'),
  migration5: repoPath('supabase/migrations/20260924160000_fabric_store_payments.sql'),
  test5: repoPath('supabase/tests/fabric_store_payments.sql'),
  report5: repoPath('docs/store-launch-plans/implementation/payments/stage-05-moyasar-payments.md'),
  report2: repoPath('docs/store-launch-plans/implementation/payments/stage-02-orders-and-payments-schema.md'),
  report3: repoPath('docs/store-launch-plans/implementation/payments/stage-03-stock-reservations.md'),
  report4: repoPath('docs/store-launch-plans/implementation/payments/stage-04-checkout-and-holds.md'),
}

/** `create or replace function <name>() … $$;` exactly as written in a repo migration. */
function functionFromMigration(file, name) {
  const sql = readLf(repoPath('supabase/migrations', file))
  const start = sql.indexOf(`create or replace function ${name}()`)
  if (start < 0) throw new Error(`${name} not found in ${file}`)
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start) + 5) + 3
  return sql.slice(start, end)
}

/** Body between `as $$` and `$$;` — what pg_proc.prosrc holds. */
function functionBody(file, name) {
  const definition = functionFromMigration(file, name)
  const open = definition.indexOf('as $$') + 5
  return definition.slice(open, definition.lastIndexOf('$$;'))
}

const md5 = text => crypto.createHash('md5').update(text, 'utf8').digest('hex')

/** The first ```sql block after `heading` in a stage report (rollback scripts live there). */
function sqlBlockAfter(reportFile, heading) {
  const text = readLf(reportFile)
  const at = text.indexOf(heading)
  if (at < 0) throw new Error(`"${heading}" not found in ${path.basename(reportFile)}`)
  const open = text.indexOf('```sql\n', at)
  const close = text.indexOf('\n```', open + 7)
  return text.slice(open + 7, close) + '\n'
}

/** What happened to the August migration: UTF-8 bytes read as Windows-1256. */
const garble = text => new TextDecoder('windows-1256').decode(Buffer.from(text, 'utf8'))

/** Production functions the plan builds on, as they are in the repo (== live after encoding repair). */
function existingFunctionsSql() {
  return [
    functionFromMigration('20260823161026_sync_fabric_sales_with_inventory.sql', 'private.validate_fabric_inventory_availability'),
    functionFromMigration('20260823162112_preserve_historical_fabric_sales_inventory.sql', 'private.prepare_fabric_sale_inventory_tracking'),
    functionFromMigration('20260823162112_preserve_historical_fabric_sales_inventory.sql', 'private.sync_fabric_sale_inventory'),
    functionFromMigration('20260818084550_enforce_fabric_movement_color_sync.sql', 'private.validate_fabric_movement_color'),
  ].join('\n\n')
}

async function startServer(name = 'data') {
  const dataDir = path.join(require('node:os').tmpdir(), `ys-db-local-${name}-${PORT}`)
  fs.rmSync(dataDir, { recursive: true, force: true })
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: PASSWORD,
    port: PORT,
    persistent: false,
    // Supabase databases are UTF-8. On an Arabic Windows locale initdb would otherwise pick WIN1256.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })
  await server.initialise()
  await server.start()
  return server
}

async function connect() {
  const client = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: PASSWORD, database: 'postgres' })
  client.on('error', () => {})
  await client.connect()
  return client
}

async function buildReplica(client) {
  await client.query(read(path.join(__dirname, 'replica-base.sql')))
  await client.query(existingFunctionsSql())
  await client.query(read(path.join(__dirname, 'replica-wiring.sql')))
}

/** Apply `find → replace` edits (a replacer function keeps `$$` literal). */
function mutate(sql, edits) {
  for (const [find, replace] of edits) {
    if (!sql.includes(find)) {
      const error = new Error(`MUTATION PATTERN NOT FOUND: ${find.slice(0, 60)}`)
      error.patternMissing = true
      throw error
    }
    sql = sql.replace(find, () => replace)
  }
  return sql
}

/** Run a repo SQL test file; resolves to 'PASS' or the failure message. */
async function runSqlTest(client, file) {
  try {
    const results = [].concat(await client.query(read(file)))
    const pass = results.flatMap(r => r.rows || []).find(r => String(r.result || '').startsWith('PASS'))
    return pass ? 'PASS' : 'NO PASS ROW'
  } catch (error) {
    await client.query('rollback').catch(() => {})
    return `FAILED -> ${error.message}`
  }
}

/**
 * embedded-postgres installs an exit hook that forces exit code 0, so a failing
 * run would look green. Always leave through here.
 */
function finish(server, code) {
  return Promise.resolve(server && server.stop()).catch(() => {}).then(() => process.exit(code))
}

module.exports = {
  FILES, PORT, connect, startServer, buildReplica, existingFunctionsSql, functionBody, md5,
  sqlBlockAfter, garble, mutate, runSqlTest, finish, read, sleep, repoPath,
}
