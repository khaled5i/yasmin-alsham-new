// Fix batch A / payroll RPCs on a real local Postgres 17 (see README.md).
// The replica has no payroll tables, so replica-payroll.sql provides stand-ins with the live
// names, argument names, types, defaults and return types whose bodies only log the caller and
// the arguments. The migration's fingerprint list is pointed at the stand-ins for this run (the
// repo file is not touched; the real bodies are fingerprint-checked on live). Checks: the hole
// before the fix, the live-safe SQL test before (must fail) and after (must pass), every wrapper
// passing its arguments and defaults through, the role matrix with JWT identities, the nested
// call (debt payment → operation), drift and encoding refusals, re-applying, the rollback.
//   node scripts/db-local/verify-payroll-rpc.cjs [--mutateP "<find>" "<replace>"]...
// Exit code 0 only if every check passes; 3 when a mutation pattern is missing.
const path = require('node:path')
const { connect, startServer, buildReplica, garble, mutate, runSqlTest, finish, read, repoPath } = require('./lib.cjs')

const MIGRATION = repoPath('supabase/migrations/20261001120100_payroll_rpc_role_checks.sql')
const TEST = repoPath('supabase/tests/payroll_rpc_access.sql')
const ROLLBACK = repoPath('docs/store-launch-plans/implementation/payments/fixes/FIX-A-payroll-rollback.sql')

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001'
const FABRICS = 'aaaaaaaa-0000-4000-8000-000000000002'
const TAILOR = 'aaaaaaaa-0000-4000-8000-000000000003'
const ACCOUNTANT = 'aaaaaaaa-0000-4000-8000-000000000004'
const GM = 'aaaaaaaa-0000-4000-8000-000000000005'
const WORKSHOP = 'aaaaaaaa-0000-4000-8000-000000000006'
const OLD_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000007'

const args = process.argv.slice(2)
const editsP = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mutateP') { editsP.push([args[i + 1], args[i + 2]]); i += 2 }
}

// one call per wrapper with every argument given (named, like PostgREST) — and the defaults case
const CALLS = {
  create_worker_payroll_adjustment_request: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_year: 2026, p_month: 9, p_reason: 'r', p_request_note: 'n' },
  delete_worker_deduction_payment: { p_payment_id: 'PAYMENT' },
  delete_worker_payroll_operation: { p_operation_id: 'OPERATION' },
  lock_worker_payroll_period: { p_branch: 'B', p_year: 2026, p_month: 9, p_reason: 'r' },
  pay_worker_deduction_debt: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_amount: 10.5, p_payment_date: '2026-09-15', p_note: 'n' },
  propagate_worker_salary_to_future_months: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_from_year: 2026, p_from_month: 9, p_salary_type: 'fixed', p_fixed_salary_value: 3000, p_piece_rate: 0 },
  register_worker_payroll_adjustment: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_year: 2026, p_month: 9, p_operation_type: 'advance', p_operation_date: '2026-09-15', p_amount: 100, p_reference: 'ref', p_note: 'n', p_payment_account: 'bank' },
  register_worker_payroll_big_debt_payment: { p_branch: 'B', p_worker_id: 'w1', p_amount: 5 },
  register_worker_payroll_payment: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_year: 2026, p_month: 9, p_operation_date: '2026-09-15', p_amount: 100, p_reference: 'ref', p_note: 'n', p_payment_account: 'bank' },
  settle_worker_debt_from_salary: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_year: 2026, p_month: 9, p_amount: 50, p_payment_date: '2026-09-15', p_note: 'n' },
  unlock_worker_payroll_period: { p_branch: 'B', p_year: 2026, p_month: 9 },
  upsert_worker_payroll_big_debt: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_amount: 700 },
  upsert_worker_payroll_month_snapshot: { p_branch: 'B', p_worker_id: 'w1', p_worker_name: 'عامل', p_year: 2026, p_month: 9, p_basic_salary: 3000, p_works_total: 1, p_allowances_total: 2, p_deductions_total: 3, p_advances_total: 4, p_operation_date: '2026-09-15', p_reference: 'ref', p_note: 'n', p_salary_type: 'piecework', p_fixed_salary_value: 3100, p_piece_count: 5, p_piece_rate: 6, p_overtime_hours: 7, p_overtime_rate: 8 },
}
const FUNCTIONS = Object.keys(CALLS)

/** The stand-in's `create or replace function …` statement from replica-payroll.sql. */
function stubDefinition(name) {
  const sql = read(path.join(__dirname, 'replica-payroll.sql'))
  const start = sql.indexOf(`create or replace function public.${name}(`)
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start) + 5) + 3)
}

