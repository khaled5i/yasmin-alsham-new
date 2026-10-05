// Fix batch A / AUD-01 on a real local Postgres 17 (see README.md):
// income / expenses RLS by role, anon locked out, and the alostaz state of an online-store
// sale written by the server only. Runs the live-safe SQL test BEFORE the migration (it must
// fail there) and after it, the AUD-01 audit steps as anon, real JWT identities for every
// staff kind, the shop sale through the stock guard, the rollback script, and re-applying.
//   node scripts/db-local/verify-finance-rls.cjs [--mutateA "<find>" "<replace>"]...
// Exit code 0 only if every check passes; 3 when a mutation pattern is missing.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { FILES, connect, startServer, buildReplica, garble, mutate, runSqlTest, finish, read } = require('./lib.cjs')

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001'
const FABRICS = 'aaaaaaaa-0000-4000-8000-000000000002'
const TAILOR = 'aaaaaaaa-0000-4000-8000-000000000003'
const ACCOUNTANT = 'aaaaaaaa-0000-4000-8000-000000000004'
const GM = 'aaaaaaaa-0000-4000-8000-000000000005'
const WORKSHOP = 'aaaaaaaa-0000-4000-8000-000000000006'
const OLD_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000007'
const OLD_FABRICS = 'aaaaaaaa-0000-4000-8000-000000000008'

const args = process.argv.slice(2)
const editsA = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mutateA') { editsA.push([args[i + 1], args[i + 2]]); i += 2 }
}

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex')

async function session(sub) {
  const c = await connect()
  if (sub === 'anon') {
    await c.query('set role anon')
  } else if (sub === 'service') {
    await c.query('set role service_role')
  } else {
    const claims = sub === 'nosub' ? { role: 'authenticated' } : { sub, role: 'authenticated' }
    await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)])
    await c.query('set role authenticated')
  }
  return c
}

/** 'OK' (rowCount) or the error: SQLSTATE plus the message prefix before '|'. */
async function attempt(c, sql, params = []) {
  try {
    const r = await c.query(sql, params)
    return { ok: true, rows: r.rows, count: r.rowCount, label: `OK(${r.rowCount})` }
  } catch (error) {
    return { ok: false, code: error.code, label: `${error.code}:${String(error.message).split('|')[0].slice(0, 80)}` }
  }
}

async function makeFabric(admin, label, meters) {
  const { rows: [item] } = await admin.query(
    `insert into public.fabric_inventory (name, fabric_type, unit, sale_price_per_unit, images)
     values ($1, $1, 'meter', 100.00, array['https://x.invalid/a.jpg']) returning id`, [`finance ${label}`])
  const { rows: [color] } = await admin.query(
    `insert into public.fabric_inventory_colors (inventory_item_id, color_name) values ($1, $2) returning id`, [item.id, label])
  await admin.query(`insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
                     values ($1, $2, 'in', $3)`, [item.id, color.id, meters])
  const { rows: [listing] } = await admin.query(`select id from public.fabrics where inventory_color_id = $1`, [color.id])
  return { item: item.id, color: color.id, listing: listing.id }
}

const stockOf = async (admin, color) =>
  Number((await admin.query(`select current_quantity from public.fabric_inventory_colors where id = $1`, [color])).rows[0].current_quantity)

let orders = 0
function checkout(listing, cm, token) {
  orders += 1
  const key = crypto.randomUUID()
  const net = Math.floor((10000 * cm + 50) / 100)
  const vat = Math.floor((net * 1500 + 5000) / 10000)
  return JSON.stringify({
    checkout_key: key, request_fingerprint: sha(`${key}:fp`), access_token_hash: sha(token),
    client_hash: sha(`finance-${orders}`), customer: { name: 'عميلة', phone: `+96656${String(orders).padStart(7, '0')}` },
    delivery: { method: 'pickup', shipping_net_halalas: 0, shipping_vat_halalas: 0 },
    totals: { items_net_halalas: net, vat_halalas: vat, total_halalas: net + vat },
    policies: { terms: 't', returns: 'r', privacy: 'p' },
    items: [{ fabric_id: listing, purchase_mode: 'meter', piece_length_cm: null, quantity_cm: cm, price_per_meter_halalas: 10000,
      discount_basis_points: 0, unit_price_halalas: 10000, net_halalas: net, vat_halalas: vat }],
  })
}

