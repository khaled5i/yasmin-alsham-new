// How long does applying stage 2 stop the shop from writing?
//   node scripts/db-local/measure-migration-locks.cjs
// Adding a foreign key takes SHARE ROW EXCLUSIVE on the REFERENCED table and keeps
// it until the transaction commits. The migration therefore adds its references to
// income and the inventory LAST. This measures what that buys: a shop sale is run
// in a second session while the migration is mid-flight and must NOT wait, and a
// second one is run after the references are added and must wait (but briefly).
const { FILES, connect, startServer, buildReplica, finish, read } = require('./lib.cjs')

const FK_MARKER = 'alter table public.fabric_store_orders\n  add constraint fabric_store_orders_income_id_fkey'

// A shop sale, as the income trigger writes it: the exact statement the migration may block.
const SALE = `insert into public.income (branch, category, customer_name, amount, fabric_items)
  values ('fabrics', 'fabric_sale', 'قياس القفل', 100, '[]'::jsonb)`

async function main() {
  const server = await startServer('locks')
  let failures = 0
  const check = (ok, text) => { console.log(`${ok ? '✔' : '✘'} ${text}`); if (!ok) failures += 1 }
  const db = await connect()
  const shop = await connect()
  try {
    await buildReplica(db)

    const sql = read(FILES.migration2)
    const cut = sql.indexOf(FK_MARKER)
    if (cut < 0) throw new Error('the foreign key section moved; update FK_MARKER')
    const body = sql.slice(0, cut)
    const references = sql.slice(cut)

    await db.query('begin')
    const t0 = Date.now()
    await db.query(body)
    const bodyMs = Date.now() - t0

    // mid-flight: everything but the references is applied, and the shop still writes
    const saleStart = Date.now()
    await shop.query(SALE)
    const saleMs = Date.now() - saleStart
    check(saleMs < 500, `a shop sale mid-migration does not wait (${saleMs} ms, after ${bodyMs} ms of migration)`)

    // now the references are added: from here until commit the shop is blocked
    const tFk = Date.now()
    await db.query(references)
    // read the lock itself instead of timing a blocked statement, so the
    // measurement below is the real window and not this probe.
    const { rows: [held] } = await shop.query(`
      select count(*)::int as n
      from pg_locks l
      join pg_class c on c.oid = l.relation
      where c.relname in ('income', 'fabric_inventory', 'fabric_inventory_colors')
        and l.mode = 'ShareRowExclusiveLock' and l.granted`)
    check(held.n === 3, `the references do hold the live tables (${held.n} of 3 locked)`)

    await db.query('commit')
    const lockMs = Date.now() - tFk
    const saleAfter = Date.now()
    await shop.query(SALE)
    check(Date.now() - saleAfter < 500, 'the shop writes again the moment the migration commits')
    check(lockMs < 2000, `the shop is held only for the tail of the migration (${lockMs} ms of ${bodyMs + lockMs} ms total)`)
    console.log(`   body ${bodyMs} ms · references + commit ${lockMs} ms · share of the migration the shop is blocked: ${Math.round((lockMs * 100) / (bodyMs + lockMs))}%`)
  } catch (error) {
    check(false, `measurement aborted: ${error.message}`)
  }
  await shop.end().catch(() => {})
  await db.end().catch(() => {})
  return finish(server, failures ? 1 : 0)
}

main()