async function session(sub) {
  const c = await connect()
  if (sub === 'anon') {
    await c.query('set role anon')
  } else {
    const claims = sub === 'nosub' ? { role: 'authenticated' } : { sub, role: 'authenticated' }
    await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)])
    await c.query('set role authenticated')
  }
  return c
}

async function call(c, fn, named) {
  const names = Object.keys(named)
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})::text as r`
  try {
    const { rows } = await c.query(sql, names.map(n => named[n]))
    return { ok: true, label: 'OK', value: rows[0].r }
  } catch (error) {
    return { ok: false, label: `${error.code}:${String(error.message).split('|')[0]}` }
  }
}

async function main() {
  const server = await startServer('payroll')
  let failures = 0
  const fail = message => { failures += 1; console.log(`✘ ${message}`) }
  const ok = message => console.log(`✔ ${message}`)
  const check = (label, got, want) => {
    const g = typeof got === 'string' ? got : JSON.stringify(got)
    const w = typeof want === 'string' ? want : JSON.stringify(want)
    if (g === w) ok(`${label}: ${g.slice(0, 120)}`); else fail(`${label}: expected ${w}, got ${g}`)
  }
  try {
    const admin = await connect()
    await buildReplica(admin)
    await admin.query(read(path.join(__dirname, 'replica-payroll.sql')))

    // point the migration's fingerprints at the local stand-ins (same name order)
    const { rows: fps } = await admin.query(`select p.proname, md5(replace(p.prosrc, E'\\r\\n', E'\\n')) fp
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [FUNCTIONS])
    let migration = read(MIGRATION)
    for (const { proname, fp } of fps) {
      const live = new RegExp(`\\('${proname}', '([^']*)', '([0-9a-f]{32})'\\)`, 'g')
      if (!live.test(migration)) throw Object.assign(new Error(`no fingerprint row for ${proname}`), { patternMissing: true })
      migration = migration.replace(live, (_, ident) => `('${proname}', '${ident}', '${fp}')`)
    }
    migration = mutate(migration, editsP)

    // fixtures: one operation and one debt payment per branch, and a payment linked to an operation
    const { rows: [opT] } = await admin.query(`insert into public.worker_payroll_operations (branch) values ('tailoring') returning id`)
    const { rows: [opF] } = await admin.query(`insert into public.worker_payroll_operations (branch) values ('fabrics') returning id`)
    const { rows: [payT] } = await admin.query(`insert into public.worker_payroll_deduction_payments (branch) values ('tailoring') returning id`)
    const { rows: [payF] } = await admin.query(`insert into public.worker_payroll_deduction_payments (branch) values ('fabrics') returning id`)
    await admin.query(`insert into public.worker_payroll_operations (branch, metadata) values ('fabrics', $1)`, [JSON.stringify({ debt_payment_id: payF.id })])
    const fill = (named, branch) => Object.fromEntries(Object.entries(named).map(([k, v]) =>
      [k, v === 'B' ? branch : v === 'PAYMENT' ? (branch === 'fabrics' ? payF.id : payT.id) : v === 'OPERATION' ? (branch === 'fabrics' ? opF.id : opT.id) : v]))

    // ── before the fix: the hole, and the live-safe test fails ──────────────────────────────
    {
      const anon = await session('anon')
      check('before the fix, a visitor unlocks a tailoring month', (await call(anon, 'unlock_worker_payroll_period', fill(CALLS.unlock_worker_payroll_period, 'tailoring'))).label, 'OK')
      await anon.end()
      const result = await runSqlTest(admin, TEST)
      if (result.startsWith('FAILED') && /anon EXECUTE/.test(result)) ok(`live-safe test fails before the fix: ${result.slice(0, 110)}`)
      else fail(`live-safe test before the fix should fail at the anon check, got: ${result}`)
    }

    // ── refusals that must leave everything as it was ───────────────────────────────────────
    const state = async () => (await admin.query(`select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE'), ',' order by p.proname) s
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like any (array['%payroll%', '%deduction%', '%worker_debt%', '%worker_salary%'])`)).rows[0].s
    const before = await state()
    try {
      await admin.query(garble(migration)); fail('garbled payroll migration was APPLIED')
    } catch (error) {
      await admin.query('rollback').catch(() => {})
      check('garbled payroll migration refused (encoding), nothing changed', `${/PAYROLL_ENCODING/.test(error.message)} ${(await state()) === before}`, 'true true')
    }
    await admin.query(`create or replace function public.lock_worker_payroll_period(p_branch character varying, p_year integer, p_month integer, p_reason text default null::text)
      returns jsonb language sql security definer set search_path = public as $$ select '{"changed":"by someone"}'::jsonb $$`)
    try {
      await admin.query(migration); fail('payroll migration replaced a function it did not read')
    } catch (error) {
      await admin.query('rollback').catch(() => {})
      const renamed = (await admin.query(`select count(*)::int n from pg_proc where proname like '%\\_unchecked' escape '\\'`)).rows[0].n
      check('a function with another body is refused (drift), nothing renamed', `${/PAYROLL_FUNCTION_DRIFT: lock_worker_payroll_period/.test(error.message)} ${renamed}`, 'true 0')
    }
    await admin.query(stubDefinition('lock_worker_payroll_period')) // put the stand-in back

    // ── apply (twice) ───────────────────────────────────────────────────────────────────────
    await admin.query(migration)
    await admin.query(migration)
    ok('payroll migration applied (and re-applied)')
    {
      const result = await runSqlTest(admin, TEST)
      if (result === 'PASS') ok('live-safe SQL test after the fix: PASS'); else fail(`live-safe SQL test: ${result}`)
    }

    // ── every wrapper passes every argument through, as the caller ──────────────────────────
    {
      const c = await session(ADMIN)
      for (const fn of FUNCTIONS) {
        await admin.query('truncate public.replica_payroll_calls')
        const named = fill(CALLS[fn], 'tailoring')
        const r = await call(c, fn, named)
        const { rows } = await admin.query('select fn, actor, args from public.replica_payroll_calls order by n')
        const first = rows[0] || {}
        const sent = JSON.parse(JSON.stringify(named))
        const got = first.args ? Object.fromEntries(Object.keys(sent).map(k => [k, first.args[k]])) : null
        const same = got && Object.keys(sent).every(k => String(got[k]) === String(sent[k]))
        check(`admin → ${fn}: result, original called once as the admin, all arguments through`,
          `${r.label} ${rows.filter(x => x.fn === fn).length} ${first.actor === ADMIN} ${same}`, 'OK 1 true true')
      }
      // defaults: leave out every optional argument
      await admin.query('truncate public.replica_payroll_calls')
      await call(c, 'register_worker_payroll_payment', { p_branch: 'tailoring', p_worker_id: 'w1', p_worker_name: 'x', p_year: 2026, p_month: 9, p_operation_date: '2026-09-15', p_amount: 1 })
      await call(c, 'upsert_worker_payroll_month_snapshot', { p_branch: 'tailoring', p_worker_id: 'w1', p_worker_name: 'x', p_year: 2026, p_month: 9,
        p_basic_salary: 1, p_works_total: 0, p_allowances_total: 0, p_deductions_total: 0, p_advances_total: 0 })
      const { rows: d } = await admin.query('select args from public.replica_payroll_calls order by n')
      check('defaults reach the original (payment account, salary type, rates)',
        [d[0].args.p_payment_account, d[0].args.p_reference, d[1].args.p_salary_type, d[1].args.p_piece_count, d[1].args.p_overtime_rate, d[1].args.p_operation_date],
        ['cash', null, 'fixed', 0, 12.5, null])
      await c.end()
    }

    // ── the role matrix ─────────────────────────────────────────────────────────────────────
    const matrix = [
      ['admin', ADMIN, { tailoring: 'OK', fabrics: 'OK', ready_designs: 'OK' }],
      ['fabric manager', FABRICS, { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: 'OK', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
      ['accountant', ACCOUNTANT, { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: '42501:PAYROLL_FORBIDDEN', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
      ['general manager', GM, { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: '42501:PAYROLL_FORBIDDEN', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
      ['workshop manager', WORKSHOP, { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: '42501:PAYROLL_FORBIDDEN', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
      ['tailor', TAILOR, { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: '42501:PAYROLL_FORBIDDEN', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
      ['inactive admin', OLD_ADMIN, { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: '42501:PAYROLL_FORBIDDEN', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
      ['JWT without a user id', 'nosub', { tailoring: '42501:PAYROLL_FORBIDDEN', fabrics: '42501:PAYROLL_FORBIDDEN', ready_designs: '42501:PAYROLL_FORBIDDEN' }],
    ]
    for (const [label, who, want] of matrix) {
      const c = await session(who)
      for (const fn of FUNCTIONS) {
        const results = {}
        for (const branch of ['tailoring', 'fabrics', 'ready_designs']) {
          // the id-based two only know tailoring and fabrics rows
          if (branch === 'ready_designs' && !('p_branch' in CALLS[fn])) continue
          results[branch] = (await call(c, fn, fill(CALLS[fn], branch))).label
        }
        const expected = Object.fromEntries(Object.keys(results).map(b => [b, want[b]]))
        check(`${label} → ${fn}`, results, expected)
      }
      await c.end()
    }
    {
      const anon = await session('anon')
      const refused = []
      for (const fn of FUNCTIONS) refused.push((await call(anon, fn, fill(CALLS[fn], 'tailoring'))).label.split(':')[0])
      for (const helper of [`create_worker_payroll_journal_entry(gen_random_uuid(), 'payment', 1, current_date, 2026, 9, 'x', 'cash')`,
                            `ensure_worker_payroll_month('tailoring', 'w1', 'x', 2026, 9)`]) {
        try { await anon.query(`select public.${helper}`); refused.push('OK') } catch (e) { refused.push(e.code) }
      }
      for (const fn of FUNCTIONS) {
        try { await anon.query(`select public.${fn}_unchecked(${Object.keys(CALLS[fn]).map(() => 'null').join(', ')})`); refused.push('OK') } catch (e) { refused.push(e.code) }
      }
      await anon.end()
      check('a visitor: 13 wrappers, 2 helpers, 13 originals', [...new Set(refused)], ['42501'])
      const tailor = await session(TAILOR)
      const direct = []
      for (const fn of FUNCTIONS) {
        try { await tailor.query(`select public.${fn}_unchecked(${Object.keys(CALLS[fn]).map(() => 'null').join(', ')})`); direct.push('OK') } catch (e) { direct.push(e.code) }
      }
      await tailor.end()
      check('a signed-in tailor calls an original directly', [...new Set(direct)], ['42501'])
    }

    // ── the nested call: a debt payment linked to an operation is deleted through the wrapper ──
    {
      await admin.query('truncate public.replica_payroll_calls')
      const fab = await session(FABRICS)
      const r = await call(fab, 'delete_worker_deduction_payment', { p_payment_id: payF.id })
      await fab.end()
      const { rows } = await admin.query('select fn, actor from public.replica_payroll_calls order by n')
      check('fabric manager deletes a fabrics debt payment: both originals run as the manager',
        `${r.label} ${rows.map(x => `${x.fn}@${x.actor === FABRICS}`).join(',')}`,
        'OK delete_worker_deduction_payment@true,delete_worker_payroll_operation@true')
    }

    // ── rollback: originals back under their names, the visitor still out ──────────────────
    {
      await admin.query(read(ROLLBACK))
      const { rows: [r] } = await admin.query(`select
        (select count(*) from pg_proc where proname like '%\\_unchecked' escape '\\')::int as unchecked,
        (select count(*) from pg_proc where proname = 'assert_payroll_branch_access')::int as gate,
        (select count(*) from pg_proc p where p.proname = any($1) and p.prosrc like '%replica_payroll_calls%')::int as originals`, [FUNCTIONS])
      check('rollback: no _unchecked, no gate, the 13 originals under their names', `${r.unchecked} ${r.gate} ${r.originals}`, '0 0 13')
      const anon = await session('anon')
      check('after rollback, a visitor unlocks a month', (await call(anon, 'unlock_worker_payroll_period', fill(CALLS.unlock_worker_payroll_period, 'tailoring'))).label.split(':')[0], '42501')
      await anon.end()
      const tailor = await session(TAILOR)
      check('after rollback, a signed-in tailor can call (the documented minimum state)',
        (await call(tailor, 'unlock_worker_payroll_period', fill(CALLS.unlock_worker_payroll_period, 'tailoring'))).label, 'OK')
      await tailor.end()
      try {
        await admin.query(read(ROLLBACK)); fail('payroll rollback ran twice')
      } catch (error) {
        await admin.query('rollback').catch(() => {})
        check('rollback refuses when the fix is not applied', /PAYROLL_ROLLBACK_NOT_NEEDED/.test(error.message), true)
      }
      await admin.query(migration)
      const result = await runSqlTest(admin, TEST)
      if (result === 'PASS') ok('re-applied after rollback: live-safe SQL test PASS'); else fail(`after re-apply: ${result}`)
    }

    await admin.end()
  } catch (error) {
    fail(error.patternMissing ? error.message : `run aborted: ${error.stack || error.message}`)
    if (error.patternMissing) return finish(server, 3)
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall payroll RPC checks passed')
  return finish(server, failures ? 1 : 0)
}

main()