/** An online order paid in LIVE mode and confirmed: its income row is the online-store sale. */
async function onlineSale(admin, fabric) {
  const token = crypto.randomUUID()
  const svc = await session('service')
  const created = (await svc.query('select public.fabric_store_create_checkout($1::jsonb) as r', [checkout(fabric.listing, 100, token)])).rows[0].r
  assert.equal(created.status, 'created', JSON.stringify(created))
  const begun = (await svc.query(`select public.fabric_store_begin_payment(decode($1, 'hex'), 'live', decode($2, 'hex')) as r`,
    [sha(token), sha(`payer-${orders}`)])).rows[0].r
  assert.equal(begun.status, 'created', JSON.stringify(begun))
  await svc.query(`select public.fabric_store_attach_invoice($1, $2, 'https://checkout.moyasar.com/x')`, [begun.attempt_id, `inv-fin-${orders}`])
  const applied = (await svc.query(`select public.fabric_store_apply_payment(null, 'live', $1::jsonb, null) as r`,
    [JSON.stringify({ id: `pay-fin-${orders}`, status: 'paid', amount: 11500, currency: 'SAR', invoice_id: `inv-fin-${orders}` })])).rows[0].r
  assert.equal(applied.status, 'paid', JSON.stringify(applied))
  const confirmed = (await svc.query('select public.fabric_store_confirm_order($1) as r', [created.order_id])).rows[0].r
  assert.equal(confirmed.status, 'confirmed', JSON.stringify(confirmed))
  await svc.end()
  const { rows: [o] } = await admin.query('select income_id from public.fabric_store_orders where id = $1', [created.order_id])
  assert.ok(o.income_id, 'the online sale exists')
  return { orderId: created.order_id, incomeId: o.income_id }
}

/** An unpaid order holding `cm` of the fabric (the shop must be refused that part). */
async function hold(fabric, cm) {
  const svc = await session('service')
  const created = (await svc.query('select public.fabric_store_create_checkout($1::jsonb) as r',
    [checkout(fabric.listing, cm, crypto.randomUUID())])).rows[0].r
  await svc.end()
  assert.equal(created.status, 'created', JSON.stringify(created))
  return created.order_id
}

const SHOP_SALE = `insert into public.income (branch, category, customer_name, amount, payment_method, fabric_items)
  values ('fabrics', 'fabric_sale', 'زبونة المحل', 100, 'cash', $1::jsonb) returning id`
const saleLines = (fabric, meters) =>
  JSON.stringify([{ inventory_id: fabric.item, inventory_color_id: fabric.color, name: 'قماش', quantity_meters: meters }])

async function main() {
  const server = await startServer('finance')
  let failures = 0
  const fail = message => { failures += 1; console.log(`✘ ${message}`) }
  const ok = message => console.log(`✔ ${message}`)
  const check = (label, got, want) => {
    if (got === want) ok(`${label}: ${got}`); else fail(`${label}: expected ${want}, got ${got}`)
  }
  try {
    const admin = await connect()
    await buildReplica(admin)
    for (const file of [FILES.migration2, FILES.migration3, FILES.migration4, FILES.migration5, FILES.migration6,
                        FILES.migration7, FILES.migration7r, FILES.migration8, FILES.migration8fix, FILES.migration9]) {
      await admin.query(read(file))
    }
    // A mutant inside the guard changes its fingerprint; the migration then refuses its own
    // re-apply and the behaviour checks never run (a mutant "caught" for the wrong reason).
    // Point the migration's self-fingerprint at the mutated body — only when the body changed,
    // so the "re-applying refuses its own guard" mutant still fails on the re-apply.
    const guardBody = sql => {
      const s = sql.replace(/\r\n/g, '\n')
      const open = s.indexOf('as $$', s.indexOf('create or replace function private.fabric_store_protect_online_sale()')) + 5
      return s.slice(open, s.indexOf('$$;', open))
    }
    const originalA = read(FILES.migrationA)
    let migrationA = mutate(originalA, editsA)
    if (guardBody(migrationA) !== guardBody(originalA)) {
      migrationA = migrationA.replace("'8fd8694fded5ec1daaaf34e5b481fb15'",
        `'${crypto.createHash('md5').update(guardBody(migrationA), 'utf8').digest('hex')}'`)
    }

    // fixtures that exist before the fix, like on live
    const sold = await onlineSale(admin, await makeFabric(admin, 'online', 10))
    await admin.query(`update public.income set alostaz_sync_status = 'review_required', alostaz_sync_error = 'timeout after send'
                       where id = $1`, [sold.incomeId])
    const { rows: [shopRow] } = await admin.query(`insert into public.income (branch, category, amount, payment_method, buyer_phone, buyer_name)
      values ('fabrics', 'fabric_sale', 250, 'cash', '0551234567', 'زبونة المحل') returning id`)
    await admin.query(`insert into public.income (branch, category, amount, payment_method, description)
      values ('tailoring', 'other', 80, 'cash', 'tailoring row'), ('ready_designs', 'other', 60, 'cash', 'ready row')`)
    await admin.query(`insert into public.expenses (branch, type, category, amount, recurrence_type, date)
      values ('fabrics', 'fixed', 'rent', 500, 'monthly', current_date - interval '40 days'),
             ('tailoring', 'other', 'misc', 30, 'one_time', current_date)`)

    // ── before the fix: the live-safe test must FAIL, and anon really is open ───────────────
    {
      const result = await runSqlTest(admin, FILES.testA)
      if (result.startsWith('FAILED') && /anon SELECT on income/.test(result)) ok(`live-safe test fails before the fix: ${result.slice(0, 110)}`)
      else fail(`live-safe test before the fix should fail at the anon check, got: ${result}`)
      const anon = await session('anon')
      check('before the fix, anon reads income', (await attempt(anon, 'select count(*) from public.income')).ok, true)
      await anon.end()
    }

    // ── a garbled migration refuses and leaves the open policies as they were ───────────────
    try {
      await admin.query(garble(migrationA)); fail('garbled fix A migration was APPLIED')
    } catch (error) {
      await admin.query('rollback').catch(() => {})
      const { rows: [left] } = await admin.query(`select
        (select count(*) from pg_policies where tablename in ('income', 'expenses') and policyname like '%\\_policy')::int as old_policies,
        (select count(*) from pg_proc where proname = 'can_access_finance_branch')::int as fn`)
      if (left.old_policies === 8 && left.fn === 0 && /ENCODING/.test(error.message)) ok('garbled fix A migration refused (encoding), nothing changed')
      else fail(`garbled fix A: ${error.message} / ${JSON.stringify(left)}`)
    }

    // ── an unknown policy on income: refuse (drift) ─────────────────────────────────────────
    await admin.query(`create policy someone_elses_policy on public.income for select to authenticated using (false)`)
    try {
      await admin.query(migrationA); fail('fix A applied over an unknown policy')
    } catch (error) {
      await admin.query('rollback').catch(() => {})
      if (/FINANCE_RLS_DRIFT/.test(error.message)) ok('fix A refuses an unknown policy (drift)'); else fail(`drift check: ${error.message}`)
    }
    await admin.query('drop policy someone_elses_policy on public.income')

    // ── a different deployed guard: refuse (fingerprint) ────────────────────────────────────
    await admin.query(`select set_config('finance.guard', pg_get_functiondef('private.fabric_store_protect_online_sale()'::regprocedure), false)`)
    await admin.query(`create or replace function private.fabric_store_protect_online_sale() returns trigger language plpgsql
      security definer set search_path = '' as $$ begin return case when tg_op = 'DELETE' then old else new end; end; $$`)
    try {
      await admin.query(migrationA); fail('fix A replaced a guard it did not read')
    } catch (error) {
      await admin.query('rollback').catch(() => {})
      if (/PROTECT_ONLINE_SALE_DRIFT/.test(error.message)) ok('fix A refuses a guard with another fingerprint'); else fail(`fingerprint check: ${error.message}`)
    }
    await admin.query(`do $$ begin execute current_setting('finance.guard'); end $$`)

    // ── apply (twice: re-applying is safe) ──────────────────────────────────────────────────
    await admin.query(migrationA)
    await admin.query(migrationA)
    ok('fix A applied (and re-applied)')

    {
      const result = await runSqlTest(admin, FILES.testA)
      if (result === 'PASS') ok('live-safe SQL test after the fix: PASS (incl. the online-sale case)'); else fail(`live-safe SQL test: ${result}`)
    }

    // ── the AUD-01 audit steps, as anon: every one refused ──────────────────────────────────
    {
      const anon = await session('anon')
      const steps = [
        ['read income', 'select count(*), count(buyer_phone) from public.income'],
        ['reset the online sale review_required → failed', `update public.income set alostaz_sync_status = 'failed' where id = '${sold.incomeId}'`],
        ['fake an alostaz invoice id', `update public.income set alostaz_invoice_id = 999999 where id = '${sold.incomeId}'`],
        ['insert 50,000 SAR cash', `insert into public.income (branch, category, amount, payment_method) values ('fabrics', 'other', 50000, 'cash')`],
        ['delete a shop sale', `delete from public.income where id = '${shopRow.id}'`],
        ['read expenses', 'select count(*) from public.expenses'],
        ['insert a box expense', `insert into public.expenses (branch, type, category, amount, cash_source) values ('fabrics', 'other', 'x', 9999, 'box')`],
        ['take an invoice number', `select nextval('public.fabrics_invoice_number_seq')`],
        ['run the recurring generator', 'select public.generate_recurring_expenses(null, current_date)'],
      ]
      for (const [label, sql] of steps) check(`anon: ${label}`, (await attempt(anon, sql)).code, '42501')
      await anon.end()
    }

    // ── the role matrix with JWT identities ─────────────────────────────────────────────────
    const counts = async who => {
      const c = await session(who)
      const r = (await c.query(`select string_agg(branch || '=' || n, ',' order by branch) as s from (
        select branch, count(*) n from public.income group by branch) x`)).rows[0].s
      const e = (await c.query(`select string_agg(branch || '=' || n, ',' order by branch) as s from (
        select branch, count(*) n from public.expenses group by branch) x`)).rows[0].s
      await c.end()
      return `income[${r ?? ''}] expenses[${e ?? ''}]`
    }
    const { rows: [all] } = await admin.query(`select
      (select count(*) from public.income where branch = 'fabrics')::int as fab,
      (select count(*) from public.expenses where branch = 'fabrics')::int as fabexp`)
    check('admin sees', await counts(ADMIN), `income[fabrics=${all.fab},ready_designs=1,tailoring=1] expenses[fabrics=${all.fabexp},tailoring=1]`)
    check('fabric manager sees', await counts(FABRICS), `income[fabrics=${all.fab}] expenses[fabrics=${all.fabexp}]`)
    check('accountant sees', await counts(ACCOUNTANT), 'income[ready_designs=1,tailoring=1] expenses[tailoring=1]')
    for (const [label, who] of [['general manager', GM], ['workshop manager', WORKSHOP], ['tailor', TAILOR],
      ['inactive admin', OLD_ADMIN], ['inactive fabric manager', OLD_FABRICS], ['JWT without a user id', 'nosub']]) {
      check(`${label} sees`, await counts(who), 'income[] expenses[]')
    }

    const writeMatrix = [
      // who, branch, expected
      [ADMIN, 'fabrics', 'OK(1)'], [ADMIN, 'tailoring', 'OK(1)'], [ADMIN, 'ready_designs', 'OK(1)'],
      [FABRICS, 'fabrics', 'OK(1)'], [FABRICS, 'tailoring', '42501'], [FABRICS, 'ready_designs', '42501'],
      [ACCOUNTANT, 'tailoring', 'OK(1)'], [ACCOUNTANT, 'ready_designs', 'OK(1)'], [ACCOUNTANT, 'fabrics', '42501'],
      [GM, 'fabrics', '42501'], [GM, 'tailoring', '42501'], [WORKSHOP, 'tailoring', '42501'], [TAILOR, 'tailoring', '42501'],
      [OLD_ADMIN, 'tailoring', '42501'], [OLD_FABRICS, 'fabrics', '42501'], ['nosub', 'fabrics', '42501'],
    ]
    for (const [who, branch, want] of writeMatrix) {
      const c = await session(who)
      // income: a plain non-fabric row (no stock), then expenses
      const inc = await attempt(c, `insert into public.income (branch, category, amount, payment_method, description)
        values ($1, 'other', 1, 'network', 'matrix') returning id`, [branch])
      const exp = await attempt(c, `insert into public.expenses (branch, type, category, amount) values ($1, 'other', 'matrix', 1) returning id`, [branch])
      await c.end()
      const got = r => (r.ok ? r.label : r.code)
      check(`${who.slice(-2)} inserts ${branch} income`, got(inc), want)
      check(`${who.slice(-2)} inserts ${branch} expense`, got(exp), want)
    }

    // update / delete limits
    {
      const fab = await session(FABRICS)
      check('fabric manager moves a fabrics expense to tailoring',
        (await attempt(fab, `update public.expenses set branch = 'tailoring' where branch = 'fabrics' and category = 'rent'`)).code, '42501')
      check('fabric manager updates a tailoring row (invisible)',
        (await attempt(fab, `update public.income set notes = 'x' where branch = 'tailoring'`)).label, 'OK(0)')
      check('fabric manager deletes a tailoring row (invisible)',
        (await attempt(fab, `delete from public.income where branch = 'tailoring'`)).label, 'OK(0)')
      await fab.end()
      const acc = await session(ACCOUNTANT)
      check('accountant deletes fabrics sales (invisible)', (await attempt(acc, `delete from public.income where branch = 'fabrics'`)).label, 'OK(0)')
      check('accountant runs the recurring generator', (await attempt(acc, 'select public.generate_recurring_expenses(null, current_date)')).ok, true)
      await acc.end()
    }

    // ── the shop sale itself (fabric manager), through the stock guard ──────────────────────
    {
      const fabric = await makeFabric(admin, 'shop', 6)
      const fab = await session(FABRICS)
      const sale = await attempt(fab, SHOP_SALE, [saleLines(fabric, 2)])
      check('fabric manager records a shop sale (stock deducted)', `${sale.label} stock=${await stockOf(admin, fabric.color)}`, 'OK(1) stock=4')
      check('fabric manager edits the sale notes', (await attempt(fab, `update public.income set notes = 'ok' where id = $1`, [sale.rows[0].id])).label, 'OK(1)')
      check('fabric manager deletes the sale (stock back)',
        `${(await attempt(fab, 'delete from public.income where id = $1', [sale.rows[0].id])).label} stock=${await stockOf(admin, fabric.color)}`, 'OK(1) stock=6')
      await hold(fabric, 500) // an unpaid online order holds 5 m of the 6
      const refused = await attempt(fab, SHOP_SALE, [saleLines(fabric, 2)])
      check('the held part is refused to the shop', /FABRIC_STOCK_RESERVED/.test(refused.label), true)
      check('the free metre still sells', (await attempt(fab, SHOP_SALE, [saleLines(fabric, 1)])).label, 'OK(1)')
      await fab.end()
    }

    // ── the online sale: alostaz state is server-only, notes stay for staff ─────────────────
    {
      for (const [label, who] of [['admin', ADMIN], ['fabric manager', FABRICS]]) {
        const c = await session(who)
        // each alostaz column on its own (a combined update would hide a column left editable)
        for (const [column, value] of [['alostaz_sync_status', "'failed'"], ['alostaz_sync_error', "'x'"],
          ['alostaz_sync_token', 'gen_random_uuid()'], ['alostaz_synced_at', 'now()'], ['alostaz_invoice_code', "'X-1'"],
          ['alostaz_customer_id', '42']]) {
          check(`${label} (browser) changes only ${column} of the online sale`,
            (await attempt(c, `update public.income set ${column} = ${value} where id = $1`, [sold.incomeId])).label,
            'P0001:FABRIC_STORE_ONLINE_SALE_LOCKED')
        }
        check(`${label} (browser) resets the alostaz state of the online sale`,
          (await attempt(c, `update public.income set alostaz_sync_status = 'failed', alostaz_sync_error = null where id = $1`, [sold.incomeId])).label,
          'P0001:FABRIC_STORE_ONLINE_SALE_LOCKED')
        check(`${label} (browser) fakes an alostaz invoice id`,
          (await attempt(c, 'update public.income set alostaz_invoice_id = 999999 where id = $1', [sold.incomeId])).label,
          'P0001:FABRIC_STORE_ONLINE_SALE_LOCKED')
        check(`${label} (browser) edits the online sale notes`,
          (await attempt(c, `update public.income set notes = 'ملاحظة' where id = $1`, [sold.incomeId])).label, 'OK(1)')
        check(`${label} (browser) still cannot change the amount`,
          (await attempt(c, 'update public.income set amount = 1 where id = $1', [sold.incomeId])).label, 'P0001:FABRIC_STORE_ONLINE_SALE_LOCKED')
        await c.end()
      }
      // a shop sale is not an online sale: staff keep writing its alostaz columns as today
      const fab = await session(FABRICS)
      check('fabric manager writes alostaz columns of a shop sale',
        (await attempt(fab, `update public.income set alostaz_sync_status = 'failed' where id = $1`, [shopRow.id])).label, 'OK(1)')
      await fab.end()
      // the server: the claim the send path makes (null/failed → sending), then the outcome
      const svc = await session('service')
      await admin.query(`update public.income set alostaz_sync_status = 'failed' where id = $1`, [sold.incomeId])
      const claim = await attempt(svc, `update public.income set alostaz_sync_status = 'sending', alostaz_sync_token = gen_random_uuid(),
        alostaz_synced_at = now() where id = $1 and (alostaz_sync_status is null or alostaz_sync_status = 'failed')`, [sold.incomeId])
      const sent = await attempt(svc, `update public.income set alostaz_sync_status = 'sent', alostaz_invoice_id = 77,
        alostaz_invoice_code = 'INV-77', alostaz_sync_token = null where id = $1`, [sold.incomeId])
      await svc.end()
      check('the server claims and finishes the alostaz send', `${claim.label} ${sent.label}`, 'OK(1) OK(1)')
    }

    // ── rollback: staff-only fallback, anon still out; then re-apply ────────────────────────
    {
      await admin.query(read(FILES.rollbackA))
      const anon = await session('anon')
      check('after rollback, anon reads income', (await attempt(anon, 'select 1 from public.income limit 1')).code, '42501')
      await anon.end()
      check('after rollback, the tailor sees', await counts(TAILOR), 'income[] expenses[]')
      const fabric = await makeFabric(admin, 'rollback', 3)
      const fab = await session(FABRICS)
      check('after rollback, the fabric manager records a shop sale', (await attempt(fab, SHOP_SALE, [saleLines(fabric, 1)])).label, 'OK(1)')
      await fab.end()
      // the admin (the fabric manager would meet the older "sent network sale" trigger first)
      const adm = await session(ADMIN)
      check('after rollback, the online sale alostaz state stays server-only',
        (await attempt(adm, `update public.income set alostaz_sync_status = 'failed' where id = $1`, [sold.incomeId])).label,
        'P0001:FABRIC_STORE_ONLINE_SALE_LOCKED')
      await adm.end()
      const { rows: [p] } = await admin.query(`select count(*) filter (where policyname like '%fallback%')::int as fb,
        count(*)::int as n from pg_policies where tablename in ('income', 'expenses')`)
      check('after rollback, policies', `${p.fb}/${p.n}`, '8/8')
      try {
        await admin.query(read(FILES.rollbackA)); fail('rollback ran twice')
      } catch (error) {
        await admin.query('rollback').catch(() => {})
        check('rollback refuses when the fix is not applied', /FIX_A_ROLLBACK_NOT_NEEDED/.test(error.message), true)
      }
      await admin.query(migrationA)
      const result = await runSqlTest(admin, FILES.testA)
      if (result === 'PASS') ok('re-applied after rollback: live-safe SQL test PASS'); else fail(`after re-apply: ${result}`)
    }

    await admin.end()
  } catch (error) {
    fail(error.patternMissing ? error.message : `run aborted: ${error.stack || error.message}`)
    if (error.patternMissing) return finish(server, 3)
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall finance RLS checks passed')
  return finish(server, failures ? 1 : 0)
}

main()
